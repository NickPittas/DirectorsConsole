# Orchestrator API - Quick Reference

## Starting the Server

```bash
cd /mnt/nas/Python/DirectorsConsole/Orchestrator/
python3 start_api.py
```

Server runs on: `http://0.0.0.0:8020`

---

## API Endpoints

### 1. Health Check
```bash
curl http://localhost:8020/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "orchestrator-api"
}
```

---

### 2. Submit Job

**Endpoint:** `POST /api/job`

**Request:**
```bash
curl -X POST http://localhost:8020/api/job \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "your_workflow_id",
    "parameters": {
      "prompt": "Your cinematic prompt",
      "resolution": "1920x1080",
      "fps": 24
    }
  }'
```

**Response:**
```json
{
  "job_id": "c3e1b180-7fcc-49c4-9c39-45c7f7cc5575",
  "status": "queued"
}
```

**Fields:**
- `workflow_id` (string, required): The workflow to execute
- `parameters` (object, optional): Any key-value pairs for the workflow

---

## Python Client Example

```python
import httpx

# Submit a job
response = httpx.post(
    "http://localhost:8020/api/job",
    json={
        "workflow_id": "cinematic_render_v1",
        "parameters": {
            "prompt": "A wide shot of a cyberpunk city at night",
            "camera_angle": "wide",
            "lighting": "neon",
            "resolution": "3840x2160"
        }
    }
)

result = response.json()
print(f"Job ID: {result['job_id']}")
print(f"Status: {result['status']}")
```

---

## JavaScript/TypeScript Client Example

```typescript
const response = await fetch('http://localhost:8020/api/job', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    workflow_id: 'cinematic_render_v1',
    parameters: {
      prompt: 'A dramatic sunset over mountain peaks',
      resolution: '1920x1080',
      fps: 24
    }
  })
});

const result = await response.json();
console.log(`Job ID: ${result.job_id}`);
console.log(`Status: ${result.status}`);
```

---

## Documentation

- **Swagger UI:** http://localhost:8020/docs
- **ReDoc:** http://localhost:8020/redoc
- **OpenAPI Schema:** http://localhost:8020/openapi.json

---

## Error Handling

The API uses standard HTTP status codes:

- `200 OK`: Request successful
- `422 Unprocessable Entity`: Validation error (missing required fields, invalid data types)
- `500 Internal Server Error`: Server error

**Example Validation Error:**
```bash
curl -X POST http://localhost:8020/api/job \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response:**
```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "workflow_id"],
      "msg": "Field required",
      "input": {}
    }
  ]
}
```

---

## 3. Submit Job Group (Multi-Node Parallel)

**Endpoint:** `POST /api/job-group`

Submit parallel generation jobs across multiple backends.

**Request:**
```bash
curl -X POST http://localhost:8020/api/job-group \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_json": {
      "3": {"class_type": "KSampler", "inputs": {"seed": 42, "steps": 20}}
    },
    "backend_ids": ["localhost_8188", "192.168.100.6_8188"],
    "seed_strategy": "random"
  }'
```

**Response:**
```json
{
  "job_group_id": "jg_abc123",
  "child_jobs": [
    {"job_id": "j_001", "backend_id": "localhost_8188", "seed": 42, "status": "queued"},
    {"job_id": "j_002", "backend_id": "192.168.100.6_8188", "seed": 87654321, "status": "queued"}
  ],
  "status": "running"
}
```

**Fields:**
- `workflow_json` (object, required): ComfyUI workflow JSON
- `backend_ids` (array, required): List of backend IDs
- `seed_strategy` (string, optional): `random`, `sequential`, `fibonacci`, `golden_ratio`

---

## 4. Get Job Group Status

**Endpoint:** `GET /api/job-groups/{job_group_id}`

Get status of a job group including all child jobs.

**Request:**
```bash
curl http://localhost:8020/api/job-groups/jg_abc123
```

**Response:**
```json
{
  "job_group_id": "jg_abc123",
  "status": "partial_complete",
  "completed_count": 1,
  "failed_count": 0,
  "total_count": 2,
  "child_jobs": [...]
}
```

---

## 5. Cancel Job Group

**Endpoint:** `DELETE /api/job-groups/{job_group_id}`

Cancel an active job group and interrupt all running child jobs.

**Request:**
```bash
curl -X DELETE http://localhost:8020/api/job-groups/jg_abc123
```

**Response:**
```json
{
  "cancelled": true,
  "interrupted": 1,
  "already_complete": 1
}
```

---

## 6. WebSocket for Real-Time Updates

**Endpoint:** `WS /ws/job-groups/{job_group_id}`

Stream job group progress and results in real-time.

**Event Types:**
| Event | Description |
|-------|-------------|
| `child_progress` | Progress update for a child job |
| `child_completed` | Child job completed successfully |
| `child_failed` | Child job failed |
| `group_complete` | All child jobs finished |

**Example (JavaScript):**
```javascript
const ws = new WebSocket('ws://localhost:8020/ws/job-groups/jg_abc123');
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log(msg.type, msg);
};
```

---

## Next Steps

Once you have a `job_id`, you can use it to:
- Query job status (Phase 2)
- Retrieve job results (Phase 2)
- Cancel jobs (Phase 2)

**For Multi-Node Generation:**
- See [docs/API_JOB_GROUPS.md](Orchestrator/docs/API_JOB_GROUPS.md) for complete API documentation
- See [User Guide](../../docs/MULTI_NODE_GENERATION.md) for end-user documentation

---

*Generated for Phase 1: The Bridge*
