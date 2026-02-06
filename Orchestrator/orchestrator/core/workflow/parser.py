"""Parse ComfyUI workflow JSON into structured data.

This module provides:
- Basic workflow parsing (nodes, links)
- Auto-detection of media inputs (LoadImage, LoadVideo nodes)
- Auto-detection of outputs (SaveImage, PreviewImage, VHS_VideoCombine nodes)
- Auto-exposure of common parameters (prompts, seed, cfg, steps) grouped by KSampler
- Error handling for invalid workflow files
"""
from __future__ import annotations

import logging
from collections import deque
import uuid
from dataclasses import dataclass, field
from typing import Any

from orchestrator.core.models.workflow import (
    ExposedParameter,
    MediaInputDefinition,
    MediaType,
    OutputDefinition,
    ParamConstraints,
    ParameterGroup,
    ParamType,
)
from orchestrator.core.workflow.utils import DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH

logger = logging.getLogger(__name__)


# ============================================================================
# Exceptions
# ============================================================================

class WorkflowParseError(Exception):
    """Raised when a workflow file cannot be parsed."""
    
    def __init__(self, message: str, details: str | None = None):
        super().__init__(message)
        self.message = message
        self.details = details
        
    def __str__(self) -> str:
        if self.details:
            return f"{self.message}: {self.details}"
        return self.message


class WorkflowValidationError(Exception):
    """Raised when a workflow file is invalid."""
    
    def __init__(self, message: str, errors: list[str] | None = None):
        super().__init__(message)
        self.message = message
        self.errors = errors or []
        
    def __str__(self) -> str:
        if self.errors:
            return f"{self.message}:\n  - " + "\n  - ".join(self.errors)
        return self.message


# ============================================================================
# Node class mappings for auto-detection
# ============================================================================

# Media input nodes - LoadImage and LoadVideo variants
MEDIA_INPUT_NODES: dict[str, MediaType] = {
    "LoadImage": MediaType.IMAGE,
    "LoadImageMask": MediaType.MASK,
    "LoadVideoUpload": MediaType.VIDEO,
    "VHS_LoadVideo": MediaType.VIDEO,
    "VHS_LoadVideoPath": MediaType.VIDEO,
    "LoadVideo": MediaType.VIDEO,
}

# Output nodes - SaveImage and video output variants
OUTPUT_NODES: dict[str, MediaType] = {
    "SaveImage": MediaType.IMAGE,
    "PreviewImage": MediaType.IMAGE,
    "SaveImageWebsocket": MediaType.IMAGE,
    "VHS_VideoCombine": MediaType.VIDEO,
    "SaveAnimatedWEBP": MediaType.VIDEO,
    "SaveAnimatedPNG": MediaType.VIDEO,
    "PreviewVideo": MediaType.VIDEO,
    "MaskPreview": MediaType.MASK,
    "MaskToImage": MediaType.MASK,
}

# KSampler nodes - these group prompts and sampling parameters
KSAMPLER_NODES: set[str] = {
    "KSampler",
    "KSamplerAdvanced",
    "SamplerCustom",
    "KSamplerSelect",
    "SamplerCustomAdvanced",
}

# Prompt encoding nodes - these provide text prompts
PROMPT_NODES: set[str] = {
    "CLIPTextEncode",
    "CLIPTextEncodeSDXL",
    "CLIPTextEncodeSDXLRefiner", 
    "BNK_CLIPTextEncodeAdvanced",
    "ConditioningCombine",
}

# Parameters to auto-expose from KSampler nodes
KSAMPLER_PARAMS: dict[str, tuple[ParamType, ParamConstraints | None]] = {
    "seed": (ParamType.SEED, ParamConstraints(min_value=0, max_value=2**32 - 1)),
    "steps": (ParamType.INT, ParamConstraints(min_value=1, max_value=150, step=1)),
    "cfg": (ParamType.FLOAT, ParamConstraints(min_value=0.0, max_value=30.0, step=0.5)),
    "denoise": (ParamType.FLOAT, ParamConstraints(min_value=0.0, max_value=1.0, step=0.01)),
    "sampler_name": (ParamType.CHOICE, None),  # Choices populated from node
    "scheduler": (ParamType.CHOICE, None),
}

