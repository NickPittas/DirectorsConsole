# UI Integration Implementation Plan

> **Created**: 2026-01-25
> **Status**: PHASE 1 COMPLETE - Application Launches Successfully
> **Purpose**: Wire up all implemented components into a working PyQt6 application

## Problem Statement

The codebase has excellent individual components but they're not integrated:
- MainWindow is a stub (not a QMainWindow) ✅ FIXED
- app.py doesn't launch QApplication ✅ FIXED
- CanvasWidget is a stub (not a QGraphicsScene) ✅ FIXED
- EmbeddedEditor is a stub (not a QWebEngineView) - PENDING
- All panels exist but aren't wired to MainWindow ✅ FIXED

## Task List

### Phase 1: Application Bootstrap (Critical - App Won't Launch Without)

#### Task 1.1: Implement MainWindow as QMainWindow
- **File**: `orchestrator/ui/main_window.py`
- **Status**: [x] Complete
- **Description**: 
  - Created proper QMainWindow subclass (~850 lines)
  - 4-panel layout (WorkflowBrowser left, Canvas center, ParameterPanel right, MonitorPanel+JobPanel bottom tabbed)
  - Full menu bar (File/Edit/View/Project/Backends/Run/Help)
  - Status bar with connection and job status
  - All panel signal connections

#### Task 1.2: Update app.py to Launch QApplication
- **File**: `orchestrator/app.py`
- **Status**: [x] Complete
- **Description**:
  - Creates QApplication instance
  - Instantiates MainWindow
  - Shows window and runs event loop
  - Graceful shutdown handling

### Phase 2: Canvas System (Critical - Core Visual Component)

#### Task 2.1: Implement CanvasWidget as QGraphicsView
- **File**: `orchestrator/ui/canvas/canvas_widget.py`
- **Status**: [x] Complete
- **Description**:
  - QGraphicsView with QGraphicsScene (~540 lines)
  - Pan (middle mouse drag)
  - Zoom (wheel, clamped 0.1-5.0)
  - Grid background (light/dark lines)
  - Node selection handling
  - Context menu for adding nodes
  - 6 node types with colored rectangles (placeholder graphics)

#### Task 2.2: Implement WorkflowNodeGraphics
- **File**: `orchestrator/ui/canvas/workflow_node.py`
- **Status**: [ ] Not Started
- **Dependencies**: Task 2.1
- **Description**:
  - Create QGraphicsItem for workflow nodes
  - Implement node header with title and color
  - Implement input/output ports
  - Implement drag to move
  - Double-click to open editor
- **Acceptance Criteria**:
  - Nodes render correctly
  - Drag works
  - Ports visible
  - Double-click emits signal

#### Task 2.3: Implement Other Node Types
- **File**: `orchestrator/ui/canvas/io_nodes.py`, `condition_node.py`
- **Status**: [ ] Not Started
- **Dependencies**: Task 2.2
- **Description**:
  - InputNode (green, circle shape)
  - OutputNode (red, circle shape)
  - ConditionNode (yellow, diamond shape)
  - FanOutNode (orange)
  - MergeNode (blue)
- **Acceptance Criteria**:
  - All 6 node types render
  - Each has distinct appearance
  - Ports work correctly

#### Task 2.4: Implement ConnectionEdge
- **File**: `orchestrator/ui/canvas/connection_edge.py`
- **Status**: [ ] Not Started
- **Dependencies**: Task 2.3
- **Description**:
  - Create QGraphicsPathItem for connections
  - Implement bezier curve rendering
  - Color by data type
  - Interactive creation (drag from port)
  - Highlight on hover/select
- **Acceptance Criteria**:
  - Connections render as curves
  - Can create by dragging
  - Can delete connections
  - Colors match data types

### Phase 3: Embedded Editor (Important - ComfyUI Integration)

#### Task 3.1: Implement EmbeddedEditor as QWebEngineView
- **File**: `orchestrator/ui/editor/embedded_editor.py`
- **Status**: [ ] Not Started
- **Dependencies**: Task 1.1
- **Description**:
  - Create QWebEngineView wrapper
  - Load ComfyUI web interface
  - JavaScript channel for communication
  - Workflow load/save bridge
- **Acceptance Criteria**:
  - Opens ComfyUI in webview
  - Can navigate to backend URL
  - Signals work for workflow sync

### Phase 4: Signal Wiring (Important - Component Communication)

#### Task 4.1: Wire Panel Signals to MainWindow
- **File**: `orchestrator/ui/main_window.py`
- **Status**: [ ] Not Started
- **Dependencies**: Tasks 1.1, 2.1
- **Description**:
  - WorkflowBrowser.workflow_selected -> load in canvas
  - MonitorPanel.add_backend_requested -> show BackendConfigDialog
  - ParameterPanel.parameter_changed -> update canvas node
  - JobPanel.job_selected -> highlight in canvas
  - Canvas.node_selected -> update ParameterPanel
- **Acceptance Criteria**:
  - Selecting workflow loads it
  - Adding backend shows dialog
  - Parameter changes update model
  - Job selection highlights node

#### Task 4.2: Wire Core to UI via AsyncBridge
- **File**: `orchestrator/app.py`, `orchestrator/ui/main_window.py`
- **Status**: [ ] Not Started
- **Dependencies**: Task 4.1
- **Description**:
  - Initialize BackendManager
  - Initialize JobManager
  - Connect progress signals to JobPanel
  - Connect status signals to MonitorPanel
  - Connect metrics to charts
- **Acceptance Criteria**:
  - Backend status updates in UI
  - Job progress shows in panel
  - Metrics charts update

### Phase 5: Testing & Polish

#### Task 5.1: Run Application End-to-End Test
- **Status**: [ ] Not Started
- **Dependencies**: All above
- **Description**:
  - Launch application
  - Add a backend
  - Import a workflow
  - Add nodes to canvas
  - Run a job
  - View results
- **Acceptance Criteria**:
  - Full workflow completes
  - No crashes
  - UI responsive throughout

#### Task 5.2: Update CODEMAP.md
- **Status**: [ ] Not Started
- **Dependencies**: All above
- **Description**:
  - Update all file statuses
  - Update phase completion
  - Add any new files
- **Acceptance Criteria**:
  - CODEMAP reflects actual state

---

## Implementation Order

1. **Task 1.1** + **Task 1.2** (Sequential - need MainWindow first)
2. **Task 2.1** → **Task 2.2** → **Task 2.3** → **Task 2.4** (Sequential - build on each other)
3. **Task 3.1** (Can be parallel with Phase 2)
4. **Task 4.1** + **Task 4.2** (After Phases 1-3)
5. **Task 5.1** + **Task 5.2** (Final)

## Parallel Execution Opportunities

- Task 2.1 (CanvasWidget) + Task 3.1 (EmbeddedEditor) - Independent
- Task 2.2 (WorkflowNode) + Task 2.3 (Other Nodes) - Can be done together if different agents
- Task 4.1 + Task 4.2 - Largely independent wiring

## Notes

- All existing panel implementations (MonitorPanel, ParameterPanel, etc.) are COMPLETE and just need wiring
- Use existing signal definitions from the panels
- Follow async_bridge pattern for core integration
- Reference pyqt-node-editor in references/ for canvas implementation patterns
