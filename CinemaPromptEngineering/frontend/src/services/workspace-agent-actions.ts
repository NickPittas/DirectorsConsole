import type { ApplicationCommand, ApplicationResult } from '../storyboard/actions/application-actions';
import {
  dispatchPromptEngineerAgentAction,
  type PromptEngineerAgentRequest,
} from './agent-prompt-engineer-actions';
import {
  dispatchGalleryAgentAction,
  type GalleryAgentRequest,
} from '../gallery/services/agent-gallery-actions';
import { inspectAgentMedia } from './agent-media-inspection';
import { trackApplicationCommand } from './application-command-control';
import { api } from '../api/client';
import { transferActiveConsoleGrant } from './agent-conversations';
import type {
  WorkspaceActionResult,
  WorkspaceCommand,
  WorkspaceCommandMessage,
  WorkspaceConsoleAdapter,
  WorkspaceConsoleContext,
} from './workspace-agent-contracts';

interface Registration {
  generation: object;
  adapter: WorkspaceConsoleAdapter;
}

let currentRegistration: Registration | null = null;
let pendingProjectSave: { registration: Registration; commandId: string } | null = null;

export function registerWorkspaceConsoleAdapter(adapter: WorkspaceConsoleAdapter): () => void {
  const registration = { generation: {}, adapter };
  currentRegistration = registration;
  return () => {
    if (currentRegistration?.generation === registration.generation) currentRegistration = null;
  };
}

function errorResult(
  command: WorkspaceCommand,
  code: string,
  message: string,
  consoleBindingId?: string,
): WorkspaceActionResult {
  return {
    ok: false,
    commandId: command.commandId,
    action: command.action,
    error: { code, message, retryable: false },
    ...(command.expectedConsoleBindingId !== undefined
      ? { consoleBindingId: command.expectedConsoleBindingId }
      : consoleBindingId !== undefined ? { consoleBindingId } : {}),
  };
}

function cancelled(command: WorkspaceCommand): WorkspaceActionResult {
  return errorResult(command, 'action_cancelled', 'This action is no longer active.');
}

function isCurrent(control: { signal: AbortSignal; isCurrent: () => boolean }): boolean {
  if (control.signal.aborted) return false;
  try {
    return control.isCurrent();
  } catch {
    return false;
  }
}

function readContext(registration: Registration): WorkspaceConsoleContext | null {
  if (currentRegistration !== registration || currentRegistration.generation !== registration.generation) return null;
  try {
    const context = registration.adapter.getContext();
    return context ? { ...context } : null;
  } catch {
    return null;
  }
}

function sameScope(registration: Registration, captured: WorkspaceConsoleContext): boolean {
  const context = readContext(registration);
  return context?.bindingId === captured.bindingId && context.projectIdentity === captured.projectIdentity;
}

function validResult(result: unknown, command: WorkspaceCommand): result is ApplicationResult {
  return !!result && typeof result === 'object'
    && (result as ApplicationResult).commandId === command.commandId
    && (result as ApplicationResult).action === command.action
    && typeof (result as ApplicationResult).ok === 'boolean';
}

function isMutating(command: WorkspaceCommand): boolean {
  return command.action === 'save_project' || command.action === 'new_project' || command.action === 'open_project'
    || command.action === 'add_panels'
    || command.action === 'remove_panels'
    || command.action === 'show_panel_controls'
    || command.action === 'select_backends'
    || command.action === 'prepare_workflow_proposal'
    || command.action === 'prepare_workflow_revision'
    || command.action === 'save_and_attach_workflow'
    || command.action === 'bind_media'
    || command.action === 'set_panel_parameters'
    || command.action === 'enhance_generation_prompt'
    || command.action === 'start_generation'
    || command.action === 'cancel_run';
}

async function independentSnapshots(): Promise<{ promptEngineer: unknown; gallery: unknown }> {
  const [promptEngineer, gallery] = await Promise.allSettled([
    dispatchPromptEngineerAgentAction({ operation: 'snapshot' }),
    dispatchGalleryAgentAction({ operation: 'snapshot' }),
  ]);
  return {
    promptEngineer: promptEngineer.status === 'fulfilled' ? promptEngineer.value : { status: 'unavailable' },
    gallery: gallery.status === 'fulfilled' ? gallery.value : { status: 'unavailable' },
  };
}

