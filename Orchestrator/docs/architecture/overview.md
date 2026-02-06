# Architecture Overview

## System Architecture Diagram

```
+-----------------------------------------------------------------------------+
|                        ComfyUI Orchestrator (Desktop App)                   |
+-----------------------------------------------------------------------------+
|                                                                             |
|  +---------------------------+  +----------------------------------------+ |
|  |        UI LAYER           |  |           CORE LAYER                   | |
|  |         (PyQt6)           |  |      (No Qt dependencies)              | |
|  +---------------------------+  +----------------------------------------+ |
|  |                           |  |                                        | |
|  |  +---------------------+  |  |  +----------------------------------+  | |
|  |  |    Main Window      |  |  |  |        Orchestration Engine      |  | |
|  |  +---------------------+  |  |  +----------------------------------+  | |
|  |  | - Menu bar          |  |  |  | - GraphExecutor                  |  | |
|  |  | - Status bar        |  |  |  |   Topological sort, execution    |  | |
|  |  | - Toolbar           |  |  |  |   flow, DataFlowOptimized        |  | |
|  |  +---------------------+  |  |  |                                  |  | |
|  |                           |  |  | - Scheduler                      |  | |
|  |  +---------------------+  |  |  |   Backend selection, affinity,   |  | |
|  |  |   Canvas Widget     |  |  |  |   fallback logic                 |  | |
|  |  +---------------------+  |  |  |                                  |  | |
|  |  | - Node graph editor |  |  |  | - JobManager                     |  | |
|  |  | - pyqt-node-editor  |  |  |  |   Job lifecycle, retry logic,    |  | |
|  |  | - Zoom/pan/select   |  |  |  |   failure handling               |  | |
|  |  +---------------------+  |  |  |                                  |  | |
|  |                           |  |  | - ParameterPatcher               |  | |
|  |  +---------------------+  |  |  |   Inject params into workflow    |  | |
|  |  |   Side Panels       |  |  |  +----------------------------------+  | |
|  |  +---------------------+  |  |                                        | |
|  |  | - Workflow browser  |  |  |  +----------------------------------+  | |
|  |  | - Properties panel  |  |  |  |        Workflow Processing       |  | |
|  |  | - Monitor panel     |  |  |  +----------------------------------+  | |
|  |  | - Job queue panel   |  |  |  | - Parser                         |  | |
|  |  +---------------------+  |  |  |   Parse ComfyUI workflow JSON    |  | |
|  |                           |  |  |                                  |  | |
|  |  +---------------------+  |  |  | - Converter                      |  | |
|  |  |   Dialogs           |  |  |  |   Workflow <-> API format        |  | |
|  |  +---------------------+  |  |  |                                  |  | |
|  |  | - Backend config    |  |  |  | - Inspector                      |  | |
|  |  | - Parameter expose  |  |  |  |   Find exposable parameters      |  | |
|  |  | - Failover prompt   |  |  |  +----------------------------------+  | |
|  |  | - Workflow import   |  |  |                                        | |
|  |  +---------------------+  |  |  +----------------------------------+  | |
|  |                           |  |  |        Condition Engine          |  | |
|  |  +---------------------+  |  |  +----------------------------------+  | |
|  |  |  Embedded Editor    |  |  |  | - Evaluator                      |  | |
|  |  +---------------------+  |  |  |   Evaluate condition expressions |  | |
|  |  | - QWebEngineView    |  |  |  |                                  |  | |
|  |  | - ComfyUI web UI    |  |  |  | - Expressions                    |  | |
|  |  +---------------------+  |  |  |   Parse condition DSL            |  | |
|  |                           |  |  +----------------------------------+  | |
|  +---------------------------+  +----------------------------------------+ |
|                                                                             |
|  +-----------------------------------------------------------------------+ |
|  |                         BACKEND LAYER                                 | |
|  +-----------------------------------------------------------------------+ |
|  |                                                                       | |
|  |  +------------------------------+  +-------------------------------+  | |
|  |  |      Backend Manager         |  |       Backend Client          |  | |
|  |  +------------------------------+  +-------------------------------+  | |
|  |  | - Manages all connections    |  | - Async HTTP (httpx)          |  | |
|  |  | - Backend registry           |  | - WebSocket for progress      |  | |
|  |  | - Connection pooling         |  | - Image upload/download       |  | |
|  |  +------------------------------+  +-------------------------------+  | |
|  |                                                                       | |
|  |  +------------------------------+  +-------------------------------+  | |
|  |  |     Health Monitor           |  |     Metrics Collector         |  | |
|  |  +------------------------------+  +-------------------------------+  | |
|  |  | - Periodic health checks     |  | - GPU/VRAM via metrics agent  |  | |
|  |  | - Online/offline detection   |  | - CPU/RAM via psutil          |  | |
|  |  | - Reconnection logic         |  | - Time-series storage         |  | |
|  |  +------------------------------+  +-------------------------------+  | |
|  |                                                                       | |
|  +-----------------------------------------------------------------------+ |
|                                                                             |
|  +-----------------------------------------------------------------------+ |
|  |                       PERSISTENCE LAYER                               | |
|  +-----------------------------------------------------------------------+ |
|  |                                                                       | |
|  |  +------------------------------+  +-------------------------------+  | |
|  |  |        Database              |  |       Repositories            |  | |
|  |  +------------------------------+  +-------------------------------+  | |
|  |  | - SQLite with WAL mode       |  | - ProjectRepository           |  | |
|  |  | - Connection management      |  | - WorkflowRepository          |  | |
|  |  | - Schema migrations          |  | - JobRepository               |  | |
|  |  | - Thread-safe access         |  | - MetricsRepository           |  | |
|  |  +------------------------------+  +-------------------------------+  | |
|  |                                                                       | |
|  +-----------------------------------------------------------------------+ |
|                                                                             |
+-----------------------------------------------------------------------------+
                                    |
                    HTTP/WebSocket Connections
                                    |
                                    v
+-----------------------------------------------------------------------------+
|                        ComfyUI Instances (Remote PCs)                       |
+-----------------------------------------------------------------------------+
|                                                                             |
|  +------------------------+  +------------------------+  +---------------+  |
|  |     PC1 (GPU1)         |  |     PC2 (GPU2)         |  |   PC3+ ...    |  |
|  +------------------------+  +------------------------+  +---------------+  |
|  |                        |  |                        |  |               |  |
|  |  ComfyUI Server        |  |  ComfyUI Server        |  |  ComfyUI      |  |
|  |  http://host:8188      |  |  http://host:8188      |  |  Server       |  |
|  |                        |  |                        |  |               |  |
|  |  +------------------+  |  |  +------------------+  |  |               |  |
|  |  | Metrics Agent    |  |  |  | Metrics Agent    |  |  |               |  |
|  |  | (Custom Node)    |  |  |  | (Custom Node)    |  |  |               |  |
|  |  +------------------+  |  |  +------------------+  |  |               |  |
|  |  | - GPU metrics    |  |  |  | - GPU metrics    |  |  |               |  |
|  |  | - VRAM usage     |  |  |  | - VRAM usage     |  |  |               |  |
|  |  | - Temperature    |  |  |  | - Temperature    |  |  |               |  |
|  |  +------------------+  |  |  +------------------+  |  |               |  |
|  |                        |  |                        |  |               |  |
|  +------------------------+  +------------------------+  +---------------+  |
|                                                                             |
+-----------------------------------------------------------------------------+
```

