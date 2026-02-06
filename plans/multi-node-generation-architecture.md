# Multi-Node Parallel Generation Architecture

## Executive Summary

This document describes the architecture for enabling parallel generation across multiple render nodes in the Director's Console storyboard system. Users will be able to select multiple render nodes for a single storyboard panel, with each node generating a unique variation using different seeds. Results stream back as they complete, with robust failure isolation ensuring partial failures don't block successful generations.

---

## 1. System Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CPE Frontend                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                      StoryboardUI.tsx                                    ││
│  │  ┌─────────────┐    ┌──────────────────┐    ┌────────────────────────┐ ││
│  │  │   Panel     │    │ MultiNodeSelect  │    │ ParallelResultsView    │ ││
│  │  │ Component   │◄──►│   Component      │    │    Component           │ ││
│  │  └──────┬──────┘    └────────┬─────────┘    └───────────┬────────────┘ ││
│  │         │                    │                          │              ││
│  │         └────────────────────┼──────────────────────────┘              ││
│  │                              ▼                                         ││
│  │  ┌─────────────────────────────────────────────────────────────────┐  ││
│  │  │                  ParallelGenerationStore                         │  ││
│  │  │  - activeJobGroups: Map<panelId, JobGroup>                       │  ││
│  │  │  - pendingResults: Map<jobGroupId, GenerationResult[]>           │  ││
│  │  └─────────────────────────────┬───────────────────────────────────┘  ││
│  └────────────────────────────────┼─────────────────────────────────────┘│
│                                   │                                       │
│                                   ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                 ParallelGenerationService                            │ │
│  │  - submitParallelJobs                                                │ │
│  │  - handleJobGroupProgress                                            │ │
│  │  - collectStreamingResults                                           │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP POST /api/job-group
                                    │ WebSocket /ws/job-groups/{id}
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Orchestrator API :8020                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      api/server.py                                   │   │
│  │  POST /api/job-group     - Submit parallel job group                 │   │
│  │  GET  /api/job-groups/{id} - Get job group status                    │   │
│  │  WS   /ws/job-groups/{id}  - Stream results as they complete         │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                          │
│  ┌──────────────────────────────▼──────────────────────────────────────┐   │
│  │                    ParallelJobManager                                │   │
│  │  - createJobGroup                                                    │   │
│  │  - dispatchToBackends                                                │   │
│  │  - handleChildJobComplete                                            │   │
│  │  - handleChildJobFailed                                              │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                          │
│  ┌──────────────────────────────▼──────────────────────────────────────┐   │
│  │                     SeedVariationEngine                              │   │
│  │  - generateSeeds                                                     │   │
│  │  - strategies: random, sequential, fibonacci, golden_ratio           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │ ComfyUI   │   │ ComfyUI   │   │ ComfyUI   │
            │ Node 1    │   │ Node 2    │   │ Node 3    │
            │ :8188     │   │ :8188     │   │ :8188     │
            └───────────┘   └───────────┘   └───────────┘
```

### 1.2 Data Flow for Multi-Node Generation

```
User Action: Select nodes [A, B, C] → Click Generate

1. Frontend creates JobGroupRequest:
   {
     workflow_json: {...},
     target_backends: ["node_A", "node_B", "node_C"],
     seed_strategy: "random",
     base_seed: 42  // optional
   }

2. POST /api/job-group → Orchestrator creates JobGroup:
   {
     id: "jg_123",
     child_jobs: [
       {job_id: "j_1", backend: "node_A", seed: 42},
       {job_id: "j_2", backend: "node_B", seed: 8765},
       {job_id: "j_3", backend: "node_C", seed: 3210}
     ],
     status: "running"
   }

3. Orchestrator dispatches jobs in parallel

4. Frontend connects WebSocket /ws/job-groups/jg_123

5. As each job completes, WS emits:
   {"type": "child_completed", "job_id": "j_2", "outputs": {...}}

6. Frontend immediately displays result without waiting for others

7. If job fails:
   {"type": "child_failed", "job_id": "j_1", "error": "..."}
   Other jobs continue unaffected
```

---

## 2. API Design

### 2.1 New Endpoints

#### POST /api/job-group
Submit a parallel generation job across multiple backends.

**Request:**
```json
{
  "workflow_json": {
    "3": {"class_type": "KSampler", "inputs": {...}},
    ...
  },
  "parameters": {
    "seed": 42,
    "steps": 20
  },
  "target_backends": ["localhost_8188", "192.168.100.6_8188"],
  "seed_strategy": "random",
  "base_seed": 42,
  "metadata": {
    "panel_id": 3,
    "scene": "shot_001"
  },
  "timeout_seconds": 300,
  "required_capabilities": []
}
```

**Response:**
```json
{
  "job_group_id": "jg_abc123",
  "child_jobs": [
    {
      "job_id": "j_001",
      "backend_id": "localhost_8188",
      "seed": 42,
      "status": "queued"
    },
    {
      "job_id": "j_002",
      "backend_id": "192.168.100.6_8188",
      "seed": 98765,
      "status": "queued"
    }
  ],
  "status": "running",
  "created_at": "2026-02-01T07:00:00Z"
}
```

#### GET /api/job-groups/{id}
Get current status of a job group.

**Response:**
```json
{
  "job_group_id": "jg_abc123",
  "status": "partial_complete",
  "child_jobs": [
    {
      "job_id": "j_001",
      "backend_id": "localhost_8188",
      "seed": 42,
      "status": "completed",
      "outputs": {
        "images": [{"filename": "out_001.png", "url": "..."}]
      },
      "completed_at": "2026-02-01T07:01:30Z"
    },
    {
      "job_id": "j_002",
      "backend_id": "192.168.100.6_8188",
      "seed": 98765,
      "status": "running",
      "progress": 45.0
    }
  ],
  "completed_count": 1,
  "failed_count": 0,
  "total_count": 2
}
```

#### DELETE /api/job-groups/{id}
Cancel an active job group. Attempts to interrupt all running child jobs.

**Response:**
```json
{
  "cancelled": true,
  "jobs_interrupted": 2,
  "jobs_already_complete": 1
}
```

### 2.2 WebSocket Events

#### WS /ws/job-groups/{job_group_id}
Real-time streaming of job group progress and results.

**Server → Client Events:**

```typescript
// Child job progress update
{
  "type": "child_progress",
  "job_id": "j_001",
  "backend_id": "localhost_8188",
  "progress": 65.0,
  "current_step": "KSampler",
  "steps_completed": 13,
  "steps_total": 20
}

