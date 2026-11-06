"""Explicit, backend-bound model-file installation jobs."""

from __future__ import annotations

import asyncio
import errno
import hashlib
import httpx
import ipaddress
import json
import logging
import os
import re
import shutil
import socket
import tempfile
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any, Callable, Literal
from urllib.parse import urljoin, urlsplit

from pydantic import BaseModel, ConfigDict, Field, model_validator

from orchestrator.backend_capabilities import (
    BackendManagementDescriptor,
    DependencyRequirement,
    ManualDependencyPlan,
    VerifiedModelRoot,
    capability_inspector,
    make_manual_dependency_plan,
)
from orchestrator.core.models.backend import BackendConfig

logger = logging.getLogger(__name__)

_CONFIG_PATH = Path(__file__).parent / "data" / "backend_installation.json"
_MAX_MODEL_BYTES = 512 * 1024**3
_MAX_JOB_SECONDS = 24 * 60 * 60
_MAX_CONCURRENT_JOBS = 2
_MAX_ACTIVE_JOBS = 16
_MAX_RETAINED_JOBS = 256
_DOWNLOAD_CHUNK_BYTES = 1024 * 1024
_FREE_SPACE_RESERVE = 64 * 1024**2
_MAX_REDIRECTS = 5
_TRUSTED_PUBLISHER_SUFFIXES = (
    "huggingface.co",
    "hf.co",
    "github.com",
    "civitai.com",
)
_TRUSTED_REDIRECT_HOSTS = {
    "raw.githubusercontent.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
}
_SAFE_CATEGORY = re.compile(r"^[a-z][a-z0-9_-]{0,127}$")
_SAFE_SSH_HOST = re.compile(r"^[A-Za-z0-9._:-]{1,255}$")
_SAFE_SSH_USER = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


