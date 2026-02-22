# ComfyUI Orchestrator - Codemap

> **IMPORTANT FOR ALL AGENTS**: You MUST update this file after creating or significantly modifying any code files. This is the living documentation of the codebase.

## Last Updated
2026-02-22 - Added implemented API server, gallery, and path translation modules

## Quick Reference

| Need to... | Look at... |
|------------|------------|
| Understand the architecture | `docs/architecture/overview.md` |
| See data models | `docs/architecture/data-models.md` |
| Understand graph execution | `docs/architecture/graph-execution.md` |
| See ComfyUI API details | `docs/architecture/api-integration.md` |
| See UI design | `docs/architecture/ui-layout.md` |
| Dev setup (Windows + uv) | `docs/architecture/development.md` |
| Reference implementations | `references/` directory |

## Project Status

```
Phase 1: Foundation          [x] Complete (FastAPI server, backends, job management)
Phase 2: Workflow Management [x] Complete (job submission, cancellation, status tracking)
Phase 3: Visual Canvas       [—] N/A (frontend is React-based, in CinemaPromptEngineering/)
Phase 4: Graph Execution     [x] Complete (job groups, parallel execution)
Phase 5: Advanced Features   [x] Complete (gallery, path translation, project management)
Phase 6: Polish              [ ] Ongoing
```

> **Note:** The original plan assumed a PyQt6 desktop UI. The actual implementation uses a
> React/TypeScript frontend (in `CinemaPromptEngineering/frontend/`) and the Orchestrator
> is a pure FastAPI backend. Many planned files below were never created; the actual
> implemented files are listed in the "Implemented Modules" section.

## Directory Structure

### Repository Root

| File | Purpose | Status |
|------|---------|--------|
| `pyproject.toml` | Project metadata and dependencies | ✅ Complete |
| `README.md` | Project overview | ✅ Complete |
| `config.example.yaml` | Example configuration | ✅ Complete |
| `orchestrator/__init__.py` | Package version and exports | 🔄 In Progress |
| `orchestrator/main.py` | Application entry point | `main()` | ✅ Complete |
| `orchestrator/app.py` | Application bootstrap | `create_app()`, `run()` | ✅ Complete |

### Implemented Modules (Actual Production Code)

These are the files that are actually implemented and running in production, as opposed to the planned files listed in later sections.

#### `/orchestrator/api` - FastAPI Server

| File | Purpose | Key Classes/Functions | Status |
|------|---------|----------------------|--------|
| `__init__.py` | Package init, exposes `app` from `server.py` | `app` | ✅ Complete |
| `server.py` | Main FastAPI application (~2500 lines) | `app`, job/backend/project endpoints, path translation endpoints, WebSocket for job groups | ✅ Complete |
| `gallery_routes.py` | Gallery API router (~2050 lines) | `gallery_router`, 23 endpoints prefixed `/api/gallery/` | ✅ Complete |

#### `/orchestrator` - Core Modules

| File | Purpose | Key Classes/Functions | Status |
|------|---------|----------------------|--------|
| `gallery_db.py` | JSON flat-file gallery storage (~681 lines) | `GalleryDB` — ratings, tags, views, trash metadata | ✅ Complete |
| `path_translator.py` | Cross-platform path translation | `PathTranslator`, `PathMapping` — Windows/Linux/macOS path conversion | ✅ Complete |

#### Gallery API Endpoints (23 total, all in `gallery_routes.py`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/gallery/scan-tree` | POST | Get folder tree structure |
| `/api/gallery/scan-folder` | POST | Get files in one folder |
| `/api/gallery/scan-recursive` | POST | Recursive full scan |
| `/api/gallery/file-info` | POST | Detailed file info with metadata |
| `/api/gallery/move-files` | POST | Move files between folders |
| `/api/gallery/rename-file` | POST | Rename single file |
| `/api/gallery/batch-rename` | POST | Batch rename with templates/regex |
| `/api/gallery/auto-rename` | POST | Sequential auto-rename |
| `/api/gallery/trash` | POST | Soft-delete to `.gallery/.trash/` |
| `/api/gallery/trash` | GET | List trash contents |
| `/api/gallery/restore` | POST | Restore from trash |
| `/api/gallery/empty-trash` | POST | Permanently delete trash |
| `/api/gallery/ratings` | GET | Get file ratings |
| `/api/gallery/ratings` | POST | Set file ratings |
| `/api/gallery/tags` | GET | Get all tags |
| `/api/gallery/tags` | POST | Create/update tag |
| `/api/gallery/tags` | DELETE | Delete tag |
| `/api/gallery/file-tags` | POST | Add/remove tags on files |
| `/api/gallery/views` | GET | Get saved view states |
| `/api/gallery/views` | POST | Save view state |
| `/api/gallery/search` | POST | Search PNG metadata |
| `/api/gallery/find-duplicates` | POST | Find duplicate files by hash |
| `/api/gallery/folder-stats` | POST | Folder statistics |

