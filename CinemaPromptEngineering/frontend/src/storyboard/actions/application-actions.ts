import type { ParameterConfig } from '../components/WorkflowEditor';
import { getWorkflowParser, type ComfyUIWorkflow, type QwenWorkflowFormat } from '../services/workflow-parser';
import { nodeDefinitions, type ObjectInfo } from '../services/node-definitions';
import { findWorkflowNode, getWorkflowNodeClassType, getWorkflowNodeInput } from '../services/workflow-editor-options';
import { dispatchPromptEngineerAgentAction, type PromptEngineerAgentRequest } from '../../services/agent-prompt-engineer-actions';
import { dispatchGalleryAgentAction, type GalleryAgentRequest } from '../../gallery/services/agent-gallery-actions';
import { inspectAgentMedia } from '../../services/agent-media-inspection';
import { api, type PromptConditioningAdapter, type PromptSkillTask } from '../../api/client';

export type ApplicationActionName =
  | 'save_project'
  | 'new_project'
  | 'open_project'
  | 'add_panels'
  | 'remove_panels'
  | 'show_panel_controls'
  | 'select_backends'
  | 'inspect_media'
  | 'get_prompt_guidance'
  | 'prompt_engineer_action'
  | 'gallery_action'
  | 'get_application_snapshot'
  | 'inspect_backend'
  | 'search_workflow_sources'
  | 'get_source_recipe'
  | 'plan_dependencies'
  | 'prepare_workflow_revision'
  | 'get_backend_node_definitions'
  | 'prepare_workflow_proposal'
  | 'save_and_attach_workflow'
  | 'bind_media'
  | 'set_panel_parameters'
  | 'enhance_generation_prompt'
  | 'start_generation'
  | 'get_run'
  | 'cancel_run';

export interface ApplicationCommandBase {
  expectedConsoleBindingId?: string;
  commandId: string;
  projectIdentity: string;
  expectedProjectRevision?: number;
  expectedPanelRevision?: number;
  expectedWorkflowRevision?: number;
}

export type ApplicationCommand =
  | (ApplicationCommandBase & { action: 'save_project'; input: { folderPath?: string; name?: string } })
  | (ApplicationCommandBase & { action: 'new_project'; input: { unsavedWorkChoice?: 'save' | 'discard' | 'cancel' }; expectedPanelRevision?: never; expectedWorkflowRevision?: never })
  | (ApplicationCommandBase & { action: 'open_project'; input: { projectPath: string; unsavedWorkChoice?: 'save' | 'discard' | 'cancel' }; expectedPanelRevision?: never; expectedWorkflowRevision?: never })
  | (ApplicationCommandBase & { action: 'add_panels'; input: { count: number } })
  | (ApplicationCommandBase & { action: 'remove_panels'; input: { panelIds: number[]; expectedPanelRevisions: Record<string, number> } })
  | (ApplicationCommandBase & { action: 'show_panel_controls'; target: { panelId: number; workflowId: string } })
  | (ApplicationCommandBase & { action: 'select_backends'; input: { backendIds: string[] } })
  | (ApplicationCommandBase & { action: 'inspect_media'; input: { assetId: string } })
  | (ApplicationCommandBase & { action: 'get_prompt_guidance'; input: { targetModel?: string; modelVersion?: string; task?: PromptSkillTask; dialectId?: string; conditioningAdapter?: PromptConditioningAdapter } })
  | (ApplicationCommandBase & { action: 'prompt_engineer_action'; input: PromptEngineerAgentRequest })
  | (ApplicationCommandBase & { action: 'gallery_action'; input: GalleryAgentRequest })
  | (ApplicationCommandBase & { action: 'get_backend_node_definitions'; target: { backendId: string }; input: { nodeClasses: string[] } })
  | (ApplicationCommandBase & {
      action: 'prepare_workflow_proposal';
      target: { panelId: number; backendId: string; workflowId?: string };
      input: { name: string; description?: string; category?: string; subCategory?: string; workflow: Record<string, unknown>; config: Record<string, unknown>[]; provenance?: Record<string, unknown>[] };
    })
  | (ApplicationCommandBase & { action: 'get_application_snapshot' })
  | (ApplicationCommandBase & { action: 'inspect_backend'; target: { backendId: string }; input: { refresh?: boolean } })
  | (ApplicationCommandBase & { action: 'search_workflow_sources'; input: { query?: string } })
  | (ApplicationCommandBase & { action: 'get_source_recipe'; input: { recipeId: string } })
  | (ApplicationCommandBase & { action: 'plan_dependencies'; target: { backendId: string }; input: { recipeId: string; sourceGraphFingerprint: string } })
  | (ApplicationCommandBase & {
      action: 'prepare_workflow_revision';
      target: { panelId: number; backendId: string };
      source: {
        recipeId: string;
        sourceGraphFingerprint: string;
        exportedRecipe?: {
          recipeFingerprint: string;
          backendId: string;
          selectedHandoffId: string | null;
          capturedAt: string;
          objectInfoFingerprint: string;
          exportFingerprint: string;
          workflow: Record<string, unknown>;
          readiness: 'not_verified';
          identityVerification: 'not_verified';
        };
      };
    })
  | (ApplicationCommandBase & {
      action: 'save_and_attach_workflow';
      target: { panelId: number; workflowId?: string };
      input: { preparedRevisionId?: string; workflowId?: string; workflowRevision?: number };
    })
  | (ApplicationCommandBase & {
      action: 'bind_media';
      target: { panelId: number; workflowId: string; backendIds: string[] };
      input: { bindingId: string; media?: { kind: 'image' | 'video'; dataUrl: string }; assetId?: string };
    })
  | (ApplicationCommandBase & {
      action: 'set_panel_parameters';
      target: { panelId: number; workflowId: string; backendId: string };
      input: { values: Record<string, unknown> };
    })
  | (ApplicationCommandBase & {
      action: 'enhance_generation_prompt';
      input: { phase: 'prepare' } | { phase: 'validate'; preparationId: string; enhancedPrompt: string };
    })
  | (ApplicationCommandBase & {
      action: 'start_generation';
      idempotencyKey: string;
      target: { panelId: number; workflowId: string; backendIds: string[]; mode: 'single' | 'parallel' };
    })
  | (ApplicationCommandBase & { action: 'get_run'; target: { runId: string }; input?: { waitSeconds?: number } })
  | (ApplicationCommandBase & { action: 'cancel_run'; target: { runId: string } });

