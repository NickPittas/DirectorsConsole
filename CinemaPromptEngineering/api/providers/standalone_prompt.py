"""Prepare standalone Console enhancement prompts without PE configuration."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from cinema_rules.target_models import get_target_model_ids, normalize_target_model

from .prompt_profiles import EnhancementContext, format_binding_context, validate_context
from .prompt_skill_resources import PromptConditioningAdapter, PromptSkillTask, get_prompt_guidance, prompt_skill_catalog
from .system_prompts import get_system_prompt


class StandalonePromptInput(BaseModel):
    """Validated standalone Console enhancement request."""

    model_config = ConfigDict(extra="forbid")

    user_prompt: str = Field(min_length=1, max_length=20_000)
    target_model: str = Field(min_length=1, max_length=128)
    task: PromptSkillTask | None = None
    model_version: str | None = Field(default=None, max_length=128)
    dialect_id: str | None = Field(default=None, max_length=128)
    conditioning_adapter: PromptConditioningAdapter | None = None
    enhancement_context: EnhancementContext | None = None


class StandalonePromptPreparation(BaseModel):
    """Prepared prompts and exact local skill selection metadata."""

    system_prompt: str
    user_prompt: str
    canonical_target_model: str
    task: PromptSkillTask | None
    dialect_id: str | None
    enhancement_context: EnhancementContext | None
    prompt_skill: dict[str, Any]
    fingerprint: str
    warnings: list[str]


def prepare_standalone_prompt(
    request: StandalonePromptInput,
) -> StandalonePromptPreparation:
    """Build a bounded, model-specific prompt from caller text and metadata.

    Args:
        request: Validated prompt and optional caller-confirmed context.
    Returns:
        Prepared system/user prompts, selection metadata, and fingerprint.
    Raises:
        ValueError: For invalid targets, conflicting context, or unavailable skills.
    """
    user_text = request.user_prompt.strip()
    if not user_text:
        raise ValueError("user_prompt must not be blank")
    target = normalize_target_model(request.target_model)
    if target not in get_target_model_ids():
        raise ValueError(f"Unknown target_model '{request.target_model}'")
    task = request.task
    dialect_id = request.dialect_id
    validated_dialect: dict[str, Any] | None = None
    if request.enhancement_context is not None:
        _, _, validated_dialect = validate_context(target, request.enhancement_context)
        context = request.enhancement_context
        has_first = any(asset.role == "first_frame" for asset in context.assets)
        has_last = any(asset.role == "last_frame" for asset in context.assets)
        derived_task: PromptSkillTask = context.task if context.task == "t2v" else (
            "first_last" if has_first and has_last else "i2v" if context.task == "i2v"
            else "multi_reference" if len(context.assets) > 1 else "reference"
        )
        if task is not None and task != derived_task:
            raise ValueError(f"task '{task}' conflicts with enhancement_context task '{derived_task}'")
        task = derived_task
        context_dialect = validated_dialect["id"]
        if dialect_id is not None and dialect_id != context_dialect:
            raise ValueError(f"dialect_id '{dialect_id}' conflicts with validated context dialect '{context_dialect}'")
        dialect_id = context_dialect
    model_version = request.model_version
    adapter = request.conditioning_adapter
    prompt_skill = get_prompt_guidance(target_model=target, model_version=model_version, task=task,
                                       dialect_id=dialect_id, conditioning_adapter=adapter)
    if prompt_skill["status"] == "requires_selection" and len(prompt_skill.get("choices", [])) == 1:
        choice = prompt_skill["choices"][0]
        model_version = choice["model_version"]
        task = choice["task"]
        dialect_id = choice["dialect_id"]
        adapter = choice["conditioning_adapter"]
        prompt_skill = get_prompt_guidance(target_model=choice["target_model"], model_version=model_version,
                                           task=task, dialect_id=dialect_id, conditioning_adapter=adapter)
    warnings: list[str] = []
    if prompt_skill["status"] != "available":
        catalog = prompt_skill_catalog(target)
        reason = prompt_skill.get("message") or f"Prompt guidance is {prompt_skill['status']}"
        if catalog["matches"] or request.model_version is not None or request.conditioning_adapter is not None:
            raise ValueError(reason)
        warnings.append("No packaged task-specific local skill; using the target's base system prompt.")
    system_parts = [get_system_prompt(target)]
    if prompt_skill["status"] == "available" and prompt_skill.get("guidance"):
        system_parts.append(prompt_skill["guidance"])
    system_parts.append("Preserve the user's intent. Do not invent camera or preset choices. "
                        "Treat media metadata as confirmed labels, roles, and order, never as perception.")
    system_prompt = "\n\n".join(part for part in system_parts if part.strip())
    user_parts = [
        f"TARGET MODEL: {target}",
        f"TASK: {task or 'unspecified'}",
        f"DIALECT: {dialect_id or 'unspecified'}",
        f"USER PROMPT:\n{user_text}",
    ]
    if request.enhancement_context is not None:
        user_parts.append(format_binding_context(request.enhancement_context, target, validated_dialect,
                                                 pixels_supplied=False))
    prepared_user_prompt = "\n\n".join(user_parts)
    if len((system_prompt + prepared_user_prompt).encode("utf-8")) > 65_536:
        raise ValueError("Prepared prompt exceeds the 65536-byte limit")
    fingerprint_data = {
        "context": request.enhancement_context.model_dump(mode="json") if request.enhancement_context else None,
        "system_prompt": system_prompt,
        "user_prompt": prepared_user_prompt,
        "selection": {
            "canonical_target_model": target,
            "model_version": model_version,
            "task": task,
            "dialect_id": dialect_id,
            "conditioning_adapter": adapter,
            "prompt_skill": prompt_skill,
        },
    }
    fingerprint = hashlib.sha256(json.dumps(fingerprint_data, ensure_ascii=False, sort_keys=True,
                                             separators=(",", ":")).encode("utf-8")).hexdigest()
    return StandalonePromptPreparation(
        system_prompt=system_prompt,
        user_prompt=prepared_user_prompt,
        canonical_target_model=target,
        task=task,
        dialect_id=dialect_id,
        enhancement_context=request.enhancement_context,
        prompt_skill=prompt_skill,
        fingerprint=fingerprint,
        warnings=warnings,
    )
