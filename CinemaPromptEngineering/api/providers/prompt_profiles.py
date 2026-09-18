"""Video prompt-enhancement profiles and context validation.

The registry describes prompting dialects only. It does not prove that a
caller-supplied binding exists in a ComfyUI graph or that media is readable.
"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    StrictStr,
    field_validator,
)

Task = Literal["t2v", "i2v", "ref2v"]
AssetKind = Literal["image", "video", "audio"]
AssetRole = Literal[
    "first_frame",
    "last_frame",
    "reference_image",
    "reference_video",
    "reference_audio",
]


class EnhancementAsset(BaseModel):
    """Metadata for one caller-confirmed media binding."""

    model_config = ConfigDict(extra="forbid")

    binding_id: StrictStr = Field(min_length=1)
    kind: AssetKind
    role: AssetRole
    ordinal: StrictInt = Field(gt=0)
    label: StrictStr | None = None
    description: StrictStr | None = None
    reference_name: StrictStr | None = None

    @field_validator("binding_id", "label", "description", "reference_name")
    @classmethod
    def reject_blank_strings(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("must not be blank")
        return value


class EnhancementContext(BaseModel):
    """Optional task and media metadata for prompt enhancement."""

    model_config = ConfigDict(extra="forbid")

    task: Task
    reference_dialect: str | None = None
    duration_seconds: float | None = None
    assets: list[EnhancementAsset]
    reference_order_confirmed: StrictBool

    @field_validator("reference_dialect")
    @classmethod
    def reject_blank_dialect(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("must not be blank")
        return value

    @field_validator("duration_seconds")
    @classmethod
    def validate_duration(cls, value: float | None) -> float | None:
        if value is not None and (not math.isfinite(value) or value <= 0):
            raise ValueError("must be a finite positive number")
        return value


# Keep this data plain so the metadata endpoint stays stable and dependency-light.
PROFILE_REGISTRY: dict[str, dict[str, Any]] = {
    "minimax_h3": {
        "label": "MiniMax H3",
        "tasks": ["t2v", "i2v", "ref2v"],
        "default_dialect": "local_h3",
        "dialects": [
            {
                "id": "local_h3",
                "label": "Local H3",
                "tasks": ["t2v", "i2v", "ref2v"],
                "reference_style": "local_h3_tags",
                "requires_order_confirmation": True,
            },
            {
                "id": "minimax_api",
                "label": "MiniMax hosted API",
                "tasks": ["t2v", "i2v", "ref2v"],
                "reference_style": "hosted_roles",
                "requires_order_confirmation": True,
            },
        ],
        "source_urls": [
            "https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md",
            "https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md",
            "https://platform.minimax.io/docs/guides/local-deploy-h3",
        ],
    },
    "minimax_h3_max": {
        "label": "MiniMax H3 Max",
        "tasks": ["t2v", "i2v", "ref2v"],
        "default_dialect": "minimax_api",
        "dialects": [
            {
                "id": "minimax_api",
                "label": "MiniMax hosted API",
                "tasks": ["t2v", "i2v", "ref2v"],
                "reference_style": "hosted_roles",
                "requires_order_confirmation": True,
            }
        ],
        "source_urls": [
            "https://platform.minimax.io/docs/guides/video-generation",
            "https://platform.minimax.io/docs/api-reference/video-generation-v2-create",
        ],
    },
    "ltx_2.3": {
        "label": "LTX-2.3",
        "tasks": ["t2v", "i2v"],
        "default_dialect": "ltx_native",
        "dialects": [
            {
                "id": "ltx_native",
                "label": "LTX native prose",
                "tasks": ["t2v", "i2v"],
                "reference_style": "natural_prose",
                "requires_order_confirmation": False,
            }
        ],
        "source_urls": [
            "https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide",
            "https://github.com/Lightricks/LTX-2/blob/main/MODELS-LTX-2.3.md",
        ],
    },
    "ltx_2.5": {
        "label": "LTX-2.5",
        "tasks": ["t2v", "i2v"],
        "default_dialect": "ltx_native",
        "dialects": [
            {
                "id": "ltx_native",
                "label": "LTX native prose",
                "tasks": ["t2v", "i2v"],
                "reference_style": "natural_prose",
                "requires_order_confirmation": False,
            }
        ],
        "source_urls": [
            "https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide",
            "https://docs.ltx.io/models/ltx-2-5",
        ],
    },
    "seedance_2.0": {
        "label": "Seedance 2.0",
        "tasks": ["t2v", "i2v", "ref2v"],
        "default_dialect": "seedance_api",
        "dialects": [
            {
                "id": "seedance_api",
                "label": "Seedance API",
                "tasks": ["t2v", "i2v", "ref2v"],
                "reference_style": "typed_asset_markers",
                "requires_order_confirmation": True,
            }
        ],
        "source_urls": [
            "https://docs.byteplus.com/en/docs/ModelArk/2291680",
            "https://docs.byteplus.com/en/docs/ModelArk/2222480",
        ],
    },
    "seedance_2.5": {
        "label": "Seedance 2.5",
        "tasks": ["t2v", "i2v", "ref2v"],
        "default_dialect": "seedance_api",
        "dialects": [
            {
                "id": "seedance_api",
                "label": "Seedance API",
                "tasks": ["t2v", "i2v", "ref2v"],
                "reference_style": "typed_asset_markers",
                "requires_order_confirmation": True,
            }
        ],
        "source_urls": [
            "https://docs.byteplus.com/en/docs/ModelArk/2607689",
            "https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5",
        ],
    },
    "wan_3.0": {
        "label": "Wan 3.0",
        "tasks": ["t2v", "i2v", "ref2v"],
        "default_dialect": "wan_api",
        "dialects": [
            {
                "id": "wan_api",
                "label": "Wan API",
                "tasks": ["t2v", "i2v", "ref2v"],
                "reference_style": "typed_asset_markers",
                "requires_order_confirmation": True,
            }
        ],
        "source_urls": [
            "https://www.alibabacloud.com/help/en/model-studio/text-to-video-prompt",
            "https://help.aliyun.com/en/model-studio/wan3-video-generation-api-reference",
        ],
    },
    "kling_3.0": {
        "label": "Kling 3.0",
        "tasks": ["t2v", "i2v"],
        "default_dialect": "kling_api",
        "dialects": [
            {
                "id": "kling_api",
                "label": "Kling API",
                "tasks": ["t2v", "i2v"],
                "reference_style": "named_contents",
                "requires_order_confirmation": True,
            }
        ],
        "source_urls": [
            "https://kling.ai/quickstart/klingai-video-3-model-user-guide",
            "https://kling.ai/document-api/api/video/3-0-omni/image-to-video.md",
        ],
    },
    "kling_3.0_omni": {
        "label": "Kling 3.0 Omni",
        "tasks": ["t2v", "i2v", "ref2v"],
        "default_dialect": "kling_api",
        "dialects": [
            {
                "id": "kling_api",
                "label": "Kling API",
                "tasks": ["t2v", "i2v", "ref2v"],
                "reference_style": "named_contents",
                "requires_order_confirmation": True,
            }
        ],
        "source_urls": [
            "https://kling.ai/quickstart/klingai-video-3-model-user-guide",
            "https://kling.ai/document-api/api/video/3-0-omni/video-omni.md",
        ],
    },
}


def profile_metadata() -> list[dict[str, Any]]:
    """Return a copy suitable for the public profiles endpoint."""
    return [
        {
            "target_model": target,
            "label": profile["label"],
            "tasks": list(profile["tasks"]),
            "default_dialect": profile["default_dialect"],
            "dialects": [dict(dialect) for dialect in profile["dialects"]],
            "source_urls": list(profile["source_urls"]),
        }
        for target, profile in PROFILE_REGISTRY.items()
    ]


def get_profile(target_model: str) -> dict[str, Any] | None:
    """Look up a canonical target profile."""
    from cinema_rules.target_models import normalize_target_model

    return PROFILE_REGISTRY.get(normalize_target_model(target_model))


def get_dialect(profile: dict[str, Any], dialect_id: str | None) -> dict[str, Any] | None:
    """Resolve a profile dialect, applying the profile default when omitted."""
    selected = dialect_id or profile["default_dialect"]
    return next((item for item in profile["dialects"] if item["id"] == selected), None)


def _asset_role_error(asset: EnhancementAsset) -> str | None:
    allowed: dict[str, set[str]] = {
        "image": {"first_frame", "last_frame", "reference_image"},
        "video": {"reference_video"},
        "audio": {"reference_audio"},
    }
    if asset.role not in allowed[asset.kind]:
        return f"asset '{asset.binding_id}' has incompatible kind '{asset.kind}' and role '{asset.role}'"
    return None


def validate_context(
    target_model: str,
    context: EnhancementContext,
) -> tuple[str, dict[str, Any], dict[str, Any]]:
    """Validate task, dialect, and metadata without inspecting media or a graph.

    Returns canonical target, profile, and dialect. Raises ``ValueError`` for
    semantic errors so the HTTP layer can expose them as status 400.
    """
    from cinema_rules.target_models import normalize_target_model

    canonical_target = normalize_target_model(target_model)
    profile = PROFILE_REGISTRY.get(canonical_target)
    if profile is None:
        raise ValueError(
            f"target_model '{target_model}' has no verified video enhancement profile"
        )
    dialect = get_dialect(profile, context.reference_dialect)
    if dialect is None:
        supported = ", ".join(item["id"] for item in profile["dialects"])
        raise ValueError(
            f"dialect '{context.reference_dialect}' is not supported for {canonical_target}; "
            f"choose one of: {supported}"
        )
    if context.task not in profile["tasks"] or context.task not in dialect["tasks"]:
        raise ValueError(
            f"task '{context.task}' is not supported for {canonical_target}/{dialect['id']}"
        )

    ids = [asset.binding_id for asset in context.assets]
    if len(ids) != len(set(ids)):
        raise ValueError("assets.binding_id values must be unique")
    ordinals: dict[str, set[int]] = {}
    for asset in context.assets:
        if (error := _asset_role_error(asset)):
            raise ValueError(error)
        seen = ordinals.setdefault(asset.kind, set())
        if asset.ordinal in seen:
            raise ValueError(f"asset ordinals must be unique within kind '{asset.kind}'")
        seen.add(asset.ordinal)
        if asset.reference_name and not (
            canonical_target.startswith("kling_3.0")
            and asset.kind == "image"
            and asset.role == "reference_image"
        ):
            raise ValueError(
                "reference_name is reserved for confirmed Kling named reference images"
            )

    if context.assets and not context.reference_order_confirmed:
        raise ValueError(
            "reference_order_confirmed must be true for caller-supplied positional or named bindings"
        )

    frame_assets = [asset for asset in context.assets if asset.role in {"first_frame", "last_frame"}]
    reference_assets = [
        asset
        for asset in context.assets
        if asset.role in {"reference_image", "reference_video", "reference_audio"}
    ]
    if len([asset for asset in frame_assets if asset.role == "first_frame"]) > 1:
        raise ValueError("only one first_frame asset is allowed")
    if len([asset for asset in frame_assets if asset.role == "last_frame"]) > 1:
        raise ValueError("only one last_frame asset is allowed")

    if context.task == "t2v" and context.assets:
        raise ValueError("t2v does not accept media assets; use i2v or ref2v")
    if context.task == "i2v":
        if not frame_assets:
            raise ValueError("i2v requires at least one first_frame or last_frame image")
        if canonical_target.startswith("kling_"):
            if not any(asset.role == "first_frame" for asset in frame_assets):
                raise ValueError("Kling i2v requires a first_frame asset; last-frame-only is unsupported")
            invalid = [asset for asset in reference_assets if asset.role != "reference_image" or not asset.reference_name]
            if invalid:
                raise ValueError("Kling i2v named references require reference_name on reference_image assets")
        elif reference_assets:
            raise ValueError("i2v cannot mix keyframes with reference assets for this target")
        if canonical_target == "ltx_2.3" and any(asset.role == "last_frame" for asset in frame_assets):
            raise ValueError("ltx_2.3 i2v does not have a verified ending-frame control")
    if context.task == "ref2v":
        if not reference_assets:
            raise ValueError("ref2v requires at least one reference_image, reference_video, or reference_audio")
        if frame_assets:
            raise ValueError("ref2v uses reference assets, not first_frame or last_frame roles")

    if dialect["id"] == "local_h3":
        if (
            context.task == "i2v"
            and any(asset.role == "last_frame" for asset in frame_assets)
            and context.duration_seconds is None
        ):
            raise ValueError("duration_seconds is required for local_h3 last-frame alignment")
        if context.task == "i2v" and reference_assets:
            raise ValueError("local_h3 i2v accepts only keyframe assets")
        if context.task == "ref2v" and frame_assets:
            raise ValueError("local_h3 ref2v accepts only reference assets")

    return canonical_target, profile, dialect


def format_binding_context(
    context: EnhancementContext,
    target_model: str,
    dialect: dict[str, Any],
) -> str:
    """Describe caller bindings without pretending to inspect their media."""
    if not context.assets:
        return "No media bindings were supplied. Do not invent references or source labels."

    lines = [
        "CALLER-CONFIRMED MEDIA BINDINGS:",
        "The server received metadata only; it cannot inspect media or verify graph connections.",
        "Ordinals are caller-confirmed original per-kind connection positions; preserve gaps and do not renumber.",
    ]
    for asset in context.assets:
        token = _asset_token(asset, dialect["id"])
        details = [f"binding_id={asset.binding_id}", f"kind={asset.kind}", f"role={asset.role}", f"ordinal={asset.ordinal}"]
        if asset.label:
            details.append(f"label={asset.label}")
        if asset.description:
            details.append(f"description={asset.description}")
        if asset.reference_name:
            details.append(f"confirmed_name={asset.reference_name}")
        lines.append(f"- {token}: " + "; ".join(details))
    lines.append("Use only these confirmed bindings; do not infer additional media, visual details, or asset IDs.")
    return "\n".join(lines)


def _asset_token(asset: EnhancementAsset, dialect_id: str) -> str:
    if dialect_id == "local_h3":
        names = {"image": "Picture", "video": "Video", "audio": "Audio"}
        return f"<{names[asset.kind]} {asset.ordinal}>"
    if dialect_id == "kling_api" and asset.reference_name:
        return f"@{asset.reference_name}"
    names = {"image": "Image", "video": "Video", "audio": "Audio"}
    return f"{names[asset.kind]} {asset.ordinal}"


def _source_tokens(context: EnhancementContext) -> set[str]:
    names = {"image": "Picture", "video": "Video", "audio": "Audio"}
    return {f"<{names[asset.kind]} {asset.ordinal}>" for asset in context.assets}


def validate_local_h3_output(
    content: str,
    context: EnhancementContext,
) -> str | None:
    """Check only local-H3 structure and caller-supplied source markers."""
    import re

    fields = (
        [
            "subject_definitions",
            "summary",
            "retention_analysis",
            "detailed_description",
            "overall_soundscape",
            "non_diegetic_music",
        ]
        if context.task == "ref2v"
        else ["integrated_multimodal_description", "overall_soundscape", "non_diegetic_music"]
    )
    positions: list[int] = []
    for field in fields:
        matches = re.findall(rf"(?m)^{re.escape(field)}\s*:", content)
        if not matches:
            return f"local_h3 output is missing required section '{field}:'"
        if len(matches) > 1:
            return f"local_h3 output repeats required section '{field}:'"
        positions.append(re.search(rf"(?m)^{re.escape(field)}\s*:", content).start())
    if positions != sorted(positions):
        return "local_h3 output sections are out of order"

    actual_tokens = {
        f"<{kind} {number}>"
        for kind, number in re.findall(r"<(Picture|Video|Audio)\s+(\d+)>", content)
    }
    # FL2VA's official alignment line uses bare ``Picture N`` while local
    # reference prose uses angle-bracket tags. Treat both as the same source
    # marker, but still validate the exact supplied kind/ordinal set.
    actual_tokens.update(
        f"<{kind} {number}>"
        for kind, number in re.findall(r"(?<!<)\b(Picture|Video|Audio)\s+(\d+)\b", content)
    )
    allowed_tokens = _source_tokens(context)
    unknown = sorted(actual_tokens - allowed_tokens)
    if unknown:
        return "local_h3 output contains source markers not present in confirmed assets: " + ", ".join(unknown)
    missing = sorted(allowed_tokens - actual_tokens)
    if missing:
        return "local_h3 output omitted confirmed source markers: " + ", ".join(missing)

    if context.task == "i2v":
        first_line = content.splitlines()[0] if content.splitlines() else ""
        first = next((asset for asset in context.assets if asset.role == "first_frame"), None)
        last = next((asset for asset in context.assets if asset.role == "last_frame"), None)
        if first and "0.00" not in first_line:
            return "local_h3 keyframe alignment must start at 0.00 seconds"
        if first and f"Picture {first.ordinal}" not in first_line:
            return "local_h3 first-frame alignment omits the confirmed first-frame marker"
        if last:
            if context.duration_seconds is None:
                return "local_h3 last-frame alignment requires duration_seconds"
            end = f"{context.duration_seconds:.2f}"
            if end not in first_line:
                return f"local_h3 last-frame alignment must end at the supplied duration ({end} seconds)"
            if f"Picture {last.ordinal}" not in first_line:
                return "local_h3 last-frame alignment omits the confirmed last-frame marker"

    # <Subject N> is a local content label, not an asset marker, so it is
    # intentionally excluded from source-token validation.
    return None


__all__ = [
    "EnhancementAsset",
    "EnhancementContext",
    "PROFILE_REGISTRY",
    "format_binding_context",
    "get_profile",
    "profile_metadata",
    "validate_context",
    "validate_local_h3_output",
]
