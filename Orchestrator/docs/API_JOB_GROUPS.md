# Job Groups API Reference

Complete API documentation for the multi-node parallel generation feature, including REST endpoints, WebSocket events, request/response schemas, and code examples.

---

## Table of Contents

1. [Overview](#overview)
2. [Endpoints](#endpoints)
3. [Request/Response Schemas](#requestresponse-schemas)
4. [WebSocket Events](#websocket-events)
5. [Error Codes](#error-codes)
6. [Code Examples](#code-examples)

---

## Overview

The Job Groups API enables parallel generation across multiple ComfyUI backends, allowing you to:

- Submit a group of jobs that run simultaneously
- Track progress in real-time via WebSocket
- Handle failures gracefully with isolation
- Cancel all jobs in a group atomically

### Base URL

```
http://localhost:9820
```

### Content Type

All API requests and responses use JSON encoding:

```
Content-Type: application/json
```

---

## Endpoints

### 1. Submit Job Group

**Endpoint:** `POST /api/job-group`

Submit a parallel generation job across multiple backends. Each backend receives the same workflow with a unique seed.

**Request:**

```bash
curl -X POST http://localhost:9820/api/job-group \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_json": {
      "3": {
        "class_type": "KSampler",
        "inputs": {
          "seed": 42,
          "steps": 20,
          "cfg": 7.0,
          "sampler_name": "euler",
          "scheduler": "normal",
          "positive": "A cinematic cityscape at night",
          "negative": "blurry, low quality",
          "latent_image": {"filename": "batch_0"}
        }
      }
    },
    "parameters": {
      "steps": 20,
      "cfg_scale": 7.0
    },
    "backend_ids": [
      "localhost_8188",
      "192.168.100.6_8188",
      "192.168.100.7_8188"
    ],
    "seed_strategy": "random",
    "base_seed": 42,
    "metadata": {
      "panel_id": 3,
      "scene": "shot_001"
    },
    "timeout_seconds": 300
  }'
```

**Response (201 Created):**

```json
{
  "job_group_id": "jg_abc123def456",
  "child_jobs": [
    {
      "job_id": "j_001",
      "backend_id": "localhost_8188",
      "seed": 42,
      "status": "queued"
    },
    {
      "job_id": "j_002",
      "backend_id": "192.168.100.6_8188",
      "seed": 87654321,
      "status": "queued"
    },
    {
      "job_id": "j_003",
      "backend_id": "192.168.100.7_8188",
      "seed": 123456789,
      "status": "queued"
    }
  ],
  "status": "running",
  "created_at": "2026-02-01T07:00:00.000Z"
}
```

---

### 2. Get Job Group Status

**Endpoint:** `GET /api/job-groups/{job_group_id}`

Retrieve the current status of a job group, including all child jobs and their progress.

**Request:**

```bash
curl http://localhost:9820/api/job-groups/jg_abc123def456
```

**Response (200 OK):**

```json
{
  "job_group_id": "jg_abc123def456",
  "status": "partial_complete",
  "child_jobs": [
    {
      "job_id": "j_001",
      "backend_id": "localhost_8188",
      "seed": 42,
      "status": "completed",
      "progress": 100.0,
      "current_step": "KSampler",
      "outputs": {
        "images": [
          {
            "filename": "ComfyUI_00001_.png",
            "url": "http://localhost:8188/view?filename=ComfyUI_00001_.png",
            "subfolder": "",
            "type": "output"
          }
        ]
      },
      "completed_at": "2026-02-01T07:01:30.000Z"
    },
    {
      "job_id": "j_002",
      "backend_id": "192.168.100.6_8188",
      "seed": 87654321,
      "status": "running",
      "progress": 65.0,
      "current_step": "KSampler"
    },
    {
      "job_id": "j_003",
      "backend_id": "192.168.100.7_8188",
      "seed": 123456789,
      "status": "failed",
      "error_message": "CUDA out of memory",
      "error_type": "ComfyUIError"
    }
  ],
  "completed_count": 1,
  "failed_count": 1,
  "total_count": 3,
  "created_at": "2026-02-01T07:00:00.000Z",
  "completed_at": null
}
```

---

### 3. Cancel Job Group

**Endpoint:** `DELETE /api/job-groups/{job_group_id}`

Cancel an active job group. Attempts to interrupt all running child jobs. Already completed or failed jobs are not affected.

**Request:**

```bash
curl -X DELETE http://localhost:9820/api/job-groups/jg_abc123def456
```

**Response (200 OK):**

```json
{
  "cancelled": true,
  "interrupted": 1,
  "already_complete": 1,
  "already_failed": 1
}
```

---

### 4. WebSocket Connection

**Endpoint:** `WS /ws/job-groups/{job_group_id}`

Connect to receive real-time streaming of job group progress and results.

**WebSocket URL:**

```
ws://localhost:9820/ws/job-groups/jg_abc123def456
```

**Connection Example (JavaScript):**

```javascript
const ws = new WebSocket('ws://localhost:9820/ws/job-groups/jg_abc123def456');

ws.onopen = () => {
  console.log('Connected to job group WebSocket');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message.type, message);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = (code, reason) => {
  console.log('Disconnected:', code, reason);
};
```

---

## Request/Response Schemas

### JobGroupRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workflow_json` | `object` | Yes | Full ComfyUI workflow in API JSON format |
| `parameters` | `object` | No | Parameter overrides to apply to workflow |
| `backend_ids` | `array<string>` | Yes | List of backend IDs to execute on (min: 1) |
| `seed_strategy` | `string` | No | Strategy for generating unique seeds |
| `base_seed` | `integer` | No | Base seed for sequential/derived strategies |
| `metadata` | `object` | No | Additional metadata (panel_id, scene, etc.) |
| `timeout_seconds` | `integer` | No | Timeout per job (default: 300, range: 30-3600) |
| `required_capabilities` | `array<string>` | No | Required backend capabilities |

### JobGroupResponse

| Field | Type | Description |
|-------|------|-------------|
| `job_group_id` | `string` | Unique identifier for the job group |
| `child_jobs` | `array<ChildJob>` | List of child jobs created |
| `status` | `string` | Initial status of the job group |
| `created_at` | `string` | ISO timestamp of creation |

### JobGroupStatusResponse

| Field | Type | Description |
|-------|------|-------------|
| `job_group_id` | `string` | Unique identifier for the job group |
| `status` | `string` | Current status of the group |
| `child_jobs` | `array<ChildJob>` | List of child jobs with status |
| `completed_count` | `integer` | Number of completed jobs |
| `failed_count` | `integer` | Number of failed jobs |
| `total_count` | `integer` | Total number of child jobs |
| `created_at` | `string` | ISO timestamp of creation |
| `completed_at` | `string\|null` | ISO timestamp of completion or null |

### ChildJob

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | `string` | Unique identifier for this child job |
| `backend_id` | `string` | ID of the backend executing this job |
| `seed` | `integer` | The seed value used for generation |
| `status` | `string` | Current execution status |
| `progress` | `float` | Progress percentage (0-100) |
| `current_step` | `string\|null` | Current execution step/node |
| `outputs` | `object\|null` | Output data from successful completion |
| `error_message` | `string\|null` | Error description if failed |
| `error_type` | `string\|null` | Type of error if failed |
| `queued_at` | `string` | ISO timestamp when queued |
| `started_at` | `string\|null` | ISO timestamp when started |
| `completed_at` | `string\|null` | ISO timestamp when completed |

### SeedStrategy Enum

| Value | Description |
|-------|-------------|
| `random` | Random seeds with minimum distance (default) |
| `sequential` | base_seed, base_seed+1, base_seed+2... |
| `fibonacci` | Fibonacci-based spacing |
| `golden_ratio` | Golden ratio multiplicative spacing |

### JobGroupStatus Enum

| Value | Description |
|-------|-------------|
| `pending` | Job group created but not yet running |
| `running` | At least one child job is running |
| `partial_complete` | Some succeeded, some failed/running |
| `completed` | All child jobs succeeded |
| `failed` | All child jobs failed |
| `cancelled` | Job group was cancelled |

---

## WebSocket Events

The WebSocket connection sends various event types as the job group progresses.

### Event Types

| Event Type | Description |
|------------|-------------|
| `initial_state` | Sent when client first connects |
| `child_progress` | Child job progress update |
| `child_completed` | Child job completed successfully |
| `child_failed` | Child job failed |
| `child_timeout` | Child job timed out |
| `child_cancelled` | Child job was cancelled |
| `group_complete` | All child jobs finished |
| `pong` | Response to client ping |

### Event Payloads

#### initial_state

```json
{
  "type": "initial_state",
  "job_group_id": "jg_abc123",
  "status": "running",
  "child_jobs": [
    {
      "job_id": "j_001",
      "backend_id": "localhost_8188",
      "seed": 42,
      "status": "queued",
      "progress": 0.0
    }
  ]
}
```

#### child_progress

```json
{
  "type": "child_progress",
  "job_id": "j_001",
  "backend_id": "localhost_8188",
  "progress": 65.0,
  "current_step": "KSampler",
  "steps_completed": 13,
  "steps_total": 20
}
```

#### child_completed

```json
{
  "type": "child_completed",
  "job_id": "j_001",
  "backend_id": "localhost_8188",
  "seed": 42,
  "outputs": {
    "images": [
      {
        "filename": "ComfyUI_00001_.png",
        "url": "http://localhost:8188/view?filename=ComfyUI_00001_.png",
        "subfolder": "",
        "type": "output"
      }
    ]
  },
  "completed_at": "2026-02-01T07:01:30.000Z"
}
```

#### child_failed

```json
{
  "type": "child_failed",
  "job_id": "j_002",
  "backend_id": "192.168.100.6_8188",
  "error": "CUDA out of memory",
  "error_type": "ComfyUIError",
  "failed_at": "2026-02-01T07:01:45.000Z"
}
```

#### child_timeout

```json
{
  "type": "child_timeout",
  "job_id": "j_003",
  "backend_id": "192.168.100.7_8188",
  "timeout_seconds": 300,
  "timed_out_at": "2026-02-01T07:06:00.000Z"
}
```

#### group_complete

```json
{
  "type": "group_complete",
  "job_group_id": "jg_abc123",
  "total": 3,
  "succeeded": 2,
  "failed": 1,
  "results": [
    {
      "job_id": "j_001",
      "status": "completed",
      "outputs": {
        "images": [...]
      }
    },
    {
      "job_id": "j_002",
      "status": "failed",
      "error": "CUDA out of memory"
    },
    {
      "job_id": "j_003",
      "status": "completed",
      "outputs": {
        "images": [...]
      }
    }
  ]
}
```

#### pong

```json
{
  "type": "pong"
}
```

### Client Messages

| Message | Description |
|---------|-------------|
| `ping` | Keepalive ping (server responds with pong) |
| `close` | Client requests connection close |

---

## Error Codes

### HTTP Status Codes

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Bad Request | Invalid request body or parameters |
| 404 | Not Found | Job group or resource not found |
| 503 | Service Unavailable | ParallelJobManager not initialized |

### Error Response Format

```json
{
  "detail": "Error message describing the issue"
}
```

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `"No valid online backends available"` | All selected backends are offline | Check backend status |
| `"Job group {id} not found"` | Group expired or invalid ID | Verify group ID |
| `"ParallelJobManager not initialized"` | Server startup incomplete | Restart server |
| `"CUDA out of memory"` (in child_failed) | GPU memory exceeded | Reduce workflow complexity |

---

## Code Examples

### Python Example

```python
import asyncio
import httpx
import json

ORCHESTRATOR_URL = "http://localhost:9820"


async def submit_parallel_job():
    """Submit a parallel generation job across 3 backends."""
    
    request_payload = {
        "workflow_json": {
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 42,
                    "steps": 20,
                    "cfg": 7.0,
                    "sampler_name": "euler",
                    "positive": "A cinematic cityscape at night",
                    "negative": "blurry, low quality"
                }
            }
        },
        "parameters": {
            "steps": 20,
            "cfg_scale": 7.0
        },
        "backend_ids": [
            "localhost_8188",
            "192.168.100.6_8188",
            "192.168.100.7_8188"
        ],
        "seed_strategy": "random",
        "metadata": {
            "panel_id": 3,
            "scene": "shot_001"
        },
        "timeout_seconds": 300
    }
    
    async with httpx.AsyncClient() as client:
        # Submit job group
        response = await client.post(
            f"{ORCHESTRATOR_URL}/api/job-group",
            json=request_payload
        )
        response.raise_for_status()
        
        result = response.json()
        job_group_id = result["job_group_id"]
        print(f"Job group created: {job_group_id}")
        
        # Poll for status
        while True:
            status_response = await client.get(
                f"{ORCHESTRATOR_URL}/api/job-groups/{job_group_id}"
            )
            status_response.raise_for_status()
            status = status_response.json()
            
            print(f"Status: {status['status']} - "
                  f"{status['completed_count']}/{status['total_count']} complete")
            
            if status["status"] in ["completed", "partial_complete", "failed"]:
                break
            
            await asyncio.sleep(2)
        
        # Print results
        for job in status["child_jobs"]:
            print(f"\nBackend: {job['backend_id']}")
            print(f"  Status: {job['status']}")
            print(f"  Seed: {job['seed']}")
            if job["status"] == "completed":
                images = job["outputs"]["images"]
                print(f"  Images: {len(images)}")
                for img in images:
                    print(f"    - {img['filename']}: {img['url']}")
            elif job["status"] == "failed":
                print(f"  Error: {job['error_message']}")


if __name__ == "__main__":
    asyncio.run(submit_parallel_job())
```

### Python with WebSocket

```python
import asyncio
import json
import httpx
from websockets import connect

ORCHESTRATOR_URL = "http://localhost:9820"


async def submit_with_websocket():
    """Submit a job group and stream results via WebSocket."""
    
    request_payload = {
        "workflow_json": {...},  # Your workflow
        "backend_ids": ["localhost_8188", "192.168.100.6_8188"],
        "seed_strategy": "random"
    }
    
    async with httpx.AsyncClient() as client:
        # Submit job group
        response = await client.post(
            f"{ORCHESTRATOR_URL}/api/job-group",
            json=request_payload
        )
        result = response.json()
        job_group_id = result["job_group_id"]
        print(f"Job group: {job_group_id}")
    
    # Connect to WebSocket for streaming
    ws_url = ORCHESTRATOR_URL.replace("http", "ws")
    async with connect(f"{ws_url}/ws/job-groups/{job_group_id}") as ws:
        print("Connected to WebSocket")
        
        async for message in ws:
            event = json.loads(message)
            
            if event["type"] == "child_progress":
                job = event["job_id"]
                progress = event["progress"]
                print(f"[{job}] Progress: {progress:.1f}%")
            
            elif event["type"] == "child_completed":
                job = event["job_id"]
                seed = event["seed"]
                image_count = len(event["outputs"]["images"])
                print(f"[{job}] Completed! Seed: {seed}, Images: {image_count}")
            
            elif event["type"] == "child_failed":
                job = event["job_id"]
                error = event["error"]
                print(f"[{job}] Failed: {error}")
            
            elif event["type"] == "group_complete":
                total = event["total"]
                succeeded = event["succeeded"]
                failed = event["failed"]
                print(f"Group complete: {succeeded}/{total} succeeded")
                break


if __name__ == "__main__":
    asyncio.run(submit_with_websocket())
```

### TypeScript/JavaScript Example

```typescript
const ORCHESTRATOR_URL = 'http://localhost:9820';

interface JobGroupRequest {
  workflow_json: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  backend_ids: string[];
  seed_strategy?: 'random' | 'sequential' | 'fibonacci' | 'golden_ratio';
  base_seed?: number;
  metadata?: Record<string, unknown>;
  timeout_seconds?: number;
}

async function submitParallelJob(request: JobGroupRequest): Promise<string> {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/job-group`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to submit job group: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.job_group_id;
}

async function getJobGroupStatus(jobGroupId: string) {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/job-groups/${jobGroupId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to get status: ${response.statusText}`);
  }
  
  return response.json();
}

async function connectJobGroupWebSocket(
  jobGroupId: string,
  handlers: {
    onProgress?: (jobId: string, progress: number) => void;
    onCompleted?: (jobId: string, outputs: any) => void;
    onFailed?: (jobId: string, error: string) => void;
    onGroupComplete?: (stats: any) => void;
  }
): Promise<WebSocket> {
  const wsUrl = ORCHESTRATOR_URL.replace(/^http/, 'ws');
  const ws = new WebSocket(`${wsUrl}/ws/job-groups/${jobGroupId}`);
  
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    
    switch (msg.type) {
      case 'child_progress':
        handlers.onProgress?.(msg.job_id, msg.progress);
        break;
      case 'child_completed':
        handlers.onCompleted?.(msg.job_id, msg.outputs);
        break;
      case 'child_failed':
        handlers.onFailed?.(msg.job_id, msg.error);
        break;
      case 'group_complete':
        handlers.onGroupComplete?.(msg);
        break;
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  return ws;
}

// Usage example
const request: JobGroupRequest = {
  workflow_json: {
    "3": {
      "class_type": "KSampler",
      "inputs": {
        "seed": 42,
        "steps": 20,
        "positive": "A cinematic cityscape"
      }
    }
  },
  backend_ids: ['localhost_8188', '192.168.100.6_8188'],
  seed_strategy: 'random',
  metadata: { panel_id: 3 }
};

const jobGroupId = await submitParallelJob(request);
console.log('Job group ID:', jobGroupId);

// Connect WebSocket for real-time updates
const ws = await connectJobGroupWebSocket(jobGroupId, {
  onProgress: (jobId, progress) => {
    console.log(`[${jobId}] Progress: ${progress.toFixed(1)}%`);
  },
  onCompleted: (jobId, outputs) => {
    console.log(`[${jobId}] Completed with ${outputs.images.length} images`);
  },
  onGroupComplete: (stats) => {
    console.log(`Group complete: ${stats.succeeded}/${stats.total} succeeded`);
    ws.close();
  }
});
```

---

## Related Documentation

- [User Guide](../../docs/MULTI_NODE_GENERATION.md) - End-user documentation
- [Architecture Design](../../plans/multi-node-generation-architecture.md) - Technical design
- [Orchestrator README](../README.md) - Main Orchestrator documentation

---

*Last Updated: February 1, 2026*
*Part of Director's Console - Project Eliot*
