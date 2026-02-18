# AGENTS.md - Development Guidelines for Director's Console

## Project Overview

**Director's Console** is a unified AI VFX production pipeline (Project Eliot) that combines specialized tools into a cohesive ecosystem for high-end AI-generated video and image production.

### The Components

1. **CinemaPromptEngineering (CPE)** - Cinematic rules engine for camera, lighting, and era-specific prompt generation
   - FastAPI backend with Pydantic models (`api/main.py`)
   - React/TypeScript frontend with Vite build system
   - Supports 35+ live-action film presets and animation presets
   - Integrates with multiple LLM providers (OpenAI, Anthropic, DeepInfra, etc.)
   - OAuth flow implementation for provider authentication
   - Templates system for ComfyUI workflow management
   - **⚠️ NOTE:** `ComfyCinemaPrompting/cinema_rules/` is a DUPLICATE - use main `cinema_rules/` module

2. **Orchestrator** - Distributed render farm manager for ComfyUI
   - FastAPI REST API for job submission (`orchestrator/api/server.py`)
   - Multi-backend ComfyUI node management
   - Real-time job progress via WebSocket
   - **⚠️ NOTE:** Frontend communicates DIRECTLY with ComfyUI nodes, NOT through Orchestrator API for workflow execution
   - Orchestrator used for: job groups, backend status, project management
   - Job groups feature for parallel execution across multiple backends

### Communication Architecture

- **Inter-Process**: JSON manifests via shared storage (TrueNAS) + REST API status broadcasting
- **Data Flow**: CPE → Orchestrator → ComfyUI Render Nodes
- **Storage Location**: User based, set from Project Settings in the Frontend

---

## Technology Stack

### Backend
- **Language**: Python 3.10+
- **Framework**: FastAPI (for API layers)
- **Data Validation**: Pydantic v2
- **Async**: asyncio, httpx, aiohttp
- **Process Management**: watchdog (for file system monitoring)
- **Packaging**: PyInstaller for standalone executables

### Frontend (CPE)
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query) v5
- **UI Components**: React Select, Lucide React icons
- **Styling**: Emotion (CSS-in-JS)

### Testing
- **Framework**: pytest
- **HTTP Testing**: fastapi.testclient.TestClient
- **Location**: `/tests` at project root

### Logging
- **Primary**: loguru
- **Fallback**: Standard logging module

---

## Project Structure

```
DirectorsConsole/
├── CinemaPromptEngineering/        # CPE module
│   ├── api/                        # FastAPI application
│   │   ├── main.py                 # Main API with endpoints
│   │   ├── templates.py            # Template router
│   │   └── providers/              # LLM provider integrations
│   ├── cinema_rules/               # Core rules engine
│   ├── frontend/                   # React frontend
│   ├── ComfyCinemaPrompting/       # ComfyUI custom node
│   └── Documentation/              # Comprehensive docs
│
├── Orchestrator/                   # Render farm module
│   └── orchestrator/
│       ├── api/                    # FastAPI server package
│       │   ├── __init__.py         # Exposes app from server.py
│       │   └── server.py           # FastAPI server (main entry)
│       ├── app.py                  # Desktop app entry
│       ├── main.py                 # CLI entry
│       ├── core/                   # Core engine
│       ├── backends/               # ComfyUI backend management
│       └── storage/                # Database and repositories
│
├── tests/                          # Cross-module tests
├── docs/                           # Additional documentation
├── WorkflowsForImport/             # ComfyUI workflow templates
└── agent_tasks/                    # Implementation task tracking
```

---

## Build and Run Commands

### Quick Start (All Services)
```powershell
# Primary launcher
python start.py

# Setup/verify environments
python start.py --setup
```

### Alternative Launcher
```powershell
# Legacy PowerShell launcher (still supported)
.\start-all.ps1
```

### CinemaPromptEngineering

**Backend:**
```bash
cd CinemaPromptEngineering
python -m uvicorn api.main:app --host 0.0.0.0 --port 9800 --reload
```

**Frontend Development:**
```bash
cd CinemaPromptEngineering/frontend
npm install
npm run dev              # Dev server on port 5173
npm run build            # Production build to dist/
npm run build:standalone # Standalone mode build
npm run build:comfyui    # ComfyUI node build
npm run lint             # ESLint check
```

