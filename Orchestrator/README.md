# ComfyUI Orchestrator

Desktop application and API server for orchestrating multiple ComfyUI instances across machines.

## Modes of Operation

### 1. Desktop UI Mode (PyQt6)
```bash
python run_orchestrator.py
```

### 2. API Server Mode (FastAPI) **NEW**
```bash
python -m orchestrator.server
```

The API server provides a REST endpoint for programmatic job submission, enabling integration with StoryboardUI2, CPE, and other Director's Console tools.

**Quick Test:**
```bash
# Start the server
python -m orchestrator.server

# In another terminal, test it
python test_api.py
```

## API Documentation

See [docs/API.md](docs/API.md) for complete API documentation, including:
- Endpoint reference
- Integration examples
- Configuration
- Phase 2 roadmap

**Job Groups API:** See [docs/API_JOB_GROUPS.md](docs/API_JOB_GROUPS.md) for multi-node parallel generation endpoints.

**Interactive Docs:** http://127.0.0.1:8000/docs (when server is running)

## Installation

```bash
pip install -r requirements.txt
```
