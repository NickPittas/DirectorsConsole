# ComfyUI Orchestrator - Complete Design Document

**Date:** 2026-01-25  
**Status:** Approved  
**Author:** AI Assistant + User Collaboration

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Requirements Summary](#requirements-summary)
3. [Architecture Overview](#architecture-overview)
4. [Project Structure](#project-structure)
5. [Data Models](#data-models)
6. [Graph Execution](#graph-execution)
7. [ComfyUI Integration](#comfyui-integration)
8. [UI Layout](#ui-layout)
9. [Reference Projects](#reference-projects)
10. [Implementation Phases](#implementation-phases)

---

## Executive Summary

The ComfyUI Orchestrator is a desktop application (PyQt6) that manages multiple ComfyUI installations across different computers, enabling users to:

- Create visual "workflow-of-workflows" graphs
- Distribute execution across multiple GPU machines
- Chain workflows with data passing, conditional branching, and parallel fan-out
- Monitor real-time GPU/VRAM metrics
- Edit ComfyUI workflows through an embedded editor

### Key Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Primary focus** | Production pipeline + Workflow composition | User's main use case |
| **Graph features** | Data passing, conditional branching, parallel fan-out, sequential | Full orchestration capability |
| **Editor workflow** | Import/export JSON | Avoids custom ComfyUI extension complexity |
| **Backend selection** | Manual affinity + optional auto fallback | User wants control |
| **Error handling** | Fail fast, prompt user for failover | Balance safety with flexibility |
| **Node canvas** | pyqt-node-editor library | Simpler than Ryven, sufficient features |
| **Monitoring** | Full metrics (GPU/VRAM/CPU) | Production monitoring needs |
| **Persistence** | SQLite database | Queryable history, metrics over time |
| **Code style** | Well-documented for learning | User learning async/Qt |

---

## Requirements Summary

From `Comfyui_Orchestrator.md`:

### Functional Requirements

1. **Multi-Backend Management**
   - Connect to 3-10 ComfyUI instances on different PCs
   - Health monitoring with online/offline detection
   - GPU/VRAM/CPU metrics collection
   - Manual backend assignment with fallback options

2. **Visual Workflow Composition**
   - Node canvas for creating workflow graphs
   - Node types: Workflow, Condition, FanOut, Merge, Input, Output
   - Data flow between nodes (images, videos, parameters)
   - Conditional branching based on outputs

3. **Workflow Management**
   - Import ComfyUI workflow JSON files
   - Parse and identify exposable parameters
   - Parameter exposure with custom display names
   - Embedded ComfyUI editor for modifications

4. **Job Execution**
   - Execute workflow graphs across backends
   - Real-time progress monitoring via WebSocket
   - Fail-fast error handling with user failover prompt
   - Job history and result tracking

5. **Persistence**
   - SQLite database for all data
   - Projects, workflows, job history, metrics
   - Configuration management

### Non-Functional Requirements

- Desktop application (Windows primary, cross-platform possible)
- Responsive UI during long operations
- Well-documented code for learning
- Modular architecture for maintainability

---

## Architecture Overview

```
+-----------------------------------------------------------------------------+
|                        ComfyUI Orchestrator (Desktop App)                   |
+-----------------------------------------------------------------------------+
|  +-------------+  +-----------------+  +----------------------------------+ |
|  |   UI Layer  |  | Orchestration   |  |        Backend Manager           | |
|  |             |  |     Core        |  |                                  | |
|  | - Node      |<-|                 |<-|  +----------+  +----------+     | |
|  |   Canvas    |  | - Graph         |  |  | Backend1 |  | Backend2 | ... | |
|  | - Parameter |  |   Executor      |  |  | (PC1)    |  | (PC2)    |     | |
|  |   Panel     |  | - Scheduler     |  |  +----+-----+  +----+-----+     | |
|  | - Monitor   |  | - Job Manager   |  |       |             |           | |
|  |   Panel     |  |                 |  |       v             v           | |
|  | - Embedded  |  +--------+--------+  |   HTTP/WS        HTTP/WS       | |
|  |   Editor    |           |           |                                  | |
|  +-------------+           |           +----------------------------------+ |
|         |                  |                           |                    |
|         v                  v                           v                    |
|  +---------------------------------------------------------------------+   |
|  |                    Persistence Layer (SQLite)                        |   |
|  |  - Projects, Workflows, Job History, Metrics, Configuration          |   |
|  +---------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------------+
|                        ComfyUI Instances (Remote PCs)                       |
+----------------+----------------+----------------+--------------------------+
|  PC1 (GPU1)    |  PC2 (GPU2)    |  PC3 (GPU3)    |  PC4+ ...                |
|  ComfyUI:8188  |  ComfyUI:8188  |  ComfyUI:8188  |  ComfyUI:8188            |
|  + Metrics     |  + Metrics     |  + Metrics     |  + Metrics               |
|    Agent       |    Agent       |    Agent       |    Agent                 |
+----------------+----------------+----------------+--------------------------+
```

### Core Components

1. **UI Layer** (PyQt6)
   - Node Canvas: Visual graph editor (pyqt-node-editor)
   - Parameter Panel: Edit exposed parameters
   - Monitor Panel: Backend status & metrics
   - Embedded Editor: QWebEngineView for ComfyUI

2. **Orchestration Core**
   - Graph Executor: Topological sort + DataFlowOptimized execution
   - Scheduler: Backend selection (manual affinity + fallback)
   - Job Manager: Job lifecycle, failure handling

3. **Backend Manager**
   - HTTP client (httpx async) for API calls
   - WebSocket for progress streaming
   - Health monitoring + metrics collection

4. **Persistence Layer** (SQLite)
   - All data stored in queryable database
   - WAL mode for concurrent access
   - Schema migrations support

---

## Project Structure

See `docs/architecture/overview.md` for full directory structure.

Key directories:

```
orchestrator/
  core/           # Business logic (no Qt dependencies)
    models/       # Pydantic data models
    engine/       # Graph executor, scheduler, job manager
    workflow/     # Workflow parsing & analysis
    conditions/   # Conditional logic evaluation
  backends/       # ComfyUI communication
  storage/        # SQLite persistence
  ui/             # PyQt6 UI layer
    canvas/       # Node graph editor
    panels/       # Side panels
    dialogs/      # Modal dialogs
    editor/       # Embedded ComfyUI editor
  utils/          # Shared utilities
```

---

## Data Models

See `docs/architecture/data-models.md` for complete model definitions.

### Core Entities

- **BackendConfig/BackendStatus**: ComfyUI instance configuration and runtime status
- **WorkflowDefinition**: Stored workflow with exposed parameters
- **ExposedParameter**: User-configurable workflow parameter
- **Project/CanvasLayout**: User project with node graph
- **CanvasNode/CanvasConnection**: Graph structure
- **Job/NodeExecution**: Execution tracking

### Key Enums

- **NodeType**: WORKFLOW, CONDITION, FANOUT, MERGE, INPUT, OUTPUT
- **JobStatus**: PENDING, RUNNING, PAUSED, COMPLETED, FAILED, CANCELLED
- **FallbackStrategy**: NONE, ASK_USER, AUTO_SELECT
- **DataType**: TRIGGER, IMAGE, VIDEO, LATENT, ANY

---

## Graph Execution

See `docs/architecture/graph-execution.md` for detailed algorithms.

### Execution Flow

1. **Preparation**: Validate graph, snapshot state, topological sort
2. **Execution**: Process ready nodes, dispatch to backends, monitor progress
3. **Completion**: Collect outputs, propagate to children, update waiting counts

### DataFlowOptimized Algorithm

Prevents exponential re-execution in diamond/fan-out patterns by:
- Tracking waiting counts per node
- Only firing when ALL inputs are ready
- Handles MERGE nodes as explicit barriers

### Backend Selection

```
1. Check manual affinity -> use if online
2. If offline, check fallback strategy:
   - NONE: Fail job
   - ASK_USER: Prompt for alternative
   - AUTO_SELECT: Pick best available
3. Auto-select criteria: capabilities match, lowest queue, lowest VRAM usage
```

---

## ComfyUI Integration

See `docs/architecture/api-integration.md` for API details.

### HTTP Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/prompt` | POST | Queue workflow execution |
| `/history/{id}` | GET | Get execution results |
| `/view` | GET | Download generated images |
| `/upload/image` | POST | Upload input images |
| `/object_info` | GET | Get available nodes |
| `/interrupt` | POST | Cancel execution |
| `/free` | POST | Free VRAM |

### WebSocket Events

| Event | Purpose |
|-------|---------|
| `status` | Queue status updates |
| `executing` | Current node being executed |
| `progress` | Step progress (e.g., 15/30) |
| `executed` | Node completion with outputs |

### Workflow Format Conversion

Two formats exist:
- **Workflow format**: From "Save" button, includes positions, positional widget values
- **API format**: For `/prompt` endpoint, named inputs, link references

We use patterns from `Comfyui_api_client` for conversion.

---

## UI Layout

See `docs/architecture/ui-layout.md` for detailed mockups.

### Main Window Structure

```
+-------------------+------------------------+------------------+
|                   |                        |                  |
|  WORKFLOW         |      NODE CANVAS       |   PROPERTIES     |
|  BROWSER          |                        |                  |
|                   |   Visual graph editor  |   Selected node  |
|  Tree view of     |   for workflow-of-     |   configuration  |
|  saved workflows  |   workflows            |                  |
|                   |                        |                  |
+-------------------+------------------------+------------------+
|                        MONITOR PANEL                          |
|  Backend cards with real-time status, GPU/VRAM metrics        |
+---------------------------------------------------------------+
|  Status bar with execution controls                           |
+---------------------------------------------------------------+
```

### Key Dialogs

- **Embedded Editor**: QWebEngineView showing ComfyUI interface
- **Parameter Exposure**: Select parameters to expose from workflow
- **Failover Prompt**: User selects alternative backend on failure
- **Backend Config**: Add/edit ComfyUI instance settings

---

## Reference Projects

Cloned to `references/` directory:

| Repository | Purpose | Key Patterns to Reuse |
|------------|---------|----------------------|
| Comfyui_api_client | API client | Async client, format conversion, parameter injection |
| ComfyUI-Distributed | Multi-GPU | Worker management, health checks, WebSocket dispatch |
| ac-comfyui-queue-manager | Queue system | SQLite patterns, data models, queue service |
| pyqt-node-editor | Node canvas | Canvas framework, undo/redo, serialization |
| ryvencore | Graph execution | DataFlowOptimized algorithm |
| ryvencore-qt | Node UI | GUI widgets (reference only) |
| ComfyUI-Crystools | Monitoring | psutil/pynvml for GPU metrics |

---

## Implementation Phases

### Phase 1: Foundation (Core Infrastructure)

**Goal:** Basic app shell with database and backend connectivity

1. Project setup (pyproject.toml, dependencies)
2. SQLite database with migrations
3. Pydantic data models
4. Basic PyQt6 main window
5. Backend manager with health checks
6. Single workflow execution (no graph)

### Phase 2: Workflow Management

**Goal:** Import, parse, and edit workflows

1. Workflow JSON parser
2. API format converter
3. Parameter inspector (find exposable params)
4. Parameter exposure dialog
5. Workflow browser panel
6. Embedded ComfyUI editor

### Phase 3: Visual Canvas

**Goal:** Node-based workflow composition

1. Integrate pyqt-node-editor
2. Implement node types (Workflow, Input, Output)
3. Canvas serialization/deserialization
4. Properties panel for selected node
5. Project save/load

### Phase 4: Graph Execution

**Goal:** Execute workflow graphs

1. Graph executor with topological sort
2. DataFlowOptimized algorithm
3. Job manager with status tracking
4. Progress monitoring via WebSocket
5. Error handling and failover prompts

### Phase 5: Advanced Features

**Goal:** Complete orchestration capabilities

1. Condition node with expression evaluator
2. FanOut and Merge nodes
3. Data passing between workflows
4. Metrics collection and display
5. Metrics agent custom node

### Phase 6: Polish & Production

**Goal:** Production-ready application

1. Comprehensive error handling
2. Logging and diagnostics
3. User preferences/settings
4. Documentation and help
5. Testing and bug fixes

---

## Development Setup (Windows PowerShell)

All Python commands must run via `uv`.

```powershell
uv pip install -e .[dev]
uv run python -m orchestrator.main
```

See `docs/architecture/development.md` for the full setup guide.

---

## Agent Instructions

### CRITICAL: Codemap Maintenance

Every agent working on this project **MUST** update `docs/CODEMAP.md` after creating or modifying files. The codemap tracks:

- What each file does
- Key classes/functions
- Dependencies
- Status (complete/in-progress/planned)

### Context Loading

Before implementation, agents should read:

1. This design document
2. `docs/architecture/overview.md`
3. `docs/CODEMAP.md`
4. Relevant reference code in `references/`

### Code Standards

- Use type hints everywhere
- Document public APIs with docstrings
- Keep core/ free of Qt dependencies
- Use async/await for all I/O operations
- Follow patterns from reference projects
