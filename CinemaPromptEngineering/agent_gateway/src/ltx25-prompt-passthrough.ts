type PromptPassthroughResult =
  | {
      ok: true;
      workflow: Record<string, unknown>;
      removedNodeIds: string[];
      readiness: "not_verified";
    }
  | { ok: false; reason: string };

export function applyLtx25PromptPassthrough(input: {
  recipeId: string;
  sourceGraphFingerprint: string;
  workflow: Record<string, unknown>;
}): PromptPassthroughResult {
  const fail = (reason: string): PromptPassthroughResult => ({ ok: false, reason });
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const hasLink = (value: unknown, nodeId: string, output: number) =>
    Array.isArray(value) && value.length === 2 && value[0] === nodeId && value[1] === output;

  try {
    if (!isRecord(input)) return fail("Recipe identity mismatch.");
    const route = input.recipeId === "ltx-2.5-distilled-t2v" &&
        input.sourceGraphFingerprint === "eb1a415a467a2ef1ea63cdb4e79a35315e29c971b1e4f7646ed149a2971fdbd7"
      ? { prefix: "405", nodeCount: 44 }
      : input.recipeId === "ltx-2.5-distilled-i2v" &&
          input.sourceGraphFingerprint === "03b136ba0ad752c1e91e496a23fa4f4826ef881777d591dc9129c459922e7dac"
        ? { prefix: "398", nodeCount: 50 }
        : undefined;
    if (!route) return fail("Recipe identity mismatch.");
    const nodeId = (localId: number) => `${route.prefix}:${localId}`;

    const workflow = input.workflow;
    if (!isRecord(workflow) || Object.keys(workflow).length !== route.nodeCount ||
      !Object.values(workflow).every((node) =>
        isRecord(node) && typeof node.class_type === "string" && isRecord(node.inputs))) {
      return fail("Workflow graph mismatch.");
    }

    const inputsFor = (id: string, classType: string) => {
      const entry = workflow[id];
      return isRecord(entry) && entry.class_type === classType && isRecord(entry.inputs)
        ? entry.inputs
        : undefined;
    };
    const promptInputs = inputsFor(nodeId(376), "PrimitiveStringMultiline");
    const enablePromptEnhanceInputs = inputsFor(nodeId(383), "PrimitiveBoolean");
    const branchInputs = inputsFor(nodeId(382), "ComfySwitchNode");
    const generatedPromptInputs = inputsFor(nodeId(380), "TextGenerateLTX2Prompt");
    const encoderInputs = inputsFor(nodeId(393), "CLIPLoader");
    const positiveConditioningInputs = inputsFor(nodeId(364), "CLIPTextEncode");
    const promptPreviewInputs = inputsFor(nodeId(381), "PreviewAny");

    if (!promptInputs || typeof promptInputs.value !== "string" ||
      !enablePromptEnhanceInputs || enablePromptEnhanceInputs.value !== false || !branchInputs) {
      return fail("Workflow graph mismatch.");
    }

    // ComfyUI v0.43.2 selects on_false for a false switch: https://raw.githubusercontent.com/Comfy-Org/ComfyUI/v0.43.2/comfy_extras/nodes_logic.py
    if (Object.keys(branchInputs).length !== 3 ||
      !hasLink(branchInputs.switch, nodeId(383), 0) ||
      !hasLink(branchInputs.on_false, nodeId(376), 0) ||
      !hasLink(branchInputs.on_true, nodeId(380), 0) ||
      !generatedPromptInputs ||
      !hasLink(generatedPromptInputs.clip, nodeId(393), 0) ||
      !hasLink(generatedPromptInputs.prompt, nodeId(376), 0) ||
      !encoderInputs || encoderInputs.clip_name !== "gemma4_e2b_it_int8_convrot.safetensors" ||
      !positiveConditioningInputs || !hasLink(positiveConditioningInputs.text, nodeId(382), 0) ||
      !promptPreviewInputs || !hasLink(promptPreviewInputs.source, nodeId(382), 0) ||
      (route.prefix === "398" && (
        !hasLink(generatedPromptInputs.image, nodeId(350), 0) ||
        !inputsFor("395", "LoadImage") ||
        inputsFor("395", "LoadImage")?.image !== "neon_cyborg_portrait.png" ||
        !hasLink(inputsFor(nodeId(351), "ResizeImageMaskNode")?.input, "395", 0) ||
        !hasLink(inputsFor(nodeId(350), "LTXVPreprocess")?.image, nodeId(351), 0) ||
        !hasLink(inputsFor(nodeId(357), "LTXVImgToVideoInplace")?.image, nodeId(350), 0) ||
        !hasLink(inputsFor(nodeId(349), "LTXVImgToVideoInplace")?.image, nodeId(350), 0)
      ))) {
      return fail("Workflow graph mismatch.");
    }

    const expectedReferences = [
      [nodeId(364), "text", nodeId(382), 0],
      [nodeId(381), "source", nodeId(382), 0],
      [nodeId(382), "switch", nodeId(383), 0],
      [nodeId(382), "on_true", nodeId(380), 0],
      [nodeId(380), "clip", nodeId(393), 0],
    ] as const;
    const branchNodeIds = new Set([nodeId(382), nodeId(383), nodeId(380), nodeId(393)]);
    const observedReferences: unknown[][] = [];
    for (const [consumerId, entry] of Object.entries(workflow)) {
      const inputs = (entry as Record<string, unknown>).inputs as Record<string, unknown>;
      for (const [inputName, value] of Object.entries(inputs)) {
        if (Array.isArray(value) && branchNodeIds.has(value[0] as string)) {
          if (value.length !== 2) return fail("Workflow graph mismatch.");
          observedReferences.push([consumerId, inputName, value[0], value[1]]);
        }
      }
    }
    if (observedReferences.length !== expectedReferences.length ||
      !expectedReferences.every((expected) =>
        observedReferences.filter((observed) =>
          expected.every((value, index) => observed[index] === value)).length === 1)) {
      return fail("Workflow graph mismatch.");
    }

    const cloned = structuredClone(workflow);
    const clonedPositive = cloned[nodeId(364)] as Record<string, unknown>;
    const clonedPreview = cloned[nodeId(381)] as Record<string, unknown>;
    (clonedPositive.inputs as Record<string, unknown>).text = [nodeId(376), 0];
    (clonedPreview.inputs as Record<string, unknown>).source = [nodeId(376), 0];
    delete cloned[nodeId(382)];
    delete cloned[nodeId(383)];
    delete cloned[nodeId(380)];
    delete cloned[nodeId(393)];

    return {
      ok: true,
      workflow: cloned,
      removedNodeIds: [nodeId(382), nodeId(383), nodeId(380), nodeId(393)],
      readiness: "not_verified",
    };
  } catch {
    return fail("Workflow graph mismatch.");
  }
}
