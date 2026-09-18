"""API package for Cinema Rules Engine."""

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(
    dotenv_path=Path(__file__).resolve().parent.parent / ".env",
    override=False,
)

from api.main import app  # noqa: E402

__all__ = ["app"]
