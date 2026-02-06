from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
from pathlib import Path
import tempfile
from typing import cast

from orchestrator.core.models.workflow import ExposedParameter, WorkflowDefinition
from orchestrator.storage.database import SQLiteDatabase


@dataclass(frozen=True)
class WorkflowRecord:
    id: str
    name: str
    description: str
    workflow_json: dict
    api_json: dict
    exposed_parameters: list[dict]
    required_capabilities: list[str]
    required_custom_nodes: list[str]
    created_at: datetime
    updated_at: datetime
    thumbnail: str | None


class WorkflowRepository:
    def __init__(self, db: SQLiteDatabase | None = None) -> None:
        self._db = db or SQLiteDatabase(_default_db_path())
        self._db.run_migrations()

    def get(self, workflow_id: str) -> WorkflowDefinition | None:
        row = self._db.fetchone(
            "SELECT * FROM workflows WHERE id = ?",
            (workflow_id,),
        )
        if row is None:
            return None
        return _record_to_workflow(_row_to_record(cast(dict, row)))

    def list(self) -> list[WorkflowDefinition]:
        rows = self._db.fetchall("SELECT * FROM workflows ORDER BY updated_at DESC")
        return [_record_to_workflow(_row_to_record(cast(dict, row))) for row in rows]

    def save(self, workflow: WorkflowDefinition) -> None:
        record = _workflow_to_record(workflow)
        self._db.execute(
            """
            INSERT OR REPLACE INTO workflows (
                id, name, description, workflow_json, api_json,
                exposed_parameters, required_capabilities, required_custom_nodes,
                created_at, updated_at, thumbnail
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record.id,
                record.name,
                record.description,
                json.dumps(record.workflow_json),
                json.dumps(record.api_json),
                json.dumps(record.exposed_parameters),
                json.dumps(record.required_capabilities),
                json.dumps(record.required_custom_nodes),
                record.created_at.isoformat(),
                record.updated_at.isoformat(),
                record.thumbnail,
            ),
        )

    def delete(self, workflow_id: str) -> None:
        self._db.execute("DELETE FROM workflows WHERE id = ?", (workflow_id,))


def _workflow_to_record(workflow: WorkflowDefinition) -> WorkflowRecord:
    return WorkflowRecord(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        workflow_json=workflow.workflow_json,
        api_json=workflow.api_json,
        exposed_parameters=[param.model_dump() for param in workflow.exposed_parameters],
        required_capabilities=workflow.required_capabilities,
        required_custom_nodes=workflow.required_custom_nodes,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
        thumbnail=workflow.thumbnail,
    )


def _record_to_workflow(record: WorkflowRecord) -> WorkflowDefinition:
    return WorkflowDefinition(
        id=record.id,
        name=record.name,
        description=record.description,
        workflow_json=record.workflow_json,
        api_json=record.api_json,
        exposed_parameters=[ExposedParameter.model_validate(p) for p in record.exposed_parameters],
        required_capabilities=record.required_capabilities,
        required_custom_nodes=record.required_custom_nodes,
        created_at=record.created_at,
        updated_at=record.updated_at,
        thumbnail=record.thumbnail,
    )


def _row_to_record(row: dict) -> WorkflowRecord:
    return WorkflowRecord(
        id=row["id"],
        name=row["name"],
        description=row.get("description") or "",
        workflow_json=json.loads(row["workflow_json"]),
        api_json=json.loads(row["api_json"]),
        exposed_parameters=json.loads(row.get("exposed_parameters") or "[]"),
        required_capabilities=json.loads(row.get("required_capabilities") or "[]"),
        required_custom_nodes=json.loads(row.get("required_custom_nodes") or "[]"),
        created_at=_parse_datetime(row.get("created_at")),
        updated_at=_parse_datetime(row.get("updated_at")),
        thumbnail=row.get("thumbnail"),
    )


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.utcnow()
    return datetime.fromisoformat(value)


def _default_db_path() -> Path:
    base_dir = Path(tempfile.mkdtemp(prefix="orchestrator-db-"))
    return base_dir / "orchestrator.db"
