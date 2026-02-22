"""Gallery API routes for Director's Console.

Provides endpoints for the Gallery tab: recursive file scanning, file operations
(move, rename, batch rename, auto-rename), trash management, metadata/ratings/tags
(via SQLite), view state persistence, prompt search, duplicate detection, and
folder statistics.

All endpoints are prefixed with /api/gallery/ and mounted on the Orchestrator app.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import platform
import re
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from orchestrator.gallery_db import GalleryDB
from orchestrator.path_translator import path_translator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gallery", tags=["gallery"])

# Supported media extensions
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".webm", ".mkv"}
MEDIA_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS

# Cache of GalleryDB instances per project path
_db_cache: dict[str, GalleryDB] = {}


def _get_db(project_path: str) -> GalleryDB:
    """Get or create a GalleryDB for a project path."""
    if project_path not in _db_cache:
        _db_cache[project_path] = GalleryDB(project_path)
    return _db_cache[project_path]


def _translate_path(path: str) -> str:
    """Translate a path from any OS format to the local OS format."""
    return path_translator.to_local(path)


def _is_path_safe(
    file_path: str | Path, allowed_base: str | Path | None = None
) -> tuple[bool, str]:
    """Check if a file path is safe from directory traversal attacks."""
    try:
        path = Path(file_path).resolve()
        original_str = str(file_path)
        if ".." in original_str.split("/") or ".." in original_str.split("\\"):
            pass  # Will be checked below

        if allowed_base:
            base = Path(allowed_base).resolve()
            try:
                path.relative_to(base)
            except ValueError:
                return (
                    False,
                    f"Path {file_path} is outside allowed directory {allowed_base}",
                )

        return True, ""
    except Exception as e:
        return False, f"Invalid path: {e}"


def _get_file_type(suffix: str) -> str:
    """Determine file type from extension."""
    s = suffix.lower()
    if s in IMAGE_EXTENSIONS:
        return "image"
    elif s in VIDEO_EXTENSIONS:
        return "video"
    return "unknown"


def _get_file_info_sync(
    file_path: Path, project_root: Path | None = None
) -> dict[str, Any]:
    """Get detailed file information synchronously.

    Args:
        file_path: Absolute path to the file.
        project_root: If provided, include relative path.

    Returns:
        Dict with file metadata.
    """
    stat = file_path.stat()
    info: dict[str, Any] = {
        "name": file_path.name,
        "path": str(file_path),
        "size": stat.st_size,
        "modified": stat.st_mtime,
        "created": getattr(stat, "st_birthtime", stat.st_ctime),
        "type": _get_file_type(file_path.suffix),
        "extension": file_path.suffix.lower(),
    }

    if project_root:
        try:
            info["rel_path"] = str(file_path.relative_to(project_root))
        except ValueError:
            info["rel_path"] = file_path.name

    # Get dimensions for images
    if info["type"] == "image":
        try:
            from PIL import Image

            with Image.open(file_path) as img:
                info["width"] = img.width
                info["height"] = img.height
        except Exception:
            info["width"] = None
            info["height"] = None
    else:
        info["width"] = None
        info["height"] = None

    return info


# ============================================================================
# Pydantic Models
# ============================================================================


class ScanRecursiveRequest(BaseModel):
    """Request to recursively scan a project folder."""

    folder_path: str = Field(..., description="Absolute path to project folder")
    include_dimensions: bool = Field(
        default=False, description="Include image dimensions (slower)"
    )


class FileEntry(BaseModel):
    """A single file entry in scan results."""

    name: str
    path: str
    rel_path: str = ""
    size: int = 0
    modified: float = 0
    created: float = 0
    type: str = "image"  # image, video
    extension: str = ""
    width: int | None = None
    height: int | None = None
    rating: int = 0
    tags: list[dict[str, Any]] = Field(default_factory=list)


class FolderEntry(BaseModel):
    """A folder in the scan tree."""

    name: str
    path: str
    rel_path: str = ""
    files: list[FileEntry] = Field(default_factory=list)
    subfolders: list[str] = Field(default_factory=list)
    file_count: int = 0
    total_size: int = 0


class ScanRecursiveResponse(BaseModel):
    """Response from recursive folder scan."""

    success: bool
    folders: list[FolderEntry] = Field(default_factory=list)
    total_files: int = 0
    total_size: int = 0
    message: str = ""


class TreeFolderEntry(BaseModel):
    """A folder in the tree — lightweight, no file data."""

    name: str
    path: str
    rel_path: str = ""
    subfolders: list[str] = Field(default_factory=list)
    file_count: int = 0  # Quick count of media files (no stat calls)


class ScanTreeRequest(BaseModel):
    """Request to scan folder tree structure only."""

    folder_path: str = Field(..., description="Absolute path to project folder")


class ScanTreeResponse(BaseModel):
    """Response from tree-only scan."""

    success: bool
    folders: list[TreeFolderEntry] = Field(default_factory=list)
    message: str = ""


class ScanFolderRequest(BaseModel):
    """Request to scan a single folder's files."""

    folder_path: str = Field(..., description="Absolute path to the folder to scan")
    project_path: str = Field(
        default="", description="Project root for relative paths and ratings"
    )


class ScanFolderResponse(BaseModel):
    """Response from single folder scan."""

    success: bool
    files: list[FileEntry] = Field(default_factory=list)
    folder_path: str = ""
    message: str = ""


class FileInfoRequest(BaseModel):
    """Request for single file info."""

    file_path: str = Field(..., description="Absolute path to file")
    project_path: str = Field(default="", description="Project root for relative paths")


class FileInfoResponse(BaseModel):
    """Detailed file information response."""

    success: bool
    file: FileEntry | None = None
    png_metadata: dict[str, Any] | None = None
    message: str = ""


class MoveFilesRequest(BaseModel):
    """Request to move files to a target folder."""

    file_paths: list[str] = Field(..., description="Absolute paths of files to move")
    target_folder: str = Field(..., description="Absolute path to target folder")
    project_path: str = Field(default="", description="Project root for DB updates")
    conflict: str = Field(
        default="rename", description="Conflict resolution: skip, overwrite, rename"
    )


class MoveFilesResponse(BaseModel):
    """Response from move files operation."""

    success: bool
    moved: list[dict[str, str]] = Field(default_factory=list)
    skipped: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    message: str = ""


class RenameFileRequest(BaseModel):
    """Request to rename a single file."""

    file_path: str = Field(..., description="Absolute path to the file")
    new_name: str = Field(..., description="New filename (without path)")
    project_path: str = Field(default="", description="Project root for DB updates")


class RenameFileResponse(BaseModel):
    """Response from rename operation."""

    success: bool
    old_path: str = ""
    new_path: str = ""
    message: str = ""


class BatchRenameRequest(BaseModel):
    """Request to batch rename files."""

    file_paths: list[str] = Field(..., description="Absolute paths of files to rename")
    pattern: str = Field(
        ...,
        description="Rename pattern with tokens: {original}, {index}, {date}, {time}, {year}, {month}, {day}, {folder}, {project}, {ext}",
    )
    start_index: int = Field(default=1, description="Starting index for {index} token")
    pad_width: int = Field(
        default=3,
        ge=1,
        le=6,
        description="Zero-padding width for {index} (e.g. 3 → 001)",
    )
    project_path: str = Field(default="", description="Project root for DB updates")
    dry_run: bool = Field(default=True, description="Preview only, don't execute")


