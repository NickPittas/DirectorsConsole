"""Tests for cross-platform path translation."""

import json
import platform
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from orchestrator.path_translator import PathTranslator, PathMapping, _normalize_prefix


# ============================================================================
# Unit Tests for _normalize_prefix
# ============================================================================

class TestNormalizePrefix:
    """Tests for the _normalize_prefix helper function."""

    def test_empty_string(self):
        assert _normalize_prefix("") == ""

    def test_forward_slashes_unchanged(self):
        assert _normalize_prefix("/mnt/Mandalore") == "/mnt/Mandalore"

    def test_backslashes_converted(self):
        assert _normalize_prefix("W:\\Projects") == "W:/Projects"

    def test_trailing_slash_removed(self):
        assert _normalize_prefix("/mnt/Mandalore/") == "/mnt/Mandalore"

    def test_drive_letter_trailing_slash_kept(self):
        assert _normalize_prefix("C:/") == "C:/"

    def test_drive_letter_backslash_converted(self):
        assert _normalize_prefix("W:\\") == "W:/"

    def test_unc_path(self):
        assert _normalize_prefix("\\\\server\\share") == "//server/share"


# ============================================================================
# Unit Tests for PathMapping
# ============================================================================

class TestPathMapping:
    """Tests for the PathMapping dataclass."""

    def test_to_dict(self):
        mapping = PathMapping(
            id="test-1",
            name="NAS",
            windows="W:\\",
            linux="/mnt/Mandalore",
            macos="/Volumes/Mandalore",
            enabled=True,
        )
        d = mapping.to_dict()
        assert d["id"] == "test-1"
        assert d["name"] == "NAS"
        assert d["windows"] == "W:\\"
        assert d["linux"] == "/mnt/Mandalore"
        assert d["macos"] == "/Volumes/Mandalore"
        assert d["enabled"] is True

    def test_from_dict(self):
        d = {
            "id": "test-2",
            "name": "Render Farm",
            "windows": "Z:\\Renders",
            "linux": "/mnt/renders",
            "macos": "/Volumes/Renders",
            "enabled": False,
        }
        mapping = PathMapping.from_dict(d)
        assert mapping.id == "test-2"
        assert mapping.name == "Render Farm"
        assert mapping.enabled is False

    def test_from_dict_defaults(self):
        d = {"name": "Minimal"}
        mapping = PathMapping.from_dict(d)
        assert mapping.name == "Minimal"
        assert mapping.windows == ""
        assert mapping.linux == ""
        assert mapping.macos == ""
        assert mapping.enabled is True
        assert mapping.id  # Auto-generated UUID


# ============================================================================
# Unit Tests for PathTranslator
# ============================================================================

