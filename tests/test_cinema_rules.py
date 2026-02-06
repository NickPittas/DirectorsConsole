"""Tests for cinema_rules engine - verifies imports and basic functionality."""

import pytest


def test_import_cinema_rules():
    """Test that cinema_rules package can be imported."""
    import cinema_rules
    assert cinema_rules is not None
    assert hasattr(cinema_rules, '__version__')


def test_import_schemas():
    """Test that all schema modules can be imported."""
    from cinema_rules.schemas.common import (
        ShotSize,
        Composition,
        Mood,
        ColorTone,
        RuleSeverity,
        ValidationMessage,
        ValidationResult,
        ProjectConfig,
        ProjectType,
        VisualGrammar,
    )
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
        CameraConfig,
        LensConfig,
        MovementConfig,
        LightingConfig,
    )
    from cinema_rules.schemas.animation import (
        AnimationConfig,
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
    
    # Verify key enums
    assert CameraType.DIGITAL is not None
    assert CameraType.FILM is not None
    assert ShotSize.CU is not None
    assert Mood.CONTEMPLATIVE is not None


def test_import_rules_engine():
    """Test that RuleEngine can be imported and instantiated."""
    from cinema_rules.rules.engine import RuleEngine
    
    engine = RuleEngine()
    assert engine is not None
    assert hasattr(engine, 'validate_live_action')
    assert hasattr(engine, 'validate_animation')


def test_import_presets():
    """Test that presets can be imported."""
    from cinema_rules.presets import LIVE_ACTION_PRESETS, ANIMATION_PRESETS
    
    assert LIVE_ACTION_PRESETS is not None
    assert ANIMATION_PRESETS is not None
    assert len(LIVE_ACTION_PRESETS) > 0
    assert len(ANIMATION_PRESETS) > 0


def test_import_prompt_generator():
    """Test that prompt generator can be imported."""
    from cinema_rules.prompts.generator import PromptGenerator
    
    generator = PromptGenerator()
    assert generator is not None
    assert hasattr(generator, 'generate_live_action_prompt')
    assert hasattr(generator, 'generate_animation_prompt')


def test_live_action_config_creation():
    """Test creating a LiveActionConfig."""
    from cinema_rules.schemas.live_action import LiveActionConfig, CameraConfig
    
    config = LiveActionConfig()
    assert config is not None
    assert config.camera is not None


def test_animation_config_creation():
    """Test creating an AnimationConfig."""
    from cinema_rules.schemas.animation import AnimationConfig
    
    config = AnimationConfig()
    assert config is not None
    assert config.medium is not None


def test_rule_engine_validate_live_action():
    """Test RuleEngine validation with a basic config."""
    from cinema_rules.rules.engine import RuleEngine
    from cinema_rules.schemas.live_action import LiveActionConfig
    
    engine = RuleEngine()
    config = LiveActionConfig()
    result = engine.validate_live_action(config)
    
    assert result is not None
    assert result.status in ['valid', 'warning', 'invalid']
    assert isinstance(result.messages, list)


def test_rule_engine_validate_animation():
    """Test RuleEngine validation with an animation config."""
    from cinema_rules.rules.engine import RuleEngine
    from cinema_rules.schemas.animation import AnimationConfig
    
    engine = RuleEngine()
    config = AnimationConfig()
    result = engine.validate_animation(config)
    
    assert result is not None
    assert result.status in ['valid', 'warning', 'invalid']
    assert isinstance(result.messages, list)


def test_preset_access():
    """Test accessing specific presets."""
    from cinema_rules.presets import LIVE_ACTION_PRESETS, ANIMATION_PRESETS
    
    # Check some well-known presets exist
    assert 'blade_runner' in LIVE_ACTION_PRESETS or len(LIVE_ACTION_PRESETS) > 0
    assert 'studio_ghibli' in ANIMATION_PRESETS or len(ANIMATION_PRESETS) > 0
