from orchestrator.core.models.project import CanvasLayout, CanvasNode, NodeType


def test_canvas_layout_roundtrip() -> None:
    node = CanvasNode(
        id="n1",
        node_type=NodeType.INPUT,
        position=(0.0, 0.0),
    )
    layout = CanvasLayout(nodes=[node])
    data = layout.model_dump()
    restored = CanvasLayout.model_validate(data)
    assert restored.nodes[0].id == "n1"
    print("PASS: test_canvas_layout_roundtrip")
