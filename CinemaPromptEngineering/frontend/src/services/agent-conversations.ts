/** Browser-tab-only conversation state for the Prompt Engineer and Console. */

import type {
  AgentSelection,
  AgentSurface,
  PreparedPromptEnhancement,
  PromptConditioningAdapter,
  PromptEnhancementInput,
  PromptSkillTask,
} from '@/api/client';
import type { CinematographyStyle } from '@/types';
import type { ApplicationCommand, ApplicationResult } from '../storyboard/actions/application-actions';
import type { WorkspaceCommand, WorkspaceConsoleContext } from './workspace-agent-contracts';
import {
  getAgentGatewaySnapshot,
  getAgentSettingsState,
  getAgentSessionScopeKey,
  getCurrentPiSessionRef,
} from './agent-gateway-client';
import type {
  AgentGatewaySnapshot,
  AgentSettingsSnapshot,
} from './agent-gateway-client';

export type AgentMessageRole = 'user' | 'assistant' | 'system' | 'handoff';
export type AgentMessageStatus = 'complete' | 'streaming' | 'error' | 'cancelled';

export interface AgentTurnContext {
  targetModel: string;
  task: string | null;
  dialectId: string | null;
}

export interface AgentHandoffMedia {
  readonly id: number;
  readonly kind: 'image';
  readonly role: string;
  readonly ordinal: number;
  readonly conditioning: boolean;
  readonly source: 'cinema-tab-memory';
  readonly mimeType: string;
  /** In-memory tab-scoped snapshot; this package is never persisted. */
  readonly data: string;
}

export interface AgentHandoffPackage {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly createdAt: string;
  readonly sourceSurface: 'prompt-engineer';
  readonly sourceProjectIdentity: string | null;
  readonly sourceContextRevision: string;
  readonly sourceSessionId: string | null;
  readonly sourceSelection: Readonly<AgentSelection> | null;
  /** Destination Console project captured when the user sends the handoff. */
  readonly projectIdentity: string;
  readonly promptSource: 'enhanced_prompt' | 'scene_description';
  readonly finalPrompt: string;
  readonly targetModel: string;
  readonly modelVersion: string | null;
  readonly task: string | null;
  readonly dialectId: string | null;
  readonly conditioningAdapter: string | null;
  readonly projectType: 'live_action' | 'animation';
  readonly presetId: string | null;
  readonly presetName: string | null;
  readonly cinematicConfig: PromptEnhancementInput['config'];
  readonly preset: Readonly<Record<string, unknown>> | null;
  readonly cinematographyStyle: Readonly<CinematographyStyle> | null;
  readonly enhancementContext: PreparedPromptEnhancement['enhancement_context'];
  readonly imageMode: PromptEnhancementInput['imageMode'] | null;
  readonly imageDialect: string | null;
  readonly media: readonly AgentHandoffMedia[];
  readonly mediaSummary: string | null;
}

export function getAgentHandoffMediaReferenceId(packageId: string, mediaId: number): string {
  return `handoff:${packageId}:${mediaId}`;
}

export type AgentHandoffDraft = Omit<
  AgentHandoffPackage,
  | 'schemaVersion' | 'id' | 'createdAt' | 'sourceSurface' | 'sourceProjectIdentity'
  | 'sourceContextRevision' | 'sourceSessionId' | 'sourceSelection' | 'projectIdentity'
>;

export interface AgentHandoffCandidate {
  draft: AgentHandoffDraft;
  sourceContextRevision: string;
}

export interface AgentChatMessage {
  readonly id: string;
  readonly role: AgentMessageRole;
  readonly text: string;
  readonly status: AgentMessageStatus;
  readonly createdAt: string;
  readonly error?: string;
  readonly warnings?: readonly string[];
  readonly context?: Readonly<AgentTurnContext>;
  readonly contextRevision?: string;
  readonly sourceText?: string;
  readonly truncated?: boolean;
  readonly consoleBindingId?: string | null;
  readonly consoleGrantBindingId?: string | null;
  readonly handoff?: Readonly<AgentHandoffPackage>;
}

