"""Prompt generator - converts configurations to AI model prompts."""

from cinema_rules.schemas.live_action import (
    LiveActionConfig,
    CameraType,
    FilmStock,
    AspectRatio,
)
from cinema_rules.schemas.animation import AnimationConfig
from cinema_rules.presets import LIVE_ACTION_PRESETS


class PromptGenerator:
    """Generates prompts for various AI image/video generation models."""
    
    def __init__(self, target_model: str = "generic"):
        """
        Initialize the prompt generator.
        
        Args:
            target_model: Target AI model (e.g., 'midjourney', 'flux', 'wan2.2', 'runway')
        """
        self.target_model = target_model.lower()
    
    def generate_live_action_prompt(self, config: LiveActionConfig) -> str:
        """Generate a prompt from a live-action configuration."""
        parts: list[str] = []
        
        # Shot composition
        parts.append(f"{config.visual_grammar.shot_size.value} shot")
        parts.append(f"{config.visual_grammar.composition.value.replace('_', ' ')} composition")
        
        # Camera & lens
        camera_desc = f"shot on {config.camera.manufacturer.value} {config.camera.body.value}"
        parts.append(camera_desc)
        
        # Add film stock for film cameras
        if config.camera.film_stock and config.camera.film_stock != FilmStock.NONE:
            film_stock_name = config.camera.film_stock.value.replace('_', ' ')
            parts.append(f"{film_stock_name} film stock")
        
        # Lens details
        parts.append(f"{config.lens.focal_length_mm}mm lens")
        if config.lens.is_anamorphic:
            parts.append("anamorphic")
        
        # Aspect ratio
        if config.camera.aspect_ratio:
            parts.append(f"{config.camera.aspect_ratio.value} aspect ratio")
        
        # Lighting
        parts.append(f"{config.lighting.time_of_day.value.replace('_', ' ')} lighting")
        parts.append(f"{config.lighting.source.value.replace('_', ' ')} light source")
        parts.append(f"{config.lighting.style.value.replace('_', ' ')} lighting style")
        
        # Movement (if not static)
        if config.movement.equipment.value != "Static":
            parts.append(f"{config.movement.equipment.value.replace('_', ' ')} camera")
            if config.movement.movement_type.value != "Static":
                parts.append(f"{config.movement.movement_type.value.replace('_', ' ')} movement")
        
        # Mood & color
        parts.append(f"{config.visual_grammar.mood.value.replace('_', ' ')} mood")
        parts.append(f"{config.visual_grammar.color_tone.value.replace('_', ' ')} color grade")
        
        # Film preset - enhanced with technical details
        if config.film_preset:
            preset = LIVE_ACTION_PRESETS.get(config.film_preset)
            if preset:
                parts.append(f"in the style of {preset.name}")
                # Add era context
                parts.append(f"{preset.era} era cinematography")
            else:
                parts.append(f"in the style of {config.film_preset.replace('_', ' ')}")
        
        # Apply model-specific formatting
        return self._format_for_model(parts)
    
    def generate_live_action_prompt_detailed(self, config: LiveActionConfig) -> str:
        """Generate a highly detailed prompt with full technical specifications."""
        parts: list[str] = []
        
        # Film preset enhanced details
        preset = None
        if config.film_preset:
            preset = LIVE_ACTION_PRESETS.get(config.film_preset)
        
        # Opening with style reference
        if preset:
            parts.append(f"Cinematic image in the visual style of {preset.name} ({preset.year})")
        
        # Camera system
        if config.camera.camera_type == CameraType.FILM:
            camera_type = "film camera"
        else:
            camera_type = "digital cinema camera"
        parts.append(f"Shot on {config.camera.manufacturer.value} {config.camera.body.value} {camera_type}")
        
        # Film stock (for film cameras)
        if config.camera.film_stock and config.camera.film_stock != FilmStock.NONE:
            stock = config.camera.film_stock.value.replace('_', ' ')
            parts.append(f"using {stock} film stock")
        
        # Lens system with preset reference
        lens_desc = f"{config.lens.focal_length_mm}mm {config.lens.family.value.replace('_', ' ')} lens"
        if config.lens.is_anamorphic:
            lens_desc += f" ({config.lens.squeeze_ratio or 2.0}x anamorphic)"
        parts.append(lens_desc)
        
        # Aspect ratio
        if config.camera.aspect_ratio:
            parts.append(f"{config.camera.aspect_ratio.value} aspect ratio")
        
        # Shot and composition
        parts.append(f"{config.visual_grammar.shot_size.value.replace('_', ' ')} shot")
        parts.append(f"{config.visual_grammar.composition.value.replace('_', ' ')} composition")
        
        # Lighting system
        lighting_desc = (
            f"{config.lighting.time_of_day.value.replace('_', ' ')} lighting, "
            f"{config.lighting.source.value.replace('_', ' ')} as key light, "
            f"{config.lighting.style.value.replace('_', ' ')} style"
        )
        parts.append(lighting_desc)
        
        # Camera movement
        if config.movement.equipment.value != "Static":
            movement_desc = f"{config.movement.equipment.value.replace('_', ' ')} camera"
            if config.movement.movement_type.value != "Static":
                movement_desc += f" with {config.movement.movement_type.value.replace('_', ' ')} movement"
            if config.movement.timing.value != "Static":
                movement_desc += f" at {config.movement.timing.value.replace('_', ' ')} pace"
            parts.append(movement_desc)
        else:
            parts.append("static camera, locked-off frame")
        
        # Mood and color
        parts.append(f"{config.visual_grammar.mood.value.replace('_', ' ')} mood and atmosphere")
        parts.append(f"{config.visual_grammar.color_tone.value.replace('_', ' ')} color grading")
        
        # Era context
        if preset:
            parts.append(f"{preset.era} era cinematography aesthetic")
        elif config.era:
            parts.append(f"{config.era} era cinematography aesthetic")
        
        return self._format_for_model(parts)
    
    def generate_animation_prompt(self, config: AnimationConfig) -> str:
        """Generate a prompt from an animation configuration."""
        parts: list[str] = []
        
        # Style domain and medium
        parts.append(f"{config.style_domain.value} style")
        parts.append(f"{config.medium.value} animation")
        
        # Rendering
        parts.append(f"{config.rendering.line_treatment.value.replace('_', ' ')} linework")
        parts.append(f"{config.rendering.color_application.value.replace('_', ' ')} coloring")
        parts.append(f"{config.rendering.lighting_model.value.replace('_', ' ')} lighting")
        parts.append(f"{config.rendering.surface_detail.value.replace('_', ' ')} surfaces")
        
        # Shot composition
        parts.append(f"{config.visual_grammar.shot_size.value} shot")
        parts.append(f"{config.visual_grammar.composition.value.replace('_', ' ')} composition")
        
        # Motion (if applicable)
        if config.motion.motion_style.value != "None":
            parts.append(f"{config.motion.motion_style.value.replace('_', ' ')} animation")
            parts.append(f"{config.motion.virtual_camera.value.replace('_', ' ')} camera")
        
        # Mood & color
        parts.append(f"{config.visual_grammar.mood.value.replace('_', ' ')} mood")
        parts.append(f"{config.visual_grammar.color_tone.value.replace('_', ' ')} color palette")
        
        # Style preset
        if config.style_preset:
            parts.append(f"in the style of {config.style_preset.replace('_', ' ')}")
        
        return self._format_for_model(parts)
    
    def _format_for_model(self, parts: list[str]) -> str:
        """Apply model-specific formatting to the prompt parts."""
        
        if self.target_model == "midjourney":
            # Midjourney: comma-separated, add quality params
            return ", ".join(parts) + " --v 6 --q 2"
        
        elif self.target_model == "flux":
            # FLUX: No negative prompts, natural language preferred
            # HEX colors work well, 30-80 words optimal
            return ". ".join(p.capitalize() for p in parts) + "."
        
        elif self.target_model in ("wan", "wan2", "wan2.2"):
            # Wan 2.2: 80-120 words, over-specify everything
            # MoE architecture benefits from detail
            prompt = ". ".join(p.capitalize() for p in parts)
            # Pad with detail if too short
            return prompt + ". Cinematic quality, professional lighting, highly detailed."
        
        elif self.target_model == "runway":
            # Runway Gen-3: Natural language, descriptive
            return " ".join(p.lower() for p in parts)
        
        elif self.target_model == "pika":
            # Pika: Similar to Runway, natural descriptions
            return " ".join(p.lower() for p in parts)
        
        elif self.target_model == "cogvideo":
            # CogVideoX: English only, 224 token limit
            # Keep it concise
            return ", ".join(parts[:15])  # Limit parts
        
        elif self.target_model == "hunyuan":
            # HunyuanVideo: Has prompt rewrite, can be detailed
            return ". ".join(p.capitalize() for p in parts) + "."
        
        elif self.target_model == "mochi":
            # Mochi: 480p, 75 steps, CFG 4.5-7
            return ", ".join(parts)
        
        elif self.target_model == "ltx":
            # LTX-2: 200 word limit, audio support
            return " ".join(p.lower() for p in parts)
        
        elif self.target_model == "sdxl":
            # SDXL: Comma-separated keywords, weighted tokens work
            return ", ".join(parts)
        
        else:
            # Generic: Comma-separated
            return ", ".join(parts)
    
    def get_negative_prompt(self) -> str | None:
        """Get the negative prompt for the target model, if applicable."""
        
        # Models that don't support/need negative prompts
        no_negative = {"flux", "flux2", "wan", "wan2", "wan2.2"}
        if self.target_model in no_negative:
            return None
        
        # Standard negative prompt for other models
        return (
            "blurry, low quality, distorted, deformed, ugly, bad anatomy, "
            "watermark, signature, text, logo, amateur, poorly lit"
        )
