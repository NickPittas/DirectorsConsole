import { spawn, type ChildProcess } from "node:child_process";
import { isAbsolute } from "node:path";

const MAX_LINE = 12 * 1024 * 1024, MAX_CONFIG = 128, MAX_CONFIG_LENGTH = 4096;
const MAX_PENDING = 64, TIMEOUT_MS = 30_000;
const METHODS = new Set(["initialize", "account/read", "model/list", "config/read", "thread/start",
  "thread/resume", "thread/unsubscribe", "turn/start", "turn/interrupt", "account/login/start",
  "account/login/cancel"]);
const ENV_KEYS = ["PATH", "HOME", "USER", "LANG", "LC_ALL", "TMPDIR", "SYSTEMROOT"] as const;

export function codexProcessEnvironment(codexHome: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { CODEX_HOME: codexHome };
  for (const name of ENV_KEYS) if (process.env[name] !== undefined) env[name] = process.env[name];
  return env;
}

export interface CodexRpcOptions {
  executable: string;
  cwd: string;
  codexHome: string;
  config: readonly string[];
  onNotification: (method: string, params: unknown) => void;
  onToolRequest: (id: string | number, params: unknown) => void;
}
export interface CodexRpc {
  readonly closed: Promise<void>;
  readonly stopSignal: AbortSignal;
  request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown>;
  notify(method: string, params?: unknown): void;
  respond(id: string | number, result: unknown): void;
  dispose(): Promise<void>;
}

type RecordValue = Record<string, unknown>;
type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout;
  signal?: AbortSignal; abort?: () => void };

function isRecord(value: unknown): value is RecordValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function assertJson(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))) return;
  if (typeof value !== "object" || seen.has(value)) throw new TypeError();
  seen.add(value);
  if (Array.isArray(value)) for (const item of value) assertJson(item, seen);
  else {
    if (!isRecord(value)) throw new TypeError();
    for (const item of Object.values(value)) assertJson(item, seen);
  }
  seen.delete(value);
}
function encode(frame: RecordValue): Buffer {
  assertJson(frame);
  const line = Buffer.from(`${JSON.stringify(frame)}\n`, "utf8");
  if (line.length > MAX_LINE) throw new RangeError();
  return line;
}
function isServerId(id: unknown): id is string | number {
  return (typeof id === "string" && id.length > 0 && id.length <= 256 && !id.includes("\0"))
    || (typeof id === "number" && Number.isSafeInteger(id));
}
function key(id: string | number): string { return `${typeof id}:${id}`; }
function signalChild(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid && process.platform !== "win32") {
    try { process.kill(-child.pid, signal); return; } catch { /* Fall through to the owned process. */ }
  }
  try { child.kill(signal); } catch { /* The close event or escalation timer completes cleanup. */ }
}
function validate(options: CodexRpcOptions): void {
  if (!options || typeof options !== "object" ||
      ![options.executable, options.cwd, options.codexHome].every((p) =>
        typeof p === "string" && p.length > 0 && !p.includes("\0") && isAbsolute(p)) ||
      !Array.isArray(options.config) || options.config.length > MAX_CONFIG ||
      !Array.from(options.config).every((v) => typeof v === "string" && v.length <= MAX_CONFIG_LENGTH && !v.includes("\0")) ||
      typeof options.onNotification !== "function" || typeof options.onToolRequest !== "function")
    throw new Error("Invalid Codex RPC options.");
}

