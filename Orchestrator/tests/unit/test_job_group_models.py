"""Tests for job group Pydantic models.

This module provides comprehensive unit tests for the Pydantic models
used in multi-node parallel job generation.
"""

import json
from datetime import datetime

import pytest
from pydantic import ValidationError

from orchestrator.core.models.job_group import (
    ChildJob,
    ChildJobStatus,
    JobGroup,
    JobGroupRequest,
    JobGroupResponse,
    JobGroupStatus,
    JobGroupStatusResponse,
    SeedStrategy,
)


class TestSeedStrategyEnum:
    """Tests for SeedStrategy enum values."""

    def test_all_strategy_enum_values(self) -> None:
        """Verify all strategy enum values are accessible."""
        strategies = [
            (SeedStrategy.RANDOM, "random"),
            (SeedStrategy.SEQUENTIAL, "sequential"),
            (SeedStrategy.FIBONACCI, "fibonacci"),
            (SeedStrategy.GOLDEN_RATIO, "golden_ratio"),
        ]

        for enum_value, expected_string in strategies:
            assert enum_value.value == expected_string, (
                f"Strategy enum mismatch: {enum_value.value} != {expected_string}"
            )

    def test_strategy_from_string(self) -> None:
        """Verify strategy can be created from string values."""
        assert SeedStrategy("random") == SeedStrategy.RANDOM
        assert SeedStrategy("sequential") == SeedStrategy.SEQUENTIAL
        assert SeedStrategy("fibonacci") == SeedStrategy.FIBONACCI
        assert SeedStrategy("golden_ratio") == SeedStrategy.GOLDEN_RATIO

    def test_invalid_strategy_raises_error(self) -> None:
        """Verify invalid strategy string raises ValueError."""
        with pytest.raises(ValueError):
            SeedStrategy("invalid_strategy")


class TestChildJobStatusEnum:
    """Tests for ChildJobStatus enum values."""

    def test_all_status_enum_values(self) -> None:
        """Verify all child job status enum values are accessible."""
        statuses = [
            (ChildJobStatus.QUEUED, "queued"),
            (ChildJobStatus.RUNNING, "running"),
            (ChildJobStatus.COMPLETED, "completed"),
            (ChildJobStatus.FAILED, "failed"),
            (ChildJobStatus.TIMEOUT, "timeout"),
            (ChildJobStatus.CANCELLED, "cancelled"),
        ]

        for enum_value, expected_string in statuses:
            assert enum_value.value == expected_string, (
                f"Status enum mismatch: {enum_value.value} != {expected_string}"
            )


class TestJobGroupStatusEnum:
    """Tests for JobGroupStatus enum values."""

    def test_all_group_status_enum_values(self) -> None:
        """Verify all job group status enum values are accessible."""
        statuses = [
            (JobGroupStatus.PENDING, "pending"),
            (JobGroupStatus.RUNNING, "running"),
            (JobGroupStatus.PARTIAL_COMPLETE, "partial_complete"),
            (JobGroupStatus.COMPLETED, "completed"),
            (JobGroupStatus.FAILED, "failed"),
            (JobGroupStatus.CANCELLED, "cancelled"),
        ]

        for enum_value, expected_string in statuses:
            assert enum_value.value == expected_string, (
                f"Group status enum mismatch: {enum_value.value} != {expected_string}"
            )


