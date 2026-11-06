import { spawn, type ChildProcess } from "node:child_process";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.22.0" as const;
const MAX_INPUT_BYTES = 24 * 1024 * 1024;
const MAX_STDOUT_BYTES = 12 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const TIMEOUT_MS = 30_000;

type ErrorCode =
  | "invalid_input" | "input_too_large" | "unavailable" | "conversion_diagnostics"
  | "conversion_failed" | "invalid_output" | "output_too_large" | "spawn_error"
  | "helper_failed" | "protocol_error" | "timeout" | "cancelled";

export interface ComfyWorkflowExportInput {
  pythonExecutable: string;
  workflow: Record<string, unknown>;
  objectInfo: Record<string, unknown>;
  signal?: AbortSignal;
}
export type ComfyWorkflowExportResult =
  | { ok: true; version: typeof VERSION; workflow: Record<string, unknown>;
      sourceGraphFingerprint: string; objectInfoFingerprint: string; exportFingerprint: string;
      readiness: "not_verified" }
  | { ok: false; error: { code: ErrorCode; message: string }; readiness: "not_verified" };
const HELPER_FAILURE_CODES = new Set<ErrorCode>([
  "invalid_input", "input_too_large", "unavailable", "conversion_diagnostics",
  "conversion_failed", "invalid_output", "output_too_large",
]);
function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function assertJsonValue(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || ancestors.has(value)) throw new TypeError("Invalid JSON value");
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item, ancestors);
  } else {
    if (!isRecord(value)) throw new TypeError("Invalid JSON record");
    for (const item of Object.values(value)) assertJsonValue(item, ancestors);
  }
  ancestors.delete(value);
}
function failed(code: ErrorCode): ComfyWorkflowExportResult {
  return { ok: false, error: { code, message: "Workflow export failed." }, readiness: "not_verified" };
}
function parseOutput(stdout: Buffer): ComfyWorkflowExportResult {
  let value: unknown;
  try { value = JSON.parse(stdout.toString("utf8")); } catch { return failed("protocol_error"); }
  if (!isRecord(value)) return failed("protocol_error");
  if (value.ok === false) {
    const error = value.error;
    return isRecord(error) && typeof error.code === "string" &&
      HELPER_FAILURE_CODES.has(error.code as ErrorCode) && value.readiness === "not_verified"
      ? failed(error.code as ErrorCode) : failed("protocol_error");
  }
  const workflow = value.workflow;
  const source = value.sourceGraphFingerprint;
  const objectInfo = value.objectInfoFingerprint;
  const exported = value.exportFingerprint;
  const fingerprint = (item: unknown): item is string => typeof item === "string" && /^[a-f0-9]{64}$/.test(item);
  if (value.ok !== true || value.version !== VERSION || !isRecord(workflow) || !Object.keys(workflow).length ||
      !fingerprint(source) || !fingerprint(objectInfo) || !fingerprint(exported) || value.readiness !== "not_verified")
    return failed("protocol_error");
  // Fingerprints use sorted-key, compact UTF-8 JSON with non-ASCII preserved, as in the Python helper.
  return { ok: true, version: VERSION, workflow, sourceGraphFingerprint: source,
    objectInfoFingerprint: objectInfo, exportFingerprint: exported, readiness: "not_verified" };
}
function signalChild(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid && process.platform !== "win32") {
    try { process.kill(-child.pid, signal); return; } catch { /* Fall through to the direct child. */ }
  }
  try { child.kill(signal); } catch { /* The close event or escalation timer will finish cleanup. */ }
}

export async function runComfyWorkflowExport({
  pythonExecutable, workflow, objectInfo, signal,
}: ComfyWorkflowExportInput): Promise<ComfyWorkflowExportResult> {
  if (signal?.aborted) return failed("cancelled");
  if (typeof pythonExecutable !== "string" || !pythonExecutable || pythonExecutable.includes("\0") ||
      !isAbsolute(pythonExecutable)) return failed("invalid_input");

  let input: Buffer;
  try {
    if (!isRecord(workflow) || !isRecord(objectInfo)) return failed("invalid_input");
    assertJsonValue(workflow);
    assertJsonValue(objectInfo);
    const serialized = JSON.stringify({ workflow, object_info: objectInfo });
    if (serialized === undefined) return failed("invalid_input");
    input = Buffer.from(serialized, "utf8");
  } catch {
    return failed("invalid_input");
  }
  if (input.length > MAX_INPUT_BYTES) return failed("input_too_large");

  return new Promise((resolve) => {
    let child: ChildProcess | undefined;
    let timeout: NodeJS.Timeout | undefined;
    let escalation: NodeJS.Timeout | undefined;
    let failure: ErrorCode | undefined;
    let settled = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdout: Buffer[] = [];
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      if (escalation) clearTimeout(escalation);
      signal?.removeEventListener("abort", onAbort);
      child?.removeListener("error", onChildError);
      child?.removeListener("close", onClose);
      child?.stdin?.removeListener("error", onStreamError);
      child?.stdout?.removeListener("data", onStdout);
      child?.stdout?.removeListener("error", onStreamError);
      child?.stderr?.removeListener("data", onStderr);
      child?.stderr?.removeListener("error", onStreamError);
    };
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(failure ? failed(failure) : code === 0 ? parseOutput(Buffer.concat(stdout)) : failed("helper_failed"));
    };
    const stop = (code: ErrorCode) => {
      if (settled || failure) return;
      failure = code;
      if (child) {
        const owned = child;
        signalChild(owned, "SIGTERM");
        escalation = setTimeout(() => signalChild(owned, "SIGKILL"), 250);
      }
    };
    const onAbort = () => stop("cancelled");
    const onChildError = () => stop("spawn_error");
    const onStreamError = () => stop("spawn_error");
    const onClose = (code: number | null) => finish(code);
    const onStdout = (chunk: Buffer) => {
      if (failure) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT_BYTES) return stop("output_too_large");
      stdout.push(chunk);
    };
    const onStderr = (chunk: Buffer) => {
      if (failure) return;
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_STDERR_BYTES) stop("output_too_large");
    };

    if (signal?.aborted) return resolve(failed("cancelled"));
    const env = { ...process.env };
    delete env.PYTHONHOME;
    delete env.PYTHONPATH;
    delete env.PYTHONSTARTUP;
    try {
      child = spawn(pythonExecutable, ["-I", fileURLToPath(new URL("../src/helpers/comfy-export.py", import.meta.url))], {
        shell: false, detached: process.platform !== "win32", windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"], env,
      });
    } catch {
      return resolve(failed("spawn_error"));
    }
    child.once("error", onChildError);
    child.once("close", onClose);
    child.stdin?.on("error", onStreamError);
    child.stdout?.on("data", onStdout);
    child.stdout?.on("error", onStreamError);
    child.stderr?.on("data", onStderr);
    child.stderr?.on("error", onStreamError);
    signal?.addEventListener("abort", onAbort, { once: true });
    timeout = setTimeout(() => stop("timeout"), TIMEOUT_MS);
    if (signal?.aborted) stop("cancelled");
    if (!child.stdin || !child.stdout || !child.stderr) stop("spawn_error");
    if (failure) return;
    try { child.stdin!.end(input); } catch { stop("spawn_error"); }
  });
}
