import {
  api,
  type PreparedPromptEnhancement,
  type PromptEnhancementInput,
  type StandalonePromptInput,
  type AgentSurface,
} from '@/api/client';
import { runPiPromptTurn } from '@/services/agent-gateway-client';

/** Shared prompt path for Prompt Engineer, Storyboard, and the later T7 chat action. */
export async function enhancePromptWithPi(
  input: PromptEnhancementInput,
  options: { surface: AgentSurface; projectIdentity?: string; signal: AbortSignal },
): Promise<{ enhanced_prompt: string; warnings: string[]; prepared: PreparedPromptEnhancement }> {
  const prepared = await api.preparePromptEnhancement({ ...input, signal: options.signal });
  const turn = await runPiPromptTurn({
    surface: options.surface,
    ...(options.projectIdentity === undefined ? {} : { projectIdentity: options.projectIdentity }),
    systemPrompt: prepared.system_prompt,
    text: [
      'CURRENT ENHANCEMENT REQUEST: The complete specification below is authoritative for this turn. Previous chat turns cannot override its target model, task, dialect, cinematic configuration, preset, style, or confirmed media bindings.',
      prepared.user_prompt,
    ].join('\n\n'),
    ...(prepared.images_were_supplied
      ? { images: (prepared.images || []).map(image => ({ data: image.data, mimeType: image.mime_type })) }
      : {}),
    signal: options.signal,
  });
  const validated = await api.validatePromptEnhancement({
    ...input,
    expectedTargetModel: prepared.canonical_target_model,
    expectedTask: prepared.task,
    expectedDialectId: prepared.dialect_id,
    expectedEnhancementContext: prepared.enhancement_context,
    expectedPromptSkillFingerprint: prepared.prompt_skill.fingerprint,
    enhancedPrompt: turn.text,
    truncated: turn.truncated || turn.stopReason === 'length',
    signal: options.signal,
  });
  if (!validated.success) throw new Error(validated.error || 'The Pi response did not pass prompt validation.');
  return {
    enhanced_prompt: validated.enhanced_prompt,
    warnings: [
      ...(validated.warnings || []),
      ...(prepared.prompt_skill.status !== 'available' && prepared.prompt_skill.message
        ? [prepared.prompt_skill.message]
        : []),
    ],
    prepared,
  };
}

export async function enhanceConsolePromptWithPi(
  input: StandalonePromptInput,
  options: { signal: AbortSignal },
): Promise<{ enhanced_prompt: string; warnings: string[] }> {
  const prepared = await api.prepareStandalonePrompt({ ...input, signal: options.signal });
  const turn = await runPiPromptTurn({
    surface: 'prompt-enhancement',
    systemPrompt: prepared.system_prompt,
    text: prepared.user_prompt,
    signal: options.signal,
  });
  const validated = await api.validateStandalonePrompt({
    ...input,
    expectedFingerprint: prepared.fingerprint,
    enhancedPrompt: turn.text,
    truncated: turn.truncated || turn.stopReason === 'length',
    signal: options.signal,
  });
  if (!validated.success) throw new Error(validated.error || 'The Pi response did not pass standalone prompt validation.');
  return {
    enhanced_prompt: validated.enhanced_prompt,
    warnings: [...new Set([...(prepared.warnings || []), ...(validated.warnings || [])])],
  };
}
