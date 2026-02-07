# LTX-2 Prompting Guide

Category: Video

## Official Guidance Highlights
- Use a structured prompt that covers shot, scene, action, character, and camera movement.
- Describe motion over time; keep a single, readable action beat.
- Avoid internal states; show emotions via visible action.
- Avoid text/logos unless explicitly supported.

## Prompt Anatomy (Recommended)
1. Shot type + framing
2. Scene context + lighting
3. Character + action
4. Camera movement + pacing
5. Optional audio cue (if supported)

## Do This
- Use film language (wide/medium/close-up, push-in, tracking, tilt).
- Keep one main action and one camera move.
- Make emotions visible (tears, smile, trembling hands).

## Avoid This
- Multiple camera moves in one sentence.
- Internal feelings with no visible action ("she feels sad").
- Text overlays or logos in-scene.

## Positive Examples
```text
Close-up of a violinist's hands; warm stage light; fingers move across the strings as the camera slowly pushes in.
```
```text
Wide shot of a rain-soaked street; a taxi glides by; the camera pans right at a steady pace, neon reflections.
```
```text
Medium shot of a baker kneading dough; soft window light; gentle handheld sway, slow tempo.
```

## Negative Examples (What to Avoid)
- "She feels nostalgic and thinks about home" (internal state only)
- "Text says SALE across the screen" (text/logos)
- "Pan left, then tilt up, then zoom in" (too many moves)

## Sources
- https://docs.ltx.video/api-documentation/prompting-guide
- https://ltx.io/model/model-blog/prompting-guide-for-ltx-2