## Directory Structure

```
Comfy_Orchestrator/
├── docs/
│   ├── plans/
│   │   └── 2026-01-25-comfyui-orchestrator-design.md
│   ├── architecture/
│   │   ├── overview.md              # This file
│   │   ├── data-models.md           # All Pydantic models
│   │   ├── api-integration.md       # ComfyUI API patterns
│   │   ├── graph-execution.md       # Execution algorithms
│   │   ├── ui-layout.md             # UI mockups and structure
│   │   └── development.md           # Dev setup (Windows PowerShell)
│   └── CODEMAP.md                   # Living document: what each file does
│
├── orchestrator/
│   ├── __init__.py
│   ├── main.py                      # Application entry point
│   ├── app.py                       # QApplication setup, main window
│   │
│   ├── core/                        # Business logic (NO Qt dependencies)
│   │   ├── __init__.py
│   │   ├── models/                  # Pydantic data models
│   │   │   ├── __init__.py
│   │   │   ├── backend.py           # BackendConfig, BackendStatus
│   │   │   ├── workflow.py          # WorkflowDefinition, ExposedParameter
│   │   │   ├── project.py           # Project, CanvasNode, CanvasConnection
│   │   │   ├── job.py               # Job, JobStatus, NodeExecution
│   │   │   └── metrics.py           # MetricsSnapshot, ResourceUsage
│   │   │
│   │   ├── engine/                  # Orchestration logic
│   │   │   ├── __init__.py
│   │   │   ├── graph_executor.py    # Topological sort, DataFlowOptimized
│   │   │   ├── scheduler.py         # Backend selection, affinity logic
│   │   │   ├── job_manager.py       # Job lifecycle, failure handling
│   │   │   └── parameter_patcher.py # Inject params into workflow JSON
│   │   │
│   │   ├── workflow/                # Workflow parsing & analysis
│   │   │   ├── __init__.py
│   │   │   ├── parser.py            # Parse ComfyUI workflow JSON
│   │   │   ├── converter.py         # Workflow <-> API format conversion
│   │   │   └── inspector.py         # Find exposable parameters
│   │   │
│   │   └── conditions/              # Conditional logic for branching
│   │       ├── __init__.py
│   │       ├── evaluator.py         # Evaluate conditions
│   │       └── expressions.py       # Condition expression parser
│   │
│   ├── backends/                    # ComfyUI communication
│   │   ├── __init__.py
│   │   ├── client.py                # Async HTTP/WS client (httpx)
│   │   ├── manager.py               # BackendManager - manages all backends
│   │   ├── metrics_collector.py     # GPU/VRAM/CPU metrics via agent
│   │   └── health_monitor.py        # Periodic health checks
│   │
│   ├── storage/                     # Persistence layer
│   │   ├── __init__.py
│   │   ├── database.py              # SQLite connection, migrations
│   │   ├── repositories/            # Data access objects
│   │   │   ├── __init__.py
│   │   │   ├── project_repo.py
│   │   │   ├── workflow_repo.py
│   │   │   ├── job_repo.py
│   │   │   └── metrics_repo.py
│   │   └── migrations/              # Schema migrations
│   │       └── 001_initial.sql
│   │
│   ├── ui/                          # PyQt6 UI layer
│   │   ├── __init__.py
│   │   ├── main_window.py           # Main application window
│   │   ├── canvas/                  # Node graph editor
│   │   │   ├── __init__.py
│   │   │   ├── canvas_widget.py     # Main canvas container
│   │   │   ├── workflow_node.py     # Workflow node type
│   │   │   ├── condition_node.py    # Condition node type
│   │   │   ├── io_nodes.py          # Input/Output/FanOut/Merge nodes
│   │   │   ├── connection_edge.py   # Graph edges
│   │   │   └── port_socket.py       # Input/output ports
│   │   │
│   │   ├── panels/                  # Side panels
│   │   │   ├── __init__.py
│   │   │   ├── parameter_panel.py   # Edit exposed parameters
│   │   │   ├── monitor_panel.py     # Backend status & metrics
│   │   │   ├── job_panel.py         # Job queue & history
│   │   │   └── workflow_browser.py  # Browse saved workflows
│   │   │
│   │   ├── dialogs/                 # Modal dialogs
│   │   │   ├── __init__.py
│   │   │   ├── backend_config.py    # Add/edit backend
│   │   │   ├── parameter_expose.py  # Choose parameters to expose
│   │   │   ├── failover_prompt.py   # Ask user about failover
│   │   │   └── workflow_import.py   # Import workflow JSON
│   │   │
│   │   ├── editor/                  # Embedded ComfyUI editor
│   │   │   ├── __init__.py
│   │   │   └── embedded_editor.py   # QWebEngineView wrapper
│   │   │
│   │   └── widgets/                 # Reusable widgets
│   │       ├── __init__.py
│   │       ├── metrics_chart.py     # pyqtgraph charts
│   │       ├── status_indicator.py  # Green/yellow/red status
│   │       └── parameter_widgets.py # Dynamic parameter editors
│   │
│   └── utils/                       # Shared utilities
│       ├── __init__.py
│       ├── async_bridge.py          # asyncio <-> Qt thread bridge
│       ├── logging_config.py        # Logging setup
│       └── config.py                # App configuration
│
├── agents/                          # Custom ComfyUI nodes for metrics
│   └── metrics_agent/
│       ├── __init__.py
│       └── nodes.py                 # GPU/VRAM reporting endpoint
│
├── references/                      # Cloned reference repositories
│   ├── Comfyui_api_client/          # API client patterns
│   ├── ComfyUI-Distributed/         # Multi-GPU orchestration
│   ├── ac-comfyui-queue-manager/    # SQLite queue patterns
│   ├── pyqt-node-editor/            # Node canvas framework
│   ├── ryvencore/                   # Graph execution algorithms
│   ├── ryvencore-qt/                # Qt node UI reference
│   └── ComfyUI-Crystools/           # GPU monitoring patterns
│
├── tests/
│   ├── __init__.py
│   ├── unit/
│   │   ├── test_models.py
│   │   ├── test_parser.py
│   │   ├── test_converter.py
│   │   └── test_executor.py
│   ├── integration/
│   │   ├── test_backend_client.py
│   │   └── test_database.py
│   └── fixtures/
│       └── sample_workflows/
│
├── config.example.yaml              # Example configuration
├── pyproject.toml                   # Project dependencies
└── README.md
```

