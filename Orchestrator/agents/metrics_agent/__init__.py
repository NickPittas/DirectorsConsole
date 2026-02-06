"""Metrics Agent custom node for ComfyUI.

This module provides a custom node that exposes system metrics
(CPU, GPU, memory utilization) via an HTTP endpoint for the
Comfy Orchestrator to collect.

Usage:
    Install this as a ComfyUI custom node. It will automatically
    register the /orchestrator/metrics endpoint when ComfyUI starts.
"""

from agents.metrics_agent.nodes import get_metrics, setup_routes

__all__ = ["get_metrics", "setup_routes"]