// Child job completed - includes full output data
{
  "type": "child_completed",
  "job_id": "j_001",
  "backend_id": "localhost_8188",
  "seed": 42,
  "outputs": {
    "images": [
      {
        "filename": "ComfyUI_00001_.png",
        "url": "http://localhost:8188/view?filename=...",
        "subfolder": "",
        "type": "output"
      }
    ],
    "execution_time": 12.5
  },
  "completed_at": "2026-02-01T07:01:30Z"
}

// Child job failed - other jobs continue
{
  "type": "child_failed",
  "job_id": "j_002",
  "backend_id": "192.168.100.6_8188",
  "error": "CUDA out of memory",
  "error_type": "ComfyUIError",
  "failed_at": "2026-02-01T07:01:45Z"
}

// Job group fully complete - all children done
{
  "type": "group_complete",
  "job_group_id": "jg_abc123",
  "total": 3,
  "succeeded": 2,
  "failed": 1,
  "results": [
    {"job_id": "j_001", "status": "completed", "outputs": {...}},
    {"job_id": "j_002", "status": "failed", "error": "..."},
    {"job_id": "j_003", "status": "completed", "outputs": {...}}
  ]
}

// Job timed out
{
  "type": "child_timeout",
  "job_id": "j_003",
  "backend_id": "192.168.100.7_8188",
  "timeout_seconds": 300,
  "timed_out_at": "2026-02-01T07:06:00Z"
}
```

### 2.3 Pydantic Models

```python
# orchestrator/core/models/job_group.py

from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


class SeedStrategy(str, Enum):
    """Strategy for generating unique seeds per backend."""
    RANDOM = "random"           # Random seeds with minimum distance
    SEQUENTIAL = "sequential"   # base_seed, base_seed+1, base_seed+2...
    FIBONACCI = "fibonacci"     # Fibonacci-based spacing
    GOLDEN_RATIO = "golden_ratio"  # Golden ratio multiplicative spacing


class JobGroupStatus(str, Enum):
    """Status of the entire job group."""
    PENDING = "pending"
    RUNNING = "running"
    PARTIAL_COMPLETE = "partial_complete"  # Some succeeded, some failed/running
    COMPLETED = "completed"               # All succeeded
    FAILED = "failed"                     # All failed
    CANCELLED = "cancelled"


class ChildJobStatus(str, Enum):
    """Status of an individual child job."""
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


class ChildJob(BaseModel):
    """A single job within a parallel job group."""
    job_id: str
    backend_id: str
    seed: int
    status: ChildJobStatus = ChildJobStatus.QUEUED
    progress: float = 0.0
    current_step: str | None = None
    outputs: dict[str, Any] = Field(default_factory=dict)
    error_message: str | None = None
    error_type: str | None = None
    queued_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: datetime | None = None
    completed_at: datetime | None = None


class JobGroup(BaseModel):
    """A group of parallel jobs for multi-node generation."""
    id: str
    panel_id: int | None = None
    workflow_json: dict[str, Any]
    parameters: dict[str, Any] = Field(default_factory=dict)
    seed_strategy: SeedStrategy = SeedStrategy.RANDOM
    base_seed: int | None = None
    child_jobs: list[ChildJob] = Field(default_factory=list)
    status: JobGroupStatus = JobGroupStatus.PENDING
    timeout_seconds: int = 300
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None
    
    @property
    def completed_count(self) -> int:
        return sum(1 for j in self.child_jobs if j.status == ChildJobStatus.COMPLETED)
    
    @property
    def failed_count(self) -> int:
        return sum(1 for j in self.child_jobs 
                   if j.status in [ChildJobStatus.FAILED, ChildJobStatus.TIMEOUT])
    
    @property
    def running_count(self) -> int:
        return sum(1 for j in self.child_jobs 
                   if j.status in [ChildJobStatus.RUNNING, ChildJobStatus.QUEUED])


class JobGroupSubmissionRequest(BaseModel):
    """Request to create a parallel job group."""
    workflow_json: dict[str, Any] = Field(
        ...,
        description="Full ComfyUI workflow in API JSON format"
    )
    parameters: dict[str, Any] = Field(
        default_factory=dict,
        description="Parameter overrides to apply to workflow"
    )
    target_backends: list[str] = Field(
        ...,
        min_length=1,
        description="List of backend IDs to execute on"
    )
    seed_strategy: SeedStrategy = Field(
        default=SeedStrategy.RANDOM,
        description="Strategy for generating unique seeds"
    )
    base_seed: int | None = Field(
        default=None,
        description="Base seed for sequential/derived strategies. Random if None."
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Metadata like panel_id, scene name"
    )
    timeout_seconds: int = Field(
        default=300,
        ge=30,
        le=3600,
        description="Timeout per job in seconds"
    )
    required_capabilities: list[str] = Field(
        default_factory=list,
        description="Required backend capabilities"
    )


class JobGroupSubmissionResponse(BaseModel):
    """Response after creating a job group."""
    job_group_id: str
    child_jobs: list[ChildJob]
    status: JobGroupStatus
    created_at: datetime


class JobGroupStatusResponse(BaseModel):
    """Full status of a job group."""
    job_group_id: str
    status: JobGroupStatus
    child_jobs: list[ChildJob]
    completed_count: int
    failed_count: int
    total_count: int
    created_at: datetime
    completed_at: datetime | None = None
```

---

## 3. Backend Changes

### 3.1 ParallelJobManager

New class responsible for managing job groups and coordinating parallel execution.

```python
# orchestrator/core/engine/parallel_job_manager.py

from __future__ import annotations
import asyncio
import uuid
from datetime import datetime
from typing import Any, Callable
import logging

from orchestrator.core.models.job_group import (
    JobGroup, JobGroupStatus, ChildJob, ChildJobStatus,
    SeedStrategy, JobGroupSubmissionRequest
)
from orchestrator.core.engine.seed_variation import SeedVariationEngine
from orchestrator.backends.client import ComfyUIClient
from orchestrator.core.models.backend import BackendConfig

logger = logging.getLogger(__name__)