export interface ApplicationResult {
  ok: boolean;
  commandId: string;
  action: ApplicationActionName;
  runId?: string;
  data?: unknown;
  error?: { code: string; message: string; retryable: boolean };
}

export interface ApplicationBridgeMessage {
  sessionId: string;
  command: ApplicationCommand;
}

export type ApplicationActionHandlers = {
  [Action in Exclude<ApplicationActionName, 'prompt_engineer_action' | 'gallery_action' | 'inspect_media' | 'get_prompt_guidance'>]: (command: Extract<ApplicationCommand, { action: Action }>) => Promise<unknown>;
};

export async function dispatchStoryboardApplicationAction(
  handlers: ApplicationActionHandlers,
  command: ApplicationCommand,
): Promise<ApplicationResult> {
  try {
    let data: unknown;
    switch (command.action) {
      case 'save_project': data = await handlers.save_project(command); break;
      case 'new_project': data = await handlers.new_project(command); break;
      case 'open_project': data = await handlers.open_project(command); break;
      case 'add_panels': data = await handlers.add_panels(command); break;
      case 'remove_panels': data = await handlers.remove_panels(command); break;
      case 'show_panel_controls': data = await handlers.show_panel_controls(command); break;
      case 'select_backends': data = await handlers.select_backends(command); break;
      case 'inspect_media': data = await inspectAgentMedia(command.input.assetId, AbortSignal.timeout(25_000)); break;
      case 'get_prompt_guidance': data = command.input.targetModel === undefined
        ? { catalogOnly: true, ...await api.getPromptEnhancementSkills() }
        : await api.getModelPromptGuidance({ ...command.input, targetModel: command.input.targetModel }); break;
      case 'prompt_engineer_action': data = await dispatchPromptEngineerAgentAction(command.input); break;
      case 'gallery_action': data = await dispatchGalleryAgentAction(command.input); break;
      case 'get_application_snapshot': data = await handlers.get_application_snapshot(command); break;
      case 'inspect_backend': data = await handlers.inspect_backend(command); break;
      case 'search_workflow_sources': data = await handlers.search_workflow_sources(command); break;
      case 'get_source_recipe': data = await handlers.get_source_recipe(command); break;
      case 'plan_dependencies': data = await handlers.plan_dependencies(command); break;
      case 'prepare_workflow_revision': data = await handlers.prepare_workflow_revision(command); break;
      case 'get_backend_node_definitions': data = await handlers.get_backend_node_definitions(command); break;
      case 'prepare_workflow_proposal': data = await handlers.prepare_workflow_proposal(command); break;
      case 'save_and_attach_workflow': data = await handlers.save_and_attach_workflow(command); break;
      case 'bind_media': data = await handlers.bind_media(command); break;
      case 'set_panel_parameters': data = await handlers.set_panel_parameters(command); break;
      case 'enhance_generation_prompt': data = await handlers.enhance_generation_prompt(command); break;
      case 'start_generation': data = await handlers.start_generation(command); break;
      case 'get_run': data = await handlers.get_run(command); break;
      case 'cancel_run': data = await handlers.cancel_run(command); break;
    }
    const runId = command.action === 'start_generation' || command.action === 'get_run' || command.action === 'cancel_run'
      ? command.action === 'start_generation' ? (data as { runId?: unknown } | undefined)?.runId : command.target.runId
      : undefined;
    return {
      ok: true,
      commandId: command.commandId,
      action: command.action,
      ...(typeof runId === 'string' ? { runId } : {}),
      data,
    };
  } catch (error) {
    return {
      ok: false,
      commandId: command.commandId,
      action: command.action,
      error: {
        code: error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'application_action_failed',
        message: error instanceof Error ? error.message : 'The application action failed.',
        retryable: Boolean(error && typeof error === 'object' && 'code' in error
          && ['stale_project', 'stale_panel', 'stale_workflow', 'generation_preflight_stale', 'prepared_revision_stale'].includes(String(error.code))),
      },
    };
  }
}

