"""Batch generation manager for sequential multi-angle generation.

Handles queuing and execution of multiple generation tasks with progress tracking.
"""

import json
import time
import uuid
import queue
from dataclasses import dataclass, field
from enum import Enum, auto
from pathlib import Path
from typing import Any, Optional, TYPE_CHECKING

from PyQt6.QtCore import QObject, QThread, pyqtSignal

if TYPE_CHECKING:
    from .comfyui_client import ComfyUIClient
    from .angle_library import CameraAngle


class TaskStatus(Enum):
    """Status of a generation task."""
    PENDING = auto()
    RUNNING = auto()
    COMPLETED = auto()
    FAILED = auto()
    CANCELLED = auto()


@dataclass
class GenerationTask:
    """A single generation task in the batch queue."""
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    panel_index: int = 0
    prompt_values: dict[str, Any] = field(default_factory=dict)
    workflow: dict[str, Any] = field(default_factory=dict)
    angle: Optional["CameraAngle"] = None
    status: TaskStatus = TaskStatus.PENDING
    progress: int = 0
    result_path: Optional[Path] = None
    error_message: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)


class BatchGenerationWorker(QThread):
    """Worker thread for batch generation tasks."""

    # Signals
    task_started = pyqtSignal(str, int)  # task_id, panel_index
    task_progress = pyqtSignal(str, int, int, str)  # task_id, progress_pct, step, status_msg
    task_completed = pyqtSignal(str, int, str)  # task_id, panel_index, image_path
    task_failed = pyqtSignal(str, int, str)  # task_id, panel_index, error_message
    batch_progress = pyqtSignal(int, int)  # completed_count, total_count
    batch_completed = pyqtSignal()
    log_message = pyqtSignal(str)  # ComfyUI log output

    def __init__(
        self,
        comfyui_client: "ComfyUIClient",
        tasks: list[GenerationTask],
        output_dir: Path,
        parent=None,
    ):
        super().__init__(parent)
        self._client = comfyui_client
        self._tasks = tasks
        self._output_dir = output_dir
        self._is_cancelled = False
        self._current_task: Optional[GenerationTask] = None
        self._poll_interval = 0.5  # seconds

    def cancel(self) -> None:
        """Cancel the batch generation."""
        self._is_cancelled = True
        if self._current_task:
            self._current_task.status = TaskStatus.CANCELLED

    def run(self) -> None:
        """Execute batch generation tasks sequentially."""
        total = len(self._tasks)
        completed = 0

        self.log_message.emit(f"Starting batch generation of {total} tasks...")

        for task in self._tasks:
            if self._is_cancelled:
                self.log_message.emit("Batch generation cancelled.")
                break

            self._current_task = task
            task.status = TaskStatus.RUNNING

            self.task_started.emit(task.id, task.panel_index)
            self.log_message.emit(f"[{completed + 1}/{total}] Starting task for panel {task.panel_index + 1}")

            try:
                result = self._execute_task(task)
                
                if result:
                    task.status = TaskStatus.COMPLETED
                    task.result_path = result
                    completed += 1
                    self.task_completed.emit(task.id, task.panel_index, str(result))
                    self.log_message.emit(f"[{completed}/{total}] Panel {task.panel_index + 1} completed: {result.name}")
                else:
                    task.status = TaskStatus.FAILED
                    task.error_message = "No result returned"
                    self.task_failed.emit(task.id, task.panel_index, "No result returned")
                    self.log_message.emit(f"[{completed}/{total}] Panel {task.panel_index + 1} failed: No result")

            except Exception as e:
                task.status = TaskStatus.FAILED
                task.error_message = str(e)
                self.task_failed.emit(task.id, task.panel_index, str(e))
                self.log_message.emit(f"[{completed}/{total}] Panel {task.panel_index + 1} failed: {e}")

            self.batch_progress.emit(completed, total)
            self._current_task = None

        self.batch_completed.emit()
        self.log_message.emit(f"Batch generation completed: {completed}/{total} successful")

    def _execute_task(self, task: GenerationTask) -> Optional[Path]:
        """Execute a single generation task."""
        # Submit the workflow
        try:
            prompt_id = self._client.submit_workflow(task.workflow)
            
            if not prompt_id:
                raise RuntimeError("No prompt_id returned from ComfyUI")
            
            self.log_message.emit(f"  Submitted workflow: {prompt_id[:8]}...")

        except Exception as e:
            raise RuntimeError(f"Failed to submit workflow: {e}")

        # Poll for completion using the same logic as GenerationWorker
        start_time = time.time()
        last_progress = 0
        max_wait = 600  # 10 minutes timeout
        poll_interval = 1.0

        while not self._is_cancelled:
            elapsed = time.time() - start_time
            if elapsed > max_wait:
                raise RuntimeError("Generation timed out")

            try:
                history = self._client.get_history(prompt_id)
                
                if prompt_id not in history:
                    # Still waiting in queue
                    progress = min(int((elapsed / 30) * 50), 20)  # Cap at 20% while waiting
                    if progress > last_progress:
                        last_progress = progress
                        task.progress = progress
                        self.task_progress.emit(task.id, progress, 0, "Waiting in queue...")
                    time.sleep(poll_interval)
                    continue

                prompt_data = history[prompt_id]
                status = prompt_data.get("status", {})
                status_str = str(status.get("status_str", "unknown")).lower()

                # Check for completion
                if status_str in ("success", "completed"):
                    outputs = prompt_data.get("outputs", {})
                    
                    if outputs:
                        self.log_message.emit(f"  Generation completed, downloading...")
                        
                        # Download images - look for image outputs in any node
                        for node_id, node_output in outputs.items():
                            if isinstance(node_output, dict) and "images" in node_output:
                                images = node_output["images"]
                                if images:
                                    image_info = images[0]
                                    filename = image_info.get("filename")
                                    subfolder = image_info.get("subfolder", "")
                                    
                                    if filename:
                                        # Download via /view API
                                        output_path = self._download_image(
                                            filename, subfolder, task.panel_index, task.id
                                        )
                                        if output_path:
                                            return output_path
                        
                        raise RuntimeError("Completed but no images found in outputs")
                    else:
                        raise RuntimeError("Completed but no outputs in result")

                # Check for errors
                if status_str in ("failed", "error"):
                    error_msg = status.get("err", "Generation failed")
                    raise RuntimeError(f"ComfyUI error: {error_msg}")

                # Still running - update progress
                outputs_count = len(prompt_data.get("outputs", {}))
                if outputs_count > 0:
                    progress = min(30 + outputs_count * 10, 90)
                else:
                    progress = min(int((elapsed / 30) * 100), 50)
                
                if progress > last_progress:
                    last_progress = progress
                    task.progress = progress
                    self.task_progress.emit(task.id, progress, 0, f"Generating... ({int(elapsed)}s)")

            except RuntimeError:
                # Re-raise our own errors
                raise
            except Exception as e:
                # Log transient errors but continue polling
                self.log_message.emit(f"  Polling error (will retry): {e}")
                        
            time.sleep(poll_interval)

        return None

    def _download_image(
        self, filename: str, subfolder: str, panel_index: int, task_id: str
    ) -> Optional[Path]:
        """Download an image from ComfyUI.
        
        Args:
            filename: The filename to download.
            subfolder: Subfolder in ComfyUI output.
            panel_index: Panel index for naming.
            task_id: Task ID for naming.
            
        Returns:
            Path to downloaded image or None.
        """
        try:
            # Try /view API with longer timeout for remote machines
            url = f"{self._client.server_url}/view"
            params = {"filename": filename}
            if subfolder:
                params["subfolder"] = subfolder
            params["type"] = "output"  # Important for ComfyUI
            
            self.log_message.emit(f"  Downloading {filename} from {url}...")
            response = self._client.session.get(url, params=params, timeout=60)  # Increased timeout
            
            if response.status_code == 200:
                # Save to output directory using original ComfyUI filename
                output_path = self._output_dir / filename
                self._output_dir.mkdir(parents=True, exist_ok=True)
                
                with open(output_path, "wb") as f:
                    f.write(response.content)
                
                self.log_message.emit(f"  Downloaded: {output_path.name} ({len(response.content)} bytes)")
                return output_path
            else:
                self.log_message.emit(f"  Download failed: HTTP {response.status_code} - {response.text[:200] if response.text else 'No response'}")
                return None
                
        except Exception as e:
            self.log_message.emit(f"  Download error: {type(e).__name__}: {e}")
            return None