#### Gallery Storage Architecture

```
{projectPath}/
├── .gallery/
│   ├── gallery.json          ← JSON flat-file (ratings, tags, views, trash metadata)
│   └── .trash/               ← Soft-deleted files stored here
│       └── {uuid}_{filename} ← Trash entries with UUID prefix
├── Panel_01/
│   ├── image_001.png
│   └── image_002.png
└── Panel_02/
    └── render_001.mp4
```

> **Why JSON, not SQLite?** Project paths live on TrueNAS (CIFS/SMB mount with `nounix,soft`
> options). SQLite requires POSIX file locks which CIFS does not support. JSON flat-file with
> atomic write (write temp → rename) works reliably on CIFS.

### `/docs` - Documentation

| File | Purpose | Status |
|------|---------|--------|
| `plans/2026-01-25-comfyui-orchestrator-design.md` | Complete design document | ✅ Complete |
| `architecture/overview.md` | Architecture diagrams, directory structure | ✅ Complete |
| `architecture/data-models.md` | Pydantic model definitions | ✅ Complete |
| `architecture/graph-execution.md` | Graph execution algorithms | ✅ Complete |
| `architecture/api-integration.md` | ComfyUI API documentation | ✅ Complete |
| `architecture/ui-layout.md` | UI mockups and design | ✅ Complete |
| `architecture/development.md` | Windows PowerShell uv setup | ✅ Complete |
| `CODEMAP.md` | This file - living codebase map | ✅ Complete |

### `/.tmp/sessions` - Planning Artifacts

| File | Purpose | Status |
|------|---------|--------|
| `.tmp/sessions/2026-01-25-comfyui-orchestrator/master-plan.md` | Master plan (component roadmap) | ✅ Complete |
| `.tmp/sessions/2026-01-25-comfyui-orchestrator/component-project-scaffolding.md` | Component plan: project scaffolding and configuration | ✅ Complete |

### `/orchestrator` - Main Application (Not yet created)

#### `/orchestrator/core/models` - Data Models

| File | Purpose | Key Classes | Status |
|------|---------|-------------|--------|
| `backend.py` | Backend configuration and status | `BackendConfig`, `BackendStatus` | ⏳ Planned |
| `workflow.py` | Workflow and parameter models | `WorkflowDefinition`, `ExposedParameter`, `ParamType` | ⏳ Planned |
| `project.py` | Project and canvas models | `Project`, `CanvasLayout`, `CanvasNode`, `CanvasConnection` | ⏳ Planned |
| `job.py` | Job execution models | `Job`, `JobStatus`, `NodeExecution` | ⏳ Planned |
| `metrics.py` | Metrics models | `MetricsSnapshot` | ⏳ Planned |

#### `/orchestrator/core/engine` - Orchestration Logic

| File | Purpose | Key Classes/Functions | Status |
|------|---------|----------------------|--------|
| `graph_executor.py` | Execute workflow graphs | `GraphExecutor`, `execute_graph()` | ⏳ Planned |
| `scheduler.py` | Backend selection | `Scheduler`, `select_backend()` | ⏳ Planned |
| `job_manager.py` | Job lifecycle management | `JobManager` | ⏳ Planned |
| `parameter_patcher.py` | Inject parameters into workflows | `patch_parameters()` | ⏳ Planned |

#### `/orchestrator/core/workflow` - Workflow Processing

| File | Purpose | Key Functions | Status |
|------|---------|---------------|--------|
| `parser.py` | Parse ComfyUI workflow JSON | `parse_workflow()` | ⏳ Planned |
| `converter.py` | Convert between formats | `workflow_to_api()`, `api_to_workflow()` | ⏳ Planned |
| `inspector.py` | Find exposable parameters | `inspect_parameters()` | ⏳ Planned |

