# Embedded agent integration: current evidence

## Live-verified this session

- Custom workflow creation now passes for the plain image-crop request. Pi authored LoadImage → ImageCrop → SaveImage, saved/attached it, bound the uploaded source, corrected a rejected binding name, executed on Kamino-3, waited and displayed the actual 512 × 512 output. ComfyUI history reports success. Full evidence: pi-autonomous-custom-crop-2026-11-06.md.

- The Console's embedded chat receives real Pi text and tool activity through SSE.
- A plain request for a fox in a spacesuit tending a lunar greenhouse produced a 1344 × 768 image on Kamino-3. Pi selected an existing Klein workflow; this does not verify workflow creation or modification.
- Run `c3e4ddfb-b722-4f25-a732-2ccf904b65eb`, Comfy prompt `f915c341-b7c2-48c8-bb5f-ca8f78cdfb56`, produced `Flux2-Klein_00002_.png`.
- After rebuilding/restarting the gateway, the plain follow-up “Show me the completed fox-in-a-spacesuit greenhouse image from this project. Do not generate another image.” caused snapshot and get_run calls, displayed the actual image in chat at its native 1344 × 768 dimensions, and registered the output as reusable generated media. No new generation action was dispatched.
- That reply also displayed the prior 1024 × 1024 teapot output under the same description. This verifies media delivery, not visual recognition: get_run currently returns metadata/URLs, without image blocks for Pi to inspect.
- In Gallery, Pi opened the disposable project folder and listed the two saved PNGs through real gallery_action calls without modifying files. The Gallery displayed both thumbnails.

## Implemented; live verification still required

- Persistent agent sidebar beside all three applications, with streamed thinking/tool activity, attachments and output media cards.
- Separate Gallery workspace selection; optional Prompt Engineer constraint actions; standalone Console prompt and workflow actions without mandatory handoffs.
- Arbitrary flat API graph proposal validation, preview and existing save/attach integration.
- Real sampled video frames for supported browser codecs; up to three samples per video within the shared four-image budget. Audio remains metadata-only.
- Run waiting and reusable output capture. Capture has a 20-second total deadline, sequential downloads, exact backend-origin checks, and size/MIME limits. Shared pending downloads may finish after an individual caller's deadline.
- Gallery browse and six file operations: rename, move, trash, restore, create folder and rate. No Gallery mutation has been live-verified.

## Shared workspace agent: integrated and manually checked

- One root-owned, project-free Pi conversation now appears beside all three apps. Storyboard registers its actions; changing projects does not rebind the gateway. Explicit cinematic enhancement uses a separate prompt-only session.
- Parent reran frontend TypeScript compilation and the gateway build after workspace tasks 30–38; both pass.
- Live Pi read Console workflow state and Gallery state. Switching from Storyboard to Prompt Engineer while the reply streamed did not interrupt it. Switching to Gallery retained the same history/session; the DOM contains one chat instance.
- From Gallery, Pi prepared, validated and applied a rain-soaked neon alley prompt using explicitly requested Prompt Engineer constraints. The actual enhanced text was confirmed in Prompt Engineer. No render was requested or submitted.
- Replaced only the disposable Console project with an unsaved Untitled Project through New Project / Discard. The workspace session and history survived; Gallery retained its independent folder and Pi read it successfully afterward.
- The autonomous custom crop passed separately: Pi created, saved, attached, bound and executed a new three-node workflow, returning an actual 512 × 512 output. See pi-autonomous-custom-crop-2026-11-06.md.
- Uploaded/generated media binding, backend selection and output retrieval were exercised by that crop. Video/audio coverage and broader graph families remain separate acceptance items.

## Review corrections awaiting live lifecycle verification

The focused Astra review found dropped cancellation/currentness guards during Console awaits and a stale final snapshot await. Parent corrected both shared paths, added gateway-to-browser per-command cancellation, and included originating-action checks before deferred Prompt Engineer application and Gallery folder changes. Frontend and gateway TypeScript checks pass. Pending-command cancellation/expiry/project-switch behavior still requires manual acceptance. Independent model/task guidance is now wired through the backend, typed client, root dispatcher and Pi tool. Its separate live check below passes.

## Independent model prompting guidance: live-verified

