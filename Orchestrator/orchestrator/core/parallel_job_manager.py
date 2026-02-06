"""Parallel job manager for multi-node generation.

This module manages job groups and coordinates parallel execution
across multiple ComfyUI backends with failure isolation.
"""

from __future__ import annotations

import asyncio
import uuid
from copy import deepcopy
from datetime import datetime
from typing import Any, Callable

import httpx
from loguru import logger

from orchestrator.backends.client import ComfyUIClient
from orchestrator.core.models.backend import BackendConfig
from orchestrator.core.models.job_group import (
    ChildJob,
    ChildJobStatus,
    JobGroup,
    JobGroupRequest,
    JobGroupStatus,
    SeedStrategy,
)
from orchestrator.core.seed_engine import SeedVariationEngine


class ParallelJobManager:
    """Manages parallel job execution across multiple backends.

    Key responsibilities:
    - Create job groups with unique seeds per backend
    - Dispatch jobs to backends in parallel
    - Track progress and collect results
    - Handle failures with isolation (one failure doesn't affect others)
    - Emit WebSocket events for streaming results

    Attributes:
        _backend_manager: Manager for backend/node access.
        _client_factory: Factory function for creating ComfyUI clients.
        _seed_engine: Engine for generating seed variations.
        _active_groups: Dictionary of active job groups by ID.
        _websocket_handlers: Dictionary of WebSocket handlers by group ID.
        _running_tasks: Dictionary of running tasks by job ID.
    """

    def __init__(
        self,
        backend_manager: Any,
        client_factory: Callable[[BackendConfig], ComfyUIClient] | None = None,
    ):
        """Initialize the parallel job manager.

        Args:
            backend_manager: Manager for accessing backend configurations.
            client_factory: Optional factory for creating ComfyUI clients.
        """
        self._backend_manager = backend_manager
        self._client_factory = client_factory or self._default_client_factory
        self._seed_engine = SeedVariationEngine()
        self._active_groups: dict[str, JobGroup] = {}
        self._websocket_handlers: dict[str, Callable[[dict], Any]] = {}
        self._running_tasks: dict[str, asyncio.Task] = {}

    def _default_client_factory(self, backend: BackendConfig) -> ComfyUIClient:
        """Create a default ComfyUI client for a backend.

        Args:
            backend: Backend configuration.

        Returns:
            Configured ComfyUI client.
        """
        return ComfyUIClient(backend.host, backend.port)

    async def submit_group(self, request: JobGroupRequest) -> JobGroup:
        """Create a job group and begin parallel execution.

        Args:
            request: Job group submission parameters.

        Returns:
            JobGroup with queued child jobs.

        Raises:
            ValueError: If no valid backends are available.
        """
        # Generate unique job group ID
        job_group_id = f"jg_{uuid.uuid4().hex[:12]}"

        # Validate backends - only check if backend exists and is enabled
        # Don't require health monitor to report "online" because:
        # 1. Frontend verifies connectivity via WebSocket before submission
        # 2. Job execution will fail gracefully if backend is unreachable
        # 3. Timeout protection handles unresponsive backends
        valid_backends = []
        for backend_id in request.backend_ids:
            backend = self._backend_manager.get(backend_id)
            if backend and backend.enabled:
                valid_backends.append(backend)
                status = self._backend_manager.get_status(backend_id)
                if status and not status.online:
                    logger.info(
                        f"Backend {backend_id} not marked online by health monitor, "
                        f"but allowing submission (frontend verified connectivity)"
                    )
            else:
                logger.warning(f"Backend {backend_id} not found or disabled, skipping")

        if not valid_backends:
            raise ValueError(
                "No valid backends available. Ensure backend IDs are correct and enabled in config."
            )

        # Generate seeds
        seeds = self._seed_engine.generate_seeds(
            count=len(valid_backends),
            strategy=request.seed_strategy,
            base_seed=request.base_seed,
        )

        # Create child jobs
        child_jobs = []
        for backend, seed in zip(valid_backends, seeds):
            child_job = ChildJob(
                job_id=f"j_{uuid.uuid4().hex[:8]}",
                backend_id=backend.id,
                seed=seed,
                status=ChildJobStatus.QUEUED,
            )
            child_jobs.append(child_job)

        # Create job group
        job_group = JobGroup(
            id=job_group_id,
            panel_id=request.metadata.get("panel_id"),
            workflow_json=request.workflow_json,
            parameters=request.parameters,
            seed_strategy=request.seed_strategy,
            base_seed=request.base_seed,
            child_jobs=child_jobs,
            status=JobGroupStatus.RUNNING,
            timeout_seconds=request.timeout_seconds,
            metadata=request.metadata,
        )

        self._active_groups[job_group_id] = job_group

        # Start parallel execution (fire and forget)
        asyncio.create_task(self._execute_group(job_group))

        logger.info(
            f"Created job group {job_group_id} with {len(child_jobs)} child jobs"
        )
        return job_group

    async def _execute_group(self, job_group: JobGroup) -> None:
        """Execute all child jobs in parallel with isolation.

        Args:
            job_group: The job group to execute.
        """
        tasks = []

        for child_job in job_group.child_jobs:
            task = asyncio.create_task(
                self._execute_child_job(job_group, child_job)
            )
            self._running_tasks[child_job.job_id] = task
            tasks.append(task)

        # Wait for all to complete (with individual exception handling)
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Log any unexpected exceptions
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Unexpected error in child job: {result}")

        # Update group status
        self._update_group_status(job_group)

        # Emit group complete event
        await self._emit_event(
            job_group.id,
            {
                "type": "group_complete",
                "job_group_id": job_group.id,
                "total": len(job_group.child_jobs),
                "succeeded": job_group.completed_count,
                "failed": job_group.failed_count,
                "results": [
                    {
                        "job_id": j.job_id,
                        "status": j.status.value,
                        "outputs": j.outputs
                        if j.status == ChildJobStatus.COMPLETED
                        else None,
                        "error": j.error_message
                        if j.status
                        in [ChildJobStatus.FAILED, ChildJobStatus.TIMEOUT]
                        else None,
                    }
                    for j in job_group.child_jobs
                ],
            },
        )

        logger.info(
            f"Job group {job_group.id} completed: "
            f"{job_group.completed_count}/{len(job_group.child_jobs)} succeeded"
        )

    async def _execute_child_job(
        self,
        job_group: JobGroup,
        child_job: ChildJob,
    ) -> None:
        """Execute a single child job with timeout and error handling.

        This method is designed for isolation - failures here don't propagate
        to other child jobs.

        Args:
            job_group: The parent job group.
            child_job: The child job to execute.
        """
        backend = self._backend_manager.get(child_job.backend_id)
        if not backend:
            child_job.status = ChildJobStatus.FAILED
            child_job.error_message = f"Backend {child_job.backend_id} not found"
            await self._emit_event(
                job_group.id,
                {
                    "type": "child_failed",
                    "job_id": child_job.job_id,
                    "backend_id": child_job.backend_id,
                    "error": child_job.error_message,
                },
            )
            return

        client = self._client_factory(backend)
        child_job.status = ChildJobStatus.RUNNING
        child_job.started_at = datetime.utcnow()

        try:
            # Patch seed into workflow
            patched_workflow = self._patch_seed(
                job_group.workflow_json,
                child_job.seed,
                job_group.parameters,
            )

            # Submit to ComfyUI with timeout
            async with asyncio.timeout(job_group.timeout_seconds):
                prompt_id = await client.queue_prompt(patched_workflow)
                logger.debug(
                    f"Child job {child_job.job_id} submitted to {backend.id}, "
                    f"prompt_id={prompt_id}"
                )

                # Monitor progress
                async for update in client.monitor_progress(prompt_id):
                    if update.percent is not None:
                        child_job.progress = update.percent
                    child_job.current_step = update.current_step

                    await self._emit_event(
                        job_group.id,
                        {
                            "type": "child_progress",
                            "job_id": child_job.job_id,
                            "backend_id": child_job.backend_id,
                            "progress": child_job.progress,
                            "current_step": child_job.current_step,
                        },
                    )

                # Get results
                history = await client.get_history(prompt_id)
                outputs = await self._collect_outputs(client, history, prompt_id)

                child_job.status = ChildJobStatus.COMPLETED
                child_job.completed_at = datetime.utcnow()
                child_job.outputs = outputs
                child_job.progress = 100.0

                # Emit completion event with outputs
                await self._emit_event(
                    job_group.id,
                    {
                        "type": "child_completed",
                        "job_id": child_job.job_id,
                        "backend_id": child_job.backend_id,
                        "seed": child_job.seed,
                        "outputs": outputs,
                        "completed_at": child_job.completed_at.isoformat(),
                    },
                )

                logger.info(
                    f"Child job {child_job.job_id} completed on {backend.id}"
                )

        except asyncio.TimeoutError:
            child_job.status = ChildJobStatus.TIMEOUT
            child_job.error_message = f"Timeout after {job_group.timeout_seconds}s"
            await self._emit_event(
                job_group.id,
                {
                    "type": "child_timeout",
                    "job_id": child_job.job_id,
                    "backend_id": child_job.backend_id,
                    "timeout_seconds": job_group.timeout_seconds,
                },
            )
            # Attempt to interrupt the backend
            try:
                await client.interrupt()
            except Exception as e:
                logger.debug(f"Failed to interrupt backend: {e}")

        except asyncio.CancelledError:
            child_job.status = ChildJobStatus.CANCELLED
            await self._emit_event(
                job_group.id,
                {
                    "type": "child_cancelled",
                    "job_id": child_job.job_id,
                    "backend_id": child_job.backend_id,
                },
            )
            raise

        except Exception as e:
            child_job.status = ChildJobStatus.FAILED
            child_job.error_message = str(e)
            child_job.error_type = type(e).__name__
            logger.error(f"Child job {child_job.job_id} failed: {e}")

            await self._emit_event(
                job_group.id,
                {
                    "type": "child_failed",
                    "job_id": child_job.job_id,
                    "backend_id": child_job.backend_id,
                    "error": str(e),
                    "error_type": type(e).__name__,
                },
            )

        finally:
            self._running_tasks.pop(child_job.job_id, None)
            try:
                await client.close()
            except (httpx.HTTPError, asyncio.CancelledError, OSError):
                # Ignore errors during cleanup
                pass

    def _patch_seed(
        self,
        workflow: dict[str, Any],
        seed: int,
        parameters: dict[str, Any],
    ) -> dict[str, Any]:
        """Patch seed into workflow, respecting any parameter overrides.

        Args:
            workflow: Original workflow JSON.
            seed: Seed value to apply.
            parameters: Additional parameters to patch.

        Returns:
            Patched workflow with seed applied.
        """
        patched = deepcopy(workflow)

        # Apply general parameters first if parameter patcher is available
        try:
            from orchestrator.core.engine.parameter_patcher import (
                patch_parameters,
            )

            patched = patch_parameters(patched, [], parameters)
        except ImportError:
            # If patcher not available, manually apply parameters
            for key, value in parameters.items():
                if key == "seed":
                    continue  # Will be handled below
                # Try to find and patch common parameter locations
                for node_data in patched.values():
                    if not isinstance(node_data, dict):
                        continue
                    inputs = node_data.get("inputs", {})
                    if key in inputs:
                        inputs[key] = value

        # Then override seed in all KSampler nodes
        for node_data in patched.values():
            if not isinstance(node_data, dict):
                continue
            class_type = node_data.get("class_type", "")
            if isinstance(class_type, str) and (
                "sampler" in class_type.lower()
                or "ksampler" in class_type.lower()
            ):
                inputs = node_data.get("inputs", {})
                if "seed" in inputs:
                    inputs["seed"] = seed

        return patched

    async def _collect_outputs(
        self,
        client: ComfyUIClient,
        history: dict,
        prompt_id: str,
    ) -> dict[str, Any]:
        """Collect outputs from completed job.

        Args:
            client: ComfyUI client.
            history: Job execution history.
            prompt_id: The prompt ID.

        Returns:
            Dictionary with outputs including images.
        """
        outputs_list = client.download_outputs(history)

        images = []
        for output in outputs_list:
            images.append(
                {
                    "filename": output.filename,
                    "subfolder": output.subfolder,
                    "type": output.image_type,
                    "url": f"{client._base_url}/view?"
                    f"filename={output.filename}"
                    f"&subfolder={output.subfolder}"
                    f"&type={output.image_type}",
                }
            )

        return {"images": images, "prompt_id": prompt_id}

    def _update_group_status(self, job_group: JobGroup) -> None:
        """Update the overall group status based on child job states.

        Args:
            job_group: Job group to update.
        """
        completed = job_group.completed_count
        failed = job_group.failed_count
        total = len(job_group.child_jobs)

        if completed == total:
            job_group.status = JobGroupStatus.COMPLETED
        elif failed == total:
            job_group.status = JobGroupStatus.FAILED
        elif completed + failed == total:
            job_group.status = JobGroupStatus.PARTIAL_COMPLETE
        else:
            job_group.status = JobGroupStatus.RUNNING

        if job_group.status in [
            JobGroupStatus.COMPLETED,
            JobGroupStatus.FAILED,
            JobGroupStatus.PARTIAL_COMPLETE,
        ]:
            job_group.completed_at = datetime.utcnow()

    async def cancel_group(self, group_id: str) -> dict[str, int]:
        """Cancel all running jobs in a group.

        Args:
            group_id: ID of the job group to cancel.

        Returns:
            Dictionary with counts of interrupted and already complete jobs.

        Raises:
            ValueError: If job group not found.
        """
        job_group = self._active_groups.get(group_id)
        if not job_group:
            raise ValueError(f"Job group {group_id} not found")

        interrupted = 0
        already_complete = 0

        for child_job in job_group.child_jobs:
            if child_job.status in [
                ChildJobStatus.COMPLETED,
                ChildJobStatus.FAILED,
                ChildJobStatus.TIMEOUT,
            ]:
                already_complete += 1
                continue

            task = self._running_tasks.get(child_job.job_id)
            if task:
                task.cancel()
                interrupted += 1

        job_group.status = JobGroupStatus.CANCELLED
        logger.info(
            f"Cancelled job group {group_id}: "
            f"{interrupted} interrupted, {already_complete} already complete"
        )

        return {"interrupted": interrupted, "already_complete": already_complete}

    def register_websocket_handler(
        self,
        job_group_id: str,
        handler: Callable[[dict], Any],
    ) -> None:
        """Register a WebSocket handler for streaming events.

        Args:
            job_group_id: ID of the job group.
            handler: Async function to handle events.
        """
        self._websocket_handlers[job_group_id] = handler

    def unregister_websocket_handler(self, job_group_id: str) -> None:
        """Unregister a WebSocket handler.

        Args:
            job_group_id: ID of the job group.
        """
        self._websocket_handlers.pop(job_group_id, None)

    async def _emit_event(self, job_group_id: str, event: dict) -> None:
        """Emit an event to registered WebSocket handlers.

        Args:
            job_group_id: ID of the job group.
            event: Event data to emit.
        """
        handler = self._websocket_handlers.get(job_group_id)
        if handler:
            try:
                await handler(event)
            except Exception as e:
                logger.error(f"Error emitting event: {e}")

    def get_group(self, group_id: str) -> JobGroup | None:
        """Get a job group by ID.

        Args:
            group_id: ID of the job group.

        Returns:
            The job group if found, None otherwise.
        """
        return self._active_groups.get(group_id)
