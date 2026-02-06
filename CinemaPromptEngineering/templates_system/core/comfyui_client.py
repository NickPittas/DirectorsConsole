"""ComfyUI client for Storyboard Maker.

HTTP client for communicating with ComfyUI's REST API.
"""

import copy
import json
import logging
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Union
from urllib.parse import urljoin

import requests

from ..config import Config

logger = logging.getLogger(__name__)


class ComfyUIError(Exception):
    """Base exception for ComfyUI-related errors."""
    pass


class ComfyUIConnectionError(ComfyUIError):
    """Raised when connection to ComfyUI fails."""
    pass


class ComfyUITimeoutError(ComfyUIError):
    """Raised when a request times out."""
    pass


class ComfyUIWorkflowError(ComfyUIError):
    """Raised when workflow execution fails."""
    pass


@dataclass
class GenerationProgress:
    """Tracks the progress of a generation job.

    Attributes:
        prompt_id: The prompt ID for tracking.
        status: Current status string.
        progress: Progress percentage (0-100).
        message: Status message.
    """
    prompt_id: str
    status: str = ""
    progress: float = 0.0
    message: str = ""


@dataclass
class GenerationResult:
    """Result of a generation job.

    Attributes:
        prompt_id: The prompt ID.
        status: Final status.
        images: List of generated image paths.
        error: Error message if failed.
    """
    prompt_id: str
    status: str
    images: list[Path] | None = None
    error: str | None = None


