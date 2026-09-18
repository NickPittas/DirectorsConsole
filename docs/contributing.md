# Contributor setup and checks

## Supported tools

- Python 3.11 or newer
- Node.js 22.13+ or 24+ with npm
- A ComfyUI node is only required for live rendering; the checks below use mocks and do not contact providers or render nodes.

## Fresh checkout setup

From the repository root:

```bash
python -m venv .venv
# macOS/Linux
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
cd CinemaPromptEngineering/frontend
npm ci
cd ../..
```

The root requirements file includes both Python services and the test tools. The normal runtime launcher remains:

```bash
python start.py
```

On a clean workstation, `python start.py --setup` provisions the launcher's per-service environments before starting services.

Provider setup is documented once in the [README provider guide](../README.md#ai-llm-provider-setup): use a Google AI Studio API key for `google` / **Google AI (Gemini)**, and use the private CPE `.env` only for authorized Antigravity OAuth app configuration. Do not put real keys, client secrets, or tokens in the checkout, frontend `VITE_*` variables, fixtures, logs, or issues. The offline checks below do not contact providers.

## One offline regression command

Run this from the repository root after setup:

```bash
python scripts/check.py
```

It runs the root and Orchestrator pytest suites, all sixteen standalone Node regressions (including runtime /object_info schema discovery, mounted production workflow-editor/parameter-panel controls, project-save staging, session storage, and production recovery-consumer checks), frontend lint, and the production build. It never adds `PYTHONPATH`; `-c pytest.ini` makes the root import paths explicit when both test trees are selected. The command intentionally fails if any check fails.

Individual equivalent commands are:

```bash
python -m pytest -c pytest.ini tests/ Orchestrator/tests/ -q
for test in tests/test_comfyui_websocket_node.js tests/test_oauth_sync.js tests/test_settings_oauth.js tests/test_storyboard_generation_run.js tests/test_storyboard_metadata.js tests/test_batch_rename_dialog_race.js tests/test_storyboard_issue6_connection.js tests/test_storyboard_issue7_checkpoint.js tests/test_workflow_schema_controls.js tests/test_workflow_schema_production.js tests/test_error_boundary_hint.js tests/test_project_ux_fixes.js tests/test_session_draft_storage.js tests/test_session_recovery_node.js tests/test_session_recovery_consumer.js tests/test_session_recovery_ui_consumer.js; do node "$test"; done
(cd CinemaPromptEngineering/frontend && npm run lint)
(cd CinemaPromptEngineering/frontend && npm run build)
```

## Current validation snapshot

Latest tooling-refresh evidence:

- Resolved tooling: Vite **7.3.6**, plugin-react **5.2.0**, TypeScript ESLint parser **8.70.0**, ESLint **10.10.0**, and hooks plugin **7.1.1**. React 18, TypeScript 5.x, Terser, and application dependencies remain on their existing lines.
- Clean temporary `npm ci` completed with **zero peer problems**. Node **22.20.0** / npm **10.9.3** passed the same install, peer check, both audits, lint, and frontend builds; `npm audit --json` and `npm audit --omit=dev --json` each report **0 vulnerabilities** at every severity.
- `uv run --no-project --python 3.11 --with-requirements requirements-dev.txt python -m pytest -c pytest.ini tests/ Orchestrator/tests/ -q`: **337 passed** (**154 root + 183 Orchestrator**, including **24** local-endpoint tests). All **16** standalone Node regressions passed; frontend lint, strict `tsc --noEmit`, and the normal build passed.
- The Python **3.13** result of **313 passed** is historical tooling-refresh evidence only; it predates the current **337-test** tree and was not rerun because Python 3.13 is unavailable on this workstation. Session recovery coverage uses fake IndexedDB; quota failure is a boundary simulation, not real browser quota exhaustion.
- Temporary normal and standalone builds passed; authoritative `npm run build:comfyui` passed. Served bundled index/assets and API contract checks passed: **14** tests. `npm audit --json` and `npm audit --omit=dev --json` each report **0 vulnerabilities**.
- `git diff --check`: **passed**. No providers, credentials, or live ComfyUI nodes were used.

The owner approved the canonical preset wording and dropdown/value corrections. The CPE configuration screen uses the main `/options` endpoint, while the bundled ComfyUI frontend uses `/cinema_prompt/api/options`; both provide canonical composition, lighting-source, and lighting-style dropdown values. Applying a preset affects newly generated prompt text only. Existing media, cached prompt overrides, and saved workflows are not rewritten, and no visual improvement is guaranteed by this wording-only change.

Live provider/account and ComfyUI image/video/two-node checks were not run. The backend `.env` loader and fresh-process environment/path/missing-file/import-order checks are complete, but live Antigravity/Google provider verification remains pending. Unsupported or unverified Seedance versions/modes remain pending owner clarification; the guidance adds no rendering backend. No provider, credential, or render-node calls were made. This tooling refresh changes only frontend tooling/configuration, documentation, CI, and the authoritative generated ComfyUI web bundle; no staging, commits, or pushes were performed.