export interface AgentActionFeedEntry {
  readonly id: string;
  readonly action: string;
  readonly summary: string;
  readonly phase: 'sent' | 'ok' | 'partial' | 'failed';
  readonly status?: string;
  readonly detail?: string;
  readonly revision?: number | string;
  readonly at: string;
}

export interface SurfaceConversationState {
  readonly messages: readonly AgentChatMessage[];
  readonly activeTurnId: string | null;
}

export interface AgentSurfaceSnapshot {
  readonly conversation: SurfaceConversationState;
  readonly draft: string;
  readonly actionFeed: readonly AgentActionFeedEntry[];
  readonly selectedHandoff: Readonly<AgentHandoffPackage> | null;
}

interface ScopedConversationRecord {
  conversation: SurfaceConversationState;
  draft: string;
  actionFeed: AgentActionFeedEntry[];
  selectedHandoff: AgentHandoffPackage | null;
  snapshot: AgentSurfaceSnapshot;
}

const ACTION_FEED_LIMIT = 50;
const MAX_HANDOFF_MEDIA = 4;
const MAX_HANDOFF_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_HANDOFF_TOTAL_BYTES = 8 * 1024 * 1024;
const scopedRecords = new Map<string, ScopedConversationRecord>();
const listeners = new Set<() => void>();
const surfaceContexts: Partial<Record<AgentSurface, () => unknown>> = {};
let idCounter = 0;

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Date.now().toString(36)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function projectIdentityFor(surface: AgentSurface): string | null | undefined {
  if (surface !== 'console') return null;
  const context = getAgentSurfaceContext(surface);
  return context ? context.projectIdentity : getAgentGatewaySnapshot().projectIdentity;
}

/** Same stable identity as the gateway session key; it does not change when a session is first created. */
export function getAgentConversationScopeKey(surface: AgentSurface, projectIdentity?: string | null): string {
  const project = surface === 'workspace' ? null : projectIdentity === undefined ? projectIdentityFor(surface) : projectIdentity;
  return getAgentSessionScopeKey(surface, project ?? null);
}

function createRecord(): ScopedConversationRecord {
  const conversation: SurfaceConversationState = { messages: [], activeTurnId: null };
  const record: ScopedConversationRecord = {
    conversation,
    draft: '',
    actionFeed: [],
    selectedHandoff: null,
    snapshot: { conversation, draft: '', actionFeed: [], selectedHandoff: null },
  };
  return record;
}

function recordFor(scopeKey: string): ScopedConversationRecord {
  let record = scopedRecords.get(scopeKey);
  if (!record) {
    record = createRecord();
    scopedRecords.set(scopeKey, record);
  }
  return record;
}

function publish(scopeKey?: string): void {
  if (scopeKey) {
    const record = recordFor(scopeKey);
    record.snapshot = {
      conversation: record.conversation,
      draft: record.draft,
      actionFeed: record.actionFeed,
      selectedHandoff: record.selectedHandoff,
    };
  } else {
    for (const record of scopedRecords.values()) record.snapshot = { ...record.snapshot };
  }
  listeners.forEach(listener => listener());
}

export function getAgentSurfaceSnapshot(surface: AgentSurface, scopeKey = getAgentConversationScopeKey(surface)): AgentSurfaceSnapshot {
  return recordFor(scopeKey).snapshot;
}

function activeUserRequest(scopeKey: string): { turnId: string; text: string; assistant: AgentChatMessage } | null {
  const conversation = recordFor(scopeKey).conversation;
  const turnId = conversation.activeTurnId;
  const turnIndex = turnId ? conversation.messages.findIndex(message => message.id === turnId && message.role === 'assistant') : -1;
  const request = turnIndex > 0 ? conversation.messages[turnIndex - 1] : undefined;
  const assistant = turnIndex >= 0 ? conversation.messages[turnIndex] : undefined;
  return request?.role === 'user' && request.text.trim() && assistant ? { turnId: turnId!, text: request.text, assistant } : null;
}