#### `/orchestrator/core/conditions` - Conditional Logic

| File | Purpose | Key Classes | Status |
|------|---------|-------------|--------|
| `evaluator.py` | Evaluate conditions | `ConditionEvaluator` | ⏳ Planned |
| `expressions.py` | Parse condition DSL | `parse_expression()` | ⏳ Planned |

#### `/orchestrator/backends` - ComfyUI Communication

| File | Purpose | Key Classes | Status |
|------|---------|-------------|--------|
| `client.py` | HTTP/WS client for ComfyUI | `ComfyUIClient` | ⏳ Planned |
| `manager.py` | Manage multiple backends | `BackendManager` | ⏳ Planned |
| `metrics_collector.py` | Collect GPU/VRAM metrics | `MetricsCollector` | ⏳ Planned |
| `health_monitor.py` | Monitor backend health | `HealthMonitor` | ⏳ Planned |

#### `/orchestrator/storage` - Persistence Layer

| File | Purpose | Key Classes | Status |
|------|---------|-------------|--------|
| `database.py` | SQLite connection management | `Database`, `run_migrations()` | ⏳ Planned |
| `repositories/project_repo.py` | Project CRUD | `ProjectRepository` | ⏳ Planned |
| `repositories/workflow_repo.py` | Workflow CRUD | `WorkflowRepository` | ⏳ Planned |
| `repositories/job_repo.py` | Job CRUD | `JobRepository` | ⏳ Planned |
| `repositories/metrics_repo.py` | Metrics storage | `MetricsRepository` | ⏳ Planned |
| `migrations/001_initial.sql` | Initial schema | - | ⏳ Planned |

#### `/orchestrator/ui` - PyQt6 User Interface

| File | Purpose | Key Classes | Status |
|------|---------|-------------|--------|
| `main_window.py` | Main application window | `MainWindow` | ⏳ Planned |
| `canvas/canvas_widget.py` | Node graph container | `CanvasWidget` | ⏳ Planned |
| `canvas/workflow_node.py` | Workflow node type | `WorkflowNodeGraphics` | ⏳ Planned |
| `canvas/condition_node.py` | Condition node type | `ConditionNodeGraphics` | ⏳ Planned |
| `canvas/io_nodes.py` | I/O node types | `InputNode`, `OutputNode`, `FanOutNode`, `MergeNode` | ⏳ Planned |
| `panels/parameter_panel.py` | Parameter editing | `ParameterPanel` | ⏳ Planned |
| `panels/monitor_panel.py` | Backend monitoring | `MonitorPanel` | ⏳ Planned |
| `panels/workflow_browser.py` | Workflow tree view | `WorkflowBrowser` | ⏳ Planned |
| `panels/job_panel.py` | Job queue display | `JobPanel` | ⏳ Planned |
| `dialogs/backend_config.py` | Backend config dialog | `BackendConfigDialog` | ⏳ Planned |
| `dialogs/parameter_expose.py` | Parameter exposure dialog | `ParameterExposeDialog` | ⏳ Planned |
| `dialogs/failover_prompt.py` | Failover selection | `FailoverPromptDialog` | ⏳ Planned |
| `editor/embedded_editor.py` | QWebEngineView wrapper | `EmbeddedEditor` | ⏳ Planned |
| `widgets/metrics_chart.py` | Metrics visualization | `MetricsChart` | ⏳ Planned |
| `widgets/status_indicator.py` | Online/offline indicator | `StatusIndicator` | ⏳ Planned |
| `widgets/parameter_widgets.py` | Dynamic parameter editors | Various widget classes | ⏳ Planned |

#### `/orchestrator/utils` - Utilities

| File | Purpose | Key Functions | Status |
|------|---------|---------------|--------|
| `async_bridge.py` | asyncio <-> Qt integration | `AsyncWorker`, `run_async()` | ⏳ Planned |
| `logging_config.py` | Logging setup | `setup_logging()` | ✅ Complete |
| `config.py` | Application configuration | `AppConfig`, `BackendConfig`, `load_config()` | ✅ Complete |

### `/agents` - ComfyUI Custom Nodes