## Layer Responsibilities

### UI Layer (`orchestrator/ui/`)

**Responsibility:** User interaction, visual presentation

- PyQt6 widgets and windows
- Signal/slot connections for UI events
- No business logic - delegates to Core layer
- Async bridge for non-blocking operations

**Key Principle:** UI layer should be "thin" - it renders state and forwards user actions to the Core layer.

### Core Layer (`orchestrator/core/`)

**Responsibility:** Business logic, data processing

- Pydantic models for type-safe data
- Graph execution algorithms
- Workflow parsing and conversion
- Condition evaluation
- **NO Qt dependencies** - can be tested independently

**Key Principle:** Core layer is pure Python, enabling unit testing without Qt.

### Backend Layer (`orchestrator/backends/`)

**Responsibility:** External communication with ComfyUI instances

- Async HTTP client (httpx)
- WebSocket connection management
- Health monitoring
- Metrics collection

**Key Principle:** All I/O is async. Returns data to Core layer for processing.

### Persistence Layer (`orchestrator/storage/`)

**Responsibility:** Data persistence and retrieval

- SQLite database management
- Repository pattern for data access
- Schema migrations
- Thread-safe operations

**Key Principle:** Repository pattern isolates SQL from business logic.

## Data Flow

```
User Action (UI)
      |
      v
UI Layer (PyQt6)
      |
      | (Signal/Slot or direct call)
      v
Core Layer (Business Logic)
      |
      +---> Persistence Layer (SQLite)
      |           |
      |           v
      |     Read/Write Data
      |
      +---> Backend Layer (httpx/websocket)
                  |
                  v
            ComfyUI Instances
```

## Threading Model

```
+-------------------+     +-------------------+     +-------------------+
|    Main Thread    |     |   Async Thread    |     |   Worker Thread   |
|    (Qt Event      |     |   (asyncio)       |     |   (Optional)      |
|     Loop)         |     |                   |     |                   |
+-------------------+     +-------------------+     +-------------------+
|                   |     |                   |     |                   |
| - UI rendering    |     | - HTTP requests   |     | - Heavy CPU work  |
| - User events     |<--->| - WebSocket       |     | - Image processing|
| - Qt signals      |     | - Backend comms   |     | - File I/O        |
|                   |     |                   |     |                   |
+-------------------+     +-------------------+     +-------------------+
         ^                        ^
         |                        |
         +--- async_bridge.py ----+
         (QThread + asyncio integration)
```

The `async_bridge.py` utility provides:
- `AsyncWorker`: QThread subclass running asyncio event loop
- `run_async()`: Schedule coroutine from Qt thread
- Signal-based result delivery back to main thread
