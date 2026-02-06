from orchestrator.core.engine.parameter_patcher import patch_parameters
from orchestrator.core.workflow.converter import workflow_to_api
from orchestrator.core.workflow.inspector import inspect_parameters
from orchestrator.core.workflow.parser import WorkflowParser


def test_workflow_roundtrip() -> None:
    workflow = {
        "nodes": [
            {"id": 1, "type": "KSampler", "widgets_values": [42], "inputs": []},
            {"id": 2, "type": "OutputNode", "inputs": [{"name": "input", "link": 1}]},
        ],
        "links": [[1, 1, 0, 2, 0, "IMAGE"]],
    }
    parser = WorkflowParser()
    parsed = parser.parse(workflow)
    api = workflow_to_api(workflow, {"KSampler": ["seed"]})
    params = inspect_parameters(workflow)
    updated = patch_parameters(api, params, {"seed": 99})
    assert parsed["node_ids"] == ["1", "2"]
    assert api["1"]["inputs"]["seed"] == 42
    assert params[0].field_name == "seed"
    assert updated["1"]["inputs"]["seed"] == 99
