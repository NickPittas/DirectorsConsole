from __future__ import annotations

import logging
from pathlib import Path
from typing import Callable

import yaml
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)


class BackendConfig(BaseModel):
    id: str
    name: str
    host: str
    port: int = 8188
    enabled: bool = True
    capabilities: list[str] = Field(default_factory=list)
    max_concurrent_jobs: int = 1
    tags: list[str] = Field(default_factory=list)


class AppConfig(BaseModel):
    data_dir: Path
    log_dir: Path
    database_path: Path
    backends: list[BackendConfig]

    @field_validator("backends")
    @classmethod
    def backends_required(cls, value: list[BackendConfig]) -> list[BackendConfig]:
        if not value:
            raise ValueError("At least one backend must be configured")
        return value


def load_config(path: Path) -> AppConfig:
    data = _load_yaml(path)
    base_dir = path.parent
    data["data_dir"] = _resolve_path(data.get("data_dir"), base_dir)
    data["log_dir"] = _resolve_path(data.get("log_dir"), base_dir)
    data["database_path"] = _resolve_path(data.get("database_path"), base_dir)

    return AppConfig.model_validate(data)


def save_config(config: AppConfig, path: Path) -> None:
    """Save app configuration to YAML file.
    
    Args:
        config: The AppConfig to save
        path: Path to the config file
    """
    # Convert config to dict, converting Path objects to relative strings
    base_dir = path.parent
    data = {
        "data_dir": _make_relative_path(config.data_dir, base_dir),
        "log_dir": _make_relative_path(config.log_dir, base_dir),
        "database_path": _make_relative_path(config.database_path, base_dir),
        "backends": [backend.model_dump() for backend in config.backends],
    }
    
    with path.open("w", encoding="utf-8") as handle:
        yaml.dump(data, handle, default_flow_style=False, allow_unicode=True, sort_keys=False)
    
    logger.info(f"Config saved to {path}")


def _make_relative_path(path: Path, base_dir: Path) -> str:
    """Convert absolute path to relative string if possible."""
    try:
        return "./" + str(path.relative_to(base_dir))
    except ValueError:
        return str(path)


def _load_yaml(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)

    if data is None:
        raise ValueError("Config is empty")

    if not isinstance(data, dict):
        raise ValueError("Config must be a mapping")

    return data


def _resolve_path(value: str | Path | None, base_dir: Path) -> Path:
    if value is None:
        raise ValueError("Missing required path")

    path = Path(value)
    if not path.is_absolute():
        path = base_dir / path

    return path.resolve(strict=False)


class ConfigWatcher:
    """Watch config file for external changes."""

    def __init__(self, config_path: Path) -> None:
        self._path = config_path
        self._running = False
        self._callback: Callable[[], None] | None = None
        self._last_mtime: float | None = None

    @property
    def config_changed(self) -> Callable[[], None] | None:
        """Get the callback for config changes."""
        return self._callback

    @config_changed.setter
    def config_changed(self, callback: Callable[[], None]) -> None:
        """Set the callback for config changes."""
        self._callback = callback

    def start(self) -> None:
        """Start watching for config changes."""
        if self._running:
            return
        self._running = True
        if self._path.exists():
            self._last_mtime = self._path.stat().st_mtime
        logger.info(f"ConfigWatcher started for {self._path}")

    def stop(self) -> None:
        """Stop watching for config changes."""
        self._running = False
        logger.info("ConfigWatcher stopped")

    def check(self) -> bool:
        """Check if config has changed. Call periodically from a timer."""
        if not self._running or not self._path.exists():
            return False
        
        current_mtime = self._path.stat().st_mtime
        if self._last_mtime is not None and current_mtime != self._last_mtime:
            self._last_mtime = current_mtime
            if self._callback:
                self._callback()
            return True
        self._last_mtime = current_mtime
        return False
