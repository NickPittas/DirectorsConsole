"""Workflow storage for persisting workflows to disk.

Provides file-based storage for WorkflowDefinition objects, saving them as JSON
files in the configured data directory.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from orchestrator.core.models.workflow import WorkflowDefinition

logger = logging.getLogger(__name__)


class WorkflowStorage:
    """File-based storage for workflow definitions.

    Saves workflows as JSON files in a 'workflows' subdirectory of the
    configured data directory. Each workflow is saved as {workflow_id}.json.

    Attributes:
        workflows_dir: Path to the workflows storage directory
    """

    def __init__(self, data_dir: str = "./data") -> None:
        """Initialize the workflow storage.

        Args:
            data_dir: Base data directory path. Workflows will be stored
                in a 'workflows' subdirectory.
        """
        self.workflows_dir = Path(data_dir) / "workflows"
        self.workflows_dir.mkdir(parents=True, exist_ok=True)
        logger.debug(f"WorkflowStorage initialized at {self.workflows_dir}")

    def save_workflow(self, workflow: WorkflowDefinition) -> Path:
        """Save a workflow to disk.

        Args:
            workflow: The WorkflowDefinition to save

        Returns:
            The path where the workflow was saved
        """
        filename = f"{workflow.id}.json"
        path = self.workflows_dir / filename

        # Convert Pydantic model to dict for serialization
        data = workflow.model_dump(mode="json")

        # Ensure datetime fields are serialized as ISO strings
        if "created_at" in data and isinstance(data["created_at"], datetime):
            data["created_at"] = data["created_at"].isoformat()
        if "updated_at" in data and isinstance(data["updated_at"], datetime):
            data["updated_at"] = data["updated_at"].isoformat()

        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        logger.info(f"Saved workflow '{workflow.name}' to {path}")
        return path

    def load_workflow(self, workflow_id: str) -> WorkflowDefinition | None:
        """Load a workflow by ID.

        Args:
            workflow_id: The ID of the workflow to load

        Returns:
            The WorkflowDefinition, or None if not found
        """
        from orchestrator.core.models.workflow import WorkflowDefinition

        path = self.workflows_dir / f"{workflow_id}.json"
        if not path.exists():
            logger.debug(f"Workflow {workflow_id} not found at {path}")
            return None

        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            workflow = WorkflowDefinition.model_validate(data)
            logger.debug(f"Loaded workflow '{workflow.name}' from {path}")
            return workflow
        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"Error loading workflow {workflow_id}: {e}")
            return None

    def list_workflows(self) -> list[WorkflowDefinition]:
        """List all saved workflows.

        Returns:
            List of all WorkflowDefinition objects in storage
        """
        from orchestrator.core.models.workflow import WorkflowDefinition

        workflows: list[WorkflowDefinition] = []

        for path in self.workflows_dir.glob("*.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                workflow = WorkflowDefinition.model_validate(data)
                workflows.append(workflow)
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning(f"Skipping invalid workflow file {path}: {e}")
                continue

        # Sort by name for consistent ordering
        workflows.sort(key=lambda w: w.name.lower())
        logger.debug(f"Listed {len(workflows)} workflows from storage")
        return workflows

    def delete_workflow(self, workflow_id: str) -> bool:
        """Delete a workflow from storage.

        Args:
            workflow_id: The ID of the workflow to delete

        Returns:
            True if the workflow was deleted, False if it didn't exist
        """
        path = self.workflows_dir / f"{workflow_id}.json"
        if path.exists():
            path.unlink()
            logger.info(f"Deleted workflow {workflow_id}")
            return True
        logger.debug(f"Workflow {workflow_id} not found for deletion")
        return False

    def workflow_exists(self, workflow_id: str) -> bool:
        """Check if a workflow exists in storage.

        Args:
            workflow_id: The ID to check

        Returns:
            True if the workflow exists, False otherwise
        """
        path = self.workflows_dir / f"{workflow_id}.json"
        return path.exists()

    def get_workflows_by_folder(self, folder: str) -> list[WorkflowDefinition]:
        """Get workflows that belong to a specific folder.

        Note: Folder metadata is stored in the workflow's description
        as a convention until proper folder support is added.

        Args:
            folder: The folder name to filter by

        Returns:
            List of workflows in the specified folder
        """
        # For now, return all workflows - folder filtering can be added later
        # when folder metadata is properly stored in workflows
        return self.list_workflows()
