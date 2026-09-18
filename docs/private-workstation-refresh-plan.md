# Private workstation refresh — plan and checklist

Status: **Approved by owner. Phases 1–5 implementation, automated checks, and independent reviews are complete (PASS); live provider/account and ComfyUI verification remains pending. Final combined review and push are still pending.**
Branch: `maintenance/private-workstation-refresh`

## Scope and guardrails

Director's Console is a private, trusted multi-ComfyUI coordinator, gallery/organization tool, and prompt engineer—not a hosted service.

- Preserve arbitrary ComfyUI destinations, permissive CORS, and user-directed filesystem access. Network isolation is the operator's responsibility.
- Do not add application login, mandatory host allowlists, filesystem sandboxing, or other access restrictions.
- Preserve convenient provider authentication; fix functional OAuth/credential defects without new login hurdles.
- Prefer existing libraries, small changes, and deletion of verified unused code. No rewrite, framework migration, or speculative abstraction.
- Tests validate intended application behavior and protect fixes. Stale tests are not product requirements. No coverage-percentage campaign.
- Keep project files, media, metadata, and stored credentials compatible. Never delete user data or invalidate credentials as cleanup.
- Model versions and capabilities must be verified against official documentation before guidance is written.

## Execution approach

Work in the order below, one bounded task/commit at a time. Record checks and any remaining limitations in this checklist. Use a subagent for a narrow independent lookup or review; the main agent verifies evidence and owns implementation decisions. Avoid repeated repository-wide audits.

### 1. Repair ComfyUI job lifecycle — highest priority

Primary files: `CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx`, `storyboard/services/comfyui-websocket.ts`, and `Orchestrator/orchestrator/core/parallel_job_manager.py`.

- [x] Trace the live single-panel and parallel execution paths; distinguish frontend-direct execution from Orchestrator job groups before changing either. Canvas submissions go directly to each ComfyUI node; Orchestrator job groups have a separate Python task lifecycle.
- [x] Replace the ineffective single-panel cancel path (`wsRef` is initialized to null but not assigned) with lookup of that panel's actual node and prompt.
- [x] Remove a queued prompt by its ID; interrupt running work only on its owning node. Account for the configured ComfyUI version's interruption semantics; do not claim prompt-specific isolation if its endpoint is node-wide.
- [x] Make Orchestrator group cancellation stop/remove the associated ComfyUI work, not just cancel Python tasks.
- [x] Handle `execution_interrupted` as a terminal outcome; clear tracking and prevent later events from reporting success or invoking success-only autosave.
- [x] Reconcile pending prompts against history/queue after reconnect, including completion while disconnected and backend restart. Bound recovery instead of leaving panels generating forever.
- [x] Add small regression checks for queued cancellation, running interruption, late completion events, and reconnect reconciliation. Mock protocol responses; tests must not require GPUs.
- [x] Preserve LoRA extraction runtime and snapshot semantics in both extraction loops with explicit property typing.
- [ ] When nodes are available, manually check single-node generation and two-node parallel generation/cancellation, including image and video outputs. Otherwise record this verification as pending.

Done for the implemented phase: cancellation targets intended prompts, terminal states are consistent, unrelated work is protected as far as ComfyUI permits, and reconnection is bounded. Live image/video/two-node verification remains pending; unavoidable node-wide interruption behavior is documented below.

### 2. Check provider authentication correctness

Primary files: `CinemaPromptEngineering/api/providers/{credential_storage,oauth,oauth_callback_server,llm_service}.py` and their API callers.

- [x] Verify existing credential encryption and key persistence before proposing changes; legacy Fernet storage format is retained. Unreadable or wrong-seed database errors are explicit, and all-row prewrite checks prevent mixed-key import/PUT.
- [x] Check token expiry, refresh, restart persistence, and failure/re-authentication messages along the active provider paths. Complete serialized OAuth tuples synchronize server, local storage, and UI; disconnect and rollback are explicit. Fresh auth clears omitted refresh/expiry fields, while refresh grants retain omitted rotated tokens. Generation preflight covers known-expiry standard OAuth with Settings closed, and token sync still occurs after downstream failure.
- [x] Remove accidental secret logging while retaining useful diagnostics. Token-prefix logs are removed; the existing credential-editing workflow is preserved.
- [x] Fix confirmed defects only; add focused checks using fake tokens. API-key, ad-hoc, and Copilot behavior remain preserved. Real-provider checks require available accounts and must not disclose credentials.

