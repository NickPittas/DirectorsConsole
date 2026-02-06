"""Workflow inspection for exposable parameters using ComfyUI object_info."""
from __future__ import annotations

from typing import Any

from orchestrator.core.models.workflow import (
    ExposedParameter,
    ParamConstraints,
    ParamType,
)
from orchestrator.core.workflow.utils import get_node_title


# Connection types that should NOT become widget inputs
CONNECTION_TYPES = frozenset({
    "MODEL",
    "CLIP",
    "VAE",
    "CONDITIONING",
    "LATENT",
    "IMAGE",
    "MASK",
    "CONTROL_NET",
    "UPSCALE_MODEL",
    "SAMPLER",
    "SIGMAS",
    "NOISE",
    "GUIDER",
    "STYLE_MODEL",
    "CLIP_VISION",
    "CLIP_VISION_OUTPUT",
    "GLIGEN",
    "TAESD",
})

# Node types that load images - their image input should be IMAGE_PATH type
IMAGE_LOADER_NODES = frozenset({
    "LoadImage",
    "LoadImageMask",
    "LoadImageFromPath",
})

# Node types that load videos - their video input should be VIDEO_PATH type
VIDEO_LOADER_NODES = frozenset({
    "LoadVideo",
    "VHS_LoadVideo",
    "VHS_LoadVideoPath",
    "LoadVideoUpload",
    "VideoLoader",
})

# Input field names that should map to IMAGE_PATH
IMAGE_INPUT_FIELDS = frozenset({
    "image",
    "image_path",
    "input_image",
})

# Input field names that should map to VIDEO_PATH
VIDEO_INPUT_FIELDS = frozenset({
    "video",
    "video_path",
    "input_video",
})


def build_widget_map_from_object_info(object_info: dict) -> dict[str, list[str]]:
    """
    Build a widget name map from ComfyUI object_info response.

    This extracts the ordered list of widget input names for each node type.
    Widget inputs are those that are NOT connection types (like MODEL, LATENT, etc.).

    Args:
        object_info: The response from ComfyUI /object_info endpoint.

    Returns:
        Dict mapping node type to ordered list of widget input names.

    Example:
        {"KSampler": ["seed", "steps", "cfg", "sampler_name", "scheduler", "denoise"]}
    """
    widget_map: dict[str, list[str]] = {}

    for node_type, node_def in object_info.items():
        input_def = node_def.get("input", {})
        required = input_def.get("required", {})
        optional = input_def.get("optional", {})

        # Collect widget inputs (non-connection types) in order
        widget_names: list[str] = []

        # Process required inputs first, then optional
        for inputs in [required, optional]:
            for input_name, input_spec in inputs.items():
                if _is_widget_input(input_spec):
                    widget_names.append(input_name)

        if widget_names:
            widget_map[node_type] = widget_names

    return widget_map


def _is_widget_input(input_spec: list | Any) -> bool:
    """
    Determine if an input specification is a widget input (not a connection).

    Widget inputs are either:
    - A list with first element being a list (combo/dropdown choices)
    - A list with first element being a primitive type like "INT", "FLOAT", "STRING", "BOOLEAN"

    Connection inputs have their first element as a connection type like "MODEL", "LATENT", etc.
    """
    if not isinstance(input_spec, list) or len(input_spec) == 0:
        return False

    first_elem = input_spec[0]

    # Combo input: first element is a list of choices
    if isinstance(first_elem, list):
        return True

    # Primitive type inputs (widgets)
    if isinstance(first_elem, str):
        # Check if it's NOT a connection type
        return first_elem not in CONNECTION_TYPES

    return False


def inspect_parameters(
    workflow_json: dict,
    object_info: dict | None = None,
) -> list[ExposedParameter]:
    """
    Inspect a workflow and find all exposable parameters.

    Supports two ComfyUI workflow formats:
    - Workflow format: Has "nodes" array with widgets_values
    - API format: Flat dict with node IDs as keys and "inputs" dict

    Args:
        workflow_json: The workflow in either ComfyUI format.
        object_info: Optional object_info from ComfyUI /object_info endpoint.
                     When provided, enables richer parameter metadata with constraints.

    Returns:
        List of ExposedParameter objects for each widget value in the workflow.
    """
    # Detect format and dispatch to appropriate handler
    if "nodes" in workflow_json:
        return _inspect_workflow_format(workflow_json, object_info)
    else:
        return _inspect_api_format(workflow_json, object_info)