class BatchRenamePreview(BaseModel):
    """A single rename preview entry."""

    old_path: str
    old_name: str
    new_name: str
    new_path: str


class BatchRenameResponse(BaseModel):
    """Response from batch rename operation."""

    success: bool
    previews: list[BatchRenamePreview] = Field(default_factory=list)
    renamed: int = 0
    errors: list[str] = Field(default_factory=list)
    message: str = ""


class AutoRenameRequest(BaseModel):
    """Request to auto-rename files in a folder by creation time."""

    folder_path: str = Field(..., description="Absolute path to folder")
    naming_pattern: str = Field(
        default="{folder}_{index:03d}",
        description="Pattern: {folder}, {index}, {index:03d}, {date}, {time}, {ext}",
    )
    project_path: str = Field(default="", description="Project root for DB updates")
    dry_run: bool = Field(default=True, description="Preview only, don't execute")


class TrashRequest(BaseModel):
    """Request to trash files."""

    file_paths: list[str] = Field(..., description="Absolute paths of files to trash")
    project_path: str = Field(..., description="Project root (for .trash location)")
    use_os_trash: bool = Field(
        default=False, description="Use OS recycle bin instead of project .trash"
    )


class TrashResponse(BaseModel):
    """Response from trash operation."""

    success: bool
    trashed: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    message: str = ""


class TrashListResponse(BaseModel):
    """Response listing trash contents."""

    success: bool
    files: list[dict[str, Any]] = Field(default_factory=list)
    total_size: int = 0
    message: str = ""


class RestoreRequest(BaseModel):
    """Request to restore files from trash."""

    file_paths: list[str] = Field(..., description="Paths within .trash to restore")
    project_path: str = Field(..., description="Project root")


class RestoreResponse(BaseModel):
    """Response from restore operation."""

    success: bool
    restored: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    message: str = ""


class EmptyTrashRequest(BaseModel):
    """Request to permanently delete all trash."""

    project_path: str = Field(..., description="Project root")


class RatingRequest(BaseModel):
    """Request to set ratings."""

    project_path: str = Field(..., description="Project root for SQLite DB")
    ratings: dict[str, int] = Field(
        ..., description="Map of relative paths to ratings (0-5)"
    )


class RatingResponse(BaseModel):
    """Response from rating operations."""

    success: bool
    ratings: dict[str, int] = Field(default_factory=dict)
    message: str = ""


class TagRequest(BaseModel):
    """Request for tag operations."""

    project_path: str
    name: str = ""
    color: str = "#808080"
    tag_id: int | None = None


class FileTagRequest(BaseModel):
    """Request to add/remove tags from files."""

    project_path: str
    file_path: str = Field(..., description="Relative path to file")
    tag_ids: list[int] = Field(default_factory=list)
    action: str = Field(default="add", description="'add' or 'remove'")


class ViewStateRequest(BaseModel):
    """Request to save/load gallery view state."""

    project_path: str
    name: str = "default"
    view_mode: str = "grid"
    sort_field: str = "name"
    sort_direction: str = "asc"
    thumbnail_size: int = 200
    filters_json: str = "{}"
    current_path: str = ""
    folder_tree_state: str = "{}"


class SearchRequest(BaseModel):
    """Request to search through PNG metadata/prompts."""

    project_path: str = Field(..., description="Project root to search in")
    query: str = Field(..., description="Search text")
    folder_path: str = Field(
        default="", description="Subfolder to limit search (optional)"
    )
    max_results: int = Field(default=100, description="Maximum results to return")


class SearchResult(BaseModel):
    """A single search result."""

    file_path: str
    rel_path: str
    match_field: str = ""  # Which field matched: prompt, workflow, parameters
    match_context: str = ""  # Surrounding text of the match
    rating: int = 0


class SearchResponse(BaseModel):
    """Response from search operation."""

    success: bool
    results: list[SearchResult] = Field(default_factory=list)
    total: int = 0
    message: str = ""


class DuplicateGroup(BaseModel):
    """A group of duplicate files."""

    hash: str
    files: list[dict[str, Any]] = Field(default_factory=list)
    size: int = 0


class FindDuplicatesRequest(BaseModel):
    """Request to find duplicate files."""

    folder_path: str = Field(..., description="Folder to scan for duplicates")
    project_path: str = Field(default="", description="Project root path")


class DuplicateResponse(BaseModel):
    """Response from duplicate detection."""

    success: bool
    groups: list[DuplicateGroup] = Field(default_factory=list)
    total_duplicates: int = 0
    wasted_space: int = 0
    message: str = ""


class FolderStatsRequest(BaseModel):
    """Request for folder statistics."""

    folder_path: str = Field(..., description="Absolute path to folder")


class FolderStatsResponse(BaseModel):
    """Response with folder statistics."""

    success: bool
    path: str = ""
    total_files: int = 0
    total_size: int = 0
    image_count: int = 0
    video_count: int = 0
    subfolder_count: int = 0
    by_extension: dict[str, int] = Field(default_factory=dict)
    message: str = ""


# ============================================================================
# Scan Endpoints
# ============================================================================


@router.post("/scan-tree", response_model=ScanTreeResponse)
async def scan_tree(request: ScanTreeRequest) -> ScanTreeResponse:
    """Scan folder tree structure only — no file metadata, no stat calls.

    Returns folder names, paths, subfolder lists, and a quick count of media
    files in each folder (just filename extension check, no stat/open).
    This is designed to be near-instant even on NAS/CIFS mounts.
    """
    folder_path = _translate_path(request.folder_path)
    is_safe, error_msg = _is_path_safe(folder_path)
    if not is_safe:
        return ScanTreeResponse(success=False, message=f"Security error: {error_msg}")

    def _scan_tree_sync() -> ScanTreeResponse:
        try:
            root = Path(folder_path)
            if not root.exists() or not root.is_dir():
                return ScanTreeResponse(
                    success=False, message=f"Folder not found: {folder_path}"
                )

            folders: list[TreeFolderEntry] = []

            for dirpath, dirnames, filenames in os.walk(root):
                # Skip hidden directories and .trash
                dirnames[:] = [
                    d for d in dirnames if not d.startswith(".") and d != ".trash"
                ]
                dirnames.sort()

                current = Path(dirpath)
                try:
                    rel_dir = str(current.relative_to(root))
                except ValueError:
                    rel_dir = ""

                # Quick count: just check extensions, no stat calls
                media_count = sum(
                    1
                    for f in filenames
                    if not f.startswith(".")
                    and Path(f).suffix.lower() in MEDIA_EXTENSIONS
                )

                folders.append(
                    TreeFolderEntry(
                        name=current.name if rel_dir else root.name,
                        path=str(current),
                        rel_path=rel_dir if rel_dir else ".",
                        subfolders=list(dirnames),
                        file_count=media_count,
                    )
                )

            return ScanTreeResponse(
                success=True,
                folders=folders,
                message=f"Scanned {len(folders)} folders",
            )
        except Exception as e:
            logger.error(f"Tree scan failed: {e}")
            return ScanTreeResponse(success=False, message=f"Tree scan failed: {e}")

    return await asyncio.to_thread(_scan_tree_sync)


