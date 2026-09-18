# LTX 2.3 prompt guide

**Guide scope:** target ID `ltx_2.3`; exact version LTX-2.3, vendor/open-weight behavior verified.
**Retrieval date:** 2026-09-18.
**This is prompt guidance only.** It does not claim that a ComfyUI workflow, local node, API credential, or generation backend is installed or available.

## Verified sources

- Retrieved 2026-09-18: [Lightricks/LTX-2.3](https://huggingface.co/Lightricks/LTX-2.3), exact version LTX-2.3 open-weight model card.
- Retrieved 2026-09-18: [LTX-2 repository](https://github.com/Lightricks/LTX-2), pipelines and LTX-2.3 compatibility.
- Retrieved 2026-09-18: [LTX-2.3 model documentation](https://github.com/Lightricks/LTX-2/blob/main/MODELS-LTX-2.3.md), controls and checkpoints.
- Retrieved 2026-09-18: [LTX prompting guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide), shared prompt structure.
- Retrieved 2026-09-18: [LTX API changelog](https://docs.ltx.io/api-changelog), API release status and model names.

## What to write

For a single shot, write one flowing paragraph in present tense, normally 4–8 descriptive sentences. Establish the shot and setting, describe the subject and physical action as a sequence of verbs, define visible character details, describe the perspective movement and what the subject looks like after it, then describe lighting, atmosphere, and any user-supplied audio. Natural prose is preferred; do not paste tag lists or another model's shot-list syntax. Camera and lens choices may describe the look, but no camera, rig, or crew appears as an object in the scene.

### Verified modes

- **Text-to-video:** describe the shot, setting, action, subject, perspective, and sound.
- **First-frame image-to-video:** treat the supplied first frame as established visual state and describe only the intended motion, expression, environmental change, and sound that follow it.
- **Open-weight keyframes/interpolation:** when the user supplies multiple keyframes, describe the continuous action and visual transition between those supplied frames. Do not invent keyframe assets or numbering.
- **Audio-to-video:** when the user supplies audio, align visible beats, mouth movement, pauses, and atmosphere to that audio. Do not invent a soundtrack, dialogue, language, or voice.

LTX-2.3 documentation does not verify an API ending-frame control or a named identity-reference-to-video mode. Do not claim either. Documented IC-LoRA controls are conditioning/control adapters, not permission to invent a reference asset or call the mode an identity-reference API.

## Output constraints

Keep the existing general output contract: return exactly one final prompt paragraph, with no headings, explanations, source citations, provenance, or alternatives. Do not invent attachments, reference IDs, dialogue, API fields, or backend controls that the user did not provide. The retrieved sources do not establish a general LTX-2.3 negative-prompt instruction; do not add or recommend a negative field. If the caller's response schema includes one, it may remain empty.

**Illustrative example (not an official quote):** A medium-wide view of a salt-stained fishing boat at dawn, grey water rolling beyond the rail. The fisherman coils a rope, pauses as spray crosses his face, and looks toward the horizon. The view glides closer while cold overcast light catches the wet fabric and timber. Wind, rope creak, and the user's supplied audio shape the moment.
