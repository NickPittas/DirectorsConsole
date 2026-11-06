import type { Panel } from '../StoryboardUI';
import type { ProjectSettings } from './project-manager';

type ProjectStateFingerprintInput = {
  panels: readonly Panel[];
  parameters: Record<string, unknown>;
  selectedWorkflowId: string | null;
  settings: ProjectSettings;
  cameraAngles: Record<string, unknown>;
  comfyUrl: string;
  renderNodes: readonly { id: string; name: string; url: string; priority: number }[];
  enhancementPreferences?: unknown;
  deletedImages?: readonly string[];
  globalPromptOverride?: string;
  useGlobalPrompt?: boolean;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function projectStateFingerprint(input: ProjectStateFingerprintInput): string {
  const panels = input.panels.map((panel) => {
    const state = panel as Panel & { prompt?: unknown; seed?: unknown };
    return {
      id: state.id,
      name: state.name,
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
      notes: state.notes,
      workflowId: state.workflowId,
      parameterValues: state.parameterValues,
      enhancementPreferences: state.enhancementPreferences,
      nodeId: state.nodeId,
      prompt: state.prompt,
      seed: state.seed,
      locked: state.locked,
      imageHistory: state.imageHistory.map(({ url, metadata }) => ({
        url,
        savedPath: metadata.savedPath,
        rating: metadata.rating,
      })),
    };
  });
  const settings = Object.fromEntries(
    Object.entries(input.settings).filter(([key]) => !['created', 'lastModified', 'projectFilePath'].includes(key)),
  );
  return JSON.stringify(canonicalize({
    panels,
    parameters: input.parameters,
    selectedWorkflowId: input.selectedWorkflowId,
    settings,
    cameraAngles: input.cameraAngles,
    comfyUrl: input.comfyUrl,
    enhancementPreferences: input.enhancementPreferences,
    deletedImages: input.deletedImages,
    globalPromptOverride: input.globalPromptOverride,
    useGlobalPrompt: input.useGlobalPrompt,
    renderNodes: input.renderNodes.map(({ id, name, url, priority }) => ({ id, name, url, priority })),
  }));
}
