"""API endpoints for multi-node parallel job group management.

This module provides REST endpoints for submitting, monitoring,
and cancelling parallel job groups across multiple ComfyUI backends.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from loguru import logger

from orchestrator.core.models.job_group import (
    JobGroupRequest,
    JobGroupResponse,
    JobGroupStatusResponse,
)
from orchestrator.core.parallel_job_manager import ParallelJobManager

# Router for job group endpoints
router = APIRouter(prefix="/api", tags=["job-groups"])

# Global parallel job manager reference (set via set_parallel_job_manager)
_parallel_job_manager: ParallelJobManager | None = None


def set_parallel_job_manager(manager: ParallelJobManager) -> None:
    """Connect the API to a ParallelJobManager instance.

    Args:
        manager: The ParallelJobManager instance to use for job group execution.
    """
    global _parallel_job_manager
    _parallel_job_manager = manager
    logger.info("Job groups API connected to ParallelJobManager")


@router.post(
    "/job-group",
    response_model=JobGroupResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a parallel job group",
    description="Submit a parallel generation job across multiple backends.",
)
async def submit_job_group(request: JobGroupRequest) -> JobGroupResponse:
    """Submit a parallel job group for execution across multiple backends.

    Creates a job group that runs the same workflow on multiple backends
    with different seeds for generating variations.

    Args:
        request: Job group submission request.

    Returns:
        JobGroupResponse with job group ID and initial status.

    Raises:
        HTTPException: If ParallelJobManager not initialized or no valid backends.
    """
    if not _parallel_job_manager:
        logger.error("Job group submission attempted but ParallelJobManager not initialized")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ParallelJobManager not initialized",
        )

    try:
        job_group = await _parallel_job_manager.submit_group(request)
        return JobGroupResponse(
            job_group_id=job_group.id,
            child_jobs=job_group.child_jobs,
            status=job_group.status,
            created_at=job_group.created_at,
        )
    except ValueError as e:
        logger.warning(f"Job group submission failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get(
    "/job-groups/{job_group_id}",
    response_model=JobGroupStatusResponse,
    summary="Get job group status",
    description="Get the current status of a job group including all child jobs.",
)
async def get_job_group_status(job_group_id: str) -> JobGroupStatusResponse:
    """Get status of a job group.

    Args:
        job_group_id: Unique identifier for the job group.

    Returns:
        JobGroupStatusResponse with full status details.

    Raises:
        HTTPException: If ParallelJobManager not initialized or job group not found.
    """
    if not _parallel_job_manager:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ParallelJobManager not initialized",
        )

    job_group = _parallel_job_manager.get_group(job_group_id)
    if not job_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job group {job_group_id} not found",
        )

    return JobGroupStatusResponse(
        job_group_id=job_group.id,
        status=job_group.status,
        child_jobs=job_group.child_jobs,
        completed_count=job_group.completed_count,
        failed_count=job_group.failed_count,
        total_count=len(job_group.child_jobs),
        created_at=job_group.created_at,
        completed_at=job_group.completed_at,
    )


@router.delete(
    "/job-groups/{job_group_id}",
    response_model=dict[str, Any],
    summary="Cancel a job group",
    description="Cancel an active job group and interrupt all running child jobs.",
)
async def cancel_job_group(job_group_id: str) -> dict[str, Any]:
    """Cancel a job group.

    Attempts to interrupt all running child jobs in the group.
    Already completed or failed jobs are not affected.

    Args:
        job_group_id: Unique identifier for the job group.

    Returns:
        Dictionary with cancellation results including counts.

    Raises:
        HTTPException: If ParallelJobManager not initialized or job group not found.
    """
    if not _parallel_job_manager:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ParallelJobManager not initialized",
        )

    try:
        result = await _parallel_job_manager.cancel_group(job_group_id)
        return {"cancelled": True, **result}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
