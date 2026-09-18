"""System prompts for LLM enhancement per target image/video model.

Each target model has specific syntax, keywords, and formatting that the LLM
should use when enhancing prompts for optimal results.
"""

from __future__ import annotations

import logging
from pathlib import Path

from cinema_rules.target_models import (
    MODEL_CATEGORY_BY_ID,
    MODEL_ID_ALIASES,
    TARGET_MODELS,
    normalize_target_model,
)
from api.providers.prompt_profiles import EnhancementContext, format_binding_context


logger = logging.getLogger(__name__)


PROMPTS_DIR = Path(__file__).parent / "system_prompts"
MODEL_PROMPTS_DIR = PROMPTS_DIR / "model_prompts"
GENERAL_PROMPT_PATH = PROMPTS_DIR / "general.md"

# Shared image-family guides keep variant-specific constraints explicit without
# creating a separate registry or duplicating near-identical prompt files.
MODEL_PROMPT_FILES: dict[str, str] = {
    "krea_2_large": "krea_2",
    "krea_2_turbo": "krea_2",
    "flux_2_max": "flux_2",
    "flux_2_pro": "flux_2",
    "flux_2_flex": "flux_2",
    "flux_2_klein": "flux_2_klein",
    "flux_2_dev": "flux_2",
    "gpt_image_2.5_sunburst": "gpt_image_2.5",
    "gpt_image_2.5_flare": "gpt_image_2.5",
    "nano_banana_2": "nano_banana",
    "nano_banana_pro": "nano_banana",
    "nano_banana_2_lite": "nano_banana_2_lite",
    "seedream_5.0_pro": "seedream_5.0",
    "seedream_5.0_lite": "seedream_5.0",
}


def get_target_models() -> list[dict[str, str]]:
    """Get list of available target models for dropdown population."""
    return TARGET_MODELS


def _normalize_target_model(target_model: str) -> str:
    """Normalize target model IDs to match known prompt files."""
    return normalize_target_model(target_model)


def _read_prompt_file(path: Path) -> str:
    """Read a prompt file, returning an empty string if missing."""
    try:
        return path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        logger.warning("Prompt file missing: %s", path)
        return ""


def get_model_category(target_model: str) -> str | None:
    """Get the category for a target model.

    Args:
        target_model: The target image/video model (e.g., 'midjourney', 'runway')

    Returns:
        The category name or None if unknown.
    """
    model_key = _normalize_target_model(target_model)
    return MODEL_CATEGORY_BY_ID.get(model_key)


def is_video_model(target_model: str) -> bool:
    """Return True if the target model is a video generator."""
    return get_model_category(target_model) == "Video"


def is_image_model(target_model: str) -> bool:
    """Return True if the target model is an image generator."""
    return get_model_category(target_model) == "Image"


def get_system_prompt(target_model: str, project_type: str = "live_action") -> str:
    """Get the system prompt for a specific target model and project type.

    Args:
        target_model: The target image/video model (e.g., 'midjourney', 'runway')
        project_type: 'live_action' or 'animation'

    Returns:
        The system prompt string for that model, or generic if not found.
    """
    model_key = _normalize_target_model(target_model)
    general_prompt = _read_prompt_file(GENERAL_PROMPT_PATH)
    model_prompt = ""
    if model_key != "generic":
        prompt_file = MODEL_PROMPT_FILES.get(model_key, model_key)
        model_prompt = _read_prompt_file(MODEL_PROMPTS_DIR / f"{prompt_file}.md")

    if model_prompt and general_prompt:
        return f"{general_prompt}\n\n{model_prompt}"
    if model_prompt:
        return model_prompt
    return general_prompt


def format_config_context(
    config: dict,
    project_type: str,
    target_model: str | None = None,
) -> str:
    """Format the cinematic configuration into context for the LLM.

    Args:
        config: The live-action or animation configuration dict
        project_type: 'live_action' or 'animation'

    Returns:
        A formatted string describing the cinematic settings.
    """
    include_motion = True
    if target_model and is_image_model(target_model):
        include_motion = False

    if project_type == "live_action":
        return _format_live_action_context(config, include_motion=include_motion)
    return _format_animation_context(config, include_motion=include_motion)


