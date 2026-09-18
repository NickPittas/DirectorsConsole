# Seedance 2.5 prompt guide

## Verified sources

- Retrieved 2026-09-18: [Seedance 2.5 introduction](https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5)
- Retrieved 2026-09-18: [Seedance 2.5 ModelArk prompt guide](https://docs.byteplus.com/en/docs/ModelArk/2607689)
- Retrieved 2026-09-18: [Seedance 2.0/2.5 API tutorial](https://docs.byteplus.com/en/docs/ModelArk/2291680)

## Prompt guidance

Use natural prose for a continuous or clearly ordered narrative: setting and tone, subject and camera perspective, action beats, continuity, transitions, and supplied audio. When timing matters, use non-overlapping one-second-based segments such as `0–5s`, `5–10s`, and `10–20s`, with one observable beat per segment. For reference generation, use only caller-confirmed type-and-number labels; do not invent asset IDs or attachments. The documented request roles include reference media and first/last-frame controls, but this enhancer does not submit a video request.

Preserve user-provided dialogue, lyrics, language, and sound instructions. Put constraints such as no subtitles or no background music in the prompt prose only when requested. Seedance 2.5's version-specific timing and locked editing/extension behavior must not be blindly applied to Seedance 2.0.

## Output contract

Return one final natural-language prompt with no explanations, citations, alternatives, or duplicated paragraphs.
