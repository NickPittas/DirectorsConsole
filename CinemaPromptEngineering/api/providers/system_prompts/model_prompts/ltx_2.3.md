# LTX 2.3 prompt guide

## Verified sources

- Retrieved 2026-09-18: [LTX prompting guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)
- Retrieved 2026-09-18: [LTX-2.3 model documentation](https://github.com/Lightricks/LTX-2/blob/main/MODELS-LTX-2.3.md)
- Retrieved 2026-09-18: [LTX-2 repository](https://github.com/Lightricks/LTX-2)

## Prompt guidance

Use one flowing present-tense paragraph, normally four to eight descriptive sentences. Establish the shot and setting, define visible subjects, describe an ordered physical action, then perspective movement, lighting, atmosphere, and only supplied sound or speech. Keep camera and lens terms as visual language, never visible equipment, rigs, or crew. In image-to-video, treat the supplied image as the established first state and describe what changes afterward; do not invent a reference number or ending-frame control. LTX-2.3 documentation does not establish a generic identity-reference prompt-token interface.

Put supplied dialogue in quotation marks and preserve its words and language. Do not invent audio, dialogue, attachments, provider IDs, API controls, or a negative prompt. The enhancer describes prompt prose only; it does not claim that a local workflow or API is available.

## Output contract

For `ltx_native`, return one final flowing prompt paragraph with no headings, explanations, citations, alternatives, or duplicated paragraphs.

For the explicitly selected `ltx_ingredients` IC-LoRA workflow, the input is ONE already-composed reference sheet, not independent image uploads. Return exactly two parts: `Reference sheet: <describe the supplied panels and their roles> / Generated video: <the requested visible action and cinematic treatment>`. Do not invent panels, assemble a sheet, or claim that the generator received it. Inspect panels only when actual sheet pixels accompany the enhancement request.

Ingredients source: https://docs.ltx.io/open-source-model/integration-tools/ic-lo-ra-adapters.md (LTX-2.3 Ingredients adapter and LTX-2.5 workflow).
