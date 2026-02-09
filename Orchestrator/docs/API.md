# Director's Console Orchestrator - API Documentation

## Phase 1: FastAPI Layer Implementation

### Overview

The Orchestrator now exposes a REST API for submitting ComfyUI workflows programmatically. This enables integration with other Director's Console tools like StoryboardUI2 and CinemaPromptEngineering (CPE).

### Architecture

```
┌─────────────────┐
│  StoryboardUI2  │
│       CPE       │
└────────┬────────┘
         │ HTTP/JSON
         ▼
┌─────────────────┐
│  FastAPI Layer  │◄── orchestrator/api.py
│   (Phase 1)     │
└────────┬────────┘
         │ (Phase 2: Will integrate)
         ▼
┌─────────────────┐
│   JobManager    │
│  BackendMgr     │
└─────────────────┘
```

### Quick Start

#### 1. Install Dependencies

```bash
cd /mnt/nas/Python/DirectorsConsole/Orchestrator
pip install -r requirements.txt
```

This will install FastAPI, Uvicorn, and all other required dependencies.

#### 2. Start the API Server

```bash
# Default (localhost:9800)
python -m orchestrator.server

# Custom host/port
python -m orchestrator.server --host 0.0.0.0 --port 8080

# Development mode (auto-reload)
python -m orchestrator.server --reload --log-level debug
```

#### 3. Test the API

Open another terminal and run:

```bash
python test_api.py
```

Or use curl:

```bash
# Health check
curl http://127.0.0.1:9800/api/health

# Submit a job
curl -X POST http://127.0.0.1:9800/api/job \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "my_workflow_001",
    "parameters": {
      "prompt": "cinematic shot",
      "steps": 20
    },
    "metadata": {
      "source": "storyboard"
    }
  }'
```

### API Endpoints

#### `POST /api/job` - Submit Workflow Job

Submit a workflow manifest for execution.

**Request Body:**

```json
{
  "workflow_id": "string (required)",
  "parameters": {
    "param1": "value1",
    "param2": 123
  },
  "metadata": {
    "source": "storyboard",
    "scene_id": "shot_001"
  }
}
```

**Response (202 Accepted):**

```json
{
  "job_id": "uuid-string",
  "status": "accepted",
  "message": "Job accepted for execution",
  "submitted_at": "2026-01-28T12:00:00"
}
```

**Phase 1 Behavior:**
- Logs the received job to console
- Generates a mock job_id
- Returns acceptance response
- **Does NOT execute** (mocked for now)

**Phase 2 (Future):**
- Will integrate with JobManager
- Will trigger actual workflow execution
- Will return real job_id for tracking

---

#### `GET /api/health` - Health Check

Check API server health status.

**Response (200 OK):**

```json
{
  "status": "ok",
  "timestamp": "2026-01-28T12:00:00",
  "backends_online": 0,
  "version": "0.1.0"
}
```

---

#### `GET /api/backends` - List Backends

Get information about available ComfyUI backends.

**Response (200 OK):**

```json
[]
```

**Phase 1:** Returns empty list.  
**Phase 2:** Will query BackendManager for actual backend status.

---

### Interactive API Documentation

FastAPI provides automatic interactive documentation:

- **Swagger UI:** http://127.0.0.1:9800/docs
- **ReDoc:** http://127.0.0.1:9800/redoc

These are auto-generated from the code and always up-to-date.

---

### Configuration

The API server uses the same `config.yaml` as the desktop UI:

```yaml
# config.yaml
data_dir: "./data"
log_dir: "./logs"

backends:
  - id: node1
    name: "Beast (5090)"
    host: "192.168.1.100"
    port: 8188
    enabled: true
    capabilities: ["flux", "sdxl"]
    max_concurrent_jobs: 2
```

Specify a custom config:

```bash
python -m orchestrator.server --config /path/to/config.yaml
```

---

### Integration Example (StoryboardUI2)

