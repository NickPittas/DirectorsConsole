# Orchestrator API Architecture (Post-Refactor)

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      External Clients                           │
│  (StoryboardUI2, CPE, Custom Tools)                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ POST /api/job
                            │ GET /api/health
                            │ GET /api/backends
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI Server                                │
│                   (orchestrator/api.py)                          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Startup Initialization                                   │  │
│  │  • Load config.yaml                                       │  │
│  │  • Create Scheduler (register backends)                  │  │
│  │  • Create WorkflowStorage                                │  │
│  │  • Initialize JobManager                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Endpoints                                                │  │
│  │  • submit_job() → _manifest_to_project() → async task    │  │
│  │  • health_check() → query Scheduler                      │  │
│  │  • list_backends() → query Scheduler                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ async execution
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      JobManager                                  │
│              (orchestrator/core/engine/job_manager.py)           │
│                                                                  │
│  • run_job(project, params) → Job                              │
│  • Creates Job from Project                                    │
│  • Manages node execution graph                                │
│  • No PyQt dependency (headless mode)                          │
└───────┬────────────────────┬──────────────────┬─────────────────┘
        │                    │                  │
        │                    │                  │
        ▼                    ▼                  ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Scheduler   │    │ Workflow     │    │ ComfyUI      │
│              │    │ Storage      │    │ Client       │
│  • Select    │    │              │    │              │
│    backend   │    │ • Load       │    │ • Upload     │
│  • Monitor   │    │   workflow   │    │   media      │
│    status    │    │   JSON       │    │ • Queue      │
│              │    │ • Get        │    │   prompt     │
│              │    │   params     │    │ • Monitor    │
└──────────────┘    └──────────────┘    │ • Download   │
                                        └──────┬───────┘
                                               │
                                               │ HTTP/WS
                                               ▼
                                    ┌──────────────────────┐
                                    │  ComfyUI Backend     │
                                    │  (192.168.1.x:8188)  │
                                    │                      │
                                    │  • Execute workflow  │
                                    │  • Generate images   │
                                    │  • Return outputs    │
                                    └──────────────────────┘
```

## Request Flow (POST /api/job)

```
1. Client sends manifest:
   {
     "workflow_id": "txt2img_basic",
     "parameters": {"prompt": "sunset", "steps": 30}
   }
   
2. API validates and converts to Project:
   Project {
     canvas_layout: {
       nodes: [
         CanvasNode {
           type: WORKFLOW,
           workflow_id: "txt2img_basic",
           parameter_values: {"prompt": "sunset", "steps": 30}
         }
       ]
     }
   }
   
3. JobManager.run_job(project, params):
   a. Create Job object
   b. Load workflow from WorkflowStorage
   c. Select backend via Scheduler
   d. Upload media via ComfyUIClient
   e. Patch parameters into workflow JSON
   f. Queue on backend
   g. Monitor progress
   h. Download outputs
   i. Return completed Job
   
4. API returns:
   {
     "job_id": "abc-123",
     "status": "queued",
     "message": "Job queued for execution"
   }
```

## Key Components

### JobManager
- **Location**: `orchestrator/core/engine/job_manager.py`
- **Role**: Orchestrates job execution across backends
- **Dependencies**: Scheduler, WorkflowStorage, ComfyUIClient
- **PyQt**: ❌ None (works headless)

### Scheduler
- **Location**: `orchestrator/core/engine/scheduler.py`
- **Role**: Selects optimal backend for each workflow
- **Strategy**: Queue depth + GPU memory availability

### WorkflowStorage
- **Location**: `orchestrator/core/storage/workflow_storage.py`
- **Role**: Loads workflow JSON from `data/workflows/*.json`
- **Format**: WorkflowDefinition (Pydantic model)

### ComfyUIClient
- **Location**: `orchestrator/backends/client.py`
- **Role**: Communicates with ComfyUI backends
- **Protocol**: HTTP + WebSocket

## Configuration (config.yaml)

```yaml
data_dir: ./data              # Workflows stored in data/workflows/
log_dir: ./logs
database_path: ./data/orchestrator.db

backends:
  - id: backend_5090
    name: "Primary (RTX 5090)"
    host: 192.168.1.100
    port: 8188
    enabled: true
    capabilities: ["flux", "sd3"]
```

## Execution Modes

### 1. GUI Mode (PyQt Desktop App)
- Uses `orchestrator/app.py`
- JobManager with UI callbacks for progress
- Real-time canvas updates

### 2. Headless Mode (FastAPI Server)
- Uses `orchestrator/api.py`
- JobManager with `ui_callback=None`
- Progress logged only

**Both modes use the SAME JobManager** - no code duplication!

## No Mocks, No Stubs

All code paths are **REAL**:

✅ JobManager instantiation  
✅ Scheduler backend selection  
✅ WorkflowStorage loading  
✅ ComfyUIClient execution  
✅ Async job processing  

**Zero mock objects or stub implementations.**