export function startCodexRpc(options: CodexRpcOptions): CodexRpc {
  validate(options);
  const env = codexProcessEnvironment(options.codexHome);
  let child: ChildProcess;
  try {
    child = spawn(options.executable,
      ["app-server", "--listen", "stdio://", ...options.config.flatMap((v) => ["-c", v])],
      { cwd: options.cwd, env, shell: false, detached: process.platform !== "win32", windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"] });
  } catch { throw new Error("Codex RPC process could not start."); }

  let state: "open" | "closing" | "closed" = "open", nextId = 1, lastId = 0;
  let escalation: NodeJS.Timeout | undefined, lineParts: Buffer[] = [], lineBytes = 0, queuedBytes = 0;
  const pending = new Map<number, Pending>(), serverRequests = new Set<string>();
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
  const stopped = new AbortController();
  const decoder = new TextDecoder("utf-8", { fatal: true });

  function clearRequest(id: number, p: Pending): void {
    clearTimeout(p.timer);
    if (p.signal && p.abort) p.signal.removeEventListener("abort", p.abort);
    pending.delete(id);
  }
  function rejectPending(message: string): void {
    for (const [id, p] of pending) { clearRequest(id, p); p.reject(new Error(message)); }
  }
  function stop(kill = true): void {
    if (state !== "open") return;
    state = "closing";
    stopped.abort();
    rejectPending("Codex RPC transport failed.");
    serverRequests.clear();
    if (kill) {
      signalChild(child, "SIGTERM");
      escalation = setTimeout(() => {
        if (state !== "closed") signalChild(child, "SIGKILL");
      }, 1000);
    }
  }
  function writeBytes(bytes: Buffer): void {
    if (!child.stdin || queuedBytes + bytes.length > MAX_LINE * 2) { stop(); return; }
    queuedBytes += bytes.length;
    try {
      child.stdin.write(bytes, error => {
        queuedBytes -= bytes.length;
        if (error) stop();
      });
    } catch { queuedBytes -= bytes.length; stop(); }
  }
  function write(frame: RecordValue): void {
    if (state !== "open") return;
    let bytes: Buffer;
    try { bytes = encode(frame); } catch { stop(); return; }
    writeBytes(bytes);
  }
  function invoke(callback: () => unknown): void {
    try {
      const result = callback();
      if (result && typeof (result as PromiseLike<unknown>).then === "function")
        Promise.resolve(result).catch(() => stop());
    } catch { stop(); }
  }
  function malformed(): void { stop(); }
  function handleFrame(line: Buffer): void {
    let frame: unknown;
    try { frame = JSON.parse(decoder.decode(line)); } catch { malformed(); return; }
    if (!isRecord(frame)) { malformed(); return; }
    const hasId = Object.hasOwn(frame, "id"), hasMethod = Object.hasOwn(frame, "method");
    if (hasMethod) {
      if (typeof frame.method !== "string" || !frame.method ||
          Object.hasOwn(frame, "result") || Object.hasOwn(frame, "error")) { malformed(); return; }
      if (Object.hasOwn(frame, "params")) {
        try { assertJson(frame.params); } catch { malformed(); return; }
      }
      if (!hasId) { invoke(() => options.onNotification(frame.method as string, frame.params)); return; }
      if (!isServerId(frame.id) || !Object.hasOwn(frame, "params")) { malformed(); return; }
      if (frame.method !== "item/tool/call") {
        write({ id: frame.id, error: { code: -32601, message: "Unsupported server request." } }); return;
      }
      const requestKey = key(frame.id);
      if (serverRequests.has(requestKey)) { malformed(); return; }
      if (serverRequests.size >= MAX_PENDING) {
        write({ id: frame.id, error: { code: -32000, message: "Server request limit exceeded." } }); return;
      }
      serverRequests.add(requestKey);
      invoke(() => options.onToolRequest(frame.id as string | number, frame.params));
      return;
    }
    const hasResult = Object.hasOwn(frame, "result"), hasError = Object.hasOwn(frame, "error");
    if (!hasId || !Number.isSafeInteger(frame.id) || (frame.id as number) < 1 || hasResult === hasError) {
      malformed(); return;
    }
    if (hasError && (!isRecord(frame.error) || !Number.isSafeInteger(frame.error.code) ||
        typeof frame.error.message !== "string")) { malformed(); return; }
    const id = frame.id as number, p = pending.get(id);
    if (p) { clearRequest(id, p); hasError ? p.reject(new Error("Codex RPC request failed.")) : p.resolve(frame.result); }
    else if (id > lastId) malformed();
  }
  function handleStdout(chunk: Buffer): void {
    if (state !== "open") return;
    let start = 0;
    for (let i = 0; i < chunk.length; i += 1) if (chunk[i] === 10) {
      const part = chunk.subarray(start, i);
      if (lineBytes + part.length > MAX_LINE) { malformed(); return; }
      if (part.length) lineParts.push(part);
      const line = Buffer.concat(lineParts, lineBytes + part.length);
      lineParts = []; lineBytes = 0;
      handleFrame(line);
      if (state !== "open") return;
      start = i + 1;
    }
    const tail = chunk.subarray(start);
    lineBytes += tail.length;
    if (lineBytes > MAX_LINE) { malformed(); return; }
    if (tail.length) lineParts.push(tail);
  }
  function drainStderr(): void { /* Drain only; stderr is intentionally never retained. */ }
  function handleChildError(): void { stop(); }
  function handleExit(): void { stop(); }
  function finalize(): void {
    if (state === "closed") return;
    if (state === "open") stop(false);
    state = "closed";
    if (escalation) clearTimeout(escalation);
    lineParts = []; lineBytes = 0;
    child.removeListener("error", handleChildError); child.removeListener("exit", handleExit);
    child.removeListener("close", handleClose); child.stdin?.removeListener("error", handleStreamError);
    child.stdout?.removeListener("data", handleStdout); child.stdout?.removeListener("error", handleStreamError);
    child.stderr?.removeListener("data", drainStderr); child.stderr?.removeListener("error", handleStreamError);
    resolveClosed();
  }
  function handleClose(): void { if (state === "open" && lineBytes) stop(false); finalize(); }
  function handleStreamError(): void { stop(); }

  child.on("error", handleChildError); child.on("exit", handleExit); child.on("close", handleClose);
  child.stdin?.on("error", handleStreamError); child.stdout?.on("data", handleStdout);
  child.stdout?.on("error", handleStreamError); child.stderr?.on("data", drainStderr);
  child.stderr?.on("error", handleStreamError);
  if (!child.stdin || !child.stdout || !child.stderr) stop();

  return {
    closed,
    stopSignal: stopped.signal,
    request(method, params, signal) {
      if (state !== "open") return Promise.reject(new Error("Codex RPC transport is unavailable."));
      if (typeof method !== "string" || !METHODS.has(method)) return Promise.reject(new Error("Unsupported Codex RPC method."));
      if (signal?.aborted) return Promise.reject(new Error("Codex RPC request cancelled; operation status is unknown."));
      if (pending.size >= MAX_PENDING || !Number.isSafeInteger(nextId))
        return Promise.reject(new Error("Codex RPC request limit exceeded."));
      const id = nextId;
      let bytes: Buffer;
      try { bytes = encode({ id, method, params }); }
      catch { return Promise.reject(new Error("Invalid Codex RPC request.")); }
      nextId += 1; lastId = id;
      return new Promise((resolve, reject) => {
        let p: Pending;
        p = { resolve, reject, timer: setTimeout(() => {
          if (!pending.has(id)) return;
          clearRequest(id, p); reject(new Error("Codex RPC request timed out."));
        }, TIMEOUT_MS), signal };
        if (signal) {
          p.abort = () => {
            if (!pending.has(id)) return;
            clearRequest(id, p); reject(new Error("Codex RPC request cancelled; operation status is unknown."));
          };
          signal.addEventListener("abort", p.abort, { once: true });
        }
        pending.set(id, p);
        if (state !== "open") { clearRequest(id, p); reject(new Error("Codex RPC transport is unavailable.")); return; }
        writeBytes(bytes);
      });
    },
    notify(method, params = {}) {
      if (state !== "open") return;
      if (method !== "initialized") { stop(); return; }
      write({ method, params });
    },
    respond(id, result) {
      if (!isServerId(id) || !serverRequests.has(key(id))) return;
      serverRequests.delete(key(id)); write({ id, result });
    },
    dispose() { stop(); return closed; },
  };
}