/** Return only the typed user message immediately preceding the active workspace turn. */
export function getActiveWorkspaceUserRequest(): { turnId: string; text: string; consoleBindingId: string | null } | null {
  const request = activeUserRequest(getAgentConversationScopeKey('workspace'));
  return request ? {
    turnId: request.turnId,
    text: request.text,
    consoleBindingId: request.assistant.consoleGrantBindingId !== undefined
      ? request.assistant.consoleGrantBindingId
      : request.assistant.consoleBindingId ?? null,
  } : null;
}

export function transferActiveConsoleGrant(
  scopeKey: string,
  turnId: string,
  fromBindingId: string,
  toBindingId: string,
): boolean {
  if (scopeKey !== getAgentConversationScopeKey('workspace')
    || !/^[A-Za-z0-9_-]{16,128}$/.test(fromBindingId)
    || !/^[A-Za-z0-9_-]{16,128}$/.test(toBindingId)
    || fromBindingId === toBindingId
    || !scopedRecords.has(scopeKey)) return false;

  const request = activeUserRequest(scopeKey);
  if (!request || request.turnId !== turnId) return false;
  const grantBindingId = request.assistant.consoleGrantBindingId !== undefined
    ? request.assistant.consoleGrantBindingId
    : request.assistant.consoleBindingId ?? null;
  if (grantBindingId !== fromBindingId
    || getAgentSurfaceContext('console')?.getWorkspaceContext?.()?.bindingId !== toBindingId) return false;

  updateConversation(scopeKey, state => ({
    ...state,
    messages: state.messages.map(message => (
      message.id === turnId && message.role === 'assistant'
        ? { ...message, consoleGrantBindingId: toBindingId }
        : message
    )),
  }));
  return true;
}

/** Return only the typed user message immediately preceding the active Console turn. */
export function getActiveConsoleUserRequest(projectIdentity: string): { turnId: string; text: string } | null {
  const workspaceRequest = getActiveWorkspaceUserRequest();
  if (workspaceRequest) {
    const binding = getAgentSurfaceContext('console')?.getWorkspaceContext?.();
    if (!binding
      || binding.projectIdentity !== projectIdentity
      || binding.bindingId !== workspaceRequest.consoleBindingId) return null;
    return { turnId: workspaceRequest.turnId, text: workspaceRequest.text };
  }
  const request = activeUserRequest(getAgentConversationScopeKey('console', projectIdentity));
  return request ? { turnId: request.turnId, text: request.text } : null;
}

