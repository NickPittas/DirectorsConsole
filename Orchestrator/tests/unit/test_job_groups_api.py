"""Tests for job groups API endpoints.

This module provides comprehensive unit tests for the FastAPI endpoints
used in multi-node parallel job group management.
"""

import pytest
from fastapi import status
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch

from orchestrator.api.server import app
from orchestrator.api import job_groups
from orchestrator.core.models.job_group import (
    ChildJob,
    ChildJobStatus,
    JobGroup,
    JobGroupRequest,
    JobGroupStatus,
    SeedStrategy,
)
from orchestrator.core.parallel_job_manager import ParallelJobManager


@pytest.fixture
def mock_parallel_job_manager() -> MagicMock:
    """Create a mock ParallelJobManager."""
    manager = MagicMock(spec=ParallelJobManager)
    manager.submit_group = AsyncMock()
    manager.get_group = MagicMock()
    manager.cancel_group = AsyncMock()
    return manager


@pytest.fixture
def test_client(mock_parallel_job_manager: MagicMock) -> TestClient:
    """Create a test client with mocked dependencies."""
    # Set the mock manager
    job_groups._parallel_job_manager = mock_parallel_job_manager

    with TestClient(app) as client:
        yield client

    # Clean up
    job_groups._parallel_job_manager = None


