"""Common schemas shared between Live-Action and Animation modes."""

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


# =============================================================================
# ENUMS - Shared across both systems
# =============================================================================

class ShotSize(str, Enum):
    """Shot sizes - shared between Live-Action and Animation."""
    EWS = "EWS"      # Extreme Wide Shot
    WS = "WS"        # Wide Shot
    MWS = "MWS"      # Medium Wide Shot
    MS = "MS"        # Medium Shot
    MCU = "MCU"      # Medium Close-Up
    CU = "CU"        # Close-Up
    BCU = "BCU"      # Big Close-Up
    ECU = "ECU"      # Extreme Close-Up
    OTS = "OTS"      # Over The Shoulder
    POV = "POV"      # Point of View
    AMERICAN = "American"  # Cowboy shot (mid-thigh up)
    ITALIAN = "Italian"    # Extreme close on eyes


class Composition(str, Enum):
    """Composition techniques - shared between Live-Action and Animation."""
    RULE_OF_THIRDS = "Rule_of_Thirds"
    CENTERED = "Centered"
    SYMMETRICAL = "Symmetrical"
    ASYMMETRICAL = "Asymmetrical"
    NEGATIVE_SPACE = "Negative_Space"
    LEADING_LINES = "Leading_Lines"
    FRAME_WITHIN_FRAME = "Frame_Within_Frame"
    DIAGONAL = "Diagonal"
    GOLDEN_RATIO = "Golden_Ratio"
    GOLDEN_SPIRAL = "Golden_Spiral"
    DYNAMIC_SYMMETRY = "Dynamic_Symmetry"
    RADIAL_BALANCE = "Radial_Balance"
    HEADROOM = "Headroom"
    LEAD_ROOM = "Lead_Room"
    FILL_THE_FRAME = "Fill_The_Frame"
    DEPTH_LAYERING = "Depth_Layering"
    ABSTRACT = "Abstract"
    ACTION_LINES = "Action_Lines"
    AGGRESSIVE_CLOSEUPS = "Aggressive_Closeups"
    ARCHITECTURAL = "Architectural"
    ARCHITECTURAL_SYMMETRY = "Architectural_Symmetry"
    CENTERED_ACTION = "Centered_Action"
    CINEMATIC = "Cinematic"
    CLASSIC_COMPOSITION = "Classic_Composition"
    CLAUSTROPHOBIC = "Claustrophobic"
    COMIC_PANELS = "Comic_Panels"
    CONSTRAINED_FRAMING = "Constrained_Framing"
    DECORATIVE = "Decorative"
    DEEP_FOCUS = "Deep_Focus"
    DISORIENTING_FRAMING = "Disorienting_Framing"
    DISRUPTIVE = "Disruptive"
    DOCUMENTARY_STYLE = "Documentary_Style"
    DRAMATIC_ANGLES = "Dramatic_Angles"
    DYNAMIC = "Dynamic"
    DYNAMIC_BLOCKING = "Dynamic_Blocking"
    DYNAMIC_FRAMING = "Dynamic_Framing"
    EXTREME_CLOSE_UP = "Extreme_Close_Up"
    GEOMETRIC = "Geometric"
    HANDHELD_FRAMES = "Handheld_Frames"
    HIGH_CONTRAST = "High_Contrast"
    ICONIC_SILHOUETTES = "Iconic_Silhouettes"
    IMPROVISED = "Improvised"
    INDUSTRIAL_FRAMES = "Industrial_Frames"
    INTIMATE = "Intimate"
    INTIMATE_FRAMING = "Intimate_Framing"
    LOW_ANGLE = "Low_Angle"
    MINIMALIST = "Minimalist"
    OBSERVATIONAL = "Observational"
    ORGANIC = "Organic"
    ORGANIC_FRAMING = "Organic_Framing"
    ORGANIC_WIDE_FRAMES = "Organic_Wide_Frames"
    OVERDESIGNED_FRAMES = "Overdesigned_Frames"
    POV_FRAMING = "POV_Framing"
    PAINTERLY = "Painterly"
    PLAYFUL_FRAMING = "Playful_Framing"
    POETIC = "Poetic"
    ROUGH_FRAMING = "Rough_Framing"
    SCALE_EMPHASIS = "Scale_Emphasis"
    STATIC = "Static"
    STORYBOOK = "Storybook"
    STREET_LEVEL = "Street_Level"
    URBAN = "Urban"
    VENETIAN_BLINDS = "Venetian_Blinds"
    WIDE_ANGLE_CENTERED = "Wide_Angle_Centered"
    WIDE_FRAMES = "Wide_Frames"
    WIDE_STATIC_FRAMES = "Wide_Static_Frames"
    WIDE_SYMMETRICAL = "Wide_Symmetrical"


