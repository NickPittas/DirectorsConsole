from orchestrator.core.models.job import Job, JobStatus
from orchestrator.core.models.project import CanvasLayout


def test_job_defaults() -> None:
    job = Job(id="j1", project_id="p1", canvas_snapshot=CanvasLayout())
    assert job.status == JobStatus.PENDING
    print("PASS: test_job_defaults")
