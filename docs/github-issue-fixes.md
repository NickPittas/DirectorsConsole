# GitHub issue fixes: #4, #6, #7, #8, and #9

## Status

- **#4 — Local LLM endpoints:** Closed. The endpoint-construction bugs were identified and the existing `llm_service.py` change previously passed **24 focused mocked tests** in `tests/test_llm_local_endpoints.py`; the close comment links the fix commit and invites reopening with a current reproduction.
- **#8 — Local LLM endpoints (Gemma):** Closed based on the reporter's own "Fixed" confirmation. The original Gemma root cause is not proven and no claim is made about it.
- **#6 — Generate button:** Closed; the close comment links the fix commit and invites reopening with a current reproduction. Addressed for the standard mocked connection cases. Browser reachability is checked separately from Orchestrator health, managed-node assignments are respected, and stale probes are ignored and cleaned up. Storyboard now probes and dispatches only configured managed nodes; the legacy saved `comfy_url` remains compatible but cannot create an implicit localhost/direct fallback. With no managed nodes, generation is disabled with Manage Nodes guidance.
- **#7 — Checkpoint selector:** Closed; the close comment links the fix commit and invites reopening with a current reproduction. Addressed for standard API-format and graph-format workflows. Parsing stays offline/import-safe with only the imported checkpoint; the editor merges URL-qualified `/object_info` options without reinitializing edited values or LoRA metadata.
- The original reporter workflow JSON was not provided for #6 or #7.
- **#9 — Edge translation DOM crash (`NotFoundError: removeChild`):** Open. A qualified ErrorBoundary hint exists, plus a defensive structural patch: the config panel now remounts as a unit via `key={projectType}` on live-action/animation switches, and mixed text/hint labels wrap their base text in a stable `<span>` (`CinemaPromptEngineering.tsx`, `Settings.tsx`) so translated text nodes are replaced wholesale instead of reconciled in place. The user confirmed the normal-use checklist passed in Zen on Linux without translation (mode switching, animation style changes, and Settings). Edge built-in translation remains unverified; closing awaits reporter verification in Edge. No automated tests were added or run for this patch.

## Workstation project/gallery UX fixes (partial recovery scope)

- Recent projects are recorded only after successful Save/Save As or project-file load, using the returned save path or selected project JSON path; entries stay deduplicated and capped at 10.
- `ProjectManager.subscribe(listener)` provides a cleanup function and publishes successful settings, project save/load/reset, and coalesced successful media-save revisions. App Gallery state uses this in-memory snapshot instead of polling localStorage; the project folder path remains separate from the project JSON path.
- Gallery loading now distinguishes no project, pending project load, folder scanning, file loading, loaded-empty, and retryable failure. Request identities prevent late project A responses from replacing project B state.

This is not the full project-recovery implementation: draft autosave, recovery UI, and startup-policy changes remain deferred to the recovery task. Gallery metadata/detail-operation limits are unchanged.

## Regression commands

```bash
python -m pytest -c pytest.ini tests/ Orchestrator/tests/ -q
python -m pytest tests/test_llm_local_endpoints.py -q
node tests/test_storyboard_issue6_connection.js
node tests/test_storyboard_issue7_checkpoint.js
node tests/test_error_boundary_hint.js
node tests/test_project_ux_fixes.js
python scripts/check.py
```

The focused #7 check mounts the production `WorkflowEditor`, drives its real update callbacks, preserves the existing B-success/late-A race, verifies A-loaded → edited → pending-B → failed/offline-B metadata clearing, and replaces a loaded graph context with an API context at the same URL to verify defaults plus LoRA metadata reapplication. It uses mocked requests and controlled promises; it does not contact providers, ComfyUI, render nodes, browsers, private environments, or databases.

## Reporter steps

1. Add the intended ComfyUI URL in Storyboard → Manage Nodes (localhost is valid only when explicitly added); do not rely on a saved legacy direct URL.
2. Open Storyboard, select/import a workflow, and wait for the visible connection prerequisite message to settle.
3. If Generate remains disabled, open **Manage Nodes**, verify the exact browser-reachable `http(s)` URL and CORS/mixed-content policy, then retry.
4. For #7, import/export the workflow in API format if possible and confirm the Checkpoint selector retains the imported checkpoint. If it is missing, capture the offline workflow JSON and browser console.
5. For #9, retry with page translation or DOM-modifying extensions disabled only for this site, then report whether recovery succeeds.

## Verification limits

The original checks made no live provider, ComfyUI, browser, or render-node calls. The #9 safeguard subsequently passed a user-performed normal-use check in Zen on Linux, without translation, and a bounded Vite-only build. This does not verify Edge translation compatibility. Browser CORS policy, reverse proxies, firewall rules, the reporter workflow JSON, and a specific reporter reproduction still require end-user confirmation. No global translation disable, DOM monkeypatch, or error hiding was added; the #9 patch adds only the config-panel remount key and `<span>` label wrapping, with no new tests for it. The bundled ComfyUI asset is regenerated separately with `npm run build:comfyui` after source changes.
