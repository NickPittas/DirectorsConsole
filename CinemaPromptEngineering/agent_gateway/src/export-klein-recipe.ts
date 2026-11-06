import { bindKleinLoaderPaths } from "./klein-loader-bindings.js";
import { bindLtx25LoaderPaths } from "./ltx25-loader-bindings.js";
import { applyKleinDistilledOverlay } from "./klein-distilled-overlay.js";
import { applyLtx25PromptPassthrough } from "./ltx25-prompt-passthrough.js";
import { applyMinimaxBaseRoute } from "./minimax-t2v-base.js";
import { bindMinimaxBaseLoaderPaths } from "./minimax-base-loader-bindings.js";
import { bindFastH3T2vRecipe } from "./fasth3-t2v-bindings.js";
import { runComfyWorkflowExport } from "./comfy-export.js";
import type { RecipeExportInput } from "./recipe-export-input.js";
import { fingerprintComfySchema } from "./comfy-cli.js";

export async function exportPinnedWorkflowRecipe(
  input: RecipeExportInput,
  pythonExecutable: string,
  signal?: AbortSignal,
): Promise<
  | { ok: false; reason: string; readiness: "not_verified" }
  | {
      ok: true;
      workflow: Record<string, unknown>;
      recipeId: string;
      sourceGraphFingerprint: string;
      recipeFingerprint: string;
      backendId: string;
      capturedAt: string;
      objectInfoFingerprint: string;
      exportFingerprint: string;
      bindings:
        | Extract<ReturnType<typeof bindKleinLoaderPaths>, { ok: true }>["bindings"]
        | Extract<ReturnType<typeof bindLtx25LoaderPaths>, { ok: true }>["bindings"]
        | Extract<ReturnType<typeof bindMinimaxBaseLoaderPaths>, { ok: true }>["bindings"]
        | Extract<ReturnType<typeof bindFastH3T2vRecipe>, { ok: true }>["bindings"];
      identityVerification: "not_verified";
      readiness: "not_verified";
    }
