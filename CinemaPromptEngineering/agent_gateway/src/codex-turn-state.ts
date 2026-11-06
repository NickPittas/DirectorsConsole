import type { CodexNotification } from "./codex-events.js";
import type { AgentSurface, PiStreamEvent } from "./contracts.js";

type AgentItem = { streamed: string; completed: boolean; phase?: string | null; text?: string };
type ToolCall = { tool: string; ended: boolean; isError?: boolean };

const byteLength = (text: string): number => Buffer.byteLength(text, "utf8");

export function createCodexTurnState({
  turnId,
  surface,
  toolNames,
}: {
  turnId: string;
  surface: AgentSurface;
  toolNames: readonly string[];
}): { accept(event: CodexNotification): PiStreamEvent[]; isSettled(): boolean } {
  if (typeof turnId !== "string" || turnId.trim().length === 0 || turnId.length > 128 || turnId.includes("\0")) {
    throw new Error("invalid Codex turn");
  }

  const streamsText = surface === "workspace" || surface === "console";
  const allowedTools = new Set(toolNames);
  const items = new Map<string, AgentItem>();
  const completionOrder: string[] = [];
  const calls = new Map<string, ToolCall>();
  let settled = false;
  let outputBytes = 0;
  let lastTextItem: string | undefined;

  const fail = (message = "incomplete or invalid Codex turn"): never => {
    settled = true;
    throw new Error(message);
  };
  const agentItem = (id: string): AgentItem => {
    let item = items.get(id);
    if (!item) {
      if (items.size >= 64) fail();
      item = { streamed: "", completed: false };
      items.set(id, item);
    }
    return item;
  };
  const charge = (text: string): void => {
    outputBytes += byteLength(text);
    if (outputBytes > 65536) fail();
  };
  const emitItemText = (id: string, text: string): PiStreamEvent[] => {
    if (!text) return [];
    const separator = lastTextItem !== undefined && lastTextItem !== id ? "\n\n" : "";
    charge(separator + text);
    lastTextItem = id;
    return [{ type: "text_delta", delta: separator + text }];
  };

  return {
    isSettled: () => settled,
    accept(event) {
      if (settled || event.turnId !== turnId) return [];

      switch (event.type) {
        case "text_delta": {
          const item = agentItem(event.itemId);
          if (item.completed) return fail();
          if (!streamsText) return [];
          item.streamed += event.delta;
          return emitItemText(event.itemId, event.delta);
        }
        case "agent_message": {
          const item = agentItem(event.itemId);
          if (item.completed) {
            if (item.phase === event.phase && item.text === event.text) return [];
            return fail();
          }
          const output = streamsText ? (() => {
            if (!event.text.startsWith(item.streamed)) return fail();
            return emitItemText(event.itemId, event.text.slice(item.streamed.length));
          })() : [];
          item.completed = true;
          item.phase = event.phase;
          item.text = event.text;
          completionOrder.push(event.itemId);
          return output;
        }
        case "reasoning_summary_delta":
          if (!event.delta) return [];
          charge(event.delta);
          return [{ type: "agent_activity", activityType: "thinking_delta", delta: event.delta }];
        case "tool_start":
        case "tool_end": {
          if (!streamsText || event.namespace !== null || !allowedTools.has(event.tool)) return fail();
          if (!event.callId || event.callId.length > 128 || event.callId.includes("\0")) return fail();
          let call = calls.get(event.callId);
          if (event.type === "tool_start") {
            if (!call) {
              if (calls.size >= 256) return fail();
              call = { tool: event.tool, ended: false };
              calls.set(event.callId, call);
              return [{ type: "agent_activity", activityType: "tool_start", toolCallId: event.callId, toolName: event.tool }];
            }
            if (call.tool !== event.tool) return fail();
            return [];
          }
          if (!call || call.tool !== event.tool) return fail();
          const isError = event.isError ?? false;
          if (call.ended) {
            if (call.isError !== isError) return fail();
            return [];
          }
          call.ended = true;
          call.isError = isError;
          return [{ type: "agent_activity", activityType: "tool_end", toolCallId: event.callId, toolName: event.tool, isError }];
        }
        case "builtin_item":
          return fail("unsupported Codex builtin item");
        case "turn_settled": {
          if (event.status === "failed" || (event.hasError && event.status !== "interrupted")) {
            return fail("Codex provider turn failed");
          }
          if (event.status === "interrupted") {
            settled = true;
            return [{ type: "turn_settled", aborted: true }];
          }
          for (const call of calls.values()) if (!call.ended) return fail();
          for (const item of items.values()) if (!item.completed) return fail();
          const output: PiStreamEvent[] = [];
          if (!streamsText) {
            let finalId: string | undefined;
            let nullPhaseCount = 0;
            let onlyNullId: string | undefined;
            for (const id of completionOrder) {
              const item = items.get(id)!;
              if (item.phase === "final_answer") finalId = id;
              if (item.phase === null) {
                nullPhaseCount++;
                onlyNullId = id;
              }
            }
            finalId ??= nullPhaseCount === 1 ? onlyNullId : undefined;
            const finalText = finalId === undefined ? "" : items.get(finalId)!.text ?? "";
            if (!finalText.trim()) return fail();
            charge(finalText);
            output.push({ type: "text_delta", delta: finalText });
          }
          settled = true;
          output.push({ type: "turn_settled", aborted: false });
          return output;
        }
      }
    },
  };
}