class TestPathTranslator:
    """Tests for the PathTranslator class."""

    def _make_translator(self, current_os: str = "linux") -> PathTranslator:
        """Create a translator with a temporary config file."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            json.dump({"version": 1, "mappings": []}, f)
            config_path = f.name

        translator = PathTranslator(config_path=config_path)
        translator._current_os = current_os
        return translator

    def test_add_mapping(self):
        t = self._make_translator()
        mapping = t.add_mapping(
            name="NAS",
            windows="W:\\",
            linux="/mnt/Mandalore",
            macos="/Volumes/Mandalore",
        )
        assert len(t.mappings) == 1
        assert mapping.name == "NAS"

    def test_remove_mapping(self):
        t = self._make_translator()
        mapping = t.add_mapping(name="Test", windows="X:\\")
        assert t.remove_mapping(mapping.id) is True
        assert len(t.mappings) == 0

    def test_remove_nonexistent(self):
        t = self._make_translator()
        assert t.remove_mapping("nonexistent") is False

    def test_update_mapping(self):
        t = self._make_translator()
        mapping = t.add_mapping(name="Old Name")
        updated = t.update_mapping(mapping.id, name="New Name")
        assert updated is not None
        assert updated.name == "New Name"

    def test_update_nonexistent(self):
        t = self._make_translator()
        assert t.update_mapping("nonexistent", name="Nope") is None

    def test_get_mapping(self):
        t = self._make_translator()
        mapping = t.add_mapping(name="Findme")
        found = t.get_mapping(mapping.id)
        assert found is not None
        assert found.name == "Findme"

    # --------------------------------------------------------------------------
    # Path Translation Tests
    # --------------------------------------------------------------------------

    def test_windows_to_linux(self):
        """Windows path should translate to Linux path when running on Linux."""
        t = self._make_translator(current_os="linux")
        t.add_mapping(
            name="NAS",
            windows="W:\\",
            linux="/mnt/Mandalore",
            macos="/Volumes/Mandalore",
        )
        result = t.to_local("W:\\Projects\\MyFilm")
        assert result == "/mnt/Mandalore/Projects/MyFilm"

    def test_windows_to_macos(self):
        """Windows path should translate to macOS path when running on macOS."""
        t = self._make_translator(current_os="macos")
        t.add_mapping(
            name="NAS",
            windows="W:\\",
            linux="/mnt/Mandalore",
            macos="/Volumes/Mandalore",
        )
        result = t.to_local("W:\\Projects\\MyFilm")
        assert result == "/Volumes/Mandalore/Projects/MyFilm"

    def test_linux_to_windows(self):
        """Linux path should translate to Windows path when running on Windows."""
        t = self._make_translator(current_os="windows")
        t.add_mapping(
            name="NAS",
            windows="W:\\",
            linux="/mnt/Mandalore",
            macos="/Volumes/Mandalore",
        )
        result = t.to_local("/mnt/Mandalore/Projects/MyFilm")
        assert result == "W:\\Projects\\MyFilm"

    def test_macos_to_linux(self):
        """macOS path should translate to Linux path when running on Linux."""
        t = self._make_translator(current_os="linux")
        t.add_mapping(
            name="NAS",
            windows="W:\\",
            linux="/mnt/Mandalore",
            macos="/Volumes/Mandalore",
        )
        result = t.to_local("/Volumes/Mandalore/Projects/MyFilm")
        assert result == "/mnt/Mandalore/Projects/MyFilm"

    def test_local_path_unchanged(self):
        """A path already in the local format should remain unchanged."""
        t = self._make_translator(current_os="linux")
        t.add_mapping(
            name="NAS",
            windows="W:\\",
            linux="/mnt/Mandalore",
            macos="/Volumes/Mandalore",
        )
        result = t.to_local("/mnt/Mandalore/Projects/MyFilm")
        assert result == "/mnt/Mandalore/Projects/MyFilm"

    def test_no_mapping_returns_original(self):
        """Path with no matching mapping should be returned unchanged."""
        t = self._make_translator(current_os="linux")
        result = t.to_local("/some/random/path")
        assert result == "/some/random/path"

    def test_disabled_mapping_ignored(self):
        """Disabled mappings should not be used for translation."""
        t = self._make_translator(current_os="linux")
        t.add_mapping(
            name="Disabled NAS",
            windows="W:\\",
            linux="/mnt/Mandalore",
            macos="/Volumes/Mandalore",
            enabled=False,
        )
        result = t.to_local("W:\\Projects\\MyFilm")
        # Should not translate because mapping is disabled
        assert result == "W:/Projects/MyFilm"  # Only backslash normalization

    def test_case_insensitive_windows_match(self):
        """Windows drive letters should match case-insensitively."""
        t = self._make_translator(current_os="linux")
        t.add_mapping(
            name="NAS",
            windows="w:\\",
            linux="/mnt/Mandalore",
        )
        result = t.to_local("W:\\Projects\\MyFilm")
        assert result == "/mnt/Mandalore/Projects/MyFilm"

    def test_multiple_mappings(self):
        """Multiple mappings should each translate their respective paths."""
        t = self._make_translator(current_os="linux")
        t.add_mapping(name="NAS1", windows="W:\\", linux="/mnt/nas1")
        t.add_mapping(name="NAS2", windows="X:\\", linux="/mnt/nas2")

        assert t.to_local("W:\\data") == "/mnt/nas1/data"
        assert t.to_local("X:\\renders") == "/mnt/nas2/renders"

    def test_forward_slash_windows_path(self):
        """Windows paths with forward slashes should also translate."""
        t = self._make_translator(current_os="linux")
        t.add_mapping(name="NAS", windows="W:\\", linux="/mnt/Mandalore")
        result = t.to_local("W:/Projects/MyFilm")
        assert result == "/mnt/Mandalore/Projects/MyFilm"

    def test_empty_path(self):
        """Empty path should return empty string."""
        t = self._make_translator()
        assert t.to_local("") == ""

    def test_deep_nested_path(self):
        """Deep nested paths should translate correctly."""
        t = self._make_translator(current_os="linux")
        t.add_mapping(
            name="NAS",
            windows="W:\\",
            linux="/mnt/Mandalore",
        )
        result = t.to_local("W:\\a\\b\\c\\d\\e\\file.png")
        assert result == "/mnt/Mandalore/a/b/c/d/e/file.png"

    # --------------------------------------------------------------------------
    # from_local Tests
    # --------------------------------------------------------------------------

    def test_from_local(self):
        """Should translate local path to target OS format."""
        t = self._make_translator(current_os="linux")
        t.add_mapping(
            name="NAS",
            windows="W:\\",
            linux="/mnt/Mandalore",
            macos="/Volumes/Mandalore",
        )
        result = t.from_local("/mnt/Mandalore/Projects/MyFilm", "windows")
        assert result == "W:\\Projects\\MyFilm"

    def test_from_local_same_os(self):
        """Translating to the same OS should return path unchanged."""
        t = self._make_translator(current_os="linux")
        result = t.from_local("/mnt/test/file.png", "linux")
        assert result == "/mnt/test/file.png"

    # --------------------------------------------------------------------------
    # translate_path_in_dict Tests
    # --------------------------------------------------------------------------

    def test_translate_dict(self):
        """Should translate path values in dictionaries."""
        t = self._make_translator(current_os="linux")
        t.add_mapping(name="NAS", windows="W:\\", linux="/mnt/nas")

        data = {
            "folder_path": "W:\\Projects",
            "filename": "test.png",
            "image_path": "W:\\Images\\render.png",
        }
        result = t.translate_path_in_dict(data)
        assert result["folder_path"] == "/mnt/nas/Projects"
        assert result["filename"] == "test.png"  # Not a path key
        assert result["image_path"] == "/mnt/nas/Images/render.png"

    # --------------------------------------------------------------------------
    # Persistence Tests
    # --------------------------------------------------------------------------

    def test_save_and_load(self):
        """Mappings should persist across translator instances."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            json.dump({"version": 1, "mappings": []}, f)
            config_path = f.name

        # Create and add mapping
        t1 = PathTranslator(config_path=config_path)
        t1.add_mapping(name="Persistent", windows="Z:\\", linux="/mnt/z")

        # Load in new instance
        t2 = PathTranslator(config_path=config_path)
        assert len(t2.mappings) == 1
        assert t2.mappings[0].name == "Persistent"

    def test_export_import(self):
        """Export and import should round-trip correctly."""
        t = self._make_translator()
        t.add_mapping(name="Export1", windows="W:\\", linux="/mnt/w")
        t.add_mapping(name="Export2", windows="X:\\", linux="/mnt/x")

        exported = t.export_mappings()
        assert len(exported) == 2

        t2 = self._make_translator()
        count = t2.import_mappings(exported)
        assert count == 2
        assert len(t2.mappings) == 2

    def test_import_replace(self):
        """Import with replace=True should clear existing mappings."""
        t = self._make_translator()
        t.add_mapping(name="Existing")
        t.import_mappings([{"name": "Replacement", "id": "new-1"}], replace=True)
        assert len(t.mappings) == 1
        assert t.mappings[0].name == "Replacement"


