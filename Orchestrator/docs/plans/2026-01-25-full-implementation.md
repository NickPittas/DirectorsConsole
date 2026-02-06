# Full Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all minimal implementations with fully working features per the docs architecture and UI design.

**Architecture:** Implement core execution, backend orchestration, and PyQt UI according to the detailed docs in `docs/architecture/`. Prioritize core correctness first, then wire UI controls and dialogs, then polish monitoring and persistence flows.

**Tech Stack:** Python 3.11, PyQt6, httpx, websockets, Pydantic v2, SQLite, uv.

**Constraint:** Do not run any tests until the final validation task. Tests may be written earlier but must not be executed until the end.

---

### Task 1: Condition Expression Engine (Core)

**Files:**
- Create: `orchestrator/core/conditions/expressions.py`
- Create: `orchestrator/core/conditions/evaluator.py`
- Create: `tests/unit/test_condition_expressions.py`
- Create: `tests/unit/test_condition_evaluator.py`

**Step 1: Write the tests (no execution).**

```python
from orchestrator.core.conditions.expressions import parse_expression


def test_parse_expression_comparison() -> None:
    expr = parse_expression("output.faces_count > 0")
    assert expr.left == "output.faces_count"
    assert expr.operator == ">"
    assert expr.right == 0
```

```python
from orchestrator.core.conditions.evaluator import ConditionEvaluator


def test_evaluator_handles_simple_expression() -> None:
    evaluator = ConditionEvaluator()
    result = evaluator.evaluate("output.faces_count > 0", {"output": {"faces_count": 2}})
    assert result is True
```

**Step 2: Implement expression parsing.**

```python
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ParsedExpression:
    left: str
    operator: str
    right: Any


def parse_expression(expression: str) -> ParsedExpression:
    tokens = expression.strip().split(" ")
    if len(tokens) != 3:
        raise ValueError("Expression must be in form '<left> <op> <right>'")
    left, operator, raw_right = tokens
    if raw_right.isdigit():
        right: Any = int(raw_right)
    elif raw_right.replace(".", "", 1).isdigit():
        right = float(raw_right)
    elif raw_right.lower() in {"true", "false"}:
        right = raw_right.lower() == "true"
    else:
        right = raw_right.strip('"')
    return ParsedExpression(left=left, operator=operator, right=right)
```

**Step 3: Implement evaluator with field lookup and built-ins.**

```python
from typing import Any
from .expressions import parse_expression


class ConditionEvaluator:
    def evaluate(self, expression: str, context: dict[str, Any]) -> bool:
        parsed = parse_expression(expression)
        left_value = self._resolve_field(parsed.left, context)
        return self._compare(left_value, parsed.operator, parsed.right)

    def _resolve_field(self, field_path: str, context: dict[str, Any]) -> Any:
        current: Any = context
        for part in field_path.split("."):
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                raise KeyError(f"Missing field '{field_path}'")
        return current

    def _compare(self, left: Any, operator: str, right: Any) -> bool:
        if operator == ">":
            return left > right
        if operator == "<":
            return left < right
        if operator == ">=":
            return left >= right
        if operator == "<=":
            return left <= right
        if operator == "==":
            return left == right
        if operator == "!=" :
            return left != right
        raise ValueError(f"Unsupported operator: {operator}")
```

**Step 4: Update codemap.**

Mark the new files as ✅ Complete in `docs/CODEMAP.md`.

---

### Task 2: Backend Client and Output Handling

**Files:**
- Modify: `orchestrator/backends/client.py`
- Create: `tests/unit/test_backend_client_outputs.py`

**Step 1: Write the tests (no execution).**

```python
from orchestrator.backends.client import ComfyUIClient


def test_build_view_url() -> None:
    client = ComfyUIClient("127.0.0.1", 8188)
    assert client._view_url("img.png", "", "output").endswith("/view")
```

**Step 2: Implement output download helpers.**

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class ImageOutput:
    filename: str
    subfolder: str
    image_type: str


def download_outputs(self, history: dict) -> list[ImageOutput]:
    outputs: list[ImageOutput] = []
    for node in history.get("outputs", {}).values():
        for image in node.get("images", []):
            outputs.append(
                ImageOutput(
                    filename=image["filename"],
                    subfolder=image.get("subfolder", ""),
                    image_type=image.get("type", "output"),
                )
            )
    return outputs
```

**Step 3: Ensure WebSocket progress mapping to Job/Node execution.**

```python
async def monitor_progress(self, prompt_id: str):
    async for message in self._stream_ws(prompt_id):
        if message.type == "progress":
            yield {
                "percent": (message.value / message.max) * 100,
                "current_step": f"{message.value}/{message.max}",
                "node_id": message.node,
            }
