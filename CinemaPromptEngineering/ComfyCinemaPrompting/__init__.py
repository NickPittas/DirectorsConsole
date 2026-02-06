"""ComfyUI Node Wrapper for Cinema Prompt Engineering."""

import sys
import os
from enum import Enum

# Add current directory to sys.path to allow imports from cinema_rules package
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

class _PlaceholderEnum(Enum):
    UNAVAILABLE = "Unavailable"

# Lazy-imported globals
IMPORT_ERROR = None
_RULES_LOADED = False

RuleEngine = None
LiveActionConfig = None
AnimationConfig = None
PromptGenerator = None

CameraManufacturer = _PlaceholderEnum
CameraBody = _PlaceholderEnum
CameraConfig = None
SensorSize = _PlaceholderEnum
WeightClass = _PlaceholderEnum
LensManufacturer = _PlaceholderEnum
LensFamily = _PlaceholderEnum
LensConfig = None
MovementEquipment = _PlaceholderEnum
MovementType = _PlaceholderEnum
MovementTiming = _PlaceholderEnum
MovementConfig = None
TimeOfDay = _PlaceholderEnum
LightingSource = _PlaceholderEnum
LightingStyle = _PlaceholderEnum
LightingConfig = None

AnimationMedium = _PlaceholderEnum
StyleDomain = _PlaceholderEnum
LineTreatment = _PlaceholderEnum
ColorApplication = _PlaceholderEnum
LightingModel = _PlaceholderEnum
SurfaceDetail = _PlaceholderEnum
MotionStyle = _PlaceholderEnum
VirtualCamera = _PlaceholderEnum
RenderingConfig = None
MotionConfig = None

ShotSize = _PlaceholderEnum
Composition = _PlaceholderEnum
Mood = _PlaceholderEnum
ColorTone = _PlaceholderEnum
VisualGrammar = None


def _load_rules():
    global IMPORT_ERROR, _RULES_LOADED
    global RuleEngine, LiveActionConfig, AnimationConfig, PromptGenerator
    global CameraManufacturer, CameraBody, CameraConfig, SensorSize, WeightClass
    global LensManufacturer, LensFamily, LensConfig
    global MovementEquipment, MovementType, MovementTiming, MovementConfig
    global TimeOfDay, LightingSource, LightingStyle, LightingConfig
    global AnimationMedium, StyleDomain, LineTreatment, ColorApplication
    global LightingModel, SurfaceDetail, MotionStyle, VirtualCamera
    global RenderingConfig, MotionConfig
    global ShotSize, Composition, Mood, ColorTone, VisualGrammar

    if _RULES_LOADED:
        return IMPORT_ERROR is None

    try:
        from cinema_rules import (
            RuleEngine,
            LiveActionConfig,
            AnimationConfig,
        )
        from cinema_rules.prompts import PromptGenerator
        from cinema_rules.schemas.live_action import (
            CameraManufacturer,
            CameraBody,
            CameraConfig,
            SensorSize,
            WeightClass,
            LensManufacturer,
            LensFamily,
            LensConfig,
            MovementEquipment,
            MovementType,
            MovementTiming,
            MovementConfig,
            TimeOfDay,
            LightingSource,
            LightingStyle,
            LightingConfig,
        )
        from cinema_rules.schemas.animation import (
            AnimationMedium,
            StyleDomain,
            LineTreatment,
            ColorApplication,
            LightingModel,
            SurfaceDetail,
            MotionStyle,
            VirtualCamera,
            RenderingConfig,
            MotionConfig,
        )
        from cinema_rules.schemas.common import (
            ShotSize,
            Composition,
            Mood,
            ColorTone,
            VisualGrammar,
        )

        IMPORT_ERROR = None
    except Exception as e:
        IMPORT_ERROR = e
    finally:
        _RULES_LOADED = True

    if IMPORT_ERROR is not None:
        print("[ComfyCinemaPrompting] Import failed:", repr(IMPORT_ERROR))
        return False

    return True


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def enum_values(enum_class):
    """Get list of values from an enum for ComfyUI dropdown."""
    if not _load_rules():
        return ["Unavailable"]
    return [e.value for e in enum_class]


# =============================================================================
# LIVE-ACTION NODE
# =============================================================================