@router.post("/scan-folder", response_model=ScanFolderResponse)
async def scan_folder(request: ScanFolderRequest) -> ScanFolderResponse:
    """Scan a single folder for media files — NOT recursive.

    Returns file entries with metadata (size, modified, created, type, rating)
    for just the specified folder. Used for on-demand loading when user clicks
    a folder in the gallery tree.
    """
    folder_path = _translate_path(request.folder_path)
    project_path = (
        _translate_path(request.project_path) if request.project_path else folder_path
    )

    is_safe, error_msg = _is_path_safe(folder_path)
    if not is_safe:
        return ScanFolderResponse(success=False, message=f"Security error: {error_msg}")

    def _scan_folder_sync() -> ScanFolderResponse:
        try:
            target = Path(folder_path)
            root = Path(project_path)

            if not target.exists() or not target.is_dir():
                return ScanFolderResponse(
                    success=False, message=f"Folder not found: {folder_path}"
                )

            # Get database and ratings
            all_ratings: dict[str, int] = {}
            db: GalleryDB | None = None
            try:
                db = _get_db(str(root))
                all_ratings = db.get_all_ratings()
            except Exception as db_err:
                logger.warning(f"Could not load ratings: {db_err}")

            files: list[FileEntry] = []
            for fname in sorted(os.listdir(target)):
                fpath = target / fname
                if not fpath.is_file():
                    continue
                if fpath.suffix.lower() not in MEDIA_EXTENSIONS:
                    continue
                if fname.startswith("."):
                    continue

                try:
                    stat = fpath.stat()
                    try:
                        rel_file = str(fpath.relative_to(root))
                    except ValueError:
                        rel_file = fname

                    files.append(
                        FileEntry(
                            name=fname,
                            path=str(fpath),
                            rel_path=rel_file,
                            size=stat.st_size,
                            modified=stat.st_mtime,
                            created=getattr(stat, "st_birthtime", stat.st_ctime),
                            type=_get_file_type(fpath.suffix),
                            extension=fpath.suffix.lower(),
                            rating=all_ratings.get(rel_file, 0),
                        )
                    )
                except OSError as e:
                    logger.debug(f"Could not stat file {fpath}: {e}")

            # Populate tags for all files
            if files and db is not None:
                try:
                    rel_paths = [f.rel_path for f in files]
                    all_tags_map = db.get_bulk_file_tags(rel_paths)
                    for f in files:
                        f.tags = all_tags_map.get(f.rel_path, [])
                except Exception as tag_err:
                    logger.warning(f"Could not load file tags: {tag_err}")

            return ScanFolderResponse(
                success=True,
                files=files,
                folder_path=str(target),
                message=f"Found {len(files)} files",
            )
        except Exception as e:
            logger.error(f"Folder scan failed: {e}")
            return ScanFolderResponse(success=False, message=f"Folder scan failed: {e}")

    return await asyncio.to_thread(_scan_folder_sync)


@router.post("/scan-recursive", response_model=ScanRecursiveResponse)
async def scan_recursive(request: ScanRecursiveRequest) -> ScanRecursiveResponse:
    """Recursively scan a project folder and all subfolders.

    Returns a flat list of folder entries, each with their files.
    Includes file sizes, modification times, and optionally dimensions.
    """
    folder_path = _translate_path(request.folder_path)
    is_safe, error_msg = _is_path_safe(folder_path)
    if not is_safe:
        return ScanRecursiveResponse(
            success=False, message=f"Security error: {error_msg}"
        )

    def _scan_sync() -> ScanRecursiveResponse:
        try:
            root = Path(folder_path)
            if not root.exists() or not root.is_dir():
                return ScanRecursiveResponse(
                    success=False, message=f"Folder not found: {folder_path}"
                )

            folders: list[FolderEntry] = []
            total_files = 0
            total_size = 0

            # Get DB for ratings/tags — non-fatal if DB is unavailable
            all_ratings: dict[str, int] = {}
            try:
                db = _get_db(folder_path)
                all_ratings = db.get_all_ratings()
            except Exception as db_err:
                logger.warning(f"Could not load ratings from DB: {db_err}")

            # Walk directory tree, skip hidden folders and .trash
            for dirpath, dirnames, filenames in os.walk(root):
                # Skip hidden directories and .trash
                dirnames[:] = [
                    d for d in dirnames if not d.startswith(".") and d != ".trash"
                ]
                dirnames.sort()

                current = Path(dirpath)
                try:
                    rel_dir = str(current.relative_to(root))
                except ValueError:
                    rel_dir = ""

                files: list[FileEntry] = []
                folder_size = 0
                subfolders = [d for d in dirnames]

                for fname in sorted(filenames):
                    fpath = current / fname
                    if fpath.suffix.lower() not in MEDIA_EXTENSIONS:
                        continue
                    if fname.startswith("."):
                        continue

                    try:
                        stat = fpath.stat()
                        rel_file = str(fpath.relative_to(root))

                        entry = FileEntry(
                            name=fname,
                            path=str(fpath),
                            rel_path=rel_file,
                            size=stat.st_size,
                            modified=stat.st_mtime,
                            created=getattr(stat, "st_birthtime", stat.st_ctime),
                            type=_get_file_type(fpath.suffix),
                            extension=fpath.suffix.lower(),
                            rating=all_ratings.get(rel_file, 0),
                        )

                        # Optionally get dimensions (slower)
                        if request.include_dimensions and entry.type == "image":
                            try:
                                from PIL import Image

                                with Image.open(fpath) as img:
                                    entry.width = img.width
                                    entry.height = img.height
                            except Exception:
                                pass

                        files.append(entry)
                        folder_size += stat.st_size
                        total_files += 1
                        total_size += stat.st_size
                    except OSError as e:
                        logger.debug(f"Could not stat file {fpath}: {e}")

                # Include ALL directories so empty folders appear in the tree
                if True:
                    folders.append(
                        FolderEntry(
                            name=current.name if rel_dir else root.name,
                            path=str(current),
                            rel_path=rel_dir if rel_dir else ".",
                            files=files,
                            subfolders=subfolders,
                            file_count=len(files),
                            total_size=folder_size,
                        )
                    )

            return ScanRecursiveResponse(
                success=True,
                folders=folders,
                total_files=total_files,
                total_size=total_size,
                message=f"Scanned {len(folders)} folders, {total_files} files",
            )
        except Exception as e:
            logger.error(f"Recursive scan failed: {e}")
            return ScanRecursiveResponse(success=False, message=f"Scan failed: {e}")

    return await asyncio.to_thread(_scan_sync)


