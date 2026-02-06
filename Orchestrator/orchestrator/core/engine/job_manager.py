from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import os
from pathlib import Path
import shutil
import tempfile
import traceback
import uuid
from typing import Any, Callable, Protocol
import asyncio
import time

import httpx
import logging

logger = logging.getLogger(__name__)

from orchestrator.backends.client import ComfyUIClient, ProgressUpdate
from orchestrator.core.conditions.evaluator import ConditionEvaluator
from orchestrator.core.engine.graph_executor import GraphExecutor
from orchestrator.core.engine.parameter_patcher import patch_parameters, apply_node_bypass
from orchestrator.core.engine.scheduler import NoBackendAvailable, Scheduler
from orchestrator.core.models.backend import BackendConfig
from orchestrator.core.models.job import Job, JobStatus, NodeExecution
from orchestrator.core.models.project import CanvasLayout, CanvasNode, NodeType, Project
from orchestrator.core.models.workflow import ExposedParameter, ParamType, WorkflowDefinition, MediaType, MediaInputDefinition
from orchestrator.storage.repositories.job_repo import JobRepository
from orchestrator.core.storage.workflow_storage import WorkflowStorage


@dataclass(frozen=True)
class FailoverChoice:
    retry_on: str | None


@dataclass
class ExecutionContext:
    """Holds inter-node data within a single execution stream.
    
    This context is scoped to one stream (connected subgraph) and allows
    nodes to pass output data to downstream nodes within the same stream.
    
    Each stream gets its own ExecutionContext, enabling independent parallel
    execution of disconnected workflow subgraphs.
    
    Attributes:
        stream_id: Unique identifier for this stream (e.g., "stream_0")
        stream_nodes: Set of node IDs belonging to this stream
        _outputs: Internal storage for node outputs keyed by node_id
    """
    stream_id: str
    stream_nodes: set[str]
    _outputs: dict[str, Any] = None  # type: ignore[assignment]
    
    def __post_init__(self) -> None:
        # Initialize mutable default
        if self._outputs is None:
            object.__setattr__(self, '_outputs', {})
    
    def set_node_outputs(self, node_id: str, data: Any) -> None:
        """Store output data from a completed node.
        
        Args:
            node_id: The node that produced the output
            data: Output data (typically dict with 'images', 'prompt_id', etc.)
        """
        self._outputs[node_id] = data
    
    def get_node_outputs(self, node_id: str) -> Any | None:
        """Get stored output data for a specific node.
        
        Args:
            node_id: The node to get outputs for
            
        Returns:
            The stored output data, or None if not found
        """
        return self._outputs.get(node_id)
    
    def get_upstream_outputs(
        self, 
        node_id: str, 
        connections: list[tuple[str, str, str, str]]
    ) -> dict[str, Any]:
        """Get outputs from all upstream nodes connected to a node.
        
        Args:
            node_id: The target node to get upstream data for
            connections: List of (source_id, source_port, target_id, target_port)
            
        Returns:
            Dict mapping target_port -> upstream output data
        """
        inputs: dict[str, Any] = {}
        
        for source_id, source_port, target_id, target_port in connections:
            if target_id != node_id:
                continue
            if source_id not in self.stream_nodes:
                continue
                
            source_output = self._outputs.get(source_id)
            if source_output is None:
                continue
                
            # If source output is a dict with the port as key, extract it
            if isinstance(source_output, dict) and source_port in source_output:
                inputs[target_port] = source_output[source_port]
            else:
                # Otherwise use the whole output
                inputs[target_port] = source_output
        
        return inputs
    
    def has_images(self, node_id: str) -> bool:
        """Check if a node's output contains images.
        
        Args:
            node_id: The node to check
            
        Returns:
            True if the node has output with 'images' key
        """
        output = self._outputs.get(node_id)
        return isinstance(output, dict) and 'images' in output
    
    def get_images(self, node_id: str) -> list[Any]:
        """Get images from a node's output.
        
        Args:
            node_id: The node to get images from
            
        Returns:
            List of image data, or empty list if none
        """
        output = self._outputs.get(node_id)
        if isinstance(output, dict):
            return output.get('images', [])
        return []


@dataclass(frozen=True)
class RunningNodeInfo:
    node_id: str
    backend_id: str | None
    progress: float
    current_step: str | None


@dataclass(frozen=True)
class JobProgress:
    job_id: str
    overall_percent: float
    completed_nodes: int
    total_nodes: int
    running_nodes: list[RunningNodeInfo]


class BackendOfflineError(RuntimeError):
    def __init__(self, backend_id: str, message: str) -> None:
        super().__init__(message)
        self.backend_id = backend_id


class JobUICallbacks(Protocol):
    async def notify_job_failed(self, job: Job) -> None: ...

    async def notify_job_progress(self, job: Job, progress: JobProgress) -> None: ...

    async def prompt_failover(
        self, failed_backend: str, alternatives: list[str], node_id: str
    ) -> FailoverChoice: ...
    
    async def on_node_completed(
        self, job_id: str, node_id: str, output_data: dict[str, Any] | None
    ) -> None: 
        """Called when a single node completes execution.
        
        This enables immediate output updates without waiting for the entire job.
        
        Args:
            job_id: The job this node belongs to
            node_id: The canvas node that completed
            output_data: Output data from the node (may contain 'images', etc.)
        """
        ...


