CREATE TABLE IF NOT EXISTS backends (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 8188,
    enabled INTEGER NOT NULL DEFAULT 1,
    capabilities TEXT,
    max_concurrent_jobs INTEGER NOT NULL DEFAULT 1,
    tags TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    workflow_json TEXT NOT NULL,
    api_json TEXT NOT NULL,
    exposed_parameters TEXT,
    required_capabilities TEXT,
    required_custom_nodes TEXT,
    created_at TEXT,
    updated_at TEXT,
    thumbnail TEXT
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    canvas_layout TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT,  -- Nullable for ad-hoc execution
    status TEXT NOT NULL,
    canvas_snapshot TEXT NOT NULL,
    parameter_values TEXT,
    node_executions TEXT,
    created_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,
    outputs TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS metrics_snapshots (
    id TEXT PRIMARY KEY,
    backend_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    gpu_memory_used INTEGER,
    gpu_memory_total INTEGER,
    gpu_utilization REAL,
    gpu_temperature INTEGER,
    cpu_utilization REAL,
    ram_used INTEGER,
    ram_total INTEGER,
    queue_depth INTEGER,
    active_job_id TEXT,
    FOREIGN KEY (backend_id) REFERENCES backends(id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_metrics_backend ON metrics_snapshots(backend_id);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics_snapshots(timestamp);
