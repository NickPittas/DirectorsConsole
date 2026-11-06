import { fingerprintComfySchema } from "./comfy-cli.js";
import type { ApplicationCommandDispatcher, ApplicationSessionScope } from "./contracts.js";

export interface RecipeExportInput {
  recipeId: string;
  sourceGraphFingerprint: string;
  recipeFingerprint: string;
  backendId: string;
  capturedAt: string;
  objectInfoFingerprint: string;
  workflow: Record<string, unknown>;
  objectInfo: Record<string, unknown>;
  applicationOverlay: Record<string, unknown>;
  supportStatus: string;
  selectedHandoffId: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9][a-z0-9.-]{0,63}$/.test(value);
const isReferenceId = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 256 && !value.includes("\0");
const isHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

function isFreshCapture(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const age = Date.now() - Date.parse(value);
  return Number.isFinite(age) && age >= 0 && age < 5 * 60 * 1000;
}

export function createRecipeExportInputGetter(scope: ApplicationSessionScope & { sessionId: string },
  dispatch: ApplicationCommandDispatcher,
  expectedConsoleBindingId?: string,
): (recipeId: string, expectedSourceGraphFingerprint: string) => Promise<RecipeExportInput | null> {
  const { bridgeId, sessionId, projectIdentity } = scope;
  const send = (command: Parameters<ApplicationCommandDispatcher>[0]["command"]) =>
    dispatch({ bridgeId, sessionId, command });

  return async (recipeId, expectedSourceGraphFingerprint): Promise<RecipeExportInput | null> => {
    if (!isId(recipeId) || !isHash(expectedSourceGraphFingerprint)) return null;
    if (expectedConsoleBindingId !== undefined && !/^[A-Za-z0-9_-]{16,128}$/.test(expectedConsoleBindingId)) return null;

    try {
      const snapshotCommandId = crypto.randomUUID();
      const snapshot = await send({ commandId: snapshotCommandId, projectIdentity,
        action: "get_application_snapshot" } as Parameters<ApplicationCommandDispatcher>[0]["command"]);
      if (
        !isRecord(snapshot) || snapshot.ok !== true || snapshot.error !== undefined ||
        snapshot.commandId !== snapshotCommandId || snapshot.action !== "get_application_snapshot" ||
        !isRecord(snapshot.data) || !isRecord(snapshot.data.project) ||
        expectedConsoleBindingId !== undefined && snapshot.data.consoleBindingId !== expectedConsoleBindingId ||
        typeof snapshot.data.project.revision !== "number" ||
        !Number.isSafeInteger(snapshot.data.project.revision) || snapshot.data.project.revision < 0 ||
        !Array.isArray(snapshot.data.backends) || !snapshot.data.backends.every(isRecord) ||
        !snapshot.data.backends.every((backend) => typeof backend.selected === "boolean")
      ) return null;

      const selectedBackends = snapshot.data.backends.filter((backend) => backend.selected === true);
      if (selectedBackends.length !== 1) return null;
      const backendId = selectedBackends[0].id;
      if (!isReferenceId(backendId)) return null;
      const projectRevision = snapshot.data.project.revision;

      const recipeCommandId = crypto.randomUUID();
      const recipe = await send({ commandId: recipeCommandId, projectIdentity,
        ...(expectedConsoleBindingId !== undefined ? { expectedConsoleBindingId } : {}),
        expectedProjectRevision: projectRevision, action: "get_source_recipe", input: { recipeId },
      } as Parameters<ApplicationCommandDispatcher>[0]["command"]);
      if (
        !isRecord(recipe) || recipe.ok !== true || recipe.error !== undefined ||
        recipe.commandId !== recipeCommandId || recipe.action !== "get_source_recipe" ||
        !isRecord(recipe.data)
      ) return null;

      const details = recipe.data;
      const schemaResult = details.recipeBackendSchema;
      if (
        details.id !== recipeId || !isRecord(details.workflow) ||
        !isRecord(details.sourceGraph) || details.sourceGraph.sha256 !== expectedSourceGraphFingerprint ||
        !isRecord(details.fingerprints) ||
        details.fingerprints.sourceGraph !== expectedSourceGraphFingerprint ||
        !isHash(details.fingerprints.recipe) || !isRecord(details.applicationOverlay) ||
        typeof details.supportStatus !== "string" ||
        (details.selectedHandoffId !== null && !isReferenceId(details.selectedHandoffId)) ||
        (details.targetMatchesSelectedHandoff !== true && details.targetMatchesSelectedHandoff !== null) ||
        !isRecord(schemaResult) || schemaResult.ok !== true || !isRecord(schemaResult.schema)
      ) return null;

      const schema = schemaResult.schema;
      const recipeFingerprint = details.fingerprints.recipe;
      if (
        schema.backendId !== backendId || schema.recipeId !== recipeId ||
        schema.sourceGraphFingerprint !== expectedSourceGraphFingerprint ||
        schema.recipeFingerprint !== recipeFingerprint || schema.source !== "selected-backend-saved" ||
        schema.schemaScope !== "source-recipe" ||
        !isHash(schema.sourceGraphFingerprint) || !isHash(schema.recipeFingerprint) ||
        !isReferenceId(schema.backendId) || !isId(schema.recipeId) || !isFreshCapture(schema.capturedAt) ||
        !isRecord(schema.objectInfo) || Object.keys(schema.objectInfo).length === 0
      ) return null;

      const serializedObjectInfo = JSON.stringify(schema.objectInfo);
      if (
        serializedObjectInfo === undefined ||
        new TextEncoder().encode(serializedObjectInfo).byteLength > 200 * 1024
      ) return null;

      return {
        recipeId, sourceGraphFingerprint: expectedSourceGraphFingerprint, recipeFingerprint, backendId,
        capturedAt: schema.capturedAt, objectInfoFingerprint: fingerprintComfySchema(schema.objectInfo),
        workflow: details.workflow, objectInfo: schema.objectInfo,
        applicationOverlay: details.applicationOverlay, supportStatus: details.supportStatus,
        selectedHandoffId: details.selectedHandoffId,
      };
    } catch {
      return null;
    }
  };
}
