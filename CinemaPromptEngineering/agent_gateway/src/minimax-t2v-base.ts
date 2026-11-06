type MinimaxBaseResult =
  | {
      ok: true;
      workflow: Record<string, unknown>;
      removedNodeIds: string[];
      readiness: "not_verified";
    }
  | { ok: false; reason: string };

type MinimaxBaseRoute = {
  recipeId: string;
  sourceGraphFingerprint: string;
  nodeCount: number;
  baseUNETId: string;
  loraId: string;
  modelSwitchId: string;
  stepSwitchId: string;
  baseStepsId: string;
  turboStepsId: string;
  enabledId: string;
  schedulerId: string;
  guiderId: string;
  generatorId: string;
  frameRoute: { firstFrameImageId: string } | null;
};

const MINIMAX_BASE_ROUTES: readonly MinimaxBaseRoute[] = [
  {
    recipeId: "minimax-h3-fl2va-t2v",
    sourceGraphFingerprint: "8a5eb23b0dd2df9e99b6f7af9684e770f188feca820d241364b729e01dedf3b6",
    nodeCount: 23,
    baseUNETId: "140:127",
    loraId: "140:134",
    modelSwitchId: "140:135",
    stepSwitchId: "140:136",
    baseStepsId: "140:137",
    turboStepsId: "140:138",
    enabledId: "140:139",
    schedulerId: "140:124",
    guiderId: "140:126",
    generatorId: "140:131",
    frameRoute: null,
  },
  {
    recipeId: "minimax-h3-fl2va-i2v",
    sourceGraphFingerprint: "34ee39544808fd3b0dc8de9df082940d4d41c3771beb80d3988c1ea5531cec0d",
    nodeCount: 26,
    baseUNETId: "105:6",
    loraId: "105:121",
    modelSwitchId: "105:122",
    stepSwitchId: "105:123",
    baseStepsId: "105:124",
    turboStepsId: "105:125",
    enabledId: "105:126",
    schedulerId: "105:9",
    guiderId: "105:16",
    generatorId: "105:104",
    frameRoute: { firstFrameImageId: "114" },
  },
];

