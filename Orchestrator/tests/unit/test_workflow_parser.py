from orchestrator.core.workflow.parser import WorkflowParser


def test_parse_minimal_workflow() -> None:
    parser = WorkflowParser()
    parsed = parser.parse({"nodes": [{"id": 1, "type": "KSampler"}], "links": []})
    assert parsed["node_ids"] == ["1"]
    print("PASS: test_parse_minimal_workflow")
