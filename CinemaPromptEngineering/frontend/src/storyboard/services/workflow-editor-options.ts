import type { ComfyUIWorkflow, ComfyUINode, QwenWorkflowFormat } from './workflow-parser';

/** Find the source node without converting or mutating the imported workflow. */
export function findWorkflowNode(
  workflow: ComfyUIWorkflow | QwenWorkflowFormat | null,
  nodeId: string,
): ComfyUINode | null {
  if (!workflow) return null;
  if (Array.isArray((workflow as QwenWorkflowFormat).nodes)) {
    const node = (workflow as QwenWorkflowFormat).nodes?.find(
      candidate => String(candidate.id) === String(nodeId),
    );
    return node ?? null;
  }
  const node = (workflow as ComfyUIWorkflow)[String(nodeId)];
  return node && typeof node === 'object' && !('meta' in node) ? node as ComfyUINode : null;
}

export function getWorkflowNodeClassType(node: ComfyUINode | null): string {
  return node?.class_type || node?.type || '';
}

export function listWorkflowNodes(
  workflow: ComfyUIWorkflow | QwenWorkflowFormat | null,
): Array<[string, ComfyUINode]> {
  if (!workflow) return [];
  if (Array.isArray((workflow as QwenWorkflowFormat).nodes)) {
    return ((workflow as QwenWorkflowFormat).nodes || []).map(node => [String(node.id), node]);
  }
  return Object.entries(workflow)
    .filter(([nodeId, node]) => nodeId !== 'meta' && nodeId !== 'version' && typeof node === 'object' && node !== null)
    .map(([nodeId, node]) => [nodeId, node as ComfyUINode]);
}

/** Read an input from either API format or the graph widget used by CheckpointLoaderSimple. */
export function getWorkflowNodeInput(
  node: ComfyUINode | null,
  inputName: string,
): unknown {
  if (!node) return undefined;
  if (node.inputs && Object.prototype.hasOwnProperty.call(node.inputs, inputName)) {
    return node.inputs[inputName];
  }
  if (getWorkflowNodeClassType(node) === 'CheckpointLoaderSimple' && inputName === 'ckpt_name') {
    return node.widgets_values?.[0];
  }
  return undefined;
}

export interface EnumConfigState {
  type: string;
  node_id: string;
  input_name: string;
  default: unknown;
  user_modified?: boolean;
  constraints?: { options?: string[]; [key: string]: unknown };
}

/**
 * Merge live options for an editor config while preserving imported and edited values.
 * The imported value is the offline default unless the user has already edited it.
 */
export function resolveEnumConfig(
  workflow: ComfyUIWorkflow | QwenWorkflowFormat | null,
  config: EnumConfigState,
  liveOptions: string[] = [],
): EnumConfigState {
  const node = findWorkflowNode(workflow, config.node_id);
  const importedValue = getWorkflowNodeInput(node, config.input_name);
  const hasImportedValue = importedValue !== undefined && importedValue !== null && importedValue !== '';
  const currentValue = config.default;
  const edited = Boolean(config.user_modified) || (
    hasImportedValue && currentValue !== importedValue
  );
  const selectedValue = edited ? currentValue : importedValue ?? currentValue;
  const options = [...new Set([
    ...(hasImportedValue ? [String(importedValue)] : []),
    ...(selectedValue !== undefined && selectedValue !== null && selectedValue !== '' ? [String(selectedValue)] : []),
    ...liveOptions,
  ])];

  return {
    ...config,
    type: 'enum',
    default: selectedValue,
    constraints: { ...config.constraints, options },
  };
}
