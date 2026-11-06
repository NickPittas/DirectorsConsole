# Qwen-Image 2.1 editing and references

For a single-image edit, lead with the exact requested change and state what must remain unchanged. Do not re-describe untouched content in a way that implies a second edit. Only discuss visible content when its pixels were actually supplied to the enhancer.

For the 2.1 multi-reference workflow, preserve caller order and use `<image1>`, `<image2>`, and later markers only when the selected workflow declares that syntax. Describe each input's confirmed role separately; do not invent a canvas/donor split or collapse distinct images into a range. In the documented 2.1 workflow, `image_1` is the edit source and later inputs provide content. Do not transfer this syntax to other Qwen artifacts or image models.

When an image dialect declares style-only references, describe style influence without claiming identity or scene locking. The backend validates bytes and ordering, but it does not prove that a workflow graph binds those pixels.
