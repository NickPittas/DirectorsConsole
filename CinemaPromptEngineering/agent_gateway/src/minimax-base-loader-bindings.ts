import { bindExactLoaderPaths } from "./klein-loader-bindings.js";

const TARGETS = [
  {
    classType: "UNETLoader",
    inputName: "unet_name",
    sourceFilename: "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
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

function failed(): { ok: false; reason: string } {
  return { ok: false, reason: "Unable to bind recipe loader paths." };
}

export function bindMinimaxBaseLoaderPaths(
  workflow: Record<string, unknown>,
  objectInfo: Record<string, unknown>,
) {
  try {
    if (!isRecord(workflow)) return failed();
    for (const node of Object.values(workflow)) {
      if (!isRecord(node) || typeof node.class_type !== "string") return failed();
      if (node.class_type === "LoraLoaderModelOnly") return failed();
      if (!isRecord(node.inputs)) return failed();
    }
    return bindExactLoaderPaths(workflow, objectInfo, TARGETS);
  } catch {
    return failed();
  }
}
