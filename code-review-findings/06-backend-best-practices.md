# Backend Best Practices Review

**Report Date:** February 4, 2026
**Analyzer:** AI Code Review
**Overall Rating:** MEDIUM-HIGH

## Executive Summary

The Director's Console backend services (CPE and Orchestrator) demonstrate good foundation but have critical security gaps, missing production features, and inconsistent patterns. Key issues include path traversal vulnerabilities, blocking I/O in async endpoints, and missing observability.

## Verification Status (Feb 4, 2026)

**Verified:**
- Orchestrator CORS allows `allow_origins=["*"]`.
- CPE `/api/read-image` and `/api/delete-file` path traversal risks exist.
- Template workflow build concatenates prompt values without sanitization.
- SQLite storage uses sync access; repo defaults are in `Orchestrator/orchestrator/storage/repositories/*`.
- Blocking I/O is present in async endpoints (`save_project`, `load_project`, `scan_versions`, `png_metadata`, `scan_project_images`).
- `list_projects` swallows JSON parsing errors inside its loop (`except Exception: pass`).

**Incorrect:**
- Repository paths are not under `Orchestrator/orchestrator/storage/*.py`; they live under `Orchestrator/orchestrator/storage/repositories/`.

**Needs Recheck:**
- Blocking I/O claims for specific Orchestrator endpoints (confirm with direct endpoint code review).

---

## 1. API DESIGN

### 1.1 RESTfulness & Consistency Issues

**Severity:** MEDIUM

**Inconsistent API prefixes:**
- Some endpoints are under `/api`, others are not

**File:** `CinemaPromptEngineering/api/main.py`
- `/validate`, `/generate-prompt`, `/options`, `/presets/*` etc. are **not** under `/api` (e.g., lines ~199-214, 237-255, 477-600)
- But `/api/health` exists at line 118

**File:** `Orchestrator/orchestrator/api/server.py`
- No version prefix present in either service (lines ~137-142)

**Why it matters:** Harder to version or gateway API paths

**Recommendation:**
```python
# Move non-health endpoints under /api/v1/... and keep simple root or /health only
app.include_router(
    presets.router,
    prefix="/api/v1/presets"  # Versioned API
)

app.include_router(
    templates.router,
    prefix="/api/v1/templates"
)
```

---

### 1.2 API Versioning Missing

**Severity:** MEDIUM

**File:**
- `CinemaPromptEngineering/api/main.py` app initialization lines 42-46
- `Orchestrator/orchestrator/api/server.py` app initialization lines 137-142

**No version prefix present in either service.**

**Recommendation:**
```python
from fastapi import FastAPI

app = FastAPI(
    title="Cinema Prompt Engineering API",
    version="1.0.0",  # API version
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
)

# Use /api/v1 prefix for all routes
@app.get("/api/v1/health")
async def health_check():
    return {"status": "healthy"}
```

---

### 1.3 HTTP Status Code Usage

**Severity:** MEDIUM

**File:** `CinemaPromptEngineering/api/main.py`

**Using 422 for all exceptions** masks server errors.

**Endpoints:**
- `/validate` and `/generate-prompt`: broad `except Exception` → `422` (lines ~199-210 and ~213-234)

**Why it matters:** 422 should be reserved for validation errors; unexpected errors should be 500

**Recommendation:**
```python
from fastapi import HTTPException, status
from pydantic import ValidationError

@app.post("/api/v1/validate", response_model=ValidationResult)
async def validate_config(request: ValidateRequest):
    try:
        if request.project_type == ProjectType.LIVE_ACTION:
            config = LiveActionConfig(**request.config)
            return engine.validate_live_action(config)
        else:
            config = AnimationConfig(**request.config)
            return engine.validate_animation(config)
    except ValidationError as e:
        # Validation error - return 422
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        # Unexpected error - return 500
        logger.error(f"Validation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )
```

---

### 1.4 Pagination Missing on List Endpoints

**Severity:** MEDIUM

**Large collections are returned without paging.**

**File:** `CinemaPromptEngineering/api/main.py`
- `/presets/*` endpoints (lines ~477-640)

**File:** `CinemaPromptEngineering/api/templates.py`
- `/api/templates/list` (lines ~157-208)