@router.post("/file-info", response_model=FileInfoResponse)
async def get_file_info(request: FileInfoRequest) -> FileInfoResponse:
    """Get detailed information about a single file.

    Includes dimensions, file size, dates, PNG metadata, rating, and tags.
    """
    path = _translate_path(request.file_path)
    project_path = _translate_path(request.project_path) if request.project_path else ""
    is_safe, error_msg = _is_path_safe(path)
    if not is_safe:
        return FileInfoResponse(success=False, message=f"Security error: {error_msg}")

    def _info_sync() -> FileInfoResponse:
        try:
            fpath = Path(path)
            if not fpath.exists() or not fpath.is_file():
                return FileInfoResponse(
                    success=False, message=f"File not found: {path}"
                )

            proj_root = Path(project_path) if project_path else None
            info = _get_file_info_sync(fpath, proj_root)

            entry = FileEntry(
                name=info["name"],
                path=info["path"],
                rel_path=info.get("rel_path", ""),
                size=info["size"],
                modified=info["modified"],
                created=info["created"],
                type=info["type"],
                extension=info["extension"],
                width=info.get("width"),
                height=info.get("height"),
            )

            # Get rating and tags from DB
            png_meta = None
            if project_path:
                db = _get_db(project_path)
                rel = info.get("rel_path", "")
                if rel:
                    entry.rating = db.get_rating(rel)
                    entry.tags = db.get_file_tags(rel)

            # Extract PNG metadata
            if fpath.suffix.lower() == ".png":
                try:
                    from PIL import Image

                    with Image.open(fpath) as img:
                        png_meta = {}
                        if "prompt" in img.info:
                            try:
                                png_meta["prompt"] = json.loads(img.info["prompt"])
                            except (json.JSONDecodeError, TypeError):
                                png_meta["prompt"] = img.info["prompt"]
                        if "workflow" in img.info:
                            try:
                                png_meta["workflow"] = json.loads(img.info["workflow"])
                            except (json.JSONDecodeError, TypeError):
                                png_meta["workflow"] = img.info["workflow"]
                        if "parameters" in img.info:
                            png_meta["parameters"] = img.info["parameters"]
                except Exception as e:
                    logger.debug(f"Could not read PNG metadata from {path}: {e}")

            return FileInfoResponse(success=True, file=entry, png_metadata=png_meta)
        except Exception as e:
            logger.error(f"Failed to get file info: {e}")
            return FileInfoResponse(success=False, message=f"Failed: {e}")

    return await asyncio.to_thread(_info_sync)


# ============================================================================
# File Operations
# ============================================================================


@router.post("/move-files", response_model=MoveFilesResponse)
async def move_files(request: MoveFilesRequest) -> MoveFilesResponse:
    """Move files to a target folder.

    Supports conflict resolution: skip, overwrite, or rename (add suffix).
    Updates the gallery SQLite database to reflect path changes.
    """
    target = _translate_path(request.target_folder)
    is_safe, error_msg = _is_path_safe(target)
    if not is_safe:
        return MoveFilesResponse(success=False, message=f"Security error: {error_msg}")

    def _move_sync() -> MoveFilesResponse:
        moved: list[dict[str, str]] = []
        skipped: list[str] = []
        errors: list[str] = []

        target_dir = Path(target)
        target_dir.mkdir(parents=True, exist_ok=True)

        proj_path = (
            _translate_path(request.project_path) if request.project_path else ""
        )
        proj_root = Path(proj_path) if proj_path else None
        db = _get_db(proj_path) if proj_path else None

        for fp in request.file_paths:
            fp = _translate_path(fp)
            src = Path(fp)
            if not src.exists():
                errors.append(f"Not found: {fp}")
                continue

            dest = target_dir / src.name

            # Handle conflicts
            if dest.exists():
                if request.conflict == "skip":
                    skipped.append(fp)
                    continue
                elif request.conflict == "rename":
                    # Add numeric suffix
                    stem = dest.stem
                    suffix = dest.suffix
                    counter = 1
                    while dest.exists():
                        dest = target_dir / f"{stem}_{counter}{suffix}"
                        counter += 1
                elif request.conflict == "overwrite":
                    pass  # shutil.move will overwrite

            try:
                shutil.move(str(src), str(dest))

                # Also move sidecar JSON
                json_src = src.with_suffix(".json")
                if json_src.exists():
                    json_dest = dest.with_suffix(".json")
                    shutil.move(str(json_src), str(json_dest))

                # Update DB paths
                if db and proj_root:
                    try:
                        old_rel = str(src.relative_to(proj_root))
                        new_rel = str(dest.relative_to(proj_root))
                        db.rename_file_path(old_rel, new_rel)
                    except ValueError:
                        pass

                moved.append({"old_path": fp, "new_path": str(dest)})
            except Exception as e:
                errors.append(f"Failed to move {src.name}: {e}")

        return MoveFilesResponse(
            success=len(errors) == 0,
            moved=moved,
            skipped=skipped,
            errors=errors,
            message=f"Moved {len(moved)}, skipped {len(skipped)}, errors {len(errors)}",
        )

    return await asyncio.to_thread(_move_sync)


@router.post("/rename-file", response_model=RenameFileResponse)
async def rename_file(request: RenameFileRequest) -> RenameFileResponse:
    """Rename a single file. Updates the gallery database."""
    fp = _translate_path(request.file_path)
    is_safe, error_msg = _is_path_safe(fp)
    if not is_safe:
        return RenameFileResponse(success=False, message=f"Security error: {error_msg}")

    def _rename_sync() -> RenameFileResponse:
        try:
            src = Path(fp)
            if not src.exists():
                return RenameFileResponse(
                    success=False, message=f"File not found: {fp}"
                )

            # Sanitize new name (no path separators)
            new_name = request.new_name.replace("/", "").replace("\\", "")
            if not new_name:
                return RenameFileResponse(
                    success=False, message="New name cannot be empty"
                )

            dest = src.parent / new_name
            if dest.exists() and dest != src:
                return RenameFileResponse(
                    success=False, message=f"File already exists: {new_name}"
                )

            # Save original timestamps before rename (CIFS/SMB destroys them)
            src_st = src.stat()
            original_atime = src_st.st_atime
            original_mtime = src_st.st_mtime

            src.rename(dest)

            # Restore original timestamps
            try:
                os.utime(str(dest), (original_atime, original_mtime))
            except OSError as e:
                logger.warning(f"Failed to restore timestamps on {dest}: {e}")

            # Also rename sidecar
            json_src = src.with_suffix(".json")
            if json_src.exists():
                json_dest = dest.with_suffix(".json")
                # Save sidecar timestamps
                json_st = json_src.stat()
                json_atime = json_st.st_atime
                json_mtime = json_st.st_mtime

                json_src.rename(json_dest)

                # Restore sidecar timestamps
                try:
                    os.utime(str(json_dest), (json_atime, json_mtime))
                except OSError as e:
                    logger.warning(f"Failed to restore timestamps on {json_dest}: {e}")

            # Update DB
            proj_path = (
                _translate_path(request.project_path) if request.project_path else ""
            )
            if proj_path:
                db = _get_db(proj_path)
                proj_root = Path(proj_path)
                try:
                    old_rel = str(src.relative_to(proj_root))
                    new_rel = str(dest.relative_to(proj_root))
                    db.rename_file_path(old_rel, new_rel)
                except ValueError:
                    pass

            return RenameFileResponse(
                success=True,
                old_path=str(src),
                new_path=str(dest),
                message=f"Renamed to {new_name}",
            )
        except Exception as e:
            logger.error(f"Rename failed: {e}")
            return RenameFileResponse(success=False, message=f"Rename failed: {e}")

    return await asyncio.to_thread(_rename_sync)


