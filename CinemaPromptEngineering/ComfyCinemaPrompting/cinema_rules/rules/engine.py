"""Core Rule Engine - validates configurations and enforces cinematographic constraints."""

from typing import Any, Callable
from enum import Enum
from typing import Type

from cinema_rules.schemas.common import (
    RuleSeverity,
    ValidationMessage,
    ValidationResult,
    Mood,
    ShotSize,
    Composition,
    ColorTone,
    VisualGrammar,
)
from cinema_rules.schemas.live_action import (
    AspectRatio,
    CameraBody,
    CameraManufacturer,
    CameraType,
    FilmStock,
    LensFamily,
    LensManufacturer,
    LightingSource,
    LightingStyle,
    LiveActionConfig,
    MovementEquipment,
    MovementType,
    MovementTiming,
    SensorSize,
    TimeOfDay,
    WeightClass,
)
from cinema_rules.schemas.animation import (
    AnimationConfig,
    AnimationMedium,
    ColorApplication,
    LightingModel,
    LineTreatment,
    MotionStyle,
    StyleDomain,
    SurfaceDetail,
    VirtualCamera,
)
from cinema_rules.presets import LIVE_ACTION_PRESETS, ANIMATION_PRESETS


# =============================================================================
# RULE DEFINITIONS
# =============================================================================

# Type alias for rule check functions - returns True if rule is VIOLATED
CheckFunc = Callable[[Any], bool]


class Rule:
    """A validation rule with condition and action."""
    
    def __init__(
        self,
        rule_id: str,
        severity: RuleSeverity,
        message: str,
        check: CheckFunc,
        field_path: str | None = None,
    ):
        self.rule_id = rule_id
        self.severity = severity
        self.message = message
        self.check = check
        self.field_path = field_path
    
    def evaluate(self, config: Any) -> ValidationMessage | None:
        """Evaluate the rule against a config. Returns message if violated."""
        if self.check(config):
            return ValidationMessage(
                rule_id=self.rule_id,
                severity=self.severity,
                message=self.message,
                field_path=self.field_path,
            )
        return None


# =============================================================================
# FILM CAMERA BODIES
# =============================================================================

FILM_CAMERA_BODIES = {
    # ARRI Film
    CameraBody.ARRICAM_ST,
    CameraBody.ARRICAM_LT,
    CameraBody.ARRI_535B,
    CameraBody.ARRI_35BL,
    CameraBody.ARRI_35_III,
    CameraBody.ARRIFLEX_35,
    CameraBody.ARRIFLEX_35BL,
    CameraBody.ARRIFLEX_435,
    # Panavision
    CameraBody.PANAVISION_MILLENNIUM_XL2,
    CameraBody.PANAVISION_MILLENNIUM,
    CameraBody.PANAVISION_PLATINUM,
    CameraBody.PANAVISION_GOLD,
    CameraBody.PANAVISION_PANASTAR,
    CameraBody.PANAVISION_PANAFLEX,
    CameraBody.SUPER_PANAVISION_70,
    CameraBody.ULTRA_PANAVISION_70,
    CameraBody.PANAVISION_XL,
    # Mitchell
    CameraBody.MITCHELL_BNC,
    CameraBody.MITCHELL_BNCR,
    CameraBody.MITCHELL_BFC_65,
    # IMAX
    CameraBody.IMAX_MSM_9802,
    CameraBody.IMAX_MKIV,
    CameraBody.IMAX_GT,
    # Eclair (French New Wave)
    CameraBody.ECLAIR_NPR,
    # Vintage
    CameraBody.UFA_CUSTOM,
    CameraBody.PATHE_STUDIO,
}

PANAVISION_CAMERA_BODIES = {
    CameraBody.PANAVISION_MILLENNIUM_XL2,
    CameraBody.PANAVISION_MILLENNIUM,
    CameraBody.PANAVISION_PLATINUM,
    CameraBody.PANAVISION_GOLD,
    CameraBody.PANAVISION_PANASTAR,
    CameraBody.PANAVISION_PANAFLEX,
    CameraBody.SUPER_PANAVISION_70,
    CameraBody.ULTRA_PANAVISION_70,
    CameraBody.PANAVISION_XL,
}

PANAVISION_LENS_FAMILIES = {
    LensFamily.PANAVISION_PRIMO,
    LensFamily.PANAVISION_PRIMO_70,
    LensFamily.PANAVISION_ANAMORPHIC,
    LensFamily.PANAVISION_C_SERIES,
    LensFamily.PANAVISION_E_SERIES,
    LensFamily.PANAVISION_SPHERO,
    LensFamily.PANAVISION_ULTRA_SPEED,
}

LARGE_FORMAT_CAMERAS = {
    CameraBody.ALEXA_65,
    CameraBody.ALEXA_LF,
    CameraBody.ALEXA_MINI_LF,
    CameraBody.SUPER_PANAVISION_70,
    CameraBody.ULTRA_PANAVISION_70,
    CameraBody.MITCHELL_BFC_65,
    CameraBody.IMAX_MSM_9802,
    CameraBody.IMAX_MKIV,
    CameraBody.IMAX_GT,
}

IMAX_CAMERAS = {
    CameraBody.IMAX_MSM_9802,
    CameraBody.IMAX_MKIV,
    CameraBody.IMAX_GT,
}


# =============================================================================
# LIVE-ACTION RULES
# =============================================================================

def _get_weight_class(body: CameraBody) -> WeightClass:
    """Get weight class for a camera body."""
    heavy_cameras = {
        CameraBody.ALEXA_65,
        CameraBody.VENICE_2,
        CameraBody.C700_FF,
        # Film cameras are generally heavy
        CameraBody.ARRICAM_ST,
        CameraBody.ARRI_535B,
        CameraBody.PANAVISION_PLATINUM,
        CameraBody.PANAVISION_GOLD,
        CameraBody.MITCHELL_BNC,
        CameraBody.MITCHELL_BNCR,
        CameraBody.MITCHELL_BFC_65,
        CameraBody.SUPER_PANAVISION_70,
        CameraBody.ULTRA_PANAVISION_70,
        CameraBody.IMAX_MSM_9802,
        CameraBody.IMAX_GT,
    }
    medium_cameras = {
        CameraBody.ALEXA_35,
        CameraBody.V_RAPTOR_XL,
        CameraBody.ARRICAM_LT,
        CameraBody.ARRI_35BL,
        CameraBody.ARRI_35_III,
        CameraBody.PANAVISION_MILLENNIUM_XL2,
        CameraBody.PANAVISION_MILLENNIUM,
        CameraBody.PANAVISION_PANAFLEX,
        CameraBody.PANAVISION_PANASTAR,
        CameraBody.IMAX_MKIV,
    }
    light_cameras = {
        CameraBody.ALEXA_MINI,
        CameraBody.ALEXA_MINI_LF,
        CameraBody.ALEXA_LF,
        CameraBody.V_RAPTOR,
        CameraBody.V_RAPTOR_X,
        CameraBody.KOMODO_X,
        CameraBody.FX6,
        CameraBody.FX9,
        CameraBody.POCKET_6K,
        CameraBody.Z9,
        CameraBody.S1H,
        CameraBody.MAVIC_3_CINE,
    }
    
    if body in heavy_cameras:
        return WeightClass.HEAVY
    elif body in medium_cameras:
        return WeightClass.MEDIUM
    elif body in light_cameras:
        return WeightClass.LIGHT
    return WeightClass.ULTRA_LIGHT


def _is_film_camera(body: CameraBody) -> bool:
    """Check if a camera body is a film camera."""
    return body in FILM_CAMERA_BODIES


