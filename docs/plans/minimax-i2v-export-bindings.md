# MiniMax H3 I2V export binding map

Static mapping of the permitted source recipe, its catalog entry, and the supplied parent26 API export. No runtime or render proof.

Source graph SHA: `34ee39544808fd3b0dc8de9df082940d4d41c3771beb80d3988c1ea5531cec0d`; source subgraph host `105`, inner node `104`; supplied API export version `1.22.0`.

## Narrow API bindings

| Control | API export binding/default | Source interface and role |
|---|---|---|
| Prompt | `workflow["105:104"].inputs.prompt` (exported prompt text) | Host `105.prompt`; subgraph port `prompt` → inner `104.prompt` (link 197); text/video conditioning. |
| Duration | `workflow["105:111"].inputs.value = 5` seconds | Host `105.value_1` (label `duration`, default 5); source links 206→111 and 205→107; expression at `105:107` converts seconds to frame `length`, then link 199→`104.length`. |
| Seed | `workflow["105:15"].inputs.noise_seed = 757358688076805` | Host `105.noise_seed`; subgraph port → `RandomNoise` (link 207), then noise → sampler `105:14` (link 40). |
| Aspect ratio | `workflow["115"].inputs.aspect_ratio = "1:1 (Square)"` | Root `ResolutionSelector` default; its width/height outputs (root links 219/220) feed host `105`, then subgraph links 200/201 feed `104.width/height`. It is not a direct MiniMax socket. |
| Starting image | `workflow["114"].inputs.image = "transparent_rgb_gaming_mouse.png"`; `workflow["105:104"].inputs.first_frame = ["114",0]` | Root `LoadImage` `114` is the recipe’s supplied start asset; root link 218 connects it to host `105.first_frame`, then subgraph link 195 to inner `104.first_frame`. Recipe-level required asset; the node socket itself is optional in the UI schema. |

## End-frame route

- The UI subgraph declares `last_frame` and inner node `104.last_frame` (link 196), but root host `105.last_frame` has `link: null`; there is no second `LoadImage` or image default.
- The supplied API export binds only `first_frame`; `105:104` has no `last_frame` input. Thus an internal optional port exists, but this I2V export has no connected end-frame route.
- No end-frame enable flag exists. `105:126.value = false` is the separate Lightning LoRA/turbo toggle. The catalog labels first/last-frame conditioning as a separate recipe; do not treat this export as that request.

## Base loaders and disabled turbo branch

| Base loader | Exported model default | Current source consumer edges |
|---|---|---|
| `105:6` UNETLoader | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | → `105:122.on_false` (link 232); also → turbo LoRA `105:121.model` (229). Switch output → `105:9.model` (234) and `105:16.model` (241). |
| `105:13` CLIPLoader | `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | → `105:104.clip` (189). |
| `105:11` video VAELoader | `minimax_h3_video_vae_int8_convrot.safetensors` | → `105:104.vae` (190) and `105:10.vae` (8). |
| `105:24` audio VAELoader | `minimax_h3_audio_vae_fp32.safetensors` | → `105:23.vae` (23). |

- Disabled branch: `105:126` Boolean `false` (“Enable Lightning LoRA”) drives model switch `105:122` and step switch `105:123` (links 238/239). `105:122` selects base `105:6` vs `105:121` LoRA output; LoRA is `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors`, strength 1. `105:123` selects `105:124=20` vs `105:125=8`; its output sets `105:9.steps` (235). Scheduler `105:9` is `simple`, denoise 1; sampler selector `105:17` is `res_multistep`.
- The supplied I2V API export uses 8 (`105:125.value=8`); raw nested UI primitive default is 6, overridden by host `105.value_2=8`. The catalog’s 6-step-vs-8-step FL2V conflict remains a separate recorded conflict; this report does not resolve it.

## Base-only pruning candidates

- Remove turbo-only nodes `105:121`, `105:122`, `105:123`, `105:125`, `105:126`; their incident source link IDs are `229, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 243, 244, 245`.
- Reconnect base `105:6` directly to `105:9.model` and `105:16.model`; keep `105:124=20` and connect it directly to `105:9.steps` (or inline 20). These replace the switch output paths, not shared sampling nodes.
- Preserve shared nodes `105:6/9/10/11/13/14/15/16/17/23/24/91/104/107/111`, root `114/115/92`, host `105`, the prompt/duration/seed/resolution path, and start-frame route `114.image` → host `105.first_frame` → inner `104.first_frame` (root link 218; subgraph link 195).

Evidence is limited to `CinemaPromptEngineering/agent_resources/recipes/minimax-h3-fl2va-i2v/workflow.json`, its `minimax-h3-fl2va-i2v` entry in `CinemaPromptEngineering/agent_resources/recipes/catalog.json`, and `/tmp/directors-console-minimax-h3-fl2va-i2v-export.json`. No other sources were used.