def _format_live_action_context(config: dict, include_motion: bool) -> str:
    """Format live-action configuration for LLM context.

    Equipment names are translated to perspective/motion language to prevent
    AI models from rendering the equipment itself in the generated image/video.
    """
    camera = config.get("camera", {})
    lens = config.get("lens", {})
    movement = config.get("movement", {})
    lighting = config.get("lighting", {})
    visual = config.get("visual_grammar", {})

    parts: list[str] = []

    # Camera & Lens - OK to include as quality descriptors (not objects in scene)
    if camera.get("body"):
        parts.append(f"Shot with {camera['body'].replace('_', ' ')} camera")
    if lens.get("focal_length_mm"):
        parts.append(f"with a {lens['focal_length_mm']}mm focal length")
    if lens.get("is_anamorphic"):
        parts.append("anamorphic")

    # Shot & Composition
    if visual.get("shot_size"):
        shot_names = {
            "EWS": "Extreme Wide Shot", "WS": "Wide Shot", "MWS": "Medium Wide Shot",
            "MS": "Medium Shot", "MCU": "Medium Close-Up", "CU": "Close-Up",
            "BCU": "Big Close-Up", "ECU": "Extreme Close-Up", "OTS": "Over-The-Shoulder",
            "POV": "Point-of-View",
        }
        parts.append(f"Shot: {shot_names.get(visual['shot_size'], visual['shot_size'])}")
    if visual.get("composition"):
        parts.append(f"Composition: {visual['composition'].replace('_', ' ')}")

    if include_motion:
        # Movement - translate equipment to perspective language
        equipment_to_perspective = {
            "Crane": "elevated perspective with smooth vertical motion",
            "Jib": "elevated perspective with smooth vertical motion",
            "Technocrane": "elevated perspective with extended reach and smooth motion",
            "Dolly": "gliding perspective moving through the scene",
            "Slider": "subtle lateral perspective shift",
            "Steadicam": "fluid, stabilized following perspective",
            "Gimbal": "smooth, stabilized perspective",
            "Handheld": "organic, slightly textured perspective movement",
            "Drone": "aerial elevated perspective",
            "Cable_Cam": "elevated perspective gliding overhead",
            "Motion_Control": "precisely controlled, repeatable perspective motion",
            "Vehicle_Mount": "perspective traveling with the scene",
            "Static": None,
        }

        movement_type_to_description = {
            "Crane_Up": "the view rises smoothly",
            "Crane_Down": "the view descends smoothly",
            "Dolly_In": "the perspective glides closer",
            "Dolly_Out": "the perspective glides away",
            "Track_Left": "the perspective glides left",
            "Track_Right": "the perspective glides right",
            "Pan_Left": "the view sweeps left",
            "Pan_Right": "the view sweeps right",
            "Tilt_Up": "the view tilts upward",
            "Tilt_Down": "the view tilts downward",
            "Arc_Left": "the perspective orbits left around the subject",
            "Arc_Right": "the perspective orbits right around the subject",
            "Push_In": "the perspective pushes closer",
            "Pull_Out": "the perspective pulls away",
            "Dolly_Zoom": "perspective compression effect (subject stays same size while background shifts)",
            "Roll": "the frame rotates",
            "Boom_Up": "the perspective rises vertically",
            "Boom_Down": "the perspective descends vertically",
            "Static": None,
        }

        equip_key = movement.get("equipment", "")
        motion_type = movement.get("movement_type", "")

        if equip_key and equip_key != "Static" and equip_key in equipment_to_perspective:
            perspective_desc = equipment_to_perspective[equip_key]
            if perspective_desc:
                parts.append(f"Perspective: {perspective_desc}")

        if motion_type and motion_type != "Static" and motion_type in movement_type_to_description:
            motion_desc = movement_type_to_description[motion_type]
            if motion_desc:
                parts.append(f"Motion: {motion_desc}")
        elif motion_type and motion_type != "Static":
            parts.append(f"Motion: {motion_type.replace('_', ' ').lower()}")

        if movement.get("timing") and movement.get("timing") != "Static":
            parts.append(f"Pace: {movement['timing']}")

    # Lighting - describe quality, not fixtures
    if lighting.get("time_of_day"):
        parts.append(f"Time: {lighting['time_of_day'].replace('_', ' ')}")
    if lighting.get("source"):
        source = lighting.get("source", "")
        source_translations = {
            "HMI": "bright daylight-quality illumination",
            "Tungsten": "warm tungsten illumination",
            "LED": "versatile controlled illumination",
            "Kinoflo": "soft diffused illumination",
            "Fluorescent": "soft even illumination",
            "Practicals": "motivated practical light sources in scene",
            "Natural": "natural ambient light",
            "Mixed": "mixed light sources",
        }
        source_desc = source_translations.get(source, source.replace('_', ' '))
        parts.append(f"Light Quality: {source_desc}")
    if lighting.get("style"):
        parts.append(f"Lighting Style: {lighting['style'].replace('_', ' ')}")

    # Mood & Color
    if visual.get("mood"):
        parts.append(f"Mood: {visual['mood']}")
    if visual.get("color_tone"):
        parts.append(f"Color: {visual['color_tone'].replace('_', ' ')}")

    return "CINEMATOGRAPHY:\n" + "\n".join(f"- {p}" for p in parts)


