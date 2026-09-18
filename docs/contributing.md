# Contributor setup and checks

## Supported tools

- Python 3.11 or newer
- Node.js 22 or newer with npm
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

It runs the root and Orchestrator pytest suites, all six standalone Node regressions, frontend lint, and the production build. It never adds `PYTHONPATH`; `-c pytest.ini` makes the root import paths explicit when both test trees are selected. The command intentionally fails if any check fails.

Individual equivalent commands are:

```bash
python -m pytest -c pytest.ini tests/ Orchestrator/tests/ -q
for test in tests/test_comfyui_websocket_node.js tests/test_oauth_sync.js tests/test_settings_oauth.js tests/test_storyboard_generation_run.js tests/test_storyboard_metadata.js tests/test_batch_rename_dialog_race.js; do node "$test"; done
(cd CinemaPromptEngineering/frontend && npm run lint)
(cd CinemaPromptEngineering/frontend && npm run build)
```

## Current validation snapshot

Latest validation evidence:

- Focused Phase 5 rerun: **25 passed**. The parameterized regression exercises the existing `generic` legacy target through both live-action and animation generation, verifies each prompt is nonempty, and preserves the exact populated `LEGACY_NEGATIVE`.
- Full Python validation: **123 root + 183 Orchestrator = 306 passed**.
- `git diff --check`: **passed**.
- Previous six standalone Node regressions, frontend lint/build, installed CPE wheel smoke outside the checkout, and standalone sync-helper checks **passed** but were not repeated for this latest test-only change.
- Independent review of all five approved implementation phases: **PASS**.
- The audit remains **8 triaged development-tool advisories** (7 high, 1 moderate; 3 direct, 5 transitive) and unresolved; do not claim all warnings or vulnerabilities are fixed. Zero runtime advisories were recorded.

The owner approved the canonical preset wording and dropdown/value corrections. The CPE configuration screen uses the main `/options` endpoint, while the bundled ComfyUI frontend uses `/cinema_prompt/api/options`; both provide canonical composition, lighting-source, and lighting-style dropdown values. Applying a preset affects newly generated prompt text only. Existing media, cached prompt overrides, and saved workflows are not rewritten, and no visual improvement is guaranteed by this wording-only change.

Live provider/account and ComfyUI image/video/two-node checks were not run. The backend `.env` loader and fresh-process environment/path/missing-file/import-order checks are complete, but live Antigravity/Google provider verification remains pending. Unsupported or unverified Seedance versions/modes remain pending owner clarification; the guidance adds no rendering backend. No provider, credential, or render-node calls were made. This final status update is documentation-only: no source, test, or dependency changes, staging, or commits.
