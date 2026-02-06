from __future__ import annotations

from dataclasses import dataclass, field

from orchestrator.core.models.backend import BackendConfig, BackendStatus
from orchestrator.core.models.project import CanvasNode, FallbackStrategy
from orchestrator.core.models.workflow import WorkflowDefinition


class NoBackendAvailable(ValueError):
    pass


@dataclass
class Scheduler:
    _backends: dict[str, BackendConfig] = field(default_factory=dict)
    _statuses: dict[str, BackendStatus] = field(default_factory=dict)

    def __init__(self, backends: list[BackendConfig] | None = None) -> None:
        self._backends = {backend.id: backend for backend in backends or []}
        self._statuses = {}

    def register(self, backend: BackendConfig) -> None:
        self._backends[backend.id] = backend

    def update_status(self, backend_id: str, status: BackendStatus) -> None:
        self._statuses[backend_id] = status

    def available_backends(
        self, required_capabilities: list[str] | None = None
    ) -> list[BackendConfig]:
        required = required_capabilities or []
        candidates = [
            backend
            for backend in self._backends.values()
            if backend.enabled and self._supports_capabilities(backend, required)
        ]
        return [backend for backend in candidates if self._is_online(backend.id)]

    def select_backend(
        self,
        node: CanvasNode | None,
        workflow: WorkflowDefinition | None,
    ) -> BackendConfig | None:
        if node is not None and node.backend_affinity:
            backend = self._backends.get(node.backend_affinity)
            strategy = node.fallback_strategy
            if backend is None or not backend.enabled:
                if strategy == FallbackStrategy.NONE:
                    raise NoBackendAvailable("Preferred backend is unavailable")
                if strategy == FallbackStrategy.ASK_USER:
                    return None
            elif self._is_online(backend.id):
                return backend
            else:
                if strategy == FallbackStrategy.NONE:
                    raise NoBackendAvailable("Preferred backend is offline")
                if strategy == FallbackStrategy.ASK_USER:
                    return None

        required = workflow.required_capabilities if workflow else []
        candidates = self.available_backends(required)
        if not candidates:
            raise NoBackendAvailable("No backends available for scheduling")
        return self._select_best_backend(candidates)

    def get_backend(self, backend_id: str) -> BackendConfig | None:
        return self._backends.get(backend_id)

    def select_backend_for_capabilities(
        self, required_capabilities: list[str] | None = None
    ) -> BackendConfig | None:
        candidates = self.available_backends(required_capabilities)
        if not candidates:
            return None
        return self._select_best_backend(candidates)

    def _supports_capabilities(
        self, backend: BackendConfig, required: list[str]
    ) -> bool:
        if not required:
            return True
        return all(cap in backend.capabilities for cap in required)

    def _is_online(self, backend_id: str) -> bool:
        backend = self._backends.get(backend_id)
        if backend is not None and not backend.enabled:
            return False
        status = self._statuses.get(backend_id)
        if status is None:
            return True
        return status.online

    def _select_best_backend(self, candidates: list[BackendConfig]) -> BackendConfig:
        def sort_key(backend: BackendConfig) -> tuple[int, int]:
            status = self._statuses.get(backend.id)
            queue_depth = status.queue_depth if status else 0
            gpu_free = status.gpu_memory_free if status else 0
            return (queue_depth, -gpu_free)

        return sorted(candidates, key=sort_key)[0]
