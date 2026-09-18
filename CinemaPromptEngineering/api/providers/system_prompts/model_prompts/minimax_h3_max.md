# MiniMax H3 Max prompt guide

This guide is for the hosted `MiniMax-H3-Max` API variant only. It does not imply a verified local H3-Max checkpoint, node, account, or media upload.

## Verified sources

- Retrieved 2026-09-18: [MiniMax video generation guide](https://platform.minimax.io/docs/guides/video-generation)
- Retrieved 2026-09-18: [MiniMax V2 create API](https://platform.minimax.io/docs/api-reference/video-generation-v2-create)
- Retrieved 2026-09-18: [MiniMax H3 announcement](https://www.minimax.io/blog/minimax-h3)

## Prompt guidance

Use the hosted API dialect's natural-language brief: establish the subject and setting, describe sequential physical actions, then the shot scale, natural camera movement, light, palette, and supplied sound. For a supplied first or last frame, describe only the motion from that established state or the path that resolves into it. For reference generation, describe each caller-confirmed image, video, or audio binding by its supplied role; do not invent numbered assets, provider IDs, dialogue, language, or negative fields.

Image-to-video keyframes and reference-to-video inputs are mutually exclusive in the documented API. The enhancer can validate the caller's declared roles, but cannot inspect media or verify graph bindings. Preserve user-provided dialogue and audio instructions; never add dialogue merely because audio exists. Keep camera motion natural in the prose rather than appending unverified command syntax.

## Output contract

Return one final natural-language prompt with no headings, explanations, citations, alternatives, or duplicated paragraphs. Do not emit local H3 named sections: local structured fields apply only to the explicit `local_h3` dialect of `minimax_h3`.