| File | Purpose | Status |
|------|---------|--------|
| `metrics_agent/nodes.py` | GPU metrics endpoint | ⏳ Planned |

### `/tests` - Test Suite

| File | Purpose | Status |
|------|---------|--------|
| `tests/unit/test_config.py` | Config loader tests | ✅ Complete |
| `tests/unit/test_logging_config.py` | Logging setup tests | ✅ Complete |
| `tests/fixtures/config.yaml` | Valid config fixture | ✅ Complete |
| `tests/fixtures/config-missing.yaml` | Missing-backend fixture | ✅ Complete |

### `/references` - Cloned Reference Projects

| Directory | Source | Purpose |
|-----------|--------|---------|
| `Comfyui_api_client/` | sugarkwork/Comfyui_api_client | API client patterns, format conversion |
| `ComfyUI-Distributed/` | robertvoy/ComfyUI-Distributed | Worker management, multi-GPU patterns |
| `ac-comfyui-queue-manager/` | abdullahceylan/ac-comfyui-queue-manager | SQLite queue patterns |
| `pyqt-node-editor/` | Csega/pyqt-node-editor | Node canvas framework |
| `ryvencore/` | leon-thomm/ryvencore | DataFlowOptimized algorithm |
| `ryvencore-qt/` | leon-thomm/ryvencore-qt | Qt node UI reference |
| `ComfyUI-Crystools/` | crystian/ComfyUI-Crystools | GPU monitoring with psutil/pynvml |

---

## Key Patterns to Follow

### Async Pattern
```python
# All I/O operations must be async
async def fetch_data():
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        return response.json()
```

### Repository Pattern
```python
# Data access through repositories
class WorkflowRepository:
    def __init__(self, db: Database):
        self.db = db
    
    async def get(self, id: str) -> WorkflowDefinition | None:
        ...
    
    async def save(self, workflow: WorkflowDefinition) -> None:
        ...
```

### Qt Signal Pattern
```python
# UI updates through signals
class BackendMonitor(QObject):
    status_changed = Signal(str, BackendStatus)  # backend_id, status
    
    def on_status_update(self, backend_id: str, status: BackendStatus):
        self.status_changed.emit(backend_id, status)
```

---

## Agent Instructions

### Before Starting Work

1. Read this CODEMAP.md
2. Read the relevant architecture doc
3. Check for existing patterns in reference code

### After Creating/Modifying Files

1. Update this CODEMAP.md with:
   - New files added
   - Status changes (Planned → In Progress → Complete)
   - Key classes/functions added
   - Dependencies noted

2. Example update:
```markdown
| `client.py` | HTTP/WS client | `ComfyUIClient` | ✅ Complete |
```

### Status Legend

- ⏳ Planned - Not started
- 🔄 In Progress - Currently being worked on
- ✅ Complete - Done and tested
- ⚠️ Needs Review - Complete but needs review
- ❌ Blocked - Waiting on dependency

---

## Dependencies Graph

```
main.py
└── app.py
    ├── ui/main_window.py
    │   ├── ui/canvas/*
    │   ├── ui/panels/*
    │   └── ui/dialogs/*
    ├── core/engine/job_manager.py
    │   ├── core/engine/graph_executor.py
    │   │   └── core/engine/scheduler.py
    │   └── backends/manager.py
    │       ├── backends/client.py
    │       └── backends/health_monitor.py
    └── storage/database.py
        └── storage/repositories/*
```

---

## Notes for Future Agents

### Known Complexities

1. **Async/Qt Integration**: Use `async_bridge.py` pattern - don't block Qt event loop
2. **Workflow Format**: Two formats exist (workflow vs API) - always convert appropriately
3. **Graph Execution**: Use DataFlowOptimized pattern for fan-out/merge graphs
4. **WebSocket**: ComfyUI WebSocket is per-client - manage connection lifecycle

### Reference Code Usage

When implementing new features, check reference code first:
- API client → `references/Comfyui_api_client/comfyuiclient/client.py`
- SQLite patterns → `references/ac-comfyui-queue-manager/database.py`
- Node canvas → `references/pyqt-node-editor/nodeeditor/`
- Graph execution → `references/ryvencore/ryvencore/FlowExecutor.py`
- GPU metrics → `references/ComfyUI-Crystools/`
