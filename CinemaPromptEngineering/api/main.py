"""FastAPI backend for Cinema Prompt Engineering."""

import os
from enum import Enum
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from cinema_rules.schemas.common import (
    ProjectType,
    ValidationResult,
)
from cinema_rules.schemas.live_action import LiveActionConfig
from cinema_rules.schemas.animation import AnimationConfig
from cinema_rules.rules.engine import RuleEngine
from cinema_rules.prompts.generator import PromptGenerator
from cinema_rules.presets import (
    LIVE_ACTION_PRESETS,
    ANIMATION_PRESETS,
    FilmPreset,
    AnimationPreset,
)
from cinema_rules.presets.cinematography_styles import (
    CINEMATOGRAPHY_STYLES,
    CinematographyStyle,
)
from api.providers.credential_storage import (
    get_credential_storage,
    ProviderCredentials,
    StoredSettings,
)

# Import template router
from api.templates import router as templates_router
# Import workflow storage router
from api.workflow_storage import router as workflows_router


# =============================================================================
# APP SETUP
# =============================================================================

app = FastAPI(
    title="Cinema Prompt Engineering API",
    description="Professional cinematography prompt generator for AI image/video models",
    version="0.1.0",
)

# Include templates router (StoryboardUI2 feature parity)
app.include_router(templates_router)

# Include workflow storage router (persistent filesystem storage)
app.include_router(workflows_router)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",   # Vite dev server
        "http://localhost:5173",   # Vite default port
        "http://localhost:8188",   # ComfyUI server
        "http://127.0.0.1:8188",   # ComfyUI server (alt)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize engine
engine = RuleEngine()


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class ValidateRequest(BaseModel):
    """Request to validate a configuration."""
    project_type: ProjectType
    config: dict[str, Any]


class GeneratePromptRequest(BaseModel):
    """Request to generate a prompt from configuration."""
    project_type: ProjectType
    config: dict[str, Any]
    target_model: str = "generic"


class GeneratePromptResponse(BaseModel):
    """Response containing the generated prompt."""
    prompt: str
    negative_prompt: str | None = None
    validation: ValidationResult


class OptionsRequest(BaseModel):
    """Request for available options given current state."""
    project_type: ProjectType
    field_path: str
    current_config: dict[str, Any]


class OptionsResponse(BaseModel):
    """Response with available options for a field."""
    field_path: str
    options: list[str]
    disabled_options: list[str] = []
    disabled_reasons: dict[str, str] = {}


# =============================================================================
# ENDPOINTS
# =============================================================================

@app.get("/")
async def root():
    """Root endpoint - serves frontend in Docker, health check in development."""
    from pathlib import Path as PathLib
    from fastapi.responses import FileResponse
    
    # In Docker/production, serve the frontend
    static_dir = PathLib(__file__).parent.parent / "static"
    index_path = static_dir / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    
    # In development mode (no static files), return health check
    return {"status": "ok", "service": "cinema-prompt-engineering"}


