"""Focused credential-storage regressions using only temporary fake data."""

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import main
from api.providers.credential_storage import (
    CredentialStorage,
    CredentialStorageError,
    ProviderCredentials,
)


FAKE_TOKEN = "fake-access-token-for-tests-only"
DB_NAME = "credentials.db"


def _ciphertext(db_path: Path, provider_id: str) -> str:
    """Read the stored ciphertext for a provider without decrypting it."""
    with sqlite3.connect(db_path) as connection:
        row = connection.execute(
            "SELECT encrypted_data FROM credentials WHERE provider_id = ?",
            (provider_id,),
        ).fetchone()
    assert row is not None
    return row[0]


def _database_snapshot(db_path: Path) -> tuple[list[tuple], list[tuple]]:
    """Capture credential/settings rows without decrypting credential data."""
    with sqlite3.connect(db_path) as connection:
        credentials = connection.execute(
            "SELECT provider_id, encrypted_data, updated_at FROM credentials ORDER BY provider_id"
        ).fetchall()
        settings = connection.execute(
            "SELECT key, value, updated_at FROM settings ORDER BY key"
        ).fetchall()
    return credentials, settings


def test_same_seed_reopen_preserves_fake_token(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Credentials remain readable after reopening the same database and seed."""
    monkeypatch.setenv("CINEMA_ENCRYPTION_SEED", "test-seed-reopen")
    db_path = tmp_path / DB_NAME
    storage = CredentialStorage(db_path)
    storage.set_credentials("fake_provider", ProviderCredentials(oauth_token=FAKE_TOKEN))

    reopened = CredentialStorage(db_path)

    assert reopened.get_credentials("fake_provider").oauth_token == FAKE_TOKEN


def test_fake_token_is_absent_from_database_bytes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The fake token is encrypted at rest rather than stored as plaintext."""
    monkeypatch.setenv("CINEMA_ENCRYPTION_SEED", "test-seed-at-rest")
    db_path = tmp_path / DB_NAME
    storage = CredentialStorage(db_path)
    storage.set_credentials("fake_provider", ProviderCredentials(oauth_token=FAKE_TOKEN))

    assert FAKE_TOKEN.encode() not in db_path.read_bytes()


def test_wrong_seed_fails_without_rewriting_ciphertext(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A wrong seed raises an actionable error and leaves ciphertext untouched."""
    db_path = tmp_path / DB_NAME
    monkeypatch.setenv("CINEMA_ENCRYPTION_SEED", "test-seed-original")
    storage = CredentialStorage(db_path)
    storage.set_credentials("fake_provider", ProviderCredentials(api_key=FAKE_TOKEN))
    before = _ciphertext(db_path, "fake_provider")

    monkeypatch.setenv("CINEMA_ENCRYPTION_SEED", "test-seed-wrong")
    broken_storage = CredentialStorage(db_path)
    with pytest.raises(CredentialStorageError, match="Restore the original"):
        broken_storage.get_credentials("fake_provider")

    monkeypatch.setattr(main, "get_credential_storage", lambda: broken_storage)
    response = TestClient(main.app).put(
        "/credentials/fake_provider",
        json={"endpoint": "https://example.invalid"},
    )
    assert response.status_code == 500
    assert _ciphertext(db_path, "fake_provider") == before


def test_missing_row_is_none_but_unreadable_row_raises(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Only a genuinely absent provider is represented by None."""
    monkeypatch.setenv("CINEMA_ENCRYPTION_SEED", "test-seed-distinction")
    db_path = tmp_path / DB_NAME
    storage = CredentialStorage(db_path)
    assert storage.get_credentials("missing_provider") is None
    storage.set_credentials("fake_provider", ProviderCredentials(api_key=FAKE_TOKEN))

    with sqlite3.connect(db_path) as connection:
        connection.execute(
            "UPDATE credentials SET encrypted_data = ? WHERE provider_id = ?",
            ("not-fernet-data", "fake_provider"),
        )
        connection.commit()

    with pytest.raises(CredentialStorageError):
        storage.get_credentials("fake_provider")


def test_api_reports_unreadable_storage(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Credential APIs explain seed/machine identity failures instead of hiding them."""
    db_path = tmp_path / DB_NAME
    monkeypatch.setenv("CINEMA_ENCRYPTION_SEED", "test-seed-api-original")
    storage = CredentialStorage(db_path)
    storage.set_credentials("fake_provider", ProviderCredentials(api_key=FAKE_TOKEN))

    monkeypatch.setenv("CINEMA_ENCRYPTION_SEED", "test-seed-api-wrong")
    broken_storage = CredentialStorage(db_path)
    monkeypatch.setattr(main, "get_credential_storage", lambda: broken_storage)

    response = TestClient(main.app).get("/credentials")

    assert response.status_code == 500
    assert "Restore the original CINEMA_ENCRYPTION_SEED or machine identity" in response.json()["detail"]
    assert "do not erase" in response.json()["detail"]


def test_import_wrong_seed_is_atomic_for_settings_and_credentials(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A wrong seed cannot partially apply an import."""
    db_path = tmp_path / DB_NAME
    monkeypatch.setenv("CINEMA_ENCRYPTION_SEED", "test-seed-import-original")
    storage = CredentialStorage(db_path)
    storage.set_credentials("fake_provider", ProviderCredentials(api_key=FAKE_TOKEN))
    storage.set_setting("active_provider", "fake_provider")
    before_ciphertext = _ciphertext(db_path, "fake_provider")

    monkeypatch.setenv("CINEMA_ENCRYPTION_SEED", "test-seed-import-wrong")
    broken_storage = CredentialStorage(db_path)
    monkeypatch.setattr(main, "get_credential_storage", lambda: broken_storage)

    response = TestClient(main.app).post(
        "/credentials/import",
        json={
            "data": {
                "activeProvider": "new_provider",
                "providers": {
                    "fake_provider": {"apiKey": "replacement-token"},
                    "new_provider": {"apiKey": "new-token"},
                },
            }
        },
    )

    assert response.status_code == 500
    assert "Restore the original CINEMA_ENCRYPTION_SEED" in response.json()["detail"]
    assert _ciphertext(db_path, "fake_provider") == before_ciphertext
    assert broken_storage.get_setting("active_provider") == "fake_provider"
    assert broken_storage.get_credentials("new_provider") is None


def test_import_new_provider_wrong_seed_is_atomic(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A new-provider-only import still validates all existing encrypted rows."""
    db_path = tmp_path / DB_NAME
    monkeypatch.setenv("CINEMA_ENCRYPTION_SEED", "test-seed-import-existing")
    storage = CredentialStorage(db_path)
    storage.set_credentials("existing_provider", ProviderCredentials(api_key=FAKE_TOKEN))
    storage.set_setting("active_provider", "existing_provider")
    before = _database_snapshot(db_path)

    monkeypatch.setenv("CINEMA_ENCRYPTION_SEED", "test-seed-import-new-only-wrong")
    broken_storage = CredentialStorage(db_path)
    with pytest.raises(CredentialStorageError, match="Restore the original"):
        broken_storage.import_from_localstorage(
            {
                "activeProvider": "new_provider",
                "providers": {"new_provider": {"apiKey": "new-token"}},
            }
        )

    assert _database_snapshot(db_path) == before
    assert storage.get_credentials("existing_provider").api_key == FAKE_TOKEN


def test_new_provider_wrong_seed_cannot_create_mixed_key_storage(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Ordinary credential writes reject a wrong seed before adding a row."""
    db_path = tmp_path / DB_NAME
    monkeypatch.setenv("CINEMA_ENCRYPTION_SEED", "test-seed-put-existing")
    storage = CredentialStorage(db_path)
    storage.set_credentials("existing_provider", ProviderCredentials(api_key=FAKE_TOKEN))
    before = _database_snapshot(db_path)

    monkeypatch.setenv("CINEMA_ENCRYPTION_SEED", "test-seed-put-new-wrong")
    broken_storage = CredentialStorage(db_path)
    with pytest.raises(CredentialStorageError, match="Restore the original"):
        broken_storage.set_credentials("new_provider", ProviderCredentials(api_key="new-token"))

    assert _database_snapshot(db_path) == before
    assert storage.get_credentials("existing_provider").api_key == FAKE_TOKEN


def test_put_empty_oauth_tokens_stays_disconnected_after_reload(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The existing merge PUT accepts explicit empty OAuth tokens."""
    monkeypatch.setenv("CINEMA_ENCRYPTION_SEED", "test-seed-disconnect")
    storage = CredentialStorage(tmp_path / DB_NAME)
    storage.set_credentials(
        "fake_provider",
        ProviderCredentials(
            oauth_token=FAKE_TOKEN,
            oauth_refresh_token=FAKE_TOKEN,
            oauth_expires_at=1234,
        ),
    )
    monkeypatch.setattr(main, "get_credential_storage", lambda: storage)

    client = TestClient(main.app)
    response = client.put(
        "/credentials/fake_provider",
        json={"oauth_token": "", "oauth_refresh_token": "", "oauth_expires_at": None},
    )

    assert response.status_code == 200
    reloaded = storage.get_credentials("fake_provider")
    assert reloaded is not None
    assert not reloaded.oauth_token
    assert not reloaded.oauth_refresh_token
    assert reloaded.oauth_expires_at is None
