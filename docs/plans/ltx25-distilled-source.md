# LTX-2.5 distilled T2V source capture

## Pinned source

- Official tutorial: [LTX-2.5 in ComfyUI](https://docs.comfy.org/tutorials/video/ltx/ltx-2-5), section **LTX-2.5 Text to Video (T2V)**.
- Official workflow repository: [Comfy-Org/workflow_templates](https://github.com/Comfy-Org/workflow_templates).
- Exact file and pin: [`templates/video_ltx2_5_t2v.json` at `cd0fcd08bc84a242f6073c5440d85a3f0eb817a9`](https://github.com/Comfy-Org/workflow_templates/blob/cd0fcd08bc84a242f6073c5440d85a3f0eb817a9/templates/video_ltx2_5_t2v.json).
- Raw pinned URL: <https://raw.githubusercontent.com/Comfy-Org/workflow_templates/cd0fcd08bc84a242f6073c5440d85a3f0eb817a9/templates/video_ltx2_5_t2v.json>.
- The pinned file exists. It is a ComfyUI workflow JSON with `definitions.subgraphs`; the named subgraph is `Text to Video (LTX-2.5)`.
- License: the repository page advertises MIT. The workflow JSON does not carry a separate file-level license declaration.
- Parent fetched the raw pinned URL directly after delegate completion, preserved its 116,505 bytes at `CinemaPromptEngineering/agent_resources/recipes/ltx-2.5-distilled-t2v/workflow.json`, and parsed the saved JSON.
- Raw SHA-256: `eb1a415a467a2ef1ea63cdb4e79a35315e29c971b1e4f7646ed149a2971fdbd7`.

## Source interface

The internal subgraph binds these model loader nodes:

| Node | Input | Source filename | Supplied live-choice comparison |
| --- | --- | --- | --- |
| `UNETLoader` 384 | `unet_name` | `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors` | Same basename as the advertised int8 choice; the live choice has an `LTX` subfolder prefix that is not present in the source widget value. The graph does not select the BF16 alternative. |
| `CLIPLoader` 387 | `clip_name` | `gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors` | Exact advertised basename match. |
| `VAELoader` 385 | `vae_name` | `ltx-2.5-video-vae-bf16.safetensors` | Exact advertised basename match. |
| `VAELoader` 386 | `vae_name` | `ltx-2.5-audio-vae-bf16.safetensors` | Exact advertised basename match. |
| `LatentUpscaleModelLoader` 371 | `model_name` | `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors` | Exact advertised basename match. |
| `CLIPLoader` 393 | `clip_name` | `gemma4_e2b_it_int8_convrot.safetensors` | Optional prompt-enhancer model; it is not in the supplied live-choice list. |

The source graph's main model and LTX-specific text encoder are the Comfy INT8 ConvRot variants. The supplied live-choice list also advertises BF16 transformer/text-encoder alternatives, but this graph does not bind those alternatives. No quantization substitution or hardware-fit conclusion is implied here. Model `properties.models` entries specify their source folders (`diffusion_models`, `text_encoders`, `vae`, and `latent_upscale_models`).

## Sampler values

Two `SamplerCustomAdvanced` branches are explicitly wired to their own sampler, dual-CFG guider, and manual sigma nodes:

| Sampler branch | Sampler node / selection | Guider node / raw widget values | Manual sigma node / values |
| --- | --- | --- | --- |
| A | `SamplerCustomAdvanced` 344; `KSamplerSelect` 352 = `euler_ancestral` | `LTXVDualCFGGuider` 388 = `[1, 1]` | `ManualSigmas` 404 = `1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0` |
| B | `SamplerCustomAdvanced` 368; `KSamplerSelect` 341 = `euler_ancestral` | `LTXVDualCFGGuider` 391 = `[1, 1]` | `ManualSigmas` 395 = `0.85, 0.7250, 0.4219, 0.0` |

The source has no separate integer `steps` field on these sampler nodes. The schedules contain 9 and 4 sigma values respectively (8 and 3 adjacent intervals). The guider values above are recorded as raw `widgets_values`; this note does not assign labels to those two values.

## Parent verification after capture

The delegate could not obtain byte-faithful source through text extraction. Parent resolved that blocker with a direct raw-byte fetch. Manual offline conversion using the pinned comfy-cli 1.22.0 helper and the real Kamino schema returned 44 API nodes. The promoted prompt-enhancement Boolean is false, although its optional encoder remains in the exported graph. No render, model loading, missing-model exemption, file-identity proof, or end-to-end readiness is claimed. Catalog registration and exact loader path binding remain separate work.