# Additional KSamplerAdvanced params
KSAMPLER_ADVANCED_PARAMS: dict[str, tuple[ParamType, ParamConstraints | None]] = {
    **KSAMPLER_PARAMS,
    "add_noise": (ParamType.CHOICE, ParamConstraints(choices=["enable", "disable"])),
    "start_at_step": (ParamType.INT, ParamConstraints(min_value=0, max_value=150)),
    "end_at_step": (ParamType.INT, ParamConstraints(min_value=0, max_value=150)),
    "return_with_leftover_noise": (ParamType.CHOICE, ParamConstraints(choices=["disable", "enable"])),
}


# ============================================================================
# Dataclasses for parsed workflow structure
# ============================================================================

@dataclass
class ParsedNode:
    """Parsed node from workflow."""

    id: str
    node_type: str
    title: str
    widget_values: list[Any]
    inputs: list[dict]
    outputs: list[dict]
    position: tuple[float, float] = (0, 0)
    size: tuple[float, float] = (DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT)


@dataclass
class ParsedLink:
    """Parsed link/connection from workflow."""

    link_id: int
    source_node: str
    source_slot: int
    target_node: str
    target_slot: int
    data_type: str


@dataclass
class ParsedWorkflow:
    """Fully parsed workflow structure."""

    nodes: list[ParsedNode] = field(default_factory=list)
    links: list[ParsedLink] = field(default_factory=list)
    node_map: dict[str, ParsedNode] = field(default_factory=dict)
    link_map: dict[int, ParsedLink] = field(default_factory=dict)

    def get_node(self, node_id: str) -> ParsedNode | None:
        """Get node by ID."""
        return self.node_map.get(node_id)

    def get_incoming_links(self, node_id: str) -> list[ParsedLink]:
        """Get all links targeting this node."""
        return [link for link in self.links if link.target_node == node_id]

    def get_outgoing_links(self, node_id: str) -> list[ParsedLink]:
        """Get all links originating from this node."""
        return [link for link in self.links if link.source_node == node_id]

    def get_connected_inputs(self, node_id: str) -> dict[str, tuple[str, int]]:
        """
        Get connected inputs for a node.

        Returns:
            Dict mapping input_name to (source_node_id, source_slot).
        """
        node = self.node_map.get(node_id)
        if not node:
            return {}

        incoming = self.get_incoming_links(node_id)
        result: dict[str, tuple[str, int]] = {}

        for link in incoming:
            # Find input name from slot
            if link.target_slot < len(node.inputs):
                input_name = node.inputs[link.target_slot].get("name", f"input_{link.target_slot}")
                result[input_name] = (link.source_node, link.source_slot)

        return result


# ============================================================================
# WorkflowAnalyzer - High-level analysis for auto-exposure
# ============================================================================

@dataclass
class WorkflowAnalysis:
    """Result of analyzing a workflow for inputs, outputs, and parameters."""
    
    media_inputs: list[MediaInputDefinition] = field(default_factory=list)
    output_definitions: list[OutputDefinition] = field(default_factory=list)
    parameter_groups: list[ParameterGroup] = field(default_factory=list)
    ungrouped_parameters: list[ExposedParameter] = field(default_factory=list)


