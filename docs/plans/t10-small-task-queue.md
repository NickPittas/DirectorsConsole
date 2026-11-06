# T10 recovery: small task queue

## Current checkpoint — 2026-11-06

**Autonomy acceptance failed:** a fresh Pi session received only an image description and 1344 × 768 resolution. It read the snapshot, inspected Kamino, attempted panel parameter changes and prompt preparation, then stopped at the mandatory handoff gate. No new render or graph modification occurred. See [pi-autonomous-image-request-2026-11-06.md](pi-autonomous-image-request-2026-11-06.md). The guided render below proves execution of an existing workflow only.

**Latest milestone:** one authorized Pi/Klein image render completed on Kamino-3, displayed in Panel_02 and Gallery's lightbox, and remained visible after browser reload. The completed run journal retained the prompt ID. See [pi-klein-live-render-2026-11-06.md](pi-klein-live-render-2026-11-06.md). First-save project-identity continuity and inaccurate sampler-phase counting remain concrete follow-up defects. The older no-render statements below describe the earlier implementation/preparation checkpoint.

The bounded implementation waves below are complete and source-reviewed; no delegates remain running. Pi gateway, scoped prompt/conversation paths and typed application actions are implemented. Five exact cached routes are connected to bounded export and application preparation: Klein 4B distilled T2I, LTX 2.5 distilled T2V, MiniMax base T2V/I2V, and FastH3 8-step T2V. Each still reports readiness `not_verified`.

Compilation, manual upstream conversion, real backend schema/loader advertisement inspection, production parser binding and browser/gateway hash checks passed as recorded below. The live Pi/Klein preparation, save, attachment and validated-prompt milestone also passed in the disposable project described below. This is not render acceptance. No automated tests, rendering, model downloads or installations were run.

The authorized disposable-project browser retry succeeded using DOM reads and ordinary DOM actions through preview_evaluate. Snapshot/click adapters still time out, and the alternate browser-access host was unavailable; the underlying automation adapters are not repaired. Actual Pi authentication returned 65 available models. The isolated application used openai-codex/gpt-6-luna at medium thinking for these product turns. This product selection is separate from the implementation-team settings. Broader Pi acceptance still gates the planned Codex adapter; Claude use remains excluded under the user's current instruction.

Still outstanding beyond this wave: render/output acceptance and broader live workflow coverage; registration and verification of installation-management tools; unresolved-submission recovery UI; broader task/adapter and accelerated-recipe coverage; Codex/Claude application adapters and Antigravity assessment. Existing installation APIs/helpers and queued-generation protections do not establish these missing runtime acceptances. Changes remain uncommitted; no push was performed.

### Parent live browser retry

- Created and saved `/tmp/directors-console-ui-retry-plownlfq/project/Disposable_Agent_Verification_project.json` through the UI, with temporary application data/settings and Kamino-3 selected. Existing user projects/configuration were not changed.
- Actual Console turns used the authenticated Pi session and typed application tools to inspect Kamino, resolve/export the pinned Klein distilled recipe, prepare a revision, save it and attach it. The first attempt exposed a saved-but-unattached bug: storage metadata (`parentRevision`, `updatedAt`) polluted the content fingerprint. The parent aligned fingerprint exclusions with backend record-content metadata; frontend compilation passed.
- Retried the saved revision successfully, then verified a fresh initial save/attach on Panel_02 after an immutable Prompt Engineer handoff. Fresh workflow `a7bb8b46-b8c6-48c3-b557-cef876799345`, revision 1, is attached to Panel_02. Panel_01 and its earlier workflow remain preserved.
- The agent called the shared prompt preparation/validation path and applied the validated orange-teapot prompt to Panel_02. The saved project JSON confirms the panel-specific prompt and workflow IDs. Actual DOM inspection confirms selected Panel_02 and visible Prompt, Width, Height and Seed controls. Selecting a panel does not automatically restore its parameters into the global editing context, per existing application behavior.
- Live dependency planning initially misreported Klein's checkpoint as absent because Kamino advertises a subfolder-qualified name. The shared planner now normalizes separators and recognizes a unique basename match; multiple matches remain unknown. A refreshed real Kamino dependency-plan request returned all three dependencies advertised, no missing node classes, and no not-advertised identities. File identity and installation access remain unverified.
- No render, generation submission, installation or download was requested or performed. These results establish the Klein UI/provider/tool/save/attachment milestone only; the other four routes retain their previous source/manual-composition evidence and `not_verified` readiness.
- Temporary services are stopped and the owned browser tab is closed after verification. The disposable project and isolated workflow records are retained under the temporary directory as inspection artifacts. No commit or push was performed.

