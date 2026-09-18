"""Backend entrypoint environment loading tests."""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

CLIENT_ID_ENV = "ANTIGRAVITY_CLIENT_ID"
CLIENT_SECRET_ENV = "ANTIGRAVITY_CLIENT_SECRET"
IMPORT_SCRIPT = """
import json
from api.main import IMPORT_TIME_CLIENT_ID, IMPORT_TIME_CLIENT_SECRET

print(json.dumps({
    "client_id": IMPORT_TIME_CLIENT_ID,
    "client_secret": IMPORT_TIME_CLIENT_SECRET,
}))
"""


@pytest.fixture
def isolated_backend(tmp_path: Path) -> Path:
    """Create an isolated copy of the backend entrypoint and OAuth module."""
    package_root = tmp_path / "cpe-install"
    package = package_root / "api"
    providers = package / "providers"
    providers.mkdir(parents=True)

    source_root = Path(__file__).resolve().parents[1] / "CinemaPromptEngineering"
    shutil.copy2(source_root / "api" / "__init__.py", package / "__init__.py")
    shutil.copy2(source_root / "api" / "providers" / "oauth.py", providers / "oauth.py")
    (providers / "__init__.py").write_text("", encoding="utf-8")
    (package / "main.py").write_text(
        """from api.providers.oauth import OAUTH_CONFIGS

app = object()
IMPORT_TIME_CLIENT_ID = OAUTH_CONFIGS[\"antigravity\"][\"client_id\"]
IMPORT_TIME_CLIENT_SECRET = OAUTH_CONFIGS[\"antigravity\"][\"client_secret\"]
""",
        encoding="utf-8",
    )
    return package_root


def run_isolated_import(
    package_root: Path,
    *,
    env_values: tuple[str, str] | None = None,
) -> dict[str, str | None]:
    """Import the copied backend in a fresh process and return fake config values."""
    process_env = os.environ.copy()
    process_env.pop(CLIENT_ID_ENV, None)
    process_env.pop(CLIENT_SECRET_ENV, None)
    if env_values is not None:
        process_env[CLIENT_ID_ENV], process_env[CLIENT_SECRET_ENV] = env_values
    process_env["PYTHONPATH"] = str(package_root)

    cwd = package_root.parent / "different-cwd"
    cwd.mkdir()
    (cwd / ".env").write_text(
        f"{CLIENT_ID_ENV}=wrong-cwd-id\n{CLIENT_SECRET_ENV}=wrong-cwd-secret\n",
        encoding="utf-8",
    )
    result = subprocess.run(
        [sys.executable, "-c", IMPORT_SCRIPT],
        cwd=cwd,
        env=process_env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_entrypoint_loads_backend_env_from_package_path_before_oauth_config(isolated_backend: Path) -> None:
    """The real package entrypoint loads its adjacent .env before OAuth import-time config."""
    (isolated_backend / ".env").write_text(
        f"{CLIENT_ID_ENV}=fake-file-client-id\n{CLIENT_SECRET_ENV}=fake-file-client-secret\n",
        encoding="utf-8",
    )

    values = run_isolated_import(isolated_backend)

    assert values == {
        "client_id": "fake-file-client-id",
        "client_secret": "fake-file-client-secret",
    }


def test_process_environment_wins_over_backend_env_file(isolated_backend: Path) -> None:
    """The explicit override=False behavior preserves already-exported values."""
    (isolated_backend / ".env").write_text(
        f"{CLIENT_ID_ENV}=fake-file-client-id\n{CLIENT_SECRET_ENV}=fake-file-client-secret\n",
        encoding="utf-8",
    )

    values = run_isolated_import(
        isolated_backend,
        env_values=("fake-process-client-id", "fake-process-client-secret"),
    )

    assert values == {
        "client_id": "fake-process-client-id",
        "client_secret": "fake-process-client-secret",
    }


def test_missing_backend_env_file_is_harmless(isolated_backend: Path) -> None:
    """A missing adjacent .env does not prevent shell environment configuration."""
    values = run_isolated_import(
        isolated_backend,
        env_values=("fake-shell-client-id", "fake-shell-client-secret"),
    )

    assert values == {
        "client_id": "fake-shell-client-id",
        "client_secret": "fake-shell-client-secret",
    }
