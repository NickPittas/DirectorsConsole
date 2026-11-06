# Hosted MiniMax dialect

Use natural-language prompt prose for the validated `minimax_api` dialect. Do not emit local H3 section headings, local `<Picture N>` tags, invented provider asset IDs, negative fields, or attachment claims.

Describe first/last-frame motion only when those roles are confirmed. For references, describe only caller-confirmed roles and preserve their order. Hosted H3 image-to-video keyframes and reference inputs are separate task modes; do not combine them by implication. A reference video alone does not establish whether the task is editing, continuation, or a broad visual reference; require the caller's explicit task.

Preserve supplied dialogue and sound instructions. Keep camera movement in natural prose. Do not fabricate duration, audio, or model controls. Return one final prompt without explanation or citations.

Source basis: MiniMax hosted generation API guidance and the project's H3 Max prompt guide, retrieved 2026-09-18.
