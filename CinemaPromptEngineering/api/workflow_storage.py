"""Revision-checked persistent workflow storage for Director's Console.

The API stores one JSON file per workflow and an append-only revision history
under the user's application-data directory. Mutations require the collection
revision and each affected record revision returned by ``GET /api/workflows``.
Requests without those preconditions receive HTTP 428; stale requests receive
HTTP 409. This preserves manual Storyboard use through the updated service while
preventing legacy/backend-only writers from silently doing last-write-wins.
Every mutation requires ``expectedCollectionRevision``. Single-record writes
also require ``expectedRevision``: ``null`` means the caller observed no record
and is accepted only for creation; replacements and deletes require the current
integer revision. Bulk requests provide one expected revision per upserted ID;
omitted IDs are never deleted. Legacy files load as record revision 1, and a
missing collection revision file loads as collection revision 0. Older clients
that omit these preconditions receive HTTP 428 until they use the updated
service.

Record replacement uses a same-directory temporary file and ``os.replace``.
Revision checks assume one CPE server process owns a workflow directory; there
is no cross-process file lock, so multiple Uvicorn workers sharing that
directory are unsupported.
"""

import hashlib
import json
import os
import tempfile
import time
import unicodedata
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, HTTPException
from loguru import logger
from pydantic import BaseModel, ConfigDict, StrictInt


def _get_workflows_dir() -> Path:
    """Get the persistent workflows directory, following OS conventions."""
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif os.uname().sysname == "Darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))

    workflows_dir = base / "CinemaPromptEngineering" / "workflows"
    workflows_dir.mkdir(parents=True, exist_ok=True)
    return workflows_dir


class WorkflowSaveRequest(BaseModel):
    """A single workflow and its required write preconditions."""

    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    description: str = ""
    category: str = "image-generation"
    subCategory: str = "text2img"
    workflow: dict[str, Any]
    parsed: dict[str, Any]
    config: list[dict[str, Any]]
    createdAt: int | None = None
    categories: list[str | dict[str, Any]] | None = None
    revision: int | None = None
    parentRevision: int | None = None
    sourceProvenance: list[dict[str, Any]] | None = None
    expectedCollectionRevision: StrictInt | None = None
    expectedRevision: StrictInt | None = None


class WorkflowBulkSaveRequest(BaseModel):
    """Upsert a snapshot without deleting records omitted from it."""

    workflows: list[dict[str, Any]]
    expectedCollectionRevision: StrictInt | None = None
    expectedRevisions: dict[str, StrictInt | None] | None = None


class WorkflowMutationRequest(BaseModel):
    """Expected revisions shared by single-record update and delete requests."""

    model_config = ConfigDict(extra="allow")
    expectedCollectionRevision: StrictInt | None = None
    expectedRevision: StrictInt | None = None


