import { bindExactLoaderPaths } from "./klein-loader-bindings.js";

const TARGETS = [
  {
    classType: "UNETLoader",
    inputName: "unet_name",
    sourceFilename: "ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors",
  },
  {
    classType: "CLIPLoader",
    inputName: "clip_name",
    sourceFilename: "gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors",
  },
  { classType: "VAELoader", inputName: "vae_name", sourceFilename: "ltx-2.5-video-vae-bf16.safetensors" },
  { classType: "VAELoader", inputName: "vae_name", sourceFilename: "ltx-2.5-audio-vae-bf16.safetensors" },
  {
    classType: "LatentUpscaleModelLoader",
    inputName: "model_name",
    sourceFilename: "ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
  },
] as const;

export function bindLtx25LoaderPaths(workflow: Record<string, unknown>, objectInfo: Record<string, unknown>) {
  return bindExactLoaderPaths(workflow, objectInfo, TARGETS);
}
