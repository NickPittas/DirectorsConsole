"""Pydantic models for multi-node parallel job generation.

This module defines the data models for managing parallel job groups
across multiple ComfyUI backends with unique seed variations.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class SeedStrategy(str, Enum):
    """Strategy for generating unique seeds per backend."""

    RANDOM = "random"  # Random seeds with minimum distance
    SEQUENTIAL = "sequential"  # base_seed, base_seed+1, base_seed+2...
    FIBONACCI = "fibonacci"  # Fibonacci-based spacing
    GOLDEN_RATIO = "golden_ratio"  # Golden ratio multiplicative spacing


class JobGroupStatus(str, Enum):
    """Status of the entire job group."""

    PENDING = "pending"
    RUNNING = "running"
    PARTIAL_COMPLETE = "partial_complete"  # Some succeeded, some failed/running
    COMPLETED = "completed"  # All succeeded
    FAILED = "failed"  # All failed
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
    """A single job within a parallel job group.

    Attributes:
        job_id: Unique identifier for this child job.
        backend_id: ID of the backend assigned to execute this job.
        seed: The seed value used for generation.
        status: Current execution status.
        progress: Progress percentage (0-100).
        current_step: Current execution step/node.
        outputs: Output data from successful completion.
        error_message: Error description if failed.
        error_type: Type of error if failed.
        queued_at: Timestamp when job was queued.
        started_at: Timestamp when job started executing.
        completed_at: Timestamp when job completed.
    """

    job_id: str
    backend_id: str
    seed: int
    status: ChildJobStatus = ChildJobStatus.QUEUED
    progress: float = Field(default=0.0, ge=0.0, le=100.0)
    current_step: str | None = None
    outputs: dict[str, Any] = Field(default_factory=dict)
    error_message: str | None = None
    error_type: str | None = None
    queued_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: datetime | None = None
    completed_at: datetime | None = None


class JobGroup(BaseModel):
    """A group of parallel jobs for multi-node generation.

    Attributes:
        id: Unique identifier for the job group.
        panel_id: Optional panel ID for UI association.
        workflow_json: Full ComfyUI workflow in API JSON format.
        parameters: Parameter overrides applied to workflow.
        seed_strategy: Strategy used for seed generation.
        base_seed: Base seed for sequential/derived strategies.
        child_jobs: List of child jobs in this group.
        status: Overall status of the job group.
        timeout_seconds: Timeout per job in seconds.
        metadata: Additional metadata like scene name.
        created_at: Timestamp when group was created.
        completed_at: Timestamp when group completed.
    """

    id: str
    panel_id: int | None = None
    workflow_json: dict[str, Any]
    parameters: dict[str, Any] = Field(default_factory=dict)
    seed_strategy: SeedStrategy = SeedStrategy.RANDOM
    base_seed: int | None = None
    child_jobs: list[ChildJob] = Field(default_factory=list)
    status: JobGroupStatus = JobGroupStatus.PENDING
    timeout_seconds: int = Field(default=300, ge=30, le=3600)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None

    @property
    def completed_count(self) -> int:
        """Count of completed child jobs."""
        return sum(
            1 for j in self.child_jobs if j.status == ChildJobStatus.COMPLETED
        )

    @property
    def failed_count(self) -> int:
        """Count of failed/timed out child jobs."""
        return sum(
            1
            for j in self.child_jobs
            if j.status in [ChildJobStatus.FAILED, ChildJobStatus.TIMEOUT]
        )

    @property
    def running_count(self) -> int:
        """Count of running or queued child jobs."""
        return sum(
            1
            for j in self.child_jobs
            if j.status in [ChildJobStatus.RUNNING, ChildJobStatus.QUEUED]
        )

    @property
    def total_count(self) -> int:
        """Total number of child jobs."""
        return len(self.child_jobs)


class JobGroupRequest(BaseModel):
    """Request to create a parallel job group.

    Attributes:
        workflow_json: Full ComfyUI workflow in API JSON format.
        parameters: Parameter overrides to apply to workflow.
        backend_ids: List of backend IDs to execute on.
        seed_strategy: Strategy for generating unique seeds.
        base_seed: Base seed for sequential/derived strategies.
        metadata: Metadata like panel_id, scene name.
        timeout_seconds: Timeout per job in seconds.
        required_capabilities: Required backend capabilities.
    """

    workflow_json: dict[str, Any] = Field(
        ...,
        description="Full ComfyUI workflow in API JSON format",
    )
    parameters: dict[str, Any] = Field(
        default_factory=dict,
        description="Parameter overrides to apply to workflow",
    )
    backend_ids: list[str] = Field(
        ...,
        min_length=1,
        description="List of backend IDs to execute on",
    )
    seed_strategy: SeedStrategy = Field(
        default=SeedStrategy.RANDOM,
        description="Strategy for generating unique seeds",
    )
    base_seed: int | None = Field(
        default=None,
        description="Base seed for sequential/derived strategies. Random if None.",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Metadata like panel_id, scene name",
    )
    timeout_seconds: int = Field(
        default=300,
        ge=30,
        le=3600,
        description="Timeout per job in seconds",
    )
    required_capabilities: list[str] = Field(
        default_factory=list,
        description="Required backend capabilities",
    )


class JobGroupResponse(BaseModel):
    """Response after creating a job group.

    Attributes:
        job_group_id: Unique identifier for the job group.
        child_jobs: List of child jobs created.
        status: Initial status of the job group.
        created_at: Timestamp when group was created.
    """

    job_group_id: str
    child_jobs: list[ChildJob]
    status: JobGroupStatus
    created_at: datetime


class JobGroupStatusResponse(BaseModel):
    """Full status of a job group.

    Attributes:
        job_group_id: Unique identifier for the job group.
        status: Current status of the job group.
        child_jobs: List of child jobs with their status.
        completed_count: Number of completed jobs.
        failed_count: Number of failed jobs.
        total_count: Total number of jobs.
        created_at: Timestamp when group was created.
        completed_at: Timestamp when group completed.
    """

    job_group_id: str
    status: JobGroupStatus
    child_jobs: list[ChildJob]
    completed_count: int
    failed_count: int
    total_count: int
    created_at: datetime
    completed_at: datetime | None = None
