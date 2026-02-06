from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
from pathlib import Path
import tempfile
from typing import cast

from orchestrator.core.models.project import CanvasLayout, Project
from orchestrator.storage.database import SQLiteDatabase


@dataclass(frozen=True)
class ProjectRecord:
    id: str
    name: str
    description: str
    canvas_layout: dict
    created_at: datetime
    updated_at: datetime


class ProjectRepository:
    def __init__(self, db: SQLiteDatabase | None = None) -> None:
        self._db = db or SQLiteDatabase(_default_db_path())
        self._db.run_migrations()

    def get(self, project_id: str) -> Project | None:
        row = self._db.fetchone("SELECT * FROM projects WHERE id = ?", (project_id,))
        if row is None:
            return None
        return _record_to_project(_row_to_record(cast(dict, row)))

    def list(self) -> list[Project]:
        rows = self._db.fetchall("SELECT * FROM projects ORDER BY updated_at DESC")
        return [_record_to_project(_row_to_record(cast(dict, row))) for row in rows]

    def save(self, project: Project) -> None:
        record = _project_to_record(project)
        self._db.execute(
            """
            INSERT OR REPLACE INTO projects (
                id, name, description, canvas_layout, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                record.id,
                record.name,
                record.description,
                json.dumps(record.canvas_layout),
                record.created_at.isoformat(),
                record.updated_at.isoformat(),
            ),
        )

    def delete(self, project_id: str) -> None:
        self._db.execute("DELETE FROM projects WHERE id = ?", (project_id,))


def _project_to_record(project: Project) -> ProjectRecord:
    return ProjectRecord(
        id=project.id,
        name=project.name,
        description=project.description,
        canvas_layout=project.canvas_layout.model_dump(),
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


def _record_to_project(record: ProjectRecord) -> Project:
    return Project(
        id=record.id,
        name=record.name,
        description=record.description,
        canvas_layout=CanvasLayout.model_validate(record.canvas_layout),
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _row_to_record(row: dict) -> ProjectRecord:
    return ProjectRecord(
        id=row["id"],
        name=row["name"],
        description=row.get("description") or "",
        canvas_layout=json.loads(row["canvas_layout"]),
        created_at=_parse_datetime(row.get("created_at")),
        updated_at=_parse_datetime(row.get("updated_at")),
    )


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.utcnow()
    return datetime.fromisoformat(value)


def _default_db_path() -> Path:
    base_dir = Path(tempfile.mkdtemp(prefix="orchestrator-db-"))
    return base_dir / "orchestrator.db"
