"""
WebSocket-based metrics collector for ComfyUI monitor events.

Listens to ComfyUI WebSocket for metrics events from:
- KayTools: 'kaytool.resources' events
- CrysTools: 'crystools.monitor' events

Updates backend status with real-time GPU/CPU metrics.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Callable, Optional

import websockets
from websockets.exceptions import ConnectionClosed, WebSocketException

from orchestrator.backends.manager import BackendStatus

logger = logging.getLogger(__name__)


@dataclass
class ComfyMetrics:
    """Parsed metrics from KayTools or CrysTools monitor events."""
    
    cpu_utilization: float = 0.0
    ram_total: int = 0  # bytes
    ram_used: int = 0   # bytes
    ram_percent: float = 0.0
    gpu_utilization: float = 0.0
    gpu_vram_total: int = 0  # bytes
    gpu_vram_used: int = 0   # bytes
    gpu_vram_percent: float = 0.0
    gpu_temperature: float = 0.0
    gpu_name: str = ""
    
    @classmethod
    def from_kaytool_data(cls, data: dict) -> ComfyMetrics:
        """Parse KayTools 'kaytool.resources' data into metrics.
        
        KayTools format:
        {
            "cpu_percent": 2.2,
            "ram_total": 125.7,      # GB
            "ram_used": 21.6,        # GB
            "ram_percent": 17.2,
            "gpu": [{
                "load": 21.0,        # GPU utilization %
                "memory_used": 3.35, # GB
                "memory_total": 31.84, # GB
                "memory_percent": 10.53,
                "temperature": 32.0,
                "name": "NVIDIA GeForce RTX 5090"
            }]
        }
        """
        # Convert GB to bytes for consistency
        GB = 1024 * 1024 * 1024
        
        metrics = cls(
            cpu_utilization=data.get("cpu_percent", 0.0),
            ram_total=int(data.get("ram_total", 0) * GB),
            ram_used=int(data.get("ram_used", 0) * GB),
            ram_percent=data.get("ram_percent", 0.0),
        )
        
        # Extract GPU metrics from first GPU
        gpus = data.get("gpu", [])
        if gpus:
            gpu = gpus[0]
            metrics.gpu_utilization = gpu.get("load", 0.0)
            metrics.gpu_vram_total = int(gpu.get("memory_total", 0) * GB)
            metrics.gpu_vram_used = int(gpu.get("memory_used", 0) * GB)
            metrics.gpu_vram_percent = gpu.get("memory_percent", 0.0)
            metrics.gpu_temperature = gpu.get("temperature", 0.0)
            metrics.gpu_name = gpu.get("name", "")
        
        return metrics
    
    @classmethod
    def from_crystools_data(cls, data: dict) -> ComfyMetrics:
        """Parse CrysTools 'crystools.monitor' data into metrics.
        
        CrysTools format:
        {
            "cpu_utilization": 2.2,
            "ram_total": 134968180736,  # bytes
            "ram_used": 23185129472,    # bytes
            "ram_used_percent": 17.2,
            "device_type": "cuda",
            "gpus": [{
                "gpu_utilization": 21.0,
                "gpu_temperature": 32.0,
                "vram_total": 34186346496,  # bytes
                "vram_used": 3600130048,    # bytes
                "vram_used_percent": 10.53
            }]
        }
        """
        metrics = cls(
            cpu_utilization=data.get("cpu_utilization", 0.0),
            ram_total=data.get("ram_total", 0),
            ram_used=data.get("ram_used", 0),
            ram_percent=data.get("ram_used_percent", 0.0),
        )
        
        # Extract GPU metrics from first GPU
        gpus = data.get("gpus", [])
        if gpus:
            gpu = gpus[0]
            metrics.gpu_utilization = gpu.get("gpu_utilization", 0.0)
            metrics.gpu_vram_total = gpu.get("vram_total", 0)
            metrics.gpu_vram_used = gpu.get("vram_used", 0)
            metrics.gpu_vram_percent = gpu.get("vram_used_percent", 0.0)
            metrics.gpu_temperature = gpu.get("gpu_temperature", 0.0)
        
        return metrics


# Alias for backwards compatibility
CrysToolsMetrics = ComfyMetrics


@dataclass
class MetricsWebSocket:
    """
    Persistent WebSocket connection for receiving CrysTools metrics.
    
    Connects to ComfyUI WebSocket and listens for 'crystools.monitor' events,
    then invokes callback with parsed metrics.
    """
    
    backend_id: str
    host: str
    port: int
    on_metrics: Callable[[str, CrysToolsMetrics], None]
    on_status_change: Optional[Callable[[str, bool], None]] = None
    
    _client_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    _task: Optional[asyncio.Task] = field(default=None, init=False)
    _running: bool = field(default=False, init=False)
    _reconnect_delay: float = field(default=5.0, init=False)
    _max_reconnect_delay: float = field(default=60.0, init=False)
    
    @property
    def ws_url(self) -> str:
        """WebSocket URL for this backend."""
        return f"ws://{self.host}:{self.port}/ws?clientId={self._client_id}"
    
    async def start(self) -> None:
        """Start the WebSocket listener."""
        if self._running:
            logger.warning(f"MetricsWebSocket for {self.backend_id} already running")
            return
        
        self._running = True
        self._task = asyncio.create_task(self._listen_loop())
        logger.debug(f"Started MetricsWebSocket for {self.backend_id}")
    
    async def stop(self) -> None:
        """Stop the WebSocket listener."""
        self._running = False
        
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        
        logger.debug(f"Stopped MetricsWebSocket for {self.backend_id}")
    
    async def _listen_loop(self) -> None:
        """Main loop that maintains WebSocket connection with reconnect."""
        delay = self._reconnect_delay
        
        while self._running:
            try:
                await self._connect_and_listen()
                # Reset delay on successful connection
                delay = self._reconnect_delay
            except ConnectionClosed as e:
                logger.warning(
                    f"WebSocket closed for {self.backend_id}: {e.code} {e.reason}"
                )
                self._notify_offline()
            except WebSocketException as e:
                logger.warning(f"WebSocket error for {self.backend_id}: {e}")
                self._notify_offline()
            except Exception as e:
                logger.error(f"Unexpected error in MetricsWebSocket for {self.backend_id}: {e}")
                self._notify_offline()
            
            if self._running:
                logger.debug(
                    f"Reconnecting to {self.backend_id} in {delay:.1f}s..."
                )
                await asyncio.sleep(delay)
                # Exponential backoff
                delay = min(delay * 1.5, self._max_reconnect_delay)
    
    async def _connect_and_listen(self) -> None:
        """Connect to WebSocket and listen for messages."""
        logger.debug(f"Connecting to {self.ws_url}")
        
        async with websockets.connect(
            self.ws_url,
            ping_interval=30,
            ping_timeout=10,
            close_timeout=5,
        ) as ws:
            logger.debug(f"Connected to {self.backend_id} WebSocket")
            self._notify_online()
            
            async for message in ws:
                if not self._running:
                    break
                
                self._handle_message(message)
    
    def _handle_message(self, message: str | bytes) -> None:
        """Parse and handle a WebSocket message."""
        # Skip binary messages
        if isinstance(message, bytes):
            return
        
        try:
            data = json.loads(message)
        except json.JSONDecodeError:
            logger.debug(f"Non-JSON message from {self.backend_id}: {message[:100]}")
            return
        
        msg_type = data.get("type")
        
        # Handle KayTools metrics (preferred)
        if msg_type == "kaytool.resources":
            self._handle_kaytool_metrics(data.get("data", {}))
        # Handle CrysTools metrics (fallback)
        elif msg_type == "crystools.monitor":
            self._handle_crystools_monitor(data.get("data", {}))
    
    def _handle_kaytool_metrics(self, data: dict) -> None:
        """Handle KayTools 'kaytool.resources' event."""
        try:
            metrics = ComfyMetrics.from_kaytool_data(data)
            self.on_metrics(self.backend_id, metrics)
            
            logger.debug(
                f"KayTools metrics from {self.backend_id}: "
                f"GPU={metrics.gpu_utilization:.1f}% "
                f"CPU={metrics.cpu_utilization:.1f}% "
                f"VRAM={metrics.gpu_vram_percent:.1f}%"
            )
        except Exception as e:
            logger.error(f"Error parsing KayTools metrics: {e}")
    
    def _handle_crystools_monitor(self, data: dict) -> None:
        """Handle CrysTools monitor event."""
        try:
            metrics = ComfyMetrics.from_crystools_data(data)
            self.on_metrics(self.backend_id, metrics)
            
            logger.debug(
                f"CrysTools metrics from {self.backend_id}: "
                f"GPU={metrics.gpu_utilization:.1f}% "
                f"CPU={metrics.cpu_utilization:.1f}% "
                f"VRAM={metrics.gpu_vram_percent:.1f}%"
            )
        except Exception as e:
            logger.error(f"Error parsing CrysTools metrics: {e}")
    
    def _notify_online(self) -> None:
        """Notify that backend is online."""
        if self.on_status_change:
            self.on_status_change(self.backend_id, True)
    
    def _notify_offline(self) -> None:
        """Notify that backend is offline."""
        if self.on_status_change:
            self.on_status_change(self.backend_id, False)


@dataclass
class MetricsWebSocketManager:
    """
    Manages MetricsWebSocket connections for multiple backends.
    """
    
    on_metrics: Callable[[str, CrysToolsMetrics], None]
    on_status_change: Optional[Callable[[str, bool], None]] = None
    
    _connections: dict[str, MetricsWebSocket] = field(default_factory=dict, init=False)
    
    async def add_backend(self, backend_id: str, host: str, port: int) -> None:
        """Add and start a WebSocket connection for a backend."""
        if backend_id in self._connections:
            logger.warning(f"Backend {backend_id} already has a metrics connection")
            return
        
        ws = MetricsWebSocket(
            backend_id=backend_id,
            host=host,
            port=port,
            on_metrics=self.on_metrics,
            on_status_change=self.on_status_change,
        )
        
        self._connections[backend_id] = ws
        await ws.start()
    
    async def remove_backend(self, backend_id: str) -> None:
        """Stop and remove a WebSocket connection for a backend."""
        if backend_id not in self._connections:
            return
        
        ws = self._connections.pop(backend_id)
        await ws.stop()
    
    async def start_all(self) -> None:
        """Start all WebSocket connections."""
        for ws in self._connections.values():
            await ws.start()
    
    async def stop_all(self) -> None:
        """Stop all WebSocket connections."""
        for ws in self._connections.values():
            await ws.stop()
        self._connections.clear()
    
    def get_backend_ids(self) -> list[str]:
        """Get list of backend IDs with active connections."""
        return list(self._connections.keys())
