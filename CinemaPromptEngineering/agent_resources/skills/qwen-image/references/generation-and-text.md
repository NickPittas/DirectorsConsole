# Qwen-Image 2.1 generation and typography

For text-to-image, describe the requested finished image in natural language. The subject, action, scene, style, palette, lighting, and spatial relationships are useful details, not a mandatory template or count. Keep unspecified choices open when the user intends ambiguity.

Preserve literal visible wording, script, and punctuation. When text should appear in the image, quote the exact requested text and clarify its placement or appearance only as needed. Do not add aspect ratio, resolution, provider settings, or sampler controls to prompt prose.

The Qwen companion PE-T2I/PE-I2I interface can use structured fields for aspect ratio and ratio inheritance. That is a separate output contract; this CPE integration returns generator text unless a validated workflow explicitly asks for the structure.
