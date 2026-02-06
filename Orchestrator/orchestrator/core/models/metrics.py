from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class MetricsSnapshot(BaseModel):
    id: str
    backend_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    gpu_memory_used: int
    gpu_memory_total: int
    gpu_utilization: float
    gpu_temperature: int
    cpu_utilization: float
    ram_used: int
    ram_total: int
    queue_depth: int
    active_job_id: str | None = None