# ============================================================================
# Integration-style Tests
# ============================================================================

class TestPathTranslatorRealWorld:
    """Real-world scenario tests."""

    def _make_translator(self, current_os: str) -> PathTranslator:
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            json.dump({"version": 1, "mappings": []}, f)
            config_path = f.name
        translator = PathTranslator(config_path=config_path)
        translator._current_os = current_os
        return translator

    def test_nas_workflow_windows_to_linux(self):
        """Simulate: project saved on Windows, backend running on Linux."""
        t = self._make_translator("linux")
        t.add_mapping(
            name="TrueNAS",
            windows="W:\\",
            linux="/mnt/Mandalore",
            macos="/Volumes/Mandalore",
        )
        
        # Paths that would come from a Windows-saved project
        assert t.to_local("W:\\VFX\\Eliot\\renders") == "/mnt/Mandalore/VFX/Eliot/renders"
        assert t.to_local("W:\\VFX\\Eliot\\renders\\Panel_01\\image_v001.png") == \
            "/mnt/Mandalore/VFX/Eliot/renders/Panel_01/image_v001.png"

    def test_nas_workflow_linux_to_windows(self):
        """Simulate: project saved on Linux, backend running on Windows."""
        t = self._make_translator("windows")
        t.add_mapping(
            name="TrueNAS",
            windows="W:\\",
            linux="/mnt/Mandalore",
            macos="/Volumes/Mandalore",
        )
        
        assert t.to_local("/mnt/Mandalore/VFX/Eliot/renders") == "W:\\VFX\\Eliot\\renders"

    def test_multi_nas_setup(self):
        """Multiple NAS volumes with different mount points."""
        t = self._make_translator("linux")
        t.add_mapping(
            name="Mandalore (projects)",
            windows="W:\\",
            linux="/mnt/Mandalore",
        )
        t.add_mapping(
            name="Render Farm",
            windows="R:\\",
            linux="/mnt/renderfarm",
        )
        
        assert t.to_local("W:\\Projects\\shot01") == "/mnt/Mandalore/Projects/shot01"
        assert t.to_local("R:\\output\\frame001.exr") == "/mnt/renderfarm/output/frame001.exr"

    def test_unc_path_translation(self):
        """UNC server paths (\\\\server\\share) should translate."""
        t = self._make_translator("linux")
        t.add_mapping(
            name="File Server",
            windows="\\\\fileserver\\vfx",
            linux="/mnt/fileserver/vfx",
        )
        
        result = t.to_local("\\\\fileserver\\vfx\\projects\\shot01")
        assert result == "/mnt/fileserver/vfx/projects/shot01"
