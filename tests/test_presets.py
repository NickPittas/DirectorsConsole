"""Tests for film presets and thumbnail images.

This module verifies that:
1. Film presets directory exists with 35+ preset definitions
2. Movie frame images directory exists with 35+ thumbnail images
"""

import os
from pathlib import Path

# Base paths
BASE_DIR = Path(__file__).parent.parent
CINEMA_DIR = BASE_DIR / "CinemaPromptEngineering"
PRESETS_DIR = CINEMA_DIR / "cinema_rules" / "presets"
IMAGES_DIR = CINEMA_DIR / "frontend" / "public" / "movie-frames"


class TestFilmPresets:
    """Test suite for film presets and thumbnail images."""

    def test_presets_directory_exists(self):
        """Verify the presets directory exists."""
        assert PRESETS_DIR.exists(), f"Presets directory not found: {PRESETS_DIR}"
        assert PRESETS_DIR.is_dir(), f"Presets path is not a directory: {PRESETS_DIR}"

    def test_presets_python_files_exist(self):
        """Verify preset Python files exist."""
        required_files = [
            "__init__.py",
            "live_action.py",
            "animation.py",
            "cinematography_styles.py",
        ]
        for filename in required_files:
            filepath = PRESETS_DIR / filename
            assert filepath.exists(), f"Required preset file not found: {filename}"

    def test_live_action_presets_count(self):
        """Verify live_action.py contains 35+ film presets."""
        live_action_file = PRESETS_DIR / "live_action.py"
        assert live_action_file.exists(), "live_action.py not found"
        
        content = live_action_file.read_text(encoding="utf-8")
        # Count FilmPreset( occurrences (excluding the class definition)
        preset_count = content.count("FilmPreset(") - 1  # -1 for class definition
        assert preset_count >= 35, f"Expected 35+ live-action presets, found {preset_count}"

    def test_animation_presets_count(self):
        """Verify animation.py contains preset definitions."""
        animation_file = PRESETS_DIR / "animation.py"
        assert animation_file.exists(), "animation.py not found"
        
        content = animation_file.read_text(encoding="utf-8")
        # Count AnimationPreset( occurrences (excluding the class definition)
        preset_count = content.count("AnimationPreset(") - 1  # -1 for class definition
        assert preset_count >= 10, f"Expected 10+ animation presets, found {preset_count}"

    def test_total_presets_count(self):
        """Verify total presets (live-action + animation) is 35+."""
        live_action_file = PRESETS_DIR / "live_action.py"
        animation_file = PRESETS_DIR / "animation.py"
        
        live_content = live_action_file.read_text(encoding="utf-8")
        anim_content = animation_file.read_text(encoding="utf-8")
        
        live_count = live_content.count("FilmPreset(") - 1
        anim_count = anim_content.count("AnimationPreset(") - 1
        total = live_count + anim_count
        
        assert total >= 35, f"Expected 35+ total presets, found {total}"

    def test_images_directory_exists(self):
        """Verify the movie-frames images directory exists."""
        assert IMAGES_DIR.exists(), f"Images directory not found: {IMAGES_DIR}"
        assert IMAGES_DIR.is_dir(), f"Images path is not a directory: {IMAGES_DIR}"

    def test_images_count(self):
        """Verify there are 35+ thumbnail images."""
        assert IMAGES_DIR.exists(), "Images directory not found"
        
        # Count .jpg files
        image_files = list(IMAGES_DIR.glob("*.jpg"))
        image_count = len(image_files)
        
        assert image_count >= 35, f"Expected 35+ images, found {image_count}"

    def test_images_are_valid_jpg(self):
        """Verify image files are valid JPEGs (start with JPEG magic bytes)."""
        assert IMAGES_DIR.exists(), "Images directory not found"
        
        image_files = list(IMAGES_DIR.glob("*.jpg"))
        assert len(image_files) > 0, "No .jpg files found"
        
        # Check first few images for valid JPEG header
        jpeg_magic = b"\xff\xd8\xff"
        for img_path in image_files[:10]:  # Check first 10
            with open(img_path, "rb") as f:
                header = f.read(3)
                assert header == jpeg_magic, f"{img_path.name} is not a valid JPEG"

    def test_preset_images_match_presets(self):
        """Verify that preset IDs have corresponding images (for key presets)."""
        # Key presets that should have images
        key_presets = [
            "blade-runner",
            "citizen-kane",
            "the-godfather",
            "studio-ghibli",
            "pixar",
        ]
        
        for preset_id in key_presets:
            img_path = IMAGES_DIR / f"{preset_id}.jpg"
            assert img_path.exists(), f"Missing image for preset: {preset_id}"
