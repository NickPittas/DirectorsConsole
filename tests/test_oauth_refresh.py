"""Focused standard OAuth refresh regressions using fake tokens only."""

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock

from api import main
from api.providers.credential_storage import CredentialStorage, ProviderCredentials
from api.providers.llm_service import LLMResponse


PROVIDER = "antigravity"
OLD_TOKEN = "fake-old-access-token"
OLD_REFRESH = "fake-old-refresh-token"
NEW_TOKEN = "fake-new-access-token"
ROTATED_REFRESH = "fake-rotated-refresh-token"


def _payload(token: str) -> dict:
    return {
        "user_prompt": "a test scene",
        "llm_provider": PROVIDER,
        "llm_model": "fake-model",
        "target_model": "generic",
        "project_type": "live_action",
        "config": {},
        "credentials": {"oauth_token": token},
    }


def _storage(tmp_path: Path, **overrides: object) -> CredentialStorage:
    values = {
        "oauth_token": OLD_TOKEN,
        "oauth_refresh_token": OLD_REFRESH,
        "oauth_client_id": "fake-client-id",
        "oauth_client_secret": "fake-client-secret",
        "oauth_expires_at": int(time.time()) - 1,
    }
    values.update(overrides)
    storage = CredentialStorage(tmp_path / "credentials.db")
    storage.set_credentials(PROVIDER, ProviderCredentials(**values))
    return storage