export function applyMinimaxBaseRoute(input: {
  recipeId: string;
  sourceGraphFingerprint: string;
  workflow: Record<string, unknown>;
}): MinimaxBaseResult {
  const fail = (reason: string): MinimaxBaseResult => ({ ok: false, reason });
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const hasLink = (value: unknown, nodeId: string, output: number) =>
    Array.isArray(value) && value.length === 2 && value[0] === nodeId && value[1] === output;

  try {
    const route = isRecord(input)
      ? MINIMAX_BASE_ROUTES.find((candidate) =>
          candidate.recipeId === input.recipeId &&
          candidate.sourceGraphFingerprint === input.sourceGraphFingerprint)
      : undefined;
    if (!route) return fail("Recipe identity mismatch.");

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
    const unetInputs = inputsFor(route.baseUNETId, "UNETLoader");
    const loraInputs = inputsFor(route.loraId, "LoraLoaderModelOnly");
    const branchInputs = inputsFor(route.modelSwitchId, "ComfySwitchNode");
    const stepsBranchInputs = inputsFor(route.stepSwitchId, "ComfySwitchNode");
    const baseStepsInputs = inputsFor(route.baseStepsId, "PrimitiveInt");
    const turboStepsInputs = inputsFor(route.turboStepsId, "PrimitiveInt");
    const switchValueInputs = inputsFor(route.enabledId, "PrimitiveBoolean");
    const schedulerInputs = inputsFor(route.schedulerId, "BasicScheduler");
    const guiderInputs = inputsFor(route.guiderId, "BasicGuider");
    const generatorInputs = inputsFor(route.generatorId, "MiniMaxH3ImageToVideo");
    const frameRouteValid = route.frameRoute
      ? hasLink(generatorInputs?.first_frame, route.frameRoute.firstFrameImageId, 0) &&
        !Object.prototype.hasOwnProperty.call(generatorInputs, "last_frame") &&
        typeof inputsFor(route.frameRoute.firstFrameImageId, "LoadImage")?.image === "string"
      : generatorInputs !== undefined &&
        !Object.prototype.hasOwnProperty.call(generatorInputs, "first_frame") &&
        !Object.prototype.hasOwnProperty.call(generatorInputs, "last_frame");

    if (!unetInputs ||
      unetInputs.unet_name !== "minimax_h3_fl2va_pruned_int8_convrot.safetensors" ||
      !loraInputs ||
      loraInputs.lora_name !== "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors" ||
      loraInputs.strength_model !== 1 || !hasLink(loraInputs.model, route.baseUNETId, 0) ||
      !switchValueInputs || switchValueInputs.value !== false ||
      !baseStepsInputs || baseStepsInputs.value !== 20 ||
      !turboStepsInputs || turboStepsInputs.value !== 8 ||
      !branchInputs || Object.keys(branchInputs).length !== 3 ||
      !hasLink(branchInputs.switch, route.enabledId, 0) ||
      !hasLink(branchInputs.on_false, route.baseUNETId, 0) ||
      !hasLink(branchInputs.on_true, route.loraId, 0) ||
      !stepsBranchInputs || Object.keys(stepsBranchInputs).length !== 3 ||
      !hasLink(stepsBranchInputs.switch, route.enabledId, 0) ||
      !hasLink(stepsBranchInputs.on_false, route.baseStepsId, 0) ||
      !hasLink(stepsBranchInputs.on_true, route.turboStepsId, 0) ||
      !schedulerInputs || schedulerInputs.scheduler !== "simple" || schedulerInputs.denoise !== 1 ||
      !hasLink(schedulerInputs.model, route.modelSwitchId, 0) ||
      !hasLink(schedulerInputs.steps, route.stepSwitchId, 0) ||
      !guiderInputs || !hasLink(guiderInputs.model, route.modelSwitchId, 0) ||
      !generatorInputs || !frameRouteValid) {
      return fail("Workflow graph mismatch.");
    }

    const expectedReferences = [
      [route.modelSwitchId, "on_true", route.loraId, 0],
      [route.modelSwitchId, "switch", route.enabledId, 0],
      [route.stepSwitchId, "switch", route.enabledId, 0],
      [route.stepSwitchId, "on_true", route.turboStepsId, 0],
      [route.schedulerId, "model", route.modelSwitchId, 0],
      [route.guiderId, "model", route.modelSwitchId, 0],
      [route.schedulerId, "steps", route.stepSwitchId, 0],
    ] as const;
    const removedNodeIds = new Set([
      route.loraId,
      route.modelSwitchId,
      route.stepSwitchId,
      route.turboStepsId,
      route.enabledId,
    ]);
    const observedReferences: unknown[][] = [];
    for (const [consumerId, entry] of Object.entries(workflow)) {
      const inputs = (entry as Record<string, unknown>).inputs as Record<string, unknown>;
      for (const [inputName, value] of Object.entries(inputs)) {
        if (Array.isArray(value) && removedNodeIds.has(value[0] as string)) {
          if (value.length !== 2 || !Number.isInteger(value[1])) return fail("Workflow graph mismatch.");
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
    const clonedScheduler = cloned[route.schedulerId] as Record<string, unknown>;
    const clonedGuider = cloned[route.guiderId] as Record<string, unknown>;
    (clonedScheduler.inputs as Record<string, unknown>).model = [route.baseUNETId, 0];
    (clonedScheduler.inputs as Record<string, unknown>).steps = [route.baseStepsId, 0];
    (clonedGuider.inputs as Record<string, unknown>).model = [route.baseUNETId, 0];
    for (const id of removedNodeIds) delete cloned[id];

    return {
      ok: true,
      workflow: cloned,
      removedNodeIds: [...removedNodeIds],
      readiness: "not_verified",
    };
  } catch {
    return fail("Workflow graph mismatch.");
  }
}
