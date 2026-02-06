# UI Completion Plan - 2026-01-26

> **IMPORTANT FOR ALL AGENTS**: Before starting ANY task, read:
> 1. `docs/CODEMAP.md` - Living documentation of codebase
> 2. `Comfyui_Orchestrator.md` - Original requirements and tech stack
> 3. `docs/architecture/ui-layout.md` - Exact UI specifications
> 4. `docs/architecture/data-models.md` - Pydantic model definitions
> 5. `references/pyqt-node-editor/` - Node canvas reference implementation

## Current Status

### What Works
- MainWindow with 4-panel layout
- Basic canvas with pan/zoom/grid
- Node creation (6 types as colored boxes)
- All panel widgets exist (WorkflowBrowser, ParameterPanel, MonitorPanel, JobPanel)
- Core backend (BackendManager, JobManager, GraphExecutor)
- SQLite persistence layer with repositories
- 226 tests passing

### What's Broken/Missing
1. **Nodes are ugly boxes** - Need ComfyUI-style nodes with visible ports, headers, parameters
2. **No interactive connections** - Ports exist but can't drag to connect
3. **Config.yaml not synced with UI** - Can't add/remove backends from GUI
4. **No backend heartbeat** - No online/offline status indicators
5. **Parameter panel empty** - Doesn't show params when node selected
6. **AsyncBridge not wired** - Core events don't reach UI
7. **Window state not persisted** - Size/position lost on restart

---

## Phase A: Node Graphics Beautification

### Reference Implementation
See `references/pyqt-node-editor/nodeeditor/` for patterns.

### Node Design (from `docs/architecture/ui-layout.md`)

```
┌─────────────────────────────────┐
│ ● Portrait Generation           │  <- Colored header (blue for WORKFLOW)
├─────────────────────────────────┤
│  Backend: PC1 (RTX 4090)        │  <- Config display
│  Fallback: Ask User             │
│                                 │
│○ trigger   [image_out]──────────│○ output    <- Visible ports with labels
│○ image_in                       │○ metadata
│                                 │
│  [Edit] [Expose Params]         │  <- Action buttons
└─────────────────────────────────┘
```

### Color Scheme (from `docs/architecture/ui-layout.md`)
- INPUT: #4caf50 (green)
- WORKFLOW: #2196f3 (blue)
- CONDITION: #ffeb3b (yellow)
- FANOUT: #ff9800 (orange)
- MERGE: #9c27b0 (purple)
- OUTPUT: #f44336 (red)

### Files to Modify
- `orchestrator/ui/canvas/node_graphics.py` - Complete rewrite for beautiful nodes
- `orchestrator/ui/canvas/canvas_widget.py` - Integration

### Requirements
1. Rounded rectangle with gradient header
2. Visible input ports (left side) with labels
3. Visible output ports (right side) with labels
4. Port colors match DataType (from data-models.md)
5. Node body shows:
   - For WORKFLOW: Backend assignment, fallback strategy
   - For CONDITION: Expression preview
   - For FANOUT/MERGE: Mode display
6. Hover effects on ports
7. Selection highlight
8. Context menu on right-click

---

## Phase B: Interactive Connections

### Requirements
1. Click port → start drag → bezier curve follows mouse
2. Release on compatible port → create connection
3. Release on empty space → cancel
4. Visual feedback:
   - Valid target: green glow on port
   - Invalid target: red glow or cursor change
