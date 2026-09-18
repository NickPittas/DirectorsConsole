#!/usr/bin/env python3
"""Copy the canonical cinema rules into a standalone ComfyUI node."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = REPOSITORY_ROOT / "CinemaPromptEngineering" / "cinema_rules"
DEFAULT_DESTINATION = (
    REPOSITORY_ROOT / "CinemaPromptEngineering" / "ComfyCinemaPrompting" / "cinema_rules"
)


def _overlaps(first: Path, second: Path) -> bool:
    """Return whether either path contains the other."""
    return first == second or first in second.parents or second in first.parents


def _ignore_generated_caches(_directory: str, names: list[str]) -> list[str]:
    """Exclude Python caches and bytecode from the standalone copy."""
    return [name for name in names if name == "__pycache__" or name.endswith((".pyc", ".pyo"))]


def sync_rules(source: Path = DEFAULT_SOURCE, destination: Path = DEFAULT_DESTINATION) -> int:
    """Replace the generated rules directory with a clean copy of ``source``."""
    source = Path(source).expanduser()
    destination = Path(destination).expanduser()

    if destination.is_symlink():
        raise ValueError(f"Destination must be a directory, not a symlink: {destination}")

    source = source.resolve()
    destination = destination.resolve()

    if not source.is_dir() or not (source / "__init__.py").is_file():
        raise FileNotFoundError(f"Canonical cinema rules package does not exist: {source}")
    if _overlaps(source, destination):
        raise ValueError(f"Source and destination overlap; refusing to modify either: {source} / {destination}")
    if not destination.parent.is_dir():
        raise FileNotFoundError(f"Destination parent directory does not exist: {destination.parent}")
    if destination.exists() and not destination.is_dir():
        raise NotADirectoryError(f"Destination is not a directory: {destination}")

    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination, ignore=_ignore_generated_caches)
    return sum(1 for path in destination.rglob("*") if path.is_file())


def main() -> int:
    """Parse paths and synchronize the generated standalone rules."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--destination", type=Path, default=DEFAULT_DESTINATION)
    args = parser.parse_args()

    copied_files = sync_rules(args.source, args.destination)
    print(f"Copied {copied_files} files to {args.destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
