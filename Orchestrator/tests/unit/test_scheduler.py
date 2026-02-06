from orchestrator.core.engine.scheduler import Scheduler
from orchestrator.core.models.backend import BackendConfig
from orchestrator.core.models.project import CanvasNode, NodeType
from orchestrator.core.models.workflow import WorkflowDefinition


def test_scheduler_affinity() -> None:
    backend = BackendConfig(id="b1", name="PC1", host="127.0.0.1")
    scheduler = Scheduler()
    scheduler.register(backend)
    node = CanvasNode(
        id="n1",
        node_type=NodeType.WORKFLOW,
        position=(0.0, 0.0),
        backend_affinity=backend.id,
    )
    workflow = WorkflowDefinition(id="w1", name="Test", workflow_json={}, api_json={})
    selected = scheduler.select_backend(node, workflow)
    assert selected.id == backend.id
    print("PASS: test_scheduler_affinity")
