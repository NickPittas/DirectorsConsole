# Director's Console Orchestrator - API Documentation

> **Last Updated**: February 22, 2026  
> **Server**: FastAPI on port 9820  
> **Entry Point**: `orchestrator/api/server.py` (exposed via `orchestrator/api/__init__.py`)

---

## Overview

The Orchestrator API provides REST endpoints for:
- **Job Management** — Submit, track, and cancel ComfyUI workflow jobs
- **Backend Management** — Monitor and control ComfyUI render nodes
- **Job Groups** — Parallel execution across multiple backends with WebSocket progress
- **Project Management** — Save/load projects, scan images, manage files
- **Path Translation** — Cross-platform path mapping (Windows/Linux/macOS)
- **Gallery** — Full media browser with 23 endpoints for file management, ratings, tags, search

### Architecture

```
┌──────────────────────┐
│  Frontend (React)    │
│  Port 5173           │
└──────────┬───────────┘
           │ REST / WebSocket
           ▼
┌──────────────────────┐
│  Orchestrator API    │◄── orchestrator/api/server.py
│  Port 9820           │◄── orchestrator/api/gallery_routes.py
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐     ┌──────────────────────┐
│  JobManager          │     │  gallery_db.py        │
│  Scheduler           │     │  JSON flat-file       │
│  BackendManager      │     │  {project}/.gallery/  │
└──────────┬───────────┘     └──────────────────────┘
           │
           ▼
┌──────────────────────┐
│  ComfyUI Backends    │
│  (Render Nodes)      │
└──────────────────────┘
```

### Quick Start

```bash
cd Orchestrator
python -m uvicorn orchestrator.api:app --host 0.0.0.0 --port 9820 --reload
```

### Interactive Documentation

- **Swagger UI**: http://localhost:9820/docs
- **ReDoc**: http://localhost:9820/redoc

---

## Core API Endpoints

### Health Check

#### `GET /health`

Returns server health status.

**Response** `200 OK`:
```json
{
  "status": "ok",
  "timestamp": "2026-02-22T12:00:00",
  "backends_online": 2,
  "version": "0.2.0"
}
```

---

### Job Management

#### `POST /api/job` — Submit Job

Submit a workflow manifest for execution on a ComfyUI backend.

**Request**:
```json
{
  "workflow_id": "flux_dev",
  "parameters": { "prompt": "cinematic shot", "steps": 20 },
  "metadata": { "source": "storyboard", "panel_id": "Panel_01" }
}
```

**Response** `202 Accepted`:
```json
{
  "job_id": "uuid-string",
  "status": "accepted",
  "message": "Job accepted for execution",
  "submitted_at": "2026-02-22T12:00:00"
}
```

#### `GET /api/jobs` — List All Jobs

#### `GET /api/jobs/{id}` — Get Job Status

#### `POST /api/jobs/{id}/cancel` — Cancel Job

---

### Backend Management

#### `GET /api/backends` — List Backends

Returns all registered ComfyUI render nodes with status.

#### `GET /api/backends/{id}` — Backend Details

#### `GET /api/backends/{id}/status` — Backend Status

---

### Job Groups (Parallel Execution)

#### `POST /api/job-groups` — Create Job Group

Submit multiple jobs for parallel execution across backends.

#### `GET /api/job-groups` — List Job Groups

#### `GET /api/job-groups/{id}` — Get Job Group Status

#### `WS /ws/job-groups/{id}` — Real-Time Progress

WebSocket endpoint for live progress updates during parallel generation.

---

### Project Management

#### `POST /api/scan-project-images` — Scan Project Images

Scan a project folder for generated images and videos.

**Request**: `{ "path": "/mnt/Mandalore/Projects/Eliot" }`

#### `GET /api/serve-image` — Serve Image

Serve an image or video file from the project folder.

**Query Params**: `?path=/mnt/Mandalore/Projects/Eliot/Panel_01/image.png`

**Supported MIME Types**: `.png`, `.jpg`, `.webp`, `.gif`, `.mp4`, `.mov`, `.avi`, `.webm`, `.mkv`

#### `DELETE /api/delete-image` — Delete Image

#### `POST /api/create-folder` — Create Folder

#### `GET /api/scan-versions` — Scan Versions

Find existing file versions for naming template resolution.