LIVE_ACTION_RULES: list[Rule] = [
    # =========================================================================
    # HARD RULES - Block invalid combinations
    # =========================================================================
    
    # =========================================================================
    # FILM STOCK RULES
    # =========================================================================
    
    # Film stock cannot be selected for digital cameras
    Rule(
        rule_id="LA_DIGITAL_NO_FILM_STOCK",
        severity=RuleSeverity.HARD,
        message="Film stock cannot be selected with digital cameras. Film stock is only for film cameras.",
        field_path="camera.film_stock",
        check=lambda c: (
            not _is_film_camera(c.camera.body) and
            c.camera.film_stock != FilmStock.NONE
        ),
    ),
    
    # Film cameras must have a film stock selected (not None)
    Rule(
        rule_id="LA_FILM_REQUIRES_STOCK",
        severity=RuleSeverity.HARD,
        message="Film cameras require a film stock selection.",
        field_path="camera.film_stock",
        check=lambda c: (
            _is_film_camera(c.camera.body) and
            c.camera.film_stock == FilmStock.NONE
        ),
    ),
    
    # 65mm/70mm film stocks require 65mm cameras
    Rule(
        rule_id="LA_65MM_STOCK_REQUIRES_65MM_CAMERA",
        severity=RuleSeverity.HARD,
        message="65mm/70mm film stocks require large format (65mm) cameras.",
        field_path="camera.film_stock",
        check=lambda c: (
            c.camera.film_stock in {
                FilmStock.KODAK_65MM_500T,
                FilmStock.KODAK_65MM_250D,
                FilmStock.KODAK_65MM_200T,
            } and
            c.camera.body not in LARGE_FORMAT_CAMERAS
        ),
    ),
    
    # IMAX stocks require IMAX cameras
    Rule(
        rule_id="LA_IMAX_STOCK_REQUIRES_IMAX",
        severity=RuleSeverity.HARD,
        message="IMAX film stocks require IMAX cameras.",
        field_path="camera.film_stock",
        check=lambda c: (
            c.camera.film_stock in {FilmStock.IMAX_500T, FilmStock.IMAX_250D} and
            c.camera.body not in IMAX_CAMERAS
        ),
    ),
    
    # =========================================================================
    # ASPECT RATIO RULES
    # =========================================================================
    
    # Ultra Panavision 70 requires 2.76:1 aspect ratio
    Rule(
        rule_id="LA_ULTRA_PANAVISION_ASPECT",
        severity=RuleSeverity.HARD,
        message="Ultra Panavision 70 cameras use 2.76:1 anamorphic aspect ratio.",
        field_path="camera.aspect_ratio",
        check=lambda c: (
            c.camera.body == CameraBody.ULTRA_PANAVISION_70 and
            c.camera.aspect_ratio != AspectRatio.RATIO_2_76
        ),
    ),
    
    # IMAX 15/70 typically uses 1.43:1 aspect ratio
    Rule(
        rule_id="LA_IMAX_1570_ASPECT",
        severity=RuleSeverity.WARNING,
        message="IMAX 15/70 cameras typically use 1.43:1 aspect ratio for IMAX screens.",
        field_path="camera.aspect_ratio",
        check=lambda c: (
            c.camera.body in {CameraBody.IMAX_MSM_9802, CameraBody.IMAX_GT} and
            c.camera.aspect_ratio not in {AspectRatio.RATIO_1_43, AspectRatio.RATIO_1_90}
        ),
    ),
    
    # 2.76:1 requires Ultra Panavision 70
    Rule(
        rule_id="LA_276_REQUIRES_ULTRA_PV70",
        severity=RuleSeverity.HARD,
        message="2.76:1 aspect ratio requires Ultra Panavision 70 camera system.",
        field_path="camera.aspect_ratio",
        check=lambda c: (
            c.camera.aspect_ratio == AspectRatio.RATIO_2_76 and
            c.camera.body != CameraBody.ULTRA_PANAVISION_70
        ),
    ),
    
    # =========================================================================
    # LENS MOUNT COMPATIBILITY RULES
    # =========================================================================
    
    # Panavision cameras require Panavision lenses (closed ecosystem)
    Rule(
        rule_id="LA_PANAVISION_CLOSED_ECOSYSTEM",
        severity=RuleSeverity.HARD,
        message="Panavision cameras use proprietary mount. Only Panavision lenses are compatible.",
        field_path="lens.family",
        check=lambda c: (
            c.camera.body in PANAVISION_CAMERA_BODIES and
            c.lens.family not in PANAVISION_LENS_FAMILIES
        ),
    ),
    
    # Panavision lenses require Panavision cameras
    Rule(
        rule_id="LA_PANAVISION_LENS_REQUIRES_PV_CAMERA",
        severity=RuleSeverity.HARD,
        message="Panavision lenses require Panavision mount cameras.",
        field_path="lens.family",
        check=lambda c: (
            c.lens.family in PANAVISION_LENS_FAMILIES and
            c.camera.body not in PANAVISION_CAMERA_BODIES and
            c.camera.body != CameraBody.ALEXA_65  # Alexa 65 can use Primo 70 with adapter
        ),
    ),
    # Night + Sun is impossible
    Rule(
        rule_id="LA_NIGHT_NO_SUN",
        severity=RuleSeverity.HARD,
        message="Sunlight is not available at night.",
        field_path="lighting.source",
        check=lambda c: (
            c.lighting.time_of_day == TimeOfDay.NIGHT and 
            c.lighting.source == LightingSource.SUN
        ),
    ),
    
    # Heavy cameras cannot be handheld
    Rule(
        rule_id="LA_HEAVY_NO_HANDHELD",
        severity=RuleSeverity.HARD,
        message="Heavy cameras (>4kg) cannot be operated handheld safely.",
        field_path="movement.equipment",
        check=lambda c: (
            _get_weight_class(c.camera.body) == WeightClass.HEAVY and
            c.movement.equipment == MovementEquipment.HANDHELD
        ),
    ),
    
    # Heavy cameras cannot use gimbal
    Rule(
        rule_id="LA_HEAVY_NO_GIMBAL",
        severity=RuleSeverity.HARD,
        message="Heavy cameras (>4kg) exceed gimbal payload limits.",
        field_path="movement.equipment",
        check=lambda c: (
            _get_weight_class(c.camera.body) == WeightClass.HEAVY and
            c.movement.equipment == MovementEquipment.GIMBAL
        ),
    ),
    
    # Heavy cameras cannot use standard drone
    Rule(
        rule_id="LA_HEAVY_NO_DRONE",
        severity=RuleSeverity.HARD,
        message="Heavy cameras (>4kg) exceed standard drone payload limits.",
        field_path="movement.equipment",
        check=lambda c: (
            _get_weight_class(c.camera.body) == WeightClass.HEAVY and
            c.movement.equipment == MovementEquipment.DRONE
        ),
    ),
    
    # =========================================================================
    # WARNING RULES - Atypical but valid combinations
    # =========================================================================
    
    # Medium cameras + extended handheld = operator fatigue
    Rule(
        rule_id="LA_MEDIUM_HANDHELD_WARN",
        severity=RuleSeverity.WARNING,
        message="Medium-weight cameras (3-4kg) may cause operator fatigue during extended handheld work.",
        field_path="movement.equipment",
        check=lambda c: (
            _get_weight_class(c.camera.body) == WeightClass.MEDIUM and
            c.movement.equipment == MovementEquipment.HANDHELD
        ),
    ),
    
    # Cheerful mood + Low-Key lighting (atypical but valid - see Midsommar)
    Rule(
        rule_id="LA_CHEERFUL_LOWKEY_WARN",
        severity=RuleSeverity.WARNING,
        message="Cheerful mood with low-key lighting is atypical. Intentional subversion?",
        field_path="lighting.style",
        check=lambda c: (
            c.visual_grammar.mood.value == "Cheerful" and
            c.lighting.style == LightingStyle.LOW_KEY
        ),
    ),
    
    # Romantic mood + Low-Key is actually traditional (just info)
    Rule(
        rule_id="LA_ROMANTIC_LOWKEY_INFO",
        severity=RuleSeverity.INFO,
        message="Low-key lighting is traditional for romantic/sensual scenes.",
        field_path="lighting.style",
        check=lambda c: (
            c.visual_grammar.mood.value == "Romantic" and
            c.lighting.style == LightingStyle.LOW_KEY
        ),
    ),
    
    # Pre-1972 era + HMI lighting (anachronistic)
    Rule(
        rule_id="LA_ERA_HMI_ANACHRONISM",
        severity=RuleSeverity.HARD,
        message="HMI lighting was invented in 1972. Not available for earlier eras.",
        field_path="lighting.source",
        check=lambda c: (
            c.era is not None and
            _era_before_year(c.era, 1972) and
            c.lighting.source == LightingSource.HMI
        ),
    ),
    
    # Pre-1987 era + Kino Flo (anachronistic)
    Rule(
        rule_id="LA_ERA_KINO_ANACHRONISM",
        severity=RuleSeverity.HARD,
        message="Kino Flo was founded in 1987. Not available for earlier eras.",
        field_path="lighting.source",
        check=lambda c: (
            c.era is not None and
            _era_before_year(c.era, 1987) and
            c.lighting.source == LightingSource.KINO_FLO
        ),
    ),
    
    # Pre-2002 era + LED lighting (anachronistic)
    Rule(
        rule_id="LA_ERA_LED_ANACHRONISM",
        severity=RuleSeverity.HARD,
        message="LED film lighting became available around 2002, widespread after 2012.",
        field_path="lighting.source",
        check=lambda c: (
            c.era is not None and
            _era_before_year(c.era, 2002) and
            c.lighting.source == LightingSource.LED
        ),
    ),
    
    # Midday + Low-Key is physically difficult/impossible outdoors
    Rule(
        rule_id="LA_MIDDAY_NO_LOWKEY",
        severity=RuleSeverity.HARD,
        message="Low-key lighting is nearly impossible to achieve at midday without extensive control.",
        field_path="lighting.style",
        check=lambda c: (
            c.lighting.time_of_day == TimeOfDay.MIDDAY and
            c.lighting.style == LightingStyle.LOW_KEY
        ),
    ),
    
    # Midday + Moon is impossible
    Rule(
        rule_id="LA_MIDDAY_NO_MOON",
        severity=RuleSeverity.HARD,
        message="Moonlight cannot be the key light source during midday.",
        field_path="lighting.source",
        check=lambda c: (
            c.lighting.time_of_day == TimeOfDay.MIDDAY and
            c.lighting.source == LightingSource.MOON
        ),
    ),
    
    # Blue Hour + Sun is impossible (sun has set)
    Rule(
        rule_id="LA_BLUEHOUR_NO_SUN",
        severity=RuleSeverity.HARD,
        message="Direct sunlight is not available during blue hour (sun has set/not yet risen).",
        field_path="lighting.source",
        check=lambda c: (
            c.lighting.time_of_day == TimeOfDay.BLUE_HOUR and
            c.lighting.source == LightingSource.SUN
        ),
    ),
    
    # Jib equipment restricts movement types
    Rule(
        rule_id="LA_JIB_MOVEMENT_RESTRICT",
        severity=RuleSeverity.HARD,
        message="Jib equipment can only perform Crane_Up, Crane_Down, and Arc movements.",
        field_path="movement.movement_type",
        check=lambda c: (
            c.movement.equipment == MovementEquipment.JIB and
            c.movement.movement_type not in {
                MovementType.CRANE_UP,
                MovementType.CRANE_DOWN,
                MovementType.ARC,
                MovementType.STATIC,
            }
        ),
    ),
    
    # Drone movement restrictions
    Rule(
        rule_id="LA_DRONE_MOVEMENT_RESTRICT",
        severity=RuleSeverity.HARD,
        message="Drone equipment is limited to aerial movement types: Track_In, Track_Out, Crane_Up, Crane_Down, Arc.",
        field_path="movement.movement_type",
        check=lambda c: (
            c.movement.equipment == MovementEquipment.DRONE and
            c.movement.movement_type not in {
                MovementType.TRACK_IN,
                MovementType.TRACK_OUT,
                MovementType.CRANE_UP,
                MovementType.CRANE_DOWN,
                MovementType.ARC,
                MovementType.STATIC,
            }
        ),
    ),
    
    # Dolly_Zoom requires Dolly equipment
    Rule(
        rule_id="LA_DOLLYZOOM_REQUIRES_DOLLY",
        severity=RuleSeverity.HARD,
        message="Dolly zoom (Vertigo effect) requires dolly or slider equipment.",
        field_path="movement.equipment",
        check=lambda c: (
            c.movement.movement_type == MovementType.DOLLY_ZOOM and
            c.movement.equipment not in {
                MovementEquipment.DOLLY,
                MovementEquipment.SLIDER,
            }
        ),
    ),
    
    # =========================================================================
    # MORE WARNING RULES - Atypical but valid combinations
    # =========================================================================
    
    # Dolly zoom should be slow or moderate (fast is disorienting)
    Rule(
        rule_id="LA_DOLLYZOOM_TIMING_WARN",
        severity=RuleSeverity.WARNING,
        message="Dolly zoom at fast timing is disorienting. Typically done at slow/moderate pace.",
        field_path="movement.timing",
        check=lambda c: (
            c.movement.movement_type == MovementType.DOLLY_ZOOM and
            c.movement.timing in {MovementTiming.FAST, MovementTiming.WHIP_FAST}
        ),
    ),
    
    # Gloomy mood with High-Key lighting (atypical)
    Rule(
        rule_id="LA_GLOOMY_HIGHKEY_WARN",
        severity=RuleSeverity.WARNING,
        message="Gloomy mood with high-key lighting is atypical. Low-key is more conventional.",
        field_path="lighting.style",
        check=lambda c: (
            c.visual_grammar.mood == Mood.GLOOMY and
            c.lighting.style == LightingStyle.HIGH_KEY
        ),
    ),
    
    # Hopeful mood with Low-Key lighting (atypical)
    Rule(
        rule_id="LA_HOPEFUL_LOWKEY_WARN",
        severity=RuleSeverity.WARNING,
        message="Hopeful mood with low-key lighting is atypical. High-key/soft lighting is conventional.",
        field_path="lighting.style",
        check=lambda c: (
            c.visual_grammar.mood == Mood.HOPEFUL and
            c.lighting.style == LightingStyle.LOW_KEY
        ),
    ),
    
    # Wide lens + Close-Up (distortion warning)
    Rule(
        rule_id="LA_WIDE_LENS_CU_WARN",
        severity=RuleSeverity.WARNING,
        message="Wide angle lens (<35mm) on close-up causes facial distortion. Intentional stylistic choice?",
        field_path="lens.focal_length_mm",
        check=lambda c: (
            c.lens.focal_length_mm < 35 and
            c.visual_grammar.shot_size.value in {"CU", "BCU", "ECU"}
        ),
    ),
    
    # Long lens + Wide shot (compression/unusual)
    Rule(
        rule_id="LA_LONG_LENS_WIDE_WARN",
        severity=RuleSeverity.WARNING,
        message="Long lens (>85mm) on wide shot creates strong compression. Unusual choice.",
        field_path="lens.focal_length_mm",
        check=lambda c: (
            c.lens.focal_length_mm > 85 and
            c.visual_grammar.shot_size.value in {"EWS", "WS"}
        ),
    ),
    
    # =========================================================================
    # CAMERA-LENS MOUNT COMPATIBILITY RULES
    # =========================================================================
    
    # Alexa 65 requires 65mm format lenses only (XPL mount)
    Rule(
        rule_id="LA_ALEXA65_LENS_RESTRICT",
        severity=RuleSeverity.HARD,
        message="Alexa 65 (XPL mount, 65mm sensor) requires 65mm format lenses. "
                "Compatible: ARRI Prime 65, ARRI Prime DNA, Panavision Primo 70, Hasselblad V.",
        field_path="lens.family",
        check=lambda c: (
            c.camera.body == CameraBody.ALEXA_65 and
            c.lens.family not in {
                LensFamily.ARRI_PRIME_65,         # Native Alexa 65 lenses
                LensFamily.ARRI_PRIME_DNA,        # DNA LF lenses (65mm compatible)
                LensFamily.PANAVISION_PRIMO_70,   # Primo 70 is 65mm compatible
                LensFamily.HASSELBLAD_V,          # Hasselblad V-system covers 65mm
                LensFamily.VINTAGE_SPHERICAL,     # Some vintage 65mm exists
            }
        ),
    ),
    
    # Panavision cameras require Panavision lenses (closed ecosystem)
    # Note: This is a more specific rule for Panaflex that was duplicated.
    # The main rule LA_PANAVISION_CLOSED_ECOSYSTEM handles all Panavision cameras.
    # Removing this duplicate to avoid conflicts.
    
    # Large Format ARRI cameras cannot use Super35-only lenses (coverage issue)
    Rule(
        rule_id="LA_LF_NO_S35_LENS",
        severity=RuleSeverity.HARD,
        message="Large Format cameras require LF/FF coverage lenses. "
                "S35-only lenses will vignette on LF sensors.",
        field_path="lens.family",
        check=lambda c: (
            c.camera.body in {CameraBody.ALEXA_LF, CameraBody.ALEXA_MINI_LF} and
            c.lens.family in {
                LensFamily.ARRI_ULTRA_PRIME,      # S35 only
                LensFamily.ARRI_MASTER_PRIME,     # S35 only
                LensFamily.ZEISS_MASTER_PRIME,    # S35 only
                LensFamily.COOKE_S4,              # S35 only
                LensFamily.PANAVISION_PRIMO,      # S35 only (non-70)
            }
        ),
    ),
    
    # Note: Panavision lens restriction is handled by LA_PANAVISION_LENS_REQUIRES_PV_CAMERA
    # which uses the full PANAVISION_CAMERA_BODIES set.
    
    # =========================================================================
    # MORE WARNING RULES - Lens/Camera compatibility
    # =========================================================================
    
    # Vintage lenses on high-resolution sensors
    Rule(
        rule_id="LA_VINTAGE_HIGHRES_WARN",
        severity=RuleSeverity.WARNING,
        message="Vintage lenses may not resolve well on high-resolution sensors (8K+). "
                "Chromatic aberration and softness may be more visible.",
        field_path="lens.family",
        check=lambda c: (
            c.lens.family in {LensFamily.VINTAGE_ANAMORPHIC, LensFamily.VINTAGE_SPHERICAL} and
            c.camera.body in {
                CameraBody.V_RAPTOR,      # 8K
                CameraBody.V_RAPTOR_X,    # 8K
                CameraBody.V_RAPTOR_XL,   # 8K
            }
        ),
    ),
    
    # Anamorphic lenses require matching aspect ratio consideration
    Rule(
        rule_id="LA_ANAMORPHIC_INFO",
        severity=RuleSeverity.INFO,
        message="Anamorphic lens selected. Remember to set 2x de-squeeze in post for proper aspect ratio.",
        field_path="lens.is_anamorphic",
        check=lambda c: c.lens.is_anamorphic is True,
    ),
    
    # =========================================================================
    # COMPOSITION ↔ SHOT SIZE CONSTRAINTS
    # =========================================================================
    
    # Symmetrical composition on extreme close-up (unusual - little to be symmetrical about)
    Rule(
        rule_id="LA_SYMMETRY_ECU_WARN",
        severity=RuleSeverity.WARNING,
        message="Symmetrical composition is unusual for ECU - limited visual elements to arrange symmetrically.",
        field_path="visual_grammar.composition",
        check=lambda c: (
            c.visual_grammar.composition == Composition.SYMMETRICAL and
            c.visual_grammar.shot_size == ShotSize.ECU
        ),
    ),
    
    # Leading Lines on Close-Up/ECU (no environmental context)
    Rule(
        rule_id="LA_LEADING_LINES_CU_WARN",
        severity=RuleSeverity.WARNING,
        message="Leading Lines composition requires environmental context - atypical for close-ups.",
        field_path="visual_grammar.composition",
        check=lambda c: (
            c.visual_grammar.composition == Composition.LEADING_LINES and
            c.visual_grammar.shot_size in {ShotSize.CU, ShotSize.BCU, ShotSize.ECU}
        ),
    ),
    
    # Negative Space on ECU (no space around subject in ECU)
    Rule(
        rule_id="LA_NEGATIVE_SPACE_ECU_WARN",
        severity=RuleSeverity.WARNING,
        message="Negative Space composition is difficult to achieve in ECU - subject fills frame.",
        field_path="visual_grammar.composition",
        check=lambda c: (
            c.visual_grammar.composition == Composition.NEGATIVE_SPACE and
            c.visual_grammar.shot_size == ShotSize.ECU
        ),
    ),
    
    # Frame Within Frame on EWS (hard to see nested frames at distance)
    Rule(
        rule_id="LA_FRAME_WITHIN_FRAME_EWS_WARN",
        severity=RuleSeverity.WARNING,
        message="Frame Within Frame is harder to read at Extreme Wide distances - may lose visual impact.",
        field_path="visual_grammar.composition",
        check=lambda c: (
            c.visual_grammar.composition == Composition.FRAME_WITHIN_FRAME and
            c.visual_grammar.shot_size == ShotSize.EWS
        ),
    ),
    
    # Fill The Frame on Wide Shot (contradictory intent)
    Rule(
        rule_id="LA_FILL_FRAME_WIDE_WARN",
        severity=RuleSeverity.WARNING,
        message="Fill The Frame composition contradicts Wide Shot framing - subject should dominate in FTF.",
        field_path="visual_grammar.composition",
        check=lambda c: (
            c.visual_grammar.composition == Composition.FILL_THE_FRAME and
            c.visual_grammar.shot_size in {ShotSize.WS, ShotSize.EWS, ShotSize.MWS}
        ),
    ),
    
    # Depth Layering on ECU (no foreground/background depth in extreme close)
    Rule(
        rule_id="LA_DEPTH_LAYERING_ECU_WARN",
        severity=RuleSeverity.WARNING,
        message="Depth Layering requires multiple planes - difficult to achieve in extreme close-up.",
        field_path="visual_grammar.composition",
        check=lambda c: (
            c.visual_grammar.composition == Composition.DEPTH_LAYERING and
            c.visual_grammar.shot_size in {ShotSize.ECU, ShotSize.BCU}
        ),
    ),
]


