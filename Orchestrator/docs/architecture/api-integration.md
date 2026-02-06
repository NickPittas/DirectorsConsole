# ComfyUI API Integration

This document describes how the orchestrator communicates with ComfyUI instances.

## Overview

Each ComfyUI instance exposes:
- HTTP REST API for queuing prompts, uploading images, downloading results
- WebSocket for real-time progress updates

We use:
- `httpx` for async HTTP requests
- Native `websockets` or `aiohttp` for WebSocket connections

## HTTP API Endpoints

### Queue a Prompt

```http
POST /prompt
Content-Type: application/json

{
  "prompt": { ... },  // API format workflow
  "client_id": "orchestrator-uuid"
}
```

Response:
```json
{
  "prompt_id": "abc123-...",
  "number": 5,
  "node_errors": {}
}
```

### Get Execution History

```http
GET /history/{prompt_id}
```

Response:
```json
{
  "abc123-...": {
    "prompt": [...],
    "outputs": {
      "9": {  // Node ID
        "images": [
          {
            "filename": "ComfyUI_00001_.png",
            "subfolder": "",
            "type": "output"
          }
        ]
      }
    },
    "status": {
      "completed": true,
      "messages": []
    }
  }
}
```

### Download Generated Image

```http
GET /view?filename={filename}&subfolder={subfolder}&type={type}
```

Returns binary image data.

### Upload Input Image

```http
POST /upload/image
Content-Type: multipart/form-data

file: <binary>
overwrite: true
type: input
subfolder: orchestrator
```

Response:
```json
{
  "name": "uploaded_image.png",
  "subfolder": "orchestrator",
  "type": "input"
}
```

### Get Available Nodes

```http
GET /object_info
```

Response:
```json
{
  "KSampler": {
    "input": {
      "required": {
        "model": ["MODEL"],
        "seed": ["INT", {"default": 0, "min": 0, "max": 18446744073709551615}],
        "steps": ["INT", {"default": 20, "min": 1, "max": 10000}],
        ...
      }
    },
    "output": ["LATENT"],
    "output_name": ["LATENT"],
    "name": "KSampler",
    "category": "sampling"
  },
  ...
}
```

### Interrupt Current Execution

```http
POST /interrupt
```

### Free Memory

```http
POST /free
Content-Type: application/json

{
  "unload_models": true,
  "free_memory": true
}
```

### Get System Stats

```http
GET /system_stats
```

Response:
```json
{
  "system": {
    "os": "nt",
    "python_version": "3.10.6",
    "pytorch_version": "2.0.1"
  },
  "devices": [
    {
      "name": "cuda:0",
      "type": "cuda",
      "vram_total": 25757220864,
      "vram_free": 20000000000
    }
  ]
}
```

## WebSocket Protocol

### Connection

```
ws://{host}:{port}/ws?clientId={client_id}
```

### Message Types

#### Status Update
```json
{
  "type": "status",
  "data": {
    "status": {
      "exec_info": {
        "queue_remaining": 2
      }
    },
    "sid": "client-id"
  }
}
```

#### Execution Started
```json
{
  "type": "execution_start",
  "data": {
    "prompt_id": "abc123-..."
  }
}
```

#### Node Executing
```json
{
  "type": "executing",
  "data": {
    "node": "3",  // Node ID being executed
    "prompt_id": "abc123-..."
  }
}
```

When `node` is `null`, execution is complete:
```json
{
  "type": "executing",
  "data": {
    "node": null,
    "prompt_id": "abc123-..."
  }
}
```

#### Progress Update
```json
{
  "type": "progress",
  "data": {
    "value": 15,
    "max": 30,
    "prompt_id": "abc123-...",
    "node": "3"
  }
}
```

#### Node Executed (with outputs)
```json
{
  "type": "executed",
  "data": {
    "node": "9",
    "output": {
      "images": [
        {"filename": "ComfyUI_00001_.png", "subfolder": "", "type": "output"}
      ]
    },
    "prompt_id": "abc123-..."
  }
}
```

