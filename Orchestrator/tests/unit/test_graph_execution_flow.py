from orchestrator.core.engine.graph_executor import GraphExecutor
from orchestrator.core.models.project import (
    CanvasConnection,
    CanvasLayout,
    CanvasNode,
    DataType,
    NodeType,
)


def test_graph_executor_waiting_counts() -> None:
    layout = CanvasLayout(
        nodes=[
            CanvasNode(id="n1", node_type=NodeType.INPUT, position=(0.0, 0.0))
        ]
    )
    executor = GraphExecutor(layout)
    assert executor.waiting_count["n1"] == 0


def test_graph_executor_completion_propagates() -> None:
    layout = CanvasLayout(
        nodes=[
            CanvasNode(id="n1", node_type=NodeType.INPUT, position=(0.0, 0.0)),
            CanvasNode(id="n2", node_type=NodeType.WORKFLOW, position=(10.0, 0.0)),
        ],
        connections=[
            CanvasConnection(
                id="c1",
                source_node_id="n1",
                source_port="output",
                target_node_id="n2",
                target_port="input",
                data_type=DataType.TRIGGER,
            )
        ],
    )
    executor = GraphExecutor(layout)
    assert executor.waiting_count["n2"] == 1
    assert executor.get_ready_node() == "n1"
    executor.on_node_complete("n1")
    assert executor.waiting_count["n2"] == 0
    assert executor.get_ready_node() == "n2"