- GET /api/prompt-guidance returns exact local model/version/task/dialect/adapter guidance and resource fingerprints without cinematic configuration, media uploads or Console project inputs. An intentionally mismatched LTX version returned unsupported, empty guidance and no fingerprint rather than substituting another version.
- Pi was asked from Gallery to write an LTX 2.5 image-to-video astronaut/sunrise prompt, assuming a starting frame would be supplied later, with no Prompt Engineer constraints and no rendering/panel changes. The Console was an unsaved Untitled Project.
- The first attempt exposed unconstrained task labels and a generic invalid-request error. The tool now declares canonical task values, supports local catalog discovery when no target is provided, and receives declared profile choices on selection-required responses.
- Retrying the unchanged user request succeeded: Pi queried ltx_2.5/i2v, received requires_selection with the declared 2.5/ltx_native profile, queried that exact tuple, received available guidance and wrote a concise prompt. No render or panel mutation action occurred.
- Evidence: docs/reports/screenshots/2026-11-06-embedded/independent-guidance-live.json and independent-guidance-live.png. Activity previews are bounded; the live API separately confirmed two resource hashes and fingerprint d93dc866d6d48fdf59e2a4c39bb69b0386ff8228802674734c6da151e79f37df.
- Guidance is not installed-model, conditioning-media or execution verification. The missing starting frame remained a future generation requirement, not a blocker for drafting.

## Add Panels: live-verified

From Gallery, the plain request “Add two blank panels to the Console. Do not render anything or change existing panels.” caused Pi to read a snapshot and call add_panels with count 2 plus the observed activation and project revision. The Console changed from IDs 1–6 to IDs 1–8; the result reported Panel_07 and Panel_08, each revision 1. No workflow attachment, project save or render action occurred. Evidence: docs/reports/screenshots/2026-11-06-embedded/add-panels-live.json. Parent frontend typecheck and gateway build passed before this live check.

## Panel removal and ID retention: live-verified

From Gallery, Pi was asked to remove blank panels 7 and 8, then add one blank panel, without changing 1–6, deleting files or rendering. It read exact revisions, called remove_panels and add_panels, and the Console ended with IDs 1–6 and 9. The removed IDs were not reused. The removal result reported filesDeleted:false; the disposable project's three generated PNGs remain present. Parent frontend typecheck and gateway build passed with captured exit code0. Evidence: docs/reports/screenshots/2026-11-06-embedded/remove-panels-live.json. Refusal of active/unresolved-run removal and stale revision removal has not been live-checked.

## LTX 2.5 I2V integration

The official pinned I2V source is cached byte-for-byte (raw SHA03b136ba0ad752c1e91e496a23fa4f4826ef881777d591dc9129c459922e7dac). Parent converted it with pinned comfy-cli and fresh Kamino schemas: 50 API nodes. The disabled enhancer cleanup retains 46 nodes; all five model loaders matched exact advertised options, including the transformer's LTX\\ subfolder. No installed-file identity claim is made.

The catalog now has nine entries and exposes six controls including a required first frame with an empty media default. Parent corrected the copied seed default to875362541677469 and packaged the unchanged source in the resolver's standard recipe folder. The recipe guidance reader was incorrectly running image-conditioning preflight while reading metadata; it now reuses independent local guidance, while enhancement/generation media checks remain. Live recipe API returns all six controls and available I2V guidance without uploaded media. Parent frontend compilation and gateway build pass. Actual browser attachment, media binding and execution subsequently passed for one uploaded source image. See pi-autonomous-ltx25-i2v-2026-11-06.md; the result is49frames,1280×704,24fps,2.041667s, with successful ComfyUI history and real sampled-frame inspection by Pi. Integration attempts exposed stale unsupported metadata, an internal capture missing the original Console binding, literal-phrase recipe search, and a mistyped target binding. Parent corrected the metadata and capture, made local recipe search match words independent of punctuation, and distinguished a binding-argument typo (refresh/copy exact snapshot) from a real old-turn/new-project rejection. No video result is claimed from these planning attempts.

## Gallery media import and inspection: live-verified

