import type {
  ApplicationCommandDispatcher,
  ApplicationResult,
  ApplicationSessionScope,
} from "./contracts.js";
import type { SavedApplicationWorkflow } from "./comfy-cli.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWorkflowRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.id === "string";
}

export function createSavedApplicationWorkflowGetter(
  scope: ApplicationSessionScope & { sessionId: string },
  dispatch: ApplicationCommandDispatcher,
): (workflowId: string) => Promise<SavedApplicationWorkflow | null> {
  return async (workflowId: string): Promise<SavedApplicationWorkflow | null> => {
    if (typeof workflowId !== "string" || workflowId.length === 0 || workflowId.length > 256) return null;

    try {
      const commandId = crypto.randomUUID();
      const result: ApplicationResult = await dispatch({
        bridgeId: scope.bridgeId,
        sessionId: scope.sessionId,
        command: {
          commandId,
          projectIdentity: scope.projectIdentity,
          action: "get_application_snapshot",
        } as Parameters<ApplicationCommandDispatcher>[0]["command"],
      });
      if (
        !isRecord(result) ||
        result.ok !== true ||
        result.error !== undefined ||
        result.commandId !== commandId ||
        result.action !== "get_application_snapshot" ||
        !isRecord(result.data) ||
        !isRecord(result.data.project) ||
        typeof result.data.project.revision !== "number" ||
        !Number.isSafeInteger(result.data.project.revision) ||
        result.data.project.revision < 0 ||
        typeof result.data.project.name !== "string" ||
        result.data.selectedWorkflowId !== workflowId ||
        !Array.isArray(result.data.workflows) ||
        !result.data.workflows.every(isWorkflowRecord)
      ) return null;

      const matches = result.data.workflows.filter((workflow) => workflow.id === workflowId);
      if (matches.length !== 1) return null;
      const workflow = matches[0];
      if (
        workflow.saved !== true ||
        workflow.graphAvailable !== true ||
        typeof workflow.revision !== "number" ||
        !Number.isSafeInteger(workflow.revision) ||
        workflow.revision <= 0 ||
        !isRecord(workflow.graph) ||
        (workflow.graphOmittedReason !== undefined && workflow.graphOmittedReason !== "")
      ) return null;

      return {
        workflowId,
        revision: workflow.revision,
        source: "application-saved-workflow",
        workflow: workflow.graph,
      };
    } catch {
      return null;
    }
  };
}
