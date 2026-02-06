from orchestrator.core.workflow.inspector import inspect_parameters


def test_inspector_finds_widget_params() -> None:
    workflow = {
        "nodes": [{"id": 1, "type": "KSampler", "widgets_values": [42]}],
        "links": [],
    }
    params = inspect_parameters(workflow)
    assert params[0].field_name == "seed"
    print("PASS: test_inspector_finds_widget_params")