class BatchGenerationManager(QObject):
    """Manages batch generation of multiple angles/prompts."""

    # Signals for UI updates
    task_started = pyqtSignal(str, int)  # task_id, panel_index
    task_progress = pyqtSignal(str, int, int, str)  # task_id, progress_pct, step, status_msg
    task_completed = pyqtSignal(str, int, str, dict)  # task_id, panel_index, image_path, metadata
    task_failed = pyqtSignal(str, int, str)  # task_id, panel_index, error_message
    batch_progress = pyqtSignal(int, int)  # completed_count, total_count
    batch_started = pyqtSignal(int)  # total_count
    batch_completed = pyqtSignal(int, int)  # success_count, total_count
    log_message = pyqtSignal(str)

    def __init__(self, comfyui_client: "ComfyUIClient", output_dir: Path, parent=None):
        super().__init__(parent)
        self._client = comfyui_client
        self._output_dir = output_dir
        self._tasks: list[GenerationTask] = []
        self._worker: Optional[BatchGenerationWorker] = None
        self._is_running = False

    @property
    def is_running(self) -> bool:
        """Check if batch generation is currently running."""
        return self._is_running

    def add_task(
        self,
        panel_index: int,
        workflow: dict[str, Any],
        prompt_values: dict[str, Any],
        angle: Optional["CameraAngle"] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> str:
        """Add a generation task to the queue. Returns task ID."""
        task = GenerationTask(
            panel_index=panel_index,
            workflow=workflow,
            prompt_values=prompt_values,
            angle=angle,
            metadata=metadata or {},
        )
        self._tasks.append(task)
        return task.id

    def clear_tasks(self) -> None:
        """Clear all pending tasks."""
        if self._is_running:
            raise RuntimeError("Cannot clear tasks while batch is running")
        self._tasks.clear()

    def get_task_count(self) -> int:
        """Get the number of pending tasks."""
        return len(self._tasks)

    def start_batch(self) -> bool:
        """Start batch generation. Returns True if started successfully."""
        if self._is_running:
            self.log_message.emit("Batch generation already running")
            return False

        if not self._tasks:
            self.log_message.emit("No tasks to generate")
            return False

        self._is_running = True
        self.batch_started.emit(len(self._tasks))

        # Create output directory
        self._output_dir.mkdir(parents=True, exist_ok=True)

        # Create and start worker
        self._worker = BatchGenerationWorker(
            self._client,
            self._tasks,
            self._output_dir,
            self,
        )
        
        # Connect worker signals
        self._worker.task_started.connect(self.task_started)
        self._worker.task_progress.connect(self.task_progress)
        self._worker.task_completed.connect(self._on_task_completed)
        self._worker.task_failed.connect(self.task_failed)
        self._worker.batch_progress.connect(self.batch_progress)
        self._worker.batch_completed.connect(self._on_batch_completed)
        self._worker.log_message.connect(self.log_message)

        self._worker.start()
        return True

    def cancel_batch(self) -> None:
        """Cancel the current batch generation."""
        if self._worker and self._is_running:
            self._worker.cancel()
            self.log_message.emit("Cancelling batch generation...")

    def _on_task_completed(self, task_id: str, panel_index: int, image_path: str) -> None:
        """Handle task completion."""
        # Find task and get metadata
        for task in self._tasks:
            if task.id == task_id:
                self.task_completed.emit(task_id, panel_index, image_path, task.metadata)
                break

    def _on_batch_completed(self) -> None:
        """Handle batch completion."""
        self._is_running = False
        
        # Count successes
        success_count = sum(1 for t in self._tasks if t.status == TaskStatus.COMPLETED)
        total_count = len(self._tasks)
        
        # Clear completed tasks
        self._tasks.clear()
        
        self.batch_completed.emit(success_count, total_count)
        
        # Cleanup worker
        if self._worker:
            self._worker.wait()
            self._worker.deleteLater()
            self._worker = None