#### Execution Error
```json
{
  "type": "execution_error",
  "data": {
    "prompt_id": "abc123-...",
    "node_id": "3",
    "node_type": "KSampler",
    "exception_message": "CUDA out of memory",
    "exception_type": "RuntimeError",
    "traceback": ["..."]
  }
}
```

## Workflow Format Conversion

ComfyUI uses two different JSON formats:

### Workflow Format (from "Save" button)

This format includes visual layout information and uses positional arrays for widget values:

```json
{
  "last_node_id": 9,
  "last_link_id": 7,
  "nodes": [
    {
      "id": 3,
      "type": "KSampler",
      "pos": [863, 186],
      "size": {"0": 315, "1": 262},
      "flags": {},
      "order": 4,
      "mode": 0,
      "inputs": [
        {"name": "model", "type": "MODEL", "link": 1},
        {"name": "positive", "type": "CONDITIONING", "link": 4},
        {"name": "negative", "type": "CONDITIONING", "link": 6},
        {"name": "latent_image", "type": "LATENT", "link": 2}
      ],
      "outputs": [
        {"name": "LATENT", "type": "LATENT", "links": [7], "slot_index": 0}
      ],
      "properties": {"Node name for S&R": "KSampler"},
      "widgets_values": [42, "fixed", 20, 8, "euler", "normal", 1]
    }
  ],
  "links": [
    [1, 4, 0, 3, 0, "MODEL"],
    [2, 5, 0, 3, 3, "LATENT"],
    ...
  ],
  "extra": {}
}
```

### API Format (for /prompt endpoint)

This format is flat and uses named inputs:

```json
{
  "3": {
    "class_type": "KSampler",
    "inputs": {
      "seed": 42,
      "control_after_generate": "fixed",
      "steps": 20,
      "cfg": 8,
      "sampler_name": "euler",
      "scheduler": "normal",
      "denoise": 1,
      "model": ["4", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0]
    },
    "_meta": {
      "title": "KSampler"
    }
  },
  "4": {
    "class_type": "CheckpointLoaderSimple",
    "inputs": {
      "ckpt_name": "v1-5-pruned.safetensors"
    },
    "_meta": {
      "title": "Load Checkpoint"
    }
  }
}
```

### Conversion Logic

The conversion from workflow to API format:

```python
def convert_workflow_to_api(workflow_json: dict) -> dict:
    """
    Convert workflow format to API format.
    
    Adapted from Comfyui_api_client reference.
    """
    api_json = {}
    
    # Build link map: link_id -> (source_node, source_slot)
    link_map = {}
    for link in workflow_json.get("links", []):
        # link format: [link_id, source_node, source_slot, target_node, target_slot, type]
        link_id, source_node, source_slot = link[0], link[1], link[2]
        link_map[link_id] = (str(source_node), source_slot)
    
    # Widget input names per node type (from object_info)
    # This needs to be fetched from ComfyUI or cached
    widget_mappings = get_widget_mappings()
    
    for node in workflow_json.get("nodes", []):
        node_id = str(node["id"])
        node_type = node["type"]
        
        api_node = {
            "class_type": node_type,
            "inputs": {},
            "_meta": {
                "title": node.get("properties", {}).get("Node name for S&R", node_type)
            }
        }
        
        # Map widget values to named inputs
        widget_values = node.get("widgets_values", [])
        widget_names = widget_mappings.get(node_type, [])
        
        for i, value in enumerate(widget_values):
            if i < len(widget_names):
                input_name = widget_names[i]
                api_node["inputs"][input_name] = value
        
        # Map linked inputs
        for input_def in node.get("inputs", []):
            input_name = input_def["name"]
            link_id = input_def.get("link")
            
            if link_id is not None and link_id in link_map:
                source_node, source_slot = link_map[link_id]
                api_node["inputs"][input_name] = [source_node, source_slot]
        
        api_json[node_id] = api_node
    
    return api_json
```