def _era_before_year(era: str, year: int) -> bool:
    """Check if an era string represents a time before the given year."""
    era_lower = era.lower()
    
    # Decade patterns
    decade_map = {
        "1890s": 1895, "1900s": 1905, "1910s": 1915, "1920s": 1925,
        "1930s": 1935, "1940s": 1945, "1950s": 1955, "1960s": 1965,
        "1970s": 1975, "1980s": 1985, "1990s": 1995, "2000s": 2005,
        "2010s": 2015, "2020s": 2025,
    }
    
    for decade, midpoint in decade_map.items():
        if decade in era_lower:
            return midpoint < year
    
    # Named eras
    era_ranges = {
        "silent": 1920,
        "golden age": 1950,
        "classic hollywood": 1960,
        "new hollywood": 1975,
        "modern": 2020,
        "contemporary": 2020,
    }
    
    for name, end_year in era_ranges.items():
        if name in era_lower:
            return end_year < year
    
    return False


# =============================================================================
# ANIMATION RULES
# =============================================================================

ANIMATION_RULES: list[Rule] = [
    # =========================================================================
    # HARD RULES - Block invalid combinations
    # =========================================================================
    
    # Manga must be monochrome
    Rule(
        rule_id="ANIM_MANGA_MONOCHROME",
        severity=RuleSeverity.HARD,
        message="Manga style must use Monochrome or Monochrome_Ink color application.",
        field_path="rendering.color_application",
        check=lambda c: (
            c.style_domain == StyleDomain.MANGA and
            c.rendering.color_application not in {
                ColorApplication.MONOCHROME,
                ColorApplication.MONOCHROME_INK,
            }
        ),
    ),
    
    # Manga cannot have camera motion
    Rule(
        rule_id="ANIM_MANGA_LOCKED_CAMERA",
        severity=RuleSeverity.HARD,
        message="Manga style must use Locked camera (static panels).",
        field_path="motion.virtual_camera",
        check=lambda c: (
            c.style_domain == StyleDomain.MANGA and
            c.motion.virtual_camera != VirtualCamera.LOCKED
        ),
    ),
    
    # Manga must use Graphic lighting model
    Rule(
        rule_id="ANIM_MANGA_GRAPHIC_LIGHT",
        severity=RuleSeverity.HARD,
        message="Manga style requires Graphic lighting model (symbolic, not volumetric).",
        field_path="rendering.lighting_model",
        check=lambda c: (
            c.style_domain == StyleDomain.MANGA and
            c.rendering.lighting_model != LightingModel.GRAPHIC
        ),
    ),
    
    # Manga must have no motion
    Rule(
        rule_id="ANIM_MANGA_NO_MOTION",
        severity=RuleSeverity.HARD,
        message="Manga style must have no motion (static panels).",
        field_path="motion.motion_style",
        check=lambda c: (
            c.style_domain == StyleDomain.MANGA and
            c.motion.motion_style != MotionStyle.NONE
        ),
    ),
    
    # Manga requires 2D medium
    Rule(
        rule_id="ANIM_MANGA_REQUIRES_2D",
        severity=RuleSeverity.HARD,
        message="Manga style requires 2D medium.",
        field_path="medium",
        check=lambda c: (
            c.style_domain == StyleDomain.MANGA and
            c.medium != AnimationMedium.TWO_D
        ),
    ),
    
    # Illustration cannot have motion
    Rule(
        rule_id="ANIM_ILLUSTRATION_STATIC",
        severity=RuleSeverity.HARD,
        message="Illustration style must have no motion (static image).",
        field_path="motion.motion_style",
        check=lambda c: (
            c.style_domain == StyleDomain.ILLUSTRATION and
            c.motion.motion_style != MotionStyle.NONE
        ),
    ),
    
    # Illustration must use Locked camera
    Rule(
        rule_id="ANIM_ILLUSTRATION_LOCKED_CAMERA",
        severity=RuleSeverity.HARD,
        message="Illustration style must use Locked camera (no temporal camera).",
        field_path="motion.virtual_camera",
        check=lambda c: (
            c.style_domain == StyleDomain.ILLUSTRATION and
            c.motion.virtual_camera != VirtualCamera.LOCKED
        ),
    ),
    
    # 2D medium cannot use Free 3D camera
    Rule(
        rule_id="ANIM_2D_NO_FREE3D",
        severity=RuleSeverity.HARD,
        message="2D animation cannot use Free 3D camera movement.",
        field_path="motion.virtual_camera",
        check=lambda c: (
            c.medium == AnimationMedium.TWO_D and
            c.motion.virtual_camera == VirtualCamera.FREE_3D
        ),
    ),
    
    # 3D cannot use Flat lighting model
    Rule(
        rule_id="ANIM_3D_NO_FLAT_LIGHT",
        severity=RuleSeverity.HARD,
        message="3D animation requires volumetric or simulated light, not Flat lighting.",
        field_path="rendering.lighting_model",
        check=lambda c: (
            c.medium == AnimationMedium.THREE_D and
            c.rendering.lighting_model == LightingModel.MINIMAL
        ),
    ),
    
    # 3D cannot be Locked + None motion (needs spatial camera)
    Rule(
        rule_id="ANIM_3D_REQUIRES_CAMERA_OR_MOTION",
        severity=RuleSeverity.HARD,
        message="3D animation requires spatial camera presence or motion.",
        field_path="motion.virtual_camera",
        check=lambda c: (
            c.medium == AnimationMedium.THREE_D and
            c.motion.virtual_camera == VirtualCamera.LOCKED and
            c.motion.motion_style == MotionStyle.NONE
        ),
    ),
    
    # Hybrid 2D/3D requires Free 3D camera
    Rule(
        rule_id="ANIM_HYBRID_REQUIRES_3D_CAMERA",
        severity=RuleSeverity.HARD,
        message="Hybrid 2D/3D animation requires Free 3D camera for volumetric movement.",
        field_path="motion.virtual_camera",
        check=lambda c: (
            c.medium == AnimationMedium.HYBRID and
            c.motion.virtual_camera != VirtualCamera.FREE_3D
        ),
    ),
    
    # Global: Motionless style cannot have camera movement
    Rule(
        rule_id="ANIM_NO_MOTION_NO_CAMERA",
        severity=RuleSeverity.HARD,
        message="Static motion style (None) cannot have camera movement.",
        field_path="motion.virtual_camera",
        check=lambda c: (
            c.motion.motion_style == MotionStyle.NONE and
            c.motion.virtual_camera not in {VirtualCamera.LOCKED, VirtualCamera.MOTION_COMIC}
        ),
    ),
    
    # Anime cannot use Photoreal + Naturalistic_Simulated lighting combo
    Rule(
        rule_id="ANIM_ANIME_NO_PHOTOREAL",
        severity=RuleSeverity.HARD,
        message="Anime does not use photorealistic rendering with naturalistic lighting.",
        field_path="rendering.surface_detail",
        check=lambda c: (
            c.style_domain == StyleDomain.ANIME and
            c.rendering.surface_detail == SurfaceDetail.PHOTOREAL and
            c.rendering.lighting_model == LightingModel.NATURALISTIC_SIMULATED
        ),
    ),
    
    # Full Animation + Monochrome_Ink is invalid (color anime requires color)
    Rule(
        rule_id="ANIM_FULL_ANIMATION_NEEDS_COLOR",
        severity=RuleSeverity.HARD,
        message="Full animation style typically requires color, not monochrome ink.",
        field_path="rendering.color_application",
        check=lambda c: (
            c.motion.motion_style == MotionStyle.FULL and
            c.rendering.color_application == ColorApplication.MONOCHROME_INK
        ),
    ),
    
    # =========================================================================
    # WARNING RULES - Atypical but valid
    # =========================================================================
    
    # Photoreal surfaces + Limited animation
    Rule(
        rule_id="ANIM_PHOTOREAL_LIMITED_WARN",
        severity=RuleSeverity.WARNING,
        message="Photorealistic surfaces with limited animation may expose motion imperfections.",
        field_path="motion.motion_style",
        check=lambda c: (
            c.rendering.surface_detail == SurfaceDetail.PHOTOREAL and
            c.motion.motion_style == MotionStyle.LIMITED
        ),
    ),
    
    # Anime: Highly saturated + Gloomy mood mismatch
    Rule(
        rule_id="ANIM_SATURATED_GLOOMY_WARN",
        severity=RuleSeverity.WARNING,
        message="Highly saturated colors with gloomy mood is atypical - consider desaturated tones.",
        field_path="visual_grammar.color_tone",
        check=lambda c: (
            c.style_domain == StyleDomain.ANIME and
            c.visual_grammar.color_tone.value in {"Warm_Saturated", "Cool_Saturated", "Neutral_Saturated"} and
            c.visual_grammar.mood.value == "Gloomy"
        ),
    ),
    
    # Manga: Clean line + Menacing mood (should use heavier ink)
    Rule(
        rule_id="ANIM_MANGA_CLEAN_MENACING_WARN",
        severity=RuleSeverity.WARNING,
        message="Menacing mood in manga usually benefits from heavier ink treatment.",
        field_path="rendering.line_treatment",
        check=lambda c: (
            c.style_domain == StyleDomain.MANGA and
            c.rendering.line_treatment.value == "Clean" and
            c.visual_grammar.mood.value == "Menacing"
        ),
    ),
    
    # 3D: Stylized rim light + Cheerful mood mismatch
    Rule(
        rule_id="ANIM_3D_RIM_CHEERFUL_WARN",
        severity=RuleSeverity.WARNING,
        message="Stylized rim lighting often implies drama or tension, atypical for cheerful mood.",
        field_path="rendering.lighting_model",
        check=lambda c: (
            c.medium == AnimationMedium.THREE_D and
            c.rendering.lighting_model == LightingModel.STYLIZED_RIM and
            c.visual_grammar.mood.value == "Cheerful"
        ),
    ),
    
    # Anime: Monochrome color tone is atypical
    Rule(
        rule_id="ANIM_ANIME_MONOCHROME_WARN",
        severity=RuleSeverity.WARNING,
        message="Monochrome color tone is atypical for anime - usually reserved for flashbacks or stylistic moments.",
        field_path="visual_grammar.color_tone",
        check=lambda c: (
            c.style_domain == StyleDomain.ANIME and
            c.visual_grammar.color_tone.value == "Monochrome"
        ),
    ),
    
    # Sketchy lines + Full Animation = high production cost
    Rule(
        rule_id="ANIM_SKETCHY_FULL_WARN",
        severity=RuleSeverity.WARNING,
        message="Sketchy line treatment with full animation is high production cost - consider limited animation.",
        field_path="rendering.line_treatment",
        check=lambda c: (
            c.rendering.line_treatment.value == "Sketchy" and
            c.motion.motion_style == MotionStyle.FULL
        ),
    ),
    
    # Anime: Excessive camera shake (simulated handheld) breaks controlled framing
    Rule(
        rule_id="ANIM_ANIME_NO_SIMULATED_HANDHELD",
        severity=RuleSeverity.HARD,
        message="Anime relies on controlled framing. Simulated Handheld camera breaks stylistic conventions.",
        field_path="motion.virtual_camera",
        check=lambda c: (
            c.style_domain == StyleDomain.ANIME and
            c.motion.virtual_camera == VirtualCamera.SIMULATED_HANDHELD
        ),
    ),
    
    # Global: Dreamlike mood + High Contrast BW (harsh tones clash with soft dreamy feel)
    Rule(
        rule_id="ANIM_DREAMLIKE_HARSH_CONTRAST_WARN",
        severity=RuleSeverity.WARNING,
        message="Dreamlike mood favors softer tonal transitions. High contrast BW is harsh for dreamy aesthetics.",
        field_path="visual_grammar.color_tone",
        check=lambda c: (
            c.visual_grammar.mood == Mood.DREAMLIKE and
            c.visual_grammar.color_tone == ColorTone.HIGH_CONTRAST_BW
        ),
    ),
    
    # Illustration: Dynamic composition + static motion (implied motion with no motion)
    Rule(
        rule_id="ANIM_ILLUSTRATION_DYNAMIC_STATIC_WARN",
        severity=RuleSeverity.WARNING,
        message="Dynamic/Diagonal composition implies motion energy, but Illustration has no motion. Intentional tension?",
        field_path="visual_grammar.composition",
        check=lambda c: (
            c.style_domain == StyleDomain.ILLUSTRATION and
            c.visual_grammar.composition == Composition.DIAGONAL and
            c.motion.motion_style == MotionStyle.NONE
        ),
    ),
]


