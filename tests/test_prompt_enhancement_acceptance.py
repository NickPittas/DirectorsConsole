"""HTTP-boundary prompt-enhancement acceptance tests.

These tests exercise the FastAPI route, real prompt construction, and the real
LLM service while replacing only the outbound HTTP transport.
"""

from __future__ import annotations

import importlib
import time
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from api import main
from api.providers.credential_storage import CredentialStorage, ProviderCredentials


LLM_MODULE = importlib.import_module("api.providers.llm_service")


BASE_OUTPUT = """How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 8.25-second mark of the target video.

integrated_multimodal_description: [Shot 1] The scene develops from <Picture 1> toward <Picture 2>.

overall_soundscape: N/A

non_diegetic_music: N/A"""

REF_OUTPUT = """subject_definitions:
<Subject 1> is derived from <Picture 3>.
summary:
[reference generation] Use <Subject 1>.
retention_analysis:
<Subject 1>: fully_preserved
detailed_description:
[Shot 1] <Subject 1> moves through the supplied setting.
overall_soundscape:
N/A
non_diegetic_music:
N/A"""


class _Response:
    def __init__(self, data: dict[str, Any], *, finish: int = 200) -> None:
        self.status = finish
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
        self.data = data
        self.calls: list[dict[str, Any]] = []

    async def __aenter__(self) -> "_Session":
        return self

    async def __aexit__(self, *_args: Any) -> None:
        return None

    def post(self, url: str, **kwargs: Any) -> _Response:
        self.calls.append({"url": url, **kwargs})
        return _Response(self.data)


def _payload(provider: str, credentials: dict[str, str], *, task: str = "i2v") -> dict[str, Any]:
    assets = [
        {"binding_id": "first", "kind": "image", "role": "first_frame", "ordinal": 1},
        {"binding_id": "last", "kind": "image", "role": "last_frame", "ordinal": 2},
    ]
    return {
        "user_prompt": "The subject says \"keep moving\".",
        "llm_provider": provider,
        "llm_model": "fake-model",
        "target_model": "minimax_h3",
        "project_type": "live_action",
        "config": {},
        "credentials": credentials,
        "enhancement_context": {
            "task": task,
            "reference_dialect": "local_h3",
            "duration_seconds": 8.25,
            "assets": assets if task == "i2v" else [
                {"binding_id": "ref", "kind": "image", "role": "reference_image", "ordinal": 3}
            ],
            "reference_order_confirmed": True,
        },
    }


def _local_h3_i2v_output(alignment: str, narrative: str) -> str:
    return (
        f"{alignment}\n\n"
        f"integrated_multimodal_description: {narrative}\n\n"
        "overall_soundscape: N/A\n\n"
        "non_diegetic_music: N/A"
    )


def _provider_body(provider: str, content: str) -> dict[str, Any]:
    if provider in {"openai", "github_copilot"}:
        return {"choices": [{"message": {"content": content}, "finish_reason": "stop"}]}
    if provider == "google":
        return {"candidates": [{"content": {"parts": [{"text": content}]}, "finishReason": "STOP"}]}
    return {
        "response": {
            "candidates": [{"content": {"parts": [{"text": content}]}, "finishReason": "STOP"}]
        }
    }


def _body_text(provider: str, payload: dict[str, Any]) -> tuple[str, str]:
    if provider in {"openai", "github_copilot"}:
        return payload["messages"][0]["content"], payload["messages"][1]["content"]
    if provider == "google":
        text = payload["contents"][0]["parts"][0]["text"]
        return text, text
    text = payload["request"]["contents"][0]["parts"][0]["text"]
    return text, text