With no uploaded attachments after a browser reload, from the chat beside Prompt Engineer, Pi was asked to find the newest Gallery video and describe actual visible action without generating or changing files. The initial list action exposed only root files and hid subfolders; parent added existing folder-tree metadata to its response. Retrying the unchanged request, Pi listed Panel_02, chose v004.mp4, imported its actual1,015,878bytes through Gallery’s fixed serve-image API into the independent shared media library, then inspected real frames. Its description correctly identified the armored fox lowering onto its forepaws and sitting upright, and explicitly limited the observation to sampled frames with no sound evaluation. No Console binding or Prompt Engineer constraints were needed for those actions.

Gallery imports are tagged as Gallery provenance and are available for inspect_media/bind_media. They are not automatically appended as pixel data on later chat turns; direct user uploads retain that behavior. Frontend typecheck and gateway build pass. Evidence: docs/reports/screenshots/2026-11-06-embedded/gallery-video-inspection-live.json. Cancellation/timeouts and changed-file refusal are source-guarded, not live-proven.

## Live panel controls: live-verified

From Gallery, Pi was asked to show the LTX video's Console settings without changing values or rendering. It read the snapshot and called `show_panel_controls` for panel 1 and the exact saved workflow/revisions. The action returned `shown`, video-generation/img2vid, and six controls; the root tab remained Gallery until the parent manually selected Storyboard for visual inspection. The sidebar then displayed the LTX workflow, duration 2 seconds, 24 FPS, seed 875362541677469 and 16:9 aspect ratio. The disposable project's complete panel records are identical before and after. No render was requested. Evidence: `docs/reports/screenshots/2026-11-06-embedded/ltx-live-controls.png`.

Visual inspection also showed a broken reference-image thumbnail after reload. This is a remaining UI defect, not evidence that the saved upload binding was lost; file/binding recovery still needs inspection.

Follow-up: fixed the display source for safe `storyboard_` upload basenames using the existing selected backend URL, without changing stored parameters. Live recheck opened the same LTX controls through Pi: the reference loaded from Kamino's input view at 1344×768 and the complete saved panel records remained identical. Evidence: `ltx-reference-preview-fixed.png`. Restored-file crop/mask operations were not changed or verified.

## Outstanding acceptance and scope

### Optional cinematic constraints across tasks: prompt composition live-verified

Pi was asked from Gallery to draft four LTX 2.5 I2V prompts for four different subjects using the selected Prompt Engineer cinematic style, with starting frames to be supplied later and no rendering or settings changes. Prompt Engineer stayed on `generic`, had no attached starting frames, and its selected preset stayed Blade Runner. Pi called `prompt_engineer_action` with `constraints`, then independently resolved the exact LTX 2.5/i2v/ltx_native guidance and produced four subject-specific prompts with consistent noir cinematography. No prepare/apply, panel mutation or generation action occurred. Evidence: `optional-cinematic-i2v-prompts-live.json` and `.png` in the screenshot evidence directory.

The constraint read renders the captured config through the deterministic generic formatter and returns authoritative preset/style context when selected. It checks the PE revision and initiating action before/after the API await; invalid cinematic config is rejected. It does not inherit PE target/task/media, enhance/apply a prompt, or establish generation readiness. Parent gateway build and frontend compilation passed during this integration; no automated tests ran. Pending style-change and shared-asset replacement races, and a real four-image-to-four-video chain, remain unverified.

- Broader workflow modification and generative workflow creation acceptance. The custom three-node crop passes; this does not verify other graph families or video routes.
- Four-panel rendering now passes: Pi created four 1024×576 Klein images with seeds 910241–910244 and reused each in its corresponding LTX I2V panel. All four video histories report success, 1280×704, 49 frames at 24 FPS (about 2.04 seconds). Source/upload byte hashes match per panel. The original attempt needed an attachment-contract fix and a continuation, and Pi ended its reply before video completion. A bounded read-only completion waiter now fixes that path: a subsequent twelve-second clip used one Pi tool call across two real bridge reads, then returned the completed native video card, with exactly one render submission. No PE action was used for that standalone request. The original eight-render chain is not yet an uninterrupted autonomous-delivery pass; see pi-four-panel-image-to-video-2026-11-06.md. Wait cancellation, expiry and budget exhaustion remain unverified live.
- A live old-turn/new-activation check passed: sent a crop-workflow attachment request, immediately used New Project / Discard, then observed console_target_not_authorized on Pi’s bound inspection. No preparation/save/attachment/generation action followed; the shared chat continued. This checks pre-dispatch activation targeting, not cancellation during an already awaited write.
- Workspace lifecycle acceptance beyond the checks above: pending Console command rejection across A→B→A, same-project reactivation, credential expiry, cancellation and adapter replacement. Source guards are implemented; those scenarios are not live-proven.
- Full panel/workflow/backend lifecycle coverage, remaining Gallery operations and Prompt Engineer constraint editing.
- Actual audio analysis/transcription; no audio perception is claimed.
- Remote model-installation integration/live checks, custom-node lifecycle, Codex harness adapter and Antigravity assessment. Claude is excluded by user instruction.
- Recovery for a run created before the disposable project's first save changes its identity; unresolved-submission resolution UI; sampler-phase progress accuracy for other custom classes. The observed LTXVLatentUpsampler false third-phase match is corrected and frontend compilation passes; the corrected display awaits the next required render.
- Updated actual screenshots of all three applications with the embedded sidebar are saved as final-console-agent.png, final-prompt-engineer-agent.png and final-gallery-agent.png in the evidence directory. Broader final integrated verification and review remain.

