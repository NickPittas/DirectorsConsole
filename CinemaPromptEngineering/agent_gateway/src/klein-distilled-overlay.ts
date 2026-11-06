import type { RecipeExportInput } from "./recipe-export-input.js";

export function applyKleinDistilledOverlay(
  input: RecipeExportInput,
): { ok: true; workflow: Record<string, unknown> } | { ok: false; reason: string } {
  const fail = (reason: string) => ({ ok: false as const, reason });
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const hasValues = (value: unknown, expected: readonly unknown[]) =>
    Array.isArray(value) && value.length === expected.length &&
    expected.every((entry, index) => value[index] === entry);

  try {
    if (
      input.recipeId !== "flux-2-klein-4b-distilled-t2i" ||
      input.sourceGraphFingerprint !== "cd4a29b0be6f71a7391f2f023e69dfc3b47d7da9f2aa215b4c8b8e17c2eea107" ||
      input.supportStatus !== "source_verified_runtime_unverified"
    ) return fail("Recipe identity mismatch.");

    const overlay = input.applicationOverlay;
    if (!isRecord(overlay) || overlay.status !== "select_distilled_subgraph" ||
      overlay.selectedSubgraphId !== "a67caa28-5f85-4917-8396-36004960dd30" ||
      !Array.isArray(overlay.operations) || overlay.operations.length !== 2) {
      return fail("Application overlay mismatch.");
    }
    const operation = overlay.operations[0];
    if (!isRecord(operation) || operation.operation !== "remove_route" ||
      !hasValues(operation.nodeIds, [75, 9]) || !hasValues(operation.linkIds, [154, 155]) ||
      operation.subgraphDefinitionId !== "7b34ab90-36f9-45ba-a665-71d418f0df18" ||
      operation.expectedSubgraphName !== "Text to Image (FLUX.2 Klein 4B)") {
      return fail("Application overlay mismatch.");
    }

    const activation = overlay.operations[1];
    if (!isRecord(activation) || activation.operation !== "activate_route" ||
      !hasValues(activation.nodeIds, [77, 78]) || activation.expectedMode !== 4 || activation.mode !== 0) {
      return fail("Application overlay mismatch.");
    }

    const workflow = input.workflow;
    if (!isRecord(workflow) || !Array.isArray(workflow.nodes) || !Array.isArray(workflow.links) ||
      !isRecord(workflow.definitions) || !Array.isArray(workflow.definitions.subgraphs)) {
      return fail("Workflow graph mismatch.");
    }

    const nodes: Record<string, unknown>[] = [];
    const nodeIds = new Set<number>();
    for (const node of workflow.nodes) {
      if (!isRecord(node) || !Number.isSafeInteger(node.id) || typeof node.type !== "string" ||
        nodeIds.has(node.id as number)) return fail("Workflow graph mismatch.");
      nodeIds.add(node.id as number);
      nodes.push(node);
    }

    const links: unknown[][] = [];
    const linkIds = new Set<number>();
    for (const link of workflow.links) {
      if (!Array.isArray(link) || link.length !== 6 || !Number.isSafeInteger(link[0]) ||
        !Number.isSafeInteger(link[1]) || !Number.isSafeInteger(link[2]) ||
        !Number.isSafeInteger(link[3]) || !Number.isSafeInteger(link[4]) ||
        typeof link[5] !== "string" || linkIds.has(link[0] as number)) {
        return fail("Workflow graph mismatch.");
      }
      linkIds.add(link[0] as number);
      links.push(link);
    }

    const definitions = workflow.definitions.subgraphs;
    if (!definitions.every(isRecord)) return fail("Workflow graph mismatch.");
    const baseId = "7b34ab90-36f9-45ba-a665-71d418f0df18";
    const distilledId = "a67caa28-5f85-4917-8396-36004960dd30";
    const baseName = "Text to Image (FLUX.2 Klein 4B)";
    const distilledName = "Text to Image (FLUX.2 Klein 4B Distilled)";
    const baseDefinitions = definitions.filter((definition) => definition.id === baseId || definition.name === baseName);
    const distilledDefinitions = definitions.filter((definition) => definition.id === distilledId || definition.name === distilledName);
    if (baseDefinitions.length !== 1 || baseDefinitions[0].id !== baseId || baseDefinitions[0].name !== baseName ||
      distilledDefinitions.length !== 1 || distilledDefinitions[0].id !== distilledId ||
      distilledDefinitions[0].name !== distilledName) return fail("Workflow graph mismatch.");

    const node = (id: number) => nodes.find((entry) => entry.id === id);
    const hasInput = (entry: Record<string, unknown> | undefined, name: string, type: string, link: number) =>
      !!entry && Array.isArray(entry.inputs) && entry.inputs.length === 1 && isRecord(entry.inputs[0]) &&
      entry.inputs[0].name === name && entry.inputs[0].type === type && entry.inputs[0].link === link;
    const hasOutput = (entry: Record<string, unknown> | undefined, name: string, type: string, links: number[]) =>
      !!entry && Array.isArray(entry.outputs) && entry.outputs.length === 1 && isRecord(entry.outputs[0]) &&
      entry.outputs[0].name === name && entry.outputs[0].type === type && hasValues(entry.outputs[0].links, links);
    const hasNoInputs = (entry: Record<string, unknown> | undefined) =>
      !!entry && Array.isArray(entry.inputs) && entry.inputs.length === 0;
    const hasNoOutputs = (entry: Record<string, unknown> | undefined) =>
      !!entry && Array.isArray(entry.outputs) && entry.outputs.length === 0;

    const baseRoute = node(75);
    const baseSave = node(9);
    const prompt = node(76);
    const distilledRoute = node(77);
    const distilledSave = node(78);
    if (baseRoute?.type !== baseId || baseSave?.type !== "SaveImage" ||
      prompt?.type !== "PrimitiveStringMultiline" || distilledRoute?.type !== distilledId ||
      distilledSave?.type !== "SaveImage" || distilledRoute.mode !== 4 || distilledSave.mode !== 4 ||
      !hasInput(baseRoute, "text", "STRING", 155) || !hasOutput(baseRoute, "IMAGE", "IMAGE", [154]) ||
      !hasInput(baseSave, "images", "IMAGE", 154) || !hasNoOutputs(baseSave) ||
      !hasNoInputs(prompt) || !hasOutput(prompt, "STRING", "STRING", [155, 157]) ||
      !hasInput(distilledRoute, "text", "STRING", 157) || !hasOutput(distilledRoute, "IMAGE", "IMAGE", [156]) ||
      !hasInput(distilledSave, "images", "IMAGE", 156) || !hasNoOutputs(distilledSave)) {
      return fail("Workflow graph mismatch.");
    }

    const exactLink = (expected: readonly unknown[]) => {
      const matches = links.filter((link) => link[0] === expected[0]);
      return matches.length === 1 && hasValues(matches[0], expected);
    };
    const incidentToRemoved = links.filter((link) => link[1] === 75 || link[3] === 75 || link[1] === 9 || link[3] === 9);
    if (!hasValues(incidentToRemoved.map((link) => link[0]).sort(), [154, 155]) ||
      !exactLink([154, 75, 0, 9, 0, "IMAGE"]) || !exactLink([155, 76, 0, 75, 0, "STRING"]) ||
      !exactLink([156, 77, 0, 78, 0, "IMAGE"]) || !exactLink([157, 76, 0, 77, 0, "STRING"])) {
      return fail("Workflow graph mismatch.");
    }

    for (const entry of nodes) {
      if (!Array.isArray(entry.outputs) || !Array.isArray(entry.inputs)) return fail("Workflow graph mismatch.");
      for (const output of entry.outputs) {
        if (!isRecord(output) || !Array.isArray(output.links)) return fail("Workflow graph mismatch.");
        if (output.links.some((id) =>
          (id === 154 && (entry.id !== 75 || !hasValues(output.links, [154]))) ||
          (id === 155 && (entry.id !== 76 || !hasValues(output.links, [155, 157]))) ||
          (id === 156 && (entry.id !== 77 || !hasValues(output.links, [156]))) ||
          (id === 157 && (entry.id !== 76 || !hasValues(output.links, [155, 157]))))) {
          return fail("Workflow graph mismatch.");
        }
      }
      for (const inputPort of entry.inputs) {
        if (!isRecord(inputPort)) return fail("Workflow graph mismatch.");
        if ((inputPort.link === 154 && entry.id !== 9) || (inputPort.link === 155 && entry.id !== 75) ||
          (inputPort.link === 156 && entry.id !== 78) || (inputPort.link === 157 && entry.id !== 77)) {
          return fail("Workflow graph mismatch.");
        }
      }
    }

    const cloned = structuredClone(workflow);
    const clonedNodes = cloned.nodes as Record<string, unknown>[];
    cloned.nodes = clonedNodes.filter((entry) => entry.id !== 75 && entry.id !== 9);
    for (const entry of cloned.nodes as Record<string, unknown>[]) {
      if (entry.id === 77 || entry.id === 78) entry.mode = 0;
    }
    cloned.links = (cloned.links as unknown[][]).filter((link) => link[0] !== 154 && link[0] !== 155);
    for (const entry of cloned.nodes as Record<string, unknown>[]) {
      for (const output of entry.outputs as Record<string, unknown>[]) {
        output.links = (output.links as number[]).filter((id) => id !== 154 && id !== 155);
      }
    }
    (cloned.definitions as Record<string, unknown>).subgraphs =
      ((cloned.definitions as Record<string, unknown>).subgraphs as Record<string, unknown>[])
        .filter((definition) => definition.id !== baseId);
    return { ok: true, workflow: cloned };
  } catch {
    return fail("Workflow graph mismatch.");
  }
}