class BackendInstallationConfig(BaseModel):
    """Secret-free management access configuration for one managed backend."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    installation_access: Literal["local-cli", "remote-management"]
    host_identity: str = Field(min_length=1, max_length=255)
    installation_root: str = Field(min_length=1, max_length=4096)
    service_environment: str = Field(min_length=1, max_length=4096)
    model_roots: dict[str, str] = Field(min_length=1, max_length=64)
    ssh_host: str | None = Field(default=None, max_length=255)
    ssh_user: str | None = Field(default=None, max_length=128)
    ssh_port: int = Field(default=22, ge=1, le=65535)

    @model_validator(mode="after")
    def validate_access(self) -> "BackendInstallationConfig":
        if not _is_absolute_path(self.installation_root):
            raise ValueError("installation_root must be an absolute path")
        if not _is_absolute_path(self.service_environment):
            raise ValueError("service_environment must be an absolute path")
        for value in (self.installation_root, self.service_environment, *self.model_roots.values()):
            _validate_configured_path(value)
        if not self.host_identity.strip() or any(ord(char) < 32 for char in self.host_identity):
            raise ValueError("host_identity is invalid")
        if not self.model_roots or any(
            not _SAFE_CATEGORY.fullmatch(category) for category in self.model_roots
        ):
            raise ValueError("model_roots must use lowercase folder categories")
        if sum(len(category) + len(path) for category, path in self.model_roots.items()) > 32_000:
            raise ValueError("model_roots is too large for the bounded SSH protocol")
        if self.installation_access == "remote-management":
            if not self.ssh_host or not _SAFE_SSH_HOST.fullmatch(self.ssh_host):
                raise ValueError("remote-management requires a valid SSH host")
            if (
                self.ssh_host.startswith("-")
                or not self.ssh_user
                or self.ssh_user.startswith("-")
                or not _SAFE_SSH_USER.fullmatch(self.ssh_user)
            ):
                raise ValueError("remote-management requires a valid SSH user")
        elif self.ssh_host is not None or self.ssh_user is not None:
            raise ValueError("local-cli configuration must not include SSH identity")
        return self


class ModelInstallPlanRequest(BaseModel):
    graph_fingerprint: str = Field(min_length=1, max_length=256)
    dependency: DependencyRequirement


class InstallJob(BaseModel):
    """Public job state; authorization is scoped to these exact immutable fields."""

    job_id: str
    backend_id: str
    graph_fingerprint: str
    job_fingerprint: str
    dependency: DependencyRequirement
    status: Literal[
        "planned",
        "awaiting_authorization",
        "downloading",
        "installing",
        "verifying",
        "ready",
        "downloaded_unavailable",
        "failed",
        "cancelled",
        "manual_required",
    ]
    authorized_at: datetime | None = None
    backend_comfy_version: str | None = None
    service_environment: str | None = None
    service_environment_status: Literal[
        "unknown", "configured_path_exists_process_unverified"
    ] = "unknown"
    destination_root: str | None = None
    destination_path: str | None = None
    object_info_hash: str | None = None
    transferred_bytes: int = 0
    sha256: str | None = None
    error_code: str | None = None
    manual_instructions: list[str] = Field(default_factory=list)
    ready_evidence: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class InstallPlanResult(BaseModel):
    backend_id: str
    manual_required: bool
    reason: str | None = None
    manual_plan: ManualDependencyPlan
    job: InstallJob | None = None
    backend_comfy_version: str | None = None
    service_environment: str | None = None
    service_environment_status: Literal[
        "unknown", "configured_path_exists_process_unverified"
    ] = "unknown"


class InstallAuthorization(BaseModel):
    authorized: Literal[True]
    graph_fingerprint: str = Field(min_length=1, max_length=256)
    job_fingerprint: str = Field(min_length=64, max_length=64)


@dataclass
class _JobRecord:
    public: InstallJob
    config: BackendInstallationConfig
    backend_fingerprint: str
    config_fingerprint: str
    verified_context: dict[str, str]
    expected_size: int | None
    expected_sha256: str | None
    cancelled: asyncio.Event
    task: asyncio.Task[None] | None = None


class BackendInstallationManager:
    """Own secret-free config, immutable plans and bounded model-file jobs."""

    def __init__(self, config_path: Path = _CONFIG_PATH) -> None:
        self._config_path = config_path
        self._configs, self._config_error = self._load_configs()
        self._jobs: dict[str, _JobRecord] = {}
        self._destination_jobs: dict[tuple[str, str], str] = {}
        self._lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(_MAX_CONCURRENT_JOBS)

    def get_config(self, backend_id: str) -> BackendInstallationConfig | None:
        config = self._configs.get(backend_id)
        return config.model_copy(deep=True) if config else None

    async def configure(
        self, backend_id: str, config: BackendInstallationConfig
    ) -> BackendInstallationConfig:
        if self._config_error:
            raise RuntimeError("management configuration store is unreadable")
        async with self._lock:
            updated = dict(self._configs)
            updated[backend_id] = config.model_copy(deep=True)
            await asyncio.to_thread(self._save_configs, updated)
            self._configs = updated
            capability_inspector.set_management(
                backend_id, BackendManagementDescriptor()
            )
        return config.model_copy(deep=True)

    async def remove_config(self, backend_id: str) -> None:
        if self._config_error:
            raise RuntimeError("management configuration store is unreadable")
        async with self._lock:
            updated = dict(self._configs)
            updated.pop(backend_id, None)
            await asyncio.to_thread(self._save_configs, updated)
            self._configs = updated
            capability_inspector.set_management(
                backend_id, BackendManagementDescriptor()
            )

    async def verify_management(
        self, backend_id: str, backend: BackendConfig
    ) -> BackendManagementDescriptor:
        config = self._configs.get(backend_id)
        if config is None:
            raise ValueError("management_access_not_configured")
        _assert_backend_binding(backend_id, backend)
        if config.installation_access == "local-cli":
            _assert_local_backend_binding(backend, config)
        result = await self._inspect_management(backend_id, config)
        observed = datetime.now(timezone.utc)
        roots = {
            category: [
                VerifiedModelRoot(
                    path=path,
                    evidence=json.dumps(
                        {
                            "config_fingerprint": _fingerprint(config.model_dump(mode="json")),
                            "host_identity": config.host_identity,
                            "installation_root": result["installation_root"],
                            "service_environment": result["service_environment"],
                            "process_association": "unverified",
                        },
                        sort_keys=True,
                    ),
                    observed_at=observed,
                )
            ]
            for category, path in result["model_roots"].items()
        }
        descriptor = BackendManagementDescriptor(
            installation_access=config.installation_access,
            storage="unknown",
            model_roots=roots,
            service_environment=result["service_environment"],
        )
        capability_inspector.set_management(backend_id, descriptor)
        return descriptor

    async def plan(
        self,
        backend_id: str,
        backend: BackendConfig,
        request: ModelInstallPlanRequest,
    ) -> InstallPlanResult:
        capability = await capability_inspector.inspect(backend, refresh=True)
        manual = make_manual_dependency_plan(
            backend_id,
            _dependency_plan_request(request),
            capability,
        )
        def plan_result(
            *,
            manual_required: bool,
            manual_plan: ManualDependencyPlan,
            reason: str | None = None,
            job: InstallJob | None = None,
        ) -> InstallPlanResult:
            return InstallPlanResult(
                backend_id=backend_id,
                manual_required=manual_required,
                reason=reason,
                manual_plan=manual_plan,
                job=job,
                backend_comfy_version=capability.comfy_version,
                service_environment=capability.management.service_environment,
                service_environment_status=(
                    "configured_path_exists_process_unverified"
                    if capability.management.service_environment
                    else "unknown"
                ),
            )

        reason = _plan_block_reason(request.dependency, manual)
        config = self._configs.get(backend_id)
        if reason is None and config is None:
            reason = "management_access_not_configured"
        if reason is None and config is not None:
            reason = _management_block_reason(
                backend_id, config, capability, request.dependency
            )
        if reason is None and config is not None:
            try:
                category = request.dependency.loader_category
                root = _verified_root(config, capability, category)
                context = _verified_context(config, capability, category)
                if config.installation_access == "local-cli":
                    _assert_local_backend_binding(backend, config)
                    actual = _inspect_local(config)
                    if not _local_context_matches(actual, context, category):
                        raise InstallationUnavailable("management_identity_changed")
                    target = _local_destination(root, request.dependency.filename, create=False)
                    if target.exists() or target.is_symlink():
                        reason = "destination_already_exists"
                else:
                    inspected = await self._ssh_exchange(
                        config,
                        {
                            "protocol": 1,
                            "action": "inspect",
                            "backend_id": backend_id,
                            **_remote_identity(config, context),
                            "root_category": request.dependency.loader_category,
                            "filename": request.dependency.filename,
                        },
                    )
                    _assert_remote_identity(inspected, backend_id, config, context)
                    if inspected.get("exists"):
                        reason = "destination_already_exists"
                    elif inspected.get("destination") != _destination_display(
                        root, request.dependency.filename
                    ):
                        reason = "remote_destination_mapping_mismatch"
            except InstallationUnavailable as error:
                reason = error.code
            except (OSError, ValueError):
                reason = "management_root_unverified"
        if reason is not None:
            instructions = list(manual.manual_instructions)
            instructions.extend(_manual_instructions(reason, config, request.dependency))
            manual = manual.model_copy(update={"manual_instructions": _unique(instructions)})
            return plan_result(
                manual_required=True,
                reason=reason,
                manual_plan=manual,
            )

        if config is None:
            return plan_result(
                manual_required=True,
                reason="management_access_not_configured",
                manual_plan=manual.model_copy(
                    update={
                        "manual_instructions": _unique(
                            [*manual.manual_instructions, *_manual_instructions("management_access_not_configured", None, request.dependency)]
                        )
                    }
                ),
            )
        dependency = request.dependency.model_copy(deep=True)
        root = _verified_root(config, capability, dependency.loader_category)
        context = _verified_context(config, capability, dependency.loader_category)
        if root is None or context is None:
            return plan_result(
                manual_required=True,
                reason="model_root_unverified",
                manual_plan=manual.model_copy(
                    update={
                        "manual_instructions": _unique(
                            [*manual.manual_instructions, *_manual_instructions("model_root_unverified", config, dependency)]
                        )
                    }
                ),
            )
        target_path = _destination_display(root, dependency.filename)
        config_fingerprint = _fingerprint(config.model_dump(mode="json"))
        backend_fingerprint = _fingerprint(backend.model_dump(mode="json"))
        job_fingerprint = _fingerprint(
            {
                "backend_id": backend_id,
                "backend_fingerprint": backend_fingerprint,
                "config_fingerprint": config_fingerprint,
                "graph_fingerprint": request.graph_fingerprint,
                "object_info_hash": capability.object_info_hash,
                "dependency": dependency.model_dump(mode="json"),
                "destination_root": root,
                "destination_path": target_path,
                "verified_context": context,
            }
        )
        now = datetime.now(timezone.utc)
        job_id = uuid.uuid4().hex
        job = InstallJob(
            job_id=job_id,
            backend_id=backend_id,
            graph_fingerprint=request.graph_fingerprint,
            job_fingerprint=job_fingerprint,
            dependency=dependency,
            status="planned",
            destination_root=root,
            destination_path=target_path,
            object_info_hash=capability.object_info_hash,
            backend_comfy_version=capability.comfy_version,
            service_environment=capability.management.service_environment,
            service_environment_status=(
                "configured_path_exists_process_unverified"
                if capability.management.service_environment
                else "unknown"
            ),
            created_at=now,
            updated_at=now,
        )
        destination_key = (backend_id, target_path.casefold())
        async with self._lock:
            current_config = self._configs.get(backend_id)
            if current_config is None or _fingerprint(current_config.model_dump(mode="json")) != config_fingerprint:
                return plan_result(
                    manual_required=True,
                    reason="management_configuration_changed",
                    manual_plan=manual.model_copy(
                        update={"manual_instructions": _unique([*manual.manual_instructions, "Management configuration changed while this plan was being prepared; verify again."])}
                    ),
                )
            self._prune_jobs()
            active = sum(
                1
                for item in self._jobs.values()
                if item.public.status
                in {"planned", "awaiting_authorization", "downloading", "installing", "verifying"}
            )
            if active >= _MAX_ACTIVE_JOBS:
                return plan_result(
                    manual_required=True,
                    reason="install_job_capacity_reached",
                    manual_plan=manual.model_copy(
                        update={"manual_instructions": _unique([*manual.manual_instructions, "The bounded install-job queue is full; wait for an existing job to finish, then plan again."])}
                    ),
                )
            existing_id = self._destination_jobs.get(destination_key)
            if existing_id:
                existing = self._jobs.get(existing_id)
                if existing and existing.public.status not in {"failed", "cancelled"}:
                    return plan_result(
                        manual_required=True,
                        reason="duplicate_destination_job",
                        manual_plan=manual.model_copy(
                            update={
                                "manual_instructions": _unique(
                                    [*manual.manual_instructions, f"Resolve existing model job {existing_id} before creating another job for this destination."]
                                )
                            }
                        ),
                    )
            source = dependency.source
            self._jobs[job_id] = _JobRecord(
                public=job,
                config=config.model_copy(deep=True),
                backend_fingerprint=backend_fingerprint,
                config_fingerprint=config_fingerprint,
                verified_context=dict(context),
                expected_size=source.size_bytes if source else None,
                expected_sha256=source.sha256.lower() if source and source.sha256 else None,
                cancelled=asyncio.Event(),
            )
            self._destination_jobs[destination_key] = job_id
            record = self._jobs[job_id]
            record.public = record.public.model_copy(
                update={"status": "awaiting_authorization", "updated_at": datetime.now(timezone.utc)}
            )
        return plan_result(
            manual_required=False,
            manual_plan=manual,
            job=record.public.model_copy(deep=True),
        )

    async def authorize(
        self,
        job_id: str,
        backend: BackendConfig,
        authorization: InstallAuthorization,
    ) -> InstallJob:
        async with self._lock:
            record = self._get_job(job_id)
            if record.public.status != "awaiting_authorization":
                raise ValueError("job_not_awaiting_authorization")
            if (
                authorization.graph_fingerprint != record.public.graph_fingerprint
                or authorization.job_fingerprint != record.public.job_fingerprint
            ):
                raise ValueError("authorization_fingerprint_mismatch")
            current_config = self._configs.get(backend.id)
            if (
                _fingerprint(backend.model_dump(mode="json")) != record.backend_fingerprint
                or _fingerprint(record.config.model_dump(mode="json")) != record.config_fingerprint
                or current_config is None
                or _fingerprint(current_config.model_dump(mode="json")) != record.config_fingerprint
            ):
                raise ValueError("backend_or_management_configuration_changed")
            capability = await capability_inspector.inspect(backend, refresh=True)
            if capability.object_info_hash != record.public.object_info_hash:
                raise ValueError("backend_loader_schema_changed")
            loader = next(
                (
                    item
                    for item in capability.loader_enums
                    if item.node_class == record.public.dependency.loader_node_class
                    and item.input_name == record.public.dependency.loader_input
                ),
                None,
            )
            if loader is None or record.public.dependency.filename in loader.options:
                raise ValueError("dependency_changed_or_already_advertised")
            if loader.folder_category not in (None, record.public.dependency.loader_category):
                raise ValueError("loader_category_changed")
            root = _verified_root(
                record.config, capability, record.public.dependency.loader_category
            )
            context = _verified_context(
                record.config, capability, record.public.dependency.loader_category
            )
            if root is None or context != record.verified_context:
                raise ValueError("model_root_verification_expired")
            if record.config.installation_access == "local-cli":
                _assert_local_backend_binding(backend, record.config)
                actual = _inspect_local(record.config)
                if not _local_context_matches(
                    actual, context, record.public.dependency.loader_category
                ):
                    raise ValueError("management_identity_changed")
                target = _local_destination(root, record.public.dependency.filename, create=False)
                if target.exists() or target.is_symlink():
                    raise ValueError("destination_already_exists")
            else:
                inspected = await self._ssh_exchange(
                    record.config,
                    {
                        "protocol": 1,
                        "action": "inspect",
                        "backend_id": record.public.backend_id,
                        **_remote_identity(record.config, context),
                        "root_category": record.public.dependency.loader_category,
                        "filename": record.public.dependency.filename,
                    },
                )
                _assert_remote_identity(
                    inspected, record.public.backend_id, record.config, context
                )
                if inspected.get("exists") or inspected.get("destination") != record.public.destination_path:
                    raise ValueError("destination_changed_or_exists")
            now = datetime.now(timezone.utc)
            record.public = record.public.model_copy(
                update={"status": "downloading", "authorized_at": now, "updated_at": now}
            )
            record.task = asyncio.create_task(self._run_job(record, backend))
            return record.public.model_copy(deep=True)

    def get_job(self, job_id: str, backend_id: str) -> InstallJob:
        record = self._get_job(job_id)
        if record.public.backend_id != backend_id:
            raise KeyError(job_id)
        return record.public.model_copy(deep=True)

    async def cancel(self, job_id: str, backend_id: str) -> InstallJob:
        async with self._lock:
            record = self._get_job(job_id)
            if record.public.backend_id != backend_id:
                raise KeyError(job_id)
            if record.public.status in {
                "verifying", "ready", "downloaded_unavailable", "failed", "cancelled", "manual_required"
            }:
                return record.public.model_copy(deep=True)
            record.cancelled.set()
            if record.task is None:
                self._set_status(record, "cancelled")
                self._release_destination(record)
            return record.public.model_copy(deep=True)

    def _get_job(self, job_id: str) -> _JobRecord:
        record = self._jobs.get(job_id)
        if record is None:
            raise KeyError(job_id)
        return record

    def _prune_jobs(self) -> None:
        removable = sorted(
            (
                record
                for record in self._jobs.values()
                if record.public.status
                in {"ready", "downloaded_unavailable", "failed", "cancelled", "manual_required"}
            ),
            key=lambda record: record.public.created_at,
        )
        while len(self._jobs) >= _MAX_RETAINED_JOBS and removable:
            record = removable.pop(0)
            self._jobs.pop(record.public.job_id, None)
            key = (record.public.backend_id, (record.public.destination_path or "").casefold())
            if self._destination_jobs.get(key) == record.public.job_id:
                self._destination_jobs.pop(key, None)

    def _load_configs(self) -> tuple[dict[str, BackendInstallationConfig], bool]:
        if not self._config_path.exists():
            return {}, False
        try:
            payload = json.loads(self._config_path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict) or payload.get("version") != 1 or not isinstance(payload.get("backends"), dict):
                raise ValueError("invalid configuration format")
            configs = {
                backend_id: BackendInstallationConfig.model_validate(config)
                for backend_id, config in payload["backends"].items()
            }
            return configs, False
        except (OSError, ValueError, TypeError):
            logger.error("Backend installation configuration could not be read; management stays disabled")
            return {}, True

    def _save_configs(self, configs: dict[str, BackendInstallationConfig]) -> None:
        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self._config_path.with_name(f".{self._config_path.name}.{uuid.uuid4().hex}.part")
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        descriptor = os.open(temp_path, flags, 0o600)
        try:
            payload = {
                "version": 1,
                "backends": {
                    backend_id: config.model_dump(mode="json")
                    for backend_id, config in configs.items()
                },
            }
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                json.dump(payload, output, indent=2, sort_keys=True)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temp_path, self._config_path)
            try:
                self._config_path.chmod(0o600)
            except OSError:
                pass
        except BaseException:
            try:
                os.close(descriptor)
            except OSError:
                pass
            temp_path.unlink(missing_ok=True)
            raise

    async def _inspect_management(
        self, backend_id: str, config: BackendInstallationConfig
    ) -> dict[str, Any]:
        request = {
            "protocol": 1,
            "action": "inspect",
            "backend_id": backend_id,
            **_remote_identity(config),
        }
        if config.installation_access == "remote-management":
            result = await self._ssh_exchange(config, request)
            _assert_remote_identity(result, backend_id, config)
            return result
        local = _inspect_local(config)
        if local["host_identity"].casefold() != config.host_identity.casefold():
            raise InstallationUnavailable("host_identity_mismatch")
        return local

    async def _ssh_exchange(
        self,
        config: BackendInstallationConfig,
        request: dict[str, Any],
        *,
        upload_path: Path | None = None,
        cancelled: asyncio.Event | None = None,
        on_commit: Callable[[], None] | None = None,
    ) -> dict[str, Any]:
        ssh = shutil.which("ssh")
        if not ssh:
            raise InstallationUnavailable("openssh_client_unavailable")
        host = config.ssh_host or ""
        if ":" in host and not host.startswith("["):
            host = f"[{host}]"
        destination = f"{config.ssh_user}@{host}"
        args = [
            ssh,
            "-T",
            "-o", f"HostName={config.ssh_host}",
            "-o", "CanonicalizeHostname=no",
            "-o", "BatchMode=yes",
            "-o", "StrictHostKeyChecking=yes",
            "-o", "PasswordAuthentication=no",
            "-o", "KbdInteractiveAuthentication=no",
            "-o", "ClearAllForwardings=yes",
            "-o", "ProxyCommand=none",
            "-o", "ProxyJump=none",
            "-o", "PermitLocalCommand=no",
            "-o", "ConnectTimeout=10",
            "-p", str(config.ssh_port),
            destination,
            "python", "-I", "-m", "orchestrator.backend_installation_helper",
        ]
        try:
            process = await asyncio.create_subprocess_exec(
                *args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
        except OSError as error:
            raise InstallationUnavailable("openssh_start_failed") from error
        if process.stdin is None or process.stdout is None:
            await _stop_subprocess(process)
            raise InstallationUnavailable("remote_helper_protocol_error")
        output_task = asyncio.create_task(process.stdout.read(64 * 1024 + 1))
        header = json.dumps(request, separators=(",", ":")).encode("utf-8") + b"\n"
        if len(header) > 64 * 1024:
            await _stop_subprocess(process)
            raise InstallationUnavailable("management_config_too_large")
        started = time.monotonic()
        try:
            process.stdin.write(header)
            await asyncio.wait_for(process.stdin.drain(), timeout=90)
            if upload_path is not None:
                with upload_path.open("rb") as source:
                    while chunk := await asyncio.to_thread(source.read, _DOWNLOAD_CHUNK_BYTES):
                        if cancelled and cancelled.is_set():
                            raise InstallCancelled()
                        if time.monotonic() - started > _MAX_JOB_SECONDS:
                            raise InstallationUnavailable("job_time_limit_exceeded")
                        process.stdin.write(chunk)
                        await asyncio.wait_for(process.stdin.drain(), timeout=90)
                if cancelled and cancelled.is_set():
                    raise InstallCancelled()
                if on_commit:
                    on_commit()
                process.stdin.write(b'{"commit":true}\n')
                await asyncio.wait_for(process.stdin.drain(), timeout=90)
            process.stdin.close()
            await asyncio.wait_for(process.stdin.wait_closed(), timeout=90)
            stdout = await asyncio.wait_for(output_task, timeout=30)
            exit_code = await asyncio.wait_for(process.wait(), timeout=30)
        except (asyncio.TimeoutError, BrokenPipeError, OSError) as error:
            process.stdin.close()
            await _stop_subprocess(process)
            raise InstallationUnavailable("remote_helper_unavailable") from error
        except InstallCancelled:
            process.stdin.close()
            await _stop_subprocess(process)
            raise
        if len(stdout) > 64 * 1024 or exit_code != 0:
            raise InstallationUnavailable("remote_helper_failed")
        try:
            response = json.loads(stdout)
        except (ValueError, UnicodeDecodeError) as error:
            raise InstallationUnavailable("remote_helper_protocol_error") from error
        if not isinstance(response, dict) or response.get("ok") is not True:
            code = response.get("error_code") if isinstance(response, dict) else None
            safe_codes = {
                "destination_exists",
                "destination_symlink_disallowed",
                "destination_outside_root",
                "insufficient_space",
                "model_root_unverified",
                "host_identity_mismatch",
                "management_identity_changed",
                "comfy_root_unverified",
                "environment_missing",
            }
            raise InstallationUnavailable(
                code if code in safe_codes else "remote_helper_failed"
            )
        return response

    async def _run_job(
        self, record: _JobRecord, backend: BackendConfig
    ) -> None:
        try:
            async with self._semaphore:
                await self._run_job_limited(record, backend)
        except asyncio.CancelledError:
            self._set_status(record, "cancelled")
            self._release_destination(record)

    async def _run_job_limited(
        self, record: _JobRecord, backend: BackendConfig
    ) -> None:
        public = record.public
        config = record.config
        destination_root = public.destination_root or ""
        part_path: Path | None = None
        staged_path: Path | None = None
        temp_dir: tempfile.TemporaryDirectory[str] | None = None
        installed = False
        try:
            self._set_status(record, "downloading")
            source = public.dependency.source
            if source is None or source.url is None:
                raise InstallationUnavailable("source_url_missing")
            if record.cancelled.is_set():
                raise InstallCancelled()

            if config.installation_access == "local-cli":
                _assert_local_backend_binding(backend, config)
                if not _local_context_matches(
                    _inspect_local(config),
                    record.verified_context,
                    public.dependency.loader_category,
                ):
                    raise InstallationUnavailable("management_identity_changed")
                target = _local_destination(
                    destination_root, public.dependency.filename, create=True
                )
                part_path = target.with_name(f".{target.name}.{public.job_id}.part")
                transferred, digest = await _download_to_file(
                    source, part_path, record.expected_size,
                    record.expected_sha256, record.cancelled,
                )
                if record.cancelled.is_set():
                    raise InstallCancelled()
                os.link(part_path, target)
                installed = True
                part_path.unlink()
                part_path = None
                self._set_status(
                    record,
                    "verifying",
                    transferred_bytes=transferred,
                    sha256=digest,
                )
            else:
                temp_dir = tempfile.TemporaryDirectory(prefix="comfy-model-job-")
                staged_path = Path(temp_dir.name) / f"{public.job_id}.part"
                transferred, digest = await _download_to_file(
                    source, staged_path, record.expected_size,
                    record.expected_sha256, record.cancelled,
                )
                if record.cancelled.is_set():
                    raise InstallCancelled()
                self._set_status(record, "installing", transferred_bytes=transferred)
                response = await self._ssh_exchange(
                    config,
                    {
                        "protocol": 1,
                        "action": "install",
                        "backend_id": public.backend_id,
                        **_remote_identity(config, record.verified_context),
                        "root_category": public.dependency.loader_category,
                        "filename": public.dependency.filename,
                        "job_id": public.job_id,
                        "size_bytes": transferred,
                        "sha256": digest,
                    },
                    upload_path=staged_path,
                    cancelled=record.cancelled,
                    on_commit=lambda: self._set_status(
                        record,
                        "verifying",
                        transferred_bytes=transferred,
                        sha256=digest,
                    ),
                )
                _assert_remote_identity(
                    response, public.backend_id, config, record.verified_context
                )
                if (
                    response.get("sha256") != digest
                    or response.get("size_bytes") != transferred
                    or response.get("destination") != public.destination_path
                ):
                    raise InstallationUnavailable("remote_install_evidence_mismatch")
                installed = True

            if record.cancelled.is_set() and record.public.status != "verifying":
                raise InstallCancelled()
            self._set_status(
                record,
                "verifying",
                transferred_bytes=transferred,
                sha256=digest,
            )
            capability = await capability_inspector.inspect(backend, refresh=True)
            loader = next(
                (
                    item
                    for item in capability.loader_enums
                    if item.node_class == public.dependency.loader_node_class
                    and item.input_name == public.dependency.loader_input
                ),
                None,
            )
            visible = bool(
                capability.backend_id == public.backend_id
                and capability.object_info_status == "available"
                and loader is not None
                and loader.folder_category in (None, public.dependency.loader_category)
                and public.dependency.filename in loader.options
            )
            if visible:
                self._set_status(
                    record,
                    "ready",
                    transferred_bytes=transferred,
                    sha256=digest,
                    ready_evidence={
                        "backend_id": public.backend_id,
                        "job_fingerprint": public.job_fingerprint,
                        "installation_access": config.installation_access,
                        "installation_host_identity": config.host_identity,
                        "management_config_fingerprint": record.config_fingerprint,
                        "object_info_hash": capability.object_info_hash,
                        "object_info_checked_at": capability.object_info_checked_at.isoformat(),
                        "destination_path": public.destination_path,
                        "sha256": digest,
                        "comfy_version": capability.comfy_version,
                        "service_environment": public.service_environment,
                        "service_environment_status": public.service_environment_status,
                    },
                )
            else:
                self._set_status(
                    record,
                    "downloaded_unavailable",
                    transferred_bytes=transferred,
                    sha256=digest,
                    error_code="model_not_visible_on_selected_backend",
                    manual_instructions=[
                        "The file transfer and destination hash were verified, but the selected backend did not advertise this loader option after refresh.",
                        "Check the exact configured model root and ComfyUI loader folder; restart is a separate manual operation.",
                    ],
                )
        except InstallCancelled:
            self._set_status(record, "cancelled")
        except asyncio.CancelledError:
            if installed:
                self._set_status(
                    record,
                    "downloaded_unavailable",
                    error_code="backend_verification_interrupted",
                    manual_instructions=[
                        "The model file was installed, but backend loader verification was interrupted. Inspect the exact destination and refresh the selected backend manually."
                    ],
                )
            elif record.public.status == "verifying":
                self._set_status(
                    record,
                    "failed",
                    error_code="remote_commit_outcome_unknown",
                    manual_instructions=[
                        "The remote commit outcome is unknown. Inspect this backend's exact destination before planning another install; no retry was attempted."
                    ],
                )
            else:
                self._set_status(record, "cancelled")
        except InstallationUnavailable as error:
            if installed:
                self._set_status(
                    record,
                    "downloaded_unavailable",
                    error_code=error.code,
                    transferred_bytes=record.public.transferred_bytes,
                    manual_instructions=_manual_instructions(error.code, config, public.dependency),
                )
            else:
                outcome_unknown = record.public.status == "verifying"
                self._set_status(
                    record,
                    "failed",
                    error_code=("remote_commit_outcome_unknown" if outcome_unknown else error.code),
                    manual_instructions=(
                        [
                            "The remote commit outcome is unknown. Inspect this backend's exact destination before planning another install; no retry was attempted.",
                            *_manual_instructions(error.code, config, public.dependency),
                        ]
                        if outcome_unknown
                        else _manual_instructions(error.code, config, public.dependency)
                    ),
                )
        except (OSError, httpx.HTTPError, ValueError) as error:
            code = _safe_error_code(error)
            if installed:
                self._set_status(
                    record,
                    "downloaded_unavailable",
                    error_code=code,
                    transferred_bytes=record.public.transferred_bytes,
                    manual_instructions=[
                        "The file was installed, but post-transfer backend verification failed. Check the exact destination and refresh the selected backend manually."
                    ],
                )
            else:
                outcome_unknown = record.public.status == "verifying"
                self._set_status(
                    record,
                    "failed",
                    error_code=("remote_commit_outcome_unknown" if outcome_unknown else code),
                    manual_instructions=(
                        ["The remote commit outcome is unknown. Inspect this backend's exact destination before planning another install; no retry was attempted."]
                        if outcome_unknown
                        else []
                    ),
                )
            logger.warning("Model install job failed (backend=%s, code=%s)", public.backend_id, code)
        finally:
            if part_path is not None:
                try:
                    part_path.unlink(missing_ok=True)
                except OSError:
                    logger.warning("Could not remove owned model partial for backend %s", public.backend_id)
            if temp_dir is not None:
                temp_dir.cleanup()
            if record.public.status in {"failed", "cancelled"}:
                self._release_destination(record)

    def _release_destination(self, record: _JobRecord) -> None:
        key = (
            record.public.backend_id,
            (record.public.destination_path or "").casefold(),
        )
        if self._destination_jobs.get(key) == record.public.job_id:
            self._destination_jobs.pop(key, None)

    def _set_status(self, record: _JobRecord, state: str, **updates: Any) -> None:
        record.public = record.public.model_copy(
            update={"status": state, "updated_at": datetime.now(timezone.utc), **updates}
        )


class InstallationUnavailable(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class InstallCancelled(Exception):
    pass


def _dependency_plan_request(request: ModelInstallPlanRequest) -> Any:
    from orchestrator.backend_capabilities import DependencyPlanRequest

    return DependencyPlanRequest(
        graph_fingerprint=request.graph_fingerprint,
        dependencies=[request.dependency],
    )


def _plan_block_reason(
    dependency: DependencyRequirement, manual: ManualDependencyPlan
) -> str | None:
    source = dependency.source
    if source is None or source.url is None or not source.provenance or not source.provenance.strip():
        return "authoritative_source_record_missing"
    if source.gated is not False:
        return "gated_or_unknown_access_requires_manual_install"
    try:
        _validate_publisher_url(source.url)
    except ValueError:
        return "source_url_not_trusted"
    source_path = PurePosixPath(urlsplit(source.url).path)
    if source.license is None or source.license.strip().casefold() in {
        "", "unknown", "unspecified", "none", "n/a", "not specified"
    }:
        return "source_license_missing"
    if source_path.name != PurePosixPath(
        dependency.filename.replace("\\", "/")
    ).name:
        return "source_filename_mismatch"
    if source.size_bytes is not None and source.size_bytes > _MAX_MODEL_BYTES:
        return "model_exceeds_job_size_limit"
    if manual.dependencies:
        item = manual.dependencies[0]
        if item.availability != "not_advertised":
            return {
                "advertised": "model_already_advertised_identity_unverified",
                "unknown": "backend_loader_schema_unknown",
                "category_mismatch": "loader_category_mismatch",
            }.get(item.availability, "dependency_not_confirmed_missing")
        if item.folder_guidance.root_status != "verified":
            return "model_root_unverified"
    return None


def _management_block_reason(
    backend_id: str,
    config: BackendInstallationConfig,
    capability: Any,
    dependency: DependencyRequirement,
) -> str | None:
    if capability.backend_id != backend_id:
        return "backend_identity_mismatch"
    if capability.management.installation_access != config.installation_access:
        return "management_access_unverified"
    if _verified_root(config, capability, dependency.loader_category) is None:
        return "model_root_unverified"
    return None


def _manual_instructions(
    reason: str,
    config: BackendInstallationConfig | None,
    dependency: DependencyRequirement,
) -> list[str]:
    instructions = {
        "management_access_not_configured": [
            "Configure this managed backend's exact local or SSH installation identity, ComfyUI root, environment and model root, then verify access."
        ],
        "model_root_unverified": [
            f"Verify the configured '{dependency.loader_category}' root on this backend. No local fallback or path remapping was attempted."
        ],
        "source_url_not_trusted": [
            "Use a reviewed HTTPS publisher source record without URL credentials, query tokens, private hosts or local endpoints."
        ],
        "authoritative_source_record_missing": [
            "Attach a reviewed source record with publisher provenance, exact filename, license and gating status."
        ],
        "source_license_missing": [
            "Record the publisher's license in the reviewed source record before authorizing an automated download."
        ],
        "gated_or_unknown_access_requires_manual_install": [
            "This job has no backend-only publisher credential integration; manually authenticate and install the gated model."
        ],
        "openssh_client_unavailable": [
            "Remote SSH job support requires the system OpenSSH client and the reviewed helper module installed on the remote Orchestrator Python environment."
        ],
        "remote_helper_unavailable": [
            "Verify OpenSSH host-key trust and install the reviewed helper module on the remote Orchestrator Python environment. No arbitrary script was uploaded."
        ],
        "host_identity_mismatch": [
            "The connected machine identity differs from the configured backend; review the management mapping manually."
        ],
        "management_identity_changed": [
            "The verified host, ComfyUI root, environment or model-root mapping changed after planning. Verify the exact backend mapping and create a new plan."
        ],
        "destination_already_exists": [
            "The exact destination already exists. Inspect and identify it manually; this job never overwrites model files."
        ],
        "model_already_advertised_identity_unverified": [
            "The loader already advertises this filename. Verify its exact model identity and bytes manually; the install job will not overwrite it."
        ],
        "model_not_visible_on_selected_backend": [
            "The file was transferred and verified at the configured destination, but the selected backend did not advertise it after refresh. Check the model root and restart manually if appropriate."
        ],
    }
    base = instructions.get(reason, [f"Installation stopped safely ({reason}); inspect the exact backend, source and destination manually."])
    if config and config.installation_access == "remote-management":
        base = [*base, "Remote access uses strict OpenSSH known-host verification and the fixed model-file helper; it does not run arbitrary commands or upload scripts."]
    return base


def _verified_root(
    config: BackendInstallationConfig,
    capability: Any,
    category: str,
) -> str | None:
    context = _verified_context(config, capability, category)
    return context.get("model_root") if context else None


def _verified_context(
    config: BackendInstallationConfig,
    capability: Any,
    category: str,
) -> dict[str, str] | None:
    management = getattr(capability, "management", capability)
    roots = (management.model_roots or {}).get(category, [])
    expected_fingerprint = _fingerprint(config.model_dump(mode="json"))
    for root in roots:
        try:
            evidence = json.loads(root.evidence)
        except (TypeError, ValueError):
            continue
        if (
            root.path
            and root.observed_at
            and evidence.get("config_fingerprint") == expected_fingerprint
            and evidence.get("host_identity") == config.host_identity
            and evidence.get("installation_root")
            and evidence.get("service_environment")
        ):
            return {
                "config_fingerprint": expected_fingerprint,
                "host_identity": evidence["host_identity"],
                "installation_root": evidence["installation_root"],
                "service_environment": evidence["service_environment"],
                "loader_category": category,
                "model_root": root.path,
            }
    return None


def _local_context_matches(
    actual: dict[str, Any], context: dict[str, str], category: str
) -> bool:
    return bool(
        actual.get("host_identity", "").casefold() == context.get("host_identity", "").casefold()
        and actual.get("installation_root") == context.get("installation_root")
        and actual.get("service_environment") == context.get("service_environment")
        and actual.get("model_roots", {}).get(category) == context.get("model_root")
    )


def _is_absolute_path(value: str) -> bool:
    return Path(value).is_absolute() or PureWindowsPath(value).is_absolute()


def _validate_configured_path(value: str) -> None:
    if not value or "\x00" in value or not _is_absolute_path(value):
        raise ValueError("configured paths must be absolute")
    parts = PureWindowsPath(value).parts if PureWindowsPath(value).is_absolute() else PurePosixPath(value).parts
    if ".." in parts:
        raise ValueError("configured paths must not traverse parent directories")


def _assert_backend_binding(backend_id: str, backend: BackendConfig) -> None:
    if backend.id != backend_id:
        raise InstallationUnavailable("backend_identity_mismatch")


def _assert_local_backend_binding(
    backend: BackendConfig, config: BackendInstallationConfig
) -> None:
    host = backend.host.strip().casefold()
    if host.startswith(("http://", "https://")):
        host = urlsplit(host).hostname or ""
    local_names = {"localhost", "127.0.0.1", "::1", socket.gethostname().casefold(), socket.getfqdn().casefold()}
    if config.host_identity.casefold() not in local_names:
        raise InstallationUnavailable("host_identity_mismatch")
    try:
        if ipaddress.ip_address(host).is_loopback:
            return
    except ValueError:
        pass
    if host not in local_names:
        raise InstallationUnavailable("local_backend_host_mismatch")


def _remote_identity(
    config: BackendInstallationConfig,
    context: dict[str, str] | None = None,
) -> dict[str, Any]:
    identity = {
        "host_identity": config.host_identity,
        "installation_root": config.installation_root,
        "service_environment": config.service_environment,
        "model_roots": config.model_roots,
    }
    if context:
        identity.update(
            {
                "expected_installation_root": context["installation_root"],
                "expected_service_environment": context["service_environment"],
                "expected_root_category": context["loader_category"],
                "expected_model_root": context["model_root"],
            }
        )
    return identity


def _assert_remote_identity(
    response: dict[str, Any],
    backend_id: str,
    config: BackendInstallationConfig,
    context: dict[str, str] | None = None,
) -> None:
    if (
        response.get("backend_id") != backend_id
        or str(response.get("host_identity", "")).casefold() != config.host_identity.casefold()
        or not response.get("installation_root")
        or not response.get("service_environment")
        or not isinstance(response.get("model_roots"), dict)
        or any(
            not isinstance(path, str)
            for path in response.get("model_roots", {}).values()
        )
        or (
            context is not None
            and (
                response.get("installation_root") != context["installation_root"]
                or response.get("service_environment") != context["service_environment"]
                or response.get("model_roots", {}).get(context["loader_category"])
                != context["model_root"]
            )
        )
    ):
        raise InstallationUnavailable("remote_install_evidence_mismatch")


def _inspect_local(config: BackendInstallationConfig) -> dict[str, Any]:
    install_root = Path(config.installation_root).resolve(strict=True)
    if not (install_root / "main.py").is_file():
        raise InstallationUnavailable("comfy_root_unverified")
    environment = Path(config.service_environment).resolve(strict=True)
    roots: dict[str, str] = {}
    for category, path in config.model_roots.items():
        try:
            root = Path(path).resolve(strict=True)
            if root.is_dir():
                roots[category] = str(root)
        except OSError:
            continue
    return {
        "backend_id": "",
        "host_identity": socket.gethostname(),
        "installation_root": str(install_root),
        "service_environment": str(environment),
        "model_roots": roots,
    }


def _local_destination(root: str, filename: str, *, create: bool) -> Path:
    root_path = Path(root).resolve(strict=True)
    relative = _safe_relative_filename(filename)
    current = root_path
    for part in relative.parts[:-1]:
        child = current / part
        if child.is_symlink():
            raise InstallationUnavailable("destination_symlink_disallowed")
        elif child.exists():
            current = child.resolve(strict=True)
            _assert_within_root(root_path, current)
        elif create:
            child.mkdir()
            current = child.resolve(strict=True)
            _assert_within_root(root_path, current)
        else:
            current = child
    target = current / relative.parts[-1]
    _assert_within_root(root_path, current.resolve(strict=True) if current.exists() else current)
    return target


def _safe_relative_filename(filename: str) -> PurePosixPath:
    if not filename or "\x00" in filename or ":" in filename:
        raise ValueError("filename_invalid")
    relative = PurePosixPath(filename.replace("\\", "/"))
    if relative.is_absolute() or any(part in {"", ".", ".."} for part in relative.parts):
        raise ValueError("filename_invalid")
    return relative


def _assert_within_root(root: Path, candidate: Path) -> None:
    if os.path.commonpath((os.path.normcase(str(root)), os.path.normcase(str(candidate)))) != os.path.normcase(str(root)):
        raise ValueError("destination_outside_root")


def _destination_display(root: str, filename: str) -> str:
    relative = _safe_relative_filename(filename)
    if PureWindowsPath(root).is_absolute():
        return str(PureWindowsPath(root).joinpath(*relative.parts))
    return str(Path(root).joinpath(*relative.parts))


def _validate_publisher_url(value: str) -> str:
    parsed = urlsplit(value)
    hostname = (parsed.hostname or "").lower().rstrip(".")
    if (
        parsed.scheme != "https"
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.port not in (None, 443)
        or not _is_trusted_host(hostname)
    ):
        raise ValueError("source_url_not_trusted")
    return hostname


def _is_trusted_host(hostname: str) -> bool:
    if hostname in _TRUSTED_REDIRECT_HOSTS:
        return True
    return any(
        hostname == suffix or hostname.endswith(f".{suffix}")
        for suffix in _TRUSTED_PUBLISHER_SUFFIXES
    )


async def _validate_public_dns(hostname: str) -> None:
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        raise InstallationUnavailable("private_or_literal_download_host")
    try:
        answers = await asyncio.wait_for(
            asyncio.to_thread(socket.getaddrinfo, hostname, 443, type=socket.SOCK_STREAM),
            timeout=10,
        )
    except asyncio.TimeoutError as error:
        raise InstallationUnavailable("publisher_dns_timeout") from error
    except OSError as error:
        raise InstallationUnavailable("publisher_dns_failed") from error
    addresses = {answer[4][0] for answer in answers}
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise InstallationUnavailable("private_or_local_download_host")


async def _download_to_file(
    source: Any,
    destination: Path,
    expected_size: int | None,
    expected_sha256: str | None,
    cancelled: asyncio.Event,
) -> tuple[int, str]:
    if expected_size is not None and expected_size > _MAX_MODEL_BYTES:
        raise InstallationUnavailable("model_exceeds_job_size_limit")
    if destination.exists() or destination.is_symlink():
        raise InstallationUnavailable("partial_destination_exists")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if expected_size is not None and shutil.disk_usage(destination.parent).free < expected_size + _FREE_SPACE_RESERVE:
        raise InstallationUnavailable("insufficient_space")
    started = time.monotonic()
    count = 0
    digest = hashlib.sha256()
    url = source.url
    client_timeout = httpx.Timeout(connect=15.0, read=90.0, write=30.0, pool=10.0)
    try:
        with destination.open("xb") as output:
            async with httpx.AsyncClient(
                timeout=client_timeout, follow_redirects=False, trust_env=False
            ) as client:
                for redirects in range(_MAX_REDIRECTS + 1):
                    host = _validate_publisher_url(url)
                    await _validate_public_dns(host)
                    async with client.stream("GET", url) as response:
                        if response.status_code in {301, 302, 303, 307, 308}:
                            location = response.headers.get("location")
                            if not location or redirects == _MAX_REDIRECTS:
                                raise InstallationUnavailable("publisher_redirect_rejected")
                            url = urljoin(url, location)
                            continue
                        if response.status_code != 200:
                            raise InstallationUnavailable(f"publisher_http_{response.status_code}")
                        length = response.headers.get("content-length")
                        if length:
                            try:
                                declared = int(length)
                            except ValueError as error:
                                raise InstallationUnavailable("publisher_length_invalid") from error
                            if declared > _MAX_MODEL_BYTES:
                                raise InstallationUnavailable("model_exceeds_job_size_limit")
                            if expected_size is not None and declared != expected_size:
                                raise InstallationUnavailable("source_size_mismatch")
                            if shutil.disk_usage(destination.parent).free < declared + _FREE_SPACE_RESERVE:
                                raise InstallationUnavailable("insufficient_space")
                        async for chunk in response.aiter_bytes(_DOWNLOAD_CHUNK_BYTES):
                            if cancelled.is_set():
                                raise InstallCancelled()
                            if time.monotonic() - started > _MAX_JOB_SECONDS:
                                raise InstallationUnavailable("job_time_limit_exceeded")
                            count += len(chunk)
                            if count > _MAX_MODEL_BYTES or (expected_size is not None and count > expected_size):
                                raise InstallationUnavailable("download_size_limit_exceeded")
                            if shutil.disk_usage(destination.parent).free < len(chunk) + _FREE_SPACE_RESERVE:
                                raise InstallationUnavailable("insufficient_space")
                            await asyncio.to_thread(output.write, chunk)
                            digest.update(chunk)
                        break
                else:
                    raise InstallationUnavailable("publisher_redirect_rejected")
            await asyncio.to_thread(output.flush)
            await asyncio.to_thread(os.fsync, output.fileno())
        if count == 0:
            raise InstallationUnavailable("publisher_empty_file")
        if expected_size is not None and count != expected_size:
            raise InstallationUnavailable("source_size_mismatch")
        actual_hash = digest.hexdigest()
        if expected_sha256 is not None and actual_hash != expected_sha256:
            raise InstallationUnavailable("source_hash_mismatch")
        return count, actual_hash
    except BaseException:
        try:
            destination.unlink(missing_ok=True)
        except OSError:
            pass
        raise


def _fingerprint(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _safe_error_code(error: Exception) -> str:
    if isinstance(error, InstallationUnavailable):
        return error.code
    if isinstance(error, FileExistsError):
        return "destination_exists"
    if isinstance(error, OSError) and error.errno == errno.ENOSPC:
        return "insufficient_space"
    return "installation_failed"


def _unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


async def _stop_subprocess(process: asyncio.subprocess.Process) -> None:
    try:
        await asyncio.wait_for(process.wait(), timeout=20)
    except asyncio.TimeoutError:
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=5)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()


installation_manager = BackendInstallationManager()
