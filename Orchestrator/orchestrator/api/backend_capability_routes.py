"""Read-only backend capability and manual dependency-plan routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Path, Query

from orchestrator.backend_capabilities import (
    BackendCapabilityRecord,
    DependencyPlanRequest,
    ManualDependencyPlan,
    capability_inspector,
    make_manual_dependency_plan,
)

router = APIRouter(tags=["backend capabilities"])
_backend_manager: Any = None


def set_backend_manager(manager: Any) -> None:
    """Use the Orchestrator's current managed backend registry."""
    global _backend_manager
    _backend_manager = manager


def _get_managed_backend(backend_id: str) -> Any:
    if _backend_manager is None:
        raise HTTPException(
            status_code=503,
            detail="BackendManager not connected. Server not fully initialized.",
        )
    backend = _backend_manager.get(backend_id)
    if backend is None:
        raise HTTPException(status_code=404, detail=f"Backend '{backend_id}' not found")
    return backend


@router.get(
    "/api/backends/{backend_id}/capabilities",
    response_model=BackendCapabilityRecord,
    summary="Inspect a configured ComfyUI backend",
)
async def inspect_backend_capabilities(
    backend_id: str = Path(..., description="Managed backend identifier"),
    refresh: bool = Query(False, description="Bypass and replace the short-lived cache"),
) -> BackendCapabilityRecord:
    backend = _get_managed_backend(backend_id)
    return await capability_inspector.inspect(backend, refresh=refresh)


@router.delete(
    "/api/backends/{backend_id}/capabilities",
    summary="Invalidate a backend capability cache",
)
async def invalidate_backend_capabilities(
    backend_id: str = Path(..., description="Managed backend identifier"),
) -> dict[str, Any]:
    _get_managed_backend(backend_id)
    capability_inspector.invalidate(backend_id)
    return {"backend_id": backend_id, "invalidated": True}


@router.post(
    "/api/backends/{backend_id}/dependency-plan",
    response_model=ManualDependencyPlan,
    summary="Build a manual dependency plan from supplied exact records",
)
async def build_dependency_plan(
    request: DependencyPlanRequest,
    backend_id: str = Path(..., description="Managed backend identifier"),
    refresh: bool = Query(False, description="Refresh backend capabilities before planning"),
) -> ManualDependencyPlan:
    backend = _get_managed_backend(backend_id)
    capability = await capability_inspector.inspect(backend, refresh=refresh)
    return make_manual_dependency_plan(backend_id, request, capability)
