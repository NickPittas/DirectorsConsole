from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from orchestrator.core.models.project import CanvasLayout


class JobStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class NodeExecution(BaseModel):
    id: str
    job_id: str
    canvas_node_id: str
    backend_id: str | None = None
    status: JobStatus = JobStatus.PENDING
    comfy_prompt_id: str | None = None
    progress: float = 0.0
    current_step: str | None = None
    input_data: dict = Field(default_factory=dict)
    output_data: dict | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None
    error_traceback: str | None = None


class Job(BaseModel):
    id: str
    project_id: str | None = None  # None for ad-hoc execution
    status: JobStatus = JobStatus.PENDING
    canvas_snapshot: CanvasLayout
    parameter_values: dict = Field(default_factory=dict)
    node_executions: list[NodeExecution] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None
    outputs: dict = Field(default_factory=dict)
    progress: float = 0.0

    @property
    def progress_percent(self) -> float:
        """Return progress as a percentage (0-100)."""
        if not self.node_executions:
            return self.progress * 100
        total = len(self.node_executions)
        completed = sum(1 for ne in self.node_executions if ne.status == JobStatus.COMPLETED)
        in_progress = sum(ne.progress for ne in self.node_executions if ne.status == JobStatus.RUNNING)
        return ((completed + in_progress) / total) * 100 if total > 0 else 0.0
