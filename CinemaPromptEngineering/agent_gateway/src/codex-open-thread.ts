import type { createCodexApplicationTools } from "./codex-application-tools.js";
import { openCodexHost, CodexHostCleanupError } from "./codex-host.js";
import { resolveCodexSelection, validateCodexStartedThread } from "./codex-session-contract.js";
import type { CodexRpc } from "./codex-rpc.js";
import { buildCodexThreadStart } from "./codex-thread-request.js";
import type { AgentSelection, AgentSurface, ReviewedPromptContext } from "./contracts.js";

const AUTH_UNAVAILABLE = "Codex authentication or catalog is unavailable.";
const THREAD_UNAVAILABLE = "Codex thread could not be opened.";

function checkSignal(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error();
}

async function disposeOwned(rpc: CodexRpc, signal?: AbortSignal): Promise<void> {
  try { await rpc.dispose(); } catch { throw new CodexHostCleanupError(() => rpc.dispose()); }
  try { checkSignal(signal); } catch { /* Cleanup has finished; preserve the sanitized failure. */ }
}

export async function openCodexThread(options: {
  executable: string;
  codexHome: string;
  cwd: string;
  selection: AgentSelection;
  surface: AgentSurface;
  reviewedContext: readonly ReviewedPromptContext[];
  tools?: ReturnType<typeof createCodexApplicationTools>;
  onNotification: (method: string, params: unknown) => void;
  onToolRequest: (id: string | number, params: unknown) => void;
  signal?: AbortSignal;
}): Promise<{
  rpc: CodexRpc;
  policy: Awaited<ReturnType<typeof openCodexHost>>["policy"];
  selection: ReturnType<typeof resolveCodexSelection>;
  threadId: string;
}> {
  const toolSurface = options.surface === "console" || options.surface === "workspace";
  if (!["prompt-engineer", "console", "workspace", "prompt-enhancement"].includes(options.surface) ||
      toolSurface !== (options.tools !== undefined) ||
      (options.tools !== undefined && (!options.tools || !Array.isArray(options.tools.definitions) ||
        typeof options.tools.invoke !== "function")))
    throw new Error("Invalid Codex surface/tool configuration.");

  const host = await openCodexHost({
    executable: options.executable,
    codexHome: options.codexHome,
    cwd: options.cwd,
    onNotification: options.onNotification,
    onToolRequest: options.onToolRequest,
    signal: options.signal,
  });
  let authenticationUnavailable = false;
  try {
    checkSignal(options.signal);
    if (host.initialization.state !== "ready") {
      authenticationUnavailable = true;
      throw new Error();
    }
    const selection = resolveCodexSelection(options.selection, host.initialization.models);
    const request = buildCodexThreadStart({
      policy: host.policy,
      selection,
      surface: options.surface,
      reviewedContext: options.reviewedContext,
      tools: options.tools?.definitions ?? [],
    });
    const result = await host.rpc.request("thread/start", request, options.signal);
    checkSignal(options.signal);
    const { threadId } = validateCodexStartedThread(result, {
      provider: selection.model.provider,
      modelId: selection.model.modelId,
      reasoningEffort: selection.reasoningEffort,
      cwd: host.policy.cwd,
      permissions: host.policy.permissions,
      workspaceRoots: [],
    });
    checkSignal(options.signal);
    return { rpc: host.rpc, policy: host.policy, selection, threadId };
  } catch {
    await disposeOwned(host.rpc, options.signal);
    throw new Error(authenticationUnavailable ? AUTH_UNAVAILABLE : THREAD_UNAVAILABLE);
  }
}
