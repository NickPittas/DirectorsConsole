# Data Models

This document defines all Pydantic data models used in the ComfyUI Orchestrator.

## Overview

All models are defined in `orchestrator/core/models/` and use Pydantic v2 for:
- Type validation
- JSON serialization/deserialization
- Schema generation

## Backend Models (`backend.py`)

### BackendConfig

Configuration for a ComfyUI instance.

```python
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class BackendConfig(BaseModel):
    """Configuration for a ComfyUI backend instance."""
    
    id: str = Field(description="Unique identifier (UUID)")
    name: str = Field(description="Human-readable name, e.g., 'PC1 - RTX 4090'")
    host: str = Field(description="Hostname or IP address")
    port: int = Field(default=8188, description="ComfyUI port")
    enabled: bool = Field(default=True, description="Whether backend is enabled")
    capabilities: list[str] = Field(
        default_factory=list,
        description="List of capabilities, e.g., ['sd15', 'sdxl', 'flux']"
    )
    max_concurrent_jobs: int = Field(
        default=1,
        description="Max concurrent jobs (usually 1 for GPU)"
    )
    tags: list[str] = Field(
        default_factory=list,
        description="Tags for manual affinity grouping"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    @property
    def base_url(self) -> str:
        """HTTP base URL for this backend."""
        return f"http://{self.host}:{self.port}"
    
    @property
    def ws_url(self) -> str:
        """WebSocket URL for this backend."""
        return f"ws://{self.host}:{self.port}/ws"
```

### BackendStatus

Runtime status of a backend (not persisted, refreshed periodically).

```python
class BackendStatus(BaseModel):
    """Runtime status of a ComfyUI backend."""
    
    backend_id: str
    online: bool = Field(description="Whether backend is reachable")
    last_seen: datetime = Field(description="Last successful health check")
    current_job_id: Optional[str] = Field(
        default=None,
        description="ID of currently running job"
    )
    queue_depth: int = Field(default=0, description="Number of queued prompts")
    
    # GPU metrics (from metrics agent)
    gpu_name: str = Field(default="Unknown")
    gpu_memory_total: int = Field(default=0, description="Total VRAM in MB")
    gpu_memory_used: int = Field(default=0, description="Used VRAM in MB")
    gpu_utilization: float = Field(default=0.0, description="GPU utilization 0-100%")
    gpu_temperature: int = Field(default=0, description="GPU temperature in Celsius")
    
    # System metrics
    cpu_utilization: float = Field(default=0.0, description="CPU utilization 0-100%")
    ram_total: int = Field(default=0, description="Total RAM in MB")
    ram_used: int = Field(default=0, description="Used RAM in MB")
    
    @property
    def gpu_memory_free(self) -> int:
        """Free VRAM in MB."""
        return self.gpu_memory_total - self.gpu_memory_used
    
    @property
    def gpu_memory_percent(self) -> float:
        """VRAM usage as percentage."""
        if self.gpu_memory_total == 0:
            return 0.0
        return (self.gpu_memory_used / self.gpu_memory_total) * 100
```

---

## Workflow Models (`workflow.py`)

### ParamType

Enum for parameter types.

```python
from enum import Enum

class ParamType(str, Enum):
    """Types of exposable parameters."""
    INT = "int"
    FLOAT = "float"
    STRING = "string"
    BOOL = "bool"
    IMAGE_PATH = "image_path"
    VIDEO_PATH = "video_path"
    CHOICE = "choice"
    MULTILINE_STRING = "multiline_string"
```

### ParamConstraints

Constraints for parameter values.

```python
class ParamConstraints(BaseModel):
    """Constraints for a parameter value."""
    
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    step: Optional[float] = None
    choices: Optional[list[str]] = None
    file_extensions: Optional[list[str]] = None  # For file params
```

### ExposedParameter

A user-configurable parameter exposed from a workflow.

```python
class ExposedParameter(BaseModel):
    """A parameter exposed from a ComfyUI workflow."""
    
    id: str = Field(description="Unique identifier (UUID)")
    node_id: str = Field(description="ComfyUI node ID within workflow")
    node_title: str = Field(description="Human-readable node name")
    field_name: str = Field(description="Field name, e.g., 'seed', 'steps'")
    display_name: str = Field(description="User-facing label")
    param_type: ParamType
    default_value: Any = Field(description="Default value from workflow")
    constraints: Optional[ParamConstraints] = None
    order: int = Field(default=0, description="Display order in UI")
```

### WorkflowDefinition

A stored ComfyUI workflow with exposed parameters.

