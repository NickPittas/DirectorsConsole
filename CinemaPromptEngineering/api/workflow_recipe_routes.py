"""Read-only API for the packaged workflow recipe catalog."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from api.providers.prompt_skill_resources import (
    PromptConditioningAdapter,
    PromptSkillTask,
)
from api.providers.workflow_recipes import (
    get_workflow_recipe,
    list_workflow_recipes,
    resolve_workflow_recipe,
)

router = APIRouter(prefix="/api/workflow-recipes", tags=["workflow-recipes"])


@router.get("")
async def search_workflow_recipes(
    q: str | None = Query(default=None, max_length=128),
    target_model: str | None = Query(default=None, max_length=128),
    model_version: str | None = Query(default=None, max_length=128),
    task: str | None = Query(default=None, max_length=64),
    dialect_id: str | None = Query(default=None, max_length=128),
    conditioning_adapter: str | None = Query(default=None, max_length=128),
) -> dict:
    """Search exact local recipe metadata."""
    try:
        return list_workflow_recipes(
            query=q,
            target_model=target_model,
            model_version=model_version,
            task=task,
            dialect_id=dialect_id,
            conditioning_adapter=conditioning_adapter,
        )
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/resolve")
async def resolve_recipe(
    target_model: str = Query(..., min_length=1, max_length=128),
    model_version: str = Query(..., min_length=1, max_length=128),
    task: PromptSkillTask = Query(...),
    dialect_id: str | None = Query(default=None, max_length=128),
    conditioning_adapter: PromptConditioningAdapter | None = None,
) -> dict:
    """Resolve one recipe by exact target, version, task, dialect, and adapter."""
    try:
        return resolve_workflow_recipe(
            target_model=target_model,
            model_version=model_version,
            task=task,
            dialect_id=dialect_id,
            conditioning_adapter=conditioning_adapter,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{recipe_id}")
async def workflow_recipe_detail(recipe_id: str) -> dict:
    """Read a recipe and its pinned source graph by stable catalog ID."""
    try:
        return get_workflow_recipe(recipe_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Workflow recipe not found.") from exc
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
