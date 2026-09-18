# Wan 3.0 prompt guide

## Verified sources

- Retrieved 2026-09-18: [Wan video prompt guide](https://www.alibabacloud.com/help/en/model-studio/text-to-video-prompt)
- Retrieved 2026-09-18: [Wan 3.0 API reference](https://help.aliyun.com/en/model-studio/wan3-video-generation-api-reference)

## Prompt guidance

For T2V, build from entity, scene, motion, and optional aesthetic or style detail. For I2V, treat the supplied image as the established entity, scene, and style and focus on motion and perspective movement. For reference generation, use only caller-confirmed per-kind labels such as `Image 1`, `Video 1`, or `Audio 1`; images and videos are counted separately, and the enhancer cannot verify upload order or media contents. Describe reference roles and relationships in prose rather than inventing provider IDs.

Add sound only when requested. Preserve supplied dialogue exactly; use the user's requested language and voice details without inventing lines. Multi-shot timing may use the documented overall description plus shot number and timestamp style when timing is supplied. Do not add a separate negative field, attachments, credentials, or video API submission.

## Output contract

Return one final natural-language prompt with no explanations, citations, alternatives, or duplicated paragraphs.
