import type { AgentToolResult, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import type { ApplicationCommandDispatcher, ApplicationSessionScope } from "./contracts.js";
import { createComfyCliAdapter, type ComfyCliResult } from "./comfy-cli.js";
import { createSavedApplicationWorkflowGetter } from "./saved-workflow.js";

const MAX_RESULT_BYTES = 900 * 1024;
const parameters = Type.Object({ workflowId: Type.String({ minLength: 1, maxLength: 256 }) }, { additionalProperties: false });

function sdkResult(result: ComfyCliResult): AgentToolResult {
  let text = JSON.stringify(result);
  if (Buffer.byteLength(text, "utf8") > MAX_RESULT_BYTES) {
    const tooLarge: ComfyCliResult = {
      ok: false, status: "error", operation: "workflow.notes",
      error: { code: "workflow_notes_result_too_large", message: "The saved workflow notes result exceeded the safe output limit.", retryable: false },
    };
    text = JSON.stringify(tooLarge);
    result = tooLarge;
  }
  const structuredContent = result as unknown as NonNullable<AgentToolResult["structuredContent"]>;
  return { content: [{ type: "text", text }], details: structuredContent, structuredContent, isError: !result.ok };
}

export { sdkResult as formatComfyCliToolResult };

export function createSavedWorkflowNotesTool(
  scope: ApplicationSessionScope & { sessionId: string; dispatch: ApplicationCommandDispatcher },
): ToolDefinition {
  const getter = createSavedApplicationWorkflowGetter(scope, scope.dispatch);
  const adapter = createComfyCliAdapter({ getSavedApplicationWorkflow: getter });
  const unavailable: ComfyCliResult = {
    ok: false, status: "unavailable", operation: "workflow.notes",
    error: { code: "workflow_notes_unavailable", message: "Saved workflow notes are unavailable.", retryable: false },
  };
  const cancelled: ComfyCliResult = {
    ok: false, status: "error", operation: "workflow.notes",
    error: { code: "tool_cancelled", message: "The request was cancelled; the read-only CLI operation may still finish within its timeout.", retryable: false },
  };

  return {
    name: "inspect_saved_workflow_notes",
    label: "Inspect saved workflow notes",
    description: "Read notes from the currently selected saved workflow.",
    promptSnippet: "Read notes from the currently selected saved workflow.",
    parameters,
    executionMode: "parallel",
    execute: async (_toolCallId: string, params: Static<typeof parameters>, signal?: AbortSignal) => {
      if (signal?.aborted) return sdkResult(cancelled);
      let onAbort: (() => void) | undefined;
      try {
        const invocation = adapter.invoke({ operation: "workflow.notes", workflowId: params.workflowId });
        const result = signal
          ? await Promise.race([
              invocation,
              new Promise<ComfyCliResult>((resolve) => {
                onAbort = () => resolve(cancelled);
                signal.addEventListener("abort", onAbort, { once: true });
                if (signal.aborted) onAbort();
              }),
            ])
          : await invocation;
        return sdkResult(signal?.aborted ? cancelled : result);
      } catch {
        return sdkResult(unavailable);
      } finally {
        if (onAbort) signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
