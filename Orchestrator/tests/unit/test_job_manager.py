"""Tests for JobManager."""

import pytest
from unittest.mock import MagicMock, AsyncMock

from orchestrator.core.engine.job_manager import JobManager
from orchestrator.core.models.project import CanvasLayout, Project


class TestJobManager:
    """Tests for JobManager class."""

    @pytest.mark.asyncio
    async def test_job_manager_run_empty_project(self) -> None:
        """Test running a job on an empty project (no nodes)."""
        # Create mock repositories to avoid FK constraint issues
        mock_job_repo = MagicMock()
        mock_job_repo.save = MagicMock()
        
        mock_workflow_storage = MagicMock()
        
        manager = JobManager(
            job_repo=mock_job_repo,
            workflow_storage=mock_workflow_storage,
        )
        
        project = Project(id="p1", name="Project", canvas_layout=CanvasLayout())
        job = await manager.run_job(project, {})
        
        # Job should complete (no nodes to execute)
        assert job is not None
        # Note: project_id is None for ad-hoc execution (project not persisted)
        assert job.project_id is None
        # Job repo save should have been called
        assert mock_job_repo.save.called

    def test_job_manager_construct(self) -> None:
        """Test JobManager can be constructed with defaults."""
        manager = JobManager()
        assert manager is not None
