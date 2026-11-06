import { bindExactLoaderPaths } from "./klein-loader-bindings.js";

const SOURCE_GRAPH_SHA256 = "416fdaf93f35e90c41afc531f05fbfd234ff55c61bd99f643527b2204324da62";

const LOADER_TARGETS = [
  {
    classType: "UNETLoader",
    inputName: "unet_name",
    sourceFilename: "fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors",
  },
  {
    classType: "CLIPLoader",
    inputName: "clip_name",
    sourceFilename: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
  },
  {
    classType: "VAELoader",
    inputName: "vae_name",
    sourceFilename: "minimax_h3_video_vae_int8_convrot.safetensors",
  },
  {
    classType: "VAELoader",
    inputName: "vae_name",
    sourceFilename: "minimax_h3_audio_vae_fp32.safetensors",
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function nodeInputs(
  workflow: Record<string, unknown>,
  nodeId: string,
  classType: string,
): Record<string, unknown> | null {
  const node = workflow[nodeId];
  return isRecord(node) && node.class_type === classType && isRecord(node.inputs) ? node.inputs : null;
}

function isModelLink(value: unknown, nodeId: string): boolean {
  return Array.isArray(value) && value.length === 2 && value[0] === nodeId && value[1] === 0;
}

function failed(): { ok: false; reason: string } {
  return { ok: false, reason: "Invalid or unsupported FastH3 T2V recipe." };
}

export function bindFastH3T2vRecipe(
  input: {
    recipeId: string;
    sourceGraphFingerprint: string;
    workflow: Record<string, unknown>;
  },
  objectInfo: Record<string, unknown>,
): ReturnType<typeof bindExactLoaderPaths> {
  try {
    if (
      !isRecord(input) ||
      input.recipeId !== "minimax-fasth3-t2v" ||
      input.sourceGraphFingerprint !== SOURCE_GRAPH_SHA256 ||
      !isRecord(input.workflow) ||
      !isRecord(objectInfo)
    ) {
      return failed();
    }

    const workflow = input.workflow;
    for (const node of Object.values(workflow)) {
      if (!isRecord(node) || typeof node.class_type !== "string" || !isRecord(node.inputs)) return failed();
      if (node.class_type === "LoraLoaderModelOnly") return failed();
    }

    const unet = nodeInputs(workflow, "105:6", "UNETLoader");
    const scheduler = nodeInputs(workflow, "105:9", "BasicScheduler");
    const sampler = nodeInputs(workflow, "105:17", "KSamplerSelect");
    const sigmaShift = nodeInputs(workflow, "105:148", "MiniMaxH3SigmaShift");
    const attention = nodeInputs(workflow, "105:128", "ModelAttentionBackend");
    const sparseAttention = nodeInputs(workflow, "105:127", "BlockSparseAttention");
    const guider = nodeInputs(workflow, "105:16", "BasicGuider");
    const video = nodeInputs(workflow, "105:104", "MiniMaxH3ImageToVideo");

    if (
      !unet || unet.unet_name !== "fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors" ||
      !scheduler || scheduler.scheduler !== "simple" || scheduler.steps !== 8 || scheduler.denoise !== 1 ||
      !isModelLink(scheduler.model, "105:127") ||
      !sampler || sampler.sampler_name !== "res_multistep" ||
      !sigmaShift || sigmaShift.shift_video !== 10 || sigmaShift.shift_audio !== 3 ||
      !isModelLink(sigmaShift.model, "105:6") ||
      !attention || attention.attention !== "comfy kitchen attention" ||
      !isModelLink(attention.model, "105:148") ||
      !sparseAttention || sparseAttention.selection !== "vsa" || sparseAttention.start_percent !== 0.2 ||
      sparseAttention.end_percent !== 1 || sparseAttention["selection.keep_percent"] !== 10 ||
      !isModelLink(sparseAttention.model, "105:128") ||
      !guider || !isModelLink(guider.model, "105:127") ||
      !video || Object.hasOwn(video, "first_frame") || Object.hasOwn(video, "last_frame")
    ) {
      return failed();
    }

    return bindExactLoaderPaths(workflow, objectInfo, LOADER_TARGETS);
  } catch {
    return failed();
  }
}