class WorkflowAnalyzer:
    """Analyze ComfyUI workflows to extract inputs, outputs, and auto-expose parameters."""
    
    def __init__(self):
        self._parser = WorkflowParser()
    
    def analyze(self, workflow_json: dict, api_json: dict | None = None) -> WorkflowAnalysis:
        """
        Analyze a workflow and extract all auto-detectable components.
        
        Args:
            workflow_json: ComfyUI workflow format (with node positions, UI info)
            api_json: API format (with actual input values) - optional
            
        Returns:
            WorkflowAnalysis with inputs, outputs, and parameter groups
        """
        result = WorkflowAnalysis()
        parsed = self._parser.parse_full(workflow_json)
        
        # Detect media inputs
        result.media_inputs = self._detect_media_inputs(parsed)
        
        # Detect outputs
        result.output_definitions = self._detect_outputs(parsed)
        
        # Detect and group parameters
        groups, ungrouped = self._detect_parameters(parsed, api_json or {})
        result.parameter_groups = groups
        result.ungrouped_parameters = ungrouped
        
        return result
    
    def _detect_media_inputs(self, parsed: ParsedWorkflow) -> list[MediaInputDefinition]:
        """Detect LoadImage/LoadVideo nodes as media inputs."""
        inputs: list[MediaInputDefinition] = []
        order = 0
        
        for node in parsed.nodes:
            if node.node_type in MEDIA_INPUT_NODES:
                media_type = MEDIA_INPUT_NODES[node.node_type]
                
                # Determine field name based on node type
                field_name = "video" if media_type == MediaType.VIDEO else "image"
                
                # Check if node accepts mask input (some LoadImage variants)
                accepts_mask = any(
                    inp.get("name", "").lower() == "mask" 
                    for inp in node.inputs
                )
                
                inputs.append(MediaInputDefinition(
                    id=f"media_input_{node.id}",
                    node_id=node.id,
                    node_title=node.title,
                    node_class=node.node_type,
                    media_type=media_type,
                    field_name=field_name,
                    is_required=True,  # Could be refined based on connections
                    accepts_mask=accepts_mask,
                    order=order,
                ))
                order += 1
        
        return inputs
    
    def _detect_outputs(self, parsed: ParsedWorkflow) -> list[OutputDefinition]:
        """Detect SaveImage/PreviewImage/Video output nodes."""
        outputs: list[OutputDefinition] = []
        order = 0
        
        for node in parsed.nodes:
            if node.node_type in OUTPUT_NODES:
                output_type = OUTPUT_NODES[node.node_type]
                
                outputs.append(OutputDefinition(
                    id=f"output_{node.id}",
                    node_id=node.id,
                    node_title=node.title,
                    node_class=node.node_type,
                    output_type=output_type,
                    order=order,
                ))
                order += 1
        
        return outputs
    
    def _detect_parameters(
        self, 
        parsed: ParsedWorkflow, 
        api_json: dict
    ) -> tuple[list[ParameterGroup], list[ExposedParameter]]:
        """
        Detect KSamplers and their connected prompts, create parameter groups.
        
        Returns:
            Tuple of (parameter_groups, ungrouped_parameters)
        """
        groups: list[ParameterGroup] = []
        ungrouped: list[ExposedParameter] = []
        group_order = 0
        
        for node in parsed.nodes:
            if node.node_type in KSAMPLER_NODES:
                group = self._create_parameter_group(node, parsed, api_json, group_order)
                if group:
                    groups.append(group)
                    group_order += 1
        
        return groups, ungrouped
    
    def _create_parameter_group(
        self,
        ksampler_node: ParsedNode,
        parsed: ParsedWorkflow,
        api_json: dict,
        order: int
    ) -> ParameterGroup | None:
        """Create a parameter group for a KSampler and its connected prompts."""
        group_id = f"group_{ksampler_node.id}"
        params: list[ExposedParameter] = []
        param_order = 0
        
        # Get API node data if available
        api_node = api_json.get(ksampler_node.id, {})
        api_inputs = api_node.get("inputs", {})
        
        # Find connected prompt nodes
        connected = parsed.get_connected_inputs(ksampler_node.id)
        
        # Add positive prompt if connected
        if "positive" in connected:
            pos_node_id = connected["positive"][0]
            pos_node = parsed.get_node(pos_node_id)
            if pos_node and pos_node.node_type in PROMPT_NODES:
                prompt_param = self._create_prompt_parameter(
                    pos_node, api_json, group_id, "Positive Prompt", param_order
                )
                if prompt_param:
                    params.append(prompt_param)
                    param_order += 1
        
        # Add negative prompt if connected
        if "negative" in connected:
            neg_node_id = connected["negative"][0]
            neg_node = parsed.get_node(neg_node_id)
            if neg_node and neg_node.node_type in PROMPT_NODES:
                prompt_param = self._create_prompt_parameter(
                    neg_node, api_json, group_id, "Negative Prompt", param_order
                )
                if prompt_param:
                    params.append(prompt_param)
                    param_order += 1
        
        # Add KSampler parameters
        param_defs = (
            KSAMPLER_ADVANCED_PARAMS 
            if ksampler_node.node_type == "KSamplerAdvanced" 
            else KSAMPLER_PARAMS
        )
        
        for field_name, (param_type, constraints) in param_defs.items():
            # Get default value from api_json or widget_values
            default_value = api_inputs.get(field_name)
            
            # Try to get from widget_values if not in api
            if default_value is None:
                widget_idx = self._get_widget_index(ksampler_node, field_name)
                if widget_idx is not None and widget_idx < len(ksampler_node.widget_values):
                    default_value = ksampler_node.widget_values[widget_idx]
            
            # Provide sensible defaults if still None
            if default_value is None:
                default_value = self._get_default_for_param(field_name, param_type)
            
            params.append(ExposedParameter(
                id=f"param_{ksampler_node.id}_{field_name}",
                node_id=ksampler_node.id,
                node_title=ksampler_node.title,
                field_name=field_name,
                display_name=self._format_display_name(field_name),
                param_type=param_type,
                default_value=default_value,
                constraints=constraints,
                group_id=group_id,
                is_auto_exposed=True,
                is_visible=True,
                order=param_order,
            ))
            param_order += 1
        
        return ParameterGroup(
            id=group_id,
            name=ksampler_node.title or f"Sampler {ksampler_node.id}",
            source_node_id=ksampler_node.id,
            source_node_class=ksampler_node.node_type,
            collapsed=False,
            visible=True,
            order=order,
            parameters=params,
        )
    
    def _create_prompt_parameter(
        self,
        prompt_node: ParsedNode,
        api_json: dict,
        group_id: str,
        display_name: str,
        order: int
    ) -> ExposedParameter | None:
        """Create a parameter for a prompt node."""
        api_node = api_json.get(prompt_node.id, {})
        api_inputs = api_node.get("inputs", {})
        
        # Get text value from api_json or widget_values
        default_value = api_inputs.get("text", "")
        if not default_value and prompt_node.widget_values:
            default_value = prompt_node.widget_values[0] if prompt_node.widget_values else ""
        
        return ExposedParameter(
            id=f"param_{prompt_node.id}_text",
            node_id=prompt_node.id,
            node_title=prompt_node.title,
            field_name="text",
            display_name=display_name,
            param_type=ParamType.PROMPT,
            default_value=default_value,
            constraints=None,
            group_id=group_id,
            is_auto_exposed=True,
            is_visible=True,
            order=order,
        )
    
    def _get_widget_index(self, node: ParsedNode, field_name: str) -> int | None:
        """Get widget index for a field name based on node type conventions."""
        # Common widget order for KSampler
        ksampler_order = ["seed", "control_after_generate", "steps", "cfg", "sampler_name", "scheduler", "denoise"]
        
        if node.node_type == "KSampler":
            if field_name in ksampler_order:
                return ksampler_order.index(field_name)
        
        return None
    
    def _get_default_for_param(self, field_name: str, param_type: ParamType) -> Any:
        """Get sensible default value for a parameter."""
        defaults = {
            "seed": 0,
            "steps": 20,
            "cfg": 7.0,
            "denoise": 1.0,
            "sampler_name": "euler",
            "scheduler": "normal",
            "add_noise": "enable",
            "start_at_step": 0,
            "end_at_step": 10000,
            "return_with_leftover_noise": "disable",
        }
        return defaults.get(field_name, "" if param_type == ParamType.STRING else 0)
    
    def _format_display_name(self, field_name: str) -> str:
        """Convert field_name to display name."""
        # Special cases
        special = {
            "cfg": "CFG Scale",
            "sampler_name": "Sampler",
        }
        if field_name in special:
            return special[field_name]
        
        # Convert snake_case to Title Case
        return field_name.replace("_", " ").title()


