"""OAuth app-configuration checks using fake values and no network."""

import httpx
import pytest
from fastapi.testclient import TestClient

from api import main
from api.providers import oauth


CLIENT_ID_ENV = "ANTIGRAVITY_CLIENT_ID"
CLIENT_SECRET_ENV = "ANTIGRAVITY_CLIENT_SECRET"


@pytest.mark.parametrize(
    ("client_id", "client_secret", "expected_status"),
    [
        (None, None, 400),
        ("fake-antigravity-client-id", None, 400),
        ("fake-antigravity-client-id", "fake-antigravity-client-secret", 200),
    ],
)
def test_antigravity_authorization_requires_complete_external_configuration(
    client_id: str | None,
    client_secret: str | None,
    expected_status: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Authorization fails before any provider request when app config is incomplete."""
    config = main.OAUTH_CONFIGS["antigravity"]
    monkeypatch.setitem(config, "client_id", None)
    monkeypatch.setitem(config, "client_secret", None)
    if client_id is None:
        monkeypatch.delenv(CLIENT_ID_ENV, raising=False)
    else:
        monkeypatch.setenv(CLIENT_ID_ENV, client_id)
    if client_secret is None:
        monkeypatch.delenv(CLIENT_SECRET_ENV, raising=False)
    else:
        monkeypatch.setenv(CLIENT_SECRET_ENV, client_secret)

    # Do not open the workstation credential database in this configuration test.
    monkeypatch.setattr(main, "get_credential_storage", lambda: object())
    monkeypatch.setattr(main, "_read_stored_credentials", lambda storage, provider_id: None)

    response = TestClient(main.app).post(
        "/settings/oauth/antigravity/authorize",
        json={"redirect_uri": "http://localhost:9800/oauth/callback"},
    )

    assert response.status_code == expected_status
    if expected_status == 400:
        detail = response.json()["detail"]
        assert CLIENT_ID_ENV in detail
        assert CLIENT_SECRET_ENV in detail
        assert "administrator" in detail
    else:
        assert response.json()["authorization_url"].startswith(
            "https://accounts.google.com/o/oauth2/v2/auth?"
        )


@pytest.mark.asyncio
async def test_refresh_missing_antigravity_configuration_makes_no_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Refresh returns an actionable error before constructing a network client."""
    config = oauth.OAUTH_CONFIGS["antigravity"]
    monkeypatch.setitem(config, "client_id", None)
    monkeypatch.setitem(config, "client_secret", None)
    monkeypatch.delenv(CLIENT_ID_ENV, raising=False)
    monkeypatch.delenv(CLIENT_SECRET_ENV, raising=False)

    def fail_if_network_called(*args: object, **kwargs: object) -> None:
        raise AssertionError("OAuth refresh attempted network access")

    monkeypatch.setattr(httpx, "AsyncClient", fail_if_network_called)
    result = await oauth.refresh_token(
        "antigravity",
        "fake-antigravity-refresh-token",
        "",
        None,
    )

    assert result["error"] == "oauth_client_configuration_missing"
    assert CLIENT_ID_ENV in result["error_description"]
    assert CLIENT_SECRET_ENV in result["error_description"]
    assert "administrator" in result["error_description"]
