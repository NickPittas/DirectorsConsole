# Seedance 2.0 prompt guide

**Guide scope:** target ID `seedance_2.0`; exact version Seedance 2.0, official launch and vendor documentation.
**Retrieval date:** 2026-09-18.
**This is prompt guidance only.** It distinguishes vendor-documented modes from ComfyUI workflows and makes no availability, credential, account, region, or generation-backend promise.

## Verified sources

- Retrieved 2026-09-18: [Seedance 2.0 official launch](https://seed.bytedance.com/en/blog/seedance-2-0-official-launch), modes, multimodal references, audio, and prompt examples.
- Retrieved 2026-09-18: [Seedance 2.0 project page](https://seed.bytedance.com/en/seedance2_0), product scope.
- Retrieved 2026-09-18: [BytePlus ModelArk Seedance 2.0 tutorial](https://docs.byteplus.com/en/docs/ModelArk/2291680), vendor API documentation index.
- Retrieved 2026-09-18: [BytePlus ModelArk Seedance prompt guide](https://docs.byteplus.com/en/docs/ModelArk/2222480), vendor prompt-guide page and version date.

## Mode-specific prompt structure

- **Text-to-video:** write a sequential natural-language brief: setting and visual tone, camera perspective and movement, ordered physical beats, wardrobe or salient details, narrative turn, and audio. State duration or aspect ratio only when provided by the user or calling context.
- **Image-to-video:** when the user supplies an image, describe the delta motion and change from that established frame rather than inventing a new static scene. First/last-frame controls are not claimed here as verified Seedance 2.0 prompt capabilities; do not add them.
- **Multimodal reference video:** assign each supplied asset a role in prose: a storyboard or shot plan, hero character, scene, prop, camera movement, motion, or style. The official guidance supports up to 9 images, 3 video clips, and 3 audio clips; do not request or invent assets beyond what the user supplied.
- **Audio and dialogue:** the launch material documents generated music, ambience, character voiceovers, and an example with supplied dialogue. Preserve dialogue or audio instructions only when the user provides them; never invent spoken lines, reference-audio numbers, or a voice identity.

The verified launch material describes prompt-driven camera planning, long sequential narratives, and multi-shot audio-video output up to 15 seconds. It does not verify a general negative-prompt field. Use positive visual and audio description, do not add or recommend a negative field (an existing required response field may remain empty), and do not invent exact API model IDs or request controls. The 2.1–2.4 versions are not verified by this research and must not be substituted.

## Output contract

Return exactly one final prompt paragraph, with no headings, explanations, source citations, provenance, or alternatives. Use reference labels such as `@Image 1` only when the user actually supplies that labeled asset. Never invent attachments, reference IDs, API fields, or backend/workflow availability.

**Illustrative example (not an official quote):** Dusk on a rain-slick harbor pier. A fisherman coils a rope, freezes as a heron lands on the bow, then looks toward the dark water. The view moves from behind his shoulder to a low side profile while lantern warmth cuts through the cold blue rain; supplied ambience follows the action.