class TestJobGroupRequestValidation:
    """Tests for JobGroupRequest validation."""

    def test_valid_request_payload(self) -> None:
        """Test that a valid request payload is accepted."""
        request = JobGroupRequest(
            workflow_json={"nodes": [{"id": 1}]},
            backend_ids=["backend1", "backend2"],
            seed_strategy=SeedStrategy.RANDOM,
            parameters={"width": 512, "height": 512},
            metadata={"panel_id": 1, "scene_name": "test"},
            timeout_seconds=300,
            required_capabilities=["gpu", "flux"],
        )

        assert request.workflow_json == {"nodes": [{"id": 1}]}
        assert request.backend_ids == ["backend1", "backend2"]
        assert request.seed_strategy == SeedStrategy.RANDOM
        assert request.parameters == {"width": 512, "height": 512}
        assert request.timeout_seconds == 300

    def test_request_with_minimal_fields(self) -> None:
        """Test request with only required fields."""
        request = JobGroupRequest(
            workflow_json={"test": "workflow"},
            backend_ids=["backend1"],
        )

        # Verify defaults
        assert request.seed_strategy == SeedStrategy.RANDOM
        assert request.parameters == {}
        assert request.metadata == {}
        assert request.timeout_seconds == 300
        assert request.required_capabilities == []
        assert request.base_seed is None

    def test_invalid_request_missing_workflow(self) -> None:
        """Test that missing workflow_json raises ValidationError."""
        with pytest.raises(ValidationError):
            JobGroupRequest(backend_ids=["backend1"])

    def test_invalid_request_missing_backends(self) -> None:
        """Test that missing backend_ids raises ValidationError."""
        with pytest.raises(ValidationError):
            JobGroupRequest(workflow_json={"test": "workflow"})

    def test_invalid_request_empty_backends(self) -> None:
        """Test that empty backend_ids list raises ValidationError."""
        with pytest.raises(ValidationError):
            JobGroupRequest(
                workflow_json={"test": "workflow"},
                backend_ids=[],
            )

    def test_invalid_timeout_too_low(self) -> None:
        """Test that timeout below minimum raises ValidationError."""
        with pytest.raises(ValidationError):
            JobGroupRequest(
                workflow_json={"test": "workflow"},
                backend_ids=["backend1"],
                timeout_seconds=29,  # Below minimum of 30
            )

    def test_invalid_timeout_too_high(self) -> None:
        """Test that timeout above maximum raises ValidationError."""
        with pytest.raises(ValidationError):
            JobGroupRequest(
                workflow_json={"test": "workflow"},
                backend_ids=["backend1"],
                timeout_seconds=3601,  # Above maximum of 3600
            )

    def test_valid_base_seed(self) -> None:
        """Test that base_seed can be set."""
        request = JobGroupRequest(
            workflow_json={"test": "workflow"},
            backend_ids=["backend1"],
            base_seed=12345,
        )
        assert request.base_seed == 12345


class TestChildJobModel:
    """Tests for ChildJob model."""

    def test_child_job_defaults(self) -> None:
        """Test ChildJob default values."""
        job = ChildJob(
            job_id="j_test123",
            backend_id="backend1",
            seed=42,
        )

        assert job.job_id == "j_test123"
        assert job.backend_id == "backend1"
        assert job.seed == 42
        assert job.status == ChildJobStatus.QUEUED
        assert job.progress == 0.0
        assert job.current_step is None
        assert job.outputs == {}
        assert job.error_message is None
        assert job.error_type is None
        assert job.started_at is None
        assert job.completed_at is None

    def test_child_job_status_transitions(self) -> None:
        """Test that child job status can be updated."""
        job = ChildJob(
            job_id="j_test123",
            backend_id="backend1",
            seed=42,
        )

        # Test all valid status transitions
        statuses = [
            ChildJobStatus.RUNNING,
            ChildJobStatus.COMPLETED,
            ChildJobStatus.FAILED,
            ChildJobStatus.TIMEOUT,
            ChildJobStatus.CANCELLED,
        ]

        for status in statuses:
            job.status = status
            assert job.status == status

    def test_child_job_progress_validation(self) -> None:
        """Test that progress is validated to be 0-100."""
        # Valid progress values
        job = ChildJob(job_id="j1", backend_id="b1", seed=1, progress=50.0)
        assert job.progress == 50.0

        # Boundary values
        job = ChildJob(job_id="j1", backend_id="b1", seed=1, progress=0.0)
        assert job.progress == 0.0

        job = ChildJob(job_id="j1", backend_id="b1", seed=1, progress=100.0)
        assert job.progress == 100.0

        # Invalid values should raise ValidationError
        with pytest.raises(ValidationError):
            ChildJob(job_id="j1", backend_id="b1", seed=1, progress=101.0)

        with pytest.raises(ValidationError):
            ChildJob(job_id="j1", backend_id="b1", seed=1, progress=-1.0)


