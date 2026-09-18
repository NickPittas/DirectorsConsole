# Versioned video-target capability and source matrix

**Research retrieval date:** 2026-09-18. **Scope:** prompt guidance and vendor documentation only. A verified vendor mode is not a ComfyUI workflow or a promise that a local node, API credential, account, region, or generation backend is available.

The six versioned system guides are the prompts used by `get_system_prompt`:

- [LTX 2.3 guide](../../api/providers/system_prompts/model_prompts/ltx_2.3.md)
- [LTX 2.5 guide](../../api/providers/system_prompts/model_prompts/ltx_2.5.md)
- [MiniMax H3 guide](../../api/providers/system_prompts/model_prompts/minimax_h3.md)
- [MiniMax H3 Max guide](../../api/providers/system_prompts/model_prompts/minimax_h3_max.md)
- [Seedance 2.0 guide](../../api/providers/system_prompts/model_prompts/seedance_2.0.md)
- [Seedance 2.5 guide](../../api/providers/system_prompts/model_prompts/seedance_2.5.md)

## Capability matrix

| Target ID | Verified vendor modes | Deliberately unknown or bounded | Primary official sources |
|---|---|---|---|
| `ltx_2.3` | Text-to-video; first-frame image-to-video; open-weight keyframe interpolation; audio-to-video | No verified API ending-frame control; no named identity-reference mode; open-weight duration limits not established; negative-prompt prompting not established | [LTX-2.3 HF](https://huggingface.co/Lightricks/LTX-2.3) (2026-09-18); [LTX repo](https://github.com/Lightricks/LTX-2) (2026-09-18); [API changelog](https://docs.ltx.io/api-changelog) (2026-09-18) |
| `ltx_2.5` | Text-to-video; first-frame image-to-video; open-weight keyframes; audio-to-video; API ending-frame image-to-video; native multi-shot; optional duration predictor | Ending-frame control is API-documented and not a ComfyUI promise; no general negative-prompt instruction in the prompting guide | [LTX-2.5 HF](https://huggingface.co/Lightricks/LTX-2.5) (2026-09-18); [API model page](https://docs.ltx.io/models/ltx-2-5) (2026-09-18); [prompting guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide) (2026-09-18) |
| `minimax_h3` | Text-to-video; first-frame, last-frame, and first/last-frame image-to-video; reference image/video/audio generation; native audio | Keyframe and multimodal-reference inputs are mutually exclusive; verified camera tokens are `[pan]`, `[zoom]`, `[static]`; negative prompt and distinct spoken-dialogue control are not documented | [video guide](https://platform.minimax.io/docs/guides/video-generation) (2026-09-18); [V2 create](https://platform.minimax.io/docs/api-reference/video-generation-v2-create) (2026-09-18); [release notes](https://platform.minimax.io/docs/release-notes/models) (2026-09-18); [H3 announcement](https://www.minimax.io/blog/minimax-h3) (2026-09-18) |
| `minimax_h3_max` | Text-to-video; first-frame, last-frame, and first/last-frame image-to-video; reference image/video/audio generation; native audio | Same mutual exclusion and camera-token bounds as H3; H3 Max output limits differ; negative prompt and distinct spoken-dialogue control are not documented | [video guide](https://platform.minimax.io/docs/guides/video-generation) (2026-09-18); [V2 create](https://platform.minimax.io/docs/api-reference/video-generation-v2-create) (2026-09-18); [H3 announcement](https://www.minimax.io/blog/minimax-h3) (2026-09-18) |
| `seedance_2.0` | Text-to-video; image-to-video; multimodal reference image/video/audio; extension/editing; audio and supplied dialogue examples | First/last-frame roles and negative field remain pending; exact API IDs remain pending; 15-second high-quality multi-shot is launch-documented; 2.1–2.4 are unverified | [Seedance 2.0 launch](https://seed.bytedance.com/en/blog/seedance-2-0-official-launch) (2026-09-18); [ModelArk tutorial](https://docs.byteplus.com/en/docs/ModelArk/2291680) (2026-09-18); [prompt guide](https://docs.byteplus.com/en/docs/ModelArk/2222480) (2026-09-18) |
| `seedance_2.5` | Text-to-video; multimodal reference image/video/audio; timed beats; extension/editing | Standalone image-to-video, first/last-frame controls, exact API IDs, and negative field remain pending; API launch note said coming soon; documentation is not a guarantee for every account or region; 2.1–2.4 are unverified | [Seedance 2.5 launch](https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5) (2026-09-18); [ModelArk tutorial](https://docs.byteplus.com/en/docs/ModelArk/2607688) (2026-09-18); [2.5 prompt guide](https://docs.byteplus.com/en/docs/ModelArk/2607689) (2026-09-18) |

## Version policy

Only the six IDs above are new dropdown targets. Seedance 2.1–2.4 remain pending-matrix-only and are not published as selectable IDs. Existing IDs and legacy aliases remain accepted for persisted workflows and node inputs; they are compatibility values, not claims about newly researched releases. No license, performance, or guaranteed visual-quality claim is part of this matrix.