class ParallelJobManager:
    """Manages parallel job execution across multiple backends.
    
    Key responsibilities:
    - Create job groups with unique seeds per backend
    - Dispatch jobs to backends in parallel
    - Track progress and collect results
    - Handle failures with isolation (one failure doesn't affect others)
    - Emit WebSocket events for streaming results
    """
    
    def __init__(
        self,
        backend_manager: Any,
        client_factory: Callable[[BackendConfig], ComfyUIClient] | None = None,
    ):
        self._backend_manager = backend_manager
        self._client_factory = client_factory or self._default_client_factory
        self._seed_engine = SeedVariationEngine()
        self._active_groups: dict[str, JobGroup] = {}
        self._websocket_handlers: dict[str, Callable] = {}
        self._running_tasks: dict[str, asyncio.Task] = {}  # job_id -> task
    
    def _default_client_factory(self, backend: BackendConfig) -> ComfyUIClient:
        return ComfyUIClient(backend.host, backend.port)
    
    async def create_and_execute(
        self,
        request: JobGroupSubmissionRequest,
    ) -> JobGroup:
        """Create a job group and begin parallel execution.
        
        Args:
            request: Job group submission parameters
            
        Returns:
            JobGroup with queued child jobs
        """
        # Generate unique job group ID
        job_group_id = f"jg_{uuid.uuid4().hex[:12]}"
        
        # Validate backends
        valid_backends = []
        for backend_id in request.target_backends:
            backend = self._backend_manager.get(backend_id)
            if backend and backend.enabled:
                status = self._backend_manager.get_status(backend_id)
                if status and status.online:
                    valid_backends.append(backend)
                else:
                    logger.warning(f"Backend {backend_id} is offline, skipping")
            else:
                logger.warning(f"Backend {backend_id} not found or disabled")
        
        if not valid_backends:
            raise ValueError("No valid online backends available")
        
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
        
        return job_group
    
    async def _execute_group(self, job_group: JobGroup) -> None:
        """Execute all child jobs in parallel with isolation."""
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
        await self._emit_event(job_group.id, {
            "type": "group_complete",
            "job_group_id": job_group.id,
            "total": len(job_group.child_jobs),
            "succeeded": job_group.completed_count,
            "failed": job_group.failed_count,
            "results": [
                {
                    "job_id": j.job_id,
                    "status": j.status.value,
                    "outputs": j.outputs if j.status == ChildJobStatus.COMPLETED else None,
                    "error": j.error_message if j.status in [ChildJobStatus.FAILED, ChildJobStatus.TIMEOUT] else None,
                }
                for j in job_group.child_jobs
            ]
        })
    
    async def _execute_child_job(
        self,
        job_group: JobGroup,
        child_job: ChildJob,
    ) -> None:
        """Execute a single child job with timeout and error handling.
        
        This method is designed for isolation - failures here don't propagate
        to other child jobs.
        """
        backend = self._backend_manager.get(child_job.backend_id)
        if not backend:
            child_job.status = ChildJobStatus.FAILED
            child_job.error_message = f"Backend {child_job.backend_id} not found"
            await self._emit_event(job_group.id, {
                "type": "child_failed",
                "job_id": child_job.job_id,
                "backend_id": child_job.backend_id,
                "error": child_job.error_message,
            })
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
                
                # Monitor progress
                async for update in client.monitor_progress(prompt_id):
                    child_job.progress = (update.value / update.max) * 100 if update.max > 0 else 0
                    child_job.current_step = update.node
                    
                    await self._emit_event(job_group.id, {
                        "type": "child_progress",
                        "job_id": child_job.job_id,
                        "backend_id": child_job.backend_id,
                        "progress": child_job.progress,
                        "current_step": child_job.current_step,
                    })
                
                # Get results
                history = await client.get_history(prompt_id)
                outputs = await self._collect_outputs(client, history, prompt_id)
                
                child_job.status = ChildJobStatus.COMPLETED
                child_job.completed_at = datetime.utcnow()
                child_job.outputs = outputs
                child_job.progress = 100.0
                
                # Emit completion event with outputs
                await self._emit_event(job_group.id, {
                    "type": "child_completed",
                    "job_id": child_job.job_id,
                    "backend_id": child_job.backend_id,
                    "seed": child_job.seed,
                    "outputs": outputs,
                    "completed_at": child_job.completed_at.isoformat(),
                })
        
        except asyncio.TimeoutError:
            child_job.status = ChildJobStatus.TIMEOUT
            child_job.error_message = f"Timeout after {job_group.timeout_seconds}s"
            await self._emit_event(job_group.id, {
                "type": "child_timeout",
                "job_id": child_job.job_id,
                "backend_id": child_job.backend_id,
                "timeout_seconds": job_group.timeout_seconds,
            })
            # Attempt to interrupt the backend
            try:
                await client.interrupt()
            except Exception:
                pass
        
        except asyncio.CancelledError:
            child_job.status = ChildJobStatus.CANCELLED
            await self._emit_event(job_group.id, {
                "type": "child_cancelled",
                "job_id": child_job.job_id,
                "backend_id": child_job.backend_id,
            })
            raise
        
        except Exception as e:
            child_job.status = ChildJobStatus.FAILED
            child_job.error_message = str(e)
            child_job.error_type = type(e).__name__
            logger.error(f"Child job {child_job.job_id} failed: {e}")
            
            await self._emit_event(job_group.id, {
                "type": "child_failed",
                "job_id": child_job.job_id,
                "backend_id": child_job.backend_id,
                "error": str(e),
                "error_type": type(e).__name__,
            })
        
        finally:
            self._running_tasks.pop(child_job.job_id, None)
            try:
                await client.close()
            except Exception:
                pass
    
    def _patch_seed(
        self,
        workflow: dict[str, Any],
        seed: int,
        parameters: dict[str, Any],
    ) -> dict[str, Any]:
        """Patch seed into workflow, respecting any parameter overrides."""
        from copy import deepcopy
        patched = deepcopy(workflow)
        
        # Apply general parameters first
        from orchestrator.core.engine.parameter_patcher import patch_parameters
        patched = patch_parameters(patched, [], parameters)
        
        # Then override seed in all KSampler nodes
        for node_id, node_data in patched.items():
            if not isinstance(node_data, dict):
                continue
            class_type = node_data.get("class_type", "")
            if "sampler" in class_type.lower() or "ksampler" in class_type.lower():
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
        """Collect outputs from completed job."""
        outputs_list = client.download_outputs(history)
        
        images = []
        for output in outputs_list:
            images.append({
                "filename": output.filename,
                "subfolder": output.subfolder,
                "type": output.image_type,
                "url": f"http://{client._host}:{client._port}/view?"
                       f"filename={output.filename}&subfolder={output.subfolder}&type={output.image_type}",
            })
        
        return {"images": images, "prompt_id": prompt_id}
    
    def _update_group_status(self, job_group: JobGroup) -> None:
        """Update the overall group status based on child job states."""
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
        
        if job_group.status in [JobGroupStatus.COMPLETED, JobGroupStatus.FAILED, JobGroupStatus.PARTIAL_COMPLETE]:
            job_group.completed_at = datetime.utcnow()
    
    async def cancel_group(self, job_group_id: str) -> dict[str, int]:
        """Cancel all running jobs in a group."""
        job_group = self._active_groups.get(job_group_id)
        if not job_group:
            raise ValueError(f"Job group {job_group_id} not found")
        
        interrupted = 0
        already_complete = 0
        
        for child_job in job_group.child_jobs:
            if child_job.status in [ChildJobStatus.COMPLETED, ChildJobStatus.FAILED, ChildJobStatus.TIMEOUT]:
                already_complete += 1
                continue
            
            task = self._running_tasks.get(child_job.job_id)
            if task:
                task.cancel()
                interrupted += 1
        
        job_group.status = JobGroupStatus.CANCELLED
        
        return {"interrupted": interrupted, "already_complete": already_complete}
    
    def register_websocket_handler(
        self,
        job_group_id: str,
        handler: Callable,
    ) -> None:
        """Register a WebSocket handler for streaming events."""
        self._websocket_handlers[job_group_id] = handler
    
    def unregister_websocket_handler(self, job_group_id: str) -> None:
        """Unregister a WebSocket handler."""
        self._websocket_handlers.pop(job_group_id, None)
    
    async def _emit_event(self, job_group_id: str, event: dict) -> None:
        """Emit an event to registered WebSocket handlers."""
        handler = self._websocket_handlers.get(job_group_id)
        if handler:
            try:
                await handler(event)
            except Exception as e:
                logger.error(f"Error emitting event: {e}")
    
    def get_group(self, job_group_id: str) -> JobGroup | None:
        """Get a job group by ID."""
        return self._active_groups.get(job_group_id)
