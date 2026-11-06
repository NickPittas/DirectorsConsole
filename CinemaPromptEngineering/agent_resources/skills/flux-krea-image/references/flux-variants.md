# FLUX variants

- **FLUX.1 (`flux.1`):** use natural language for the exact scene. Image-to-image and Redux are separate dialects; do not claim generic multi-reference behavior from the family name.
- **FLUX.1 Pro (`flux.1_pro`):** the original dialect is text-to-image; the separately declared `flux1_pro_redux` dialect is one-image style reference, not general editing.
- **FLUX.1 Kontext (`flux_kontext`):** for an edit, name the requested change first, then preserve the caller-confirmed identity, layout, lighting, and text. Do not assume an unprovided image or reference.
- **FLUX.1 Krea (`flux_krea`):** keep it distinct from Krea 2. Follow only the selected image-to-image dialect; the hosted route is deployment-specific.
- **FLUX.2 Dev, Max, Pro, Flex:** preserve the exact target variant. Use clear natural-language priorities; supported reference count and inputs are capability metadata, not prompt syntax.
- **FLUX.2 Klein:** keep Klein distinct from Dev. Do not import Dev controls or infer editing from Klein's family label.

Do not add Stable Diffusion weights, negative-prompt blocks, or invented asset tags. Model settings stay outside the prompt.

Sources: Black Forest Labs FLUX prompting and Kontext docs; exact URLs in `prompt_skills.json`.