**Build Standalone Executable:**
```powershell
# Windows
.\build_installer.ps1

# macOS/Linux
./build_installer.sh
```

### Orchestrator
```bash
cd Orchestrator
python -m uvicorn orchestrator.api:app --host 0.0.0.0 --port 9820 --reload
```

**⚠️ NOTE:** `orchestrator/api/__init__.py` exposes `app` from `orchestrator/api/server.py`.

---

## Testing

### Run All Tests
```bash
# From project root
python -m pytest tests/ -v

# Run specific test file
python -m pytest tests/test_cpe_api.py -v
python -m pytest tests/test_cinema_rules.py -v
```

### Test Structure
- `tests/test_cpe_api.py` - FastAPI endpoint tests (health, presets, generate, validate)
- `tests/test_cinema_rules.py` - Rules engine validation tests
- `tests/test_presets.py` - Preset definition tests
- `tests/test_path_translator.py` - Cross-platform path translation tests (38 tests)
- `tests/verify_cinema_rules.py` - Comprehensive rule verification

---

## Code Style Guidelines

### Python
1. **Type Hints**: Mandatory for all function signatures
   ```python
   def process_workflow(workflow_id: str, params: dict[str, Any]) -> JobResult:
       ...
   ```

2. **Docstrings**: Google-style for all public functions and classes
   ```python
   def validate_config(config: dict[str, Any]) -> ValidationResult:
       """Validate a workflow configuration.
       
       Args:
           config: The configuration dictionary to validate.
           
       Returns:
           ValidationResult containing is_valid flag and violations list.
           
       Raises:
           ConfigValidationError: If configuration structure is invalid.
       """
   ```

3. **Error Handling**: No silent failures; always log errors
   ```python
   try:
       result = await fetch_data()
   except httpx.HTTPError as e:
       logger.error(f"Failed to fetch data: {e}")
       raise APIError(f"Data fetch failed: {e}") from e
   ```

4. **Async First**: Use `async/await` for all I/O operations
   ```python
   async def submit_job(manifest: JobManifest) -> JobResponse:
       async with httpx.AsyncClient() as client:
           response = await client.post(url, json=manifest.dict())
   ```

5. **ComfyUI Integration**: Pass workflows to ComfyUI API; don't reimplement ComfyUI logic

### TypeScript/React
1. **Strict TypeScript**: Enable strict mode in tsconfig.json
2. **Functional Components**: Use function declarations, not const arrow functions
3. **State Management**: Use Zustand for global state, React Query for server state
4. **Imports**: Group by external, then internal (relative)

---

## Configuration

### Environment Variables

**CinemaPromptEngineering:**
```bash
# Optional: API configuration
CPE_API_PORT=9800
CPE_FRONTEND_PORT=5173
```

**Orchestrator:**
```bash
ORCHESTRATOR_PORT=9820
ORCHESTRATOR_COMFY_NODES="192.168.1.100:8188,192.168.1.101:8188"
```

---

## API Endpoints Reference

### CinemaPromptEngineering (Port 9800)
- `GET /api/health` - Health check
- `GET /presets/live-action` - List film presets
- `GET /presets/animation` - List animation presets
- `GET /enums` - List available enums
- `POST /generate-prompt` - Generate AI prompt from config
- `POST /validate` - Validate configuration
- `GET /settings/providers` - List LLM providers

### Orchestrator (Port 9820)