Done for Phase 2: simulated/current application paths are covered; live provider/account verification remains pending. Legacy opaque tokens without known expiry may still require manual refresh or re-authentication; this does not claim universal refresh.

### 3. Make contributor setup reproducible

Primary files: root/module dependency manifests, frontend `package.json`, existing tests, and setup documentation.

- [x] Choose and document the supported setup commands and runtime versions; reconcile package metadata and requirements without introducing a new package manager.
- [x] Correct missing runtime dependencies and nonexistent package declarations. Retain lightweight/optional dependencies where appropriate.
- [x] Supply a minimal working lint configuration compatible with the selected tooling; avoid a repository-wide formatting rewrite.
- [x] Remove developer-specific test/import paths. Application import errors must fail visibly, not skip the API suite.
- [x] Resolve the three observed HTTP 422 test mismatches against intended current API behavior. Resolve mislabeled image fixtures without changing product behavior merely to satisfy a test.
- [x] Review dependency advisories, distinguishing build-tool exposure from runtime issues. Upgrade in bounded changes; no blind `audit fix --force`.
- [x] Provide one documented regression command and a minimal CI job using it plus frontend build/lint. Do not silently exclude failing tests to make CI green.

Phase 3 setup/tooling/documentation evidence and automated validation are complete. The final combined check ran from a temporary repository copy with a fresh Python 3.11 environment, `requirements-dev.txt`, `npm ci`, current frontend sources/dependencies, and no custom `PYTHONPATH`: root pytest **84 passed**; Orchestrator pytest **183 passed**; standalone Node regressions **6 passed**; frontend lint and production build **passed**. The build did not write tracked checkout assets. Independent review of Phase 3 **passed**; live provider/account and ComfyUI checks remain pending.

### 4. Remove stale code and clarify ownership

- [x] Verify imports, entry points, and packaging before deleting apparently unused PyQt batch code or legacy ComfyUI clients. If a path is still supported, repair it rather than silently remove functionality.
- [x] Make the main `CinemaPromptEngineering/cinema_rules/` authoritative. If the standalone ComfyUI node needs a bundled copy, generate it during packaging rather than maintaining a second source.
- [x] Verify both web-app and standalone-node loading after consolidation.
- [x] Identify which generated frontend trees are actually used. Remove redundant tracked output only after establishing how users obtain/build the required distribution.
- [x] Correct obsolete launch/install instructions and security comments to match the trusted-workstation deployment model.
- [x] Extract job-lifecycle code from `StoryboardUI.tsx` only if needed to make the fixes understandable/testable. No arbitrary file-size target or broad state-management redesign.

Done when: contributors can identify the live implementations and build supported distributions without obsolete code or misleading instructions.

### 5. Add official, mode-specific video prompt guidance

Requested names: **LTX 2.3 / 2.5, MiniMax H3, and Seedance 2.0–2.5**. These are requests, not verified releases or capabilities.

- [x] Locate official model/release documentation and prompting guides; verify exact names and versions. Record source URLs and review dates in one compact capability/source table.
- [x] For each verified model/version, identify supported text-to-video, image-to-video, reference-to-video, and first/last-frame modes. Do not infer unsupported modes or undocumented intermediate releases.
- [x] Mark unavailable/ambiguous documentation as pending owner clarification; do not substitute an assumed model or invented guidance.
- [x] Locate the existing prompt-guidance integration and extend it rather than building another guidance engine.
- [x] Add concise mode-specific guidance covering documented motion, camera, timing, reference roles, consistency, constraints, and audio where supported.
- [x] Clearly distinguish official recommendations from application-authored examples. Preserve existing model choices and saved configurations.
- [x] Check representative prompt generation for each supported mode, including behavior when required reference inputs are absent. This is guidance work, not a new hosted inference integration.

Done when: each new guidance entry has verified provenance, is selectable through the existing application flow, and does not promise unsupported model behavior.

Phase 5 implementation and automated checks are complete: six guides are catalogued and dispatched through `get_system_prompt`; the parameterized regression exercises the existing `generic` legacy target in both live-action and animation generation, verifies nonempty prompts, and preserves the exact populated `LEGACY_NEGATIVE`. The latest focused rerun passed **25 tests**; full Python validation passed **123 root + 183 Orchestrator = 306 tests**; `git diff --check` passed. The previously verified six standalone Node regressions, frontend lint/build, installed-wheel smoke outside the checkout, and standalone sync helper were not repeated for this latest test-only change. Seedance versions/modes that remain unsupported or unverified are pending owner clarification; this guidance adds no rendering backend. Phase 5 independent review **PASS**.

