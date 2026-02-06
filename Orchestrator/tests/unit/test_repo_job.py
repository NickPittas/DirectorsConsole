from orchestrator.core.models.job import Job
from orchestrator.core.models.project import CanvasLayout
from orchestrator.storage.database import SQLiteDatabase
from orchestrator.storage.repositories.job_repo import JobRepository


def test_job_repo_roundtrip(tmp_path) -> None:
    db = SQLiteDatabase(tmp_path / "test.db")
    db.run_migrations()
    db.execute(
        "INSERT INTO projects (id, name, canvas_layout) VALUES (?, ?, ?)",
        ("p1", "Project", "{}"),
    )
    repo = JobRepository(db)
    job = Job(id="j1", project_id="p1", canvas_snapshot=CanvasLayout())
    repo.save(job)
    fetched = repo.get("j1")
    assert fetched
    assert fetched.id == "j1"
    print("PASS: test_job_repo_roundtrip")