class ComfyUIClient:
    """HTTP client for ComfyUI API communication.

    Provides methods for checking availability, submitting workflows,
    and retrieving results.

    Attributes:
        server_url: ComfyUI server URL.
        timeout: Request timeout in seconds.
        max_retries: Maximum number of retry attempts.
        session: HTTP session for connection pooling.
        log_callback: Optional callback for sending logs to UI.
    """
    
    # Class-level log callback that can be set by the main window
    _log_callback = None
    
    @classmethod
    def set_log_callback(cls, callback) -> None:
        """Set a callback function for logging ComfyUI messages.
        
        Args:
            callback: Function that takes (level: str, message: str)
                     Level can be 'info', 'warning', 'error', 'comfyui'
        """
        cls._log_callback = callback
    
    def _log(self, level: str, message: str) -> None:
        """Log a message both to Python logging and UI callback.
        
        Args:
            level: Log level ('info', 'warning', 'error', 'comfyui')
            message: Message to log
        """
        # Log to Python logger
        if level == 'error':
            logger.error(message)
        elif level == 'warning':
            logger.warning(message)
        else:
            logger.info(message)
        
        # Send to UI callback if set
        if self._log_callback:
            try:
                self._log_callback(level, message)
            except Exception:
                pass  # Don't let callback errors break the client

    def __init__(
        self,
        config: Config | None = None,
        server_url: str | None = None,
        timeout: int | None = None,
        max_retries: int | None = None,
        username: str | None = None,
        password: str | None = None,
    ) -> None:
        """Initialize the ComfyUI client.

        Args:
            config: Configuration instance. If None, uses defaults.
            server_url: Optional server URL override.
            timeout: Optional timeout override.
            max_retries: Optional max retries override.
            username: Optional username for authentication.
            password: Optional password for authentication.
        """
        self.config = config  # Store config for output path access

        if config is None:
            self.server_url = server_url or "http://127.0.0.1:8188"
            self.timeout = timeout or 120
            self.max_retries = max_retries or 3
            self.username = username or ""
            self.password = password or ""
        else:
            self.server_url = server_url or config.get_server_url()
            self.timeout = timeout or config.get_timeout()
            self.max_retries = max_retries or config.get_max_retries()
            self.username = username if username is not None else config.get_comfyui_username()
            self.password = password if password is not None else config.get_comfyui_password()

        self.session = requests.Session()
        
        # Set up authentication if credentials provided
        if self.username and self.password:
            self.session.auth = (self.username, self.password)
        
        self._client_id = str(uuid.uuid4())  # Generate unique client ID for API

    def _build_url(self, endpoint: str) -> str:
        base = self.server_url.rstrip("/") + "/"
        return urljoin(base, endpoint.lstrip("/"))

    def is_available(self) -> bool:
        """Check if ComfyUI server is available.

        Returns:
            True if server responds successfully.
        """
        try:
            response = self.session.get(
                self._build_url("/system_stats"),
                timeout=10,
            )
            return response.status_code == 200
        except requests.RequestException:
            return False

    def get_system_stats(self) -> dict[str, Any]:
        """Get ComfyUI system statistics.

        Returns:
            Dictionary containing system stats.

        Raises:
            ComfyUIConnectionError: If server is unavailable.
        """
        response = self._request("GET", "/system_stats")
        return response.json()

    def submit_workflow(
        self,
        workflow: dict[str, Any],
        files: dict[str, Path] | None = None,
    ) -> str:
        """Submit a workflow for execution.

        Args:
            workflow: ComfyUI workflow dictionary.
            files: Optional dictionary of file paths to upload.

        Returns:
            Prompt ID for tracking the job.

        Raises:
            ComfyUIError: If submission fails.
        """
        # Deep copy to avoid modifying the original
        workflow_copy = copy.deepcopy(workflow)

        # Build clean workflow - keep all node keys as strings
        # ComfyUI's API format expects string keys for node IDs
        clean_workflow: dict[str, Any] = {}
        
        for key, value in workflow_copy.items():
            # Skip meta and other non-node keys
            if key in ("meta", "version", "client_version", "nodes"):
                continue
            # Only include dicts with "inputs" (actual nodes)
            if isinstance(value, dict) and "inputs" in value:
                # Keep key as string - ComfyUI expects string node IDs
                clean_workflow[str(key)] = value

        # Ensure all node references in inputs are also strings
        for node_id, node in clean_workflow.items():
            if "inputs" in node:
                for input_name, input_value in node["inputs"].items():
                    # Check if this is a node reference [node_id, output_index]
                    if isinstance(input_value, list) and len(input_value) == 2:
                        ref_node = input_value[0]
                        # Ensure reference node ID is a string
                        if isinstance(ref_node, (int, float)):
                            node["inputs"][input_name] = [str(int(ref_node)), input_value[1]]

        # If no nodes found, try original workflow
        if not clean_workflow:
            logger.warning("No valid nodes found, using original workflow")
            for key, value in workflow_copy.items():
                if key in ("meta", "version", "client_version"):
                    continue
                if isinstance(value, dict) and "inputs" in value:
                    clean_workflow[str(key)] = value

        # Log submission details
        self._log('comfyui', f"Submitting workflow with {len(clean_workflow)} nodes")

        # Log key parameters being sent
        for node_id, node in clean_workflow.items():
            inputs = node.get("inputs", {})
            class_type = node.get("class_type", "Unknown")
            
            # Log interesting node types
            if class_type in ["KSampler", "KSamplerAdvanced", "SamplerCustom"]:
                seed = inputs.get("seed", "N/A")
                steps = inputs.get("steps", "N/A")
                cfg = inputs.get("cfg", "N/A")
                self._log('comfyui', f"  Sampler node {node_id}: seed={seed}, steps={steps}, cfg={cfg}")
            elif "text" in inputs and inputs.get("text"):
                text_preview = inputs["text"][:60] + "..." if len(inputs["text"]) > 60 else inputs["text"]
                self._log('comfyui', f"  Text node {node_id}: {repr(text_preview)}")
            elif class_type in ["LoadImage", "LoadImageMask"]:
                image = inputs.get("image", "N/A")
                self._log('comfyui', f"  LoadImage node {node_id}: {image}")

        payload: dict[str, Any] = {"prompt": clean_workflow}

        if files:
            multipart_data = self._prepare_multipart(clean_workflow, files)
            response = self._request(
                "POST",
                "/upload",
                files=multipart_data,
            )
            # Update workflow with uploaded file paths
            self._apply_uploaded_files(clean_workflow, response.json())

        # Prepare the payload for ComfyUI
        payload = {
            "prompt": clean_workflow,
            "client_id": self._client_id,
        }

        if logger.isEnabledFor(logging.DEBUG):
            import json as _json
            import tempfile as _tempfile
            from pathlib import Path as _Path
            debug_path = _Path(_tempfile.gettempdir()) / "comfyui_payload_debug.json"
            with open(debug_path, "w") as f:
                _json.dump(payload, f, indent=2, default=str)

        response = self._request("POST", "/prompt", json=payload)
        
        # Handle empty response
        if not response.text or not response.text.strip():
            self._log('error', f"Empty response from ComfyUI server")
            raise ComfyUIWorkflowError("Empty response from ComfyUI server")
        
        try:
            result = response.json()
        except json.JSONDecodeError as e:
            self._log('error', f"Invalid JSON response: {response.text[:200]}")
            raise ComfyUIWorkflowError(f"Invalid JSON response from server: {e}") from e

        if "prompt_id" not in result:
            self._log('error', f"Invalid response from server: {result}")
            raise ComfyUIWorkflowError(
                f"Invalid response from server: {result}"
            )

        prompt_id = result["prompt_id"]
        self._log('comfyui', f"✓ Workflow queued: {prompt_id[:8]}...")
        return prompt_id

    def _prepare_multipart(
        self,
        workflow: dict[str, Any],
        files: dict[str, Path],
    ) -> dict[str, Any]:
        """Prepare multipart form data for file uploads.

        Args:
            workflow: Workflow dictionary (modified in place).
            files: Dictionary mapping input names to file paths.

        Returns:
            Dictionary for multipart form submission.
        """
        multipart: dict[str, Any] = {}

        for input_name, file_path in files.items():
            if file_path.exists():
                multipart[input_name] = (
                    file_path.name,
                    open(file_path, "rb"),
                    "image/*",
                )

        return multipart

    def _apply_uploaded_files(
        self,
        workflow: dict[str, Any],
        upload_result: dict[str, Any],
    ) -> None:
        """Apply uploaded file paths to workflow inputs.

        Args:
            workflow: Workflow dictionary (modified in place).
            upload_result: Response from upload API.
        """
        # This is a placeholder - actual implementation depends on
        # how ComfyUI handles file uploads
        pass

    def get_history(self, prompt_id: str) -> dict[str, Any]:
        """Get the history of a prompt.

        Args:
            prompt_id: The prompt ID to check.

        Returns:
            Dictionary containing prompt history.
        """
        response = self._request("GET", f"/history/{prompt_id}")
        return response.json()

    def get_images(
        self,
        prompt_id: str,
        node_id: str,
        output_dir: Path,
    ) -> list[Path]:
        """Get generated images from a completed prompt.

        Args:
            prompt_id: The prompt ID.
            node_id: Node ID to get images from.
            output_dir: Directory to save images.

        Returns:
            List of paths to downloaded images.

        Raises:
            ComfyUIError: If retrieval fails.
        """
        response = self._request("GET", f"/view/{prompt_id}/{node_id}")
        output_dir.mkdir(parents=True, exist_ok=True)

        images: list[Path] = []
        for filename, content in response.json().items():
            output_path = output_dir / filename
            with open(output_path, "wb") as f:
                f.write(content.encode())
            images.append(output_path)

        return images

    def get_progress(self, prompt_id: str) -> GenerationProgress:
        """Get the progress of a running job.

        Args:
            prompt_id: The prompt ID to check.

        Returns:
            GenerationProgress with current status.
        """
        history = self.get_history(prompt_id)

        if prompt_id not in history:
            return GenerationProgress(
                prompt_id=prompt_id,
                status="unknown",
                progress=0.0,
                message="Waiting in queue...",
            )

        prompt_data = history[prompt_id]
        status = prompt_data.get("status", {}).get("status", "unknown")

        # Calculate progress percentage
        progress_obj = prompt_data.get("status", {}).get("progress", {})
        progress = 0.0

        if "value" in progress_obj and "max" in progress_obj:
            progress = (float(progress_obj["value"]) / float(progress_obj["max"])) * 100
        elif "value" in progress_obj:
            progress = float(progress_obj["value"])

        # Get detailed status message
        messages = []
        msg = prompt_data.get("status", {}).get("msg", "")
        if msg:
            messages.append(msg)

        # Check for node executions
        node_count = 0
        if "outputs" in prompt_data:
            node_count = len(prompt_data["outputs"])
            messages.append(f"Nodes executed: {node_count}")

        # Check for queued nodes
        if "prompt" in prompt_data:
            prompt_workflow = prompt_data["prompt"]
            if isinstance(prompt_workflow, dict):
                queued_nodes = len(prompt_workflow) - node_count if "outputs" in prompt_data else len(prompt_workflow)
                if queued_nodes > 0:
                    messages.append(f"Queued nodes: {queued_nodes}")

        status_message = " | ".join(messages) if messages else status.title()

        return GenerationProgress(
            prompt_id=prompt_id,
            status=status,
            progress=progress,
            message=status_message,
        )

    def wait_for_completion(
        self,
        prompt_id: str,
        poll_interval: float = 1.0,
        cancel_flag: bool = False,
    ) -> GenerationResult:
        """Wait for a workflow to complete.

        Args:
            prompt_id: The prompt ID to wait for.
            poll_interval: Seconds between status checks.
            cancel_flag: If True, cancel the generation and return.

        Returns:
            GenerationResult with final status and images.

        Raises:
            ComfyUITimeoutError: If polling times out.
        """
        start_time = time.time()

        while True:
            if cancel_flag:
                # Attempt to interrupt the generation
                self.interrupt()
                return GenerationResult(
                    prompt_id=prompt_id,
                    status="cancelled",
                    images=None,
                    error="Generation cancelled by user",
                )

            if time.time() - start_time > self.timeout:
                raise ComfyUITimeoutError(
                    f"Generation timed out after {self.timeout} seconds"
                )

            progress = self.get_progress(prompt_id)

            if progress.status in ("completed", "failed"):
                history = self.get_history(prompt_id)
                prompt_data = history.get(prompt_id, {})

                if progress.status == "completed":
                    # Find output nodes and get images
                    # Use config output_dir if available, otherwise fall back to relative path
                    if self.config:
                        base_output_dir = self.config.get_output_dir()
                    else:
                        base_output_dir = Path("output")
                    output_dir = base_output_dir / prompt_id
                    output_dir.mkdir(parents=True, exist_ok=True)

                    images = self._get_output_images(
                        prompt_id, prompt_data, output_dir
                    )

                    return GenerationResult(
                        prompt_id=prompt_id,
                        status="completed",
                        images=images,
                    )
                else:
                    error = prompt_data.get("status", {}).get("err", "Unknown error")
                    return GenerationResult(
                        prompt_id=prompt_id,
                        status="failed",
                        error=str(error),
                    )

            time.sleep(poll_interval)

    def _get_output_images(
        self,
        prompt_id: str,
        prompt_data: dict[str, Any],
        output_dir: Path,
    ) -> list[Path]:
        """Extract and download output images.

        Args:
            prompt_id: The prompt ID.
            prompt_data: Prompt history data.
            output_dir: Directory to save images.

        Returns:
            List of downloaded image paths.
        """
        images: list[Path] = []

        outputs = prompt_data.get("outputs", {})
        for node_id, node_output in outputs.items():
            if "images" in node_output:
                for image_info in node_output["images"]:
                    filename = image_info.get("filename")
                    if filename:
                        image_path = self._download_image(
                            prompt_id, node_id, filename, output_dir
                        )
                        if image_path:
                            images.append(image_path)

        return images

    def _download_image(
        self,
        prompt_id: str,
        node_id: str,
        filename: str,
        output_dir: Path,
    ) -> Path | None:
        """Download a single image.

        Args:
            prompt_id: The prompt ID.
            node_id: Node ID containing the image.
            filename: Image filename.
            output_dir: Directory to save image.

        Returns:
            Path to downloaded image, or None if failed.
        """
        try:
            # First check if file exists
            response = self.session.get(
                self._build_url(f"/view/{prompt_id}/{node_id}"),
                params={"filename": filename},
                timeout=30,
            )

            if response.status_code == 404:
                logger.warning(f"Image not found: {filename} at node {node_id}")
                # Try to list available outputs
                history = self.get_history(prompt_id)
                if prompt_id in history:
                    outputs = history[prompt_id].get("outputs", {})
                    logger.info(f"Available outputs: {list(outputs.keys())}")
                return None

            response.raise_for_status()
            output_path = output_dir / filename
            with open(output_path, "wb") as f:
                f.write(response.content)
            return output_path
        except Exception as e:
            logger.error(f"Failed to download image {filename}: {e}")
            return None

    def interrupt(self) -> bool:
        """Attempt to interrupt running generation.

        Returns:
            True if interrupt was successful.
        """
        try:
            self._request("POST", "/interrupt")
            return True
        except requests.RequestException:
            return False

    def free_memory(self) -> bool:
        """Attempt to free GPU memory through ComfyUI.

        Returns:
            True if successful.
        """
        try:
            self._request("POST", "/free")
            return True
        except requests.RequestException:
            return False

    def upload_image(self, image_path: Path, subfolder: str = "") -> str | None:
        """Upload an image to ComfyUI's input folder.

        ComfyUI's LoadImage nodes expect images to be in its input folder.
        This method uploads a local image file to ComfyUI and returns
        the filename that can be used in the workflow.

        Args:
            image_path: Local path to the image file to upload.
            subfolder: Optional subfolder within ComfyUI's input folder.

        Returns:
            The filename (with subfolder prefix if provided) to use in the workflow,
            or None if upload failed.

        Raises:
            ComfyUIError: If upload fails.
        """
        if not image_path.exists():
            logger.error(f"Image file not found: {image_path}")
            return None

        try:
            # Read the image file
            with open(image_path, "rb") as f:
                image_data = f.read()

            # Prepare multipart form data
            files = {
                "image": (image_path.name, image_data, "image/png"),
            }
            data = {
                "overwrite": "true",  # Overwrite if exists
            }
            if subfolder:
                data["subfolder"] = subfolder

            # Upload to ComfyUI's /upload/image endpoint
            response = self.session.post(
                self._build_url("/upload/image"),
                files=files,
                data=data,
                timeout=60,
            )
            response.raise_for_status()

            result = response.json()
            uploaded_name = result.get("name")
            uploaded_subfolder = result.get("subfolder", "")

            if uploaded_name:
                # Return full path including subfolder if present
                if uploaded_subfolder:
                    return f"{uploaded_subfolder}/{uploaded_name}"
                return uploaded_name
            else:
                logger.error(f"Upload response missing 'name': {result}")
                return None

        except requests.RequestException as e:
            logger.error(f"Failed to upload image {image_path}: {e}")
            raise ComfyUIError(f"Failed to upload image: {e}") from e
        except Exception as e:
            logger.error(f"Unexpected error uploading image {image_path}: {e}")
            return None

    def _request(
        self,
        method: str,
        endpoint: str,
        **kwargs: Any,
    ) -> requests.Response:
        """Make an HTTP request to the ComfyUI server.

        Args:
            method: HTTP method (GET, POST, etc.).
            endpoint: API endpoint.
            **kwargs: Additional arguments for requests.

        Returns:
            Response object.

        Raises:
            ComfyUIConnectionError: If connection fails.
        """
        url = self._build_url(endpoint)

        # Log the request (but not verbose endpoints)
        if endpoint not in ["/system_stats"] and not endpoint.startswith("/history"):
            self._log('comfyui', f"→ {method} {endpoint}")

        last_exception: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                response = self.session.request(
                    method,
                    url,
                    timeout=self.timeout,
                    **kwargs,
                )
                response.raise_for_status()
                
                # Log success for non-verbose endpoints
                if endpoint not in ["/system_stats"] and not endpoint.startswith("/history"):
                    self._log('comfyui', f"← {response.status_code} OK (Content-Length: {len(response.content)})")
                
                return response
            except requests.ConnectionError as e:
                last_exception = e
                self._log('warning', f"Connection error (attempt {attempt + 1}): {e}")
                if attempt < self.max_retries:
                    time.sleep(1)
            except requests.Timeout as e:
                last_exception = e
                self._log('error', f"Request timed out: {e}")
                raise ComfyUITimeoutError(
                    f"Request timed out: {e}"
                ) from last_exception
            except requests.HTTPError as e:
                self._log('error', f"HTTP error {e.response.status_code}: {e}")
                raise ComfyUIWorkflowError(
                    f"HTTP error {e.response.status_code}: {e}"
                ) from e

        self._log('error', f"Failed to connect after {self.max_retries + 1} attempts")
        raise ComfyUIConnectionError(
            f"Failed to connect to ComfyUI: {last_exception}"
        ) from last_exception

    def close(self) -> None:
        """Close the HTTP session."""
        self.session.close()
