from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
import uuid
from typing import Any, AsyncIterator, Literal

import httpx

logger = logging.getLogger(__name__)

CancellationStatus = Literal["cancelled", "completed", "unconfirmed"]
_CANCEL_RECONCILIATION_ATTEMPTS = 3


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
        """Interrupt the current execution on this backend.

        This is a legacy node-wide operation. Prefer :meth:`cancel_prompt`
        when a prompt ID is available because an unconditional interrupt can
        stop unrelated work.
        """
        response = await self._client.post("/interrupt")
        response.raise_for_status()

    async def cancel_prompt(self, prompt_id: str) -> CancellationStatus:
        """Cancel one prompt and verify the resulting terminal state.

        ComfyUI exposes queued prompts through ``GET /queue``. Pending prompts
        can be removed specifically with ``POST /queue``; running prompts can
        only use the legacy node-wide ``/interrupt`` endpoint. There is an
        unavoidable check/interrupt race on older nodes: another prompt can
        start between those two requests. The post-operation history/queue
        checks therefore treat an HTTP acknowledgement as unconfirmed.

        Args:
            prompt_id: The ComfyUI prompt ID to cancel.

        Returns:
            ``cancelled`` for a confirmed removal/interruption, ``completed``
            when history proves that the prompt finished successfully, or
            ``unconfirmed`` when the request was accepted but its outcome is
            still ambiguous.
        """
        response = await self._client.get("/queue")
        response.raise_for_status()
        queue = response.json()
        initial_status = _queue_status(queue, prompt_id)

        if initial_status == "pending":
            response = await self._client.post(
                "/queue",
                json={"delete": [prompt_id]},
            )
            response.raise_for_status()
            status = await self._reconcile_cancellation(
                prompt_id,
                allow_absent=True,
                interrupt_if_running=True,
            )
            logger.info("Prompt %s queued cancellation result: %s", prompt_id, status)
            return status

        if initial_status == "running":
            logger.warning(
                "Cancelling running prompt %s with legacy node-wide /interrupt; "
                "another prompt could start between queue inspection and interrupt",
                prompt_id,
            )
            await self.interrupt()
            status = await self._reconcile_cancellation(
                prompt_id,
                allow_absent=False,
                interrupt_if_running=False,
            )
            logger.info("Prompt %s running cancellation result: %s", prompt_id, status)
            return status

        # It may have completed just before the initial queue inspection. Do
        # not call /interrupt, and distinguish that from an unconfirmed miss.
        status = await self._reconcile_cancellation(
            prompt_id,
            allow_absent=False,
            interrupt_if_running=False,
        )
        logger.info("Prompt %s was not queued; cancellation result: %s", prompt_id, status)
        return status

    async def _reconcile_cancellation(
        self,
        prompt_id: str,
        *,
        allow_absent: bool,
        interrupt_if_running: bool,
    ) -> CancellationStatus:
        """Bound history/queue races after a delete or interrupt operation."""
        saw_absent = False
        saw_reappearance = False
        saw_history_entry = False
        for _attempt in range(_CANCEL_RECONCILIATION_ATTEMPTS):
            history_status, history = await self._history_cancellation_status(prompt_id)
            if history is not None:
                saw_history_entry = True
            if history_status is not None:
                return history_status

            response = await self._client.get("/queue")
            response.raise_for_status()
            queue = response.json()
            status = _queue_status(queue, prompt_id)
            if status == "running":
                # A later authoritative presence check invalidates an earlier
                # absent observation; the queued removal is unconfirmed.
                saw_reappearance |= saw_absent
                saw_absent = False
                if interrupt_if_running:
                    # Only interrupt after this exact prompt was observed in
                    # queue_running; never infer it from an empty queue.
                    logger.warning(
                        "Queued prompt %s started during cancellation; "
                        "using legacy node-wide /interrupt",
                        prompt_id,
                    )
                    await self.interrupt()
                    return await self._reconcile_cancellation(
                        prompt_id,
                        allow_absent=False,
                        interrupt_if_running=False,
                    )
                continue
            if status == "pending":
                # The prompt reappeared after removal, so it was not cancelled.
                saw_reappearance |= saw_absent
                saw_absent = False
                continue

            saw_absent = True

        # Empty queue plus no history is enough only for a prompt that was
        # explicitly removed from queue. For a running prompt it is ambiguous:
        # it may have completed, been interrupted, or simply disappeared.
        if allow_absent and saw_absent and not saw_reappearance and not saw_history_entry:
            return "cancelled"
        return "unconfirmed"

    async def _history_cancellation_status(
        self,
        prompt_id: str,
    ) -> tuple[CancellationStatus | None, dict[str, Any] | None]:
        """Return a verified terminal result, or ``None`` while it is pending."""
        response = await self._client.get(f"/history/{prompt_id}")
        if response.status_code == 404:
            return None, None
        response.raise_for_status()
        payload = response.json()
        history = payload.get(prompt_id)
        if not isinstance(history, dict):
            return None, None

        status = history.get("status") or {}
        messages = status.get("messages") or []
        for message in messages:
            message_type = message[0] if isinstance(message, list) and message else None
            if message_type == "execution_interrupted":
                # Interruption wins over a stale completed flag.
                return "cancelled", history

        status_string = str(status.get("status_str") or "").lower()
        if status_string in {"error", "failed", "failure", "exception", "execution_error"}:
            return None, history
        if status.get("completed") is True or status_string in {"success", "completed"}:
            return "completed", history
        return None, history

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
        if message_type == "execution_interrupted":
            raise RuntimeError("ComfyUI execution interrupted")
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


def _queue_status(queue: Any, prompt_id: str) -> Literal["running", "pending", "absent"]:
    """Return the exact queue state for one prompt."""
    if not isinstance(queue, dict):
        return "absent"
    if _queue_contains_prompt(queue.get("queue_running", []), prompt_id):
        return "running"
    if _queue_contains_prompt(queue.get("queue_pending", []), prompt_id):
        return "pending"
    return "absent"


def _queue_contains_prompt(entries: Any, prompt_id: str) -> bool:
    """Return whether ComfyUI queue entries contain a prompt ID."""
    if not isinstance(entries, list):
        return False

    for entry in entries:
        if isinstance(entry, dict):
            entry_prompt_id = entry.get("prompt_id")
        elif isinstance(entry, (list, tuple)) and len(entry) > 1:
            entry_prompt_id = entry[1]
        else:
            continue
        if entry_prompt_id is not None and str(entry_prompt_id) == prompt_id:
            return True
    return False


def _maybe_string(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)
