const API_METADATA_FIELDS = new Set(["meta", "version", "extra", "definitions"]);
const UI_ONLY_TYPES = new Set([
  "Note", "MarkdownNote", "PrimitiveNode", "GetNode", "SetNode", "Reroute", "LoadImageOutput",
]);
const UUID_CLASS = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidClassName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function collectRecipeNodeClasses(
  workflow: Record<string, unknown>,
): { ok: true; nodeClasses: string[] } | { ok: false; reason: string } {
  if (!isRecord(workflow)) return { ok: false, reason: "workflow must be an object" };

  const classNames: string[] = [];
  const definitionIds = new Set<string>();
  let nodeCount = 0;

  const visitUiGraph = (graph: Record<string, unknown>, depth: number): string | undefined => {
    if (!Array.isArray(graph.nodes)) return "nodes must be an array";
    for (const [index, node] of graph.nodes.entries()) {
      if (++nodeCount > 10_000) return "node limit exceeded";
      if (!isRecord(node) || !isValidClassName(node.type)) return `invalid UI node class at index ${index}`;
      classNames.push(node.type);
    }

    if (!hasOwn(graph, "definitions")) return undefined;
    const definitions = graph.definitions;
    if (!isRecord(definitions) || !Array.isArray(definitions.subgraphs)) {
      return "definitions.subgraphs must be an array";
    }
    if (depth >= 8 && definitions.subgraphs.length > 0) return "definition depth limit exceeded";
    for (const definition of definitions.subgraphs) {
      if (!isRecord(definition) || typeof definition.id !== "string" || !definition.id.trim() || !Array.isArray(definition.nodes)) {
        return "invalid subgraph definition";
      }
      definitionIds.add(definition.id);
      const reason = visitUiGraph(definition, depth + 1);
      if (reason) return reason;
    }
    return undefined;
  };

  if (hasOwn(workflow, "nodes")) {
    const reason = visitUiGraph(workflow, 0);
    if (reason) return { ok: false, reason };
  } else {
    for (const [nodeId, node] of Object.entries(workflow)) {
      if (API_METADATA_FIELDS.has(nodeId)) continue;
      if (++nodeCount > 10_000) return { ok: false, reason: "node limit exceeded" };
      if (!isRecord(node) || !isValidClassName(node.class_type)) {
        return { ok: false, reason: `invalid API node class for ${nodeId}` };
      }
      classNames.push(node.class_type);
    }
  }

  const nodeClasses = new Set<string>();
  for (const name of classNames) {
    if (UI_ONLY_TYPES.has(name) || (UUID_CLASS.test(name) && definitionIds.has(name))) continue;
    nodeClasses.add(name);
    if (nodeClasses.size > 1_000) return { ok: false, reason: "class limit exceeded" };
  }
  if (nodeClasses.size === 0) return { ok: false, reason: "no backend node classes found" };
  return { ok: true, nodeClasses: [...nodeClasses].sort() };
}
