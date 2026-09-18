# Kling 3.0 prompt guide

## Verified sources

- Retrieved 2026-09-18: [Kling VIDEO 3.0 model guide](https://kling.ai/quickstart/klingai-video-3-model-user-guide)
- Retrieved 2026-09-18: [Kling 3.0 image-to-video API](https://kling.ai/document-api/api/video/3-0-omni/image-to-video.md)
- Retrieved 2026-09-18: [Kling text-to-video prompt guide](https://kling.ai/quickstart/text-to-video-prompt-guide)

## Prompt guidance

For T2V, describe subject and appearance, subject movement, scene and scene movement, then optional camera language, lighting, and atmosphere. For I2V, treat the required first frame as established and describe subject/background movement without contradicting it; Kling 3.0 does not support last-frame-only I2V. A caller-confirmed named Element may accompany the first frame when supplied as a named binding. Use `@name` only for the exact confirmed name, never a provider asset ID.

Multi-shot prose may use the documented `shot n, m seconds, ...;` form when requested and within the supplied duration. Preserve user-provided dialogue and language. Do not invent named elements, attachments, negative fields, credentials, or video API calls.

## Output contract

Return one final natural-language prompt with no explanations, citations, alternatives, or duplicated paragraphs.
