"""Shared utilities for workflow processing."""
from __future__ import annotations


# Default node dimensions in pixels
DEFAULT_NODE_WIDTH = 200.0
DEFAULT_NODE_HEIGHT = 100.0


def get_node_title(node: dict, fallback: str | None = None) -> str:
    """
    Get node title from properties or fall back to provided value.

    ComfyUI stores the node title in properties["Node name for S&R"].

    Args:
        node: Node dict from workflow JSON.
        fallback: Value to use if no title found.

    Returns:
        The node title string.
    """
    properties = node.get("properties", {})
    title = properties.get("Node name for S&R")
    if title:
        return str(title)
    return str(fallback or "Node")