export function subscribeAgentConversations(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function updateConversation(
  scopeKey: string,
  update: (state: SurfaceConversationState) => SurfaceConversationState,
): void {
  const record = recordFor(scopeKey);
  record.conversation = update(record.conversation);
  publish(scopeKey);
}

function replaceMessage(scopeKey: string, messageId: string, patch: Partial<AgentChatMessage>): void {
  updateConversation(scopeKey, state => ({
    ...state,
    messages: state.messages.map(message => (message.id === messageId ? { ...message, ...patch } : message)),
  }));
}

export function setAgentConversationDraft(surface: AgentSurface, value: string, scopeKey = getAgentConversationScopeKey(surface)): void {
  const record = recordFor(scopeKey);
  record.draft = value;
  publish(scopeKey);
}

export function appendAgentUserMessage(
  surface: AgentSurface,
  text: string,
  scopeKey = getAgentConversationScopeKey(surface),
  handoff?: AgentHandoffPackage,
): string {
  const id = nextId('msg');
  updateConversation(scopeKey, state => ({
    ...state,
    messages: [...state.messages, {
      id,
      role: 'user',
      text,
      status: 'complete',
      createdAt: nowIso(),
      ...(handoff ? { handoff } : {}),
    }],
  }));
  return id;
}

export function appendAgentSystemNotice(surface: AgentSurface, text: string, scopeKey = getAgentConversationScopeKey(surface)): void {
  updateConversation(scopeKey, state => ({
    ...state,
    messages: [...state.messages, {
      id: nextId('note'), role: 'system', text, status: 'complete', createdAt: nowIso(),
    }],
  }));
}

export function beginAgentAssistantTurn(
  surface: AgentSurface,
  turnId: string,
  scopeKey = getAgentConversationScopeKey(surface),
  details?: { contextRevision?: string; sourceText?: string; consoleBindingId?: string | null },
): void {
  const state = recordFor(scopeKey).conversation;
  if (state.activeTurnId) throw new Error('This conversation already has a turn in flight.');
  updateConversation(scopeKey, current => ({
    ...current,
    activeTurnId: turnId,
    messages: [...current.messages, {
      id: turnId,
      role: 'assistant',
      text: '',
      status: 'streaming',
      createdAt: nowIso(),
      ...(details?.contextRevision ? { contextRevision: details.contextRevision } : {}),
      ...(details?.sourceText ? { sourceText: details.sourceText } : {}),
      ...(details?.consoleBindingId === undefined ? {} : {
        consoleBindingId: details.consoleBindingId,
        consoleGrantBindingId: details.consoleBindingId,
      }),
    }],
  }));
}

export function appendAgentAssistantDelta(surface: AgentSurface, turnId: string, delta: string, scopeKey: string): void {
  if (getAgentConversationScopeKey(surface) !== scopeKey) return;
  if (recordFor(scopeKey).conversation.activeTurnId !== turnId) return;
  const current = recordFor(scopeKey).conversation.messages.find(message => message.id === turnId);
  if (current) replaceMessage(scopeKey, turnId, { text: current.text + delta });
}

export function completeAgentAssistantTurn(
  surface: AgentSurface,
  turnId: string,
  scopeKey: string,
  options?: { warnings?: string[]; context?: AgentTurnContext; truncated?: boolean },
): void {
  if (getAgentConversationScopeKey(surface) !== scopeKey) return;
  if (recordFor(scopeKey).conversation.activeTurnId !== turnId) return;
  replaceMessage(scopeKey, turnId, {
    status: 'complete',
    ...(options?.warnings?.length ? { warnings: options.warnings } : {}),
    ...(options?.context ? { context: options.context } : {}),
    ...(options?.truncated ? { truncated: true } : {}),
  });
  updateConversation(scopeKey, state => ({ ...state, activeTurnId: null }));
}

export function failAgentAssistantTurn(surface: AgentSurface, turnId: string, error: string, scopeKey: string): void {
  if (getAgentConversationScopeKey(surface) !== scopeKey) return;
  if (recordFor(scopeKey).conversation.activeTurnId !== turnId) return;
  replaceMessage(scopeKey, turnId, { status: 'error', error });
  updateConversation(scopeKey, state => ({ ...state, activeTurnId: null }));
}

export function cancelAgentAssistantTurn(surface: AgentSurface, turnId: string, scopeKey: string): void {
  void surface;
  if (recordFor(scopeKey).conversation.activeTurnId !== turnId) return;
  const current = recordFor(scopeKey).conversation.messages.find(message => message.id === turnId);
  replaceMessage(scopeKey, turnId, {
    status: 'cancelled',
    text: current?.text
      ? `${current.text}\n\n[Turn cancelled — the partial text above was already streamed.]`
      : '[Turn cancelled before any text arrived.]',
  });
  updateConversation(scopeKey, state => ({ ...state, activeTurnId: null }));
}

/** Clears only the visible history in this surface/project/model scope. */
export function clearAgentConversation(surface: AgentSurface, scopeKey = getAgentConversationScopeKey(surface), newSession = false): void {
  if (recordFor(scopeKey).conversation.activeTurnId) return;
  if (newSession) {
    const record = recordFor(scopeKey);
    record.draft = '';
    record.actionFeed = [];
    record.selectedHandoff = null;
  }
  updateConversation(scopeKey, () => ({
    messages: newSession ? [] : [{
      id: nextId('note'),
      role: 'system',
      text: 'Visible history cleared for this project and model. The persisted harness session was not reset.',
      status: 'complete',
      createdAt: nowIso(),
    }],
    activeTurnId: null,
  }));
}

function cloneAndFreeze<T>(value: T): T {
  const clone = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return;
    Object.values(item as Record<string, unknown>).forEach(freeze);
    Object.freeze(item);
  };
  freeze(clone);
  return clone;
}

