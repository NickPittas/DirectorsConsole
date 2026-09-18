# MiniMax H3 prompt guide

**Guide scope:** target ID `minimax_h3`, exact vendor model `MiniMax-H3`; the same mode guidance applies to `minimax_h3_max` where the source describes H3 Max.
**Retrieval date:** 2026-09-18.
**This is prompt guidance only.** It does not claim a ComfyUI workflow, local node, API credential, account access, region access, or generation backend.

## Verified sources

- Retrieved 2026-09-18: [MiniMax model release notes](https://platform.minimax.io/docs/release-notes/models), H3 release status.
- Retrieved 2026-09-18: [MiniMax video generation guide](https://platform.minimax.io/docs/guides/video-generation), H3/H3 Max modes, inputs, limits, and camera tokens.
- Retrieved 2026-09-18: [Video Generation V2 create API](https://platform.minimax.io/docs/api-reference/video-generation-v2-create), content roles and request bounds.
- Retrieved 2026-09-18: [MiniMax H3 announcement](https://www.minimax.io/blog/minimax-h3), multimodal context and native audio.
- Retrieved 2026-09-18: [H3 prompt gallery](https://platform.minimax.io/docs/guides/video-prompt), illustrative prompt structures.

## Mode-specific prompt structure

- **Text-to-video:** describe one text scene with subject, setting, action sequence, shot scale, camera movement, lighting, format or duration only when supplied, and sound. For finer camera guidance, place only the verified tokens `[pan]`, `[zoom]`, or `[static]` directly after the relevant description.
- **First-frame image-to-video:** when the user supplies a first-frame image, describe the delta motion and temporal change from that frame. Do not restate an invented image description or asset number.
- **Last-frame image-to-video:** when the user supplies a last-frame image, describe an action that resolves into that supplied ending state.
- **First-and-last-frame image-to-video:** use both only when both supplied assets exist; describe the subject's continuous path from the supplied opening state to the supplied ending state.
- **Reference-to-video:** reference images, videos, and audio have distinct roles. State each supplied asset's role in natural language: subject/character, scene, prop, camera movement, style, motion, voice, or editing rhythm. Keep the relationships explicit and describe the target action.

The verified V2 content roles are `first_frame`, `last_frame`, `reference_image`, `reference_video`, and `reference_audio`. Image-to-video/keyframe content and multimodal reference content are mutually exclusive in the verified V2 API. Never combine first/last-frame roles with reference-image, reference-video, or reference-audio roles in one invented mode. H3 accepts native stereo audio and reference audio, but the fetched official material does not verify a distinct spoken-dialogue control. Do not invent dialogue controls or dialogue text; preserve dialogue only when the user provides it.

The verified sources do not document a negative-prompt field. Do not add or recommend a negative prompt; if the caller's response schema requires that field, it may remain empty. Do not invent attachments, reference IDs, API fields, languages, or backend/workflow controls. If the user has not supplied a numbered asset, do not manufacture `Image 1`, `Video 1`, or `Audio 1`.

## Output contract

Return exactly one final prompt paragraph, with no headings, explanations, source citations, provenance, or alternatives. Keep cinematic configuration details as visual descriptions rather than visible equipment.

**Illustrative example (not an official quote):** A 10-second vertical view of a rain-darkened market alley, a courier in a tan coat weaving between stalls [pan right], then stopping beneath a lantern [static]. Warm light catches the wet stones while tram bells and market chatter fill the air.
