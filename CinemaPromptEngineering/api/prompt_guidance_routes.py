"""Read-only API for exact local model-task prompt guidance."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from api.providers.prompt_skill_resources import (
    PromptConditioningAdapter,
    PromptSkillTask,
    get_prompt_guidance,
)

router = APIRouter(prefix="/api/prompt-guidance", tags=["prompt-guidance"])


@router.get("")
async def prompt_guidance(
    target_model: str = Query(..., min_length=1, max_length=128),
    model_version: str | None = Query(default=None, max_length=128),
    task: PromptSkillTask | None = None,
    dialect_id: str | None = Query(default=None, max_length=128),
    conditioning_adapter: PromptConditioningAdapter | None = None,
) -> dict[str, Any]:
    """Return bounded writing guidance for an exact selection."""
    try:
        return get_prompt_guidance(
            target_model=target_model,
            model_version=model_version,
            task=task,
            dialect_id=dialect_id,
            conditioning_adapter=conditioning_adapter,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="Select a valid local prompt guidance match.",
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail="Local prompt guidance is unavailable.",
        ) from exc
