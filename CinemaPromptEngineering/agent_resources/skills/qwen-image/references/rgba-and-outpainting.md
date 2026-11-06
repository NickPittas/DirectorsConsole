# Qwen-Image 2.1 RGBA and outpainting

For the documented native RGBA task, use the model-author transparency trigger and describe a clean subject silhouette. Avoid describing an opaque background when transparency is requested. This wording does not prove that the selected workflow emits an alpha channel.

For outpainting, identify which canvas edges extend and describe only the new region plus the continuity that must be preserved. The canvas resize and mask belong to the workflow. Do not claim unchanged pixels are guaranteed by text alone.

Keep the user's exact aspect or layout intent. Ratio and `ratio_follow` fields belong only to a separately validated PE JSON contract, not to the generator text returned by this integration.
