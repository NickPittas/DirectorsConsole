# Seedance 2.0 prompt guide

## Verified sources

- Retrieved 2026-09-18: [Seedance 2.0 launch](https://seed.bytedance.com/en/blog/seedance-2-0-official-launch)
- Retrieved 2026-09-18: [Seedance 2.0 ModelArk tutorial](https://docs.byteplus.com/en/docs/ModelArk/2291680)
- Retrieved 2026-09-18: [Seedance prompt guide](https://docs.byteplus.com/en/docs/ModelArk/2222480)

## Prompt guidance

Write a sequential natural-language brief: setting and visual tone, camera perspective and movement, ordered physical beats, salient subject details, continuity, and supplied audio. For image-to-video, describe the change from the supplied image. For reference generation, assign each confirmed asset a role using its type-and-number convention only when that mapping was supplied; do not turn an opaque provider asset ID into a prompt label. Seedance 2.0 documents first/last-frame roles in request content; the enhancer describes the declared task but does not submit media.

The documented 2.0 symbol conventions are parentheses for music, angle brackets for sound effects, braces for dialogue, and corner brackets for subtitles. Apply them only when the user requested the corresponding content and preserve dialogue verbatim. Do not invent attachments, dialogue, IDs, API fields, or a negative-prompt field. Seedance 2.0 is version-specific; do not copy assumptions from Seedance 2.5.

## Output contract

Return one final natural-language prompt with no explanations, citations, alternatives, or duplicated paragraphs.