```

### 3.2 SeedVariationEngine

```python
# orchestrator/core/engine/seed_variation.py

from __future__ import annotations
import random
from typing import Sequence
from orchestrator.core.models.job_group import SeedStrategy


class SeedVariationEngine:
    """Generates unique seeds for parallel generation.
    
    Different strategies ensure visual diversity while maintaining
    reproducibility when needed.
    """
    
    # Seed range limits (ComfyUI uses 64-bit seeds)
    MIN_SEED = 0
    MAX_SEED = 2**63 - 1
    
    # Minimum distance between random seeds to ensure visual diversity
    MIN_RANDOM_DISTANCE = 1_000_000
    
    def generate_seeds(
        self,
        count: int,
        strategy: SeedStrategy = SeedStrategy.RANDOM,
        base_seed: int | None = None,
    ) -> list[int]:
        """Generate unique seeds for parallel generation.
        
        Args:
            count: Number of seeds to generate
            strategy: Strategy for seed generation
            base_seed: Starting seed (random if None)
            
        Returns:
            List of unique seeds
        """
        if count <= 0:
            return []
        
        if base_seed is None:
            base_seed = random.randint(self.MIN_SEED, self.MAX_SEED - count * self.MIN_RANDOM_DISTANCE)
        
        base_seed = self._clamp_seed(base_seed)
        
        if strategy == SeedStrategy.SEQUENTIAL:
            return self._sequential_seeds(base_seed, count)
        elif strategy == SeedStrategy.FIBONACCI:
            return self._fibonacci_seeds(base_seed, count)
        elif strategy == SeedStrategy.GOLDEN_RATIO:
            return self._golden_ratio_seeds(base_seed, count)
        else:  # RANDOM
            return self._random_seeds(base_seed, count)
    
    def _random_seeds(self, base_seed: int, count: int) -> list[int]:
        """Generate random seeds with minimum distance guarantee."""
        seeds = [base_seed]
        rng = random.Random(base_seed)  # Seeded for reproducibility
        
        for _ in range(count - 1):
            attempts = 0
            while attempts < 100:
                candidate = rng.randint(self.MIN_SEED, self.MAX_SEED)
                # Ensure minimum distance from all existing seeds
                if all(abs(candidate - s) >= self.MIN_RANDOM_DISTANCE for s in seeds):
                    seeds.append(candidate)
                    break
                attempts += 1
            else:
                # Fallback: just pick a random seed
                seeds.append(rng.randint(self.MIN_SEED, self.MAX_SEED))
        
        return seeds
    
    def _sequential_seeds(self, base_seed: int, count: int) -> list[int]:
        """Generate sequential seeds: base, base+1, base+2, ..."""
        return [self._clamp_seed(base_seed + i) for i in range(count)]
    
    def _fibonacci_seeds(self, base_seed: int, count: int) -> list[int]:
        """Generate seeds using Fibonacci-like spacing.
        
        Spacing: 1, 1, 2, 3, 5, 8, 13, 21, ...
        """
        seeds = [base_seed]
        fib = [1, 1]
        offset = 0
        
        for i in range(count - 1):
            if i < len(fib):
                offset += fib[i] * 1000
            else:
                next_fib = fib[-1] + fib[-2]
                fib.append(next_fib)
                offset += next_fib * 1000
            
            seeds.append(self._clamp_seed(base_seed + offset))
        
        return seeds
    
    def _golden_ratio_seeds(self, base_seed: int, count: int) -> list[int]:
        """Generate seeds using golden ratio spacing.
        
        Each seed is multiplied by phi (1.618...) from the base.
        """
        PHI = 1.6180339887498949
        seeds = [base_seed]
        
        for i in range(1, count):
            # Use multiplicative spacing with golden ratio
            multiplier = PHI ** i
            offset = int(base_seed * (multiplier - 1))
            seeds.append(self._clamp_seed(base_seed + offset))
        
        return seeds
    
    def _clamp_seed(self, seed: int) -> int:
        """Clamp seed to valid range with wraparound."""
        return seed % (self.MAX_SEED + 1)
```

### 3.3 WebSocket Handler Integration

Add to [`api/server.py`](Orchestrator/orchestrator/api/server.py:1):

```python
# Add these imports
from fastapi import WebSocket, WebSocketDisconnect
from orchestrator.core.engine.parallel_job_manager import ParallelJobManager
from orchestrator.core.models.job_group import (
    JobGroupSubmissionRequest,
    JobGroupSubmissionResponse,
    JobGroupStatusResponse,
)

# Global parallel job manager
_parallel_job_manager: ParallelJobManager | None = None

def set_parallel_job_manager(manager: ParallelJobManager) -> None:
    global _parallel_job_manager
    _parallel_job_manager = manager


