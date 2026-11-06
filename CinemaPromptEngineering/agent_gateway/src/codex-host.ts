import { execFile } from "node:child_process";
import { open, mkdir, realpath, stat, type FileHandle } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";
import { buildCodexStartupPolicy } from "./codex-policy.js";
import { initializeCodexHost } from "./codex-initialize.js";
import { codexProcessEnvironment, startCodexRpc, type CodexRpc } from "./codex-rpc.js";

const execFileAsync = promisify(execFile);
const CANCELLED = "Codex host startup cancelled.";
const UNAVAILABLE = "Codex host unavailable.";
const UNSUPPORTED_VERSION = "Unsupported Codex version.";
const UNSUPPORTED_BINARY = "Unsupported Codex native executable.";

export class CodexHostCleanupError extends Error {
  constructor(readonly retryCleanup: () => Promise<void>) { super("Codex host cleanup failed."); }
}

function checkSignal(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error(CANCELLED);
}

async function checked<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  checkSignal(signal);
  try {
    const result = await operation();
    checkSignal(signal);
    return result;
  } catch {
    checkSignal(signal);
    throw new Error(UNAVAILABLE);
  }
}

async function ensureDirectory(path: string, signal?: AbortSignal, privateWorkspace = true): Promise<void> {
  await checked(() => mkdir(path, { recursive: true, mode: 0o700 }), signal);
  if (await checked(() => realpath(path), signal) !== path) throw new Error(UNAVAILABLE);
  const info = await checked(() => stat(path), signal);
  if (!info.isDirectory() || (process.platform !== "win32" &&
      ((info.mode & (privateWorkspace ? 0o077 : 0o022)) !== 0 || (typeof process.getuid === "function" && info.uid !== process.getuid()))))
    throw new Error(UNAVAILABLE);
}

async function verifyNativeExecutable(executable: string, signal?: AbortSignal): Promise<void> {
  const info = await checked(() => stat(executable), signal);
  if (!info.isFile()) throw new Error(UNSUPPORTED_BINARY);
  let file: FileHandle | undefined;
  const header = Buffer.alloc(4);
  let bytesRead = 0;
  try {
    checkSignal(signal);
    const opened = await open(executable, "r");
    file = opened;
    checkSignal(signal);
    ({ bytesRead } = await checked(() => opened.read(header, 0, 4, 0), signal));
  } finally {
    try { checkSignal(signal); } catch { /* Close the descriptor even after cancellation. */ }
    try { await file?.close(); } catch { checkSignal(signal); throw new Error(UNAVAILABLE); }
    checkSignal(signal);
  }
  const magic = header.toString("hex");
  const native = bytesRead === 4 && (process.platform === "linux" ? magic === "7f454c46" :
    process.platform === "win32" ? magic.startsWith("4d5a") :
      process.platform === "darwin" && ["feedface", "feedfacf", "cefaedfe", "cffaedfe",
        "cafebabe", "bebafeca", "cafebabf", "bfbafeca"].includes(magic));
  if (!native) throw new Error(UNSUPPORTED_BINARY);
}

async function disposeOwned(rpc: CodexRpc, signal?: AbortSignal): Promise<void> {
  try { checkSignal(signal); } catch { /* Disposal must proceed after cancellation. */ }
  try { await rpc.dispose(); } catch { throw new CodexHostCleanupError(() => rpc.dispose()); }
  try { checkSignal(signal); } catch { /* The caller reports cancellation after cleanup. */ }
}