#### `GET /api/project` — Get Current Project

#### `POST /api/save-project` — Save Project Metadata

#### `POST /api/load-project` — Load Project Metadata

#### `GET /api/browse-folders` — Browse Folders

#### `GET /api/png-metadata` — Get PNG Metadata

Read ComfyUI workflow metadata embedded in PNG files.

---

### Path Translation (Cross-Platform)

Translates paths between Windows, Linux, and macOS mount points using configured mappings.

#### `GET /api/path-mappings` — List Mappings

Returns all configured path mappings and the current OS.

**Response**:
```json
{
  "mappings": [
    {
      "id": "uuid",
      "windows": "W:\\",
      "linux": "/mnt/Mandalore",
      "macos": "/Volumes/Mandalore",
      "enabled": true
    }
  ],
  "current_os": "linux"
}
```

#### `POST /api/path-mappings` — Add Mapping

#### `PUT /api/path-mappings/{id}` — Update Mapping

#### `DELETE /api/path-mappings/{id}` — Remove Mapping

#### `POST /api/translate-path` — Test Translation

Translate a path using configured mappings.

**Request**: `{ "path": "W:\\VFX\\Eliot\\renders" }`  
**Response**: `{ "translated": "/mnt/Mandalore/VFX/Eliot/renders", "original": "W:\\VFX\\Eliot\\renders" }`

---

## Gallery API Endpoints

All Gallery endpoints are prefixed with `/api/gallery/` and routed through `gallery_routes.py`.

**Storage**: JSON flat-file at `{projectPath}/.gallery/gallery.json`. SQLite is incompatible with CIFS/SMB NAS mounts due to missing POSIX file lock support.

### Browsing

#### `POST /api/gallery/scan-tree` — Folder Tree

Returns directory tree structure for the project (fast, dirs only, no file stat).

**Request**:
```json
{ "projectPath": "/mnt/Mandalore/Projects/Eliot" }
```

**Response**:
```json
{
  "tree": [
    {
      "name": "Panel_01",
      "path": "/mnt/Mandalore/Projects/Eliot/Panel_01",
      "children": []
    }
  ]
}
```

#### `POST /api/gallery/scan-folder` — Folder Contents

Returns files in a single folder with metadata (on-demand loading).

**Request**:
```json
{
  "projectPath": "/mnt/Mandalore/Projects/Eliot",
  "folderPath": "Panel_01"
}
```

**Response**:
```json
{
  "files": [
    {
      "name": "Eliot_Panel01_v001.png",
      "path": "/mnt/Mandalore/Projects/Eliot/Panel_01/Eliot_Panel01_v001.png",
      "size": 2048576,
      "modified": "2026-02-22T10:30:00",
      "type": "image"
    }
  ]
}
```

#### `POST /api/gallery/scan-recursive` — Full Recursive Scan

Scans all files in all subdirectories. Use sparingly on large projects.

#### `POST /api/gallery/file-info` — File Details

Returns detailed file info including PNG metadata (workflow, parameters).

**Request**: `{ "projectPath": "...", "filePath": "Panel_01/image.png" }`

### File Operations

#### `POST /api/gallery/move-files` — Move Files

Move files between folders within the project.

**Request**:
```json
{
  "projectPath": "...",
  "files": ["Panel_01/image1.png", "Panel_01/image2.png"],
  "destination": "Panel_02"
}
```

#### `POST /api/gallery/rename-file` — Rename Single File

**Request**: `{ "projectPath": "...", "filePath": "old_name.png", "newName": "new_name.png" }`

#### `POST /api/gallery/batch-rename` — Batch Rename

Rename multiple files using template, regex, or sequential patterns.

**Request**:
```json
{
  "projectPath": "...",
  "files": ["img1.png", "img2.png", "img3.png"],
  "mode": "template",
  "template": "{project}_{panel}_v{seq:3}",
  "startNumber": 1
}
```

**Modes**: `template` (token-based), `regex` (find/replace), `sequential` (numbered)

#### `POST /api/gallery/auto-rename` — Auto-Rename

Sequential auto-rename with project naming conventions.

### Trash (Soft Delete)

Files are moved to `{projectPath}/.gallery/.trash/` with metadata for restoration.

#### `POST /api/gallery/trash` — Trash Files

