"""Shared target-model metadata for the rules package and standalone node.

Keep this module dependency-free: the ComfyUI node copies ``cinema_rules``
without the CPE API package.
"""

from __future__ import annotations

from typing import Dict, List


# Canonical IDs are stable persisted values.  Do not rename existing entries.
TARGET_MODELS: List[Dict[str, str]] = [
    {"id": "generic", "name": "Generic", "category": "General"},
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
    {"id": "ltx_2.3", "name": "LTX 2.3", "category": "Video"},
    {"id": "ltx_2.5", "name": "LTX 2.5", "category": "Video"},
    {"id": "wan_3.0", "name": "Wan 3.0", "category": "Video"},
    {"id": "kling_3.0", "name": "Kling 3.0", "category": "Video"},
    {"id": "kling_3.0_omni", "name": "Kling 3.0 Omni", "category": "Video"},
    {"id": "cogvideox", "name": "CogVideoX", "category": "Video"},
    {"id": "hunyuan", "name": "Hunyuan Video", "category": "Video"},
    {"id": "wan_2.1", "name": "Wan 2.1", "category": "Video"},
    {"id": "wan_2.2", "name": "Wan 2.2", "category": "Video"},
    {"id": "minimax_video", "name": "Minimax Video", "category": "Video"},
    {"id": "minimax_h3", "name": "MiniMax H3", "category": "Video"},
    {"id": "minimax_h3_max", "name": "MiniMax H3 Max", "category": "Video"},
    {"id": "qwen_vl", "name": "Qwen VL", "category": "Video"},
    {"id": "seedance_2.0", "name": "Seedance 2.0", "category": "Video"},
    {"id": "seedance_2.5", "name": "Seedance 2.5", "category": "Video"},
]


# Persisted aliases from older node/main dropdowns plus spelling variants for
# the versioned IDs.  Canonical IDs remain the values shown by the main UI.
MODEL_ID_ALIASES: dict[str, str] = {
    "flux": "flux.1",
    "wan2.1": "wan_2.1",
    "wan2.2": "wan_2.2",
    "runway": "runway_gen-4",
    "pika": "pika_2.0",
    "cogvideo": "cogvideox",
    "ltx": "ltx_2",
    "ltx-2.3": "ltx_2.3",
    "ltx2.3": "ltx_2.3",
    "ltx-2-3": "ltx_2.3",
    "ltx-2.5": "ltx_2.5",
    "ltx2.5": "ltx_2.5",
    "ltx-2-5": "ltx_2.5",
    "wan3.0": "wan_3.0",
    "wan-3.0": "wan_3.0",
    "wan_3": "wan_3.0",
    "wan_3_0": "wan_3.0",
    "wan3": "wan_3.0",
    "wan3_0": "wan_3.0",
    "wan-3": "wan_3.0",
    "kling3": "kling_3.0",
    "kling-3": "kling_3.0",
    "kling3.0": "kling_3.0",
    "kling-3.0": "kling_3.0",
    "kling3.0-omni": "kling_3.0_omni",
    "kling-3.0-omni": "kling_3.0_omni",
    "kling_3_0": "kling_3.0",
    "kling_3_0_omni": "kling_3.0_omni",
    "kling_3_omni": "kling_3.0_omni",
    "minimax-h3": "minimax_h3",
    "minimax-h3-max": "minimax_h3_max",
    "seedance-2.0": "seedance_2.0",
    "seedance2.0": "seedance_2.0",
    "seedance-2-0": "seedance_2.0",
    "seedance-2.5": "seedance_2.5",
    "seedance2.5": "seedance_2.5",
    "seedance-2-5": "seedance_2.5",
}

# These values were accepted by the standalone node before the canonical
# catalog existed. Keep them available for old workflows without duplicating
# them in the primary model metadata response.
LEGACY_NODE_TARGET_MODEL_IDS = (
    "flux",
    "wan2.1",
    "wan2.2",
    "runway",
    "pika",
    "cogvideo",
    "hunyuan",
    "mochi",
    "ltx",
)

LEGACY_NODE_TARGET_MODEL_METADATA = {
    "mochi": {"name": "Mochi", "category": "Video"},
}


def normalize_target_model(target_model: str) -> str:
    """Return the canonical ID for a persisted or newly entered model ID."""
    model_key = str(target_model).lower().strip()
    return MODEL_ID_ALIASES.get(model_key, model_key)


def get_target_models(*, include_legacy: bool = False) -> List[Dict[str, str]]:
    """Return canonical metadata, optionally with legacy node aliases."""
    if not include_legacy:
        return TARGET_MODELS

    canonical_by_id = {entry["id"]: entry for entry in TARGET_MODELS}
    models = [dict(entry) for entry in TARGET_MODELS]
    for legacy_id in LEGACY_NODE_TARGET_MODEL_IDS:
        if legacy_id in canonical_by_id:
            continue
        canonical_id = normalize_target_model(legacy_id)
        source = canonical_by_id.get(canonical_id) or LEGACY_NODE_TARGET_MODEL_METADATA.get(legacy_id)
        if source:
            models.append({**source, "id": legacy_id})
    return models


def get_target_model_ids(*, include_legacy: bool = False) -> list[str]:
    """Return canonical IDs, optionally retaining legacy node dropdown values."""
    ids = [entry["id"] for entry in TARGET_MODELS]
    if include_legacy:
        ids.extend(model_id for model_id in LEGACY_NODE_TARGET_MODEL_IDS if model_id not in ids)
    return ids


MODEL_CATEGORY_BY_ID: dict[str, str] = {
    entry["id"]: entry["category"] for entry in TARGET_MODELS
}
