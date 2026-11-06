import type { ObjectInfo } from '../services/node-definitions';

export function selectCachedWorkflowSchema(input: {
  backendId: string;
  workflowId: string;
  nodeClasses: readonly string[];
  cache: { definitions: ObjectInfo; capturedAt: string } | null;
}):
  | {
      ok: true;
      schema: {
        backendId: string;
        workflowId: string;
        source: 'selected-backend-saved';
        schemaScope: 'selected-workflow';
        capturedAt: string;
        objectInfo: Record<string, unknown>;
      };
    }
  | { ok: false; reason: string; missingNodeClasses?: string[] } {
  if (
    typeof input.backendId !== 'string' || input.backendId.length === 0 || input.backendId.length > 256 ||
    typeof input.workflowId !== 'string' || input.workflowId.length === 0 || input.workflowId.length > 256
  ) {
    return { ok: false, reason: 'Backend and workflow IDs must be nonempty and at most 256 characters.' };
  }

  if (!Array.isArray(input.nodeClasses) || input.nodeClasses.length === 0 || input.nodeClasses.length > 1000) {
    return { ok: false, reason: 'Node classes must contain between 1 and 1000 entries.' };
  }
  if (input.nodeClasses.some((name) => typeof name !== 'string' || name.length === 0 || name.length > 256)) {
    return { ok: false, reason: 'Node class names must be nonempty strings of at most 256 characters.' };
  }

  const cache = input.cache;
  if (!cache || typeof cache !== 'object' || typeof cache.capturedAt !== 'string') {
    return { ok: false, reason: 'No valid cached schema is available.' };
  }
  const capturedAtMs = Date.parse(cache.capturedAt);
  const now = Date.now();
  if (!Number.isFinite(capturedAtMs) || capturedAtMs > now || now - capturedAtMs >= 5 * 60 * 1000) {
    return { ok: false, reason: 'Cached schema timestamp is invalid, stale, or in the future.' };
  }

  const definitions = cache.definitions;
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) {
    return { ok: false, reason: 'Cached schema definitions are invalid.' };
  }

  try {
    const missingNodeClasses: string[] = [];
    const entries: [string, unknown][] = [];
    for (const nodeClass of new Set(input.nodeClasses)) {
      if (!Object.prototype.hasOwnProperty.call(definitions, nodeClass)) {
        missingNodeClasses.push(nodeClass);
        continue;
      }
      const definition = definitions[nodeClass];
      if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
        missingNodeClasses.push(nodeClass);
        continue;
      }
      entries.push([nodeClass, definition]);
    }
    if (missingNodeClasses.length > 0) {
      return { ok: false, reason: 'Cached schema is missing required node classes.', missingNodeClasses };
    }

    const result = {
      ok: true as const,
      schema: {
        backendId: input.backendId,
        workflowId: input.workflowId,
        source: 'selected-backend-saved' as const,
        schemaScope: 'selected-workflow' as const,
        capturedAt: cache.capturedAt,
        objectInfo: Object.fromEntries(entries),
      },
    };
    const serialized = JSON.stringify(result);
    if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).byteLength > 200 * 1024) {
      return { ok: false, reason: 'Selected schema could not be serialized or exceeds 200 KiB.' };
    }
    return result;
  } catch {
    return { ok: false, reason: 'Selected schema could not be serialized.' };
  }
}