export function validateWorkflowControls(
  workflow: ComfyUIWorkflow | QwenWorkflowFormat,
  config: ParameterConfig[],
  objectInfo: ObjectInfo,
  backendUrl: string,
): { parsed: ReturnType<ReturnType<typeof getWorkflowParser>['parseWorkflow']>; config: ParameterConfig[]; errors: string[] } {
  const parser = getWorkflowParser();
  const parsed = parser.parseWorkflow(workflow, objectInfo);
  const errors: string[] = [];
  const names = new Set<string>();
  const bindings = new Set<string>();
  const byBinding = <T extends { node_id: string; input_name: string }>(items: T[]) => new Map(items.map(item => [`${item.node_id}\0${item.input_name}`, item]));
  const parameters = byBinding(parsed.parameters);
  const imageInputs = byBinding(parsed.image_inputs);
  const loras = new Map(parsed.loras.map(lora => [lora.node_id, lora]));

  const verified = config.map(control => {
    if (!control.exposed) return control;
    const key = `${control.node_id}\0${control.input_name}`;
    if (!control.name || names.has(control.name)) errors.push(`Exposed control name '${control.name}' is empty or duplicated.`);
    if (bindings.has(key)) errors.push(`The input ${control.node_id}.${control.input_name} is exposed more than once.`);
    names.add(control.name);
    bindings.add(key);
    const node = findWorkflowNode(workflow, control.node_id);
    const classType = getWorkflowNodeClassType(node);
    if (!node || !classType) {
      errors.push(`Control '${control.name}' references missing node ${control.node_id}.`);
      return control;
    }
    const nodeInput = getWorkflowNodeInput(node, control.input_name);
    if (nodeInput === undefined || Array.isArray(nodeInput)) {
      errors.push(`Control '${control.name}' does not map to an editable widget input.`);
      return control;
    }
    const schema = nodeDefinitions.getInputDefinition(classType, control.input_name, backendUrl);
    if (!schema || schema.availability !== 'available') {
      errors.push(`The selected backend does not expose an immediately usable ${classType}.${control.input_name} widget.`);
      return control;
    }
    const parsedParameter = parameters.get(key);
    const parsedImage = imageInputs.get(key);
    const parsedLora = loras.get(control.node_id);
    const schemaType = schema.type.toUpperCase();
    if (control.category === 'image_input') {
      const compatibleImageType = parsedImage && (
        control.type === 'media'
        || parsedImage.type === 'video' && ['video', 'video_list'].includes(control.type)
        || parsedImage.type !== 'video' && ['image', 'image_list'].includes(control.type)
      );
      if (!parsedImage || !compatibleImageType) {
        errors.push(`Media control '${control.name}' does not match a parsed image or video input.`);
      }
      if (['image', 'image_list', 'media'].includes(control.type) && !['IMAGE', 'MASK', 'STRING', 'COMBO'].includes(schemaType)) {
        errors.push(`Image control '${control.name}' maps to unsupported schema type ${schema.type}.`);
      }
      if (['video', 'video_list'].includes(control.type) && !['VIDEO', 'STRING', 'COMBO'].includes(schemaType)) {
        errors.push(`Video control '${control.name}' maps to unsupported schema type ${schema.type}.`);
      }
    } else {
      const parsedLoraBinding = control.category === 'lora' && parsedLora
        && (control.input_name === parsedLora.strength_inputs.model || control.input_name === parsedLora.strength_inputs.clip);
      if (!parsedParameter && !parsedLoraBinding) {
        errors.push(`Control '${control.name}' is not a parsed widget input.`);
      }
      const expectedTypes: Record<string, string[]> = {
        integer: ['INT', 'NUMBER'], seed: ['INT', 'NUMBER'], float: ['FLOAT', 'NUMBER'],
        boolean: ['BOOLEAN'], enum: ['COMBO'], prompt: ['STRING'], string: ['STRING'],
        lora: ['FLOAT', 'NUMBER'],
      };
      if (!expectedTypes[control.type]?.includes(schemaType)) {
        errors.push(`Control '${control.name}' type ${control.type} does not match backend schema ${schema.type}.`);
      }
      if (control.category === 'lora') {
        const loraNameSchema = nodeDefinitions.getInputDefinition(classType, 'lora_name', backendUrl);
        if (!loraNameSchema?.isEnum || !loraNameSchema.options?.length) {
          errors.push(`LoRA control '${control.name}' has no verified backend LoRA list.`);
        } else {
          for (const choice of control.constraints?.availableLoras || []) {
            if (!loraNameSchema.options.some(option => Object.is(option, choice))) errors.push(`LoRA control '${control.name}' includes a choice absent from the selected backend.`);
          }
          if (parsedLora?.lora_name && !loraNameSchema.options.some(option => Object.is(option, parsedLora.lora_name))) {
            errors.push(`LoRA control '${control.name}' default is absent from the selected backend.`);
          }
        }
      }
      if (control.type === 'enum') {
        if (!schema.isEnum || !schema.options?.length) errors.push(`Control '${control.name}' has no verified backend choices.`);
        for (const choice of control.constraints?.options || []) {
          if (!schema.options?.some(option => Object.is(option, choice))) errors.push(`Control '${control.name}' includes a choice absent from the selected backend.`);
        }
        if (control.default !== undefined && !schema.options?.some(option => Object.is(option, control.default))) {
          errors.push(`Control '${control.name}' default is not a choice on the selected backend.`);
        }
      }
      if (control.type === 'integer' || control.type === 'seed' || control.type === 'float' || control.type === 'lora') {
        const constraints = control.constraints || {};
        const minimum = constraints.min;
        const maximum = constraints.max;
        const step = constraints.step;
        if (minimum !== undefined && (typeof minimum !== 'number' || !Number.isFinite(minimum) || schema.min !== undefined && minimum < schema.min)) {
          errors.push(`Control '${control.name}' minimum exceeds the selected backend range.`);
        }
        if (maximum !== undefined && (typeof maximum !== 'number' || !Number.isFinite(maximum) || schema.max !== undefined && maximum > schema.max)) {
          errors.push(`Control '${control.name}' maximum exceeds the selected backend range.`);
        }
        if (step !== undefined && (typeof step !== 'number' || !Number.isFinite(step) || step <= 0)) errors.push(`Control '${control.name}' step must be positive.`);
        if (typeof step === 'number' && schema.step !== undefined
          && (step < schema.step || Math.abs(step / schema.step - Math.round(step / schema.step)) > 1e-8)) {
          errors.push(`Control '${control.name}' step does not align with the selected backend step.`);
        }
        if (typeof control.default !== 'number' || !Number.isFinite(control.default)
          || schema.min !== undefined && control.default < schema.min
          || schema.max !== undefined && control.default > schema.max
          || typeof minimum === 'number' && control.default < minimum
          || typeof maximum === 'number' && control.default > maximum) {
          errors.push(`Control '${control.name}' default is outside its verified numeric range.`);
        }
      }
    }
    const constraints = {
      ...control.constraints,
      ...(control.constraints?.min === undefined && schema.min !== undefined ? { min: schema.min } : {}),
      ...(control.constraints?.max === undefined && schema.max !== undefined ? { max: schema.max } : {}),
      ...(control.constraints?.step === undefined && schema.step !== undefined ? { step: schema.step } : {}),
      ...(control.type === 'enum' && !(control.constraints?.options?.length) && schema.options ? { options: schema.options } : {}),
      ...(control.category === 'lora' ? {
        availableLoras: nodeDefinitions.getInputDefinition(classType, 'lora_name', backendUrl)?.options?.filter((option): option is string => typeof option === 'string') || [],
        lora_name: parsedLora?.lora_name || control.constraints?.lora_name || '',
      } : {}),
    };
    return { ...control, constraints, schemaStatus: schema.availability, schemaType: schema.type, schema: schema.config };
  });
  return { parsed, config: verified, errors: [...new Set(errors)] };
}