class JobManager:
    def __init__(
        self,
        executor: GraphExecutor | None = None,
        scheduler: Scheduler | None = None,
        job_repo: JobRepository | None = None,
        workflow_storage: WorkflowStorage | None = None,
        ui_callback: JobUICallbacks | None = None,
        client_factory: Callable[[BackendConfig], ComfyUIClient] | None = None,
    ) -> None:
        self._executor = executor or GraphExecutor()
        self._scheduler = scheduler or Scheduler()
        self._job_repo = job_repo or JobRepository()
        self._workflow_storage = workflow_storage or WorkflowStorage()
        self._ui_callback = ui_callback
        self._condition_evaluator = ConditionEvaluator()
        self._client_factory = client_factory or self._default_client_factory
        self._output_root = Path(tempfile.gettempdir()) / "comfy-orchestrator" / "outputs"
        self._output_root.mkdir(parents=True, exist_ok=True)
        self._output_dirs: dict[str, Path] = {}
        
        # Track running tasks for cancellation support
        self._running_tasks: dict[str, asyncio.Task[None]] = {}  # node_id -> task
        self._running_clients: dict[str, ComfyUIClient] = {}  # node_id -> client
        self._current_job: Job | None = None
        self._cancelled = False

    def set_ui_callback(self, ui_callback: JobUICallbacks) -> None:
        """Set the UI callback for progress notifications.
        
        This allows setting the callback after JobManager is created,
        which is needed when the callback depends on components created later.
        
        Args:
            ui_callback: The UI callback interface for progress updates
        """
        self._ui_callback = ui_callback
        logger.info(f"JobManager: UI callback set to {ui_callback}")

    async def cancel_job(self) -> None:
        """Cancel the current job and all running tasks.
        
        This interrupts all running workflows on their backends and
        cancels all pending asyncio tasks.
        """
        if not self._current_job:
            logger.warning("cancel_job called but no job is running")
            return
        
        logger.info(f"Cancelling job {self._current_job.id}")
        self._cancelled = True
        
        # Interrupt all backends and cancel tasks
        for node_id in list(self._running_tasks.keys()):
            await self._cancel_node_internal(node_id)
        
        # Update job status
        if self._current_job:
            self._current_job.status = JobStatus.FAILED
            self._current_job.error_message = "Job cancelled by user"
            self._current_job.completed_at = datetime.utcnow()
            self._job_repo.save(self._current_job)
    
    async def cancel_node(self, node_id: str) -> bool:
        """Cancel execution of a specific node.
        
        Args:
            node_id: ID of the node to cancel
            
        Returns:
            True if node was running and cancelled, False otherwise
        """
        if node_id not in self._running_tasks:
            logger.warning(f"cancel_node: node {node_id} not in running tasks")
            return False
        
        await self._cancel_node_internal(node_id)
        return True
    
    async def _cancel_node_internal(self, node_id: str) -> None:
        """Internal method to cancel a node's execution."""
        # Interrupt the backend first if we have a client
        if node_id in self._running_clients:
            client = self._running_clients[node_id]
            try:
                logger.info(f"Sending interrupt to backend for node {node_id}")
                await client.interrupt()
            except Exception as e:
                logger.warning(f"Failed to interrupt backend for node {node_id}: {e}")
            finally:
                try:
                    await client.close()
                except (httpx.HTTPError, asyncio.CancelledError, OSError):
                    # Ignore errors during cleanup
                    pass
                del self._running_clients[node_id]
        
        # Cancel the asyncio task
        if node_id in self._running_tasks:
            task = self._running_tasks[node_id]
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.warning(f"Error awaiting cancelled task for {node_id}: {e}")
            del self._running_tasks[node_id]
        
        # Update execution status if we have a current job
        if self._current_job:
            for execution in self._current_job.node_executions:
                if execution.canvas_node_id == node_id and execution.status == JobStatus.RUNNING:
                    execution.status = JobStatus.FAILED
                    execution.error_message = "Cancelled by user"
                    execution.completed_at = datetime.utcnow()
                    break

    def _get_output_dir(self, job_id: str) -> Path:
        """Get or create the output directory for a job."""
        output_dir = self._output_dirs.get(job_id)
        if output_dir is None:
            output_dir = self._output_root / job_id
            output_dir.mkdir(parents=True, exist_ok=True)
            self._output_dirs[job_id] = output_dir
        return output_dir

    def _prune_output_cache(self, max_age_hours: float = 24.0) -> None:
        """Remove stale output directories from the cache."""
        if not self._output_root.exists():
            return
        now = time.time()
        cutoff = max_age_hours * 60 * 60
        for entry in self._output_root.iterdir():
            if not entry.is_dir():
                continue
            if entry.name in self._output_dirs:
                continue
            try:
                age = now - entry.stat().st_mtime
            except OSError:
                continue
            if age < cutoff:
                continue
            try:
                shutil.rmtree(entry)
                logger.debug("Pruned output cache directory %s", entry)
            except OSError as exc:
                logger.debug("Failed to prune output cache %s: %s", entry, exc)

    async def run_job(self, project: Project, params: dict) -> Job:
        self._prune_output_cache()
        logger.debug(
            "JobManager.run_job called with %s nodes",
            len(project.canvas_layout.nodes)
        )
        job = self._create_job(project, params)
        logger.debug(
            "Created job %s with %s node executions",
            job.id,
            len(job.node_executions)
        )
        self._job_repo.save(job)
        
        # Reset cancellation state and track current job
        self._cancelled = False
        self._current_job = job
        self._running_tasks.clear()
        self._running_clients.clear()
        
        try:
            await self._run_graph(job)
        finally:
            self._current_job = None
            self._running_tasks.clear()
            self._running_clients.clear()
        
        self._job_repo.save(job)
        logger.debug("Job %s finished with status %s", job.id, job.status)
        return job

    async def run_project_streams(
        self, 
        project: Project, 
        params: dict,
        on_stream_started: Callable[[str, Job], None] | None = None,
        on_workflow_completed: Callable[[str, str, dict[str, Any] | None], None] | None = None,
    ) -> list[Job]:
        """Run a project as multiple independent streams in parallel.
        
        This is the new execution model that supports autonomous workflow execution.
        Each disconnected subgraph on the canvas runs as a separate Job, completing
        independently and updating outputs immediately.
        
        Args:
            project: The project to execute
            params: Global parameter values for all workflows
            on_stream_started: Callback(stream_id, job) when a stream's job starts
            on_workflow_completed: Callback(job_id, node_id, output_data) when a
                workflow node completes (for immediate output updates)
        
        Returns:
            List of Job objects, one per stream. Each job completes independently.
            
        Behavior:
            - Independent workflows (disconnected) run in parallel as separate jobs
            - Chained workflows (connected) run sequentially within their stream
            - Each workflow's output is immediately passed to downstream nodes
            - Output callbacks fire as soon as each workflow completes
        """
        self._prune_output_cache()
        canvas = project.canvas_layout
        self._executor.reset(canvas)
        
        # Get executable streams (connected components with Execute nodes)
        streams = self._executor.get_executable_streams()
        
        if not streams:
            logger.debug("No executable streams found, returning empty")
            return []
        
        logger.info("Found %s executable stream(s)", len(streams))
        for i, stream in enumerate(streams):
            logger.info("  Stream %s: %s nodes - %s", i, len(stream), stream)
            # Log node types in this stream
            for node_id in stream:
                for node in canvas.nodes:
                    if node.id == node_id:
                        logger.info("    Node %s: type=%s", node_id, node.node_type)
        
        # Create a job for each stream
        jobs: list[Job] = []
        stream_tasks: list[asyncio.Task[Job]] = []
        
        for i, stream_nodes in enumerate(streams):
            stream_id = f"stream_{i}"
            
            # Create a sub-project containing only this stream's nodes
            stream_project = self._create_stream_project(project, stream_nodes, stream_id)
            
            # Create execution context for this stream
            context = ExecutionContext(
                stream_id=stream_id,
                stream_nodes=stream_nodes,
            )
            
            # Create async task for this stream
            task = asyncio.create_task(
                self._run_stream(
                    stream_project, 
                    params, 
                    context,
                    on_stream_started,
                    on_workflow_completed,
                )
            )
            stream_tasks.append(task)
        
        # Wait for all streams to complete (they run in parallel)
        results = await asyncio.gather(*stream_tasks, return_exceptions=True)
        
        # Collect successful jobs and log errors
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Stream {i} failed with error: {result}")
            elif isinstance(result, Job):
                jobs.append(result)
        
        logger.debug(
            "All streams complete. %s jobs finished successfully.",
            len(jobs),
        )
        return jobs

    def _create_stream_project(
        self, 
        project: Project, 
        stream_nodes: set[str],
        stream_id: str,
    ) -> Project:
        """Create a sub-project containing only the specified stream's nodes.
        
        Args:
            project: Original project
            stream_nodes: Set of node IDs to include
            stream_id: Identifier for this stream
            
        Returns:
            New Project with filtered nodes and connections
        """
        from orchestrator.core.models.project import CanvasLayout, Project as ProjectModel
        
        # Filter nodes to only those in this stream
        filtered_nodes = [
            node for node in project.canvas_layout.nodes
            if node.id in stream_nodes
        ]
        
        # Filter connections to only those between stream nodes
        filtered_connections = [
            conn for conn in project.canvas_layout.connections
            if conn.source_node_id in stream_nodes and conn.target_node_id in stream_nodes
        ]
        
        # Create new canvas layout
        stream_canvas = CanvasLayout(
            nodes=filtered_nodes,
            connections=filtered_connections,
            viewport=project.canvas_layout.viewport,
        )
        
        # Create stream project
        return ProjectModel(
            id=f"{project.id}_{stream_id}",
            name=f"{project.name} ({stream_id})",
            description=project.description,
            canvas_layout=stream_canvas,
            created_at=project.created_at,
            updated_at=project.updated_at,
        )

    async def _run_stream(
        self,
        stream_project: Project,
        params: dict,
        context: ExecutionContext,
        on_stream_started: Callable[[str, Job], None] | None = None,
        on_workflow_completed: Callable[[str, str, dict[str, Any] | None], None] | None = None,
    ) -> Job:
        """Run a single stream as an independent job.
        
        This is similar to run_job but:
        - Uses ExecutionContext for inter-node data passing
        - Calls on_workflow_completed callback immediately when each workflow finishes
        - Operates on a filtered sub-project (single stream)
        
        Args:
            stream_project: Project containing only this stream's nodes
            params: Parameter values
            context: ExecutionContext for this stream
            on_stream_started: Callback when job starts
            on_workflow_completed: Callback when a workflow node completes
            
        Returns:
            Completed Job object
        """
        job = self._create_job(stream_project, params)
        logger.debug(
            "Stream %s: Created job %s with %s nodes",
            context.stream_id,
            job.id,
            len(job.node_executions),
        )
        self._job_repo.save(job)
        
        # Notify that this stream's job has started
        if on_stream_started:
            on_stream_started(context.stream_id, job)
        
        # Reset state for this stream
        self._cancelled = False
        
        try:
            await self._run_graph_with_context(
                job, 
                context, 
                on_workflow_completed,
            )
        except Exception as e:
            logger.error(f"Stream {context.stream_id} failed: {e}")
            job.status = JobStatus.FAILED
            job.error_message = str(e)
            job.completed_at = datetime.utcnow()
        
        self._job_repo.save(job)
        logger.info(f"Stream {context.stream_id}: Job {job.id} finished with status {job.status}")
        return job

    async def _run_graph_with_context(
        self,
        job: Job,
        context: ExecutionContext,
        on_workflow_completed: Callable[[str, str, dict[str, Any] | None], None] | None = None,
    ) -> None:
        """Run graph execution with ExecutionContext for inter-node data passing.
        
        Similar to _run_graph but:
        - Stores outputs in context for downstream nodes
        - Calls on_workflow_completed immediately when workflow nodes finish
        
        Args:
            job: The job being executed
            context: ExecutionContext for data passing
            on_workflow_completed: Callback for immediate output updates
        """
        canvas = job.canvas_snapshot
        logger.info(f"_run_graph_with_context: {context.stream_id} has {len(canvas.nodes)} nodes")
        for node in canvas.nodes:
            logger.info(f"  Node in stream: {node.id} (type={node.node_type})")
        for conn in canvas.connections:
            logger.info(f"  Connection: {conn.source_node_id} -> {conn.target_node_id}")
        
        # Create a fresh executor for this stream's canvas
        stream_executor = GraphExecutor(canvas)
        
        # DEBUG: Log ready queue and executable nodes
        logger.info(
            f"  Stream executor: ready_queue={list(stream_executor.ready_queue)}, "
            f"executable_nodes={stream_executor.get_executable_nodes()}"
        )
        
        node_map = {node.id: node for node in canvas.nodes}
        executions = {execution.canvas_node_id: execution for execution in job.node_executions}

        job.status = JobStatus.RUNNING
        job.started_at = job.started_at or datetime.utcnow()

        running: dict[asyncio.Task[None], tuple[str, CanvasNode, NodeExecution]] = {}
        
        while True:
            if self._cancelled:
                logger.info(f"_run_graph_with_context: {context.stream_id} cancelled")
                await self._cancel_running_tasks(running)
                job.status = JobStatus.FAILED
                job.error_message = "Job cancelled by user"
                return
            
            # Queue all ready nodes
            while True:
                node_id = stream_executor.get_ready_node()
                if node_id is None:
                    break
                node = node_map.get(node_id)
                if node is None:
                    continue
                execution = executions[node_id]
                
                # Collect input data from context (upstream outputs)
                connections = [
                    (c.source_node_id, c.source_port, c.target_node_id, c.target_port)
                    for c in canvas.connections
                ]
                upstream_data = context.get_upstream_outputs(node_id, connections)
                if upstream_data:
                    inputs = dict(upstream_data)
                    for source_id, source_port, _target_id, target_port in connections:
                        if _target_id != node_id:
                            continue
                        if target_port not in inputs:
                            continue
                        value = inputs.get(target_port)
                        if isinstance(value, str) and os.path.isfile(value):
                            continue
                        source_node = node_map.get(source_id)
                        if not source_node or source_node.node_type != NodeType.INPUT:
                            continue
                        if source_port != "image":
                            continue
                        file_path = source_node.config.get("file_path")
                        if not isinstance(file_path, str) or not os.path.isfile(file_path):
                            raise ValueError(
                                "Connected Image Input has no valid file. "
                                "Select an image and apply crop/mask before running."
                            )
                        inputs[target_port] = file_path
                        mask_path = source_node.config.get("mask_path")
                        if isinstance(mask_path, str) and os.path.isfile(mask_path):
                            inputs[f"_mask_for_{target_port}"] = mask_path
                    execution.input_data = inputs
                else:
                    inputs: dict[str, Any] = {}
                    for source_id, source_port, _target_id, target_port in connections:
                        if _target_id != node_id:
                            continue
                        source_node = node_map.get(source_id)
                        if not source_node or source_node.node_type != NodeType.INPUT:
                            continue
                        if source_port != "image":
                            continue
                        file_path = source_node.config.get("file_path")
                        if not isinstance(file_path, str) or not os.path.isfile(file_path):
                            raise ValueError(
                                "Connected Image Input has no valid file. "
                                "Select an image and apply crop/mask before running."
                            )
                        inputs[target_port] = file_path
                        mask_path = source_node.config.get("mask_path")
                        if isinstance(mask_path, str) and os.path.isfile(mask_path):
                            inputs[f"_mask_for_{target_port}"] = mask_path
                    if inputs:
                        execution.input_data = inputs
                
                logger.info(f"{context.stream_id}: Scheduling node {node_id} (type={node.node_type})")
                task = asyncio.create_task(
                    self._execute_node(job, execution, node, canvas)
                )
                running[task] = (node_id, node, execution)
                self._running_tasks[node_id] = task

            if not running:
                break

            done, _pending = await asyncio.wait(
                running.keys(), return_when=asyncio.FIRST_COMPLETED
            )
            
            for task in done:
                node_id, node, execution = running.pop(task)
                self._running_tasks.pop(node_id, None)
                
                try:
                    await task
                except asyncio.CancelledError:
                    execution.status = JobStatus.FAILED
                    execution.error_message = "Cancelled"
                    continue
                except Exception as error:
                    recovered = await self._handle_node_failure(job, execution, node, error)
                    if not recovered:
                        await self._cancel_running_tasks(running)
                        return
                
                # Store outputs in context for downstream nodes
                if execution.output_data:
                    context.set_node_outputs(node_id, execution.output_data)
                
                # Mark node complete in executor
                stream_executor.on_node_complete(node_id)
                
                # IMMEDIATE OUTPUT: If this is a WORKFLOW node with images, notify UI
                if node.node_type == NodeType.WORKFLOW and on_workflow_completed:
                    logger.debug(
                        "%s: Workflow %s completed, notifying UI",
                        context.stream_id,
                        node_id,
                    )
                    on_workflow_completed(job.id, node_id, execution.output_data)
                
                # Also notify via standard callback
                if self._ui_callback is not None:
                    await self._ui_callback.on_node_completed(
                        job.id,
                        node_id,
                        execution.output_data,
                    )
                
                await self._report_progress(job)

        if all(execution.status == JobStatus.COMPLETED for execution in job.node_executions):
            job.status = JobStatus.COMPLETED
            job.completed_at = datetime.utcnow()

    async def _run_graph(self, job: Job) -> None:
        canvas = job.canvas_snapshot
        logger.debug("_run_graph: canvas has %s nodes", len(canvas.nodes))
        self._executor.reset(canvas)
        node_map = {node.id: node for node in canvas.nodes}
        executions = {execution.canvas_node_id: execution for execution in job.node_executions}
        logger.debug("_run_graph: node_map keys: %s", list(node_map.keys()))

        job.status = JobStatus.RUNNING
        job.started_at = job.started_at or datetime.utcnow()

        running: dict[asyncio.Task[None], tuple[str, CanvasNode, NodeExecution]] = {}
        
        iteration = 0
        while True:
            # Check for cancellation
            if self._cancelled:
                logger.debug("_run_graph: job cancelled, stopping")
                await self._cancel_running_tasks(running)
                job.status = JobStatus.FAILED
                job.error_message = "Job cancelled by user"
                return
            
            iteration += 1
            logger.debug("_run_graph iteration %s: checking for ready nodes", iteration)
            while True:
                node_id = self._executor.get_ready_node()
                logger.debug("_run_graph: get_ready_node returned %s", node_id)
                if node_id is None:
                    break
                node = node_map.get(node_id)
                if node is None:
                    logger.warning("_run_graph: node %s not found in node_map", node_id)
                    continue
                execution = executions[node_id]
                logger.debug(
                    "_run_graph: scheduling execution of node %s (type=%s)",
                    node_id,
                    node.node_type,
                )
                task = asyncio.create_task(self._execute_node(job, execution, node, canvas))
                running[task] = (node_id, node, execution)
                # Track in our instance dict for per-node cancellation
                self._running_tasks[node_id] = task

            if not running:
                logger.debug("_run_graph: no running tasks, exiting loop")
                break

            done, _pending = await asyncio.wait(
                running.keys(), return_when=asyncio.FIRST_COMPLETED
            )
            for task in done:
                node_id, node, execution = running.pop(task)
                # Remove from instance tracking
                self._running_tasks.pop(node_id, None)
                try:
                    await task
                except asyncio.CancelledError:
                    logger.debug("_run_graph: task for node %s was cancelled", node_id)
                    execution.status = JobStatus.FAILED
                    execution.error_message = "Cancelled"
                    continue
                except Exception as error:  # noqa: BLE001
                    recovered = await self._handle_node_failure(job, execution, node, error)
                    if not recovered:
                        await self._cancel_running_tasks(running)
                        return
                self._executor.on_node_complete(node_id)
                # Notify UI that this node completed with its output data
                if self._ui_callback is not None:
                    await self._ui_callback.on_node_completed(
                        job.id,
                        node_id,
                        execution.output_data,
                    )
                await self._report_progress(job)

        if all(execution.status == JobStatus.COMPLETED for execution in job.node_executions):
            job.status = JobStatus.COMPLETED
            job.completed_at = datetime.utcnow()

    def _create_job(self, project: Project, params: dict) -> Job:
        # Note: project_id is None for ad-hoc execution since project isn't saved to DB
        # To enable project_id, the project must first be saved via ProjectRepository
        job = Job(
            id=str(uuid.uuid4()),
            project_id=None,  # Ad-hoc execution - project not persisted to DB
            status=JobStatus.PENDING,
            canvas_snapshot=project.canvas_layout,
            parameter_values=params,
            created_at=datetime.utcnow(),
        )
        job.node_executions = [
            NodeExecution(
                id=str(uuid.uuid4()),
                job_id=job.id,
                canvas_node_id=node.id,
                status=JobStatus.PENDING,
            )
            for node in project.canvas_layout.nodes
        ]
        return job

    async def _execute_node(
        self,
        job: Job,
        execution: NodeExecution,
        node: CanvasNode,
        canvas: CanvasLayout,
    ) -> None:
        logger.debug("Executing node %s (type=%s)", node.id, node.node_type.value)
        execution.status = JobStatus.RUNNING
        execution.started_at = datetime.utcnow()
        if not execution.input_data:
            execution.input_data = self._collect_input_data(node.id, job, canvas)

        workflow = None
        backend = None
        if node.node_type == NodeType.WORKFLOW:
            logger.debug(
                "Node %s is WORKFLOW type, loading workflow %s",
                node.id,
                node.workflow_id,
            )
            try:
                workflow = self._load_workflow(node)
                logger.debug(
                    "Loaded workflow %s, api_json keys: %s",
                    workflow.name,
                    list(workflow.api_json.keys())[:5] if workflow.api_json else 'EMPTY',
                )
            except Exception as e:
                logger.error(f"Failed to load workflow: {e}")
                raise
            try:
                backend = await self._resolve_backend(node, workflow, job)
                logger.debug(
                    "Resolved backend: %s (%s:%s)",
                    backend.id,
                    backend.host,
                    backend.port,
                )
            except Exception as e:
                logger.error(f"Failed to resolve backend: {e}")
                raise
            execution.backend_id = backend.id

        if node.node_type == NodeType.WORKFLOW and workflow and backend:
            logger.debug(
                "Executing workflow node %s on backend %s",
                node.id,
                backend.id,
            )
            output_data = await self._execute_workflow_node(
                job, execution, node, workflow, backend
            )
        else:
            logger.debug("Executing non-workflow node %s with logic handler", node.id)
            output_data = await self._execute_node_logic(node, execution.input_data)
        execution.output_data = output_data
        execution.status = JobStatus.COMPLETED
        execution.completed_at = datetime.utcnow()
        execution.progress = 100.0
        logger.debug("Node %s completed successfully", node.id)

        if node.node_type == NodeType.OUTPUT:
            job.outputs[node.id] = output_data

    async def _execute_node_logic(
        self, node: CanvasNode, input_data: dict[str, Any]
    ) -> dict[str, Any]:
        if node.node_type == NodeType.INPUT:
            # Return file_path and mask_path from node config for image input nodes
            file_path = node.config.get("file_path", "")
            mask_path = node.config.get("mask_path", "")
            if not isinstance(file_path, str) or not os.path.isfile(file_path):
                raise ValueError(
                    "Connected Image Input has no valid file. "
                    "Select an image and apply crop/mask before running."
                )
            return {
                "image": file_path,
                "mask": mask_path,
                "output": input_data,  # Preserve any input data passed in
            }
        if node.node_type == NodeType.CONDITION:
            expression = node.config.get("expression", "")
            result = self._condition_evaluator.evaluate(expression, input_data)
            port = "true" if result else "false"
            return {port: input_data}
        if node.node_type == NodeType.FANOUT:
            return self._fanout_outputs(node, input_data)
        if node.node_type == NodeType.MERGE:
            return self._merge_outputs(node, input_data)
        if node.node_type == NodeType.OUTPUT:
            return {"output": input_data}
        return {"output": input_data}

    async def _execute_workflow_node(
        self,
        job: Job,
        execution: NodeExecution,
        node: CanvasNode,
        workflow: WorkflowDefinition,
        backend: BackendConfig,
    ) -> dict[str, Any]:
        client = self._client_factory(backend)
        # Track the client for potential cancellation
        self._running_clients[node.id] = client
        try:
            start_time = time.monotonic()
            # Start with input data from upstream nodes
            values = dict(execution.input_data)
            # Merge in user-provided parameter values from the job (global defaults)
            # This is critical - without this, exposed parameter changes are ignored!
            if job.parameter_values:
                logger.debug(
                    "Merging job parameter values: %s",
                    list(job.parameter_values.keys()),
                )
                values.update(job.parameter_values)
            # Merge in per-node parameter values (overrides global job params)
            # This allows each workflow node to have its own custom parameter values
            if node.parameter_values:
                logger.debug(
                    "Merging node-specific parameter values: %s",
                    list(node.parameter_values.keys()),
                )
                values.update(node.parameter_values)
            logger.debug("Uploading input images for workflow %s", workflow.name)
            values = await self._prepare_media_inputs(client, workflow, values)
            logger.debug("Patching parameters: %s", list(values.keys()))
            api_json = patch_parameters(
                workflow.api_json,
                workflow.exposed_parameters,
                values,
            )
            
            # Apply node bypass if any nodes are marked for bypass
            if workflow.bypassed_nodes:
                logger.debug("Bypassing nodes: %s", workflow.bypassed_nodes)
                api_json = apply_node_bypass(api_json, workflow.bypassed_nodes)
            
            logger.debug(
                "Queueing prompt on backend %s, api_json has %s nodes",
                backend.id,
                len(api_json),
            )
            prompt_id = await client.queue_prompt(api_json)
            logger.debug("Prompt queued successfully: %s", prompt_id)
            execution.comfy_prompt_id = prompt_id

            logger.debug("Monitoring progress for prompt %s", prompt_id)
            async for update in client.monitor_progress(prompt_id):
                self._apply_progress_update(execution, update)
                await self._report_progress(job)

            logger.debug("Getting history for prompt %s", prompt_id)
            history = await client.get_history(prompt_id)
            logger.debug("Downloading outputs")
            outputs = client.download_outputs(history)
            
            # Download actual image bytes and save to temp files
            downloaded_images = []
            output_dir = self._get_output_dir(job.id)
            for output in outputs:
                try:
                    image_bytes = await client.download_image(
                        output.filename, output.subfolder, output.image_type
                    )
                    # Save to job output directory
                    local_path = output_dir / output.filename
                    with open(local_path, 'wb') as f:
                        f.write(image_bytes)
                    downloaded_images.append({
                        "filename": output.filename,
                        "subfolder": output.subfolder,
                        "type": output.image_type,
                        "local_path": str(local_path),
                    })
                    logger.debug("Downloaded image to %s", local_path)
                except Exception as e:
                    logger.error(f"Failed to download image {output.filename}: {e}")
                    # Still include the reference even if download failed
                    downloaded_images.append({
                        "filename": output.filename,
                        "subfolder": output.subfolder,
                        "type": output.image_type,
                    })
            
            execution_time = time.monotonic() - start_time
            logger.debug(
                "Workflow execution completed in %.2fs with %s outputs",
                execution_time,
                len(downloaded_images),
            )
            return {
                "prompt_id": prompt_id,
                "images": downloaded_images,
                "execution_time": execution_time,
            }
        except (httpx.HTTPError, OSError) as error:
            logger.error(f"Backend error during workflow execution: {error}")
            raise BackendOfflineError(
                backend.id, f"Backend {backend.id} is unavailable"
            ) from error
        except Exception as error:
            logger.error(f"Unexpected error during workflow execution: {error}", exc_info=True)
            raise
        finally:
            # Remove from tracking
            self._running_clients.pop(node.id, None)
            await client.close()

    def _fanout_outputs(self, node: CanvasNode, input_data: dict[str, Any]) -> dict[str, Any]:
        mode = node.config.get("mode", "broadcast")
        output_count = int(node.config.get("output_count", 2))
        if mode == "distribute":
            items = list(input_data.get("items", []))
            chunks = _split_into_chunks(items, max(output_count, 1))
            return {f"output_{i}": {"items": chunk} for i, chunk in enumerate(chunks)}
        return {
            f"output_{i}": dict(input_data)
            for i in range(max(output_count, 1))
        }

    def _merge_outputs(self, node: CanvasNode, input_data: dict[str, Any]) -> dict[str, Any]:
        mode = node.config.get("mode", "collect")
        if mode == "concat_images":
            all_images: list[Any] = []
            for port_data in input_data.values():
                images = port_data.get("images") if isinstance(port_data, dict) else None
                if isinstance(images, list):
                    all_images.extend(images)
            return {"images": all_images}
        return {"merged": list(input_data.values()), "count": len(input_data)}

    def _collect_input_data(
        self, node_id: str, job: Job, canvas: CanvasLayout
    ) -> dict[str, Any]:
        if not canvas.connections:
            return dict(job.parameter_values)
        output_by_node = {
            execution.canvas_node_id: execution.output_data
            for execution in job.node_executions
            if execution.output_data is not None
        }
        inputs: dict[str, Any] = {}
        for edge in self._executor.edges_into(node_id):
            source_output = output_by_node.get(edge.source_id)
            if isinstance(source_output, dict) and edge.source_port in source_output:
                inputs[edge.target_port] = source_output[edge.source_port]
                
                # CRITICAL FIX: When collecting from INPUT nodes that output images,
                # also capture the mask path if present. INPUT nodes return:
                #   {"image": file_path, "mask": mask_path, "output": ...}
                # But only the "image" key gets collected via the edge.
                # We need to also store the mask for later embedding.
                source_node = canvas.get_node(edge.source_id)
                if (source_node and source_node.node_type == NodeType.INPUT and 
                    edge.source_port == "image" and "mask" in source_output):
                    mask_path = source_output.get("mask")
                    if mask_path and isinstance(mask_path, str) and os.path.isfile(mask_path):
                        # Store mask with a reference to which image it belongs to
                        # Key format: _mask_for_{target_port}
                        inputs[f"_mask_for_{edge.target_port}"] = mask_path
                        logger.debug(
                            "Captured mask from INPUT node %s for %s: %s",
                            edge.source_id,
                            edge.target_port,
                            mask_path,
                        )
                        
            elif source_output is not None:
                inputs[edge.target_port] = source_output
        if not inputs:
            return dict(job.parameter_values)
        return inputs

    def _get_load_image_nodes(self, api_json: dict[str, Any]) -> dict[str, list[str]]:
        load_nodes: dict[str, list[str]] = {}
        for node_id, node_data in api_json.items():
            if not isinstance(node_data, dict):
                continue
            class_type = str(node_data.get("class_type", ""))
            if "loadimage" not in class_type.lower():
                continue
            inputs = node_data.get("inputs")
            if not isinstance(inputs, dict) or "image" not in inputs:
                continue
            title = ""
            meta = node_data.get("_meta")
            if isinstance(meta, dict):
                title = meta.get("title") or ""
            if not title:
                title = node_id
            load_nodes.setdefault(title, []).append(node_id)
        return load_nodes

    def _load_workflow(self, node: CanvasNode) -> WorkflowDefinition:
        if not node.workflow_id:
            raise ValueError("Workflow node missing workflow_id")
        workflow = self._workflow_storage.load_workflow(node.workflow_id)
        if workflow is None:
            raise ValueError(f"Workflow {node.workflow_id} not found")
        return workflow

    async def _resolve_backend(
        self, node: CanvasNode, workflow: WorkflowDefinition, job: Job | None = None
    ) -> BackendConfig:
        # PRIORITY 1: Check if node has explicit backend_affinity (per-node selection)
        # This takes precedence over global job-level _target_backend
        if node.backend_affinity:
            backend = self._scheduler.get_backend(node.backend_affinity)
            if backend is not None:
                logger.debug("Using node's backend_affinity: %s", node.backend_affinity)
                return backend
            logger.warning("Node's backend_affinity %s not available", node.backend_affinity)
        
        # PRIORITY 2: Check for job-level default backend (from parameter panel)
        # This is used when node doesn't have a specific backend set
        target_backend = None
        if job and job.parameter_values:
            target_backend = job.parameter_values.get('_target_backend')
        
        if target_backend:
            backend = self._scheduler.get_backend(target_backend)
            if backend is not None:
                logger.debug("Using job's target backend: %s", target_backend)
                return backend
            logger.warning(
                "Job's target backend %s not available, falling back to scheduler",
                target_backend,
            )
        
        # PRIORITY 3: Fall back to scheduler auto-selection
        backend = self._scheduler.select_backend(node, workflow)
        if backend is not None:
            logger.debug("Using scheduler-selected backend: %s", backend.id)
            return backend
        if self._ui_callback is None:
            raise ValueError("Backend selection requires user input")
        alternatives = [backend.id for backend in self._scheduler.available_backends()]
        if not alternatives:
            raise NoBackendAvailable("No backends available for scheduling")
        choice = await self._ui_callback.prompt_failover(
            failed_backend=node.backend_affinity or "unknown",
            alternatives=alternatives,
            node_id=node.id,
        )
        if choice.retry_on is None:
            raise ValueError("Backend selection cancelled")
        backend = self._scheduler.get_backend(choice.retry_on)
        if backend is None:
            raise NoBackendAvailable(f"Backend {choice.retry_on} is unavailable")
        return backend

    async def _handle_node_failure(
        self,
        job: Job,
        execution: NodeExecution,
        node: CanvasNode,
        error: Exception,
    ) -> bool:
        if isinstance(error, BackendOfflineError):
            recovered = await self._attempt_failover(job, execution, node, error)
            if recovered:
                return True
        execution.status = JobStatus.FAILED
        execution.error_message = str(error)
        execution.error_traceback = traceback.format_exc()
        job.status = JobStatus.FAILED
        job.error_message = f"Node {execution.canvas_node_id} failed: {error}"
        job.completed_at = datetime.utcnow()
        self._job_repo.save(job)
        if self._ui_callback is not None:
            await self._ui_callback.notify_job_failed(job)
        return False

    async def _report_progress(self, job: Job) -> None:
        total = len(job.node_executions)
        completed = sum(
            1 for execution in job.node_executions if execution.status == JobStatus.COMPLETED
        )
        running_nodes = self._running_node_details(job)
        
        # Calculate overall progress including partial progress of running nodes
        # Each completed node contributes 100%, running nodes contribute their progress %
        running_progress = sum(
            execution.progress / 100.0  # progress is 0-100, convert to 0-1
            for execution in job.node_executions
            if execution.status == JobStatus.RUNNING
        )
        # Total progress = completed nodes + partial progress of running nodes
        overall_progress = _percent(completed + running_progress, total) if total > 0 else 0.0
        
        progress = JobProgress(
            job_id=job.id,
            overall_percent=overall_progress,
            completed_nodes=completed,
            total_nodes=total,
            running_nodes=running_nodes,
        )
        if self._ui_callback is not None:
            await self._ui_callback.notify_job_progress(job, progress)

    def _running_node_details(self, job: Job) -> list[RunningNodeInfo]:
        return [
            RunningNodeInfo(
                node_id=execution.canvas_node_id,
                backend_id=execution.backend_id,
                progress=execution.progress,
                current_step=execution.current_step,
            )
            for execution in job.node_executions
            if execution.status == JobStatus.RUNNING
        ]

    async def _attempt_failover(
        self,
        job: Job,
        execution: NodeExecution,
        node: CanvasNode,
        error: BackendOfflineError,
    ) -> bool:
        if node.node_type != NodeType.WORKFLOW:
            return False
        if self._ui_callback is None:
            return False
        alternatives = [backend.id for backend in self._scheduler.available_backends()]
        alternatives = [backend_id for backend_id in alternatives if backend_id != error.backend_id]
        if not alternatives:
            return False
        choice = await self._ui_callback.prompt_failover(
            failed_backend=error.backend_id,
            alternatives=alternatives,
            node_id=node.id,
        )
        if choice.retry_on is None:
            return False
        backend = self._scheduler.get_backend(choice.retry_on)
        if backend is None:
            return False
        await self._retry_workflow_execution(job, execution, node, backend)
        return True

    async def _retry_workflow_execution(
        self,
        job: Job,
        execution: NodeExecution,
        node: CanvasNode,
        backend: BackendConfig,
    ) -> None:
        workflow = self._load_workflow(node)
        execution.status = JobStatus.RUNNING
        execution.started_at = datetime.utcnow()
        execution.backend_id = backend.id
        execution.comfy_prompt_id = None
        execution.progress = 0.0
        execution.current_step = None
        execution.output_data = None
        execution.error_message = None
        execution.error_traceback = None
        execution.output_data = await self._execute_workflow_node(
            job, execution, node, workflow, backend
        )
        execution.status = JobStatus.COMPLETED
        execution.completed_at = datetime.utcnow()
        execution.progress = 100.0

    async def _cancel_running_tasks(
        self, running: dict[asyncio.Task[None], tuple[str, CanvasNode, NodeExecution]]
    ) -> None:
        for task in running:
            task.cancel()
        if running:
            await asyncio.gather(*running.keys(), return_exceptions=True)

    async def _prepare_media_inputs(
        self,
        client: ComfyUIClient,
        workflow: WorkflowDefinition,
        parameter_values: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Upload media files and replace paths with ComfyUI references.
        
        Handles:
        - Direct image/mask values from INPUT nodes
        - IMAGE_PATH/VIDEO_PATH exposed parameters
        - Multi-input media with crop settings (applies crop before upload)
        - Multi-input media with mask files (uploads mask alongside image)
        - Video inputs with trim settings (trims before upload)
        
        Args:
            client: ComfyUI client for uploading files.
            workflow: Workflow definition with exposed parameters and media_inputs.
            parameter_values: Dict mapping parameter key -> value.
                Keys can be parameter.id, parameter.field_name, or media_input.id.
                Values can be strings (file paths) or dicts with:
                  - file_path: str
                  - mask_path: str | None
                  - crop: CropSettings | None
                  - trim: TrimSettings | None
                
        Returns:
            Updated parameter_values dict with file paths replaced
            by ComfyUI references (uploaded filenames).
        """
        updated = dict(parameter_values)
        media_types = {ParamType.IMAGE_PATH, ParamType.VIDEO_PATH}
        
        # First, handle direct image/mask values from INPUT nodes
        # These come from the canvas INPUT node's output
        # Also include 'trigger' which is the common port name from ImageInputNode
        direct_image_keys = ['image', 'mask', 'image_in', 'mask_in', 'trigger']
        
        # NEW: If we have both 'image' and 'mask', embed mask into image's alpha channel
        # ComfyUI LoadImage node extracts mask from alpha channel automatically
        image_path = updated.get('image')
        mask_path = updated.get('mask')
        
        if (image_path and mask_path and 
            isinstance(image_path, str) and os.path.isfile(image_path) and
            isinstance(mask_path, str) and os.path.isfile(mask_path)):
            try:
                processed_path = await self._embed_mask_into_image(image_path, mask_path)
                if processed_path:
                    updated['image'] = processed_path
                    logger.info(f"Embedded mask into image: {image_path} + {mask_path} -> {processed_path}")
                    # Remove mask from updated since it's now embedded in the image
                    # The LoadImage node will extract it from alpha channel
                    del updated['mask']
            except Exception as e:
                logger.error(f"Failed to embed mask into image: {e}")
        
        for key in direct_image_keys:
            if key in updated:
                value = updated[key]
                if isinstance(value, str) and value and os.path.isfile(value):
                    try:
                        uploaded_ref = await client.upload_image(value)
                        updated[key] = uploaded_ref
                        logger.info(f"Uploaded direct input {key}: {value} -> {uploaded_ref}")
                        
                        # CRITICAL: Also map to the workflow's LoadImage node so patch_parameters() can inject it
                        # Without this, the uploaded image reference is stored in 'trigger' but never applied to the workflow JSON
                        is_mask_key = 'mask' in key.lower()
                        if workflow.media_inputs and not is_mask_key:
                            media_input = workflow.media_inputs[0]
                            updated[f"{media_input.node_id}:{media_input.field_name}"] = uploaded_ref
                            logger.info(f"Mapped {key} to workflow node {media_input.node_id}:{media_input.field_name}")
                        elif workflow.media_inputs and is_mask_key:
                            # Map mask to first media input that accepts masks
                            for mi in workflow.media_inputs:
                                if mi.accepts_mask:
                                    updated[f"{mi.node_id}:mask"] = uploaded_ref
                                    logger.info(f"Mapped {key} to workflow mask node {mi.node_id}:mask")
                                    break
                    except Exception as e:
                        logger.error(f"Failed to upload {key} ({value}): {e}")
        
        # NEW: Handle upstream node connections providing file paths
        # When an ImageInputNode connects to a WorkflowNode, the input_data contains
        # file paths keyed by the target port name. We need to:
        # 1. Find any file paths in the input data
        # 2. Map them to the workflow's media_inputs (LoadImage nodes)
        upstream_image_paths: list[tuple[str, str]] = []  # (key, file_path)
        upstream_mask_paths: list[tuple[str, str]] = []   # (key, file_path)
        
        # Track keys we've already processed (uploaded in direct_image_keys loop)
        already_processed = set(direct_image_keys)
        
        for key, value in updated.items():
            # Skip keys already handled above
            if key in already_processed:
                continue
            # Skip internal mask markers (these are handled in upstream image injection)
            if key.startswith('_mask_for_'):
                continue
            if isinstance(value, str) and value and os.path.isfile(value):
                # Check if this looks like an image file
                lower_val = value.lower()
                if any(lower_val.endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff']):
                    # Check if this is a mask based on key name or file name
                    lower_key = key.lower()
                    if 'mask' in lower_key or 'mask' in os.path.basename(lower_val).lower():
                        upstream_mask_paths.append((key, value))
                    else:
                        upstream_image_paths.append((key, value))
        
        upstream_image_map = {key: file_path for key, file_path in upstream_image_paths}
        if workflow.media_inputs:
            image_media_inputs = [
                media_input
                for media_input in workflow.media_inputs
                if media_input.media_type == MediaType.IMAGE
            ]
            
            # Get bypassed nodes - don't require inputs for bypassed loaders
            bypassed_nodes = getattr(workflow, 'bypassed_nodes', set()) or set()
            
            for media_input in image_media_inputs:
                # Skip bypassed nodes - they won't run anyway
                if media_input.node_id in bypassed_nodes:
                    continue
                
                # Port names may have node_id suffix for uniqueness (e.g., "Load Image (#15)")
                # We need to match against both the base node_title and the suffixed version
                node_title = media_input.node_title
                suffixed_name = f"{node_title} (#{media_input.node_id})"
                
                # Check if already found by either name
                if node_title in upstream_image_map or suffixed_name in upstream_image_map:
                    continue
                
                # Try to find value by node_title first, then by suffixed name, then by media_input.id
                value = updated.get(node_title) or updated.get(suffixed_name) or updated.get(media_input.id)
                
                # Determine which key name to use for the map
                map_key = node_title
                if suffixed_name in updated:
                    map_key = suffixed_name
                
                # Also search for keys that start with node_title (handles suffixed port names)
                if value is None:
                    for key in list(updated.keys()):
                        if key.startswith(node_title) and key not in already_processed:
                            value = updated.get(key)
                            if value:
                                map_key = key  # Use the actual key found
                                break
                
                if isinstance(value, dict):
                    file_path = value.get("file_path")
                    mask_path = value.get("mask_path")
                    if isinstance(file_path, str) and os.path.isfile(file_path):
                        upstream_image_map[map_key] = file_path
                        if isinstance(mask_path, str) and os.path.isfile(mask_path):
                            updated[f"_mask_for_{map_key}"] = mask_path
                elif isinstance(value, str) and os.path.isfile(value):
                    upstream_image_map[map_key] = value
            
            # Helper function to check if a media_input is covered in upstream_image_map
            def is_media_input_covered(mi: MediaInputDefinition) -> bool:
                """Check if media input is covered by any key in upstream_image_map."""
                if mi.node_title in upstream_image_map:
                    return True
                suffixed = f"{mi.node_title} (#{mi.node_id})"
                if suffixed in upstream_image_map:
                    return True
                # Also check for any key that starts with node_title and contains node_id
                for key in upstream_image_map:
                    if key.startswith(mi.node_title):
                        return True
                return False
            
            # Helper function to find media_input by key (handles both base and suffixed names)
            def find_media_input_for_key(key: str) -> MediaInputDefinition | None:
                """Find media input that matches a key (base name or suffixed)."""
                for mi in image_media_inputs:
                    if mi.node_title == key:
                        return mi
                    suffixed = f"{mi.node_title} (#{mi.node_id})"
                    if suffixed == key:
                        return mi
                    # Also match if key starts with node_title (for backwards compat)
                    if key.startswith(mi.node_title) and f"#{mi.node_id}" in key:
                        return mi
                return None
            
            missing_inputs = [
                media_input.node_title
                for media_input in image_media_inputs
                if not is_media_input_covered(media_input)
                and media_input.node_id not in bypassed_nodes  # Skip bypassed nodes
            ]
            if missing_inputs:
                raise ValueError(
                    "Missing required image inputs: "
                    f"{', '.join(missing_inputs)}. Connect Image Input node(s) to run this workflow."
                )
            for key, file_path in upstream_image_map.items():
                media_input = find_media_input_for_key(key)
                if media_input is None:
                    raise ValueError(
                        f"No workflow image input matches connected port '{key}'."
                    )
                mask_key = f"_mask_for_{key}"
                mask_path = updated.get(mask_key)
                upload_path = file_path
                if mask_path and isinstance(mask_path, str) and os.path.isfile(mask_path):
                    processed_path = await self._embed_mask_into_image(file_path, mask_path)
                    if processed_path:
                        upload_path = processed_path
                uploaded_ref = await client.upload_image(upload_path)
                updated[f"{media_input.node_id}:{media_input.field_name}"] = uploaded_ref
        else:
            load_image_nodes = self._get_load_image_nodes(workflow.api_json)
            if load_image_nodes:
                if not upstream_image_map:
                    raise ValueError(
                        "Workflow requires image inputs. Connect Image Input node(s) to run this workflow."
                    )
                for key, file_path in upstream_image_map.items():
                    node_ids = load_image_nodes.get(key)
                    if not node_ids:
                        raise ValueError(
                            f"No LoadImage node matches connected port '{key}'."
                        )
                    if len(node_ids) > 1:
                        raise ValueError(
                            f"Multiple LoadImage nodes match '{key}'. Rename nodes to be unique."
                        )
                    node_id = node_ids[0]
                    mask_key = f"_mask_for_{key}"
                    mask_path = updated.get(mask_key)
                    upload_path = file_path
                    if mask_path and isinstance(mask_path, str) and os.path.isfile(mask_path):
                        processed_path = await self._embed_mask_into_image(file_path, mask_path)
                        if processed_path:
                            upload_path = processed_path
                    uploaded_ref = await client.upload_image(upload_path)
                    updated[f"{node_id}:image"] = uploaded_ref
        
        # Similarly inject masks if available
        if upstream_mask_paths and workflow.media_inputs:
            for idx, (key, file_path) in enumerate(upstream_mask_paths):
                if idx >= len(workflow.media_inputs):
                    break
                media_input = workflow.media_inputs[idx]
                if media_input.accepts_mask:
                    try:
                        uploaded_ref = await client.upload_image(file_path)
                        updated[f"{media_input.node_id}:mask"] = uploaded_ref
                        logger.info(f"Injected upstream mask [{key}] into {media_input.id}: {file_path} -> {uploaded_ref}")
                    except Exception as e:
                        logger.error(f"Failed to inject upstream mask {key}: {e}")
        
        # Handle media_inputs from workflow (new multi-input system)
        for media_input in workflow.media_inputs:
            media_id = media_input.id
            if media_id not in updated:
                continue
            
            media_data = updated[media_id]
            
            # Handle dict format with file_path, mask_path, crop, trim
            if isinstance(media_data, dict):
                file_path = media_data.get('file_path')
                mask_path = media_data.get('mask_path')
                crop_settings = media_data.get('crop')
                trim_settings = media_data.get('trim')
                
                if file_path and os.path.isfile(file_path):
                    # Handle video with trim
                    if media_input.media_type.value == 'video' and trim_settings:
                        file_path = await self._apply_video_trim(file_path, trim_settings)
                    
                    # Handle image with crop
                    if media_input.media_type.value == 'image' and crop_settings:
                        file_path = await self._apply_image_crop(file_path, crop_settings)
                        # Also crop the mask if present
                        if mask_path and os.path.isfile(mask_path):
                            mask_path = await self._apply_image_crop(mask_path, crop_settings)
                    
                    # Upload main file
                    try:
                        uploaded_ref = await client.upload_image(file_path)
                        # Store for parameter patching using node_id:field_name format
                        updated[f"{media_input.node_id}:{media_input.field_name}"] = uploaded_ref
                        logger.info(f"Uploaded media input {media_id}: {file_path} -> {uploaded_ref}")
                    except Exception as e:
                        logger.error(f"Failed to upload media input {media_id}: {e}")
                    
                    # Upload mask if present
                    if mask_path and os.path.isfile(mask_path):
                        try:
                            mask_ref = await client.upload_image(mask_path)
                            # Store mask reference
                            updated[f"{media_input.node_id}:mask"] = mask_ref
                            logger.info(f"Uploaded mask for {media_id}: {mask_path} -> {mask_ref}")
                        except Exception as e:
                            logger.error(f"Failed to upload mask for {media_id}: {e}")
            
            # Handle simple string format (just file path)
            elif isinstance(media_data, str) and os.path.isfile(media_data):
                try:
                    uploaded_ref = await client.upload_image(media_data)
                    updated[f"{media_input.node_id}:{media_input.field_name}"] = uploaded_ref
                    logger.info(f"Uploaded media input {media_id}: {media_data} -> {uploaded_ref}")
                except Exception as e:
                    logger.error(f"Failed to upload media input {media_id}: {e}")
        
        # Then handle exposed parameters with media types (legacy support)
        for parameter in workflow.exposed_parameters:
            if parameter.param_type not in media_types:
                continue
            
            # Get value by parameter.id or field_name
            value = self._get_media_value(parameter, updated)
            if not value:
                continue
            
            # Skip if not a valid file path
            if not isinstance(value, str) or not os.path.isfile(value):
                continue
            
            # Upload to ComfyUI and get reference
            try:
                uploaded_ref = await client.upload_image(str(value))
                # Update the dict with the same key that was used
                self._set_media_value(parameter, updated, uploaded_ref)
                logger.info(f"Uploaded parameter {parameter.id}: {value} -> {uploaded_ref}")
            except Exception as e:
                logger.error(f"Failed to upload parameter {parameter.id} ({value}): {e}")
        
        return updated
    
    async def _embed_mask_into_image(
        self,
        image_path: str,
        mask_path: str,
    ) -> str | None:
        """Embed mask into image's alpha channel for ComfyUI.
        
        ComfyUI's LoadImage node extracts mask from the alpha channel,
        so we embed the mask as alpha: white (255) in mask = transparent (0 alpha).
        
        Args:
            image_path: Path to source image
            mask_path: Path to grayscale mask image
            
        Returns:
            Path to processed image with embedded mask, or None if failed
        """
        try:
            from PIL import Image
            import tempfile
            
            # Load images
            image = Image.open(image_path).convert('RGBA')
            mask = Image.open(mask_path).convert('L')  # Grayscale
            
            # Scale mask to match image size if needed
            if mask.size != image.size:
                mask = mask.resize(image.size, Image.Resampling.LANCZOS)
            
            # ComfyUI's LoadImage mask output convention:
            # - Alpha 255 (opaque) = KEEP the pixel (not masked)
            # - Alpha 0 (transparent) = MASK/INPAINT this pixel
            #
            # Our mask convention (from painting UI):
            # - White (255) = KEEP the original pixel
            # - Black (0) = INPAINT this area
            #
            # So mask value directly maps to alpha: white->255 alpha (keep), black->0 alpha (mask)
            # NO INVERSION NEEDED - just use the mask directly as alpha!
            image.putalpha(mask)
            
            # Save to temp file
            temp_dir = tempfile.mkdtemp(prefix="orchestrator-embedded-")
            output_path = os.path.join(temp_dir, "image_with_mask.png")
            image.save(output_path, 'PNG')
            
            logger.info(f"Embedded mask into image alpha channel: {output_path}")
            return output_path
            
        except ImportError:
            logger.error("PIL/Pillow not available for mask embedding")
            return None
        except Exception as e:
            logger.error(f"Failed to embed mask into image: {e}")
            return None
    
    async def _apply_image_crop(
        self,
        file_path: str,
        crop_settings: Any,
    ) -> str:
        """Apply crop settings to an image and return path to cropped image.
        
        Args:
            file_path: Path to source image
            crop_settings: CropSettings object or dict with x, y, width, height
            
        Returns:
            Path to cropped image (temp file if cropping applied, original otherwise)
        """
        # Check if cropping is enabled and valid
        if crop_settings is None:
            return file_path
        
        # Handle both CropSettings object and dict
        enabled = getattr(crop_settings, 'enabled', None)
        if enabled is None:
            enabled = crop_settings.get('enabled', False) if isinstance(crop_settings, dict) else False
        if not enabled:
            return file_path
        
        try:
            from orchestrator.core.utils.image_utils import CropRect, apply_crop_to_path
            
            # Extract crop rect values
            x = getattr(crop_settings, 'x', None)
            if x is None and isinstance(crop_settings, dict):
                x = crop_settings.get('x', 0)
            y = getattr(crop_settings, 'y', None)
            if y is None and isinstance(crop_settings, dict):
                y = crop_settings.get('y', 0)
            width = getattr(crop_settings, 'width', None)
            if width is None and isinstance(crop_settings, dict):
                width = crop_settings.get('width', 0)
            height = getattr(crop_settings, 'height', None)
            if height is None and isinstance(crop_settings, dict):
                height = crop_settings.get('height', 0)
            
            crop_rect = CropRect(
                x=x or 0,
                y=y or 0,
                width=width or 0,
                height=height or 0,
            )
            
            if not crop_rect.is_valid():
                return file_path
            
            # Apply crop and return new path
            from pathlib import Path
            cropped_path = apply_crop_to_path(Path(file_path), crop_rect)
            logger.info(f"Applied crop to {file_path} -> {cropped_path}")
            return str(cropped_path)
            
        except Exception as e:
            logger.error(f"Failed to apply crop to {file_path}: {e}")
            return file_path
    
    async def _apply_video_trim(
        self,
        file_path: str,
        trim_settings: Any,
    ) -> str:
        """Apply trim settings to a video and return path to trimmed video.
        
        Args:
            file_path: Path to source MP4 video
            trim_settings: TrimSettings object or dict with start_frame, end_frame
            
        Returns:
            Path to trimmed video (temp file if trimming applied, original otherwise)
        """
        # Check if trimming is enabled
        if trim_settings is None:
            return file_path
        
        enabled = getattr(trim_settings, 'enabled', None)
        if enabled is None:
            enabled = trim_settings.get('enabled', False) if isinstance(trim_settings, dict) else False
        if not enabled:
            return file_path
        
        try:
            from orchestrator.core.utils.video_utils import trim_video, get_video_metadata
            from pathlib import Path
            
            # Get video metadata for validation
            metadata = get_video_metadata(Path(file_path))
            
            # Extract trim values
            start_frame = getattr(trim_settings, 'start_frame', None)
            if start_frame is None and isinstance(trim_settings, dict):
                start_frame = trim_settings.get('start_frame', 0)
            end_frame = getattr(trim_settings, 'end_frame', None)
            if end_frame is None and isinstance(trim_settings, dict):
                end_frame = trim_settings.get('end_frame')
            
            start_frame = start_frame or 0
            end_frame = end_frame or metadata.total_frames
            
            # Skip if no actual trimming needed
            if start_frame == 0 and end_frame >= metadata.total_frames:
                return file_path
            
            # Apply trim
            trimmed_path = trim_video(Path(file_path), start_frame, end_frame)
            logger.info(f"Applied trim to {file_path} -> {trimmed_path}")
            return str(trimmed_path)
            
        except Exception as e:
            logger.error(f"Failed to apply trim to {file_path}: {e}")
            return file_path
    
    def _get_media_value(
        self,
        parameter: ExposedParameter,
        values: dict[str, Any],
    ) -> Any | None:
        """Get value for a media parameter from values dict."""
        if parameter.id in values:
            return values[parameter.id]
        if parameter.field_name in values:
            return values[parameter.field_name]
        return None
    
    def _set_media_value(
        self,
        parameter: ExposedParameter,
        values: dict[str, Any],
        new_value: Any,
    ) -> None:
        """Set value for a media parameter, using the same key format as input."""
        # Update using the key that exists in the dict
        if parameter.id in values:
            values[parameter.id] = new_value
        elif parameter.field_name in values:
            values[parameter.field_name] = new_value
        else:
            # If neither exists, use field_name as default
            values[parameter.field_name] = new_value
    
    async def execute_workflow_direct(
        self,
        job_id: str,
        api_json: dict[str, Any],
        parameters: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        backend_affinity: str | None = None,
        required_capabilities: list[str] | None = None,
    ) -> Job:
        """Execute a ComfyUI workflow directly from API JSON.

        This method is designed for API-driven execution where external clients
        (like StoryboardUI2) submit full ComfyUI workflows for execution.

        Args:
            job_id: Unique job identifier (generated by caller).
            api_json: Full ComfyUI workflow in API JSON format (node dict).
            parameters: Optional parameter overrides to patch into workflow.
            metadata: Optional metadata for tracking (scene, source, etc.).
            backend_affinity: Optional preferred backend ID.
            required_capabilities: Optional required backend capabilities.

        Returns:
            Job object with execution status and results.

        Raises:
            ValueError: If workflow validation fails.
            NoBackendAvailable: If no suitable backend is available.
            RuntimeError: If execution fails.
        """
        logger.info(
            f"Executing workflow directly: job_id={job_id}, "
            f"nodes={len(api_json)}, params={list(parameters.keys() if parameters else [])}"
        )

        # Apply parameter patches if provided
        if parameters:
            # For direct API submission, patch using node_id:field_name format
            from orchestrator.core.engine.parameter_patcher import patch_parameters
            api_json = patch_parameters(api_json, [], parameters)
            logger.debug(f"Applied {len(parameters)} parameter patches to workflow")

        # Select backend for execution
        if backend_affinity:
            backend = self._scheduler.get_backend(backend_affinity)
            if not backend:
                raise ValueError(f"Backend '{backend_affinity}' not found")
            if not backend.enabled:
                raise ValueError(f"Backend '{backend_affinity}' is disabled")
        else:
            backend = self._scheduler.select_backend_for_capabilities(
                required_capabilities or []
            )
            if not backend:
                raise NoBackendAvailable(
                    f"No backend available with capabilities: {required_capabilities}"
                )

        logger.info(f"Selected backend: {backend.name} ({backend.id})")

        # Create minimal canvas layout for this ad-hoc execution
        from orchestrator.core.models.project import (
            CanvasLayout,
            CanvasNode,
            NodeType,
        )

        canvas_layout = CanvasLayout(
            nodes=[
                CanvasNode(
                    id="workflow_node",
                    node_type=NodeType.WORKFLOW,
                    position=(0.0, 0.0),
                    name=metadata.get("scene", "API Workflow") if metadata else "API Workflow",
                    workflow_id="direct_api_workflow",
                    backend_affinity=backend.id,
                    parameter_values=parameters or {},
                )
            ],
            connections=[],
        )

        # Create job record
        job = Job(
            id=job_id,
            project_id=None,  # Ad-hoc execution
            status=JobStatus.QUEUED,
            canvas_snapshot=canvas_layout,
            parameter_values=parameters or {},
            node_executions=[
                NodeExecution(
                    id=str(uuid.uuid4()),
                    job_id=job_id,
                    canvas_node_id="workflow_node",
                    backend_id=backend.id,
                    status=JobStatus.QUEUED,
                )
            ],
            outputs={},
        )

        # Save initial job state
        self._job_repo.save(job)

        # Execute the workflow
        execution = job.node_executions[0]
        execution.status = JobStatus.RUNNING
        execution.started_at = datetime.utcnow()
        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()
        self._job_repo.save(job)

        try:
            # Create client and execute
            client = self._client_factory(backend)
            async with client:
                # Submit to ComfyUI
                prompt_id = await client.queue_prompt(api_json)
                execution.comfy_prompt_id = prompt_id
                logger.info(f"Job {job_id} submitted to ComfyUI: prompt_id={prompt_id}")

                # Track progress
                async for update in client.monitor_progress(prompt_id):
                    self._apply_progress_update(execution, update)
                    job.progress = execution.progress
                    self._job_repo.save(job)

                # Get history/results
                history = await client.get_history(prompt_id)
                outputs = history.get("outputs", {})

                # Download any images
                output_dir = self._get_output_dir(job_id)
                downloaded_images = []

                for node_id_str, node_output in outputs.items():
                    images = node_output.get("images", [])
                    for img_data in images:
                        img_bytes = await client.download_image(
                            img_data["filename"],
                            img_data.get("subfolder", ""),
                            img_data.get("type", "output"),
                        )
                        img_path = output_dir / img_data["filename"]
                        img_path.write_bytes(img_bytes)
                        downloaded_images.append(str(img_path))
                        logger.info(f"Downloaded image: {img_path}")

                # Store outputs
                execution.output_data = {
                    "prompt_id": prompt_id,
                    "images": downloaded_images,
                    "outputs": outputs,
                }
                job.outputs = execution.output_data

                # Mark as completed
                execution.status = JobStatus.COMPLETED
                execution.completed_at = datetime.utcnow()
                execution.progress = 1.0
                job.status = JobStatus.COMPLETED
                job.completed_at = datetime.utcnow()
                job.progress = 1.0

                logger.info(
                    f"Job {job_id} completed successfully: {len(downloaded_images)} images"
                )

        except Exception as e:
            logger.exception(f"Job {job_id} failed: {e}")
            execution.status = JobStatus.FAILED
            execution.error_message = str(e)
            execution.error_traceback = traceback.format_exc()
            execution.completed_at = datetime.utcnow()
            job.status = JobStatus.FAILED
            job.error_message = str(e)
            job.completed_at = datetime.utcnow()
            raise

        finally:
            self._job_repo.save(job)

        return job

    async def get_job(self, job_id: str) -> Job | None:
        """Get a job by ID.

        Args:
            job_id: The unique identifier of the job.

        Returns:
            Job object if found, None otherwise.
        """
        return self._job_repo.get(job_id)

    def _apply_progress_update(
        self, execution: NodeExecution, update: ProgressUpdate
    ) -> None:
        if update.percent is not None:
            execution.progress = update.percent
        if update.current_step:
            execution.current_step = update.current_step
        elif update.node_id:
            execution.current_step = f"node {update.node_id}"

    def _image_output_to_dict(self, output: Any) -> dict[str, str]:
        return {
            "filename": output.filename,
            "subfolder": output.subfolder,
            "type": output.image_type,
        }

    def _default_client_factory(self, backend: BackendConfig) -> ComfyUIClient:
        return ComfyUIClient(backend.host, backend.port)


def _percent(value: float, total: int) -> float:
    if total == 0:
        return 0.0
    return (value / total) * 100


def _split_into_chunks(items: list[Any], count: int) -> list[list[Any]]:
    if count <= 0:
        return []
    chunks: list[list[Any]] = [[] for _ in range(count)]
    for index, item in enumerate(items):
        chunks[index % count].append(item)
    return chunks
