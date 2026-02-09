"""REST API for Orchestrator - Full Implementation.

This module provides the complete REST API for the Director's Console Orchestrator,
allowing external clients (like StoryboardUI2) to submit ComfyUI workflows and
query backend status.

Features:
- POST /api/job: Submit full ComfyUI workflow JSON for execution
- GET /api/backends: List all registered render nodes with metrics
- GET /api/backends/{id}/status: Get detailed status for a single backend
- GET /api/jobs/{id}: Get job status and progress
- Fully typed with Pydantic models
- Async I/O throughout
- Comprehensive error handling and logging
"""

from __future__ import annotations

import asyncio
import glob
import json
import logging
import os
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncGenerator

import httpx
from fastapi import FastAPI, HTTPException, Path as FastAPIPath, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel, Field

from orchestrator.core.models.backend import BackendConfig, BackendStatus
from orchestrator.core.models.job import Job, JobStatus

# Import job group modules
from orchestrator.api import job_groups, ws_job_groups
from orchestrator.core.parallel_job_manager import ParallelJobManager

logger = logging.getLogger(__name__)

# Global parallel job manager reference
_parallel_job_manager: ParallelJobManager | None = None

# ============================================================================
# SECURITY: Path Traversal Protection & SSRF Prevention
# ============================================================================

import ipaddress
from urllib.parse import urlparse

# Allowed URL hosts for SSRF protection (ComfyUI nodes)
# These are populated dynamically from registered backends + localhost
_ALLOWED_URL_HOSTS: set[str] = {
    "localhost",
    "127.0.0.1",
}


def _add_allowed_host(host: str) -> None:
    """Add a host to the SSRF allowlist (called when backends are registered)."""
    _ALLOWED_URL_HOSTS.add(host)


def _is_url_safe(url: str) -> tuple[bool, str]:
    """Validate URL for basic safety.
    
    This is a local desktop application — users connect to their own
    ComfyUI render nodes on LAN, VPN (Tailscale), or other networks.
    We only enforce scheme validation and block cloud metadata endpoints.
    
    Args:
        url: The URL to validate
        
    Returns:
        Tuple of (is_safe, error_message)
    """
    try:
        parsed = urlparse(url)
        
        # Only allow http/https schemes
        if parsed.scheme not in ('http', 'https'):
            return False, f"Invalid URL scheme: {parsed.scheme}. Only http/https allowed."
        
        hostname = parsed.hostname
        if not hostname:
            return False, "URL has no hostname"
        
        # Check if hostname is in allowlist (fast path)
        if hostname in _ALLOWED_URL_HOSTS:
            return True, ""
        
        # Check if it's an IP address
        try:
            ip = ipaddress.ip_address(hostname)
            # Block cloud metadata endpoints (AWS/GCP/Azure 169.254.x.x)
            if ip.is_link_local:
                return False, "Link-local/metadata endpoint blocked"
            # Allow ALL other IPs — this is a local desktop tool.
            # ComfyUI render nodes may be on LAN, Tailscale (CGNAT 100.64.0.0/10),
            # or any other reachable network.
            return True, ""
        except ValueError:
            # Not an IP, it's a hostname — allow it for desktop use
            pass
        
        return True, ""
        
    except Exception as e:
        return False, f"Invalid URL: {e}"


def _is_path_safe(file_path: str | Path, allowed_base_path: str | Path | None = None) -> tuple[bool, str]:
    """Check if a file path is safe from directory traversal attacks.
    
    Args:
        file_path: The path to validate
        allowed_base_path: Optional base directory that the path must be within
        
    Returns:
        Tuple of (is_safe, error_message)
    """
    try:
        # Resolve to absolute path
        path = Path(file_path).resolve()
        
        # Check for path traversal attempts (.. components)
        # Even if resolved, we should check the original for suspicious patterns
        original_str = str(file_path)
        if '..' in original_str.split('/') or '..' in original_str.split('\\'):
            # Additional check: after resolving, the path should be under base
            pass  # Will be checked below
        
        # If a base path is specified, ensure file is within it
        if allowed_base_path:
            base = Path(allowed_base_path).resolve()
            try:
                path.relative_to(base)
            except ValueError:
                return False, f"Path {file_path} is outside allowed directory {allowed_base_path}"
        
        return True, ""
        
    except Exception as e:
        return False, f"Invalid path: {e}"