def _mock_llm(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    llm = AsyncMock(return_value=LLMResponse(success=True, content="enhanced", model_used="fake-model"))
    monkeypatch.setattr(main.llm_service, "enhance_prompt", llm)
    return llm


def test_expired_saved_token_refreshes_before_enhance_and_persists_rotation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage = _storage(tmp_path)
    monkeypatch.setattr(main, "get_credential_storage", lambda: storage)
    llm = _mock_llm(monkeypatch)

    refresh = AsyncMock(
        return_value={
            "access_token": NEW_TOKEN,
            "refresh_token": ROTATED_REFRESH,
            "expires_in": 3600,
        }
    )
    monkeypatch.setattr("api.providers.oauth.refresh_token", refresh)

    response = TestClient(main.app).post("/enhance-prompt", json=_payload(OLD_TOKEN))

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert refresh.await_count == 1
    assert llm.await_args.kwargs["credentials"].oauth_token == NEW_TOKEN
    saved = storage.get_credentials(PROVIDER)
    assert saved.oauth_token == NEW_TOKEN
    assert saved.oauth_refresh_token == ROTATED_REFRESH
    assert saved.oauth_expires_at > int(time.time())


def test_downstream_failure_returns_refreshed_token_for_next_generation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A failed enhancement still lets the browser adopt the refreshed token."""
    storage = _storage(tmp_path)
    monkeypatch.setattr(main, "get_credential_storage", lambda: storage)
    failed_llm = AsyncMock(
        return_value=LLMResponse(success=False, error="fake downstream failure")
    )
    monkeypatch.setattr(main.llm_service, "enhance_prompt", failed_llm)
    refresh = AsyncMock(
        return_value={
            "access_token": NEW_TOKEN,
            "refresh_token": ROTATED_REFRESH,
            "expires_in": 3600,
        }
    )
    monkeypatch.setattr("api.providers.oauth.refresh_token", refresh)

    failed = TestClient(main.app).post("/enhance-prompt", json=_payload(OLD_TOKEN))

    assert failed.status_code == 200
    assert failed.json()["success"] is False
    assert failed.json()["oauth_token"] == NEW_TOKEN

    # Simulate the next browser call after it stores the response token.
    successful_llm = AsyncMock(
        return_value=LLMResponse(success=True, content="enhanced", model_used="fake-model")
    )
    monkeypatch.setattr(main.llm_service, "enhance_prompt", successful_llm)
    next_response = TestClient(main.app).post("/enhance-prompt", json=_payload(NEW_TOKEN))

    assert next_response.status_code == 200
    assert next_response.json()["success"] is True
    assert successful_llm.await_args.kwargs["credentials"].oauth_token == NEW_TOKEN
    assert refresh.await_count == 1


def test_downstream_exception_returns_actionable_failure_and_refreshed_token(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage = _storage(tmp_path)
    monkeypatch.setattr(main, "get_credential_storage", lambda: storage)
    monkeypatch.setattr(
        main.llm_service,
        "enhance_prompt",
        AsyncMock(side_effect=RuntimeError("fake downstream exception")),
    )
    monkeypatch.setattr(
        "api.providers.oauth.refresh_token",
        AsyncMock(return_value={"access_token": NEW_TOKEN, "expires_in": 3600}),
    )

    response = TestClient(main.app).post("/enhance-prompt", json=_payload(OLD_TOKEN))

    assert response.status_code == 200
    assert response.json()["success"] is False
    assert response.json()["oauth_token"] == NEW_TOKEN
    assert "Enhancement failed" in response.json()["error"]


def test_refresh_without_rotation_retains_existing_refresh_token(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage = _storage(tmp_path)
    monkeypatch.setattr(main, "get_credential_storage", lambda: storage)
    _mock_llm(monkeypatch)
    monkeypatch.setattr(
        "api.providers.oauth.refresh_token",
        AsyncMock(return_value={"access_token": NEW_TOKEN, "expires_in": 3600}),
    )

    response = TestClient(main.app).post("/enhance-prompt", json=_payload(OLD_TOKEN))

    assert response.status_code == 200
    assert storage.get_credentials(PROVIDER).oauth_refresh_token == OLD_REFRESH


def test_unknown_expiry_remains_usable_without_forced_refresh(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage = _storage(tmp_path, oauth_expires_at=None)
    monkeypatch.setattr(main, "get_credential_storage", lambda: storage)
    llm = _mock_llm(monkeypatch)
    refresh = AsyncMock(side_effect=AssertionError("unknown expiry must not refresh"))
    monkeypatch.setattr("api.providers.oauth.refresh_token", refresh)

    response = TestClient(main.app).post("/enhance-prompt", json=_payload(OLD_TOKEN))

    assert response.status_code == 200
    assert llm.await_args.kwargs["credentials"].oauth_token == OLD_TOKEN
    assert refresh.await_count == 0


def test_failed_refresh_preserves_saved_credentials_and_requests_reauth(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage = _storage(tmp_path)
    monkeypatch.setattr(main, "get_credential_storage", lambda: storage)
    llm = _mock_llm(monkeypatch)
    monkeypatch.setattr(
        "api.providers.oauth.refresh_token",
        AsyncMock(return_value={"error": "invalid_grant", "error_description": "fake failure"}),
    )

    response = TestClient(main.app).post("/enhance-prompt", json=_payload(OLD_TOKEN))

    assert response.status_code == 200
    assert response.json()["success"] is False
    assert "re-authenticate" in response.json()["error"]
    assert llm.await_count == 0
    saved = storage.get_credentials(PROVIDER)
    assert saved.oauth_token == OLD_TOKEN
    assert saved.oauth_refresh_token == OLD_REFRESH


def test_different_explicit_token_is_not_silently_replaced(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage = _storage(tmp_path)
    monkeypatch.setattr(main, "get_credential_storage", lambda: storage)
    llm = _mock_llm(monkeypatch)
    refresh = AsyncMock(side_effect=AssertionError("ad-hoc token must not refresh"))
    monkeypatch.setattr("api.providers.oauth.refresh_token", refresh)

    explicit_token = "fake-explicit-other-account-token"
    response = TestClient(main.app).post("/enhance-prompt", json=_payload(explicit_token))

    assert response.status_code == 200
    assert llm.await_args.kwargs["credentials"].oauth_token == explicit_token
    assert refresh.await_count == 0
    saved = storage.get_credentials(PROVIDER)
    assert saved.oauth_token == OLD_TOKEN
