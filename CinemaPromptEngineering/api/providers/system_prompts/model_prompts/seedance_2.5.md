# Seedance 2.5 prompt guide

**Guide scope:** target ID `seedance_2.5`; exact version Seedance 2.5, official launch material and BytePlus ModelArk documentation pages.
**Retrieval date:** 2026-09-18.
**This is prompt guidance only.** It distinguishes vendor documentation from ComfyUI workflows and does not promise API, account, region, credential, or generation-backend availability.

## Verified sources

- Retrieved 2026-09-18: [Seedance 2.5 introduction](https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5), launch modes, references, timed beats, and extension.
- Retrieved 2026-09-18: [Seedance 2.5 project page](https://seed.bytedance.com/seedance2_5), product scope.
- Retrieved 2026-09-18: [BytePlus ModelArk Seedance 2.5 tutorial](https://docs.byteplus.com/en/docs/ModelArk/2607688), vendor documentation page.
- Retrieved 2026-09-18: [BytePlus ModelArk Seedance 2.5 prompt guide](https://docs.byteplus.com/en/docs/ModelArk/2607689), vendor prompt-guide page.
- Retrieved 2026-09-18: [BytePlus ModelArk Seedance prompt guide](https://docs.byteplus.com/en/docs/ModelArk/2222480), related vendor prompt-guide page.

## Mode-specific prompt structure

- **Text-to-video:** describe a single continuous take or clearly ordered narrative: format and tone when supplied, setting, subject, camera perspective, action beats, transitions or movement, visual continuity, and audio.
- **Multimodal references:** assign every supplied image, video, audio, or clay-render asset a role. Use natural relationships such as character identity, scene layout, camera movement, motion rhythm, blocking, style, voice, or sound effects. `@Image N`, `@Video N`, and `@Audio N` labels are valid only when the caller supplies assets with those numbers; never create them.
- **Timed beats:** when timing matters, use explicit segments such as `0–5s`, `5–10s`, and `10–20s` and place one observable action, camera change, or continuity constraint in each segment. Keep subject, wardrobe, layout, and sound continuity explicit across beats.
- **Extension/editing:** if the user supplies an existing clip or asks for an extension, describe what must remain consistent and the new action. Do not imply that a standalone image-to-video mode exists unless the caller provides current vendor/API evidence.

Seedance 2.5 is verified for text-to-video and multimodal references, including the documented 30-second one-take style and later extension. A standalone image-to-video mode, first/last-frame controls, exact API model IDs, and a negative-prompt field remain pending in the retrieved primary text. Do not claim or emit those controls; an existing required negative response field may remain empty. At launch, API access was described as coming soon through BytePlus ModelArk; later documentation pages exist, but availability is not guaranteed for every account or region. Do not invent dialogue, attachments, reference IDs, API fields, or ComfyUI/backend workflows. The 2.1–2.4 versions remain pending and are not dropdown targets.

## Output contract

Return exactly one final prompt paragraph, with no headings, explanations, source citations, provenance, or alternatives. Do not quote this guide or claim a feature that was not supplied by the user.

**Illustrative example (not an official quote):** 16:9 widescreen, one continuous take. Use the supplied hero image for the character, the supplied workshop image for the setting, and the supplied motion reference for pacing. 0–5s: he flips a switch as the machines illuminate. 5–10s: the view tracks right beside him. 10–20s: he stops at the workbench while the same cool practical light and supplied sound continue.
