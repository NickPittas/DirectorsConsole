from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class BackendConfig(BaseModel):
    id: str = Field(description="Unique identifier")
    name: str = Field(description="Human-readable backend name")
    host: str = Field(description="Hostname or IP")
    port: int = Field(default=8188, description="ComfyUI port")
    enabled: bool = Field(default=True)
    capabilities: list[str] = Field(default_factory=list)
    max_concurrent_jobs: int = Field(default=1)
    tags: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    @property
    def ws_url(self) -> str:
        return f"ws://{self.host}:{self.port}/ws"


class BackendStatus(BaseModel):
    backend_id: str
    online: bool
    last_seen: datetime = Field(default_factory=datetime.utcnow)
    current_job_id: str | None = None
    queue_depth: int = 0
    queue_pending: int = 0
    queue_running: int = 0
    gpu_name: str = "Unknown"
    gpu_memory_total: int = 0
    gpu_memory_used: int = 0
    gpu_utilization: float = 0.0
    gpu_temperature: int = 0
    cpu_utilization: float = 0.0
    ram_total: int = 0
    ram_used: int = 0

    @property
    def gpu_memory_free(self) -> int:
        return self.gpu_memory_total - self.gpu_memory_used

    @property
    def gpu_memory_percent(self) -> float:
        if self.gpu_memory_total == 0:
            return 0.0
        return (self.gpu_memory_used / self.gpu_memory_total) * 100
