"""Metrics Agent Node for ComfyUI.

Provides system metrics collection (CPU, GPU, memory) and exposes them
via an HTTP endpoint at /orchestrator/metrics.

This module is designed to be installed as a ComfyUI custom node.
When ComfyUI starts, call setup_routes(app) to register the endpoint.

Dependencies:
    - psutil: For CPU and RAM metrics
    - pynvml (optional): For NVIDIA GPU metrics

Example:
    # In ComfyUI server setup:
    from agents.metrics_agent.nodes import setup_routes
    setup_routes(app)

    # Or call get_metrics() directly:
    from agents.metrics_agent.nodes import get_metrics
    metrics = get_metrics()
    # Returns:
    # {
    #     "cpu_utilization": 25.5,
    #     "gpu_utilization": 45.0,
    #     "gpu_temperature": 65,
    #     "ram_total": 32768,
    #     "ram_used": 16384,
    #     "gpu_memory_total": 24576,
    #     "gpu_memory_used": 12288
    # }
"""

from __future__ import annotations

from typing import Any

import psutil
import pynvml


def _get_nvidia_metrics() -> dict[str, Any] | None:
    """Get NVIDIA GPU metrics using pynvml.

    Returns:
        Dictionary with GPU metrics, or None if NVIDIA GPU not available.

    Metrics returned:
        - gpu_utilization: GPU utilization percentage (0-100)
        - gpu_temperature: GPU temperature in Celsius
        - gpu_memory_total: Total GPU memory in MB
        - gpu_memory_used: Used GPU memory in MB
    """
    try:
        pynvml.nvmlInit()
    except pynvml.NVMLError:
        return None

    try:
        # Get handle for first GPU (most common case)
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)

        # Get GPU utilization
        utilization = pynvml.nvmlDeviceGetUtilizationRates(handle)
        gpu_utilization = float(utilization.gpu)

        # Get GPU temperature
        try:
            gpu_temperature = pynvml.nvmlDeviceGetTemperature(
                handle, pynvml.NVML_TEMPERATURE_GPU
            )
        except pynvml.NVMLError:
            gpu_temperature = 0

        # Get GPU memory info
        memory_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
        gpu_memory_total = memory_info.total // (1024 * 1024)  # Convert to MB
        gpu_memory_used = memory_info.used // (1024 * 1024)    # Convert to MB

        return {
            "gpu_utilization": gpu_utilization,
            "gpu_temperature": gpu_temperature,
            "gpu_memory_total": gpu_memory_total,
            "gpu_memory_used": gpu_memory_used,
        }
    except (RuntimeError, OSError, pynvml.NVMLError):
        # No GPU, driver issues, permission errors, etc.
        return None
    finally:
        try:
            pynvml.nvmlShutdown()
        except pynvml.NVMLError:
            pass


def _get_amd_metrics() -> dict[str, Any] | None:
    """Get AMD GPU metrics.

    Returns:
        Dictionary with GPU metrics, or None if AMD GPU not available.

    Note:
        AMD GPU support is limited. This is a placeholder for future
        implementation using pyamdgpuinfo or similar.
    """
    # AMD GPU metrics support is limited
    # Could use pyamdgpuinfo if available
    return None


def get_metrics() -> dict[str, Any]:
    """Get current system metrics.

    Collects CPU utilization, RAM usage, and GPU metrics (if available).
    All memory values are in megabytes (MB).

    Returns:
        Dictionary containing:
        - cpu_utilization: CPU usage percentage (0-100)
        - gpu_utilization: GPU usage percentage (0-100), 0 if no GPU
        - gpu_temperature: GPU temperature in Celsius, 0 if unavailable
        - ram_total: Total system RAM in MB
        - ram_used: Used system RAM in MB
        - gpu_memory_total: Total GPU memory in MB, 0 if no GPU
        - gpu_memory_used: Used GPU memory in MB, 0 if no GPU

    Example:
        >>> metrics = get_metrics()
        >>> print(f"CPU: {metrics['cpu_utilization']}%")
        CPU: 25.5%
    """
    # Initialize with defaults
    metrics: dict[str, Any] = {
        "cpu_utilization": 0.0,
        "gpu_utilization": 0.0,
        "gpu_temperature": 0,
        "ram_total": 0,
        "ram_used": 0,
        "gpu_memory_total": 0,
        "gpu_memory_used": 0,
    }

    # CPU utilization (non-blocking, returns immediately if interval=None)
    metrics["cpu_utilization"] = psutil.cpu_percent(interval=None)

    # RAM metrics
    mem = psutil.virtual_memory()
    metrics["ram_total"] = mem.total // (1024 * 1024)  # Convert to MB
    metrics["ram_used"] = mem.used // (1024 * 1024)    # Convert to MB

    # GPU metrics - try NVIDIA first, then AMD
    gpu_metrics = _get_nvidia_metrics()
    if gpu_metrics is None:
        gpu_metrics = _get_amd_metrics()

    if gpu_metrics is not None:
        metrics["gpu_utilization"] = gpu_metrics.get("gpu_utilization", 0.0)
        metrics["gpu_temperature"] = gpu_metrics.get("gpu_temperature", 0)
        metrics["gpu_memory_total"] = gpu_metrics.get("gpu_memory_total", 0)
        metrics["gpu_memory_used"] = gpu_metrics.get("gpu_memory_used", 0)

    return metrics


def setup_routes(app: Any) -> None:
    """Register the metrics endpoint with an aiohttp application.

    Adds a GET endpoint at /orchestrator/metrics that returns
    the current system metrics as JSON.

    Args:
        app: An aiohttp web.Application instance (or compatible).

    Example:
        from aiohttp import web
        from agents.metrics_agent.nodes import setup_routes

        app = web.Application()
        setup_routes(app)
        web.run_app(app)
    """
    from aiohttp import web

    async def metrics_handler(request: web.Request) -> web.Response:
        """Handle GET /orchestrator/metrics requests.

        Returns current system metrics as JSON.

        Args:
            request: The incoming HTTP request.

        Returns:
            JSON response with metrics data.
        """
        metrics = get_metrics()
        return web.json_response(metrics)

    app.router.add_get("/orchestrator/metrics", metrics_handler)


# ComfyUI Node Registration
# These are required by ComfyUI's custom node system

NODE_CLASS_MAPPINGS: dict[str, Any] = {}
NODE_DISPLAY_NAME_MAPPINGS: dict[str, str] = {}

# Export for ComfyUI
__all__ = [
    "get_metrics",
    "setup_routes",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
]