# New endpoints
@app.post("/api/job-group", response_model=JobGroupSubmissionResponse)
async def submit_job_group(request: JobGroupSubmissionRequest) -> JobGroupSubmissionResponse:
    """Submit a parallel job group for execution across multiple backends."""
    if not _parallel_job_manager:
        raise HTTPException(503, "ParallelJobManager not initialized")
    
    try:
        job_group = await _parallel_job_manager.create_and_execute(request)
        return JobGroupSubmissionResponse(
            job_group_id=job_group.id,
            child_jobs=job_group.child_jobs,
            status=job_group.status,
            created_at=job_group.created_at,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/job-groups/{job_group_id}", response_model=JobGroupStatusResponse)
async def get_job_group_status(job_group_id: str) -> JobGroupStatusResponse:
    """Get status of a job group."""
    if not _parallel_job_manager:
        raise HTTPException(503, "ParallelJobManager not initialized")
    
    job_group = _parallel_job_manager.get_group(job_group_id)
    if not job_group:
        raise HTTPException(404, f"Job group {job_group_id} not found")
    
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


@app.delete("/api/job-groups/{job_group_id}")
async def cancel_job_group(job_group_id: str) -> dict:
    """Cancel a job group."""
    if not _parallel_job_manager:
        raise HTTPException(503, "ParallelJobManager not initialized")
    
    try:
        result = await _parallel_job_manager.cancel_group(job_group_id)
        return {"cancelled": True, **result}
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.websocket("/ws/job-groups/{job_group_id}")
async def job_group_websocket(websocket: WebSocket, job_group_id: str):
    """WebSocket for streaming job group progress and results."""
    await websocket.accept()
    
    if not _parallel_job_manager:
        await websocket.close(code=1011, reason="Service unavailable")
        return
    
    job_group = _parallel_job_manager.get_group(job_group_id)
    if not job_group:
        await websocket.close(code=1008, reason="Job group not found")
        return
    
    # Handler to forward events to WebSocket
    async def send_event(event: dict):
        try:
            await websocket.send_json(event)
        except Exception:
            pass
    
    _parallel_job_manager.register_websocket_handler(job_group_id, send_event)
    
    try:
        # Send current state
        await websocket.send_json({
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
            ]
        })
        
        # Keep connection open
        while True:
            try:
                msg = await websocket.receive_text()
                # Handle client messages (e.g., ping, cancel request)
                if msg == "ping":
                    await websocket.send_json({"type": "pong"})
            except WebSocketDisconnect:
                break
    
    finally:
        _parallel_job_manager.unregister_websocket_handler(job_group_id)
```

---

## 4. Frontend Changes

### 4.1 Multi-Node Selection Component

```typescript
// CinemaPromptEngineering/frontend/src/storyboard/components/MultiNodeSelector.tsx

import { useState, useEffect } from 'react';
import { RenderNode, useRenderNodes } from '../services/orchestrator';
import './MultiNodeSelector.css';

interface MultiNodeSelectorProps {
  selectedNodeIds: string[];
  onChange: (nodeIds: string[]) => void;
  maxSelections?: number;
  disabled?: boolean;
}

export function MultiNodeSelector({
  selectedNodeIds,
  onChange,
  maxSelections = 10,
  disabled = false,
}: MultiNodeSelectorProps) {
  const nodes = useRenderNodes();
  const onlineNodes = nodes.filter(n => n.status === 'online' || n.status === 'busy');
  
  const toggleNode = (nodeId: string) => {
    if (disabled) return;
    
    if (selectedNodeIds.includes(nodeId)) {
      onChange(selectedNodeIds.filter(id => id !== nodeId));
    } else if (selectedNodeIds.length < maxSelections) {
      onChange([...selectedNodeIds, nodeId]);
    }
  };
  
  const selectAll = () => {
    if (disabled) return;
    onChange(onlineNodes.slice(0, maxSelections).map(n => n.id));
  };
  
  const clearAll = () => {
    if (disabled) return;
    onChange([]);
  };
  
  return (
    <div className="multi-node-selector">
      <div className="selector-header">
        <span className="selector-label">
          Target Nodes ({selectedNodeIds.length}/{onlineNodes.length})
        </span>
        <div className="selector-actions">
          <button 
            className="mini-btn" 
            onClick={selectAll}
            disabled={disabled || selectedNodeIds.length === onlineNodes.length}
          >
            All
          </button>
          <button 
            className="mini-btn" 
            onClick={clearAll}
            disabled={disabled || selectedNodeIds.length === 0}
          >
            Clear
          </button>
        </div>
      </div>
      
      <div className="node-chips">
        {onlineNodes.length === 0 ? (
          <span className="no-nodes-hint">No online nodes available</span>
        ) : (
          onlineNodes.map(node => (
            <button
              key={node.id}
              className={`node-chip ${selectedNodeIds.includes(node.id) ? 'selected' : ''}`}
              onClick={() => toggleNode(node.id)}
              disabled={disabled}
              title={`${node.gpuName} - ${node.vramTotal}MB VRAM`}
            >
              <span className={`status-dot ${node.status}`} />
              <span className="node-name">{node.name}</span>
            </button>
          ))
        )}
      </div>
      
      {selectedNodeIds.length > 1 && (
        <div className="parallel-hint">
          ⚡ {selectedNodeIds.length} parallel generations with unique seeds
        </div>
      )}
    </div>
  );
}
```

### 4.2 Parallel Generation Service

```typescript
// CinemaPromptEngineering/frontend/src/storyboard/services/parallel-generation.ts

export interface ChildJobResult {
  jobId: string;
  backendId: string;
  seed: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'timeout';
  progress: number;
  outputs?: {
    images: Array<{
      filename: string;
      url: string;
      subfolder: string;
      type: string;
    }>;
  };
  error?: string;
}

export interface JobGroupState {
  jobGroupId: string;
  status: 'running' | 'partial_complete' | 'completed' | 'failed' | 'cancelled';
  childJobs: ChildJobResult[];
  completedCount: number;
  failedCount: number;
}

export type ParallelGenerationCallback = {
  onChildProgress: (jobId: string, progress: number) => void;
  onChildCompleted: (jobId: string, result: ChildJobResult) => void;
  onChildFailed: (jobId: string, error: string) => void;
  onGroupComplete: (state: JobGroupState) => void;
};

export class ParallelGenerationService {
  private orchestratorUrl: string;
  private activeWebSockets: Map<string, WebSocket> = new Map();
  
  constructor(orchestratorUrl: string = 'http://localhost:8020') {
    this.orchestratorUrl = orchestratorUrl;
  }
  
  setOrchestratorUrl(url: string) {
    this.orchestratorUrl = url;
  }
  
