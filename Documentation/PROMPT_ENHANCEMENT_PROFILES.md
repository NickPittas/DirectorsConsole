# Prompt enhancement profiles

Prompt enhancement is available now in both the **Cinema Prompt Engineering** page and the **Storyboard** page. The backend profile registry is the source of truth for video targets, tasks, dialects, reference styles, and source links.

A **target model** is the image/video generator whose prompt is being written. The **enhancing LLM provider and model** are separate: they rewrite the text and are configured in Settings. Selecting an LLM provider does not select a generation target.

These profiles guide prompt text only. They do not establish local weights, ComfyUI nodes, provider credentials, account or region access, media upload, API submission, or visual quality.

## Cinema Prompt Engineering page

1. Choose a canonical target from the **General**, **Image**, or **Video** target dropdown.
2. For a registered video target, choose the dialect shown beside the target. Dialects are model-specific; prose guides are not one shared JSON template.
3. Configure the enhancing LLM provider/model in **Settings**.
4. Enter the scene idea and cinematography settings, then click **Enhance with AI**.
5. Review or copy the AI-Enhanced Prompt, or click **Send to Storyboard**.

The CPE page has no workflow-media mapping, so a profiled video enhancement is submitted as `t2v` with no assets. Image targets use their image-specific guide and do not show video reference controls.

## Storyboard AI Enhance

1. Select a panel and workflow, then find a positive prompt parameter.
2. Click the **gear** immediately beside **Enhance with AI**. This opens the styled settings popup; the controls are not a bulk inline parameter panel.
3. Choose the canonical target. For video profiles, choose the available dialect and either **Auto** or an explicit task. A known catalog image target may explicitly override a video workflow's default classification; the UI does not guess unknown targets.
4. Review the detected media mapping. Include or exclude a binding, assign its role, preserve or edit its per-kind ordinal, add an optional description, and confirm the mapping. A Kling named-reference field is shown only for applicable Kling targets.
5. Review the effective duration when the selected task/dialect requires it. Click **Done** or press **Escape**, then click **Enhance with AI** on the prompt.

Preferences are stored with the selected panel and project draft. Draft recovery restores work state, but cannot guarantee the final keystroke. Changing the prompt, panel, workflow, target, or mapping while a request is running causes its content response to be discarded rather than applied to the wrong context.

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

The model-specific guide files used by the system prompt registry are:

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
