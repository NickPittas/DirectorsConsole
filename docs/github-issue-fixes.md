# GitHub issue fixes: #4, #6, #7, #8, and #9

## Status

- **#4/#8 — Local LLM endpoints:** The endpoint-construction bugs were identified and the existing `llm_service.py` change passes **24 focused mocked tests** in `tests/test_llm_local_endpoints.py`. The original #8 cause is not confirmed without a reporter reproduction.
- **#6 — Generate button:** Addressed for the standard mocked connection cases. Browser reachability is checked separately from Orchestrator health, managed-node assignments are respected, and stale probes are ignored and cleaned up.
- **#7 — Checkpoint selector:** Addressed for standard API-format and graph-format workflows. Parsing stays offline/import-safe with only the imported checkpoint; the editor merges URL-qualified `/object_info` options without reinitializing edited values or LoRA metadata.
- The original reporter workflow JSON was not provided for #6 or #7.
- **#9 — Recovery hint:** A qualified ErrorBoundary hint now appears for `NotFoundError`/`removeChild`-style DOM mutation errors. This is not a confirmed fix until the reporter verifies it.

## Regression commands

```bash
python -m pytest -c pytest.ini tests/ Orchestrator/tests/ -q
python -m pytest tests/test_llm_local_endpoints.py -q
node tests/test_storyboard_issue6_connection.js
node tests/test_storyboard_issue7_checkpoint.js
node tests/test_error_boundary_hint.js
python scripts/check.py
```

The focused #7 check mounts the production `WorkflowEditor`, drives its real update callbacks, preserves the existing B-success/late-A race, verifies A-loaded → edited → pending-B → failed/offline-B metadata clearing, and replaces a loaded graph context with an API context at the same URL to verify defaults plus LoRA metadata reapplication. It uses mocked requests and controlled promises; it does not contact providers, ComfyUI, render nodes, browsers, private environments, or databases.

## Reporter steps

1. Start ComfyUI with its normal local URL; do not use a proxy.
2. Open Storyboard, select/import a workflow, and wait for the visible connection prerequisite message to settle.
3. If Generate remains disabled, open **Manage Nodes**, verify the exact browser-reachable `http(s)` URL and CORS/mixed-content policy, then retry.
4. For #7, import/export the workflow in API format if possible and confirm the Checkpoint selector retains the imported checkpoint. If it is missing, capture the offline workflow JSON and browser console.
5. For #9, retry with page translation or DOM-modifying extensions disabled only for this site, then report whether recovery succeeds.

## Verification limits

No live provider, ComfyUI, browser, or render-node calls were made. Browser CORS policy, reverse proxies, firewall rules, the reporter workflow JSON, and a specific reporter reproduction still require end-user confirmation. No global translation disable, DOM monkeypatch, text wrapping, or error hiding was added. The bundled ComfyUI asset is regenerated separately with `npm run build:comfyui` after source changes.