**Request**: `{ "projectPath": "...", "files": ["Panel_01/image.png"] }`

#### `GET /api/gallery/trash` — List Trash

**Query Params**: `?projectPath=/mnt/Mandalore/Projects/Eliot`

#### `POST /api/gallery/restore` — Restore from Trash

**Request**: `{ "projectPath": "...", "trashIds": ["uuid1", "uuid2"] }`

#### `POST /api/gallery/empty-trash` — Empty Trash

Permanently deletes all trashed files.

### Ratings

#### `GET /api/gallery/ratings` — Get Ratings

**Query Params**: `?projectPath=...`

**Response**: `{ "ratings": { "Panel_01/image.png": 4, "Panel_02/image.png": 5 } }`

#### `POST /api/gallery/ratings` — Set Rating

**Request**: `{ "projectPath": "...", "filePath": "Panel_01/image.png", "rating": 4 }`

Rating values: 1-5 (0 to remove)

### Tags

#### `GET /api/gallery/tags` — Get All Tags

**Response**:
```json
{
  "tags": {
    "uuid1": { "name": "Hero Shot", "color": "#ff6b6b" },
    "uuid2": { "name": "Approved", "color": "#51cf66" }
  }
}
```

#### `POST /api/gallery/tags` — Create/Update Tag

**Request**: `{ "projectPath": "...", "name": "Hero Shot", "color": "#ff6b6b" }`

#### `DELETE /api/gallery/tags` — Delete Tag

**Request**: `{ "projectPath": "...", "tagId": "uuid1" }`

#### `POST /api/gallery/file-tags` — Add/Remove File Tags

**Request**:
```json
{
  "projectPath": "...",
  "filePath": "Panel_01/image.png",
  "addTags": ["uuid1"],
  "removeTags": ["uuid2"]
}
```

### Views

Saved view configurations (sort order, filters, view mode).

#### `GET /api/gallery/views` — Get Views

#### `POST /api/gallery/views` — Save View

### Search

#### `POST /api/gallery/search` — Search PNG Metadata

Search through ComfyUI workflow metadata embedded in PNG files.

**Request**:
```json
{
  "projectPath": "...",
  "query": "cinematic shot",
  "fields": ["prompt", "negative_prompt"]
}
```

#### `POST /api/gallery/find-duplicates` — Find Duplicates

Find duplicate files by content hash.

**Request**: `{ "projectPath": "..." }`

**Response**: Groups of files with identical content hashes.

### Statistics

#### `POST /api/gallery/folder-stats` — Folder Statistics

**Request**: `{ "projectPath": "...", "folderPath": "Panel_01" }`

**Response**: `{ "fileCount": 42, "totalSize": 1073741824, "imageCount": 38, "videoCount": 4 }`

---

## Configuration

The API server uses `config.yaml`:

```yaml
data_dir: "./data"
log_dir: "./logs"

backends:
  - id: node1
    name: "Beast (5090)"
    host: "192.168.1.100"
    port: 8188
    enabled: true
    capabilities: ["flux", "sdxl"]
    max_concurrent_jobs: 2
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ORCHESTRATOR_PORT` | 9820 | API server port |
| `ORCHESTRATOR_COMFY_NODES` | (from config) | Comma-separated ComfyUI node addresses |
| `ORCHESTRATOR_CORS_ORIGINS` | `*` | Allowed CORS origins |

---

## Code Structure

```
orchestrator/
├── api/
│   ├── __init__.py          # Exposes app from server.py
│   ├── server.py            # FastAPI app, core endpoints (~60+)
│   └── gallery_routes.py    # Gallery API router (23 endpoints, ~2050 lines)
├── gallery_db.py            # JSON flat-file gallery storage (~681 lines)
├── path_translator.py       # Cross-platform path translation
├── app.py                   # Desktop app entry
├── main.py                  # CLI entry
├── core/
│   └── engine/
│       ├── job_manager.py   # Job execution engine
│       ├── scheduler.py     # Backend scheduling
│       └── graph_executor.py
├── backends/
│   ├── client.py            # ComfyUI HTTP/WS client
│   ├── manager.py           # Backend registry
│   └── health_monitor.py
└── data/
    └── path_mappings.json   # Persistent path mapping config
```

---

*Updated: February 22, 2026*  
*Project: Director's Console - Project Eliot*
