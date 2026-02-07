# DALL-E 3 Prompting Guide

Category: Image

## Official Guidance Highlights
- DALL-E 3 expects detailed prompts; the API will automatically expand prompts.
- Supported sizes: 1024x1024, 1024x1792, 1792x1024.
- Use the quality parameter (standard vs hd) to trade cost/latency for quality.
- Use style parameter (vivid or natural) to influence look.
- DALL-E 3 supports text-in-image generation.

## Recommended Prompt Structure
1. Subject + action
2. Scene and setting
3. Lighting and mood
4. Style or medium
5. Any text (quoted) and placement

## Positive Examples
- "A clean studio product photo of a teal backpack on a light gray backdrop, soft shadows, natural lighting."
- "A cafe window with the word "OPEN" in warm amber neon letters, rainy street reflections, cinematic mood."

## Negative Examples (What to Avoid)
- "No people, no shadows, no text" (use a positive description)
- "A scene with everything" (overly broad prompts)

## Notes
- Because prompts are expanded automatically, keep the intent clear and specific.
- Use size and style parameters via API, not in the prompt text.

## Sources
- https://help.openai.com/en/articles/8555480-dall-e-3-api
