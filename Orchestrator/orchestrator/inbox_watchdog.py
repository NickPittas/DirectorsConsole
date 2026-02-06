"""Inbox Watchdog - Monitor folder for manifest JSON submissions.

This module implements a file system watcher that monitors an "Inbox" folder
for ComfyUI workflow manifest JSON files. When a new file is detected, it
automatically submits the workflow to the Orchestrator for execution.

This enables StoryboardUI2 and other tools to submit jobs by simply dropping
JSON files into a shared folder, perfect for cross-platform integration.

Features:
- Real-time file system monitoring using watchdog library
- Automatic workflow submission on file creation
- Support for full ComfyUI workflow JSON
- Error handling and logging for failed submissions
- Automatic file archiving (move to processed/failed folders)

Expected Manifest Format:
{
    "workflow_json": {
        "3": {"class_type": "KSampler", "inputs": {...}},
        ...
    },
    "parameters": {"seed": 42, "steps": 20},
    "metadata": {"scene": "shot_001", "source": "StoryboardUI2"}
}

Usage:
    inbox = InboxWatchdog(inbox_path=Path("/shared/inbox"), job_manager=job_manager)
    await inbox.start()
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

logger = logging.getLogger(__name__)


class InboxWatchdog:
    """Monitor an Inbox folder for workflow manifest JSON submissions.

    Attributes:
        inbox_path: Path to the Inbox folder to monitor.
        job_manager: JobManager instance for submitting jobs.
        processed_path: Path to move successfully processed files.
        failed_path: Path to move failed files.
    """

    def __init__(self, inbox_path: Path, job_manager: Any) -> None:
        """Initialize the Inbox watchdog.

        Args:
            inbox_path: Path to the Inbox folder to monitor.
            job_manager: JobManager instance for executing workflows.
        """
        self.inbox_path = Path(inbox_path)
        self.job_manager = job_manager
        self.processed_path = self.inbox_path / "processed"
        self.failed_path = self.inbox_path / "failed"
        self._observer: Observer | None = None
        self._handler: InboxEventHandler | None = None

        # Create directories
        self.inbox_path.mkdir(parents=True, exist_ok=True)
        self.processed_path.mkdir(parents=True, exist_ok=True)
        self.failed_path.mkdir(parents=True, exist_ok=True)

        logger.info(f"Inbox watchdog initialized: {self.inbox_path}")

    async def start(self) -> None:
        """Start monitoring the Inbox folder."""
        if self._observer:
            logger.warning("Inbox watchdog already running")
            return

        # Create event handler
        self._handler = InboxEventHandler(self)

        # Create and start observer
        self._observer = Observer()
        self._observer.schedule(
            self._handler, str(self.inbox_path), recursive=False
        )
        self._observer.start()

        logger.info(f"Inbox watchdog started: {self.inbox_path}")
        logger.info(f"  - Processed folder: {self.processed_path}")
        logger.info(f"  - Failed folder: {self.failed_path}")

        # Process any existing files
        await self._process_existing_files()

    async def stop(self) -> None:
        """Stop monitoring the Inbox folder."""
        if not self._observer:
            logger.warning("Inbox watchdog not running")
            return

        self._observer.stop()
        self._observer.join(timeout=5)
        self._observer = None
        self._handler = None

        logger.info("Inbox watchdog stopped")

    async def _process_existing_files(self) -> None:
        """Process any JSON files that already exist in the Inbox."""
        json_files = list(self.inbox_path.glob("*.json"))
        if json_files:
            logger.info(f"Processing {len(json_files)} existing files in Inbox")
            for file_path in json_files:
                await self._process_file(file_path)

    async def _process_file(self, file_path: Path) -> None:
        """Process a single manifest file.

        Args:
            file_path: Path to the manifest JSON file.
        """
        if not file_path.suffix.lower() == ".json":
            logger.debug(f"Skipping non-JSON file: {file_path.name}")
            return

        # Ignore files in subdirectories
        if file_path.parent != self.inbox_path:
            return

        logger.info(f"Processing manifest: {file_path.name}")

        try:
            # Load manifest
            manifest = self._load_manifest(file_path)

            # Validate manifest
            self._validate_manifest(manifest, file_path)

            # Extract components
            workflow_json = manifest["workflow_json"]
            parameters = manifest.get("parameters", {})
            metadata = manifest.get("metadata", {})
            backend_affinity = manifest.get("backend_affinity")
            required_capabilities = manifest.get("required_capabilities", [])

            # Add file metadata
            metadata["inbox_file"] = file_path.name
            metadata["inbox_timestamp"] = datetime.utcnow().isoformat()

            # Generate job ID
            import uuid

            job_id = str(uuid.uuid4())

            # Submit job
            logger.info(
                f"Submitting job from Inbox: {file_path.name} -> {job_id}"
            )
            job = await self.job_manager.execute_workflow_direct(
                job_id=job_id,
                api_json=workflow_json,
                parameters=parameters,
                metadata=metadata,
                backend_affinity=backend_affinity,
                required_capabilities=required_capabilities,
            )

            logger.info(
                f"Job submitted successfully: {job_id} (status={job.status.value})"
            )

            # Move to processed folder
            self._move_to_processed(file_path, job_id)

        except Exception as e:
            logger.exception(f"Failed to process manifest {file_path.name}: {e}")
            self._move_to_failed(file_path, str(e))

    def _load_manifest(self, file_path: Path) -> dict[str, Any]:
        """Load and parse a manifest JSON file.

        Args:
            file_path: Path to the JSON file.

        Returns:
            Parsed manifest dictionary.

        Raises:
            ValueError: If file cannot be read or parsed.
        """
        try:
            with file_path.open("r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON: {e}")
        except Exception as e:
            raise ValueError(f"Failed to read file: {e}")

    def _validate_manifest(
        self, manifest: dict[str, Any], file_path: Path
    ) -> None:
        """Validate manifest structure.

        Args:
            manifest: The parsed manifest dictionary.
            file_path: Path to the manifest file (for error messages).

        Raises:
            ValueError: If manifest is invalid.
        """
        if not isinstance(manifest, dict):
            raise ValueError("Manifest must be a JSON object")

        if "workflow_json" not in manifest:
            raise ValueError("Manifest missing required field: workflow_json")

        workflow_json = manifest["workflow_json"]
        if not isinstance(workflow_json, dict):
            raise ValueError("workflow_json must be a dictionary")

        if not workflow_json:
            raise ValueError("workflow_json cannot be empty")

        # Validate optional fields
        if "parameters" in manifest and not isinstance(
            manifest["parameters"], dict
        ):
            raise ValueError("parameters must be a dictionary")

        if "metadata" in manifest and not isinstance(manifest["metadata"], dict):
            raise ValueError("metadata must be a dictionary")

        if "required_capabilities" in manifest and not isinstance(
            manifest["required_capabilities"], list
        ):
            raise ValueError("required_capabilities must be a list")

    def _move_to_processed(self, file_path: Path, job_id: str) -> None:
        """Move a successfully processed file to the processed folder.

        Args:
            file_path: Path to the original file.
            job_id: The job ID assigned to this submission.
        """
        try:
            # Create timestamped filename
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            new_name = f"{timestamp}_{job_id}_{file_path.name}"
            dest_path = self.processed_path / new_name

            shutil.move(str(file_path), str(dest_path))
            logger.info(f"Moved to processed: {new_name}")
        except Exception as e:
            logger.error(f"Failed to move file to processed: {e}")

    def _move_to_failed(self, file_path: Path, error_message: str) -> None:
        """Move a failed file to the failed folder with error log.

        Args:
            file_path: Path to the original file.
            error_message: The error message describing the failure.
        """
        try:
            # Create timestamped filename
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            new_name = f"{timestamp}_{file_path.name}"
            dest_path = self.failed_path / new_name

            shutil.move(str(file_path), str(dest_path))

            # Write error log
            error_log_path = dest_path.with_suffix(".error.txt")
            error_log_path.write_text(
                f"Error: {error_message}\nTimestamp: {timestamp}\n",
                encoding="utf-8",
            )

            logger.info(f"Moved to failed: {new_name}")
        except Exception as e:
            logger.error(f"Failed to move file to failed: {e}")


class InboxEventHandler(FileSystemEventHandler):
    """File system event handler for Inbox watchdog."""

    def __init__(self, watchdog: InboxWatchdog) -> None:
        """Initialize the event handler.

        Args:
            watchdog: The parent InboxWatchdog instance.
        """
        self.watchdog = watchdog
        super().__init__()

    def on_created(self, event: FileSystemEvent) -> None:
        """Handle file creation events.

        Args:
            event: The file system event.
        """
        if event.is_directory:
            return

        file_path = Path(event.src_path)

        # Only process .json files
        if file_path.suffix.lower() != ".json":
            return

        # Ignore files in subdirectories
        if file_path.parent != self.watchdog.inbox_path:
            return

        logger.info(f"New file detected: {file_path.name}")

        # Process file in async context
        # Note: watchdog runs in a separate thread, so we need to submit
        # to the main event loop
        loop = asyncio.get_event_loop()
        asyncio.run_coroutine_threadsafe(
            self.watchdog._process_file(file_path), loop
        )
