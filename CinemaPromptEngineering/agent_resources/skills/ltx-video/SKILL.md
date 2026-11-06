---
name: ltx-video-prompting
description: Write LTX-2.3 or LTX-2.5 video prompts for the explicitly selected task and conditioning adapter.
---

# LTX video prompting

Use this guidance only for the exact LTX target/version, task, and adapter selected by the caller. The unversioned `ltx_2` target does not select 2.3 or 2.5. These instructions supplement the existing target prompt and cinematic configuration.

Keep the user's style, visible details, dialogue, language, and requested sound. Prompt prose cannot attach media, set workflow controls, or prove that an input is connected. Mention only caller-confirmed inputs and roles; uploaded pixels used for enhancement do not prove generator graph binding.

For ordinary T2V/I2V and supported first/last-frame workflows, read [generation modes](references/generation-modes.md). For Ingredients, read [Ingredients](references/ingredients.md). For other selected controls, read [control adapters](references/control-adapters.md) or [editing adapters](references/editing-adapters.md). For V2V/audio tasks, use only the exact adapter match in the manifest and preserve source media limits.

Most ordinary prompts are concise chronological prose. Treat shot, action, camera, light, and sound details as useful choices, not required counts. Do not add other model families' tags, JSON formats, or prompt syntax.

Source basis: LTX user-maintained prompting guidance reviewed 2026-10-07; Lightricks and Comfy-Org sources are listed in `prompt_skills.json`.
