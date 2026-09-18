"""Backend-only coverage for the prompt enhancement contract."""

from __future__ import annotations

import importlib
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from api import main
from api.providers.llm_service import LLMCredentials, LLMResponse, LLMService
from api.providers.prompt_profiles import EnhancementContext, validate_context, validate_local_h3_output
from api.providers.system_prompts import build_enhancement_prompt, get_system_prompt


MATRIX = {
    "minimax_h3": {"local_h3": {"t2v", "i2v", "ref2v"}, "minimax_api": {"t2v", "i2v", "ref2v"}},
    "minimax_h3_max": {"minimax_api": {"t2v", "i2v", "ref2v"}},
    "ltx_2.3": {"ltx_native": {"t2v", "i2v"}},
    "ltx_2.5": {"ltx_native": {"t2v", "i2v"}},
    "seedance_2.0": {"seedance_api": {"t2v", "i2v", "ref2v"}},
    "seedance_2.5": {"seedance_api": {"t2v", "i2v", "ref2v"}},
    "wan_3.0": {"wan_api": {"t2v", "i2v", "ref2v"}},
    "kling_3.0": {"kling_api": {"t2v", "i2v"}},
    "kling_3.0_omni": {"kling_api": {"t2v", "i2v", "ref2v"}},
}


def _context(task: str, dialect: str, *, assets: list[dict[str, Any]] | None = None) -> EnhancementContext:
    return EnhancementContext(
        task=task,
        reference_dialect=dialect,
        assets=assets or [],
        reference_order_confirmed=True,
    )


def test_profile_endpoint_is_authoritative_and_matches_matrix() -> None:
    response = TestClient(main.app).get("/prompt-enhancement/profiles")
    assert response.status_code == 200
    profiles = {profile["target_model"]: profile for profile in response.json()["profiles"]}
    assert set(profiles) == set(MATRIX)
    for target, dialects in MATRIX.items():
        assert profiles[target]["default_dialect"] in dialects
        advertised = {dialect["id"]: set(dialect["tasks"]) for dialect in profiles[target]["dialects"]}
        assert advertised == dialects


@pytest.mark.parametrize("target,dialects", MATRIX.items())
def test_every_advertised_task_and_dialect_validates(target: str, dialects: dict[str, set[str]]) -> None:
    for dialect, tasks in dialects.items():
        for task in tasks:
            assets: list[dict[str, Any]] = []
            if task == "i2v":
                assets = [{"binding_id": "first", "kind": "image", "role": "first_frame", "ordinal": 1}]
            elif task == "ref2v":
                assets = [{"binding_id": "ref", "kind": "image", "role": "reference_image", "ordinal": 2}]
            canonical, profile, resolved = validate_context(target, _context(task, dialect, assets=assets))
            assert canonical == target
            assert task in profile["tasks"]
            assert resolved["id"] == dialect


