"""Health monitoring for ComfyUI backends.

Periodically checks backend availability and optionally collects
metrics data to update BackendStatus.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable
import logging

from orchestrator.backends.client import ComfyUIClient
from orchestrator.backends.metrics_helpers import (
    safe_get_metrics_agent,
    safe_get_queue_status,
    safe_get_system_stats,
)
from orchestrator.backends.manager import BackendManager
from orchestrator.core.models.backend import BackendConfig, BackendStatus

logger = logging.getLogger(__name__)

@dataclass
class HealthMonitor:
    """Monitors health and metrics of ComfyUI backends.

    Polls each registered backend to check:
    - Online/offline status
    - Queue depth
    - GPU/CPU utilization (if collect_metrics=True)
    - Memory usage

    Updates the BackendManager with current status for each backend.

    Example:
        monitor = HealthMonitor(
            manager=backend_manager,
            client_factory=lambda c: ComfyUIClient(c.host, c.port),
            collect_metrics=True,
        )
        await monitor.run_loop()
    """

    manager: BackendManager
    client_factory: Callable[[BackendConfig], ComfyUIClient]
    interval_seconds: float = 5.0
    collect_metrics: bool = False
    _stop_event: asyncio.Event = field(default_factory=asyncio.Event)

    async def run(self) -> None:
        """Run a single poll cycle."""
        await self._poll_once()

    def stop(self) -> None:
        """Signal the monitor to stop."""
        self._stop_event.set()

    async def run_loop(self) -> None:
        """Run continuous polling loop until stopped."""
        while not self._stop_event.is_set():
            await self._poll_once()
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(),
                    timeout=self.interval_seconds,
                )
            except asyncio.TimeoutError:
                pass  # Expected - continue polling

    async def _poll_once(self) -> None:
        """Poll all backends once."""
        backends = self.manager.list()
        if not backends:
            return

        # Poll all backends concurrently
        tasks = [self._poll_backend(config) for config in backends]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _poll_backend(self, config: BackendConfig) -> None:
        """Poll a single backend and update its status.

        Args:
            config: Backend configuration.
        """
        client = self.client_factory(config)
        try:
            online = await client.health_check()

            if online and self.collect_metrics:
                status = await self._collect_full_status(config, client)
            elif online:
                status = BackendStatus(
                    backend_id=config.id,
                    online=True,
                    last_seen=datetime.now(timezone.utc),
                )
            else:
                status = self._offline_status(config.id)

            self.manager.update_status(config.id, status)

        except Exception as exc:
            logger.warning(
                "Health poll failed for backend %s",
                config.id,
                exc_info=exc,
            )
            # Backend is offline or errored
            self.manager.update_status(config.id, self._offline_status(config.id))
        finally:
            await client.close()

    async def _collect_full_status(
        self,
        config: BackendConfig,
        client: ComfyUIClient,
    ) -> BackendStatus:
        """Collect full status including metrics.

        Fetches system_stats, metrics_agent, and queue_status to build
        a complete BackendStatus.

        Args:
            config: Backend configuration.
            client: Active client connection.

        Returns:
            BackendStatus with all available metrics.
        """
        # Fetch data concurrently
        system_stats_task = safe_get_system_stats(client)
        metrics_agent_task = safe_get_metrics_agent(client)
        queue_status_task = safe_get_queue_status(client)

        system_stats, metrics_agent, queue_status = await asyncio.gather(
            system_stats_task,
            metrics_agent_task,
            queue_status_task,
        )

        return self._build_status(
            config.id,
            system_stats,
            metrics_agent,
            queue_status,
        )

    def _build_status(
        self,
        backend_id: str,
        system_stats: dict[str, Any],
        metrics_agent: dict[str, Any] | None,
        queue_status: dict[str, Any],
    ) -> BackendStatus:
        """Build BackendStatus from collected data.

        Preserves GPU/CPU utilization from existing status if not provided
        by metrics_agent (since WebSocket provides real-time metrics).

        Args:
            backend_id: Backend identifier.
            system_stats: Response from /system_stats.
            metrics_agent: Response from /orchestrator/metrics.
            queue_status: Queue status info.

        Returns:
            BackendStatus with all available metrics.
        """
        # Get existing status to preserve WebSocket metrics
        existing_status = self.manager.get_status(backend_id)
        
        # Extract system info (RAM from system_stats) - keep in bytes
        system_info = system_stats.get("system", {})
        ram_total = system_info.get("ram_total", 0)
        ram_free = system_info.get("ram_free", 0)
        ram_used = ram_total - ram_free

        # Extract device info
        devices = system_stats.get("devices", [])
        device = devices[0] if devices else {}

        # GPU name and VRAM from system_stats - keep in bytes
        gpu_name = device.get("name", "Unknown")
        gpu_memory_total = device.get("vram_total", 0)
        gpu_memory_free = device.get("vram_free", 0)
        gpu_memory_used = gpu_memory_total - gpu_memory_free

        # Preserve existing GPU/CPU metrics from WebSocket if metrics_agent unavailable or empty
        # WebSocket provides real-time metrics via KayTools/CrysTools
        # Check if metrics_agent has actual data (not just empty dict)
        metrics_agent_data: dict[str, Any] = metrics_agent or {}
        has_metrics_agent = metrics_agent is not None and (
            metrics_agent_data.get("cpu_utilization") is not None
            or metrics_agent_data.get("gpu_utilization") is not None
        )
        
        if existing_status and not has_metrics_agent:
            cpu_utilization = existing_status.cpu_utilization
            gpu_utilization = existing_status.gpu_utilization
            gpu_temperature = existing_status.gpu_temperature
            # Also preserve RAM if WebSocket provided it (more accurate real-time)
            if existing_status.ram_total > 0:
                ram_total = existing_status.ram_total
                ram_used = existing_status.ram_used
        else:
            cpu_utilization = 0.0
            gpu_utilization = 0.0
            gpu_temperature = 0
        
        # Override with metrics_agent data if available and has actual data
        if has_metrics_agent:
            cpu_utilization = metrics_agent_data.get("cpu_utilization", cpu_utilization)
            gpu_utilization = metrics_agent_data.get("gpu_utilization", gpu_utilization)
            gpu_temperature = metrics_agent_data.get("gpu_temperature", gpu_temperature)
            # Override RAM if metrics agent provides data
            if "ram_total" in metrics_agent_data:
                ram_total = metrics_agent_data["ram_total"]
            if "ram_used" in metrics_agent_data:
                ram_used = metrics_agent_data["ram_used"]
            # Override GPU memory if metrics agent provides more accurate data
            if "gpu_memory_total" in metrics_agent_data:
                gpu_memory_total = metrics_agent_data["gpu_memory_total"]
            if "gpu_memory_used" in metrics_agent_data:
                gpu_memory_used = metrics_agent_data["gpu_memory_used"]

        # Extract queue depth - count pending + running items
        queue_running_raw = queue_status.get("queue_running", [])
        queue_pending_raw = queue_status.get("queue_pending", [])
        queue_running = (
            len(queue_running_raw)
            if isinstance(queue_running_raw, list)
            else int(queue_running_raw or 0)
        )
        queue_pending = (
            len(queue_pending_raw)
            if isinstance(queue_pending_raw, list)
            else int(queue_pending_raw or 0)
        )
        queue_depth = queue_running + queue_pending

        return BackendStatus(
            backend_id=backend_id,
            online=True,
            last_seen=datetime.now(timezone.utc),
            queue_depth=queue_depth,
            queue_pending=queue_pending,
            queue_running=queue_running,
            gpu_name=gpu_name,
            gpu_memory_total=gpu_memory_total,
            gpu_memory_used=gpu_memory_used,
            gpu_utilization=gpu_utilization,
            gpu_temperature=gpu_temperature,
            cpu_utilization=cpu_utilization,
            ram_total=ram_total,
            ram_used=ram_used,
        )

    def _offline_status(self, backend_id: str) -> BackendStatus:
        """Create status for offline backend.

        Preserves backend_id but zeroes all metrics.

        Args:
            backend_id: Backend identifier.

        Returns:
            BackendStatus with online=False.
        """
        return BackendStatus(
            backend_id=backend_id,
            online=False,
            last_seen=datetime.now(timezone.utc),
            queue_depth=0,
            gpu_name="Unknown",
            gpu_memory_total=0,
            gpu_memory_used=0,
            gpu_utilization=0.0,
            gpu_temperature=0,
            cpu_utilization=0.0,
            ram_total=0,
            ram_used=0,
        )

    async def poll_once(self) -> None:
        """Public method to trigger a single poll cycle."""
        await self._poll_once()