def _inspect_workflow_format(
    workflow_json: dict,
    object_info: dict | None = None,
) -> list[ExposedParameter]:
    """
    Inspect workflow in the nodes array format (exported from ComfyUI UI).

    This format has:
    - "nodes" array containing node objects
    - Each node has "id", "type", "widgets_values" array
    - Widget values are positional and need widget_map to get names

    Args:
        workflow_json: The workflow with "nodes" array.
        object_info: Optional object_info for constraints.

    Returns:
        List of ExposedParameter objects.
    """
    parameters: list[ExposedParameter] = []

    # Build widget map from object_info if available, else use defaults
    if object_info:
        widget_map = build_widget_map_from_object_info(object_info)
    else:
        widget_map = _default_widget_map()

    for node in workflow_json.get("nodes", []):
        node_id = str(node.get("id"))
        node_type = node.get("type", "")
        node_title = get_node_title(node, node_type)
        widget_values = node.get("widgets_values", [])
        widget_names = widget_map.get(node_type, [])

        # Get node definition from object_info for constraints
        node_def = object_info.get(node_type, {}) if object_info else {}

        for index, value in enumerate(widget_values):
            # Skip None values (often placeholders)
            if value is None:
                continue

            field_name = _widget_name(widget_names, index)
            param_type, constraints = _extract_param_metadata(
                field_name, value, node_def, node_type
            )

            parameters.append(
                ExposedParameter(
                    id=f"{node_id}:{field_name}",
                    node_id=node_id,
                    node_title=node_title,
                    field_name=field_name,
                    display_name=field_name.replace("_", " ").title(),
                    param_type=param_type,
                    default_value=value,
                    constraints=constraints,
                )
            )

    return parameters


def _inspect_api_format(
    workflow_json: dict,
    object_info: dict | None = None,
) -> list[ExposedParameter]:
    """
    Inspect workflow in the API format (flat dict with node IDs as keys).

    This format has:
    - Keys are node IDs (strings like "1", "2", etc.)
    - Each value is a dict with "class_type" and "inputs"
    - "inputs" dict has input names as keys and values directly

    Args:
        workflow_json: The workflow in API format.
        object_info: Optional object_info for constraints.

    Returns:
        List of ExposedParameter objects.
    """
    parameters: list[ExposedParameter] = []

    for node_id, node_data in workflow_json.items():
        # Skip non-node entries (like "version" or other metadata)
        if not isinstance(node_data, dict):
            continue
        if "class_type" not in node_data:
            continue

        node_type = node_data.get("class_type", "")
        # In API format, _meta may contain title
        meta = node_data.get("_meta", {})
        node_title = meta.get("title", node_type)

        inputs = node_data.get("inputs", {})

        # Get node definition from object_info for constraints
        node_def = object_info.get(node_type, {}) if object_info else {}

        for field_name, value in inputs.items():
            # Skip connection inputs (they are arrays like ["node_id", output_index])
            if isinstance(value, list) and len(value) == 2:
                # This looks like a connection reference [node_id, slot]
                if isinstance(value[0], (int, str)) and isinstance(value[1], int):
                    continue

            param_type, constraints = _extract_param_metadata(
                field_name, value, node_def, node_type
            )

            parameters.append(
                ExposedParameter(
                    id=f"{node_id}:{field_name}",
                    node_id=str(node_id),
                    node_title=node_title,
                    field_name=field_name,
                    display_name=field_name.replace("_", " ").title(),
                    param_type=param_type,
                    default_value=value,
                    constraints=constraints,
                )
            )

    return parameters


def _extract_param_metadata(
    field_name: str,
    value: Any,
    node_def: dict,
    node_type: str = "",
) -> tuple[ParamType, ParamConstraints | None]:
    """
    Extract parameter type and constraints from object_info node definition.

    Args:
        field_name: The input field name.
        value: The current value from the workflow.
        node_def: The node definition from object_info.
        node_type: The node class type for special handling.

    Returns:
        Tuple of (ParamType, ParamConstraints or None).
    """
    # Special handling for image/video loader nodes
    special_type = _get_special_param_type(field_name, node_type)
    if special_type is not None:
        constraints = _get_file_constraints(special_type)
        return special_type, constraints

    if not node_def:
        # No object_info - fall back to inference
        return _infer_param_type(value), None

    # Look up input spec in required/optional
    input_def = node_def.get("input", {})
    input_spec = input_def.get("required", {}).get(field_name)
    if input_spec is None:
        input_spec = input_def.get("optional", {}).get(field_name)

    if input_spec is None or not isinstance(input_spec, list) or len(input_spec) == 0:
        # Field not found in object_info - fall back to inference
        return _infer_param_type(value), None

    first_elem = input_spec[0]
    config = input_spec[1] if len(input_spec) > 1 and isinstance(input_spec[1], dict) else {}

    # Combo input (choices)
    if isinstance(first_elem, list):
        return ParamType.CHOICE, ParamConstraints(choices=first_elem)

    # Type-based inputs
    if first_elem == "INT":
        return ParamType.INT, _extract_numeric_constraints(config)

    if first_elem == "FLOAT":
        return ParamType.FLOAT, _extract_numeric_constraints(config)

    if first_elem == "STRING":
        # Check if multiline
        if config.get("multiline"):
            return ParamType.MULTILINE_STRING, None
        return ParamType.STRING, None

    if first_elem == "BOOLEAN":
        return ParamType.BOOL, None

    # Unknown type - infer from value
    return _infer_param_type(value), None