## Verification boundary

Agent Open Project and continuation now pass live verification after correcting a legacy restoration bug. The initial run restored only three of eight saved panels because six unnamed blank panels were skipped; that result is a failed restoration check, despite successful tool dispatch. The loader now tracks consumed saved panel records instead of using names as identity and retains unnamed panels. The repeated real Pi request restored all eight saved panels and added a ninth in the same turn. Saved project files remained byte-identical; Prompt Engineer retained The Matrix/Midjourney. Evidence: `open-project-fixed-live.json/.png`; the earlier `open-project-live.json/.png` intentionally retain the failed run. Frontend typechecking passes. Explicitly empty workflow selection now remains empty rather than being silently replaced by the route-selection effect.

Unsaved-choice behavior: in the first plain New request after an explicit-discard Open, Pi reused the earlier discard choice. Agent guidance now explicitly scopes a choice to its transition. On the repeated plain New request with unsaved work, Pi asked Save/Discard/Cancel and left the current project and files unchanged; the parent then cancelled that request. This validates observed agent behavior, not a natural-language authorization parser.

The complete Save As → New → Open sequence now passes in one real Pi turn. Pi saved Global Override Verification, created a six-panel blank project, then reopened the new saved file. Its nine panels and enabled Global Prompt Override returned with the exact text `Round-trip global prompt: a fox watches bright greenhouse plants.` File readback confirms nine panels and the override flag/text. Both earlier saved project files remained byte-identical. No render ran; Prompt Engineer retained The Matrix/Midjourney. Evidence: `project-lifecycle-roundtrip-live.json/.png`. The second legacy project-browser load implementation now delegates to the same loader, removing its duplicate restoration path; frontend compilation passed after that consolidation, but that browser entry point was not clicked again. Chat activity status is now hidden after settlement while actual thinking/tool records remain available.

Agent New Project and same-turn continuation pass live verification. From the disposable eight-panel project with an unsaved prompt edit, the user explicitly requested discarding those edits, creating a blank project, and adding one panel. Pi called New with the discard choice, refreshed its snapshot, then added a panel in the same turn. Console became Untitled Project with seven blank panels; Prompt Engineer retained The Matrix and Midjourney. SHA-256 readback confirmed both previously saved project files unchanged. No Gallery or render action was invoked. Evidence: `new-project-live.json/.png`. Global Prompt Override reset and round trip subsequently passed in the lifecycle sequence above.

Save transition review follow-up: the parent fixed both P2 findings in `agent-save-transition-review-astra.md`: the current-source guard now runs inside the project write queue immediately before I/O; rejected guarded activation restores the previous recovery pointer only if no newer pointer/controller identity has superseded it. Existing unguarded pointer clearing is preserved. Frontend compilation passed. A subsequent real Pi Save of the existing project persisted all eight panels without changing panel count or project title. Race/cancellation paths remain source-checked rather than live-reproduced.