@router.post("/batch-rename", response_model=BatchRenameResponse)
async def batch_rename(request: BatchRenameRequest) -> BatchRenameResponse:
    """Batch rename files using a pattern.

    Pattern tokens: {original}, {index}, {date}, {time}, {year}, {month},
    {day}, {folder}, {ext}.

    Files are sorted by creation time so {index} follows chronological order.
    Set dry_run=true to preview without executing.
    """

    def _batch_sync() -> BatchRenameResponse:
        previews: list[BatchRenamePreview] = []
        errors: list[str] = []
        renamed = 0

        # Translate all paths
        translated = [_translate_path(fp) for fp in request.file_paths]

        # Build (path, creation_time, atime, mtime) tuples and sort by creation time
        # so {index} numbering follows chronological order
        path_times: list[tuple[str, float, float, float]] = []
        for fp in translated:
            p = Path(fp)
            if not p.exists():
                errors.append(f"Not found: {fp}")
                continue
            try:
                st = p.stat()
                # Use birth time if available (macOS), otherwise ctime (Linux)
                ctime = getattr(st, "st_birthtime", st.st_ctime)
                path_times.append((fp, ctime, st.st_atime, st.st_mtime))
            except OSError as e:
                errors.append(f"Cannot stat {p.name}: {e}")

        path_times.sort(key=lambda x: x[1])

        # Use pad_width from request for {index} zero-padding
        pad_w = request.pad_width

        proj_path = (
            _translate_path(request.project_path) if request.project_path else ""
        )
        proj_root = Path(proj_path) if proj_path else None
        db = _get_db(proj_path) if proj_path else None

        for i, (fp, ctime_val, orig_atime, orig_mtime) in enumerate(path_times):
            src = Path(fp)

            try:
                # Reuse creation time from sort phase — avoid redundant stat() on NAS
                dt = datetime.fromtimestamp(ctime_val)

                # Build replacement dict — all simple {token} replacements
                tokens: dict[str, str] = {
                    "original": src.stem,
                    "index": str(i + request.start_index).zfill(pad_w),
                    "date": dt.strftime("%Y-%m-%d"),
                    "time": dt.strftime("%H%M%S"),
                    "year": dt.strftime("%Y"),
                    "month": dt.strftime("%m"),
                    "day": dt.strftime("%d"),
                    "folder": src.parent.name,
                    "ext": src.suffix.lstrip("."),
                }

                # Handle {index:03d} style formatting (legacy support)
                pattern = request.pattern
                index_match = re.search(r"\{index:(\d+)d\}", pattern)
                if index_match:
                    width = int(index_match.group(1))
                    pattern = re.sub(
                        r"\{index:\d+d\}",
                        str(i + request.start_index).zfill(width),
                        pattern,
                    )
                    tokens.pop("index", None)

                # Replace simple tokens
                new_name = pattern
                for key, val in tokens.items():
                    new_name = new_name.replace(f"{{{key}}}", val)

                # Ensure extension is present
                if not Path(new_name).suffix:
                    new_name += src.suffix

                dest = src.parent / new_name
                previews.append(
                    BatchRenamePreview(
                        old_path=str(src),
                        old_name=src.name,
                        new_name=new_name,
                        new_path=str(dest),
                    )
                )

                if not request.dry_run:
                    if dest.exists() and dest != src:
                        errors.append(f"Target exists: {new_name}")
                        continue

                    src.rename(dest)

                    # Restore original timestamps (CIFS/SMB destroys them)
                    try:
                        os.utime(str(dest), (orig_atime, orig_mtime))
                    except OSError as e:
                        logger.warning(f"Failed to restore timestamps on {dest}: {e}")

                    # Also rename sidecar
                    json_src = src.with_suffix(".json")
                    if json_src.exists():
                        json_dest = dest.with_suffix(".json")
                        # Save sidecar timestamps
                        try:
                            json_st = json_src.stat()
                            json_atime = json_st.st_atime
                            json_mtime = json_st.st_mtime
                        except OSError:
                            json_atime, json_mtime = orig_atime, orig_mtime

                        json_src.rename(json_dest)

                        # Restore sidecar timestamps
                        try:
                            os.utime(str(json_dest), (json_atime, json_mtime))
                        except OSError as e:
                            logger.warning(
                                f"Failed to restore timestamps on {json_dest}: {e}"
                            )

                    # Update DB
                    if db and proj_root:
                        try:
                            old_rel = str(src.relative_to(proj_root))
                            new_rel = str(dest.relative_to(proj_root))
                            db.rename_file_path(old_rel, new_rel)
                        except ValueError:
                            pass

                    renamed += 1

            except Exception as e:
                errors.append(f"Error with {src.name}: {e}")

        return BatchRenameResponse(
            success=len(errors) == 0,
            previews=previews,
            renamed=renamed,
            errors=errors,
            message=f"{'Preview' if request.dry_run else 'Renamed'}: {len(previews)} files",
        )

    return await asyncio.to_thread(_batch_sync)


@router.post("/auto-rename", response_model=BatchRenameResponse)
async def auto_rename(request: AutoRenameRequest) -> BatchRenameResponse:
    """Auto-rename files in a folder by creation time.

    Applies the naming convention and numbers files sequentially by creation time.
    """
    folder_path = _translate_path(request.folder_path)

    def _auto_sync() -> BatchRenameResponse:
        previews: list[BatchRenamePreview] = []
        errors: list[str] = []
        renamed = 0

        folder = Path(folder_path)
        if not folder.exists() or not folder.is_dir():
            return BatchRenameResponse(
                success=False, message=f"Folder not found: {folder_path}"
            )

        proj_path = (
            _translate_path(request.project_path) if request.project_path else ""
        )
        proj_root = Path(proj_path) if proj_path else None
        db = _get_db(proj_path) if proj_path else None

        # Collect media files and sort by creation time
        media_files: list[tuple[Path, float, float, float]] = []
        for item in folder.iterdir():
            if item.is_file() and item.suffix.lower() in MEDIA_EXTENSIONS:
                if not item.name.startswith("."):
                    try:
                        stat = item.stat()
                        ctime = getattr(stat, "st_birthtime", stat.st_ctime)
                        media_files.append((item, ctime, stat.st_atime, stat.st_mtime))
                    except OSError:
                        pass

        media_files.sort(key=lambda x: x[1])

        for i, (fpath, ctime, orig_atime, orig_mtime) in enumerate(media_files):
            dt = datetime.fromtimestamp(ctime)
            pattern = request.naming_pattern
            tokens: dict[str, str] = {
                "folder": folder.name,
                "date": dt.strftime("%Y-%m-%d"),
                "time": dt.strftime("%H%M%S"),
                "ext": fpath.suffix.lstrip("."),
            }

            # Handle {index:03d} style formatting
            index_match = re.search(r"\{index:(\d+)d\}", pattern)
            if index_match:
                width = int(index_match.group(1))
                pattern = re.sub(r"\{index:\d+d\}", str(i + 1).zfill(width), pattern)
            else:
                tokens["index"] = str(i + 1).zfill(3)

            new_name = pattern
            for key, val in tokens.items():
                new_name = new_name.replace(f"{{{key}}}", val)

            if not Path(new_name).suffix:
                new_name += fpath.suffix

            dest = folder / new_name
            previews.append(
                BatchRenamePreview(
                    old_path=str(fpath),
                    old_name=fpath.name,
                    new_name=new_name,
                    new_path=str(dest),
                )
            )

            if not request.dry_run:
                if dest.exists() and dest != fpath:
                    errors.append(f"Target exists: {new_name}")
                    continue

                try:
                    fpath.rename(dest)

                    # Restore original timestamps (CIFS/SMB destroys them)
                    try:
                        os.utime(str(dest), (orig_atime, orig_mtime))
                    except OSError as e:
                        logger.warning(f"Failed to restore timestamps on {dest}: {e}")

                    json_src = fpath.with_suffix(".json")
                    if json_src.exists():
                        json_dest = dest.with_suffix(".json")
                        # Save sidecar timestamps
                        try:
                            json_st = json_src.stat()
                            json_atime = json_st.st_atime
                            json_mtime = json_st.st_mtime
                        except OSError:
                            json_atime, json_mtime = orig_atime, orig_mtime

                        json_src.rename(json_dest)

                        # Restore sidecar timestamps
                        try:
                            os.utime(str(json_dest), (json_atime, json_mtime))
                        except OSError as e:
                            logger.warning(
                                f"Failed to restore timestamps on {json_dest}: {e}"
                            )

                    if db and proj_root:
                        try:
                            old_rel = str(fpath.relative_to(proj_root))
                            new_rel = str(dest.relative_to(proj_root))
                            db.rename_file_path(old_rel, new_rel)
                        except ValueError:
                            pass

                    renamed += 1
                except Exception as e:
                    errors.append(f"Error renaming {fpath.name}: {e}")

        return BatchRenameResponse(
            success=len(errors) == 0,
            previews=previews,
            renamed=renamed,
            errors=errors,
            message=f"{'Preview' if request.dry_run else 'Renamed'}: {len(previews)} files by creation time",
        )

    return await asyncio.to_thread(_auto_sync)


