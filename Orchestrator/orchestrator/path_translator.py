"""Cross-platform path translation for Director's Console.

Translates file paths between Windows, Linux, and macOS mount points.
This allows the application to work across different operating systems
that access the same shared storage (NAS, TrueNAS, etc.) at different
mount paths.

Example mapping:
    Windows: W:\\
    Linux:   /mnt/Mandalore
    macOS:   /Volumes/Mandalore

A path like "W:\\Projects\\MyFilm" on Windows would become
"/mnt/Mandalore/Projects/MyFilm" on Linux.

Usage:
    from orchestrator.path_translator import path_translator

    # Add a mapping
    path_translator.add_mapping(
        name="NAS Storage",
        windows="W:\\\\",
        linux="/mnt/Mandalore",
        macos="/Volumes/Mandalore"
    )

    # Translate a path (auto-detects current OS)
    local_path = path_translator.to_local("W:\\\\Projects\\\\MyFilm")
    # On Linux: "/mnt/Mandalore/Projects/MyFilm"
"""

from __future__ import annotations

import json
import logging
import platform
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class PathMapping:
    """A single path mapping between OS mount points.
    
    Attributes:
        id: Unique identifier for this mapping.
        name: Human-readable label (e.g., "NAS Storage", "Render Farm").
        windows: Windows path prefix (e.g., "W:\\" or "\\\\server\\share").
        linux: Linux path prefix (e.g., "/mnt/Mandalore").
        macos: macOS path prefix (e.g., "/Volumes/Mandalore").
        enabled: Whether this mapping is active.
    """
    id: str
    name: str
    windows: str
    linux: str
    macos: str
    enabled: bool = True

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PathMapping:
        """Deserialize from dictionary."""
        return cls(
            id=data.get("id", str(uuid.uuid4())),
            name=data.get("name", "Unnamed"),
            windows=data.get("windows", ""),
            linux=data.get("linux", ""),
            macos=data.get("macos", ""),
            enabled=data.get("enabled", True),
        )


def _normalize_prefix(prefix: str) -> str:
    """Normalize a path prefix for consistent matching.
    
    - Convert backslashes to forward slashes
    - Remove trailing slash (unless it's a root like "/" or "C:/")
    - Lowercase drive letters for Windows paths
    """
    if not prefix:
        return ""
    
    # Convert all backslashes to forward slashes
    normalized = prefix.replace("\\", "/")
    
    # Remove trailing slash unless it's a root path
    if len(normalized) > 1 and normalized.endswith("/"):
        # Keep trailing slash for bare drive letters like "C:/"
        if len(normalized) == 3 and normalized[1] == ":":
            pass  # Keep "C:/"
        else:
            normalized = normalized.rstrip("/")
    
    return normalized


def _get_current_os() -> str:
    """Detect the current operating system.
    
    Returns:
        One of 'windows', 'linux', or 'macos'.
    """
    system = platform.system()
    if system == "Windows":
        return "windows"
    elif system == "Darwin":
        return "macos"
    else:
        return "linux"