The interrupted T10b edits are preserved. Parent owns architecture, prerequisite discovery, integration, and live verification. Luna receives one behavior per assignment with exact file and function boundaries. No task includes a general hardening pass. No automated tests, fixtures, benchmarks, service launches, live provider calls, model downloads, or remote operations.

## Wave 1: parallel, independent

1. **UI graph gate — implemented, parent source-reviewed.** StoryboardUI.tsx now rejects non-empty subgraph definitions rather than every nodes array. Delegate frontend compilation and whitespace check passed; runtime not verified.
2. **Report complete, parent read:** binding map at CinemaPromptEngineering/docs/plans/ref2va-control-binding-map.md. Prompt/duration primitive widget names are absent, images use parsed.image_inputs, and ResolutionSelector produces both dimensions. Its other widget values must be preserved.
3. **Report complete, parent read:** frontend graphToPrompt requires an initialized LGraph; pinned CLI validation invokes convert_ui_to_api but does not return its API graph. Follow-up 3b inspects that helper's exact return/widget/subgraph contract before implementation.
   **3b — in progress:** read pinned comfy_cli/workflow_to_api.py and document whether its existing converter can provide a bounded offline export. No application edits or execution.

## Following tasks, assigned only when their prerequisite is concrete

4. **Implemented, parent source-reviewed:** exact Ref2VA unchanged-source overlay exception; nested optimization alternatives remain untouched. Delegate frontend compilation and whitespace checks passed.
5a. **Implemented, parent source-reviewed:** two scalar primitive widget mappings; compilation passed.
5b. **Implemented, parent source-reviewed:** media branch maps reference images to parsed loader-source inputs with distinct names. Delegate compilation passed. Required-media enforcement remains a separate gap.
5c. **Implemented, parent source-reviewed:** named saved widget values are read after API inputs; false/zero/empty values are preserved. Delegate compilation passed.
6a. **Implemented, parent source-reviewed:** all three ResolutionSelector widget names preserved; delegate compilation passed.
6b. **Implemented:** Ref2VA metadata now names its actual aspect_ratio widget; graph/settings unchanged.
6c. **Implemented, parent source-reviewed:** aspect_ratio allowed and explicit inputName selects the exact parameter; invalid supplied names fail. Delegate compilation passed.
5d. **Implemented:** requiredMedia metadata is typed and copied from the recipe binding; delegate compilation passed.
5e. **Implemented, parent source-reviewed:** Console checks required image values before a new submission; existing idempotent run recovery remains intact. Delegate compilation passed. This is presence, not backend file verification.
7a. **Implemented, parent source-reviewed:** fixed pinned Python converter helper rejects reported warnings/errors/output noise; syntax passed. Unwired and not runtime-verified.
7b. **In progress:** standalone bounded Node subprocess wrapper for the fixed helper; no model tool or recipe integration in this slice.
8. Connect one cached recipe to that export adapter, preserving source/export fingerprints. One recipe only.
9. **Report complete, parent read:** lexical guard has false permits and false blocks. No explicit intent field exists in the inspected message/composer contract. Report recommendation is not yet an accepted design; natural-language requests such as 'Can you generate…' remain valid action requests. No new approval UI authorized by this report.
10a. **Implemented, parent source-reviewed:** snapshot saved flag uses canonical revision, storage readiness, conflict state and persisted content fingerprint. Delegate compilation passed.
10b. **Implemented, parent source-reviewed:** scoped getter refuses unsaved, nonselected and omitted graphs. Gateway compilation passed.
11a. **Implemented, parent source-reviewed:** timestamped fresh cache accessor, no fetch or cache mutation. Delegate compilation passed.
11b1. **Implemented, parent reviewed/corrected:** helper rejects missing/oversize data; parent fixed empty class lists and exact TTL boundary. Frontend compilation passed.
11b2. **Implemented, parent source-reviewed:** readonly bounded schema snapshot, selected saved workflow/backend checks, privacy and unavailable reasons. Delegate compilation passed.
11c. **Implemented, parent source-reviewed:** schema getter binds to observed saved workflow ID/revision and hashes with the existing CLI canonical function. Gateway compilation passed.
11r1. **Implemented, parent source-reviewed:** bounded node-class discovery including nested definitions, no graph mutation. Normal frontend compilation passed in parent.
11r2. **Stopped without edits:** snapshot privacy helper is handler-local. Parent must expose the existing check before recipe schema caller wiring.
11r2a. **Implemented, parent source-reviewed:** original privacy function moved to file scope with unchanged predicates/messages, frontend compilation passed.
11r2b. **Implemented, parent source-reviewed:** recipe source and schema metadata agree on ID/fingerprints/backend, with privacy/size checks. Delegate compilation passed.
11r3. **In progress:** populate browser schema cache during explicit inspection only. Parent prevented invalidated older cache requests from overwriting current entries; frontend compilation passed.
8a. **In progress:** gateway getter retrieves exact recipe and cached schema with scoped dispatch; no conversion/tool registration.
12a. **Provider failure, no edits:** original notes registration run closed unexpectedly before editing or compilation. Retrying as smaller task 12a1, not the whole registration.
12a1. **Implemented, parent source-reviewed:** standalone notes tool, compilation passed; unwired.
12a2. **Implemented, parent source-reviewed:** one notes tool registered; expected names and prompt clause agree. Delegate gateway/frontend compilation passed. Parent manual direct CLI invocation on the real cached Ref2VA graph succeeded with three notes, comfy-cli 1.22.0. This does not verify authenticated browser/tool round trip. Parent aligned CLI child Python environment cleanup with the export wrapper.
12b1. **Implemented, parent source-reviewed:** standalone validation captures saved workflow and matching schema, reuses formatter, compilation passed.
12b2. **Implemented, parent source-reviewed:** validation definition registered; expected tool names and prompt clause agree. Parent gateway build passed. Manual real gateway pairing/model inventory/session creation confirmed Console tools available and Prompt Engineer tools unavailable, with no inference. Both sessions disposed and the temporary gateway/pairing files removed. Tool execution/browser round trip and ComfyUI rendering remain unverified.
13. Review one generation-start path against its dependency report and current panel snapshot. Fix only a concrete identified mismatch.
14. Parent performs the first manual local tool round trip; then the selected live backend verification when accessible.