class TestJobGroupModel:
    """Tests for JobGroup model."""

    @pytest.fixture
    def sample_child_jobs(self) -> list[ChildJob]:
        """Create a list of sample child jobs for testing."""
        return [
            ChildJob(job_id="j1", backend_id="b1", seed=1, status=ChildJobStatus.COMPLETED),
            ChildJob(job_id="j2", backend_id="b2", seed=2, status=ChildJobStatus.FAILED),
            ChildJob(job_id="j3", backend_id="b3", seed=3, status=ChildJobStatus.RUNNING),
            ChildJob(job_id="j4", backend_id="b4", seed=4, status=ChildJobStatus.TIMEOUT),
            ChildJob(job_id="j5", backend_id="b5", seed=5, status=ChildJobStatus.QUEUED),
        ]

    @pytest.fixture
    def sample_job_group(self, sample_child_jobs: list[ChildJob]) -> JobGroup:
        """Create a sample job group for testing."""
        return JobGroup(
            id="jg_test123",
            workflow_json={"test": "workflow"},
            child_jobs=sample_child_jobs,
            status=JobGroupStatus.RUNNING,
        )

    def test_job_group_defaults(self) -> None:
        """Test JobGroup default values."""
        group = JobGroup(
            id="jg_test",
            workflow_json={"test": "workflow"},
        )

        assert group.id == "jg_test"
        assert group.workflow_json == {"test": "workflow"}
        assert group.panel_id is None
        assert group.parameters == {}
        assert group.seed_strategy == SeedStrategy.RANDOM
        assert group.base_seed is None
        assert group.child_jobs == []
        assert group.status == JobGroupStatus.PENDING
        assert group.timeout_seconds == 300
        assert group.metadata == {}
        assert group.completed_at is None

    def test_job_group_computed_properties(self, sample_job_group: JobGroup) -> None:
        """Test computed properties: completed_count, failed_count, running_count, total_count."""
        # 1 completed, 1 failed, 1 running, 1 timeout, 1 queued
        assert sample_job_group.completed_count == 1
        assert sample_job_group.failed_count == 2  # FAILED + TIMEOUT
        assert sample_job_group.running_count == 2  # RUNNING + QUEUED
        assert sample_job_group.total_count == 5

    def test_job_group_all_completed(self) -> None:
        """Test computed properties when all jobs completed."""
        jobs = [
            ChildJob(job_id="j1", backend_id="b1", seed=1, status=ChildJobStatus.COMPLETED),
            ChildJob(job_id="j2", backend_id="b2", seed=2, status=ChildJobStatus.COMPLETED),
        ]
        group = JobGroup(
            id="jg_test",
            workflow_json={},
            child_jobs=jobs,
        )

        assert group.completed_count == 2
        assert group.failed_count == 0
        assert group.running_count == 0
        assert group.total_count == 2

    def test_job_group_all_failed(self) -> None:
        """Test computed properties when all jobs failed."""
        jobs = [
            ChildJob(job_id="j1", backend_id="b1", seed=1, status=ChildJobStatus.FAILED),
            ChildJob(job_id="j2", backend_id="b2", seed=2, status=ChildJobStatus.TIMEOUT),
        ]
        group = JobGroup(
            id="jg_test",
            workflow_json={},
            child_jobs=jobs,
        )

        assert group.completed_count == 0
        assert group.failed_count == 2
        assert group.running_count == 0
        assert group.total_count == 2


