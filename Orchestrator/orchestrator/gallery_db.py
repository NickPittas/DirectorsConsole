"""JSON-based store for Gallery metadata.

Stores ratings, tags, and view preferences per project.
The data file is created at {projectPath}/.gallery/gallery.json.

This replaces the previous SQLite implementation because SQLite requires
POSIX file locks that are not available on CIFS/SMB network mounts (which
is where project folders live on a NAS).

Thread safety: all operations are serialised by a threading.Lock.  Writes
use atomic rename (write to temp file, then rename) to avoid corruption.

Usage:
    from orchestrator.gallery_db import GalleryDB

    db = GalleryDB("/path/to/project")
    db.set_rating("Panel_01/image_001.png", 5)
    rating = db.get_rating("Panel_01/image_001.png")
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 2  # Bumped from 1 (SQLite) to 2 (JSON)


def _empty_store() -> dict[str, Any]:
    """Return a fresh empty data store."""
    return {
        "_schema_version": SCHEMA_VERSION,
        "_next_tag_id": 1,
        "_next_view_id": 1,
        "files": {},  # rel_path -> {"rating": int, "notes": str, "tag_ids": [int], "last_viewed": float|null, "created_at": float}
        "tags": {},  # str(tag_id) -> {"name": str, "color": str}
        "views": {},  # view_name -> {view_mode, sort_field, sort_direction, thumbnail_size, filters_json, current_path, folder_tree_state, is_default}
    }


class GalleryDB:
    """JSON-backed store for gallery metadata (ratings, tags, view states).

    All file paths stored are relative to the project root.
    The data file lives at ``{project_path}/.gallery/gallery.json``.

    Thread safety: every public method acquires ``self._lock`` before
    reading or mutating the in-memory data, and every mutation flushes
    to disk via :meth:`_save`.
    """

    def __init__(self, project_path: str) -> None:
        """Initialize the gallery store for a project.

        Args:
            project_path: Absolute path to the project root folder.
        """
        self.project_path = Path(project_path)
        self.db_dir = self.project_path / ".gallery"
        self.db_path = self.db_dir / "gallery.json"
        self._lock = threading.Lock()
        self._data: dict[str, Any] = _empty_store()
        self._ensure_db()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ensure_db(self) -> None:
        """Create the directory and load or initialise the data file."""
        self.db_dir.mkdir(parents=True, exist_ok=True)
        if self.db_path.exists() and self.db_path.stat().st_size > 0:
            try:
                with open(self.db_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                # Merge with empty store to fill any missing keys
                merged = _empty_store()
                merged.update(loaded)
                self._data = merged
                logger.info(f"Loaded gallery data from {self.db_path}")
            except (json.JSONDecodeError, OSError) as e:
                logger.warning(f"Could not read {self.db_path}, starting fresh: {e}")
                self._data = _empty_store()
                self._save()
        else:
            self._data = _empty_store()
            self._save()

    def _save(self) -> None:
        """Flush in-memory data to disk atomically.

        Writes to a temp file first, then renames.  On CIFS this is not
        truly atomic but is much safer than truncating the target file.
        """
        tmp_path = self.db_path.with_suffix(".json.tmp")
        try:
            self.db_dir.mkdir(parents=True, exist_ok=True)
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(self._data, f, indent=2, ensure_ascii=False)
            # Rename (overwrites target on POSIX; on Windows/CIFS we fall back)
            try:
                os.replace(str(tmp_path), str(self.db_path))
            except OSError:
                # Fallback: copy content (less safe, but works everywhere)
                import shutil

                shutil.copy2(str(tmp_path), str(self.db_path))
                try:
                    tmp_path.unlink()
                except OSError:
                    pass
        except OSError as e:
            logger.error(f"Failed to save gallery data to {self.db_path}: {e}")

    def _get_file(self, rel_path: str) -> dict[str, Any]:
        """Return file record, creating it if missing (caller holds lock)."""
        files = self._data["files"]
        if rel_path not in files:
            files[rel_path] = {
                "rating": 0,
                "notes": "",
                "tag_ids": [],
                "last_viewed": None,
                "created_at": time.time(),
            }
        return files[rel_path]

    # ==================================================================
    # File Ratings
    # ==================================================================

    def get_rating(self, rel_path: str) -> int:
        """Get the rating for a file.

        Args:
            rel_path: File path relative to project root.

        Returns:
            Rating (0-5), or 0 if not rated.
        """
        with self._lock:
            rec = self._data["files"].get(rel_path)
            return rec["rating"] if rec else 0

    def set_rating(self, rel_path: str, rating: int) -> None:
        """Set the rating for a file (upsert).

        Args:
            rel_path: File path relative to project root.
            rating: Rating value (0-5). 0 means unrated.
        """
        rating = max(0, min(5, rating))
        with self._lock:
            self._get_file(rel_path)["rating"] = rating
            self._save()

    def set_ratings_bulk(self, ratings: dict[str, int]) -> None:
        """Set ratings for multiple files in a single write.

        Args:
            ratings: Dict mapping relative file paths to rating values.
        """
        with self._lock:
            for rel_path, rating in ratings.items():
                self._get_file(rel_path)["rating"] = max(0, min(5, rating))
            self._save()

    def get_ratings_bulk(self, rel_paths: list[str]) -> dict[str, int]:
        """Get ratings for multiple files.

        Args:
            rel_paths: List of relative file paths.

        Returns:
            Dict mapping paths to ratings. Only includes paths that have ratings.
        """
        if not rel_paths:
            return {}
        with self._lock:
            files = self._data["files"]
            return {
                p: files[p]["rating"]
                for p in rel_paths
                if p in files and files[p]["rating"] > 0
            }

    def get_all_ratings(self) -> dict[str, int]:
        """Get all ratings in the store.

        Returns:
            Dict mapping relative paths to ratings (only rated files).
        """
        with self._lock:
            return {
                p: rec["rating"]
                for p, rec in self._data["files"].items()
                if rec.get("rating", 0) > 0
            }

    # ==================================================================
    # Tags
    # ==================================================================

    def create_tag(self, name: str, color: str = "#808080") -> dict[str, Any]:
        """Create a new tag.

        Args:
            name: Tag name (must be unique).
            color: Hex color for the tag badge.

        Returns:
            Dict with tag id, name, and color.

        Raises:
            ValueError: If tag name already exists.
        """
        with self._lock:
            # Check uniqueness
            for tid, tag in self._data["tags"].items():
                if tag["name"] == name:
                    raise ValueError(f"Tag '{name}' already exists")

            tag_id = self._data["_next_tag_id"]
            self._data["_next_tag_id"] = tag_id + 1
            self._data["tags"][str(tag_id)] = {"name": name, "color": color}
            self._save()
            return {"id": tag_id, "name": name, "color": color}

    def update_tag(
        self, tag_id: int, name: str | None = None, color: str | None = None
    ) -> None:
        """Update a tag's name and/or color.

        Args:
            tag_id: Tag ID.
            name: New name (optional).
            color: New hex color (optional).
        """
        if name is None and color is None:
            return
        with self._lock:
            key = str(tag_id)
            tag = self._data["tags"].get(key)
            if not tag:
                return
            if name is not None:
                tag["name"] = name
            if color is not None:
                tag["color"] = color
            self._save()

    def delete_tag(self, tag_id: int) -> None:
        """Delete a tag and remove all file associations.

        Args:
            tag_id: Tag ID to delete.
        """
        with self._lock:
            key = str(tag_id)
            self._data["tags"].pop(key, None)
            # Remove from all files
            for rec in self._data["files"].values():
                tag_ids = rec.get("tag_ids", [])
                if tag_id in tag_ids:
                    tag_ids.remove(tag_id)
            self._save()

    def list_tags(self) -> list[dict[str, Any]]:
        """List all tags.

        Returns:
            List of dicts with id, name, color, and file_count.
        """
        with self._lock:
            result = []
            for tid_str, tag in self._data["tags"].items():
                tid = int(tid_str)
                count = sum(
                    1
                    for rec in self._data["files"].values()
                    if tid in rec.get("tag_ids", [])
                )
                result.append(
                    {
                        "id": tid,
                        "name": tag["name"],
                        "color": tag["color"],
                        "file_count": count,
                    }
                )
            result.sort(key=lambda t: t["name"])
            return result

    def add_tags_to_file(self, rel_path: str, tag_ids: list[int]) -> None:
        """Add tags to a file (creates file record if needed).

        Args:
            rel_path: File path relative to project root.
            tag_ids: List of tag IDs to add.
        """
        with self._lock:
            rec = self._get_file(rel_path)
            existing = set(rec.get("tag_ids", []))
            existing.update(tag_ids)
            rec["tag_ids"] = sorted(existing)
            self._save()

    def remove_tags_from_file(self, rel_path: str, tag_ids: list[int]) -> None:
        """Remove tags from a file.

        Args:
            rel_path: File path relative to project root.
            tag_ids: List of tag IDs to remove.
        """
        if not tag_ids:
            return
        with self._lock:
            rec = self._data["files"].get(rel_path)
            if not rec:
                return
            to_remove = set(tag_ids)
            rec["tag_ids"] = [t for t in rec.get("tag_ids", []) if t not in to_remove]
            self._save()

    def get_file_tags(self, rel_path: str) -> list[dict[str, Any]]:
        """Get all tags for a file.

        Args:
            rel_path: File path relative to project root.

        Returns:
            List of tag dicts with id, name, color.
        """
        with self._lock:
            rec = self._data["files"].get(rel_path)
            if not rec:
                return []
            tags_map = self._data["tags"]
            result = []
            for tid in rec.get("tag_ids", []):
                tag = tags_map.get(str(tid))
                if tag:
                    result.append(
                        {"id": tid, "name": tag["name"], "color": tag["color"]}
                    )
            result.sort(key=lambda t: t["name"])
            return result

    def get_files_by_tag(self, tag_id: int) -> list[str]:
        """Get all file paths that have a specific tag.

        Args:
            tag_id: Tag ID.

        Returns:
            List of relative file paths.
        """
        with self._lock:
            return sorted(
                p
                for p, rec in self._data["files"].items()
                if tag_id in rec.get("tag_ids", [])
            )

    def get_bulk_file_tags(
        self, rel_paths: list[str]
    ) -> dict[str, list[dict[str, Any]]]:
        """Get tags for multiple files efficiently.

        Args:
            rel_paths: List of relative file paths.

        Returns:
            Dict mapping paths to lists of tag dicts.
        """
        if not rel_paths:
            return {}
        with self._lock:
            files = self._data["files"]
            tags_map = self._data["tags"]
            result: dict[str, list[dict[str, Any]]] = {}
            for p in rel_paths:
                rec = files.get(p)
                if not rec:
                    result[p] = []
                    continue
                file_tags = []
                for tid in rec.get("tag_ids", []):
                    tag = tags_map.get(str(tid))
                    if tag:
                        file_tags.append(
                            {"id": tid, "name": tag["name"], "color": tag["color"]}
                        )
                file_tags.sort(key=lambda t: t["name"])
                result[p] = file_tags
            return result

    # ==================================================================
    # File Notes
    # ==================================================================

    def set_notes(self, rel_path: str, notes: str) -> None:
        """Set notes for a file.

        Args:
            rel_path: File path relative to project root.
            notes: Note text.
        """
        with self._lock:
            self._get_file(rel_path)["notes"] = notes
            self._save()

    def get_notes(self, rel_path: str) -> str:
        """Get notes for a file.

        Args:
            rel_path: File path relative to project root.

        Returns:
            Notes string, or empty string if none.
        """
        with self._lock:
            rec = self._data["files"].get(rel_path)
            return rec.get("notes", "") if rec else ""

    # ==================================================================
    # Gallery View State
    # ==================================================================

    def save_view(
        self,
        name: str = "default",
        *,
        view_mode: str = "grid",
        sort_field: str = "name",
        sort_direction: str = "asc",
        thumbnail_size: int = 200,
        filters_json: str = "{}",
        current_path: str = "",
        folder_tree_state: str = "{}",
        is_default: bool = True,
    ) -> int:
        """Save or update a gallery view state.

        Args:
            name: View name. 'default' is the auto-saved view.
            view_mode: 'grid', 'list', 'masonry', or 'timeline'.
            sort_field: Field to sort by.
            sort_direction: 'asc' or 'desc'.
            thumbnail_size: Thumbnail size in pixels.
            filters_json: JSON string of active filters.
            current_path: Currently browsed path (relative).
            folder_tree_state: JSON string of folder expand/collapse state.
            is_default: Whether this is the default view.

        Returns:
            View ID (auto-incremented integer).
        """
        with self._lock:
            view_data = {
                "view_mode": view_mode,
                "sort_field": sort_field,
                "sort_direction": sort_direction,
                "thumbnail_size": thumbnail_size,
                "filters_json": filters_json,
                "current_path": current_path,
                "folder_tree_state": folder_tree_state,
                "is_default": is_default,
            }

            existing = self._data["views"].get(name)
            if existing:
                vid = existing.get("id", self._data["_next_view_id"])
                view_data["id"] = vid
                self._data["views"][name] = view_data
            else:
                vid = self._data["_next_view_id"]
                self._data["_next_view_id"] = vid + 1
                view_data["id"] = vid
                self._data["views"][name] = view_data

            self._save()
            return vid

    def load_view(self, name: str = "default") -> dict[str, Any] | None:
        """Load a saved gallery view state.

        Args:
            name: View name. 'default' for the auto-saved view.

        Returns:
            View dict, or None if not found.
        """
        with self._lock:
            view = self._data["views"].get(name)
            return dict(view) if view else None

    def list_views(self) -> list[dict[str, Any]]:
        """List all saved gallery views.

        Returns:
            List of view dicts.
        """
        with self._lock:
            result = []
            for name, view in self._data["views"].items():
                v = dict(view)
                v["name"] = name
                result.append(v)
            result.sort(key=lambda v: v.get("name", ""))
            return result

    def delete_view(self, name: str) -> None:
        """Delete a saved view by name.

        Args:
            name: View name to delete.
        """
        with self._lock:
            self._data["views"].pop(name, None)
            self._save()

    # ==================================================================
    # File Path Updates (for rename/move operations)
    # ==================================================================

    def rename_file_path(self, old_path: str, new_path: str) -> None:
        """Update a file's path in the store (after rename/move).

        Args:
            old_path: Previous relative path.
            new_path: New relative path.
        """
        with self._lock:
            files = self._data["files"]
            rec = files.pop(old_path, None)
            if rec:
                files[new_path] = rec
                self._save()

    def rename_folder_paths(self, old_folder: str, new_folder: str) -> int:
        """Update all file paths when a folder is renamed.

        Args:
            old_folder: Previous folder path prefix (relative).
            new_folder: New folder path prefix (relative).

        Returns:
            Number of paths updated.
        """
        with self._lock:
            old_prefix = old_folder.rstrip("/") + "/"
            new_prefix = new_folder.rstrip("/") + "/"
            files = self._data["files"]
            to_rename: list[tuple[str, str]] = []
            for p in list(files.keys()):
                if p.startswith(old_prefix):
                    new_p = new_prefix + p[len(old_prefix) :]
                    to_rename.append((p, new_p))

            for old_p, new_p in to_rename:
                files[new_p] = files.pop(old_p)

            if to_rename:
                self._save()
            return len(to_rename)

    def delete_file_record(self, rel_path: str) -> None:
        """Delete a file's record from the store.

        Args:
            rel_path: File path relative to project root.
        """
        with self._lock:
            if self._data["files"].pop(rel_path, None) is not None:
                self._save()

    # ==================================================================
    # Import / Migration
    # ==================================================================

    def import_ratings_from_dict(self, ratings: dict[str, int]) -> int:
        """Import ratings from a dict (e.g., from project JSON migration).

        Only imports ratings for paths that don't already have a rating > 0.

        Args:
            ratings: Dict mapping absolute or relative paths to ratings.

        Returns:
            Number of ratings imported.
        """
        with self._lock:
            count = 0
            for path, rating in ratings.items():
                # Try to make path relative to project
                try:
                    rel_path = str(Path(path).relative_to(self.project_path))
                except ValueError:
                    rel_path = path

                rating = max(0, min(5, rating))
                if rating == 0:
                    continue

                existing = self._data["files"].get(rel_path)
                if existing and existing.get("rating", 0) > 0:
                    continue

                self._get_file(rel_path)["rating"] = rating
                count += 1

            if count > 0:
                self._save()
            logger.info(f"Imported {count} ratings from project JSON")
            return count

    # ==================================================================
    # Query helpers for search / filtering
    # ==================================================================

    def get_rated_files(self, min_rating: int = 1) -> list[dict[str, Any]]:
        """Get all files with a rating >= min_rating.

        Args:
            min_rating: Minimum rating threshold.

        Returns:
            List of dicts with path, rating, notes.
        """
        with self._lock:
            result = []
            for p, rec in self._data["files"].items():
                if rec.get("rating", 0) >= min_rating:
                    result.append(
                        {
                            "path": p,
                            "rating": rec["rating"],
                            "notes": rec.get("notes", ""),
                        }
                    )
            result.sort(key=lambda r: (-r["rating"], r["path"]))
            return result

    def get_file_metadata(self, rel_path: str) -> dict[str, Any] | None:
        """Get all stored metadata for a file (rating, notes, tags).

        Args:
            rel_path: File path relative to project root.

        Returns:
            Dict with rating, notes, tags list, or None if no record.
        """
        with self._lock:
            rec = self._data["files"].get(rel_path)
            if not rec:
                return None

            tags_map = self._data["tags"]
            tags = []
            for tid in rec.get("tag_ids", []):
                tag = tags_map.get(str(tid))
                if tag:
                    tags.append({"id": tid, "name": tag["name"], "color": tag["color"]})
            tags.sort(key=lambda t: t["name"])

            return {
                "path": rel_path,
                "rating": rec.get("rating", 0),
                "notes": rec.get("notes", ""),
                "last_viewed": rec.get("last_viewed"),
                "created_at": rec.get("created_at"),
                "tags": tags,
            }