```python
class WorkflowDefinition(BaseModel):
    """A ComfyUI workflow stored in the orchestrator."""
    
    id: str = Field(description="Unique identifier (UUID)")
    name: str = Field(description="Workflow name")
    description: str = Field(default="")
    
    # Workflow data
    workflow_json: dict = Field(description="Raw ComfyUI workflow format")
    api_json: dict = Field(description="Converted API format for /prompt")
    
    # Parameters
    exposed_parameters: list[ExposedParameter] = Field(default_factory=list)
    
    # Requirements
    required_capabilities: list[str] = Field(
        default_factory=list,
        description="Capabilities needed to run this workflow"
    )
    required_custom_nodes: list[str] = Field(
        default_factory=list,
        description="Custom node packages required"
    )
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    thumbnail: Optional[str] = Field(
        default=None,
        description="Base64 encoded thumbnail image"
    )
```

---

## Project Models (`project.py`)

### NodeType

Types of nodes in the orchestration canvas.

```python
class NodeType(str, Enum):
    """Types of nodes in the orchestration graph."""
    WORKFLOW = "workflow"      # Runs a ComfyUI workflow
    CONDITION = "condition"    # Branching logic
    FANOUT = "fanout"          # Split to multiple paths
    MERGE = "merge"            # Wait for multiple inputs
    INPUT = "input"            # Graph entry point
    OUTPUT = "output"          # Graph exit point
```

### FallbackStrategy

How to handle unavailable preferred backend.

```python
class FallbackStrategy(str, Enum):
    """Strategy when preferred backend is unavailable."""
    NONE = "none"              # Fail if unavailable
    ASK_USER = "ask_user"      # Prompt user for alternative
    AUTO_SELECT = "auto"       # Automatically select available
```

### DataType

Types of data flowing between nodes.

```python
class DataType(str, Enum):
    """Types of data flowing through connections."""
    TRIGGER = "trigger"        # Execution signal only
    IMAGE = "image"            # Image data/path
    VIDEO = "video"            # Video data/path
    LATENT = "latent"          # Latent tensor reference
    ANY = "any"                # Pass-through any data
```

### CanvasNode

A node in the orchestration canvas.

```python
class CanvasNode(BaseModel):
    """A node in the orchestration canvas."""
    
    id: str = Field(description="Unique identifier (UUID)")
    node_type: NodeType
    position: tuple[float, float] = Field(description="(x, y) position on canvas")
    
    # For WORKFLOW nodes
    workflow_id: Optional[str] = Field(
        default=None,
        description="Reference to WorkflowDefinition"
    )
    
    # Backend assignment
    backend_affinity: Optional[str] = Field(
        default=None,
        description="Preferred backend ID"
    )
    fallback_strategy: FallbackStrategy = Field(default=FallbackStrategy.ASK_USER)
    
    # Node-specific configuration
    config: dict = Field(
        default_factory=dict,
        description="Node-specific configuration"
    )
    
    # For CONDITION nodes, config contains:
    # {
    #     "expression": "output.faces_detected > 0",
    #     "true_label": "Face Found",
    #     "false_label": "No Face"
    # }
    
    # For FANOUT nodes, config contains:
    # {
    #     "mode": "broadcast" | "distribute",
    #     "output_count": 3
    # }
    
    # For OUTPUT nodes, config contains:
    # {
    #     "output_folder": "/path/to/output",
    #     "naming_pattern": "{date}_{index}_{name}"
    # }
```

### CanvasConnection

A connection between two nodes.

```python
class CanvasConnection(BaseModel):
    """A connection between two canvas nodes."""
    
    id: str = Field(description="Unique identifier (UUID)")
    source_node_id: str
    source_port: str = Field(description="Output port name, e.g., 'output', 'true'")
    target_node_id: str
    target_port: str = Field(description="Input port name, e.g., 'input', 'trigger'")
    data_type: DataType = Field(default=DataType.ANY)
```

### Viewport

Canvas viewport state (pan/zoom).

```python
class Viewport(BaseModel):
    """Canvas viewport state."""
    
    offset_x: float = 0.0
    offset_y: float = 0.0
    zoom: float = 1.0
```

### CanvasLayout

Complete canvas state.

```python
class CanvasLayout(BaseModel):
    """Complete canvas layout with all nodes and connections."""
    
    nodes: list[CanvasNode] = Field(default_factory=list)
    connections: list[CanvasConnection] = Field(default_factory=list)
    viewport: Viewport = Field(default_factory=Viewport)
```

### Project

A user project containing a canvas layout.

```python
class Project(BaseModel):
    """A user project containing an orchestration graph."""
    
    id: str = Field(description="Unique identifier (UUID)")
    name: str
    description: str = Field(default="")
    canvas_layout: CanvasLayout = Field(default_factory=CanvasLayout)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
```

---

## Job Models (`job.py`)

### JobStatus

Status of a job or node execution.

```python
class JobStatus(str, Enum):
    """Status of a job or node execution."""
    PENDING = "pending"        # Waiting to start
    RUNNING = "running"        # Currently executing
    PAUSED = "paused"          # User paused
    COMPLETED = "completed"    # Successfully finished
    FAILED = "failed"          # Error occurred
    CANCELLED = "cancelled"    # User cancelled
```

