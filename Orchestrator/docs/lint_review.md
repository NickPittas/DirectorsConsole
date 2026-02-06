# Comfy Orchestrator Lint + Code Review

## Context
- Scope: lint check plus review for optimizations, error corrections, bad practices, duplication/redundancy.
- User decisions:
  - Treat UI typing issues as blockers.
  - Make previously "optional" runtime deps mandatory.
- Tests are the only optional feature.

## Lint Run
- Command: `uv run --extra dev pyright`
- Result: 1043 errors, 26 warnings.
- Largest error sources:
  - UI canvas code with dynamic Qt attributes.
  - Missing runtime deps (cv2/aiohttp/psutil/pynvml).
  - Test typing (pytest fixtures and overloads).

## Findings and Recommendations

### Blockers
1) Async cancellation is broken due to `_loop` never being set.
   - Symptoms: `cancel_job` and `cancel_node` always fail even when an event loop is present.
   - Recommendation: Standardize on `_event_loop` or set `_loop` in `set_event_loop()` and use it consistently.
   - Files: `orchestrator/ui/async_bridge.py:458`, `orchestrator/ui/async_bridge.py:487`, `orchestrator/ui/async_bridge.py:113`

2) Runtime dependencies are treated as optional but are actually required.
   - Symptoms: clean installs will crash when features are used because `cv2`, `aiohttp`, `psutil`, or `pynvml` are missing.
   - Recommendation: Move these into `project.dependencies` or remove the conditional paths entirely.
   - Files: `orchestrator/core/utils/video_utils.py:92`, `orchestrator/core/utils/video_utils.py:143`, `orchestrator/core/utils/video_utils.py:294`, `agents/metrics_agent/nodes.py:38`, `agents/metrics_agent/nodes.py:56`, `agents/metrics_agent/nodes.py:185`, `pyproject.toml:dependencies`

### High
3) UI typing issues must be treated as blockers (per decision).
   - Symptoms: many pyright errors from dynamic attributes on Qt classes (`QGraphicsItem`, `QAction`, `QGraphicsScene`).
   - Recommendation: add typed subclasses or `typing.cast`/Protocols for injected attributes; reduce dynamic attribute usage in hot paths.
   - Files: `orchestrator/ui/canvas/canvas_widget.py:*`, `orchestrator/ui/canvas/connection_graphics.py:338`, `orchestrator/ui/canvas/enhanced_io_nodes.py:*`

### Medium
4) `JobManager` invokes `on_node_completed` without `await`, and the method is not part of the callback protocol.
   - Symptoms: async callbacks are never awaited; pyright flags missing attribute.
   - Recommendation: either add `on_node_completed` to `JobUICallbacks` and `await` it, or make it explicitly synchronous.
   - Files: `orchestrator/core/engine/job_manager.py:272`, `orchestrator/ui/async_bridge.py:726`

5) Temp output storage is leaking.
   - Symptoms: each output image creates a new `mkdtemp` dir with no cleanup.
   - Recommendation: use a single `TemporaryDirectory` per job/node or route to a managed cache dir with pruning.
   - Files: `orchestrator/core/engine/job_manager.py:430`

6) Health monitor optional handling is unsafe and noisy for type checking.
   - Symptoms: `metrics_agent` can be `None` but is accessed without narrowing.
   - Recommendation: explicitly guard with `metrics_agent is not None` and use a local dict.
   - Files: `orchestrator/backends/health_monitor.py:210`

7) Broad exception swallowing without logging.
   - Symptoms: some error paths mask root causes and leave no trace.
   - Recommendation: log exceptions with context; avoid bare `except Exception` without logging in background polling loops.
   - Files: `orchestrator/backends/health_monitor.py:68`

### Low
8) Excessive `info` logging in hot paths.
   - Symptoms: per-node/per-iteration logging may degrade performance and flood logs.
   - Recommendation: downgrade to `debug` or gate with a verbose flag.
   - Files: `orchestrator/core/engine/job_manager.py:*`, `orchestrator/ui/async_bridge.py:*`

9) Redundant aliasing in media upload.
   - Symptoms: `_upload_input_images` is a direct alias for `_prepare_media_inputs`.
   - Recommendation: keep only one public entry point or add a deprecation note if the alias is temporary.
   - Files: `orchestrator/core/engine/job_manager.py:621`

10) TODOs indicate incomplete UI behavior.
   - Symptoms: UI features not fully implemented.
   - Recommendation: track as roadmap items; ensure they do not present as enabled features.
   - Files: `orchestrator/ui/main_window.py:1624`, `orchestrator/ui/widgets/parameter_panel.py:867`