# ============================================================================
# WorkflowParser - Core parsing functionality (preserved from original)
# ============================================================================

class WorkflowParser:
    """Parse ComfyUI workflow JSON into structured format."""

    def parse(self, workflow_json: dict) -> dict:
        """
        Parse workflow JSON and return basic structure.

        This is the simple legacy interface.

        Args:
            workflow_json: ComfyUI workflow format dict.

        Returns:
            Dict with node_ids, nodes, and links.
        """
        nodes = workflow_json.get("nodes", [])
        links = workflow_json.get("links", [])
        node_ids = [str(node.get("id")) for node in nodes]
        return {
            "node_ids": node_ids,
            "nodes": nodes,
            "links": links,
        }

    def parse_full(self, workflow_json: dict) -> ParsedWorkflow:
        """
        Parse workflow JSON into fully structured ParsedWorkflow.

        Supports both API format and web format:
        - API format: dict keyed by node ID, each with "class_type" and "inputs"
        - Web format: dict with "nodes" array (each with "type") and "links" array

        Args:
            workflow_json: ComfyUI workflow format dict.

        Returns:
            ParsedWorkflow with nodes, links, and lookup maps.
        """
        result = ParsedWorkflow()

        # Detect format: API format has no "nodes" key and values have "class_type"
        is_api_format = self._is_api_format(workflow_json)
        
        if is_api_format:
            # Parse API format
            result = self._parse_api_format(workflow_json)
        else:
            # Parse web format
            for node in workflow_json.get("nodes", []):
                parsed_node = self._parse_node(node)
                result.nodes.append(parsed_node)
                result.node_map[parsed_node.id] = parsed_node

            # Parse links
            for link in workflow_json.get("links", []):
                parsed_link = self._parse_link(link)
                if parsed_link:
                    result.links.append(parsed_link)
                    result.link_map[parsed_link.link_id] = parsed_link

        return result
    
    def _is_api_format(self, workflow_json: dict) -> bool:
        """
        Detect if workflow is in API format vs web format.
        
        API format: dict keyed by node ID strings, each value has "class_type"
        Web format: has "nodes" array with each node having "type"
        """
        # Web format has "nodes" key as a list
        if "nodes" in workflow_json and isinstance(workflow_json.get("nodes"), list):
            return False
        
        # API format: check if any top-level key maps to a dict with "class_type"
        for key, value in workflow_json.items():
            if isinstance(value, dict) and "class_type" in value:
                return True
        
        return False
    
    def _parse_api_format(self, workflow_json: dict) -> ParsedWorkflow:
        """
        Parse API format workflow into ParsedWorkflow.
        
        API format structure:
        {
            "node_id": {
                "class_type": "LoadImage",
                "inputs": {"image": "example.png", ...},
                "_meta": {"title": "Load Image"}
            },
            ...
        }
        """
        result = ParsedWorkflow()
        
        for node_id, node_data in workflow_json.items():
            # Skip non-node entries (e.g., metadata keys)
            if not isinstance(node_data, dict) or "class_type" not in node_data:
                continue
            
            # Extract title from _meta or use class_type
            title = node_data.get("_meta", {}).get("title") or node_data.get("class_type", "Node")
            
            # Extract inputs - in API format, inputs is a dict, not a list
            inputs_dict = node_data.get("inputs", {})
            
            # Convert inputs dict to list format for consistency
            # Each input becomes {"name": key, "value": value}
            inputs_list = []
            for input_name, input_value in inputs_dict.items():
                # Check if input is a link reference [node_id, slot_index]
                if isinstance(input_value, list) and len(input_value) == 2:
                    inputs_list.append({
                        "name": input_name,
                        "link": input_value,  # [source_node_id, source_slot]
                        "type": "LINK"
                    })
                else:
                    inputs_list.append({
                        "name": input_name,
                        "value": input_value,
                        "type": "VALUE"
                    })
            
            parsed_node = ParsedNode(
                id=str(node_id),
                node_type=node_data.get("class_type", ""),
                title=str(title),
                widget_values=[],  # API format stores values in inputs dict
                inputs=inputs_list,
                outputs=[],  # API format doesn't include output definitions
                position=(0.0, 0.0),  # API format doesn't include position
                size=(DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT),
            )
            
            result.nodes.append(parsed_node)
            result.node_map[parsed_node.id] = parsed_node
        
        # Build links from input references in API format
        link_id = 0
        for node in result.nodes:
            for slot_idx, inp in enumerate(node.inputs):
                if inp.get("type") == "LINK" and "link" in inp:
                    link_ref = inp["link"]
                    source_node_id = str(link_ref[0])
                    source_slot = int(link_ref[1])
                    
                    parsed_link = ParsedLink(
                        link_id=link_id,
                        source_node=source_node_id,
                        source_slot=source_slot,
                        target_node=node.id,
                        target_slot=slot_idx,
                        data_type="",
                    )
                    result.links.append(parsed_link)
                    result.link_map[link_id] = parsed_link
                    link_id += 1
        
        return result

    def _parse_node(self, node: dict) -> ParsedNode:
        """Parse a single node dict."""
        # Extract position
        pos = node.get("pos", [0, 0])
        if isinstance(pos, dict):
            position = (float(pos.get("0", 0)), float(pos.get("1", 0)))
        elif isinstance(pos, list) and len(pos) >= 2:
            position = (float(pos[0]), float(pos[1]))
        else:
            position = (0.0, 0.0)

        # Extract size
        size_raw = node.get("size", {})
        if isinstance(size_raw, dict):
            size = (
                float(size_raw.get("0", DEFAULT_NODE_WIDTH)),
                float(size_raw.get("1", DEFAULT_NODE_HEIGHT)),
            )
        elif isinstance(size_raw, list) and len(size_raw) >= 2:
            size = (float(size_raw[0]), float(size_raw[1]))
        else:
            size = (DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT)

        # Extract title - check _meta first, then properties
        title = None
        if "_meta" in node:
            title = node["_meta"].get("title")
        if not title:
            properties = node.get("properties", {})
            title = properties.get("Node name for S&R") or node.get("type", "Node")

        return ParsedNode(
            id=str(node.get("id")),
            node_type=node.get("type", ""),
            title=str(title),
            widget_values=node.get("widgets_values", []),
            inputs=node.get("inputs", []),
            outputs=node.get("outputs", []),
            position=position,
            size=size,
        )

    def _parse_link(self, link: list) -> ParsedLink | None:
        """Parse a single link array."""
        # Link format: [link_id, src_node, src_slot, dst_node, dst_slot, type]
        if len(link) < 5:
            return None

        return ParsedLink(
            link_id=int(link[0]),
            source_node=str(link[1]),
            source_slot=int(link[2]),
            target_node=str(link[3]),
            target_slot=int(link[4]),
            data_type=str(link[5]) if len(link) > 5 else "",
        )

    def get_execution_order(self, workflow_json: dict) -> list[str]:
        """
        Get topological execution order for nodes.

        Returns node IDs in an order such that all dependencies are processed first.

        Args:
            workflow_json: ComfyUI workflow format dict.

        Returns:
            List of node IDs in execution order.
        """
        parsed = self.parse_full(workflow_json)
        return self._get_execution_order_from_parsed(parsed)

    def _get_execution_order_from_parsed(self, parsed: ParsedWorkflow) -> list[str]:
        """Get execution order from a parsed workflow."""
        # Build dependency graph
        dependencies: dict[str, set[str]] = {node.id: set() for node in parsed.nodes}

        for link in parsed.links:
            # target depends on source
            if link.target_node in dependencies:
                dependencies[link.target_node].add(link.source_node)

        # Kahn's algorithm for topological sort
        result: list[str] = []
        ready = deque(nid for nid, deps in dependencies.items() if not deps)

        while ready:
            node_id = ready.popleft()
            result.append(node_id)

            # Remove this node from all dependency sets
            for nid, deps in dependencies.items():
                if node_id in deps:
                    deps.discard(node_id)
                    if not deps and nid not in result and nid not in ready:
                        ready.append(nid)

        return result

    def validate_workflow(self, workflow_json: dict) -> list[str]:
        """
        Validate workflow structure and return list of issues.

        Args:
            workflow_json: ComfyUI workflow format dict.

        Returns:
            List of validation error messages (empty if valid).
        """
        issues: list[str] = []
        parsed = self.parse_full(workflow_json)

        # Check for cycles (would cause infinite loop)
        try:
            order = self._get_execution_order_from_parsed(parsed)
            if len(order) != len(parsed.nodes):
                issues.append("Workflow contains circular dependencies")
        except Exception as e:
            issues.append(f"Execution order error: {e}")

        # Check for broken links
        for link in parsed.links:
            if link.source_node not in parsed.node_map:
                issues.append(f"Link {link.link_id} references missing source node {link.source_node}")
            if link.target_node not in parsed.node_map:
                issues.append(f"Link {link.link_id} references missing target node {link.target_node}")

        # Check for nodes without type
        for node in parsed.nodes:
            if not node.node_type:
                issues.append(f"Node {node.id} has no type")

        return issues


# ============================================================================
# Convenience function for full workflow analysis
# ============================================================================

def analyze_workflow(workflow_json: dict, api_json: dict | None = None) -> WorkflowAnalysis:
    """
    Analyze a workflow and extract inputs, outputs, and auto-exposed parameters.
    
    This is the main entry point for workflow analysis.
    
    Args:
        workflow_json: ComfyUI workflow format (with node positions)
        api_json: API format (with actual values) - optional
        
    Returns:
        WorkflowAnalysis with all detected components
    """
    analyzer = WorkflowAnalyzer()
    return analyzer.analyze(workflow_json, api_json)