async function unavailableSnapshot(
  command: WorkspaceCommand,
  reason: string,
  consoleBindingId?: string,
): Promise<WorkspaceActionResult> {
  return {
    ok: true,
    commandId: command.commandId,
    action: command.action,
    ...(consoleBindingId !== undefined ? { consoleBindingId } : {}),
    data: {
      status: 'partial',
      consoleAvailable: false,
      consoleUnavailableReason: reason,
      ...(await independentSnapshots()),
    },
  };
}

async function dispatchIndependent(command: WorkspaceCommand, control: { signal: AbortSignal; isCurrent: () => boolean }): Promise<WorkspaceActionResult> {
  try {
    let data: unknown;
    switch (command.action) {
      case 'prompt_engineer_action':
        data = await dispatchPromptEngineerAgentAction(command.input as PromptEngineerAgentRequest, () => isCurrent(control));
        break;
      case 'gallery_action':
        data = await dispatchGalleryAgentAction(command.input as GalleryAgentRequest, () => isCurrent(control), control.signal);
        break;
      case 'inspect_media':
        data = await inspectAgentMedia(command.input.assetId, AbortSignal.any([
          control.signal,
          AbortSignal.timeout(25_000),
        ]));
        break;
      case 'get_prompt_guidance':
        data = command.input.targetModel === undefined
          ? { catalogOnly: true, ...await api.getPromptEnhancementSkills() }
          : await api.getModelPromptGuidance({ ...command.input, targetModel: command.input.targetModel });
        break;
      default:
        return errorResult(command, 'invalid_action', 'This action is not available here.');
    }
    return { ok: true, commandId: command.commandId, action: command.action, data };
  } catch (error) {
    if (control.signal.aborted) return cancelled(command);
    if (error instanceof Error && error.name === 'TimeoutError') {
      return errorResult(command, 'action_timeout', command.action === 'get_prompt_guidance'
        ? 'Local model prompt guidance is unavailable.'
        : 'Media inspection timed out.');
    }
    const message = command.action === 'prompt_engineer_action'
      ? 'Prompt Engineer could not complete this action.'
      : command.action === 'gallery_action'
        ? 'Gallery could not complete this action.'
        : command.action === 'get_prompt_guidance'
          ? 'Local model prompt guidance is unavailable.'
          : 'Media inspection could not be completed.';
    return errorResult(command, 'action_failed', message);
  }
}

