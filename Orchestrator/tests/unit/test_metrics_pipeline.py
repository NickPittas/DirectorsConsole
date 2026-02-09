"""Tests for the backend metrics collection pipeline.

Tests verify:
1. MetricsCollector collects system stats and metrics agent data
2. HealthMonitor updates backend status with metrics
3. BackendManager maintains status with queue depth and utilization
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from orchestrator.backends.client import ComfyUIClient
from orchestrator.backends.health_monitor import HealthMonitor
from orchestrator.backends.manager import BackendManager
from orchestrator.backends.metrics_collector import MetricsCollector
from orchestrator.core.models.backend import BackendConfig, BackendStatus
from orchestrator.core.models.metrics import MetricsSnapshot


# ---------------------------------------------------------------------
# MetricsCollector Tests
# ---------------------------------------------------------------------


def test_metrics_collector_handles_empty() -> None:
    """MetricsCollector should handle empty backend list gracefully."""
    collector = MetricsCollector(backends=[])
    assert collector.backends == []


def test_metrics_collector_with_backends() -> None:
    """MetricsCollector should accept a list of backends."""
    configs = [
        BackendConfig(id="b1", name="PC1", host="127.0.0.1"),
        BackendConfig(id="b2", name="PC2", host="192.168.1.100"),
    ]
    collector = MetricsCollector(backends=configs)
    assert len(collector.backends) == 2


class MockClient:
    """Mock ComfyUI client for testing."""

    def __init__(
        self,
        system_stats: dict[str, Any] | None = None,
        metrics_agent: dict[str, Any] | None = None,
        queue_remaining: int = 0,
    ):
        self._system_stats = system_stats or {
            "devices": [
                {
                    "name": "cuda:0",
                    "vram_total": 8589934592,  # 8GB
                    "vram_free": 6442450944,  # 6GB
                }
            ]
        }
        self._metrics_agent = metrics_agent or {
            "cpu_utilization": 25.5,
            "gpu_utilization": 45.0,
            "gpu_temperature": 65,
            "ram_total": 32768,
            "ram_used": 16384,
        }
        self._queue_remaining = queue_remaining

    async def get_system_stats(self) -> dict[str, Any]:
        return self._system_stats

    async def get_metrics_agent(self) -> dict[str, Any] | None:
        return self._metrics_agent

    async def get_queue_status(self) -> dict[str, Any]:
        return {"exec_info": {"queue_remaining": self._queue_remaining}}

    async def close(self) -> None:
        pass


def test_metrics_collector_collect_once_returns_snapshots() -> None:
    """collect_once should return MetricsSnapshot for each backend."""
    configs = [
        BackendConfig(id="b1", name="PC1", host="127.0.0.1"),
    ]

    def client_factory(config: BackendConfig) -> MockClient:
        return MockClient(queue_remaining=2)

    collector = MetricsCollector(
        backends=configs,
        client_factory=client_factory,
    )

    snapshots = asyncio.run(collector.collect_once())

    assert len(snapshots) == 1
    snapshot = snapshots[0]
    assert isinstance(snapshot, MetricsSnapshot)
    assert snapshot.backend_id == "b1"
    assert snapshot.cpu_utilization == 25.5
    assert snapshot.gpu_utilization == 45.0
    assert snapshot.queue_depth == 2


def test_metrics_collector_handles_missing_metrics_agent() -> None:
    """collect_once should handle backends without metrics agent installed."""
    configs = [
        BackendConfig(id="b1", name="PC1", host="127.0.0.1"),
    ]

    class NoMetricsAgentClient(MockClient):
        async def get_metrics_agent(self) -> dict[str, Any] | None:
            return None

    def client_factory(config: BackendConfig) -> NoMetricsAgentClient:
        return NoMetricsAgentClient()

    collector = MetricsCollector(
        backends=configs,
        client_factory=client_factory,
    )

    snapshots = asyncio.run(collector.collect_once())

    assert len(snapshots) == 1
    snapshot = snapshots[0]
    # Should still have VRAM from system_stats
    assert snapshot.gpu_memory_total > 0
    # CPU should be 0 since no metrics agent
    assert snapshot.cpu_utilization == 0.0


def test_metrics_collector_handles_offline_backend() -> None:
    """collect_once should skip offline backends gracefully."""
    configs = [
        BackendConfig(id="b1", name="PC1", host="127.0.0.1"),
    ]

    class OfflineClient(MockClient):
        async def get_system_stats(self) -> dict[str, Any]:
            raise ConnectionError("Backend offline")

    def client_factory(config: BackendConfig) -> OfflineClient:
        return OfflineClient()

    collector = MetricsCollector(
        backends=configs,
        client_factory=client_factory,
    )

    snapshots = asyncio.run(collector.collect_once())

    # Should return empty list or snapshot with zeroed values
    assert len(snapshots) == 0 or (
        len(snapshots) == 1 and snapshots[0].gpu_memory_total == 0
    )


def test_metrics_collector_multiple_backends() -> None:
    """collect_once should collect from all backends concurrently."""
    configs = [
        BackendConfig(id="b1", name="PC1", host="127.0.0.1"),
        BackendConfig(id="b2", name="PC2", host="192.168.1.100"),
        BackendConfig(id="b3", name="PC3", host="192.168.1.101"),
    ]

    call_count = 0

    class CountingClient(MockClient):
        def __init__(self, backend_id: str):
            super().__init__(queue_remaining=int(backend_id[-1]))
            self.backend_id = backend_id

        async def get_system_stats(self) -> dict[str, Any]:
            nonlocal call_count
            call_count += 1
            return await super().get_system_stats()

    def client_factory(config: BackendConfig) -> CountingClient:
        return CountingClient(config.id)

    collector = MetricsCollector(
        backends=configs,
        client_factory=client_factory,
    )

    snapshots = asyncio.run(collector.collect_once())

    assert len(snapshots) == 3
    assert call_count == 3
    backend_ids = {s.backend_id for s in snapshots}
    assert backend_ids == {"b1", "b2", "b3"}


# ---------------------------------------------------------------------
# HealthMonitor Tests (extended with metrics)
# ---------------------------------------------------------------------


def test_health_monitor_updates_status_with_metrics() -> None:
    """HealthMonitor should update BackendStatus with metrics data."""
    manager = BackendManager()
    config = BackendConfig(id="b1", name="PC1", host="127.0.0.1")
    manager.register(config)

    class MetricsClient(ComfyUIClient):
        async def health_check(self) -> bool:
            return True

        async def get_system_stats(self) -> dict[str, Any]:
            return {
                "devices": [
                    {
                        "name": "RTX 4090",
                        "vram_total": 25769803776,  # 24GB
                        "vram_free": 20000000000,
                    }
                ]
            }

        async def get_metrics_agent(self) -> dict[str, Any] | None:
            return {
                "cpu_utilization": 30.0,
                "gpu_utilization": 75.0,
                "gpu_temperature": 70,
                "ram_total": 65536,
                "ram_used": 32768,
            }

        async def get_queue_status(self) -> dict[str, Any]:
            return {"exec_info": {"queue_remaining": 3}}

        async def close(self) -> None:
            pass

    def factory(config: BackendConfig) -> MetricsClient:
        return MetricsClient("http://127.0.0.1:8188")

    monitor = HealthMonitor(
        manager=manager,
        client_factory=factory,
        collect_metrics=True,
    )

    asyncio.run(monitor.poll_once())

    status = manager.get_status("b1")
    assert status is not None
    assert status.online is True
    assert status.gpu_name == "RTX 4090"
    assert status.gpu_utilization == 75.0
    assert status.cpu_utilization == 30.0
    assert status.queue_depth == 3


def test_health_monitor_offline_resets_metrics() -> None:
    """When backend goes offline, metrics should reset but preserve last_seen."""
    manager = BackendManager()
    config = BackendConfig(id="b1", name="PC1", host="127.0.0.1")
    manager.register(config)

    class OfflineClient(ComfyUIClient):
        async def health_check(self) -> bool:
            return False

        async def close(self) -> None:
            pass

    def factory(config: BackendConfig) -> OfflineClient:
        return OfflineClient("http://127.0.0.1:8188")

    monitor = HealthMonitor(
        manager=manager,
        client_factory=factory,
        collect_metrics=True,
    )

    asyncio.run(monitor.poll_once())

    status = manager.get_status("b1")
    assert status is not None
    assert status.online is False
    # Queue depth should be 0 when offline
    assert status.queue_depth == 0


# ---------------------------------------------------------------------
# BackendManager Tests (extended)
# ---------------------------------------------------------------------


def test_backend_manager_select_best_by_queue_depth() -> None:
    """select_best_backend should prefer backends with lower queue depth."""
    manager = BackendManager()

    config1 = BackendConfig(id="b1", name="PC1", host="127.0.0.1")
    config2 = BackendConfig(id="b2", name="PC2", host="192.168.1.100")

    manager.register(config1)
    manager.register(config2)

    # Set different queue depths
    manager.update_status(
        "b1",
        BackendStatus(backend_id="b1", online=True, queue_depth=5),
    )
    manager.update_status(
        "b2",
        BackendStatus(backend_id="b2", online=True, queue_depth=2),
    )

    best = manager.select_best_backend()
    assert best is not None
    assert best.id == "b2"  # Lower queue depth


def test_backend_manager_select_best_by_gpu_memory() -> None:
    """select_best_backend should prefer backends with more free GPU memory."""
    manager = BackendManager()

    config1 = BackendConfig(id="b1", name="PC1", host="127.0.0.1")
    config2 = BackendConfig(id="b2", name="PC2", host="192.168.1.100")

    manager.register(config1)
    manager.register(config2)

    # Same queue depth, different GPU memory
    manager.update_status(
        "b1",
        BackendStatus(
            backend_id="b1",
            online=True,
            queue_depth=0,
            gpu_memory_total=24000,
            gpu_memory_used=20000,
        ),
    )
    manager.update_status(
        "b2",
        BackendStatus(
            backend_id="b2",
            online=True,
            queue_depth=0,
            gpu_memory_total=24000,
            gpu_memory_used=9800,
        ),
    )

    best = manager.select_best_backend()
    assert best is not None
    assert best.id == "b2"  # More free GPU memory


def test_backend_manager_select_best_skips_offline() -> None:
    """select_best_backend should skip offline backends."""
    manager = BackendManager()

    config1 = BackendConfig(id="b1", name="PC1", host="127.0.0.1")
    config2 = BackendConfig(id="b2", name="PC2", host="192.168.1.100")

    manager.register(config1)
    manager.register(config2)

    manager.update_status(
        "b1",
        BackendStatus(backend_id="b1", online=False, queue_depth=0),
    )
    manager.update_status(
        "b2",
        BackendStatus(backend_id="b2", online=True, queue_depth=5),
    )

    best = manager.select_best_backend()
    assert best is not None
    assert best.id == "b2"  # Only online backend


def test_backend_manager_select_best_with_capabilities() -> None:
    """select_best_backend should filter by required capabilities."""
    manager = BackendManager()

    config1 = BackendConfig(
        id="b1", name="PC1", host="127.0.0.1", capabilities=["sd15", "flux"]
    )
    config2 = BackendConfig(
        id="b2", name="PC2", host="192.168.1.100", capabilities=["sd15"]
    )

    manager.register(config1)
    manager.register(config2)

    manager.update_status(
        "b1",
        BackendStatus(backend_id="b1", online=True, queue_depth=5),
    )
    manager.update_status(
        "b2",
        BackendStatus(backend_id="b2", online=True, queue_depth=0),
    )

    # Require flux capability
    best = manager.select_best_backend(required_capabilities=["flux"])
    assert best is not None
    assert best.id == "b1"  # Only backend with flux capability


def test_backend_manager_returns_none_when_no_available() -> None:
    """select_best_backend should return None when no backends available."""
    manager = BackendManager()

    config = BackendConfig(id="b1", name="PC1", host="127.0.0.1")
    manager.register(config)

    manager.update_status(
        "b1",
        BackendStatus(backend_id="b1", online=False),
    )

    best = manager.select_best_backend()
    assert best is None


def test_backend_manager_get_all_statuses() -> None:
    """get_all_statuses should return status for all backends."""
    manager = BackendManager()

    manager.register(BackendConfig(id="b1", name="PC1", host="127.0.0.1"))
    manager.register(BackendConfig(id="b2", name="PC2", host="192.168.1.100"))

    manager.update_status(
        "b1",
        BackendStatus(backend_id="b1", online=True, queue_depth=2),
    )
    manager.update_status(
        "b2",
        BackendStatus(backend_id="b2", online=False, queue_depth=0),
    )

    statuses = manager.get_all_statuses()
    assert len(statuses) == 2
    assert statuses["b1"].online is True
    assert statuses["b2"].online is False


# ---------------------------------------------------------------------
# Integration Test
# ---------------------------------------------------------------------


def test_metrics_pipeline_integration() -> None:
    """Test full metrics collection pipeline integration."""
    manager = BackendManager()

    config = BackendConfig(id="b1", name="PC1", host="127.0.0.1")
    manager.register(config)

    # Simulate metrics collector updating manager
    def client_factory(config: BackendConfig) -> MockClient:
        return MockClient(
            system_stats={
                "devices": [
                    {
                        "name": "RTX 3080",
                        "vram_total": 10737418240,  # 10GB
                        "vram_free": 5368709120,  # 5GB
                    }
                ]
            },
            metrics_agent={
                "cpu_utilization": 45.0,
                "gpu_utilization": 80.0,
                "gpu_temperature": 72,
                "ram_total": 32768,
                "ram_used": 24576,
            },
            queue_remaining=1,
        )

    collector = MetricsCollector(
        backends=[config],
        client_factory=client_factory,
    )

    snapshots = asyncio.run(collector.collect_once())

    # Update manager with collected metrics
    for snapshot in snapshots:
        status = BackendStatus(
            backend_id=snapshot.backend_id,
            online=True,
            last_seen=snapshot.timestamp,
            queue_depth=snapshot.queue_depth,
            gpu_name="RTX 3080",
            gpu_memory_total=snapshot.gpu_memory_total,
            gpu_memory_used=snapshot.gpu_memory_used,
            gpu_utilization=snapshot.gpu_utilization,
            gpu_temperature=snapshot.gpu_temperature,
            cpu_utilization=snapshot.cpu_utilization,
            ram_total=snapshot.ram_total,
            ram_used=snapshot.ram_used,
        )
        manager.update_status(snapshot.backend_id, status)

    # Verify manager has updated status
    status = manager.get_status("b1")
    assert status is not None
    assert status.online is True
    assert status.gpu_utilization == 80.0
    assert status.queue_depth == 1