def test_h3_defaults_local_and_h3_max_is_hosted(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(main.app)
    local = AsyncMock(return_value=LLMResponse(
        success=True,
        content="integrated_multimodal_description: [Shot 1] x\n\noverall_soundscape: N/A\n\nnon_diegetic_music: N/A",
        model_used="local",
    ))
    monkeypatch.setattr(main.llm_service, "enhance_prompt", local)
    base = {
        "user_prompt": "scene",
        "llm_provider": "ollama",
        "llm_model": "model",
        "project_type": "live_action",
        "config": {},
        "credentials": {},
    }
    local_response = client.post("/enhance-prompt", json={**base, "target_model": "minimax_h3"})
    assert local_response.json()["success"] is True
    assert local.await_args.kwargs["output_token_budget"] == 4096
    assert "PROMPT DIALECT: local_h3" in local.await_args.kwargs["user_prompt"]

    hosted = AsyncMock(return_value=LLMResponse(success=True, content="hosted", model_used="hosted"))
    monkeypatch.setattr(main.llm_service, "enhance_prompt", hosted)
    hosted_response = client.post("/enhance-prompt", json={**base, "target_model": "minimax_h3_max"})
    assert hosted_response.json()["success"] is True
    assert hosted.await_args.kwargs["output_token_budget"] is None
    assert "PROMPT DIALECT: minimax_api" in hosted.await_args.kwargs["user_prompt"]


def test_context_errors_are_400_before_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    llm = AsyncMock(side_effect=AssertionError("provider must not run"))
    monkeypatch.setattr(main.llm_service, "enhance_prompt", llm)
    response = TestClient(main.app).post(
        "/enhance-prompt",
        json={
            "user_prompt": "scene",
            "llm_provider": "google",
            "llm_model": "gemini",
            "target_model": "minimax_h3",
            "project_type": "live_action",
            "config": {},
            "credentials": {"api_key": "not-used"},
            "enhancement_context": {
                "task": "ref2v",
                "assets": [{"binding_id": "x", "kind": "image", "role": "reference_image", "ordinal": 1}],
                "reference_order_confirmed": False,
            },
        },
    )
    assert response.status_code == 400
    assert "reference_order_confirmed" in response.json()["detail"]
    llm.assert_not_called()


@pytest.mark.parametrize(
    ("target_model", "dialect", "assets", "expected_error"),
    [
        (
            "minimax_h3",
            "local_h3",
            [{"binding_id": "first", "kind": "image", "role": "first_frame", "ordinal": 3}],
            "first-only input must use first_frame ordinal 1",
        ),
        (
            "ltx_2.5",
            "ltx_native",
            [{"binding_id": "last", "kind": "image", "role": "last_frame", "ordinal": 1}],
            "ltx_2.5 i2v requires a first_frame",
        ),
    ],
)
def test_endpoint_rejects_invalid_i2v_context_before_provider(
    monkeypatch: pytest.MonkeyPatch,
    target_model: str,
    dialect: str,
    assets: list[dict[str, Any]],
    expected_error: str,
) -> None:
    provider = AsyncMock(side_effect=AssertionError("provider must not run"))
    monkeypatch.setattr(main.llm_service, "enhance_prompt", provider)
    response = TestClient(main.app).post(
        "/enhance-prompt",
        json={
            "user_prompt": "scene",
            "llm_provider": "ollama",
            "llm_model": "local",
            "target_model": target_model,
            "project_type": "live_action",
            "config": {},
            "credentials": {},
            "enhancement_context": {
                "task": "i2v",
                "reference_dialect": dialect,
                "duration_seconds": 8.25,
                "assets": assets,
                "reference_order_confirmed": True,
            },
        },
    )
    assert response.status_code == 400
    assert expected_error in response.json()["detail"]
    provider.assert_not_called()


def test_local_h3_first_last_structure_and_exact_gaps() -> None:
    context = _context(
        "i2v",
        "local_h3",
        assets=[
            {"binding_id": "opening", "kind": "image", "role": "first_frame", "ordinal": 1},
            {"binding_id": "ending", "kind": "image", "role": "last_frame", "ordinal": 2},
        ],
    ).model_copy(update={"duration_seconds": 8.0})
    valid = """How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 8.00-second mark of the target video.

integrated_multimodal_description: [Shot 1] The supplied opening state changes continuously into <Picture 2>.

overall_soundscape: N/A

non_diegetic_music: N/A"""
    assert validate_local_h3_output(valid, context) is None
    with pytest.raises(ValueError, match="first_frame ordinal 1 and last_frame ordinal 2"):
        validate_context(
            "minimax_h3",
            _context(
                "i2v",
                "local_h3",
                assets=[
                    {"binding_id": "opening", "kind": "image", "role": "first_frame", "ordinal": 1},
                    {"binding_id": "ending", "kind": "image", "role": "last_frame", "ordinal": 3},
                ],
            ).model_copy(update={"duration_seconds": 8.0}),
        )
    assert validate_local_h3_output(valid.replace("<Picture 2>", "<Picture 9>"), context)


def test_local_h3_base_slots_and_ltx_first_frame_policy() -> None:
    with pytest.raises(ValueError, match="first-only input must use first_frame ordinal 1"):
        validate_context(
            "minimax_h3",
            _context(
                "i2v",
                "local_h3",
                assets=[{"binding_id": "first", "kind": "image", "role": "first_frame", "ordinal": 3}],
            ),
        )
    with pytest.raises(ValueError, match="last-only input must use last_frame ordinal 1"):
        validate_context(
            "minimax_h3",
            _context(
                "i2v",
                "local_h3",
                assets=[{"binding_id": "last", "kind": "image", "role": "last_frame", "ordinal": 3}],
            ).model_copy(update={"duration_seconds": 8.0}),
        )
    with pytest.raises(ValueError, match="ltx_2.5 i2v requires a first_frame"):
        validate_context(
            "ltx_2.5",
            _context(
                "i2v",
                "ltx_native",
                assets=[{"binding_id": "last", "kind": "image", "role": "last_frame", "ordinal": 1}],
            ),
        )


def test_local_h3_endpoint_rejects_invalid_or_truncated_structured_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "user_prompt": "a quiet room",
        "llm_provider": "ollama",
        "llm_model": "local",
        "target_model": "minimax_h3",
        "project_type": "live_action",
        "config": {},
        "credentials": {},
    }
    client = TestClient(main.app)
    monkeypatch.setattr(
        main.llm_service,
        "enhance_prompt",
        AsyncMock(return_value=LLMResponse(success=True, content="not structured", model_used="local")),
    )
    invalid = client.post("/enhance-prompt", json=payload)
    assert invalid.status_code == 200
    assert invalid.json()["success"] is False
    assert invalid.json()["enhanced_prompt"] == ""

    monkeypatch.setattr(
        main.llm_service,
        "enhance_prompt",
        AsyncMock(return_value=LLMResponse(
            success=True,
            content="integrated_multimodal_description: [Shot 1] x\n\noverall_soundscape: N/A\n\nnon_diegetic_music: N/A",
            model_used="local",
            truncated=True,
        )),
    )
    truncated = client.post("/enhance-prompt", json=payload)
    assert truncated.json()["success"] is False
    assert "output limit" in truncated.json()["error"]


