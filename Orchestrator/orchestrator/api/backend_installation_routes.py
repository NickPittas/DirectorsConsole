"""Backend management configuration and bounded model-file job routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Path

from orchestrator.backend_installation import (
    BackendInstallationConfig,
    InstallAuthorization,
    InstallJob,
    InstallPlanResult,
    InstallationUnavailable,
    ModelInstallPlanRequest,
    installation_manager,
)
from orchestrator.backend_capabilities import BackendManagementDescriptor

router = APIRouter(tags=["backend installation"])
_backend_manager: Any = None


def set_backend_manager(manager: Any) -> None:
    """Use the Orchestrator's registered backend identity for every action."""
    global _backend_manager
    _backend_manager = manager


def _get_backend(backend_id: str) -> Any:
    if _backend_manager is None:
        raise HTTPException(status_code=503, detail="backend_manager_unavailable")
    backend = _backend_manager.get(backend_id)
    if backend is None:
        raise HTTPException(status_code=404, detail="backend_not_found")
    if backend.id != backend_id:
        raise HTTPException(status_code=409, detail="backend_identity_mismatch")
    return backend


def _store_error(error: RuntimeError) -> HTTPException:
    return HTTPException(status_code=503, detail=str(error))


@router.get(
    "/api/backends/{backend_id}/management",
    response_model=BackendInstallationConfig | None,
    summary="Read secret-free installation access configuration",
)
async def get_backend_management(
    backend_id: str = Path(..., description="Managed backend identifier"),
) -> BackendInstallationConfig | None:
    _get_backend(backend_id)
    return installation_manager.get_config(backend_id)


@router.put(
    "/api/backends/{backend_id}/management",
    response_model=BackendInstallationConfig,
    summary="Configure local or strict-SSH model installation access",
)
async def put_backend_management(
    config: BackendInstallationConfig,
    backend_id: str = Path(..., description="Managed backend identifier"),
) -> BackendInstallationConfig:
    _get_backend(backend_id)
    try:
        return await installation_manager.configure(backend_id, config)
    except RuntimeError as error:
        raise _store_error(error) from error


@router.delete(
    "/api/backends/{backend_id}/management",
    summary="Disable installation access for a managed backend",
)
async def delete_backend_management(
    backend_id: str = Path(..., description="Managed backend identifier"),
) -> dict[str, Any]:
    _get_backend(backend_id)
    try:
        await installation_manager.remove_config(backend_id)
    except RuntimeError as error:
        raise _store_error(error) from error
    return {"backend_id": backend_id, "removed": True}


@router.post(
    "/api/backends/{backend_id}/management/verify",
    response_model=BackendManagementDescriptor,
    summary="Verify this backend's configured host, ComfyUI root, environment and model roots",
)
async def verify_backend_management(
    backend_id: str = Path(..., description="Managed backend identifier"),
) -> BackendManagementDescriptor:
    backend = _get_backend(backend_id)
    try:
        return await installation_manager.verify_management(backend_id, backend)
    except (ValueError, OSError, InstallationUnavailable) as error:
        code = getattr(error, "code", None) or (
            "management_root_unverified" if isinstance(error, OSError) else str(error)
        )
        raise HTTPException(status_code=409, detail=code) from error


@router.post(
    "/api/backends/{backend_id}/install-jobs/plan",
    response_model=InstallPlanResult,
    summary="Plan one exact model-file install or return per-backend manual instructions",
)
async def plan_model_install(
    request: ModelInstallPlanRequest,
    backend_id: str = Path(..., description="Managed backend identifier"),
) -> InstallPlanResult:
    backend = _get_backend(backend_id)
    return await installation_manager.plan(backend_id, backend, request)


@router.post(
    "/api/backends/{backend_id}/install-jobs/{job_id}/authorize",
    response_model=InstallJob,
    summary="Authorize this exact backend, graph and model-file job",
)
async def authorize_model_install(
    authorization: InstallAuthorization,
    backend_id: str = Path(..., description="Managed backend identifier"),
    job_id: str = Path(..., description="Immutable planned job identifier"),
) -> InstallJob:
    backend = _get_backend(backend_id)
    try:
        return await installation_manager.authorize(job_id, backend, authorization)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="install_job_not_found") from error
    except (ValueError, OSError, InstallationUnavailable) as error:
        code = getattr(error, "code", None) or (
            "management_preflight_failed" if isinstance(error, OSError) else str(error)
        )
        raise HTTPException(status_code=409, detail=code) from error


@router.get(
    "/api/backends/{backend_id}/install-jobs/{job_id}",
    response_model=InstallJob,
    summary="Get status for one backend-bound model-file job",
)
async def get_model_install_job(
    backend_id: str = Path(..., description="Managed backend identifier"),
    job_id: str = Path(..., description="Install job identifier"),
) -> InstallJob:
    _get_backend(backend_id)
    try:
        return installation_manager.get_job(job_id, backend_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="install_job_not_found") from error


@router.post(
    "/api/backends/{backend_id}/install-jobs/{job_id}/cancel",
    response_model=InstallJob,
    summary="Cancel this model-file job and remove its owned partial file",
)
async def cancel_model_install_job(
    backend_id: str = Path(..., description="Managed backend identifier"),
    job_id: str = Path(..., description="Install job identifier"),
) -> InstallJob:
    _get_backend(backend_id)
    try:
        return await installation_manager.cancel(job_id, backend_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="install_job_not_found") from error