function mcpServerOverrides(raw: unknown): string[] | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const config = (raw as Record<string, unknown>).config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return;
  const servers = (config as Record<string, unknown>).mcp_servers;
  if (servers === undefined || servers === null || !servers || typeof servers !== "object" || Array.isArray(servers)) return;
  const prototype = Object.getPrototypeOf(servers);
  if (prototype !== Object.prototype && prototype !== null) return;
  const names = Object.keys(servers);
  if (names.length > 64) return;
  const overrides: string[] = [];
  let enabled = false;
  for (const name of names) {
    const server = (servers as Record<string, unknown>)[name];
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(name) || !server ||
        typeof server !== "object" || Array.isArray(server)) return;
    const serverPrototype = Object.getPrototypeOf(server);
    if (serverPrototype !== Object.prototype && serverPrototype !== null) return;
    const value = (server as Record<string, unknown>).enabled;
    if (typeof value !== "boolean") return;
    enabled ||= value;
    overrides.push(`mcp_servers.${name}.enabled=false`);
  }
  return enabled ? overrides : undefined;
}

export async function openCodexHost(options: {
  executable: string;
  codexHome: string;
  cwd: string;
  onNotification: (method: string, params: unknown) => void;
  onToolRequest: (id: string | number, params: unknown) => void;
  signal?: AbortSignal;
}): Promise<{
  rpc: CodexRpc;
  policy: ReturnType<typeof buildCodexStartupPolicy>;
  initialization: Awaited<ReturnType<typeof initializeCodexHost>>;
}> {
  let policy = buildCodexStartupPolicy({ codexHome: options.codexHome, cwd: options.cwd });
  if (typeof options.executable !== "string" || options.executable.length > 4096 ||
      options.executable.trim() !== options.executable || options.executable.includes("\0") ||
      !isAbsolute(options.executable)) throw new Error(UNAVAILABLE);

  let rpc: CodexRpc | undefined;
  try {
    checkSignal(options.signal);
    await ensureDirectory(policy.codexHome, options.signal, false);
    await ensureDirectory(policy.cwd, options.signal);
    await verifyNativeExecutable(options.executable, options.signal);

    let version: string;
    try {
      version = (await checked(() => execFileAsync(options.executable, ["--version"], {
        cwd: policy.cwd, env: codexProcessEnvironment(policy.codexHome), timeout: 5000,
        maxBuffer: 4096, encoding: "utf8", signal: options.signal,
      }), options.signal)).stdout;
    } catch {
      checkSignal(options.signal);
      throw new Error(UNSUPPORTED_VERSION);
    }
    if (version.trim() !== "codex-cli 0.166.0") throw new Error(UNSUPPORTED_VERSION);

    checkSignal(options.signal);
    rpc = startCodexRpc({ ...policy, executable: options.executable,
      onNotification: options.onNotification, onToolRequest: options.onToolRequest });
    const initialization = await checked(
      () => initializeCodexHost(rpc!, policy, options.signal), options.signal);
    if (initialization.state === "unavailable") {
      const overrides = await checked(() => rpc!.request("config/read", { includeLayers: false }, options.signal)
        .then(mcpServerOverrides), options.signal);
      if (overrides) {
        const owned = rpc;
        rpc = undefined;
        await disposeOwned(owned, options.signal);
        checkSignal(options.signal);
        policy = { ...policy, config: [...policy.config, ...overrides] };
        checkSignal(options.signal);
        rpc = startCodexRpc({ ...policy, executable: options.executable,
          onNotification: options.onNotification, onToolRequest: options.onToolRequest });
        const retried = await checked(() => initializeCodexHost(rpc!, policy, options.signal), options.signal);
        if (retried.state !== "unavailable") return { rpc, policy, initialization: retried };
      }
      const owned = rpc;
      rpc = undefined;
      await disposeOwned(owned, options.signal);
      checkSignal(options.signal);
      throw new Error(UNAVAILABLE);
    }
    return { rpc, policy, initialization };
  } catch (error) {
    const cancelled = options.signal?.aborted || (error instanceof Error && error.message === CANCELLED);
    if (rpc) await disposeOwned(rpc, options.signal);
    if (error instanceof CodexHostCleanupError) throw error;
    if (cancelled) throw new Error(CANCELLED);
    if (error instanceof Error && [UNSUPPORTED_VERSION, UNSUPPORTED_BINARY].includes(error.message))
      throw new Error(error.message);
    throw new Error(UNAVAILABLE);
  }
}
