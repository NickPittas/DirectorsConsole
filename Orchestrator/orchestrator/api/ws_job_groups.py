"""WebSocket handler for multi-node parallel job group streaming.

This module provides WebSocket endpoints for real-time streaming
of job group progress and results.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger

from orchestrator.core.parallel_job_manager import ParallelJobManager

# Router for WebSocket endpoints
router = APIRouter(tags=["job-groups-websocket"])

# Global parallel job manager reference (set via set_parallel_job_manager)
_parallel_job_manager: ParallelJobManager | None = None


def set_parallel_job_manager(manager: ParallelJobManager) -> None:
    """Connect the WebSocket handler to a ParallelJobManager instance.

    Args:
        manager: The ParallelJobManager instance to use for job group management.
    """
    global _parallel_job_manager
    _parallel_job_manager = manager
    logger.info("Job groups WebSocket connected to ParallelJobManager")


@router.websocket("/ws/job-groups/{job_group_id}")
async def job_group_websocket(websocket: WebSocket, job_group_id: str) -> None:
    """WebSocket for streaming job group progress and results.

    Connect to this endpoint to receive real-time updates about:
    - Child job progress (child_progress events)
    - Child job completion (child_completed events with outputs)
    - Child job failures (child_failed events)
    - Timeouts (child_timeout events)
    - Group completion (group_complete event)

    Args:
        websocket: The WebSocket connection.
        job_group_id: ID of the job group to monitor.
    """
    await websocket.accept()
    logger.debug(f"WebSocket connection accepted for job group {job_group_id}")

    if not _parallel_job_manager:
        logger.error("WebSocket connection rejected: ParallelJobManager not initialized")
        await websocket.close(
            code=1011,  # Internal error
            reason="Service unavailable",
        )
        return

    job_group = _parallel_job_manager.get_group(job_group_id)
    if not job_group:
        logger.warning(f"WebSocket connection rejected: Job group {job_group_id} not found")
        await websocket.close(
            code=1008,  # Policy violation
            reason="Job group not found",
        )
        return

    # Handler to forward events to WebSocket
    async def send_event(event: dict[str, Any]) -> None:
        """Send an event to the WebSocket client.

        Args:
            event: Event data to send.
        """
        try:
            await websocket.send_json(event)
        except Exception as e:
            logger.debug(f"Failed to send WebSocket event: {e}")

    # Register handler for this job group
    _parallel_job_manager.register_websocket_handler(job_group_id, send_event)

    try:
        # Send current state
        initial_state = {
            "type": "initial_state",
            "job_group_id": job_group.id,
            "status": job_group.status.value,
            "child_jobs": [
                {
                    "job_id": j.job_id,
                    "backend_id": j.backend_id,
                    "seed": j.seed,
                    "status": j.status.value,
                    "progress": j.progress,
                }
                for j in job_group.child_jobs
            ],
        }
        await websocket.send_json(initial_state)
        logger.debug(f"Sent initial state for job group {job_group_id}")

        # Keep connection open and handle client messages
        while True:
            try:
                msg = await websocket.receive_text()

                # Handle client messages
                if msg == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg == "close":
                    break
                else:
                    # Echo back unknown messages for debugging
                    await websocket.send_json({
                        "type": "echo",
                        "received": msg,
                    })

            except WebSocketDisconnect:
                logger.debug(f"WebSocket disconnected for job group {job_group_id}")
                break

    except Exception as e:
        logger.error(f"WebSocket error for job group {job_group_id}: {e}")

    finally:
        # Always unregister handler when connection closes
        _parallel_job_manager.unregister_websocket_handler(job_group_id)
        logger.debug(f"WebSocket handler unregistered for job group {job_group_id}")


# Event type constants for documentation
WEBSOCKET_EVENTS = {
    "child_progress": {
        "description": "Child job progress update",
        "payload": {
            "type": "child_progress",
            "job_id": "string",
            "backend_id": "string",
            "progress": "float (0-100)",
            "current_step": "string | null",
        },
    },
    "child_completed": {
        "description": "Child job completed successfully",
        "payload": {
            "type": "child_completed",
            "job_id": "string",
            "backend_id": "string",
            "seed": "int",
            "outputs": {
                "images": [
                    {
                        "filename": "string",
                        "subfolder": "string",
                        "type": "string",
                        "url": "string",
                    }
                ],
                "prompt_id": "string",
            },
            "completed_at": "ISO timestamp",
        },
    },
    "child_failed": {
        "description": "Child job failed",
        "payload": {
            "type": "child_failed",
            "job_id": "string",
            "backend_id": "string",
            "error": "string",
            "error_type": "string",
        },
    },
    "child_timeout": {
        "description": "Child job timed out",
        "payload": {
            "type": "child_timeout",
            "job_id": "string",
            "backend_id": "string",
            "timeout_seconds": "int",
        },
    },
    "child_cancelled": {
        "description": "Child job was cancelled",
        "payload": {
            "type": "child_cancelled",
            "job_id": "string",
            "backend_id": "string",
        },
    },
    "group_complete": {
        "description": "All child jobs in group completed",
        "payload": {
            "type": "group_complete",
            "job_group_id": "string",
            "total": "int",
            "succeeded": "int",
            "failed": "int",
            "results": [
                {
                    "job_id": "string",
                    "status": "string",
                    "outputs": "object | null",
                    "error": "string | null",
                }
            ],
        },
    },
    "initial_state": {
        "description": "Sent when client first connects",
        "payload": {
            "type": "initial_state",
            "job_group_id": "string",
            "status": "string",
            "child_jobs": [
                {
                    "job_id": "string",
                    "backend_id": "string",
                    "seed": "int",
                    "status": "string",
                    "progress": "float",
                }
            ],
        },
    },
    "pong": {
        "description": "Response to client ping",
        "payload": {"type": "pong"},
    },
}
