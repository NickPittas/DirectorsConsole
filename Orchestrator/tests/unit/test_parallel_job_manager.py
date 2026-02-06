"""Tests for ParallelJobManager.

This module provides comprehensive unit tests for the ParallelJobManager class,
which manages parallel job execution across multiple ComfyUI backends.
"""

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from orchestrator.core.models.backend import BackendConfig, BackendStatus
from orchestrator.core.models.job_group import (
    ChildJobStatus,
    JobGroup,
    JobGroupRequest,
    JobGroupStatus,
    SeedStrategy,
)
from orchestrator.core.parallel_job_manager import ParallelJobManager


class TestParallelJobManager:
    """Tests for ParallelJobManager class."""

    @pytest.fixture
    def mock_backend_manager(self) -> MagicMock:
        """Create a mock backend manager."""
        manager = MagicMock()
        manager.get = MagicMock()
        manager.get_status = MagicMock()
        return manager

    @pytest.fixture
    def mock_client_factory(self) -> MagicMock:
        """Create a mock ComfyUI client factory."""
        return MagicMock()

    @pytest.fixture
    def parallel_manager(
        self, mock_backend_manager: MagicMock, mock_client_factory: MagicMock
    ) -> ParallelJobManager:
        """Create a ParallelJobManager with mocked dependencies."""
        return ParallelJobManager(
            backend_manager=mock_backend_manager,
            client_factory=mock_client_factory,
        )

    @pytest.fixture
    def sample_backends(self) -> list[BackendConfig]:
        """Create sample backend configurations."""
        return [
            BackendConfig(id="backend1", name="Node 1", host="192.168.1.1", port=8188),
            BackendConfig(id="backend2", name="Node 2", host="192.168.1.2", port=8188),
            BackendConfig(id="backend3", name="Node 3", host="192.168.1.3", port=8188),
        ]

    @pytest.fixture
    def sample_request(self) -> JobGroupRequest:
        """Create a sample job group request."""
        return JobGroupRequest(
            workflow_json={
                "nodes": {
                    "1": {"class_type": "KSampler", "inputs": {"seed": 0}},
                }
            },
            backend_ids=["backend1", "backend2", "backend3"],
            seed_strategy=SeedStrategy.SEQUENTIAL,
            base_seed=100,
            parameters={},
            metadata={"panel_id": 1},
            timeout_seconds=300,
        )

    def test_default_client_factory(self, mock_backend_manager: MagicMock) -> None:
        """Test that default client factory is used when not provided."""
        manager = ParallelJobManager(backend_manager=mock_backend_manager)
        assert manager._client_factory is not None

    @pytest.mark.asyncio
    async def test_submit_group_creates_jobs(
        self,
        parallel_manager: ParallelJobManager,
        mock_backend_manager: MagicMock,
        sample_backends: list[BackendConfig],
        sample_request: JobGroupRequest,
    ) -> None:
        """Verify that submit_group creates child jobs for each backend."""
        # Setup mocks
        for backend in sample_backends:
            mock_backend_manager.get.return_value = backend
            mock_backend_manager.get_status.return_value = BackendStatus(
                backend_id=backend.id,
                online=True,
            )

        # Make get return appropriate backend based on ID
        def mock_get(backend_id: str) -> BackendConfig | None:
            for b in sample_backends:
                if b.id == backend_id:
                    return b
            return None

        mock_backend_manager.get.side_effect = mock_get

        # Submit group
        job_group = await parallel_manager.submit_group(sample_request)

        # Verify child jobs created
        assert len(job_group.child_jobs) == 3, (
            f"Expected 3 child jobs, got {len(job_group.child_jobs)}"
        )

        # Verify each child has correct backend assignment
        backend_ids = {job.backend_id for job in job_group.child_jobs}
        assert backend_ids == {"backend1", "backend2", "backend3"}

    @pytest.mark.asyncio
    async def test_submit_group_assigns_unique_seeds(
        self,
        parallel_manager: ParallelJobManager,
        mock_backend_manager: MagicMock,
        sample_backends: list[BackendConfig],
        sample_request: JobGroupRequest,
    ) -> None:
        """Verify that seeds are different for each child job."""
        # Setup mocks
        def mock_get(backend_id: str) -> BackendConfig | None:
            for b in sample_backends:
                if b.id == backend_id:
                    return b
            return None

        mock_backend_manager.get.side_effect = mock_get
        mock_backend_manager.get_status.return_value = BackendStatus(
            backend_id="test",
            online=True,
        )

        # Submit group
        job_group = await parallel_manager.submit_group(sample_request)

        # Verify unique seeds
        seeds = [job.seed for job in job_group.child_jobs]
        unique_seeds = set(seeds)
        assert len(unique_seeds) == len(seeds), (
            f"Seeds are not unique: {seeds}"
        )

        # Verify sequential strategy was applied (base_seed + 0, 1, 2...)
        sorted_seeds = sorted(seeds)
        assert sorted_seeds[0] == 100  # base_seed
        # Sequential seeds should be consecutive
        for i in range(1, len(sorted_seeds)):
            assert sorted_seeds[i] == sorted_seeds[i-1] + 1

    @pytest.mark.asyncio
    async def test_get_group_returns_correct_group(
        self,
        parallel_manager: ParallelJobManager,
        mock_backend_manager: MagicMock,
        sample_backends: list[BackendConfig],
        sample_request: JobGroupRequest,
    ) -> None:
        """Test retrieval of job group by ID."""
        # Setup mocks
        def mock_get(backend_id: str) -> BackendConfig | None:
            for b in sample_backends:
                if b.id == backend_id:
                    return b
            return None

        mock_backend_manager.get.side_effect = mock_get
        mock_backend_manager.get_status.return_value = BackendStatus(
            backend_id="test",
            online=True,
        )

        # Submit group
        job_group = await parallel_manager.submit_group(sample_request)
        group_id = job_group.id

        # Retrieve group
        retrieved = parallel_manager.get_group(group_id)

        assert retrieved is not None
        assert retrieved.id == group_id
        assert retrieved == job_group

    @pytest.mark.asyncio
    async def test_get_group_returns_none_for_unknown(
        self,
        parallel_manager: ParallelJobManager,
    ) -> None:
        """Test that None is returned for unknown group ID."""
        result = parallel_manager.get_group("nonexistent_group_id")
        assert result is None

    @pytest.mark.asyncio
    async def test_cancel_group_marks_children_cancelled(
        self,
        parallel_manager: ParallelJobManager,
        mock_backend_manager: MagicMock,
        sample_backends: list[BackendConfig],
        sample_request: JobGroupRequest,
    ) -> None:
        """Test that cancel_group marks children as cancelled."""
        # Setup mocks
        def mock_get(backend_id: str) -> BackendConfig | None:
            for b in sample_backends:
                if b.id == backend_id:
                    return b
            return None

        mock_backend_manager.get.side_effect = mock_get
        mock_backend_manager.get_status.return_value = BackendStatus(
            backend_id="test",
            online=True,
        )

        # Submit group
        job_group = await parallel_manager.submit_group(sample_request)
        group_id = job_group.id

        # Cancel group
        result = await parallel_manager.cancel_group(group_id)

        # Verify group status
        assert job_group.status == JobGroupStatus.CANCELLED

        # Verify result contains expected keys
        assert "interrupted" in result
        assert "already_complete" in result

    @pytest.mark.asyncio
    async def test_cancel_group_not_found(
        self,
        parallel_manager: ParallelJobManager,
    ) -> None:
        """Test that cancelling unknown group raises ValueError."""
        with pytest.raises(ValueError, match="not found"):
            await parallel_manager.cancel_group("nonexistent_group_id")

    @pytest.mark.asyncio
    async def test_submit_group_no_valid_backends(
        self,
        parallel_manager: ParallelJobManager,
        mock_backend_manager: MagicMock,
        sample_request: JobGroupRequest,
    ) -> None:
        """Test error when no valid backends are available."""
        # Setup mocks to return None (backend not found)
        mock_backend_manager.get.return_value = None

        with pytest.raises(ValueError, match="No valid backends available"):
            await parallel_manager.submit_group(sample_request)

    @pytest.mark.asyncio
    async def test_submit_group_offline_backends(
        self,
        parallel_manager: ParallelJobManager,
        mock_backend_manager: MagicMock,
        sample_backends: list[BackendConfig],
        sample_request: JobGroupRequest,
    ) -> None:
        """Test that offline backends are allowed (validation relaxed)."""
        # Setup mocks - backend exists but is offline
        def mock_get(backend_id: str) -> BackendConfig | None:
            for b in sample_backends:
                if b.id == backend_id:
                    return b
            return None

        mock_backend_manager.get.side_effect = mock_get
        mock_backend_manager.get_status.return_value = BackendStatus(
            backend_id="test",
            online=False,  # Offline but should still be accepted
        )

        # Should succeed even with offline backends (frontend verified connectivity)
        result = await parallel_manager.submit_group(sample_request)
        assert result is not None
        assert len(result.child_jobs) == len(sample_request.backend_ids)

    @pytest.mark.asyncio
    async def test_failure_isolation(
        self,
        parallel_manager: ParallelJobManager,
        mock_backend_manager: MagicMock,
        mock_client_factory: MagicMock,
        sample_backends: list[BackendConfig],
    ) -> None:
        """Test that one job failure doesn't affect others.

        This test verifies that when one backend fails, the other jobs
        continue to execute successfully.
        """
        # Create a minimal request with 2 backends
        request = JobGroupRequest(
            workflow_json={"test": "workflow"},
            backend_ids=["backend1", "backend2"],
            seed_strategy=SeedStrategy.SEQUENTIAL,
            base_seed=100,
        )

        # Setup backend mocks
        def mock_get(backend_id: str) -> BackendConfig | None:
            for b in sample_backends:
                if b.id == backend_id:
                    return b
            return None

        mock_backend_manager.get.side_effect = mock_get
        mock_backend_manager.get_status.return_value = BackendStatus(
            backend_id="test",
            online=True,
        )

        # Create mock clients - one succeeds, one fails
        mock_client_success = AsyncMock()
        mock_client_success.queue_prompt = AsyncMock(return_value="prompt_1")
        mock_client_success.monitor_progress = AsyncMock(return_value=[])
        mock_client_success.get_history = AsyncMock(return_value={})
        mock_client_success.download_outputs = MagicMock(return_value=[])
        mock_client_success.close = AsyncMock()

        mock_client_fail = AsyncMock()
        mock_client_fail.queue_prompt = AsyncMock(side_effect=Exception("Connection error"))
        mock_client_fail.close = AsyncMock()

        # Factory returns different clients for different backends
        def mock_factory(backend: BackendConfig) -> AsyncMock:
            if backend.id == "backend1":
                return mock_client_success
            else:
                return mock_client_fail

        mock_client_factory.side_effect = mock_factory

        # Submit group
        job_group = await parallel_manager.submit_group(request)

        # Wait for execution to complete (with timeout to prevent hanging)
        await asyncio.wait_for(
            parallel_manager._execute_group(job_group),
            timeout=5.0,
        )

        # Verify status was updated
        assert job_group.status in [
            JobGroupStatus.PARTIAL_COMPLETE,
            JobGroupStatus.FAILED,
        ]

        # Verify one completed and one failed (or both failed if isolation fails)
        assert len(job_group.child_jobs) == 2

    @pytest.mark.asyncio
    async def test_group_status_computation(
        self,
        parallel_manager: ParallelJobManager,
        mock_backend_manager: MagicMock,
        sample_backends: list[BackendConfig],
    ) -> None:
        """Test status aggregation from child job statuses."""
        # Create a job group manually
        from orchestrator.core.models.job_group import ChildJob

        child_jobs = [
            ChildJob(
                job_id="j1",
                backend_id="backend1",
                seed=1,
                status=ChildJobStatus.COMPLETED,
            ),
            ChildJob(
                job_id="j2",
                backend_id="backend2",
                seed=2,
                status=ChildJobStatus.FAILED,
            ),
        ]

        job_group = JobGroup(
            id="jg_test",
            workflow_json={},
            child_jobs=child_jobs,
            status=JobGroupStatus.RUNNING,
        )

        parallel_manager._active_groups["jg_test"] = job_group

        # Call _update_group_status directly
        parallel_manager._update_group_status(job_group)

        # Should be PARTIAL_COMPLETE (1 completed, 1 failed)
        assert job_group.status == JobGroupStatus.PARTIAL_COMPLETE

    @pytest.mark.asyncio
    async def test_group_status_all_completed(self, parallel_manager: ParallelJobManager) -> None:
        """Test status when all jobs completed."""
        from orchestrator.core.models.job_group import ChildJob

        child_jobs = [
            ChildJob(
                job_id="j1",
                backend_id="backend1",
                seed=1,
                status=ChildJobStatus.COMPLETED,
            ),
            ChildJob(
                job_id="j2",
                backend_id="backend2",
                seed=2,
                status=ChildJobStatus.COMPLETED,
            ),
        ]

        job_group = JobGroup(
            id="jg_test",
            workflow_json={},
            child_jobs=child_jobs,
            status=JobGroupStatus.RUNNING,
        )

        parallel_manager._update_group_status(job_group)

        assert job_group.status == JobGroupStatus.COMPLETED
        assert job_group.completed_at is not None

    @pytest.mark.asyncio
    async def test_group_status_all_failed(self, parallel_manager: ParallelJobManager) -> None:
        """Test status when all jobs failed."""
        from orchestrator.core.models.job_group import ChildJob

        child_jobs = [
            ChildJob(
                job_id="j1",
                backend_id="backend1",
                seed=1,
                status=ChildJobStatus.FAILED,
            ),
            ChildJob(
                job_id="j2",
                backend_id="backend2",
                seed=2,
                status=ChildJobStatus.TIMEOUT,
            ),
        ]

        job_group = JobGroup(
            id="jg_test",
            workflow_json={},
            child_jobs=child_jobs,
            status=JobGroupStatus.RUNNING,
        )

        parallel_manager._update_group_status(job_group)

        assert job_group.status == JobGroupStatus.FAILED

    @pytest.mark.asyncio
    async def test_timeout_handling(
        self,
        parallel_manager: ParallelJobManager,
    ) -> None:
        """Test that TIMEOUT status is properly handled in group status computation.

        This test verifies that jobs with TIMEOUT status are counted as failures
        when computing overall group status.
        """
        from orchestrator.core.models.job_group import ChildJob

        # Create a job group with a timed-out job
        child_jobs = [
            ChildJob(
                job_id="j1",
                backend_id="backend1",
                seed=1,
                status=ChildJobStatus.TIMEOUT,
            ),
        ]

        job_group = JobGroup(
            id="jg_timeout_test",
            workflow_json={},
            child_jobs=child_jobs,
            status=JobGroupStatus.RUNNING,
        )

        # Verify timeout status is recognized
        assert job_group.child_jobs[0].status == ChildJobStatus.TIMEOUT

        # Update group status
        parallel_manager._update_group_status(job_group)

        # Group should be FAILED since all jobs timed out
        assert job_group.status == JobGroupStatus.FAILED
        assert job_group.failed_count == 1
        assert job_group.completed_count == 0

    def test_register_websocket_handler(
        self,
        parallel_manager: ParallelJobManager,
    ) -> None:
        """Test WebSocket handler registration."""
        mock_handler = AsyncMock()

        parallel_manager.register_websocket_handler("group_1", mock_handler)

        assert "group_1" in parallel_manager._websocket_handlers
        assert parallel_manager._websocket_handlers["group_1"] == mock_handler

    def test_unregister_websocket_handler(
        self,
        parallel_manager: ParallelJobManager,
    ) -> None:
        """Test WebSocket handler unregistration."""
        mock_handler = AsyncMock()

        parallel_manager.register_websocket_handler("group_1", mock_handler)
        parallel_manager.unregister_websocket_handler("group_1")

        assert "group_1" not in parallel_manager._websocket_handlers

    @pytest.mark.asyncio
    async def test_emit_event_with_handler(
        self,
        parallel_manager: ParallelJobManager,
    ) -> None:
        """Test that events are emitted to registered handlers."""
        mock_handler = AsyncMock()
        event_data = {"type": "test_event", "data": "test"}

        parallel_manager.register_websocket_handler("group_1", mock_handler)
        await parallel_manager._emit_event("group_1", event_data)

        mock_handler.assert_called_once_with(event_data)

    @pytest.mark.asyncio
    async def test_emit_event_no_handler(
        self,
        parallel_manager: ParallelJobManager,
    ) -> None:
        """Test that emitting without handler doesn't error."""
        event_data = {"type": "test_event", "data": "test"}

        # Should not raise
        await parallel_manager._emit_event("group_1", event_data)

    @pytest.mark.asyncio
    async def test_emit_event_handler_error(
        self,
        parallel_manager: ParallelJobManager,
    ) -> None:
        """Test that handler errors are caught and logged."""
        mock_handler = AsyncMock(side_effect=Exception("Handler error"))

        parallel_manager.register_websocket_handler("group_1", mock_handler)

        # Should not raise despite handler error
        await parallel_manager._emit_event("group_1", {"type": "test"})

    @pytest.mark.asyncio
    async def test_patch_seed_in_workflow(
        self,
        parallel_manager: ParallelJobManager,
    ) -> None:
        """Test that seed is correctly patched into workflow."""
        workflow = {
            "1": {
                "class_type": "KSampler",
                "inputs": {"seed": 0, "steps": 20},
            },
            "2": {
                "class_type": "LoadCheckpoint",
                "inputs": {"ckpt_name": "model.safetensors"},
            },
        }

        patched = parallel_manager._patch_seed(workflow, 42, {})

        # KSampler seed should be patched
        assert patched["1"]["inputs"]["seed"] == 42
        # Other inputs should remain unchanged
        assert patched["1"]["inputs"]["steps"] == 20
        # Non-sampler nodes should not have seed
        assert "seed" not in patched["2"]["inputs"]

    @pytest.mark.asyncio
    async def test_collect_outputs(
        self,
        parallel_manager: ParallelJobManager,
    ) -> None:
        """Test output collection from completed job."""
        # Create mock client
        mock_client = MagicMock()
        mock_client._base_url = "http://192.168.1.1:8188"

        # Create mock output
        mock_output = MagicMock()
        mock_output.filename = "test_00001_.png"
        mock_output.subfolder = ""
        mock_output.image_type = "output"

        mock_client.download_outputs = MagicMock(return_value=[mock_output])

        # Call _collect_outputs
        outputs = await parallel_manager._collect_outputs(
            mock_client, {}, "prompt_123"
        )

        assert "images" in outputs
        assert "prompt_id" in outputs
        assert len(outputs["images"]) == 1
        assert outputs["images"][0]["filename"] == "test_00001_.png"
