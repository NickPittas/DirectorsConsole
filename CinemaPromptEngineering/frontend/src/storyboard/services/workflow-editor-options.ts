import type { ComfyUIWorkflow, ComfyUINode, QwenWorkflowFormat } from './workflow-parser';

export interface InputBinding {
  node_id: string;
  input_name: string;
}

/** One canonical, collision-safe identity for a workflow input. */
export function bindingKey(binding: InputBinding): string {
  return `${String(binding.node_id)}\u0000${binding.input_name}`;
}

export interface NamedInputBinding extends InputBinding {
  name: string;
}

/** Migrate renamed controls by binding, preferring an already-edited new key. */
export function reconcileParameterValues(
  values: Record<string, unknown>,
  previousConfigs: readonly NamedInputBinding[],
  nextConfigs: readonly NamedInputBinding[],
): Record<string, unknown> {
  const previousByBinding = new Map(previousConfigs.map(config => [bindingKey(config), config]));
  const currentNames = new Set(nextConfigs.map(config => config.name));
  const reconciled = { ...values };

  for (const config of nextConfigs) {
    const previous = previousByBinding.get(bindingKey(config));
    const aliases = [config.name, previous?.name, `${config.input_name}_${config.node_id}`]
      .filter((name): name is string => Boolean(name));
    const source = aliases.find(name => Object.prototype.hasOwnProperty.call(values, name));
    if (source && source !== config.name) reconciled[config.name] = values[source];
    for (const alias of aliases) {
      if (alias !== config.name && !currentNames.has(alias)) delete reconciled[alias];
    }
  }

  return reconciled;
}

export function isLinkReference(value: unknown, knownNodeIds: Set<string>): value is [string, number] {
  return Array.isArray(value) && value.length === 2 &&
    typeof value[0] === 'string' && knownNodeIds.has(value[0]) &&
    typeof value[1] === 'number' && Number.isInteger(value[1]);
}

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

/** Read an input from API format, plus the one proven graph widget mapping. */
export function getWorkflowNodeInput(node: ComfyUINode | null, inputName: string): unknown {
  if (!node) return undefined;
  if (node.inputs && Object.prototype.hasOwnProperty.call(node.inputs, inputName)) return node.inputs[inputName];
  if (getWorkflowNodeClassType(node) === 'CheckpointLoaderSimple' && inputName === 'ckpt_name') {
    return node.widgets_values?.[0];
  }
  return undefined;
}

export function hasWorkflowBinding(
  workflow: ComfyUIWorkflow | QwenWorkflowFormat | null,
  binding: InputBinding,
): boolean {
  const node = findWorkflowNode(workflow, binding.node_id);
  return Boolean(node && getWorkflowNodeInput(node, binding.input_name) !== undefined);
}

export interface EnumConfigState {
  type: string;
  node_id: string;
  input_name: string;
  default: unknown;
  user_modified?: boolean;
  constraints?: { options?: unknown[]; [key: string]: unknown };
}

/** Merge live options without coercing typed enum values or user edits. */
export function resolveEnumConfig(
  workflow: ComfyUIWorkflow | QwenWorkflowFormat | null,
  config: EnumConfigState,
  liveOptions: unknown[] = [],
): EnumConfigState {
  const node = findWorkflowNode(workflow, config.node_id);
  const importedValue = getWorkflowNodeInput(node, config.input_name);
  const hasImportedValue = importedValue !== undefined && importedValue !== null && importedValue !== '';
  const currentValue = config.default;
  const edited = Boolean(config.user_modified) || (hasImportedValue && !Object.is(currentValue, importedValue));
  const selectedValue = edited ? currentValue : importedValue ?? currentValue;
  const options: unknown[] = [];
  const add = (value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    if (!options.some(option => Object.is(option, value))) options.push(value);
  };
  add(importedValue);
  add(selectedValue);
  liveOptions.forEach(add);
  return {
    ...config,
    type: 'enum',
    default: selectedValue,
    constraints: { ...config.constraints, options },
  };
}