Each coding brief must supply the relevant code, expected input/output, caller contract, named forbidden files, and one completion criterion. A newly discovered prerequisite is reported rather than absorbed into the task. Parent reviews each diff before assigning dependent work.

## Live Kamino findings

After the user started ComfyUI, parent read the real API at http://100.122.195.17:8188: version 0.43.2, RTX 4090, 2,748 node classes, object_info 6,519,186 bytes. Klein 4B/encoder/VAE and MiniMax FL2VA/Ref2VA base dependencies are advertised, often under subfolders; file identity remains unverified. LTX 2.5 distilled and older LTX-2 19B variants are advertised; the curated 2.3 recipe is not an installed-model match. No render, download, installation or automated test ran.

- **K1 implemented, parent source-reviewed:** modern COMBO/options and legacy enums decode without changing filename strings; syntax passed.
- **K2 implemented, parent source-reviewed:** three exact LTX custom-loader folder categories registered from pinned upstream source; syntax passed. No root inference.
- **K3 parent corrected:** UI-only Reroute removed from LTX backend dependency requirements; source graph/hash unchanged, JSON readback passed.
- **K4a source report complete:** delegate identified the pinned graph but could not capture raw bytes. Parent fetched and cached 116,505 original bytes, SHA-256 eb1a415a467a2ef1ea63cdb4e79a35315e29c971b1e4f7646ed149a2971fdbd7. Manual offline export with Kamino schema returned 44 API nodes, promoted enhancement switch false. Catalog metadata and exact loader paths remain separate follow-up.

Parent manually invoked the bounded Node/Python exporter with the actual cached Klein source and Kamino object_info. Conversion succeeded (comfy-cli 1.22.0, 16 API nodes, readiness not_verified). No render or model load occurred. The unchanged graph still needs the explicit distilled-route overlay and exact advertised loader subfolders before execution; conversion is not render acceptance.

