from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
import uuid
from typing import Any, AsyncIterator

import httpx

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ImageOutput:
    filename: str
    subfolder: str
    image_type: str


@dataclass(frozen=True)
class ProgressUpdate:
    percent: float | None
    node_id: str | None = None
    status: str | None = None
    current_step: str | None = None


class ComfyUIClient:
    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 8188,
        timeout: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if host.startswith("http://") or host.startswith("https://"):
            base_url = host
        else:
            base_url = f"http://{host}:{port}"
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=self._timeout,
            transport=transport,
        )
        self._client_id = str(uuid.uuid4())

    async def __aenter__(self) -> "ComfyUIClient":
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit - close the client."""
        await self.close()

    def _ws_url(self) -> str:
        if self._base_url.startswith("https://"):
            return self._base_url.replace("https://", "wss://", 1) + "/ws"
        return self._base_url.replace("http://", "ws://", 1) + "/ws"

    def _view_url(self, filename: str, subfolder: str, image_type: str) -> str:
        return f"{self._base_url}/view"

    async def close(self) -> None:
        await self._client.aclose()

    async def health_check(self) -> bool:
        try:
            response = await self._client.get("/system_stats")
        except httpx.HTTPError:
            return False
        return response.status_code == 200

    async def queue_prompt(self, api_json: dict) -> str:
        response = await self._client.post(
            "/prompt",
            json={"prompt": api_json, "client_id": self._client_id},
        )
        # Log error details before raising
        if response.status_code >= 400:
            try:
                error_payload = response.json()
                logger.error(f"ComfyUI queue_prompt failed ({response.status_code}): {error_payload}")
            except (json.JSONDecodeError, ValueError):
                logger.error(f"ComfyUI queue_prompt failed ({response.status_code}): {response.text}")
        response.raise_for_status()
        payload = response.json()
        node_errors = payload.get("node_errors")
        if node_errors:
            raise ValueError(f"ComfyUI node errors: {node_errors}")
        prompt_id = payload.get("prompt_id")
        if not prompt_id:
            raise ValueError("ComfyUI did not return a prompt_id")
        return str(prompt_id)

    async def get_history(self, prompt_id: str) -> dict:
        response = await self._client.get(f"/history/{prompt_id}")
        response.raise_for_status()
        payload = response.json()
        return payload.get(prompt_id, {})

    async def download_image(
        self,
        filename: str,
        subfolder: str = "",
        image_type: str = "output",
    ) -> bytes:
        response = await self._client.get(
            self._view_url(filename, subfolder, image_type),
            params={"filename": filename, "subfolder": subfolder, "type": image_type},
        )
        response.raise_for_status()
        return response.content

    def download_outputs(self, history: dict) -> list[ImageOutput]:
        outputs: list[ImageOutput] = []
        for node in history.get("outputs", {}).values():
            for image in node.get("images", []):
                outputs.append(
                    ImageOutput(
                        filename=image["filename"],
                        subfolder=image.get("subfolder", ""),
                        image_type=image.get("type", "output"),
                    )
                )
        return outputs

    async def upload_image(self, image_path: str) -> str:
        """Upload an image to ComfyUI and return the filename reference.

        Args:
            image_path: Local path to the image file

        Returns:
            The filename to use in workflow (e.g., "orchestrator/uploaded_image.png")
            This format is what ComfyUI's LoadImage node expects.

        Raises:
            FileNotFoundError: If the image file doesn't exist
            httpx.HTTPStatusError: If the upload fails
        """
        path = Path(image_path)
        if not path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")

        files = {"image": (path.name, path.read_bytes(), "image/png")}
        response = await self._client.post(
            "/upload/image",
            files=files,
            data={"overwrite": "true", "type": "input", "subfolder": "orchestrator"},
        )
        response.raise_for_status()
        payload = response.json()
        name = payload.get("name")
        subfolder = payload.get("subfolder")
        if subfolder:
            return f"{subfolder}/{name}"
        return str(name)

    async def interrupt(self) -> None:
        response = await self._client.post("/interrupt")
        response.raise_for_status()

    async def free_memory(self) -> None:
        response = await self._client.post(
            "/free",
            json={"unload_models": True, "free_memory": True},
        )
        response.raise_for_status()

    async def get_system_stats(self) -> dict[str, Any]:
        """Get system statistics including GPU info.

        Returns:
            Dict with system info and devices array containing VRAM data.

        Example response:
            {
                "system": {"os": "nt", "python_version": "3.10.6"},
                "devices": [
                    {
                        "name": "cuda:0",
                        "vram_total": 25757220864,
                        "vram_free": 20000000000
                    }
                ]
            }
        """
        response = await self._client.get("/system_stats")
        response.raise_for_status()
        return response.json()

    async def get_metrics_agent(self) -> dict[str, Any] | None:
        """Get metrics from orchestrator metrics agent custom node.

        Returns:
            Dict with CPU/GPU utilization, temperature, RAM usage.
            Returns None if metrics agent is not installed.

        Example response:
            {
                "cpu_utilization": 25.5,
                "gpu_utilization": 45.0,
                "gpu_temperature": 65,
                "ram_total": 32768,
                "ram_used": 16384
            }
        """
        try:
            response = await self._client.get("/orchestrator/metrics")
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError:
            return None

    async def get_object_info(self, node_type: str | None = None) -> dict[str, Any]:
        """Get object_info for all nodes or a specific node type.

        The object_info endpoint provides metadata about all available ComfyUI
        nodes including their input types, widget configurations, and constraints.

        Args:
            node_type: Optional specific node type to fetch. If None, returns all.

        Returns:
            Dict mapping node type names to their definitions.
            Each definition includes 'input' with 'required' and 'optional' fields.

        Example response for CLIPTextEncode:
            {
                "CLIPTextEncode": {
                    "input": {
                        "required": {
                            "text": ["STRING", {"multiline": true, "dynamicPrompts": true}],
                            "clip": ["CLIP"]
                        }
                    },
                    "output": ["CONDITIONING"],
                    "output_name": ["CONDITIONING"]
                }
            }
        """
        if node_type:
            response = await self._client.get(f"/object_info/{node_type}")
        else:
            response = await self._client.get("/object_info")
        response.raise_for_status()
        return response.json()

    async def get_queue_status(self) -> dict[str, Any]:
        """Get current queue status.

        Returns:
            Dict with exec_info containing queue_remaining count.

        Example response:
            {"exec_info": {"queue_remaining": 2}}
        """
        # ComfyUI exposes queue via WebSocket status messages
        # For HTTP, we can use /queue endpoint if available
        try:
            response = await self._client.get("/queue")
            if response.status_code == 200:
                data = response.json()
                # Convert queue format to status format
                running = data.get("queue_running", [])
                pending = data.get("queue_pending", [])
                return {"exec_info": {"queue_remaining": len(running) + len(pending)}}
        except httpx.HTTPError:
            pass
        return {"exec_info": {"queue_remaining": 0}}

    async def monitor_progress(self, prompt_id: str) -> AsyncIterator[ProgressUpdate]:
        async for message_type, message_data in self._stream_ws(prompt_id):
            if message_type == "executing" and message_data.get("node") is None:
                return
            update = self._progress_update(message_type, message_data)
            if update is not None:
                yield update

    def _progress_percent(self, value: float, max_value: float) -> float:
        if max_value == 0:
            return 0.0
        return (value / max_value) * 100

    def _progress_update(
        self, message_type: str, message_data: dict[str, Any]
    ) -> ProgressUpdate | None:
        if message_type == "progress":
            value = message_data.get("value")
            max_value = message_data.get("max")
            if value is None or max_value is None:
                return None
            return ProgressUpdate(
                percent=self._progress_percent(float(value), float(max_value)),
                current_step=f"{value}/{max_value}",
                node_id=_maybe_string(message_data.get("node")),
            )
        if message_type == "executing":
            node_id = message_data.get("node")
            if node_id is None:
                return None
            return ProgressUpdate(
                percent=None,
                node_id=_maybe_string(node_id),
                status="executing",
            )
        if message_type == "execution_error":
            node_id = _maybe_string(message_data.get("node_id"))
            error = message_data.get("exception_message", "Execution error")
            raise RuntimeError(f"ComfyUI execution error at node {node_id}: {error}")
        return None

    async def _stream_ws(
        self, prompt_id: str
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        import json
        import importlib

        websockets = importlib.import_module("websockets")

        ws_url = f"{self._ws_url()}?clientId={self._client_id}"
        logger.info(f"Connecting to WebSocket: {ws_url}")
        async with websockets.connect(ws_url) as socket:
            logger.info(f"WebSocket connected, waiting for messages (prompt_id={prompt_id})")
            async for raw_message in socket:
                # Handle binary vs text messages
                # ComfyUI sends binary data for image previews, text JSON for status
                if isinstance(raw_message, bytes):
                    # Try to decode as UTF-8 text first (most JSON messages)
                    try:
                        raw_message = raw_message.decode('utf-8')
                    except UnicodeDecodeError:
                        # Binary image data - skip it
                        logger.debug("Skipping binary WebSocket message (likely image preview)")
                        continue
                
                # Skip empty or whitespace-only messages
                if not raw_message or not raw_message.strip():
                    continue
                
                try:
                    payload = json.loads(raw_message)
                except json.JSONDecodeError as e:
                    logger.warning(f"Skipping non-JSON WebSocket message: {e}")
                    continue
                message_type = payload.get("type")
                message_data = payload.get("data", {})
                
                # Debug: log all messages
                msg_prompt_id = message_data.get("prompt_id")
                logger.debug(f"WS message: type={message_type}, prompt_id={msg_prompt_id}, data_keys={list(message_data.keys())}")
                
                if msg_prompt_id != prompt_id:
                    # Log when we skip a message
                    if msg_prompt_id is not None:
                        logger.debug(f"  Skipping: prompt_id {msg_prompt_id} != {prompt_id}")
                    continue
                    
                logger.info(f"WS message matched: type={message_type}, data={message_data}")
                if message_type is None:
                    continue
                yield message_type, message_data


def _maybe_string(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)