class Mood(str, Enum):
    """Emotional mood/tone - shared between Live-Action and Animation."""
    # Positive
    CHEERFUL = "Cheerful"
    HOPEFUL = "Hopeful"
    WHIMSICAL = "Whimsical"
    ROMANTIC = "Romantic"
    EUPHORIC = "Euphoric"
    SERENE = "Serene"
    PLAYFUL = "Playful"
    TRIUMPHANT = "Triumphant"
    NOSTALGIC = "Nostalgic"
    TENDER = "Tender"
    ADVENTUROUS = "Adventurous"
    BOLD = "Bold"
    ENERGETIC = "Energetic"
    
    # Neutral/Complex
    CONTEMPLATIVE = "Contemplative"
    MELANCHOLIC = "Melancholic"
    BITTERSWEET = "Bittersweet"
    MYSTERIOUS = "Mysterious"
    SURREAL = "Surreal"
    DREAMLIKE = "Dreamlike"
    ETHEREAL = "Ethereal"
    INTROSPECTIVE = "Introspective"
    AMBIGUOUS = "Ambiguous"
    DETACHED = "Detached"
    ATMOSPHERIC = "Atmospheric"
    CINEMATIC = "Cinematic"
    CONCEPTUAL = "Conceptual"
    EMOTIONAL = "Emotional"
    PHILOSOPHICAL = "Philosophical"
    REALISTIC = "Realistic"
    SATIRICAL = "Satirical"
    SOMBER = "Somber"
    STYLIZED = "Stylized"
    TACTILE = "Tactile"
    
    # Tension/Dark
    TENSE = "Tense"
    SUSPENSEFUL = "Suspenseful"
    ANXIOUS = "Anxious"
    PARANOID = "Paranoid"
    CLAUSTROPHOBIC = "Claustrophobic"
    OMINOUS = "Ominous"
    MENACING = "Menacing"
    DREAD = "Dread"
    FOREBODING = "Foreboding"
    UNEASY = "Uneasy"
    SUSPICIOUS = "Suspicious"
    UNSETTLING = "Unsettling"
    
    # Dark/Negative
    GLOOMY = "Gloomy"
    TRAGIC = "Tragic"
    DESPAIRING = "Despairing"
    LONELY = "Lonely"
    DESOLATE = "Desolate"
    HAUNTING = "Haunting"
    EERIE = "Eerie"
    OPPRESSIVE = "Oppressive"
    NIHILISTIC = "Nihilistic"
    BLEAK = "Bleak"
    DARK = "Dark"
    
    # Intense/Action
    AGGRESSIVE = "Aggressive"
    CHAOTIC = "Chaotic"
    FRANTIC = "Frantic"
    INTENSE = "Intense"
    URGENT = "Urgent"
    EXPLOSIVE = "Explosive"
    ANGRY = "Angry"
    BRUTAL = "Brutal"
    DRAMATIC = "Dramatic"
    GRITTY = "Gritty"
    PSYCHOLOGICAL = "Psychological"
    
    # Special
    EROTIC = "Erotic"
    NOIR = "Noir"
    GOTHIC = "Gothic"
    DOCUMENTARY = "Documentary"
    EPIC = "Epic"
    INTIMATE = "Intimate"
    ABSURD = "Absurd"
    ALIENATED = "Alienated"
    APOCALYPTIC = "Apocalyptic"
    CONTROLLED = "Controlled"
    COOL = "Cool"
    DECADENT = "Decadent"
    EXISTENTIAL = "Existential"
    HALLUCINATORY = "Hallucinatory"
    MEDITATIVE = "Meditative"
    OBSESSIVE = "Obsessive"
    PROVOCATIVE = "Provocative"
    REBELLIOUS = "Rebellious"
    TRAGICOMIC = "Tragicomic"
    TRANSCENDENT = "Transcendent"
    TRAUMATIC = "Traumatic"
    UNHINGED = "Unhinged"


