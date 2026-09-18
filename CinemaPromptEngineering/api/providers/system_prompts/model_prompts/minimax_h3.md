# MiniMax H3 prompt guide

This guide distinguishes the local MiniMax-H3 checkpoint from the hosted MiniMax API. It is prompting guidance only: it does not claim a node, weights, credentials, account, or media upload.

## Verified sources

- Retrieved 2026-09-18: [MiniMax local T2VA/I2VA/FL2VA/L2VA guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)
- Retrieved 2026-09-18: [MiniMax local full-reference guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md)
- Retrieved 2026-09-18: [MiniMax local deployment guide](https://platform.minimax.io/docs/guides/local-deploy-h3)
- Retrieved 2026-09-18: [MiniMax V2 create API](https://platform.minimax.io/docs/api-reference/video-generation-v2-create)

## Local H3 dialect

When the selected dialect is `local_h3`, write text, image-to-video, and last/first-frame prompts as named text sections, not JSON. Keep this exact order:

```text
integrated_multimodal_description: ...

overall_soundscape: ...

non_diegetic_music: ...
```

For `ref2v`, use these six sections in this exact order: `subject_definitions`, `summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music`. Define supplied content with `<Subject N>`, `<Picture N>`, `<Video N>`, and `<Audio N>` labels. Use source tags only for confirmed per-kind ordinals in connection order; `<Subject N>` names derived content and is not an asset ID. In `summary`, begin with a bracketed task type; in `retention_analysis`, use only the documented visible markers `fully_preserved`, `partially_preserved`, `attribute_transfer`, `weak_reference` and audio markers `fully_copy`, `partially_copy`, `reference`, `weak_reference`. Preserve source order and gaps.

T2V starts with the three core sections. I2V begins with the prescribed first-frame line, `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.` FL2V begins with a first/last alignment line; L2V begins with a last-frame alignment line. In the official base guide, I2VA first-only is always Picture 1, L2VA last-only is always Picture 1, and FL2VA first/last is Picture 1 then Picture 2. Do not rewrite a caller's contradictory base ordinal or silently renumber it; the backend rejects that binding. Preserved ordinal gaps apply to ref2v connection mapping only, so a confirmed ref2v Picture 3 remains Picture 3. First/last-frame alignment begins at 0.00 seconds and ends at the caller-supplied effective duration; the end time must use exactly two decimals. Never fabricate a duration or a source asset. In ordinary shots, Shot 1 has no cut timestamp; later shots have increasing cut times within the supplied duration.

Describe natural camera motion with type, meaningful amplitude, and speed in the shot prose. Do not append invented camera tokens. Give vocal subjects stable IDs such as `(S1)` and preserve user-provided dialogue literally inside `<d>[Language] ...</d>`; do not invent, translate, or paraphrase dialogue. Put ambience and physical sounds in `overall_soundscape`, and audience-only score in `non_diegetic_music`; use `N/A` only when the user explicitly requests silence or no score.

## Hosted MiniMax API dialect

When the selected dialect is `minimax_api`, use concise natural prose appropriate to the caller's task and the API's structured content roles. Do not emit local H3 section headings or local `<Picture>` tags unless the caller explicitly supplied such text. The hosted API uses content roles for first/last frames and reference media; do not invent provider asset IDs, negative fields, dialogue controls, or attachments. H3 and H3 Max reference numbering is not a verified universal prompt syntax, so describe only confirmed bindings supplied by the caller.

## Output contract

For local H3, obey the named-section structure above. Begin T2V at the first core field; begin ref2v at `subject_definitions:`. I2V may have only its required official alignment line and one blank line before the core fields. Keep every required section nonempty and include `[Shot 1]` in the main narrative. In ref2v, define and use only the caller-supplied source labels; `<Subject N>` is a generated content label, not an asset binding. `detailed_description` is normally 350-500 English words for reference generation, but dialogue-dense prompts and video-editing prompts are exceptions: preserve all supplied dialogue and do not pad or truncate to meet a count. Write `overall_soundscape` in 1-4 English sentences, or `N/A` only for explicit complete silence; write `non_diegetic_music` in 1-3 sentences, or `N/A` when no audience-only score is requested. These are guidance limits, not a semantic grammar check. For the hosted dialect, return one final natural-language prompt without explanations, citations, alternatives, or duplicated paragraphs. In both dialects, retain the user's configuration and supplied dialogue; do not claim aesthetic or media validation that the enhancer cannot perform.
