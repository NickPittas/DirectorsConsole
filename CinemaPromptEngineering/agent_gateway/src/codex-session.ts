import { EventEmitter } from "node:events";
import { stageCodexImages } from "./codex-images.js";
import type { createCodexApplicationTools } from "./codex-application-tools.js";
import { openCodexThread } from "./codex-open-thread.js";
import { runCodexTurn } from "./codex-turn.js";
import type { AgentSurface, PiImageInput, PiStreamEvent } from "./contracts.js";

const BUSY = "Codex session is busy.";
const DISPOSED = "Codex session is disposed.";
const FAILED = "Codex session operation failed.";
const CLEANUP_FAILED = "Codex session cleanup failed.";

export function createCodexSession(options: {
  opened: Awaited<ReturnType<typeof openCodexThread>>;
  events: EventEmitter;
  surface: AgentSurface;
  tools?: ReturnType<typeof createCodexApplicationTools>;
}): {
  prompt(text: string, options?: {
    images?: readonly PiImageInput[];
    onEvent?: (event: PiStreamEvent) => void;
    signal?: AbortSignal;
  }): Promise<void>;
  abort(): void;
  dispose(): Promise<void>;
} {
  const toolSurface = options.surface === "console" || options.surface === "workspace";
  if (!(["prompt-engineer", "console", "workspace", "prompt-enhancement"] as string[]).includes(options.surface) ||
      toolSurface !== (options.tools !== undefined) ||
      (options.tools !== undefined && (!options.tools || !Array.isArray(options.tools.definitions) ||
        typeof options.tools.invoke !== "function")))
    throw new Error("Invalid Codex session configuration.");

  let busy = false, disposed = false, cleanupFailed = false;
  let active: AbortController | undefined, activeSettlement = Promise.resolve();
  let disposePromise: Promise<void> | undefined;

  return {
    async prompt(text, promptOptions = {}) {
      if (cleanupFailed) throw new Error(CLEANUP_FAILED);
      if (disposed) throw new Error(DISPOSED);
      if (busy) throw new Error(BUSY);
      if (options.opened.rpc.stopSignal.aborted) throw new Error(FAILED);
      if (typeof text !== "string" || Buffer.byteLength(text, "utf8") < 1 || Buffer.byteLength(text, "utf8") > 65536)
        throw new Error("Invalid Codex prompt.");
      const images = promptOptions.images;
      if (images?.length && !options.opened.selection.model.inputModalities.includes("image"))
        throw new Error("Codex model does not support images.");

      busy = true;
      const controller = new AbortController();
      active = controller;
      let finishSettlement!: () => void;
      activeSettlement = new Promise<void>(resolve => { finishSettlement = resolve; });
      const callerSignal = promptOptions.signal;
      const forwardAbort = () => controller.abort();
      if (callerSignal?.aborted) controller.abort();
      else callerSignal?.addEventListener("abort", forwardAbort, { once: true });

      let staged: Awaited<ReturnType<typeof stageCodexImages>> | undefined;
      let failed = false, promptCleanupFailed = false;
      try {
        staged = await stageCodexImages(options.opened.policy.cwd, images, controller.signal);
        await runCodexTurn({
          rpc: options.opened.rpc,
          events: options.events,
          threadId: options.opened.threadId,
          surface: options.surface,
          modelId: options.opened.selection.model.modelId,
          reasoningEffort: options.opened.selection.reasoningEffort,
          policy: options.opened.policy,
          input: [{ type: "text", text, text_elements: [] }, ...staged.input],
          toolNames: options.tools?.definitions.map(tool => tool.name) ?? [],
          tools: options.tools,
          onEvent: promptOptions.onEvent ?? (() => undefined),
          signal: controller.signal,
        });
      } catch (error) {
        failed = true;
        if (error instanceof Error && error.message === "Could not clean up staged Codex images.") {
          promptCleanupFailed = true;
          cleanupFailed = true;
        }
      } finally {
        if (staged) {
          try { await staged.dispose(); }
          catch { promptCleanupFailed = true; cleanupFailed = true; }
        }
        callerSignal?.removeEventListener("abort", forwardAbort);
        active = undefined;
        busy = false;
        finishSettlement();
      }
      if (promptCleanupFailed) {
        try { await options.opened.rpc.dispose(); } catch { /* Cleanup is already reported as failed. */ }
        throw new Error(CLEANUP_FAILED);
      }
      if (failed) throw new Error(controller.signal.aborted ? "Codex session operation cancelled." : FAILED);
    },
    abort() { active?.abort(); },
    dispose() {
      disposed = true;
      active?.abort();
      if (!disposePromise) {
        const running = activeSettlement;
        let rpcDisposal: Promise<void>;
        try { rpcDisposal = options.opened.rpc.dispose(); }
        catch { rpcDisposal = Promise.reject(new Error()); }
        disposePromise = (async () => {
          let failed = false;
          try { await rpcDisposal; } catch { failed = true; }
          await running;
          if (cleanupFailed) throw new Error(CLEANUP_FAILED);
          if (failed) throw new Error("Codex session disposal failed.");
        })();
        void disposePromise.catch(() => undefined);
      }
      return disposePromise;
    },
  };
}
