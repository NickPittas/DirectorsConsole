export type CodexNotification =
  | { type: "text_delta"; turnId: string; itemId: string; delta: string }
  | { type: "reasoning_summary_delta"; turnId: string; itemId: string; delta: string }
  | { type: "agent_message"; turnId: string; itemId: string; phase: string | null; text: string }
  | { type: "tool_start" | "tool_end"; turnId: string; callId: string; tool: string; namespace: string | null; isError?: boolean }
  | { type: "turn_settled"; turnId: string; status: "completed" | "interrupted" | "failed"; hasError: boolean }
  | { type: "builtin_item"; turnId: string; itemId: string; itemType: string };

type Obj = Record<string, unknown>;
const invalid = (): never => { throw new Error("invalid notification"); };

function object(value: unknown): Obj {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Obj : invalid();
}

function id(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128 && !value.includes("\0") ? value : invalid();
}

function boundedString(value: unknown, max: number): string {
  return typeof value === "string" && value.length <= max ? value : invalid();
}

function nullableString(value: unknown, max: number): string | null {
  return value === null ? null : boundedString(value, max);
}

function text(value: unknown): string {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") <= 65536 ? value : invalid();
}

function belongs(params: Obj, expectedThreadId: string): boolean {
  return id(params.threadId) === expectedThreadId;
}

function decodeItem(method: "item/started" | "item/completed", params: Obj, expectedThreadId: string): CodexNotification | null {
  if (!belongs(params, expectedThreadId)) return null;
  const turnId = id(params.turnId);
  const item = object(params.item);
  const itemId = id(item.id);
  const itemType = boundedString(item.type, 128);
  if (!itemType) invalid();
  if (itemType === "userMessage" || itemType === "reasoning" || itemType === "plan" || (itemType === "agentMessage" && method === "item/started")) return null;
  if (itemType === "agentMessage") {
    return { type: "agent_message", turnId, itemId, phase: nullableString(item.phase, 64), text: text(item.text) };
  }
  if (itemType === "dynamicToolCall") {
    const tool = id(item.tool);
    const namespace = item.namespace === null ? null : id(item.namespace);
    const status = item.status;
    if (status !== "inProgress" && status !== "completed" && status !== "failed") invalid();
    if (method === "item/started") return { type: "tool_start", turnId, callId: itemId, tool, namespace };
    if (status === "inProgress") invalid();
    const success = item.success;
    if (!Object.hasOwn(item, "success") || (success !== null && typeof success !== "boolean")) invalid();
    return { type: "tool_end", turnId, callId: itemId, tool, namespace, isError: status === "failed" || success !== true };
  }
  return { type: "builtin_item", turnId, itemId, itemType };
}

export function decodeCodexNotification(method: string, params: unknown, expectedThreadId: string): CodexNotification | null {
  switch (method) {
    case "item/agentMessage/delta":
    case "item/reasoning/summaryTextDelta": {
      const value = object(params);
      if (!belongs(value, expectedThreadId)) return null;
      const turnId = id(value.turnId);
      const itemId = id(value.itemId);
      const delta = text(value.delta);
      if (method === "item/agentMessage/delta") return { type: "text_delta", turnId, itemId, delta };
      if (Object.hasOwn(value, "summaryIndex") && (!Number.isInteger(value.summaryIndex) || (value.summaryIndex as number) < 0)) invalid();
      return { type: "reasoning_summary_delta", turnId, itemId, delta };
    }
    case "item/started":
    case "item/completed":
      return decodeItem(method, object(params), expectedThreadId);
    case "turn/completed": {
      const value = object(params);
      if (!belongs(value, expectedThreadId)) return null;
      const turn = object(value.turn);
      const turnId = id(turn.id);
      const status = turn.status;
      if (status !== "completed" && status !== "interrupted" && status !== "failed") invalid();
      if (!Object.hasOwn(turn, "error") || turn.error === undefined) invalid();
      return { type: "turn_settled", turnId, status: status as "completed" | "interrupted" | "failed", hasError: turn.error !== null };
    }
    default:
      return null;
  }
}
