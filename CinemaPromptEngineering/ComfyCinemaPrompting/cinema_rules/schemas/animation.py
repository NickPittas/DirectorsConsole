"""Animation schemas - styles, rendering, virtual camera."""

from enum import Enum

from pydantic import BaseModel, Field

from cinema_rules.schemas.common import VisualGrammar


# =============================================================================
# ANIMATION DOMAIN & MEDIUM
# =============================================================================

class AnimationMedium(str, Enum):
    """Animation production medium."""
    TWO_D = "2D"
    THREE_D = "3D"
    HYBRID = "Hybrid"
    STOP_MOTION = "StopMotion"


class StyleDomain(str, Enum):
    """Animation style domain."""
    ANIME = "Anime"
    MANGA = "Manga"
    THREE_D = "ThreeD"
    ILLUSTRATION = "Illustration"
    WESTERN_ANIMATION = "Western_Animation"
    GRAPHIC_NOVEL = "Graphic_Novel"
    PAINTERLY = "Painterly"
    CONCEPT_ART = "Concept_Art"


# =============================================================================
# RENDERING SYSTEM
# =============================================================================

class LineTreatment(str, Enum):
    """Line art treatment style."""
    CLEAN = "Clean"             # Sharp, consistent weight
    VARIABLE = "Variable"       # Variable line weight
    INKED = "Inked"            # Hand-inked appearance
    SKETCHY = "Sketchy"        # Rough, sketch-like
    NONE = "None"              # No visible linework (3D, painterly)


class ColorApplication(str, Enum):
    """Color application method."""
    FLAT = "Flat"              # Solid colors, no gradients
    CEL = "Cel"                # Traditional cel shading
    SOFT = "Soft"              # Soft gradients (airbrush feel)
    PAINTERLY = "Painterly"    # Painterly, textured
    MONOCHROME = "Monochrome"  # Black and white
    MONOCHROME_INK = "Monochrome_Ink"  # B&W with ink washes (manga)
    LIMITED = "Limited"        # Limited color palette
    FULL = "Full"              # Full color range


class LightingModel(str, Enum):
    """Animation lighting approach."""
    SYMBOLIC = "Symbolic"              # Abstract, non-realistic
    GRAPHIC = "Graphic"               # Flat, graphic shadows
    GRAPHIC_LIGHT = "Graphic_Light"
    NATURALISTIC_SIMULATED = "Naturalistic_Simulated"  # Mimics real light
    STYLIZED_RIM = "Stylized_Rim"     # Heavy rim/edge lighting
    GLOW = "Glow"                     # Bloom and glow effects
    GLOW_EMISSION = "Glow_Emission"
    MINIMAL = "Minimal"               # Almost no lighting variation
    FLAT_LIGHT = "Flat_Light"
    DRAMATIC = "Dramatic"             # High contrast, theatrical


class SurfaceDetail(str, Enum):
    """Surface/texture rendering detail."""
    FLAT = "Flat"              # No texture, pure color
    PAINTERLY = "Painterly"    # Painted texture
    SMOOTH = "Smooth"          # Smooth 3D render
    PHOTOREAL = "Photoreal"    # Photorealistic textures
    TEXTURED = "Textured"      # Visible texture detail
    HATCHED = "Hatched"        # Cross-hatching (manga)


class RenderingConfig(BaseModel):
    """Rendering style configuration."""
    line_treatment: LineTreatment = LineTreatment.CLEAN
    color_application: ColorApplication = ColorApplication.CEL
    lighting_model: LightingModel = LightingModel.NATURALISTIC_SIMULATED
    surface_detail: SurfaceDetail = SurfaceDetail.SMOOTH


# =============================================================================
# MOTION SYSTEM
# =============================================================================

class MotionStyle(str, Enum):
    """Animation motion style."""
    NONE = "None"              # Static (illustration)
    LIMITED = "Limited"        # Limited animation (anime, low budget)
    FULL = "Full"              # Full animation (Disney, Ghibli)
    EXAGGERATED = "Exaggerated"  # Squash & stretch, cartoon physics
    SNAPPY = "Snappy"          # Quick, snappy timing
    FLUID = "Fluid"            # Smooth, fluid movement
    ROTOSCOPED = "Rotoscoped"  # Traced from live action


class VirtualCamera(str, Enum):
    """Virtual camera behavior."""
    LOCKED = "Locked"          # Fixed frame (manga, illustration)
    DIGITAL_PAN = "Digital_Pan"       # 2D camera pan
    DIGITAL_ZOOM = "Digital_Zoom"     # 2D camera zoom
    PARALLAX = "Parallax"      # Multi-plane parallax
    FREE_3D = "Free_3D"        # Full 3D camera (3D animation)
    SIMULATED_HANDHELD = "Simulated_Handheld"  # Fake shake
    MOTION_COMIC = "Motion_Comic"     # Panel-to-panel transitions


class MotionConfig(BaseModel):
    """Motion and virtual camera configuration."""
    motion_style: MotionStyle = MotionStyle.FULL
    virtual_camera: VirtualCamera = VirtualCamera.DIGITAL_PAN


# =============================================================================
# ANIMATION PRESETS
# =============================================================================

class AnimePreset(str, Enum):
    """Pre-defined anime style presets."""
    STUDIO_GHIBLI = "Studio_Ghibli"
    AKIRA = "Akira"
    GHOST_IN_THE_SHELL = "Ghost_in_the_Shell"
    EVANGELION = "Evangelion"
    MAKOTO_SHINKAI = "Makoto_Shinkai"
    KYOTO_ANIMATION = "Kyoto_Animation"
    MAPPA = "MAPPA"
    WIT_STUDIO = "Wit_Studio"
    UFOTABLE = "Ufotable"
    TRIGGER = "Trigger"
    GAINAX = "Gainax"


class MangaPreset(str, Enum):
    """Pre-defined manga style presets."""
    SHONEN = "Shonen"
    DARK_SEINEN = "Dark_Seinen"
    SHOJO = "Shojo"
    JOSEI = "Josei"
    HORROR_MANGA = "Horror_Manga"


class ThreeDPreset(str, Enum):
    """Pre-defined 3D animation style presets."""
    PIXAR = "Pixar"
    DREAMWORKS = "Dreamworks"
    DISNEY_3D = "Disney_3D"
    ARCANE = "Arcane"
    SPIDER_VERSE = "Spider_Verse"
    UNREAL_CINEMATIC = "Unreal_Cinematic"
    BLENDER_STYLIZED = "Blender_Stylized"


class IllustrationPreset(str, Enum):
    """Pre-defined illustration style presets."""
    CONCEPT_ART = "Concept_Art"
    EDITORIAL = "Editorial"
    BOOK_ILLUSTRATION = "Book_Illustration"
    COMIC_WESTERN = "Comic_Western"
    GRAPHIC_NOVEL = "Graphic_Novel"


# =============================================================================
# ANIMATION CONFIG (Complete)
# =============================================================================

class AnimationConfig(BaseModel):
    """Complete Animation configuration."""
    medium: AnimationMedium = AnimationMedium.TWO_D
    style_domain: StyleDomain = StyleDomain.ANIME
    rendering: RenderingConfig = Field(default_factory=RenderingConfig)
    motion: MotionConfig = Field(default_factory=MotionConfig)
    visual_grammar: VisualGrammar = Field(default_factory=VisualGrammar)
    
    # Style preset (domain-specific)
    style_preset: str | None = Field(
        default=None,
        description="Style preset ID (e.g., 'Studio_Ghibli', 'Pixar', 'Shonen')"
    )
