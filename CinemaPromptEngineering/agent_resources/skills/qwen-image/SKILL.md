---
name: qwen-image-prompting
description: Write Qwen-Image-2.1 image prompts for an explicitly selected generation, edit, reference, outpaint, or RGBA task.
---

# Qwen-Image 2.1 prompting

Use only when `qwen_image` is paired with the explicit 2.1 selection from the caller or the declared `qwen_image_2_1` image dialect. The generic `qwen_image` target alone does not establish a version or task.

Read [generation and text](references/generation-and-text.md), [editing and references](references/editing-and-references.md), or [RGBA and outpainting](references/rgba-and-outpainting.md) for the selected task. Exact visible text, spelling, language, and user constraints take priority. Use positional detail when it helps; do not force a fixed count of anchors, sentences, or adjectives.

This integration's output is generator prompt text. Do not return the companion Prompt Enhancer JSON object (`rewritten_prompt`, `wh_ratio`, `ratio_follow`) unless a caller explicitly selects a validated workflow contract that consumes it. No such JSON contract is declared here. Do not wrap a CLIP text prompt in JSON.

Actual image pixels may inform prompt wording, but do not claim that they are bound to the generation graph. Native image markers apply only to the selected 2.1 workflow and its confirmed inputs.

Source basis: Qwen model-author 2.1 guidance and local Qwen prompt material; see `prompt_skills.json`.