5. Data type validation (IMAGE can't connect to TRIGGER)

### Connection Colors (from `docs/architecture/ui-layout.md`)
- TRIGGER: #888888 (gray)
- IMAGE: #4caf50 (green)
- VIDEO: #2196f3 (blue)
- LATENT: #ff9800 (orange)
- ANY: #ffffff (white)

### Files to Modify
- `orchestrator/ui/canvas/node_graphics.py` - Port click signals
- `orchestrator/ui/canvas/connection_graphics.py` - Dragging connection
- `orchestrator/ui/canvas/canvas_widget.py` - Mouse event handling

---

## Phase C: Config.yaml Sync

### Requirements
1. Load `config.yaml` on startup → populate backends
2. UI "Add Backend" dialog → write to config.yaml
3. UI "Remove Backend" → update config.yaml
4. File watcher for external edits → reload UI
5. Validation before write

### Config Schema (from `config.yaml`)
```yaml
backends:
  - id: "backend-1"
    name: "PC1 - RTX 5090"
    host: "localhost"
    port: 8188
    enabled: true
    capabilities: [...]
    max_concurrent_jobs: 1
    tags: ["primary"]
```

### Files to Modify
- `orchestrator/utils/config.py` - Add save_config(), watch_file()
- `orchestrator/ui/main_window.py` - Wire config changes
- `orchestrator/ui/dialogs/backend_config.py` - Save to config

---

## Phase D: Backend Heartbeat

### Requirements
1. Periodic health check (every 10s configurable)
2. Status indicators: ● Online (green), ○ Offline (red), ◐ Checking (yellow)
3. Auto-reconnect on failure
4. Capability refresh on reconnect

### Implementation
- Use `orchestrator/backends/health_monitor.py` (already exists)
- Wire to MonitorPanel backend cards

### Files to Modify
- `orchestrator/backends/health_monitor.py` - Ensure polling works
- `orchestrator/ui/panels/monitor_panel.py` - Status indicator updates
- `orchestrator/ui/async_bridge.py` - Bridge health events to UI

---

## Phase E: SQLite Full Integration

### Existing Tables (from `docs/architecture/data-models.md`)
- backends
- workflows
- projects
- jobs
- metrics_snapshots

### Requirements
1. Test all repository CRUD operations
2. Verify migrations run correctly
3. Test job history persistence
4. Test workflow storage and retrieval

### Files to Test
- `orchestrator/storage/database.py`
- `orchestrator/storage/repositories/*.py`

---

## Phase F: Window State Persistence

### Requirements
1. Save on close: window geometry (x, y, width, height)
2. Save splitter positions
3. Save panel visibility states
4. Restore on startup

### Storage Options
- SQLite table: `app_settings`
- Or: `config.yaml` ui_state section

### Files to Modify
- `orchestrator/ui/main_window.py` - closeEvent save, showEvent restore
- `orchestrator/storage/database.py` - settings table

---

## Phase G: AsyncBridge Wiring

### Current State
`orchestrator/ui/async_bridge.py` exists but not connected to MainWindow

### Requirements
1. Instantiate AsyncBridge in MainWindow.__init__
2. Connect BackendManager events → AsyncBridge signals
3. Connect JobManager events → AsyncBridge signals
4. AsyncBridge signals → UI updates (status bar, panels)

### Signal Flow
```
BackendManager.on_status_change → AsyncBridge.backend_status_changed → MonitorPanel.update_card
JobManager.on_progress → AsyncBridge.job_progress → JobPanel.update_row + StatusBar
```

### Files to Modify
- `orchestrator/ui/main_window.py` - Create and wire AsyncBridge
- `orchestrator/ui/async_bridge.py` - Ensure all signals defined
- `orchestrator/ui/panels/monitor_panel.py` - Handle backend signals
- `orchestrator/ui/panels/job_panel.py` - Handle job signals

---

## Phase H: Parameter Panel Integration

### Requirements
1. Canvas node selection → ParameterPanel shows params
2. For WORKFLOW nodes: Show exposed parameters with widgets
3. For CONDITION nodes: Show expression editor
4. For FANOUT/MERGE: Show mode selector
5. Editable fields update the node config

### Widget Types (from `docs/architecture/data-models.md`)
- INT: QSpinBox
- FLOAT: QDoubleSpinBox
- STRING: QLineEdit
- BOOL: QCheckBox
- CHOICE: QComboBox
- MULTILINE_STRING: QTextEdit
- IMAGE_PATH/VIDEO_PATH: QLineEdit + Browse button

### Files to Modify
- `orchestrator/ui/main_window.py` - Connect canvas.node_selected → parameter_panel
- `orchestrator/ui/panels/parameter_panel.py` - Load workflow and display params
- `orchestrator/ui/widgets/parameter_widgets.py` - Already implemented

---

## Execution Order

1. **Phase A** - Node beautification (foundational for everything)
2. **Phase B** - Interactive connections (requires Phase A)
3. **Phase H** - Parameter panel (can parallel with B)
4. **Phase G** - AsyncBridge wiring (can parallel)
5. **Phase C** - Config sync (independent)
6. **Phase D** - Heartbeat (requires G)
7. **Phase F** - Window persistence (independent)
8. **Phase E** - SQLite testing (can run anytime)

---

## Subagent Instructions Template

When delegating tasks to subagents, always include:

```
## Context Files (MUST READ FIRST)
1. docs/CODEMAP.md - Living codebase documentation
2. Comfyui_Orchestrator.md - Original requirements
3. docs/architecture/ui-layout.md - UI specifications
4. docs/architecture/data-models.md - Data model definitions

## Reference Code
- references/pyqt-node-editor/ - Node canvas patterns

## Task: [TASK NAME]

### Objective
[Clear description]

### Files to Read First
[List specific files]

### Files to Modify
[List files with paths]

### Implementation Requirements
[Detailed requirements from docs]

### Validation
[How to verify success]

### Update CODEMAP
After changes, update docs/CODEMAP.md with new/modified file status
```

---

## Progress Tracking

| Phase | Status | Notes |
|-------|--------|-------|
| A - Node Graphics | ✅ Complete | Beautiful nodes with ports, colors, content widgets |
| B - Connections | ✅ Complete | Click-drag connection drawing with validation |
| C - Config Sync | ✅ Complete | Bidirectional sync with file watching via watchdog |
| D - Heartbeat | ✅ Complete | Periodic health checks via AsyncBridge |
| E - SQLite Test | ✅ Complete | All 28 repository tests passing |
| F - Window State | ✅ Complete | QSettings-based geometry/splitter persistence |
| G - AsyncBridge | ✅ Complete | Wired to MainWindow, health polling enabled |
| H - Parameters | ✅ Complete | Canvas→ParameterPanel wiring, node selection handlers |

---

## Last Updated
2026-01-26 - ALL PHASES COMPLETE
- 312+ tests passing (6 skipped for optional deps)
- App launches with full functionality
