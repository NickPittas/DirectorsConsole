from orchestrator.core.models.project import Project
from orchestrator.storage.repositories.project_repo import ProjectRepository


def test_project_repo_roundtrip() -> None:
    repo = ProjectRepository()
    project = Project(id="p1", name="Project")
    repo.save(project)
    fetched = repo.get("p1")
    assert fetched
    assert fetched.id == "p1"
    print("PASS: test_project_repo_roundtrip")