# =============================================================================
# RULE ENGINE
# =============================================================================

class RuleEngine:
    """Core validation engine for cinematographic configurations."""
    
    def __init__(self):
        self.live_action_rules = LIVE_ACTION_RULES
        self.animation_rules = ANIMATION_RULES
    
    def validate_live_action(self, config: LiveActionConfig) -> ValidationResult:
        """Validate a live-action configuration including preset constraints."""
        messages: list[ValidationMessage] = []
        
        # Standard rule validation
        for rule in self.live_action_rules:
            result = rule.evaluate(config)
            if result is not None:
                messages.append(result)
        
        # Preset constraint validation
        if config.film_preset:
            preset_messages = self._validate_live_action_preset(config)
            messages.extend(preset_messages)
        
        return self._build_result(messages)
    
    def validate_animation(self, config: AnimationConfig) -> ValidationResult:
        """Validate an animation configuration including preset constraints."""
        messages: list[ValidationMessage] = []
        
        # Standard rule validation
        for rule in self.animation_rules:
            result = rule.evaluate(config)
            if result is not None:
                messages.append(result)
        
        # Preset constraint validation
        if config.style_preset:
            preset_messages = self._validate_animation_preset(config)
            messages.extend(preset_messages)
        
        return self._build_result(messages)
    
    def _validate_live_action_preset(self, config: LiveActionConfig) -> list[ValidationMessage]:
        """Validate config against film preset constraints (disallowed_moods, disallowed_sources)."""
        messages: list[ValidationMessage] = []
        
        if not config.film_preset:
            return messages
        
        preset = LIVE_ACTION_PRESETS.get(config.film_preset)
        if not preset:
            return messages  # Unknown preset - no constraint validation
        
        # Check disallowed moods
        current_mood = config.visual_grammar.mood.value
        if current_mood in preset.disallowed_moods:
            messages.append(ValidationMessage(
                rule_id="PRESET_DISALLOWED_MOOD",
                severity=RuleSeverity.HARD,
                message=f"'{current_mood}' mood is incompatible with {preset.name} style. "
                        f"Disallowed moods: {', '.join(preset.disallowed_moods)}",
                field_path="visual_grammar.mood",
            ))
        
        # Check disallowed lighting sources
        current_source = config.lighting.source.value
        if current_source in preset.disallowed_sources:
            messages.append(ValidationMessage(
                rule_id="PRESET_DISALLOWED_SOURCE",
                severity=RuleSeverity.HARD,
                message=f"'{current_source}' lighting source is incompatible with {preset.name} "
                        f"({preset.year}). Disallowed sources: {', '.join(preset.disallowed_sources)}",
                field_path="lighting.source",
            ))
        
        return messages
    
    def _validate_animation_preset(self, config: AnimationConfig) -> list[ValidationMessage]:
        """Validate config against animation preset constraints."""
        messages: list[ValidationMessage] = []
        
        if not config.style_preset:
            return messages
        
        preset = ANIMATION_PRESETS.get(config.style_preset)
        if not preset:
            return messages  # Unknown preset - no constraint validation
        
        # AnimationPreset uses disallowed_cameras and disallowed_motion, not disallowed_moods
        # Check disallowed cameras
        current_camera = config.motion.virtual_camera.value
        if current_camera in preset.disallowed_cameras:
            messages.append(ValidationMessage(
                rule_id="PRESET_DISALLOWED_CAMERA",
                severity=RuleSeverity.HARD,
                message=f"'{current_camera}' virtual camera is incompatible with {preset.name} style. "
                        f"Disallowed: {', '.join(preset.disallowed_cameras)}",
                field_path="motion.virtual_camera",
            ))
        
        # Check disallowed motion styles
        current_motion = config.motion.motion_style.value
        if current_motion in preset.disallowed_motion:
            messages.append(ValidationMessage(
                rule_id="PRESET_DISALLOWED_MOTION",
                severity=RuleSeverity.HARD,
                message=f"'{current_motion}' motion style is incompatible with {preset.name} style. "
                        f"Disallowed: {', '.join(preset.disallowed_motion)}",
                field_path="motion.motion_style",
            ))
        
        return messages
    
    def apply_live_action_preset(
        self,
        preset_id: str,
        overrides: dict | None = None,
    ) -> tuple[LiveActionConfig, ValidationResult]:
        """
        Apply a film preset to create a pre-populated LiveActionConfig.
        
        Args:
            preset_id: The preset ID (e.g., 'blade_runner')
            overrides: Optional dict of field overrides to apply after preset population
        
        Returns:
            Tuple of (populated config, validation result)
        
        Raises:
            ValueError: If preset_id is not found
        """
        preset = LIVE_ACTION_PRESETS.get(preset_id)
        if not preset:
            raise ValueError(f"Unknown preset: '{preset_id}'. Available: {list(LIVE_ACTION_PRESETS.keys())[:10]}...")
        
        # Mapping tables for preset strings → enums
        shot_size_map = {
            "EWS": ShotSize.EWS, "Extreme_Wide_Shot": ShotSize.EWS, "Extreme Wide Shot": ShotSize.EWS,
            "WS": ShotSize.WS, "Wide_Shot": ShotSize.WS, "Wide Shot": ShotSize.WS,
            "MWS": ShotSize.MWS, "Medium_Wide_Shot": ShotSize.MWS, "Medium Wide Shot": ShotSize.MWS,
            "MS": ShotSize.MS, "Medium_Shot": ShotSize.MS, "Medium Shot": ShotSize.MS,
            "MCU": ShotSize.MCU, "Medium_Close_Up": ShotSize.MCU, "Medium Close Up": ShotSize.MCU,
            "CU": ShotSize.CU, "Close_Up": ShotSize.CU, "Close Up": ShotSize.CU,
            "BCU": ShotSize.BCU, "Big_Close_Up": ShotSize.BCU, "Big Close Up": ShotSize.BCU,
            "ECU": ShotSize.ECU, "Extreme_Close_Up": ShotSize.ECU, "Extreme Close Up": ShotSize.ECU,
            "OTS": ShotSize.OTS, "Over_The_Shoulder": ShotSize.OTS, "Over The Shoulder": ShotSize.OTS,
            "POV": ShotSize.POV, "Point_of_View": ShotSize.POV,
            "American": ShotSize.AMERICAN, "Cowboy_Shot": ShotSize.AMERICAN,
            "Italian": ShotSize.ITALIAN,
        }
        
        composition_map = {
            "Rule_of_Thirds": Composition.RULE_OF_THIRDS, "Rule of Thirds": Composition.RULE_OF_THIRDS,
            "Centered": Composition.CENTERED,
            "Symmetrical": Composition.SYMMETRICAL,
            "Asymmetrical": Composition.ASYMMETRICAL,
            "Negative_Space": Composition.NEGATIVE_SPACE, "Negative Space": Composition.NEGATIVE_SPACE,
            "Leading_Lines": Composition.LEADING_LINES, "Leading Lines": Composition.LEADING_LINES,
            "Frame_Within_Frame": Composition.FRAME_WITHIN_FRAME, "Frame Within Frame": Composition.FRAME_WITHIN_FRAME,
            "Diagonal": Composition.DIAGONAL,
            "Golden_Ratio": Composition.GOLDEN_RATIO, "Golden Ratio": Composition.GOLDEN_RATIO,
            "Golden_Spiral": Composition.GOLDEN_SPIRAL,
            "Dynamic_Symmetry": Composition.DYNAMIC_SYMMETRY,
            "Radial_Balance": Composition.RADIAL_BALANCE,
            "Headroom": Composition.HEADROOM,
            "Lead_Room": Composition.LEAD_ROOM,
            "Fill_The_Frame": Composition.FILL_THE_FRAME,
            "Depth_Layering": Composition.DEPTH_LAYERING, "Deep_Focus": Composition.DEPTH_LAYERING,
            "Low_Angle": Composition.DIAGONAL,  # Fallback mapping
            "High_Contrast": Composition.DIAGONAL,  # Fallback
            "Venetian_Blinds": Composition.FRAME_WITHIN_FRAME,  # Style fallback
        }
        
        mood_map = {m.value: m for m in Mood}  # Direct value mapping
        
        color_tone_map = {
            "Warm_Saturated": ColorTone.WARM_SATURATED, "Warm": ColorTone.WARM_SATURATED,
            "Warm_Desaturated": ColorTone.WARM_DESATURATED,
            "Cool_Saturated": ColorTone.COOL_SATURATED, "Cool": ColorTone.COOL_SATURATED,
            "Cool_Desaturated": ColorTone.COOL_DESATURATED,
            "Neutral_Saturated": ColorTone.NEUTRAL_SATURATED, "Neutral": ColorTone.NEUTRAL_SATURATED,
            "Neutral_Desaturated": ColorTone.NEUTRAL_DESATURATED,
            "Monochrome": ColorTone.MONOCHROME,
            "Sepia": ColorTone.SEPIA,
            "Teal_Orange": ColorTone.TEAL_ORANGE, "Teal Orange": ColorTone.TEAL_ORANGE,
            "Cross_Processed": ColorTone.CROSS_PROCESSED,
            "Bleach_Bypass": ColorTone.BLEACH_BYPASS,
            "High_Contrast_BW": ColorTone.HIGH_CONTRAST_BW,
            "Low_Contrast_BW": ColorTone.LOW_CONTRAST_BW,
            "Highly_Saturated": ColorTone.WARM_SATURATED,  # Fallback
            "Muted": ColorTone.NEUTRAL_DESATURATED,  # Fallback
        }
        
        warnings: list[ValidationMessage] = []
        
        # Helper to safely map values
        def get_shot_size(val: str) -> ShotSize:
            if val not in shot_size_map:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_SHOT_SIZE",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown shot size '{val}' in preset '{preset.id}'. Using default.",
                    field_path="visual_grammar.shot_size",
                ))
            return shot_size_map.get(val, ShotSize.MS)
        
        def get_composition(val: str) -> Composition:
            if val not in composition_map:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_COMPOSITION",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown composition '{val}' in preset '{preset.id}'. Using default.",
                    field_path="visual_grammar.composition",
                ))
            return composition_map.get(val, Composition.RULE_OF_THIRDS)
        
        def get_mood(val: str) -> Mood:
            if val not in mood_map:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_MOOD",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown mood '{val}' in preset '{preset.id}'. Using default.",
                    field_path="visual_grammar.mood",
                ))
            return mood_map.get(val, Mood.CONTEMPLATIVE)
        
        def get_color_tone(val: str) -> ColorTone:
            if val not in color_tone_map:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_COLOR_TONE",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown color tone '{val}' in preset '{preset.id}'. Using default.",
                    field_path="visual_grammar.color_tone",
                ))
            return color_tone_map.get(val, ColorTone.NEUTRAL_SATURATED)
        
        # Build visual grammar from preset (use first values)
        visual_grammar = VisualGrammar(
            shot_size=get_shot_size(preset.shot_sizes[0]) if preset.shot_sizes else ShotSize.MS,
            composition=get_composition(preset.composition[0]) if preset.composition else Composition.RULE_OF_THIRDS,
            mood=get_mood(preset.mood[0]) if preset.mood else Mood.CONTEMPLATIVE,
            color_tone=get_color_tone(preset.color_tone[0]) if preset.color_tone else ColorTone.NEUTRAL_SATURATED,
        )
        
        # Map lighting style string to enum
        lighting_style_map = {
            "Low_Key": LightingStyle.LOW_KEY,
            "High_Key": LightingStyle.HIGH_KEY,
            "Soft": LightingStyle.SOFT,
            "Hard": LightingStyle.HARD,
            "Hard_Lighting": LightingStyle.HARD,
            "Soft_Lighting": LightingStyle.SOFT,
            "Naturalistic": LightingStyle.NATURALISTIC,
            "Expressionistic": LightingStyle.EXPRESSIONISTIC,
            "Chiaroscuro": LightingStyle.CHIAROSCURO,
            "Practical_Motivated": LightingStyle.MOTIVATED,
        }
        
        lighting_source_map = {
            "Tungsten": LightingSource.TUNGSTEN,
            "Neon": LightingSource.NEON,
            "Practical_Lights": LightingSource.PRACTICAL,
            "Sun": LightingSource.SUN,
            "Moon": LightingSource.MOON,
            "Window": LightingSource.WINDOW,
            "HMI": LightingSource.HMI,
            "LED": LightingSource.LED,
            "Kino_Flo": LightingSource.KINO_FLO,
            "Mixed": LightingSource.MIXED,
            "Available": LightingSource.AVAILABLE,
            "Candle": LightingSource.CANDLE,
            "Firelight": LightingSource.FIRELIGHT,
        }
        
        # Camera body mapping
        camera_body_map = {cb.value: cb for cb in CameraBody}
        
        # Lens family mapping
        lens_family_map = {lf.value: lf for lf in LensFamily}
        
        # Lens manufacturer mapping
        lens_manufacturer_map = {lm.value: lm for lm in LensManufacturer}
        
        # Film stock mapping
        film_stock_map = {fs.value: fs for fs in FilmStock}
        
        # Aspect ratio mapping
        aspect_ratio_map = {ar.value: ar for ar in AspectRatio}
        
        # Determine camera type from preset
        camera_type = CameraType.FILM if preset.camera_type == "Film" else CameraType.DIGITAL
        
        # Get camera body from preset
        # Default depends on camera type: ARRICAM_ST for film, ALEXA_35 for digital
        if camera_type == CameraType.FILM:
            camera_body = CameraBody.ARRICAM_ST  # Default film camera
        else:
            camera_body = CameraBody.ALEXA_35  # Default digital camera
            
        if preset.camera_body:
            for cb in preset.camera_body:
                if cb in camera_body_map:
                    camera_body = camera_body_map[cb]
                    break
        
        # Get film stock from preset (only for film cameras)
        film_stock = None
        if camera_type == CameraType.FILM and preset.film_stock:
            for fs in preset.film_stock:
                if fs in film_stock_map:
                    film_stock = film_stock_map[fs]
                    break
            # If no exact match, try to find a close match
            if film_stock is None and preset.film_stock:
                stock_str = preset.film_stock[0]
                # Try matching by partial name
                for fs_enum in FilmStock:
                    if stock_str.lower().replace(" ", "_") in fs_enum.value.lower():
                        film_stock = fs_enum
                        break
        
        # Get aspect ratio from preset
        aspect_ratio = AspectRatio.RATIO_1_85  # Default
        if preset.aspect_ratio:
            if preset.aspect_ratio in aspect_ratio_map:
                aspect_ratio = aspect_ratio_map[preset.aspect_ratio]
        
        # Get lens manufacturer from preset with vintage fallback mapping
        lens_manufacturer = LensManufacturer.ARRI  # Default
        vintage_manufacturer_aliases = {
            "Warner_Bros": LensManufacturer.VINTAGE,
            "Paramount": LensManufacturer.VINTAGE,
            "MGM": LensManufacturer.VINTAGE,
            "Universal": LensManufacturer.VINTAGE,
            "Technicolor": LensManufacturer.VINTAGE,
            "Bausch_Lomb": LensManufacturer.BAUSCH_LOMB,
            "Todd_AO": LensManufacturer.TODD_AO,
            "Kowa": LensManufacturer.KOWA,
        }
        if preset.lens_manufacturer:
            for lm in preset.lens_manufacturer:
                if lm in lens_manufacturer_map:
                    lens_manufacturer = lens_manufacturer_map[lm]
                    break
                # Check vintage aliases
                if lm in vintage_manufacturer_aliases:
                    lens_manufacturer = vintage_manufacturer_aliases[lm]
                    break
                # Handle Panavision specifically
                if lm.lower() == "panavision" or "panavision" in lm.lower():
                    lens_manufacturer = LensManufacturer.PANAVISION
                    break
        
        # Get lens family from preset with vintage fallback
        lens_family = LensFamily.ARRI_SIGNATURE_PRIME  # Default
        vintage_family_aliases = {
            "Vintage_Spherical": LensFamily.VINTAGE_SPHERICAL,
            "Vintage_Anamorphic": LensFamily.VINTAGE_ANAMORPHIC,
        }
        if preset.lens_family:
            for lf in preset.lens_family:
                if lf in lens_family_map:
                    lens_family = lens_family_map[lf]
                    break
                # Check vintage aliases
                if lf in vintage_family_aliases:
                    lens_family = vintage_family_aliases[lf]
                    break
        
        # If Panavision camera is selected but no Panavision lens family was set,
        # default to Panavision Primo (required by closed ecosystem rule)
        if camera_body in PANAVISION_CAMERA_BODIES and lens_family not in PANAVISION_LENS_FAMILIES:
            lens_family = LensFamily.PANAVISION_PRIMO
            lens_manufacturer = LensManufacturer.PANAVISION
        
        # Get primary focal length from preset
        focal_length = 35  # Default
        if preset.primary_focal_lengths:
            focal_length = preset.primary_focal_lengths[0]
        
        # Build config with preset values
        config = LiveActionConfig(
            visual_grammar=visual_grammar,
            film_preset=preset_id,
            era=preset.era,
        )
        
        # Map camera body to manufacturer
        camera_manufacturer_map = {
            # ARRI Digital
            CameraBody.ALEXA_35: CameraManufacturer.ARRI,
            CameraBody.ALEXA_MINI: CameraManufacturer.ARRI,
            CameraBody.ALEXA_MINI_LF: CameraManufacturer.ARRI,
            CameraBody.ALEXA_LF: CameraManufacturer.ARRI,
            CameraBody.ALEXA_65: CameraManufacturer.ARRI,
            CameraBody.ALEXA: CameraManufacturer.ARRI,
            CameraBody.ALEXA_XT: CameraManufacturer.ARRI,
            # ARRI Film
            CameraBody.ARRICAM_ST: CameraManufacturer.ARRI_FILM,
            CameraBody.ARRICAM_LT: CameraManufacturer.ARRI_FILM,
            CameraBody.ARRI_535B: CameraManufacturer.ARRI_FILM,
            CameraBody.ARRI_35BL: CameraManufacturer.ARRI_FILM,
            CameraBody.ARRI_35_III: CameraManufacturer.ARRI_FILM,
            CameraBody.ARRIFLEX_35: CameraManufacturer.ARRI_FILM,
            CameraBody.ARRIFLEX_35BL: CameraManufacturer.ARRI_FILM,
            CameraBody.ARRIFLEX_435: CameraManufacturer.ARRI_FILM,
            # RED
            CameraBody.V_RAPTOR: CameraManufacturer.RED,
            CameraBody.V_RAPTOR_X: CameraManufacturer.RED,
            CameraBody.V_RAPTOR_XL: CameraManufacturer.RED,
            CameraBody.KOMODO_X: CameraManufacturer.RED,
            CameraBody.MONSTRO_8K: CameraManufacturer.RED,
            CameraBody.RED_ONE: CameraManufacturer.RED,
            # Sony
            CameraBody.VENICE_2: CameraManufacturer.SONY,
            CameraBody.FX9: CameraManufacturer.SONY,
            CameraBody.FX6: CameraManufacturer.SONY,
            # Canon
            CameraBody.C700_FF: CameraManufacturer.CANON,
            CameraBody.C500_MARK_II: CameraManufacturer.CANON,
            CameraBody.C300_MARK_III: CameraManufacturer.CANON,
            # Blackmagic
            CameraBody.URSA_MINI_PRO_12K: CameraManufacturer.BLACKMAGIC,
            CameraBody.POCKET_6K: CameraManufacturer.BLACKMAGIC,
            # Panasonic
            CameraBody.VARICAM_LT: CameraManufacturer.PANASONIC,
            CameraBody.S1H: CameraManufacturer.PANASONIC,
            # Nikon
            CameraBody.Z9: CameraManufacturer.NIKON,
            # DJI
            CameraBody.INSPIRE_3: CameraManufacturer.DJI,
            CameraBody.MAVIC_3_CINE: CameraManufacturer.DJI,
            # Panavision
            CameraBody.PANAVISION_MILLENNIUM_XL2: CameraManufacturer.PANAVISION,
            CameraBody.PANAVISION_MILLENNIUM: CameraManufacturer.PANAVISION,
            CameraBody.PANAVISION_PLATINUM: CameraManufacturer.PANAVISION,
            CameraBody.PANAVISION_GOLD: CameraManufacturer.PANAVISION,
            CameraBody.PANAVISION_PANASTAR: CameraManufacturer.PANAVISION,
            CameraBody.PANAVISION_PANAFLEX: CameraManufacturer.PANAVISION,
            CameraBody.SUPER_PANAVISION_70: CameraManufacturer.PANAVISION,
            CameraBody.ULTRA_PANAVISION_70: CameraManufacturer.PANAVISION,
            CameraBody.PANAVISION_XL: CameraManufacturer.PANAVISION,
            # Mitchell
            CameraBody.MITCHELL_BNC: CameraManufacturer.MITCHELL,
            CameraBody.MITCHELL_BNCR: CameraManufacturer.MITCHELL,
            CameraBody.MITCHELL_BFC_65: CameraManufacturer.MITCHELL,
            # IMAX
            CameraBody.IMAX_MSM_9802: CameraManufacturer.IMAX_CORP,
            CameraBody.IMAX_MKIV: CameraManufacturer.IMAX_CORP,
            CameraBody.IMAX_GT: CameraManufacturer.IMAX_CORP,
            # Eclair
            CameraBody.ECLAIR_NPR: CameraManufacturer.ECLAIR,
            # Vintage
            CameraBody.UFA_CUSTOM: CameraManufacturer.VINTAGE,
            CameraBody.PATHE_STUDIO: CameraManufacturer.VINTAGE,
        }
        
        # Apply camera settings from preset
        config.camera.camera_type = camera_type
        config.camera.body = camera_body
        # If camera type is film but body not in manufacturer map, default to ARRI_FILM
        default_manufacturer = CameraManufacturer.ARRI_FILM if camera_type == CameraType.FILM else CameraManufacturer.ARRI
        config.camera.manufacturer = camera_manufacturer_map.get(camera_body, default_manufacturer)
        if film_stock:
            config.camera.film_stock = film_stock
        config.camera.aspect_ratio = aspect_ratio
        
        # Apply lens settings from preset
        config.lens.manufacturer = lens_manufacturer
        config.lens.family = lens_family
        config.lens.focal_length_mm = focal_length
        
        movement_equipment_map = {me.value: me for me in MovementEquipment}
        movement_type_map = {mt.value: mt for mt in MovementType}
        movement_timing_map = {mt.value: mt for mt in MovementTiming}
        movement_alias_map = {
            "Controlled": MovementEquipment.STATIC,
            "Controlled_Dolly": MovementEquipment.DOLLY,
            "Extended_Handheld": MovementEquipment.HANDHELD,
            "Extended_Tracking": MovementType.TRACK_IN,
            "Fast_Montage": MovementTiming.FAST,
            "Fast_Tracking": MovementType.TRACK_IN,
            "Floating": MovementEquipment.STATIC,
            "Floating_Handheld": MovementEquipment.HANDHELD,
            "Gentle_Dolly": MovementEquipment.DOLLY,
            "IMAX_Crane": MovementEquipment.CRANE,
            "Kinetic": MovementType.TRACK_IN,
            "Locked_Off": MovementEquipment.STATIC,
            "Mechanical": MovementEquipment.MOTION_CONTROL,
            "Mechanical_Dolly": MovementEquipment.DOLLY,
            "Minimal": MovementEquipment.STATIC,
            "Minimal_Dolly": MovementEquipment.DOLLY,
            "Observational": MovementEquipment.STATIC,
            "Rigid": MovementEquipment.STATIC,
            "Slow": MovementTiming.SLOW,
            "Slow_Crane": MovementEquipment.CRANE,
            "Slow_Creep": MovementType.TRACK_IN,
            "Slow_Dolly": MovementEquipment.DOLLY,
            "Slow_Handheld": MovementEquipment.HANDHELD,
            "Slow_Pan": MovementType.PAN,
            "Slow_Push_In": MovementType.PUSH_IN,
            "Slow_Tracking": MovementType.TRACK_IN,
            "Slow_Zoom": MovementType.ZOOM_IN,
            "Tracking": MovementType.TRACK_IN,
            "Unpredictable": MovementEquipment.HANDHELD,
            "Unsettling_Static": MovementEquipment.STATIC,
        }
        
        # Apply movement from preset
        if preset.movement:
            movement_value = preset.movement[0]
            if movement_value in movement_equipment_map:
                config.movement.equipment = movement_equipment_map[movement_value]
            elif movement_value in movement_type_map:
                config.movement.movement_type = movement_type_map[movement_value]
            elif movement_value in movement_timing_map:
                config.movement.timing = movement_timing_map[movement_value]
            elif movement_value in movement_alias_map:
                alias = movement_alias_map[movement_value]
                if isinstance(alias, MovementEquipment):
                    config.movement.equipment = alias
                elif isinstance(alias, MovementType):
                    config.movement.movement_type = alias
                else:
                    config.movement.timing = alias
            else:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_MOVEMENT",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown movement '{movement_value}' in preset '{preset.id}'. Using default.",
                    field_path="movement",
                ))
        
        # Apply lighting style from preset
        if preset.lighting_style:
            style_str = preset.lighting_style[0]
            if style_str in lighting_style_map:
                config.lighting.style = lighting_style_map[style_str]
            else:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_LIGHTING_STYLE",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown lighting style '{style_str}' in preset '{preset.id}'. Using default.",
                    field_path="lighting.style",
                ))
        
        # Apply lighting source from preset
        if preset.lighting_sources:
            source_str = preset.lighting_sources[0]
            if source_str in lighting_source_map:
                config.lighting.source = lighting_source_map[source_str]
            else:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_LIGHTING_SOURCE",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown lighting source '{source_str}' in preset '{preset.id}'. Using default.",
                    field_path="lighting.source",
                ))
        
        # Apply overrides if provided
        if overrides:
            config = self._apply_overrides(config, overrides)
        
        # Validate the resulting config
        validation = self.validate_live_action(config)
        if warnings:
            validation.messages.extend(warnings)
            if validation.status == "valid":
                validation.status = "warning"
        
        return config, validation
    
    def apply_animation_preset(
        self,
        preset_id: str,
        overrides: dict | None = None,
    ) -> tuple[AnimationConfig, ValidationResult]:
        """
        Apply an animation preset to create a pre-populated AnimationConfig.
        
        Args:
            preset_id: The preset ID (e.g., 'studio_ghibli')
            overrides: Optional dict of field overrides to apply after preset population
        
        Returns:
            Tuple of (populated config, validation result)
        
        Raises:
            ValueError: If preset_id is not found
        """
        preset = ANIMATION_PRESETS.get(preset_id)
        if not preset:
            raise ValueError(f"Unknown preset: '{preset_id}'. Available: {list(ANIMATION_PRESETS.keys())[:10]}...")
        
        warnings: list[ValidationMessage] = []
        
        # Reuse the same mapping functions from live-action (they're scoped in that method)
        # Simplified mappings for animation
        mood_map = {m.value: m for m in Mood}
        composition_map = {c.value: c for c in Composition}
        color_tone_map = {ct.value: ct for ct in ColorTone}
        domain_map = {
            "Anime": StyleDomain.ANIME,
            "Manga": StyleDomain.MANGA,
            "ThreeD": StyleDomain.THREE_D,
            "3D": StyleDomain.THREE_D,
            "Illustration": StyleDomain.ILLUSTRATION,
            "Western_Animation": StyleDomain.WESTERN_ANIMATION,
            "Graphic_Novel": StyleDomain.GRAPHIC_NOVEL,
            "Painterly": StyleDomain.PAINTERLY,
            "Concept_Art": StyleDomain.CONCEPT_ART,
        }
        medium_map = {
            "2D": AnimationMedium.TWO_D,
            "3D": AnimationMedium.THREE_D,
            "Hybrid": AnimationMedium.HYBRID,
            "StopMotion": AnimationMedium.STOP_MOTION,
        }
        
        def get_composition(val: str) -> Composition:
            if val not in composition_map:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_ANIMATION_COMPOSITION",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown composition '{val}' in preset '{preset.id}'. Using default.",
                    field_path="visual_grammar.composition",
                ))
            return composition_map.get(val, Composition.RULE_OF_THIRDS)
        
        def get_mood(val: str) -> Mood:
            if val not in mood_map:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_ANIMATION_MOOD",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown mood '{val}' in preset '{preset.id}'. Using default.",
                    field_path="visual_grammar.mood",
                ))
            return mood_map.get(val, Mood.CONTEMPLATIVE)
        
        def get_color_tone(val: str) -> ColorTone:
            if val not in color_tone_map:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_ANIMATION_COLOR_TONE",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown color tone '{val}' in preset '{preset.id}'. Using default.",
                    field_path="visual_grammar.color_tone",
                ))
            return color_tone_map.get(val, ColorTone.NEUTRAL_SATURATED)
        
        # Build visual grammar from preset (no shot_sizes in AnimationPreset)
        visual_grammar = VisualGrammar(
            shot_size=ShotSize.MS,  # Default for animation
            composition=get_composition(preset.composition[0]) if preset.composition else Composition.RULE_OF_THIRDS,
            mood=get_mood(preset.mood[0]) if preset.mood else Mood.CONTEMPLATIVE,
            color_tone=get_color_tone(preset.color_tone[0]) if preset.color_tone else ColorTone.NEUTRAL_SATURATED,
        )
        
        # Map rendering values from preset
        line_treatment_map = {lt.value: lt for lt in LineTreatment}
        color_application_map = {ca.value: ca for ca in ColorApplication}
        lighting_model_map = {lm.value: lm for lm in LightingModel}
        surface_detail_map = {sd.value: sd for sd in SurfaceDetail}
        motion_style_map = {ms.value: ms for ms in MotionStyle}
        virtual_camera_map = {vc.value: vc for vc in VirtualCamera}
        
        # Build config using preset's domain field (not style_domain)
        config = AnimationConfig(
            medium=medium_map.get(preset.medium, AnimationMedium.TWO_D),
            style_domain=domain_map.get(preset.domain, StyleDomain.ANIME),
            visual_grammar=visual_grammar,
            style_preset=preset_id,
        )
        
        # Apply rendering settings from preset
        if preset.line_treatment:
            if preset.line_treatment in line_treatment_map:
                config.rendering.line_treatment = line_treatment_map[preset.line_treatment]
            else:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_ANIMATION_LINE_TREATMENT",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown line treatment '{preset.line_treatment}' in preset '{preset.id}'. Using default.",
                    field_path="rendering.line_treatment",
                ))
        if preset.color_application:
            if preset.color_application in color_application_map:
                config.rendering.color_application = color_application_map[preset.color_application]
            else:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_ANIMATION_COLOR_APPLICATION",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown color application '{preset.color_application}' in preset '{preset.id}'. Using default.",
                    field_path="rendering.color_application",
                ))
        if preset.lighting_model:
            if preset.lighting_model in lighting_model_map:
                config.rendering.lighting_model = lighting_model_map[preset.lighting_model]
            else:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_ANIMATION_LIGHTING_MODEL",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown lighting model '{preset.lighting_model}' in preset '{preset.id}'. Using default.",
                    field_path="rendering.lighting_model",
                ))
        if preset.surface_detail:
            if preset.surface_detail in surface_detail_map:
                config.rendering.surface_detail = surface_detail_map[preset.surface_detail]
            else:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_ANIMATION_SURFACE_DETAIL",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown surface detail '{preset.surface_detail}' in preset '{preset.id}'. Using default.",
                    field_path="rendering.surface_detail",
                ))
        
        # Apply motion settings from preset
        if preset.motion_style:
            if preset.motion_style in motion_style_map:
                config.motion.motion_style = motion_style_map[preset.motion_style]
            else:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_ANIMATION_MOTION_STYLE",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown motion style '{preset.motion_style}' in preset '{preset.id}'. Using default.",
                    field_path="motion.motion_style",
                ))
        if preset.virtual_camera:
            if preset.virtual_camera in virtual_camera_map:
                config.motion.virtual_camera = virtual_camera_map[preset.virtual_camera]
            else:
                warnings.append(ValidationMessage(
                    rule_id="PRESET_FALLBACK_ANIMATION_VIRTUAL_CAMERA",
                    severity=RuleSeverity.WARNING,
                    message=f"Unknown virtual camera '{preset.virtual_camera}' in preset '{preset.id}'. Using default.",
                    field_path="motion.virtual_camera",
                ))
        
        # Apply overrides if provided
        if overrides:
            config = self._apply_overrides(config, overrides)
        
        # Validate
        validation = self.validate_animation(config)
        if warnings:
            validation.messages.extend(warnings)
            if validation.status == "valid":
                validation.status = "warning"
        
        return config, validation
    
    def _apply_overrides(self, config: Any, overrides: dict) -> Any:
        """Apply dict overrides to a Pydantic config (shallow merge)."""
        config_dict = config.model_dump()
        
        # Deep merge overrides
        for key, value in overrides.items():
            if "." in key:
                # Nested key like "visual_grammar.mood"
                parts = key.split(".")
                target = config_dict
                for part in parts[:-1]:
                    target = target.setdefault(part, {})
                target[parts[-1]] = value
            else:
                config_dict[key] = value
        
        # Reconstruct config
        return type(config).model_validate(config_dict)
    
    def _build_result(self, messages: list[ValidationMessage]) -> ValidationResult:
        """Build validation result from messages."""
        has_hard = any(m.severity == RuleSeverity.HARD for m in messages)
        has_warning = any(m.severity == RuleSeverity.WARNING for m in messages)
        
        if has_hard:
            status = "invalid"
        elif has_warning:
            status = "warning"
        else:
            status = "valid"
        
        return ValidationResult(
            status=status,  # type: ignore[arg-type]
            messages=messages,
            auto_corrections_applied=False,
        )
    
    def get_available_options(
        self,
        field_path: str,
        current_config: LiveActionConfig | AnimationConfig,
    ) -> tuple[list[str], list[str], dict[str, str]]:
        """
        Get available options for a field given current config.
        
        Returns:
            Tuple of (options, disabled_options, disabled_reasons)
        """
        field_to_enum: dict[str, Type[Enum]] = {
            "camera.camera_type": CameraType,
            "camera.manufacturer": CameraManufacturer,
            "camera.body": CameraBody,
            "camera.sensor": SensorSize,
            "camera.film_stock": FilmStock,
            "camera.aspect_ratio": AspectRatio,
            "lens.manufacturer": LensManufacturer,
            "lens.family": LensFamily,
            "movement.equipment": MovementEquipment,
            "movement.movement_type": MovementType,
            "movement.timing": MovementTiming,
            "lighting.time_of_day": TimeOfDay,
            "lighting.source": LightingSource,
            "lighting.style": LightingStyle,
            "visual_grammar.shot_size": ShotSize,
            "visual_grammar.composition": Composition,
            "visual_grammar.mood": Mood,
            "visual_grammar.color_tone": ColorTone,
            "medium": AnimationMedium,
            "style_domain": StyleDomain,
            "rendering.line_treatment": LineTreatment,
            "rendering.color_application": ColorApplication,
            "rendering.lighting_model": LightingModel,
            "rendering.surface_detail": SurfaceDetail,
            "motion.motion_style": MotionStyle,
            "motion.virtual_camera": VirtualCamera,
        }

        enum_type = field_to_enum.get(field_path)
        if not enum_type:
            return [], [], {}

        options = [member.value for member in enum_type]
        disabled_options: list[str] = []
        disabled_reasons: dict[str, str] = {}

        def apply_field_value(config: Any, path: str, value: Any) -> Any:
            config_dict = config.model_dump()
            target = config_dict
            parts = path.split(".")
            for part in parts[:-1]:
                target = target.setdefault(part, {})
            target[parts[-1]] = value
            return type(config).model_validate(config_dict)

        for option in options:
            try:
                candidate = apply_field_value(current_config, field_path, enum_type(option))
            except Exception:
                disabled_options.append(option)
                disabled_reasons[option] = "Invalid value for current configuration."
                continue

            if isinstance(candidate, LiveActionConfig):
                result = self.validate_live_action(candidate)
            else:
                result = self.validate_animation(candidate)

            hard_messages = [m for m in result.messages if m.severity == RuleSeverity.HARD]
            if hard_messages:
                disabled_options.append(option)
                disabled_reasons[option] = hard_messages[0].message

        return options, disabled_options, disabled_reasons