# ============================================================================
# Trash System
# ============================================================================

TRASH_MANIFEST = ".manifest.json"


def _load_trash_manifest(trash_dir: Path) -> dict[str, str]:
    """Load the trash manifest (maps trash path -> original path)."""
    manifest_path = trash_dir / TRASH_MANIFEST
    if manifest_path.exists():
        try:
            with open(manifest_path) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_trash_manifest(trash_dir: Path, manifest: dict[str, str]) -> None:
    """Save the trash manifest."""
    manifest_path = trash_dir / TRASH_MANIFEST
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)


@router.post("/trash", response_model=TrashResponse)
async def trash_files(request: TrashRequest) -> TrashResponse:
    """Move files to trash (.trash folder or OS recycle bin)."""
    proj_path = _translate_path(request.project_path)

    def _trash_sync() -> TrashResponse:
        trashed: list[str] = []
        errors: list[str] = []

        proj_root = Path(proj_path)
        trash_dir = proj_root / ".trash"

        db = _get_db(proj_path) if proj_path else None

        for fp in request.file_paths:
            fp = _translate_path(fp)
            src = Path(fp)
            if not src.exists():
                errors.append(f"Not found: {fp}")
                continue

            try:
                if request.use_os_trash:
                    # Try OS trash
                    try:
                        import send2trash

                        send2trash.send2trash(str(src))

                        # Also trash sidecar
                        json_src = src.with_suffix(".json")
                        if json_src.exists():
                            send2trash.send2trash(str(json_src))

                        trashed.append(fp)
                    except ImportError:
                        errors.append(
                            f"send2trash not installed. Install with: pip install send2trash"
                        )
                        break
                else:
                    # Move to project .trash
                    trash_dir.mkdir(parents=True, exist_ok=True)

                    # Preserve relative folder structure
                    try:
                        rel = src.relative_to(proj_root)
                    except ValueError:
                        rel = Path(src.name)

                    dest = trash_dir / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)

                    # Handle name collision in trash
                    if dest.exists():
                        stem = dest.stem
                        suffix = dest.suffix
                        counter = 1
                        while dest.exists():
                            dest = dest.parent / f"{stem}_{counter}{suffix}"
                            counter += 1

                    shutil.move(str(src), str(dest))

                    # Also move sidecar
                    json_src = src.with_suffix(".json")
                    if json_src.exists():
                        json_dest = dest.with_suffix(".json")
                        shutil.move(str(json_src), str(json_dest))

                    # Record in manifest for restore
                    manifest = _load_trash_manifest(trash_dir)
                    manifest[str(dest.relative_to(trash_dir))] = str(rel)
                    _save_trash_manifest(trash_dir, manifest)

                    trashed.append(fp)

                # Remove from DB (soft — the record is deleted)
                if db:
                    try:
                        rel_path = str(src.relative_to(proj_root))
                        db.delete_file_record(rel_path)
                    except ValueError:
                        pass

            except Exception as e:
                errors.append(f"Failed to trash {src.name}: {e}")

        return TrashResponse(
            success=len(errors) == 0,
            trashed=trashed,
            errors=errors,
            message=f"Trashed {len(trashed)} file(s)",
        )

    return await asyncio.to_thread(_trash_sync)


@router.get("/trash", response_model=TrashListResponse)
async def list_trash(
    project_path: str = Query(..., description="Project root path"),
) -> TrashListResponse:
    """List files in the project .trash folder."""
    proj_path = _translate_path(project_path)

    def _list_sync() -> TrashListResponse:
        trash_dir = Path(proj_path) / ".trash"
        if not trash_dir.exists():
            return TrashListResponse(
                success=True, files=[], total_size=0, message="Trash is empty"
            )

        manifest = _load_trash_manifest(trash_dir)
        files: list[dict[str, Any]] = []
        total_size = 0

        for dirpath, _, filenames in os.walk(trash_dir):
            for fname in filenames:
                if fname == TRASH_MANIFEST:
                    continue
                fpath = Path(dirpath) / fname
                if fpath.suffix.lower() not in MEDIA_EXTENSIONS:
                    continue

                try:
                    stat = fpath.stat()
                    rel_trash = str(fpath.relative_to(trash_dir))
                    original_path = manifest.get(rel_trash, "")

                    files.append(
                        {
                            "name": fname,
                            "path": str(fpath),
                            "original_path": original_path,
                            "size": stat.st_size,
                            "trashed_at": datetime.fromtimestamp(
                                stat.st_mtime, tz=timezone.utc
                            ).isoformat(),
                            "type": _get_file_type(fpath.suffix),
                        }
                    )
                    total_size += stat.st_size
                except OSError:
                    pass

        files.sort(key=lambda x: x["trashed_at"], reverse=True)

        return TrashListResponse(
            success=True,
            files=files,
            total_size=total_size,
            message=f"{len(files)} file(s) in trash",
        )

    return await asyncio.to_thread(_list_sync)


@router.post("/restore", response_model=RestoreResponse)
async def restore_from_trash(request: RestoreRequest) -> RestoreResponse:
    """Restore files from .trash to their original location."""
    proj_path = _translate_path(request.project_path)

    def _restore_sync() -> RestoreResponse:
        restored: list[str] = []
        errors: list[str] = []

        proj_root = Path(proj_path)
        trash_dir = proj_root / ".trash"
        manifest = _load_trash_manifest(trash_dir)

        for fp in request.file_paths:
            trash_file = Path(_translate_path(fp))
            if not trash_file.exists():
                errors.append(f"Not found in trash: {fp}")
                continue

            try:
                rel_trash = str(trash_file.relative_to(trash_dir))
                original_rel = manifest.get(rel_trash, rel_trash)
                original_path = proj_root / original_rel

                # Ensure parent exists
                original_path.parent.mkdir(parents=True, exist_ok=True)

                # Handle collision
                dest = original_path
                if dest.exists():
                    stem = dest.stem
                    suffix = dest.suffix
                    counter = 1
                    while dest.exists():
                        dest = dest.parent / f"{stem}_{counter}{suffix}"
                        counter += 1

                shutil.move(str(trash_file), str(dest))

                # Also restore sidecar
                json_trash = trash_file.with_suffix(".json")
                if json_trash.exists():
                    json_dest = dest.with_suffix(".json")
                    shutil.move(str(json_trash), str(json_dest))

                # Remove from manifest
                manifest.pop(rel_trash, None)

                restored.append(str(dest))
            except Exception as e:
                errors.append(f"Failed to restore {trash_file.name}: {e}")

        _save_trash_manifest(trash_dir, manifest)

        return RestoreResponse(
            success=len(errors) == 0,
            restored=restored,
            errors=errors,
            message=f"Restored {len(restored)} file(s)",
        )

    return await asyncio.to_thread(_restore_sync)