class TestSubmitJobGroup:
    """Tests for POST /api/job-group endpoint."""

    def test_submit_job_group_success(
        self,
        test_client: TestClient,
        mock_parallel_job_manager: MagicMock,
    ) -> None:
        """Test successful job group submission with valid payload."""
        # Create mock response
        mock_job_group = MagicMock()
        mock_job_group.id = "jg_abc123"
        mock_job_group.child_jobs = [
            ChildJob(job_id="j1", backend_id="b1", seed=1),
            ChildJob(job_id="j2", backend_id="b2", seed=2),
        ]
        mock_job_group.status = JobGroupStatus.RUNNING
        mock_job_group.created_at = "2024-01-01T00:00:00"

        mock_parallel_job_manager.submit_group.return_value = mock_job_group

        # Submit request
        response = test_client.post(
            "/api/job-group",
            json={
                "workflow_json": {"test": "workflow"},
                "backend_ids": ["backend1", "backend2"],
                "seed_strategy": "sequential",
                "base_seed": 42,
                "parameters": {"width": 512},
                "metadata": {"panel_id": 1},
                "timeout_seconds": 300,
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["job_group_id"] == "jg_abc123"
        assert len(data["child_jobs"]) == 2
        assert data["status"] == "running"
        mock_parallel_job_manager.submit_group.assert_called_once()

    def test_submit_job_group_invalid_payload(
        self,
        test_client: TestClient,
    ) -> None:
        """Test validation errors for invalid payload."""
        # Missing required field: backend_ids
        response = test_client.post(
            "/api/job-group",
            json={
                "workflow_json": {"test": "workflow"},
                # backend_ids is required
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_submit_job_group_no_backends(
        self,
        test_client: TestClient,
        mock_parallel_job_manager: MagicMock,
    ) -> None:
        """Test error when no backends specified."""
        response = test_client.post(
            "/api/job-group",
            json={
                "workflow_json": {"test": "workflow"},
                "backend_ids": [],  # Empty backends list
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_submit_job_group_no_valid_backends(
        self,
        test_client: TestClient,
        mock_parallel_job_manager: MagicMock,
    ) -> None:
        """Test 400 error when no valid backends available."""
        mock_parallel_job_manager.submit_group.side_effect = ValueError(
            "No valid online backends available"
        )

        response = test_client.post(
            "/api/job-group",
            json={
                "workflow_json": {"test": "workflow"},
                "backend_ids": ["offline_backend"],
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert "No valid online backends" in data["detail"]

    def test_submit_job_group_manager_not_initialized(
        self,
        test_client: TestClient,
    ) -> None:
        """Test 503 error when ParallelJobManager not initialized."""
        # Temporarily unset the manager
        original_manager = job_groups._parallel_job_manager
        job_groups._parallel_job_manager = None

        try:
            response = test_client.post(
                "/api/job-group",
                json={
                    "workflow_json": {"test": "workflow"},
                    "backend_ids": ["backend1"],
                },
            )

            assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
            assert "ParallelJobManager not initialized" in response.json()["detail"]
        finally:
            job_groups._parallel_job_manager = original_manager


class TestGetJobGroupStatus:
    """Tests for GET /api/job-groups/{id} endpoint."""

    def test_get_job_group_status_found(
        self,
        test_client: TestClient,
        mock_parallel_job_manager: MagicMock,
    ) -> None:
        """Test retrieving status of existing job group."""
        # Create mock job group
        mock_job_group = MagicMock()
        mock_job_group.id = "jg_abc123"
        mock_job_group.status = JobGroupStatus.RUNNING
        mock_job_group.child_jobs = [
            ChildJob(
                job_id="j1",
                backend_id="b1",
                seed=1,
                status=ChildJobStatus.RUNNING,
                progress=50.0,
            ),
            ChildJob(
                job_id="j2",
                backend_id="b2",
                seed=2,
                status=ChildJobStatus.COMPLETED,
                progress=100.0,
            ),
        ]
        mock_job_group.created_at = "2024-01-01T00:00:00"

        mock_parallel_job_manager.get_group.return_value = mock_job_group

        response = test_client.get("/api/job-groups/jg_abc123")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["job_group_id"] == "jg_abc123"
        assert data["status"] == "running"
        assert data["total_count"] == 2
        assert data["completed_count"] == 1
        mock_parallel_job_manager.get_group.assert_called_once_with("jg_abc123")

    def test_get_job_group_status_not_found(
        self,
        test_client: TestClient,
        mock_parallel_job_manager: MagicMock,
    ) -> None:
        """Test 404 for unknown job group ID."""
        mock_parallel_job_manager.get_group.return_value = None

        response = test_client.get("/api/job-groups/nonexistent_id")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert "not found" in data["detail"].lower()

    def test_get_job_group_status_manager_not_initialized(
        self,
        test_client: TestClient,
    ) -> None:
        """Test 503 error when manager not initialized."""
        original_manager = job_groups._parallel_job_manager
        job_groups._parallel_job_manager = None

        try:
            response = test_client.get("/api/job-groups/test_id")

            assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
            assert "ParallelJobManager not initialized" in response.json()["detail"]
        finally:
            job_groups._parallel_job_manager = original_manager


class TestCancelJobGroup:
    """Tests for DELETE /api/job-groups/{id} endpoint."""

    def test_cancel_job_group_success(
        self,
        test_client: TestClient,
        mock_parallel_job_manager: MagicMock,
    ) -> None:
        """Test successful job group cancellation."""
        mock_parallel_job_manager.cancel_group.return_value = {
            "interrupted": 2,
            "already_complete": 1,
        }

        response = test_client.delete("/api/job-groups/jg_abc123")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["cancelled"] is True
        assert data["interrupted"] == 2
        assert data["already_complete"] == 1
        mock_parallel_job_manager.cancel_group.assert_called_once_with("jg_abc123")

    def test_cancel_job_group_not_found(
        self,
        test_client: TestClient,
        mock_parallel_job_manager: MagicMock,
    ) -> None:
        """Test 404 for unknown group during cancellation."""
        mock_parallel_job_manager.cancel_group.side_effect = ValueError(
            "Job group not_found_id not found"
        )

        response = test_client.delete("/api/job-groups/not_found_id")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not found" in response.json()["detail"].lower()

    def test_cancel_job_group_manager_not_initialized(
        self,
        test_client: TestClient,
    ) -> None:
        """Test 503 error when manager not initialized."""
        original_manager = job_groups._parallel_job_manager
        job_groups._parallel_job_manager = None

        try:
            response = test_client.delete("/api/job-groups/test_id")

            assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
            assert "ParallelJobManager not initialized" in response.json()["detail"]
        finally:
            job_groups._parallel_job_manager = original_manager


class TestJobGroupRequestValidation:
    """Tests for request payload validation."""

    def test_valid_request_with_all_fields(
        self,
        test_client: TestClient,
        mock_parallel_job_manager: MagicMock,
    ) -> None:
        """Test request with all fields provided."""
        mock_job_group = MagicMock()
        mock_job_group.id = "jg_test"
        mock_job_group.child_jobs = []
        mock_job_group.status = JobGroupStatus.PENDING
        mock_job_group.created_at = "2024-01-01T00:00:00"

        mock_parallel_job_manager.submit_group.return_value = mock_job_group

        response = test_client.post(
            "/api/job-group",
            json={
                "workflow_json": {"nodes": {}, "links": []},
                "backend_ids": ["node1", "node2", "node3"],
                "seed_strategy": "golden_ratio",
                "base_seed": 12345,
                "parameters": {
                    "width": 1024,
                    "height": 1024,
                    "steps": 30,
                },
                "metadata": {
                    "panel_id": 5,
                    "scene_name": "intro",
                },
                "timeout_seconds": 600,
                "required_capabilities": ["gpu", "flux"],
            },
        )

        assert response.status_code == status.HTTP_201_CREATED

    def test_invalid_seed_strategy(
        self,
        test_client: TestClient,
    ) -> None:
        """Test validation error for invalid seed strategy."""
        response = test_client.post(
            "/api/job-group",
            json={
                "workflow_json": {"test": "workflow"},
                "backend_ids": ["backend1"],
                "seed_strategy": "invalid_strategy",
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_invalid_timeout_too_low(
        self,
        test_client: TestClient,
    ) -> None:
        """Test validation error for timeout below minimum."""
        response = test_client.post(
            "/api/job-group",
            json={
                "workflow_json": {"test": "workflow"},
                "backend_ids": ["backend1"],
                "timeout_seconds": 10,  # Below minimum of 30
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_invalid_timeout_too_high(
        self,
        test_client: TestClient,
    ) -> None:
        """Test validation error for timeout above maximum."""
        response = test_client.post(
            "/api/job-group",
            json={
                "workflow_json": {"test": "workflow"},
                "backend_ids": ["backend1"],
                "timeout_seconds": 4000,  # Above maximum of 3600
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestJobGroupResponseFormat:
    """Tests for response format and structure."""

    def test_response_contains_expected_fields(
        self,
        test_client: TestClient,
        mock_parallel_job_manager: MagicMock,
    ) -> None:
        """Verify response contains all expected fields."""
        mock_job_group = MagicMock()
        mock_job_group.id = "jg_test"
        mock_job_group.child_jobs = [
            ChildJob(
                job_id="j1",
                backend_id="b1",
                seed=42,
                status=ChildJobStatus.COMPLETED,
                progress=100.0,
                outputs={"images": [{"filename": "test.png"}]},
            ),
        ]
        mock_job_group.status = JobGroupStatus.COMPLETED
        mock_job_group.created_at = "2024-01-01T00:00:00"

        mock_parallel_job_manager.submit_group.return_value = mock_job_group

        response = test_client.post(
            "/api/job-group",
            json={
                "workflow_json": {"test": "workflow"},
                "backend_ids": ["backend1"],
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()

        # Verify response structure
        assert "job_group_id" in data
        assert "child_jobs" in data
        assert "status" in data
        assert "created_at" in data

        # Verify child job structure
        child = data["child_jobs"][0]
        assert "job_id" in child
        assert "backend_id" in child
        assert "seed" in child
        assert "status" in child
        assert "progress" in child

    def test_status_response_contains_all_fields(
        self,
        test_client: TestClient,
        mock_parallel_job_manager: MagicMock,
    ) -> None:
        """Verify status response contains all expected fields."""
        mock_job_group = MagicMock()
        mock_job_group.id = "jg_test"
        mock_job_group.status = JobGroupStatus.PARTIAL_COMPLETE
        mock_job_group.child_jobs = [
            ChildJob(job_id="j1", backend_id="b1", seed=1, status=ChildJobStatus.COMPLETED),
            ChildJob(job_id="j2", backend_id="b2", seed=2, status=ChildJobStatus.FAILED),
        ]
        mock_job_group.created_at = "2024-01-01T00:00:00"

        mock_parallel_job_manager.get_group.return_value = mock_job_group

        response = test_client.get("/api/job-groups/jg_test")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Verify status response structure
        assert "job_group_id" in data
        assert "status" in data
        assert "child_jobs" in data
        assert "completed_count" in data
        assert "failed_count" in data
        assert "total_count" in data
        assert "created_at" in data

        # Verify counts are correct
        assert data["completed_count"] == 1
        assert data["failed_count"] == 1
        assert data["total_count"] == 2
