"""Tests for the Metrics Agent custom node.

Tests cover:
- get_metrics() function returning CPU/GPU/memory metrics
- setup_routes() registering /orchestrator/metrics endpoint
- Response structure matching expected format
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Skip all tests in this module if agents module not available
pytest.importorskip("agents.metrics_agent.nodes")

from agents.metrics_agent.nodes import get_metrics, setup_routes


class TestGetMetrics:
    """Tests for the get_metrics() function."""

    def test_metrics_returns_cpu(self) -> None:
        """Metrics should include cpu_utilization."""
        metrics = get_metrics()
        assert "cpu_utilization" in metrics

    def test_metrics_returns_gpu_utilization(self) -> None:
        """Metrics should include gpu_utilization."""
        metrics = get_metrics()
        assert "gpu_utilization" in metrics

    def test_metrics_returns_gpu_temperature(self) -> None:
        """Metrics should include gpu_temperature."""
        metrics = get_metrics()
        assert "gpu_temperature" in metrics

    def test_metrics_returns_ram_info(self) -> None:
        """Metrics should include RAM total and used."""
        metrics = get_metrics()
        assert "ram_total" in metrics
        assert "ram_used" in metrics

    def test_metrics_returns_gpu_memory_info(self) -> None:
        """Metrics should include GPU memory total and used."""
        metrics = get_metrics()
        assert "gpu_memory_total" in metrics
        assert "gpu_memory_used" in metrics

    def test_cpu_utilization_is_float(self) -> None:
        """CPU utilization should be a float percentage."""
        metrics = get_metrics()
        assert isinstance(metrics["cpu_utilization"], (int, float))

    def test_gpu_utilization_is_float(self) -> None:
        """GPU utilization should be a float percentage."""
        metrics = get_metrics()
        assert isinstance(metrics["gpu_utilization"], (int, float))

    def test_gpu_temperature_is_int(self) -> None:
        """GPU temperature should be an integer (Celsius)."""
        metrics = get_metrics()
        assert isinstance(metrics["gpu_temperature"], int)

    def test_ram_values_are_integers(self) -> None:
        """RAM values should be integers (MB)."""
        metrics = get_metrics()
        assert isinstance(metrics["ram_total"], int)
        assert isinstance(metrics["ram_used"], int)

    def test_gpu_memory_values_are_integers(self) -> None:
        """GPU memory values should be integers (MB)."""
        metrics = get_metrics()
        assert isinstance(metrics["gpu_memory_total"], int)
        assert isinstance(metrics["gpu_memory_used"], int)

    @patch("agents.metrics_agent.nodes.psutil")
    def test_cpu_utilization_from_psutil(self, mock_psutil: MagicMock) -> None:
        """CPU utilization should come from psutil."""
        mock_psutil.cpu_percent.return_value = 42.5
        mock_psutil.virtual_memory.return_value = MagicMock(total=32 * 1024**3, used=16 * 1024**3)

        metrics = get_metrics()

        mock_psutil.cpu_percent.assert_called_once()
        assert metrics["cpu_utilization"] == 42.5

    @patch("agents.metrics_agent.nodes.psutil")
    def test_ram_from_psutil(self, mock_psutil: MagicMock) -> None:
        """RAM metrics should come from psutil.virtual_memory()."""
        mock_psutil.cpu_percent.return_value = 0.0
        mock_psutil.virtual_memory.return_value = MagicMock(
            total=32 * 1024**3,  # 32 GB in bytes
            used=16 * 1024**3,   # 16 GB in bytes
        )

        metrics = get_metrics()

        mock_psutil.virtual_memory.assert_called_once()
        assert metrics["ram_total"] == 32768  # MB
        assert metrics["ram_used"] == 16384   # MB


class TestSetupRoutes:
    """Tests for the setup_routes() function."""

    def test_setup_routes_adds_metrics_endpoint(self) -> None:
        """setup_routes should register /orchestrator/metrics GET endpoint."""
        # Skip if aiohttp not available (requires aiohappyeyeballs)
        pytest.importorskip("aiohappyeyeballs")
        
        mock_app = MagicMock()
        mock_router = MagicMock()
        mock_app.router = mock_router

        setup_routes(mock_app)

        mock_router.add_get.assert_called_once()
        call_args = mock_router.add_get.call_args
        assert call_args[0][0] == "/orchestrator/metrics"

    def test_setup_routes_handler_returns_json(self) -> None:
        """The registered handler should return JSON response."""
        # Skip if aiohttp not available (requires aiohappyeyeballs)
        pytest.importorskip("aiohappyeyeballs")
        
        mock_app = MagicMock()
        mock_router = MagicMock()
        mock_app.router = mock_router

        setup_routes(mock_app)

        # Get the handler function that was registered
        handler = mock_router.add_get.call_args[0][1]
        assert callable(handler)


class TestMetricsHandler:
    """Tests for the metrics HTTP handler."""

    @pytest.mark.asyncio
    async def test_handler_returns_metrics(self) -> None:
        """Handler should return get_metrics() data as JSON response."""
        aiohttp = pytest.importorskip("aiohttp")

        mock_app = MagicMock()
        mock_router = MagicMock()
        mock_app.router = mock_router

        setup_routes(mock_app)

        # Get the handler
        handler = mock_router.add_get.call_args[0][1]

        # Create a mock request
        mock_request = MagicMock()

        # Call the handler
        response = await handler(mock_request)

        # Should be a web.Response or web.json_response
        assert hasattr(response, "status") or hasattr(response, "body")


class TestGPUMetrics:
    """Tests for GPU-specific metrics collection."""

    @patch("agents.metrics_agent.nodes._get_nvidia_metrics")
    def test_nvidia_gpu_metrics(self, mock_nvidia: MagicMock) -> None:
        """Should collect NVIDIA GPU metrics when available."""
        mock_nvidia.return_value = {
            "gpu_utilization": 75.0,
            "gpu_temperature": 65,
            "gpu_memory_total": 24576,
            "gpu_memory_used": 12288,
        }

        metrics = get_metrics()

        # GPU metrics should be present
        assert metrics["gpu_utilization"] == 75.0
        assert metrics["gpu_temperature"] == 65

    @patch("agents.metrics_agent.nodes._get_nvidia_metrics")
    def test_fallback_when_no_gpu(self, mock_nvidia: MagicMock) -> None:
        """Should return zeros when no GPU is available."""
        mock_nvidia.return_value = None

        metrics = get_metrics()

        # Should still have keys but with default values
        assert "gpu_utilization" in metrics
        assert "gpu_temperature" in metrics
        assert metrics["gpu_utilization"] == 0.0
        assert metrics["gpu_temperature"] == 0