**08a implemented, parent source-reviewed:** recipe export inputs are bound to exact selected backend, recipe and schema fingerprints. Parent corrected backend/handoff IDs to accept their existing reference format rather than recipe slugs; gateway compilation passed.

**08b implemented, parent manually exercised:** exact Klein base-route removal on a clone. Live-source review caught bypassed distilled nodes 77/78; parent added an explicit activation operation to the catalog and helper. The resulting API export contains 16 nodes, only the distilled route, Euler, CFG 1 and 4 steps. Source artifact unchanged. Parent added a minimum advertised-output-node requirement because the converter otherwise accepted a prompt-only graph. This is not completeness or render proof. Exact loader subfolder binding and application integration remain next.

**08c implemented, parent source-reviewed and manually exercised:** three Klein loader inputs bind uniquely to real Kamino advertised choices, retaining the UNET subfolder spelling. Identity remains unverified. Gateway build passed. Composition, agent tool registration and application preparation are not yet connected.

**08d implemented, parent source-reviewed and manually exercised:** composition joins exact overlay, pinned converter and loader bindings; it preserves original source provenance and fingerprints the final bound graph. Real cached-source/manual invocation returned 16 API nodes and the expected three advertised loader choices. No rendering or tool/browser round trip.

**08e/08f implemented, parent source-reviewed:** optional gateway-only export payload is mirrored in both bridge contracts. Browser SHA-256 canonicalization matches the gateway implementation; Web Crypto must be available. Gateway/frontend compilation passed in the delegated slices.

**08g implemented, parent source-reviewed:** Klein preparation supplies the export internally within the existing mutation queue, retains command IDs and revisions, and rechecks backend/recipe/schema/handoff capture before dispatch. Requires trusted process variable DC_COMFY_PYTHON; no configuration file was written. Browser consumption (08h) is in progress. No runtime round trip claimed.

**K4b/K4c implemented, parent source-reviewed:** six LTX 2.5 control bindings mapped and one recipe appended; all six older entries remain. The new recipe explicitly remains unsupported_requires_supported_export / not_verified. Mutable artifact URLs and unknown model metadata/licenses are recorded honestly. Selected-backend loader binding and optional enhancement branch handling remain unresolved.

Parent's direct GET to the local CPE recipe route on 127.0.0.1:9800 was refused because that service was stopped. This is not a recipe-route runtime pass; application-level live verification remains pending.

**08h implemented, parent source-reviewed:** exact pinned Klein export is consumed by preparation only after backend/handoff/source/recipe/schema/export checks. Four source control bindings are mapped to their upstream API-export IDs. Parent frontend compilation passed after the delegate's final type correction. No browser preparation/save/attach round trip was exercised.

**Parent manual recipe API verification:** temporarily started the actual CPE app on loopback with isolated temporary XDG data/config directories. Real reads exposed a pre-existing ID rule rejecting dots in versioned recipe IDs. Parent aligned that rule across resolver, gateway tool inputs, scoped getter and bridge validation; bounded length, leading character restrictions and fixed source-path containment remain. After restart, Klein and LTX 2.5 detail routes returned HTTP 200 with prompt guidance available. LTX retains its explicit blocked status. Gateway build passed; the temporary server was stopped. No tests, inference or renders ran.

**K4d implemented, parent source-reviewed and manually exercised:** pinned false prompt-enhancement branch becomes direct original-prompt links on a cloned API graph; four enhancer nodes are removed, leaving 40 of 44 nodes. Original source/export unchanged. Gateway build passed. This avoids that optional model requirement only in the transformed copy; LTX loader binding and application export integration remain incomplete, with no render or speed proof.

