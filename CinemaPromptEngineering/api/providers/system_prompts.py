"""System prompts for LLM enhancement per target image/video model.

Each target model has specific syntax, keywords, and formatting that the LLM
should use when enhancing prompts for optimal results.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, List


logger = logging.getLogger(__name__)


# =============================================================================
# AVAILABLE TARGET MODELS (for dropdown population)
# =============================================================================

TARGET_MODELS: List[Dict[str, str]] = [
    # Generic
    {"id": "generic", "name": "Generic", "category": "General"},

    # Image Generation Models
    {"id": "midjourney", "name": "Midjourney", "category": "Image"},
    {"id": "flux.1", "name": "FLUX.1", "category": "Image"},
    {"id": "flux.1_pro", "name": "FLUX.1 Pro", "category": "Image"},
    {"id": "flux_kontext", "name": "Flux Kontext", "category": "Image"},
    {"id": "flux_krea", "name": "Flux Krea", "category": "Image"},
    {"id": "dall-e_3", "name": "DALL-E 3", "category": "Image"},
    {"id": "gpt-image", "name": "GPT-Image (4o)", "category": "Image"},
    {"id": "ideogram_2.0", "name": "Ideogram 2.0", "category": "Image"},
    {"id": "leonardo_ai", "name": "Leonardo AI", "category": "Image"},
    {"id": "sdxl", "name": "Stable Diffusion XL", "category": "Image"},
    {"id": "stable_diffusion_3", "name": "Stable Diffusion 3", "category": "Image"},
    {"id": "z-image_turbo", "name": "Z-Image Turbo", "category": "Image"},
    {"id": "qwen_image", "name": "Qwen-Image", "category": "Image"},

    # Video Generation Models
    {"id": "sora", "name": "Sora", "category": "Video"},
    {"id": "sora_2", "name": "Sora 2", "category": "Video"},
    {"id": "veo_2", "name": "Veo 2", "category": "Video"},
    {"id": "veo_3", "name": "Veo 3", "category": "Video"},
    {"id": "runway_gen-3", "name": "Runway Gen-3", "category": "Video"},
    {"id": "runway_gen-4", "name": "Runway Gen-4", "category": "Video"},
    {"id": "kling_1.6", "name": "Kling 1.6", "category": "Video"},
    {"id": "pika_2.0", "name": "Pika 2.0", "category": "Video"},
    {"id": "luma_dream_machine", "name": "Luma Dream Machine", "category": "Video"},
    {"id": "ltx_2", "name": "LTX-2", "category": "Video"},
    {"id": "cogvideox", "name": "CogVideoX", "category": "Video"},
    {"id": "hunyuan", "name": "Hunyuan Video", "category": "Video"},
    {"id": "wan_2.1", "name": "Wan 2.1", "category": "Video"},
    {"id": "wan_2.2", "name": "Wan 2.2", "category": "Video"},
    {"id": "minimax_video", "name": "Minimax Video", "category": "Video"},
    {"id": "qwen_vl", "name": "Qwen VL", "category": "Video"},
]


# =============================================================================
# TARGET MODEL ALIASES
# =============================================================================

MODEL_ID_ALIASES: dict[str, str] = {
    "flux": "flux.1",
    "wan2.1": "wan_2.1",
    "wan2.2": "wan_2.2",
    "runway": "runway_gen-4",
    "pika": "pika_2.0",
    "cogvideo": "cogvideox",
    "ltx": "ltx_2",
}


PROMPTS_DIR = Path(__file__).parent / "system_prompts"
MODEL_PROMPTS_DIR = PROMPTS_DIR / "model_prompts"
GENERAL_PROMPT_PATH = PROMPTS_DIR / "general.md"


def get_target_models() -> List[Dict[str, str]]:
    """Get list of available target models for dropdown population."""
    return TARGET_MODELS


def _normalize_target_model(target_model: str) -> str:
    """Normalize target model IDs to match known prompt files."""
    model_key = target_model.lower().strip()
    return MODEL_ID_ALIASES.get(model_key, model_key)


def _read_prompt_file(path: Path) -> str:
    """Read a prompt file, returning an empty string if missing."""
    try:
        return path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        logger.warning("Prompt file missing: %s", path)
        return ""


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
        model_prompt = _read_prompt_file(MODEL_PROMPTS_DIR / f"{model_key}.md")

    if model_prompt and general_prompt:
        return f"{general_prompt}\n\n{model_prompt}"
    if model_prompt:
        return model_prompt
    return general_prompt


def format_config_context(config: dict, project_type: str) -> str:
    """Format the cinematic configuration into context for the LLM.

    Args:
        config: The live-action or animation configuration dict
        project_type: 'live_action' or 'animation'

    Returns:
        A formatted string describing the cinematic settings.
    """
    if project_type == "live_action":
        return _format_live_action_context(config)
    return _format_animation_context(config)


def _format_live_action_context(config: dict) -> str:
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


def _format_animation_context(config: dict) -> str:
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
) -> str:
    """Build the full prompt to send to the LLM for enhancement.

    Args:
        user_prompt: The user's basic scene description
        config: The cinematic configuration dict
        project_type: 'live_action' or 'animation'

    Returns:
        The formatted prompt for the LLM
    """
    config_context = format_config_context(config, project_type)

    return f"""TARGET MODEL:
{target_model}

USER'S SCENE IDEA:
{user_prompt}

{config_context}

CONSTRAINTS (MUST FOLLOW):
- Use the CPE configuration values as authoritative; do not invent replacements.
- Do not contradict the user's scene; reconcile conflicts in favor of CPE constraints.
- If a detail is not provided, do not add it unless required by the model guide.
- Follow the system prompt's output format and structure for the target model.

Output ONLY the final prompt - no explanations, no duplicates, no examples."""