class CinemaPromptLiveAction:
    """
    ComfyUI node for generating live-action cinema prompts.
    
    Provides dropdowns for camera, lens, lighting, movement, and visual grammar
    with built-in validation against professional cinematography rules.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # User Prompt
                "user_prompt": ("STRING", {"multiline": True, "default": "", "placeholder": "Enter your subject here (e.g. 'A futuristic city street at night')..."}),
                
                # Camera
                "camera_manufacturer": (enum_values(CameraManufacturer),),
                "camera_body": (enum_values(CameraBody),),
                
                # Movement
                "movement_equipment": (enum_values(MovementEquipment),),
                "movement_type": (enum_values(MovementType),),
                "movement_timing": (enum_values(MovementTiming),),
                
                # Lighting
                "time_of_day": (enum_values(TimeOfDay),),
                "lighting_source": (enum_values(LightingSource),),
                "lighting_style": (enum_values(LightingStyle),),
                
                # Visual Grammar
                "shot_size": (enum_values(ShotSize),),
                "composition": (enum_values(Composition),),
                "mood": (enum_values(Mood),),
                "color_tone": (enum_values(ColorTone),),
                
                # Target Model
                "target_model": ([
                    "generic", "midjourney", "flux", "sdxl", 
                    "wan2.2", "runway", "pika", "cogvideo", "hunyuan", "mochi", "ltx"
                ],),
            },
            "optional": {
                # Lens (optional for simpler workflows)
                "lens_manufacturer": (enum_values(LensManufacturer),),
                "lens_family": (enum_values(LensFamily),),
                "focal_length_mm": ("INT", {"default": 50, "min": 8, "max": 1200}),
                "is_anamorphic": ("BOOLEAN", {"default": False}),
                
                # Film preset
                "film_preset": ("STRING", {"default": ""}),
                
                # Era constraint
                "era": ("STRING", {"default": ""}),

                # Cached prompts from Visual Editor
                "cached_prompt": ("STRING", {"default": "", "multiline": True}),
                "cached_enhanced_prompt": ("STRING", {"default": "", "multiline": True}),
            },
        }
    
    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("prompt", "enhanced_prompt", "negative_prompt", "validation_status")
    FUNCTION = "generate"
    CATEGORY = "Cinema Prompt Engineering"
    
    def generate(
        self,
        # Required
        user_prompt,
        camera_manufacturer,
        camera_body,
        movement_equipment,
        movement_type,
        movement_timing,
        time_of_day,
        lighting_source,
        lighting_style,
        shot_size,
        composition,
        mood,
        color_tone,
        target_model,
        # Optional
        lens_manufacturer="ARRI",
        lens_family="ARRI_Signature_Prime",
        focal_length_mm=50,
        is_anamorphic=False,
        film_preset="",
        era="",
        cached_prompt="",
        cached_enhanced_prompt="",
    ):
        """Generate a cinema prompt from the configuration."""
        if not _load_rules():
            error = f"Cinema rules import failed: {IMPORT_ERROR}"
            return ("", error, "", "INVALID")

        if False:  # typing guard
            _ = CameraConfig
            _ = LiveActionConfig
            _ = LensConfig
            _ = MovementConfig
            _ = LightingConfig
            _ = VisualGrammar

        # Build configuration - Pydantic v2 accepts dicts for nested models
        config = LiveActionConfig(
            camera=CameraConfig(
                manufacturer=camera_manufacturer,
                body=camera_body,
                sensor=SensorSize.SUPER35,
                weight_class=WeightClass.MEDIUM,
            ),
            lens=LensConfig(
                manufacturer=LensManufacturer(lens_manufacturer),
                family=LensFamily(lens_family),
                focal_length_mm=focal_length_mm,
                is_anamorphic=is_anamorphic,
            ),
            movement=MovementConfig(
                equipment=movement_equipment,
                movement_type=movement_type,
                timing=movement_timing,
            ),
            lighting=LightingConfig(
                time_of_day=time_of_day,
                source=lighting_source,
                style=lighting_style,
            ),
            visual_grammar=VisualGrammar(
                shot_size=shot_size,
                composition=composition,
                mood=mood,
                color_tone=color_tone,
            ),
            film_preset=film_preset if film_preset else None,
            era=era if era else None,
        )
        
        # Validate
        engine = RuleEngine()
        validation = engine.validate_live_action(config)
        
        # Generate prompt
        generator = PromptGenerator(target_model=target_model)
        prompt = generator.generate_live_action_prompt(config)

        if cached_prompt:
            prompt = cached_prompt

        if False:  # placeholder to satisfy type checker in environments without rules
            _ = SensorSize.SUPER35
            _ = WeightClass.MEDIUM
        
        # Combine user prompt with generated style prompt
        if user_prompt.strip():
            final_prompt = f"{user_prompt}, {prompt}"
        else:
            final_prompt = prompt
            
        negative_prompt = generator.get_negative_prompt() or ""
        
        # Enhanced prompt - Try to use LLM via backend server
        try:
            import aiohttp
            import asyncio
            import os
            
            # Backend server URL (same as in api_routes.py)
            BACKEND_URL = os.environ.get("CINEMA_BACKEND_URL", "http://localhost:8000")
            
            # Helper to run async in sync context
            def run_async(coro):
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        # Run in a separate thread to avoid nested loop errors
                        import threading
                        result_container = {"result": None, "error": None}

                        def _runner():
                            try:
                                result_container["result"] = asyncio.run(coro)
                            except Exception as e:
                                result_container["error"] = e

                        t = threading.Thread(target=_runner, daemon=True)
                        t.start()
                        t.join()
                        if result_container["error"]:
                            raise result_container["error"]
                        return result_container["result"]
                    return loop.run_until_complete(coro)
                except RuntimeError:
                    return asyncio.run(coro)

            async def enhance_via_backend():
                """Call the backend server to enhance the prompt."""
                async with aiohttp.ClientSession() as session:
                    # First, get settings to know the active provider/model
                    async with session.get(f"{BACKEND_URL}/settings", timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        if resp.status != 200:
                            return None, "Backend server not running. Please start: python -m api.main"
                        settings = await resp.json()
                    
                    active_provider = settings.get("active_provider")
                    selected_model = settings.get("selected_model")
                    
                    if not active_provider:
                        return None, "No LLM provider configured. Open http://localhost:8000 to set up."
                    if not selected_model:
                        return None, "No model selected. Open http://localhost:8000 to configure."
                    
                    # Get credentials for the active provider
                    async with session.get(f"{BACKEND_URL}/credentials/{active_provider}", timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        if resp.status == 404:
                            return None, f"Credentials not found for {active_provider}. Open http://localhost:8000 to authenticate."
                        if resp.status != 200:
                            text = await resp.text()
                            return None, f"Failed to get credentials: {text}"
                        creds_data = await resp.json()
                    
                    # Build the enhance-prompt request
                    request_data = {
                        "user_prompt": final_prompt,
                        "config": config.model_dump(),
                        "project_type": "live_action",
                        "target_model": target_model,
                        "llm_provider": active_provider,
                        "llm_model": selected_model,
                        "credentials": {
                            "api_key": creds_data.get("api_key"),
                            "endpoint": creds_data.get("endpoint"),
                            "oauth_token": creds_data.get("oauth_token"),
                        }
                    }
                    
                    # Call enhance-prompt
                    async with session.post(
                        f"{BACKEND_URL}/enhance-prompt",
                        json=request_data,
                        timeout=aiohttp.ClientTimeout(total=60)
                    ) as resp:
                        result = await resp.json()
                        
                        if result.get("success"):
                            return result.get("enhanced_prompt"), None
                        else:
                            error = result.get("error", "Unknown error")
                            guidance = result.get("guidance", "")
                            # Add user-friendly guidance for auth errors
                            if any(word in error.lower() for word in ["token", "auth", "expired", "invalid"]):
                                guidance = "Authentication expired. Please re-authenticate at http://localhost:8000"
                            return None, f"{error}. {guidance}".strip()
            
            if cached_enhanced_prompt:
                enhanced_prompt = cached_enhanced_prompt
            else:
                enhanced, error = run_async(enhance_via_backend())
                if enhanced:
                    enhanced_prompt = enhanced
                else:
                    enhanced_prompt = f"{final_prompt} [Enhancement Error: {error}]"
                
        except ImportError:
            enhanced_prompt = f"{final_prompt} [Enhancement Unavailable: aiohttp not installed]"
        except Exception as e:
            error_msg = str(e)
            # Provide user-friendly guidance
            if "Cannot connect" in error_msg or "Connection refused" in error_msg:
                guidance = "Backend server not running. Start it with: python -m api.main"
            else:
                guidance = "Open http://localhost:8000 to check configuration."
            enhanced_prompt = f"{final_prompt} [Enhancement Failed: {error_msg}. {guidance}]"
        
        # Build validation status string
        if validation.status == "invalid":
            status = f"INVALID: {validation.messages[0].message}"
        elif validation.status == "warning":
            warnings = [m.message for m in validation.messages if m.severity.value == "warning"]
            status = f"WARNING: {'; '.join(warnings)}"
        else:
            status = "VALID"
        
        return (final_prompt, enhanced_prompt, negative_prompt, status)


# =============================================================================
# ANIMATION NODE
# =============================================================================

class CinemaPromptAnimation:
    """
    ComfyUI node for generating animation prompts.
    
    Provides dropdowns for animation medium, style domain, rendering,
    motion, and visual grammar with built-in validation.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # User Prompt
                "user_prompt": ("STRING", {"multiline": True, "default": "", "placeholder": "Enter your subject here..."}),

                # Style
                "medium": (enum_values(AnimationMedium),),
                "style_domain": (enum_values(StyleDomain),),
                
                # Rendering
                "line_treatment": (enum_values(LineTreatment),),
                "color_application": (enum_values(ColorApplication),),
                "lighting_model": (enum_values(LightingModel),),
                "surface_detail": (enum_values(SurfaceDetail),),
                
                # Motion
                "motion_style": (enum_values(MotionStyle),),
                "virtual_camera": (enum_values(VirtualCamera),),
                
                # Visual Grammar
                "shot_size": (enum_values(ShotSize),),
                "composition": (enum_values(Composition),),
                "mood": (enum_values(Mood),),
                "color_tone": (enum_values(ColorTone),),
                
                # Target Model
                "target_model": ([
                    "generic", "midjourney", "flux", "sdxl", 
                    "wan2.2", "runway", "pika", "cogvideo", "hunyuan"
                ],),
            },
            "optional": {
                # Style preset
                "style_preset": ("STRING", {"default": ""}),
                # Cached prompts from Visual Editor
                "cached_prompt": ("STRING", {"default": "", "multiline": True}),
                "cached_enhanced_prompt": ("STRING", {"default": "", "multiline": True}),
            },
        }
    
    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("prompt", "enhanced_prompt", "negative_prompt", "validation_status")
    FUNCTION = "generate"
    CATEGORY = "Cinema Prompt Engineering"
    
    def generate(
        self,
        # Required
        user_prompt,
        medium,
        style_domain,
        line_treatment,
        color_application,
        lighting_model,
        surface_detail,
        motion_style,
        virtual_camera,
        shot_size,
        composition,
        mood,
        color_tone,
        target_model,
        # Optional
        style_preset="",
        cached_prompt="",
        cached_enhanced_prompt="",
    ):
        """Generate an animation prompt from the configuration."""
        
        # Build configuration
        config = AnimationConfig(
            medium=medium,
            style_domain=style_domain,
            rendering=RenderingConfig(
                line_treatment=line_treatment,
                color_application=color_application,
                lighting_model=lighting_model,
                surface_detail=surface_detail,
            ),
            motion=MotionConfig(
                motion_style=motion_style,
                virtual_camera=virtual_camera,
            ),
            visual_grammar=VisualGrammar(
                shot_size=shot_size,
                composition=composition,
                mood=mood,
                color_tone=color_tone,
            ),
            style_preset=style_preset if style_preset else None,
        )
        
        # Validate
        engine = RuleEngine()
        validation = engine.validate_animation(config)
        
        # Generate prompt
        generator = PromptGenerator(target_model=target_model)
        prompt = generator.generate_animation_prompt(config)

        if cached_prompt:
            prompt = cached_prompt
        
        # Combine user prompt with generated style prompt
        if user_prompt.strip():
            final_prompt = f"{user_prompt}, {prompt}"
        else:
            final_prompt = prompt

        negative_prompt = generator.get_negative_prompt() or ""
        
        # Enhanced prompt - Try to use LLM via backend server
        try:
            import aiohttp
            import asyncio
            import os
            
            # Backend server URL (same as in api_routes.py)
            BACKEND_URL = os.environ.get("CINEMA_BACKEND_URL", "http://localhost:8000")
            
            # Helper to run async in sync context
            def run_async(coro):
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        # Run in a separate thread to avoid nested loop errors
                        import threading
                        result_container = {"result": None, "error": None}

                        def _runner():
                            try:
                                result_container["result"] = asyncio.run(coro)
                            except Exception as e:
                                result_container["error"] = e

                        t = threading.Thread(target=_runner, daemon=True)
                        t.start()
                        t.join()
                        if result_container["error"]:
                            raise result_container["error"]
                        return result_container["result"]
                    return loop.run_until_complete(coro)
                except RuntimeError:
                    return asyncio.run(coro)

            async def enhance_via_backend():
                """Call the backend server to enhance the prompt."""
                async with aiohttp.ClientSession() as session:
                    # First, get settings to know the active provider/model
                    async with session.get(f"{BACKEND_URL}/settings", timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        if resp.status != 200:
                            return None, "Backend server not running. Please start: python -m api.main"
                        settings = await resp.json()
                    
                    active_provider = settings.get("active_provider")
                    selected_model = settings.get("selected_model")
                    
                    if not active_provider:
                        return None, "No LLM provider configured. Open http://localhost:8000 to set up."
                    if not selected_model:
                        return None, "No model selected. Open http://localhost:8000 to configure."
                    
                    # Get credentials for the active provider
                    async with session.get(f"{BACKEND_URL}/credentials/{active_provider}", timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        if resp.status == 404:
                            return None, f"Credentials not found for {active_provider}. Open http://localhost:8000 to authenticate."
                        if resp.status != 200:
                            text = await resp.text()
                            return None, f"Failed to get credentials: {text}"
                        creds_data = await resp.json()
                    
                    # Build the enhance-prompt request
                    request_data = {
                        "user_prompt": final_prompt,
                        "config": config.model_dump(),
                        "project_type": "animation",
                        "target_model": target_model,
                        "llm_provider": active_provider,
                        "llm_model": selected_model,
                        "credentials": {
                            "api_key": creds_data.get("api_key"),
                            "endpoint": creds_data.get("endpoint"),
                            "oauth_token": creds_data.get("oauth_token"),
                        }
                    }
                    
                    # Call enhance-prompt
                    async with session.post(
                        f"{BACKEND_URL}/enhance-prompt",
                        json=request_data,
                        timeout=aiohttp.ClientTimeout(total=60)
                    ) as resp:
                        result = await resp.json()
                        
                        if result.get("success"):
                            return result.get("enhanced_prompt"), None
                        else:
                            error = result.get("error", "Unknown error")
                            guidance = result.get("guidance", "")
                            # Add user-friendly guidance for auth errors
                            if any(word in error.lower() for word in ["token", "auth", "expired", "invalid"]):
                                guidance = "Authentication expired. Please re-authenticate at http://localhost:8000"
                            return None, f"{error}. {guidance}".strip()
            
            if cached_enhanced_prompt:
                enhanced_prompt = cached_enhanced_prompt
            else:
                enhanced, error = run_async(enhance_via_backend())
                if enhanced:
                    enhanced_prompt = enhanced
                else:
                    enhanced_prompt = f"{final_prompt} [Enhancement Error: {error}]"
                
        except ImportError:
            enhanced_prompt = f"{final_prompt} [Enhancement Unavailable: aiohttp not installed]"
        except Exception as e:
            error_msg = str(e)
            # Provide user-friendly guidance
            if "Cannot connect" in error_msg or "Connection refused" in error_msg:
                guidance = "Backend server not running. Start it with: python -m api.main"
            else:
                guidance = "Open http://localhost:8000 to check configuration."
            enhanced_prompt = f"{final_prompt} [Enhancement Failed: {error_msg}. {guidance}]"
        
        # Build validation status string
        if validation.status == "invalid":
            status = f"INVALID: {validation.messages[0].message}"
        elif validation.status == "warning":
            warnings = [m.message for m in validation.messages if m.severity.value == "warning"]
            status = f"WARNING: {'; '.join(warnings)}"
        else:
            status = "VALID"
        
        return (final_prompt, enhanced_prompt, negative_prompt, status)


# =============================================================================
# NODE REGISTRATION
# =============================================================================

if IMPORT_ERROR is None:
    NODE_CLASS_MAPPINGS = {
        "ComfyCinemaPromptingLive": CinemaPromptLiveAction,
        "ComfyCinemaPromptingAnim": CinemaPromptAnimation,
    }

    NODE_DISPLAY_NAME_MAPPINGS = {
        "ComfyCinemaPromptingLive": "ComfyCinemaPrompting (Live-Action)",
        "ComfyCinemaPromptingAnim": "ComfyCinemaPrompting (Animation)",
    }
else:
    # If imports failed, keep ComfyUI alive and surface the error in logs.
    print("[ComfyCinemaPrompting] Import failed:", repr(IMPORT_ERROR))
    NODE_CLASS_MAPPINGS = {}
    NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./js"