router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.get("")
async def list_workflows() -> dict[str, Any]:
    """Load workflows with legacy revision defaults and the current collection revision."""
    workflows_dir = _get_workflows_dir()
    workflows: list[dict[str, Any]] = []

    for filepath in sorted(workflows_dir.glob("*.json")):
        try:
            data = json.loads(filepath.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError("record is not a JSON object")
            workflows.append(_normalize_record(data))
        except (json.JSONDecodeError, OSError, ValueError, HTTPException) as exc:
            logger.warning("Skipping unreadable workflow file {}: {}", filepath.name, exc)

    revision = _get_collection_revision(workflows_dir)
    logger.info("Loaded {} workflows", len(workflows))
    return {
        "workflows": workflows,
        "count": len(workflows),
        "storage_path": str(workflows_dir),
        "collectionRevision": revision,
    }


@router.post("")
async def save_workflow(request: WorkflowSaveRequest) -> dict[str, Any]:
    """Create or replace one workflow after checking both expected revisions."""
    workflows_dir = _get_workflows_dir()
    expected_collection = _require_collection_revision(request.expectedCollectionRevision)
    if "expectedRevision" not in request.model_fields_set:
        raise _missing_precondition("expectedRevision")
    workflow_id = _validate_id(request.id)
    current_collection = _check_collection_revision(workflows_dir, expected_collection)
    filepath = _workflow_path(workflows_dir, workflow_id)
    current = _read_record_for_write(filepath, workflow_id)
    _check_record_revision(workflow_id, request.expectedRevision, current)

    candidate = request.model_dump(exclude={"expectedCollectionRevision", "expectedRevision"})
    saved, changed = _prepare_record(candidate, workflow_id, current, workflows_dir)
    next_collection = _commit_updates(
        workflows_dir,
        [(filepath, current, saved)] if changed else [],
        current_collection,
    )
    logger.info("Saved workflow {} at revision {}", workflow_id, saved["revision"])
    return {
        "success": True,
        "id": workflow_id,
        "path": str(filepath),
        "workflow": saved,
        "collectionRevision": next_collection,
    }


@router.put("/bulk")
async def save_workflows_bulk(request: WorkflowBulkSaveRequest) -> dict[str, Any]:
    """Upsert a checked snapshot; omissions never imply deletion.

    Deletion is an explicit per-record operation. This prevents a delayed
    debounce snapshot from deleting a workflow created by a newer action.
    """
    workflows_dir = _get_workflows_dir()
    expected_collection = _require_collection_revision(request.expectedCollectionRevision)
    expected_revisions = request.expectedRevisions
    if "expectedRevisions" not in request.model_fields_set or expected_revisions is None:
        raise _missing_precondition("expectedRevisions")
    current_collection = _check_collection_revision(workflows_dir, expected_collection)

    incoming_ids: set[str] = set()
    safe_ids: dict[str, str] = {}
    staged_records: list[tuple[Path, dict[str, Any] | None, dict[str, Any]]] = []
    response_records: list[dict[str, Any]] = []
    now = int(time.time() * 1000)

    for raw_workflow in request.workflows:
        raw_id = raw_workflow.get("id")
        workflow_id = _validate_id(raw_id)
        if workflow_id in incoming_ids:
            raise HTTPException(status_code=409, detail=f"Duplicate workflow ID: {workflow_id}")
        incoming_ids.add(workflow_id)

        safe_id = _sanitize_filename(workflow_id)
        collision_key = _filename_collision_key(safe_id)
        previous_id = safe_ids.get(collision_key)
        if previous_id is not None and previous_id != workflow_id:
            raise HTTPException(status_code=409, detail="Workflow IDs map to the same storage filename")
        safe_ids[collision_key] = workflow_id

        filepath = _workflow_path(workflows_dir, workflow_id)
        current = _read_record_for_write(filepath, workflow_id)
        if workflow_id not in expected_revisions:
            raise _missing_precondition(f"expectedRevisions[{workflow_id}]")
        _check_record_revision(workflow_id, expected_revisions[workflow_id], current)
        saved, changed = _prepare_record(raw_workflow, workflow_id, current, workflows_dir, now)
        response_records.append(saved)
        if changed:
            staged_records.append((filepath, current, saved))

    if set(expected_revisions) != incoming_ids:
        raise HTTPException(status_code=422, detail="expectedRevisions must match the workflow IDs in the snapshot")

    next_collection = _commit_updates(workflows_dir, staged_records, current_collection)
    logger.info("Bulk saved {} workflows at collection revision {}", len(response_records), next_collection)
    return {
        "success": True,
        "saved": len(response_records),
        "removed": 0,
        "total": len(request.workflows),
        "errors": [],
        "workflows": response_records,
        "storage_path": str(workflows_dir),
        "collectionRevision": next_collection,
    }


@router.put("/{workflow_id}")
async def update_workflow(
    workflow_id: str,
    request: WorkflowMutationRequest | None = Body(default=None),
) -> dict[str, Any]:
    """Replace one existing workflow after checking both expected revisions."""
    if request is None:
        raise _missing_precondition("expectedCollectionRevision and expectedRevision")
    workflows_dir = _get_workflows_dir()
    expected_collection = _require_collection_revision(request.expectedCollectionRevision)
    if "expectedRevision" not in request.model_fields_set or request.expectedRevision is None:
        raise _missing_precondition("expectedRevision")
    workflow_id = _validate_id(workflow_id)
    current_collection = _check_collection_revision(workflows_dir, expected_collection)
    filepath = _workflow_path(workflows_dir, workflow_id)
    current = _read_record_for_write(filepath, workflow_id)
    if current is None:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    _check_record_revision(workflow_id, request.expectedRevision, current)

    candidate = request.model_dump(exclude={"expectedCollectionRevision", "expectedRevision"})
    if "id" in candidate and candidate["id"] != workflow_id:
        raise HTTPException(status_code=409, detail="Workflow ID cannot be changed by update")
    saved, changed = _prepare_record(candidate, workflow_id, current, workflows_dir)
    next_collection = _commit_updates(
        workflows_dir,
        [(filepath, current, saved)] if changed else [],
        current_collection,
    )
    logger.info("Updated workflow {} at revision {}", workflow_id, saved["revision"])
    return {
        "success": True,
        "id": workflow_id,
        "workflow": saved,
        "collectionRevision": next_collection,
    }


@router.delete("/{workflow_id}")
async def delete_workflow(
    workflow_id: str,
    request: WorkflowMutationRequest | None = Body(default=None),
) -> dict[str, Any]:
    """Delete one workflow after archiving it and checking both revisions."""
    if request is None:
        raise _missing_precondition("expectedCollectionRevision and expectedRevision")
    workflows_dir = _get_workflows_dir()
    expected_collection = _require_collection_revision(request.expectedCollectionRevision)
    if "expectedRevision" not in request.model_fields_set or request.expectedRevision is None:
        raise _missing_precondition("expectedRevision")
    workflow_id = _validate_id(workflow_id)
    current_collection = _check_collection_revision(workflows_dir, expected_collection)
    filepath = _workflow_path(workflows_dir, workflow_id)
    current = _read_record_for_write(filepath, workflow_id)
    if current is None:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    _check_record_revision(workflow_id, request.expectedRevision, current)

    try:
        _archive_record(workflows_dir, current)
        next_collection = current_collection + 1
        _atomic_write_text(_collection_revision_path(workflows_dir), str(next_collection))
        filepath.unlink()
    except HTTPException:
        raise
    except OSError as exc:
        logger.error("Failed to delete workflow {}: {}", workflow_id, exc)
        raise HTTPException(status_code=500, detail="Workflow could not be deleted") from exc

    logger.info("Deleted workflow {}", workflow_id)
    return {"success": True, "id": workflow_id, "collectionRevision": next_collection}


@router.get("/storage-info")
async def get_storage_info() -> dict[str, Any]:
    """Get information about current records; revision history is excluded."""
    workflows_dir = _get_workflows_dir()
    files = list(workflows_dir.glob("*.json"))
    total_size = sum(filepath.stat().st_size for filepath in files)
    return {
        "storage_path": str(workflows_dir),
        "workflow_count": len(files),
        "total_size_bytes": total_size,
        "total_size_mb": round(total_size / (1024 * 1024), 2),
    }


def _validate_id(workflow_id: Any) -> str:
    """Validate the canonical ID before deriving its sanitized filename."""
    if not isinstance(workflow_id, str) or not workflow_id.strip() or "\x00" in workflow_id:
        raise HTTPException(status_code=422, detail="Workflow ID must be a non-empty string")
    return workflow_id


def _workflow_path(workflows_dir: Path, workflow_id: str) -> Path:
    safe_id = _sanitize_filename(workflow_id)
    filepath = workflows_dir / f"{safe_id}.json"
    if filepath.exists():
        return filepath
    collision_key = _filename_collision_key(safe_id)
    matches = [
        candidate
        for candidate in workflows_dir.glob("*.json")
        if _filename_collision_key(candidate.stem) == collision_key
    ]
    records = [_read_record_for_write(filepath, workflow_id) for filepath in matches]
    if len(matches) > 1:
        raise HTTPException(status_code=409, detail="Workflow IDs map to the same storage filename")
    if records and records[0] is not None:
        return matches[0]
    return filepath


def _filename_collision_key(filename: str) -> str:
    """Treat case and Unicode-equivalent names as collisions on Windows/NAS filesystems."""
    return unicodedata.normalize("NFC", filename).casefold()


def _read_record_for_write(filepath: Path, workflow_id: str) -> dict[str, Any] | None:
    if not filepath.exists():
        return None
    try:
        data = json.loads(filepath.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.error("Cannot read workflow record {}: {}", filepath.name, exc)
        raise HTTPException(status_code=409, detail="Stored workflow cannot be safely replaced") from exc
    if not isinstance(data, dict) or data.get("id") != workflow_id:
        raise HTTPException(status_code=409, detail="Workflow ID collides with an existing storage filename")
    return _normalize_record(data)


def _normalize_record(record: dict[str, Any]) -> dict[str, Any]:
    """Supply additive metadata defaults for records written by older versions."""
    result = dict(record)
    revision = result.get("revision")
    if revision is None:
        revision = 1
    if type(revision) is not int or revision < 1:
        raise HTTPException(status_code=409, detail="Stored workflow has an invalid revision")
    result["revision"] = revision
    result.setdefault("parentRevision", None)
    if result.get("sourceProvenance") is None:
        result["sourceProvenance"] = []
    if not isinstance(result["sourceProvenance"], list):
        raise HTTPException(status_code=409, detail="Stored workflow provenance is invalid")
    return result


def _prepare_record(
    raw_record: dict[str, Any],
    workflow_id: str,
    current: dict[str, Any] | None,
    workflows_dir: Path,
    now: int | None = None,
) -> tuple[dict[str, Any], bool]:
    """Build the next canonical record while preserving server-owned revisions."""
    now = now or int(time.time() * 1000)
    candidate = dict(raw_record)
    candidate["id"] = workflow_id
    candidate.pop("expectedCollectionRevision", None)
    candidate.pop("expectedRevision", None)
    candidate.pop("revision", None)
    candidate.pop("parentRevision", None)

    if current is not None:
        current = _normalize_record(current)
        if not candidate.get("createdAt"):
            candidate["createdAt"] = current.get("createdAt") or now
        if candidate.get("sourceProvenance") is None:
            candidate["sourceProvenance"] = current["sourceProvenance"]
        if _record_content(candidate) == _record_content(current):
            return current, False
        parent_revision = current["revision"]
        revision = parent_revision + 1
    else:
        if not candidate.get("createdAt"):
            candidate["createdAt"] = now
        if candidate.get("sourceProvenance") is None:
            candidate["sourceProvenance"] = []
        parent_revision = _latest_history_revision(workflows_dir, workflow_id)
        revision = parent_revision + 1 if parent_revision else 1

    candidate["revision"] = revision
    candidate["parentRevision"] = parent_revision or None
    candidate["updatedAt"] = now
    if not isinstance(candidate["sourceProvenance"], list):
        raise HTTPException(status_code=422, detail="sourceProvenance must be a list")
    return candidate, True


def _record_content(record: dict[str, Any]) -> dict[str, Any]:
    """Compare user data while ignoring server-managed revision timestamps."""
    return {
        key: value
        for key, value in record.items()
        if key not in {"revision", "parentRevision", "updatedAt", "expectedCollectionRevision", "expectedRevision"}
    }


def _check_record_revision(
    workflow_id: str,
    expected_revision: int | None,
    current: dict[str, Any] | None,
) -> None:
    actual_revision = current["revision"] if current is not None else None
    if expected_revision != actual_revision:
        raise HTTPException(
            status_code=409,
            detail=f"Workflow '{workflow_id}' revision conflict (expected {expected_revision}, current {actual_revision})",
        )


def _require_collection_revision(expected_revision: int | None) -> int:
    if expected_revision is None:
        raise _missing_precondition("expectedCollectionRevision")
    if expected_revision < 0:
        raise HTTPException(status_code=422, detail="expectedCollectionRevision cannot be negative")
    return expected_revision


def _missing_precondition(name: str) -> HTTPException:
    return HTTPException(status_code=428, detail=f"Required workflow storage precondition missing: {name}")


def _check_collection_revision(workflows_dir: Path, expected_revision: int) -> int:
    current_revision = _get_collection_revision(workflows_dir)
    if expected_revision != current_revision:
        raise HTTPException(
            status_code=409,
            detail=f"Workflow collection revision conflict (expected {expected_revision}, current {current_revision})",
        )
    return current_revision


def _collection_revision_path(workflows_dir: Path) -> Path:
    return workflows_dir / ".collection-revision"


def _get_collection_revision(workflows_dir: Path) -> int:
    filepath = _collection_revision_path(workflows_dir)
    try:
        revision = int(filepath.read_text(encoding="ascii"))
    except FileNotFoundError:
        return 0
    except (OSError, ValueError) as exc:
        logger.error("Cannot read workflow collection revision: {}", exc)
        raise HTTPException(status_code=500, detail="Workflow collection revision is unavailable") from exc
    if revision < 0:
        raise HTTPException(status_code=500, detail="Workflow collection revision is invalid")
    return revision


def _commit_updates(
    workflows_dir: Path,
    changes: list[tuple[Path, dict[str, Any] | None, dict[str, Any]]],
    current_collection: int,
) -> int:
    """Stage all record writes, archive old versions, then advance and replace."""
    if not changes:
        return current_collection

    staged: list[tuple[Path, Path]] = []
    try:
        for filepath, _old_record, new_record in changes:
            content = json.dumps(new_record, indent=2, ensure_ascii=False)
            staged.append((filepath, _stage_text(filepath, content)))
        for _filepath, old_record, _new_record in changes:
            if old_record is not None:
                _archive_record(workflows_dir, old_record)

        next_collection = current_collection + 1
        _atomic_write_text(_collection_revision_path(workflows_dir), str(next_collection))
        for filepath, temporary in staged:
            os.replace(temporary, filepath)
        return next_collection
    except HTTPException:
        raise
    except (OSError, TypeError, ValueError) as exc:
        logger.error("Failed to commit workflow storage mutation: {}", exc)
        raise HTTPException(status_code=500, detail="Workflow storage mutation failed") from exc
    finally:
        for _filepath, temporary in staged:
            try:
                temporary.unlink(missing_ok=True)
            except OSError as exc:
                logger.warning("Could not remove workflow temporary file {}: {}", temporary.name, exc)


def _stage_text(filepath: Path, content: str) -> Path:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    temporary_name = ""
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=filepath.parent,
            prefix=f".{filepath.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_name = temporary.name
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
    except OSError:
        if temporary_name:
            Path(temporary_name).unlink(missing_ok=True)
        raise
    return Path(temporary_name)


def _atomic_write_text(filepath: Path, content: str) -> None:
    temporary = _stage_text(filepath, content)
    try:
        os.replace(temporary, filepath)
    finally:
        temporary.unlink(missing_ok=True)


def _archive_record(workflows_dir: Path, record: dict[str, Any]) -> None:
    canonical = _normalize_record(record)
    history_path = _history_path(workflows_dir, canonical["id"], canonical["revision"])
    serialized = json.dumps(canonical, indent=2, ensure_ascii=False)
    if history_path.exists():
        if history_path.read_text(encoding="utf-8") != serialized:
            raise HTTPException(status_code=409, detail="Workflow history revision already exists with different contents")
        return
    _atomic_write_text(history_path, serialized)


def _history_path(workflows_dir: Path, workflow_id: str, revision: int) -> Path:
    digest = hashlib.sha256(workflow_id.encode("utf-8")).hexdigest()
    return workflows_dir / ".history" / f"{digest}.r{revision}.json"


def _latest_history_revision(workflows_dir: Path, workflow_id: str) -> int:
    digest = hashlib.sha256(workflow_id.encode("utf-8")).hexdigest()
    history_dir = workflows_dir / ".history"
    latest = 0
    for filepath in history_dir.glob(f"{digest}.r*.json"):
        try:
            latest = max(latest, int(filepath.stem.rsplit(".r", 1)[1]))
        except ValueError:
            logger.warning("Ignoring malformed workflow history filename {}", filepath.name)
    return latest


def _sanitize_filename(name: str) -> str:
    """Sanitize an ID for a safe filename; callers reject sanitized collisions."""
    unsafe = '<>:"/\\|?*'
    result = name
    for char in unsafe:
        result = result.replace(char, "_")
    result = result.strip(". ")
    if len(result) > 200:
        result = result[:200]
    return result or "unnamed"