**Core Job Management:**
- `GET /health` - Health check
- `POST /api/job` - Submit job manifest
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/{id}` - Get job status
- `POST /api/jobs/{id}/cancel` - Cancel job

**Backend Management:**
- `GET /api/backends` - List ComfyUI backends
- `GET /api/backends/{id}` - Get backend details
- `GET /api/backends/{id}/status` - Get backend status

**Job Groups (Parallel Execution):**
- `POST /api/job-groups` - Create/manage job groups
- `GET /api/job-groups` - List job groups
- `GET /api/job-groups/{id}` - Get job group status
- `WS /ws/job-groups/{id}` - Real-time progress updates for job groups

**Project Management:**
- `POST /api/scan-project-images` - Scan project for images
- `GET /api/serve-image` - Serve project image
- `DELETE /api/delete-image` - Delete project image
- `POST /api/create-folder` - Create folder in project
- `GET /api/scan-versions` - Scan for existing versions
- `GET /api/project` - Get current project
- `POST /api/save-project` - Save project metadata
- `POST /api/load-project` - Load project metadata
- `GET /api/browse-folders` - Browse project folders
- `GET /api/png-metadata` - Get PNG metadata

**Path Translation (Cross-Platform):**
- `GET /api/path-mappings` - List all configured path mappings + current OS
- `POST /api/path-mappings` - Add a new path mapping
- `PUT /api/path-mappings/{id}` - Update an existing mapping
- `DELETE /api/path-mappings/{id}` - Remove a mapping
- `POST /api/translate-path` - Test-translate a path using configured mappings

---

## Development Workflow

### Adding New Film Presets
1. Add preset to `CinemaPromptEngineering/cinema_rules/presets/live_action.py`
2. Add cinematography style to `cinematography_styles.py`
3. Run tests: `python -m pytest tests/test_presets.py -v`
4. Verify with: `python CinemaPromptEngineering/audit_presets.py`

### Adding New API Endpoints
1. Define Pydantic models for request/response
2. Add endpoint function with proper type hints and docstrings
3. Include router in `main.py` if creating new module
4. Add corresponding tests in `tests/test_cpe_api.py`

### Frontend Development
1. Build mode is determined by `BUILD_MODE` environment variable
2. API base URL is configured via `.env.local` (auto-generated by `start-all.ps1`)
3. Static assets are served from `ComfyCinemaPrompting/web/app/`

---

## Security Considerations

1. **Credential Storage**: Use `api/providers/credential_storage.py` for secure API key storage
2. **CORS**: Development allows all origins; production should restrict to known hosts
3. **Authentication**: ComfyUI credentials stored in config (not committed to git)
4. **Path Traversal**: Always validate paths when accessing user-provided file paths

---

## Troubleshooting

### Common Issues

**Port already in use:**
```powershell
# start-all.ps1 auto-cleans ports, or manually:
Get-NetTCPConnection -LocalPort 9800 | Stop-Process -Id {$_.OwningProcess}
```

**Missing dependencies:**
```bash
# CPE Backend
uv pip install -r CinemaPromptEngineering/requirements.txt

# Frontend
cd CinemaPromptEngineering/frontend && npm install
```

**PyInstaller build fails:**
- Ensure frontend is built first: `npm run build`
- Check `cinema_prompt.spec` for hidden imports
- Build files go to `dist/static/`

---

## Model Usage Strategy

### Planning & Architecture
- **Primary**: `github-copilot/claude-opus-4.5`
- **Backup**: `github-copilot/gpt-5.2`

### Implementation
- **Primary**: `github-copilot/claude-sonnet-4.5`
- **Speed/Drafting**: `deepinfra/MiniMaxAI/MiniMax-M2.1`

### Code Review
- **Syntax/Logic**: `github-copilot/gpt-5.2-codex`
- **Reasoning**: `github-copilot/gemini-3-pro-preview`

**⚠️ RESTRICTED**: Do NOT use OpenRouter, DeepInfra (generic), or Requesty unless explicitly authorized.

---

## Key Implementation Details (Agent Notes)

### Frontend-ComfyUI Communication
The frontend communicates directly with ComfyUI nodes, NOT through the Orchestrator API:
- **Image URLs**: Point directly to ComfyUI endpoints (e.g., `http://localhost:8188/view?filename=...`)
- **Generation**: Frontend builds workflow JSON and sends to ComfyUI REST API
- **File Operations**: CORS blocks direct DELETE requests from browser - requires CPE backend proxy
- **WebSocket**: Real-time progress updates via direct WebSocket to ComfyUI

### Panel System Architecture
- **Panels** are the core canvas units, each with:
  - `workflowId`: Links to specific workflow configuration
  - `parameterValues`: Panel-specific parameters (NOT global)
  - `imageHistory`: Stack of generated images/videos with navigation
  - `status`: 'empty' | 'generating' | 'complete' | 'error'
  - `progressPhase`: Multi-KSampler phase indicator (e.g., "Phase 1/2")
  - `progressNodeName`: Currently executing ComfyUI node class (e.g., "KSampler", "VAEDecode")
  - `progressNodesExecuted` / `progressTotalNodes`: Workflow step counter
  - `parallelJobs`: Per-render-node tracking with full stage info
