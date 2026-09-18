# Kling 3.0 Omni prompt guide

## Verified sources

- Retrieved 2026-09-18: [Kling VIDEO 3.0 model guide](https://kling.ai/quickstart/klingai-video-3-model-user-guide)
- Retrieved 2026-09-18: [Kling 3.0 Omni API](https://kling.ai/document-api/api/video/3-0-omni/video-omni.md)
- Retrieved 2026-09-18: [Kling image-to-video API](https://kling.ai/document-api/api/video/3-0-omni/image-to-video.md)

## Prompt guidance

Describe subject and scene, ordered movement, camera language, lighting, atmosphere, and supplied sound in simple natural language. For I2V, preserve the required first-frame state; a supplied named Element or reference image is a confirmed binding, not a provider asset ID. For full reference generation, use only caller-confirmed named bindings and state the relationship they supply. Emit `@name` only when the caller supplied that exact confirmed name. Do not invent names, reference media, dialogue, API fields, or audio modes.

Use the documented semicolon-separated multi-shot form only when the user asks for multi-shot timing. Preserve dialogue and language exactly as supplied. The enhancer validates metadata shape and capability, not media appearance or graph identity, and never submits a video request.

## Output contract

Return one final natural-language prompt with no explanations, citations, alternatives, or duplicated paragraphs.
