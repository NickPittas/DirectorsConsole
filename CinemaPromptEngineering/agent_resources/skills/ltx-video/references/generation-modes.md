# LTX generation modes

For ordinary T2V, describe the requested scene and observable action in chronological prose. For I2V, treat the supplied first image as the opening visual state and describe what changes afterward. Do not invent what an image contains when its pixels are unavailable.

First/last-frame generation is available only when the exact selected version and workflow expose both roles. Use a supplied first image at the opening and a supplied last image as the ending constraint; describe a plausible path between them. A last-frame sentence without a bound last image is not endpoint control. The packaged exact task/version matches determine whether this skill applies.

V2V and continuation need actual source-video conditioning. Describe the intended change or continuation while preserving only the source properties the user asks to retain. Do not treat a still frame as video history. Keep audio instructions tied to supplied audio or explicit user intent.

Ordinary LTX prose does not use MiniMax `<Picture N>` tags, FLUX tokens, or mandatory JSON. Camera language describes the resulting view; it does not add a camera object to the scene.