@app.get("/api/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "service": "cinema-prompt-engineering", "version": "0.1.0"}


@app.get("/enums/{enum_name}")
async def get_enum_values(enum_name: str):
    """Get all values for a given enum."""
    from cinema_rules.schemas import common, live_action, animation
    
    # Map enum names to their classes
    enum_map: dict[str, type[Enum]] = {
        # Common
        "shot_size": common.ShotSize,
        "composition": common.Composition,
        "mood": common.Mood,
        "color_tone": common.ColorTone,
        # Live-action
        "camera_type": live_action.CameraType,
        "camera_manufacturer": live_action.CameraManufacturer,
        "camera_body": live_action.CameraBody,
        "sensor_size": live_action.SensorSize,
        "weight_class": live_action.WeightClass,
        "film_stock": live_action.FilmStock,
        "aspect_ratio": live_action.AspectRatio,
        "lens_manufacturer": live_action.LensManufacturer,
        "lens_family": live_action.LensFamily,
        "lens_mount_type": live_action.LensMountType,
        "movement_equipment": live_action.MovementEquipment,
        "movement_type": live_action.MovementType,
        "movement_timing": live_action.MovementTiming,
        "time_of_day": live_action.TimeOfDay,
        "lighting_source": live_action.LightingSource,
        "lighting_style": live_action.LightingStyle,
        # Animation
        "animation_medium": animation.AnimationMedium,
        "style_domain": animation.StyleDomain,
        "line_treatment": animation.LineTreatment,
        "color_application": animation.ColorApplication,
        "lighting_model": animation.LightingModel,
        "surface_detail": animation.SurfaceDetail,
        "motion_style": animation.MotionStyle,
        "virtual_camera": animation.VirtualCamera,
        "anime_preset": animation.AnimePreset,
        "manga_preset": animation.MangaPreset,
        "three_d_preset": animation.ThreeDPreset,
        "illustration_preset": animation.IllustrationPreset,
    }
    
    if enum_name not in enum_map:
        raise HTTPException(status_code=404, detail=f"Unknown enum: {enum_name}")
    
    enum_class = enum_map[enum_name]
    return {
        "enum": enum_name,
        "values": [e.value for e in enum_class],
    }


@app.get("/enums")
async def list_enums():
    """List all available enums."""
    return {
        "common": ["shot_size", "composition", "mood", "color_tone"],
        "live_action": [
            "camera_type", "camera_manufacturer", "camera_body", "sensor_size", "weight_class",
            "film_stock", "aspect_ratio",
            "lens_manufacturer", "lens_family", "lens_mount_type",
            "movement_equipment", "movement_type", "movement_timing",
            "time_of_day", "lighting_source", "lighting_style",
        ],
        "animation": [
            "animation_medium", "style_domain",
            "line_treatment", "color_application", "lighting_model", "surface_detail",
            "motion_style", "virtual_camera",
            "anime_preset", "manga_preset", "three_d_preset", "illustration_preset",
        ],
    }


@app.post("/validate", response_model=ValidationResult)
async def validate_config(request: ValidateRequest):
    """Validate a configuration and return any rule violations."""
    try:
        if request.project_type == ProjectType.LIVE_ACTION:
            config = LiveActionConfig(**request.config)
            return engine.validate_live_action(config)
        else:
            config = AnimationConfig(**request.config)
            return engine.validate_animation(config)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/generate-prompt", response_model=GeneratePromptResponse)
async def generate_prompt(request: GeneratePromptRequest):
    """Generate an AI prompt from a configuration."""
    try:
        generator = PromptGenerator(target_model=request.target_model)
        
        if request.project_type == ProjectType.LIVE_ACTION:
            config = LiveActionConfig(**request.config)
            validation = engine.validate_live_action(config)
            prompt = generator.generate_live_action_prompt(config)
        else:
            config = AnimationConfig(**request.config)
            validation = engine.validate_animation(config)
            prompt = generator.generate_animation_prompt(config)
        
        return GeneratePromptResponse(
            prompt=prompt,
            negative_prompt=generator.get_negative_prompt(),
            validation=validation,
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/options", response_model=OptionsResponse)
async def get_options(request: OptionsRequest):
    """Get available options for a field given current configuration state."""
    try:
        if request.project_type == ProjectType.LIVE_ACTION:
            current_config = LiveActionConfig(**request.current_config)
        else:
            current_config = AnimationConfig(**request.current_config)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    options, disabled_options, disabled_reasons = engine.get_available_options(
        field_path=request.field_path,
        current_config=current_config,
    )

    if not options:
        raise HTTPException(status_code=404, detail=f"Unknown field path: {request.field_path}")

    return OptionsResponse(
        field_path=request.field_path,
        options=options,
        disabled_options=disabled_options,
        disabled_reasons=disabled_reasons,
    )


# =============================================================================
# CAMERA & LENS FILTERING ENDPOINTS
# =============================================================================

@app.get("/cameras/by-type/{camera_type}")
async def get_cameras_by_type(camera_type: str):
    """Get camera bodies filtered by type (Digital or Film)."""
    from cinema_rules.schemas.live_action import CameraBody, CameraManufacturer
    from cinema_rules.rules.engine import FILM_CAMERA_BODIES
    
    if camera_type.lower() == "film":
        bodies = [body.value for body in FILM_CAMERA_BODIES]
        manufacturers = ["ARRI_Film", "Panavision", "Mitchell", "IMAX"]
    else:  # digital
        bodies = [body.value for body in CameraBody if body not in FILM_CAMERA_BODIES]
        manufacturers = ["ARRI", "RED", "Sony", "Canon", "Blackmagic", "Panasonic", "Nikon", "DJI"]
    
    return {
        "camera_type": camera_type,
        "manufacturers": manufacturers,
        "bodies": bodies,
    }


@app.get("/film-stocks/by-camera/{camera_body}")
async def get_film_stocks_for_camera(camera_body: str):
    """Get available film stocks for a specific camera body."""
    from cinema_rules.schemas.live_action import FilmStock, CameraBody
    from cinema_rules.rules.engine import FILM_CAMERA_BODIES, LARGE_FORMAT_CAMERAS, IMAX_CAMERAS
    
    try:
        body = CameraBody(camera_body)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Unknown camera body: {camera_body}")
    
    if body not in FILM_CAMERA_BODIES:
        return {
            "camera_body": camera_body,
            "is_film_camera": False,
            "film_stocks": [],
            "message": "Film stock is not applicable for digital cameras",
        }
    
    # Determine which stocks are available based on camera format
    available_stocks = []
    
    if body in IMAX_CAMERAS:
        # IMAX cameras use IMAX stocks
        available_stocks = [
            FilmStock.IMAX_500T.value,
            FilmStock.IMAX_250D.value,
        ]
    elif body in LARGE_FORMAT_CAMERAS:
        # 65mm/70mm cameras use large format stocks
        available_stocks = [
            FilmStock.KODAK_65MM_500T.value,
            FilmStock.KODAK_65MM_250D.value,
            FilmStock.KODAK_65MM_200T.value,
        ]
    else:
        # Standard 35mm film cameras
        available_stocks = [
            FilmStock.KODAK_VISION3_500T.value,
            FilmStock.KODAK_VISION3_250D.value,
            FilmStock.KODAK_VISION3_200T.value,
            FilmStock.KODAK_VISION3_50D.value,
            FilmStock.KODAK_DOUBLE_X.value,
            FilmStock.KODAK_TRI_X.value,
            FilmStock.EASTMAN_5247.value,
            FilmStock.EASTMAN_5294.value,
            FilmStock.TECHNICOLOR.value,
        ]
    
    return {
        "camera_body": camera_body,
        "is_film_camera": True,
        "film_stocks": available_stocks,
    }


@app.get("/aspect-ratios/by-camera/{camera_body}")
async def get_aspect_ratios_for_camera(camera_body: str):
    """Get available aspect ratios for a specific camera body."""
    from cinema_rules.schemas.live_action import AspectRatio, CameraBody
    from cinema_rules.rules.engine import IMAX_CAMERAS, LARGE_FORMAT_CAMERAS
    
    try:
        body = CameraBody(camera_body)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Unknown camera body: {camera_body}")
    
    # All cameras can use most standard ratios
    standard_ratios = [
        AspectRatio.RATIO_1_33.value,
        AspectRatio.RATIO_1_37.value,
        AspectRatio.RATIO_1_66.value,
        AspectRatio.RATIO_1_78.value,
        AspectRatio.RATIO_1_85.value,
        AspectRatio.RATIO_2_35.value,
        AspectRatio.RATIO_2_39.value,
    ]
    
    # Special ratios
    special_ratios = []
    
    if body == CameraBody.ULTRA_PANAVISION_70:
        special_ratios.append(AspectRatio.RATIO_2_76.value)
    
    if body in {CameraBody.SUPER_PANAVISION_70, CameraBody.MITCHELL_BFC_65}:
        special_ratios.append(AspectRatio.RATIO_2_20.value)
    
    if body in IMAX_CAMERAS:
        special_ratios.extend([
            AspectRatio.RATIO_1_43.value,
            AspectRatio.RATIO_1_90.value,
        ])
    
    return {
        "camera_body": camera_body,
        "standard_ratios": standard_ratios,
        "special_ratios": special_ratios,
        "all_ratios": standard_ratios + special_ratios,
    }


@app.get("/lenses/by-camera/{camera_body}")
async def get_lenses_for_camera(camera_body: str):
    """Get compatible lenses for a specific camera body."""
    from cinema_rules.schemas.live_action import LensFamily, CameraBody
    from cinema_rules.rules.engine import (
        PANAVISION_CAMERA_BODIES,
        PANAVISION_LENS_FAMILIES,
        LARGE_FORMAT_CAMERAS,
    )
    
    try:
        body = CameraBody(camera_body)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Unknown camera body: {camera_body}")
    
    # Determine compatible lenses based on mount system
    if body in PANAVISION_CAMERA_BODIES:
        # Panavision closed ecosystem
        compatible = [lens.value for lens in PANAVISION_LENS_FAMILIES]
        incompatible_reason = "Panavision mount - only Panavision lenses compatible"
    elif body in LARGE_FORMAT_CAMERAS:
        # Large format needs LF coverage
        compatible = [
            LensFamily.ARRI_SIGNATURE_PRIME.value,
            LensFamily.ARRI_PRIME_65.value,
            LensFamily.ZEISS_SUPREME_PRIME.value,
            LensFamily.COOKE_S7.value,
            LensFamily.LEICA_THALIA.value,
            LensFamily.PANAVISION_PRIMO_70.value,
            LensFamily.TODD_AO.value,
        ]
        incompatible_reason = "Large format requires LF coverage lenses"
    else:
        # Standard PL mount - most lenses work
        compatible = [
            lens.value for lens in LensFamily 
            if lens not in PANAVISION_LENS_FAMILIES
        ]
        incompatible_reason = None
    
    return {
        "camera_body": camera_body,
        "compatible_lenses": compatible,
        "incompatible_reason": incompatible_reason,
    }


@app.get("/preset/technical/{preset_id}")
async def get_preset_technical_specs(preset_id: str):
    """Get the technical specifications for a film preset."""
    preset = LIVE_ACTION_PRESETS.get(preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail=f"Unknown preset: {preset_id}")
    
    return {
        "preset_id": preset_id,
        "name": preset.name,
        "year": preset.year,
        "era": preset.era,
        "technical_specs": {
            "camera_type": preset.camera_type,
            "camera_body": preset.camera_body,
            "film_stock": preset.film_stock,
            "aspect_ratio": preset.aspect_ratio,
            "lens_manufacturer": preset.lens_manufacturer,
            "lens_family": preset.lens_family,
            "primary_focal_lengths": preset.primary_focal_lengths,
        },
        "visual_style": {
            "mood": preset.mood,
            "color_tone": preset.color_tone,
            "lighting_style": preset.lighting_style,
            "lighting_sources": preset.lighting_sources,
            "composition": preset.composition,
            "shot_sizes": preset.shot_sizes,
            "movement": preset.movement,
        },
        "constraints": {
            "disallowed_moods": preset.disallowed_moods,
            "disallowed_sources": preset.disallowed_sources,
        },
    }


# =============================================================================
# PRESETS ENDPOINTS
# =============================================================================

@app.get("/presets/live-action")
async def get_live_action_presets():
    """Get all available film style presets."""
    return {
        "count": len(LIVE_ACTION_PRESETS),
        "presets": [
            {
                "id": preset.id,
                "name": preset.name,
                "year": preset.year,
                "era": preset.era,
            }
            for preset in LIVE_ACTION_PRESETS.values()
        ]
    }


@app.get("/presets/live-action/{preset_id}")
async def get_live_action_preset(preset_id: str):
    """Get a specific film preset by ID with full details."""
    preset = LIVE_ACTION_PRESETS.get(preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail=f"Preset not found: {preset_id}")
    return preset.model_dump()


@app.get("/presets/live-action/{preset_id}/cinematography-style")
async def get_cinematography_style(preset_id: str):
    """Get detailed cinematography information for a film preset.
    
    Returns professional cinematography data including:
    - Cinematographer name
    - Camera system used
    - Film stock or digital format
    - Aspect ratio
    - Lighting signature
    - Color palette
    - Notable techniques
    - Lens info
    - Movement style
    - Legacy/influence
    """
    # First verify the preset exists
    preset = LIVE_ACTION_PRESETS.get(preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail=f"Preset not found: {preset_id}")
    
    # Get cinematography style if available
    style = CINEMATOGRAPHY_STYLES.get(preset_id)
    if not style:
        raise HTTPException(
            status_code=404, 
            detail=f"Cinematography style data not available for: {preset_id}"
        )
    
    return style.model_dump()


@app.get("/presets/live-action/by-era/{era}")
async def get_live_action_presets_by_era(era: str):
    """Get all film presets from a specific era."""
    filtered = {k: v for k, v in LIVE_ACTION_PRESETS.items() if v.era == era}
    if not filtered:
        # Return empty list, not 404 - valid query with no results
        return {"count": 0, "era": era, "presets": []}
    return {
        "count": len(filtered),
        "era": era,
        "presets": [
            {
                "id": preset.id,
                "name": preset.name,
                "year": preset.year,
                "era": preset.era,
            }
            for preset in filtered.values()
        ]
    }


@app.get("/presets/live-action/by-mood/{mood}")
async def get_live_action_presets_by_mood(mood: str):
    """Get all film presets containing a specific mood."""
    filtered = {k: v for k, v in LIVE_ACTION_PRESETS.items() if mood in v.mood}
    return {
        "count": len(filtered),
        "mood": mood,
        "presets": [
            {
                "id": preset.id,
                "name": preset.name,
                "year": preset.year,
                "era": preset.era,
                "mood": preset.mood,
            }
            for preset in filtered.values()
        ]
    }


@app.get("/presets/animation")
async def get_animation_presets():
    """Get all available animation style presets."""
    return {
        "count": len(ANIMATION_PRESETS),
        "presets": [
            {
                "id": preset.id,
                "name": preset.name,
                "domain": preset.domain,
                "medium": preset.medium,
            }
            for preset in ANIMATION_PRESETS.values()
        ]
    }


@app.get("/presets/animation/{preset_id}")
async def get_animation_preset(preset_id: str):
    """Get a specific animation preset by ID with full details."""
    preset = ANIMATION_PRESETS.get(preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail=f"Preset not found: {preset_id}")
    return preset.model_dump()


@app.get("/presets/animation/by-domain/{domain}")
async def get_animation_presets_by_domain(domain: str):
    """Get all animation presets from a specific domain (Anime, Manga, ThreeD, Illustration)."""
    filtered = {k: v for k, v in ANIMATION_PRESETS.items() if v.domain == domain}
    if not filtered:
        return {"count": 0, "domain": domain, "presets": []}
    return {
        "count": len(filtered),
        "domain": domain,
        "presets": [
            {
                "id": preset.id,
                "name": preset.name,
                "domain": preset.domain,
                "medium": preset.medium,
            }
            for preset in filtered.values()
        ]
    }


@app.get("/presets/animation/by-medium/{medium}")
async def get_animation_presets_by_medium(medium: str):
    """Get all animation presets using a specific medium (2D, 3D, Hybrid, StopMotion)."""
    filtered = {k: v for k, v in ANIMATION_PRESETS.items() if v.medium == medium}
    return {
        "count": len(filtered),
        "medium": medium,
        "presets": [
            {
                "id": preset.id,
                "name": preset.name,
                "domain": preset.domain,
                "medium": preset.medium,
            }
            for preset in filtered.values()
        ]
    }


@app.get("/presets/eras")
async def get_available_eras():
    """Get all available eras from live-action presets."""
    eras = sorted(set(p.era for p in LIVE_ACTION_PRESETS.values()))
    return {"eras": eras}


@app.get("/presets/domains")
async def get_available_domains():
    """Get all available domains from animation presets."""
    domains = sorted(set(p.domain for p in ANIMATION_PRESETS.values()))
    return {"domains": domains}


# =============================================================================
# APPLY PRESET ENDPOINTS
# =============================================================================

class ApplyPresetRequest(BaseModel):
    """Request to apply a preset with optional overrides."""
    preset_id: str
    overrides: dict[str, Any] | None = None


class ApplyLiveActionPresetResponse(BaseModel):
    """Response from applying a live-action preset."""
    config: dict[str, Any]
    validation: ValidationResult
    preset: dict[str, Any]


class ApplyAnimationPresetResponse(BaseModel):
    """Response from applying an animation preset."""
    config: dict[str, Any]
    validation: ValidationResult
    preset: dict[str, Any]


@app.post("/apply-preset/live-action", response_model=ApplyLiveActionPresetResponse)
async def apply_live_action_preset(request: ApplyPresetRequest):
    """
    Apply a film preset to generate a pre-populated LiveActionConfig.
    
    Optionally apply overrides to customize the resulting config.
    The config is validated against both standard rules and preset constraints.
    """
    try:
        # Get preset for the response
        preset = LIVE_ACTION_PRESETS.get(request.preset_id)
        if not preset:
            available = list(LIVE_ACTION_PRESETS.keys())[:10]
            raise HTTPException(
                status_code=404,
                detail=f"Preset not found: {request.preset_id}. Available: {available}..."
            )
        
        # Apply preset
        config, validation = engine.apply_live_action_preset(
            preset_id=request.preset_id,
            overrides=request.overrides,
        )
        
        return ApplyLiveActionPresetResponse(
            config=config.model_dump(),
            validation=validation,
            preset=preset.model_dump(),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/apply-preset/animation", response_model=ApplyAnimationPresetResponse)
async def apply_animation_preset(request: ApplyPresetRequest):
    """
    Apply an animation preset to generate a pre-populated AnimationConfig.
    
    Optionally apply overrides to customize the resulting config.
    The config is validated against both standard rules and preset constraints.
    """
    try:
        # Get preset for the response
        preset = ANIMATION_PRESETS.get(request.preset_id)
        if not preset:
            available = list(ANIMATION_PRESETS.keys())[:10]
            raise HTTPException(
                status_code=404,
                detail=f"Preset not found: {request.preset_id}. Available: {available}..."
            )
        
        # Apply preset
        config, validation = engine.apply_animation_preset(
            preset_id=request.preset_id,
            overrides=request.overrides,
        )
        
        return ApplyAnimationPresetResponse(
            config=config.model_dump(),
            validation=validation,
            preset=preset.model_dump(),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


# =============================================================================
# SEARCH ENDPOINTS
# =============================================================================

@app.get("/presets/search")
async def search_presets(
    q: str,
    project_type: str | None = None,
    limit: int = 20,
):
    """
    Search presets by name, mood, era, or domain.
    
    Args:
        q: Search query (matches name, mood, era, domain)
        project_type: Optional filter - "live_action" or "animation"
        limit: Maximum results to return
    
    Returns:
        Matching presets from both live-action and animation collections.
    """
    query = q.lower()
    results = []
    
    # Search live-action presets
    if project_type is None or project_type == "live_action":
        for preset in LIVE_ACTION_PRESETS.values():
            score = 0
            # Name match (highest weight)
            if query in preset.name.lower():
                score += 10
            if query in preset.id.lower():
                score += 8
            # Era match
            if query in preset.era.lower():
                score += 5
            # Mood match
            if any(query in m.lower() for m in preset.mood):
                score += 3
            # Color tone match
            if any(query in c.lower() for c in preset.color_tone):
                score += 2
            
            if score > 0:
                results.append({
                    "type": "live_action",
                    "score": score,
                    "preset": {
                        "id": preset.id,
                        "name": preset.name,
                        "year": preset.year,
                        "era": preset.era,
                        "mood": preset.mood,
                    }
                })
    
    # Search animation presets
    if project_type is None or project_type == "animation":
        for preset in ANIMATION_PRESETS.values():
            score = 0
            # Name match (highest weight)
            if query in preset.name.lower():
                score += 10
            if query in preset.id.lower():
                score += 8
            # Domain match
            if query in preset.domain.lower():
                score += 5
            # Medium match
            if query in preset.medium.lower():
                score += 4
            # Mood match
            if any(query in m.lower() for m in preset.mood):
                score += 3
            
            if score > 0:
                results.append({
                    "type": "animation",
                    "score": score,
                    "preset": {
                        "id": preset.id,
                        "name": preset.name,
                        "domain": preset.domain,
                        "medium": preset.medium,
                        "mood": preset.mood,
                    }
                })
    
    # Sort by score descending, limit results
    results.sort(key=lambda x: x["score"], reverse=True)
    results = results[:limit]
    
    return {
        "query": q,
        "count": len(results),
        "results": results,
    }


@app.get("/presets/search/live-action")
async def search_live_action_presets(
    q: str | None = None,
    era: str | None = None,
    mood: str | None = None,
    limit: int = 20,
):
    """
    Advanced search for live-action presets with filters.
    
    Args:
        q: Text search query (name, id)
        era: Filter by era
        mood: Filter by mood
        limit: Maximum results
    """
    results = []
    
    for preset in LIVE_ACTION_PRESETS.values():
        # Apply filters
        if era and preset.era != era:
            continue
        if mood and mood not in preset.mood:
            continue
        if q:
            query = q.lower()
            if query not in preset.name.lower() and query not in preset.id.lower():
                continue
        
        results.append({
            "id": preset.id,
            "name": preset.name,
            "year": preset.year,
            "era": preset.era,
            "mood": preset.mood,
            "color_tone": preset.color_tone,
        })
    
    # Sort by year descending
    results.sort(key=lambda x: x["year"], reverse=True)
    results = results[:limit]
    
    return {
        "count": len(results),
        "filters": {"q": q, "era": era, "mood": mood},
        "presets": results,
    }


@app.get("/presets/search/animation")
async def search_animation_presets(
    q: str | None = None,
    domain: str | None = None,
    medium: str | None = None,
    limit: int = 20,
):
    """
    Advanced search for animation presets with filters.
    
    Args:
        q: Text search query (name, id)
        domain: Filter by domain (Anime, Manga, ThreeD, Illustration)
        medium: Filter by medium (2D, 3D, Hybrid, StopMotion)
        limit: Maximum results
    """
    results = []
    
    for preset in ANIMATION_PRESETS.values():
        # Apply filters
        if domain and preset.domain != domain:
            continue
        if medium and preset.medium != medium:
            continue
        if q:
            query = q.lower()
            if query not in preset.name.lower() and query not in preset.id.lower():
                continue
        
        results.append({
            "id": preset.id,
            "name": preset.name,
            "domain": preset.domain,
            "medium": preset.medium,
            "mood": preset.mood,
        })
    
    results = results[:limit]
    
    return {
        "count": len(results),
        "filters": {"q": q, "domain": domain, "medium": medium},
        "presets": results,
    }


# =============================================================================
# AI PROVIDER SETTINGS
# =============================================================================

from api.providers import (
    ProviderConfig,
    ProviderType,
    CustomEndpoint,
    AISettings,
    ConnectionTestResult,
    PROVIDER_REGISTRY,
    get_provider_defaults,
    test_provider_connection,
)
from api.providers.registry import get_all_provider_defaults
from api.providers.tester import auto_detect_local_providers


@app.get("/settings/providers")
async def list_providers() -> dict:
    """List all available AI providers with their default configurations."""
    providers = []
    for pid, info in PROVIDER_REGISTRY.items():
        providers.append({
            "id": pid,
            "name": info["name"],
            "type": info["type"].value if hasattr(info["type"], "value") else info["type"],
            "description": info["description"],
            "default_endpoint": info.get("default_endpoint"),
            "docs_url": info.get("docs_url"),
            "supports": info.get("supports", []),
        })
    return {"count": len(providers), "providers": providers}


@app.get("/settings/providers/{provider_id}")
async def get_provider(provider_id: str) -> dict:
    """Get detailed information about a specific provider."""
    if provider_id not in PROVIDER_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Provider '{provider_id}' not found")
    
    info = PROVIDER_REGISTRY[provider_id]
    return {
        "id": provider_id,
        "name": info["name"],
        "type": info["type"].value if hasattr(info["type"], "value") else info["type"],
        "description": info["description"],
        "default_endpoint": info.get("default_endpoint"),
        "docs_url": info.get("docs_url"),
        "supports": info.get("supports", []),
        "models": info.get("models", []),
        "health_check": info.get("health_check"),
        "oauth_url": info.get("oauth_url"),
    }


class TestConnectionRequest(BaseModel):
    """Request body for connection test."""
    endpoint: str | None = None
    api_key: str | None = None


@app.post("/settings/providers/{provider_id}/test")
async def test_connection(provider_id: str, request: TestConnectionRequest) -> dict:
    """Test connection to a provider."""
    defaults = get_provider_defaults(provider_id)
    if defaults is None:
        raise HTTPException(status_code=404, detail=f"Provider '{provider_id}' not found")
    
    # Apply request overrides
    if request.endpoint:
        defaults.endpoint = request.endpoint
    if request.api_key:
        defaults.api_key = request.api_key
    
    result = await test_provider_connection(defaults)
    return {
        "success": result.success,
        "status": result.status.value,
        "message": result.message,
        "latency_ms": result.latency_ms,
        "models_available": result.models_available,
    }


@app.get("/settings/providers/local/detect")
async def detect_local_providers() -> dict:
    """Auto-detect running local AI services."""
    detected = await auto_detect_local_providers()
    return {
        "count": len(detected),
        "detected": [
            {"provider_id": pid, "endpoint": endpoint}
            for pid, endpoint in detected
        ],
    }


class CustomEndpointTestRequest(BaseModel):
    """Request body for custom endpoint test."""
    endpoint: str
    api_key: str | None = None


@app.post("/settings/custom-endpoint/test")
async def test_custom_endpoint(request: CustomEndpointTestRequest) -> dict:
    """Test connection to a custom OpenAI-compatible endpoint."""
    # Create a temporary config for testing
    config = ProviderConfig(
        id="custom",
        name="Custom Endpoint",
        type=ProviderType.API_KEY,
        description="Custom OpenAI-compatible endpoint",
        default_endpoint=None,
        endpoint=request.endpoint,
        api_key=request.api_key,
        enabled=True,
    )
    
    result = await test_provider_connection(config)
    return {
        "success": result.success,
        "status": result.status.value,
        "message": result.message,
        "latency_ms": result.latency_ms,
        "models_available": result.models_available,
    }


# =============================================================================
# OAUTH ENDPOINTS
# =============================================================================

from api.providers.oauth import (
    OAUTH_CONFIGS,
    build_authorization_url,
    exchange_code_for_token,
    request_device_code,
    poll_device_token,
    get_flow_type,
)

# In-memory storage for OAuth state (would use Redis/database in production)
_oauth_states: dict[str, dict] = {}


class OAuthInitRequest(BaseModel):
    """Request to initiate OAuth flow."""
    client_id: str | None = None  # Optional - built-in client ID used if not provided
    redirect_uri: str


class OAuthCallbackRequest(BaseModel):
    """Request body for OAuth callback."""
    code: str
    state: str
    client_id: str | None = None  # Optional - built-in client ID used if not provided
    client_secret: str | None = None
    redirect_uri: str


@app.get("/settings/oauth/providers")
async def list_oauth_providers() -> dict:
    """List providers that support OAuth authentication.
    
    Returns both authorization_code flow providers and device flow providers
    with their respective configuration details.
    """
    providers = []
    for provider_id, config in OAUTH_CONFIGS.items():
        flow_type = config.get("flow_type", "authorization_code")
        provider_info = {
            "id": provider_id,
            "flow_type": flow_type,
            "scopes": config.get("scopes", []),
        }
        
        if flow_type == "device":
            # Device flow providers (GitHub Copilot, OpenAI Codex)
            provider_info["device_code_url"] = config.get("device_code_url")
            provider_info["verification_uri"] = config.get("verification_uri")
        else:
            # Authorization code flow providers (Google, Antigravity)
            provider_info["authorize_url"] = config.get("authorize_url")
            provider_info["use_pkce"] = config.get("use_pkce", False)
        
        # Include optional metadata if available
        if "models" in config:
            provider_info["models"] = config["models"]
        if "api_endpoint" in config:
            provider_info["api_endpoint"] = config["api_endpoint"]
            
        providers.append(provider_info)
    return {"count": len(providers), "providers": providers}


@app.post("/settings/oauth/{provider_id}/authorize")
async def initiate_oauth(provider_id: str, request: OAuthInitRequest) -> dict:
    """Initiate OAuth flow and return authorization URL."""
    if provider_id not in OAUTH_CONFIGS:
        raise HTTPException(status_code=404, detail=f"OAuth provider '{provider_id}' not found")
    
    config = OAUTH_CONFIGS[provider_id]
    
    try:
        # Resolve client_id: request > credential storage > built-in config
        client_id = request.client_id
        if not client_id:
            storage = get_credential_storage()
            creds = storage.get_credentials(provider_id)
            if creds and creds.oauth_client_id:
                client_id = creds.oauth_client_id
        
        # Fall back to built-in client_id if provider has one
        if not client_id and config.get("client_id"):
            client_id = config["client_id"]
        
        if not client_id:
            raise HTTPException(
                status_code=400,
                detail=f"No client_id configured for {provider_id}. "
                       f"Please set it in Settings > Provider > Client ID."
            )
        
        auth_url, oauth_state = build_authorization_url(
            provider_id=provider_id,
            client_id=client_id,
            redirect_uri=request.redirect_uri,
        )
        
        # Get the actual redirect_uri that was used (may be built-in, not what was requested)
        actual_redirect_uri = config.get("redirect_uri") or request.redirect_uri
        
        # Store state for verification
        _oauth_states[oauth_state.state] = {
            "provider_id": provider_id,
            "code_verifier": oauth_state.code_verifier,
            "redirect_uri": actual_redirect_uri,  # Store the ACTUAL redirect_uri used
            "frontend_origin": request.redirect_uri.rsplit('/', 1)[0] if request.redirect_uri else None,
        }
        
        return {
            "authorization_url": auth_url,
            "state": oauth_state.state,
            "redirect_uri": actual_redirect_uri,  # Tell frontend where callback will go
            "needs_local_server": config.get("redirect_uri") is not None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/settings/oauth/{provider_id}/callback")
async def oauth_callback(provider_id: str, request: OAuthCallbackRequest) -> dict:
    """Handle OAuth callback and exchange code for token."""
    if provider_id not in OAUTH_CONFIGS:
        raise HTTPException(status_code=404, detail=f"OAuth provider '{provider_id}' not found")
    
    # Verify state
    if request.state not in _oauth_states:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    
    stored_state = _oauth_states.pop(request.state)
    
    if stored_state["provider_id"] != provider_id:
        raise HTTPException(status_code=400, detail="Provider mismatch")
    
    # Resolve client credentials from credential storage if not in request
    client_id = request.client_id
    client_secret = request.client_secret
    if not client_id or not client_secret:
        storage = get_credential_storage()
        creds = storage.get_credentials(provider_id)
        if creds:
            if not client_id and creds.oauth_client_id:
                client_id = creds.oauth_client_id
            if not client_secret and creds.oauth_client_secret:
                client_secret = creds.oauth_client_secret
    
    # Exchange code for token
    token_response = await exchange_code_for_token(
        provider_id=provider_id,
        code=request.code,
        client_id=client_id or "",
        client_secret=client_secret,
        redirect_uri=request.redirect_uri,
        code_verifier=stored_state.get("code_verifier"),
    )
    
    if "error" in token_response:
        raise HTTPException(
            status_code=400,
            detail=token_response.get("error_description", token_response["error"]),
        )
    
    return {
        "success": True,
        "access_token": token_response.get("access_token"),
        "token_type": token_response.get("token_type", "Bearer"),
        "expires_in": token_response.get("expires_in"),
        "refresh_token": token_response.get("refresh_token"),
        "scope": token_response.get("scope"),
    }


# =============================================================================
# DEVICE FLOW ENDPOINTS (GitHub, OpenAI Codex)
# =============================================================================

# In-memory storage for device flow states (would use Redis/database in production)
_device_flow_states: dict[str, dict] = {}


class DeviceCodeRequest(BaseModel):
    """Request to initiate device code flow."""
    client_id: str | None = None  # Optional - uses built-in client ID if not provided


class DeviceCodePollRequest(BaseModel):
    """Request to poll for device code token."""
    client_id: str | None = None  # Optional - uses built-in client ID if not provided
    device_code: str


@app.get("/settings/oauth/{provider_id}/flow-type")
async def get_oauth_flow_type(provider_id: str) -> dict:
    """Get the OAuth flow type and configuration for a provider."""
    if provider_id not in OAUTH_CONFIGS:
        raise HTTPException(status_code=404, detail=f"OAuth provider '{provider_id}' not found")
    
    config = OAUTH_CONFIGS[provider_id]
    flow_type = config.get("flow_type", "authorization_code")
    
    result = {
        "provider_id": provider_id,
        "flow_type": flow_type,
        "models": config.get("models", []),
        "requires_subscription": config.get("requires_subscription"),
        "has_builtin_client": bool(config.get("client_id")),  # True if provider has built-in client ID
    }
    
    if flow_type == "device":
        result["verification_uri"] = config.get("verification_uri")
    else:
        result["authorize_url"] = config.get("authorize_url")
        result["use_pkce"] = config.get("use_pkce", False)
        result["redirect_uri"] = config.get("redirect_uri")
    
    return result


@app.post("/settings/oauth/{provider_id}/device-code")
async def request_device_code_endpoint(provider_id: str, request: DeviceCodeRequest) -> dict:
    """
    Request a device code for OAuth device flow.
    
    This is Step 1 of the device flow:
    1. Client requests device_code and user_code
    2. User visits verification_uri and enters user_code
    3. Client polls for token
    
    Returns device_code, user_code, verification_uri, interval, and expires_in.
    
    Note: client_id is optional - the built-in client ID will be used if not provided.
    """
    if provider_id not in OAUTH_CONFIGS:
        raise HTTPException(status_code=404, detail=f"OAuth provider '{provider_id}' not found")
    
    config = OAUTH_CONFIGS[provider_id]
    if config.get("flow_type") != "device":
        raise HTTPException(
            status_code=400, 
            detail=f"Provider '{provider_id}' uses {config.get('flow_type')} flow, not device flow"
        )
    
    try:
        # Resolve client_id: request > credential storage > built-in config
        client_id = request.client_id
        if not client_id:
            storage = get_credential_storage()
            creds = storage.get_credentials(provider_id)
            if creds and creds.oauth_client_id:
                client_id = creds.oauth_client_id
        
        # Fall back to built-in client_id if provider has one (e.g., GitHub Copilot)
        if not client_id and config.get("client_id"):
            client_id = config["client_id"]
        
        if not client_id:
            raise HTTPException(
                status_code=400,
                detail=f"No client_id configured for {provider_id}. "
                       f"Please set it in Settings > Provider > Client ID."
            )
        
        result = await request_device_code(
            provider_id=provider_id,
            client_id=client_id,
        )
        
        if "error" in result:
            raise HTTPException(
                status_code=400,
                detail=result.get("error_description", result["error"]),
            )
        
        # Store device code state for tracking
        _device_flow_states[result["device_code"]] = {
            "provider_id": provider_id,
            "client_id": client_id,
            "user_code": result["user_code"],
            "expires_in": result["expires_in"],
        }
        
        return {
            "device_code": result["device_code"],
            "user_code": result["user_code"],
            "verification_uri": result["verification_uri"],
            "expires_in": result["expires_in"],
            "interval": result["interval"],
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/settings/oauth/{provider_id}/device-poll")
async def poll_device_token_endpoint(provider_id: str, request: DeviceCodePollRequest) -> dict:
    """
    Poll for access token in device flow.
    
    This is Step 3 of the device flow:
    - Call this endpoint repeatedly until success or error
    - Respect the 'interval' from device-code response (typically 5 seconds)
    
    Returns:
    - success=True with access_token when user completes authorization
    - success=False with should_continue=True when still waiting
    - success=False with should_continue=False on error
    
    Note: client_id is optional - the built-in client ID will be used if not provided.
    """
    if provider_id not in OAUTH_CONFIGS:
        raise HTTPException(status_code=404, detail=f"OAuth provider '{provider_id}' not found")
    
    config = OAUTH_CONFIGS[provider_id]
    if config.get("flow_type") != "device":
        raise HTTPException(
            status_code=400, 
            detail=f"Provider '{provider_id}' uses {config.get('flow_type')} flow, not device flow"
        )
    
    try:
        # Resolve client_id: request > credential storage > built-in config
        client_id = request.client_id
        if not client_id:
            storage = get_credential_storage()
            creds = storage.get_credentials(provider_id)
            if creds and creds.oauth_client_id:
                client_id = creds.oauth_client_id
        
        # Fall back to built-in client_id if provider has one (e.g., GitHub Copilot)
        if not client_id and config.get("client_id"):
            client_id = config["client_id"]
        
        if not client_id:
            raise HTTPException(
                status_code=400,
                detail=f"No client_id configured for {provider_id}. "
                       f"Please set it in Settings > Provider > Client ID."
            )
        
        result = await poll_device_token(
            provider_id=provider_id,
            device_code=request.device_code,
            client_id=client_id,
        )
        
        # Clean up state on success or terminal error
        if result.get("success") or not result.get("should_continue"):
            _device_flow_states.pop(request.device_code, None)
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# LOCAL CALLBACK SERVER ENDPOINTS (Antigravity, OpenAI Codex)
# =============================================================================
# These endpoints manage temporary local HTTP servers for OAuth providers
# that have pre-registered redirect URIs at specific localhost ports.

from api.providers.oauth_callback_server import (
    start_callback_server,
    stop_callback_server,
    get_callback_result,
    clear_callback_result,
    is_server_running,
    get_provider_callback_port,
)


class StartCallbackServerRequest(BaseModel):
    """Request to start OAuth callback server."""
    state: str
    code_verifier: str | None = None
    custom_redirect_uri: str | None = None  # For providers without pre-registered redirect_uri (e.g., Google in pywebview)


@app.post("/settings/oauth/{provider_id}/start-callback-server")
async def start_oauth_callback_server(provider_id: str, request: StartCallbackServerRequest) -> dict:
    """
    Start a temporary local HTTP server to receive OAuth callbacks.
    
    This is required for providers with pre-registered redirect URIs
    (Antigravity, OpenAI Codex) that point to specific localhost ports.
    
    Also supports custom_redirect_uri for providers without pre-registered URIs
    (like Google when running in pywebview standalone mode).
    
    Flow:
    1. Frontend calls /authorize to get authorization URL and state
    2. Frontend calls this endpoint to start callback server
    3. User is redirected to OAuth provider
    4. Provider redirects to localhost:PORT (our temp server)
    5. Temp server exchanges code for token
    6. Frontend polls /poll-token to get result
    
    Returns:
        success: Whether server started successfully
        port: The port the server is listening on
        error: Error message if failed
    """
    if provider_id not in OAUTH_CONFIGS:
        raise HTTPException(status_code=404, detail=f"OAuth provider '{provider_id}' not found")
    
    config = OAUTH_CONFIGS[provider_id]
    
    # Check if provider needs local callback server (either pre-registered or custom)
    if not config.get("redirect_uri") and not request.custom_redirect_uri:
        return {
            "success": False,
            "needs_local_server": False,
            "error": "not_required",
            "error_description": f"Provider {provider_id} does not require a local callback server and no custom_redirect_uri was provided"
        }
    
    # Look up the code_verifier from stored OAuth state
    # This was generated during /authorize and stored in _oauth_states
    code_verifier = request.code_verifier
    if not code_verifier and request.state in _oauth_states:
        code_verifier = _oauth_states[request.state].get("code_verifier")
    
    if not code_verifier and config.get("use_pkce", False):
        return {
            "success": False,
            "error": "missing_code_verifier",
            "error_description": "PKCE code_verifier not found. Please restart OAuth flow."
        }
    
    try:
        result = await start_callback_server(
            provider_id=provider_id,
            state=request.state,
            code_verifier=code_verifier,
            timeout=300,  # 5 minute timeout
            custom_redirect_uri=request.custom_redirect_uri,
        )
        
        if result.get("success"):
            return {
                "success": True,
                "port": result["port"],
                "callback_path": result.get("callback_path"),
                "already_running": result.get("already_running", False),
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=result.get("error_description", result.get("error", "Failed to start server"))
            )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/settings/oauth/{provider_id}/poll-token")
async def poll_oauth_token(provider_id: str, state: str) -> dict:
    """
    Poll for OAuth token result after callback server receives callback.
    
    The frontend should call this endpoint repeatedly (e.g., every 2 seconds)
    until it returns success=True or an error.
    
    Args:
        provider_id: OAuth provider ID
        state: The OAuth state from /authorize response
        
    Returns:
        pending: True if still waiting for callback
        success: True if token received
        access_token: The OAuth access token (on success)
        error: Error message (on failure)
    """
    if provider_id not in OAUTH_CONFIGS:
        raise HTTPException(status_code=404, detail=f"OAuth provider '{provider_id}' not found")
    
    # Check for result
    result = get_callback_result(state)
    
    if result is None:
        # Check if server is still running
        if is_server_running(state):
            return {
                "pending": True,
                "success": False,
                "message": "Waiting for OAuth callback..."
            }
        else:
            return {
                "pending": False,
                "success": False,
                "error": "server_not_running",
                "error_description": "Callback server is not running. Please restart OAuth flow."
            }
    
    # We have a result
    if result.success:
        # Clear the stored result
        clear_callback_result(state)
        
        return {
            "pending": False,
            "success": True,
            "access_token": result.access_token,
            "refresh_token": result.refresh_token,
            "token_type": result.token_type,
            "expires_in": result.expires_in,
            "scope": result.scope,
        }
    else:
        # Clear the stored result
        clear_callback_result(state)
        
        return {
            "pending": False,
            "success": False,
            "error": result.error,
            "error_description": result.error_description,
        }


@app.delete("/settings/oauth/{provider_id}/callback-server")
async def stop_oauth_callback_server(provider_id: str, state: str) -> dict:
    """
    Stop the OAuth callback server for a specific state.
    
    Call this to clean up if the user cancels the OAuth flow.
    
    Args:
        provider_id: OAuth provider ID
        state: The OAuth state from /authorize response
        
    Returns:
        success: Whether server was stopped
    """
    if provider_id not in OAUTH_CONFIGS:
        raise HTTPException(status_code=404, detail=f"OAuth provider '{provider_id}' not found")
    
    stopped = await stop_callback_server(state)
    clear_callback_result(state)
    
    return {
        "success": True,
        "was_running": stopped
    }


@app.get("/settings/oauth/{provider_id}/callback-server-status")
async def get_callback_server_status(provider_id: str, state: str) -> dict:
    """
    Check status of OAuth callback server.
    
    Args:
        provider_id: OAuth provider ID
        state: The OAuth state from /authorize response
        
    Returns:
        running: Whether server is running
        port: The port if running
        has_result: Whether a result is available
    """
    if provider_id not in OAUTH_CONFIGS:
        raise HTTPException(status_code=404, detail=f"OAuth provider '{provider_id}' not found")
    
    running = is_server_running(state)
    result = get_callback_result(state)
    port = get_provider_callback_port(provider_id)
    
    return {
        "running": running,
        "port": port,
        "has_result": result is not None,
        "result_success": result.success if result else None,
    }


@app.post("/settings/oauth/{provider_id}/refresh")
async def refresh_oauth_token(provider_id: str) -> dict:
    """
    Refresh OAuth token for a provider.
    
    For GitHub Copilot: Uses stored GitHub access token to get fresh Copilot JWT.
    For other providers: Uses stored refresh_token to get new access_token.
    
    Args:
        provider_id: OAuth provider ID
        
    Returns:
        success: Whether refresh succeeded
        oauth_token: New access/JWT token
        expires_at: Token expiration (if available)
    """
    if provider_id not in OAUTH_CONFIGS:
        raise HTTPException(status_code=404, detail=f"OAuth provider '{provider_id}' not found")
    
    # Get stored credentials
    storage = get_credential_storage()
    creds = storage.get_credentials(provider_id)
    
    if not creds or not creds.oauth_refresh_token:
        return {
            "success": False,
            "error": "no_refresh_token",
            "error_description": f"No refresh token stored for {provider_id}. Please re-authenticate.",
        }
    
    config = OAUTH_CONFIGS[provider_id]
    
    try:
        if provider_id == "github_copilot":
            # For GitHub Copilot, oauth_refresh_token contains the GitHub access token (gho_...)
            # Use it to get a fresh Copilot JWT
            from api.providers.oauth import _get_copilot_token
            
            copilot_result = await _get_copilot_token(
                creds.oauth_refresh_token,  # This is the GitHub access token
                config["copilot_token_url"],
                config.get("headers", {}),
            )
            
            if copilot_result.get("error"):
                return {
                    "success": False,
                    "error": copilot_result.get("error"),
                    "error_description": copilot_result.get("error_description", "Failed to refresh Copilot token"),
                }
            
            new_token = copilot_result.get("token")
            expires_at = copilot_result.get("expires_at")
            
            # Update stored credentials with new JWT
            creds.oauth_token = new_token
            storage.set_credentials(provider_id, creds)
            
            return {
                "success": True,
                "oauth_token": new_token,
                "expires_at": expires_at,
            }
        else:
            # For standard OAuth providers, use refresh_token grant
            from api.providers.oauth import refresh_token as do_refresh
            
            # Resolve client credentials from storage
            client_id = ""
            client_secret = None
            if creds.oauth_client_id:
                client_id = creds.oauth_client_id
            if creds.oauth_client_secret:
                client_secret = creds.oauth_client_secret
            
            result = await do_refresh(
                provider_id=provider_id,
                refresh_token=creds.oauth_refresh_token,
                client_id=client_id,
                client_secret=client_secret,
            )
            
            if "error" in result:
                return {
                    "success": False,
                    "error": result.get("error"),
                    "error_description": result.get("error_description", "Refresh failed"),
                }
            
            new_token = result.get("access_token")
            new_refresh = result.get("refresh_token")
            
            # Update stored credentials
            creds.oauth_token = new_token
            if new_refresh:
                creds.oauth_refresh_token = new_refresh
            storage.set_credentials(provider_id, creds)
            
            return {
                "success": True,
                "oauth_token": new_token,
            }
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Token refresh failed for {provider_id}: {e}")
        return {
            "success": False,
            "error": "refresh_failed",
            "error_description": str(e),
        }


# =============================================================================
# CREDENTIAL STORAGE API
# =============================================================================

# Import moved to top of file


class CredentialUpdate(BaseModel):
    """Request to update credentials for a provider."""
    api_key: str | None = None
    endpoint: str | None = None
    oauth_token: str | None = None
    oauth_refresh_token: str | None = None
    oauth_client_id: str | None = None
    oauth_client_secret: str | None = None


class SettingsUpdate(BaseModel):
    """Request to update settings."""
    active_provider: str | None = None
    selected_model: str | None = None
    target_model: str | None = None


class ImportRequest(BaseModel):
    """Request to import from localStorage format."""
    data: dict[str, Any]


@app.get("/credentials")
async def get_all_credentials() -> dict[str, Any]:
    """
    Get all stored settings and credentials.
    
    Returns provider IDs and non-sensitive metadata.
    Sensitive values (tokens, keys) are masked.
    """
    storage = get_credential_storage()
    settings = storage.get_all_settings()
    
    # Mask sensitive values for display
    result = {
        "active_provider": settings.active_provider,
        "selected_model": settings.selected_model,
        "target_model": settings.target_model,
        "providers": {}
    }
    
    for provider_id, creds in settings.providers.items():
        result["providers"][provider_id] = {
            "has_api_key": bool(creds.api_key),
            "has_oauth_token": bool(creds.oauth_token),
            "has_refresh_token": bool(creds.oauth_refresh_token),
            "has_oauth_client_id": bool(creds.oauth_client_id),
            "has_oauth_client_secret": bool(creds.oauth_client_secret),
            "endpoint": creds.endpoint,
            "updated_at": creds.updated_at,
        }
    
    return result


@app.get("/credentials/{provider_id}")
async def get_provider_credentials(provider_id: str) -> dict[str, Any]:
    """
    Get credentials for a specific provider.
    
    Returns the full credentials including sensitive values.
    """
    storage = get_credential_storage()
    creds = storage.get_credentials(provider_id)
    
    if not creds:
        return {"exists": False}
    
    return {
        "exists": True,
        "api_key": creds.api_key,
        "endpoint": creds.endpoint,
        "oauth_token": creds.oauth_token,
        "oauth_refresh_token": creds.oauth_refresh_token,
        "oauth_client_id": creds.oauth_client_id,
        "oauth_client_secret": creds.oauth_client_secret,
        "updated_at": creds.updated_at,
    }


@app.put("/credentials/{provider_id}")
async def update_provider_credentials(provider_id: str, update: CredentialUpdate) -> dict[str, Any]:
    """
    Update credentials for a specific provider.
    
    Only provided fields are updated; null/missing fields are ignored.
    """
    storage = get_credential_storage()
    
    # Get existing credentials or create new
    existing = storage.get_credentials(provider_id)
    if existing:
        # Merge with existing
        creds = ProviderCredentials(
            api_key=update.api_key if update.api_key is not None else existing.api_key,
            endpoint=update.endpoint if update.endpoint is not None else existing.endpoint,
            oauth_token=update.oauth_token if update.oauth_token is not None else existing.oauth_token,
            oauth_refresh_token=update.oauth_refresh_token if update.oauth_refresh_token is not None else existing.oauth_refresh_token,
            oauth_client_id=update.oauth_client_id if update.oauth_client_id is not None else existing.oauth_client_id,
            oauth_client_secret=update.oauth_client_secret if update.oauth_client_secret is not None else existing.oauth_client_secret,
        )
    else:
        creds = ProviderCredentials(
            api_key=update.api_key,
            endpoint=update.endpoint,
            oauth_token=update.oauth_token,
            oauth_refresh_token=update.oauth_refresh_token,
            oauth_client_id=update.oauth_client_id,
            oauth_client_secret=update.oauth_client_secret,
        )
    
    storage.set_credentials(provider_id, creds)
    
    return {"success": True, "provider_id": provider_id}


@app.delete("/credentials/{provider_id}")
async def delete_provider_credentials(provider_id: str) -> dict[str, Any]:
    """Delete credentials for a specific provider."""
    storage = get_credential_storage()
    storage.delete_credentials(provider_id)
    return {"success": True, "provider_id": provider_id}


@app.get("/settings")
async def get_settings() -> dict[str, Any]:
    """Get non-credential settings."""
    storage = get_credential_storage()
    return {
        "active_provider": storage.get_setting("active_provider"),
        "selected_model": storage.get_setting("selected_model"),
        "target_model": storage.get_setting("target_model"),
    }


@app.put("/settings")
async def update_settings(update: SettingsUpdate) -> dict[str, Any]:
    """Update non-credential settings."""
    storage = get_credential_storage()
    
    if update.active_provider is not None:
        storage.set_setting("active_provider", update.active_provider)
    if update.selected_model is not None:
        storage.set_setting("selected_model", update.selected_model)
    if update.target_model is not None:
        storage.set_setting("target_model", update.target_model)
    
    return {"success": True}


@app.post("/credentials/import")
async def import_credentials(request: ImportRequest) -> dict[str, Any]:
    """
    Import credentials from localStorage format.
    
    This endpoint accepts the JSON format used by the frontend's localStorage
    and imports it into the server-side storage.
    
    Example payload:
    {
        "data": {
            "activeProvider": "github_copilot",
            "providers": {
                "github_copilot": {
                    "oauthToken": "eyJ...",
                    "endpoint": null
                }
            }
        }
    }
    """
    storage = get_credential_storage()
    storage.import_from_localstorage(request.data)
    
    # Return what was imported
    providers = list(request.data.get("providers", {}).keys())
    return {
        "success": True,
        "imported_providers": providers,
        "count": len(providers),
    }


# =============================================================================
# LLM MODEL FETCHING
# =============================================================================

from api.providers.llm_service import llm_service, LLMCredentials
from api.providers.system_prompts import get_system_prompt, build_enhancement_prompt


class FetchModelsRequest(BaseModel):
    """Request to fetch available models from a provider."""
    provider: str
    credentials: dict[str, Any]


class ModelInfo(BaseModel):
    """Information about an available model."""
    id: str
    name: str
    recommended: bool = False
    description: str | None = None
    supports_images: bool | None = None
    supports_thinking: bool | None = None
    max_tokens: int | None = None
    context_window: int | None = None
    provider: str | None = None


class FetchModelsResponse(BaseModel):
    """Response with available models."""
    success: bool
    models: list[ModelInfo] = []
    default_model: str | None = None
    error: str | None = None


@app.post("/llm/models")
async def fetch_llm_models(request: FetchModelsRequest) -> FetchModelsResponse:
    """
    Fetch available models from an LLM provider dynamically.
    
    Supports:
    - antigravity: Fetches from Google Cloud AI Companion
    - openai_codex: Fetches from ChatGPT backend API
    - openai: Fetches from OpenAI API
    - google: Fetches from Google AI API
    - ollama/lmstudio: Fetches from local servers
    """
    try:
        creds = LLMCredentials(
            api_key=request.credentials.get("api_key"),
            endpoint=request.credentials.get("endpoint"),
            oauth_token=request.credentials.get("oauth_token"),
        )
        
        result = await llm_service.fetch_provider_models(
            provider=request.provider,
            credentials=creds,
        )
        
        if result.get("success"):
            models = [
                ModelInfo(
                    id=m.get("id", ""),
                    name=m.get("name", m.get("id", "")),
                    recommended=m.get("recommended", False),
                    description=m.get("description"),
                    supports_images=m.get("supports_images"),
                    supports_thinking=m.get("supports_thinking"),
                    max_tokens=m.get("max_tokens"),
                    context_window=m.get("context_window"),
                    provider=m.get("provider"),
                )
                for m in result.get("models", [])
            ]
            return FetchModelsResponse(
                success=True,
                models=models,
                default_model=result.get("default_model"),
            )
        else:
            return FetchModelsResponse(
                success=False,
                error=result.get("error", "Unknown error"),
            )
    except Exception as e:
        return FetchModelsResponse(
            success=False,
            error=f"Failed to fetch models: {str(e)}",
        )


# =============================================================================
# TARGET AI MODELS (for prompt generation)
# =============================================================================


class TargetModelInfo(BaseModel):
    """Information about a target AI model."""
    id: str
    name: str
    category: str


@app.get("/target-models")
async def get_target_ai_models() -> list[TargetModelInfo]:
    """
    Get list of available target AI models for prompt generation.
    
    Returns models for both image generation (FLUX, Midjourney, DALL-E, etc.)
    and video generation (Sora, Runway, Kling, etc.).
    """
    from api.providers.system_prompts import get_target_models
    
    models = get_target_models()
    return [
        TargetModelInfo(
            id=m["id"],
            name=m["name"],
            category=m["category"],
        )
        for m in models
    ]


# =============================================================================
# LLM PROMPT ENHANCEMENT
# =============================================================================


class EnhancePromptRequest(BaseModel):
    """Request to enhance a prompt using LLM."""
    user_prompt: str
    llm_provider: str
    llm_model: str
    target_model: str
    project_type: ProjectType
    config: dict[str, Any]
    credentials: dict[str, Any]


class EnhancePromptResponse(BaseModel):
    """Response with enhanced prompt."""
    success: bool
    enhanced_prompt: str = ""
    negative_prompt: str | None = None
    tokens_used: int = 0
    model_used: str = ""
    error: str | None = None


def _remove_duplicate_prompt(content: str) -> str:
    """Remove duplicate content from LLM response.
    
    Some LLMs occasionally repeat the prompt. This detects and removes duplicates.
    """
    content = content.strip()
    
    # Check if the content appears to be duplicated (same text twice)
    length = len(content)
    if length < 100:  # Too short to likely have duplicates
        return content
    
    # Try to find where content repeats itself
    # Check for exact halves
    half = length // 2
    first_half = content[:half].strip()
    second_half = content[half:].strip()
    
    # If both halves are very similar (>90% match), keep just the first
    if first_half and second_half:
        # Check if second half starts like first half
        min_check = min(len(first_half), len(second_half), 200)
        if first_half[:min_check] == second_half[:min_check]:
            return first_half
    
    # Check for repeated paragraphs separated by newlines
    paragraphs = [p.strip() for p in content.split('\n\n') if p.strip()]
    if len(paragraphs) >= 2:
        # Check if paragraphs are duplicates
        unique_paragraphs = []
        for p in paragraphs:
            # Only add if not already present (comparing first 100 chars)
            is_duplicate = False
            for existing in unique_paragraphs:
                if p[:100] == existing[:100]:
                    is_duplicate = True
                    break
            if not is_duplicate:
                unique_paragraphs.append(p)
        
        if len(unique_paragraphs) < len(paragraphs):
            return '\n\n'.join(unique_paragraphs)
    
    return content


@app.post("/enhance-prompt")
async def enhance_prompt(request: EnhancePromptRequest) -> EnhancePromptResponse:
    """
    Enhance a user's prompt using an LLM with cinematic context.
    
    Takes a base user prompt, combines it with the current cinematic configuration,
    and sends to the selected LLM to generate a professional prompt optimized for
    the target image/video generation model.
    """
    try:
        # Get system prompt for target model and project type
        # Animation projects use animation-specific prompts without camera references
        system_prompt = get_system_prompt(request.target_model, request.project_type.value)
        
        # Build the full prompt with cinematic context
        full_prompt = build_enhancement_prompt(
            request.user_prompt,
            request.config,
            request.project_type.value,
            request.target_model,
        )
        
        # Create credentials object
        creds = LLMCredentials(
            api_key=request.credentials.get("api_key"),
            endpoint=request.credentials.get("endpoint"),
            oauth_token=request.credentials.get("oauth_token"),
        )
        
        # Call LLM service
        result = await llm_service.enhance_prompt(
            user_prompt=full_prompt,
            system_prompt=system_prompt,
            provider=request.llm_provider,
            model=request.llm_model,
            credentials=creds,
        )
        
        if result.success:
            # Post-process to remove duplicates (some LLMs repeat the prompt)
            enhanced = _remove_duplicate_prompt(result.content)
            
            return EnhancePromptResponse(
                success=True,
                enhanced_prompt=enhanced,
                tokens_used=result.tokens_used,
                model_used=result.model_used,
            )
        else:
            return EnhancePromptResponse(
                success=False,
                error=result.error,
            )
    except Exception as e:
        return EnhancePromptResponse(
            success=False,
            error=f"Enhancement failed: {str(e)}",
        )


# =============================================================================
# PROVIDER CONNECTIVITY TEST
# =============================================================================


class TestProviderRequest(BaseModel):
    """Request to test provider connectivity."""
    provider: str
    credentials: dict[str, Any]
    test_prompt: str | None = None


class TestProviderResponse(BaseModel):
    """Response from provider connectivity test."""
    success: bool
    provider: str
    models_fetched: int = 0
    models_sample: list[str] = []
    token_info: dict[str, Any] = {}
    enhancement_result: str | None = None
    error: str | None = None


@app.post("/test-provider")
async def test_provider_connectivity(request: TestProviderRequest) -> TestProviderResponse:
    """
    Test connectivity to an LLM provider.
    
    This endpoint tests:
    1. Model fetching
    2. Token validation (for OAuth providers)
    3. Optional prompt enhancement test
    
    Use this to verify provider credentials are working correctly.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        creds = LLMCredentials(
            api_key=request.credentials.get("api_key") or request.credentials.get("apiKey"),
            endpoint=request.credentials.get("endpoint"),
            oauth_token=request.credentials.get("oauth_token") or request.credentials.get("oauthToken"),
        )
        
        # Token info for OAuth providers
        token_info = {}
        token = creds.oauth_token or ""
        if token:
            token_info["length"] = len(token)
            token_info["prefix"] = token[:15] + "..." if len(token) > 15 else token
            token_info["is_jwt"] = token.startswith("eyJ")
            token_info["is_github_oauth"] = token.startswith("gho_")
            
            if request.provider == "github_copilot" and token.startswith("gho_"):
                logger.warning(f"[Test] GitHub Copilot token is OAuth (gho_...) not JWT (eyJ...) - token exchange may have failed")
                token_info["warning"] = "Token is GitHub OAuth, not Copilot JWT. Re-authenticate to get proper token."
        
        # Test model fetching
        logger.info(f"[Test] Fetching models for {request.provider}...")
        result = await llm_service.fetch_provider_models(
            provider=request.provider,
            credentials=creds,
        )
        
        if not result.get("success"):
            return TestProviderResponse(
                success=False,
                provider=request.provider,
                token_info=token_info,
                error=result.get("error", "Failed to fetch models"),
            )
        
        models = result.get("models", [])
        models_sample = [m.get("name", m.get("id", "Unknown")) for m in models[:5]]
        
        # Optional: test prompt enhancement
        enhancement_result = None
        if request.test_prompt:
            logger.info(f"[Test] Testing prompt enhancement for {request.provider}...")
            system_prompt = get_system_prompt("sora")
            
            # Use first recommended model, or first model
            test_model = None
            for m in models:
                if m.get("recommended"):
                    test_model = m.get("id")
                    break
            if not test_model and models:
                test_model = models[0].get("id")
            
            if test_model:
                enhance_result = await llm_service.enhance_prompt(
                    user_prompt=request.test_prompt,
                    system_prompt=system_prompt,
                    provider=request.provider,
                    model=test_model,
                    credentials=creds,
                )
                
                if enhance_result.success:
                    enhancement_result = enhance_result.content[:500] + "..." if len(enhance_result.content) > 500 else enhance_result.content
                else:
                    enhancement_result = f"Enhancement failed: {enhance_result.error}"
        
        return TestProviderResponse(
            success=True,
            provider=request.provider,
            models_fetched=len(models),
            models_sample=models_sample,
            token_info=token_info,
            enhancement_result=enhancement_result,
        )
        
    except Exception as e:
        logger.exception(f"[Test] Provider test failed: {e}")
        return TestProviderResponse(
            success=False,
            provider=request.provider,
            error=f"Test failed: {str(e)}",
        )


# =============================================================================
# STORYBOARD INTEGRATION (Phase 2)
# =============================================================================

class StoryboardFrameRequest(BaseModel):
    """Request to push a generated prompt to storyboard."""
    prompt: str
    negative_prompt: str | None = None
    frame_index: int | None = None
    workflow_data: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None


class StoryboardFrameResponse(BaseModel):
    """Response after pushing to storyboard."""
    success: bool
    frame_id: str
    frame_index: int
    message: str


class StoryboardStateResponse(BaseModel):
    """Current storyboard state."""
    total_frames: int
    frames: list[dict[str, Any]]
    current_frame_index: int | None = None
    metadata: dict[str, Any] | None = None


# In-memory storyboard state (will be replaced with proper storage in Phase 3)
_storyboard_frames: list[dict[str, Any]] = []
_current_frame_index: int = 0


@app.post("/api/storyboard/push_prompt", response_model=StoryboardFrameResponse)
async def push_prompt_to_storyboard(request: StoryboardFrameRequest):
    """
    Push a generated prompt to the storyboard.
    
    This endpoint allows CPE to send prompts to the storyboard system,
    creating a new frame or updating an existing one.
    
    **Parameters:**
    - `prompt`: The positive prompt text
    - `negative_prompt`: Optional negative prompt
    - `frame_index`: Optional frame index (auto-assigned if not provided)
    - `workflow_data`: Optional ComfyUI workflow data
    - `metadata`: Optional metadata (camera angles, settings, etc.)
    
    **Returns:**
    - Frame ID and index
    - Success status
    """
    global _storyboard_frames, _current_frame_index
    
    try:
        # Determine frame index
        if request.frame_index is not None:
            frame_index = request.frame_index
        else:
            frame_index = len(_storyboard_frames)
        
        # Create frame ID
        frame_id = f"frame_{frame_index:04d}"
        
        # Create frame data
        from datetime import datetime
        
        frame_data = {
            "id": frame_id,
            "index": frame_index,
            "prompt": request.prompt,
            "negative_prompt": request.negative_prompt,
            "workflow_data": request.workflow_data,
            "metadata": request.metadata or {},
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        
        # Insert or update frame
        if frame_index < len(_storyboard_frames):
            # Update existing frame
            _storyboard_frames[frame_index] = frame_data
            message = f"Updated frame {frame_index}"
        else:
            # Append new frame
            while len(_storyboard_frames) < frame_index:
                # Fill gaps with empty frames
                _storyboard_frames.append({
                    "id": f"frame_{len(_storyboard_frames):04d}",
                    "index": len(_storyboard_frames),
                    "prompt": "",
                    "negative_prompt": None,
                    "workflow_data": None,
                    "metadata": {},
                    "created_at": datetime.now().isoformat(),
                })
            
            _storyboard_frames.append(frame_data)
            message = f"Created frame {frame_index}"
        
        # Update current frame index
        _current_frame_index = frame_index
        
        return StoryboardFrameResponse(
            success=True,
            frame_id=frame_id,
            frame_index=frame_index,
            message=message
        )
    
    except Exception as e:
        logger.error(f"Failed to push prompt to storyboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/storyboard/state", response_model=StoryboardStateResponse)
async def get_storyboard_state():
    """
    Query the current storyboard state.
    
    Returns all frames and metadata about the current storyboard session.
    
    **Returns:**
    - Total number of frames
    - List of all frames with their data
    - Current frame index
    - Session metadata
    """
    global _storyboard_frames, _current_frame_index
    
    try:
        return StoryboardStateResponse(
            total_frames=len(_storyboard_frames),
            frames=_storyboard_frames,
            current_frame_index=_current_frame_index if _storyboard_frames else None,
            metadata={
                "session_started": _storyboard_frames[0]["created_at"] if _storyboard_frames else None,
                "last_updated": _storyboard_frames[-1]["updated_at"] if _storyboard_frames else None,
            }
        )
    
    except Exception as e:
        logger.error(f"Failed to get storyboard state: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/storyboard/frame/{frame_index}")
async def get_storyboard_frame(frame_index: int):
    """
    Get a specific frame from the storyboard.
    
    **Parameters:**
    - `frame_index`: The index of the frame to retrieve
    
    **Returns:**
    - Frame data including prompt, workflow, and metadata
    """
    global _storyboard_frames
    
    try:
        if frame_index < 0 or frame_index >= len(_storyboard_frames):
            raise HTTPException(status_code=404, detail=f"Frame {frame_index} not found")
        
        return _storyboard_frames[frame_index]
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get storyboard frame: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/storyboard/frame/{frame_index}")
async def delete_storyboard_frame(frame_index: int):
    """
    Delete a frame from the storyboard.
    
    **Parameters:**
    - `frame_index`: The index of the frame to delete
    """
    global _storyboard_frames
    
    try:
        if frame_index < 0 or frame_index >= len(_storyboard_frames):
            raise HTTPException(status_code=404, detail=f"Frame {frame_index} not found")
        
        deleted_frame = _storyboard_frames.pop(frame_index)
        
        # Re-index remaining frames
        for i, frame in enumerate(_storyboard_frames):
            frame["index"] = i
            frame["id"] = f"frame_{i:04d}"
        
        return {
            "success": True,
            "message": f"Deleted frame {frame_index}",
            "deleted_frame": deleted_frame
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete storyboard frame: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/storyboard/clear")
async def clear_storyboard():
    """
    Clear all frames from the storyboard.
    
    Resets the storyboard to an empty state.
    """
    global _storyboard_frames, _current_frame_index
    
    try:
        frame_count = len(_storyboard_frames)
        _storyboard_frames.clear()
        _current_frame_index = 0
        
        return {
            "success": True,
            "message": f"Cleared {frame_count} frame(s)",
            "total_frames": 0
        }
    
    except Exception as e:
        logger.error(f"Failed to clear storyboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/storyboard/import_workflow")
async def import_workflow_to_storyboard(
    workflow: dict[str, Any],
    frame_index: int | None = None,
    extract_prompts: bool = True
):
    """
    Import a ComfyUI workflow directly into the storyboard.
    
    This endpoint parses a workflow, extracts parameters, and creates
    a storyboard frame with the workflow data.
    
    **Parameters:**
    - `workflow`: ComfyUI workflow JSON
    - `frame_index`: Optional frame index
    - `extract_prompts`: Whether to extract prompts from the workflow
    
    **Returns:**
    - Created frame information
    - Extracted parameters
    """
    from workflow_parser.parser import WorkflowParser
    
    try:
        # Parse the workflow
        parser = WorkflowParser(workflow)
        manifest = parser.parse()
        
        # Extract prompts
        positive_prompt = ""
        negative_prompt = ""
        
        if extract_prompts:
            # Get first positive and negative prompts
            for encoder in manifest.text_encoders:
                if encoder.role == "positive" and not positive_prompt:
                    positive_prompt = encoder.text
                elif encoder.role == "negative" and not negative_prompt:
                    negative_prompt = encoder.text
            
            # Try SDXL encoders
            for encoder in manifest.text_encoders_sdxl:
                if encoder.role == "positive" and not positive_prompt:
                    positive_prompt = encoder.text_g or encoder.text_l
                elif encoder.role == "negative" and not negative_prompt:
                    negative_prompt = encoder.text_g or encoder.text_l
            
            # Try Flux encoders
            for encoder in manifest.text_encoders_flux:
                if encoder.role == "positive" and not positive_prompt:
                    positive_prompt = encoder.t5xxl
                elif encoder.role == "negative" and not negative_prompt:
                    negative_prompt = encoder.t5xxl
        
        # Extract metadata
        metadata = {
            "ksamplers": len(manifest.ksamplers),
            "checkpoints": len(manifest.checkpoints),
            "loras": len(manifest.loras),
            "seed": manifest.ksamplers[0].seed if manifest.ksamplers else None,
            "steps": manifest.ksamplers[0].steps if manifest.ksamplers else None,
            "cfg": manifest.ksamplers[0].cfg if manifest.ksamplers else None,
            "sampler": manifest.ksamplers[0].sampler_name if manifest.ksamplers else None,
        }
        
        # Push to storyboard
        frame_request = StoryboardFrameRequest(
            prompt=positive_prompt,
            negative_prompt=negative_prompt,
            frame_index=frame_index,
            workflow_data=workflow,
            metadata=metadata
        )
        
        response = await push_prompt_to_storyboard(frame_request)
        
        return {
            "success": True,
            "frame": response,
            "extracted": {
                "positive_prompt": positive_prompt,
                "negative_prompt": negative_prompt,
                "metadata": metadata
            }
        }
    
    except Exception as e:
        logger.error(f"Failed to import workflow to storyboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# FILE DELETION PROXY (bypasses CORS)
# =============================================================================

class DeleteFileRequest(BaseModel):
    """Request to delete a file from ComfyUI."""
    comfyui_url: str
    filename: str
    subfolder: str = ""
    type: str = "output"


@app.post("/api/delete-file")
async def delete_comfyui_file(request: DeleteFileRequest) -> dict[str, Any]:
    """
    Delete a file from ComfyUI via proxy to bypass CORS.
    """
    import httpx
    
    try:
        delete_url = f"{request.comfyui_url}/api/view?filename={request.filename}&type={request.type}"
        if request.subfolder:
            delete_url += f"&subfolder={request.subfolder}"
        
        logger.info(f"[Delete Proxy] Deleting file from ComfyUI: {delete_url}")
        
        async with httpx.AsyncClient() as client:
            response = await client.delete(delete_url)
            
            if response.status_code in (200, 204):
                logger.info(f"[Delete Proxy] Successfully deleted {request.filename}")
                return {"success": True, "message": f"Deleted {request.filename}", "filename": request.filename}
            else:
                return {"success": False, "message": f"ComfyUI returned status {response.status_code}"}
                
    except Exception as e:
        logger.error(f"[Delete Proxy] Failed to delete file: {e}")
        return {"success": False, "message": f"Failed to delete file: {str(e)}"}


def _is_path_safe(file_path: str | Path, allowed_base_path: str | Path | None = None) -> tuple[bool, str]:
    """Check if a file path is safe from directory traversal attacks."""
    try:
        path = Path(file_path).resolve()
        original_str = str(file_path)
        if '..' in original_str.split('/') or '..' in original_str.split('\\'):
            pass
        if allowed_base_path:
            base = Path(allowed_base_path).resolve()
            try:
                path.relative_to(base)
            except ValueError:
                return False, f"Path {file_path} is outside allowed directory {allowed_base_path}"
        return True, ""
    except Exception as e:
        return False, f"Invalid path: {e}"


# ============================================================================
# SECURITY: SSRF Protection for URL fetching
# ============================================================================

import ipaddress
from urllib.parse import urlparse

# Allowed URL hosts for SSRF protection (ComfyUI nodes)
# Populated from ALLOWED_ORIGINS or environment
_CPE_ALLOWED_URL_HOSTS: set[str] = {
    "localhost",
    "127.0.0.1",
}

# Add hosts from environment variable (comma-separated)
_extra_hosts = os.getenv("CPE_ALLOWED_FETCH_HOSTS", "")
if _extra_hosts:
    for h in _extra_hosts.split(","):
        if h.strip():
            _CPE_ALLOWED_URL_HOSTS.add(h.strip())


def _is_url_safe_for_fetch(url: str) -> tuple[bool, str]:
    """Validate URL to prevent SSRF attacks.
    
    Only allows URLs to:
    - localhost/127.0.0.1
    - Hosts in CPE_ALLOWED_FETCH_HOSTS environment variable
    - HTTP/HTTPS schemes only
    
    Args:
        url: The URL to validate
        
    Returns:
        Tuple of (is_safe, error_message)
    """
    try:
        parsed = urlparse(url)
        
        # Only allow http/https schemes
        if parsed.scheme not in ('http', 'https'):
            return False, f"Invalid URL scheme: {parsed.scheme}. Only http/https allowed."
        
        hostname = parsed.hostname
        if not hostname:
            return False, "URL has no hostname"
        
        # Check if hostname is in allowlist
        if hostname in _CPE_ALLOWED_URL_HOSTS:
            return True, ""
        
        # Check if it's an IP address
        try:
            ip = ipaddress.ip_address(hostname)
            # Block cloud metadata endpoints
            if hostname == "169.254.169.254":
                return False, "Cloud metadata endpoint blocked"
            # For private IPs, check allowlist
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                if hostname not in _CPE_ALLOWED_URL_HOSTS:
                    return False, f"Private/internal IP {hostname} not in allowed hosts. Set CPE_ALLOWED_FETCH_HOSTS env var."
        except ValueError:
            # Not an IP, it's a hostname - must be in allowlist
            pass
        
        # Final check: hostname must be in allowlist
        if hostname not in _CPE_ALLOWED_URL_HOSTS:
            return False, f"Host '{hostname}' not in allowed hosts. Set CPE_ALLOWED_FETCH_HOSTS env var."
        
        return True, ""
        
    except Exception as e:
        return False, f"Invalid URL: {e}"


@app.get("/api/read-image")
async def read_image_as_base64(path: str) -> dict[str, Any]:
    """Read a local image file and return it as base64 data URL."""
    import asyncio
    import base64
    from pathlib import Path
    
    # SECURITY: Check for path traversal attacks
    is_safe, error_msg = _is_path_safe(path)
    if not is_safe:
        logger.warning(f"[read_image] Path traversal attempt blocked: {path}")
        raise HTTPException(status_code=400, detail=f"Security error: {error_msg}")
    
    def _read_sync():
        image_path = Path(path)
        if not image_path.exists():
            return (False, f"Image not found: {path}")
        suffix = image_path.suffix.lower()
        mime_types = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif'}
        mime_type = mime_types.get(suffix, 'image/png')
        with open(image_path, 'rb') as f:
            image_data = f.read()
        return (True, f"data:{mime_type};base64,{base64.b64encode(image_data).decode('utf-8')}")
    
    try:
        success, result = await asyncio.to_thread(_read_sync)
        if success:
            return {"success": True, "dataUrl": result}
        else:
            raise HTTPException(status_code=404, detail=result)
    except HTTPException:
        raise
    except Exception as e:
        return {"success": False, "message": f"Failed to read image: {str(e)}"}


@app.get("/api/fetch-image")
async def fetch_image_from_url(url: str) -> dict[str, Any]:
    """Fetch an image from a URL and return it as base64 data URL.
    
    SECURITY: Only allows fetching from localhost and hosts in CPE_ALLOWED_FETCH_HOSTS env var.
    """
    import base64
    import httpx
    
    # SECURITY: Check for SSRF attacks
    is_safe, error_msg = _is_url_safe_for_fetch(url)
    if not is_safe:
        logger.warning(f"[fetch_image] SSRF attempt blocked: {url} - {error_msg}")
        return {
            "success": False,
            "message": f"Security error: {error_msg}"
        }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
        
        content_type = response.headers.get('content-type', 'image/png')
        image_data = response.content
        data_url = f"data:{content_type};base64,{base64.b64encode(image_data).decode('utf-8')}"
        
        return {
            "success": True,
            "dataUrl": data_url
        }
        
    except httpx.HTTPStatusError as e:
        logger.error(f"[Fetch Image] HTTP error {e.response.status_code}: {e}")
        return {
            "success": False,
            "message": f"HTTP error {e.response.status_code}: {str(e)}"
        }
    except httpx.RequestError as e:
        logger.error(f"[Fetch Image] Request error: {e}")
        return {
            "success": False,
            "message": f"Request failed: {str(e)}"
        }
    except Exception as e:
        logger.error(f"[Fetch Image] Failed to fetch image: {e}")
        return {
            "success": False,
            "message": f"Failed to fetch image: {str(e)}"
        }


class OpenExplorerRequest(BaseModel):
    """Request to open file explorer to a path."""
    path: str


@app.post("/api/open-explorer")
async def open_file_explorer(request: OpenExplorerRequest) -> dict[str, Any]:
    """Open file explorer/finder to the specified path (selecting the file if it's a file path)."""
    import asyncio
    import subprocess
    import platform
    from pathlib import Path
    
    def _open_sync():
        path = Path(request.path)
        
        # If the path doesn't exist, try the parent directory
        if not path.exists():
            path = path.parent
            if not path.exists():
                return (False, f"Path not found: {request.path}")
        
        system = platform.system()
        
        try:
            if system == "Windows":
                if path.is_file():
                    # Select the file in Explorer
                    subprocess.run(['explorer', '/select,', str(path)], check=False)
                else:
                    # Open the folder
                    subprocess.run(['explorer', str(path)], check=False)
            elif system == "Darwin":  # macOS
                if path.is_file():
                    # Reveal in Finder
                    subprocess.run(['open', '-R', str(path)], check=False)
                else:
                    subprocess.run(['open', str(path)], check=False)
            else:  # Linux
                subprocess.run(['xdg-open', str(path.parent if path.is_file() else path)], check=False)
            
            return (True, f"Opened: {path}")
        except Exception as e:
            return (False, f"Failed to open explorer: {str(e)}")
    
    try:
        success, message = await asyncio.to_thread(_open_sync)
        return {"success": success, "message": message}
    except Exception as e:
        logger.error(f"[Open Explorer] Failed: {e}")
        return {"success": False, "message": f"Failed to open explorer: {str(e)}"}


# =============================================================================
# STATIC FILE SERVING (Docker Deployment)
# =============================================================================

# Serve static frontend files if they exist (for Docker/production deployment)
import os
from pathlib import Path as PathLib

static_dir = PathLib(__file__).parent.parent / "static"
print(f"[STATIC] Checking for static files at: {static_dir}")

if static_dir.exists() and static_dir.is_dir():
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
    
    print(f"[STATIC] Directory found. Contents: {list(static_dir.iterdir())}")
    
    # Serve static assets if assets directory exists
    assets_dir = static_dir / "assets"
    if assets_dir.exists() and assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="static-assets")
        print("[STATIC] Mounted /assets for static file serving")
    else:
        print(f"[STATIC] Warning: Assets directory not found at: {assets_dir}")
    
    # Catch-all route for SPA - serve index.html for any non-API route
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the SPA frontend for any non-API route."""
        # Skip API routes
        if full_path.startswith("api/") or full_path.startswith("templates/"):
            raise HTTPException(status_code=404, detail="Not found")
        
        # Check if it's a static file
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        
        # Default to index.html for SPA routing
        index_path = static_dir / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        
        raise HTTPException(status_code=404, detail="Not found")
    
    print("[STATIC] SPA catch-all route registered")
else:
    print(f"[STATIC] Directory not found at {static_dir} - running in development mode")


# =============================================================================
# RUN SERVER
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
