import type { EventEmitter } from "node:events";
import type { CodexRpc } from "./codex-rpc.js";

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BUFFERED_COMPLETIONS = 8;
const SIGN_IN_ERROR = "Codex sign-in could not be started.";

type Completion = "success" | "failed" | "cancelled";
type BufferedCompletion = { loginId: string; success: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validLoginId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128 && !value.includes("\0");
}

function validAuthUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 8192 || !/^https:\/\//i.test(value) ||
      value.includes("#") || value.includes("\0")) return false;
  try {
    const url = new URL(value);
    const authority = value.slice(value.indexOf("://") + 3).split(/[/?#]/, 1)[0];
    return url.protocol === "https:" && url.hostname === "auth.openai.com" && url.origin === "https://auth.openai.com" &&
      !authority.includes("@") && !url.username && !url.password && !url.port && !url.hash;
  } catch { return false; }
}

export async function beginCodexLogin({ rpc, events, signal }: {
  rpc: CodexRpc;
  events: EventEmitter;
  signal?: AbortSignal;
}): Promise<{ loginId: string; authUrl: string; completed: Promise<Completion>; status(): Completion | undefined; cancel(): Promise<void> }> {
  if (signal?.aborted || rpc.stopSignal.aborted) throw new Error(SIGN_IN_ERROR);
  let loginId: string | undefined;
  let acknowledged = false;
  let cancelRequested = false;
  let cancelPromise: Promise<void> | undefined;
  let terminal = false;
  let completionStatus: Completion | undefined;
  let resolveCompleted!: (status: Completion) => void;
  const completed = new Promise<Completion>((resolve) => { resolveCompleted = resolve; });
  const buffered: BufferedCompletion[] = [];

  const cleanup = () => {
    clearTimeout(expiration);
    events.removeListener("notification", onNotification);
    rpc.stopSignal.removeEventListener("abort", onTransportStop);
    signal?.removeEventListener("abort", onAbort);
  };
  const finish = (status: Completion) => {
    if (terminal) return;
    terminal = true;
    completionStatus = status;
    cleanup();
    resolveCompleted(status);
  };
  const requestCancel = (): Promise<void> => {
    cancelRequested = true;
    if (terminal || !loginId) return Promise.resolve();
    if (cancelPromise) return cancelPromise;
    cancelPromise = (async () => {
      try {
        const response: unknown = await rpc.request("account/login/cancel", { loginId });
        finish(isRecord(response) && response.status === "canceled" ? "cancelled" : "failed");
      } catch { finish("failed"); }
    })();
    return cancelPromise;
  };
  function onNotification(method: unknown, params: unknown): void {
    if (method !== "account/login/completed" || !isRecord(params) || !validLoginId(params.loginId)) return;
    const success = params.success === true;
    if (!acknowledged) {
      if (buffered.length === MAX_BUFFERED_COMPLETIONS) buffered.shift();
      buffered.push({ loginId: params.loginId, success });
      return;
    }
    if (params.loginId !== loginId) return;
    finish(typeof params.success === "boolean" ? (params.success ? "success" : "failed") : "failed");
  }
  function onAbort(): void { void requestCancel(); }
  function onTransportStop(): void { finish("failed"); }

  const expiration = setTimeout(() => { void requestCancel(); }, LOGIN_TIMEOUT_MS);
  events.on("notification", onNotification);
  rpc.stopSignal.addEventListener("abort", onTransportStop, { once: true });
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) cancelRequested = true;
  if (rpc.stopSignal.aborted) onTransportStop();

  let response: unknown;
  try {
    if (terminal) throw new Error(SIGN_IN_ERROR);
    response = await rpc.request("account/login/start", { type: "chatgpt" });
  } catch {
    finish("failed");
    throw new Error(SIGN_IN_ERROR);
  }
  if (isRecord(response) && response.type === "chatgpt" && validLoginId(response.loginId)) loginId = response.loginId;
  if (!isRecord(response) || response.type !== "chatgpt" || !validLoginId(response.loginId) || !validAuthUrl(response.authUrl)) {
    if (loginId) await requestCancel();
    finish("failed");
    throw new Error(SIGN_IN_ERROR);
  }

  loginId = response.loginId;
  acknowledged = true;
  for (const item of buffered) {
    if (item.loginId === loginId) { finish(item.success ? "success" : "failed"); break; }
  }
  buffered.length = 0;
  if (!terminal && (cancelRequested || signal?.aborted)) void requestCancel();

  return { loginId, authUrl: response.authUrl, completed, status: () => completionStatus, cancel: requestCancel };
}