async function dispatchConsole(
  command: WorkspaceCommand,
  registration: Registration | null,
  control: { signal: AbortSignal; isCurrent: () => boolean; workspaceTurn?: { scopeKey: string; turnId: string } },
): Promise<WorkspaceActionResult> {
  if (!registration) {
    return command.action === 'get_application_snapshot'
      ? unavailableSnapshot(command, 'Console is not available.')
      : errorResult(command, 'console_unavailable', 'Console is not available.');
  }

  const captured = readContext(registration);
  if (!captured) {
    return command.action === 'get_application_snapshot'
      ? unavailableSnapshot(command, 'Console is not available.')
      : errorResult(command, 'console_unavailable', 'Console is not available.');
  }
  if (command.action !== 'get_application_snapshot' && command.expectedConsoleBindingId !== captured.bindingId) {
    return errorResult(command, 'stale_console_binding', 'This action targets a different Console project.', captured.bindingId);
  }
  if (!sameScope(registration, captured)) {
    return command.action === 'get_application_snapshot'
      ? unavailableSnapshot(command, 'Console changed before the snapshot was read.', captured.bindingId)
      : errorResult(command, 'stale_console_binding', 'Console changed before this action could start.', captured.bindingId);
  }

  const legacyCommand = {
    ...command,
    projectIdentity: captured.projectIdentity,
    expectedConsoleBindingId: captured.bindingId,
  } as ApplicationCommand;

  if (pendingProjectSave?.registration === registration && isMutating(command)) {
    return errorResult(command, 'project_operation_pending', 'Wait for the current project operation before changing Console state.', captured.bindingId);
  }
  if (command.action === 'save_project' || command.action === 'new_project' || command.action === 'open_project') pendingProjectSave = { registration, commandId: command.commandId };

  let result: unknown;
  const release = trackApplicationCommand(legacyCommand, () => isCurrent(control) && sameScope(registration, captured)
    && (!isMutating(command) || pendingProjectSave?.registration !== registration || pendingProjectSave.commandId === command.commandId));
  try {
    result = await registration.adapter.dispatch(legacyCommand);
  } catch {
    return command.action === 'get_application_snapshot'
      ? unavailableSnapshot(command, 'Console snapshot could not be read.', captured.bindingId)
      : errorResult(command, 'action_failed', 'Console could not complete this action.', captured.bindingId);
  } finally {
    release();
    if (pendingProjectSave?.registration === registration && pendingProjectSave.commandId === command.commandId) pendingProjectSave = null;
  }

  if (!validResult(result, command)) {
    return errorResult(
      command,
      'invalid_adapter_result',
      'Console returned an invalid response; the action outcome is unknown.',
      captured.bindingId,
    );
  }
  if (!result.ok) return { ...result, consoleBindingId: captured.bindingId };

  if ((command.action === 'save_project' || command.action === 'new_project' || command.action === 'open_project') && result.data && typeof result.data === 'object') {
    const data = result.data as Record<string, unknown>;
    if (data.transition !== undefined) {
      const transition = data.transition as { fromBindingId?: unknown; toBindingId?: unknown; projectRevision?: unknown } | null;
      const current = readContext(registration);
      if (data.status !== 'completed' || !transition || !isCurrent(control) || !control.workspaceTurn
        || transition.fromBindingId !== captured.bindingId
        || typeof transition.toBindingId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(transition.toBindingId)
        || transition.toBindingId === captured.bindingId || current?.bindingId !== transition.toBindingId
        || !Number.isSafeInteger(transition.projectRevision) || current.projectRevision !== transition.projectRevision
        || !transferActiveConsoleGrant(control.workspaceTurn.scopeKey, control.workspaceTurn.turnId, captured.bindingId, transition.toBindingId)) {
        return errorResult(command, 'project_transition_outcome_unknown', 'The project operation may have completed, but its activation could not be confirmed. Inspect the application before continuing.', captured.bindingId);
      }
      return { ...result, consoleBindingId: captured.bindingId };
    }
  }

  if (!sameScope(registration, captured)) {
    if (command.action === 'get_application_snapshot') {
      return unavailableSnapshot(command, 'Console changed while the snapshot was read.', captured.bindingId);
    }
    if (isMutating(command)) {
      return {
        ok: true,
        commandId: command.commandId,
        action: command.action,
        consoleBindingId: captured.bindingId,
        data: {
          status: 'outcome_unknown_after_scope_change',
          consoleBindingId: captured.bindingId,
          operationResult: result,
        },
      };
    }
    return errorResult(command, 'stale_console_binding', 'Console changed while this action was running.', captured.bindingId);
  }

  if (command.action === 'get_application_snapshot') {
    const independent = await independentSnapshots();
    if (!isCurrent(control)) return cancelled(command);
    if (!sameScope(registration, captured)) {
      return {
        ok: true,
        commandId: command.commandId,
        action: command.action,
        consoleBindingId: captured.bindingId,
        data: { ...independent, status: 'partial', consoleAvailable: false, consoleUnavailableReason: 'Console changed while the snapshot was read.' },
      };
    }
    const data = result.data && typeof result.data === 'object' && !Array.isArray(result.data)
      ? result.data as Record<string, unknown>
      : {};
    return {
      ...result,
      consoleBindingId: captured.bindingId,
      data: { ...data, ...independent, consoleBindingId: captured.bindingId, consoleAvailable: true },
    };
  }
  return { ...result, consoleBindingId: captured.bindingId };
}

export async function dispatchWorkspaceApplicationAction(
  message: WorkspaceCommandMessage,
  control: { signal: AbortSignal; isCurrent: () => boolean; consoleBindingId?: string | null; workspaceTurn?: { scopeKey: string; turnId: string } },
): Promise<WorkspaceActionResult> {
  const command = message.command;
  if (!isCurrent(control)) return cancelled(command);

  switch (command.action) {
    case 'prompt_engineer_action':
    case 'gallery_action':
    case 'inspect_media':
    case 'get_prompt_guidance':
      return dispatchIndependent(command, control);
    default:
      if (command.action !== 'get_application_snapshot'
        && command.expectedConsoleBindingId !== control.consoleBindingId) {
        const context = currentRegistration ? readContext(currentRegistration) : null;
        if (context?.bindingId === control.consoleBindingId) {
          return errorResult(command, 'console_binding_argument_mismatch', 'The tool argument does not match the original Console activation, which was still current at rejection. Read a fresh application snapshot, copy consoleBindingId exactly and continue the same objective. No action was dispatched.');
        }
        return errorResult(command, 'console_target_not_authorized', 'This turn does not target that Console activation.');
      }
      return dispatchConsole(command, currentRegistration, control);
  }
}