```

**Note:** It is acceptable (and preferred) for `monitor_progress()` to yield a
`ProgressUpdate` dataclass instead of a raw dict, and to surface additional
WebSocket events such as execution start/end or errors. Downstream code should
handle these richer events.

**Step 4: Update codemap.**

---

### Task 3: Scheduler, Job Manager, Graph Executor Full Flow

**Files:**
- Modify: `orchestrator/core/engine/graph_executor.py`
- Modify: `orchestrator/core/engine/scheduler.py`
- Modify: `orchestrator/core/engine/job_manager.py`
- Create: `tests/unit/test_graph_execution_flow.py`

**Step 1: Write tests (no execution).**

```python
from orchestrator.core.engine.graph_executor import GraphExecutor
from orchestrator.core.models.project import CanvasLayout, CanvasNode, NodeType


def test_graph_executor_waiting_counts() -> None:
    layout = CanvasLayout(nodes=[CanvasNode(id="n1", node_type=NodeType.INPUT, position=(0, 0))])
    executor = GraphExecutor(layout)
    assert executor.waiting_count["n1"] == 0
```

**Step 2: Implement DataFlowOptimized execution and node completion propagation.**

```python
def on_node_complete(self, node_id: str, output_data: dict) -> None:
    self.completed.add(node_id)
    for child_id in self.children.get(node_id, []):
        self.waiting_count[child_id] -= 1
        if self.waiting_count[child_id] == 0:
            self.ready_queue.append(child_id)
```

**Step 3: Wire scheduler backend selection and fallback strategies.**

```python
def select_backend(self, node, workflow, manager):
    if node.backend_affinity:
        backend = manager.get(node.backend_affinity)
        if backend and backend.status.online:
            return backend
        if node.fallback_strategy.value == "none":
            raise ValueError("Preferred backend offline")
        if node.fallback_strategy.value == "ask_user":
            return None
    return manager.select_best_backend(workflow.required_capabilities)
```

**Step 4: Implement job lifecycle, progress aggregation, and failover prompt callback.**

```python
async def handle_node_failure(self, job, node_execution, error):
    node_execution.status = JobStatus.FAILED
    job.status = JobStatus.FAILED
    await self.job_repo.save(job)
    await self.ui_callback.notify_job_failed(job)
```

**Step 5: Update codemap.**

---

### Task 4: Backend Monitoring and Metrics Pipeline

**Files:**
- Modify: `orchestrator/backends/metrics_collector.py`
- Modify: `orchestrator/backends/health_monitor.py`
- Modify: `orchestrator/backends/manager.py`
- Create: `tests/unit/test_metrics_pipeline.py`

**Step 1: Write tests (no execution).**

```python
from orchestrator.backends.metrics_collector import MetricsCollector


def test_metrics_collector_handles_empty() -> None:
    collector = MetricsCollector([])
    assert collector.backends == []
```

**Step 2: Implement polling for system stats and metrics agent endpoint.**

```python
async def collect_once(self):
    snapshots = []
    for backend in self.backends:
        stats = await backend.client.get_system_stats()
        agent = await backend.client.get_metrics_agent()
        snapshots.append(self._build_snapshot(backend, stats, agent))
    return snapshots
```

**Step 3: Update backend status (queue, online/offline, GPU/CPU).**

**Step 4: Update codemap.**

---

### Task 5: Metrics Agent Node

**Files:**
- Create: `agents/metrics_agent/nodes.py`
- Create: `tests/unit/test_metrics_agent.py`

**Step 1: Write tests (no execution).**

```python
from agents.metrics_agent.nodes import get_metrics


def test_metrics_returns_cpu() -> None:
    metrics = get_metrics()
    assert "cpu_utilization" in metrics
```

**Step 2: Implement metrics collection and aiohttp route.**

```python
def setup_routes(app):
    async def metrics_handler(request):
        return web.json_response(get_metrics())
    app.router.add_get("/orchestrator/metrics", metrics_handler)
```

**Step 3: Update codemap.**

---

### Task 6: Workflow Management Enhancements

**Files:**
- Modify: `orchestrator/core/workflow/parser.py`
- Modify: `orchestrator/core/workflow/converter.py`
- Modify: `orchestrator/core/workflow/inspector.py`
- Create: `tests/unit/test_workflow_object_info.py`

**Step 1: Write tests (no execution).**

```python
from orchestrator.core.workflow.converter import workflow_to_api


def test_converter_uses_object_info_map() -> None:
    workflow = {"nodes": [{"id": 1, "type": "KSampler", "widgets_values": [42]}], "links": []}
    api = workflow_to_api(workflow, {"KSampler": ["seed"]})
    assert api["1"]["inputs"]["seed"] == 42
