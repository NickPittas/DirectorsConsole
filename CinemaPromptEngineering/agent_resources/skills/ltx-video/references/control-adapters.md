# LTX control adapters

Use the adapter selected in the manifest only with its listed LTX version. Describe the intended final scene, consistent with the actual guide signal; prose does not create or preprocess a control input.

- **Union-Control (2.3):** use the supplied Canny, depth, or pose guide supported by that graph. Caption the final scene, not the appearance of a control map. Do not assume arbitrary channel combinations.
- **Motion-Track-Control (2.3):** requires a reference video with colored spline trajectories. Describe motion that follows those tracks; coordinates in prose are not a substitute.
- **Layout-To-Render (2.5):** requires the layout driver and a separate art-directed look reference in the selected graph. Describe the finished shot briefly and match the supplied look.
- **Ingredients (2.3/2.5):** use the separate exact two-part contract in `ingredients.md` and one composed sheet.

These are distinct adapters. Never substitute one control signal or adapter grammar for another. Do not infer version compatibility from a similar adapter name.
