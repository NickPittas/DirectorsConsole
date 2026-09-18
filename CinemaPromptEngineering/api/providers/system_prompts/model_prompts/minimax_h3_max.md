# MiniMax H3 Max prompt guide

**Guide scope:** target ID `minimax_h3_max`, exact vendor model `MiniMax-H3-Max`; this guide follows the official H3/H3 Max V2 API documentation and does not imply account-wide availability.
**Retrieval date:** 2026-09-18.
**This is prompt guidance only.** It does not claim a ComfyUI workflow, local node, API credential, account access, region access, or generation backend.

## Verified sources

- Retrieved 2026-09-18: [MiniMax model release notes](https://platform.minimax.io/docs/release-notes/models), H3 release status.
- Retrieved 2026-09-18: [MiniMax video generation guide](https://platform.minimax.io/docs/guides/video-generation), H3 Max mode and input guidance.
- Retrieved 2026-09-18: [Video Generation V2 create API](https://platform.minimax.io/docs/api-reference/video-generation-v2-create), exact content roles and request bounds.
- Retrieved 2026-09-18: [MiniMax H3 announcement](https://www.minimax.io/blog/minimax-h3), multimodal context and native audio.
- Retrieved 2026-09-18: [H3 prompt gallery](https://platform.minimax.io/docs/guides/video-prompt), official prompt-shape examples.

## Mode-specific prompt structure

- **Text-to-video:** use a compact natural-language brief: subject and setting, sequential physical actions, shot scale and camera movement, light and palette, then sound. Put only verified camera tokens `[pan]`, `[zoom]`, or `[static]` immediately after the relevant description.
- **First-frame image-to-video:** with a supplied first frame, describe the change and movement that begins from it; do not invent a new starting image.
- **Last-frame image-to-video:** with a supplied last frame, describe the motion that resolves into that supplied state.
- **First-and-last-frame image-to-video:** use the pair only when both assets are supplied and describe the continuous transition between them.
- **Reference-to-video:** assign each supplied image, video, or audio asset a natural-language role such as character, scene, prop, motion, camera, style, voice, or editing rhythm. Make the relationship to the generated action explicit.

The fetched V2 documentation defines `first_frame`, `last_frame`, `reference_image`, `reference_video`, and `reference_audio` content roles. It treats image-to-video and reference-to-video as mutually exclusive: first/last-frame roles cannot be mixed with reference-image, reference-video, or reference-audio roles. H3 Max's verified resolution and duration limits differ from H3; do not promise a setting unless the user or calling API supplies it. Native audio and reference audio are documented, but a distinct spoken-dialogue control is not. Do not invent dialogue, language, negative prompts, attachments, reference IDs, API fields, or workflow/backend controls; if the caller's response schema requires a negative field, it may remain empty. If no numbered asset was supplied, do not create `Image 1`, `Video 1`, or `Audio 1` labels.

## Output contract

Return exactly one final prompt paragraph, with no headings, explanations, source citations, provenance, or alternatives. Use cinematic configuration as visual language, never visible rigs or crew.

**Illustrative example (not an official quote):** A wide 16:9 view of a quiet observatory at night. A researcher raises a hand toward the rotating dome [static], then crosses to the window as reflected starlight moves across the floor [zoom]. The room hums softly beneath the user's supplied audio.
