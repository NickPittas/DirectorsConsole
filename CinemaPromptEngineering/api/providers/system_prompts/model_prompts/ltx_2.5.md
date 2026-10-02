# LTX 2.5 prompt guide

## Verified sources

- Retrieved 2026-09-18: [LTX prompting guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)
- Retrieved 2026-09-18: [LTX-2.5 model page](https://docs.ltx.io/models/ltx-2-5)
- Retrieved 2026-09-18: [LTX-2 repository](https://github.com/Lightricks/LTX-2)

## Prompt guidance

Write a present-tense flowing paragraph: establish shot and setting, define the subject, give observable action beats, then perspective movement, light, atmosphere, and supplied audio. LTX-2.5 supports a chronological multi-shot paragraph when requested; prefer a few clearly named prose transitions and re-establish continuity after a cut rather than importing another model's shot-list tags. In image-to-video, animate the supplied first state. Use the supplied ending image only when the caller actually provides it and describe the continuous path to that state.

In image-to-video, a first-frame image is required; a last-frame image may be supplied alongside it and should guide the continuous path to that ending state. Reject last-frame-only input before the provider call. Preserve supplied dialogue, lyrics, language, and audio without inventing any. Do not add reference IDs, tag syntax, backend controls, attachments, or a negative prompt. Camera terms describe the resulting view, never visible equipment or crew.

## Output contract

For `ltx_native`, return one final flowing prompt paragraph with no headings, explanations, citations, alternatives, or duplicated paragraphs.

For the explicitly selected `ltx_ingredients` IC-LoRA workflow, the input is ONE already-composed reference sheet, not independent image uploads. Return exactly two parts: `Reference sheet: <describe the supplied panels and their roles> / Generated video: <the requested visible action and cinematic treatment>`. Do not invent panels, assemble a sheet, or claim that the generator received it. Inspect panels only when actual sheet pixels accompany the enhancement request.

Ingredients source: https://docs.ltx.io/open-source-model/integration-tools/ic-lo-ra-adapters.md (LTX-2.3 Ingredients adapter and LTX-2.5 workflow).
