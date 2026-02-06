"""Metrics collection for ComfyUI backends.

Polls system stats and metrics agent endpoints from each backend
to gather GPU/CPU utilization, memory usage, and queue depth.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Protocol, Sequence

from orchestrator.core.models.backend import BackendConfig
from orchestrator.core.models.metrics import MetricsSnapshot
from orchestrator.backends.metrics_helpers import (
    safe_get_queue_status,
    safe_get_system_stats,
)

logger = logging.getLogger(__name__)


class MetricsClient(Protocol):
    """Protocol for clients that can fetch metrics."""

    async def get_system_stats(self) -> dict[str, Any]:
        """Fetch /system_stats endpoint."""
        ...

    async def get_queue_status(self) -> dict[str, Any]:
        """Fetch queue/status info via WebSocket status or /queue endpoint."""
        ...

    async def close(self) -> None:
        """Close client connections."""
        ...


def _default_client_factory(config: BackendConfig) -> Any:
    """Default factory using ComfyUIClient."""
    from orchestrator.backends.client import ComfyUIClient

    return ComfyUIClient(host=config.host, port=config.port)


@dataclass
class MetricsCollector:
    """Collects metrics from multiple ComfyUI backends.

    Polls each backend for:
    - System stats (VRAM from /system_stats)
    - Queue depth (from WebSocket status messages)

    Example:
        collector = MetricsCollector(backends=backend_configs)
        snapshots = await collector.collect_once()
        for snapshot in snapshots:
            print(f"{snapshot.backend_id}: GPU {snapshot.gpu_utilization}%")
    """

    backends: Sequence[BackendConfig]
    client_factory: Callable[[BackendConfig], MetricsClient] = field(
        default=_default_client_factory
    )
    timeout_seconds: float = 5.0
    _stop_event: asyncio.Event | None = field(default=None, init=False)

    async def collect_once(self) -> list[MetricsSnapshot]:
        """Collect metrics from all backends concurrently.

        Returns:
            List of MetricsSnapshot for each successfully polled backend.
            Offline or erroring backends are skipped.
        """
        if not self.backends:
            return []

        tasks = [
            self._collect_from_backend(config) for config in self.backends
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        snapshots: list[MetricsSnapshot] = []
        for result in results:
            if isinstance(result, MetricsSnapshot):
                snapshots.append(result)
            # Skip exceptions (offline backends)

        return snapshots

    async def _collect_from_backend(
        self, config: BackendConfig
    ) -> MetricsSnapshot:
        """Collect metrics from a single backend.

        Args:
            config: Backend configuration.

        Returns:
            MetricsSnapshot with collected data.

        Raises:
            ConnectionError: If backend is unreachable.
            asyncio.TimeoutError: If collection times out.
        """
        client = self.client_factory(config)
        try:
            async with asyncio.timeout(self.timeout_seconds):
                return await self._fetch_and_build_snapshot(config, client)
        finally:
            await client.close()

    async def _fetch_and_build_snapshot(
        self,
        config: BackendConfig,
        client: MetricsClient,
    ) -> MetricsSnapshot:
        """Fetch all metrics endpoints and build snapshot.

        Fetches system_stats and queue_status concurrently.
        """
        # Fetch all data concurrently
        system_stats_task = safe_get_system_stats(client)
        queue_status_task = safe_get_queue_status(client)

        system_stats, queue_status = await asyncio.gather(
            system_stats_task,
            queue_status_task,
        )

        return self._build_snapshot(
            config,
            system_stats,
            None,
            queue_status,
        )

    def _build_snapshot(
        self,
        config: BackendConfig,
        system_stats: dict[str, Any],
        metrics_agent: dict[str, Any] | None,
        queue_status: dict[str, Any],
    ) -> MetricsSnapshot:
        """Build MetricsSnapshot from collected data.

        Combines data from multiple sources:
        - system_stats: VRAM info from ComfyUI
        - metrics_agent: CPU/GPU utilization from our custom node
        - queue_status: Queue depth from status messages

        Args:
            config: Backend configuration.
            system_stats: Response from /system_stats.
            metrics_agent: Response from /orchestrator/metrics (may be None).
            queue_status: Queue status info.

        Returns:
            MetricsSnapshot with all available metrics.
        """
        # Extract device info from system_stats
        devices = system_stats.get("devices", [])
        device = devices[0] if devices else {}

        # VRAM from system_stats (in bytes, convert to MB)
        vram_total_bytes = device.get("vram_total", 0)
        vram_free_bytes = device.get("vram_free", 0)
        gpu_memory_total = vram_total_bytes // (1024 * 1024)
        gpu_memory_used = (vram_total_bytes - vram_free_bytes) // (1024 * 1024)

        # GPU name from device
        gpu_name = device.get("name", "Unknown")

        # Extract metrics from metrics_agent (if available)
        if metrics_agent:
            cpu_utilization = metrics_agent.get("cpu_utilization", 0.0)
            gpu_utilization = metrics_agent.get("gpu_utilization", 0.0)
            gpu_temperature = metrics_agent.get("gpu_temperature", 0)
            ram_total = metrics_agent.get("ram_total", 0)
            ram_used = metrics_agent.get("ram_used", 0)
            # Override GPU memory if metrics agent provides it
            if "gpu_memory_total" in metrics_agent:
                gpu_memory_total = metrics_agent["gpu_memory_total"]
            if "gpu_memory_used" in metrics_agent:
                gpu_memory_used = metrics_agent["gpu_memory_used"]
        else:
            # No metrics agent - use defaults
            cpu_utilization = 0.0
            gpu_utilization = 0.0
            gpu_temperature = 0
            ram_total = 0
            ram_used = 0

        # Extract queue depth
        exec_info = queue_status.get("exec_info", {})
        queue_depth = exec_info.get("queue_remaining", 0)

        return MetricsSnapshot(
            id=str(uuid.uuid4()),
            backend_id=config.id,
            timestamp=datetime.now(timezone.utc),
            gpu_memory_used=gpu_memory_used,
            gpu_memory_total=gpu_memory_total,
            gpu_utilization=gpu_utilization,
            gpu_temperature=gpu_temperature,
            cpu_utilization=cpu_utilization,
            ram_used=ram_used,
            ram_total=ram_total,
            queue_depth=queue_depth,
        )

    async def start_polling(
        self,
        interval_seconds: float = 5.0,
        callback: Callable[[list[MetricsSnapshot]], None] | None = None,
    ) -> None:
        """Start continuous polling loop.

        Args:
            interval_seconds: Seconds between polls.
            callback: Optional callback invoked with each batch of snapshots.
        """
        self._stop_event = asyncio.Event()

        while not self._stop_event.is_set():
            try:
                snapshots = await self.collect_once()
                if callback:
                    callback(snapshots)
            except Exception as exc:
                logger.warning("Metrics polling failed", exc_info=exc)

            try:
                await asyncio.wait_for(
                    self._stop_event.wait(),
                    timeout=interval_seconds,
                )
            except asyncio.TimeoutError:
                pass  # Expected - continue polling

    def stop_polling(self) -> None:
        """Stop the polling loop."""
        if self._stop_event is not None:
            self._stop_event.set()
