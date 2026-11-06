# Pi/Klein live render milestone — 2026-11-06

## Result

**One Pi-requested Klein render completed on Kamino-3.** The image appeared in Panel_02, was saved in the disposable project folder, opened successfully in Gallery, and remained visible after browser reload. This passes the first single-image generation/result milestone, with the lifecycle limitations below still open.

No additional GPU submission, video render, model download or installation was performed. No automated tests were run.

## Actual run

| Field | Observed value |
|---|---|
| Application harness | Pi 1.5.0 |
| Agent selection | openai-codex / gpt-6-luna, medium thinking |
| Backend | Kamino-3, `http://100.122.195.17:8188` |
| Project | Disposable Agent Verification |
| Panel | Panel_02 |
| Workflow | `a7bb8b46-b8c6-48c3-b557-cef876799345`, revision 1 |
| Route | FLUX.2 Klein 4B distilled T2I |
| Run ID | `c34cdd3f-25a9-467b-acda-b7bad19fc7fc` |
| ComfyUI prompt ID | `45751162-2536-483f-8f0e-32c0f3c5527a` |
| Seed | `432262096973490` |
| Output | One 1024 × 1024 PNG |
| ComfyUI result | `status_str: success`, `completed: true` |
| Application journal | Run and backend job both `complete`; same prompt ID retained after browser reload |

Prompt:

> An orange ceramic teapot rests on a wooden table, framed in a contemplative medium shot with the teapot placed along the rule of thirds. Soft natural afternoon sunlight from the window brings out the warm glaze and wood grain, with neutral-saturated color and a quiet, considered atmosphere.

The parent inspected the saved PNG: it depicts an orange ceramic teapot on a wooden table beside a softly lit window. This is a single output inspection, not a quality benchmark or a compatibility claim for other recipes.

## Live observations

1. Pi read the authenticated application snapshot and submitted through the existing typed `start_generation` action, single mode on Kamino-3.
2. The application persisted the run/prompt identity and received direct ComfyUI WebSocket node/step updates. Sampler updates reached 4/4; the UI's phase estimate was inaccurate, as noted below.
3. ComfyUI completed successfully and returned `Flux2-Klein_00001_.png` from output node 78. The actual submitted graph retained the panel's teapot prompt, 1024 × 1024 dimensions and seed.
4. Panel_02 displayed a fully loaded 1024-pixel-wide image. Other panels were not rendered.
5. Auto-save wrote `project/Panel_02/Disposable_Agent_Verification_PanelPanel_02_v001.png` under the temporary verification directory.
6. Gallery discovered one image in Panel_02. The parent opened it through Gallery's lightbox; the lightbox image loaded at 1024 × 1024. The Gallery image endpoint returned HTTP 200 and `image/png`.
7. The parent used Save Project and reloaded the browser. Panel_02's image remained loaded, and the completed journal record remained in browser storage. Project JSON retains workflow and panel parameters; media history is also reconstructed/recovered by the existing application paths rather than embedded in that JSON.

## Bugs corrected during the live attempt

All changes are confined to `CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx`:

- Application snapshots now report each panel's stored parameter values. The selected panel previously inherited values from the independent editing sidebar, making its saved teapot prompt appear absent.
- The shared panel/workflow attachment check now compares the requested workflow with the panel's actual attachment, rather than the sidebar selection.
- Generation scope validation uses the attached panel workflow for `usePanelSnapshot` agent runs. Manual sidebar generation retains its existing selection behavior.

The blocked attempts occurred before ComfyUI submission. The parent checked the empty backend queue/history before retrying. Exactly one prompt was eventually submitted, and that prompt completed; no ambiguous submission was replayed.

Frontend TypeScript compilation and owned-file whitespace checks passed. No automated tests or test fixtures were created or run.

## Remaining defects and limits

1. **First-save run identity transition:** this disposable session's run was journaled under an `unsaved:…` project identity. Using Save Project changed the active identity to the saved project file. The journal retained the completed run, but a later Console `get_run` request returned `run_not_found` because the active project scope changed. Identity migration/reconciliation needs a bounded follow-up; do not claim complete run-history continuity across first save or Save As.
2. **Progress phase count:** broad sampler-name detection counted `KSamplerSelect` as a sampling phase. This single sampling route was labeled as two phases and its progress reached 50% before completion. Node/step updates and completion worked; the aggregate percentage needs correction.
3. **Gallery automation limitation:** the background preview's virtualized grid initially rendered no cards despite one discovered file. Switching to the existing Masonry view and opening the lightbox verified the actual image. Normal visible-grid behavior remains a separate verification item; no Gallery source was changed.
4. **Browser pairing after reload:** fresh-page gateway pairing/session recovery is still part of normal-launcher acceptance. The reload check here verified panel/journal retention, not a new authenticated Console turn after reload.
5. No video/I2V, cancellation, interrupted-submission recovery, installation, multiple-backend or additional-harness acceptance is established by this run. Recipe catalog readiness flags were not promoted globally.

## Artifacts

All temporary artifacts are under `/tmp/directors-console-ui-retry-plownlfq/`:

- `project/Disposable_Agent_Verification_project.json`
- `project/Panel_02/Disposable_Agent_Verification_PanelPanel_02_v001.png`
- `render-history.json` — actual ComfyUI history response including prompt graph and successful output
- `render-journal.json` — completed application run record captured after reload

These are disposable verification artifacts and may be cleared by the operating system. Temporary application services are stopped after verification. No commit or push was performed.