**Recommendation:**
```python
from typing import Optional
from fastapi import Query

@app.get("/api/v1/presets/live-action")
async def get_live_action_presets(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000)
) -> PresetListResponse:
    """Get live action film presets with pagination."""
    total = len(LIVE_ACTION_PRESETS)
    presets = LIVE_ACTION_PRESETS[skip:skip + limit]

    return PresetListResponse(
        total=total,
        skip=skip,
        limit=limit,
        count=len(presets),
        presets=presets
    )
```

---

### 1.5 Rate Limiting Not Present

**Severity:** HIGH

**No rate-limit middleware or per-endpoint throttling in either app.**

**Files:**
- `CinemaPromptEngineering/api/main.py` app init lines 42-63
- `Orchestrator/orchestrator/api/server.py` app init lines 137-152

**Recommendation:**
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

app.state.limiter = limiter

# Add rate limiting to resource-heavy endpoints
@app.post("/api/v1/generate-prompt")
@limiter.limit("10/minute")  # Max 10 prompts per minute
async def generate_prompt(request: GeneratePromptRequest):
    # ... existing code

@app.post("/api/v1/save-image")
@limiter.limit("5/minute")  # Max 5 saves per minute
async def save_image(...):
    # ... existing code
```

---

## 2. PYTHON / ASYNC PATTERNS

### 2.1 Blocking I/O Inside Async Endpoints

**Severity:** HIGH

**File system I/O in async routes (will block event loop):**

**File:** `CinemaPromptEngineering/api/templates.py`
- `/import_workflow`: `open(...).write()` (lines ~511-512)

**File:** `Orchestrator/orchestrator/api/server.py`
- `/api/save-image`: `image_path.write_bytes(...)` (line ~1042)
- `/api/save-project`: `file_path.write_text(...)` (line ~1315)
- `/api/load-project`: `file_path.read_text()` (line ~1354)
- `/api/scan-versions`: `glob.glob` in loop (lines ~1125-1150)

**Recommendation:**
```python
import asyncio
import aiofiles

