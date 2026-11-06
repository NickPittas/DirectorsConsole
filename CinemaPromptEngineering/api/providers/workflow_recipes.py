"""Read-only resolver for the bounded local workflow recipe catalog."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from cinema_rules.target_models import normalize_target_model
from api.providers.prompt_skill_resources import (
    PromptConditioningAdapter,
    PromptSkillTask,
    get_prompt_guidance,
)

_RESOURCE_ROOT = Path(__file__).resolve().parents[2] / "agent_resources"
_RECIPE_ROOT = _RESOURCE_ROOT / "recipes"
_CATALOG_PATH = _RECIPE_ROOT / "catalog.json"
_SOURCE_INDEX_PATH = _RESOURCE_ROOT / "sources.json"
_MAX_CATALOG_BYTES = 256 * 1024
_MAX_SOURCE_INDEX_BYTES = 4 * 1024 * 1024
_MAX_GRAPH_BYTES = 512 * 1024
_RECIPE_ID = re.compile(r"[a-z0-9][a-z0-9.-]{0,63}\Z")


def _canonical_hash(value: Any) -> str:
    raw = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _read_json(path: Path, maximum_bytes: int, label: str) -> tuple[Any, bytes]:
    try:
        with path.open("rb") as resource:
            raw = resource.read(maximum_bytes + 1)
    except OSError as exc:
        raise RuntimeError(f"Local {label} is unavailable.") from exc
    if len(raw) > maximum_bytes:
        raise RuntimeError(f"Local {label} exceeds its size limit.")
    try:
        return json.loads(raw), raw
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Local {label} is invalid JSON.") from exc


def _load_catalog() -> tuple[dict[str, Any], str]:
    catalog, raw = _read_json(_CATALOG_PATH, _MAX_CATALOG_BYTES, "recipe catalog")
    if (
        not isinstance(catalog, dict)
        or catalog.get("schemaVersion") != 1
        or not isinstance(catalog.get("recipes"), list)
    ):
        raise RuntimeError("Local recipe catalog has an unsupported schema.")
    recipes = catalog["recipes"]
    ids = [recipe.get("id") for recipe in recipes if isinstance(recipe, dict)]
    if (
        len(ids) != len(recipes)
        or any(not isinstance(recipe_id, str) or not _RECIPE_ID.fullmatch(recipe_id) for recipe_id in ids)
        or len(set(ids)) != len(ids)
        or any(not isinstance(recipe.get("target"), dict) for recipe in recipes)
    ):
        raise RuntimeError("Local recipe catalog has invalid or duplicate IDs.")
    return catalog, hashlib.sha256(raw).hexdigest()


def _recipe_graph_path(recipe_id: str, recipe: dict[str, Any]) -> Path:
    if not _RECIPE_ID.fullmatch(recipe_id):
        raise RuntimeError("Local recipe catalog contains an unsafe recipe ID.")
    source_graph = recipe.get("sourceGraph")
    if (
        not isinstance(source_graph, dict)
        or source_graph.get("path") != f"{recipe_id}/workflow.json"
    ):
        raise RuntimeError(f"Recipe {recipe_id} has an unsupported graph path.")
    root = _RECIPE_ROOT.resolve()
    path = (root / recipe_id / "workflow.json").resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise RuntimeError(f"Recipe {recipe_id} graph escaped its local allowlist.") from exc
    return path


def _read_graph(recipe_id: str, recipe: dict[str, Any]) -> tuple[dict[str, Any], str]:
    path = _recipe_graph_path(recipe_id, recipe)
    graph, raw = _read_json(path, _MAX_GRAPH_BYTES, f"workflow graph for {recipe_id}")
    if not isinstance(graph, dict):
        raise RuntimeError(f"Workflow graph for {recipe_id} must be a JSON object.")
    actual_hash = hashlib.sha256(raw).hexdigest()
    expected_hash = recipe.get("sourceGraph", {}).get("sha256")
    if not isinstance(expected_hash, str) or actual_hash != expected_hash:
        raise RuntimeError(f"Workflow graph fingerprint mismatch for {recipe_id}.")
    return graph, actual_hash


def _source_discovery(recipe: dict[str, Any]) -> dict[str, Any]:
    source_index, _ = _read_json(
        _SOURCE_INDEX_PATH, _MAX_SOURCE_INDEX_BYTES, "source index"
    )
    if not isinstance(source_index, dict):
        raise RuntimeError("Local source index has an unsupported schema.")
    refs = recipe.get("sourceIndexRefs", {})
    if not isinstance(refs, dict):
        raise RuntimeError("Recipe source-index references are invalid.")
    project_ids = refs.get("projectIds", [])
    task_resource_ids = refs.get("taskResourceIds", [])
    if (
        not isinstance(project_ids, list)
        or not all(isinstance(item, str) for item in project_ids)
        or not isinstance(task_resource_ids, list)
        or not all(isinstance(item, str) for item in task_resource_ids)
    ):
        raise RuntimeError("Recipe source-index references are invalid.")
    projects = source_index.get("projects", [])
    tasks = source_index.get("taskResources", [])
    if (
        not isinstance(projects, list)
        or not all(isinstance(item, dict) for item in projects)
        or not isinstance(tasks, list)
        or not all(isinstance(item, dict) for item in tasks)
    ):
        raise RuntimeError("Local source index has an unsupported schema.")
    project_map = {item.get("id"): item for item in projects}
    task_map = {item.get("id"): item for item in tasks}
    project_fields = (
        "id", "title", "sourceKind", "familyLabel", "resourceKind", "url",
        "commitOrVersion", "license", "docsUrls", "summary", "verified", "notes",
    )
    task_fields = (
        "id", "projectId", "familyLabel", "resourceKind", "tasks",
        "sourceUrl", "summary", "caveats",
    )
    return {
        "projects": [
            {key: record[key] for key in project_fields if key in record}
            for item in project_ids if (record := project_map.get(item)) is not None
        ],
        "taskResources": [
            {key: record[key] for key in task_fields if key in record}
            for item in task_resource_ids if (record := task_map.get(item)) is not None
        ],
        "unresolvedReferences": {
            "projectIds": [item for item in project_ids if item not in project_map],
            "taskResourceIds": [item for item in task_resource_ids if item not in task_map],
        },
        "meaning": "Discovery and provenance metadata only; this index does not prove executable dependencies.",
    }


def _prompt_guidance(recipe: dict[str, Any]) -> dict[str, Any]:
    target = recipe["target"]
    resolution = get_prompt_guidance(
        target_model=target["targetModel"],
        model_version=target["modelVersion"],
        task=target["task"],
        conditioning_adapter=target.get("conditioningAdapter"),
        dialect_id=target.get("dialectId"),
    )
    return {
        **resolution,
        "resources": [{"id": item["path"], **item} for item in resolution["resources"]],
        "text": resolution["guidance"],
    }


def _recipe_record(recipe_id: str) -> dict[str, Any]:
    catalog, catalog_hash = _load_catalog()
    recipe = next(
        (entry for entry in catalog["recipes"] if entry["id"] == recipe_id), None
    )
    if recipe is None:
        raise KeyError(recipe_id)
    graph, graph_hash = _read_graph(recipe_id, recipe)
    dependency_request = recipe.get("dependencyPlanRequest")
    if not isinstance(dependency_request, dict):
        raise RuntimeError(f"Recipe {recipe_id} has no dependency plan request.")
    dependencies_hash = _canonical_hash(dependency_request)
    recipe_hash = _canonical_hash(recipe)
    fingerprint = _canonical_hash({
        "recipe": recipe_hash,
        "graph": graph_hash,
        "dependencies": dependencies_hash,
    })
    return {
        "id": recipe_id,
        "title": recipe.get("title"),
        "summary": recipe.get("summary"),
        "target": recipe.get("target"),
        "supportStatus": recipe.get("supportStatus", "unknown"),
        "readiness": "not_verified",
        "compatibility": {
            "sourceGraph": "verified_against_pinned_hash",
            "targetTaskMatch": "exact_catalog_match",
            "backendNodeSchemas": "unknown_not_live_verified",
            "backendLoaderOptions": "unknown_not_live_verified",
            "installedModelIdentity": "unknown_not_checked",
            "execution": "not_run",
            "gpuBenchmark": "not_run",
        },
        "statusReason": recipe.get("statusReason", "Compatibility is not verified."),
        "verification": recipe.get("verification", {}),
        "fingerprints": {
            "sourceGraph": graph_hash,
            "recipe": recipe_hash,
            "dependencies": dependencies_hash,
            "combined": fingerprint,
            "catalog": catalog_hash,
        },
        "sourceGraph": recipe.get("sourceGraph"),
        "applicationOverlay": recipe.get("applicationOverlay"),
        "inputBindings": recipe.get("inputBindings", []),
        "controlProposal": recipe.get("controlProposal", {
            "status": "unknown_unverified",
            "note": "No control proposal has been verified.",
        }),
        "recipeSettings": recipe.get("recipeSettings", {}),
        "requiredNodeClasses": recipe.get("requiredNodeClasses", []),
        "dependencyPlanRequest": dependency_request,
        "dependencyVerification": recipe.get("dependencyVerification", []),
        "installedModelIdentity": {
            "status": "not_checked",
            "note": "Dependency filenames and loader categories remain exact source requirements; backend-advertised subfolders and installed model identity must be resolved by plan_dependencies.",
        },
        "sourceDiscovery": _source_discovery(recipe),
        "workflow": graph,
        "promptGuidance": _prompt_guidance(recipe),
        "nextStep": {
            "prepare_workflow_revision": {
                "recipe_id": recipe_id,
                "recipe_fingerprint": recipe_hash,
                "source_graph_fingerprint": graph_hash,
                "application_overlay": recipe.get("applicationOverlay"),
            },
            "plan_dependencies": {
                "request": dependency_request,
                "note": "Use the prepared revision fingerprint after applying the overlay; the included graph_fingerprint identifies the immutable upstream source graph.",
            },
        },
    }


def list_workflow_recipes(
    *,
    query: str | None = None,
    target_model: str | None = None,
    model_version: str | None = None,
    task: str | None = None,
    dialect_id: str | None = None,
    conditioning_adapter: str | None = None,
) -> dict[str, Any]:
    """Search exact local recipe metadata without contacting upstream sources."""
    catalog, catalog_hash = _load_catalog()
    search_terms = re.findall(r"[^\W\d_]+|\d+", query.casefold()) if query else []
    target = normalize_target_model(target_model) if target_model else None
    matches = []
    for recipe in catalog["recipes"]:
        identity = recipe.get("target", {})
        if target is not None and identity.get("targetModel") != target:
            continue
        if model_version is not None and identity.get("modelVersion") != model_version:
            continue
        if task is not None and identity.get("task") != task:
            continue
        if dialect_id is not None and identity.get("dialectId") != dialect_id:
            continue
        if conditioning_adapter is not None and identity.get("conditioningAdapter") != conditioning_adapter:
            continue
        searchable = set(re.findall(r"[^\W\d_]+|\d+", " ".join(
            str(recipe.get(key, "")) for key in ("id", "title", "summary")
        ).casefold()))
        if any(term not in searchable for term in search_terms):
            continue
        source_graph = recipe.get("sourceGraph")
        matches.append({
            "id": recipe["id"],
            "title": recipe.get("title"),
            "summary": recipe.get("summary"),
            "target": identity,
            "supportStatus": recipe.get("supportStatus", "unknown"),
            "readiness": "not_verified",
            "compatibility": {
                "backendNodeSchemas": "unknown_not_live_verified",
                "backendLoaderOptions": "unknown_not_live_verified",
                "installedModelIdentity": "unknown_not_checked",
                "execution": "not_run",
            },
            "statusReason": recipe.get("statusReason", "Compatibility is not verified."),
            "sourceGraphFingerprint": (
                source_graph.get("sha256") if isinstance(source_graph, dict) else None
            ),
            "recipeFingerprint": _canonical_hash(recipe),
        })
    return {
        "count": len(matches),
        "catalogFingerprint": catalog_hash,
        "recipes": matches,
    }


def resolve_workflow_recipe(
    *,
    target_model: str,
    model_version: str,
    task: PromptSkillTask,
    dialect_id: str | None,
    conditioning_adapter: PromptConditioningAdapter | None,
) -> dict[str, Any]:
    """Resolve one recipe only when every advertised target dimension matches."""
    target = normalize_target_model(target_model)
    catalog, _ = _load_catalog()
    matches = [
        recipe for recipe in catalog["recipes"]
        if recipe.get("target", {}).get("targetModel") == target
        and recipe.get("target", {}).get("modelVersion") == model_version
        and recipe.get("target", {}).get("task") == task
        and recipe.get("target", {}).get("dialectId") == dialect_id
        and recipe.get("target", {}).get("conditioningAdapter") == conditioning_adapter
    ]
    if len(matches) != 1:
        raise KeyError("No unique recipe matches the exact target selection.")
    return _recipe_record(matches[0]["id"])


def get_workflow_recipe(recipe_id: str) -> dict[str, Any]:
    """Return a curated recipe by stable ID, never by a caller-supplied path."""
    if not _RECIPE_ID.fullmatch(recipe_id):
        raise KeyError(recipe_id)
    return _recipe_record(recipe_id)
