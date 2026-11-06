import type { AgentToolResult, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Check } from "typebox/value";
import { createConsoleApplicationTools, type ConsoleToolScope } from "./console-tools.js";

const MAX_ARGUMENT_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_BYTES = 192 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const CALL_KEYS = ["threadId", "turnId", "callId", "namespace", "tool", "arguments"];
const REJECTED = "The application tool call was rejected before execution.";
const UNKNOWN = "The application action may have completed; inspect a fresh snapshot before deciding, and do not replay this call.";
const UNSUPPORTED_PREVIEW = "Visual preview is unsupported by this text-only model, so media inspection was not run.";

type CodexContentItem = { type: "inputText"; text: string } | { type: "inputImage"; imageUrl: string };
type InvocationResult = { contentItems: CodexContentItem[]; success: boolean };
type ActiveTurn = { threadId: string; turnId: string; signal: AbortSignal };
type CachedCall = { signature: string; promise: Promise<InvocationResult> };

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

function validId(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !value.includes("\0");
}

function jsonValue(value: unknown, ancestors = new Set<object>(), depth = 0, budget = { entries: 0 }): boolean {
  if (depth > 64 || ++budget.entries > 100_000) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  let valid = true;
  if (Array.isArray(value)) {
    valid = Object.getPrototypeOf(value) === Array.prototype && Reflect.ownKeys(value).length === value.length + 1;
    for (let index = 0; valid && index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      valid = Boolean(descriptor?.enumerable && "value" in descriptor && jsonValue(descriptor.value, ancestors, depth + 1, budget));
    }
  } else {
    valid = record(value) && Reflect.ownKeys(value).every(key => {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return Boolean(descriptor?.enumerable && "value" in descriptor && jsonValue(descriptor.value, ancestors, depth + 1, budget));
    });
  }
  ancestors.delete(value);
  return valid;
}

function failure(text: string): InvocationResult {
  return { contentItems: [{ type: "inputText", text }], success: false };
}

function output(result: AgentToolResult, acceptsImages: boolean): InvocationResult {
  if (!Array.isArray(result.content)) return failure(UNKNOWN);
  const contentItems: CodexContentItem[] = [];
  let imageBytes = 0;
  for (const item of result.content) {
    if (item?.type === "text" && typeof item.text === "string") {
      contentItems.push({ type: "inputText", text: item.text });
    } else if (item?.type === "image" && typeof item.data === "string"
      && ["image/jpeg", "image/png", "image/webp"].includes(item.mimeType)) {
      const bytes = Buffer.from(item.data, "base64");
      if (!item.data || item.data.length > 262_144 || bytes.toString("base64") !== item.data) return failure(UNKNOWN);
      imageBytes += bytes.length;
      if (imageBytes > MAX_IMAGE_BYTES || !acceptsImages) return failure(UNKNOWN);
      contentItems.push({ type: "inputImage", imageUrl: `data:${item.mimeType};base64,${item.data}` });
    } else return failure(UNKNOWN);
  }
  if (Buffer.byteLength(JSON.stringify(contentItems), "utf8") > MAX_OUTPUT_BYTES) return failure(UNKNOWN);
  return { contentItems, success: result.isError !== true };
}

export function createCodexApplicationTools(scope: ConsoleToolScope, acceptsImages: boolean): {
  definitions: readonly { type: "function"; name: string; description: string; inputSchema: unknown }[];
  invoke(params: unknown, active: ActiveTurn): Promise<InvocationResult>;
} {
  const registered = new Map<string, ToolDefinition>();
  const definitions: { type: "function"; name: string; description: string; inputSchema: unknown }[] = [];
  for (const tool of createConsoleApplicationTools(scope)) {
    if (registered.has(tool.name)) throw new Error("Duplicate application tool name.");
    registered.set(tool.name, tool);
    try {
      definitions.push({ type: "function", name: tool.name, description: tool.description, inputSchema: JSON.parse(JSON.stringify(tool.parameters)) });
    } catch {
      throw new Error("Application tool registration is invalid.");
    }
  }

  let cachedTurn = "";
  let calls = new Map<string, CachedCall>();
  return {
    definitions,
    invoke(params, active) {
      if (!validId(active?.threadId, 128) || !validId(active?.turnId, 128) || !active.signal || active.signal.aborted) return Promise.resolve(failure(REJECTED));
      if (!record(params) || !exactKeys(params, CALL_KEYS)
        || !validId(params.threadId, 128) || !validId(params.turnId, 128) || !validId(params.callId, 256)
        || params.threadId !== active.threadId || params.turnId !== active.turnId) return Promise.resolve(failure(REJECTED));
      const callId = params.callId;
      const toolName = params.tool;
      const argumentsValue = params.arguments;
      const turnKey = `${active.threadId}\0${active.turnId}`;
      if (turnKey !== cachedTurn) {
        cachedTurn = turnKey;
        calls = new Map();
      }
      if (active.signal.aborted || params.namespace !== null || typeof toolName !== "string" || !record(argumentsValue)) {
        return Promise.resolve(failure(REJECTED));
      }
      const tool = registered.get(toolName);
      if (!tool || !jsonValue(argumentsValue)) return Promise.resolve(failure(REJECTED));
      let argsJson: string;
      try {
        argsJson = JSON.stringify(argumentsValue);
        if (typeof argsJson !== "string") return Promise.resolve(failure(REJECTED));
        if (Buffer.byteLength(argsJson, "utf8") > MAX_ARGUMENT_BYTES) return Promise.resolve(failure(REJECTED));
      } catch {
        return Promise.resolve(failure(REJECTED));
      }
      const args: Record<string, unknown> = JSON.parse(argsJson);
      try {
        if (!Check(tool.parameters, args)) return Promise.resolve(failure(REJECTED));
      } catch {
        return Promise.resolve(failure(REJECTED));
      }
      const signature = `${tool.name}\0${argsJson}`;
      const prior = calls.get(callId);
      if (prior) return prior.signature === signature ? prior.promise : Promise.resolve(failure(REJECTED));
      if (calls.size >= 256) return Promise.resolve(failure(REJECTED));

      // These host tools consume only the first three Pi execute arguments; Codex has no Pi SDK context.
      const execute = tool.execute as unknown as (callId: string, args: unknown, signal: AbortSignal) => Promise<AgentToolResult>;
      const promise = Promise.resolve().then(async () => {
        if (active.signal.aborted) return failure(REJECTED);
        if (tool.name === "inspect_media" && !acceptsImages) return failure(UNSUPPORTED_PREVIEW);
        try {
          const result = await execute(callId, args, active.signal);
          return active.signal.aborted ? failure(UNKNOWN) : output(result, acceptsImages);
        } catch {
          return failure(UNKNOWN);
        }
      });
      calls.set(callId, { signature, promise });
      return promise;
    },
  };
}