@app.post("/api/v1/templates/import_workflow")
async def import_workflow(file: UploadFile = File(...)):
    """Import a ComfyUI workflow file and create a new template."""
    try:
        # Use async file operations
        content = await file.read()

        output_path = USER_TEMPLATES_DIR / f"{name.lower().replace(' ', '_')}.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Async file write
        async with aiofiles.open(output_path, 'w') as f:
            await f.write(content)
    except Exception as e:
        logger.error(f"Failed to import workflow: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
```

---

### 2.2 Connection Pooling / Client Reuse

**Severity:** HIGH

**Issue:** `save_image` creates a new `httpx.AsyncClient()` per call (line ~926)

**File:** `CinemaPromptEngineering/api/main.py`

**Recommendation:**
```python
import httpx
from contextlib import asynccontextmanager

# Use shared client or dependency injection
@asynccontextmanager
async def get_http_client():
    client = httpx.AsyncClient(
        timeout=httpx.Timeout(30.0, connect=5.0),
        limits=httpx.Limits(
            max_connections=100,
            max_keepalive_connections=20,
            keepalive_expiry=5.0
        ),
        http2=True,  # Enable HTTP/2 for multiplexing
    )
    try:
        yield client
    finally:
        await client.aclose()

@app.post("/api/v1/save-image")
async def save_image(...):
    async with get_http_client() as client:
        # Use client for request
        # ...
```

---

### 2.3 Timeout Handling Gaps

**Severity:** MEDIUM

**File:** `CinemaPromptEngineering/frontend/src/storyboard/services/comfyui-client.ts` (backend equivalent)

**Issue:** `ComfyUIClient` uses a 10s default timeout, but **no per-request overrides**, which might be too short for some requests (e.g., `/prompt`, `/history`)

**Recommendation:**
```python
class ComfyUIClient:
    def __init__(
        self,
        base_url: str,
        default_timeout: float = 10.0
    ):
        self.base_url = base_url
        self.default_timeout = default_timeout

    async def submit_workflow(
        self,
        workflow: dict,
        timeout: Optional[float] = None
    ) -> dict:
        """Submit workflow with custom timeout."""
        timeout = timeout or self.default_timeout
        async with self.session.post(
            f"{self.base_url}/prompt",
            json={"prompt": workflow, "client_id": self.client_id},
            timeout=aiohttp.ClientTimeout(total=timeout)
        ) as response:
            return await response.json()
```

---

### 2.4 WebSocket Loop Has No Keepalive / Timeout

**Severity:** MEDIUM

**File:** `CinemaPromptEngineering/frontend/src/storyboard/services/comfyui-websocket.ts` (backend equivalent)

**Issue:** `ComfyUIClient._stream_ws` uses `websockets.connect` with no ping/pong / timeout control (lines ~318-357)

**Recommendation:**
```python
import websockets

async def _stream_ws(self, client_id: str):
    """Stream WebSocket with keepalive and timeout."""
    uri = f"{self.base_url.replace('http', 'ws')}/ws?clientId={client_id}"

    async with websockets.connect(
        uri,
        ping_interval=20,  # Ping every 20 seconds
        ping_timeout=90,    # Timeout if no pong in 90s
        close_timeout=10      # Graceful close timeout
    ) as ws:
        async for message in ws:
            await self.handle_message(message)
```

---

## 3. DATABASE OPERATIONS

### 3.1 SQL Injection Prevention

**Status:** ✅ SECURED

**SQL uses parameterized queries (`?`) throughout, which is good.**

**Example:**
- `job_repo.py` line 36, `project_repo.py` line 30, etc.

---

### 3.2 Connection Pooling / Blocking

**Severity:** MEDIUM

**Issue:** `SQLiteDatabase` opens a new connection per call (`_connect` line 52) and uses sqlite3 in sync calls. If called from async handlers, this will block the event loop.

**File:** `Orchestrator/orchestrator/storage/database.py`

**Recommendation:**
```python
import aiosqlite

class SQLiteDatabase:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._pool = None

    async def connect(self):
        """Connect to database with connection pooling."""
        if self._pool is None:
            self._pool = await aiosqlite.connect(self.db_path)
        return self._pool

    async def close(self):
        """Close database connection."""
        if self._pool:
            await self._pool.close()
            self._pool = None

    async def fetchone(self, query: str, params: tuple = ()) -> Row | None:
        """Execute query and fetch one row."""
        db = await self.connect()
        async with db.execute(query, params) as cursor:
            return await cursor.fetchone()
```

---

### 3.3 Transaction Management

**Severity:** MEDIUM

**File:** `Orchestrator/orchestrator/storage/database.py`

**Issue:** In `run_migrations`, `executescript` is used with implicit transaction per connection, but no retry logic for partial failures (lines 17-33)

**Recommendation:**
```python
async def run_migrations(self):
    """Run database migrations with transaction and retry."""
    migrations_path = Path(__file__).parent.parent / "migrations"

    for migration_file in sorted(migrations_path.glob("*.sql")):
        try:
            # Read migration
            with open(migration_file, 'r') as f:
                migration_sql = f.read()

            # Execute in transaction with retry
            async with self.connect() as db:
                await db.execute("BEGIN")
                try:
                    await db.executescript(migration_sql)
                    await db.execute("COMMIT")
                except Exception as e:
                    await db.execute("ROLLBACK")
                    logger.error(f"Migration failed: {migration_file.name}: {e}")
                    raise
        except Exception as e:
            logger.error(f"Failed to run migration {migration_file.name}: {e}")
            raise
```

---

### 3.4 Persistence Inconsistency

**Severity:** HIGH

**Issue:** `_default_db_path` differs across repos:

- `job_repo.py` uses stable `data/orchestrator.db` (lines 134-138)
- `project_repo.py`, `metrics_repo.py`, `workflow_repo.py` use **`tempfile.mkdtemp`**, which creates a new DB path each instantiation (lines ~100-103 / ~125-128 / ~130-132)

**Impact:** Data inconsistency across repositories and process restarts

**Recommendation:**
```python
# Use a single persistent DB path for all repos
# config.py
DEFAULT_DATA_DIR = Path("data").resolve()
DEFAULT_DB_PATH = DEFAULT_DATA_DIR / "orchestrator.db"

# job_repo.py
class JobRepository:
    def __init__(self, db_path: Path = DEFAULT_DB_PATH):
        self._default_db_path = db_path

# project_repo.py, metrics_repo.py, workflow_repo.py
# All use DEFAULT_DB_PATH instead of mkdtemp
```

---

### 3.5 Indexing / Query Optimization

**Severity:** MEDIUM

**Issue:** `list` queries order by timestamps without explicit indexes.

**Example:**
- `metrics_repo.py` line 36, `job_repo.py` line 42

**Recommendation:**
```python
# Add indexes on frequently queried columns
CREATE_INDEX_SQL = """
-- Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_backend_id ON jobs(backend_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
"""

async def run_migrations(self):
    """Run database migrations including indexes."""
    # ... existing migrations
    await self.execute(CREATE_INDEX_SQL)
```

---

## 4. SECURITY BEST PRACTICES

### 4.1 Path Traversal Risk

**Severity:** CRITICAL

**User-supplied paths are used directly for filesystem writes/reads:**

**File:** `Orchestrator/orchestrator/api/server.py`
- `/api/save-image` uses `folder_path` + `filename` directly (lines ~921-1042)
- `/api/load-project` uses `file_path` directly (lines ~1346-1355)
- `/api/list-projects` uses `folder_path` directly (lines ~1382-1393)

**File:** `CinemaPromptEngineering/api/templates.py`
- `/api/templates/import_workflow` derives filename from uploaded file; filename is only `.replace`, not sanitized (lines ~481-512)

**Recommendation:**
```python
from pathlib import Path

# Enforce allow-listed base directories
ALLOWED_BASE_DIRS = [
    Path("C:/Users/npittas/DirectorsConsole/Images"),
    Path("//NAS_HOST/Projects/Eliot"),
]

def safe_join(base_dir: Path, user_path: str) -> Path:
    """Safely join user path to base directory, preventing path traversal."""
    base = base_dir.resolve()
    user = (base / user_path).resolve()

    # Ensure result is within base directory
    if not str(user).startswith(str(base)):
        raise ValueError("Path traversal detected")

    return user

@app.post("/api/v1/save-image")
async def save_image(
    folder_path: str,
    filename: str,
    ...
):
    # Validate path is within allowed directories
    safe_path = None
    for base_dir in ALLOWED_BASE_DIRS:
        try:
            safe_path = safe_join(base_dir, filename)
            break
        except ValueError:
            continue

    if safe_path is None:
        raise HTTPException(status_code=403, detail="Access denied")

    # Verify it's an image file
    if safe_path.suffix.lower() not in ['.png', '.jpg', '.jpeg']:
        raise HTTPException(status_code=400, detail="Invalid file type")

    # Save file
    async with aiofiles.open(safe_path, 'wb') as f:
        await f.write(image_data)
```

---

### 4.2 SSRF / Arbitrary Network Access

**Severity:** HIGH

**File:** `CinemaPromptEngineering/api/main.py`

**Issue:** `/settings/custom-endpoint/test` accepts arbitrary `endpoint` with no validation (lines ~1049-1065)

**Recommendation:**
```python
from urllib.parse import urlparse

ALLOWED_SCHEMES = ['http', 'https']
ALLOWED_HOSTS = [
    'api.openai.com',
    'api.anthropic.com',
    'api.deepinfra.ai',
]

def validate_endpoint(url: str) -> None:
    """Validate endpoint URL to prevent SSRF."""
    parsed = urlparse(url)

    if parsed.scheme not in ALLOWED_SCHEMES:
        raise ValueError(f"Invalid scheme: {parsed.scheme}")

    if parsed.netloc not in ALLOWED_HOSTS:
        raise ValueError(f"Host not allowed: {parsed.netloc}")

    # Block private IPs
    if parsed.hostname in ['localhost', '127.0.0.1'] or parsed.hostname.startswith('192.168.'):
        raise ValueError("Private IP addresses not allowed")

@app.post("/api/v1/settings/custom-endpoint/test")
async def test_custom_endpoint(endpoint: str):
    """Test a custom LLM endpoint."""
    try:
        validate_endpoint(endpoint)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # ... existing test logic
```

---

### 4.3 OAuth State Stored In-Memory Without TTL

**Severity:** HIGH

**File:** `CinemaPromptEngineering/api/main.py`

**Issue:** `_oauth_states` and `_device_flow_states` are unbounded dicts (lines ~1087-1088 and ~1221-1222)

**Risk:** Memory growth, stale states

**Recommendation:**
```python
import time
from datetime import datetime, timedelta

_oauth_states: dict[str, dict] = {}
OAUTH_STATE_TTL = 300  # 5 minutes

@app.on_event("startup")
async def start_oauth_cleanup():
    """Clean up expired OAuth states periodically."""
    while True:
        await asyncio.sleep(60)  # Check every minute
        now = datetime.utcnow()
        expired_keys = [
            key for key, data in _oauth_states.items()
            if now - data.get('created_at', now) > timedelta(seconds=OAUTH_STATE_TTL)
        ]
        for key in expired_keys:
            _oauth_states.pop(key, None)

# When storing state
_oauth_states[oauth_state.state] = {
    "provider_id": provider_id,
    "code_verifier": oauth_state.code_verifier,
    "redirect_uri": actual_redirect_uri,
    "created_at": datetime.utcnow(),  # Track creation time
}
```

---

### 4.4 CORS Policy Too Open (Orchestrator)

**Severity:** HIGH

**File:** `Orchestrator/orchestrator/api/server.py`
**Lines:** 145-152

**Issue:** `allow_origins=["*"]` with `expose_headers=["*"]`

**Risk:** Any origin can access API; if paired with future auth cookies, this becomes dangerous

**Recommendation:**
```python
import os

ALLOWED_ORIGINS: list[str] = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,  # Restrict to specific origins
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Range"],
)
```

---

## 5. LOGGING & MONITORING

### 5.1 Unstructured Logging Only

**Severity:** MEDIUM

**Logging uses plain text format (logging_config.py lines 7-29).**

**Recommendation:**
```python
import json
from logging import Formatter