function imageByteLength(data: string): number {
  return Math.floor(data.length * 3 / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
}

export type AgentHandoffResult =
  | { ok: true }
  | { ok: false; message: string };

/** Send one bounded immutable handoff to the currently bound Console project. */
export function sendPromptEngineerHandoff(draft: AgentHandoffDraft, sourceContextRevision: string): AgentHandoffResult {
  const sourceContext = getAgentSurfaceContext('prompt-engineer');
  const consoleContext = getAgentSurfaceContext('console');
  const destinationProject = consoleContext?.projectIdentity;
  if (!sourceContext || !consoleContext || !destinationProject) {
    return { ok: false, message: 'Handoff not sent: the Director Console has no loaded project to receive it.' };
  }
  if (getAgentGatewaySnapshot().projectIdentity !== destinationProject) {
    return { ok: false, message: 'Handoff not sent: the paired agent session is not bound to the destination Console project.' };
  }
  if (sourceContext.getRevision() !== sourceContextRevision) {
    return { ok: false, message: 'Handoff not sent: the cinematic context changed during preparation. Try again with the current settings.' };
  }
  const sourceProjectIdentity = null;
  if (draft.media.length > MAX_HANDOFF_MEDIA) {
    return { ok: false, message: `Handoff not sent: at most ${MAX_HANDOFF_MEDIA} image references can be snapshotted.` };
  }
  const mediaBytes = draft.media.map(item => imageByteLength(item.data));
  if (mediaBytes.some(size => size <= 0 || size > MAX_HANDOFF_IMAGE_BYTES)
    || mediaBytes.reduce((sum, size) => sum + size, 0) > MAX_HANDOFF_TOTAL_BYTES) {
    return { ok: false, message: 'Handoff not sent: media exceeds the 6 MiB per-image or 8 MiB total in-memory limit.' };
  }

  const sourceScopeKey = getAgentConversationScopeKey('prompt-engineer');
  const destinationScopeKey = getAgentConversationScopeKey('console', destinationProject);
  const currentSession = getCurrentPiSessionRef('prompt-engineer');
  const settings = getAgentSettingsState();
  const pkg = cloneAndFreeze({
    ...draft,
    schemaVersion: 1 as const,
    id: nextId('handoff'),
    createdAt: nowIso(),
    sourceSurface: 'prompt-engineer' as const,
    sourceProjectIdentity,
    sourceContextRevision,
    sourceSessionId: currentSession?.sessionId ?? null,
    sourceSelection: settings.record?.selection ? cloneAndFreeze(settings.record.selection) : null,
    projectIdentity: destinationProject,
  }) as AgentHandoffPackage;

  updateConversation(destinationScopeKey, state => ({
    ...state,
    messages: [...state.messages, {
      id: pkg.id,
      role: 'handoff',
      text: pkg.finalPrompt,
      status: 'complete',
      createdAt: pkg.createdAt,
      handoff: pkg,
    }],
  }));
  appendAgentSystemNotice(
    'prompt-engineer',
    'Handoff sent to Director Console for the loaded Storyboard project. Use its card explicitly before a Console turn can include it.',
    sourceScopeKey,
  );
  return { ok: true };
}

export function selectAgentHandoff(packageId: string, scopeKey = getAgentConversationScopeKey('console')): { ok: true } | { ok: false; message: string } {
  if (getAgentConversationScopeKey('console') !== scopeKey) return { ok: false, message: 'This handoff card belongs to a previous project or model scope. Refresh the current conversation first.' };
  const currentProject = getAgentSurfaceContext('console')?.projectIdentity;
  const pairedProject = getAgentGatewaySnapshot().projectIdentity;
  const conversation = recordFor(scopeKey).conversation;
  const pkg = conversation.messages.find(message => message.role === 'handoff' && message.handoff?.id === packageId)?.handoff;
  if (!pkg) return { ok: false, message: 'This handoff is no longer available in the current conversation scope.' };
  if (!currentProject || !pkg.projectIdentity || pkg.projectIdentity !== currentProject || pairedProject !== currentProject) {
    return { ok: false, message: 'This handoff is bound to a different or unbound project. Load and pair its captured project first.' };
  }
  if (pkg.media.some(item => !item.data || item.source !== 'cinema-tab-memory')) {
    return { ok: false, message: 'This handoff contains an expired media reference. Send a fresh handoff from the Cinema tab.' };
  }
  const record = recordFor(scopeKey);
  record.selectedHandoff = pkg as AgentHandoffPackage;
  publish(scopeKey);
  return { ok: true };
}

export function clearSelectedAgentHandoff(packageId: string, scopeKey: string): void {
  const record = recordFor(scopeKey);
  if (record.selectedHandoff?.id !== packageId) return;
  record.selectedHandoff = null;
  publish(scopeKey);
}

export function describeApplicationCommand(command: ApplicationCommand | WorkspaceCommand): string {
  switch (command.action) {
    case 'save_project': return 'Save Console project';
    case 'new_project': return 'Create a new Console project';
    case 'open_project': return 'Open Console project';
    case 'add_panels': return `Add ${command.input.count} Console panels`;
    case 'remove_panels': return `Remove ${command.input.panelIds.length} Console panels`;
    case 'show_panel_controls': return `Show controls for Console panel ${command.target.panelId}`;
    case 'select_backends': return 'Select configured render backends';
    case 'inspect_media': return 'Inspect actual media visuals';
    case 'get_prompt_guidance': return 'Read model-specific prompt guidance';
    case 'prompt_engineer_action': return `Prompt Engineer → ${command.input.operation}`;
    case 'gallery_action': return `Gallery → ${command.input.operation}`;
    case 'get_application_snapshot': return 'Read application snapshot';
    case 'inspect_backend': return `Inspect managed backend ${command.target.backendId}`;
    case 'search_workflow_sources': return 'Search curated workflow sources';
    case 'get_source_recipe': return `Read pinned recipe ${command.input.recipeId}`;
    case 'plan_dependencies': return `Plan ${command.input.recipeId} dependencies on ${command.target.backendId}`;
    case 'prepare_workflow_revision': return `Prepare workflow revision → panel ${command.target.panelId} on backend ${command.target.backendId}`;
    case 'get_backend_node_definitions': return `Read node definitions → ${command.target.backendId}`;
    case 'prepare_workflow_proposal': return `Prepare created or modified workflow → panel ${command.target.panelId}`;
    case 'save_and_attach_workflow': return `Save & attach workflow → panel ${command.target.panelId}`;
    case 'bind_media': return `Bind media (${command.input.bindingId}) → panel ${command.target.panelId} on ${command.target.backendIds.join(', ')}`;
    case 'set_panel_parameters': return `Set panel parameters → panel ${command.target.panelId} on backend ${command.target.backendId}`;
    case 'enhance_generation_prompt': return command.input.phase === 'prepare' ? 'Prepare cinematic prompt guidance' : 'Validate Pi-authored generation prompt';
    case 'start_generation': return `Start ${command.target.mode} generation → panel ${command.target.panelId} on ${command.target.backendIds.join(', ')}`;
    case 'get_run': return `Read run ${command.target.runId}`;
    case 'cancel_run': return `Cancel run ${command.target.runId}`;
  }
}

export function beginApplicationAction(command: ApplicationCommand | WorkspaceCommand): string {
  const scopeKey = 'projectIdentity' in command
    ? getAgentConversationScopeKey('console', command.projectIdentity)
    : getAgentConversationScopeKey('workspace');
  const record = recordFor(scopeKey);
  const entry: AgentActionFeedEntry = {
    id: nextId('action'),
    action: command.action,
    summary: describeApplicationCommand(command),
    phase: 'sent',
    ...((command.expectedWorkflowRevision ?? command.expectedPanelRevision ?? command.expectedProjectRevision) === undefined
      ? {}
      : { revision: command.expectedWorkflowRevision ?? command.expectedPanelRevision ?? command.expectedProjectRevision }),
    at: nowIso(),
  };
  record.actionFeed = [entry, ...record.actionFeed].slice(0, ACTION_FEED_LIMIT);
  publish(scopeKey);
  return entry.id;
}

function resultSummary(result: ApplicationResult): Pick<AgentActionFeedEntry, 'phase' | 'status' | 'detail' | 'revision'> {
  const data = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : {};
  const rawStatus = typeof data.status === 'string' ? data.status : undefined;
  const status = rawStatus && /^[a-z][a-z0-9_-]{0,48}$/.test(rawStatus) ? rawStatus : undefined;
  const revisionValue = data.workflowRevision ?? data.panelRevision ?? data.projectRevision ?? data.revision;
  const revision = typeof revisionValue === 'number' && Number.isFinite(revisionValue)
    ? revisionValue
    : typeof revisionValue === 'string' && /^\d{1,12}$/.test(revisionValue) ? revisionValue : undefined;
  const cancelPartial = result.action === 'cancel_run' && Array.isArray(data.jobs)
    && data.jobs.some(job => {
      const item = job && typeof job === 'object' ? job as Record<string, unknown> : {};
      return item.cancelled !== true && !['cancelled', 'complete', 'error', 'failed_before_submission'].includes(String(item.status));
    });
  const partial = cancelPartial || ['saved-unattached', 'uploaded-unbound', 'saved-unapplied', 'scope_changed', 'outcome_unknown_after_scope_change', 'submission_unknown', 'cancel_outcome_unknown'].includes(status || '')
    || result.action === 'save_and_attach_workflow' && status !== 'saved-and-attached';
  return {
    phase: !result.ok ? 'failed' : partial ? 'partial' : 'ok',
    ...(status ? { status } : result.action === 'save_and_attach_workflow' ? { status: 'attachment-unconfirmed' } : {}),
    ...(!result.ok ? {
      detail: result.error?.code && /^[a-z0-9_-]{1,48}$/i.test(result.error.code) ? result.error.code : 'action_failed',
    } : {}),
    ...(revision === undefined ? {} : { revision }),
  };
}

export function settleApplicationAction(feedId: string, result: ApplicationResult): void {
  for (const [scopeKey, record] of scopedRecords) {
    if (!record.actionFeed.some(entry => entry.id === feedId)) continue;
    const summary = resultSummary(result);
    record.actionFeed = record.actionFeed.map(entry => entry.id === feedId ? { ...entry, ...summary } : entry);
    publish(scopeKey);
    return;
  }
}

export interface PromptEngineerSurfaceContext {
  statusNote: string | null;
  projectIdentity: string | null;
  getRevision: () => string;
  getConstraintSnapshot?: () => {
    revision: string;
    targetModel: string;
    projectType: 'live_action' | 'animation';
    config: PromptEnhancementInput['config'];
    presetId?: string;
    presetName?: string;
    skillModelVersion?: string;
    skillTask?: PromptSkillTask;
    conditioningAdapter?: PromptConditioningAdapter;
  };
  chatTurnInput: (chatMessage: string) => PromptEnhancementInput | null;
  handoff: (signal: AbortSignal) => Promise<AgentHandoffCandidate | null>;
  applyValidatedPrompt: (prompt: string, expectedRevision: string) => boolean;
}

export interface ConsoleSurfaceContext {
  statusNote: string | null;
  projectIdentity: string | null;
  getRevision: () => string;
  getWorkspaceContext?: () => WorkspaceConsoleContext;
}

export interface WorkspaceSurfaceContext {
  statusNote: string | null;
  projectIdentity: null;
  getRevision: () => string;
}

type SurfaceContextMap = {
  'prompt-engineer': PromptEngineerSurfaceContext;
  console: ConsoleSurfaceContext;
  workspace: WorkspaceSurfaceContext;
};

export function registerAgentSurfaceContext<S extends keyof SurfaceContextMap>(
  surface: S,
  get: () => SurfaceContextMap[S] | null,
): () => void {
  surfaceContexts[surface] = get as () => unknown;
  publish();
  return () => {
    if (surfaceContexts[surface] === (get as unknown)) {
      delete surfaceContexts[surface];
      publish();
    }
  };
}

export function notifyAgentSurfaceContextChanged(surface: AgentSurface): void {
  if (surfaceContexts[surface]) publish();
}

export function getAgentSurfaceContext<S extends keyof SurfaceContextMap>(surface: S): SurfaceContextMap[S] | null {
  const supplier = surfaceContexts[surface] as (() => SurfaceContextMap[S] | null) | undefined;
  return supplier ? supplier() : null;
}

export function getAgentSurfaceExecutionFingerprint(surface: AgentSurface): string {
  const context = surface === 'prompt-enhancement' ? null : getAgentSurfaceContext(surface);
  return JSON.stringify([getAgentConversationScopeKey(surface), context?.getRevision() ?? null]);
}

export interface AgentChatGate {
  allowed: boolean;
  reason: string | null;
  selectionLabel: string | null;
}

export function evaluateAgentChatGate(
  settings: AgentSettingsSnapshot,
  gateway: AgentGatewaySnapshot,
  surfaceContext: unknown,
): AgentChatGate {
  if (!surfaceContext) return { allowed: false, reason: null, selectionLabel: null };
  if (settings.loading) return { allowed: false, reason: 'Loading the shared agent selection…', selectionLabel: null };
  if (settings.error || !settings.record) return { allowed: false, reason: settings.error || 'Agent settings are unavailable. Retry from Agent Settings.', selectionLabel: null };
  const migrationState = settings.record.migrationState;
  if (migrationState === 'unconfigured') return { allowed: false, reason: 'Chat needs an authenticated harness model. Configure one in Agent Settings; legacy direct providers are never used for chat.', selectionLabel: null };
  if (migrationState === 'legacy_explicit') return { allowed: false, reason: 'Legacy direct-provider enhancement is active. Conversations require an authenticated harness model selected in Agent Settings.', selectionLabel: null };
  const selection = settings.record.selection;
  if (!selection) return { allowed: false, reason: 'No harness model is selected. Choose one in Agent Settings.', selectionLabel: null };
  if (selection.harnessId !== 'pi' && selection.harnessId !== 'codex') return { allowed: false, reason: `The selected ${selection.harnessId} harness is not supported for chat.`, selectionLabel: null };
  const harnessLabel = selection.harnessId === 'pi' ? 'Pi' : 'Codex';
  if (gateway.modelsHarnessId !== selection.harnessId) return { allowed: false, reason: `The authenticated ${harnessLabel} model inventory does not match this selection. Refresh Agent Settings.`, selectionLabel: null };
  if (gateway.status !== 'ready') return { allowed: false, reason: gateway.message, selectionLabel: null };
  if (gateway.modelsLoading) return { allowed: false, reason: `Checking authenticated ${harnessLabel} models…`, selectionLabel: null };
  if (gateway.modelError) return { allowed: false, reason: gateway.modelError, selectionLabel: null };
  if (gateway.availability?.state !== 'ready') return { allowed: false, reason: gateway.availability?.message || `${harnessLabel} has no authenticated models.`, selectionLabel: null };
  const selectedModel = gateway.models.find(model => model.provider === selection.provider && model.modelId === selection.modelId);
  const selectionLabel = `${harnessLabel} · ${selection.provider} · ${selectedModel?.name || selectedModel?.modelId || selection.modelId}${selection.thinkingLevel ? ` · thinking ${selection.thinkingLevel}` : ''}`;
  if (!selectedModel) return { allowed: false, reason: `The selected ${harnessLabel} model is not in the authenticated inventory. Its selection is preserved; refresh or choose an available model in Agent Settings.`, selectionLabel };
  if (selection.thinkingLevel && !selectedModel.thinkingLevels?.includes(selection.thinkingLevel)) return { allowed: false, reason: `The selected ${harnessLabel} model does not support thinking level "${selection.thinkingLevel}". Choose a supported level in Agent Settings.`, selectionLabel };
  return { allowed: true, reason: null, selectionLabel };
}
