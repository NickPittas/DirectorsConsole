# MiniMax H3 FL2VA T2V export binding map

Scope: offline mapping only; no graph conversion or runtime/render proof.
Source: `CinemaPromptEngineering/agent_resources/recipes/minimax-h3-fl2va-t2v/workflow.json`.
SHA-256: `8a5eb23b0dd2df9e99b6f7af9684e770f188feca820d241364b729e01dedf3b6` (matches catalog pin).
Export: `/tmp/directors-console-minimax-h3-fl2va-t2v-export.json`; Comfy API v1.22.0, 23 nodes.
Catalog entry labels this `unsupported_requires_supported_export`; this report maps the supplied parent export only.

## Application bindings

Defaults below are the actual parent API export values. Source UI values/defaults are separately called out.

| Role | API binding | Effective export default | Source interface evidence |
|---|---|---|---|
| prompt | `140:131 MiniMaxH3ImageToVideo.prompt` | Text promoted from composite node 140; see `widgets_values_named.prompt` in source (prompt intentionally not copied). | Subgraph input `prompt`/link 197 → inner node 131 `prompt`; catalog binds source node 131. Inner node prompt is a separate sample. |
| duration (seconds) | `140:133 PrimitiveFloat.value` → `140:132.values.a` → `140:131.length` | `5` s; expression converts it to frames. | Subgraph input `value_1` (label `duration`)/link 206 → inner node 133; inner default is `2`, but composite node 140 promotes `value_1=5`. Catalog records the inner default `2`. |
| seed | `140:129 RandomNoise.noise_seed` | `757358688076805` | Subgraph input `noise_seed`/link 207 → inner node 129; inner default `1`, composite node 140 promotes `noise_seed=757358688076805`. Catalog omits this binding. |
| aspect_ratio | `115 ResolutionSelector.aspect_ratio` | `16:9 (Widescreen)` | Source node 115 `widgets_values_named.aspect_ratio`; width/height outputs feed composite node 140 (links 246/247), then API node 140:131. Catalog omits aspect ratio. |

Duration uses the exact source expression `max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17`; it is not a direct seconds input on node 140:131. The API length reference is `140:132`, output 1.

## Four base model loaders

| API node | Class | Input | Exact filename |
|---|---|---|---|
| `140:127` | `UNETLoader` | `unet_name` | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` |
| `140:128` | `CLIPLoader` | `clip_name` | `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` |
| `140:119` | `VAELoader` (video) | `vae_name` | `minimax_h3_video_vae_int8_convrot.safetensors` |
| `140:120` | `VAELoader` (audio) | `vae_name` | `minimax_h3_audio_vae_fp32.safetensors` |

These are recipe/export bindings only; installed model identity and backend compatibility were not checked.

## Disabled turbo branch and base-only candidate

Source switch `140:139` is false. The inner source has base steps `140:137=20` and turbo steps `140:138=6`; the promoted composite host override changes turbo steps to `8` in the parent export. Catalog marks that 6-vs-8 branch unsupported. The export still carries `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors`; no installed or compatible alternative is claimed.

Candidate removal only: remove `140:134` (LoRA), `140:135` (model switch), `140:136` (step switch), `140:138` (turbo steps), and `140:139` (switch control). Current incident API references:

- `140:127:0` → `140:134.model`, `140:135.on_false`; `140:134:0` → `140:135.on_true`.
- `140:139:0` → `140:135.switch`, `140:136.switch`.
- `140:137:0` → `140:136.on_false`; `140:138:0` → `140:136.on_true`.
- `140:135:0` → `140:124.model`, `140:126.model`; `140:136:0` → `140:124.steps`.

Rewire for base-only: `140:127:0` directly to `140:124.model` and `140:126.model`; `140:137:0` directly to `140:124.steps`. Retain shared base loader `140:127`, base-step primitive `140:137`, `BasicScheduler` `140:124`, `BasicGuider` `140:126`, and the rest of the sampling/output graph.

Sample API shape (prompt value elided): `{"140:133":{"class_type":"PrimitiveFloat","inputs":{"value":5}},"140:131":{"class_type":"MiniMaxH3ImageToVideo","inputs":{"prompt":"<source composite prompt>","length":["140:132",1]}}}`. The export encodes edges as `[node_id, output_index]` references.
