import { CodexAdapter } from "./codex-adapter.js";
import { createPiAdapter, type PiAdapter } from "./pi-adapter.js";
import {
  PiGatewayError,
  type AgentSelection,
  type AgentSessionRef,
  type ApplicationCommandDispatcher,
  type ApplicationSessionScope,
  type CreatePiSessionInput,
  type PiAvailability,
  type PiModelSummary,
  type PiPromptOptions,
  type ReviewedPromptContext,
} from "./contracts.js";

export function createHarnessAdapter(options: {
  dispatchApplicationCommand?: ApplicationCommandDispatcher;
  codex?: { executable: string; codexHome: string; metadataCwd: string };
}): {
  getAvailability(harnessId?: "pi" | "codex"): PiAvailability;
  listAvailableModels(harnessId?: "pi" | "codex"): Promise<PiModelSummary[]>;
  createSession(input: CreatePiSessionInput): Promise<AgentSessionRef>;
  resumeSession(
    selection: AgentSelection,
    ref: AgentSessionRef,
    reviewedContext?: readonly ReviewedPromptContext[],
    applicationScope?: ApplicationSessionScope,
  ): Promise<AgentSessionRef>;
  prompt(ref: AgentSessionRef, text: string, options?: PiPromptOptions): Promise<void>;
  abort(ref: AgentSessionRef): Promise<void>;
  disposeSession(ref: AgentSessionRef): Promise<void>;
  getApplicationToolsAvailable(ref: AgentSessionRef): boolean;
  dispose(): Promise<void>;
} {
  const pi = createPiAdapter({ dispatchApplicationCommand: options.dispatchApplicationCommand });
  const codex = options.codex
    ? new CodexAdapter({ ...options.codex, dispatchApplicationCommand: options.dispatchApplicationCommand })
    : undefined;

  function choose(harnessId: unknown): PiAdapter | CodexAdapter {
    if (harnessId === "pi") return pi;
    if (harnessId === "codex") {
      if (codex) return codex;
      throw new PiGatewayError("unsupported_harness", "Codex harness is not configured.");
    }
    throw new PiGatewayError("unsupported_harness", "Unsupported agent harness.");
  }

  return {
    getAvailability: (harnessId = "pi") => choose(harnessId).getAvailability(),
    listAvailableModels: (harnessId = "pi") => choose(harnessId).listAvailableModels(),
    createSession: (input) => choose(input.selection.harnessId).createSession(input),
    resumeSession: (selection, ref, reviewedContext, applicationScope) => {
      if (selection.harnessId !== ref.harnessId)
        throw new PiGatewayError("invalid_selection", "Session selection does not match its harness.");
      return choose(ref.harnessId).resumeSession(selection, ref, reviewedContext, applicationScope);
    },
    prompt: (ref, text, promptOptions) => choose(ref.harnessId).prompt(ref, text, promptOptions),
    abort: (ref) => choose(ref.harnessId).abort(ref),
    disposeSession: (ref) => choose(ref.harnessId).disposeSession(ref),
    getApplicationToolsAvailable: (ref) => choose(ref.harnessId).getApplicationToolsAvailable(ref),
    async dispose() {
      const cleanup = [Promise.resolve().then(() => pi.dispose())];
      if (codex) cleanup.push(Promise.resolve().then(() => codex.dispose()));
      const results = await Promise.allSettled(cleanup);
      if (results.some(result => result.status === "rejected"))
        throw new PiGatewayError("session_operation_failed", "Agent harness cleanup failed.");
    },
  };
}