## Backend Client Implementation

```python
import httpx
import asyncio
from typing import AsyncIterator
import json

class ComfyUIClient:
    """
    Async client for a single ComfyUI instance.
    
    Example usage:
        async with ComfyUIClient("192.168.1.100", 8188) as client:
            prompt_id = await client.queue_prompt(api_json)
            async for progress in client.monitor_progress(prompt_id):
                print(f"Progress: {progress.percent}%")
            result = await client.get_result(prompt_id)
    """
    
    def __init__(self, host: str, port: int = 8188):
        self.host = host
        self.port = port
        self.base_url = f"http://{host}:{port}"
        self.ws_url = f"ws://{host}:{port}/ws"
        self.client_id = str(uuid.uuid4())
        self._http_client: httpx.AsyncClient | None = None
        self._ws_connection = None
    
    async def __aenter__(self):
        self._http_client = httpx.AsyncClient(timeout=30.0)
        return self
    
    async def __aexit__(self, *args):
        if self._http_client:
            await self._http_client.aclose()
        if self._ws_connection:
            await self._ws_connection.close()
    
    async def health_check(self) -> bool:
        """Check if backend is reachable."""
        try:
            response = await self._http_client.get(
                f"{self.base_url}/system_stats",
                timeout=5.0
            )
            return response.status_code == 200
        except Exception:
            return False
    
    async def queue_prompt(self, api_json: dict) -> str:
        """Queue a prompt for execution."""
        response = await self._http_client.post(
            f"{self.base_url}/prompt",
            json={
                "prompt": api_json,
                "client_id": self.client_id
            }
        )
        response.raise_for_status()
        data = response.json()
        
        if data.get("node_errors"):
            raise WorkflowValidationError(data["node_errors"])
        
        return data["prompt_id"]
    
    async def monitor_progress(
        self, 
        prompt_id: str
    ) -> AsyncIterator[ProgressUpdate]:
        """
        Monitor execution progress via WebSocket.
        
        Yields ProgressUpdate objects until execution completes.
        """
        import websockets
        
        async with websockets.connect(
            f"{self.ws_url}?clientId={self.client_id}"
        ) as ws:
            async for message in ws:
                data = json.loads(message)
                msg_type = data.get("type")
                msg_data = data.get("data", {})
                
                # Filter for our prompt
                if msg_data.get("prompt_id") != prompt_id:
                    continue
                
                if msg_type == "progress":
                    yield ProgressUpdate(
                        percent=(msg_data["value"] / msg_data["max"]) * 100,
                        current_step=f"{msg_data['value']}/{msg_data['max']}",
                        node_id=msg_data.get("node")
                    )
                
                elif msg_type == "executing":
                    if msg_data.get("node") is None:
                        # Execution complete
                        return
                    yield ProgressUpdate(
                        node_id=msg_data["node"],
                        status="executing"
                    )
                
                elif msg_type == "execution_error":
                    raise ExecutionError(
                        node_id=msg_data["node_id"],
                        message=msg_data["exception_message"],
                        traceback=msg_data.get("traceback", [])
                    )
    
    async def get_history(self, prompt_id: str) -> dict:
        """Get execution history/results."""
        response = await self._http_client.get(
            f"{self.base_url}/history/{prompt_id}"
        )
        response.raise_for_status()
        return response.json().get(prompt_id, {})
    
    async def download_image(
        self, 
        filename: str, 
        subfolder: str = "", 
        image_type: str = "output"
    ) -> bytes:
        """Download a generated image."""
        response = await self._http_client.get(
            f"{self.base_url}/view",
            params={
                "filename": filename,
                "subfolder": subfolder,
                "type": image_type
            }
        )
        response.raise_for_status()
        return response.content
    
    async def upload_image(
        self, 
        image_path: str | Path,
        subfolder: str = "orchestrator"
    ) -> str:
        """Upload an image for use in workflows."""
        path = Path(image_path)
        
        with open(path, "rb") as f:
            response = await self._http_client.post(
                f"{self.base_url}/upload/image",
                files={"image": (path.name, f, "image/png")},
                data={
                    "overwrite": "true",
                    "type": "input",
                    "subfolder": subfolder
                }
            )
        
        response.raise_for_status()
        data = response.json()
        
        # Return the path as ComfyUI expects it
        if data["subfolder"]:
            return f"{data['subfolder']}/{data['name']}"
        return data["name"]
    
    async def interrupt(self):
        """Interrupt current execution."""
        await self._http_client.post(f"{self.base_url}/interrupt")
    
    async def free_memory(self):
        """Free GPU memory."""
        await self._http_client.post(
            f"{self.base_url}/free",
            json={"unload_models": True, "free_memory": True}
        )
    
    async def get_system_stats(self) -> SystemStats:
        """Get system statistics including GPU info."""
        response = await self._http_client.get(
            f"{self.base_url}/system_stats"
        )
        response.raise_for_status()
        data = response.json()
        
        device = data["devices"][0] if data["devices"] else {}
        
        return SystemStats(
            gpu_name=device.get("name", "Unknown"),
            vram_total=device.get("vram_total", 0) // (1024 * 1024),  # Convert to MB
            vram_free=device.get("vram_free", 0) // (1024 * 1024)
        )
```