@pytest.mark.parametrize(
    ("provider", "credentials"),
    [
        ("openai", {"api_key": "fake-key"}),
        ("google", {"api_key": "fake-key"}),
        ("github_copilot", {"oauth_token": "fake-copilot-jwt"}),
        ("antigravity", {"oauth_token": "fake-antigravity-token"}),
    ],
)
def test_endpoint_captures_real_prompt_and_4096_budget(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    provider: str,
    credentials: dict[str, str],
) -> None:
    session = _Session(_provider_body(provider, BASE_OUTPUT))
    monkeypatch.setattr(LLM_MODULE.aiohttp, "ClientSession", lambda: session)
    monkeypatch.setattr(main, "get_credential_storage", lambda: CredentialStorage(tmp_path / "empty.db"))

    response = TestClient(main.app).post(
        "/enhance-prompt", json=_payload(provider, credentials)
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["enhanced_prompt"] == BASE_OUTPUT
    assert session.calls
    system, user = _body_text(provider, session.calls[0]["json"])
    assert "# MiniMax H3 prompt guide" in system
    assert "350-500" in system
    assert "overall_soundscape" in system
    assert "8.25" in user
    assert "Picture 1" in user and "Picture 2" in user
    if provider in {"openai", "github_copilot"}:
        assert "Picture 3" not in user

    body = session.calls[0]["json"]
    if provider in {"openai", "github_copilot"}:
        assert body["max_tokens"] == 4096
    elif provider == "google":
        assert body["generationConfig"]["maxOutputTokens"] == 4096
    else:
        assert body["request"]["generationConfig"]["maxOutputTokens"] == 4096


def test_endpoint_ref2v_preserves_gap_three_in_real_prompt_and_output(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    session = _Session(_provider_body("openai", REF_OUTPUT))
    monkeypatch.setattr(LLM_MODULE.aiohttp, "ClientSession", lambda: session)
    monkeypatch.setattr(main, "get_credential_storage", lambda: CredentialStorage(tmp_path / "empty.db"))

    response = TestClient(main.app).post(
        "/enhance-prompt", json=_payload("openai", {"api_key": "fake-key"}, task="ref2v")
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["enhanced_prompt"] == REF_OUTPUT
    user = session.calls[0]["json"]["messages"][1]["content"]
    assert "<Picture 3>" in user
    assert "preserve gaps and do not renumber" in user


@pytest.mark.parametrize("provider", ["openai", "google", "github_copilot", "antigravity"])
def test_endpoint_length_finish_is_structured_failure(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, provider: str
) -> None:
    if provider in {"openai", "github_copilot"}:
        data = {"choices": [{"message": {"content": BASE_OUTPUT}, "finish_reason": "length"}]}
    elif provider == "google":
        data = {"candidates": [{"content": {"parts": [{"text": BASE_OUTPUT}]}, "finishReason": "MAX_TOKENS"}]}
    else:
        data = {"response": {"candidates": [{"content": {"parts": [{"text": BASE_OUTPUT}]}, "finishReason": "MAX_TOKENS"}]}}
    session = _Session(data)
    monkeypatch.setattr(LLM_MODULE.aiohttp, "ClientSession", lambda: session)
    monkeypatch.setattr(main, "get_credential_storage", lambda: CredentialStorage(tmp_path / "empty.db"))
    credentials = {"api_key": "fake-key"} if provider in {"openai", "google"} else {"oauth_token": "fake-token"}

    response = TestClient(main.app).post(
        "/enhance-prompt", json=_payload(provider, credentials)
    )

    assert response.status_code == 200
    assert response.json()["success"] is False
    assert "output limit" in response.json()["error"]


@pytest.mark.parametrize(
    "content",
    [
        "preamble\\nintegrated_multimodal_description: [Shot 1] x\\n\\noverall_soundscape: N/A\\n\\nnon_diegetic_music: N/A",
        "integrated_multimodal_description:\\n\\noverall_soundscape: N/A\\n\\nnon_diegetic_music: N/A",
    ],
)
def test_endpoint_rejects_prefaced_or_empty_h3_sections(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, content: str
) -> None:
    content = content.replace(chr(92) + "n", chr(10))
    session = _Session(_provider_body("openai", content))
    monkeypatch.setattr(LLM_MODULE.aiohttp, "ClientSession", lambda: session)
    monkeypatch.setattr(main, "get_credential_storage", lambda: CredentialStorage(tmp_path / "empty.db"))

    response = TestClient(main.app).post(
        "/enhance-prompt", json=_payload("openai", {"api_key": "fake-key"})
    )

    assert response.status_code == 200
    assert response.json()["success"] is False
    assert response.json()["enhanced_prompt"] == ""


def test_invalid_structure_keeps_real_refreshed_oauth_token(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    old_token = "fake-old-token"
    new_token = "fake-new-token"
    storage = CredentialStorage(tmp_path / "credentials.db")
    storage.set_credentials(
        "antigravity",
        ProviderCredentials(
            oauth_token=old_token,
            oauth_refresh_token="fake-refresh",
            oauth_expires_at=int(time.time()) - 1,
        ),
    )
    monkeypatch.setattr(main, "get_credential_storage", lambda: storage)
    monkeypatch.setattr(
        "api.providers.oauth.refresh_token",
        AsyncMock(return_value={"access_token": new_token, "expires_in": 3600}),
    )
    session = _Session(
        {
            "response": {
                "candidates": [{"content": {"parts": [{"text": "not structured"}]}, "finishReason": "STOP"}]
            }
        }
    )
    monkeypatch.setattr(LLM_MODULE.aiohttp, "ClientSession", lambda: session)

    response = TestClient(main.app).post(
        "/enhance-prompt",
        json=_payload("antigravity", {"oauth_token": old_token}),
    )

    assert response.status_code == 200
    assert response.json()["success"] is False
    assert response.json()["oauth_token"] == new_token


@pytest.mark.parametrize(
    ("assets", "alignment", "narrative"),
    [
        (
            [
                {"binding_id": "first", "kind": "image", "role": "first_frame", "ordinal": 1},
                {"binding_id": "last", "kind": "image", "role": "last_frame", "ordinal": 2},
            ],
            "How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 8.25-second mark of the target video.",
            "[Shot 1] The supplied opening state changes continuously into <Picture 2>.",
        ),
        (
            [
                {"binding_id": "first", "kind": "image", "role": "first_frame", "ordinal": 1},
                {"binding_id": "last", "kind": "image", "role": "last_frame", "ordinal": 2},
            ],
            "How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 3) aligns with the 8.25-second mark of the target video.",
            "[Shot 1] The opening state holds. [Shot 2] Motion builds. [Shot 3] The supplied ending state arrives at <Picture 2>.",
        ),
        (
            [{"binding_id": "last", "kind": "image", "role": "last_frame", "ordinal": 1}],
            "How the reference pictures align with the target video — <Picture 1> (from [Shot 1]) aligns with the 8.25-second mark of the target video.",
            "[Shot 1] The final-frame composition remains visible as <Picture 1>.",
        ),
        (
            [{"binding_id": "last", "kind": "image", "role": "last_frame", "ordinal": 1}],
            "How the reference pictures align with the target video — <Picture 1> (from [Shot 2]) aligns with the 8.25-second mark of the target video.",
            "[Shot 1] The scene develops. [Shot 2] The final-frame composition settles on <Picture 1>.",
        ),
    ],
)
def test_endpoint_accepts_exact_h3_keyframe_alignment_and_keeps_refreshed_oauth(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    assets: list[dict[str, Any]],
    alignment: str,
    narrative: str,
) -> None:
    old_token = "fake-old-token"
    new_token = "fake-new-token"
    storage = CredentialStorage(tmp_path / "credentials.db")
    storage.set_credentials(
        "antigravity",
        ProviderCredentials(
            oauth_token=old_token,
            oauth_refresh_token="fake-refresh",
            oauth_expires_at=int(time.time()) - 1,
        ),
    )
    monkeypatch.setattr(main, "get_credential_storage", lambda: storage)
    monkeypatch.setattr(
        "api.providers.oauth.refresh_token",
        AsyncMock(return_value={"access_token": new_token, "expires_in": 3600}),
    )
    output = _local_h3_i2v_output(alignment, narrative)
    session = _Session(_provider_body("antigravity", output))
    monkeypatch.setattr(LLM_MODULE.aiohttp, "ClientSession", lambda: session)
    payload = _payload("antigravity", {"oauth_token": old_token})
    payload["enhancement_context"]["assets"] = assets

    response = TestClient(main.app).post("/enhance-prompt", json=payload)

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["enhanced_prompt"] == output
    assert response.json()["oauth_token"] == new_token


@pytest.mark.parametrize(
    ("assets", "alignment", "narrative", "error"),
    [
        (
            [
                {"binding_id": "first", "kind": "image", "role": "first_frame", "ordinal": 1},
                {"binding_id": "last", "kind": "image", "role": "last_frame", "ordinal": 2},
            ],
            "How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 blah 8.25",
            "[Shot 1] The supplied opening state changes continuously into <Picture 2>.",
            "FL2VA",
        ),
        (
            [{"binding_id": "last", "kind": "image", "role": "last_frame", "ordinal": 1}],
            "How the reference pictures align with the target video — <Picture 1> (from GARBAGE) aligns with the 8.25-second mark of the target video.",
            "[Shot 1] The final-frame composition remains visible as <Picture 1>.",
            "L2VA",
        ),
    ],
)
def test_endpoint_rejects_malformed_h3_keyframe_alignment(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    assets: list[dict[str, Any]],
    alignment: str,
    narrative: str,
    error: str,
) -> None:
    session = _Session(_provider_body("openai", _local_h3_i2v_output(alignment, narrative)))
    monkeypatch.setattr(LLM_MODULE.aiohttp, "ClientSession", lambda: session)
    monkeypatch.setattr(main, "get_credential_storage", lambda: CredentialStorage(tmp_path / "empty.db"))
    payload = _payload("openai", {"api_key": "fake-key"})
    payload["enhancement_context"]["assets"] = assets

    response = TestClient(main.app).post("/enhance-prompt", json=payload)

    assert response.status_code == 200
    assert response.json()["success"] is False
    assert error in response.json()["error"]
