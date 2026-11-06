# Pi four-panel image-to-video acceptance

Status: four images and four LTX videos complete. The premature final-delivery behavior was corrected and a subsequent long-running single-video request passed across two read cycles.

The parent supplied a plain objective: create four 1024×576 armored-fox greenhouse images with different seeds and the selected cinematic style, then animate each into a two-second LTX 2.5 video in the same four panels. The request named no recipe, workflow, node or tool. Verification uses the disposable project and Kamino-3 only.

Pi read the selected Blade Runner constraints separately from exact model/task guidance, inspected the backend, added three panels, prepared and attached four Klein image workflows, set per-panel prompts/seeds, and submitted four image runs. Actual PNG headers confirm 1024×576; ComfyUI history confirms successful completion with seeds 910241–910244. Files are Flux2-Klein_00003_.png through _00006_.png. Fingerprint typos were rejected before dispatch and Pi corrected them.

The first turn stopped at video workflow attachment: the gateway required the same saved workflow revision in both savedWorkflowRevision and expectedWorkflowRevision, but its description did not explain that duplicate requirement. Parent removed the duplicate-input requirement: savedWorkflowRevision now supplies the exact workflow precondition; an explicitly conflicting expectedWorkflowRevision still fails. The frontend still compares that precondition with canonical storage. Gateway build passed.

After restarting/re-pairing the development gateway, the parent restored the same Blade Runner selection and sent an outcome-only continuation to animate the existing four panel images. No engineering or tool instructions were supplied. Pi recovered the completed image assets, attached the existing LTX I2V workflow to each panel, bound each corresponding generated asset and supplied distinct motion prompts with duration 2 seconds. SHA-256 comparison of the source output PNG and uploaded first-frame bytes matches for all four panels. Pi submitted four video jobs; this is not yet proof of completion.

Evidence in docs/reports/screenshots/2026-11-06-embedded:

- four-panel-image-history.json — actual ComfyUI image histories.
- four-panel-images-complete.png — actual app after image completion.
- four-panel-first-frame-identity.json — per-panel source/upload byte hashes.
- four-panel-video-history.json — all four successful video histories: files 00003 through 00006, each 1280×704, 49 frames, 24 FPS, approximately 2.0417 seconds.
- four-panel-chain-after-fix.json — UI/tool evidence, including Pi's premature pending-jobs reply.

During the initial attempt, all four native video players appeared in their original panels after Pi had already replied that panel 1 was running and panels 2–4 queued. This exposed the autonomous waiting/final-delivery defect corrected below.

Completion-wait follow-up: the gateway now keeps `get_run(waitSeconds:60)` active through up to 20 sequential reads with a 20-minute budget checked between reads. An in-flight read can take up to its existing 120-second command bound beyond that time budget. Every bridge read has a fresh command ID with the same run ID, original session/project/binding and existing validation. It stops on errors, terminal/unknown status, manual-resolution flags or cancellation. Budget expiry adds `waitTimedOut` while preserving the real unfinished status. Other waits remain single reads. No generation endpoint is called by this helper. Following review, the tool signal also settles its specific pending bridge read and removes its listener/timer; gateway build passed, while signal-only cancellation remains source-checked.

Live check: four- and eight-second panel-4 requests returned real finished video cards, but completed within their initial reads. A subsequent twelve-second clip crossed the read boundary: one Pi tool call made two application reads of run `dbb0c7d4-2264-45e2-b6d3-411c5aa84ef2`; the first returned pending and the second complete. There was exactly one submission/job, Comfy prompt `f2477866-374c-43ff-9733-6816553107f0`, output `video/LTX-2.5_i2v_00009_.mp4`, 289 frames at 24 FPS, 1280×704, approximately 12.0417 seconds. Pi then reported completion and showed a playable native video in chat. The request made no Prompt Engineer action. Evidence: completion-wait-twelve-second.json and completion-wait-twelve-second-history.json in the evidence directory. Gateway build passed.

This verifies the repaired long-wait delivery path for one real render; the original full eight-render chain has not been rerun uninterrupted after the repair. Cancellation during waiting, credential expiry and budget exhaustion remain source-guarded rather than live-proven. Sample-frame review of the four original videos shows a stable recognizable greenhouse setting, but panel 1 moves more than requested; exact motion fidelity and audio quality are not established.

No uninterrupted eight-render pass is claimed: the attachment contract needed a parent fix and a new user-style continuation. No automated tests, fixtures or benchmarks ran. Video quality, style-change races and asset replacement races remain unverified.

Panel naming follow-up: addPanel now keeps its allocated ID but increments the default name until unused. Parent manual UI check added temporary ID5, renamed it Panel_06, then added ID6: the new name was Panel_07. The temporary blank panels were removed; original IDs1–4 and their four videos remain. Existing duplicate names were intentionally not renamed, to preserve saved paths/history. Frontend TypeScript compilation passed.