**K4e–K4h implemented, parent source-reviewed:** shared exact-loader binder handles both LTX VAEs without duplicating the matching implementation. Pinned LTX composition and gateway/browser preparation are connected; its explicit post-export overlay records removal of the disabled enhancer. Catalog has five effective controls and five dependencies; original raw source remains unchanged. Parent refreshed Kamino object_info (2,748 classes, 6,519,186 bytes), exercised both composed routes with the production source-class collector, and observed Klein 16 nodes/3 bindings, LTX 40 nodes/5 bindings. Schema subsets were 17,679 and 37,956 bytes; actual browser fingerprint functions matched gateway hashes. Production parser found all intended controls uniquely and all five LTX defaults matched the catalog. Gateway build and delegated frontend compilation passed. LTX status now source_verified_runtime_unverified, readiness not_verified. No full browser preparation/save/attachment or rendering was exercised.

**MiniMax M1–M8 implemented, parent source-reviewed:** T2V/I2V source-to-API maps, one shared pinned base-route pruner, four-model exact-loader wrapper, catalog API bindings and shared gateway export flow. Parent exercised T2V 23→18 nodes and I2V 26→21 nodes; each retains 20 base steps, four loader matches, and I2V retains first_frame from node 114. Existing parser found four scalar bindings uniquely with matching defaults, plus the I2V image input. Composed routes with production schema subsets (37,737 / 72,717 bytes) passed and browser/gateway hashes matched. A first invocation used the prior build while compilation was still finishing; parent reran after the build completed and both routes passed. No acceleration or rendering claim.

**M10 implemented, parent source-reviewed:** preparation accepts only the two exact MiniMax recipe/SHA pairs, exact control-role sets, and required I2V first-frame media through the existing empty-default upload binding. Klein/LTX checks remain. Parent final gateway build and frontend typecheck passed. I2V overlay metadata (M9) is awaiting final handoff; no full browser preparation/save/run round trip was exercised.

**M9 complete and parent source-reviewed:** I2V post-export overlay and effective dependency classes recorded; five bindings and four pinned dependency records retained. M1–M10 are now implemented and source-reviewed. Both MiniMax base recipes are marked source_verified_runtime_unverified, readiness not_verified. This replaces the now-obsolete missing-export implementation blocker, without claiming a browser or render pass.

**FastH3 acceleration source captured:** official pinned video_fastvideo_fasth3_t2v.json cached unchanged (60,008 bytes; raw SHA 416fdaf93f35e90c41afc531f05fbfd234ff55c61bd99f643527b2204324da62). Parent upstream export returned 20 API nodes, 8-step simple schedule, res_multistep, video/audio sigma shifts 10/3 and the documented sparse-attention route. The specific FastVideo V2 checkpoint basename is advertised by Kamino; file identity/runtime remain unverified. F1 fixed-route binding helper is in progress; catalog and application integration are separate tasks. This does not substitute FastH3 for base/Ref2VA/OmniRef checkpoints.

**F1/F3 implemented, parent source-reviewed and manually exercised:** exact FastH3 settings and four-model binding gate added to shared export/preparation gateway path. Parent composed the actual pinned source against the production schema subset (32,527 bytes): 20 API nodes, 8 steps, four advertised paths, matching browser/gateway schema and export hashes. Production parser found all four controls uniquely and their catalog defaults matched. Gateway build passed. The catalog currently parses with eight recipes (124,612 bytes, below its 256 KiB bound); F2/F4 final catalog/browser handoffs are still pending. No browser or render pass is implied.

**F2 complete and parent source-reviewed:** separate FastH3 catalog record has four API controls and four pinned publisher dependency records; raw source unchanged. F4 preparation-handler completion/review remains pending.

**Live browser attempt blocked by browser-control infrastructure:** user chose a disposable project for preparation/save/attachment without rendering. Parent launched actual local services with temporary CPE data/config and a separate frontend origin, then opened an owned incognito preview tab. Both snapshots and a basic DOM read timed out after 15 seconds; the fallback computer/browser tool reported no browsers because its browser access host was unavailable. No project was created through the app, no workflow saved or attached, and no render submitted. Parent closed the owned tab, stopped owned services and removed the owned temporary directory. This is not an application save/attach pass or a confirmed application defect.

**F4 complete and parent source-reviewed:** fifth exact recipe/SHA gate and four FastH3 scalar controls added to existing preparation handler; raw FastH3 UI still requires gateway export, and starting-frame handling remains limited to base MiniMax I2V. Delegated final frontend typecheck passed. F1–F4 are now complete. FastH3 status is source_verified_runtime_unverified, readiness not_verified; live browser/render acceptance remains blocked as above.
