# LTX 2.5 prompt guide

**Guide scope:** target ID `ltx_2.5`; exact version LTX-2.5, vendor API and open-weight behavior verified.
**Retrieval date:** 2026-09-18.
**This is prompt guidance only.** It does not claim that a ComfyUI workflow, local node, API credential, or generation backend is installed or available.

## Verified sources

- Retrieved 2026-09-18: [Lightricks/LTX-2.5](https://huggingface.co/Lightricks/LTX-2.5), exact version open-weight model card.
- Retrieved 2026-09-18: [LTX-2 repository](https://github.com/Lightricks/LTX-2), LTX-2.5 pipelines and controls.
- Retrieved 2026-09-18: [LTX-2.5 API model page](https://docs.ltx.io/models/ltx-2-5), API modes, duration, and ending-frame availability.
- Retrieved 2026-09-18: [LTX prompting guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide), single-shot and multi-shot prompt structure.
- Retrieved 2026-09-18: [LTX API changelog](https://docs.ltx.io/api-changelog), exact API release status.

## Single-shot structure

Use one flowing present-tense paragraph, normally 4–8 descriptive sentences. Establish the shot, setting, lighting and palette; define the subject; describe a natural sequence of physical actions; state the perspective movement and the resulting view; then include user-supplied ambient sound, music, speech, or singing. Prefer clear natural language over tags or imported shot-list syntax. Camera and lens terms can describe visual quality, but do not put equipment, rigs, or crew in the scene.

### Verified modes

- **Text-to-video:** build the single-shot paragraph from scene, subject, action, perspective, and audio.
- **First-frame image-to-video:** treat the supplied first frame as fixed starting state and describe the motion and changes that follow.
- **Open-weight keyframes/interpolation:** when the user supplies keyframes, describe the continuous transition between those supplied images; never invent keyframes or reference numbers.
- **Audio-to-video:** synchronize visible beats and pauses to supplied audio without inventing dialogue, language, music, or voice.
- **API ending-frame image-to-video:** LTX-2.5 API documentation verifies the `last_frame_uri` image input. Use it only as an input constraint when the caller actually supplies that asset; describe the action as a path from the supplied first state to the supplied ending state. Automatic duration is not combined with this API control.
- **Multi-shot:** only LTX-2.5 is verified for native multi-shot generation. Prefer 2–4 shots, name transitions in natural language, re-identify subjects after a cut, and state audio continuity. Use the optional duration predictor's style only as action beats in prose (for example, a pause or a beat of silence); do not invent a duration control.

## Output constraints

Return exactly one final prompt paragraph with no headings, explanations, source citations, provenance, or alternatives. Never invent attachments, reference IDs, dialogue, API fields, or backend controls not supplied by the user. The retrieved prompting guide does not establish a general negative-prompt instruction; do not add or recommend a negative field. If the caller's response schema includes one, it may remain empty.

**Illustrative example (not an official quote):** A static medium close-up of a detective beside a rain-streaked window, warm lamplight edging her face. She turns from the glass, crosses to the desk, and pauses before opening an envelope. The view slowly glides closer as rain and a low room tone continue. A cut reveals the envelope on the desk while the same sound carries across the transition.
