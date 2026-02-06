from orchestrator.core.workflow.converter import workflow_to_api


def test_workflow_to_api_maps_widgets() -> None:
    workflow = {
        "nodes": [{"id": 1, "type": "KSampler", "widgets_values": [42]}],
        "links": [],
    }
    api = workflow_to_api(workflow, {"KSampler": ["seed"]})
    assert api["1"]["inputs"]["seed"] == 42
    print("PASS: test_workflow_to_api_maps_widgets")
