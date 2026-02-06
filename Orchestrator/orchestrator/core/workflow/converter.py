"""Convert ComfyUI workflow format to API format for execution."""
from __future__ import annotations

from typing import Any

from orchestrator.core.workflow.utils import get_node_title


def workflow_to_api(
    workflow_json: dict,
    widget_map: dict[str, list[str]],
) -> dict[str, dict[str, Any]]:
    """
    Convert a ComfyUI workflow format JSON to API format.

    The workflow format (from "Save" button) uses positional arrays for widget values.
    The API format (for /prompt endpoint) uses named inputs.

    Args:
        workflow_json: The workflow in ComfyUI's save format with nodes and links.
        widget_map: Map of node_type -> ordered list of widget input names.
                    Should be built from ComfyUI's /object_info endpoint.

    Returns:
        API format dict ready for POST to /prompt endpoint.

    Example:
        >>> widget_map = {"KSampler": ["seed", "steps", "cfg", ...]}
        >>> api = workflow_to_api(workflow, widget_map)
        >>> # api["3"]["inputs"]["seed"] == workflow widget_values[0]
    """
    api_json: dict[str, dict[str, Any]] = {}
    link_map = _build_link_map(workflow_json)

    for node in workflow_json.get("nodes", []):
        node_id = str(node.get("id"))
        node_type = node.get("type")

        if node_type is None:
            continue

        api_node: dict[str, Any] = {
            "class_type": node_type,
            "inputs": {},
            "_meta": {
                "title": get_node_title(node, node_type),
            },
        }

        # Map widget values to named inputs using widget_map
        widget_values = node.get("widgets_values", [])
        widget_names = widget_map.get(node_type, [])

        for index, value in enumerate(widget_values):
            if index >= len(widget_names):
                # No name for this index - skip or use generic
                continue
            input_name = widget_names[index]
            api_node["inputs"][input_name] = value

        # Map linked inputs from connections
        for input_def in node.get("inputs", []):
            input_name = input_def.get("name")
            link_id = input_def.get("link")

            if input_name is None or link_id is None:
                continue
            if link_id not in link_map:
                continue

            source_node, source_slot = link_map[link_id]
            api_node["inputs"][input_name] = [source_node, source_slot]

        api_json[node_id] = api_node

    return api_json


def api_to_workflow(
    api_json: dict[str, dict[str, Any]],
    widget_map: dict[str, list[str]],
) -> dict:
    """
    Convert API format back to workflow format (best effort).

    Note: This is a lossy conversion - visual layout info will be lost.

    Args:
        api_json: The API format workflow.
        widget_map: Map of node_type -> ordered list of widget input names.

    Returns:
        Workflow format dict (without visual layout).
    """
    nodes: list[dict] = []
    links: list[list] = []
    link_id = 0

    # Track which outputs are connected to which inputs
    connection_targets: dict[tuple[str, int], tuple[str, str, int]] = {}

    for node_id, node_def in api_json.items():
        node_type = node_def.get("class_type", "")
        inputs = node_def.get("inputs", {})
        widget_names = widget_map.get(node_type, [])

        # Extract widget values in order
        widget_values: list[Any] = []
        for name in widget_names:
            if name in inputs:
                value = inputs[name]
                # Skip if it's a connection (list with [node_id, slot])
                if isinstance(value, list) and len(value) == 2:
                    continue
                widget_values.append(value)

        # Build node
        node: dict = {
            "id": int(node_id),
            "type": node_type,
            "widgets_values": widget_values,
            "inputs": [],
            "outputs": [],
            "properties": {
                "Node name for S&R": node_def.get("_meta", {}).get("title", node_type),
            },
        }

        # Track connections
        for input_name, value in inputs.items():
            if isinstance(value, list) and len(value) == 2:
                src_node, src_slot = value
                connection_targets[(str(src_node), int(src_slot))] = (
                    node_id,
                    input_name,
                    len(node["inputs"]),
                )
                node["inputs"].append(
                    {"name": input_name, "type": "", "link": None}
                )

        nodes.append(node)

    # Build links from connections
    for (src_node, src_slot), (dst_node, input_name, dst_slot) in connection_targets.items():
        link_id += 1
        links.append([link_id, int(src_node), src_slot, int(dst_node), dst_slot, ""])

        # Update link reference in destination node
        for node in nodes:
            if str(node["id"]) == dst_node:
                for inp in node["inputs"]:
                    if inp["name"] == input_name and inp["link"] is None:
                        inp["link"] = link_id
                        break

    return {
        "nodes": nodes,
        "links": links,
        "last_node_id": max((int(n) for n in api_json.keys()), default=0),
        "last_link_id": link_id,
    }


def _build_link_map(workflow_json: dict) -> dict[int, tuple[str, int]]:
    """
    Build a map from link_id to (source_node_id, source_slot).

    Links in workflow format: [link_id, src_node, src_slot, dst_node, dst_slot, type]
    """
    link_map: dict[int, tuple[str, int]] = {}

    for link in workflow_json.get("links", []):
        if len(link) < 3:
            continue
        link_id = int(link[0])
        source_node = str(link[1])
        source_slot = int(link[2])
        link_map[link_id] = (source_node, source_slot)

    return link_map