def _format_animation_context(config: dict, include_motion: bool) -> str:
    """Format animation configuration for LLM context."""
    rendering = config.get("rendering", {})
    motion = config.get("motion", {})
    visual = config.get("visual_grammar", {})

    parts: list[str] = []

    if config.get("style_domain"):
        parts.append(f"Style: {config['style_domain']}")
    if config.get("medium"):
        parts.append(f"Medium: {config['medium']}")

    if rendering.get("line_treatment"):
        parts.append(f"Lines: {rendering['line_treatment']}")
    if rendering.get("color_application"):
        parts.append(f"Color: {rendering['color_application'].replace('_', ' ')}")
    if rendering.get("lighting_model"):
        parts.append(f"Lighting: {rendering['lighting_model'].replace('_', ' ')}")

    if include_motion:
        if motion.get("motion_style") and motion.get("motion_style") != "None":
            parts.append(f"Animation: {motion['motion_style']}")
        if motion.get("virtual_camera"):
            parts.append(f"Camera: {motion['virtual_camera'].replace('_', ' ')}")

    if visual.get("shot_size"):
        parts.append(f"Shot: {visual['shot_size']}")
    if visual.get("mood"):
        parts.append(f"Mood: {visual['mood']}")
    if visual.get("color_tone"):
        parts.append(f"Tone: {visual['color_tone']}")

    return "ANIMATION STYLE:\n" + "\n".join(f"- {p}" for p in parts)


def build_enhancement_prompt(
    user_prompt: str,
    config: dict,
    project_type: str,
    target_model: str,
    enhancement_context: EnhancementContext | None = None,
    dialect_id: str | None = None,
) -> str:
    """Build the full prompt to send to the LLM for enhancement.

    Args:
        user_prompt: The user's basic scene description
        config: The cinematic configuration dict
        project_type: 'live_action' or 'animation'

    Returns:
        The formatted prompt for the LLM
    """
    config_context = format_config_context(config, project_type, target_model)
    task_context = ""
    if enhancement_context is not None:
        dialect = dialect_id or enhancement_context.reference_dialect or "natural_prose"
        effective_duration = ""
        if enhancement_context.duration_seconds is not None:
            effective_duration = (
                "\nCALLER-CONFIRMED EFFECTIVE VIDEO DURATION (do not change or invent): "
                f"{enhancement_context.duration_seconds:.2f} seconds."
            )
        task_context = f"""\n\nENHANCEMENT TASK: {enhancement_context.task}
PROMPT DIALECT: {dialect}
{format_binding_context(enhancement_context, target_model, {"id": dialect})}
{effective_duration}
"""

    return f"""TARGET MODEL:
{target_model}

USER'S SCENE IDEA:
{user_prompt}

{config_context}{task_context}

CONSTRAINTS (MUST FOLLOW):
- Use the provided configuration context as authoritative; do not invent replacements.
- Preserve the user's intent and supplied dialogue, language, duration, music, and reference descriptions.
- Do not contradict the user's scene; reconcile conflicts in favor of the provided configuration.
- If a detail is not provided, do not add it unless the selected target guide requires a compatible cinematic bridge.
- Follow the selected target guide's task, dialect, section, and source-binding contract.
- Guide examples are illustrative; for ref2v use the caller-confirmed source tokens and ordinal gaps exactly, never example ordinals.
- The server received metadata only and cannot inspect media or validate a workflow graph; use only confirmed bindings above.
- Do not invent attachments, provider asset IDs, source contents, dialogue, durations, music, or API controls.

Output ONLY the final prompt in the required format - no explanations, citations, alternatives, or examples."""