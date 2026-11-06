import { EventEmitter } from "node:events";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import type { createCodexApplicationTools } from "./codex-application-tools.js";
import { decodeCodexNotification } from "./codex-events.js";
import type { CodexRpc } from "./codex-rpc.js";
import type { buildCodexStartupPolicy } from "./codex-policy.js";
import { createCodexTurnState } from "./codex-turn-state.js";
import type { AgentSurface, PiStreamEvent } from "./contracts.js";

const UNKNOWN = "Codex turn outcome is unknown.";
const CANCELLED = "Codex turn was cancelled; outcome is unknown.";
const REJECTED = "Application tool request rejected.";
const TOOL_FAILED = "Application tool outcome is unknown; inspect a fresh snapshot before deciding, and do not replay this call.";
const MAX_BUFFER_ENTRIES = 256;
const MAX_BUFFER_BYTES = 12 * 1024 * 1024;
const TURN_TIMEOUT_MS = 20 * 60 * 1000;

type Input =
  | { type: "text"; text: string; text_elements: [] }
  | { type: "localImage"; path: string };
type Frame = { kind: "notification"; method: string; params: unknown } | { kind: "tool"; id: string | number; params: unknown };
type ToolResult = { contentItems: { type: "inputText"; text: string }[]; success: false };

export interface CodexTurnOptions {
  rpc: CodexRpc;
  events: EventEmitter;
  threadId: string;
  surface: AgentSurface;
  modelId: string;
  reasoningEffort: string;
  policy: ReturnType<typeof buildCodexStartupPolicy>;
  input: readonly Input[];
  toolNames: readonly string[];
  tools?: ReturnType<typeof createCodexApplicationTools>;
  onEvent: (event: PiStreamEvent) => void;
  signal?: AbortSignal;
}

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function id(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 128 && value.trim().length > 0 && !value.includes("\0");
}
function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length && expected.every(key => Object.hasOwn(value, key));
}
function validateInput(input: readonly Input[], cwd: string): void {
  if (!Array.isArray(input) || !isAbsolute(cwd) || resolve(cwd) !== cwd) throw new Error("Invalid Codex turn input.");
  let textBytes = 0;
  for (const item of input) {
    if (!record(item)) throw new Error("Invalid Codex turn input.");
    if (item.type === "text" && exactKeys(item, ["type", "text", "text_elements"])) {
      if (typeof item.text !== "string" || !Array.isArray(item.text_elements) || item.text_elements.length !== 0) throw new Error("Invalid Codex turn input.");
      textBytes += Buffer.byteLength(item.text, "utf8");
      if (textBytes > 65536) throw new Error("Invalid Codex turn input.");
    } else if (item.type === "localImage" && exactKeys(item, ["type", "path"])) {
      if (typeof item.path !== "string" || item.path.length > 2048 || !isAbsolute(item.path) || resolve(item.path) !== item.path ||
          !/^codex-media-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$/i.test(basename(item.path))) throw new Error("Invalid Codex turn input.");
      const within = relative(cwd, item.path);
      if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) throw new Error("Invalid Codex turn input.");
    } else throw new Error("Invalid Codex turn input.");
  }
  if (textBytes < 1 || input.filter(item => item.type === "localImage").length > 4) throw new Error("Invalid Codex turn input.");
}

