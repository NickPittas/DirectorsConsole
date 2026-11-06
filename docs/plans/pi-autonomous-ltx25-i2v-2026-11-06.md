# Pi image-to-video acceptance — 2026-11-06

The plain request was sent through the embedded chat while Prompt Engineer was visible:

> Animate this into a 2-second LTX 2.5 video. The fox gently turns its head toward the plants while the greenhouse lights softly pulse. Keep the composition stable. Show me the result.

The original previously generated fox PNG was attached through the file picker. No workflow, node, tool, binding or sampler instructions were included. Pi used the selected Pi/openai-codex/GPT-6 Luna/medium configuration; no provider/model fallback was used.

## Successful flow

Pi read application state, prepared the exact cached LTX I2V source through the pinned converter, saved and attached a new workflow, bound the supplied image, set a standalone LTX prompt and duration2, submitted once, waited through three get_run calls, retrieved the output and inspected three actual decoded video frames. One rejected media binding was corrected within the successful turn. No Prompt Engineer constraint action or handoff was required. Switching the visible app to Storyboard while Pi waited did not interrupt the turn.

- Workflow: cb8c6b7a-2350-4676-b9bb-36eb0951c457, revision1, panel1.
- Run: 9bb74cbe-323b-40b1-96ed-d7ec54f31a2c.
- ComfyUI prompt: 13bffdfe-a45c-416d-a783-e624b17c1027 on Kamino-3.
- Upstream raw source hash: 03b136ba0ad752c1e91e496a23fa4f4826ef881777d591dc9129c459922e7dac.
- The submitted API graph has46nodes; four disabled prompt-enhancer nodes were removed. The first-frame path395 remained linked to the actual uploaded image.
- duration_seconds2, fps24, seed875362541677469; native8-interval then3-interval sigma schedules retained. The transformer loader used the exact advertised LTX subfolder path. No model download or installed-file hash verification occurred.
- Output: video/LTX-2.5_i2v_00002_.mp4; H.264 video, AAC audio,1280×704,49frames at24fps,2.041667seconds. ComfyUI history reports success/completed.
- The output appeared in the Console panel and embedded chat as native video, and was retained as reusable asset media:799f7579-e918-4f46-9181-4e2aba4d886f. Pi inspected real JPEG samples at0.199166,0.995833 and1.7925seconds.

## Evidence

- docs/reports/screenshots/2026-11-06-embedded/fox-ltx25-i2v.mp4
- docs/reports/screenshots/2026-11-06-embedded/fox-ltx25-frames.png
- docs/reports/screenshots/2026-11-06-embedded/ltx25-i2v-complete.png
- docs/reports/screenshots/2026-11-06-embedded/ltx25-i2v-complete.json
- docs/reports/screenshots/2026-11-06-embedded/ltx25-i2v-history.json

## Corrections exposed by live integration

Fixed a copied seed default; packaged the source under the resolver’s standard folder; removed conditioning-media preflight from read-only recipe guidance; updated stale unsupported-export metadata; carried the original Console activation through internal recipe capture; normalized local source-search words/punctuation; distinguished a mistyped binding argument from an actual project switch. Earlier planning/preparation failures submitted no video job.

## Limits

This proves one cached image-to-video workflow was imported/prepared, attached, configured, bound, rendered and returned by Pi. It does not prove all workflows, four-panel image→video orchestration, autonomous project creation, audio understanding or remote installation. Visual review confirms the greenhouse persists but the fox bends its body more than the requested gentle head turn; this is pipeline acceptance, not exact motion-quality acceptance. Audio was present but not evaluated. The progress sidebar counted a latent upsampler as a third sampler phase; a scoped correction is next. Global model identity and readiness remain unverified. No automated tests, fixtures or benchmarks ran; no commit/push was made.
