"""Main entry point for Orchestrator API Server.

This module starts the Orchestrator API server with full JobManager and
BackendManager integration, enabling external clients to submit workflows
and query backend status.

Features:
- Full JobManager integration for real workflow execution
- BackendManager for render node status queries
- Health monitoring for all backends
- Metrics collection via WebSocket (CrysTools/KayTools)
- Inbox folder watchdog for manifest-based job submission
- Comprehensive logging

Usage:
    python -m orchestrator.api_server_main

Environment Variables:
    ORCHESTRATOR_CONFIG: Path to config.yaml (default: ./config.yaml)
    ORCHESTRATOR_PORT: API server port (default: 8020)
    ORCHESTRATOR_HOST: API server host (default: 0.0.0.0)
    ORCHESTRATOR_INBOX: Path to Inbox folder for watchdog (optional)
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

# Add DirectorsConsole to path if needed
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

logger = logging.getLogger(__name__)


async def main() -> None:
    """Main entry point for API server."""
    import uvicorn
    from orchestrator.api.server import (
        app,
        set_backend_manager,
        set_job_manager,
        set_parallel_job_manager,
    )
    from orchestrator.backends.client import ComfyUIClient
    from orchestrator.backends.health_monitor import HealthMonitor
    from orchestrator.backends.manager import BackendManager
    from orchestrator.backends.metrics_ws import MetricsWebSocketManager
    from orchestrator.core.engine.job_manager import JobManager
    from orchestrator.core.engine.scheduler import Scheduler
    from orchestrator.core.models.backend import (
        BackendConfig as CoreBackendConfig,
    )
    from orchestrator.core.models.backend import BackendStatus
    from orchestrator.core.storage.workflow_storage import WorkflowStorage
    from orchestrator.storage.repositories.job_repo import JobRepository
    from orchestrator.utils.config import load_config
    from orchestrator.utils.logging_config import setup_logging
    from datetime import datetime, timezone

    # Load config
    config_path = Path(os.getenv("ORCHESTRATOR_CONFIG", "config.yaml"))
    if not config_path.exists():
        logger.error(f"Config file not found: {config_path}")
        logger.info("Looking for config.example.yaml...")
        config_path = Path("config.example.yaml")
        if not config_path.exists():
            logger.error("No config file found. Please create config.yaml")
            return

    config = load_config(config_path)
    setup_logging(config.log_dir)
    logger.info("=" * 80)
    logger.info("Director's Console Orchestrator API Server")
    logger.info("=" * 80)
    logger.info(f"Config: {config_path}")
    logger.info(f"Data Dir: {config.data_dir}")
    logger.info(f"Log Dir: {config.log_dir}")
    logger.info(f"Backends: {len(config.backends)}")

    # Create backend manager and register backends
    backend_manager = BackendManager()
    for backend in config.backends:
        core_backend = CoreBackendConfig(
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
        from orchestrator.api.server import _add_allowed_host
        _add_allowed_host(backend.host)
        logger.info(
            f"  - {backend.name} ({backend.host}:{backend.port}) "
            f"[{'enabled' if backend.enabled else 'disabled'}] (host added to SSRF allowlist)"
        )

    # Create health monitor
    health_monitor = HealthMonitor(
        manager=backend_manager,
        client_factory=lambda c: ComfyUIClient(c.host, c.port),
        collect_metrics=True,
    )

    # Create metrics WebSocket manager for real-time metrics
    def on_ws_metrics(backend_id: str, metrics):
        """Handle incoming WebSocket metrics from CrysTools/KayTools."""
        existing = backend_manager.get_status(backend_id)
        status = BackendStatus(
            backend_id=backend_id,
            online=True,
            last_seen=datetime.now(timezone.utc),
            queue_depth=existing.queue_depth if existing else 0,
            queue_pending=existing.queue_pending if existing else 0,
            queue_running=existing.queue_running if existing else 0,
            gpu_name=metrics.gpu_name
            or (existing.gpu_name if existing else "Unknown"),
            gpu_memory_total=metrics.gpu_vram_total
            or (existing.gpu_memory_total if existing else 0),
            gpu_memory_used=metrics.gpu_vram_used
            or (existing.gpu_memory_used if existing else 0),
            gpu_utilization=metrics.gpu_utilization,
            gpu_temperature=int(metrics.gpu_temperature),
            cpu_utilization=metrics.cpu_utilization,
            ram_total=metrics.ram_total or (existing.ram_total if existing else 0),
            ram_used=metrics.ram_used or (existing.ram_used if existing else 0),
        )
        backend_manager.update_status(backend_id, status)

    metrics_ws_manager = MetricsWebSocketManager(on_metrics=on_ws_metrics)

    # Start WebSocket connections for each backend
    for backend in config.backends:
        if backend.enabled:
            await metrics_ws_manager.add_backend(
                backend.id, backend.host, backend.port
            )
    logger.info(
        f"Started CrysTools/KayTools WebSocket for {len(config.backends)} backends"
    )

    # Create job manager
    workflow_storage = WorkflowStorage(config.data_dir)
    from orchestrator.storage.database import SQLiteDatabase
    db = SQLiteDatabase(config.database_path)
    job_repo = JobRepository(db=db)
    scheduler = Scheduler()
    
    # Register backends with scheduler
    for backend in config.backends:
        core_backend = CoreBackendConfig(
            id=backend.id,
            name=backend.name,
            host=backend.host,
            port=backend.port,
            enabled=backend.enabled,
            capabilities=backend.capabilities,
            max_concurrent_jobs=backend.max_concurrent_jobs,
            tags=backend.tags,
        )
        scheduler.register(core_backend)

    job_manager = JobManager(
        scheduler=scheduler,
        workflow_storage=workflow_storage,
        job_repo=job_repo,
        client_factory=lambda c: ComfyUIClient(c.host, c.port),
    )

    # Create parallel job manager for multi-node generation
    from orchestrator.core.parallel_job_manager import ParallelJobManager

    parallel_job_manager = ParallelJobManager(
        backend_manager=backend_manager,
        client_factory=lambda c: ComfyUIClient(c.host, c.port),
    )

    # Connect API to managers
    set_backend_manager(backend_manager)
    set_job_manager(job_manager)
    set_parallel_job_manager(parallel_job_manager)
    logger.info("API connected to JobManager, BackendManager, and ParallelJobManager")

    # Start health monitoring in background
    async def health_polling():
        """Background task for health monitoring."""
        while True:
            try:
                await health_monitor.poll_once()
            except Exception as e:
                logger.error(f"Health monitor error: {e}")
            await asyncio.sleep(5)  # Poll every 5 seconds

    asyncio.create_task(health_polling())
    logger.info("Health monitoring started (5s interval)")

    # Start Inbox watchdog if configured
    inbox_path = os.getenv("ORCHESTRATOR_INBOX")
    if inbox_path:
        from orchestrator.inbox_watchdog import InboxWatchdog

        inbox = InboxWatchdog(
            inbox_path=Path(inbox_path), job_manager=job_manager
        )
        await inbox.start()
        logger.info(f"Inbox watchdog started: {inbox_path}")
    else:
        logger.info("Inbox watchdog disabled (ORCHESTRATOR_INBOX not set)")

    # Get server config from environment
    host = os.getenv("ORCHESTRATOR_HOST", "0.0.0.0")
    port = int(os.getenv("ORCHESTRATOR_PORT", "8020"))

    logger.info("=" * 80)
    logger.info(f"Starting API server on {host}:{port}")
    logger.info("Endpoints:")
    logger.info(f"  - Health: http://{host}:{port}/health")
    logger.info(f"  - Backends: http://{host}:{port}/api/backends")
    logger.info(f"  - Submit Job: POST http://{host}:{port}/api/job")
    logger.info(f"  - Job Status: GET http://{host}:{port}/api/jobs/{{id}}")
    logger.info("=" * 80)

    # Configure uvicorn
    config_uvicorn = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_level="info",
        access_log=True,
    )
    server = uvicorn.Server(config_uvicorn)

    # Run server
    await server.serve()


if __name__ == "__main__":
    asyncio.run(main())