class PathTranslator:
    """Manages path mappings and translates paths between operating systems.
    
    The translator stores mappings in a JSON file and provides methods
    to convert paths from any OS format to the current OS format.
    """

    def __init__(self, config_path: str | Path | None = None) -> None:
        """Initialize the path translator.
        
        Args:
            config_path: Path to the JSON config file for persisting mappings.
                         If None, uses a default location in the app data directory.
        """
        self._mappings: list[PathMapping] = []
        self._current_os = _get_current_os()
        
        if config_path is None:
            # Default config location: next to the orchestrator data directory
            self._config_path = Path(__file__).parent / "data" / "path_mappings.json"
        else:
            self._config_path = Path(config_path)
        
        self._load_config()

    @property
    def current_os(self) -> str:
        """The detected operating system ('windows', 'linux', or 'macos')."""
        return self._current_os

    @property
    def mappings(self) -> list[PathMapping]:
        """All configured path mappings."""
        return list(self._mappings)

    def add_mapping(
        self,
        name: str,
        windows: str = "",
        linux: str = "",
        macos: str = "",
        enabled: bool = True,
        mapping_id: str | None = None,
    ) -> PathMapping:
        """Add a new path mapping.
        
        Args:
            name: Human-readable label for this mapping.
            windows: Windows path prefix.
            linux: Linux path prefix.
            macos: macOS path prefix.
            enabled: Whether this mapping is active.
            mapping_id: Optional ID; auto-generated if not provided.
            
        Returns:
            The created PathMapping.
        """
        mapping = PathMapping(
            id=mapping_id or str(uuid.uuid4()),
            name=name,
            windows=windows,
            linux=linux,
            macos=macos,
            enabled=enabled,
        )
        self._mappings.append(mapping)
        self._save_config()
        logger.info(f"Added path mapping '{name}': Win={windows}, Linux={linux}, Mac={macos}")
        return mapping

    def update_mapping(self, mapping_id: str, **kwargs: Any) -> PathMapping | None:
        """Update an existing path mapping.
        
        Args:
            mapping_id: ID of the mapping to update.
            **kwargs: Fields to update (name, windows, linux, macos, enabled).
            
        Returns:
            The updated PathMapping, or None if not found.
        """
        for mapping in self._mappings:
            if mapping.id == mapping_id:
                for key, value in kwargs.items():
                    if hasattr(mapping, key):
                        setattr(mapping, key, value)
                self._save_config()
                logger.info(f"Updated path mapping '{mapping.name}' (id={mapping_id})")
                return mapping
        
        logger.warning(f"Path mapping not found: {mapping_id}")
        return None

    def remove_mapping(self, mapping_id: str) -> bool:
        """Remove a path mapping.
        
        Args:
            mapping_id: ID of the mapping to remove.
            
        Returns:
            True if the mapping was found and removed.
        """
        original_count = len(self._mappings)
        self._mappings = [m for m in self._mappings if m.id != mapping_id]
        
        if len(self._mappings) < original_count:
            self._save_config()
            logger.info(f"Removed path mapping: {mapping_id}")
            return True
        
        logger.warning(f"Path mapping not found for removal: {mapping_id}")
        return False

    def get_mapping(self, mapping_id: str) -> PathMapping | None:
        """Get a path mapping by ID."""
        for mapping in self._mappings:
            if mapping.id == mapping_id:
                return mapping
        return None

    def to_local(self, path: str) -> str:
        """Translate a path from any OS format to the current OS's format.
        
        Tries each enabled mapping to see if the path starts with a known
        prefix from another OS, and replaces it with the local prefix.
        
        Args:
            path: The path to translate (may be from any OS).
            
        Returns:
            The translated path for the current OS, or the original path
            if no mapping matches.
        """
        if not path:
            return path
        
        normalized_input = _normalize_prefix(path)
        
        for mapping in self._mappings:
            if not mapping.enabled:
                continue
            
            # Get the prefix for each OS
            prefixes = {
                "windows": _normalize_prefix(mapping.windows),
                "linux": _normalize_prefix(mapping.linux),
                "macos": _normalize_prefix(mapping.macos),
            }
            
            # Get the local (target) prefix
            local_prefix = prefixes.get(self._current_os, "")
            if not local_prefix:
                continue  # No mapping for current OS
            
            # Try matching against each OTHER OS prefix
            for os_name, prefix in prefixes.items():
                if os_name == self._current_os or not prefix:
                    continue
                
                # Case-insensitive match for Windows paths
                if normalized_input.lower().startswith(prefix.lower()):
                    # Extract the relative part after the prefix
                    remainder = normalized_input[len(prefix):]
                    
                    # Ensure clean joining (no double slashes)
                    if remainder and not remainder.startswith("/"):
                        remainder = "/" + remainder
                    
                    # Strip trailing slash from prefix to avoid double slash
                    clean_prefix = local_prefix.rstrip("/")
                    translated = clean_prefix + remainder
                    
                    # Convert separators for the target OS
                    if self._current_os == "windows":
                        translated = translated.replace("/", "\\")
                    else:
                        translated = translated.replace("\\", "/")
                    
                    logger.debug(f"Path translated: '{path}' -> '{translated}' (via mapping '{mapping.name}')")
                    return translated
            
            # Also check if the input already uses the local prefix (no translation needed)
            if normalized_input.lower().startswith(local_prefix.lower()):
                # Already a local path - just normalize separators
                if self._current_os == "windows":
                    return path.replace("/", "\\")
                else:
                    return path.replace("\\", "/")
        
        # No mapping matched - return original path with normalized separators
        if self._current_os == "windows":
            return path  # Keep as-is for Windows
        else:
            return path.replace("\\", "/")

    def from_local(self, path: str, target_os: str) -> str:
        """Translate a local path to a specific target OS format.
        
        Args:
            path: The local path to translate.
            target_os: Target OS ('windows', 'linux', or 'macos').
            
        Returns:
            The translated path for the target OS.
        """
        if not path or target_os == self._current_os:
            return path
        
        normalized_input = _normalize_prefix(path)
        
        for mapping in self._mappings:
            if not mapping.enabled:
                continue
            
            local_prefix = _normalize_prefix(getattr(mapping, self._current_os, ""))
            target_prefix = _normalize_prefix(getattr(mapping, target_os, ""))
            
            if not local_prefix or not target_prefix:
                continue
            
            if normalized_input.lower().startswith(local_prefix.lower()):
                remainder = normalized_input[len(local_prefix):]
                if remainder and not remainder.startswith("/"):
                    remainder = "/" + remainder
                
                # Strip trailing slash from prefix to avoid double slash
                clean_prefix = target_prefix.rstrip("/")
                translated = clean_prefix + remainder
                
                if target_os == "windows":
                    translated = translated.replace("/", "\\")
                else:
                    translated = translated.replace("\\", "/")
                
                return translated
        
        return path

    def translate_path_in_dict(self, data: dict[str, Any], keys: list[str] | None = None) -> dict[str, Any]:
        """Translate path values in a dictionary.
        
        Useful for translating paths in API request/response bodies.
        
        Args:
            data: Dictionary that may contain path values.
            keys: Specific keys to translate. If None, translates common path keys.
            
        Returns:
            The dictionary with translated path values.
        """
        path_keys = keys or [
            "path", "folder_path", "file_path", "image_path",
            "parent_path", "project_path", "base_path",
        ]
        
        result = dict(data)
        for key in path_keys:
            if key in result and isinstance(result[key], str):
                result[key] = self.to_local(result[key])
        
        return result

    def _load_config(self) -> None:
        """Load mappings from the config file."""
        if not self._config_path.exists():
            self._mappings = []
            return
        
        try:
            with open(self._config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            self._mappings = [
                PathMapping.from_dict(m) for m in data.get("mappings", [])
            ]
            logger.info(f"Loaded {len(self._mappings)} path mapping(s) from {self._config_path}")
        except Exception as e:
            logger.error(f"Failed to load path mappings from {self._config_path}: {e}")
            self._mappings = []

    def _save_config(self) -> None:
        """Persist mappings to the config file."""
        try:
            self._config_path.parent.mkdir(parents=True, exist_ok=True)
            
            data = {
                "version": 1,
                "mappings": [m.to_dict() for m in self._mappings],
            }
            
            with open(self._config_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            
            logger.debug(f"Saved {len(self._mappings)} path mapping(s) to {self._config_path}")
        except Exception as e:
            logger.error(f"Failed to save path mappings to {self._config_path}: {e}")

    def export_mappings(self) -> list[dict[str, Any]]:
        """Export all mappings as a list of dictionaries (for API responses)."""
        return [m.to_dict() for m in self._mappings]

    def import_mappings(self, mappings: list[dict[str, Any]], replace: bool = False) -> int:
        """Import mappings from a list of dictionaries.
        
        Args:
            mappings: List of mapping dictionaries.
            replace: If True, replace all existing mappings. If False, append.
            
        Returns:
            Number of mappings imported.
        """
        new_mappings = [PathMapping.from_dict(m) for m in mappings]
        
        if replace:
            self._mappings = new_mappings
        else:
            # Avoid duplicates by ID
            existing_ids = {m.id for m in self._mappings}
            for m in new_mappings:
                if m.id not in existing_ids:
                    self._mappings.append(m)
        
        self._save_config()
        return len(new_mappings)


# Module-level singleton instance
path_translator = PathTranslator()