def test_local_h3_ref2v_requires_six_sections_and_preserves_dialogue_instruction() -> None:
    context = _context(
        "ref2v",
        "local_h3",
        assets=[{"binding_id": "hero", "kind": "image", "role": "reference_image", "ordinal": 2, "description": "caller-described hero"}],
    )
    prompt = build_enhancement_prompt(
        'The speaker says "こんにちは".', {}, "live_action", "minimax_h3", context, "local_h3"
    )
    assert "<Picture 2>" in prompt
    assert "server received metadata only" in prompt
    assert "preserve" in prompt.lower()
    valid = """subject_definitions:
<Subject 1> derives from <Picture 2>.
summary:
[reference generation] Use <Subject 1>.
retention_analysis:
<Subject 1>: fully_preserved
detailed_description:
[Shot 1] <Subject 1> speaks.
overall_soundscape:
N/A
non_diegetic_music:
N/A"""
    assert validate_local_h3_output(valid, context) is None
    assert validate_local_h3_output(valid.replace("retention_analysis:", "summary:"), context)


def test_target_guides_do_not_cross_contaminate_versions() -> None:
    assert "braces for dialogue" in get_system_prompt("seedance_2.0")
    assert "# Seedance 2.0 prompt guide" not in get_system_prompt("seedance_2.5")
    assert "flowing present-tense paragraph" in get_system_prompt("ltx_2.3")
    assert "Wan 3.0" in get_system_prompt("wan_3.0")
    assert "Kling" in get_system_prompt("kling_3.0_omni")


class _Response:
    def __init__(self, data: dict[str, Any]) -> None:
        self.status = 200
        self.data = data
        self.headers = {"Content-Type": "application/json"}

    async def __aenter__(self) -> "_Response":
        return self

    async def __aexit__(self, *_args: Any) -> None:
        return None

    async def json(self) -> dict[str, Any]:
        return self.data

    async def text(self) -> str:
        return str(self.data)


class _Session:
    def __init__(self, data: dict[str, Any]) -> None:
        self.calls: list[dict[str, Any]] = []
        self.data = data

    async def __aenter__(self) -> "_Session":
        return self

    async def __aexit__(self, *_args: Any) -> None:
        return None

    def post(self, url: str, **kwargs: Any) -> _Response:
        self.calls.append({"url": url, **kwargs})
        return _Response(self.data)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("provider", "credentials", "data", "truncated"),
    [
        ("openai", LLMCredentials(api_key="k"), {"choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}]}, False),
        ("google", LLMCredentials(api_key="k"), {"candidates": [{"content": {"parts": [{"text": "ok"}]}, "finishReason": "STOP"}]}, False),
        ("github_copilot", LLMCredentials(oauth_token="eyJtoken"), {"choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}]}, False),
        ("antigravity", LLMCredentials(oauth_token="oauth"), {"response": {"candidates": [{"content": {"parts": [{"text": "ok"}]}, "finishReason": "STOP"}]}}, False),
        ("openai", LLMCredentials(api_key="k"), {"choices": [{"message": {"content": "partial"}, "finish_reason": "length"}]}, True),
        ("google", LLMCredentials(api_key="k"), {"candidates": [{"content": {"parts": [{"text": "partial"}]}, "finishReason": "MAX_TOKENS"}]}, True),
        ("github_copilot", LLMCredentials(oauth_token="eyJtoken"), {"choices": [{"message": {"content": "partial"}, "finish_reason": "length"}]}, True),
        ("antigravity", LLMCredentials(oauth_token="oauth"), {"response": {"candidates": [{"content": {"parts": [{"text": "partial"}]}, "finishReason": "MAX_TOKENS"}]}}, True),
    ],
)
async def test_actual_provider_payloads_and_finish_statuses(
    monkeypatch: pytest.MonkeyPatch,
    provider: str,
    credentials: LLMCredentials,
    data: dict[str, Any],
    truncated: bool,
) -> None:
    session = _Session(data)
    llm_module = importlib.import_module("api.providers.llm_service")
    monkeypatch.setattr(llm_module.aiohttp, "ClientSession", lambda: session)
    result = await LLMService().enhance_prompt(
        "ENHANCEMENT TASK: i2v\n<Picture 1> binding_id=opening",
        "local H3 structured guide",
        provider,
        "model",
        credentials,
        output_token_budget=4096,
    )
    assert result.success
    assert result.truncated is truncated
    payload = session.calls[0]["json"]
    serialized = str(payload)
    assert "local H3 structured guide" in serialized
    assert "ENHANCEMENT TASK: i2v" in serialized
    assert "binding_id=opening" in serialized
    assert "4096" in serialized