## Metrics Agent Custom Node

For metrics not exposed by the standard API (like CPU usage, temperature), we create a custom node to install on each ComfyUI instance:

```python
# agents/metrics_agent/nodes.py

import psutil
from aiohttp import web

# Try to import pynvml for NVIDIA GPU metrics
try:
    import pynvml
    pynvml.nvmlInit()
    HAS_NVIDIA = True
except:
    HAS_NVIDIA = False


def get_metrics() -> dict:
    """Collect system metrics."""
    metrics = {
        "cpu_utilization": psutil.cpu_percent(),
        "ram_total": psutil.virtual_memory().total // (1024 * 1024),
        "ram_used": psutil.virtual_memory().used // (1024 * 1024),
    }
    
    if HAS_NVIDIA:
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        
        metrics["gpu_name"] = pynvml.nvmlDeviceGetName(handle)
        
        memory = pynvml.nvmlDeviceGetMemoryInfo(handle)
        metrics["gpu_memory_total"] = memory.total // (1024 * 1024)
        metrics["gpu_memory_used"] = memory.used // (1024 * 1024)
        
        utilization = pynvml.nvmlDeviceGetUtilizationRates(handle)
        metrics["gpu_utilization"] = utilization.gpu
        
        metrics["gpu_temperature"] = pynvml.nvmlDeviceGetTemperature(
            handle, pynvml.NVML_TEMPERATURE_GPU
        )
    
    return metrics


# Register API route with ComfyUI's server
# This is called during node package initialization
def setup_routes(app: web.Application):
    async def metrics_handler(request):
        return web.json_response(get_metrics())
    
    app.router.add_get("/orchestrator/metrics", metrics_handler)


# Node class required by ComfyUI
class OrchestratorMetrics:
    """Placeholder node - actual functionality is the API endpoint."""
    
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}
    
    RETURN_TYPES = ()
    FUNCTION = "run"
    CATEGORY = "orchestrator"
    
    def run(self):
        return ()


NODE_CLASS_MAPPINGS = {
    "OrchestratorMetrics": OrchestratorMetrics
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "OrchestratorMetrics": "Orchestrator Metrics Agent"
}

WEB_DIRECTORY = None
```

Installation on each ComfyUI instance:
```bash
cd ComfyUI/custom_nodes
git clone <orchestrator-repo>/agents/metrics_agent
pip install psutil pynvml
# Restart ComfyUI
```

The orchestrator then polls `/orchestrator/metrics` periodically for each backend.