class JsonFormatter(Formatter):
    """Structured JSON logging for easier aggregation."""

    def format(self, record):
        log_obj = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_obj)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    handlers=[
        logging.FileHandler('orchestrator.log'),
        logging.StreamHandler()
    ],
    format='%(message)s',  # Will be processed by JsonFormatter
)
```

---

### 5.2 Potential Sensitive Data Logging

**Severity:** HIGH

**Issue:** Job submission logs full metadata (server.py lines 74-80)

**Risk:** Metadata may include secrets

**Recommendation:**
```python
# Redact sensitive data from logs
import re

def redact_secrets(data: dict) -> dict:
    """Redact potential secrets from log data."""
    redacted = data.copy()

    # Redact common secret fields
    secret_fields = ['api_key', 'token', 'password', 'secret', 'credential']
    for field in secret_fields:
        if field in redacted:
            redacted[field] = '***REDACTED***'

    # Redact potential token patterns
    if 'metadata' in redacted:
        metadata = str(redacted['metadata'])
        redacted['metadata'] = re.sub(r'Bearer\s+[A-Za-z0-9._-]+', 'Bearer ***REDACTED***', metadata)

    return redacted

@app.post("/api/v1/job")
async def submit_job(job_data: JobSubmission):
    """Submit job with sanitized logging."""
    logger.info("Job submitted", extra=redact_secrets(job_data.dict()))
    # ... existing code
```

---

## 6. RECOMMENDATIONS SUMMARY

| Priority | Area | Quick Win | Medium | Long-term |
|----------|------|-----------|--------|----------|
| **P0** | Security | Add path validation | Add CORS restrictions | Implement secrets manager |
| **P0** | Performance | Add async file I/O | Add connection pooling | Implement caching |
| **P1** | API Design | Add API versioning | Add pagination | Add rate limiting |
| **P1** | Database | Add persistent DB path | Add indexes | Migrate to PostgreSQL |
| **P1** | Monitoring | Add request IDs | Add structured logging | Add Prometheus metrics |
| **P2** | Testing | Add integration tests | Add test coverage | Add end-to-end tests |

---

**Next Steps:**
1. Prioritize P0 security issues (path traversal, CORS)
2. Implement structured logging with request correlation
3. Add async database operations
4. Set up monitoring and alerting
5. Add comprehensive API documentation
