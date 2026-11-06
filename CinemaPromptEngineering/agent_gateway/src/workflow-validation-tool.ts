import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import type { ApplicationCommandDispatcher, ApplicationSessionScope } from "./contracts.js";
import { createComfyCliAdapter, type ComfyCliResult } from "./comfy-cli.js";
import { createSavedSelectedBackendSchemaGetter } from "./saved-schema.js";
import { createSavedApplicationWorkflowGetter } from "./saved-workflow.js";
import { formatComfyCliToolResult } from "./workflow-notes-tool.js";

const parameters = Type.Object({ workflowId: Type.String({ minLength: 1, maxLength: 256 }) }, { additionalProperties: false });

export function createSavedWorkflowValidationTool(
  scope: ApplicationSessionScope & { sessionId: string; dispatch: ApplicationCommandDispatcher },
): ToolDefinition {
  const unavailable: ComfyCliResult = {
    ok: false, status: "unavailable", operation: "workflow.validate",
    error: { code: "workflow_validation_unavailable", message: "Saved workflow validation is unavailable.", retryable: false },
  };
  const cancelled: ComfyCliResult = {
    ok: false, status: "error", operation: "workflow.validate",
    error: { code: "tool_cancelled", message: "The request was cancelled; the read-only CLI operation may still finish within its timeout.", retryable: false },
  };

  return {
    name: "validate_saved_workflow",
    label: "Validate saved workflow",
    description: "Validate the currently selected saved workflow offline against the available subset of a fresh cached schema for the selected backend. This does not establish installed model identity or render readiness, and does not authorize running the workflow.",
    promptSnippet: "Validate the currently selected saved workflow offline against its fresh cached selected-backend schema.",
    parameters,
    executionMode: "parallel",
    execute: async (_toolCallId: string, params: Static<typeof parameters>, signal?: AbortSignal) => {
      if (signal?.aborted) return formatComfyCliToolResult(cancelled);
      let onAbort: (() => void) | undefined;
      try {
        const invocation = (async (): Promise<ComfyCliResult> => {
          if (signal?.aborted) return cancelled;
          const captureSaved = await createSavedApplicationWorkflowGetter(scope, scope.dispatch)(params.workflowId);
          if (signal?.aborted) return cancelled;
          if (!captureSaved) return unavailable;

          const getSchema = createSavedSelectedBackendSchemaGetter(scope, scope.dispatch, captureSaved);
          const adapter = createComfyCliAdapter({
            getSavedApplicationWorkflow: async (workflowId) => workflowId === captureSaved.workflowId ? captureSaved : null,
            getSavedSelectedBackendSchema: async () => {
              if (signal?.aborted) return null;
              const schema = await getSchema();
              return signal?.aborted ? null : schema;
            },
          });
          if (signal?.aborted) return cancelled;
          return adapter.invoke({ operation: "workflow.validate", workflowId: captureSaved.workflowId });
        })();
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
        return formatComfyCliToolResult(signal?.aborted ? cancelled : result);
      } catch {
        return formatComfyCliToolResult(unavailable);
      } finally {
        if (onAbort) signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
