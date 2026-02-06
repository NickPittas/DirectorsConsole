"""Persistent workflow storage for Director's Console.

Stores user-imported workflows as individual JSON files in:
  - Windows: %APPDATA%/CinemaPromptEngineering/workflows/
  - Linux:   $XDG_DATA_HOME/CinemaPromptEngineering/workflows/
  - macOS:   ~/Library/Application Support/CinemaPromptEngineering/workflows/

Each workflow is saved as {workflow_id}.json — a complete snapshot including
the raw ComfyUI workflow, parsed data, and user-configured parameter settings.
"""

import json
import os
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from loguru import logger


# =============================================================================
# STORAGE DIRECTORY
# =============================================================================

def _get_workflows_dir() -> Path:
    """Get the persistent workflows directory, following OS conventions."""
    if os.name == 'nt':
        base = Path(os.environ.get('APPDATA', Path.home() / 'AppData' / 'Roaming'))
    elif os.uname().sysname == 'Darwin':
        base = Path.home() / 'Library' / 'Application Support'
    else:
        base = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local' / 'share'))

    workflows_dir = base / 'CinemaPromptEngineering' / 'workflows'
    workflows_dir.mkdir(parents=True, exist_ok=True)
    return workflows_dir


# =============================================================================
# MODELS
# =============================================================================

class WorkflowSaveRequest(BaseModel):
    """A single workflow to save."""
    id: str
    name: str
    description: str = ''
    category: str = 'image-generation'
    subCategory: str = 'text2img'
    workflow: dict[str, Any]  # Raw ComfyUI workflow JSON
    parsed: dict[str, Any]   # Parsed workflow data
    config: list[dict[str, Any]]  # ParameterConfig[]
    createdAt: int | None = None
    categories: list[dict[str, Any]] | None = None


class WorkflowBulkSaveRequest(BaseModel):
    """Save multiple workflows at once."""
    workflows: list[dict[str, Any]]


# =============================================================================
# ROUTER
# =============================================================================

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.get("")
async def list_workflows() -> dict[str, Any]:
    """Load all saved workflows from disk.

    Returns:
        { workflows: [...], count: N, storage_path: "..." }
    """
    workflows_dir = _get_workflows_dir()
    workflows: list[dict[str, Any]] = []

    for filepath in sorted(workflows_dir.glob("*.json")):
        try:
            data = json.loads(filepath.read_text(encoding='utf-8'))
            workflows.append(data)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Skipping corrupt workflow file {filepath.name}: {e}")

    logger.info(f"Loaded {len(workflows)} workflows from {workflows_dir}")
    return {
        "workflows": workflows,
        "count": len(workflows),
        "storage_path": str(workflows_dir),
    }


@router.post("")
async def save_workflow(request: WorkflowSaveRequest) -> dict[str, Any]:
    """Save or update a single workflow to disk."""
    workflows_dir = _get_workflows_dir()

    data = request.model_dump()
    if not data.get('createdAt'):
        data['createdAt'] = int(time.time() * 1000)
    data['updatedAt'] = int(time.time() * 1000)

    # Sanitize ID for filename
    safe_id = _sanitize_filename(request.id)
    filepath = workflows_dir / f"{safe_id}.json"

    filepath.write_text(
        json.dumps(data, indent=2, ensure_ascii=False),
        encoding='utf-8',
    )

    logger.info(f"Saved workflow '{request.name}' -> {filepath.name}")
    return {"success": True, "id": request.id, "path": str(filepath)}


@router.put("/bulk")
async def save_workflows_bulk(request: WorkflowBulkSaveRequest) -> dict[str, Any]:
    """Save multiple workflows at once (used for full sync from frontend)."""
    workflows_dir = _get_workflows_dir()
    saved = 0
    errors: list[str] = []

    for wf in request.workflows:
        wf_id = wf.get('id')
        if not wf_id:
            errors.append("Workflow missing 'id' field, skipped")
            continue

        if not wf.get('createdAt'):
            wf['createdAt'] = int(time.time() * 1000)
        wf['updatedAt'] = int(time.time() * 1000)

        safe_id = _sanitize_filename(wf_id)
        filepath = workflows_dir / f"{safe_id}.json"

        try:
            filepath.write_text(
                json.dumps(wf, indent=2, ensure_ascii=False),
                encoding='utf-8',
            )
            saved += 1
        except OSError as e:
            errors.append(f"Failed to save {wf_id}: {e}")

    logger.info(f"Bulk saved {saved}/{len(request.workflows)} workflows")
    return {
        "success": len(errors) == 0,
        "saved": saved,
        "total": len(request.workflows),
        "errors": errors,
        "storage_path": str(workflows_dir),
    }


@router.put("/{workflow_id}")
async def update_workflow(workflow_id: str, workflow: dict[str, Any]) -> dict[str, Any]:
    """Update an existing workflow."""
    workflows_dir = _get_workflows_dir()
    safe_id = _sanitize_filename(workflow_id)
    filepath = workflows_dir / f"{safe_id}.json"

    workflow['updatedAt'] = int(time.time() * 1000)

    filepath.write_text(
        json.dumps(workflow, indent=2, ensure_ascii=False),
        encoding='utf-8',
    )

    logger.info(f"Updated workflow '{workflow.get('name', workflow_id)}' -> {filepath.name}")
    return {"success": True, "id": workflow_id, "path": str(filepath)}


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: str) -> dict[str, Any]:
    """Delete a workflow from disk."""
    workflows_dir = _get_workflows_dir()
    safe_id = _sanitize_filename(workflow_id)
    filepath = workflows_dir / f"{safe_id}.json"

    if not filepath.exists():
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")

    filepath.unlink()
    logger.info(f"Deleted workflow {filepath.name}")
    return {"success": True, "id": workflow_id}


@router.get("/storage-info")
async def get_storage_info() -> dict[str, Any]:
    """Get information about workflow storage location and contents."""
    workflows_dir = _get_workflows_dir()
    files = list(workflows_dir.glob("*.json"))
    total_size = sum(f.stat().st_size for f in files)

    return {
        "storage_path": str(workflows_dir),
        "workflow_count": len(files),
        "total_size_bytes": total_size,
        "total_size_mb": round(total_size / (1024 * 1024), 2),
    }


# =============================================================================
# UTILITIES
# =============================================================================

def _sanitize_filename(name: str) -> str:
    """Sanitize a string for use as a safe filename."""
    # Remove or replace problematic characters
    unsafe = '<>:"/\\|?*'
    result = name
    for char in unsafe:
        result = result.replace(char, '_')
    # Remove leading/trailing dots and spaces
    result = result.strip('. ')
    # Limit length
    if len(result) > 200:
        result = result[:200]
    return result or 'unnamed'
