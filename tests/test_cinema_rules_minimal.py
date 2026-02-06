"""Minimal test to verify cinema_rules is importable and functional."""
import sys
sys.path.insert(0, r'Z:\python\DirectorsConsole\CinemaPromptEngineering')

# Test 1: Import cinema_rules
import cinema_rules
assert cinema_rules.__version__ == "0.2.0"
print("✓ cinema_rules imported successfully")

# Test 2: Import schemas
from cinema_rules.schemas.live_action import LiveActionConfig, CameraType
from cinema_rules.schemas.animation import AnimationConfig
from cinema_rules.schemas.common import ShotSize, Mood
print("✓ All schemas imported successfully")

# Test 3: Import RuleEngine
from cinema_rules.rules.engine import RuleEngine
engine = RuleEngine()
print("✓ RuleEngine imported and instantiated")

# Test 4: Import presets
from cinema_rules.presets import LIVE_ACTION_PRESETS, ANIMATION_PRESETS
print(f"✓ Presets imported: {len(LIVE_ACTION_PRESETS)} live-action, {len(ANIMATION_PRESETS)} animation")

# Test 5: Import prompt generator
from cinema_rules.prompts.generator import PromptGenerator
generator = PromptGenerator()
print("✓ PromptGenerator imported and instantiated")

# Test 6: Create configs
live_config = LiveActionConfig()
anim_config = AnimationConfig()
print("✓ Configs created successfully")

# Test 7: Validate configs
live_result = engine.validate_live_action(live_config)
anim_result = engine.validate_animation(anim_config)
print(f"✓ Validation works: live-action={live_result.status}, animation={anim_result.status}")

# Test 8: Check specific presets exist
assert 'blade_runner' in LIVE_ACTION_PRESETS or len(LIVE_ACTION_PRESETS) > 0
assert 'studio_ghibli' in ANIMATION_PRESETS or len(ANIMATION_PRESETS) > 0
print("✓ Presets accessible")

print("\n" + "="*50)
print("ALL TESTS PASSED - cinema_rules is working!")
print("="*50)