## Known baseline from the audit

These results are a starting point, not proof that every subsystem was tested:

- Frontend production build passed; lint failed because its configuration was missing.
- Root tests initially failed import collection. With explicit import paths and root + CPE dependencies: **64 passed, 4 failed**.
- With only root dependencies, missing `cryptography` caused API tests to skip silently.
- npm audit reported 21 affected packages (15 high severity), many in development/transitive tooling; reassess at implementation time.
- Simulated interruption followed by `executing: node=null` incorrectly invoked the frontend completion callback.
- No live ComfyUI-node or provider-account end-to-end verification was performed.

## Implementation notes

### Phase 1 baseline and intentional limits

- Started from branch `maintenance/private-workstation-refresh`; the plan was the only untracked file and tracked source was clean.
- Supported application launch path remains `python start.py`; no launcher, CORS, filesystem, or credential changes are part of phase 1.
- Phase 1 implementation and automated checks are complete; focused review: **PASS**. Both LoRA extraction loops in `StoryboardUI.tsx` use explicit property typing without changing runtime or snapshot semantics. No commit was made.
- One-run-per-panel policy: a panel cannot start a second run while its submission/jobs are active, while different panels may generate concurrently; a run releases only after submission and all node jobs settle.
- Cancellation is prompt-aware where an ID exists: queued work is removed by ID, running work is interrupted only after an exact queue match, and remote `completed`/`unconfirmed` outcomes are retained rather than reported as confirmed cancellation. Legacy node-wide `/interrupt` still has an unavoidable check/interrupt race with unrelated work.
- A submission without a returned prompt ID cannot be cancelled precisely; its remote outcome remains unconfirmed and the UI must not claim it was stopped.
- RESTORABLE metadata is an immutable deep snapshot of the original workflow, selected outputs, parameters, prompt override, and per-node seed; transport-only media conversion does not mutate it.
- Automated checks (all passed): `cd CinemaPromptEngineering/frontend && npm run build`; `node tests/test_comfyui_websocket_node.js`; `node tests/test_storyboard_generation_run.js`; `node tests/test_storyboard_metadata.js`; `PYTHONPATH="$PWD/Orchestrator" python -m pytest Orchestrator/tests -q` — **42 passed**; and `git diff --check`.
- Prior root baseline (recorded before dependency/test repair; not rerun for this phase): `PYTHONPATH="$PWD/CinemaPromptEngineering:$PWD/Orchestrator" uv run --no-project --with pytest --with-requirements requirements.txt --with-requirements CinemaPromptEngineering/requirements.txt python -m pytest tests/ -q` — **64 passed, 4 known failures**. This temporary invocation is not the desired final contributor setup.
- Credential encryption/key persistence was inspected only; Phase 2 authentication behavior was not fully validated. No live ComfyUI nodes, image/video runs, two-node runs, or provider accounts were exercised. Mock checks are reported separately.

### Phase 2 implementation and validation

- Phase 2 implementation is complete; independent focused review: **PASS**.
- Latest checks: **16 focused Python credential/OAuth tests passed**; Node Settings/OAuth synchronization regressions passed; a temporary frontend production build passed; `git diff --check` passed.
- The CPE backend now loads the explicit `CinemaPromptEngineering/.env` before provider imports with `override=False`; `python-dotenv` is declared in the CPE requirements and project metadata. Fresh-process environment/path/missing-file/import-order checks passed (**7 targeted tests**), wheel metadata includes `python-dotenv`, and Ruff plus `git diff --check` passed.
- No live providers, provider accounts, or ComfyUI tests were performed; those checks remain pending. Final combined review and push remain pending.

### Phase 3 setup, CI, and combined validation