class TestJobGroupSerialization:
    """Tests for JSON serialization and deserialization."""

    def test_job_group_request_serialization(self) -> None:
        """Test that JobGroupRequest can be serialized to JSON."""
        request = JobGroupRequest(
            workflow_json={"nodes": [{"id": 1}]},
            backend_ids=["backend1", "backend2"],
            seed_strategy=SeedStrategy.SEQUENTIAL,
            base_seed=42,
        )

        # Convert to dict (Pydantic model_dump)
        data = request.model_dump()

        assert data["workflow_json"] == {"nodes": [{"id": 1}]}
        assert data["backend_ids"] == ["backend1", "backend2"]
        assert data["seed_strategy"] == "sequential"
        assert data["base_seed"] == 42

    def test_job_group_response_serialization(self) -> None:
        """Test that JobGroupResponse can be serialized to JSON."""
        child_jobs = [
            ChildJob(job_id="j1", backend_id="b1", seed=1),
        ]
        response = JobGroupResponse(
            job_group_id="jg_test123",
            child_jobs=child_jobs,
            status=JobGroupStatus.RUNNING,
            created_at=datetime.utcnow(),
        )

        data = response.model_dump()

        assert data["job_group_id"] == "jg_test123"
        assert len(data["child_jobs"]) == 1
        assert data["status"] == "running"
        assert "created_at" in data

    def test_job_group_status_response_serialization(self) -> None:
        """Test that JobGroupStatusResponse can be serialized."""
        child_jobs = [
            ChildJob(job_id="j1", backend_id="b1", seed=1, status=ChildJobStatus.COMPLETED),
        ]
        response = JobGroupStatusResponse(
            job_group_id="jg_test123",
            status=JobGroupStatus.COMPLETED,
            child_jobs=child_jobs,
            completed_count=1,
            failed_count=0,
            total_count=1,
            created_at=datetime.utcnow(),
        )

        data = response.model_dump()

        assert data["job_group_id"] == "jg_test123"
        assert data["completed_count"] == 1
        assert data["failed_count"] == 0
        assert data["total_count"] == 1

    def test_child_job_json_serialization(self) -> None:
        """Test that ChildJob serializes correctly to JSON."""
        job = ChildJob(
            job_id="j1",
            backend_id="b1",
            seed=42,
            status=ChildJobStatus.COMPLETED,
            progress=100.0,
            outputs={"images": [{"filename": "test.png"}]},
        )

        data = job.model_dump()

        assert data["job_id"] == "j1"
        assert data["backend_id"] == "b1"
        assert data["seed"] == 42
        assert data["status"] == "completed"
        assert data["progress"] == 100.0
        assert data["outputs"] == {"images": [{"filename": "test.png"}]}

    def test_round_trip_serialization(self) -> None:
        """Test that models can be serialized and deserialized."""
        original = JobGroupRequest(
            workflow_json={"test": "data"},
            backend_ids=["b1", "b2"],
            seed_strategy=SeedStrategy.FIBONACCI,
            parameters={"width": 512},
            metadata={"panel_id": 5},
            timeout_seconds=600,
        )

        # Serialize
        data = original.model_dump()
        json_str = json.dumps(data)

        # Deserialize
        restored_data = json.loads(json_str)
        restored = JobGroupRequest(**restored_data)

        assert restored.workflow_json == original.workflow_json
        assert restored.backend_ids == original.backend_ids
        assert restored.seed_strategy == original.seed_strategy
        assert restored.parameters == original.parameters
        assert restored.metadata == original.metadata
        assert restored.timeout_seconds == original.timeout_seconds


class TestJobGroupWithMetadata:
    """Tests for JobGroup metadata handling."""

    def test_job_group_with_panel_id(self) -> None:
        """Test JobGroup with panel_id in metadata."""
        group = JobGroup(
            id="jg_test",
            workflow_json={},
            panel_id=5,
            metadata={"scene_name": "intro", "panel_id": 5},
        )
        assert group.panel_id == 5
        assert group.metadata["scene_name"] == "intro"

    def test_job_group_request_metadata_extraction(self) -> None:
        """Test that panel_id can be extracted from metadata."""
        request = JobGroupRequest(
            workflow_json={},
            backend_ids=["b1"],
            metadata={"panel_id": 10, "scene_name": "climax"},
        )
        assert request.metadata["panel_id"] == 10
        assert request.metadata["scene_name"] == "climax"
