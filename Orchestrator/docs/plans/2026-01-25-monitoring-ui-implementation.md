# Monitoring and Metrics UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the monitoring pipeline (collector + panel + chart placeholder) to surface backend metrics in the UI.

**Architecture:** Add a metrics collector in the backend layer that returns snapshots, wire a UI panel to store and display snapshots, and provide a placeholder chart widget for future Qt integration. Keep everything Qt-free for now and focus on data flow and testable behavior.

**Tech Stack:** Python 3.11, uv, Pydantic models, async/await.

### Task 1: Metrics Collector Scaffolding

**Files:**
- Create: `orchestrator/backends/metrics_collector.py`
- Test: `tests/unit/test_metrics_collector.py`

**Step 1: Write the failing test**

```python
import asyncio

from orchestrator.backends.metrics_collector import MetricsCollector


def test_metrics_collector_returns_list() -> None:
    collector = MetricsCollector([])
    result = asyncio.run(collector.collect_once())
    assert result == []
```

**Step 2: Run test to verify it fails**

Run: `uv run --python "C:\\Users\\npitt\\AppData\\Local\\Programs\\Python\\Python311\\python.exe" --link-mode=copy pytest tests/unit/test_metrics_collector.py -v`
Expected: FAIL with "MetricsCollector not implemented"

**Step 3: Write minimal implementation**

```python
from dataclasses import dataclass

@dataclass
class MetricsCollector:
    backends: list

    async def collect_once(self) -> list:
        return []
```

**Step 4: Run test to verify it passes**

Run: `uv run --python "C:\\Users\\npitt\\AppData\\Local\\Programs\\Python\\Python311\\python.exe" --link-mode=copy pytest tests/unit/test_metrics_collector.py -v`
Expected: PASS

Status: Completed (test run passed).

**Step 5: Commit**

```bash
git add tests/unit/test_metrics_collector.py orchestrator/backends/metrics_collector.py
git commit -m "feat: add metrics collector scaffold"
```

### Task 2: Monitor Panel Placeholder

**Files:**
- Modify: `orchestrator/ui/panels/monitor_panel.py`
- Test: `tests/unit/test_monitor_panel.py`

**Step 1: Write the failing test**

```python
from orchestrator.ui.panels.monitor_panel import MonitorPanel
from orchestrator.core.models.metrics import MetricsSnapshot


def test_monitor_panel_updates() -> None:
    panel = MonitorPanel()
    snapshot = MetricsSnapshot(
        id="m1",
        backend_id="b1",
        gpu_memory_used=1,
        gpu_memory_total=2,
        gpu_utilization=0.0,
        gpu_temperature=0,
        cpu_utilization=0.0,
        ram_used=1,
        ram_total=2,
        queue_depth=0,
    )
    panel.update_metrics([snapshot])
    assert panel.latest_metrics[0].id == "m1"
```

**Step 2: Run test to verify it fails**

Run: `uv run --python "C:\\Users\\npitt\\AppData\\Local\\Programs\\Python\\Python311\\python.exe" --link-mode=copy pytest tests/unit/test_monitor_panel.py -v`
Expected: FAIL with "MonitorPanel not implemented"

**Step 3: Write minimal implementation**

```python
class MonitorPanel:
    def __init__(self) -> None:
        self.latest_metrics = []

    def update_metrics(self, snapshots):
        self.latest_metrics = list(snapshots)
```

**Step 4: Run test to verify it passes**

Run: `uv run --python "C:\\Users\\npitt\\AppData\\Local\\Programs\\Python\\Python311\\python.exe" --link-mode=copy pytest tests/unit/test_monitor_panel.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/test_monitor_panel.py orchestrator/ui/panels/monitor_panel.py
git commit -m "feat: add monitor panel placeholder"
```

### Task 3: Metrics Chart Placeholder

**Files:**
- Create: `orchestrator/ui/widgets/metrics_chart.py`
- Test: `tests/unit/test_metrics_chart.py`

**Step 1: Write the failing test**

```python
from orchestrator.ui.widgets.metrics_chart import MetricsChart


def test_metrics_chart_construct() -> None:
    chart = MetricsChart()
    assert chart is not None
```

**Step 2: Run test to verify it fails**

Run: `uv run --python "C:\\Users\\npitt\\AppData\\Local\\Programs\\Python\\Python311\\python.exe" --link-mode=copy pytest tests/unit/test_metrics_chart.py -v`
Expected: FAIL with "MetricsChart not implemented"

**Step 3: Write minimal implementation**

```python
class MetricsChart:
    def __init__(self) -> None:
        self.series = []
```

**Step 4: Run test to verify it passes**

Run: `uv run --python "C:\\Users\\npitt\\AppData\\Local\\Programs\\Python\\Python311\\python.exe" --link-mode=copy pytest tests/unit/test_metrics_chart.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/test_metrics_chart.py orchestrator/ui/widgets/metrics_chart.py
git commit -m "feat: add metrics chart placeholder"
```

### Task 4: Codemap Update

**Files:**
- Modify: `docs/CODEMAP.md`

**Step 1: Update codemap**

Mark the following as ✅ Complete:
- `orchestrator/backends/metrics_collector.py`
- `orchestrator/ui/widgets/metrics_chart.py`
- `orchestrator/ui/panels/monitor_panel.py`
- `tests/unit/test_metrics_collector.py`
- `tests/unit/test_monitor_panel.py`
- `tests/unit/test_metrics_chart.py`

**Step 2: Commit**

```bash
git add docs/CODEMAP.md
git commit -m "docs: update codemap for monitoring UI"
```

---

Plan complete and saved to `docs/plans/2026-01-25-monitoring-ui-implementation.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
