# LTX editing and output adapters

The manifest restricts each adapter to its reviewed version. Apply only the prompt rule for the selected adapter, and confirm its required source video, mask, guide, or output route in the actual workflow. Prompt text cannot supply those signals.

| Adapter | Reviewed version | Prompt-specific requirement |
|---|---|---|
| In-Outpainting | 2.3 | Use an empty/minimal prompt or describe only the fill region; do not caption the whole source scene. |
| Relight | 2.3 | Use the documented light-direction sphere and format: `relight the video to match the light-direction ball. <look> from <direction>`. |
| Day-To-Night | 2.3, 2.5 | Describe the desired night lighting while retaining source structure and motion. |
| Colorization | 2.3, 2.5 | Preserve scene geometry; use the documented `COLORIZE` format only for this adapter. |
| Decompression | 2.3, 2.5 | Preserve the scene; use `ENHANCE QUALITY` only for this adapter. |
| Deblur | 2.3, 2.5 | Describe the same scene and intended focus recovery; do not invent new content. |
| Water-Simulation | 2.3, 2.5 | Describe the requested water and its interaction with the supplied source. |
| Clean-Plate | 2.3, 2.5 | Describe the unobstructed result; the source and graph must provide the removal context. |
| Instant-Shave | 2.3 | Begin with the documented `REMOVEBEARD` trigger. |
| Cross-Eyed | 2.3 | Describe the intended continuous eye direction. |
| Pixel-Spatial-Upscaler | 2.3, 2.5 | Requires the matching low-resolution source and upscaler route; it is not generic restoration. |
| Refine-Details / Restore | 2.5 | Describe the intended detail or restoration result without promising preservation beyond the workflow. |
| Alpha-Gen | 2.5 | The documented prompt is empty; alpha output requires its dedicated workflow. |
| HDR | 2.3 | Requires the dedicated LogC3 workflow; ordinary HDR wording is insufficient. |
| SDR-To-HDR | 2.5 | Uses fixed supplied text embeddings; do not write a prompt in place of that conditioning. |
| DubIt | 2.3 | Requires reference video/audio and its dubbing route; preserve the requested replacement words and speaker intent. |

The uppercase triggers above are documented adapter syntax, not general LTX prompt tokens. No sampler schedules, speed settings, or accelerated-model choices belong in these prompt resources.

Source: Lightricks model-card guidance adapted from the local official-adapter reference reviewed 2026-10-07.