- **Parameter Handling**: When switching workflows, ONLY preserve prompt and image inputs; reset all others (steps, cfg, sampler, etc.) to workflow defaults
- **Generation**: Always use panel's stored `parameterValues`, not global state
- **Video Support**: Videos detected from ComfyUI `output.gifs` and `output.videos` keys, saved with correct extension, displayed inline with `<video>` element

### Render Node Management
- **Direct REST Calls**: Frontend calls ComfyUI nodes directly at their URLs
- **Node Status**: Polled via `/system_stats` endpoint
- **Restart**: Calls `/interrupt` then `/free` to clear memory
- **Cancel**: POST to `/interrupt` stops running generation
- **CORS Limitation**: Cannot DELETE files directly from browser - use CPE backend `/api/delete-file` proxy

### Recent Features Implemented
1. **Global Cancel Button**: Red button next to Generate, interrupts all busy nodes
2. **Node Restart**: System menu option + Node Manager selection with checkboxes
3. **Image Deletion**: Delete button on images (canvas + backend via proxy)
4. **Video Generation Pipeline**: Full support for AI video workflows (Wan 2.2, CogVideoX, etc.)
5. **Generation Progress Sidebar**: Dedicated sidebar component replacing panel overlays
6. **Per-Node Stage Tracking**: Real-time display of executing ComfyUI node type per render node
7. **Multi-KSampler Progress**: Accumulated progress across multiple sampler phases
8. **Notification Fix**: Timer no longer resets on re-renders

### Common Bugs & Solutions

**Workflow Mixing Bug**: 
- *Symptom*: Generating on Panel 1 uses Panel 2's parameters
- *Cause*: Using global `parameterValues` instead of panel-specific ones
- *Fix*: Use `panel.parameterValues || parameterValues` in `generatePanel()`

**CORS Issues**:
- *Symptom*: Cannot delete files, connection refused errors
- *Cause*: Browser blocks cross-origin requests to ComfyUI
- *Fix*: Route through CPE backend proxy endpoints

**Venv Health**:
- *Symptom*: "No module named 'loguru'" or similar import errors
- *Fix*: `start-all.ps1` checks imports and auto-repairs venv if unhealthy

### File Locations for Common Tasks

**Adding API Endpoints**:
- CPE Backend: `CinemaPromptEngineering/api/main.py`
- Orchestrator: `Orchestrator/orchestrator/api/server.py`

**Frontend Components**:
- Main UI: `CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx`
- Services: `CinemaPromptEngineering/frontend/src/storyboard/services/`
- Styles: `CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.css`

**Workflow Handling**:
- Parser: `CinemaPromptEngineering/frontend/src/storyboard/services/workflow-parser.ts`
- Builder: `CinemaPromptEngineering/frontend/src/storyboard/workflow-builder.ts`
- Templates: `CinemaPromptEngineering/frontend/src/storyboard/template-loader.ts`

**Video & Progress**:
- ComfyUI WebSocket: `CinemaPromptEngineering/frontend/src/storyboard/services/comfyui-websocket.ts`
- ComfyUI Client: `CinemaPromptEngineering/frontend/src/storyboard/services/comfyui-client.ts`
- Generation Progress Sidebar: `CinemaPromptEngineering/frontend/src/storyboard/components/GenerationProgress.tsx`
- Project Manager: `CinemaPromptEngineering/frontend/src/storyboard/services/project-manager.ts`

---

### Recent Fixes (Feb 14, 2026)

**Intelligent Parameter Disable Propagation** (Completed)
- **Downstream Cascade Bypass**: When disabling an image/Lora input, all downstream nodes that depend on it are now automatically disabled to prevent ComfyUI errors
- **Graph Traversal**: Implemented BFS-based downstream node discovery in `workflow-parser.ts`
- **Node Type Detection**: Added comprehensive list of node types that require specific input types (image, model, CLIP, control_net, etc.)
- **Multi-Level Cascade**: The cascade propagates through multiple levels (e.g., LoadImage → DWPreprocessor → ControlNetApply → KSampler)
- Added methods: `findDownstreamNodes()`, `cascadeBypassToDownstream()`, `_isRequiredInputForNode()`
- Added `QwenImageControlNetIntegratedLoader` to the list of nodes that require image input