def _get_special_param_type(field_name: str, node_type: str) -> ParamType | None:
    """
    Check if a field should have a special param type based on node type and field name.

    Args:
        field_name: The input field name.
        node_type: The node class type.

    Returns:
        ParamType.IMAGE_PATH, ParamType.VIDEO_PATH, or None.
    """
    # Check for image loader nodes
    if node_type in IMAGE_LOADER_NODES:
        if field_name in IMAGE_INPUT_FIELDS:
            return ParamType.IMAGE_PATH

    # Check for video loader nodes
    if node_type in VIDEO_LOADER_NODES:
        if field_name in VIDEO_INPUT_FIELDS:
            return ParamType.VIDEO_PATH

    return None


def _get_file_constraints(param_type: ParamType) -> ParamConstraints | None:
    """
    Get file extension constraints for file-based param types.

    Args:
        param_type: The parameter type.

    Returns:
        ParamConstraints with file_extensions, or None.
    """
    if param_type == ParamType.IMAGE_PATH:
        return ParamConstraints(
            file_extensions=[".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]
        )
    if param_type == ParamType.VIDEO_PATH:
        return ParamConstraints(
            file_extensions=[".mp4", ".webm", ".mov", ".avi", ".mkv", ".gif"]
        )
    return None


def _extract_numeric_constraints(config: dict) -> ParamConstraints | None:
    """Extract numeric constraints (min, max, step) from input config."""
    min_val = config.get("min")
    max_val = config.get("max")
    step_val = config.get("step")

    if min_val is None and max_val is None and step_val is None:
        return None

    return ParamConstraints(
        min_value=float(min_val) if min_val is not None else None,
        max_value=float(max_val) if max_val is not None else None,
        step=float(step_val) if step_val is not None else None,
    )


def _default_widget_map() -> dict[str, list[str]]:
    """Default widget map for common node types when object_info unavailable."""
    return {
        "KSampler": [
            "seed",
            "control_after_generate",
            "steps",
            "cfg",
            "sampler_name",
            "scheduler",
            "denoise",
        ],
        "KSamplerAdvanced": [
            "add_noise",
            "noise_seed",
            "control_after_generate",
            "steps",
            "cfg",
            "sampler_name",
            "scheduler",
            "start_at_step",
            "end_at_step",
            "return_with_leftover_noise",
        ],
        "CLIPTextEncode": ["text"],
        "CheckpointLoaderSimple": ["ckpt_name"],
        "EmptyLatentImage": ["width", "height", "batch_size"],
        "VAEDecode": [],
        "SaveImage": ["filename_prefix"],
        "LoadImage": ["image", "upload"],
        "LoadImageMask": ["image", "channel"],
        "LoadVideo": ["video", "force_rate", "force_size", "frame_load_cap", "skip_first_frames", "select_every_nth"],
        "VHS_LoadVideo": ["video", "force_rate", "force_size", "frame_load_cap", "skip_first_frames", "select_every_nth"],
        "VHS_LoadVideoPath": ["video_path"],
        "LoraLoader": ["lora_name", "strength_model", "strength_clip"],
        "ControlNetLoader": ["control_net_name"],
        "ControlNetApply": ["strength"],
        "ControlNetApplyAdvanced": ["strength", "start_percent", "end_percent"],
        "VAELoader": ["vae_name"],
        "CLIPLoader": ["clip_name"],
        "UNETLoader": ["unet_name"],
    }


def _widget_name(names: list[str], index: int) -> str:
    """Get widget name by index, falling back to generic name."""
    if index < len(names):
        return names[index]
    return f"widget_{index}"


def _infer_param_type(value: Any) -> ParamType:
    """
    Infer ParamType from actual value.

    Type inference rules:
    - bool values -> ParamType.BOOL (must check before int, since bool is subclass of int)
    - int values -> ParamType.INT
    - float values -> ParamType.FLOAT
    - str with newlines or len > 100 -> ParamType.MULTILINE_STRING
    - str values -> ParamType.STRING
    - list values -> ParamType.CHOICE (first element is current selection)

    Args:
        value: The actual value to infer type from.

    Returns:
        The inferred ParamType.
    """
    # Check bool before int since bool is a subclass of int in Python
    if isinstance(value, bool):
        return ParamType.BOOL
    if isinstance(value, int):
        return ParamType.INT
    if isinstance(value, float):
        return ParamType.FLOAT
    if isinstance(value, str):
        # Multiline strings or long strings should use multiline input
        if '\n' in value or len(value) > 100:
            return ParamType.MULTILINE_STRING
        return ParamType.STRING
    if isinstance(value, list):
        # Lists typically represent choices in ComfyUI
        return ParamType.CHOICE
    # Default to STRING for unknown types
    return ParamType.STRING


# =============================================================================
# Auto-Exposure Logic
# =============================================================================

# Node types that commonly have exposable parameters
_PROMPT_NODE_TYPES = frozenset({"CLIPTextEncode", "CLIPTextEncodeSDXL"})
_SAMPLER_NODE_TYPES = frozenset({"KSampler", "KSamplerAdvanced", "SamplerCustom"})
_LATENT_NODE_TYPES = frozenset({"EmptyLatentImage", "EmptySD3LatentImage"})

# Field names that indicate seed parameters
_SEED_FIELD_NAMES = frozenset({"seed", "noise_seed"})

# Field names that indicate prompt parameters
_PROMPT_FIELD_NAMES = frozenset({"text", "prompt", "positive", "negative"})

# Sampler settings to expose
_SAMPLER_SETTINGS = frozenset({"steps", "cfg", "denoise"})

# Image dimension fields
_DIMENSION_FIELDS = frozenset({"width", "height"})


def get_auto_exposed_parameters(
    workflow_json: dict,
    object_info: dict | None = None,
) -> list[ExposedParameter]:
    """
    Automatically identify and return commonly-exposed parameters.

    These are parameters that users typically want to change between runs,
    like prompts, seeds, and image inputs.

    The returned parameters are ordered by importance:
    - Order 0-99: Prompts (most commonly modified)
    - Order 100-199: Seeds (for reproducibility/variation)
    - Order 200-299: Sampler settings (steps, cfg, denoise)
    - Order 300-399: Image dimensions
    - Order 400-499: Media inputs (images, videos)

    Args:
        workflow_json: The workflow in ComfyUI's workflow format.
        object_info: Optional object_info from ComfyUI /object_info endpoint.
                     When provided, enables richer parameter metadata with constraints.

    Returns:
        List of ExposedParameter objects for commonly-exposed parameters,
        sorted by order.
    """
    # Get all parameters from the workflow
    all_params = inspect_parameters(workflow_json, object_info)

    # Build lookup by (node_id, field_name) for quick access
    param_lookup: dict[tuple[str, str], ExposedParameter] = {}
    node_types: dict[str, str] = {}  # node_id -> node_type

    # Handle both workflow formats
    if "nodes" in workflow_json:
        # Workflow format with nodes array
        for node in workflow_json.get("nodes", []):
            node_id = str(node.get("id"))
            node_types[node_id] = node.get("type", "")
    else:
        # API format with node IDs as keys
        for node_id, node_data in workflow_json.items():
            if isinstance(node_data, dict) and "class_type" in node_data:
                node_types[str(node_id)] = node_data.get("class_type", "")

    for param in all_params:
        param_lookup[(param.node_id, param.field_name)] = param

    auto_exposed: list[ExposedParameter] = []
    seen_ids: set[str] = set()  # Track already-added parameters
    prompt_order = 0
    seed_order = 100
    sampler_order = 200
    dimension_order = 300
    media_order = 400

    # Iterate through all nodes to find auto-exposable parameters
    for node_id, node_type in node_types.items():
        # 1. Prompts (CLIPTextEncode "text" field)
        if node_type in _PROMPT_NODE_TYPES:
            param = param_lookup.get((node_id, "text"))
            if param and param.id not in seen_ids:
                exposed = _create_auto_exposed(
                    param,
                    order=prompt_order,
                    param_type=ParamType.MULTILINE_STRING,
                )
                auto_exposed.append(exposed)
                seen_ids.add(param.id)
                prompt_order += 1

        # Check any node for fields containing "prompt" in name
        for (nid, field), param in param_lookup.items():
            if nid == node_id and _is_prompt_field(field) and field != "text":
                if param.id not in seen_ids:
                    exposed = _create_auto_exposed(
                        param,
                        order=prompt_order,
                        param_type=ParamType.MULTILINE_STRING,
                    )
                    auto_exposed.append(exposed)
                    seen_ids.add(param.id)
                    prompt_order += 1

        # 2. Seeds (KSampler "seed", KSamplerAdvanced "noise_seed")
        if node_type in _SAMPLER_NODE_TYPES:
            seed_field = "noise_seed" if node_type == "KSamplerAdvanced" else "seed"
            param = param_lookup.get((node_id, seed_field))
            if param and param.id not in seen_ids:
                exposed = _create_auto_exposed(param, order=seed_order)
                auto_exposed.append(exposed)
                seen_ids.add(param.id)
                seed_order += 1

            # 3. Sampler settings (steps, cfg, denoise)
            for setting in _SAMPLER_SETTINGS:
                param = param_lookup.get((node_id, setting))
                if param and param.id not in seen_ids:
                    exposed = _create_auto_exposed(param, order=sampler_order)
                    auto_exposed.append(exposed)
                    seen_ids.add(param.id)
                    sampler_order += 1

        # Check for seed fields in other nodes
        for (nid, field), param in param_lookup.items():
            if nid == node_id and _is_seed_field(field):
                if node_type not in _SAMPLER_NODE_TYPES and param.id not in seen_ids:
                    exposed = _create_auto_exposed(param, order=seed_order)
                    auto_exposed.append(exposed)
                    seen_ids.add(param.id)
                    seed_order += 1

        # 4. Image dimensions (EmptyLatentImage width/height)
        if node_type in _LATENT_NODE_TYPES:
            for dim_field in _DIMENSION_FIELDS:
                param = param_lookup.get((node_id, dim_field))
                if param and param.id not in seen_ids:
                    exposed = _create_auto_exposed(param, order=dimension_order)
                    auto_exposed.append(exposed)
                    seen_ids.add(param.id)
                    dimension_order += 1

        # 5. Image inputs (LoadImage, etc.)
        if node_type in IMAGE_LOADER_NODES:
            for image_field in IMAGE_INPUT_FIELDS:
                param = param_lookup.get((node_id, image_field))
                if param and param.id not in seen_ids:
                    exposed = _create_auto_exposed(
                        param,
                        order=media_order,
                        param_type=ParamType.IMAGE_PATH,
                        is_media_input=True,
                    )
                    auto_exposed.append(exposed)
                    seen_ids.add(param.id)
                    media_order += 1
                    break  # Only add one image field per node

        # 6. Video inputs (LoadVideo, VHS_LoadVideo, etc.)
        if node_type in VIDEO_LOADER_NODES:
            for video_field in VIDEO_INPUT_FIELDS:
                param = param_lookup.get((node_id, video_field))
                if param and param.id not in seen_ids:
                    exposed = _create_auto_exposed(
                        param,
                        order=media_order,
                        param_type=ParamType.VIDEO_PATH,
                        is_media_input=True,
                    )
                    auto_exposed.append(exposed)
                    seen_ids.add(param.id)
                    media_order += 1
                    break  # Only add one video field per node

    # Sort by order and return
    auto_exposed.sort(key=lambda p: p.order)
    return auto_exposed


def _is_prompt_field(field_name: str) -> bool:
    """Check if a field name indicates a prompt parameter."""
    field_lower = field_name.lower()
    return field_lower in _PROMPT_FIELD_NAMES or "prompt" in field_lower


def _is_seed_field(field_name: str) -> bool:
    """Check if a field name indicates a seed parameter."""
    field_lower = field_name.lower()
    return field_lower in _SEED_FIELD_NAMES or "seed" in field_lower


def _create_auto_exposed(
    param: ExposedParameter,
    order: int,
    param_type: ParamType | None = None,
    is_media_input: bool = False,
) -> ExposedParameter:
    """
    Create a copy of an ExposedParameter with auto-exposure settings.

    Args:
        param: The original parameter.
        order: The display order for this parameter.
        param_type: Override the parameter type (e.g., for prompts/media).
        is_media_input: Whether this is a media input (image/video).

    Returns:
        A new ExposedParameter with updated settings.
    """
    return ExposedParameter(
        id=param.id,
        node_id=param.node_id,
        node_title=param.node_title,
        field_name=param.field_name,
        display_name=param.display_name,
        param_type=param_type if param_type else param.param_type,
        default_value=param.default_value,
        constraints=param.constraints,
        order=order,
        is_media_input=is_media_input,
    )
