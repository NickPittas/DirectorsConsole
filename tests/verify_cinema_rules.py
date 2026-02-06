#!/usr/bin/env python3
"""Quick test script to verify cinema_rules module works."""

import sys
sys.path.insert(0, r'Z:\python\DirectorsConsole\CinemaPromptEngineering')

def test_imports():
    """Test that all cinema_rules modules can be imported."""
    print("Testing cinema_rules imports...")
    
    # Test main package import
    import cinema_rules
    print(f"✓ cinema_rules imported, version: {cinema_rules.__version__}")
    
    # Test schemas
    from cinema_rules.schemas.common import ShotSize, Mood, Composition
    print(f"✓ common schemas imported: ShotSize={ShotSize.CU}, Mood={Mood.CONTEMPLATIVE}")
    
    from cinema_rules.schemas.live_action import (
        LiveActionConfig, CameraType, CameraBody, FilmStock
    )
    print(f"✓ live_action schemas imported: CameraType={CameraType.DIGITAL}")
    
    from cinema_rules.schemas.animation import AnimationConfig, AnimationMedium
    print(f"✓ animation schemas imported: AnimationMedium={AnimationMedium.TWO_D}")
    
    # Test rules engine
    from cinema_rules.rules.engine import RuleEngine
    engine = RuleEngine()
    print(f"✓ RuleEngine instantiated")
    
    # Test presets
    from cinema_rules.presets import LIVE_ACTION_PRESETS, ANIMATION_PRESETS
    print(f"✓ Presets imported: {len(LIVE_ACTION_PRESETS)} live-action, {len(ANIMATION_PRESETS)} animation")
    
    # Test prompt generator
    from cinema_rules.prompts.generator import PromptGenerator
    generator = PromptGenerator()
    print(f"✓ PromptGenerator instantiated")
    
    return True

def test_config_creation():
    """Test creating configs."""
    print("\nTesting config creation...")
    
    from cinema_rules.schemas.live_action import LiveActionConfig
    from cinema_rules.schemas.animation import AnimationConfig
    
    live_config = LiveActionConfig()
    print(f"✓ LiveActionConfig created: camera={live_config.camera.body}")
    
    anim_config = AnimationConfig()
    print(f"✓ AnimationConfig created: medium={anim_config.medium}")
    
    return True

def test_rule_engine():
    """Test RuleEngine validation."""
    print("\nTesting RuleEngine...")
    
    from cinema_rules.rules.engine import RuleEngine
    from cinema_rules.schemas.live_action import LiveActionConfig
    from cinema_rules.schemas.animation import AnimationConfig
    
    engine = RuleEngine()
    
    # Test live-action validation
    live_config = LiveActionConfig()
    result = engine.validate_live_action(live_config)
    print(f"✓ Live-action validation: status={result.status}, messages={len(result.messages)}")
    
    # Test animation validation
    anim_config = AnimationConfig()
    result = engine.validate_animation(anim_config)
    print(f"✓ Animation validation: status={result.status}, messages={len(result.messages)}")
    
    return True

def test_presets():
    """Test preset access."""
    print("\nTesting presets...")
    
    from cinema_rules.presets import LIVE_ACTION_PRESETS, ANIMATION_PRESETS
    
    # Check some well-known presets
    if 'blade_runner' in LIVE_ACTION_PRESETS:
        preset = LIVE_ACTION_PRESETS['blade_runner']
        print(f"✓ blade_runner preset found: {preset.name} ({preset.year})")
    else:
        print(f"! blade_runner preset not found, but {len(LIVE_ACTION_PRESETS)} presets available")
    
    if 'studio_ghibli' in ANIMATION_PRESETS:
        preset = ANIMATION_PRESETS['studio_ghibli']
        print(f"✓ studio_ghibli preset found: {preset.name}")
    else:
        print(f"! studio_ghibli preset not found, but {len(ANIMATION_PRESETS)} presets available")
    
    return True

def main():
    """Run all tests."""
    print("=" * 60)
    print("Cinema Rules Engine - Port Verification Tests")
    print("=" * 60)
    
    try:
        test_imports()
        test_config_creation()
        test_rule_engine()
        test_presets()
        
        print("\n" + "=" * 60)
        print("ALL TESTS PASSED ✓")
        print("=" * 60)
        return 0
        
    except Exception as e:
        print(f"\n✗ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