Agent Save As and same-turn continuation now pass live verification. From a six-panel disposable Console, Pi received only the requested save location/name and instruction to add one blank panel afterward. It read a snapshot, saved `Agent_Lifecycle_Verification_project.json` with six panels, read the new activation, and added Panel_07 in the same turn. The browser validated the completed transition receipt and transferred only that active turn's Console grant; the transport result retained the original binding for correlation. A follow-up Save As saved seven panels to `Agent_Lifecycle_Verified_project.json`, then added Panel_08. The menu now shows Agent Lifecycle Verified after fixing the missing React settings update. Prompt Engineer retained The Matrix and Midjourney; no Gallery or render action was invoked. Evidence: `save-project-live.json/.png` and `save-project-after-ui-fix.json/.png`. Cancellation, conflicting-file refusal and activation races remain source-checked only; New and Open subsequently passed the live checks above.

Project-independence correction: the legacy human Console New Project handler still called `useCinemaStore.resetSession()`. Parent removed that call. Live check selected Blade Runner and entered a distinctive scene in Prompt Engineer, then used Console New Project / Discard in the disposable project. Console became Untitled Project with six blank panels; Prompt Engineer retained both preset and exact scene text. Frontend compilation passed.

Manual Console Enhance independence is now live-verified through Pi. Console used its own LTX-2.5 I2V target, confirmed first frame and standalone prepare/validate routes in a separate tool-free prompt session. Changing Prompt Engineer from Blade Runner to The Matrix during enhancement did not invalidate or style the Console result; PE's target remained Midjourney. A second enhancement did not overwrite a newer Console edit. Browser resource records show successful standalone prepare, session resume/turn and standalone validate requests; a deliberately mismatched preparation fingerprint returned HTTP 409. Evidence: `console-enhance-independent-live.json`, `console-enhance-stale-live.json` and `console-enhance-independent-live.png` in the screenshot evidence directory. Legacy-provider endpoint behavior has not been verified with a live provider account.

Parent frontend typecheck and gateway build pass. The workspace checks above used the actual Pi provider and disposable UI/data; they were manual acceptance checks, not an automated suite. No automated tests, fixtures, benchmarks or regression suites ran. No commit/push was made. Private configuration and the unrelated path-mapping modification were left untouched.

Codex integration is in progress, not accepted end to end. The pinned native 0.166.0
adapter now has authenticated catalog discovery, scoped session creation, turn streaming,
application-tool reuse, media staging, abort/disposal and current-session context refresh.
Gateway HTTP routes select Pi or Codex explicitly; Codex never falls back to Pi. Browser
session calls and enhancement/chat gates accept either harness with an exact matching
inventory. The Settings selector now offers Pi/Codex and preserves saved settings until
explicit Save. Frontend typecheck passed after the selector and caller changes.

Manual Codex evidence so far is metadata-only: real private-host startup/disposal,
catalog parsing, exact thread-start validation, staged-image byte preservation, packaged
loading of both reviewed application guides, and paired HTTP catalog discovery. The
unsigned-in profile returned zero models and a sign-in message. Unknown/duplicate harness
selectors and extra query parameters returned HTTP 400. A native resume request before
any model turn failed; its cause remains unknown. Authenticated turns, native tool
inventory/isolation and restart restoration are unverified.

Native OAuth helpers, process ownership, paired login routes and typed browser requests
are implemented. Their review findings were corrected in source: teardown scrubs URLs,
blocks replacement while cleanup is pending, and retains failed cleanup ownership.
Sign-in controls are implemented and mounted for the Codex selector. Integrated frontend
typecheck and gateway build pass. No actual Codex login or inference has occurred.
Launcher native discovery is implemented and syntax-checked; normal
launcher startup with Codex configuration remains unverified.

Installed-login reuse correction: a native `account/read` against the existing Codex
home reported an existing ChatGPT account without a new sign-in or credential copy.
The launcher now preserves explicit `DC_CODEX_HOME`, otherwise uses existing `CODEX_HOME`
or `~/.codex`. The host accepts an owner-controlled existing directory without changing
its permissions, while app workspaces still require private permissions. The remaining
startup blocker is inherited MCP configuration: an empty process override does not
disable configured server entries. A bounded per-server process override is in progress.
Existing config files and directory permissions were not changed. No inference ran.

Installed-login discovery now passes through the production host opener: state `ready`,
eight catalog models, and three process-only MCP disable overrides. The installed CLI's
override parser rejected quoted server-name components; the host now accepts only bounded
bare names and emits that form, failing closed for other names. Build passed and the
native process was disposed. No sign-in, credential copying, config edits, or inference
occurred. Authenticated turn execution and application acceptance remain outstanding.