- Contributor setup is documented in [`docs/contributing.md`](contributing.md): Python 3.11+ with `python -m venv` and `pip install -r requirements-dev.txt`, Node.js 22+, `npm ci`, and the existing `python start.py` runtime launcher.
- Added [`scripts/check.py`](../scripts/check.py), a cross-platform standard-library launcher for both Python suites, all six standalone Node regressions, frontend lint, and frontend build. It fails honestly when any check fails.
- Added [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) using Python 3.11 and Node.js 22. It installs the checked-in requirements, runs `npm ci`, and invokes the combined check without exclusions or `continue-on-error`.
- Final validation was run once in a temporary repository copy with a fresh Python 3.11 environment and current frontend dependencies, without custom `PYTHONPATH`: root pytest **84 passed**; Orchestrator pytest **183 passed**; standalone Node regressions **6 passed** (five existing plus the BatchRenameDialog race regression); frontend lint and build **passed**; `git diff --check` passed. The build ran outside the checkout so tracked build assets were not changed.
- Installed-wheel packaging smoke was already verified outside the checkout for `templates_system`, `workflow_parser`, and `data`; **10 templates** loaded. The OpenCV module dependency and pixel-decoding test also passed.
- Reviewed audit status remains **8 development-tool advisories** (7 high, 1 moderate; 3 direct, 5 transitive), triaged with the major-upgrade decision unresolved; zero runtime advisories were recorded. Do not silently mark them fixed or rerun the audit unnecessarily.
- Independent review of Phase 3 **passed**. No provider credentials, render nodes, or live accounts were used; live provider/account and ComfyUI image/video/two-node checks remain pending.

### Phase 4 implementation and validation

- The tracked duplicate `ComfyCinemaPrompting/cinema_rules/` and stale `webapp/` tree were removed; live `web/app/`, `js/`, node classes, and API routes were retained.
- The owner approved the canonical preset wording and dropdown/value corrections. The CPE configuration screen uses the main `/options` endpoint, while the bundled ComfyUI frontend uses the node `/cinema_prompt/api/options` route; both expose canonical composition, lighting-source, and lighting-style values. Applying a preset uses those values for newly generated prompts. Existing media, cached prompt overrides, and saved workflows are not rewritten, and no visual improvement is guaranteed by this wording-only correction.
- `CinemaPromptEngineering/cinema_rules/` is authoritative in the checkout. `scripts/sync_comfy_node.py` creates a clean ignored rules copy for standalone node distribution and removes stale generated files and Python caches.
- Six fresh-process focused checks passed, covering canonical loading with and without a generated copy, isolated standalone loading and API-route imports, missing-rules guidance, overlap protection, and sync cleanup. Root pytest then passed **90 tests** (the Phase 3 baseline was **84**); no frontend assets were regenerated.
- The options/preset follow-up now also covers the node-local editor route/static bundle and the canonical generate-prompt validation contract with stub-ComfyUI tests; the focused route/contract set passes **14 tests**, the combined root and Orchestrator suites pass **281 tests** (root **98**, Orchestrator **183**), all six standalone Node checks pass, frontend lint passes after ignoring generated `frontend/dist/`, and `npm run build:comfyui` updates only the tracked `ComfyCinemaPrompting/web/app/` bundle. No live providers, credentials, or ComfyUI nodes were used.
- Independent review of Phase 4 **passed**. Live provider/account and ComfyUI image/video/two-node checks remain pending.

## Review checkpoint

- [x] Owner reviews priorities and task scope.
- [x] Owner authorizes implementation.
- [x] Phase 1 implementation is complete; focused review: PASS.
- [x] Phase 1 automated checks are complete.
- [x] Phase 2 implementation is complete; independent review: PASS.
- [x] Phase 2 automated checks are complete.
- [x] Phase 3 setup, tooling, documentation, and honest CI are implemented; final combined validation passed (root 84, Orchestrator 183, six Node regressions, frontend lint/build).
- [x] Independent review of Phase 3 passed.
- [x] Independent review of Phase 4 passed.
- [x] Independent review of Phase 5 passed.
- [ ] Live provider/account verification remains pending.
- [ ] Live ComfyUI image/video and two-node verification remains pending.

All five approved implementation phases, their automated verification, and independent reviews are complete (**PASS**). The audit remains **8 triaged development-tool advisories** (7 high, 1 moderate; 3 direct, 5 transitive) and unresolved; do not claim all warnings or vulnerabilities are fixed. Live provider/account and ComfyUI image/video/two-node checks were not run. Unsupported or unverified Seedance versions/modes remain pending, and the guidance adds no rendering backend. Previous six Node, frontend lint/build, outside-checkout installed-wheel, and sync checks passed but were not repeated for the latest test-only change. This final update is documentation-only: no source, test, or dependency changes, live calls, staging, or commits.
