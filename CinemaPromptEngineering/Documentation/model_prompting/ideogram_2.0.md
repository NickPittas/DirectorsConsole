# Ideogram 2.0 Prompting Guide

Category: Image

## Official Guidance Highlights
- Use plain natural language; no hidden parameters, weights, or coded flags.
- Word order matters; place critical elements early.
- Ideogram responds best to sentence-style prompts, especially in v2.0+.
- Keep prompts within roughly 150-160 words (about 200 tokens).
- For text, use quotes and describe placement and typography.
- Non-Latin scripts may render poorly; English is most reliable for text.

## Recommended Prompt Structure (from Ideogram prompt structure guide)
1. Image summary sentence
2. Main subject details (include quoted text early)
3. Pose or action
4. Secondary elements
5. Setting and background
6. Lighting and atmosphere
7. Framing and composition
8. Technical enhancers

## Positive Examples
- "A product photo of a perfume bottle labeled "Nightlife for men" on a sleek black surface, moody blue lighting, centered framing, shallow depth of field."
- "A poster with the text "CITY LIGHTS" in bold condensed sans, centered on black, neon blue glow, minimalist composition."

## Negative Examples (What to Avoid)
- "Use --ar 16:9 --v 6" (unsupported flags)
- "A logo::1 (important)" (weights not supported)
- "Text in #FF0000" (no hex or RGB; describe colors)

## Notes
- If you want a specific text style, describe it (bold sans-serif, thin serif, hand-lettered script).
- Use visually grounded details for better adherence.

## Sources
- https://docs.ideogram.ai/using-ideogram/prompting-guide/2-prompting-fundamentals
- https://docs.ideogram.ai/using-ideogram/prompting-guide/3-prompt-structure
- https://docs.ideogram.ai/using-ideogram/prompting-guide/2-prompting-fundamentals/text-and-typography