**Path Normalization Fix** (Completed)
- **Windows Path Handling**: Fixed issue where Windows backslashes in model paths (e.g., `Qwen\model.safetensors`) weren't being converted to forward slashes for Linux
- **Dual Normalization**: Added path normalization in two places:
  1. `normalizeWorkflowPaths()` - scans entire workflow and normalizes all model/Lora paths at build time
  2. Inline normalization when applying parameter values
- **Supported Path Types**: unet_name, ckpt_name, model_name, lora_name, clip_name, vae_name, control_net_name, style_model_name

**Ollama Integration Fix** (Completed)
- **Endpoint Fix**: Changed to explicitly append `/api/chat` to Ollama endpoint (was causing 405 error)
- **Model Name Sanitization**: Strip `ollama:` prefix from model names before sending request
- **Embedding Model Filter**: Filter out embedding models (e.g., `nomic-embed-text`) from chat model list
- **Frontend Model Parsing**: Fixed parsing of model IDs containing colons (e.g., `ollama:llama3:latest`)

**Files Modified:**
- `workflow-parser.ts` - Downstream cascade bypass, path normalization, QwenImageControlNetIntegratedLoader
- `llm_service.py` - Ollama endpoint, model sanitization, embedding filter
- `Settings.tsx` - Model ID parsing for colons

---

### Recent Fixes (Feb 10, 2026)

**Cross-Platform Path Translation** (Completed)
- **Path Translator Module**: `Orchestrator/orchestrator/path_translator.py` — Core engine for translating paths between Windows, Linux, and macOS mount points
- **PathMapping Dataclass**: Stores per-mapping `windows`, `linux`, `macos` prefixes with enable/disable toggle
- **Persistent Config**: Mappings saved to `Orchestrator/orchestrator/data/path_mappings.json` (auto-created)
- **API Endpoints** (on Orchestrator port 9820):
  - `GET /api/path-mappings` — List all configured mappings + current OS detection
  - `POST /api/path-mappings` — Add a new path mapping
  - `PUT /api/path-mappings/{id}` — Update an existing mapping
  - `DELETE /api/path-mappings/{id}` — Remove a mapping
  - `POST /api/translate-path` — Test-translate a path using configured mappings
- **Auto-Translation**: All 13 path-consuming endpoints in `server.py` call `_translate_path()` BEFORE path safety checks and filesystem operations
- **CPE Backend**: `api/main.py` reads the same config file for `/api/read-image` and `/api/open-explorer` endpoints
- **Frontend UI**: `PathMappingsModal.tsx` — Full CRUD modal for managing path mappings, accessible from Main Menu → "Path Mappings"
- **Test Coverage**: 38 tests in `tests/test_path_translator.py` covering normalization, translation in all directions, persistence, and real-world NAS scenarios

**New Components:**
- `PathMappingsModal.tsx` + `PathMappingsModal.css` — Frontend modal for path mapping management with test translation feature

**New Files:**
- `Orchestrator/orchestrator/path_translator.py` — Core path translation engine
- `tests/test_path_translator.py` — Comprehensive test suite

**Files Modified:**
- `Orchestrator/orchestrator/api/server.py` — Import path_translator, add `_translate_path()` helper, add 5 API endpoints, integrate translation into 13 endpoints
- `CinemaPromptEngineering/api/main.py` — Add `_translate_path()` function (reads shared config), integrate into `read-image` and `open-explorer`
- `CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx` — Import PathMappingsModal, add state, render modal
- `CinemaPromptEngineering/frontend/src/storyboard/components/MainMenu.tsx` — Add "Path Mappings" menu item with ArrowRightLeft icon

**Path Translation Flow:**
```
User configures: W:\ ↔ /mnt/Mandalore ↔ /Volumes/Mandalore
     │
     ▼
Frontend sends path (from saved project or user input)
     │ e.g., "W:\VFX\Eliot\renders" (Windows-saved project)
     ▼
Backend receives path → _translate_path("W:\VFX\Eliot\renders")
     │ Looks up mapping, detects current OS = Linux
     ▼
Translated: "/mnt/Mandalore/VFX/Eliot/renders" → Path() works correctly
```

---

### Recent Fixes (Feb 9, 2026)