> {
  const fail = (reason: string) => ({ ok: false as const, reason, readiness: "not_verified" as const });
  const captureIsFresh = () => {
    const capturedAt = Date.parse(input.capturedAt);
    const age = Date.now() - capturedAt;
    return Number.isFinite(capturedAt) && age >= 0 && age < 5 * 60 * 1000;
  };

  try {
    const isLtxI2v = input.recipeId === "ltx-2.5-distilled-i2v";
    const isLtx = input.recipeId === "ltx-2.5-distilled-t2v" || isLtxI2v;
    const isMinimax = input.recipeId === "minimax-h3-fl2va-t2v" || input.recipeId === "minimax-h3-fl2va-i2v";
    const isFastH3 = input.recipeId === "minimax-fasth3-t2v";
    if (signal?.aborted) return fail("Export cancelled.");
    if (input.objectInfoFingerprint !== fingerprintComfySchema(input.objectInfo)) {
      return fail("Object-info fingerprint mismatch.");
    }
    if (!captureIsFresh()) return fail("Source capture is stale or invalid.");

    let workflow = input.workflow;
    if (isFastH3) {
      const overlay = input.applicationOverlay;
      if (input.sourceGraphFingerprint !== "416fdaf93f35e90c41afc531f05fbfd234ff55c61bd99f643527b2204324da62" ||
        !["unsupported_requires_supported_export", "source_verified_runtime_unverified"].includes(input.supportStatus) ||
        overlay.status !== "no_graph_change" || !Array.isArray(overlay.operations) || overlay.operations.length !== 0) {
        return fail("Pinned recipe identity or overlay rejected.");
      }
    } else if (isLtx) {
      const overlay = input.applicationOverlay;
      const operation = Array.isArray(overlay.operations) ? overlay.operations[0] : undefined;
      const operationRecord = operation !== null && typeof operation === "object" && !Array.isArray(operation)
        ? operation as Record<string, unknown>
        : undefined;
      const expectedSourceGraphFingerprint = isLtxI2v
        ? "03b136ba0ad752c1e91e496a23fa4f4826ef881777d591dc9129c459922e7dac"
        : "eb1a415a467a2ef1ea63cdb4e79a35315e29c971b1e4f7646ed149a2971fdbd7";
      if (input.sourceGraphFingerprint !== expectedSourceGraphFingerprint ||
        !["unsupported_requires_supported_export", "source_verified_runtime_unverified"].includes(input.supportStatus) ||
        overlay.status !== "remove_disabled_prompt_enhancer" || !Array.isArray(overlay.operations) ||
        overlay.operations.length !== 1 || operationRecord?.operation !== "use_original_prompt" ||
        operationRecord.stage !== "after_upstream_api_export") {
        return fail("Pinned recipe identity or overlay rejected.");
      }
    } else if (isMinimax) {
      const overlay = input.applicationOverlay;
      const operation = Array.isArray(overlay.operations) ? overlay.operations[0] : undefined;
      const operationRecord = operation !== null && typeof operation === "object" && !Array.isArray(operation)
        ? operation as Record<string, unknown>
        : undefined;
      const expectedSourceGraphFingerprint = input.recipeId === "minimax-h3-fl2va-t2v"
        ? "8a5eb23b0dd2df9e99b6f7af9684e770f188feca820d241364b729e01dedf3b6"
        : "34ee39544808fd3b0dc8de9df082940d4d41c3771beb80d3988c1ea5531cec0d";
      if (input.sourceGraphFingerprint !== expectedSourceGraphFingerprint ||
        !["unsupported_requires_supported_export", "source_verified_runtime_unverified"].includes(input.supportStatus) ||
        overlay.status !== "remove_disabled_turbo_branch" || !Array.isArray(overlay.operations) ||
        overlay.operations.length !== 1 || operationRecord?.operation !== "use_base_model" ||
        operationRecord.stage !== "after_upstream_api_export" || operationRecord.expectedEnabled !== false ||
        operationRecord.steps !== 20) {
        return fail("Pinned recipe identity or overlay rejected.");
      }
    } else {
      const overlay = applyKleinDistilledOverlay(input);
      if (!overlay.ok) return fail("Pinned recipe overlay rejected.");
      workflow = overlay.workflow;
    }

    const exported = await runComfyWorkflowExport({
      pythonExecutable,
      workflow,
      objectInfo: input.objectInfo,
      signal,
    });
    if (signal?.aborted) return fail("Export cancelled.");
    if (!exported.ok) return fail("Pinned recipe workflow export failed.");

    let finalWorkflow: Record<string, unknown>;
    let bindings:
      | Extract<ReturnType<typeof bindKleinLoaderPaths>, { ok: true }>["bindings"]
      | Extract<ReturnType<typeof bindLtx25LoaderPaths>, { ok: true }>["bindings"]
      | Extract<ReturnType<typeof bindMinimaxBaseLoaderPaths>, { ok: true }>["bindings"]
      | Extract<ReturnType<typeof bindFastH3T2vRecipe>, { ok: true }>["bindings"];
    if (isFastH3) {
      const bound = bindFastH3T2vRecipe({
        recipeId: input.recipeId,
        sourceGraphFingerprint: input.sourceGraphFingerprint,
        workflow: exported.workflow,
      }, input.objectInfo);
      if (!bound.ok) return fail("Pinned FastH3 T2V recipe binding failed.");
      finalWorkflow = bound.workflow;
      bindings = bound.bindings;
    } else if (isMinimax) {
      const pruned = applyMinimaxBaseRoute({
        recipeId: input.recipeId,
        sourceGraphFingerprint: input.sourceGraphFingerprint,
        workflow: exported.workflow,
      });
      if (!pruned.ok) return fail("Pinned recipe base route rejected.");
      const bound = bindMinimaxBaseLoaderPaths(pruned.workflow, input.objectInfo);
      if (!bound.ok) return fail("Pinned recipe loader binding failed.");
      finalWorkflow = bound.workflow;
      bindings = bound.bindings;
    } else if (isLtx) {
      const pruned = applyLtx25PromptPassthrough({
        recipeId: input.recipeId,
        sourceGraphFingerprint: input.sourceGraphFingerprint,
        workflow: exported.workflow,
      });
      if (!pruned.ok) return fail("Pinned recipe prompt branch rejected.");
      const bound = bindLtx25LoaderPaths(pruned.workflow, input.objectInfo);
      if (!bound.ok) return fail("Pinned recipe loader binding failed.");
      finalWorkflow = bound.workflow;
      bindings = bound.bindings;
    } else {
      const bound = bindKleinLoaderPaths(exported.workflow, input.objectInfo);
      if (!bound.ok) return fail("Pinned recipe loader binding failed.");
      finalWorkflow = bound.workflow;
      bindings = bound.bindings;
    }

    const exportFingerprint = fingerprintComfySchema(finalWorkflow);
    if (!captureIsFresh()) return fail("Source capture expired during export.");
    if (signal?.aborted) return fail("Export cancelled.");

    return {
      ok: true,
      workflow: finalWorkflow,
      recipeId: input.recipeId,
      sourceGraphFingerprint: input.sourceGraphFingerprint,
      recipeFingerprint: input.recipeFingerprint,
      backendId: input.backendId,
      capturedAt: input.capturedAt,
      objectInfoFingerprint: input.objectInfoFingerprint,
      exportFingerprint,
      bindings,
      identityVerification: "not_verified",
      readiness: "not_verified",
    };
  } catch {
    return fail("Pinned recipe export failed.");
  }
}
