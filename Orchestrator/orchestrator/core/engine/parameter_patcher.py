from __future__ import annotations

from copy import deepcopy
from typing import Any

from orchestrator.core.models.workflow import ExposedParameter


def apply_node_bypass(
    api_json: dict[str, Any],
    bypassed_nodes: set[str],
) -> dict[str, Any]:
    """
    Remove bypassed nodes from the API JSON.
    
    When a node is bypassed, it should not execute. In ComfyUI's API format,
    this means simply removing the node from the JSON. Any connections to/from
    the bypassed node will be broken, which is the expected behavior.
    
    Args:
        api_json: The workflow in API format.
        bypassed_nodes: Set of node IDs to bypass (remove).
        
    Returns:
        API JSON with bypassed nodes removed.
    """
    if not bypassed_nodes:
        return api_json
    
    updated = deepcopy(api_json)
    
    # Remove bypassed nodes
    for node_id in bypassed_nodes:
        if node_id in updated:
            del updated[node_id]
    
    # Also need to clean up any connections TO bypassed nodes
    # Connections in API format are arrays like ["node_id", output_index]
    for node_id, node_data in updated.items():
        if not isinstance(node_data, dict):
            continue
        
        inputs = node_data.get("inputs", {})
        if not isinstance(inputs, dict):
            continue
        
        # Find and nullify connections to bypassed nodes
        for field_name, value in list(inputs.items()):
            if isinstance(value, list) and len(value) == 2:
                connected_node_id = str(value[0])
                if connected_node_id in bypassed_nodes:
                    # Connection to a bypassed node - remove it
                    # This will likely cause an error in ComfyUI, but that's 
                    # expected when bypassing a node that other nodes depend on
                    del inputs[field_name]
    
    return updated


def patch_parameters(
    api_json: dict[str, Any],
    exposed_parameters: list[ExposedParameter],
    parameter_values: dict[str, Any],
) -> dict[str, Any]:
    """
    Patch parameter values into the API JSON.
    
    This function takes the ComfyUI workflow in API format and patches in
    the user-provided parameter values. It works in two modes:
    
    1. If exposed_parameters is provided, it uses those to map values to nodes
    2. If parameter_values keys are in "node_id:field_name" format, patch directly
    
    IMPORTANT: For exposed parameters, if no user value is provided, the default_value
    from the ExposedParameter is used. This ensures dropdowns (Lora, Model, etc.) 
    always have valid values.
    
    Args:
        api_json: The workflow in API format (flat dict with node IDs as keys).
            Each node has structure: {"class_type": "...", "inputs": {...}}
        exposed_parameters: List of exposed parameters with node_id and field_name
            that define which workflow fields can be modified. Can be empty.
        parameter_values: Dict mapping parameter key -> new value.
            Keys can be "node_id:field_name" format OR parameter.id OR field_name.
            
    Returns:
        Patched API JSON with new values applied. The original is not modified.
        
    Example:
        >>> api_json = {
        ...     "3": {"class_type": "KSampler", "inputs": {"seed": 0, "steps": 20}}
        ... }
        >>> # Direct patching with node_id:field_name keys
        >>> values = {"3:seed": 42, "3:steps": 30}
        >>> patched = patch_parameters(api_json, [], values)
        >>> patched["3"]["inputs"]["seed"]
        42
    """
    updated = deepcopy(api_json)
    
    # First, patch using exposed_parameters mapping
    # Use get_value_for_parameter which falls back to default_value
    for parameter in exposed_parameters:
        # Get effective value (user value OR default_value)
        value = get_value_for_parameter(parameter, parameter_values)
        if value is None:
            # Still None means both user value and default are None - skip
            continue
            
        node = updated.get(parameter.node_id)
        if not node:
            continue
            
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
            
        inputs[parameter.field_name] = value
    
    # Second, directly patch any "node_id:field_name" keys in parameter_values
    # This allows patching without needing exposed_parameters
    for key, value in parameter_values.items():
        if ":" not in key:
            continue  # Skip non-direct keys
            
        parts = key.split(":", 1)
        if len(parts) != 2:
            continue
            
        node_id, field_name = parts
        
        node = updated.get(node_id)
        if not node:
            continue
            
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        
        # Only patch if the field exists in the original (safety check)
        if field_name in inputs:
            inputs[field_name] = value

    return updated


def _get_parameter_value(
    parameter: ExposedParameter,
    values: dict[str, Any],
) -> Any | None:
    """
    Get the value for a parameter from the values dict.
    
    Looks up by parameter.id first (preferred), then by field_name.
    Returns None if no value is found (not in dict).
    
    Args:
        parameter: The exposed parameter to look up.
        values: Dict of parameter values, keyed by id or field_name.
        
    Returns:
        The parameter value, or None if not found.
    """
    # Try lookup by parameter ID first (more specific)
    if parameter.id in values:
        return values[parameter.id]
    
    # Fall back to field_name lookup
    if parameter.field_name in values:
        return values[parameter.field_name]
    
    return None


def get_value_for_parameter(
    parameter: ExposedParameter,
    parameter_values: dict[str, Any],
) -> Any:
    """
    Get the effective value for an exposed parameter.
    
    Returns the user-provided value if present, otherwise the default.
    
    Args:
        parameter: The exposed parameter.
        parameter_values: User-provided parameter values.
        
    Returns:
        The value to use for this parameter.
    """
    value = _get_parameter_value(parameter, parameter_values)
    if value is not None:
        return value
    return parameter.default_value
