import type { ParameterConfig } from '../components/WorkflowEditor';
import { getNodeInputSpec, normalizeInputDefinition, type ObjectInfo } from '../services/node-definitions';
import { getWorkflowParser, type ComfyUIWorkflow } from '../services/workflow-parser';
import { validateWorkflowControls } from './application-actions';

const IGNORED_KEYS = new Set(['meta', 'version', 'extra', 'definitions']);
const MAX_WORKFLOW_BYTES = 1024 * 1024;
const MAX_NODES = 4096;
const MAX_CONTROLS = 512;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJson<T>(value: T, label: string): T {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('value is not JSON serializable');
    return JSON.parse(serialized) as T;
  } catch (error) {
    throw new Error(`${label} must be JSON serializable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function prepareAgentWorkflowProposal(input: {
  workflow: Record<string, unknown>;
  config: ParameterConfig[];
  objectInfo: ObjectInfo;
  backendUrl: string;
}): {
  workflow: ComfyUIWorkflow;
  parsed: ReturnType<ReturnType<typeof getWorkflowParser>['parseWorkflow']>;
  config: ParameterConfig[];
  errors: string[];
} {
  if (!isPlainObject(input.workflow)) throw new Error('Workflow proposal must be a plain object.');
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(input.workflow);
  } catch (error) {
    throw new Error(`Workflow proposal must be JSON serializable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (serialized === undefined) throw new Error('Workflow proposal must be JSON serializable.');
  if (new TextEncoder().encode(serialized).byteLength > MAX_WORKFLOW_BYTES) {
    throw new Error('Workflow proposal exceeds the 1 MiB limit.');
  }
  const workflow = JSON.parse(serialized) as Record<string, unknown>;
  if (Array.isArray(workflow.nodes)) throw new Error('Workflow proposal must be a flat API graph; nodes arrays are unsupported.');
  const definitions = workflow.definitions;
  if (definitions != null && ((Array.isArray(definitions) && definitions.length > 0)
    || (isPlainObject(definitions) && Object.keys(definitions).length > 0)
    || (typeof definitions === 'string' && definitions.length > 0))) {
    throw new Error('Workflow proposal cannot contain nonempty subgraph definitions.');
  }

  const nodeEntries = Object.entries(workflow).filter(([id]) => !IGNORED_KEYS.has(id));
  if (nodeEntries.length === 0 || nodeEntries.length > MAX_NODES) {
    throw new Error(`Workflow proposal must contain between 1 and ${MAX_NODES} nodes.`);
  }
  if (!Array.isArray(input.config) || input.config.length > MAX_CONTROLS) {
    throw new Error(`Workflow proposal config must contain at most ${MAX_CONTROLS} controls.`);
  }
  const config = cloneJson(input.config, 'Workflow proposal config');
  const errors: string[] = [];
  let controlsValid = true;
  for (const [index, control] of config.entries()) {
    if (!isPlainObject(control) || ['name', 'node_id', 'input_name', 'type'].some(key =>
      typeof control[key] !== 'string' || control[key].trim().length === 0)) {
      errors.push(`Control ${index + 1} must include nonempty name, node_id, input_name, and type strings.`);
      controlsValid = false;
    }
  }

  const parserWorkflow = Object.create(null) as ComfyUIWorkflow;
  const nodeIds = new Set(nodeEntries.map(([id]) => id));
  const nodes = new Map<string, { node: Record<string, unknown>; definition?: ObjectInfo[string] }>();
  for (const [id, candidate] of nodeEntries) {
    if (!isPlainObject(candidate) || !isPlainObject(candidate.inputs)) {
      throw new Error(`Workflow node '${id}' must be a plain object with a plain inputs object.`);
    }
    const classType = candidate.class_type;
    if (typeof classType !== 'string' || classType.trim().length === 0 || classType.length > 256) {
      throw new Error(`Workflow node '${id}' must have a class_type string of 1 to 256 characters.`);
    }
    const definition = Object.prototype.hasOwnProperty.call(input.objectInfo, classType)
      ? input.objectInfo[classType]
      : undefined;
    if (!definition) errors.push(`Workflow node '${id}' uses unadvertised class '${classType}'.`);
    nodes.set(id, { node: candidate, definition });
    parserWorkflow[id] = candidate as unknown as ComfyUIWorkflow[string];
  }

  if (![...nodes.values()].some(({ definition }) => definition?.output_node === true)) {
    errors.push('Workflow must contain at least one advertised output node.');
  }
  for (const [id, { node, definition }] of nodes) {
    const inputs = node.inputs as Record<string, unknown>;
    const groups = definition?.input || definition?.inputs;
    if (groups) {
      for (const name of Object.keys(groups.required || {})) {
        if (!Object.prototype.hasOwnProperty.call(inputs, name)) errors.push(`Node '${id}' is missing required input '${name}'.`);
      }
      const knownInputs = new Set([...Object.keys(groups.required || {}), ...Object.keys(groups.optional || {})]);
      for (const [name, value] of Object.entries(inputs)) {
        if (!knownInputs.has(name)) errors.push(`Node '${id}' has unknown input '${name}'.`);
        const spec = getNodeInputSpec(definition, name);
        if (spec !== undefined && typeof value === 'string') {
          const schema = normalizeInputDefinition(spec);
          if (schema.isEnum && schema.options && !schema.options.some(option => Object.is(option, value))) {
            errors.push(`Node '${id}' input '${name}' is not an advertised choice.`);
          }
        }
        if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string'
          && Number.isInteger(value[1]) && (value[1] as number) >= 0) {
          const source = nodes.get(value[0]);
          if (!nodeIds.has(value[0])) errors.push(`Node '${id}' input '${name}' references missing node '${value[0]}'.`);
          else if (Array.isArray(source?.definition?.output) && (value[1] as number) >= source.definition.output.length) {
            errors.push(`Node '${id}' input '${name}' references an unavailable output slot on '${value[0]}'.`);
          }
        }
      }
    }
  }

  if (!controlsValid) {
    const parsed = getWorkflowParser().parseWorkflow(parserWorkflow, input.objectInfo);
    return { workflow: workflow as unknown as ComfyUIWorkflow, parsed, config, errors };
  }
  const checked = validateWorkflowControls(parserWorkflow, config, input.objectInfo, input.backendUrl);
  return {
    workflow: workflow as unknown as ComfyUIWorkflow,
    parsed: checked.parsed,
    config: checked.config,
    errors: [...new Set([...errors, ...checked.errors])],
  };
}