```

**Step 2: Implement converter mapping using object_info.**

**Step 3: Implement inspector to collect exposable params.**

**Step 4: Update codemap.**

---

### Task 7: Canvas Node Types and Context Menus

**Files:**
- Modify: `orchestrator/ui/canvas/condition_node.py`
- Modify: `orchestrator/ui/canvas/io_nodes.py`
- Modify: `orchestrator/ui/canvas/connection_edge.py`
- Create: `tests/unit/test_canvas_nodes.py`

**Step 1: Write tests (no execution).**

```python
from orchestrator.ui.canvas.io_nodes import InputNode


def test_input_node_has_trigger_output() -> None:
    node = InputNode()
    assert "trigger" in node.output_ports
```

**Step 2: Implement node styling, ports, and labels per UI layout.**

**Step 3: Add context menu actions for add/edit/expose.**

**Step 4: Update codemap.**

---

### Task 8: Parameter Widgets and Properties Panel

**Files:**
- Modify: `orchestrator/ui/widgets/parameter_widgets.py`
- Modify: `orchestrator/ui/panels/parameter_panel.py`
- Create: `tests/unit/test_parameter_widgets.py`

**Step 1: Write tests (no execution).**

```python
from orchestrator.ui.widgets.parameter_widgets import FloatParameterWidget


def test_float_widget_defaults() -> None:
    widget = FloatParameterWidget("CFG", 7.5)
    assert widget.value() == 7.5
```

**Step 2: Implement widget types for int, float, bool, string, choice, file.**

**Step 3: Implement ParameterPanel to render widgets per ExposedParameter.**

**Step 4: Update codemap.**

---

### Task 9: Workflow Browser and Job Panel

**Files:**
- Modify: `orchestrator/ui/panels/workflow_browser.py`
- Modify: `orchestrator/ui/panels/job_panel.py`
- Create: `tests/unit/test_workflow_browser.py`
- Create: `tests/unit/test_job_panel.py`

**Step 1: Write tests (no execution).**

```python
from orchestrator.ui.panels.workflow_browser import WorkflowBrowser


def test_workflow_browser_accepts_workflows() -> None:
    browser = WorkflowBrowser()
    browser.set_workflows([])
    assert browser.workflow_count() == 0
```

**Step 2: Implement tree view, search filter, and context menus.**

**Step 3: Implement job list view with status icons and actions.**

**Step 4: Update codemap.**

---

### Task 10: Dialogs and Status Widgets

**Files:**
- Modify: `orchestrator/ui/dialogs/backend_config.py`
- Modify: `orchestrator/ui/dialogs/parameter_expose.py`
- Modify: `orchestrator/ui/dialogs/failover_prompt.py`
- Modify: `orchestrator/ui/dialogs/workflow_import.py`
- Modify: `orchestrator/ui/widgets/status_indicator.py`
- Create: `tests/unit/test_dialogs.py`

**Step 1: Write tests (no execution).**

```python
from orchestrator.ui.dialogs.backend_config import BackendConfigDialog


def test_backend_config_dialog_defaults() -> None:
    dialog = BackendConfigDialog()
    assert dialog is not None
```

**Step 2: Implement dialog layouts per `docs/architecture/ui-layout.md`.**

**Step 3: Implement StatusIndicator colors and states.**

**Step 4: Update codemap.**

---

### Task 11: Monitoring UI Completion

**Files:**
- Modify: `orchestrator/ui/panels/monitor_panel.py`
- Modify: `orchestrator/ui/widgets/metrics_chart.py`
- Create: `tests/unit/test_monitor_panel_cards.py`

**Step 1: Write tests (no execution).**

```python
from orchestrator.ui.panels.monitor_panel import MonitorPanel


def test_monitor_panel_renders_cards() -> None:
    panel = MonitorPanel()
    panel.set_backends([])
    assert panel.card_count() == 0
```

**Step 2: Implement backend cards and horizontal scrolling layout.**

**Step 3: Implement MetricsChart data series update hooks.**

**Step 4: Update codemap.**

---

### Task 12: Final Codemap and Test Execution

**Files:**
- Modify: `docs/CODEMAP.md`

**Step 1: Update codemap statuses across all modified files to ✅ Complete.**

**Step 2: Run full test suite (only now).**

Run:
```
uv run --python "C:\\Users\\npitt\\AppData\\Local\\Programs\\Python\\Python311\\python.exe" --link-mode=copy pytest
```

**Step 3: Report failures and stop if any fail.**

---

Plan complete and saved to `docs/plans/2026-01-25-full-implementation.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
