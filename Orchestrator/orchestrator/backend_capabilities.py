"""Read-only ComfyUI capability inspection for configured backends."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlsplit, urlunsplit

import httpx
from pydantic import BaseModel, Field, field_validator, model_validator

from orchestrator.core.models.backend import BackendConfig

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 30
_MAX_CONCURRENT_INSPECTIONS = 4
_INSPECTION_TIMEOUT_SECONDS = 7
_MAX_OBJECT_INFO_BYTES = 16 * 1024 * 1024
_MAX_SYSTEM_STATS_BYTES = 1024 * 1024
_MAX_CACHE_ENTRIES = 64

# Only standard loader node/input pairs get a folder category. Unknown or
# custom loader schemas keep their options while their category stays unknown.
_FOLDER_BY_NODE_INPUT = {
    ("CheckpointLoader", "ckpt_name"): "checkpoints",
    ("CheckpointLoaderSimple", "ckpt_name"): "checkpoints",
    ("LoraLoader", "lora_name"): "loras",
    ("LoraLoaderModelOnly", "lora_name"): "loras",
    ("UNETLoader", "unet_name"): "diffusion_models",
    ("VAELoader", "vae_name"): "vae",
    ("CLIPLoader", "clip_name"): "text_encoders",
    ("DualCLIPLoader", "clip_name1"): "text_encoders",
    ("DualCLIPLoader", "clip_name2"): "text_encoders",
    ("TripleCLIPLoader", "clip_name1"): "text_encoders",
    ("TripleCLIPLoader", "clip_name2"): "text_encoders",
    ("TripleCLIPLoader", "clip_name3"): "text_encoders",
    ("CLIPVisionLoader", "clip_name"): "clip_vision",
    ("ControlNetLoader", "control_net_name"): "controlnet",
    ("StyleModelLoader", "style_model_name"): "style_models",
    ("UpscaleModelLoader", "model_name"): "upscale_models",
    ("LatentUpscaleModelLoader", "model_name"): "latent_upscale_models",
    ("LTXVAudioVAELoader", "ckpt_name"): "checkpoints",
    ("LTXAVTextEncoderLoader", "ckpt_name"): "checkpoints",
    ("LTXAVTextEncoderLoader", "text_encoder"): "text_encoders",
}


class VerifiedModelRoot(BaseModel):
    """A backend model root with explicit verification evidence."""

    path: str
    evidence: str
    observed_at: datetime


class BackendManagementDescriptor(BaseModel):
    """Management access is separate from HTTP capability inspection."""

    installation_access: Literal[
        "unknown", "none", "local-cli", "remote-management"
    ] = "unknown"
    storage: Literal["unknown", "backend-local", "verified-shared"] = "unknown"
    model_roots: dict[str, list[VerifiedModelRoot]] | None = None
    service_environment: str | None = None


class LoaderEnum(BaseModel):
    node_class: str
    input_name: str
    folder_category: str | None = None
    options: list[str]


class BackendCapabilityRecord(BaseModel):
    backend_id: str
    name: str
    configured_url: str
    http_reachability: Literal["unknown", "reachable", "unreachable"]
    websocket_reachability: Literal["unknown", "reachable", "unreachable"] = "unknown"
    http_checked_at: datetime
    system_stats_http_status: int | None = None
    object_info_status: Literal[
        "unknown", "available", "unavailable", "error", "too_large", "invalid"
    ] = "unknown"
    object_info_http_status: int | None = None
    object_info_checked_at: datetime
    comfy_version: str | None = None
    object_info_hash: str | None = None
    node_classes: list[str] = Field(default_factory=list)
    loader_enums: list[LoaderEnum] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
    management: BackendManagementDescriptor = Field(
        default_factory=BackendManagementDescriptor
    )
    inspected_at: datetime
    cached: bool = False
    system_stats_error_code: str | None = None
    object_info_error_code: str | None = None


class DependencySource(BaseModel):
    """Source metadata supplied by a reviewed dependency record."""

    url: str | None = Field(default=None, max_length=4096)
    provenance: str | None = Field(default=None, max_length=2048)
    license: str | None = Field(default=None, max_length=512)
    gated: bool | None = None
    sha256: str | None = Field(default=None, max_length=64)
    size_bytes: int | None = Field(default=None, gt=0)

    @field_validator("url")
    @classmethod
    def validate_source_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("Source URL must be an absolute HTTP(S) URL")
        if parsed.username is not None or parsed.password is not None:
            raise ValueError("Source URL must not contain credentials")
        if parsed.query or parsed.fragment:
            raise ValueError("Source URL must not contain query strings or fragments")
        return value

    @field_validator("sha256")
    @classmethod
    def validate_sha256(cls, value: str | None) -> str | None:
        if value is not None and not re.fullmatch(r"[0-9a-fA-F]{64}", value):
            raise ValueError("sha256 must contain 64 hexadecimal characters")
        return value

    @model_validator(mode="after")
    def require_url_provenance(self) -> "DependencySource":
        if self.url is not None and not self.provenance:
            raise ValueError("A supplied source URL requires provenance")
        return self


class DependencyRequirement(BaseModel):
    identity: str = Field(min_length=1, max_length=256)
    filename: str = Field(min_length=1, max_length=4096)
    loader_category: str = Field(min_length=1, max_length=128)
    loader_node_class: str = Field(min_length=1, max_length=256)
    loader_input: str = Field(min_length=1, max_length=256)
    source: DependencySource | None = None


class DependencyPlanRequest(BaseModel):
    graph_fingerprint: str = Field(min_length=1, max_length=256)
    required_node_classes: list[str] = Field(default_factory=list, max_length=5000)
    dependencies: list[DependencyRequirement] = Field(
        default_factory=list, max_length=500
    )

    @field_validator("required_node_classes")
    @classmethod
    def validate_node_class_names(cls, value: list[str]) -> list[str]:
        if any(len(name) > 256 for name in value):
            raise ValueError("Node class names must be at most 256 characters")
        return value


class FolderGuidance(BaseModel):
    category: str
    root_status: Literal["unknown", "verified"]
    verified_roots: list[VerifiedModelRoot] = Field(default_factory=list)


class PlannedDependency(BaseModel):
    identity: str
    filename: str
    loader_category: str
    loader_node_class: str
    loader_input: str
    availability: Literal[
        "advertised", "not_advertised", "unknown", "category_mismatch"
    ]
    reported_advertised_candidates: list[str] = Field(default_factory=list)
    identity_verification: Literal["unverified"] = "unverified"
    folder_guidance: FolderGuidance
    source: DependencySource | None = None


class ManualDependencyPlan(BaseModel):
    backend_id: str
    graph_fingerprint: str
    capability_inspected_at: datetime
    http_reachability: Literal["unknown", "reachable", "unreachable"]
    object_info_hash: str | None = None
    management: BackendManagementDescriptor
    missing_node_classes: list[str] = Field(default_factory=list)
    unknown_node_classes: list[str] = Field(default_factory=list)
    dependencies: list[PlannedDependency] = Field(default_factory=list)
    not_advertised_model_identities: list[str] = Field(default_factory=list)
    unknown_model_identities: list[str] = Field(default_factory=list)
    unverified_model_identities: list[str] = Field(default_factory=list)
    manual_instructions: list[str] = Field(default_factory=list)


@dataclass
class _CachedRecord:
    expires_at: float
    record: BackendCapabilityRecord


class BackendCapabilityInspector:
    """Inspect only managed backend URLs and cache successful object schemas."""

    def __init__(self) -> None:
        self._cache: dict[tuple[str, str], _CachedRecord] = {}
        self._active_urls: dict[str, str] = {}
        self._generations: dict[str, int] = {}
        self._locks: dict[tuple[str, str], asyncio.Lock] = {}
        self._semaphore = asyncio.Semaphore(_MAX_CONCURRENT_INSPECTIONS)
        self._management: dict[str, BackendManagementDescriptor] = {}

    def set_management(
        self, backend_id: str, descriptor: BackendManagementDescriptor
    ) -> None:
        """Attach explicit management evidence to one managed backend."""
        self._management[backend_id] = descriptor.model_copy(deep=True)
        self.invalidate(backend_id)

    def get_management(self, backend_id: str) -> BackendManagementDescriptor:
        """Return the configured management descriptor, if any."""
        descriptor = self._management.get(backend_id)
        return descriptor.model_copy(deep=True) if descriptor else BackendManagementDescriptor()

    async def inspect(
        self, backend: BackendConfig, *, refresh: bool = False
    ) -> BackendCapabilityRecord:
        configured_url, url_error = _configured_backend_url(backend)
        key = (backend.id, configured_url)
        self._discard_old_urls(backend.id, configured_url)
        generation = self._generations.get(backend.id, 0)
        now = time.monotonic()
        cached = self._cache.get(key)
        if not refresh and cached and cached.expires_at > now:
            return cached.record.model_copy(
                update={
                    "name": backend.name,
                    "cached": True,
                    "management": self.get_management(backend.id),
                }
            )

        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            # A refresh removes the previous success before making any network call.
            if refresh:
                self._cache.pop(key, None)
            cached = self._cache.get(key)
            if not refresh and cached and cached.expires_at > time.monotonic():
                return cached.record.model_copy(
                    update={
                        "name": backend.name,
                        "cached": True,
                        "management": self.get_management(backend.id),
                    }
                )
            async with self._semaphore:
                record = await self._inspect_uncached(backend, configured_url, url_error)

            record = record.model_copy(
                update={"management": self.get_management(backend.id)}
            )

            if record.object_info_status == "available":
                self._prune_cache()
                if (
                    self._active_urls.get(backend.id) == configured_url
                    and self._generations.get(backend.id, 0) == generation
                ):
                    self._cache[key] = _CachedRecord(
                        time.monotonic() + _CACHE_TTL_SECONDS, record
                    )
            return record

    def invalidate(self, backend_id: str) -> None:
        self._generations[backend_id] = self._generations.get(backend_id, 0) + 1
        for key in [key for key in self._cache if key[0] == backend_id]:
            self._cache.pop(key, None)
        for key, lock in list(self._locks.items()):
            if key[0] == backend_id and not lock.locked():
                self._locks.pop(key, None)
        self._active_urls.pop(backend_id, None)

    def _discard_old_urls(self, backend_id: str, configured_url: str) -> None:
        previous_url = self._active_urls.get(backend_id)
        if previous_url is not None and previous_url != configured_url:
            self.invalidate(backend_id)
        self._active_urls[backend_id] = configured_url
        for key in [key for key in self._cache if key[0] == backend_id and key[1] != configured_url]:
            self._cache.pop(key, None)

    def _prune_cache(self) -> None:
        now = time.monotonic()
        for key, entry in list(self._cache.items()):
            if entry.expires_at <= now:
                self._cache.pop(key, None)
        while len(self._cache) >= _MAX_CACHE_ENTRIES:
            self._cache.pop(next(iter(self._cache)))

    async def _inspect_uncached(
        self, backend: BackendConfig, configured_url: str, url_error: str | None
    ) -> BackendCapabilityRecord:
        now = datetime.now(timezone.utc)
        base = dict(
            backend_id=backend.id,
            name=backend.name,
            configured_url=configured_url,
            inspected_at=now,
        )
        if url_error:
            return BackendCapabilityRecord(
                **base,
                http_reachability="unreachable",
                http_checked_at=now,
                object_info_checked_at=now,
                object_info_status="unavailable",
                system_stats_error_code=url_error,
                object_info_error_code=url_error,
            )

        timeout = httpx.Timeout(5.0, connect=2.0)
        async with httpx.AsyncClient(
            base_url=configured_url,
            timeout=timeout,
            follow_redirects=False,
            trust_env=False,
        ) as client:
            stats_task = asyncio.create_task(
                _get_json(client, "/system_stats", _MAX_SYSTEM_STATS_BYTES)
            )
            object_task = asyncio.create_task(
                _get_json(client, "/object_info", _MAX_OBJECT_INFO_BYTES)
            )
            tasks = (stats_task, object_task)
            done, pending = await asyncio.wait(
                tasks, timeout=_INSPECTION_TIMEOUT_SECONDS
            )
            for task in pending:
                task.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)
            timeout_result = (None, None, "timeout")
            stats_result = stats_task.result() if stats_task in done else timeout_result
            object_result = object_task.result() if object_task in done else timeout_result

        stats_status, stats, stats_error = stats_result
        object_status, object_info, object_error = object_result
        reached = stats_status is not None or object_status is not None
        checked_at = datetime.now(timezone.utc)
        node_classes: list[str] = []
        loader_enums: list[LoaderEnum] = []
        schema_hash: str | None = None
        info_state: Literal["available", "unavailable", "error", "too_large", "invalid"]
        error_code: str | None = None
        if isinstance(object_info, dict):
            try:
                canonical = json.dumps(
                    object_info, sort_keys=True, separators=(",", ":"), ensure_ascii=False
                ).encode("utf-8")
                schema_hash = hashlib.sha256(canonical).hexdigest()
                node_classes = sorted(
                    key for key, value in object_info.items()
                    if isinstance(key, str) and isinstance(value, dict)
                )
                loader_enums = _extract_loader_enums(object_info)
                info_state = "available"
            except (TypeError, ValueError):
                info_state, error_code = "invalid", "object_info_invalid"
        elif object_error == "too_large":
            info_state, error_code = "too_large", "object_info_too_large"
        elif object_status is None:
            info_state, error_code = "unavailable", object_error or "object_info_unavailable"
        elif object_error:
            info_state, error_code = "error", object_error
        else:
            info_state, error_code = "invalid", "object_info_invalid"

        version = None
        if isinstance(stats, dict):
            system = stats.get("system")
            if isinstance(system, dict):
                reported_version = system.get("comfyui_version")
                if isinstance(reported_version, str) and reported_version.strip():
                    version = reported_version[:128]

        capabilities = []
        if stats_status is not None and 200 <= stats_status < 300:
            capabilities.append("system_stats")
        if info_state == "available":
            capabilities.append("object_info")

        return BackendCapabilityRecord(
            **base,
            http_reachability="reachable" if reached else "unreachable",
            http_checked_at=checked_at,
            system_stats_http_status=stats_status,
            object_info_status=info_state,
            object_info_http_status=object_status,
            object_info_checked_at=checked_at,
            comfy_version=version,
            object_info_hash=schema_hash,
            node_classes=node_classes,
            loader_enums=loader_enums,
            capabilities=capabilities,
            system_stats_error_code=stats_error,
            object_info_error_code=error_code,
        )


async def _get_json(
    client: httpx.AsyncClient, path: str, max_bytes: int
) -> tuple[int | None, Any | None, str | None]:
    status_code: int | None = None
    try:
        async with client.stream("GET", path) as response:
            status_code = response.status_code
            if not 200 <= status_code < 300:
                return status_code, None, f"http_{status_code}"
            content_length = response.headers.get("content-length")
            if content_length:
                try:
                    if int(content_length) > max_bytes:
                        return status_code, None, "too_large"
                except ValueError:
                    pass
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > max_bytes:
                    return status_code, None, "too_large"
            try:
                return status_code, json.loads(body), None
            except (json.JSONDecodeError, UnicodeDecodeError):
                return status_code, None, "invalid_json"
    except httpx.TimeoutException:
        return status_code, None, "timeout"
    except httpx.HTTPError as exc:
        logger.warning("Backend capability request failed (%s)", type(exc).__name__)
        return status_code, None, "connection_error"


def _extract_loader_enums(object_info: dict[str, Any]) -> list[LoaderEnum]:
    enums: list[LoaderEnum] = []
    for node_class, definition in object_info.items():
        if not isinstance(node_class, str) or not isinstance(definition, dict):
            continue
        inputs = definition.get("input")
        if not isinstance(inputs, dict):
            continue
        for section in ("required", "optional"):
            fields = inputs.get(section)
            if not isinstance(fields, dict):
                continue
            for input_name, descriptor in fields.items():
                if not isinstance(input_name, str):
                    continue
                normalized_name = input_name.casefold()
                folder = _FOLDER_BY_NODE_INPUT.get((node_class, input_name))
                loader_like = "loader" in node_class.casefold()
                if folder is None and not (
                    loader_like and normalized_name.endswith("_name")
                ):
                    continue
                options = _combo_options(descriptor)
                if options is not None:
                    enums.append(
                        LoaderEnum(
                            node_class=node_class,
                            input_name=input_name,
                            folder_category=folder,
                            options=options,
                        )
                    )
    return sorted(enums, key=lambda item: (item.node_class, item.input_name))


def _combo_options(descriptor: Any) -> list[str] | None:
    if isinstance(descriptor, list) and descriptor:
        if isinstance(descriptor[0], list) and all(
            isinstance(option, str) for option in descriptor[0]
        ):
            return list(descriptor[0])
        if (
            descriptor[0] == "COMBO"
            and len(descriptor) > 1
            and isinstance(descriptor[1], dict)
        ):
            options = descriptor[1].get("options")
            if isinstance(options, list) and all(
                isinstance(option, str) for option in options
            ):
                return list(options)
    return None


def _configured_backend_url(backend: BackendConfig) -> tuple[str, str | None]:
    host = backend.host.strip()
    if host.startswith(("http://", "https://")):
        raw_url = host
    else:
        if ":" in host and not host.startswith("["):
            host = f"[{host}]"
        raw_url = f"http://{host}:{backend.port}"

    try:
        parsed = urlsplit(raw_url)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError:
        return "http://invalid-backend-url", "configured_url_invalid"

    safe_hostname = hostname or "invalid-backend-url"
    if ":" in safe_hostname and not safe_hostname.startswith("["):
        safe_hostname = f"[{safe_hostname}]"
    netloc = f"{safe_hostname}:{port}" if port is not None else safe_hostname
    sanitized_url = urlunsplit(
        (parsed.scheme or "http", netloc, "", "", "")
    ).rstrip("/")

    if (
        parsed.scheme not in {"http", "https"}
        or hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        return sanitized_url, "configured_url_invalid"
    return sanitized_url, None


def make_manual_dependency_plan(
    backend_id: str,
    request: DependencyPlanRequest,
    capability: BackendCapabilityRecord,
) -> ManualDependencyPlan:
    schema_available = capability.object_info_status == "available"
    available_nodes = set(capability.node_classes)
    loader_index = {
        (item.node_class, item.input_name): item for item in capability.loader_enums
    }
    missing_nodes = (
        [name for name in request.required_node_classes if name not in available_nodes]
        if schema_available
        else []
    )
    unknown_nodes = [] if schema_available else list(request.required_node_classes)
    planned: list[PlannedDependency] = []
    not_advertised_models: list[str] = []
    unknown_models: list[str] = []
    manual_instructions = [
        "HTTP reachability does not establish SSH, filesystem, or installation access.",
        "Loader enum visibility proves advertisement only; manually verify file identity, bytes, hash, license, gating, and model/task/version compatibility.",
    ]

    for dependency in request.dependencies:
        loader = loader_index.get(
            (dependency.loader_node_class, dependency.loader_input)
        )
        candidates = loader.options if loader else []
        requested = dependency.filename.replace("\\", "/")
        advertised_matches = [
            option for option in candidates if option.replace("\\", "/") == requested
        ]
        if not advertised_matches and "/" not in requested:
            advertised_matches = [
                option for option in candidates
                if "\0" not in option
                and all(part not in {".", ".."} for part in option.replace("\\", "/").split("/"))
                and option.replace("\\", "/").split("/")[-1] == requested
            ]
        roots = (capability.management.model_roots or {}).get(
            dependency.loader_category, []
        )
        root_status: Literal["unknown", "verified"] = "verified" if roots else "unknown"
        if not roots:
            guidance = (
                f"Explicitly map backend folder '{dependency.loader_category}' to its configured root before using path guidance; the root is unknown."
            )
            if guidance not in manual_instructions:
                manual_instructions.append(guidance)

        if not schema_available or loader is None:
            availability: Literal[
                "advertised", "not_advertised", "unknown", "category_mismatch"
            ] = "unknown"
            unknown_models.append(dependency.identity)
        elif (
            loader.folder_category is not None
            and loader.folder_category != dependency.loader_category
        ):
            availability = "category_mismatch"
            not_advertised_models.append(dependency.identity)
        elif len(advertised_matches) == 1:
            availability = "advertised"
        elif len(advertised_matches) > 1:
            availability = "unknown"
            unknown_models.append(dependency.identity)
        else:
            availability = "not_advertised"
            not_advertised_models.append(dependency.identity)

        planned.append(
            PlannedDependency(
                identity=dependency.identity,
                filename=dependency.filename,
                loader_category=dependency.loader_category,
                loader_node_class=dependency.loader_node_class,
                loader_input=dependency.loader_input,
                availability=availability,
                reported_advertised_candidates=advertised_matches,
                identity_verification="unverified",
                folder_guidance=FolderGuidance(
                    category=dependency.loader_category,
                    root_status=root_status,
                    verified_roots=roots,
                ),
                source=dependency.source,
            )
        )

    if missing_nodes:
        manual_instructions.append(
            "Required node classes are not advertised in object_info; verify their cause and install packs only through a separately verified backend management path."
        )
    if not_advertised_models or unknown_models:
        manual_instructions.append(
            "Models absent from the loader enum are not advertised, which does not prove why; review the supplied source metadata and verify through a backend-specific manual process. This plan performs no downloads or installation."
        )

    return ManualDependencyPlan(
        backend_id=backend_id,
        graph_fingerprint=request.graph_fingerprint,
        capability_inspected_at=capability.inspected_at,
        http_reachability=capability.http_reachability,
        object_info_hash=capability.object_info_hash,
        management=capability.management,
        missing_node_classes=missing_nodes,
        unknown_node_classes=unknown_nodes,
        dependencies=planned,
        not_advertised_model_identities=not_advertised_models,
        unknown_model_identities=unknown_models,
        unverified_model_identities=[item.identity for item in request.dependencies],
        manual_instructions=manual_instructions,
    )


capability_inspector = BackendCapabilityInspector()
