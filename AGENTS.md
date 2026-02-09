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
  - `imageHistory`: Stack of generated images with navigation
  - `status`: 'empty' | 'generating' | 'complete' | 'error'
- **Parameter Handling**: When switching workflows, ONLY preserve prompt and image inputs; reset all others (steps, cfg, sampler, etc.) to workflow defaults
- **Generation**: Always use panel's stored `parameterValues`, not global state

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
4. **Progress Bars**: Fixed overlay positioning for multi-node renders
5. **Notification Fix**: Timer no longer resets on re-renders

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
- StoryboardUI.tsx is 12,000+ line monolithic component

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

*Last Updated: February 6, 2026 - Phase 5 Code Review Remediation completed*
*Project: Director's Console - Project Eliot*