### NodeExecution

Execution state of a single canvas node within a job.

```python
class NodeExecution(BaseModel):
    """Execution state of a single canvas node within a job."""
    
    id: str = Field(description="Unique identifier (UUID)")
    job_id: str
    canvas_node_id: str
    
    # Backend assignment
    backend_id: Optional[str] = None
    
    # Status tracking
    status: JobStatus = Field(default=JobStatus.PENDING)
    comfy_prompt_id: Optional[str] = Field(
        default=None,
        description="ComfyUI's prompt ID"
    )
    
    # Progress
    progress: float = Field(default=0.0, description="0-100%")
    current_step: Optional[str] = Field(
        default=None,
        description="Current step, e.g., 'KSampler: 15/30'"
    )
    
    # Data flow
    input_data: dict = Field(
        default_factory=dict,
        description="Data received from upstream nodes"
    )
    output_data: Optional[dict] = Field(
        default=None,
        description="Data to pass to downstream nodes"
    )
    
    # Timing
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Error tracking
    error_message: Optional[str] = None
    error_traceback: Optional[str] = None
```

### Job

A complete job execution (runs entire graph).

```python
class Job(BaseModel):
    """A complete job execution of an orchestration graph."""
    
    id: str = Field(description="Unique identifier (UUID)")
    project_id: str
    
    # Status
    status: JobStatus = Field(default=JobStatus.PENDING)
    
    # Frozen state at execution time
    canvas_snapshot: CanvasLayout = Field(
        description="Copy of canvas at execution start"
    )
    parameter_values: dict = Field(
        default_factory=dict,
        description="User-provided parameter values"
    )
    
    # Node executions (populated during execution)
    node_executions: list[NodeExecution] = Field(default_factory=list)
    
    # Timing
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Error tracking
    error_message: Optional[str] = None
    
    # Results
    outputs: dict = Field(
        default_factory=dict,
        description="Final outputs from OUTPUT nodes"
    )
```

---

## Metrics Models (`metrics.py`)

### MetricsSnapshot

Point-in-time metrics for a backend.

```python
class MetricsSnapshot(BaseModel):
    """Point-in-time metrics snapshot for a backend."""
    
    id: str = Field(description="Unique identifier (UUID)")
    backend_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    # GPU metrics
    gpu_memory_used: int = Field(description="VRAM used in MB")
    gpu_memory_total: int = Field(description="Total VRAM in MB")
    gpu_utilization: float = Field(description="GPU utilization 0-100%")
    gpu_temperature: int = Field(description="Temperature in Celsius")
    
    # System metrics
    cpu_utilization: float = Field(description="CPU utilization 0-100%")
    ram_used: int = Field(description="RAM used in MB")
    ram_total: int = Field(description="Total RAM in MB")
    
    # Queue metrics
    queue_depth: int = Field(description="Number of queued prompts")
    active_job_id: Optional[str] = Field(
        default=None,
        description="Currently running job"
    )
```

---

## Database Schema

The SQLite schema mirrors these models:

```sql
-- See orchestrator/storage/migrations/001_initial.sql for full schema

-- Core tables
CREATE TABLE backends (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER DEFAULT 8188,
    enabled INTEGER DEFAULT 1,
    capabilities TEXT,  -- JSON array
    max_concurrent_jobs INTEGER DEFAULT 1,
    tags TEXT,  -- JSON array
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    workflow_json TEXT NOT NULL,  -- JSON
    api_json TEXT NOT NULL,  -- JSON
    exposed_parameters TEXT,  -- JSON array
    required_capabilities TEXT,  -- JSON array
    required_custom_nodes TEXT,  -- JSON array
    created_at TEXT,
    updated_at TEXT,
    thumbnail TEXT
);

CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    canvas_layout TEXT NOT NULL,  -- JSON (CanvasLayout)
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    status TEXT NOT NULL,
    canvas_snapshot TEXT NOT NULL,  -- JSON
    parameter_values TEXT,  -- JSON
    node_executions TEXT,  -- JSON array
    created_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,
    outputs TEXT  -- JSON
);

CREATE TABLE metrics_snapshots (
    id TEXT PRIMARY KEY,
    backend_id TEXT REFERENCES backends(id),
    timestamp TEXT NOT NULL,
    gpu_memory_used INTEGER,
    gpu_memory_total INTEGER,
    gpu_utilization REAL,
    gpu_temperature INTEGER,
    cpu_utilization REAL,
    ram_used INTEGER,
    ram_total INTEGER,
    queue_depth INTEGER,
    active_job_id TEXT
);

-- Indexes for performance
CREATE INDEX idx_jobs_project ON jobs(project_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created ON jobs(created_at);
CREATE INDEX idx_metrics_backend ON metrics_snapshots(backend_id);
CREATE INDEX idx_metrics_timestamp ON metrics_snapshots(timestamp);
```