export function validatePanelParameterValues(config: ParameterConfig[], values: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const [name, value] of Object.entries(values)) {
    const loraNameControl = config.find(item => item.exposed && item.category === 'lora' && `${item.name}_lora_name` === name);
    if (loraNameControl) {
      const options = loraNameControl.constraints?.availableLoras || [];
      if (typeof value !== 'string' || options.length === 0 || !options.includes(value)) {
        errors.push(`'${name}' is not one of the verified LoRA choices.`);
      }
      continue;
    }
    const control = config.find(item => item.exposed && item.name === name);
    if (!control || control.category === 'image_input') {
      errors.push(`'${name}' is not an exposed non-media workflow control.`);
      continue;
    }
    if (control.type === 'lora') {
      const loraValue = typeof value === 'number' ? { strength: value } : value;
      if (!loraValue || typeof loraValue !== 'object' || Array.isArray(loraValue)) {
        errors.push(`'${name}' must contain a LoRA strength and optional selection.`);
      } else {
        const candidate = loraValue as Record<string, unknown>;
        if (typeof candidate.strength !== 'number' || !Number.isFinite(candidate.strength)) errors.push(`'${name}' strength must be a finite number.`);
        if (candidate.bypassed !== undefined && typeof candidate.bypassed !== 'boolean') errors.push(`'${name}' bypass flag must be boolean.`);
        if (candidate.lora_name !== undefined) {
          const options = control.constraints?.availableLoras || [];
          if (typeof candidate.lora_name !== 'string' || options.length === 0 || !options.includes(candidate.lora_name)) {
            errors.push(`'${name}' LoRA choice is not in the verified backend list.`);
          }
        }
        if (typeof candidate.strength === 'number') {
          if (typeof control.constraints?.min === 'number' && candidate.strength < control.constraints.min) errors.push(`'${name}' strength is below its exposed minimum.`);
          if (typeof control.constraints?.max === 'number' && candidate.strength > control.constraints.max) errors.push(`'${name}' strength is above its exposed maximum.`);
        }
      }
      continue;
    }
    if (control.type === 'integer' || control.type === 'seed') {
      if (typeof value !== 'number' || !Number.isInteger(value)) errors.push(`'${name}' must be an integer.`);
    } else if (control.type === 'float') {
      if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(`'${name}' must be a finite number.`);
    } else if (control.type === 'boolean') {
      if (typeof value !== 'boolean') errors.push(`'${name}' must be a boolean.`);
    } else if (control.type === 'enum') {
      const options = control.constraints?.options || [];
      if (!options.some(option => Object.is(option, value))) errors.push(`'${name}' is not one of the verified choices.`);
    } else if (control.type === 'prompt' || control.type === 'string') {
      if (typeof value !== 'string') errors.push(`'${name}' must be text.`);
    }
    if (typeof value === 'number') {
      if (typeof control.constraints?.min === 'number' && value < control.constraints.min) errors.push(`'${name}' is below its exposed minimum.`);
      if (typeof control.constraints?.max === 'number' && value > control.constraints.max) errors.push(`'${name}' is above its exposed maximum.`);
      if (typeof control.constraints?.step === 'number' && control.constraints.step > 0) {
        const base = typeof control.constraints.min === 'number' ? control.constraints.min : 0;
        const steps = (value - base) / control.constraints.step;
        if (Math.abs(steps - Math.round(steps)) > 1e-8) errors.push(`'${name}' does not match its exposed step.`);
      }
    }
  }
  return errors;
}
