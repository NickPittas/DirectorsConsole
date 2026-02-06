from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
from pathlib import Path
import tempfile
from typing import cast

from orchestrator.core.models.job import Job, JobStatus, NodeExecution
from orchestrator.core.models.project import CanvasLayout
from orchestrator.storage.database import SQLiteDatabase


@dataclass(frozen=True)
class JobRecord:
    id: str
    project_id: str | None  # Nullable for ad-hoc execution
    status: str
    canvas_snapshot: dict
    parameter_values: dict
    node_executions: list[dict]
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    outputs: dict


class JobRepository:
    def __init__(self, db: SQLiteDatabase | None = None) -> None:
        self._db = db or SQLiteDatabase(_default_db_path())
        self._db.run_migrations()

    def get(self, job_id: str) -> Job | None:
        row = self._db.fetchone("SELECT * FROM jobs WHERE id = ?", (job_id,))
        if row is None:
            return None
        return _record_to_job(_row_to_record(cast(dict, row)))

    def list(self) -> list[Job]:
        rows = self._db.fetchall("SELECT * FROM jobs ORDER BY created_at DESC")
        return [_record_to_job(_row_to_record(cast(dict, row))) for row in rows]

    def save(self, job: Job) -> None:
        record = _job_to_record(job)
        self._db.execute(
            """
            INSERT OR REPLACE INTO jobs (
                id, project_id, status, canvas_snapshot, parameter_values,
                node_executions, created_at, started_at, completed_at,
                error_message, outputs
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record.id,
                record.project_id,
                record.status,
                json.dumps(record.canvas_snapshot),
                json.dumps(record.parameter_values),
                json.dumps(record.node_executions),
                record.created_at.isoformat(),
                record.started_at.isoformat() if record.started_at else None,
                record.completed_at.isoformat() if record.completed_at else None,
                record.error_message,
                json.dumps(record.outputs),
            ),
        )

    def delete(self, job_id: str) -> None:
        self._db.execute("DELETE FROM jobs WHERE id = ?", (job_id,))


def _job_to_record(job: Job) -> JobRecord:
    return JobRecord(
        id=job.id,
        project_id=job.project_id,
        status=job.status.value,
        canvas_snapshot=job.canvas_snapshot.model_dump(mode='json'),
        parameter_values=job.parameter_values,
        node_executions=[execution.model_dump(mode='json') for execution in job.node_executions],
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        error_message=job.error_message,
        outputs=job.outputs,
    )


def _record_to_job(record: JobRecord) -> Job:
    return Job(
        id=record.id,
        project_id=record.project_id,
        status=JobStatus(record.status),
        canvas_snapshot=CanvasLayout.model_validate(record.canvas_snapshot),
        parameter_values=record.parameter_values,
        node_executions=[NodeExecution.model_validate(item) for item in record.node_executions],
        created_at=record.created_at,
        started_at=record.started_at,
        completed_at=record.completed_at,
        error_message=record.error_message,
        outputs=record.outputs,
    )


def _row_to_record(row: dict) -> JobRecord:
    return JobRecord(
        id=row["id"],
        project_id=row["project_id"],
        status=row["status"],
        canvas_snapshot=json.loads(row["canvas_snapshot"]),
        parameter_values=json.loads(row.get("parameter_values") or "{}"),
        node_executions=json.loads(row.get("node_executions") or "[]"),
        created_at=_parse_datetime(row.get("created_at")),
        started_at=_parse_datetime_optional(row.get("started_at")),
        completed_at=_parse_datetime_optional(row.get("completed_at")),
        error_message=row.get("error_message"),
        outputs=json.loads(row.get("outputs") or "{}"),
    )


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.utcnow()
    return datetime.fromisoformat(value)


def _parse_datetime_optional(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


def _default_db_path() -> Path:
    # Use persistent path in data directory, not temp
    data_dir = Path(__file__).resolve().parent.parent.parent.parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "orchestrator.db"