**Video Generation Pipeline** (Completed)
- **Video Output Retrieval**: Added `extractMediaOutputs()` to check `output.images`, `output.gifs`, `output.videos` keys from ComfyUI history
- **Video Detection**: `isVideoUrl()` checks filename param, direct URL extension, and path query parameter (for serve-image URLs)
- **Media Type Detection**: `detectMediaType()` returns 'image' | 'video' | 'animated' based on file extension
- **Dynamic Extensions**: `project-manager.ts` uses `getExtensionFromUrl()` to save files with correct extension (not hardcoded `.png`)
- **Backend Video MIME Types**: `server.py` now maps `.mp4→video/mp4`, `.mov→video/quicktime`, `.avi→video/x-msvideo`, `.webm→video/webm`, `.mkv→video/x-matroska`
- **Video Scan Support**: All scan endpoints (`scan_project_panels`, `scan_folder_images`, `scan_project_images`) now include video extensions `{'.mp4', '.mov', '.avi', '.webm', '.mkv'}`
- **Video Display**: `<video>` element with controls, loop, autoplay, muted in panel canvas and image viewer

**Multi-KSampler Progress Tracking** (Completed)
- **ProgressData Enhancement**: Added `overallPercent`, `currentPhase`, `totalPhases`, `currentNodeName`, `nodesExecuted`, `totalNodes`
- **WorkflowProgressInfo**: `buildWorkflowProgressInfo()` scans workflow JSON for all node class_types and sampler node IDs
- **Phase Accumulation**: Progress accumulates across multiple KSampler phases instead of resetting each time
- **Node Name Tracking**: `handleExecuting()` sends `currentNodeName` from `wfInfo.nodeTypes[node]` for every workflow node

**Generation Progress Sidebar** (Completed)
- **GenerationProgress.tsx**: New sidebar component showing per-panel progress cards
- **Panel Indicator**: Replaced old overlay with minimal 3px bottom bar + percentage badge (`.panel-generating-mini`)
- **Per-Node Stage Display**: Each parallel job row shows current ComfyUI node type, phase info, and step counter
- **Stage Data Flow**: `trackParallelJobWithWebSocket` now stores `currentNodeName`, `progressPhase`, `nodesExecuted`, `totalNodes`
- **Single-Node Stage**: Panel stores `progressNodesExecuted`, `progressTotalNodes`, `progressNodeName`, `progressPhase`

**New Components:**
- `GenerationProgress.tsx` - Sidebar progress panel with per-node stage tracking

**Files Modified:**
- `comfyui-websocket.ts` - Multi-phase progress, node name tracking, WorkflowProgressInfo
- `comfyui-client.ts` - `extractMediaOutputs()`, `isVideoUrl()`, `detectMediaType()`, video MIME handling
- `workflow-parser.ts` - Video output node detection
- `project-manager.ts` - Dynamic file extension, `getExtensionFromUrl()`
- `StoryboardUI.tsx` - Video rendering, progress sidebar integration, parallel job stage tracking
- `StoryboardUI.css` - Minimal progress bar styles, sidebar progress section styles
- `server.py` - Video extensions in scan endpoints, video MIME types in serve_image

---

### Recent Fixes (Feb 6, 2026)

**Phase 5: Code Review Remediation** (Completed)
- **5.1 Security Fixes**: 
  - SSRF protection in `/api/save-image`, `/api/fetch-image` endpoints
  - Path traversal protection in `/api/serve-image`, `/api/png-metadata`, `/api/load-project`
  - CORS restricted from wildcard to specific origins (env: `ORCHESTRATOR_CORS_ORIGINS`)
  - OAuth credentials moved to environment variables
- **5.2 Async I/O**: Wrapped blocking filesystem operations with `asyncio.to_thread()` in Orchestrator endpoints
- **5.3 Error Boundary**: Added React ErrorBoundary component wrapping major UI sections
- **5.4 WebSocket Reconnection**: Exponential backoff with jitter in all WebSocket files:
  - `comfyui-websocket.ts` (ComfyUI direct connection)
  - `comfyui-client.ts` (ComfyUI client class)
  - `useJobGroupWebSocket.ts` (Job group hook)
  - `parallelGenerationService.ts` (Parallel generation service)
- **5.6 Exception Handling**: Replaced bare `except:` with specific exception types in API files