@router.post("/empty-trash", response_model=TrashResponse)
async def empty_trash(request: EmptyTrashRequest) -> TrashResponse:
    """Permanently delete all files in .trash."""
    proj_path = _translate_path(request.project_path)

    def _empty_sync() -> TrashResponse:
        trash_dir = Path(proj_path) / ".trash"
        if not trash_dir.exists():
            return TrashResponse(success=True, message="Trash already empty")

        try:
            shutil.rmtree(str(trash_dir))
            return TrashResponse(success=True, message="Trash emptied")
        except Exception as e:
            return TrashResponse(
                success=False, errors=[str(e)], message=f"Failed to empty trash: {e}"
            )

    return await asyncio.to_thread(_empty_sync)


# ============================================================================
# Ratings & Tags
# ============================================================================


@router.get("/ratings", response_model=RatingResponse)
async def get_ratings(
    project_path: str = Query(..., description="Project root path"),
    paths: str = Query(
        default="", description="Comma-separated relative paths (empty = all)"
    ),
) -> RatingResponse:
    """Get ratings for files from the gallery database."""
    proj_path = _translate_path(project_path)

    def _get_sync() -> RatingResponse:
        try:
            db = _get_db(proj_path)
            if paths:
                path_list = [p.strip() for p in paths.split(",") if p.strip()]
                ratings = db.get_ratings_bulk(path_list)
            else:
                ratings = db.get_all_ratings()
            return RatingResponse(success=True, ratings=ratings)
        except Exception as e:
            return RatingResponse(success=False, message=f"Failed: {e}")

    return await asyncio.to_thread(_get_sync)


@router.post("/ratings", response_model=RatingResponse)
async def set_ratings(request: RatingRequest) -> RatingResponse:
    """Set ratings for one or more files."""
    proj_path = _translate_path(request.project_path)

    def _set_sync() -> RatingResponse:
        try:
            db = _get_db(proj_path)
            db.set_ratings_bulk(request.ratings)
            return RatingResponse(
                success=True,
                ratings=request.ratings,
                message=f"Set {len(request.ratings)} rating(s)",
            )
        except Exception as e:
            return RatingResponse(success=False, message=f"Failed: {e}")

    return await asyncio.to_thread(_set_sync)


@router.get("/tags")
async def get_tags(
    project_path: str = Query(..., description="Project root path"),
) -> dict[str, Any]:
    """List all tags for a project."""
    proj_path = _translate_path(project_path)

    def _get_sync() -> dict[str, Any]:
        try:
            db = _get_db(proj_path)
            tags = db.list_tags()
            return {"success": True, "tags": tags}
        except Exception as e:
            return {"success": False, "tags": [], "message": str(e)}

    return await asyncio.to_thread(_get_sync)


@router.post("/tags")
async def create_or_update_tag(request: TagRequest) -> dict[str, Any]:
    """Create a new tag or update an existing one."""
    proj_path = _translate_path(request.project_path)

    def _tag_sync() -> dict[str, Any]:
        try:
            db = _get_db(proj_path)
            if request.tag_id is not None:
                db.update_tag(
                    request.tag_id, name=request.name or None, color=request.color
                )
                return {"success": True, "message": "Tag updated"}
            else:
                tag = db.create_tag(request.name, request.color)
                return {"success": True, "tag": tag}
        except ValueError as e:
            return {"success": False, "message": str(e)}
        except Exception as e:
            return {"success": False, "message": str(e)}

    return await asyncio.to_thread(_tag_sync)


