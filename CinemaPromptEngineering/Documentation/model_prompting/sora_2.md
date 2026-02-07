# Sora 2 Prompting Guide

Category: Video

## Official Guidance Highlights
- Prompting is like briefing a cinematographer: be specific about the shot.
- Balance detail and freedom; shorter prompts give more variation.
- Iterate with small changes to camera, lighting, or action.
- Some attributes (model, size, seconds) are controlled by API parameters, not prose.

## Prompt Anatomy (from official guide)
1. Camera framing and shot type
2. Subject details and action beats
3. Lighting and palette
4. Motion and timing
5. Optional dialogue or sound cues

## Positive Examples
- "Wide shot of a quiet library at dusk, slow dolly forward, warm pools of light on tables, dust motes drifting, hushed mood."
- "Medium shot of a train platform at dawn, soft haze, slow pan right as the train arrives, muted color grade."

## Negative Examples (What to Avoid)
- "Make it longer and 4K" (length and resolution are API parameters)
- "Scene 1: beach. Scene 2: city. Scene 3: space" (too many scenes in a short clip)

## Notes
- For longer sequences, stitch multiple short clips rather than one long prompt.
- Dialogue can be included, but keep it short and clearly quoted.

## Sources
- https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide/
