"""Regression coverage for the verified video target-model guidance."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, get_type_hints
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from api import main
from api.providers.llm_service import LLMResponse
from api.providers import system_prompts
from cinema_rules.prompts.generator import PromptGenerator
from cinema_rules.schemas.animation import AnimationConfig
from cinema_rules.schemas.live_action import LiveActionConfig
from cinema_rules.target_models import (
    LEGACY_NODE_TARGET_MODEL_IDS,
    MODEL_ID_ALIASES,
    TARGET_MODELS,
    get_target_models,
    normalize_target_model,
)
from scripts.sync_comfy_node import sync_rules


ROOT = Path(__file__).resolve().parents[1]
CPE_ROOT = ROOT / "CinemaPromptEngineering"
MODEL_PROMPTS = CPE_ROOT / "api" / "providers" / "system_prompts" / "model_prompts"
NEW_VIDEO_IDS = (
    "ltx_2.3",
    "ltx_2.5",
    "minimax_h3",
    "minimax_h3_max",
    "seedance_2.0",
    "seedance_2.5",
)
LEGACY_NEGATIVE = (
    "blurry, low quality, distorted, deformed, ugly, bad anatomy, "
    "watermark, signature, text, logo, amateur, poorly lit"
)


def _valid_configs() -> dict[str, dict[str, Any]]:
    """Return the canonical schema defaults used by existing API tests."""
    return {
        "live_action": LiveActionConfig().model_dump(mode="json"),
        "animation": AnimationConfig().model_dump(mode="json"),
    }


def _guide_text(model_id: str) -> str:
    return (MODEL_PROMPTS / f"{model_id}.md").read_text(encoding="utf-8").strip()


@pytest.mark.parametrize("model_id", NEW_VIDEO_IDS)
def test_new_video_targets_have_catalog_category_and_verified_guide(model_id: str) -> None:
    metadata = next(entry for entry in TARGET_MODELS if entry["id"] == model_id)
    guide = _guide_text(model_id)
    system_prompt = system_prompts.get_system_prompt(model_id)

    assert metadata["category"] == "Video"
    assert "## Verified sources" in guide
    assert "- Retrieved 2026-09-18:" in guide
    assert guide in system_prompt
    assert guide not in system_prompts.get_system_prompt("generic")


@pytest.mark.parametrize("project_type", ("live_action", "animation"))
@pytest.mark.parametrize("model_id", NEW_VIDEO_IDS)
def test_new_video_targets_leave_negative_prompt_empty_for_both_modes(
    model_id: str, project_type: str
) -> None:
    config = _valid_configs()[project_type]
    generator = PromptGenerator(model_id)

    if project_type == "live_action":
        assert generator.generate_live_action_prompt(LiveActionConfig.model_validate(config))
    else:
        assert generator.generate_animation_prompt(AnimationConfig.model_validate(config))
    assert generator.get_negative_prompt() in (None, "")


@pytest.mark.parametrize("project_type", ("live_action", "animation"))
def test_legacy_target_preserves_negative_prompt_through_generation(project_type: str) -> None:
    config = _valid_configs()[project_type]
    generator = PromptGenerator("generic")

    if project_type == "live_action":
        assert generator.generate_live_action_prompt(LiveActionConfig.model_validate(config))
    else:
        assert generator.generate_animation_prompt(AnimationConfig.model_validate(config))
    assert generator.get_negative_prompt() == LEGACY_NEGATIVE


def test_catalog_keeps_version_gap_aliases_and_legacy_negative_contract() -> None:
    supported_ids = {entry["id"] for entry in get_target_models()}
    assert not supported_ids.intersection({f"seedance_{version}" for version in ("2.1", "2.2", "2.3", "2.4")})
    assert not {f"seedance-{version}" for version in ("2.1", "2.2", "2.3", "2.4")}.intersection(MODEL_ID_ALIASES)

    assert normalize_target_model("ltx") == "ltx_2"
    assert normalize_target_model("wan2.2") == "wan_2.2"
    assert "mochi" in LEGACY_NODE_TARGET_MODEL_IDS
    assert PromptGenerator("generic").get_negative_prompt() == LEGACY_NEGATIVE
    assert PromptGenerator("sdxl").get_negative_prompt() == LEGACY_NEGATIVE
    assert PromptGenerator("flux").get_negative_prompt() is None
    assert PromptGenerator("wan2.2").get_negative_prompt() is None


def test_main_and_node_catalogs_share_canonical_entries_with_intentional_aliases() -> None:
    main_catalog = system_prompts.get_target_models()
    node_catalog = get_target_models(include_legacy=True)
    canonical_ids = {entry["id"] for entry in TARGET_MODELS}

    assert main_catalog == TARGET_MODELS
    assert {entry["id"] for entry in node_catalog}.issuperset(canonical_ids)
    assert [entry for entry in node_catalog if entry["id"] in canonical_ids] == TARGET_MODELS
    assert {entry["id"] for entry in node_catalog} - canonical_ids == set(LEGACY_NODE_TARGET_MODEL_IDS) - canonical_ids
    assert {entry["id"] for entry in node_catalog} >= {"ltx", "wan2.2", "mochi"}


def test_get_target_models_has_runtime_resolvable_annotation() -> None:
    assert get_type_hints(system_prompts.get_target_models)["return"] == list[dict[str, str]]


def test_standalone_sync_ships_importable_target_model_metadata(tmp_path: Path) -> None:
    destination = tmp_path / "standalone" / "cinema_rules"
    destination.parent.mkdir()
    sync_rules(destination=destination)
    assert (destination / "target_models.py").is_file()

    code = """
import json
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from cinema_rules.target_models import get_target_models, normalize_target_model
assert normalize_target_model('ltx') == 'ltx_2'
assert any(item['id'] == 'ltx_2.3' and item['category'] == 'Video' for item in get_target_models())
assert 'api.providers' not in sys.modules
print(json.dumps({'target_models': str(Path(sys.modules['cinema_rules.target_models'].__file__).resolve())}))
"""
    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    result = subprocess.run(
        [sys.executable, "-I", "-c", code, str(destination.parent)],
        cwd=tmp_path,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    assert json.loads(result.stdout)["target_models"] == str((destination / "target_models.py").resolve())


def test_model_guide_reaches_mocked_enhance_request(monkeypatch: pytest.MonkeyPatch) -> None:
    llm = AsyncMock(return_value=LLMResponse(success=True, content="enhanced", model_used="fake-model"))
    monkeypatch.setattr(main.llm_service, "enhance_prompt", llm)

    response = TestClient(main.app).post(
        "/enhance-prompt",
        json={
            "user_prompt": "a quiet room",
            "llm_provider": "ollama",
            "llm_model": "fake-model",
            "target_model": "ltx_2.3",
            "project_type": "live_action",
            "config": _valid_configs()["live_action"],
            "credentials": {},
        },
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert "# LTX 2.3 prompt guide" in llm.await_args.kwargs["system_prompt"]