@router.delete("/tags")
async def delete_tag(
    project_path: str = Query(...),
    tag_id: int = Query(...),
) -> dict[str, Any]:
    """Delete a tag."""
    proj_path = _translate_path(project_path)

    def _del_sync() -> dict[str, Any]:
        try:
            db = _get_db(proj_path)
            db.delete_tag(tag_id)
            return {"success": True, "message": "Tag deleted"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    return await asyncio.to_thread(_del_sync)


@router.post("/file-tags")
async def manage_file_tags(request: FileTagRequest) -> dict[str, Any]:
    """Add or remove tags from a file."""
    proj_path = _translate_path(request.project_path)

    def _tags_sync() -> dict[str, Any]:
        try:
            db = _get_db(proj_path)
            if request.action == "add":
                db.add_tags_to_file(request.file_path, request.tag_ids)
            elif request.action == "remove":
                db.remove_tags_from_file(request.file_path, request.tag_ids)
            else:
                return {
                    "success": False,
                    "message": f"Unknown action: {request.action}",
                }

            tags = db.get_file_tags(request.file_path)
            return {"success": True, "tags": tags}
        except Exception as e:
            return {"success": False, "message": str(e)}

    return await asyncio.to_thread(_tags_sync)


# ============================================================================
# View State Persistence
# ============================================================================


@router.get("/views")
async def get_views(
    project_path: str = Query(...),
    name: str = Query(default="default"),
) -> dict[str, Any]:
    """Load a saved gallery view state."""
    proj_path = _translate_path(project_path)

    def _get_sync() -> dict[str, Any]:
        try:
            db = _get_db(proj_path)
            view = db.load_view(name)
            return {"success": True, "view": view}
        except Exception as e:
            return {"success": False, "message": str(e)}

    return await asyncio.to_thread(_get_sync)


@router.post("/views")
async def save_view(request: ViewStateRequest) -> dict[str, Any]:
    """Save gallery view state (auto-saved on changes)."""
    proj_path = _translate_path(request.project_path)

    def _save_sync() -> dict[str, Any]:
        try:
            db = _get_db(proj_path)
            view_id = db.save_view(
                name=request.name,
                view_mode=request.view_mode,
                sort_field=request.sort_field,
                sort_direction=request.sort_direction,
                thumbnail_size=request.thumbnail_size,
                filters_json=request.filters_json,
                current_path=request.current_path,
                folder_tree_state=request.folder_tree_state,
            )
            return {"success": True, "view_id": view_id}
        except Exception as e:
            return {"success": False, "message": str(e)}

    return await asyncio.to_thread(_save_sync)


# ============================================================================
# Search
# ============================================================================


@router.post("/search", response_model=SearchResponse)
async def search_prompts(request: SearchRequest) -> SearchResponse:
    """Search through PNG metadata/prompts for matching text.

    Scans all PNG files in the project (or subfolder) and searches through
    their embedded ComfyUI prompt and workflow metadata.
    """
    proj_path = _translate_path(request.project_path)

    def _search_sync() -> SearchResponse:
        try:
            from PIL import Image
        except ImportError:
            return SearchResponse(
                success=False, message="PIL not available for PNG metadata reading"
            )

        try:
            root = Path(proj_path)
            folder_sub = (
                request.folder_path.replace("\\", "/") if request.folder_path else ""
            )
            search_root = root / folder_sub if folder_sub else root
            if not search_root.exists():
                return SearchResponse(
                    success=False, message=f"Path not found: {search_root}"
                )

            query_lower = request.query.lower()
            results: list[SearchResult] = []
            db = _get_db(proj_path)
            all_ratings = db.get_all_ratings()

            for dirpath, dirnames, filenames in os.walk(search_root):
                dirnames[:] = [d for d in dirnames if not d.startswith(".")]

                for fname in filenames:
                    if len(results) >= request.max_results:
                        break
                    if not fname.lower().endswith(".png"):
                        continue

                    fpath = Path(dirpath) / fname
                    try:
                        with Image.open(fpath) as img:
                            for field_name in ("prompt", "workflow", "parameters"):
                                if field_name not in img.info:
                                    continue
                                text = img.info[field_name]
                                if isinstance(text, (dict, list)):
                                    text = json.dumps(text)
                                if query_lower in text.lower():
                                    # Extract context around match
                                    idx = text.lower().find(query_lower)
                                    start = max(0, idx - 50)
                                    end = min(len(text), idx + len(request.query) + 50)
                                    context = text[start:end]

                                    try:
                                        rel = str(fpath.relative_to(root))
                                    except ValueError:
                                        rel = fname

                                    results.append(
                                        SearchResult(
                                            file_path=str(fpath),
                                            rel_path=rel,
                                            match_field=field_name,
                                            match_context=context,
                                            rating=all_ratings.get(rel, 0),
                                        )
                                    )
                                    break  # One match per file is enough
                    except Exception:
                        pass

                if len(results) >= request.max_results:
                    break

            return SearchResponse(
                success=True,
                results=results,
                total=len(results),
                message=f"Found {len(results)} matching file(s)",
            )
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return SearchResponse(success=False, message=f"Search failed: {e}")

    return await asyncio.to_thread(_search_sync)


# ============================================================================
# Duplicate Detection
# ============================================================================


@router.post("/find-duplicates", response_model=DuplicateResponse)
async def find_duplicates(request: FindDuplicatesRequest) -> DuplicateResponse:
    """Find duplicate files by computing file hashes.

    Groups files with identical SHA-256 hashes.
    """
    folder_path = request.folder_path
    project_path = request.project_path or ""
    proj_path = _translate_path(folder_path) if folder_path else ""
    proj_root_path = _translate_path(project_path) if project_path else proj_path

    def _dup_sync() -> DuplicateResponse:
        try:
            scan_root = Path(proj_path) if proj_path else Path(proj_root_path)
            root = Path(proj_root_path) if proj_root_path else scan_root
            if not scan_root.exists():
                return DuplicateResponse(
                    success=False, message=f"Path not found: {scan_root}"
                )

            # First pass: group by file size (quick filter)
            size_groups: dict[int, list[Path]] = {}
            for dirpath, dirnames, filenames in os.walk(scan_root):
                dirnames[:] = [d for d in dirnames if not d.startswith(".")]
                for fname in filenames:
                    fpath = Path(dirpath) / fname
                    if fpath.suffix.lower() not in MEDIA_EXTENSIONS:
                        continue
                    try:
                        size = fpath.stat().st_size
                        size_groups.setdefault(size, []).append(fpath)
                    except OSError:
                        pass

            # Second pass: hash only files with matching sizes
            hash_groups: dict[str, list[dict[str, Any]]] = {}
            for size, files in size_groups.items():
                if len(files) < 2:
                    continue  # No duplicates possible

                for fpath in files:
                    try:
                        h = hashlib.sha256()
                        with open(fpath, "rb") as f:
                            for chunk in iter(lambda: f.read(8192), b""):
                                h.update(chunk)
                        file_hash = h.hexdigest()

                        try:
                            rel = str(fpath.relative_to(root))
                        except ValueError:
                            rel = fpath.name

                        hash_groups.setdefault(file_hash, []).append(
                            {
                                "path": str(fpath),
                                "rel_path": rel,
                                "name": fpath.name,
                                "size": size,
                                "modified": fpath.stat().st_mtime,
                            }
                        )
                    except Exception:
                        pass

            # Build response with only groups that have duplicates
            groups: list[DuplicateGroup] = []
            total_duplicates = 0
            wasted_space = 0
            for file_hash, files in hash_groups.items():
                if len(files) < 2:
                    continue
                groups.append(
                    DuplicateGroup(
                        hash=file_hash,
                        files=files,
                        size=files[0]["size"],
                    )
                )
                total_duplicates += len(files) - 1
                wasted_space += files[0]["size"] * (len(files) - 1)

            return DuplicateResponse(
                success=True,
                groups=groups,
                total_duplicates=total_duplicates,
                wasted_space=wasted_space,
                message=f"Found {len(groups)} duplicate group(s), {total_duplicates} duplicate file(s)",
            )
        except Exception as e:
            logger.error(f"Duplicate detection failed: {e}")
            return DuplicateResponse(success=False, message=f"Failed: {e}")

    return await asyncio.to_thread(_dup_sync)


# ============================================================================
# Folder Statistics
# ============================================================================


@router.post("/folder-stats", response_model=FolderStatsResponse)
async def get_folder_stats(request: FolderStatsRequest) -> FolderStatsResponse:
    """Get statistics for a folder: file counts, sizes, types."""
    folder_path = _translate_path(request.folder_path)

    def _stats_sync() -> FolderStatsResponse:
        try:
            folder = Path(folder_path)
            if not folder.exists() or not folder.is_dir():
                return FolderStatsResponse(
                    success=False, message=f"Folder not found: {folder_path}"
                )

            total_files = 0
            total_size = 0
            image_count = 0
            video_count = 0
            by_extension: dict[str, int] = {}
            subfolder_count = 0

            for dirpath, dirnames, filenames in os.walk(folder):
                dirnames[:] = [d for d in dirnames if not d.startswith(".")]
                subfolder_count += len(dirnames)

                for fname in filenames:
                    fpath = Path(dirpath) / fname
                    suffix = fpath.suffix.lower()
                    if suffix not in MEDIA_EXTENSIONS:
                        continue

                    try:
                        size = fpath.stat().st_size
                        total_files += 1
                        total_size += size
                        by_extension[suffix] = by_extension.get(suffix, 0) + 1

                        if suffix in IMAGE_EXTENSIONS:
                            image_count += 1
                        elif suffix in VIDEO_EXTENSIONS:
                            video_count += 1
                    except OSError:
                        pass

            return FolderStatsResponse(
                success=True,
                path=folder_path,
                total_files=total_files,
                total_size=total_size,
                image_count=image_count,
                video_count=video_count,
                subfolder_count=subfolder_count,
                by_extension=by_extension,
                message=f"{total_files} files in {subfolder_count + 1} folders",
            )
        except Exception as e:
            logger.error(f"Folder stats failed: {e}")
            return FolderStatsResponse(success=False, message=f"Failed: {e}")

    return await asyncio.to_thread(_stats_sync)
