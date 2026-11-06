# Krea variants

- **FLUX.1 Krea (`flux_krea`)** is not Krea 2. Follow the selected `flux_krea_img2img` route for image-to-image; do not claim a style-reference role unless a compatible dialect is selected.
- **Krea 2 Large (`krea_2_large`)** and **Krea 2 Turbo (`krea_2_turbo`)** are separate model variants. Large can keep more supplied detail; Turbo can be concise, but both must retain explicit constraints.
- Krea 2 style-reference and starting-image editing are separate roles in the declared image dialect. A style reference influences style; it does not by itself lock subject identity or scene content. Mention a reference only when the caller identifies its role.

Keep intentionally exploratory prompts open. Do not invent props, locations, lens details, or plot to make a short prompt longer. Do not transfer Krea 2 guidance to FLUX.1 Krea or vice versa.

Sources: Krea model and prompting documentation; exact URLs in `prompt_skills.json`.
