# Testing and Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add smoke-level integration tests and basic hardening checks for critical flows.

**Architecture:** Introduce lightweight integration tests that stitch together backend, workflow processing, and scheduler behavior using existing in-memory/placeholder implementations. Keep tests fast, deterministic, and mock-driven.

**Tech Stack:** Python 3.11, uv, pytest.

### Task 1: Backend Flow Integration Test

**Files:**
- Create: `tests/integration/test_backend_flow.py`

**Step 1: Write the failing test**

```python
from orchestrator.backends.manager import BackendManager
from orchestrator.backends.health_monitor import HealthMonitor
from orchestrator.backends.client import ComfyUIClient
from orchestrator.core.models.backend import BackendConfig


class StubClient(ComfyUIClient):
    async def health_check(self) -> bool:
        return True

    async def close(self) -> None:
        return None


def test_backend_flow_updates_status() -> None:
    manager = BackendManager()
    manager.register(BackendConfig(id="b1", name="PC1", host="127.0.0.1"))
    monitor = HealthMonitor(manager, lambda cfg: StubClient("http://127.0.0.1:8188"))
    import asyncio
    asyncio.run(monitor.run())
    assert manager.get_status("b1")
```

**Step 2: Run test to verify it fails**

Run: `uv run --python "C:\\Users\\npitt\\AppData\\Local\\Programs\\Python\\Python311\\python.exe" --link-mode=copy pytest tests/integration/test_backend_flow.py -v`
Expected: FAIL with missing file or NotImplementedError

**Step 3: Implement minimal adjustments (if needed)**

Update any missing imports or glue code if failures are due to missing wiring.

**Step 4: Run test to verify it passes**

Run: `uv run --python "C:\\Users\\npitt\\AppData\\Local\\Programs\\Python\\Python311\\python.exe" --link-mode=copy pytest tests/integration/test_backend_flow.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/integration/test_backend_flow.py
git commit -m "test: add backend flow integration test"
```

### Task 2: Workflow Roundtrip Integration Test

**Files:**
- Create: `tests/integration/test_workflow_roundtrip.py`

**Step 1: Write the failing test**

```python
from orchestrator.core.workflow.parser import WorkflowParser
from orchestrator.core.workflow.converter import workflow_to_api
from orchestrator.core.workflow.inspector import inspect_parameters
from orchestrator.core.engine.parameter_patcher import patch_parameters


def test_workflow_roundtrip() -> None:
    workflow = {"nodes": [{"id": 1, "type": "KSampler", "widgets_values": [42]}], "links": []}
    parser = WorkflowParser()
    parsed = parser.parse(workflow)
    api = workflow_to_api(workflow, {"KSampler": ["seed"]})
    params = inspect_parameters(workflow)
    updated = patch_parameters(api, params, {"seed": 99})
    assert parsed["node_ids"] == ["1"]
    assert updated["1"]["inputs"]["seed"] == 99
```

**Step 2: Run test to verify it fails**

Run: `uv run --python "C:\\Users\\npitt\\AppData\\Local\\Programs\\Python\\Python311\\python.exe" --link-mode=copy pytest tests/integration/test_workflow_roundtrip.py -v`
Expected: FAIL with missing file

**Step 3: Implement minimal adjustments (if needed)**

Update any helpers if the integration reveals gaps.

**Step 4: Run test to verify it passes**

Run: `uv run --python "C:\\Users\\npitt\\AppData\\Local\\Programs\\Python\\Python311\\python.exe" --link-mode=copy pytest tests/integration/test_workflow_roundtrip.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/integration/test_workflow_roundtrip.py
git commit -m "test: add workflow roundtrip integration test"
```

### Task 3: Error Handling Test

**Files:**
- Create: `tests/unit/test_error_handling.py`

**Step 1: Write the failing test**

```python
import pytest
from orchestrator.core.engine.scheduler import Scheduler


def test_scheduler_raises_when_no_backends() -> None:
    scheduler = Scheduler()
    with pytest.raises(ValueError):
        scheduler.select_backend(None, None)
```

**Step 2: Run test to verify it fails**

Run: `uv run --python "C:\\Users\\npitt\\AppData\\Local\\Programs\\Python\\Python311\\python.exe" --link-mode=copy pytest tests/unit/test_error_handling.py -v`
Expected: FAIL (missing file or no error)

**Step 3: Implement minimal adjustment**

Update `Scheduler.select_backend()` to raise if no backend and node is None.

**Step 4: Run test to verify it passes**

Run: `uv run --python "C:\\Users\\npitt\\AppData\\Local\\Programs\\Python\\Python311\\python.exe" --link-mode=copy pytest tests/unit/test_error_handling.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/test_error_handling.py orchestrator/core/engine/scheduler.py
git commit -m "test: add scheduler error handling coverage"
```

### Task 4: Codemap Update

**Files:**
- Modify: `docs/CODEMAP.md`

**Step 1: Update codemap**

Mark the following as ✅ Complete:
- `tests/integration/test_backend_flow.py`
- `tests/integration/test_workflow_roundtrip.py`
- `tests/unit/test_error_handling.py`

**Step 2: Commit**

```bash
git add docs/CODEMAP.md
git commit -m "docs: update codemap for testing and hardening"
```

---

Plan complete and saved to `docs/plans/2026-01-25-testing-hardening-implementation.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