**Canvas Overhaul & Panel System:**
- **Phase 1**: Fixed critical file deletion bugs - version collision prevention, savedPath tracking, path traversal protection
- **Phase 2**: Canvas architecture overhaul with per-panel folders, drag-to-move panels, resizable panels, panel naming
- **Phase 3**: Multi-select with Ctrl+Click, marquee selection, alignment toolbar, snap guides with Shift key
- **Phase 4**: Panel notes with markdown, star rating system (5 stars), print dialog with configurable layouts
- Panel renaming with lock protection when files exist
- Free-floating canvas with zoom from mouse pointer
- Per-panel folder structure: `{projectPath}/{panelName}/`
- Panel name token in filename templates: `{panel}` resolves to full name (e.g., "Panel_01", "Hero_Shot")

**New Components:**
- `PanelHeader.tsx` - Editable panel names, drag handle, star rating, lock indicator
- `PanelNotes.tsx` - Markdown notes with edit/view toggle
- `StarRating.tsx` - 5-star rating component
- `PrintDialog.tsx` - Print storyboard with layout options (1-4 per row)

**Files Modified:**
- `StoryboardUI.tsx` - Drag handling, multi-select, alignment, snap guides
- `project-manager.ts` - Per-panel folder resolution, version scanning by panel name
- `server.py` - Panel folder scanning (by name not ID)
- `ProjectSettingsModal.tsx` - Updated naming template preview

---

### Previous Fixes (Feb 4, 2026)

**Image Drag/Drop from Canvas:**
- Fixed drag/drop from canvas panels to parameter inputs
- Drag passes JSON with `url` and `filePath` to ImageDropZone
- ImageDropZone calls CPE backend `/api/read-image` endpoint to fetch file as base64 data URL
- Enables crop/mask tools to work on dragged images
- Processed images upload correctly to ComfyUI during generation

**Workflow & Parameter Selection:**
- Fixed: Currently selected panel now uses UI dropdown workflow selection (`selectedWorkflowId`)
- Fixed: Currently selected panel now uses live UI parameter values (`parameterValues`)
- Other panels (not selected) continue using their stored values

**Image Delete:**
- Fixed: Auto-saved images now store `savedPath` in metadata after saving
- Delete button on images now works for newly generated images

**Files Modified:**
- `StoryboardUI.tsx` - Drag handling, workflow/parameter selection logic, savedPath tracking
- `ImageDropZone.tsx` - Drop handling with backend fetch
- `api/main.py` - Added `/api/read-image` endpoint

---

## Critical Known Issues (As of Feb 6, 2026)

**Security (HIGH - Partially Addressed):**
- ✅ SSRF protection added to image fetch/save endpoints
- ✅ Path traversal protection added to file serving endpoints
- ✅ CORS restricted to specific origins (configurable via env)
- ✅ OAuth credentials moved to environment variables
- ⚠️ No authentication on sensitive endpoints (local-only use assumed)
- ⚠️ Prompt injection vulnerabilities in template building (needs review)

**Architecture (HIGH - Address Soon):**
- Duplicate `cinema_rules` directories (maintenance nightmare)
- Frontend bypasses Orchestrator API for workflow execution
- Inconsistent dependency versions across modules
- StoryboardUI.tsx is 7,100+ line monolithic component (reduced from 12,000+)

**Performance (MEDIUM - Partially Addressed):**
- No memoization in ParameterWidget components
- Missing request deduplication
- No code splitting (24MB bundle)
- ✅ WebSocket reconnection storms fixed (exponential backoff added)
- Excessive console logging
- ✅ Blocking I/O in async endpoints fixed

**Code Quality (MEDIUM - Partially Addressed):**
- Extensive use of `any` types (loses type safety)
- ✅ Bare `except:` blocks replaced with specific exceptions
- No test coverage for project management endpoints (0%)
- OAuth endpoints completely undocumented
- Minimal unit tests (only import tests exist)

**Documentation & Testing (LOW - Nice to Have):**
- Orchestrator API docs outdated (claims Phase 1 mock behavior that no longer exists)
- Missing documentation for 8+ new API endpoints
- No integration tests for full workflow cycles
- Test files in production code directories

**For detailed findings, see:** `code-review-findings/` directory with separate markdown reports for each topic.

---

*Last Updated: February 14, 2026 - Intelligent parameter disable propagation, Ollama fixes, path normalization*
*Project: Director's Console - Project Eliot*
