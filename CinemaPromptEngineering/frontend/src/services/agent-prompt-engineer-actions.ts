import {
  api,
  type PreparedPromptEnhancement,
  type PromptEnhancementInput,
} from '@/api/client';
import {
  getAgentSurfaceContext,
  type PromptEngineerSurfaceContext,
} from '@/services/agent-conversations';
import type { AnimationConfig, LiveActionConfig } from '@/types';

export type PromptEngineerAgentRequest =
  | { operation: 'snapshot' }
  | { operation: 'constraints' }
  | { operation: 'prepare'; userPrompt: string; targetModel?: string }
  | { operation: 'validate_apply'; preparationId: string; prompt: string; apply: boolean };

type ConstraintSnapshot = ReturnType<NonNullable<PromptEngineerSurfaceContext['getConstraintSnapshot']>>;
type Preparation = { input: PromptEnhancementInput; prepared: PreparedPromptEnhancement; revision: string };
const preparations = new Map<string, Preparation>();

function currentContext(): PromptEngineerSurfaceContext | null {
  return getAgentSurfaceContext('prompt-engineer');
}

function assertRevision(revision: string): PromptEngineerSurfaceContext {
  const context = currentContext();
  if (!context || context.getRevision() !== revision) throw new Error('Prompt Engineer context changed; prepare again with the current constraints.');
  return context;
}

function copySnapshot(snapshot: ConstraintSnapshot): ConstraintSnapshot {
  return { ...snapshot, config: JSON.parse(JSON.stringify(snapshot.config)) as PromptEnhancementInput['config'] };
}

export async function dispatchPromptEngineerAgentAction(request: PromptEngineerAgentRequest, isCurrent: () => boolean = () => true): Promise<unknown> {
  const assertCurrent = () => {
    if (!isCurrent()) throw new Error('The initiating agent action ended; the prompt was not applied.');
  };
  assertCurrent();
  if (request.operation === 'snapshot') {
    const snapshot = currentContext()?.getConstraintSnapshot?.();
    return snapshot ? { status: 'available', snapshot: copySnapshot(snapshot) } : { status: 'unavailable' };
  }

  if (request.operation === 'constraints') {
    const snapshot = currentContext()?.getConstraintSnapshot?.();
    if (!snapshot) return { status: 'unavailable' };
    const constraints = copySnapshot(snapshot);
    assertRevision(snapshot.revision);
    const generated = constraints.projectType === 'live_action'
      ? await api.generateLiveActionPrompt(constraints.config as LiveActionConfig, 'generic', constraints.presetId)
      : await api.generateAnimationPrompt(constraints.config as AnimationConfig, 'generic', constraints.presetId);
    assertCurrent();
    assertRevision(snapshot.revision);
    if (generated.validation.status !== 'valid' && generated.validation.status !== 'warning') {
      throw new Error('Prompt Engineer constraints did not pass cinematic validation.');
    }
    return {
      status: 'available', constraintRevision: snapshot.revision,
      projectType: constraints.projectType, presetId: constraints.presetId ?? null,
      presetName: constraints.presetName ?? null, prompt: generated.prompt,
      negativePrompt: generated.negative_prompt ?? '', validation: generated.validation,
      presetContext: generated.preset_context ?? null, styleContext: generated.style_context ?? null,
    };
  }

  if (request.operation === 'prepare') {
    const context = currentContext();
    if (!context?.getConstraintSnapshot) throw new Error('Prompt Engineer constraints are unavailable.');
    if (!request.userPrompt.trim() || request.userPrompt.length > 20_000) throw new Error('userPrompt must be nonempty and no longer than 20000 characters.');
    const snapshot = copySnapshot(context.getConstraintSnapshot());
    const revision = snapshot.revision;
    assertRevision(revision);
    const targetModel = request.targetModel ?? snapshot.targetModel;
    if (!targetModel.trim()) throw new Error('No Prompt Engineer generation target is selected.');
    const sameTarget = targetModel === snapshot.targetModel;
    const input: PromptEnhancementInput = {
      userPrompt: request.userPrompt,
      targetModel,
      projectType: snapshot.projectType,
      config: snapshot.config,
      ...(snapshot.presetId ? { presetId: snapshot.presetId } : {}),
      ...(sameTarget && snapshot.skillModelVersion ? { skillModelVersion: snapshot.skillModelVersion } : {}),
      ...(sameTarget && snapshot.skillTask ? { skillTask: snapshot.skillTask } : {}),
      ...(sameTarget && snapshot.conditioningAdapter ? { conditioningAdapter: snapshot.conditioningAdapter } : {}),
    };
    const prepared = await api.preparePromptEnhancement(input);
    assertCurrent();
    assertRevision(revision);
    const preparationId = crypto.randomUUID();
    preparations.set(preparationId, { input, prepared, revision });
    if (preparations.size > 32) preparations.delete(preparations.keys().next().value!);
    return {
      status: 'prepared', preparationId, constraintRevision: revision,
      targetModel: prepared.canonical_target_model, systemPrompt: prepared.system_prompt,
      userPrompt: prepared.user_prompt, task: prepared.task, dialectId: prepared.dialect_id,
      enhancementContext: prepared.enhancement_context, promptSkill: prepared.prompt_skill,
    };
  }

  const preparation = preparations.get(request.preparationId);
  if (!preparation) throw new Error('Preparation not found or already consumed; prepare again.');
  try {
    assertRevision(preparation.revision);
    const { input, prepared, revision } = preparation;
    const validated = await api.validatePromptEnhancement({
      ...input,
      expectedTargetModel: prepared.canonical_target_model,
      expectedTask: prepared.task,
      expectedDialectId: prepared.dialect_id,
      expectedEnhancementContext: prepared.enhancement_context,
      expectedPromptSkillFingerprint: prepared.prompt_skill.fingerprint,
      enhancedPrompt: request.prompt,
      truncated: false,
    });
    assertCurrent();
    const context = assertRevision(revision);
    if (!validated.success) throw new Error(validated.error || 'The prompt did not pass cinematic validation.');
    const applied = request.apply;
    if (applied && !context.applyValidatedPrompt(validated.enhanced_prompt, revision)) {
      throw new Error('Prompt Engineer context changed before the validated prompt could be applied.');
    }
    return {
      status: applied ? 'applied' : 'validated', applied,
      targetModel: prepared.canonical_target_model, prompt: validated.enhanced_prompt,
      warnings: validated.warnings ?? [],
    };
  } finally {
    preparations.delete(request.preparationId);
  }
}