class ColorTone(str, Enum):
    """Color temperature and saturation combinations."""
    WARM_SATURATED = "Warm_Saturated"
    WARM_DESATURATED = "Warm_Desaturated"
    COOL_SATURATED = "Cool_Saturated"
    COOL_DESATURATED = "Cool_Desaturated"
    NEUTRAL_SATURATED = "Neutral_Saturated"
    NEUTRAL_DESATURATED = "Neutral_Desaturated"
    MONOCHROME = "Monochrome"
    SEPIA = "Sepia"
    TEAL_ORANGE = "Teal_Orange"
    CROSS_PROCESSED = "Cross_Processed"
    BLEACH_BYPASS = "Bleach_Bypass"
    HIGH_CONTRAST_BW = "High_Contrast_BW"
    LOW_CONTRAST_BW = "Low_Contrast_BW"


# =============================================================================
# VALIDATION RESULT
# =============================================================================

class RuleSeverity(str, Enum):
    """Severity level of a validation rule."""
    HARD = "hard"       # Blocks export - physically/historically impossible
    WARNING = "warning" # Allows export - atypical but valid
    INFO = "info"       # Informational only


class ValidationMessage(BaseModel):
    """A single validation message from the rule engine."""
    rule_id: str
    severity: RuleSeverity
    message: str
    field_path: str | None = None  # e.g., "lighting.source" for targeted UI feedback


class ValidationResult(BaseModel):
    """Result of validating a configuration."""
    status: Literal["valid", "warning", "invalid"]
    messages: list[ValidationMessage] = Field(default_factory=list)
    auto_corrections_applied: bool = False


# =============================================================================
# PROJECT CONFIG (Root)
# =============================================================================

class ProjectType(str, Enum):
    """Top-level project type selection."""
    LIVE_ACTION = "live_action"
    ANIMATION = "animation"


class ProjectState(str, Enum):
    """Current state of the project configuration."""
    DRAFT = "draft"
    VALID = "valid"
    WARNING = "warning"
    INVALID = "invalid"


class ProjectConfig(BaseModel):
    """Root project configuration that wraps either Live-Action or Animation config."""
    project_type: ProjectType
    generator_target: str = Field(
        default="generic",
        description="Target AI model (e.g., 'midjourney', 'flux', 'wan2.2', 'runway')"
    )
    state: ProjectState = ProjectState.DRAFT
    
    # Config is populated based on project_type
    # Using Any here - actual type enforcement happens in subclasses
    config: dict = Field(default_factory=dict)


# =============================================================================
# VISUAL GRAMMAR (Shared structure)
# =============================================================================

class VisualGrammar(BaseModel):
    """Visual grammar settings - shared structure between modes."""
    shot_size: ShotSize = ShotSize.MS
    composition: Composition = Composition.RULE_OF_THIRDS
    mood: Mood = Mood.CONTEMPLATIVE
    color_tone: ColorTone = ColorTone.NEUTRAL_SATURATED
