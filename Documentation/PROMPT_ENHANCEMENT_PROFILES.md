# Prompt enhancement profiles

Prompt enhancement is available now in both the **Cinema Prompt Engineering** page and the **Storyboard** page. The backend profile registry is the source of truth for video targets, tasks, dialects, reference styles, and source links; image targets use the canonical target catalog and shared family guides instead of the video profile registry.

A **target model** is the image/video generator whose prompt is being written. The **enhancing LLM provider and model** are separate: they rewrite the text and are configured in Settings. Selecting an LLM provider does not select a generation target.

These profiles guide prompt text only. They do not establish local weights, ComfyUI nodes, provider credentials, account or region access, media upload, API submission, or visual quality.

## Cinema Prompt Engineering page

1. Choose a canonical target from the **General**, **Image**, or **Video** target dropdown.
2. For a registered video target, choose the dialect shown beside the target. Dialects are model-specific; prose guides are not one shared JSON template.
3. Configure the enhancing LLM provider/model in **Settings**.
4. Enter the scene idea and cinematography settings, then click **Enhance with AI**.
5. Review or copy the AI-Enhanced Prompt, or click **Send to Storyboard**. The scene prompt is presented as a full-width row above the model-selection controls.

The CPE page has no workflow-media mapping, so a profiled video enhancement is submitted as `t2v` with no assets. Image targets use their family guide and do not show video reference controls.

## Storyboard AI Enhance

1. Select a panel and workflow, then find a positive prompt parameter.
2. Click the **gear** immediately beside **Enhance with AI**. This opens the styled settings popup; the controls are not a bulk inline parameter panel.
3. Choose the canonical target. For video profiles, choose the available dialect and either **Auto** or an explicit task. A known catalog image target may explicitly override a video workflow's default classification; the UI does not guess unknown targets. Image targets have no separate image task, mode, or reference-mapping selector: use the user's wording to distinguish new generation from an exact edit.
4. Review the detected media mapping. Include or exclude a binding, assign its role, preserve or edit its per-kind ordinal, add an optional description, and confirm the mapping. A Kling named-reference field is shown only for applicable Kling targets; these controls apply to video enhancement, not image prompt writing.
5. Review the effective duration when the selected task/dialect requires it. Click **Done** or press **Escape**, then click **Enhance with AI** on the prompt.

Preferences are stored with the selected panel and project draft. Draft recovery restores work state, but cannot guarantee the final keystroke. Changing the prompt, panel, workflow, target, or mapping while a request is running causes its content response to be discarded rather than applied to the wrong context.

For an image edit, write the exact requested change and the caller-provided identity, composition, lighting, or text that must remain. The enhancer receives metadata only; it does not inspect image bytes, infer image contents, or invent references. These targets guide text only and do not establish hosted/API access, local weights, provider credentials, or ComfyUI availability.

### Image target guide matrix

The canonical catalog retains legacy image targets and adds these 14 targets. IDs are stable persisted values; API spelling aliases normalize to the canonical IDs.

