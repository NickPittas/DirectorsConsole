"""Cinema Rules Engine - Professional cinematography prompt generator."""

from cinema_rules.schemas.live_action import (
    LiveActionConfig,
    CameraType,
    CameraManufacturer,
    CameraBody,
    SensorSize,
    WeightClass,
    FilmStock,
    AspectRatio,
    LensManufacturer,
    LensFamily,
    LensMountType,
    MovementEquipment,
    MovementType,
    MovementTiming,
    TimeOfDay,
    LightingSource,
    LightingStyle,
)
from cinema_rules.schemas.animation import AnimationConfig
from cinema_rules.schemas.common import ProjectConfig, ValidationResult
from cinema_rules.rules.engine import RuleEngine
from cinema_rules.target_models import (
    TARGET_MODELS,
    MODEL_ID_ALIASES,
    get_target_model_ids,
    get_target_models,
    normalize_target_model,
)

__all__ = [
    # Configs
    "LiveActionConfig",
    "AnimationConfig", 
    "ProjectConfig",
    "ValidationResult",
    "RuleEngine",
    # Shared target model catalog
    "TARGET_MODELS",
    "MODEL_ID_ALIASES",
    "get_target_model_ids",
    "get_target_models",
    "normalize_target_model",
    # Camera System
    "CameraType",
    "CameraManufacturer",
    "CameraBody",
    "SensorSize",
    "WeightClass",
    "FilmStock",
    "AspectRatio",
    # Lens System
    "LensManufacturer",
    "LensFamily",
    "LensMountType",
    # Movement System
    "MovementEquipment",
    "MovementType",
    "MovementTiming",
    # Lighting System
    "TimeOfDay",
    "LightingSource",
    "LightingStyle",
]

__version__ = "0.2.0"
