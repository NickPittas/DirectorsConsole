# Flux Kontext Prompting Guide

Category: Image (Edit)

## Official Guidance Highlights
- Be explicit about what changes and what must stay the same.
- Use precise prompts for controlled edits; vague prompts can change style or composition.
- For multiple edits, add details while keeping each edit simple.
- For text edits, use quotes and specify preservation of font, color, and layout.
- When identity matters, state the identity markers to preserve.

## Recommended Prompt Structure
1. Change request (what to change)
2. Preservation clause (what must stay the same)
3. Optional detail (style, color, placement)

## Positive Examples
- "Change the sky to a soft orange sunset while keeping the city skyline unchanged. Maintain the same camera angle and composition."
- "Replace "joy" with "BFL" while keeping the same font style, size, and color."
- "Change the background to a beach while keeping the person in the exact same position, scale, and pose."

## Negative Examples (What to Avoid)
- "Put him on a beach" (vague; may change framing)
- "Transform the person into a Viking" (may replace identity rather than clothing)
- "Change to daytime" (may shift style and composition)

## Notes
- If results drift, add explicit preservation: "maintain all other aspects of the original image."
- For character consistency, name facial features, hair, and expression to preserve.

## Sources
- https://docs.bfl.ml/guides/prompting_guide_kontext_i2i
