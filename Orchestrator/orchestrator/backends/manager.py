"""Backend manager for ComfyUI instances.

Manages registration, status tracking, and selection of ComfyUI backends.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Sequence

from orchestrator.core.models.backend import BackendConfig, BackendStatus
from orchestrator.core.engine.scheduler import Scheduler


@dataclass
class BackendManager:
    """Manages multiple ComfyUI backend instances.

    Handles:
    - Backend registration and removal
    - Status tracking for each backend
    - Backend selection based on availability, queue depth, and capabilities

    Example:
        manager = BackendManager()
        manager.register(BackendConfig(id="b1", name="PC1", host="192.168.1.100"))
        manager.update_status("b1", BackendStatus(backend_id="b1", online=True))

        best = manager.select_best_backend(required_capabilities=["flux"])
        if best:
            print(f"Using {best.name}")
    """

    _configs: dict[str, BackendConfig] = field(default_factory=dict)
    _statuses: dict[str, BackendStatus] = field(default_factory=dict)

    def register(self, config: BackendConfig) -> None:
        """Register a new backend.

        Args:
            config: Backend configuration.
        """
        self._configs[config.id] = config
        if config.id not in self._statuses:
            self._statuses[config.id] = BackendStatus(
                backend_id=config.id,
                online=False,
                last_seen=datetime.now(timezone.utc),
            )

    def remove(self, backend_id: str) -> None:
        """Remove a backend.

        Args:
            backend_id: ID of backend to remove.
        """
        self._configs.pop(backend_id, None)
        self._statuses.pop(backend_id, None)

    def list(self) -> list[BackendConfig]:
        """List all registered backends.

        Returns:
            List of backend configurations.
        """
        return list(self._configs.values())

    def get(self, backend_id: str) -> BackendConfig | None:
        """Get a backend by ID.

        Args:
            backend_id: Backend identifier.

        Returns:
            BackendConfig if found, None otherwise.
        """
        return self._configs.get(backend_id)

    def get_status(self, backend_id: str) -> BackendStatus | None:
        """Get status for a specific backend.

        Args:
            backend_id: Backend identifier.

        Returns:
            BackendStatus if found, None otherwise.
        """
        return self._statuses.get(backend_id)

    def get_all_statuses(self) -> dict[str, BackendStatus]:
        """Get status for all backends.

        Returns:
            Dict mapping backend_id to BackendStatus.
        """
        return dict(self._statuses)

    def update_status(self, backend_id: str, status: BackendStatus) -> None:
        """Update status for a backend.

        Args:
            backend_id: Backend identifier.
            status: New status to set.
        """
        self._statuses[backend_id] = status

    def select_best_backend(
        self,
        required_capabilities: Sequence[str] | None = None,
    ) -> BackendConfig | None:
        """Select the best available backend for a job.

        Selection criteria (in order):
        1. Must be online
        2. Must have all required capabilities
        3. Prefer lower queue depth
        4. Prefer more free GPU memory (tie-breaker)

        Args:
            required_capabilities: List of capabilities the backend must have.

        Returns:
            Best matching BackendConfig, or None if no backends available.
        """
        scheduler = Scheduler(list(self._configs.values()))
        for backend_id, status in self._statuses.items():
            scheduler.update_status(backend_id, status)
        return scheduler.select_backend_for_capabilities(list(required_capabilities or []))

    def get_online_backends(self) -> list[BackendConfig]:
        """Get all online backends.

        Returns:
            List of online backend configurations.
        """
        online = []
        for config in self._configs.values():
            status = self._statuses.get(config.id)
            if config.enabled and status and status.online:
                online.append(config)
        return online

    def get_backends_with_capability(
        self, capability: str
    ) -> list[BackendConfig]:
        """Get backends that have a specific capability.

        Args:
            capability: Required capability string.

        Returns:
            List of backends with the capability.
        """
        return [
            config
            for config in self._configs.values()
            if capability in config.capabilities
        ]

    def set_current_job(self, backend_id: str, job_id: str | None) -> None:
        """Update the current job for a backend.

        Args:
            backend_id: Backend identifier.
            job_id: Job ID or None to clear.
        """
        status = self._statuses.get(backend_id)
        if status:
            self._statuses[backend_id] = BackendStatus(
                backend_id=status.backend_id,
                online=status.online,
                last_seen=status.last_seen,
                current_job_id=job_id,
                queue_depth=status.queue_depth,
                queue_pending=status.queue_pending,
                queue_running=status.queue_running,
                gpu_name=status.gpu_name,
                gpu_memory_total=status.gpu_memory_total,
                gpu_memory_used=status.gpu_memory_used,
                gpu_utilization=status.gpu_utilization,
                gpu_temperature=status.gpu_temperature,
                cpu_utilization=status.cpu_utilization,
                ram_total=status.ram_total,
                ram_used=status.ram_used,
            )
