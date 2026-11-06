import type {
  ApplicationCommandDispatcher,
  ApplicationResult,
  ApplicationSessionScope,
} from "./contracts.js";
import { fingerprintComfySchema, type SavedSelectedBackendSchema } from "./comfy-cli.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createSavedSelectedBackendSchemaGetter(
  scope: ApplicationSessionScope & { sessionId: string },
  dispatch: ApplicationCommandDispatcher,
  expectedWorkflow: { workflowId: string; revision: number },
): () => Promise<SavedSelectedBackendSchema | null> {
  const workflowId = expectedWorkflow?.workflowId;
  const revision = expectedWorkflow?.revision;
  const validWorkflow = typeof workflowId === "string" && workflowId.length > 0 &&
    Number.isSafeInteger(revision) && revision > 0;

  return async (): Promise<SavedSelectedBackendSchema | null> => {
    if (!validWorkflow) return null;
    try {
      const commandId = crypto.randomUUID();
      const result: ApplicationResult = await dispatch({
        bridgeId: scope.bridgeId,
        sessionId: scope.sessionId,
        command: { commandId, projectIdentity: scope.projectIdentity, action: "get_application_snapshot" },
      });
      if (!isRecord(result) || result.ok !== true || result.error !== undefined ||
        result.commandId !== commandId || result.action !== "get_application_snapshot" || !isRecord(result.data)) return null;

      const data = result.data;
      if (data.selectedWorkflowId !== workflowId || !Array.isArray(data.workflows) ||
        !data.workflows.every((item) => isRecord(item) && typeof item.id === "string")) return null;
      const workflows = data.workflows.filter((item) => isRecord(item) && item.id === workflowId);
      if (workflows.length !== 1 || workflows[0].revision !== revision || workflows[0].saved !== true) return null;

      const selectedSchema = data.selectedBackendSchema;
      if (!isRecord(selectedSchema) || selectedSchema.ok !== true || !isRecord(selectedSchema.schema) ||
        !Array.isArray(data.backends) || !data.backends.every((item) => isRecord(item) &&
          typeof item.id === "string" && typeof item.selected === "boolean")) return null;
      const schema = selectedSchema.schema;
      if (typeof schema.backendId !== "string" || schema.backendId.length === 0 ||
        schema.workflowId !== workflowId || schema.workflowRevision !== revision ||
        schema.source !== "selected-backend-saved" || schema.schemaScope !== "selected-workflow") return null;
      const selected = data.backends.filter((item) => isRecord(item) && item.selected === true);
      if (selected.length !== 1 || selected[0].id !== schema.backendId) return null;

      if (typeof schema.capturedAt !== "string") return null;
      const capturedAt = Date.parse(schema.capturedAt);
      const age = Date.now() - capturedAt;
      if (!Number.isFinite(capturedAt) || age < 0 || age >= 5 * 60 * 1000 ||
        !isRecord(schema.objectInfo) || Object.keys(schema.objectInfo).length === 0) return null;
      const json = JSON.stringify(schema.objectInfo);
      if (typeof json !== "string" || Buffer.byteLength(json, "utf8") > 200 * 1024) return null;

      return {
        backendId: schema.backendId,
        source: "selected-backend-saved",
        currentForSelection: true,
        capturedAt: schema.capturedAt,
        objectInfoFingerprint: fingerprintComfySchema(schema.objectInfo),
        objectInfo: schema.objectInfo,
      };
    } catch {
      return null;
    }
  };
}