```python
import httpx

async def submit_shot_to_orchestrator(workflow_id: str, params: dict):
    """Submit a shot from StoryboardUI2 to the Orchestrator."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://127.0.0.1:9800/api/job",
            json={
                "workflow_id": workflow_id,
                "parameters": params,
                "metadata": {
                    "source": "storyboard_ui",
                    "shot_id": params.get("shot_id"),
                },
            },
        )
        response.raise_for_status()
        job = response.json()
        print(f"Job submitted: {job['job_id']}")
        return job["job_id"]
```

---

### Logging

Logs are written to:
- **Console:** Real-time output
- **File:** `logs/orchestrator.log` (rotating, 5MB max)

Adjust log level:

```bash
python -m orchestrator.server --log-level debug
```

Levels: `debug`, `info`, `warning`, `error`

---

### Phase 2 Roadmap

#### Planned Enhancements:

1. **Job Manager Integration**
   - Connect `/api/job` to actual JobManager
   - Execute workflows on backends
   - Return real job IDs

2. **Job Status Queries**
   - `GET /api/job/{job_id}` - Get job status
   - `GET /api/job/{job_id}/outputs` - Get job outputs

3. **Job Control**
   - `DELETE /api/job/{job_id}` - Cancel job

4. **Real-Time Updates**
   - `WebSocket /api/job/{job_id}/stream` - Progress streaming

5. **Backend Monitoring**
   - `/api/backends` returns actual backend health
   - Backend affinity/selection via API

6. **Watchdog Integration**
   - Monitor `Inbox` folder for JSON manifests
   - Auto-submit files dropped by StoryboardUI2

---

### Development Notes

#### Code Structure

```
orchestrator/
├── api.py          # FastAPI app and endpoints (NEW)
├── server.py       # CLI entry point for API server (NEW)
├── app.py          # Existing PyQt6 desktop UI
├── core/
│   └── engine/
│       └── job_manager.py  # Job execution engine
└── utils/
    ├── config.py          # Config loading
    └── logging_config.py  # Logging setup
```

#### Coding Standards (from AGENTS.md)

✓ **Type Hints:** All functions have type hints  
✓ **Async First:** API endpoints are async  
✓ **Logging:** All actions logged via `logger`  
✓ **Docstrings:** Google-style docstrings  
✓ **Error Handling:** No silent failures

---

### Troubleshooting

#### Port Already in Use

```bash
# Find process using port 9800
lsof -i :9800
# Kill it
kill -9 <PID>
```

Or use a different port:

```bash
python -m orchestrator.server --port 8001
```

#### Import Errors

Make sure you're in the Orchestrator directory:

```bash
cd /mnt/nas/Python/DirectorsConsole/Orchestrator
```

And installed dependencies:

```bash
pip install -r requirements.txt
```

---

### Testing

Run the test suite:

```bash
# Start server
python -m orchestrator.server

# In another terminal
python test_api.py
```

Expected output:

```
Testing Health Check Endpoint
Status Code: 200
Response: {
  "status": "ok",
  "timestamp": "...",
  "backends_online": 0,
  "version": "0.1.0"
}

Testing Job Submission Endpoint
Status Code: 202
Response: {
  "job_id": "...",
  "status": "accepted",
  "message": "Job accepted for execution (Phase 1: Mock)",
  "submitted_at": "..."
}
```

---

### Next Steps

**For Agents:**

1. **Phase 2:** Connect API to JobManager
   - Modify `submit_job()` to call `job_manager.run_job()`
   - Return real job IDs
   - Track job state

2. **Watchdog:** Implement file-based job submission
   - Monitor `Inbox/` folder
   - Parse JSON manifests
   - Auto-submit to API

3. **WebSocket:** Real-time progress streaming
   - Push updates to connected clients
   - Use for live UI updates in StoryboardUI2

**For Integration:**

1. Update StoryboardUI2 to submit to API instead of localhost ComfyUI
2. Update CPE to generate API manifests
3. Test end-to-end pipeline

---

*Created: 2026-01-28*  
*Agent: Director's Architect (Builder)*  
*Phase: 1 - FastAPI Layer*