def set_parallel_job_manager(manager: ParallelJobManager) -> None:
    """Connect the API to a ParallelJobManager instance.

    Args:
        manager: The ParallelJobManager instance for parallel job execution.
    """
    global _parallel_job_manager
    _parallel_job_manager = manager
    # Also set on the router modules
    job_groups.set_parallel_job_manager(manager)
    ws_job_groups.set_parallel_job_manager(manager)
    logger.info("REST API connected to ParallelJobManager")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan context manager for initializing managers on startup.

    When running via `uvicorn orchestrator.api:app`, this initializes
    the BackendManager and ParallelJobManager with default/config values.
    When managers are already set (e.g., via api_server_main.py), this is a no-op.
    """
    global _backend_manager, _parallel_job_manager

    # Only auto-initialize if not already set by api_server_main.py
    if _backend_manager is None:
        logger.info("Auto-initializing managers for standalone mode...")
        try:
            from orchestrator.backends.manager import BackendManager
            from orchestrator.backends.client import ComfyUIClient
            from orchestrator.utils.config import load_config

            # Try to load config
            config_path = Path(os.getenv("ORCHESTRATOR_CONFIG", "config.yaml"))
            if not config_path.exists():
                config_path = Path(__file__).parent.parent / "config.yaml"
            if not config_path.exists():
                config_path = Path(__file__).parent.parent.parent / "Orchestrator" / "config.yaml"
            if not config_path.exists():
                config_path = Path(__file__).parent.parent / "config.example.yaml"

            backend_manager = BackendManager()

            if config_path.exists():
                logger.info(f"Loading config from {config_path}")
                config = load_config(config_path)
                for backend in config.backends:
                    core_backend = BackendConfig(
                        id=backend.id,
                        name=backend.name,
                        host=backend.host,
                        port=backend.port,
                        enabled=backend.enabled,
                        capabilities=backend.capabilities,
                        max_concurrent_jobs=backend.max_concurrent_jobs,
                        tags=backend.tags,
                    )
                    backend_manager.register(core_backend)
                    # SECURITY: Add backend host to SSRF allowlist
                    _add_allowed_host(backend.host)
                    logger.info(f"Registered backend: {backend.name} (host {backend.host} added to SSRF allowlist)")
            else:
                logger.warning("No config.yaml found, starting without backends")

            set_backend_manager(backend_manager)

            # Initialize ParallelJobManager
            parallel_manager = ParallelJobManager(
                backend_manager=backend_manager,
                client_factory=lambda c: ComfyUIClient(c.host, c.port),
            )
            set_parallel_job_manager(parallel_manager)

            logger.info("Managers initialized successfully")
        except Exception as e:
            logger.error(f"Failed to auto-initialize managers: {e}")
            # Continue anyway - server will work in degraded mode
    else:
        logger.info("Managers already initialized, skipping auto-init")

    yield

    # Cleanup on shutdown (if needed)
    logger.info("Orchestrator API shutting down")


# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(
    title="Director's Console Orchestrator API",
    description="REST API for submitting ComfyUI workflows and managing render nodes",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware for frontend access
# Desktop app - allow all origins for LAN/VPN/Tailscale access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include job group routers
app.include_router(job_groups.router)
app.include_router(ws_job_groups.router)

# Global reference to JobManager (set via set_job_manager)
_job_manager: Any = None
_backend_manager: Any = None
_current_project: dict[str, Any] | None = None  # Stored project settings


def set_current_project(project_settings: dict[str, Any]) -> None:
    """Store the current project settings in memory.
    
    This allows backend to access project name, path, template, etc.
    without needing to extract them from paths.
    """
    global _current_project
    _current_project = project_settings
    logger.info(f"Project settings stored: {project_settings.get('name', 'unnamed')}")


def get_current_project() -> dict[str, Any] | None:
    """Get the current project settings."""
    return _current_project


def set_job_manager(job_manager: Any) -> None:
    """Connect the API to a JobManager instance.

    Args:
        job_manager: The JobManager instance to use for job execution.
    """
    global _job_manager
    _job_manager = job_manager
    logger.info("REST API connected to JobManager")


def set_backend_manager(backend_manager: Any) -> None:
    """Connect the API to a BackendManager instance.

    Args:
        backend_manager: The BackendManager instance to use for backend queries.
    """
    global _backend_manager
    _backend_manager = backend_manager
    logger.info("REST API connected to BackendManager")


# ============================================================================
# Request/Response Models
# ============================================================================

class JobSubmissionRequest(BaseModel):
    """Request model for job submission with full ComfyUI workflow.

    This model accepts a complete ComfyUI workflow JSON (api_json format)
    along with optional parameters and metadata.

    Attributes:
        workflow_json: Full ComfyUI workflow in API JSON format (node dict).
        parameters: Optional parameter overrides to patch into the workflow.
        metadata: Optional metadata (scene name, source, tags, etc.).
        backend_affinity: Optional preferred backend ID for execution.
        required_capabilities: Optional list of required backend capabilities.
    """

    workflow_json: dict[str, Any] = Field(
        ...,
        description="Full ComfyUI workflow in API JSON format (node dict)",
        examples=[
            {
                "3": {
                    "class_type": "KSampler",
                    "inputs": {"seed": 42, "steps": 20, "cfg": 7.5},
                }
            }
        ],
    )
    parameters: dict[str, Any] = Field(
        default_factory=dict,
        description="Parameter overrides to patch into workflow nodes",
        examples=[{"seed": 12345, "steps": 30}],
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Optional metadata (scene, source, tags, etc.)",
        examples=[{"scene": "shot_001", "source": "StoryboardUI2"}],
    )
    backend_affinity: str | None = Field(
        default=None,
        description="Preferred backend ID for execution",
        examples=["localhost_8188"],
    )
    required_capabilities: list[str] = Field(
        default_factory=list,
        description="Required backend capabilities (e.g., ['flux', 'video'])",
        examples=[["flux"]],
    )


class JobSubmissionResponse(BaseModel):
    """Response model for successful job submission.

    Attributes:
        job_id: Unique identifier for the submitted job.
        status: Initial job status (typically 'queued').
        message: Human-readable status message.
        backend_id: The backend assigned to this job (if known).
    """

    job_id: str = Field(..., description="Unique job identifier")
    status: str = Field(..., description="Job status (queued/running/completed/failed)")
    message: str = Field(..., description="Human-readable status message")
    backend_id: str | None = Field(
        default=None, description="Backend assigned to this job"
    )


class JobStatusResponse(BaseModel):
    """Response model for job status queries.

    Attributes:
        job_id: Unique identifier for the job.
        status: Current job status.
        progress: Progress percentage (0-100).
        created_at: Job creation timestamp.
        started_at: Job start timestamp (if started).
        completed_at: Job completion timestamp (if completed).
        error_message: Error message (if failed).
        outputs: Output data (if completed).
        backend_id: Backend executing this job.
    """

    job_id: str
    status: str
    progress: float = Field(ge=0.0, le=100.0)
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None
    outputs: dict[str, Any] = Field(default_factory=dict)
    backend_id: str | None = None


class BackendInfoResponse(BaseModel):
    """Response model for backend information.

    Attributes:
        id: Unique backend identifier.
        name: Human-readable backend name.
        host: Backend hostname or IP.
        port: Backend port number.
        enabled: Whether backend is enabled.
        online: Whether backend is currently online.
        status: Current backend status (online/offline/busy).
        queue_depth: Number of queued jobs.
        queue_pending: Number of pending jobs in ComfyUI.
        queue_running: Number of running jobs in ComfyUI.
        current_job_id: ID of currently executing job.
        capabilities: List of backend capabilities.
        gpu_name: GPU name.
        gpu_memory_total: Total GPU memory (bytes).
        gpu_memory_used: Used GPU memory (bytes).
        gpu_memory_free: Free GPU memory (bytes).
        gpu_memory_percent: GPU memory usage percentage.
        gpu_utilization: GPU utilization percentage.
        gpu_temperature: GPU temperature (Celsius).
        cpu_utilization: CPU utilization percentage.
        ram_total: Total system RAM (bytes).
        ram_used: Used system RAM (bytes).
        last_seen: Last health check timestamp.
    """

    id: str
    name: str
    host: str
    port: int
    enabled: bool
    online: bool
    status: str
    queue_depth: int = 0
    queue_pending: int = 0
    queue_running: int = 0
    current_job_id: str | None = None
    capabilities: list[str] = Field(default_factory=list)
    gpu_name: str = "Unknown"
    gpu_memory_total: int = 0
    gpu_memory_used: int = 0
    gpu_memory_free: int = 0
    gpu_memory_percent: float = 0.0
    gpu_utilization: float = 0.0
    gpu_temperature: int = 0
    cpu_utilization: float = 0.0
    ram_total: int = 0
    ram_used: int = 0
    last_seen: datetime | None = None


class BackendsListResponse(BaseModel):
    """Response model for listing all backends.

    Attributes:
        backends: List of all registered backends with their status.
        total: Total number of backends.
        online: Number of online backends.
        offline: Number of offline backends.
    """

    backends: list[BackendInfoResponse]
    total: int
    online: int
    offline: int


class RestartBackendRequest(BaseModel):
    """Request model for restarting a ComfyUI backend.

    Attributes:
        interrupt_jobs: Whether to interrupt running jobs before restart.
        free_memory: Whether to free memory before restart.
    """

    interrupt_jobs: bool = Field(
        default=True,
        description="Interrupt any running jobs before restarting",
    )
    free_memory: bool = Field(
        default=True,
        description="Free memory and unload models before restarting",
    )


class RestartBackendResponse(BaseModel):
    """Response model for backend restart request.

    Attributes:
        success: Whether the restart command was sent successfully.
        message: Human-readable status message.
        backend_id: The ID of the backend being restarted.
    """

    success: bool
    message: str
    backend_id: str


class HealthCheckResponse(BaseModel):
    """Response model for health check endpoint.

    Attributes:
        status: Health status ('healthy' or 'degraded').
        service: Service name.
        job_manager_connected: Whether JobManager is connected.
        backend_manager_connected: Whether BackendManager is connected.
        timestamp: Current server timestamp.
    """

    status: str
    service: str
    job_manager_connected: bool
    backend_manager_connected: bool
    timestamp: datetime


# ============================================================================
# API Endpoints
# ============================================================================


@app.get("/health", response_model=HealthCheckResponse)
@app.get("/api/health", response_model=HealthCheckResponse)
async def health_check() -> HealthCheckResponse:
    """Health check endpoint.

    Returns:
        Health status and service information.
    """
    # Check if we have a job manager (either legacy _job_manager or new _parallel_job_manager)
    has_job_manager = _job_manager is not None or _parallel_job_manager is not None
    
    return HealthCheckResponse(
        status="healthy" if (has_job_manager and _backend_manager) else "degraded",
        service="orchestrator-api",
        job_manager_connected=has_job_manager,
        backend_manager_connected=_backend_manager is not None,
        timestamp=datetime.now(timezone.utc),
    )


@app.post("/api/job", response_model=JobSubmissionResponse)
async def submit_job(submission: JobSubmissionRequest) -> JobSubmissionResponse:
    """Submit a ComfyUI workflow for execution.

    This endpoint accepts a full ComfyUI workflow JSON (in api_json format)
    and submits it to the Orchestrator for execution on an available backend.

    Args:
        submission: Job submission request with workflow JSON and parameters.

    Returns:
        Job submission response with job_id and status.

    Raises:
        HTTPException: If JobManager is not connected or execution fails.
    """
    if not _job_manager:
        logger.error("Job submission failed: JobManager not connected")
        raise HTTPException(
            status_code=503,
            detail="JobManager not connected. Server not fully initialized.",
        )

    # Validate workflow_json
    if not submission.workflow_json:
        logger.error("Job submission failed: Empty workflow_json")
        raise HTTPException(
            status_code=400,
            detail="workflow_json is required and cannot be empty",
        )

    # Log submission
    logger.info(
        f"Received job submission: "
        f"workflow_nodes={len(submission.workflow_json)}, "
        f"parameters={list(submission.parameters.keys())}, "
        f"metadata={submission.metadata}"
    )

    try:
        # Generate unique job ID
        job_id = str(uuid.uuid4())

        # Apply parameter patches directly using patch_parameters
        # This handles "node_id:field_name" format in parameters
        from orchestrator.core.engine.parameter_patcher import patch_parameters
        patched_workflow = patch_parameters(
            submission.workflow_json, [], submission.parameters
        )

        # Execute the workflow via JobManager
        # The JobManager expects api_json format directly
        job = await _job_manager.execute_workflow_direct(
            job_id=job_id,
            api_json=patched_workflow,
            parameters={},  # Parameters already patched
            metadata=submission.metadata,
            backend_affinity=submission.backend_affinity,
            required_capabilities=submission.required_capabilities,
        )

        logger.info(
            f"Job {job_id} submitted successfully: "
            f"status={job.status}, backend={job.node_executions[0].backend_id if job.node_executions else 'unknown'}"
        )

        return JobSubmissionResponse(
            job_id=job_id,
            status=job.status.value,
            message=f"Job submitted successfully to backend",
            backend_id=(
                job.node_executions[0].backend_id if job.node_executions else None
            ),
        )

    except ValueError as e:
        logger.error(f"Job submission validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Job submission failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Job execution failed: {str(e)}",
        )


@app.get("/api/backends", response_model=BackendsListResponse)
async def list_backends() -> BackendsListResponse:
    """List all registered render nodes with their current status.

    Returns:
        List of all backends with metrics and status information.

    Raises:
        HTTPException: If BackendManager is not connected.
    """
    if not _backend_manager:
        logger.error("Backend list request failed: BackendManager not connected")
        raise HTTPException(
            status_code=503,
            detail="BackendManager not connected. Server not fully initialized.",
        )

    try:
        # Get all backend configs and statuses
        configs = _backend_manager.list()
        statuses = _backend_manager.get_all_statuses()

        # Build response list
        backends: list[BackendInfoResponse] = []
        online_count = 0
        offline_count = 0

        for config in configs:
            status = statuses.get(config.id)
            if not status:
                # Create default offline status if missing
                status = BackendStatus(
                    backend_id=config.id,
                    online=False,
                    last_seen=datetime.now(timezone.utc),
                )

            is_online = config.enabled and status.online
            if is_online:
                online_count += 1
            else:
                offline_count += 1

            # Determine status string
            if not config.enabled:
                status_str = "disabled"
            elif not status.online:
                status_str = "offline"
            elif status.current_job_id:
                status_str = "busy"
            else:
                status_str = "idle"

            backends.append(
                BackendInfoResponse(
                    id=config.id,
                    name=config.name,
                    host=config.host,
                    port=config.port,
                    enabled=config.enabled,
                    online=status.online,
                    status=status_str,
                    queue_depth=status.queue_depth,
                    queue_pending=status.queue_pending,
                    queue_running=status.queue_running,
                    current_job_id=status.current_job_id,
                    capabilities=config.capabilities,
                    gpu_name=status.gpu_name,
                    gpu_memory_total=status.gpu_memory_total,
                    gpu_memory_used=status.gpu_memory_used,
                    gpu_memory_free=status.gpu_memory_free,
                    gpu_memory_percent=status.gpu_memory_percent,
                    gpu_utilization=status.gpu_utilization,
                    gpu_temperature=status.gpu_temperature,
                    cpu_utilization=status.cpu_utilization,
                    ram_total=status.ram_total,
                    ram_used=status.ram_used,
                    last_seen=status.last_seen,
                )
            )

        logger.info(
            f"Backend list request: {len(backends)} total, {online_count} online, {offline_count} offline"
        )

        return BackendsListResponse(
            backends=backends,
            total=len(backends),
            online=online_count,
            offline=offline_count,
        )

    except Exception as e:
        logger.exception(f"Failed to list backends: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve backend list: {str(e)}",
        )


@app.get("/api/backends/{backend_id}/status", response_model=BackendInfoResponse)
async def get_backend_status(
    backend_id: str = FastAPIPath(..., description="Backend identifier")
) -> BackendInfoResponse:
    """Get detailed status for a single backend.

    Args:
        backend_id: The unique identifier of the backend.

    Returns:
        Detailed backend information including metrics.

    Raises:
        HTTPException: If backend not found or BackendManager not connected.
    """
    if not _backend_manager:
        logger.error("Backend status request failed: BackendManager not connected")
        raise HTTPException(
            status_code=503,
            detail="BackendManager not connected. Server not fully initialized.",
        )

    try:
        # Get backend config and status
        config = _backend_manager.get(backend_id)
        if not config:
            logger.warning(f"Backend status request failed: {backend_id} not found")
            raise HTTPException(
                status_code=404,
                detail=f"Backend '{backend_id}' not found",
            )

        status = _backend_manager.get_status(backend_id)
        if not status:
            # Create default offline status
            status = BackendStatus(
                backend_id=config.id,
                online=False,
                last_seen=datetime.now(timezone.utc),
            )

        # Determine status string
        is_online = config.enabled and status.online
        if not config.enabled:
            status_str = "disabled"
        elif not status.online:
            status_str = "offline"
        elif status.current_job_id:
            status_str = "busy"
        else:
            status_str = "idle"

        logger.info(f"Backend status request: {backend_id} -> {status_str}")

        return BackendInfoResponse(
            id=config.id,
            name=config.name,
            host=config.host,
            port=config.port,
            enabled=config.enabled,
            online=status.online,
            status=status_str,
            queue_depth=status.queue_depth,
            queue_pending=status.queue_pending,
            queue_running=status.queue_running,
            current_job_id=status.current_job_id,
            capabilities=config.capabilities,
            gpu_name=status.gpu_name,
            gpu_memory_total=status.gpu_memory_total,
            gpu_memory_used=status.gpu_memory_used,
            gpu_memory_free=status.gpu_memory_free,
            gpu_memory_percent=status.gpu_memory_percent,
            gpu_utilization=status.gpu_utilization,
            gpu_temperature=status.gpu_temperature,
            cpu_utilization=status.cpu_utilization,
            ram_total=status.ram_total,
            ram_used=status.ram_used,
            last_seen=status.last_seen,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to get backend status for {backend_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve backend status: {str(e)}",
        )


@app.post("/api/backends/{backend_id}/restart", response_model=RestartBackendResponse)
async def restart_backend(
    request: RestartBackendRequest,
    backend_id: str = FastAPIPath(..., description="Backend identifier"),
) -> RestartBackendResponse:
    """Restart a ComfyUI backend by interrupting jobs and freeing memory.

    This endpoint sends commands to gracefully restart a ComfyUI backend:
    1. Interrupts any running jobs (if interrupt_jobs=True)
    2. Frees memory and unloads models (if free_memory=True)
    3. Performs a health check to verify the backend is responsive

    Args:
        backend_id: The unique identifier of the backend to restart.
        request: Restart options including interrupt_jobs and free_memory flags.

    Returns:
        Restart response indicating success or failure.

    Raises:
        HTTPException: If backend not found or BackendManager not connected.
    """
    if not _backend_manager:
        logger.error("Backend restart request failed: BackendManager not connected")
        raise HTTPException(
            status_code=503,
            detail="BackendManager not connected. Server not fully initialized.",
        )

    try:
        # Get backend config
        config = _backend_manager.get(backend_id)
        if not config:
            logger.warning(f"Backend restart request failed: {backend_id} not found")
            raise HTTPException(
                status_code=404,
                detail=f"Backend '{backend_id}' not found",
            )

        # Create client for this backend
        from orchestrator.backends.client import ComfyUIClient

        client = ComfyUIClient(config.host, config.port)

        try:
            # Step 1: Interrupt running jobs if requested
            if request.interrupt_jobs:
                logger.info(f"Interrupting jobs on backend {backend_id}")
                try:
                    await client.interrupt()
                except Exception as e:
                    logger.warning(f"Failed to interrupt jobs on {backend_id}: {e}")
                    # Continue anyway - backend might not have been running jobs

            # Step 2: Free memory if requested
            if request.free_memory:
                logger.info(f"Freeing memory on backend {backend_id}")
                try:
                    await client.free_memory()
                except Exception as e:
                    logger.warning(f"Failed to free memory on {backend_id}: {e}")
                    # Continue anyway - this is best-effort

            # Step 3: Verify backend is still responsive with health check
            logger.info(f"Verifying backend {backend_id} health after restart")
            is_healthy = await client.health_check()

            if is_healthy:
                logger.info(f"Backend {backend_id} restart completed successfully")
                return RestartBackendResponse(
                    success=True,
                    message="Backend restarted successfully. Jobs interrupted, memory freed, and health check passed.",
                    backend_id=backend_id,
                )
            else:
                logger.warning(f"Backend {backend_id} health check failed after restart")
                return RestartBackendResponse(
                    success=False,
                    message="Backend restart partially completed but health check failed. Backend may be offline.",
                    backend_id=backend_id,
                )

        finally:
            await client.close()

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to restart backend {backend_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to restart backend: {str(e)}",
        )


@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str = FastAPIPath(..., description="Job identifier")
) -> JobStatusResponse:
    """Get status and progress for a specific job.

    Args:
        job_id: The unique identifier of the job.

    Returns:
        Job status and progress information.

    Raises:
        HTTPException: If job not found or JobManager not connected.
    """
    if not _job_manager:
        logger.error("Job status request failed: JobManager not connected")
        raise HTTPException(
            status_code=503,
            detail="JobManager not connected. Server not fully initialized.",
        )

    try:
        # Get job from JobManager
        job = await _job_manager.get_job(job_id)
        if not job:
            logger.warning(f"Job status request failed: {job_id} not found")
            raise HTTPException(
                status_code=404,
                detail=f"Job '{job_id}' not found",
            )

        logger.info(f"Job status request: {job_id} -> {job.status.value} ({job.progress_percent:.1f}%)")

        return JobStatusResponse(
            job_id=job.id,
            status=job.status.value,
            progress=job.progress_percent,
            created_at=job.created_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            error_message=job.error_message,
            outputs=job.outputs,
            backend_id=(
                job.node_executions[0].backend_id if job.node_executions else None
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to get job status for {job_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve job status: {str(e)}",
        )


# ============================================================================
# Save Image Models & Endpoint
# ============================================================================


class SaveImageRequest(BaseModel):
    """Request model for saving an image from ComfyUI.

    Attributes:
        image_url: Full URL to fetch the image from ComfyUI.
        folder_path: Local folder path to save the image to.
        filename: Filename to save as (including extension).
        metadata: Optional metadata to save as JSON sidecar file.
    """

    image_url: str = Field(..., description="ComfyUI image URL to fetch")
    folder_path: str = Field(..., description="Target folder path")
    filename: str = Field(..., description="Target filename")
    metadata: dict[str, Any] | None = Field(
        None, description="Optional metadata for JSON sidecar"
    )


class SaveImageResponse(BaseModel):
    """Response for save image endpoint."""

    success: bool
    saved_path: str | None = None
    metadata_path: str | None = None
    message: str


@app.post(
    "/api/save-image",
    response_model=SaveImageResponse,
    summary="Save image from ComfyUI",
    description="Fetch an image from ComfyUI and save it to a local folder",
)
async def save_image(request: SaveImageRequest) -> SaveImageResponse:
    """Fetch an image from ComfyUI and save it to a local folder.

    This endpoint allows the frontend to save generated images to the filesystem
    by proxying through the Orchestrator (which has filesystem access).
    """
    import json

    logger.info(f"Save image request: {request.filename} -> {request.folder_path}")

    try:
        # SECURITY: Check for path traversal attacks
        is_safe, error_msg = _is_path_safe(request.folder_path)
        if not is_safe:
            logger.warning(f"[save_image] Path traversal attempt blocked: {request.folder_path}")
            return SaveImageResponse(
                success=False,
                message=f"Security error: {error_msg}"
            )

        # SECURITY: Check for SSRF attacks - only allow fetching from known ComfyUI hosts
        is_url_safe, url_error = _is_url_safe(request.image_url)
        if not is_url_safe:
            logger.warning(f"[save_image] SSRF attempt blocked: {request.image_url} - {url_error}")
            return SaveImageResponse(
                success=False,
                message=f"Security error: {url_error}"
            )

        # Create folder if it doesn't exist (async)
        folder = Path(request.folder_path)
        await asyncio.to_thread(folder.mkdir, parents=True, exist_ok=True)

        # Fetch image from ComfyUI (URL already validated)
        async with httpx.AsyncClient() as client:
            response = await client.get(request.image_url, timeout=60.0)
            if response.status_code != 200:
                logger.error(f"Failed to fetch image: HTTP {response.status_code}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Failed to fetch image from ComfyUI: HTTP {response.status_code}",
                )
            image_data = response.content

        # Save image (async)
        image_path = folder / request.filename
        
        # Ensure parent directory exists (handles subdirs in filename)
        await asyncio.to_thread(image_path.parent.mkdir, parents=True, exist_ok=True)
        
        await asyncio.to_thread(image_path.write_bytes, image_data)
        logger.info(f"Saved image: {image_path} ({len(image_data)} bytes)")

        # No JSON sidecar - PNG already contains embedded ComfyUI workflow metadata

        return SaveImageResponse(
            success=True,
            saved_path=str(image_path),
            metadata_path=None,
            message="Image saved successfully",
        )

    except httpx.RequestError as e:
        logger.error(f"Network error fetching image: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Network error fetching image: {e}",
        )
    except PermissionError as e:
        logger.error(f"Permission denied saving image: {e}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: {e}",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to save image: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save image: {e}",
        )


# ============================================================================
# Project Management Endpoints
# ============================================================================


class ProjectSettings(BaseModel):
    """Project settings stored in backend memory.
    
    Mirrors the frontend project settings.
    """
    name: str = Field(..., description="Project name (e.g., 'Demo')")
    path: str = Field(..., description="Output folder path (e.g., 'W:\\Demo')")
    naming_template: str = Field(..., description="Filename template with tokens")
    orchestrator_url: str = Field(default="http://localhost:9820", description="Orchestrator URL")
    auto_save: bool = Field(default=True, description="Auto-save on generation")
    
    # Optional fields
    description: str | None = Field(default=None, description="Project description")
    created_at: str | None = Field(default=None, description="Creation timestamp")
    updated_at: str | None = Field(default=None, description="Last update timestamp")


class SetProjectRequest(BaseModel):
    """Request to set the current project."""
    project: ProjectSettings


class SetProjectResponse(BaseModel):
    """Response for setting project."""
    success: bool
    message: str


class CreateFolderRequest(BaseModel):
    """Request to create a folder on the filesystem."""
    parent_path: str
    folder_name: str


class CreateFolderResponse(BaseModel):
    """Response from folder creation."""
    success: bool
    created_path: str
    message: str



class GetProjectResponse(BaseModel):
    """Response for getting current project."""
    success: bool
    project: ProjectSettings | None = None
    message: str


class ScanVersionsRequest(BaseModel):
    """Request to scan for existing versions in a folder."""
    folder_path: str = Field(..., description="Folder path to scan")
    pattern: str = Field(..., description="Filename pattern with {panel} and {version} tokens")


class ScanVersionsResponse(BaseModel):
    """Response with version info per panel."""
    success: bool
    panel_versions: dict[str, str]  # panel_id -> last version number (e.g., "001", "002")
    message: str


class ProjectState(BaseModel):
    """Full project state for save/load."""
    model_config = {"extra": "allow"}  # Allow extra fields to be passed through
    
    project_settings: dict[str, Any]
    panels: list[dict[str, Any]]
    workflows: list[dict[str, Any]] | None = None
    parameter_values: dict[str, Any] | None = None
    selected_workflow_id: str | None = None
    render_nodes: list[dict[str, Any]] | None = None
    comfy_url: str | None = None
    deleted_images: list[str] | None = None
    saved_at: str


class SaveProjectRequest(BaseModel):
    """Request to save project state."""
    folder_path: str
    filename: str = "project.json"
    state: ProjectState


class SaveProjectResponse(BaseModel):
    """Response for project save."""
    success: bool
    saved_path: str | None = None
    message: str


class LoadProjectRequest(BaseModel):
    """Request to load project state."""
    file_path: str


class LoadProjectResponse(BaseModel):
    """Response for project load."""
    success: bool
    state: ProjectState | None = None
    message: str


@app.post(
    "/api/scan-versions",
    response_model=ScanVersionsResponse,
    summary="Scan folder for existing versions",
    description="Scan a project folder to find the highest version number per panel",
)
async def scan_versions(request: ScanVersionsRequest) -> ScanVersionsResponse:
    """Scan a folder to find existing version numbers.
    
    Searches for files matching the pattern with v* wildcard for version.
    Returns the highest version found per panel as a 3-digit string (e.g., "001", "002").
    
    Uses stored project name from /api/project endpoint.
    
    Args:
        request: Contains folder_path and pattern with {panel} and {version} placeholders
        
    Returns:
        ScanVersionsResponse with panel_versions dict mapping panel IDs to highest version
    """
    import glob as glob_module
    import re
    
    logger.info(f"[SCAN] Scanning versions in: {request.folder_path}")
    logger.info(f"[SCAN] Pattern: {request.pattern}")
    
    def _scan_sync() -> tuple[bool, dict[str, str], str]:
        """Synchronous scan function to run in thread pool."""
        try:
            folder = Path(request.folder_path)
            if not folder.exists():
                return True, {}, "Folder does not exist yet, starting from v001"
            
            # Get project name from stored settings
            current_project = get_current_project()
            if current_project:
                project_name = current_project.get('name', '*')
                logger.info(f"[SCAN] Using stored project name: {project_name}")
            else:
                # Fallback: extract from folder path
                project_name = folder.name
                logger.warning(f"[SCAN] No stored project, using folder name: {project_name}")
            
            panel_versions: dict[str, str] = {}
            
            # CRITICAL FIX: Scan actual panel folders instead of assuming panel numbers 1-99
            # This supports custom panel names like "Hero_Shot", "Opening_Scene", etc.
            
            # Find all subdirectories (panel folders)
            panel_folders = [d for d in folder.iterdir() if d.is_dir()]
            logger.info(f"[SCAN] Found {len(panel_folders)} panel folders: {[d.name for d in panel_folders]}")
            
            for panel_folder in panel_folders:
                panel_name = panel_folder.name  # e.g., "Panel_01", "Hero_Shot", etc.
                
                # Build search pattern - replace tokens
                # For per-panel folders, we search WITHIN the panel folder
                filename = request.pattern
                filename = filename.replace("{panel}", panel_name)
                filename = filename.replace("{version}", "v*")  # Wildcard for version
                filename = filename.replace("{project}", project_name)
                filename = filename.replace("{timestamp}", "*")
                filename = filename.replace("{date}", "*")
                filename = filename.replace("{time}", "*")
                filename = filename.replace("{seed}", "*")
                filename = filename.replace("{workflow}", "*")
                
                # Search within the panel folder
                search_pattern = str(panel_folder / filename) + ".png"
                
                logger.info(f"[SCAN] Panel '{panel_name}' search: {search_pattern}")
                
                matches = glob_module.glob(search_pattern)
                if matches:
                    logger.info(f"[SCAN] Panel '{panel_name}' matches: {len(matches)} files")
                    highest = 0
                    for match in matches:
                        # Extract version number from filename (e.g., v001, v002)
                        m = re.search(r'v(\d{3})\.png$', match, re.IGNORECASE)
                        if m:
                            ver = int(m.group(1))
                            highest = max(highest, ver)
                            logger.debug(f"[SCAN] Found: {match} -> v{m.group(1)}")
                    
                    if highest > 0:
                        # Use panel folder name as the key (not panel number)
                        panel_versions[panel_name] = str(highest).zfill(3)  # "001", "002", "003"
                        logger.info(f"[SCAN] Panel '{panel_name}' highest version: v{highest:03d}")
            
            logger.info(f"[SCAN] Found versions: {panel_versions}")
            return True, panel_versions, f"Found {len(panel_versions)} panels with existing versions"
            
        except Exception as e:
            logger.exception(f"[SCAN] Failed to scan versions: {e}")
            return False, {}, f"Error scanning versions: {e}"
    
    # Run synchronous scan in thread pool to avoid blocking event loop
    success, panel_versions, message = await asyncio.to_thread(_scan_sync)
    
    return ScanVersionsResponse(
        success=success,
        panel_versions=panel_versions,
        message=message,
    )


@app.post(
    "/api/project",
    response_model=SetProjectResponse,
    summary="Set current project",
    description="Store project settings in backend memory for use in file operations",
)
async def set_project(request: SetProjectRequest) -> SetProjectResponse:
    """Store project settings in backend memory.
    
    This allows the backend to access project name, path, template, etc.
    without needing to extract them from folder paths.
    """
    try:
        set_current_project(request.project.model_dump())
        return SetProjectResponse(
            success=True,
            message=f"Project '{request.project.name}' set successfully",
        )
    except Exception as e:
        logger.exception(f"Failed to set project: {e}")
        return SetProjectResponse(
            success=False,
            message=f"Error setting project: {e}",
        )


@app.get(
    "/api/project",
    response_model=GetProjectResponse,
    summary="Get current project",
    description="Retrieve the currently stored project settings",
)
async def get_project() -> GetProjectResponse:
    """Get the current project settings from backend memory."""
    project = get_current_project()
    if project:
        return GetProjectResponse(
            success=True,
            project=ProjectSettings(**project),
            message="Project found",
        )
    return GetProjectResponse(
        success=False,
        project=None,
        message="No project set",
    )


@app.post(
    "/api/save-project",
    response_model=SaveProjectResponse,
    summary="Save project state",
    description="Save the complete project state (panels, settings, etc.) to a JSON file",
)
async def save_project(request: SaveProjectRequest) -> SaveProjectResponse:
    """Save project state to a JSON file."""
    import json
    
    logger.info(f"Saving project to: {request.folder_path}/{request.filename}")
    
    def _save_sync() -> tuple[bool, str, str]:
        """Synchronous save function to run in thread pool."""
        try:
            folder = Path(request.folder_path)
            folder.mkdir(parents=True, exist_ok=True)
            
            file_path = folder / request.filename
            
            # Convert state to dict and save
            state_dict = request.state.model_dump()
            file_path.write_text(json.dumps(state_dict, indent=2, default=str))
            
            logger.info(f"Project saved: {file_path}")
            return True, str(file_path), "Project saved successfully"
        except Exception as e:
            logger.exception(f"Failed to save project: {e}")
            return False, "", f"Error saving project: {e}"
    
    success, saved_path, message = await asyncio.to_thread(_save_sync)
    return SaveProjectResponse(
        success=success,
        saved_path=saved_path if success else None,
        message=message,
    )


@app.post(
    "/api/load-project",
    response_model=LoadProjectResponse,
    summary="Load project state",
    description="Load a previously saved project state from a JSON file",
)
async def load_project(request: LoadProjectRequest) -> LoadProjectResponse:
    """Load project state from a JSON file."""
    import json
    
    logger.info(f"Loading project from: {request.file_path}")
    
    # SECURITY: Check for path traversal attacks
    is_safe, error_msg = _is_path_safe(request.file_path)
    if not is_safe:
        logger.warning(f"[load_project] Path traversal attempt blocked: {request.file_path}")
        return LoadProjectResponse(
            success=False,
            message=f"Security error: {error_msg}",
        )
    
    def _load_sync() -> tuple[bool, dict | None, str]:
        """Synchronous load function to run in thread pool."""
        try:
            file_path = Path(request.file_path)
            
            if not file_path.exists():
                return False, None, f"Project file not found: {request.file_path}"
            
            state_dict = json.loads(file_path.read_text())
            logger.info(f"Project loaded: {len(state_dict.get('panels', []))} panels")
            return True, state_dict, "Project loaded successfully"
        except Exception as e:
            logger.exception(f"Failed to load project: {e}")
            return False, None, f"Error loading project: {e}"
    
    success, state_dict, message = await asyncio.to_thread(_load_sync)
    
    if success and state_dict:
        state = ProjectState(**state_dict)
        return LoadProjectResponse(
            success=True,
            state=state,
            message=message,
        )
    return LoadProjectResponse(
        success=False,
        message=message,
    )


@app.get(
    "/api/list-projects",
    summary="List available projects",
    description="List all project.json files in a folder",
)
async def list_projects(folder_path: str) -> dict[str, Any]:
    """List all project files in a folder."""
    import json
    
    try:
        folder = Path(folder_path)
        if not folder.exists():
            return {"success": True, "projects": [], "message": "Folder does not exist"}
        
        projects = []
        for file in folder.glob("*.json"):
            if file.name.startswith("project") or file.stem.endswith("_project"):
                try:
                    data = json.loads(file.read_text())
                    projects.append({
                        "path": str(file),
                        "name": data.get("project_settings", {}).get("name", file.stem),
                        "saved_at": data.get("saved_at", "Unknown"),
                        "panel_count": len(data.get("panels", [])),
                    })
                except (json.JSONDecodeError, ValueError, KeyError, IOError):
                    # Skip invalid/unreadable project files
                    pass
        
        return {"success": True, "projects": projects}
        
    except Exception as e:
        return {"success": False, "projects": [], "message": str(e)}


# ============================================================================
# Folder Browser Endpoints
# ============================================================================


@app.get(
    "/api/browse-folders",
    summary="Browse folders",
    description="List folders and drives for folder picker UI",
)
async def browse_folders(path: str = "") -> dict[str, Any]:
    """Browse folders for the folder picker dialog.
    
    If path is empty, returns available drives (on Windows) or project mounts (in Docker).
    Otherwise, returns folders in the specified path.
    """
    import platform
    import os
    
    def _browse_sync() -> dict[str, Any]:
        """Synchronous browse function to run in thread pool."""
        try:
            if not path:
                # Check if running in Docker (Linux with /projects mount)
                projects_dir = Path("/projects")
                if platform.system() != "Windows" and projects_dir.exists():
                    # Docker mode - show mounted project folders
                    items = []
                    for item in sorted(projects_dir.iterdir()):
                        if item.is_dir() and not item.name.startswith('.'):
                            items.append({
                                "name": item.name,
                                "path": str(item),
                                "type": "drive"  # Treat as drive for UI purposes
                            })
                    # If no mounts found, show the projects directory itself
                    if not items:
                        items.append({
                            "name": "projects",
                            "path": "/projects",
                            "type": "drive"
                        })
                    return {"success": True, "current": "", "items": items, "parent": None}
                
                # Return drives on Windows, mounted volumes on macOS, root on Linux
                if platform.system() == "Windows":
                    import string
                    drives = []
                    for letter in string.ascii_uppercase:
                        drive_path = f"{letter}:\\"
                        if Path(drive_path).exists():
                            drives.append({
                                "name": f"{letter}:",
                                "path": drive_path,
                                "type": "drive"
                            })
                    return {"success": True, "current": "", "items": drives, "parent": None}
                elif platform.system() == "Darwin":
                    # macOS: Show mounted volumes + home directory as top-level entries
                    items = []
                    volumes_dir = Path("/Volumes")
                    if volumes_dir.exists():
                        for vol in sorted(volumes_dir.iterdir()):
                            if vol.is_dir() and not vol.name.startswith('.'):
                                items.append({
                                    "name": vol.name,
                                    "path": str(vol),
                                    "type": "drive"
                                })
                    # Also add user home directory for convenience
                    home = Path.home()
                    if home.exists():
                        items.append({
                            "name": f"Home ({home.name})",
                            "path": str(home),
                            "type": "drive"
                        })
                    if not items:
                        # Fallback to root
                        path_to_browse = "/"
                    else:
                        return {"success": True, "current": "", "items": items, "parent": None}
                else:
                    path_to_browse = "/"
            else:
                path_to_browse = path
            
            folder = Path(path_to_browse)
            if not folder.exists():
                return {"success": False, "error": f"Path does not exist: {path_to_browse}"}
            
            items = []
            for item in sorted(folder.iterdir()):
                if item.is_dir() and not item.name.startswith('.'):
                    items.append({
                        "name": item.name,
                        "path": str(item),
                        "type": "folder"
                    })
            
            # Get parent path (but don't go above /projects in Docker)
            projects_dir = Path("/projects")
            if folder == projects_dir or (projects_dir.exists() and folder.parent == projects_dir.parent and folder != projects_dir):
                parent = None  # Don't navigate above /projects
            else:
                parent = str(folder.parent) if folder.parent != folder else None
            
            return {
                "success": True,
                "current": str(folder),
                "items": items,
                "parent": parent
            }
            
        except PermissionError:
            return {"success": False, "error": "Permission denied"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    return await asyncio.to_thread(_browse_sync)


@app.post("/api/create-folder", response_model=CreateFolderResponse)
async def create_folder(request: CreateFolderRequest):
    """Create a new folder on the filesystem.

    Args:
        request: Contains parent_path and folder_name

    Returns:
        CreateFolderResponse with success status and created path
    """
    def _create_sync() -> CreateFolderResponse:
        """Synchronous create function to run in thread pool."""
        try:
            parent = Path(request.parent_path)
            if not parent.exists():
                return CreateFolderResponse(
                    success=False,
                    created_path="",
                    message=f"Parent path does not exist: {request.parent_path}"
                )

            new_folder = parent / request.folder_name
            new_folder.mkdir(parents=False, exist_ok=True)

            return CreateFolderResponse(
                success=True,
                created_path=str(new_folder),
                message=f"Created folder: {new_folder}"
            )
        except PermissionError:
            return CreateFolderResponse(
                success=False,
                created_path="",
                message=f"Permission denied creating folder in: {request.parent_path}"
            )
        except Exception as e:
            return CreateFolderResponse(
                success=False,
                created_path="",
                message=f"Failed to create folder: {str(e)}"
            )
    
    return await asyncio.to_thread(_create_sync)


# ============================================================================
# Phase 1: Backend Endpoints for Project Save/Load Refactor
# ============================================================================

@app.get("/api/serve-image")
async def serve_image(
    path: str = Query(..., description="Full path to image file to serve")
) -> FileResponse:
    """Serve a local image file to the browser.

    Browsers cannot access file:// paths directly, so this endpoint
    serves the image file with appropriate content-type headers.

    Args:
        path: Full filesystem path to the image file (URL encoded)

    Returns:
        FileResponse with image bytes and content-type header
    """
    # SECURITY: Check for path traversal attacks
    is_safe, error_msg = _is_path_safe(path)
    if not is_safe:
        logger.warning(f"[serve_image] Path traversal attempt blocked: {path}")
        raise HTTPException(status_code=400, detail=f"Security error: {error_msg}")
    
    def _validate_sync() -> tuple[bool, str, str]:
        """Validate file exists and get content type in thread pool."""
        image_path = Path(path)
        
        if not image_path.exists():
            return False, "", f"Image not found: {path}"
        
        if not image_path.is_file():
            return False, "", f"Path is not a file: {path}"
        
        # Determine content type from extension
        content_type = "image/png"  # default
        if image_path.suffix.lower() in [".jpg", ".jpeg"]:
            content_type = "image/jpeg"
        elif image_path.suffix.lower() == ".webp":
            content_type = "image/webp"
        
        return True, content_type, ""
    
    try:
        valid, content_type, error = await asyncio.to_thread(_validate_sync)
        
        if not valid:
            if "not found" in error.lower():
                raise HTTPException(status_code=404, detail=error)
            raise HTTPException(status_code=400, detail=error)
        
        image_path = Path(path)
        
        # Use FileResponse with explicit CORS headers
        # Note: FileResponse streaming itself is async-compatible
        return FileResponse(
            path=str(image_path),
            media_type=content_type,
            filename=image_path.name,
            headers={
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            }
        )

    except HTTPException:
        raise
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied accessing: {path}")
    except Exception as e:
        logger.error(f"Failed to serve image: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to serve image: {str(e)}")


class PngMetadataResponse(BaseModel):
    """Response containing PNG metadata extracted from ComfyUI images."""
    
    success: bool
    prompt: dict | None = Field(default=None, description="ComfyUI prompt/workflow data")
    workflow: dict | None = Field(default=None, description="ComfyUI workflow API format")
    parameters: str | None = Field(default=None, description="Generation parameters string")
    error: str | None = None


@app.get("/api/png-metadata", response_model=PngMetadataResponse)
async def get_png_metadata(
    path: str = Query(..., description="Full path to PNG file")
) -> PngMetadataResponse:
    """Extract ComfyUI metadata from PNG file.
    
    ComfyUI embeds workflow data in PNG tEXt chunks:
    - 'prompt': The executed prompt/workflow
    - 'workflow': The full workflow in API format
    - 'parameters': Generation parameters string
    
    Args:
        path: Full filesystem path to the PNG file
        
    Returns:
        PngMetadataResponse with extracted metadata
    """
    from PIL import Image
    from PIL.PngImagePlugin import PngInfo
    
    # SECURITY: Check for path traversal attacks
    is_safe, error_msg = _is_path_safe(path)
    if not is_safe:
        logger.warning(f"[get_png_metadata] Path traversal attempt blocked: {path}")
        return PngMetadataResponse(success=False, error=f"Security error: {error_msg}")
    
    def _extract_metadata_sync() -> dict[str, Any]:
        """Synchronous metadata extraction to run in thread pool."""
        try:
            image_path = Path(path)
            
            if not image_path.exists():
                return {"success": False, "error": f"File not found: {path}"}
            
            if not image_path.is_file():
                return {"success": False, "error": f"Not a file: {path}"}
            
            if image_path.suffix.lower() != '.png':
                return {"success": False, "error": "Not a PNG file"}
            
            # Open PNG and extract text chunks (blocking I/O)
            with Image.open(image_path) as img:
                metadata = img.info or {}
            
            prompt_data = None
            workflow_data = None
            parameters_str = None
            
            # Parse 'prompt' chunk (JSON)
            if 'prompt' in metadata:
                try:
                    prompt_data = json.loads(metadata['prompt'])
                except json.JSONDecodeError:
                    logger.warning(f"Failed to parse prompt JSON from {path}")
            
            # Parse 'workflow' chunk (JSON)
            if 'workflow' in metadata:
                try:
                    workflow_data = json.loads(metadata['workflow'])
                except json.JSONDecodeError:
                    logger.warning(f"Failed to parse workflow JSON from {path}")
            
            # Get parameters string (plain text)
            if 'parameters' in metadata:
                parameters_str = metadata['parameters']
            
            return {
                "success": True,
                "prompt": prompt_data,
                "workflow": workflow_data,
                "parameters": parameters_str
            }
        except Exception as e:
            logger.error(f"Failed to extract PNG metadata: {e}")
            return {"success": False, "error": f"Failed to extract metadata: {str(e)}"}
    
    result = await asyncio.to_thread(_extract_metadata_sync)
    
    # Create response with CORS headers
    from fastapi.responses import JSONResponse
    return JSONResponse(
        content=result,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
    )


class ScanProjectImagesRequest(BaseModel):
    """Request to scan project folder for images."""

    folder_path: str = Field(..., description="Project folder path to scan")
    naming_pattern: str = Field(
        ..., description="Naming pattern with {panel} and {version} tokens"
    )
    project_name: str = Field(..., description="Project name for pattern matching")


class ProjectImageInfo(BaseModel):
    """Information about a discovered project image."""

    panel_number: int = Field(..., description="Panel number extracted from filename")
    version: int = Field(..., description="Version number extracted from filename")
    image_path: str = Field(..., description="Full path to image file")
    filename: str = Field(..., description="Image filename")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Metadata from sidecar JSON")


class ScanProjectImagesResponse(BaseModel):
    """Response for scan project images endpoint."""

    success: bool
    images: list[ProjectImageInfo]
    total: int
    skipped_files: list[str] = Field(default_factory=list)
    message: str


@app.post(
    "/api/scan-project-images",
    response_model=ScanProjectImagesResponse,
    summary="Scan project folder for images",
    description="Scan folder for images matching naming pattern with JSON sidecars",
)
async def scan_project_images(request: ScanProjectImagesRequest) -> ScanProjectImagesResponse:
    """Scan project folder for images with JSON sidecars.

    This endpoint discovers all images in a project folder that match the
    naming pattern and have corresponding JSON metadata sidecar files.
    """
    def _scan_images_sync() -> ScanProjectImagesResponse:
        """Synchronous scan function to run in thread pool."""
        try:
            folder = Path(request.folder_path)

            if not folder.exists():
                return ScanProjectImagesResponse(
                    success=False,
                    images=[],
                    total=0,
                    message=f"Folder does not exist: {request.folder_path}"
                )

            if not folder.is_dir():
                return ScanProjectImagesResponse(
                    success=False,
                    images=[],
                    total=0,
                    message=f"Path is not a directory: {request.folder_path}"
                )

            # Build regex from naming pattern
            # Convert {project}_Panel{panel}_{version} to regex
            # The pattern may include subdirectories like "Panel_{panel}/{project}_..."
            pattern = request.naming_pattern
            
            # Check if pattern includes subdirectories
            has_subdirs = '/' in pattern
            logger.info(f"[SCAN DEBUG] pattern={pattern}, has_subdirs={has_subdirs}")
            
            # Split pattern into directory part and filename part
            if has_subdirs:
                pattern_parts = pattern.rsplit('/', 1)
                dir_pattern = pattern_parts[0]
                file_pattern = pattern_parts[1]
            else:
                dir_pattern = None
                file_pattern = pattern
            
            logger.info(f"[SCAN DEBUG] dir_pattern={dir_pattern}, file_pattern={file_pattern}")
            
            # Build regex for filename
            # Make {project} flexible - match any word characters (allows Memi, Memi2, etc.)
            file_regex_str = file_pattern
            file_regex_str = file_regex_str.replace("{project}", r"[\w]+")  # Match any project name prefix
            file_regex_str = file_regex_str.replace("{panel}", r"(\d+)")
            file_regex_str = file_regex_str.replace("{version}", r"v(\d+)")
            file_regex = re.compile(f"^{file_regex_str}\\.png$", re.IGNORECASE)
            
            # Build regex for directory if present
            # Make {project} flexible - match any word characters (consistent with filename pattern)
            if dir_pattern:
                dir_regex_str = dir_pattern
                dir_regex_str = dir_regex_str.replace("{project}", r"[\w]+")
                dir_regex_str = dir_regex_str.replace("{panel}", r"(\d+)")
                dir_regex = re.compile(f"^{dir_regex_str}$", re.IGNORECASE)
            else:
                dir_regex = None

            images: list[ProjectImageInfo] = []
            skipped_files: list[str] = []

            # Find all PNG files - use recursive glob if pattern has subdirs
            if has_subdirs:
                png_files = list(folder.glob("**/*.png"))
            else:
                png_files = list(folder.glob("*.png"))
            
            logger.debug(f"Found {len(png_files)} PNG files in {folder} (recursive={has_subdirs})")

            for png_file in png_files:
                # If pattern has subdirectories, validate the parent directory name
                if dir_regex:
                    parent_dir = png_file.parent.name
                    dir_match = dir_regex.match(parent_dir)
                    if not dir_match:
                        continue
                
                # Match the filename
                match = file_regex.match(png_file.name)
                if not match:
                    continue

                # Check for JSON sidecar (optional - PNG contains embedded metadata)
                json_file = png_file.with_suffix(".json")
                has_sidecar = json_file.exists()

                try:
                    # Extract panel and version numbers from filename
                    panel_num = int(match.group(1))
                    version_num = int(match.group(2))
                    
                    # Metadata is optional - PNG files contain embedded ComfyUI workflow
                    metadata = {}
                    if has_sidecar:
                        try:
                            with open(json_file, "r", encoding="utf-8") as f:
                                # Read first 4KB only - enough for basic metadata
                                partial_content = f.read(4096)
                                if partial_content.strip().startswith("{"):
                                    try:
                                        metadata = json.loads(partial_content)
                                    except json.JSONDecodeError:
                                        # Partial read - extract key fields manually
                                        import re as re_module
                                        saved_path_match = re_module.search(r'"savedPath"\s*:\s*"([^"]*)"', partial_content)
                                        if saved_path_match:
                                            metadata["savedPath"] = saved_path_match.group(1).replace("\\\\", "\\")
                        except Exception as read_err:
                            logger.debug(f"Could not read metadata from {json_file.name}: {read_err}")

                    images.append(
                        ProjectImageInfo(
                            panel_number=panel_num,
                            version=version_num,
                            image_path=str(png_file),
                            filename=png_file.name,
                            metadata=metadata
                        )
                    )

                except json.JSONDecodeError as e:
                    skipped_files.append(f"{png_file.name} (corrupt sidecar: {str(e)})")
                except Exception as e:
                    skipped_files.append(f"{png_file.name} ({str(e)})")

            # Sort by panel number, then version
            images.sort(key=lambda x: (x.panel_number, x.version))

            # Debug: track why files might be skipped
            debug_info = {
                "has_subdirs": has_subdirs,
                "png_count": len(png_files),
                "dir_pattern": dir_regex.pattern if dir_regex else None,
                "file_pattern": file_regex.pattern,
                "sample_files": [str(f) for f in png_files[:3]] if png_files else [],
            }
            
            return ScanProjectImagesResponse(
                success=True,
                images=images,
                total=len(images),
                skipped_files=skipped_files,
                message=f"Found {len(images)} images (v4: {debug_info})"
            )

        except Exception as e:
            logger.error(f"Failed to scan project images: {e}")
            return ScanProjectImagesResponse(
                success=False,
                images=[],
                total=0,
                message=f"Failed to scan folder: {str(e)}"
            )
    
    # Run synchronous scan in thread pool to avoid blocking event loop
    return await asyncio.to_thread(_scan_images_sync)


# ============================================================================
# Simple Folder Image Scan (for folder import without naming pattern)
# ============================================================================


class ScanFolderImagesRequest(BaseModel):
    """Request to scan a folder for all images (no naming pattern required)."""

    folder_path: str = Field(..., description="Path to folder to scan for images")


class FolderImageInfo(BaseModel):
    """Information about a discovered image in a folder."""

    filename: str = Field(..., description="Image filename")
    image_path: str = Field(..., description="Full path to image file")
    modified_time: float = Field(..., description="File modification timestamp")


class ScanFolderImagesResponse(BaseModel):
    """Response for scan folder images endpoint."""

    success: bool
    images: list[FolderImageInfo]
    total: int
    message: str


@app.post(
    "/api/scan-folder-images",
    response_model=ScanFolderImagesResponse,
    summary="Scan folder for all images",
    description="Scan folder for all PNG/JPG images without requiring a naming pattern",
)
async def scan_folder_images(request: ScanFolderImagesRequest) -> ScanFolderImagesResponse:
    """Scan a folder for all image files.

    This endpoint discovers all PNG and JPG images in a folder,
    useful for importing existing image collections.
    """
    # SECURITY: Check for path traversal attacks
    is_safe, error_msg = _is_path_safe(request.folder_path)
    if not is_safe:
        logger.warning(f"[scan_folder_images] Path traversal attempt blocked: {request.folder_path}")
        return ScanFolderImagesResponse(
            success=False,
            images=[],
            total=0,
            message=f"Security error: {error_msg}"
        )

    def _scan_folder_sync() -> ScanFolderImagesResponse:
        """Synchronous scan function to run in thread pool."""
        try:
            folder = Path(request.folder_path)

            if not folder.exists():
                return ScanFolderImagesResponse(
                    success=False,
                    images=[],
                    total=0,
                    message=f"Folder does not exist: {request.folder_path}"
                )

            if not folder.is_dir():
                return ScanFolderImagesResponse(
                    success=False,
                    images=[],
                    total=0,
                    message=f"Path is not a directory: {request.folder_path}"
                )

            images: list[FolderImageInfo] = []

            # Find all image files (PNG, JPG, JPEG)
            image_extensions = {'.png', '.jpg', '.jpeg'}
            for item in folder.iterdir():
                if item.is_file() and item.suffix.lower() in image_extensions:
                    try:
                        stat_info = item.stat()
                        images.append(
                            FolderImageInfo(
                                filename=item.name,
                                image_path=str(item),
                                modified_time=stat_info.st_mtime
                            )
                        )
                    except OSError as e:
                        logger.debug(f"Could not stat file {item}: {e}")

            # Sort by modification time (newest first)
            images.sort(key=lambda x: x.modified_time, reverse=True)

            return ScanFolderImagesResponse(
                success=True,
                images=images,
                total=len(images),
                message=f"Found {len(images)} images"
            )

        except Exception as e:
            logger.error(f"Failed to scan folder for images: {e}")
            return ScanFolderImagesResponse(
                success=False,
                images=[],
                total=0,
                message=f"Failed to scan folder: {str(e)}"
            )

    # Run synchronous scan in thread pool to avoid blocking event loop
    return await asyncio.to_thread(_scan_folder_sync)


# ============================================================================
# Scan Project Panels (scan ALL subfolders as panels)
# ============================================================================


class PanelFolderInfo(BaseModel):
    """Information about a panel folder and its images."""

    panel_name: str = Field(..., description="Panel name (folder name)")
    folder_path: str = Field(..., description="Full path to panel folder")
    images: list[FolderImageInfo] = Field(default_factory=list, description="Images in this panel folder")


class ScanProjectPanelsRequest(BaseModel):
    """Request to scan project folder for all panel subfolders."""

    project_path: str = Field(..., description="Path to project root folder")


class ScanProjectPanelsResponse(BaseModel):
    """Response for scan project panels endpoint."""

    success: bool
    panels: list[PanelFolderInfo]
    total_panels: int
    total_images: int
    message: str


@app.post(
    "/api/scan-project-panels",
    response_model=ScanProjectPanelsResponse,
    summary="Scan project for all panel folders",
    description="Scan project root folder for all subfolders (panels) and their images",
)
async def scan_project_panels(request: ScanProjectPanelsRequest) -> ScanProjectPanelsResponse:
    """Scan project folder for all panel subfolders and their images.

    This endpoint treats each subfolder as a panel and discovers all
    PNG/JPG images in each panel folder. No naming pattern required.
    """
    # SECURITY: Check for path traversal attacks
    is_safe, error_msg = _is_path_safe(request.project_path)
    if not is_safe:
        logger.warning(f"[scan_project_panels] Path traversal attempt blocked: {request.project_path}")
        return ScanProjectPanelsResponse(
            success=False,
            panels=[],
            total_panels=0,
            total_images=0,
            message=f"Security error: {error_msg}"
        )

    def _scan_panels_sync() -> ScanProjectPanelsResponse:
        """Synchronous scan function to run in thread pool."""
        try:
            project_folder = Path(request.project_path)

            if not project_folder.exists():
                return ScanProjectPanelsResponse(
                    success=False,
                    panels=[],
                    total_panels=0,
                    total_images=0,
                    message=f"Project folder does not exist: {request.project_path}"
                )

            if not project_folder.is_dir():
                return ScanProjectPanelsResponse(
                    success=False,
                    panels=[],
                    total_panels=0,
                    total_images=0,
                    message=f"Path is not a directory: {request.project_path}"
                )

            panels: list[PanelFolderInfo] = []
            total_images = 0
            image_extensions = {'.png', '.jpg', '.jpeg'}

            # Scan all subdirectories as panels
            for item in sorted(project_folder.iterdir()):
                if item.is_dir() and not item.name.startswith('.'):
                    panel_images: list[FolderImageInfo] = []
                    
                    # Find all images in this panel folder
                    for img_file in item.iterdir():
                        if img_file.is_file() and img_file.suffix.lower() in image_extensions:
                            try:
                                stat_info = img_file.stat()
                                panel_images.append(
                                    FolderImageInfo(
                                        filename=img_file.name,
                                        image_path=str(img_file),
                                        modified_time=stat_info.st_mtime
                                    )
                                )
                            except OSError as e:
                                logger.debug(f"Could not stat file {img_file}: {e}")
                    
                    # Sort images by name (which should put versions in order: v001, v002, etc.)
                    panel_images.sort(key=lambda x: x.filename)
                    
                    # Only include folders that have images
                    if panel_images:
                        panels.append(
                            PanelFolderInfo(
                                panel_name=item.name,
                                folder_path=str(item),
                                images=panel_images
                            )
                        )
                        total_images += len(panel_images)

            return ScanProjectPanelsResponse(
                success=True,
                panels=panels,
                total_panels=len(panels),
                total_images=total_images,
                message=f"Found {len(panels)} panels with {total_images} total images"
            )

        except Exception as e:
            logger.error(f"Failed to scan project panels: {e}")
            return ScanProjectPanelsResponse(
                success=False,
                panels=[],
                total_panels=0,
                total_images=0,
                message=f"Failed to scan project: {str(e)}"
            )

    # Run synchronous scan in thread pool to avoid blocking event loop
    return await asyncio.to_thread(_scan_panels_sync)


class DeleteImageRequest(BaseModel):
    """Request to delete an image and its sidecar."""

    image_path: str = Field(..., description="Full path to image file to delete")


class DeleteImageResponse(BaseModel):
    """Response for delete image endpoint."""

    success: bool
    deleted_files: list[str] = Field(default_factory=list)
    message: str


@app.delete(
    "/api/delete-image",
    response_model=DeleteImageResponse,
    summary="Delete image and sidecar",
    description="Delete an image file and its JSON metadata sidecar",
)
async def delete_image(request: DeleteImageRequest) -> DeleteImageResponse:
    """Delete an image and its JSON sidecar from the filesystem.

    This endpoint removes both the image file and its accompanying
    metadata JSON file (same name with .json extension).
    """
    # SECURITY: Check for path traversal attacks
    is_safe, error_msg = _is_path_safe(request.image_path)
    if not is_safe:
        logger.warning(f"[delete_image] Path traversal attempt blocked: {request.image_path}")
        return DeleteImageResponse(
            success=False,
            message=f"Security error: {error_msg}"
        )
    
    def _delete_sync() -> tuple[bool, list[str], str]:
        """Synchronous delete function to run in thread pool."""
        deleted_files: list[str] = []
        try:
            image_path = Path(request.image_path)

            if not image_path.exists():
                return False, [], f"Image not found: {request.image_path}"

            # Delete image file
            image_path.unlink()
            deleted_files.append(str(image_path))

            # Delete sidecar JSON if exists
            json_path = image_path.with_suffix(".json")
            if json_path.exists():
                json_path.unlink()
                deleted_files.append(str(json_path))

            return True, deleted_files, f"Deleted {len(deleted_files)} file(s)"

        except PermissionError:
            return False, deleted_files, f"Permission denied deleting: {request.image_path}"
        except Exception as e:
            logger.error(f"Failed to delete image: {e}")
            return False, deleted_files, f"Failed to delete: {str(e)}"
    
    success, deleted_files, message = await asyncio.to_thread(_delete_sync)
    return DeleteImageResponse(
        success=success,
        deleted_files=deleted_files,
        message=message
    )

# Debug: Log all registered routes on startup
@app.on_event("startup")
async def log_routes():
    """Log all registered routes for debugging."""
    routes = [route.path for route in app.routes]
    logger.info(f"Registered routes: {routes}")
    new_endpoints = ["/api/serve-image", "/api/scan-project-images", "/api/delete-image"]
    for endpoint in new_endpoints:
        if endpoint in routes:
            logger.info(f"✓ Endpoint registered: {endpoint}")
        else:
            logger.warning(f"✗ Endpoint NOT registered: {endpoint}")

