import { buildCodexThreadStart } from "./codex-thread-request.js";
import type { buildCodexStartupPolicy } from "./codex-policy.js";
import { validateCodexStartedThread } from "./codex-session-contract.js";
import type { resolveCodexSelection } from "./codex-session-contract.js";
import type { AgentSurface, ReviewedPromptContext } from "./contracts.js";

export function buildCodexThreadResume(input: {
  threadId: string;
  policy: ReturnType<typeof buildCodexStartupPolicy>;
  selection: ReturnType<typeof resolveCodexSelection>;
  surface: AgentSurface;
  reviewedContext: readonly ReviewedPromptContext[];
  tools: readonly { type: "function"; name: string; description: string; inputSchema: unknown }[];
}): Record<string, unknown> {
  if (typeof input.threadId !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(input.threadId))
    throw new Error("Invalid Codex thread ID.");
  const start = buildCodexThreadStart(input);
  // Resume restores persisted dynamic tools; the caller must verify prior app ownership, surface, and tool contract, then validate the effective response before enabling turns. This helper does not establish restored tool isolation or readiness.
  return {
    threadId: input.threadId,
    model: start.model,
    modelProvider: start.modelProvider,
    cwd: start.cwd,
    runtimeWorkspaceRoots: start.runtimeWorkspaceRoots,
    approvalPolicy: start.approvalPolicy,
    permissions: start.permissions,
    config: start.config,
    baseInstructions: start.baseInstructions,
    developerInstructions: start.developerInstructions,
    excludeTurns: true,
  };
}

export function validateCodexResumedThread(
  value: unknown,
  expected: {
    threadId: string;
    provider: string;
    modelId: string;
    reasoningEffort: string;
    cwd: string;
    permissions: string;
    workspaceRoots: readonly string[];
  },
): { threadId: string } {
  const { threadId, ...startedExpected } = expected;
  let returned: { threadId: string };
  try {
    returned = validateCodexStartedThread(value, startedExpected);
  } catch {
    throw new Error("Codex returned an incompatible or unverified thread resume response.");
  }
  if (returned.threadId !== threadId)
    throw new Error("Codex returned an incompatible or unverified thread resume response.");
  return returned;
}
