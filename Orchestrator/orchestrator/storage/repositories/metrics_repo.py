from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import tempfile
from typing import cast

from orchestrator.core.models.metrics import MetricsSnapshot
from orchestrator.storage.database import SQLiteDatabase


@dataclass(frozen=True)
class MetricsRecord:
    id: str
    backend_id: str
    timestamp: datetime
    gpu_memory_used: int
    gpu_memory_total: int
    gpu_utilization: float
    gpu_temperature: int
    cpu_utilization: float
    ram_used: int
    ram_total: int
    queue_depth: int
    active_job_id: str | None


class MetricsRepository:
    def __init__(self, db: SQLiteDatabase | None = None) -> None:
        self._db = db or SQLiteDatabase(_default_db_path())
        self._db.run_migrations()

    def list_for_backend(self, backend_id: str) -> list[MetricsSnapshot]:
        rows = self._db.fetchall(
            "SELECT * FROM metrics_snapshots WHERE backend_id = ? ORDER BY timestamp DESC",
            (backend_id,),
        )
        return [_record_to_snapshot(_row_to_record(cast(dict, row))) for row in rows]

    def save(self, snapshot: MetricsSnapshot) -> None:
        record = _snapshot_to_record(snapshot)
        self._db.execute(
            """
            INSERT OR REPLACE INTO metrics_snapshots (
                id, backend_id, timestamp, gpu_memory_used, gpu_memory_total,
                gpu_utilization, gpu_temperature, cpu_utilization, ram_used,
                ram_total, queue_depth, active_job_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record.id,
                record.backend_id,
                record.timestamp.isoformat(),
                record.gpu_memory_used,
                record.gpu_memory_total,
                record.gpu_utilization,
                record.gpu_temperature,
                record.cpu_utilization,
                record.ram_used,
                record.ram_total,
                record.queue_depth,
                record.active_job_id,
            ),
        )


def _snapshot_to_record(snapshot: MetricsSnapshot) -> MetricsRecord:
    return MetricsRecord(
        id=snapshot.id,
        backend_id=snapshot.backend_id,
        timestamp=snapshot.timestamp,
        gpu_memory_used=snapshot.gpu_memory_used,
        gpu_memory_total=snapshot.gpu_memory_total,
        gpu_utilization=snapshot.gpu_utilization,
        gpu_temperature=snapshot.gpu_temperature,
        cpu_utilization=snapshot.cpu_utilization,
        ram_used=snapshot.ram_used,
        ram_total=snapshot.ram_total,
        queue_depth=snapshot.queue_depth,
        active_job_id=snapshot.active_job_id,
    )


def _record_to_snapshot(record: MetricsRecord) -> MetricsSnapshot:
    return MetricsSnapshot(
        id=record.id,
        backend_id=record.backend_id,
        timestamp=record.timestamp,
        gpu_memory_used=record.gpu_memory_used,
        gpu_memory_total=record.gpu_memory_total,
        gpu_utilization=record.gpu_utilization,
        gpu_temperature=record.gpu_temperature,
        cpu_utilization=record.cpu_utilization,
        ram_used=record.ram_used,
        ram_total=record.ram_total,
        queue_depth=record.queue_depth,
        active_job_id=record.active_job_id,
    )


def _row_to_record(row: dict) -> MetricsRecord:
    return MetricsRecord(
        id=row["id"],
        backend_id=row["backend_id"],
        timestamp=_parse_datetime(row.get("timestamp")),
        gpu_memory_used=row.get("gpu_memory_used", 0),
        gpu_memory_total=row.get("gpu_memory_total", 0),
        gpu_utilization=row.get("gpu_utilization", 0.0),
        gpu_temperature=row.get("gpu_temperature", 0),
        cpu_utilization=row.get("cpu_utilization", 0.0),
        ram_used=row.get("ram_used", 0),
        ram_total=row.get("ram_total", 0),
        queue_depth=row.get("queue_depth", 0),
        active_job_id=row.get("active_job_id"),
    )


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.utcnow()
    return datetime.fromisoformat(value)


def _default_db_path() -> Path:
    base_dir = Path(tempfile.mkdtemp(prefix="orchestrator-db-"))
    return base_dir / "orchestrator.db"
