# Director's Console - Complete Code Map

> **Project**: Director's Console (Project Eliot)  
> **Last Updated**: February 6, 2026  
> **Purpose**: Comprehensive execution flow and module reference

---

## Table of Contents

1. [Entry Point & Launcher](#1-entry-point--launcher)
2. [Orchestrator Module](#2-orchestrator-module)
3. [CinemaPromptEngineering (CPE) Module](#3-cinemapromptengineering-cpe-module)
4. [StoryboardUI Module](#4-storyboardui-module)
5. [Unified Director's Console](#5-unified-directors-console)
6. [Data Flow Summary](#6-data-flow-summary)
7. [API Endpoints Reference](#7-api-endpoints-reference)

---

## 1. Entry Point & Launcher

### 1.1 Primary Entry Point: `start.py`

**Location**: `c:\Users\npittas\DirectorsConsole\start.py`

**Purpose**: Unified Python launcher that starts all three services.

**Execution Flow**:
```
start.py
├── Argument parsing (--no-orchestrator, --no-frontend, --no-browser, --setup, --force)
├── Environment verification (venv + deps)
├── Port cleanup (9820, 9800, 5173)
├──
│   SECTION 1: ORCHESTRATOR (unless --no-orchestrator)
│   └── Start: uvicorn orchestrator.api:app --host 0.0.0.0 --port 9820
│       └── Entry: Orchestrator/orchestrator/api/server.py
│
├── SECTION 2: CPE BACKEND
│   └── Start: uvicorn api.main:app --host 0.0.0.0 --port 9800
│       └── Entry: CinemaPromptEngineering/api/main.py
│
├── SECTION 3: CPE FRONTEND (unless --no-frontend)
│   └── Start: npm run dev -- --port 5173
│       └── Entry: CinemaPromptEngineering/frontend/ (Vite dev server)
│
└── Monitor loop + graceful shutdown on Ctrl+C
```

**Service Ports**:
| Service | Default Port | Entry Module |
|---------|-------------|--------------|
| Orchestrator API | 9820 | `Orchestrator/orchestrator/api/server.py` |
| CPE Backend | 9800 | `CinemaPromptEngineering/api/main.py` |
| CPE Frontend | 5173 | `CinemaPromptEngineering/frontend/` (Vite) |

---

### 1.2 Alternative Entry Points

#### PowerShell Launcher
```
start-all.ps1
└── Legacy PowerShell launcher (still supported)
```

#### Unified Desktop Application
```
directors_console_main.py
├── Add module paths (StoryboardUI/, Orchestrator/, CinemaPromptEngineering/)
├── Import UnifiedDirectorsConsole
├── Create QApplication
└── Launch UnifiedDirectorsConsole window
    └── Entry: directors_console/ui/unified_window.py
```

#### Individual Module Launch

**Orchestrator (Standalone UI)**:
```bash
cd Orchestrator
python -m uvicorn orchestrator.api:app --host 0.0.0.0 --port 9820 --reload
# OR for desktop UI:
python -m orchestrator.main  # -> orchestrator.app:run()
```

**CPE Backend Only**:
```bash
cd CinemaPromptEngineering
python -m uvicorn api.main:app --host 0.0.0.0 --port 9800 --reload
```

**StoryboardUI**:
```bash
cd StoryboardUI
python -m storyboard_app.main
```

---

## 2. Orchestrator Module

**Root**: `c:\Users\npittas\DirectorsConsole\Orchestrator\`

### 2.1 Orchestrator API Server (Headless Mode)

**Entry**: `orchestrator/api/server.py` (FastAPI application)

**Startup Flow**:
```
orchestrator/api/server.py
├── FastAPI app initialization
├── CORS middleware setup
├── Pydantic models (JobManifest, JobResponse, etc.)
├── 
│   ENDPOINT REGISTRATION:
│   ├── POST /api/job              -> submit_job()
│   ├── GET  /api/health           -> health_check()
│   ├── GET  /api/backends         -> list_backends()
│   ├── GET  /api/backends/{id}/status  -> get_backend_status()
│   ├── GET  /api/jobs             -> list_jobs()
│   ├── GET  /api/jobs/{id}        -> get_job_status()
│   ├── POST /api/jobs/{id}/cancel -> cancel_job()
│   ├── POST /api/save-image       -> save_image()
│   ├── POST /api/scan-versions    -> scan_versions()
│   └── WS   /ws/jobs/{id}         -> websocket_job_progress()
│
└── @app.on_event("startup"): startup_event()
    ├── Load config (config.yaml or config.example.yaml)
    ├── Create Scheduler
    ├── Register backends from config
    ├── Create WorkflowStorage
    └── Create JobManager (headless mode, ui_callback=None)
        ├── Import: orchestrator.core.engine.job_manager:JobManager
        ├── Import: orchestrator.core.engine.scheduler:Scheduler
        └── Import: orchestrator.backends.client:ComfyUIClient
```

**Job Execution Flow (API Mode)**:
```
submit_job(manifest: JobManifest)
├── Validate manifest
├── Convert manifest to Project (_manifest_to_project)
├── Generate job_id (UUID)
├── Store job state in _jobs dict
├── Create asyncio task: _execute_job_async(project, params, job_id)
└── Return JobResponse

_execute_job_async(project, params, job_id)
├── Update status to "processing"
├── Select backend from scheduler.available_backends()
├── Call _job_manager.run_job(project, params)
│   └── Entry: orchestrator/core/engine/job_manager.py:JobManager.run_job()
├── Extract output paths from job.outputs
├── Update status to "completed" or "failed"
└── Broadcast to WebSocket clients
```

### 2.2 Orchestrator Desktop Application

**Entry Chain**:
```
Orchestrator/orchestrator/main.py
└── from orchestrator.app import run
    └── orchestrator/app.py:run()
```

**Desktop App Flow** (`orchestrator/app.py:run()`):
```
run()
├── Load config (config.yaml)
├── setup_logging()
├── Create QApplication
├── Create asyncio event loop in background thread
├── Create BackendManager
│   └── Register backends from config
├── Create HealthMonitor
├── Create MetricsWebSocketManager (CrysTools/KayTools integration)
├── Create Scheduler
├── Create WorkflowStorage
├── Create JobManager
├── Create AsyncBridge
│   └── Connects Qt UI with async backend operations
├── Create MainWindow
│   └── Entry: orchestrator/ui/main_window.py:MainWindow
├── Show window
├── Start health polling
└── Run Qt event loop
```

### 2.3 Core Engine Components

#### JobManager
**File**: `orchestrator/core/engine/job_manager.py`

**Key Methods**:
```python
class JobManager:
    ├── __init__(scheduler, workflow_storage, client_factory, ui_callback)
    ├── run_job(project, params) -> Job
    │   ├── _create_job(project, params)
    │   └── _run_graph(job)
    ├── run_project_streams(project, params, callbacks) -> list[Job]
    ├── cancel_job()
    ├── cancel_node(node_id)
    ├── _execute_node(job, execution, node, canvas)
    │   ├── _load_workflow(node) -> WorkflowDefinition
    │   ├── _resolve_backend(node, workflow, job) -> BackendConfig
    │   └── _execute_workflow_node(job, execution, node, workflow, backend)
    │       ├── _client_factory(backend) -> ComfyUIClient
    │       ├── _prepare_media_inputs(client, workflow, values)
    │       ├── patch_parameters(workflow.api_json, exposed_params, values)
    │       ├── client.queue_prompt(api_json) -> prompt_id
    │       ├── client.monitor_progress(prompt_id) -> async for updates
    │       └── client.get_outputs(prompt_id)
    └── _execute_node_logic(node, input_data) -> dict
```

#### Scheduler
**File**: `orchestrator/core/engine/scheduler.py`

```python
class Scheduler:
    ├── register(backend: BackendConfig)
    ├── update_status(backend_id, status)
    ├── available_backends(required_capabilities) -> list[BackendConfig]
    ├── select_backend(node, workflow) -> BackendConfig
    ├── get_backend(backend_id) -> BackendConfig | None
    └── _select_best_backend(candidates) -> BackendConfig
```

#### GraphExecutor
**File**: `orchestrator/core/engine/graph_executor.py`

```python
class GraphExecutor:
    ├── reset(canvas_layout)
    ├── get_executable_nodes() -> list[str]
    ├── get_ready_node() -> str | None
    ├── on_node_complete(node_id)
    └── get_execution_streams() -> list[set[str]]
```

### 2.4 Backend Management

**File**: `orchestrator/backends/manager.py`

```python
class BackendManager:
    ├── register(backend_config)
    ├── unregister(backend_id)
    ├── get_backend(backend_id) -> BackendConfig
    ├── get_all_backends() -> list[BackendConfig]
    └── update_status(backend_id, status)
```

**File**: `orchestrator/backends/client.py`

```python
class ComfyUIClient:
    ├── __init__(host, port)
    ├── upload_image(image_path) -> filename
    ├── queue_prompt(workflow_json) -> prompt_id
    ├── get_history(prompt_id) -> dict
    ├── monitor_progress(prompt_id) -> AsyncGenerator[ProgressUpdate]
    ├── interrupt()
    └── close()
```

**File**: `orchestrator/backends/health_monitor.py`

```python
class HealthMonitor:
    ├── start_polling(interval_seconds)
    ├── stop_polling()
    ├── check_backend(backend_id) -> BackendStatus
    └── _poll_all_backends()
```

### 2.5 UI Components

**Main Window**: `orchestrator/ui/main_window.py`

```
MainWindow(QMainWindow)
├── __init__(config, config_path)
│   ├── _setup_window()
│   ├── _create_panels()
│   │   ├── WorkflowBrowser (left)
│   │   ├── CanvasWidget (center)
│   │   ├── ParameterPanel (right)
│   │   ├── MonitorPanel (bottom tab)
│   │   ├── JobPanel (bottom tab)
│   │   └── LogPanel (bottom tab)
│   ├── _create_menus()
│   ├── _create_status_bar()
│   ├── _create_toolbar()
│   ├── _setup_layout()
│   ├── _connect_signals()
│   ├── _setup_config_watcher()
│   ├── _load_backends_from_config()
│   └── _load_workflows_from_storage()
├── Menu Actions (File, Edit, View, Project, Backends, Run, Help)
└── Event Handlers (_on_run_graph, _on_add_backend, etc.)
```

### 2.6 Data Models

**Job Model**: `orchestrator/core/models/job.py`
```python
class Job:
    id: str
    project_id: str | None
    status: JobStatus (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)
    canvas_snapshot: CanvasLayout
    parameter_values: dict
    node_executions: list[NodeExecution]
    outputs: dict[str, Any]
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
```

**Project Model**: `orchestrator/core/models/project.py`
```python
class Project:
    id: str
    name: str
    description: str
    canvas_layout: CanvasLayout
    created_at: datetime
    updated_at: datetime

class CanvasLayout:
    nodes: list[CanvasNode]
    connections: list[CanvasConnection]

class CanvasNode:
    id: str
    node_type: NodeType (WORKFLOW, INPUT, OUTPUT, CONDITION, FANOUT, MERGE)
    position: tuple[float, float]
    workflow_id: str | None
    parameter_values: dict
    backend_affinity: str | None
```

**Workflow Model**: `orchestrator/core/models/workflow.py`
```python
class WorkflowDefinition:
    id: str
    name: str
    description: str
    api_json: dict  # ComfyUI API format
    ui_json: dict | None  # ComfyUI UI format
    exposed_parameters: list[ExposedParameter]
    media_inputs: list[MediaInputDefinition]
    bypassed_nodes: list[str]
    required_capabilities: list[str]
```

---

## 3. CinemaPromptEngineering (CPE) Module

**Root**: `c:\Users\npittas\DirectorsConsole\CinemaPromptEngineering\`

### 3.1 CPE Backend API

**Entry**: `api/main.py` (FastAPI application)

**Startup Flow**:
```
api/main.py
├── FastAPI app initialization
├── Include templates router (api/templates.py)
├── CORS middleware setup
├── Initialize RuleEngine
│   └── Entry: cinema_rules/rules/engine.py:RuleEngine
├──
│   ENDPOINT REGISTRATION:
│   ├── GET  /                         -> root() [health check]
│   ├── GET  /api/health               -> health_check()
│   ├── GET  /enums/{enum_name}        -> get_enum_values()
│   ├── GET  /enums                    -> list_enums()
│   ├── POST /validate                 -> validate_config()
│   ├── POST /generate-prompt          -> generate_prompt()
│   ├── POST /options                  -> get_options()
│   ├──
│   ├── CAMERA & LENS ENDPOINTS:
│   ├── GET  /cameras/by-type/{type}           -> get_cameras_by_type()
│   ├── GET  /film-stocks/by-camera/{body}     -> get_film_stocks_for_camera()
│   ├── GET  /aspect-ratios/by-camera/{body}   -> get_aspect_ratios_for_camera()
│   ├── GET  /lenses/by-camera/{body}          -> get_lenses_for_camera()
│   ├── GET  /preset/technical/{preset_id}     -> get_preset_technical_specs()
│   ├──
│   ├── PRESETS ENDPOINTS:
│   ├── GET  /presets/live-action              -> get_live_action_presets()
│   ├── GET  /presets/live-action/{id}         -> get_live_action_preset()
│   ├── GET  /presets/live-action/{id}/cinematography-style
│   ├── GET  /presets/live-action/by-era/{era}
│   ├── GET  /presets/live-action/by-mood/{mood}
│   ├── GET  /presets/animation                -> get_animation_presets()
│   ├── GET  /presets/animation/{id}           -> get_animation_preset()
│   ├── GET  /presets/animation/by-domain/{domain}
│   ├── GET  /presets/animation/by-medium/{medium}
│   ├── GET  /presets/eras
│   ├── GET  /presets/domains
│   ├──
│   ├── APPLY PRESETS:
│   ├── POST /apply-preset/live-action         -> apply_live_action_preset()
│   └── POST /apply-preset/animation           -> apply_animation_preset()
│
└── AI PROVIDER SETTINGS (imported from api.providers)
    ├── GET  /settings/providers               -> list_providers()
    └── GET  /settings/providers/{id}          -> get_provider()
```

### 3.2 Templates Router (StoryboardUI Parity)

**File**: `api/templates.py`

```
api/templates.py
├── Initialize TemplateLoader
│   └── Entry: templates_system/core/template_loader.py
├── Initialize AngleLibrary
│   └── Entry: templates_system/core/angle_library.py
├── Initialize PromptBuilder
│   └── Entry: templates_system/core/prompt_builder.py
│
└── ROUTER: /api/templates
    ├── GET  /list              -> list_templates(category, engine)
    ├── GET  /categories        -> list_categories()
    ├── GET  /detail/{name}     -> get_template_detail()
    ├── GET  /angles            -> get_camera_angles(shot_size, height, direction)
    ├── POST /build_workflow    -> build_workflow()
    ├── POST /import_workflow   -> import_workflow()
    └── GET  /refresh           -> refresh_templates()
```

### 3.3 Cinema Rules Engine

**Rule Engine**: `cinema_rules/rules/engine.py`

```
cinema_rules/rules/engine.py

class RuleEngine:
    ├── __init__()
    │   └── _register_all_rules()
    │       ├── _register_live_action_rules()
    │       │   ├── Film camera rules (film_stock with digital cameras)
    │       │   ├── Panavision lens rules (closed ecosystem)
    │       │   ├── Large format lens coverage rules
    │       │   ├── Aspect ratio rules (IMAX, Ultra Panavision)
    │       │   ├── Movement equipment rules (dolly vs handheld weight classes)
    │       │   └── Time of day + lighting source rules
    │       └── _register_animation_rules()
    │
    ├── validate_live_action(config: LiveActionConfig) -> ValidationResult
    │   └── Evaluates all live-action rules against config
    ├── validate_animation(config: AnimationConfig) -> ValidationResult
    │   └── Evaluates all animation rules against config
    ├── get_available_options(field_path, current_config) -> tuple[list, list, dict]
    │   └── Returns valid options, disabled options, and reasons
    ├── apply_live_action_preset(preset_id, overrides) -> tuple[LiveActionConfig, ValidationResult]
    └── apply_animation_preset(preset_id, overrides) -> tuple[AnimationConfig, ValidationResult]
```

### 3.4 Schema Definitions

**Common Schemas**: `cinema_rules/schemas/common.py`
```python
# Enums
ShotSize: EWS, WS, MWS, MS, MCU, CU, BCU, ECU, OTS, POV...
Composition: RULE_OF_THIRDS, CENTERED, SYMMETRICAL, ASYMMETRICAL...
Mood: CHEERFUL, HOPEFUL, WHIMSICAL, TENSE, SUSPENSEFUL...
ColorTone: WARM_SATURATED, COOL_DESATURATED, MONOCHROME...
ProjectType: LIVE_ACTION, ANIMATION

# Models
ValidationResult: status, messages, auto_corrections_applied
ValidationMessage: rule_id, severity, message, field_path
VisualGrammar: shot_size, composition, mood, color_tone
```

**Live-Action Schemas**: `cinema_rules/schemas/live_action.py`
```python
# Camera Enums
CameraType: DIGITAL, FILM
CameraManufacturer: ARRI, RED, Sony, Canon, Panavision...
CameraBody: ALEXA_35, ALEXA_MINI_LF, VENICE_2, PANAVISION_MILLENNIUM_XL2...
SensorSize: S35, FF, LF, VV, _65MM, IMAX_70MM
WeightClass: LIGHT, MEDIUM, HEAVY

# Lens Enums
LensManufacturer: ARRI, ZEISS, COOKE, LEICA, PANAVISION...
LensFamily: ARRI_SIGNATURE_PRIME, ZEISS_SUPREME_PRIME...
LensMountType: PL, LPL, PV, EF, E_MOUNT, RF...

# Film & Format
FilmStock: KODAK_VISION3_500T, KODAK_VISION3_250D...
AspectRatio: RATIO_1_85, RATIO_2_39, RATIO_1_43...

# Movement
MovementEquipment: DOLLY, TRACK_DOLLY, STEADICAM, HANDHELD...
MovementType: STATIC, PAN, TILT, TRACK, CRANE...
MovementTiming: SLOW, NORMAL, FAST, RAMP...

# Lighting
TimeOfDay: DAWN, GOLDEN_HOUR, DAY, BLUE_HOUR, NIGHT
LightingSource: SUN, HMI, TUNGSTEN, LED, CANDLE...
LightingStyle: REMBRANDT, BUTTERFLY, SPLIT, HIGH_KEY...

# Main Config
LiveActionConfig:
    project_type: ProjectType.LIVE_ACTION
    visual_grammar: VisualGrammar
    camera: CameraConfig
    lens: LensConfig
    film_format: FilmFormatConfig
    movement: MovementConfig
    lighting: LightingConfig
```

**Animation Schemas**: `cinema_rules/schemas/animation.py`
```python
# Medium & Style
AnimationMedium: TWOD, THREED, HYBRID, STOP_MOTION
StyleDomain: ANIME, MANGA, THREED_ANIMATION, ILLUSTRATION

# Visual Treatment
LineTreatment: CLEAN, SKETCHY, ROUGH, HATCHED...
ColorApplication: FLAT, CEL_SHADED, SOFT_SHADED, PAINTERLY...
LightingModel: FLAT, BASIC, CINEMATIC, PHYSICALLY_ACCURATE...
SurfaceDetail: MINIMAL, STYLIZED, DETAILED, HYPER_DETAILED...
MotionStyle: SNAPPY, SMOOTH, ONES, TWOS, THREES...

# Domain Presets
AnimePreset, MangaPreset, ThreeDPreset, IllustrationPreset

# Main Config
AnimationConfig:
    project_type: ProjectType.ANIMATION
    visual_grammar: VisualGrammar
    medium: AnimationMediumConfig
    style: StyleConfig
    motion: MotionConfig
```

### 3.5 Presets

**Live-Action Presets**: `cinema_rules/presets/live_action.py`
```python
LIVE_ACTION_PRESETS: dict[str, FilmPreset] = {
    "blade_runner_2049": FilmPreset(...),  # Deakins, ALEXA XT, custom lenses
    "mad_max_fury_road": FilmPreset(...),  # Seale, ALEXA Plus, Ultra Primes
    "dune_2021": FilmPreset(...),          # Fraser, ALEXA LF, Signature Primes
    "interstellar": FilmPreset(...),       # van Hoytema, IMAX 70mm
    # ... 35+ presets
}
```

**Animation Presets**: `cinema_rules/presets/animation.py`
```python
ANIMATION_PRESETS: dict[str, AnimationPreset] = {
    # Anime
    "ghibli_classic": AnimationPreset(...),
    "makoto_shinkai": AnimationPreset(...),
    # Manga
    "junji_ito": AnimationPreset(...),
    "katsuhiro_otomo": AnimationPreset(...),
    # 3D
    "pixar_style": AnimationPreset(...),
    "spider_verse": AnimationPreset(...),
    # ... more presets
}
```

### 3.6 Templates System

**Template Loader**: `templates_system/core/template_loader.py`
```python
class TemplateLoader:
    ├── __init__(templates_dir, user_templates_dir)
    ├── load_all() -> list[Template]
    ├── load_by_name(name) -> Template | None
    ├── _load_from_file(path) -> Template
    └── _cache: dict[str, Template]
```

**Workflow Builder**: `templates_system/core/workflow_builder.py`
```python
class WorkflowBuilder:
    ├── __init__(template: Template)
    └── build(parameter_values, lora_settings, prompt_values, image_paths, filename_prefix) -> dict
        ├── Apply parameter values to workflow nodes
        ├── Apply LoRA configurations
        ├── Inject prompts (positive/negative)
        ├── Inject camera angle tokens
        ├── Set image input paths
        └── Set filename prefix for SaveImage nodes
```

**Angle Library**: `templates_system/core/angle_library.py`
```python
class AngleLibrary:
    ├── get_all_angles() -> list[CameraAngle]  # 144 angles
    ├── get_by_shot_size(size) -> list[CameraAngle]
    ├── get_by_height(height) -> list[CameraAngle]
    └── get_by_direction(direction) -> list[CameraAngle]

# 144 Angles = 3 shot sizes × 4 heights × 12 directions
Shot Sizes: close_up, medium_shot, wide_shot
Heights: low_angle, eye_level, elevated, high_angle
Directions: front, front_right_quarter, right_side, back_right_quarter, back, etc.
```

---

## 4. StoryboardUI Module

**Root**: `z:\Python\DirectorsConsole\StoryboardUI\`

### 4.1 Entry Point

**File**: `storyboard_app/main.py`

```
storyboard_app/main.py
├── parse_args()  # --debug, --theme, --server-url, --dev
├── run_application()
│   ├── Load config (storyboard_app/config.py)
│   ├── Setup QApplication
│   ├── Create MainWindow
│   │   └── Entry: storyboard_app/ui/main_window.py:MainWindow
│   └── app.exec()
└── main()
```

### 4.2 Main Window

**File**: `storyboard_app/ui/main_window.py`

```
MainWindow(QMainWindow)
├── __init__(config)
│   ├── Create core components
│   │   ├── TemplateLoader
│   │   ├── ComfyUIClient
│   │   └── GenerationWorker (QThread subclass)
│   ├── _setup_ui()
│   │   ├── Left sidebar with tabs
│   │   │   ├── Image Generation tab
│   │   │   │   ├── Text-to-Image sub-tab
│   │   │   │   └── Image-to-Image sub-tab
│   │   │   ├── Image Editing tab
│   │   │   └── Upscaling tab
│   │   └── Right: StoryboardGrid
│   ├── _setup_menus()
│   ├── _setup_toolbar()
│   ├── _connect_signals()
│   └── _check_comfyui_connection()
│
├── GenerationWorkflow:
│   └── _on_generate_clicked()
│       ├── Get current template
│       ├── Collect parameter values
│       ├── Collect LoRA settings
│       ├── Collect prompt values
│       ├── Get camera angle (if selected)
│       ├── Create GenerationWorker
│       ├── Connect worker signals
│       └── worker.start()
│
└── GenerationWorker.run()
    ├── Upload images to ComfyUI
    ├── Build workflow (WorkflowBuilder.build)
    ├── Submit to ComfyUI (ComfyUIClient.submit_workflow)
    ├── Poll for completion
    ├── Download output images
    └── Emit result signal
```

### 4.3 Core Components

**ComfyUI Client**: `storyboard_app/core/comfyui_client.py`
```python
class ComfyUIClient:
    ├── __init__(config)
    ├── connect() -> bool
    ├── disconnect()
    ├── upload_image(image_path) -> str
    ├── submit_workflow(workflow_json) -> str
    ├── get_history(prompt_id) -> dict
    ├── get_queue() -> dict
    ├── interrupt()
    └── static set_log_callback(callback)
```

**Workflow Builder**: `storyboard_app/core/workflow_builder.py`
```python
class WorkflowBuilder:
    ├── __init__(template)
    └── build(parameter_values, lora_settings, prompt_values, image_paths, filename_prefix, seed) -> dict
```

**Template Loader**: `storyboard_app/core/template_loader.py`
```python
class TemplateLoader:
    ├── __init__(templates_dir, user_templates_dir)
    ├── load_all() -> list[Template]
    ├── load_by_name(name) -> Template
    ├── import_from_comfyui(workflow_json, name) -> Template
    └── refresh()
```

---

## 5. Unified Director's Console

**Root**: `z:\Python\DirectorsConsole\directors_console\`

### 5.1 Entry Point

**File**: `directors_console_main.py`

```
directors_console_main.py
├── Add module paths to sys.path
├── Import UnifiedDirectorsConsole
├── Create QApplication
├── Create and show UnifiedDirectorsConsole
└── app.exec()
```

### 5.2 Unified Window

**File**: `directors_console/ui/unified_window.py`

```
UnifiedDirectorsConsole(QMainWindow)
├── __init__()
│   ├── _setup_logging()
│   ├── Initialize configs (StoryboardConfig, OrchestratorConfig)
│   ├── _setup_ui()
│   │   ├── Tab 1: PromptStudioWidget (CPE)
│   │   ├── Tab 2: StoryboardWidget (embedded StoryboardMainWindow)
│   │   ├── Tab 3: OrchestratorWidget (embedded OrchestratorMainWindow)
│   │   └── Tab 4: VideoPipelineWidget
│   ├── _setup_menu_bar()
│   ├── _setup_status_bar()
│   ├── _setup_dock_widgets()
│   │   └── MetricsMonitorDock (right side)
│   ├── _connect_signals()
│   │   ├── prompt_studio.prompt_sent -> _on_prompt_sent_to_storyboard
│   │   ├── image_generated -> video_pipeline.set_source_image
│   │   └── tab_widget.currentChanged -> _on_tab_changed
│   └── _start_background_tasks()
│
├── _create_storyboard_widget()
│   ├── Create wrapper QWidget
│   ├── Create StoryboardMainWindow
│   ├── Call integrate_storyboard_with_console()
│   └── Extract central widget and add to wrapper
│
├── _create_orchestrator_widget()
│   ├── Create wrapper QWidget
│   ├── Create OrchestratorMainWindow
│   └── Extract central widget and add to wrapper
│
└── Workflow Actions:
    ├── _on_prompt_to_image_workflow() -> Tab 0
    ├── _on_image_to_render_workflow() -> Tab 2
    ├── _on_image_to_video_workflow() -> Tab 3
    └── _on_full_pipeline_workflow()
```

---

## 6. Data Flow Summary

### 6.1 Complete Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DIRECTOR'S CONSOLE PIPELINE                          │
└─────────────────────────────────────────────────────────────────────────────┘

PHASE 1: PROMPT CREATION (CPE)
┌────────────────────────────────────────────────────────┐
│  User selects film preset (e.g., "Blade Runner 2049")  │
│  OR configures manually:                               │
│    - Camera: ARRI ALEXA XT                             │
│    - Lens: ARRI Signature Primes                       │
│    - Film Stock: N/A (digital)                         │
│    - Lighting: Volumetric, Neon                        │
│    - Mood: Ominous, Atmospheric                        │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│  CPE Backend (api/main.py)                             │
│  ├── RuleEngine.validate_live_action(config)           │
│  └── PromptGenerator.generate_live_action_prompt()     │
│       Returns: "cinematic film still, 35mm..."         │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼
PHASE 2: IMAGE GENERATION (StoryboardUI)
┌────────────────────────────────────────────────────────┐
│  Prompt sent to StoryboardUI                           │
│  User selects:                                         │
│    - Template: flux_dev.json                           │
│    - Camera Angle: medium_shot_eye_level_front         │
│    - Parameters: steps=30, cfg=7, seed=-1              │
│    - LoRAs: add_detail.safetensors @ 0.8               │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│  WorkflowBuilder.build()                               │
│  ├── Inject prompt into KSampler positive              │
│  ├── Inject camera angle token                         │
│  ├── Apply LoRA weights                                │
│  └── Return ComfyUI API JSON                           │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│  ComfyUIClient.submit_workflow(workflow_json)          │
│  → POST to http://localhost:8188/prompt                │
│  ← Returns: prompt_id                                  │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼
PHASE 3: RENDER ORCHESTRATION (Orchestrator)
┌────────────────────────────────────────────────────────┐
│  For distributed rendering:                            │
│  ├── POST /api/job to Orchestrator API                 │
│  │   Manifest: {workflow_id, parameters, metadata}     │
│  │                                                     │
│  ├── JobManager receives job                           │
│  ├── Scheduler.select_backend()                        │
│  │   Considers: GPU availability, queue depth, tags    │
│  ├── Execute on selected ComfyUI node                  │
│  └── WebSocket /ws/jobs/{id} for progress              │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼
PHASE 4: OUTPUT & STORAGE
┌────────────────────────────────────────────────────────┐
│  Generated images saved to:                            │
│  - ComfyUI output folder                               │
│  - StoryboardUI project folder                         │
│  - Orchestrator job outputs (if distributed)           │
└────────────────────────────────────────────────────────┘
```

### 6.2 Module Interactions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MODULE INTERACTIONS                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐      REST API       ┌──────────────┐      HTTP/WS      ┌─────────────┐
│   CPE        │◄───────────────────►│  Storyboard  │◄─────────────────►│   ComfyUI   │
│  Backend     │   /generate-prompt  │     UI       │   /prompt, /view  │   Server    │
└──────────────┘                     └──────┬───────┘                   └─────────────┘
       │                                    │
       │ REST API                           │ REST API / WS
       ▼                                    ▼
┌──────────────┐                     ┌──────────────┐
│   CPE        │                     │ Orchestrator │
│  Frontend    │                     │     API      │
└──────────────┘                     └──────┬───────┘
                                            │
                                            │ Manages
                                            ▼
                                     ┌──────────────┐
                                     │   Backend    │
                                     │   Nodes      │
                                     └──────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        UNIFIED CONSOLE INTEGRATION                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    UnifiedDirectorsConsole                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │   Tab 0     │  │   Tab 1     │  │   Tab 2     │  │  Tab 3  │ │
│  │Prompt Studio│  │ Storyboard  │  │Orchestrator │  │  Video  │ │
│  │   (CPE)     │  │    (UI)     │  │    (UI)     │  │ Pipeline│ │
│  └──────┬──────┘  └─────────────┘  └─────────────┘  └─────────┘ │
│         │                                                        │
│         │ prompt_sent.connect(_on_prompt_sent_to_storyboard)     │
│         └───────────────────────────────────────────────────────►│
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. API Endpoints Reference

### 7.1 Orchestrator API (Port 9820)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/job` | Submit workflow job |
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/{id}` | Get job status |
| POST | `/api/jobs/{id}/cancel` | Cancel job |
| GET | `/api/backends` | List backends |
| GET | `/api/backends/{id}` | Backend details |
| GET | `/api/backends/{id}/status` | Backend status |
| POST | `/api/job-groups` | Create/manage job groups |
| GET | `/api/job-groups` | List job groups |
| GET | `/api/job-groups/{id}` | Get job group status |
| WS | `/ws/job-groups/{id}` | Job group progress |
| POST | `/api/scan-project-images` | Scan project for images |
| GET | `/api/serve-image` | Serve project image |
| DELETE | `/api/delete-image` | Delete project image |
| POST | `/api/create-folder` | Create project folder |
| GET | `/api/scan-versions` | Scan existing versions |
| GET | `/api/project` | Get current project |
| POST | `/api/project` | Save current project |
| POST | `/api/save-project` | Save project metadata |
| POST | `/api/load-project` | Load project metadata |
| GET | `/api/browse-folders` | Browse project folders |
| GET | `/api/png-metadata` | Get PNG metadata |

### 7.2 CPE Backend API (Port 9800)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/enums` | List all enums |
| GET | `/enums/{name}` | Get enum values |
| POST | `/validate` | Validate config |
| POST | `/generate-prompt` | Generate AI prompt |
| POST | `/options` | Get available options |
| GET | `/presets/live-action` | List film presets |
| GET | `/presets/animation` | List animation presets |
| POST | `/apply-preset/live-action` | Apply film preset |
| POST | `/apply-preset/animation` | Apply animation preset |
| GET | `/settings/providers` | List AI providers |
| POST | `/api/read-image` | Read image as base64 data URL |
| DELETE | `/api/delete-file` | Delete file via backend proxy |

### 7.3 Templates API (Port 9800, prefix `/api/templates`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/list` | List templates |
| GET | `/categories` | List categories |
| GET | `/detail/{name}` | Template details |
| GET | `/angles` | Camera angles (144) |
| POST | `/build_workflow` | Build workflow |
| POST | `/import_workflow` | Import ComfyUI workflow |
| GET | `/refresh` | Refresh cache |

---

## File Index by Module

### Orchestrator
```
Orchestrator/
├── orchestrator/
│   ├── api/
│   │   └── server.py             # FastAPI server (headless)
│   ├── api.py                    # Legacy/unused (see api/server.py)
│   ├── app.py                    # Desktop app entry
│   ├── main.py                   # CLI entry
│   ├── api/
│   │   └── server.py             # Alternative server impl
│   ├── core/
│   │   ├── engine/
│   │   │   ├── job_manager.py    # Job execution engine
│   │   │   ├── scheduler.py      # Backend scheduling
│   │   │   ├── graph_executor.py # Canvas graph execution
│   │   │   └── parameter_patcher.py
│   │   ├── models/
│   │   │   ├── job.py            # Job data models
│   │   │   ├── backend.py        # Backend models
│   │   │   ├── workflow.py       # Workflow models
│   │   │   └── project.py        # Project models
│   │   ├── storage/
│   │   │   └── workflow_storage.py
│   │   └── workflow/
│   │       ├── parser.py
│   │       ├── converter.py
│   │       └── inspector.py
│   ├── backends/
│   │   ├── client.py             # ComfyUI HTTP client
│   │   ├── manager.py            # Backend registry
│   │   ├── health_monitor.py
│   │   └── metrics_ws.py         # WebSocket metrics
│   └── ui/
│       ├── main_window.py        # Main Qt window
│       ├── async_bridge.py
│       ├── panels/
│       │   ├── workflow_browser.py
│       │   ├── parameter_panel.py
│       │   ├── monitor_panel.py
│       │   └── job_panel.py
│       └── canvas/
│           ├── canvas_widget.py
│           └── workflow_node.py
```

### CinemaPromptEngineering
```
CinemaPromptEngineering/
├── api/
│   ├── main.py                   # FastAPI backend
│   ├── templates.py              # Templates router
│   └── providers/                # LLM integrations
│       ├── credential_storage.py
│       ├── llm_service.py
│       └── registry.py
├── cinema_rules/
│   ├── schemas/
│   │   ├── common.py             # Shared enums/models
│   │   ├── live_action.py        # Live-action config
│   │   └── animation.py          # Animation config
│   ├── rules/
│   │   └── engine.py             # Validation engine
│   ├── presets/
│   │   ├── live_action.py        # Film presets (35+)
│   │   ├── animation.py          # Animation presets
│   │   └── cinematography_styles.py
│   └── prompts/
│       └── generator.py          # Prompt generator
├── templates_system/
│   ├── core/
│   │   ├── template_loader.py
│   │   ├── workflow_builder.py
│   │   ├── angle_library.py      # 144 angles
│   │   └── comfyui_client.py
│   └── models/
│       └── template.py
└── frontend/                     # React/Vite frontend
    └── src/
        └── storyboard/
            ├── components/       # NEW: Canvas overhaul components
            │   ├── PanelHeader.tsx       # Panel name, rating, drag handle
            │   ├── PanelNotes.tsx        # Markdown notes with edit/view
            │   ├── StarRating.tsx        # 5-star rating component
            │   ├── PrintDialog.tsx       # Print storyboard dialog
            │   ├── DraggablePanel.tsx    # Drag-drop wrapper (unused)
            │   └── ProjectSettingsModal.tsx  # Updated with panel naming
            └── services/
                └── project-manager.ts    # Per-panel folder support
```

### StoryboardUI
```
StoryboardUI/
└── storyboard_app/
    ├── main.py                   # Entry point
    ├── config.py                 # Configuration
    ├── core/
    │   ├── comfyui_client.py     # ComfyUI API client
    │   ├── workflow_builder.py
    │   ├── template_loader.py
    │   └── angle_library.py
    ├── models/
    │   ├── template.py
    │   ├── parameter.py
    │   └── lora.py
    └── ui/
        ├── main_window.py
        ├── panels/
        │   ├── storyboard_grid.py
        │   ├── template_selector.py
        │   ├── parameters_panel.py
        │   └── angle_selector.py
        └── dialogs/
            └── workflow_editor_dialog.py
```

### Director's Console (Unified)
```
directors_console/
├── ui/
│   ├── unified_window.py         # Main unified window
│   ├── prompt_studio_widget.py
│   ├── video_pipeline_widget.py
│   └── metrics_monitor_widget.py
└── integration/
    └── storyboard_adapter.py     # Integration helpers
```

---

---

## 8. Canvas Architecture Overhaul (February 6, 2026)

### 8.1 Overview

Complete redesign of the canvas system to support free-form panel positioning, drag-to-move, multi-select, alignment tools, and per-panel folders.

### 8.2 Panel Interface Extension

**Extended Panel Interface** (`StoryboardUI.tsx`):
```typescript
interface Panel {
  id: number;                    // Unique panel ID
  name?: string;                 // User-editable panel name (e.g., "Panel_01", "Hero_Shot")
  rating?: number;              // 0-5 star rating
  locked?: boolean;             // True if panel has generated images
  zIndex?: number;              // For drag layering
  selected?: boolean;           // Multi-select state
  folderPath?: string;          // Resolved output folder path
  x: number;                    // Canvas X position
  y: number;                    // Canvas Y position
  width: number;                // Panel width (resizable)
  height: number;               // Panel height (resizable)
  image: string | null;         // Current displayed image
  images: string[];             // All panel images
  imageHistory: ImageHistoryEntry[];
  status: 'empty' | 'generating' | 'complete' | 'error';
  notes?: string;               // Markdown notes
  workflowId?: string;
  parameterValues: Record<string, any>;
}
```

### 8.3 New Components

#### PanelHeader.tsx
**Location**: `CinemaPromptEngineering/frontend/src/storyboard/components/PanelHeader.tsx`

**Features**:
- Editable panel name (double-click to edit)
- Lock indicator (when panel has generated images)
- 5-star rating system (StarRating component)
- Drag handle (GripVertical icon) for moving panels
- Remove button (X) with confirmation dialog

**Props**:
```typescript
interface PanelHeaderProps {
  panelId: number;
  name: string;
  locked: boolean;
  rating?: number;
  selected?: boolean;
  onNameChange: (newName: string) => void;
  onRatingChange?: (rating: number) => void;
  onRemove: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
}
```

#### PanelNotes.tsx
**Location**: `CinemaPromptEngineering/frontend/src/storyboard/components/PanelNotes.tsx`

**Features**:
- Markdown rendering with `react-markdown`
- Toggle between edit (textarea) and view modes
- 300ms debounced auto-save
- Located in panel footer

#### StarRating.tsx
**Location**: `CinemaPromptEngineering/frontend/src/storyboard/components/StarRating.tsx`

**Features**:
- 5 Lucide Star icons
- Click to rate (1-5), click same star to reset to 0
- Configurable size

#### PrintDialog.tsx
**Location**: `CinemaPromptEngineering/frontend/src/storyboard/components/PrintDialog.tsx`

**Features**:
- Layout options: 1-4 panels per row
- Content toggles: notes, metadata, ratings
- Page settings: A4/Letter, Portrait/Landscape
- Preview of panels to be printed
- Uses `window.print()` with `@media print` CSS

### 8.4 Drag and Move System

**Implementation**: Native mouse events (not dnd-kit)

**State Management**:
```typescript
const [draggingPanelId, setDraggingPanelId] = useState<number | null>(null);
const [dragStart, setDragStart] = useState({ x: 0, y: 0, panelX: 0, panelY: 0 });
```

**Handlers**:
- `handleDragStart(panelId, e)`: Initiates drag on panel header mousedown
- `handleDragMove(e)`: Updates panel position during drag (respects zoom level)
- `handleDragEnd()`: Finalizes drag, resets z-index

**Multi-Panel Movement**: When dragging a selected panel, all selected panels move together maintaining relative positions.

### 8.5 Multi-Select System

**Selection Methods**:
1. **Ctrl+Click**: Toggle individual panel selection
2. **Marquee Selection**: Drag on empty canvas to select multiple panels

**Marquee State**:
```typescript
const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
const [marqueeStart, setMarqueeStart] = useState({ x: 0, y: 0 });
const [marqueeEnd, setMarqueeEnd] = useState({ x: 0, y: 0 });
```

**Visual Feedback**: Blue semi-transparent rectangle during selection.

### 8.6 Alignment and Distribution

**Alignment Toolbar**: Appears when 2+ panels selected

**Functions**:
- `alignPanels('left' | 'right' | 'top' | 'bottom')`: Aligns all selected panels to edge of first selected
- `distributePanels('horizontal' | 'vertical')`: Evenly distributes panels between first and last

**UI**: Floating toolbar with 6 SVG icon buttons

### 8.7 Snap-to-Panel Guides

**Activation**: Hold Shift during drag

**Features**:
- Detects left, center, right edges (vertical guides)
- Detects top, center, bottom edges (horizontal guides)
- 10px snap threshold
- Red guide lines when snapping

**State**:
```typescript
const [snapGuides, setSnapGuides] = useState<Array<{
  type: 'vertical' | 'horizontal';
  position: number;
}>>([]);
```

### 8.8 Per-Panel Folder Structure

**Folder Resolution**:
```typescript
resolvePanelFolder(panelName: string): string {
  return `${projectPath}/${panelName}/`;
}
```

**Example**:
- Panel name: "Panel_01" or "Hero_Shot"
- Folder: `W:/Projects/Eliot/Panel_01/` or `W:/Projects/Eliot/Hero_Shot/`
- File: `Eliot_Panel_01_v001.png`

**Version Scanning**: Updated to scan by panel name (folder name) instead of numeric ID

### 8.9 Canvas Zoom and Pan

**Zoom Behavior**: Zoom from mouse pointer (not top-left corner)

**Implementation**:
- CSS `transform-origin: 0 0` on canvas container
- Mouse wheel handler calculates world position under cursor
- Adjusts pan to keep cursor position stable during zoom

**State**:
```typescript
const [canvasZoom, setCanvasZoom] = useState(1);
const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
```

### 8.10 Files Modified

**Frontend**:
- `StoryboardUI.tsx`: Drag handlers, multi-select, alignment, snap guides
- `project-manager.ts`: Per-panel folder resolution, version scanning by panel name
- `ProjectSettingsModal.tsx`: Updated naming template preview with full panel names

**Backend**:
- `Orchestrator/orchestrator/api/server.py`: Panel folder scanning (by name not ID), version extraction

---

## 9. Recent Changes & Architecture Findings

### 9.1 Project Settings Storage (January 30, 2026)

**Problem**: Frontend was sending pattern with `{project}` token but backend had no access to actual project name, causing it to use `*` wildcard for file searches.

**Solution**: Implemented backend project state storage.

#### New API Endpoints (Orchestrator Port 9820)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/project` | Store project settings in backend memory |
| GET | `/api/project` | Retrieve stored project settings |

#### Files Modified

**Backend** (`Orchestrator/orchestrator/api/server.py`):
- Added `_current_project` global variable for in-memory storage
- Added `set_current_project()` and `get_current_project()` functions
- Added `ProjectSettings`, `SetProjectRequest`, `SetProjectResponse` models
- Modified `scan_versions()` to use stored project name instead of `*`
- New endpoints: `POST /api/project`, `GET /api/project`

**Frontend** (`CinemaPromptEngineering/frontend/src/storyboard/services/project-manager.ts`):
- Added `syncProjectWithBackend()` private method
- Calls `POST /api/project` whenever `setProject()` is called
- Ensures backend always has current project name for file operations

#### Execution Flow

```
1. User changes Project Settings (name, path, template)
   ↓
2. Frontend calls setProject() 
   ↓
3. setProject() calls syncProjectWithBackend()
   ↓
4. POST /api/project with {name, path, naming_template, ...}
   ↓
5. Backend stores in _current_project global
   ↓
6. On generation complete:
   ↓
7. Frontend calls POST /api/scan-versions
   ↓
8. Backend gets project name from _current_project
   ↓
9. Replaces {project} with actual name (not *)
   ↓
10. Returns highest existing version per panel
```

---

### 9.2 Critical Architecture Discovery

**IMPORTANT**: The frontend StoryboardUI does NOT use the Orchestrator for ComfyUI workflow submission!

#### Actual Data Flow (Current)

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  StoryboardUI.tsx                                           │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               │ Workflow JSON                │ File Operations
               │                              │
               ▼                              ▼
┌──────────────────────────┐    ┌─────────────────────────────┐
│   ComfyUI (Remote)       │    │   Orchestrator (Port 9820)  │
│   localhost:8188     │    │                             │
│                          │    │   • POST /api/scan-versions │
│   • Execute workflow     │    │   • POST /api/save-image    │
│   • Return image URL     │    │   • POST /api/project       │
└──────────────────────────┘    └─────────────────────────────┘
```

**Key Finding**: Line 747 in `StoryboardUI.tsx`:
```typescript
const response = await fetch(`${targetUrl}/prompt`, {  // Direct to ComfyUI!
```

The `targetUrl` is `http://localhost:8188` (ComfyUI), NOT the orchestrator.

#### Expected Architecture (Not Implemented)

```
Frontend → Orchestrator → ComfyUI Nodes (render farm)
                ↓
         [Job Queue, Distribution,
          Load Balancing, File Mgmt]
```

#### Current Limitations

1. **Generation**: Bypasses orchestrator entirely (direct to ComfyUI)
2. **File Operations**: Only use orchestrator (version scanning, saving)
3. **Render Farm**: Not utilized for workflow distribution
4. **Queue Management**: Frontend handles queue, not orchestrator

#### Orchestrator's Actual Role

The orchestrator is currently ONLY used for:
- `POST /api/scan-versions` - Find existing file versions
- `POST /api/save-image` - Save images from ComfyUI URL to filesystem
- `POST /api/project` - Store project settings

**Not used for**:
- Workflow submission
- Job queuing
- Backend selection
- Load balancing

---

### 9.3 File Version Scanning Fix

**Original Problem**:
- Pattern: `Panel_{panel}\{project}_Panel{panel}_{version}`
- Code replaced `{project}` with `*` (wildcard)
- Result: `Panel_01\*_Panel01_v*.png`
- Problem: Matches ANY project name, not specific one

**Fix**:
- Backend now stores actual project name (e.g., "Demo")
- Replaces `{project}` with "Demo", not "*"
- Result: `Panel_01\Demo_Panel01_v*.png`
- Correctly finds versions only for this project

#### Algorithm

```python
# For each panel (01-99):
    # Replace tokens:
    filename = pattern
    filename = filename.replace("{panel}", panel_id)      # "01"
    filename = filename.replace("{project}", project_name) # "Demo" (not "*")
    filename = filename.replace("{version}", "v*")        # wildcard
    
    # Search with glob
    matches = glob(f"{folder}/{filename}.png")
    
    # Extract highest version number
    for match in matches:
        ver = re.search(r'v(\d{3})\.png$', match)
        highest = max(highest, int(ver.group(1)))
    
    panel_versions[panel_id] = str(highest).zfill(3)
```

---

### 9.4 Python Cache Issues (Debugging Notes)

**Issue**: Changes to `server.py` not reflected in running server.

**Root Cause**: Python's `__pycache__/*.pyc` files and running process memory.

**Solution**:
```powershell
# 1. Kill ALL Python processes
Get-Process python | Stop-Process -Force

# 2. Clear ALL cache files
Get-ChildItem -Path "Z:\Python\DirectorsConsole" -Recurse -Filter "*.pyc" | Remove-Item -Force
Get-ChildItem -Path "Z:\Python\DirectorsConsole" -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force

# 3. Restart server
.\start-all.ps1
```

**Key Insight**: Python loads code into memory at startup. Renaming source files after startup does NOT affect the running process.

---

### 8.5 Import Chain Discovery

The entry point `start-all.ps1` runs:
```powershell
uvicorn orchestrator.api:app --host 0.0.0.0 --port 9820 --reload
```

Import resolution:
```
orchestrator.api:app
  ↓
orchestrator/api/__init__.py
  ↓
from orchestrator.api.server import app
  ↓
orchestrator/api/server.py  ← ACTUAL CODE LOCATION
```

**NOT** `orchestrator/api.py` (different file, now renamed to `api.py.old`)

---

*End of Code Map - Director's Console Project Eliot*
*Last Updated: January 30, 2026 - Project Settings & Architecture Fixes*