## Pyright Policy Recommendation
- With "no optional runtime features," make missing imports fatal for runtime modules.
- Scope pyright to:
  - Include: `orchestrator/core`, `orchestrator/backends`, `orchestrator/storage`, `orchestrator/utils`, `agents` (if required at runtime).
  - Exclude (until typed): `orchestrator/ui`, `tests`.

## Notes
- Tests can remain optional; exclude from pyright or accept fixture typing warnings.
- The lint run output is large; the items above summarize the actionable failures observed.

## Full Codebase Review (Beyond Lint)

### Blockers (Runtime Correctness)
1) Backend status loses queue counters when `set_current_job` is used.
   - Symptoms: `queue_pending` and `queue_running` are dropped when rebuilding `BackendStatus`.
   - Impact: queue displays and scheduling decisions can regress or oscillate.
   - Recommendation: preserve all existing status fields when updating job ID.
   - Files: `orchestrator/backends/manager.py:141`

2) Scheduler ignores `enabled` flag on backends.
   - Symptoms: disabled backends can still be selected if status is online or not present.
   - Impact: routing jobs to intentionally disabled backends.
   - Recommendation: filter out `enabled == False` in `available_backends` and `select_backend`.
   - Files: `orchestrator/core/engine/scheduler.py:22`, `orchestrator/core/engine/scheduler.py:33`

### High
3) Duplicate scheduling logic in `BackendManager` and `Scheduler`.
   - Symptoms: two independent selection paths (`BackendManager.select_best_backend` and `Scheduler.select_backend`).
   - Impact: inconsistent backend choices depending on call site; hard to reason about behavior.
   - Recommendation: consolidate backend selection to one canonical component or share a common selection strategy.
   - Files: `orchestrator/backends/manager.py:86`, `orchestrator/core/engine/scheduler.py:26`

4) Polling loops swallow exceptions silently.
   - Symptoms: errors in polling loops are dropped, making backend issues hard to diagnose.
   - Impact: silent failure and missing metrics without any trace.
   - Recommendation: log exceptions with context and backoff after repeated failures.
   - Files: `orchestrator/backends/metrics_collector.py:243`, `orchestrator/backends/health_monitor.py:99`

### Medium
5) `MetricsCollector` creates `_stop_event` dynamically.
   - Symptoms: attribute is added at runtime rather than declared.
   - Impact: weaker type safety and pyright noise; potential misuse if `stop_polling()` is called before `start_polling()`.
   - Recommendation: declare `_stop_event` in the dataclass with a default or `None` and guard properly.
   - Files: `orchestrator/backends/metrics_collector.py:236`

6) Workflow validation re-parses and uses O(n^2) queue behavior.
   - Symptoms: `get_execution_order()` re-parses data and uses `list.pop(0)`.
   - Impact: extra work on large workflows and avoidable overhead.
   - Recommendation: reuse parsed data and use `collections.deque` for the ready queue.
   - Files: `orchestrator/core/workflow/parser.py:528`, `orchestrator/core/workflow/parser.py:573`

7) Version mismatch between application and package.
   - Symptoms: app reports version `0.1.0` while `pyproject.toml` has `0.2.0`.
   - Impact: confusion in logs and bug reports.
   - Recommendation: set `app.setApplicationVersion` from package metadata or a single shared constant.
   - Files: `orchestrator/app.py:156`, `pyproject.toml:3`

### Low / Optimization
8) Logging verbosity in hot paths will degrade performance over time.
   - Symptoms: frequent `info` logs on node scheduling, progress, and polling loops.
   - Impact: increased I/O and large log files.
   - Recommendation: demote to `debug` or gate behind a verbose flag.
   - Files: `orchestrator/core/engine/job_manager.py:*`, `orchestrator/ui/async_bridge.py:*`, `orchestrator/backends/metrics_ws.py:*`

9) Duplicated metrics collection paths.
   - Symptoms: `HealthMonitor` and `MetricsCollector` both implement similar polling logic and data merging.
   - Impact: extra complexity; potential divergent behavior in metrics values.
   - Recommendation: centralize metrics aggregation or clearly separate responsibilities (status vs. telemetry).
   - Files: `orchestrator/backends/health_monitor.py:*`, `orchestrator/backends/metrics_collector.py:*`

10) Topological sort uses list for ready queue.
   - Symptoms: `ready.pop(0)` shifts the list every iteration.
   - Impact: avoidable overhead on large graphs.
   - Recommendation: `deque.popleft()` for O(1).
   - Files: `orchestrator/core/workflow/parser.py:553`