export async function runCodexTurn(options: CodexTurnOptions): Promise<void> {
  const { rpc, events, threadId, surface, modelId, reasoningEffort, policy, input, toolNames, tools, onEvent, signal } = options;
  validateInput(input, policy.cwd);
  const internal = new AbortController();
  const buffered: Frame[] = [];
  const pendingTools = new Map<string, { id: string | number; replied: boolean; invoked: boolean }>();
  let bufferedBytes = 0, turnId: string | undefined, state: ReturnType<typeof createCodexTurnState> | undefined;
  let done = false, callbacksClosed = false, aborting = false, interruptSent = false;
  let hardTimer: NodeJS.Timeout | undefined, abortTimer: NodeJS.Timeout | undefined;
  let finishFatal!: (error: Error) => void, finishSuccess!: () => void;
  const fatal = new Promise<never>((_, reject) => { finishFatal = reject; });
  const settled = new Promise<void>(resolve => { finishSuccess = resolve; });
  void fatal.catch(() => undefined);

  const requestKey = (value: string | number) => `${typeof value}:${value}`;
  const failedTool = (message = REJECTED): ToolResult => ({ contentItems: [{ type: "inputText", text: message }], success: false });
  function respondOnce(pending: { id: string | number; replied: boolean }, result: unknown): void {
    if (pending.replied || callbacksClosed) return;
    pending.replied = true;
    pendingTools.delete(requestKey(pending.id));
    try { rpc.respond(pending.id, result); } catch { fail(UNKNOWN); }
  }
  function finishPending(): void {
    for (const pending of pendingTools.values()) respondOnce(pending, failedTool(pending.invoked ? TOOL_FAILED : REJECTED));
  }
  function fail(message = UNKNOWN): void {
    if (done) return;
    done = true;
    internal.abort();
    if (hardTimer) clearTimeout(hardTimer);
    if (abortTimer) clearTimeout(abortTimer);
    finishPending();
    if (turnId && !interruptSent) {
      interruptSent = true;
      try { void rpc.request("turn/interrupt", { threadId, turnId }).catch(() => undefined); } catch { /* RPC is already unavailable. */ }
    }
    let disposal: Promise<void>;
    try { disposal = rpc.dispose(); } catch { disposal = Promise.resolve(); }
    void disposal.catch(() => undefined).then(() => finishFatal(new Error(message)));
  }
  function succeed(): void {
    if (done) return;
    done = true;
    internal.abort();
    if (hardTimer) clearTimeout(hardTimer);
    if (abortTimer) clearTimeout(abortTimer);
    finishPending();
    finishSuccess();
  }
  function abortTurn(): void {
    if (done || aborting) return;
    aborting = true;
    internal.abort();
    if (!turnId) { fail(CANCELLED); return; }
    if (!interruptSent) {
      interruptSent = true;
      try { void rpc.request("turn/interrupt", { threadId, turnId }).catch(() => undefined); } catch { /* Settlement timeout handles RPC failure. */ }
    }
    abortTimer = setTimeout(() => fail(CANCELLED), 5000);
  }
  function toolRequest(requestId: string | number, params: unknown): void {
    if (callbacksClosed) return;
    const pending = { id: requestId, replied: false, invoked: false };
    const key = requestKey(requestId);
    if (pendingTools.has(key)) return;
    pendingTools.set(key, pending);
    if (done || aborting || !turnId || !state || state.isSettled()) { respondOnce(pending, failedTool()); return; }
    if (!record(params) || params.threadId !== threadId || params.turnId !== turnId ||
        !id(params.turnId) || typeof params.tool !== "string" || !toolNames.includes(params.tool) ||
        !tools || (surface !== "workspace" && surface !== "console")) {
      respondOnce(pending, failedTool());
      return;
    }
    const requestTurnId = params.turnId;
    void Promise.resolve().then(() => {
      if (internal.signal.aborted || rpc.stopSignal.aborted) return failedTool();
      pending.invoked = true;
      return tools.invoke(params, { threadId, turnId: requestTurnId, signal: internal.signal });
    })
      .then(result => respondOnce(pending, result), () => respondOnce(pending, {
        contentItems: [{ type: "inputText", text: TOOL_FAILED }], success: false,
      }));
  }
  function processNotification(method: string, params: unknown): void {
    if (!turnId || !state || done) return;
    const decoded = decodeCodexNotification(method, params, threadId);
    if (!decoded) return;
    const emitted = state.accept(decoded);
    for (const event of emitted) onEvent(event);
    if (!state.isSettled() || !emitted.some(event => event.type === "turn_settled")) return;
    const terminal = decoded.type === "turn_settled" && decoded.turnId === turnId ? decoded.status : undefined;
    if (aborting) {
      fail(terminal === "interrupted" ? "Codex turn was cancelled." : CANCELLED);
    } else if (terminal === "completed") succeed();
    else fail(UNKNOWN);
  }
  function enqueue(frame: Frame): void {
    let bytes: number;
    try {
      const json = JSON.stringify(frame);
      if (typeof json !== "string") throw new Error();
      bytes = Buffer.byteLength(json, "utf8") + (buffered.length === 0 ? 2 : 1);
    } catch { fail(UNKNOWN); return; }
    if (buffered.length >= MAX_BUFFER_ENTRIES || bytes > MAX_BUFFER_BYTES - bufferedBytes) { fail(UNKNOWN); return; }
    buffered.push(frame);
    bufferedBytes += bytes;
  }
  const notification = (method: string, params: unknown) => {
    if (done || !record(params) || params.threadId !== threadId) return;
    if (typeof method !== "string") { fail(UNKNOWN); return; }
    if (!turnId) enqueue({ kind: "notification", method, params });
    else {
      try { processNotification(method, params); } catch { fail(UNKNOWN); }
    }
  };
  const onToolRequest = (requestId: string | number, params: unknown) => {
    if (callbacksClosed) return;
    if (done || !record(params) || params.threadId !== threadId) {
      toolRequest(requestId, params);
      return;
    }
    if (!turnId) enqueue({ kind: "tool", id: requestId, params });
    else {
      try { toolRequest(requestId, params); } catch { fail(UNKNOWN); }
    }
  };
  const onAbort = () => abortTurn();
  const onTransportStop = () => fail(UNKNOWN);

  events.on("notification", notification);
  events.on("toolRequest", onToolRequest);
  signal?.addEventListener("abort", onAbort, { once: true });
  rpc.stopSignal.addEventListener("abort", onTransportStop, { once: true });
  hardTimer = setTimeout(() => fail(UNKNOWN), TURN_TIMEOUT_MS);
  void rpc.closed.then(() => fail(UNKNOWN), () => fail(UNKNOWN));
  try {
    if (signal?.aborted) abortTurn();
    if (rpc.stopSignal.aborted) fail(UNKNOWN);
    if (done) await fatal;
    const result = await Promise.race([rpc.request("turn/start", {
      threadId, input, cwd: policy.cwd, runtimeWorkspaceRoots: [], approvalPolicy: "never",
      permissions: policy.permissions, model: modelId, effort: reasoningEffort, environments: [],
    }), fatal]);
    if (!record(result) || !record(result.turn) || !id(result.turn.id) ||
        !["inProgress", "completed", "interrupted", "failed"].includes(String(result.turn.status))) throw new Error();
    turnId = result.turn.id;
    state = createCodexTurnState({ turnId, surface, toolNames });
    const frames = buffered.splice(0);
    bufferedBytes = 0;
    for (const frame of frames) {
      if (frame.kind === "notification") processNotification(frame.method, frame.params);
      else toolRequest(frame.id, frame.params);
    }
    await Promise.race([settled, fatal]);
  } catch {
    fail(aborting ? CANCELLED : UNKNOWN);
    await fatal;
  } finally {
    done = true;
    callbacksClosed = true;
    finishPending();
    if (hardTimer) clearTimeout(hardTimer);
    if (abortTimer) clearTimeout(abortTimer);
    signal?.removeEventListener("abort", onAbort);
    rpc.stopSignal.removeEventListener("abort", onTransportStop);
    events.off("notification", notification);
    events.off("toolRequest", onToolRequest);
  }
}
