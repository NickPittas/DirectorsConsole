# LTX-2.5 image-to-video source capture

Byte-preserving capture of the pinned Comfy-Org workflow source for research. The JSON file is the upstream artifact; this note records visible source metadata only.

## Provenance and format

- Repository: `Comfy-Org/workflow_templates`
- Commit: `cd0fcd08bc84a242f6073c5440d85a3f0eb817a9`
- File: `templates/video_ltx2_5_i2v.json`
- Raw source: https://raw.githubusercontent.com/Comfy-Org/workflow_templates/cd0fcd08bc84a242f6073c5440d85a3f0eb817a9/templates/video_ltx2_5_i2v.json
- Captured size: 128819 bytes
- SHA-256: `03b136ba0ad752c1e91e496a23fa4f4826ef881777d591dc9129c459922e7dac`
- Format: native ComfyUI UI workflow JSON (`nodes`, `links`, and `definitions.subgraphs`); it is not an API `prompt` object.
- Embedded subgraph: `Image to Video (LTX-2.5)`; one subgraph definition is present.

## Task and first-frame controls

- Root node `#398` is the subgraph instance (`type` UUID `6e397a2b-68f7-48f6-8930-f3a5491a163c`). Its promoted `first_frame` input is typed `IMAGE,MASK`.
- Root node `#395`, class `LoadImage`, title `Load First Frame`, connects its image output to that `first_frame` control.
- A first-frame image is required by the graph. The current `LoadImage` widget value, `neon_cyborg_portrait.png`, is the workflow's example filename; this JSON capture does not include image bytes.
- Visible root defaults include duration `5`, width `1280`, height `720`, and frame rate `24`.
- The root `prompt_enhance` value is `false`. The upstream note describes enhancement as optional; its separate model is `gemma4_e2b_it_int8_convrot.safetensors`.

## Model and loader nodes recorded in the graph

- `UNETLoader`: `diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors`
- `CLIPLoader` (main text encoder): `text_encoders/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors`
- `CLIPLoader` (optional prompt enhancer): `text_encoders/gemma4_e2b_it_int8_convrot.safetensors`
- `VAELoader` (video): `vae/ltx-2.5-video-vae-bf16.safetensors`
- `VAELoader` (audio): `vae/ltx-2.5-audio-vae-bf16.safetensors`
- `LatentUpscaleModelLoader`: `latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors`

## Sampler values preserved from the subgraph

- `KSamplerSelect` nodes `#352` and `#341`: `euler_ancestral`.
- `ManualSigmas` node `#397`: `1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0`.
- `ManualSigmas` node `#396`: `0.85, 0.7250, 0.4219, 0.0`.

## Scope and unknowns

This is a source capture, not a converted graph, catalog entry, executable recipe, or readiness claim. No model availability, installed-node compatibility, import behavior, or runtime behavior was checked. No Kamino access or render was performed.