| Family | Canonical targets | Guide behavior | Official sources |
|---|---|---|---|
| Krea 2 | `krea_2_large`, `krea_2_turbo` | Keep intentionally vague ideas concise and exploratory. Large retains richer supplied detail; Turbo favors compact iteration. | [Explorative prompting](https://www.krea.ai/blog/explorative-prompting-krea-2), [Krea 2](https://www.krea.ai/blog/krea-2-image-model), [Krea 2 Turbo](https://www.krea.ai/blog/krea-2-turbo), [open source](https://www.krea.ai/krea-2-open-source) |
| FLUX.2 | `flux_2_max`, `flux_2_pro`, `flux_2_flex`, `flux_2_klein`, `flux_2_dev` | Natural subject/action/style/context prose, positive desired outcomes, exact text and colors. No SD weighting or negative block; Klein has separate no-upsampling guidance. | [Prompting guide](https://docs.bfl.ai/guides/prompting_guide_flux2), [negative prompting](https://help.bfl.ai/articles/7734566352-does-flux-2-support-negative-prompting), [variant guide](https://help.bfl.ai/articles/6122710168-which-flux-2-model-should-i-choose) |
| GPT Image 2.5 | `gpt_image_2.5_sunburst`, `gpt_image_2.5_flare` | Sunburst emphasizes precise composition/edit constraints; Flare stays direct for iteration. API quality/size/background/output settings remain outside prose. | [Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst), [Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare), [prompting](https://developers.openai.com/api/docs/guides/image-prompting) |
| Nano Banana | `nano_banana_2`, `nano_banana_pro`, `nano_banana_2_lite` | Complete natural scene/edit instructions. Lite is not optimized for multiple reference inputs or multi-turn sequential editing; do not copy Pro assumptions to Lite. | [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation) |
| Seedream 5.0 | `seedream_5.0_pro`, `seedream_5.0_lite` | Pro can express supplied layout, typography, and spatial edits; Lite remains a focused natural-language task guide without assumed Pro controls. | [Seedream 5.0 Pro](https://seed.bytedance.com/en/blog/beyond-generation-it-understands-design-introducing-seedream-5-0-pro), [Seedream 5.0 Lite](https://seed.bytedance.com/en/seedream5_0_lite), [Lite prompting](https://seed.bytedance.com/en/blog/deeper-thinking-more-accurate-generation-introducing-seedream-5-0-lite) |

Krea 2 has open-weight releases, but a target catalog entry does not promise that a particular Krea service, API, checkpoint, or reference feature is local. The same hosted-versus-local distinction applies to FLUX.2, GPT Image, Nano Banana, and Seedream. FLUX 3 Image is excluded pending verified API/prompt availability.

### Conditional task and reference fields

- **T2V**: no media assets are allowed. Auto selects T2V when no enabled media is present.
- **I2V**: uses confirmed image keyframes with `first_frame` and/or `last_frame` roles. The selected profile decides which combinations are valid.
- **ref2v (R2V)**: uses confirmed `reference_image`, `reference_video`, and/or `reference_audio` roles. Original per-kind ordinals, including intentional gaps, are preserved.
- Mixed keyframe and reference roles require an explicit I2V or ref2v (R2V) choice.
- A local MiniMax H3 last-frame I2V mapping requires the workflow's effective duration. The UI derives it from duration or frame-rate settings and sends metadata only.
- The frontend only surfaces populated media found through the reachable workflow schema and known managed/reference inputs. It does not inspect the media contents or invent a graph binding.

Only metadata is sent to the enhancer: binding ID, media kind, role, ordinal, optional label/description, and an explicitly confirmed Kling reference name where applicable. File paths, URLs, data URLs, media bytes, and imaginary vision results are not sent. Missing target catalogs or profiles block the request and expose a retry action. Paid requests are not automatically retried. A returned OAuth refresh token is retained only through the existing selected-provider/account guard, independently of whether the content response is stale or failed.

## Registered video profile matrix

The task column is the enhancement profile's accepted task metadata. It is not a claim that every vendor mode, account, endpoint, or local workflow supports every task.

| Canonical target | Profile tasks | Dialect | Important guide constraint |
|---|---|---|---|
| `ltx_2.3` | T2V, I2V | LTX native prose | I2V requires a first frame; last-frame-only and a generic identity-reference mode are not verified. |
| `ltx_2.5` | T2V, I2V | LTX native prose | I2V requires a first frame; a supplied last frame may accompany it. |
| `minimax_h3` | T2V, I2V, ref2v (R2V) | Local H3 or MiniMax hosted API | The dialect determines structured local sections versus hosted natural prose. |
| `minimax_h3_max` | T2V, I2V, ref2v (R2V) | MiniMax hosted API | Hosted H3 Max only; do not infer a local H3-Max checkpoint. |
| `seedance_2.0` | T2V, I2V, ref2v (R2V) | Seedance API | Version-specific conventions apply; do not copy 2.5 assumptions. |
| `seedance_2.5` | T2V, I2V, ref2v (R2V) | Seedance API | Version-specific timing/reference guidance applies; do not copy 2.0 assumptions. |
| `wan_3.0` | T2V, I2V, ref2v (R2V) | Wan API | Reference labels are caller-confirmed per-kind metadata, not provider IDs. |
| `kling_3.0` | T2V, I2V | Kling API | I2V requires a confirmed first frame; a last-frame-only input is rejected. |
| `kling_3.0_omni` | T2V, I2V, ref2v (R2V) | Kling API | Named references use `@name` only when the caller confirmed that exact name. |

Existing image and legacy target IDs remain available through the canonical target catalog. Legacy aliases are compatibility values for persisted workflows; use the canonical ID shown by the current target dropdown for new work.

## MiniMax H3 dialect rules

The local `minimax_h3` dialect is not the hosted API dialect.

For local H3 T2V/I2V, the output is plain text, not JSON, with these three ordered sections:

- `integrated_multimodal_description`
- `overall_soundscape`
- `non_diegetic_music`

For local H3 ref2v (R2V), the output uses these six ordered sections:

- `subject_definitions`
- `summary`
- `retention_analysis`
- `detailed_description`
- `overall_soundscape`
- `non_diegetic_music`

Confirmed source markers use exact per-kind tags such as `<Picture N>`, `<Video N>`, and `<Audio N>`. They must match the confirmed metadata; the enhancer does not create missing assets. `<Subject N>` is a generated content label, not a media binding.

For local base keyframes, the official alignment is fixed: first-only uses Picture 1, last-only uses Picture 1, and first/last uses Picture 1 followed by Picture 2. I2V output also begins with the prescribed alignment line before the core sections. The backend rejects contradictory base ordinals instead of silently renumbering them. Reference-to-video ordinals preserve confirmed gaps. Last-frame alignment ends at the caller-supplied duration with two decimal places.

The hosted MiniMax dialect uses concise natural prose and structured content roles. It must not emit local H3 section headings or local `<Picture>` tags unless the user explicitly supplied them. H3 and H3 Max do not get invented provider IDs, negative fields, attachments, or dialogue controls.

## Guide files and official sources

The model-specific image guide files used by the system prompt registry are:

- [Krea 2](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/krea_2.md)
- [FLUX.2](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/flux_2.md) and [FLUX.2 Klein](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/flux_2_klein.md)
- [GPT Image 2.5](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/gpt_image_2.5.md)
- [Nano Banana](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/nano_banana.md) and [Nano Banana 2 Lite](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/nano_banana_2_lite.md)
- [Seedream 5.0](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/seedream_5.0.md)

Image guides use the caller's wording for new-generation versus editing intent. They do not inspect media, create a separate image task/mode, bind references, or set provider/API parameters. The official links in the image target matrix are provenance for the guide text and are not emitted in enhanced prompts.

The model-specific video guide files used by the system prompt registry are:

- [LTX 2.3](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/ltx_2.3.md) and [LTX 2.5](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/ltx_2.5.md)
- [MiniMax H3](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/minimax_h3.md) and [MiniMax H3 Max](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/minimax_h3_max.md)
- [Seedance 2.0](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/seedance_2.0.md) and [Seedance 2.5](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/seedance_2.5.md)
- [Wan 3.0](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/wan_3.0.md)
- [Kling 3.0](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/kling_3.0.md) and [Kling 3.0 Omni](../CinemaPromptEngineering/api/providers/system_prompts/model_prompts/kling_3.0_omni.md)

Official sources recorded by the profile registry:

- **LTX:** [prompting guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide), [LTX-2.3 documentation](https://github.com/Lightricks/LTX-2/blob/main/MODELS-LTX-2.3.md), and [LTX-2.5 model page](https://docs.ltx.io/models/ltx-2-5).
- **MiniMax:** [local base guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md), [local reference guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md), [local deployment](https://platform.minimax.io/docs/guides/local-deploy-h3), [video generation guide](https://platform.minimax.io/docs/guides/video-generation), [V2 create API](https://platform.minimax.io/docs/api-reference/video-generation-v2-create).
- **Seedance:** [2.0 ModelArk tutorial](https://docs.byteplus.com/en/docs/ModelArk/2291680), [2.0 prompt guide](https://docs.byteplus.com/en/docs/ModelArk/2222480), [2.5 prompt guide](https://docs.byteplus.com/en/docs/ModelArk/2607689), and [2.5 launch notes](https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5).
- **Wan:** [Wan prompt guide](https://www.alibabacloud.com/help/en/model-studio/text-to-video-prompt) and [Wan 3.0 API reference](https://help.aliyun.com/en/model-studio/wan3-video-generation-api-reference).
- **Kling:** [Kling 3.0 model guide](https://kling.ai/quickstart/klingai-video-3-model-user-guide), [image-to-video API](https://kling.ai/document-api/api/video/3-0-omni/image-to-video.md), and [Omni API](https://kling.ai/document-api/api/video/3-0-omni/video-omni.md).

The profiles endpoint remains authoritative for clients: `GET /prompt-enhancement/profiles`. It returns the target ID, supported profile tasks, default dialect, dialect metadata, reference style, order-confirmation requirement, and source URLs. Context validation rejects unsupported task/dialect combinations, invalid kind/role pairs, duplicate binding IDs or per-kind ordinals, unconfirmed mappings, and target-specific keyframe violations before enhancement is sent.