  async submitParallelGeneration(
    workflowJson: Record<string, unknown>,
    parameters: Record<string, unknown>,
    targetBackends: string[],
    metadata: Record<string, unknown>,
    callbacks: ParallelGenerationCallback,
  ): Promise<JobGroupState> {
    // Submit job group
    const response = await fetch(`${this.orchestratorUrl}/api/job-group`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_json: workflowJson,
        parameters,
        target_backends: targetBackends,
        seed_strategy: 'random',
        metadata,
        timeout_seconds: 300,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to submit job group: ${error}`);
    }
    
    const data = await response.json();
    const jobGroupId = data.job_group_id;
    
    // Connect WebSocket for streaming results
    return new Promise((resolve, reject) => {
      const wsUrl = this.orchestratorUrl.replace(/^http/, 'ws');
      const ws = new WebSocket(`${wsUrl}/ws/job-groups/${jobGroupId}`);
      
      this.activeWebSockets.set(jobGroupId, ws);
      
      let state: JobGroupState = {
        jobGroupId,
        status: 'running',
        childJobs: data.child_jobs.map((j: any) => ({
          jobId: j.job_id,
          backendId: j.backend_id,
          seed: j.seed,
          status: j.status,
          progress: 0,
        })),
        completedCount: 0,
        failedCount: 0,
      };
      
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        
        switch (msg.type) {
          case 'child_progress':
            callbacks.onChildProgress(msg.job_id, msg.progress);
            // Update local state
            const progJob = state.childJobs.find(j => j.jobId === msg.job_id);
            if (progJob) {
              progJob.progress = msg.progress;
              progJob.status = 'running';
            }
            break;
          
          case 'child_completed':
            const completedJob: ChildJobResult = {
              jobId: msg.job_id,
              backendId: msg.backend_id,
              seed: msg.seed,
              status: 'completed',
              progress: 100,
              outputs: msg.outputs,
            };
            callbacks.onChildCompleted(msg.job_id, completedJob);
            
            // Update local state
            const idx = state.childJobs.findIndex(j => j.jobId === msg.job_id);
            if (idx >= 0) {
              state.childJobs[idx] = completedJob;
            }
            state.completedCount++;
            break;
          
          case 'child_failed':
          case 'child_timeout':
            callbacks.onChildFailed(msg.job_id, msg.error || 'Timeout');
            
            const failIdx = state.childJobs.findIndex(j => j.jobId === msg.job_id);
            if (failIdx >= 0) {
              state.childJobs[failIdx].status = msg.type === 'child_timeout' ? 'timeout' : 'failed';
              state.childJobs[failIdx].error = msg.error || 'Timeout';
            }
            state.failedCount++;
            break;
          
          case 'group_complete':
            state.status = msg.succeeded === msg.total ? 'completed' :
                          msg.failed === msg.total ? 'failed' : 'partial_complete';
            callbacks.onGroupComplete(state);
            
            ws.close();
            this.activeWebSockets.delete(jobGroupId);
            resolve(state);
            break;
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(new Error('WebSocket connection failed'));
      };
      
      ws.onclose = () => {
        this.activeWebSockets.delete(jobGroupId);
      };
    });
  }
  
  cancelJobGroup(jobGroupId: string): void {
    const ws = this.activeWebSockets.get(jobGroupId);
    if (ws) {
      ws.close();
      this.activeWebSockets.delete(jobGroupId);
    }
    
    // Also call cancel endpoint
    fetch(`${this.orchestratorUrl}/api/job-groups/${jobGroupId}`, {
      method: 'DELETE',
    }).catch(console.error);
  }
}

// Singleton
export const parallelGenerationService = new ParallelGenerationService();
```

### 4.3 State Management Updates

```typescript
// CinemaPromptEngineering/frontend/src/storyboard/store/parallel-generation-store.ts

import { create } from 'zustand';
import { ChildJobResult, JobGroupState } from '../services/parallel-generation';

interface PanelParallelState {
  jobGroupId: string | null;
  isGenerating: boolean;
  childResults: ChildJobResult[];
  selectedResultIndex: number;  // Which result is currently displayed
  allResultsReceived: boolean;
}

interface ParallelGenerationStore {
  // State per panel
  panelStates: Map<number, PanelParallelState>;
  
  // Actions
  startParallelGeneration: (panelId: number, jobGroupId: string, childCount: number) => void;
  updateChildProgress: (panelId: number, jobId: string, progress: number) => void;
  addChildResult: (panelId: number, result: ChildJobResult) => void;
  setChildFailed: (panelId: number, jobId: string, error: string) => void;
  completeJobGroup: (panelId: number, state: JobGroupState) => void;
  selectResult: (panelId: number, resultIndex: number) => void;
  clearPanelState: (panelId: number) => void;
  
  // Getters
  getPanelState: (panelId: number) => PanelParallelState | undefined;
  getCompletedResults: (panelId: number) => ChildJobResult[];
}

const defaultPanelState: PanelParallelState = {
  jobGroupId: null,
  isGenerating: false,
  childResults: [],
  selectedResultIndex: 0,
  allResultsReceived: false,
};

export const useParallelGenerationStore = create<ParallelGenerationStore>((set, get) => ({
  panelStates: new Map(),
  
  startParallelGeneration: (panelId, jobGroupId, childCount) => {
    set(state => {
      const newStates = new Map(state.panelStates);
      newStates.set(panelId, {
        jobGroupId,
        isGenerating: true,
        childResults: Array(childCount).fill(null).map((_, i) => ({
          jobId: '',
          backendId: '',
          seed: 0,
          status: 'queued' as const,
          progress: 0,
        })),
        selectedResultIndex: 0,
        allResultsReceived: false,
      });
      return { panelStates: newStates };
    });
  },
  
  updateChildProgress: (panelId, jobId, progress) => {
    set(state => {
      const panelState = state.panelStates.get(panelId);
      if (!panelState) return state;
      
      const newResults = panelState.childResults.map(r => 
        r.jobId === jobId ? { ...r, progress, status: 'running' as const } : r
      );
      
      const newStates = new Map(state.panelStates);
      newStates.set(panelId, { ...panelState, childResults: newResults });
      return { panelStates: newStates };
    });
  },
  
  addChildResult: (panelId, result) => {
    set(state => {
      const panelState = state.panelStates.get(panelId);
      if (!panelState) return state;
      
      // Find and update the matching child result
      const newResults = panelState.childResults.map(r => 
        r.jobId === result.jobId ? result : r
      );
      
      // If no match found (initial state), add to first empty slot
      const emptyIdx = newResults.findIndex(r => r.jobId === '');
      if (emptyIdx >= 0 && !newResults.some(r => r.jobId === result.jobId)) {
        newResults[emptyIdx] = result;
      }
      
      const newStates = new Map(state.panelStates);
      newStates.set(panelId, { ...panelState, childResults: newResults });
      return { panelStates: newStates };
    });
  },
  
  setChildFailed: (panelId, jobId, error) => {
    set(state => {
      const panelState = state.panelStates.get(panelId);
      if (!panelState) return state;
      
      const newResults = panelState.childResults.map(r => 
        r.jobId === jobId ? { ...r, status: 'failed' as const, error } : r
      );
      
      const newStates = new Map(state.panelStates);
      newStates.set(panelId, { ...panelState, childResults: newResults });
      return { panelStates: newStates };
    });
  },
  
  completeJobGroup: (panelId, groupState) => {
    set(state => {
      const panelState = state.panelStates.get(panelId);
      if (!panelState) return state;
      
      const newStates = new Map(state.panelStates);
      newStates.set(panelId, {
        ...panelState,
        isGenerating: false,
        allResultsReceived: true,
        childResults: groupState.childJobs,
      });
      return { panelStates: newStates };
    });
  },
  
  selectResult: (panelId, resultIndex) => {
    set(state => {
      const panelState = state.panelStates.get(panelId);
      if (!panelState) return state;
      
      const newStates = new Map(state.panelStates);
      newStates.set(panelId, { ...panelState, selectedResultIndex: resultIndex });
      return { panelStates: newStates };
    });
  },
  
  clearPanelState: (panelId) => {
    set(state => {
      const newStates = new Map(state.panelStates);
      newStates.delete(panelId);
      return { panelStates: newStates };
    });
  },
  
  getPanelState: (panelId) => {
    return get().panelStates.get(panelId);
  },
  
  getCompletedResults: (panelId) => {
    const panelState = get().panelStates.get(panelId);
    if (!panelState) return [];
    return panelState.childResults.filter(r => r.status === 'completed');
  },
}));
```

### 4.4 Parallel Results View Component

```typescript
// CinemaPromptEngineering/frontend/src/storyboard/components/ParallelResultsView.tsx

import { useMemo } from 'react';
import { ChildJobResult } from '../services/parallel-generation';
import { useParallelGenerationStore } from '../store/parallel-generation-store';
import './ParallelResultsView.css';

interface ParallelResultsViewProps {
  panelId: number;
  onSelectResult: (result: ChildJobResult) => void;
  onClose: () => void;
}

export function ParallelResultsView({
  panelId,
  onSelectResult,
  onClose,
}: ParallelResultsViewProps) {
  const { getPanelState, selectResult } = useParallelGenerationStore();
  const panelState = getPanelState(panelId);
  
  if (!panelState || panelState.childResults.length === 0) {
    return null;
  }
  
  const completedResults = panelState.childResults.filter(r => r.status === 'completed');
  const failedResults = panelState.childResults.filter(r => r.status === 'failed' || r.status === 'timeout');
  const runningResults = panelState.childResults.filter(r => r.status === 'running' || r.status === 'queued');
  
  return (
    <div className="parallel-results-view">
      <div className="results-header">
        <h3>Parallel Results</h3>
        <span className="results-summary">
          {completedResults.length} completed
          {failedResults.length > 0 && ` • ${failedResults.length} failed`}
          {runningResults.length > 0 && ` • ${runningResults.length} running`}
        </span>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>
      
      <div className="results-grid">
        {panelState.childResults.map((result, index) => (
          <div 
            key={result.jobId || index}
            className={`result-card ${result.status} ${index === panelState.selectedResultIndex ? 'selected' : ''}`}
            onClick={() => {
              if (result.status === 'completed') {
                selectResult(panelId, index);
                onSelectResult(result);
              }
            }}
          >
            {result.status === 'completed' && result.outputs?.images?.[0] && (
              <img 
                src={result.outputs.images[0].url}
                alt={`Seed ${result.seed}`}
                className="result-thumbnail"
              />
            )}
            
            {result.status === 'running' && (
              <div className="progress-overlay">
                <div className="progress-ring">
                  <svg viewBox="0 0 36 36">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="var(--accent-color)"
                      strokeWidth="3"
                      strokeDasharray={`${result.progress}, 100`}
                    />
                  </svg>
                  <span className="progress-text">{Math.round(result.progress)}%</span>
                </div>
              </div>
            )}
            
            {result.status === 'queued' && (
              <div className="status-overlay">
                <span className="queued-icon">⏳</span>
                <span>Queued</span>
              </div>
            )}
            
            {(result.status === 'failed' || result.status === 'timeout') && (
              <div className="error-overlay">
                <span className="error-icon">⚠️</span>
                <span className="error-text">{result.error || 'Failed'}</span>
              </div>
            )}
            
            <div className="result-info">
              <span className="seed-label">Seed: {result.seed}</span>
              <span className="backend-label">{result.backendId.split('_')[0]}</span>
            </div>
          </div>
        ))}
      </div>
      
      {completedResults.length > 1 && (
        <div className="results-actions">
          <button 
            className="action-btn"
            onClick={() => {
              // Save all results to panel history
              completedResults.forEach((r, i) => {
                // Implementation: add each result to panel's imageHistory
              });
            }}
          >
            Keep All Results
          </button>
          <button 
            className="action-btn secondary"
            onClick={() => {
              const selected = panelState.childResults[panelState.selectedResultIndex];
              if (selected) {
                onSelectResult(selected);
              }
              onClose();
            }}
          >
            Keep Selected Only
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## 5. Error Handling Strategy

### 5.1 Timeout Configuration

```python
# Default and configurable timeouts
DEFAULT_JOB_TIMEOUT = 300  # 5 minutes
MIN_TIMEOUT = 30           # 30 seconds minimum
MAX_TIMEOUT = 3600         # 1 hour maximum

# Per-backend timeout awareness
# If a backend has historical slow performance, adjust timeout
def calculate_adaptive_timeout(
    backend_id: str,
    base_timeout: int,
    historical_times: list[float],
) -> int:
    if not historical_times:
        return base_timeout
    
    avg_time = sum(historical_times) / len(historical_times)
    max_historical = max(historical_times)
    
    # Use 2x the max historical time or base, whichever is larger
    adaptive = int(max(base_timeout, max_historical * 2))
    return min(adaptive, MAX_TIMEOUT)
```

### 5.2 Failure Isolation Mechanism

The key principle is **complete isolation**: each child job runs in its own `asyncio.Task` with independent exception handling.

```python
async def _execute_group(self, job_group: JobGroup) -> None:
    """Execute all child jobs with complete isolation."""
    
    async def safe_execute(child_job: ChildJob) -> None:
        """Wrapper that catches ALL exceptions."""
        try:
            await self._execute_child_job(job_group, child_job)
        except asyncio.CancelledError:
            # Propagate cancellation
            raise
        except Exception as e:
            # Log but don't propagate - other jobs continue
            logger.error(f"Child job {child_job.job_id} failed: {e}")
            child_job.status = ChildJobStatus.FAILED
            child_job.error_message = str(e)
    
    # Create tasks with isolation wrapper
    tasks = [
        asyncio.create_task(safe_execute(child_job))
        for child_job in job_group.child_jobs
    ]
    
    # gather with return_exceptions=True ensures one failure doesn't cancel others
    await asyncio.gather(*tasks, return_exceptions=True)
```

### 5.3 Retry Policies

```python
class RetryPolicy:
    """Configurable retry behavior for failed jobs."""
    
    def __init__(
        self,
        max_retries: int = 0,              # 0 = no retries
        retry_on_timeout: bool = False,    # Retry if job times out
        retry_on_backend_error: bool = True,  # Retry on backend issues
        retry_on_different_backend: bool = True,  # Use different backend for retry
        retry_delay_seconds: float = 5.0,  # Delay before retry
    ):
        self.max_retries = max_retries
        self.retry_on_timeout = retry_on_timeout
        self.retry_on_backend_error = retry_on_backend_error
        self.retry_on_different_backend = retry_on_different_backend
        self.retry_delay_seconds = retry_delay_seconds
    
    def should_retry(self, child_job: ChildJob, attempt: int) -> bool:
        if attempt >= self.max_retries:
            return False
        
        if child_job.status == ChildJobStatus.TIMEOUT:
            return self.retry_on_timeout
        
        if child_job.status == ChildJobStatus.FAILED:
            # Check if it's a backend error vs user error
            error_type = child_job.error_type or ""
            if "CUDA" in error_type or "Network" in error_type:
                return self.retry_on_backend_error
        
        return False
```

### 5.4 User Notification for Partial Failures

```typescript
// Frontend notification handling

function handleGroupComplete(state: JobGroupState, panelId: number) {
  const { completedCount, failedCount, childJobs } = state;
  const total = childJobs.length;
  
  if (completedCount === total) {
    // All succeeded
    showSuccess(`All ${total} generations completed successfully!`);
  } else if (failedCount === total) {
    // All failed
    showError(`All ${total} generations failed. Check backend status.`);
  } else {
    // Partial success
    const failedNodes = childJobs
      .filter(j => j.status === 'failed' || j.status === 'timeout')
      .map(j => j.backendId.split('_')[0])
      .join(', ');
    
    showWarning(
      `${completedCount}/${total} generations completed. ` +
      `Failed on: ${failedNodes}. ` +
      `Results from successful nodes are available.`
    );
  }
  
  // Update panel with available results
  const successfulResults = childJobs.filter(j => j.status === 'completed');
  if (successfulResults.length > 0) {
    // Show results picker if multiple, or auto-select if single
    if (successfulResults.length === 1) {
      setPanelImage(panelId, successfulResults[0].outputs?.images?.[0]?.url);
    } else {
      showResultsPicker(panelId, successfulResults);
    }
  }
}
```

---

## 6. Data Models Summary

### 6.1 New Pydantic Models

| Model | Location | Purpose |
|-------|----------|---------|
| `SeedStrategy` | `core/models/job_group.py` | Enum for seed generation strategies |
| `JobGroupStatus` | `core/models/job_group.py` | Status enum for job groups |
| `ChildJobStatus` | `core/models/job_group.py` | Status enum for individual jobs |
| `ChildJob` | `core/models/job_group.py` | Single job within a group |
| `JobGroup` | `core/models/job_group.py` | Parent container for parallel jobs |
| `JobGroupSubmissionRequest` | `core/models/job_group.py` | API request model |
| `JobGroupSubmissionResponse` | `core/models/job_group.py` | API response model |
| `JobGroupStatusResponse` | `core/models/job_group.py` | Status query response |

### 6.2 Database Schema Changes

No persistent database changes required. Job groups are tracked in-memory during execution. For persistence across restarts (optional future enhancement):

```sql
-- Optional: Add to migrations/002_job_groups.sql

CREATE TABLE IF NOT EXISTS job_groups (
    id TEXT PRIMARY KEY,
    panel_id INTEGER,
    workflow_json TEXT NOT NULL,
    parameters TEXT,
    seed_strategy TEXT DEFAULT 'random',
    base_seed INTEGER,
    status TEXT NOT NULL,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS child_jobs (
    id TEXT PRIMARY KEY,
    job_group_id TEXT NOT NULL,
    backend_id TEXT NOT NULL,
    seed INTEGER NOT NULL,
    status TEXT NOT NULL,
    progress REAL DEFAULT 0,
    outputs TEXT,
    error_message TEXT,
    queued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (job_group_id) REFERENCES job_groups(id)
);

CREATE INDEX idx_child_jobs_group ON child_jobs(job_group_id);
```

---

## 7. Implementation Sequence

### Phase 1: Backend Infrastructure
1. Create `core/models/job_group.py` with all Pydantic models
2. Implement `SeedVariationEngine` in `core/engine/seed_variation.py`
3. Implement `ParallelJobManager` in `core/engine/parallel_job_manager.py`
4. Add new endpoints to `api/server.py`
5. Add WebSocket handler for streaming results

### Phase 2: Frontend Components
1. Create `MultiNodeSelector` component
2. Create `ParallelResultsView` component
3. Implement `ParallelGenerationService` 
4. Create Zustand store for parallel generation state

### Phase 3: Integration
1. Integrate `MultiNodeSelector` into panel UI
2. Update `generatePanel` to use parallel generation when multiple nodes selected
3. Integrate `ParallelResultsView` for displaying results
4. Update project save/load to include parallel generation metadata

### Phase 4: Polish & Testing
1. Add comprehensive error handling
2. Implement adaptive timeouts
3. Add unit tests for seed variation strategies
4. Add integration tests for parallel execution
5. Performance testing with multiple backends

---

## 8. Key Design Decisions

### 8.1 Why Job Groups Instead of Multiple Single Jobs?

- **Atomic management**: Cancel all related jobs at once
- **Unified progress tracking**: Single WebSocket connection
- **Seed coordination**: Ensure unique seeds across the group
- **Result correlation**: Know which results belong together

### 8.2 Why WebSocket for Results Instead of Polling?

- **Immediate feedback**: Results appear as soon as they complete
- **Reduced latency**: No polling interval delay
- **Lower overhead**: Single connection vs repeated HTTP requests
- **Bidirectional**: Client can send cancel requests

### 8.3 Why Random Seeds by Default?

- **Maximum visual diversity**: Sequential seeds can produce similar results
- **User expectation**: "Different nodes = different results"
- **Reproducibility when needed**: Optional base_seed parameter
- **Minimum distance guarantee**: Prevents accidental similarity

### 8.4 Backward Compatibility

- Single-node generation uses existing `/api/job` endpoint unchanged
- Multi-node generation uses new `/api/job-group` endpoint
- Frontend detects node count and chooses appropriate path
- Panel model unchanged - stores final selected result

---

## 9. Future Enhancements

1. **Result comparison view**: Side-by-side comparison of parallel results
2. **A/B testing mode**: Automatically vary single parameter across backends
3. **Priority queuing**: Higher-priority jobs preempt lower-priority ones
4. **Cost tracking**: Track GPU-hours per job group
5. **Result voting**: Let users vote on best result for training data
6. **Persistent history**: Store job group results for later review
