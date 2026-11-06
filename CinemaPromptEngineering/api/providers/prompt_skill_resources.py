"""Resolve bounded, repository-local prompt guidance for exact model tasks."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
from typing import Any, Literal

from pydantic import BaseModel, Field

from cinema_rules.target_models import normalize_target_model

PromptSkillTask = Literal[
    "t2v",
    "i2v",
    "first_last",
    "reference",
    "v2v",
    "t2i",
    "edit",
    "multi_reference",
    "style_reference",
    "outpaint",
    "rgba",
    "control",
    "relight",
    "restore",
    "upscale",
    "hdr",
    "audio_edit",
]

PromptConditioningAdapter = Literal[
    "ingredients",
    "union_control",
    "motion_track_control",
    "layout_to_render",
    "in_outpainting",
    "relight",
    "day_to_night",
    "colorization",
    "decompression",
    "deblur",
    "water_simulation",
    "clean_plate",
    "instant_shave",
    "cross_eyed",
    "pixel_spatial_upscaler",
    "refine_details",
    "restore",
    "alpha_gen",
    "hdr",
    "sdr_to_hdr",
    "dub_it",
]

ResolutionStatus = Literal["available", "requires_selection", "unsupported"]

_RESOURCE_ROOT = Path(__file__).resolve().parents[2] / "agent_resources"
_MANIFEST_PATH = _RESOURCE_ROOT / "prompt_skills.json"
_MAX_MANIFEST_BYTES = 512 * 1024
_MAX_RESOURCE_BYTES = 24 * 1024
_CONTENT_CACHE: dict[str, str] = {}
_MANIFEST_CACHE: tuple[str, dict[str, Any]] | None = None


class PromptSkillResource(BaseModel):
    id: str
    path: str
    sha256: str


class PromptSkillResolution(BaseModel):
    status: ResolutionStatus
    skill_id: str | None = None
    skill_version: str | None = None
    model_version: str | None = None
    task: str | None = None
    dialect_id: str | None = None
    conditioning_adapter: str | None = None
    resource_ids: list[str] = Field(default_factory=list)
    resources: list[PromptSkillResource] = Field(default_factory=list)
    sources: list[dict[str, Any]] = Field(default_factory=list)
    content_hash: str
    manifest_hash: str
    fingerprint: str
    message: str | None = None
    system_context_text: str = Field(default="", exclude=True, repr=False)


def _load_manifest() -> tuple[dict[str, Any], str]:
    global _MANIFEST_CACHE
    try:
        raw = _MANIFEST_PATH.read_bytes()
    except OSError as exc:
        raise RuntimeError("Local prompt skill manifest is unavailable.") from exc
    if len(raw) > _MAX_MANIFEST_BYTES:
        raise RuntimeError("Local prompt skill manifest exceeds its size limit.")
    digest = hashlib.sha256(raw).hexdigest()
    if _MANIFEST_CACHE is None or _MANIFEST_CACHE[0] != digest:
        try:
            manifest = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RuntimeError("Local prompt skill manifest is invalid JSON.") from exc
        if (
            not isinstance(manifest, dict)
            or manifest.get("schemaVersion") != 1
            or not isinstance(manifest.get("skills"), list)
            or not isinstance(manifest.get("contextLimitBytes"), int)
            or manifest["contextLimitBytes"] > 65536
        ):
            raise RuntimeError("Local prompt skill manifest has an unsupported schema.")
        _MANIFEST_CACHE = (digest, manifest)
    return _MANIFEST_CACHE[1], digest


def _resource_path(relative_path: str) -> Path:
    relative = PurePosixPath(relative_path)
    if (
        relative.is_absolute()
        or ".." in relative.parts
        or not relative.parts
        or relative.parts[0] != "skills"
        or relative.suffix != ".md"
    ):
        raise RuntimeError("Prompt skill manifest contains an unsafe resource path.")
    root = _RESOURCE_ROOT.resolve()
    path = (root / Path(*relative.parts)).resolve()
    try:
        path.relative_to(root / "skills")
    except ValueError as exc:
        raise RuntimeError("Prompt skill resource escaped its local allowlist.") from exc
    return path


def _read_resource(relative_path: str) -> tuple[str, str]:
    path = _resource_path(relative_path)
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise RuntimeError(f"Packaged prompt skill resource is missing: {relative_path}") from exc
    if len(raw) > _MAX_RESOURCE_BYTES:
        raise RuntimeError(f"Packaged prompt skill resource exceeds its size limit: {relative_path}")
    digest = hashlib.sha256(raw).hexdigest()
    text = _CONTENT_CACHE.get(digest)
    if text is None:
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise RuntimeError(f"Packaged prompt skill resource is not UTF-8: {relative_path}") from exc
        _CONTENT_CACHE[digest] = text
    return text, digest


def _fingerprint(manifest_hash: str, identity: dict[str, Any], content_hash: str) -> str:
    payload = json.dumps(
        {"manifest": manifest_hash, "identity": identity, "content": content_hash},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _resolution(
    status: ResolutionStatus,
    manifest_hash: str,
    *,
    message: str,
    target_model: str,
    model_version: str | None,
    task: str | None,
    dialect_id: str | None,
    conditioning_adapter: str | None,
    skill_id: str | None = None,
    skill_version: str | None = None,
    resources: list[PromptSkillResource] | None = None,
    sources: list[dict[str, Any]] | None = None,
    system_context_text: str = "",
) -> PromptSkillResolution:
    selected_resources = resources or []
    content_hash = hashlib.sha256(
        "".join(resource.sha256 for resource in selected_resources).encode("ascii")
    ).hexdigest()
    identity = {
        "target_model": target_model,
        "model_version": model_version,
        "task": task,
        "dialect_id": dialect_id,
        "conditioning_adapter": conditioning_adapter,
        "skill_id": skill_id,
        "skill_version": skill_version,
        "status": status,
        "resource_ids": [resource.id for resource in selected_resources],
    }
    return PromptSkillResolution(
        status=status,
        skill_id=skill_id,
        skill_version=skill_version,
        model_version=model_version,
        task=task,
        dialect_id=dialect_id,
        conditioning_adapter=conditioning_adapter,
        resource_ids=[resource.id for resource in selected_resources],
        resources=selected_resources,
        sources=sources or [],
        content_hash=content_hash,
        manifest_hash=manifest_hash,
        fingerprint=_fingerprint(manifest_hash, identity, content_hash),
        message=message,
        system_context_text=system_context_text,
    )


def _source_target(skill: dict[str, Any], target_model: str) -> dict[str, Any] | None:
    return next((target for target in skill["targets"] if target["id"] == target_model), None)


def _validate_media(
    match: dict[str, Any],
    *,
    image_mode: str,
    image_count: int,
    asset_roles: set[str],
) -> str | None:
    media = match.get("media", {})
    conditioning_image_count = 0 if image_mode == "description_only" else image_count
    allowed_modes = media.get("imageModes")
    if image_count and allowed_modes and image_mode not in allowed_modes:
        return f"Selected prompt skill task requires image mode: {', '.join(allowed_modes)}."
    required_roles = set(media.get("requiredRoles", []))
    if not required_roles.issubset(asset_roles):
        missing = ", ".join(sorted(required_roles - asset_roles))
        return f"Selected prompt skill task requires confirmed media roles: {missing}."
    required_any = set(media.get("requiredRolesAny", []))
    if required_any and not required_any.intersection(asset_roles):
        return f"Selected prompt skill task requires one of these confirmed media roles: {', '.join(sorted(required_any))}."
    minimum = media.get("minImages", 0)
    if conditioning_image_count < minimum and not required_any.intersection(asset_roles):
        return f"Selected prompt skill task requires at least {minimum} validated image input(s)."
    maximum = media.get("maxImages")
    if maximum is not None and conditioning_image_count > maximum:
        return f"Selected prompt skill task accepts at most {maximum} image input(s)."
    if image_mode in media.get("requiresImagesWhenMode", []) and image_count == 0:
        return "Selected prompt skill task requires actual image pixels for the chosen image mode."
    return None


def resolve_prompt_skill(
    *,
    target_model: str,
    model_version: str | None,
    task: PromptSkillTask | None,
    inferred_task: str | None,
    conditioning_adapter: PromptConditioningAdapter | None,
    dialect_id: str | None,
    image_mode: str,
    images: list[Any],
    asset_roles: set[str],
) -> PromptSkillResolution:
    """Return an exact packaged match or a clear selection/availability state."""
    manifest, manifest_hash = _load_manifest()
    canonical_target = normalize_target_model(target_model)
    selected_task = task or inferred_task
    selected_adapter = conditioning_adapter
    version_hint = next(
        (item for item in manifest.get("targetVersionSelections", []) if item["targetModel"] == canonical_target),
        None,
    )
    skills_for_target = [
        skill for skill in manifest["skills"] if _source_target(skill, canonical_target) is not None
    ]
    target_record = next(
        (
            record
            for skill in skills_for_target
            if (record := _source_target(skill, canonical_target)) is not None
        ),
        None,
    )
    family_skill = skills_for_target[0] if skills_for_target else None
    if target_record is None:
        if version_hint is not None:
            return _resolution(
                "requires_selection",
                manifest_hash,
                message=version_hint["message"],
                target_model=canonical_target,
                model_version=model_version,
                task=selected_task,
                dialect_id=dialect_id,
                conditioning_adapter=selected_adapter,
            )
        return _resolution(
            "unsupported",
            manifest_hash,
            message=f"No packaged task skill is available for target '{canonical_target}'. Existing model guidance remains active.",
            target_model=canonical_target,
            model_version=model_version,
            task=selected_task,
            dialect_id=dialect_id,
            conditioning_adapter=selected_adapter,
        )

    expected_version = target_record.get("modelVersion")
    version_required = target_record.get("versionRequired", False)
    effective_version = model_version
    if version_required and effective_version is None and dialect_id in target_record.get("versionDialects", {}):
        effective_version = target_record["versionDialects"][dialect_id]
    if version_required and effective_version is None:
        return _resolution(
            "requires_selection",
            manifest_hash,
            message=f"Select the exact model version for '{canonical_target}' before using a task skill.",
            target_model=canonical_target,
            model_version=None,
            task=selected_task,
            dialect_id=dialect_id,
            conditioning_adapter=selected_adapter,
        )
    if effective_version is not None and effective_version != expected_version:
        return _resolution(
            "unsupported",
            manifest_hash,
            message=f"No packaged prompt skill matches {canonical_target}/{effective_version}; no other version was substituted.",
            target_model=canonical_target,
            model_version=effective_version,
            task=selected_task,
            dialect_id=dialect_id,
            conditioning_adapter=selected_adapter,
        )
    effective_version = expected_version

    if selected_task is None:
        return _resolution(
            "requires_selection",
            manifest_hash,
            message=f"Select an exact prompt task for '{canonical_target}' to load task-specific guidance.",
            target_model=canonical_target,
            model_version=effective_version,
            task=None,
            dialect_id=dialect_id,
            conditioning_adapter=selected_adapter,
        )

    matches = [
        match
        for match in family_skill["matches"]
        if canonical_target in match["targets"] and match["task"] == selected_task
    ]
    if not matches:
        return _resolution(
            "unsupported",
            manifest_hash,
            message=f"No packaged {selected_task} prompt skill is declared for {canonical_target}/{effective_version}.",
            target_model=canonical_target,
            model_version=effective_version,
            task=selected_task,
            dialect_id=dialect_id,
            conditioning_adapter=selected_adapter,
        )

    selectable_matches = [
        match for match in matches if match.get("availability", "available") == "available"
    ]
    if not selectable_matches:
        message = next(
            (match.get("availabilityMessage") for match in matches if match.get("availabilityMessage")),
            f"The declared {selected_task} guidance cannot be selected with the current enhancement context.",
        )
        return _resolution(
            "unsupported",
            manifest_hash,
            message=message,
            target_model=canonical_target,
            model_version=effective_version,
            task=selected_task,
            dialect_id=dialect_id,
            conditioning_adapter=selected_adapter,
        )
    matches = selectable_matches

    if selected_adapter is None:
        plain_matches = [match for match in matches if match.get("adapter") is None]
        if plain_matches:
            matches = plain_matches
        else:
            adapters = sorted({match["adapter"] for match in matches if match.get("adapter")})
            return _resolution(
                "requires_selection",
                manifest_hash,
                message=f"Select a conditioning adapter for {canonical_target}/{selected_task}: {', '.join(adapters)}.",
                target_model=canonical_target,
                model_version=effective_version,
                task=selected_task,
                dialect_id=dialect_id,
                conditioning_adapter=None,
            )
    else:
        matches = [match for match in matches if match.get("adapter") == selected_adapter]
        if not matches:
            return _resolution(
                "unsupported",
                manifest_hash,
                message=f"Adapter '{selected_adapter}' is not packaged for {canonical_target}/{selected_task}.",
                target_model=canonical_target,
                model_version=effective_version,
                task=selected_task,
                dialect_id=dialect_id,
                conditioning_adapter=selected_adapter,
            )

    if dialect_id is not None:
        matches = [match for match in matches if match.get("dialect") in (None, dialect_id)]
    elif any(match.get("dialect") for match in matches):
        dialects = sorted({match["dialect"] for match in matches if match.get("dialect")})
        if len(dialects) > 1:
            return _resolution(
                "requires_selection",
                manifest_hash,
                message=f"Select a prompt dialect for {canonical_target}/{selected_task}: {', '.join(dialects)}.",
                target_model=canonical_target,
                model_version=effective_version,
                task=selected_task,
                dialect_id=None,
                conditioning_adapter=selected_adapter,
            )
        dialect_id = dialects[0]
        matches = [match for match in matches if match.get("dialect") in (None, dialect_id)]
    if not matches:
        return _resolution(
            "unsupported",
            manifest_hash,
            message=f"The selected dialect is not packaged for {canonical_target}/{selected_task}.",
            target_model=canonical_target,
            model_version=effective_version,
            task=selected_task,
            dialect_id=dialect_id,
            conditioning_adapter=selected_adapter,
        )
    if len(matches) != 1:
        return _resolution(
            "requires_selection",
            manifest_hash,
            message=f"The selected target/task still has multiple prompt skill matches for {canonical_target}/{selected_task}.",
            target_model=canonical_target,
            model_version=effective_version,
            task=selected_task,
            dialect_id=dialect_id,
            conditioning_adapter=selected_adapter,
        )

    match = matches[0]
    media_error = _validate_media(
        match,
        image_mode=image_mode,
        image_count=len(images),
        asset_roles=asset_roles,
    )
    if media_error:
        raise ValueError(media_error)

    paths = [family_skill["entry"], *match.get("resources", [])]
    resources: list[PromptSkillResource] = []
    context_sections: list[str] = []
    context_bytes = 0
    for path in dict.fromkeys(paths):
        content, digest = _read_resource(path)
        context_bytes += len(content.encode("utf-8"))
        if context_bytes > manifest["contextLimitBytes"]:
            raise RuntimeError("Selected local prompt skill exceeds the gateway context limit.")
        resources.append(PromptSkillResource(id=path, path=path, sha256=digest))
        context_sections.append(f"### {path}\n{content}")

    return _resolution(
        "available",
        manifest_hash,
        message=None,
        target_model=canonical_target,
        model_version=effective_version,
        task=selected_task,
        dialect_id=dialect_id,
        conditioning_adapter=selected_adapter,
        skill_id=family_skill["id"],
        skill_version=family_skill["version"],
        resources=resources,
        sources=family_skill.get("sources", []),
        system_context_text="\n\n".join(context_sections),
    )


def prompt_skill_catalog(
    target_model: str | None = None,
    model_version: str | None = None,
) -> dict[str, Any]:
    """Expose exact packaged task choices without reading the discovery index."""
    manifest, manifest_hash = _load_manifest()
    canonical_target = normalize_target_model(target_model) if target_model else None
    matches: list[dict[str, Any]] = []
    for skill in manifest["skills"]:
        for target in skill["targets"]:
            if canonical_target is not None and target["id"] != canonical_target:
                continue
            if model_version is not None and target["modelVersion"] != model_version:
                continue
            for match in skill["matches"]:
                if target["id"] not in match["targets"]:
                    continue
                matches.append({
                    "skill_id": skill["id"],
                    "label": skill["label"],
                    "skill_version": skill["version"],
                    "target_model": target["id"],
                    "model_version": target["modelVersion"],
                    "version_required": target.get("versionRequired", False),
                    "task": match["task"],
                    "dialect_id": match.get("dialect"),
                    "conditioning_adapter": match.get("adapter"),
                    "resources": [skill["entry"], *match.get("resources", [])],
                    "media": match.get("media", {}),
                    "sources": skill.get("sources", []),
                    "status": (
                        "requires_selection"
                        if target.get("versionRequired") and model_version is None
                        else match.get("availability", "available")
                    ),
                    "message": match.get("availabilityMessage"),
                })

    hint = next(
        (item for item in manifest.get("targetVersionSelections", []) if item["targetModel"] == canonical_target),
        None,
    )
    if hint is not None:
        status: ResolutionStatus = hint["status"]
        message = hint["message"]
    elif not matches:
        status = "unsupported"
        message = (
            f"No packaged prompt skill is available for target '{canonical_target}'."
            if canonical_target
            else None
        )
    elif any(match["version_required"] for match in matches) and model_version is None:
        status = "requires_selection"
        message = f"Select a model version for '{canonical_target}' before using task-specific guidance."
    elif model_version is not None and all(match["model_version"] != model_version for match in matches):
        status = "unsupported"
        message = f"No packaged prompt skill matches {canonical_target}/{model_version}."
    elif matches and all(match["status"] == "unsupported" for match in matches):
        status = "unsupported"
        message = "The packaged task guidance cannot be selected with the current enhancement context."
    else:
        status = "available"
        message = None

    return {
        "manifest_version": manifest["manifestVersion"],
        "manifest_hash": manifest_hash,
        "status": status,
        "target_model": canonical_target,
        "message": message,
        "matches": matches,
        "context_limit_bytes": manifest["contextLimitBytes"],
        "availability_scope": "Packaged prompt guidance only; does not assert model weights, endpoint access, or workflow graph support.",
    }


def get_prompt_guidance(
    *,
    target_model: str,
    model_version: str | None,
    task: PromptSkillTask | None,
    dialect_id: str | None,
    conditioning_adapter: PromptConditioningAdapter | None,
) -> dict[str, Any]:
    """Return writing guidance for one exact local model-task selection."""
    canonical_target = normalize_target_model(target_model)
    catalog = prompt_skill_catalog(canonical_target, model_version)
    result: dict[str, Any] = {
        "status": "unsupported",
        "target_model": canonical_target,
        "model_version": model_version,
        "task": task,
        "dialect_id": dialect_id,
        "conditioning_adapter": conditioning_adapter,
        "guidance": "",
        "fingerprint": None,
        "resources": [],
        "sources": [],
        "skill_id": None,
        "skill_version": None,
        "manifest_hash": catalog["manifest_hash"],
        "content_hash": hashlib.sha256(b"").hexdigest(),
        "media_requirements": {},
        "readiness": "guidance_only",
        "message": "No packaged prompt guidance matches this selection.",
    }
    matches = catalog["matches"]
    selectable = [match for match in matches if match["status"] != "unsupported"]
    result["choices"] = [
        {key: match[key] for key in ("target_model", "model_version", "task", "dialect_id", "conditioning_adapter")}
        for match in selectable
        if (task is None or match["task"] == task)
        and (dialect_id is None or match["dialect_id"] == dialect_id)
        and (conditioning_adapter is None or match["conditioning_adapter"] == conditioning_adapter)
    ][:128]
    if not selectable:
        return result
    if model_version is None:
        result.update(
            status="requires_selection",
            message="Select an exact model version before loading prompt guidance.",
        )
        return result
    if task is None:
        result.update(
            status="requires_selection",
            message="Select an exact task before loading prompt guidance.",
        )
        return result

    task_matches = [match for match in matches if match["task"] == task]
    for field, value in (
        ("dialect_id", dialect_id),
        ("conditioning_adapter", conditioning_adapter),
    ):
        if value is not None:
            task_matches = [match for match in task_matches if match[field] == value]
    available = [match for match in task_matches if match["status"] == "available"]
    if not available:
        return result

    for field, value in (
        ("dialect_id", dialect_id),
        ("conditioning_adapter", conditioning_adapter),
    ):
        if value is None and {match[field] for match in available} != {None}:
            result.update(
                status="requires_selection",
                message="Select the exact dialect and conditioning adapter for this task.",
            )
            return result
    if len(available) != 1:
        result.update(
            status="requires_selection",
            message="The selected task has multiple exact guidance matches.",
        )
        return result

    match = available[0]
    resources: list[dict[str, str]] = []
    sections: list[str] = []
    for path in dict.fromkeys(match["resources"]):
        content, digest = _read_resource(path)
        resources.append({"path": path, "sha256": digest})
        sections.append(f"### {path}\n{content}")
    guidance = "\n\n".join(sections)
    if len(guidance.encode("utf-8")) > catalog["context_limit_bytes"]:
        raise RuntimeError("Selected local prompt guidance exceeds the gateway context limit.")

    identity = {
        "target_model": canonical_target,
        "model_version": model_version,
        "task": task,
        "dialect_id": dialect_id,
        "conditioning_adapter": conditioning_adapter,
    }
    resource_hash = hashlib.sha256(
        json.dumps(resources, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    result.update(
        status="available",
        guidance=guidance,
        fingerprint=_fingerprint(catalog["manifest_hash"], identity, resource_hash),
        resources=resources,
        sources=match["sources"],
        skill_id=match["skill_id"],
        skill_version=match["skill_version"],
        content_hash=hashlib.sha256("".join(resource["sha256"] for resource in resources).encode("ascii")).hexdigest(),
        media_requirements=match["media"],
        message=None,
    )
    return result
