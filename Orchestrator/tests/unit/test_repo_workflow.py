from orchestrator.core.models.workflow import WorkflowDefinition
from orchestrator.storage.repositories.workflow_repo import WorkflowRepository


def test_workflow_repo_roundtrip() -> None:
    repo = WorkflowRepository()
    workflow = WorkflowDefinition(
        id="w1",
        name="Test",
        workflow_json={},
        api_json={},
    )
    repo.save(workflow)
    fetched = repo.get("w1")
    assert fetched
    assert fetched.id == "w1"
    print("PASS: test_workflow_repo_roundtrip")
