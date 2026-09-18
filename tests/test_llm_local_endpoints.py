"""Regression tests for local LLM endpoint normalization."""

import importlib
from typing import Any

import pytest

llm_service = importlib.import_module("api.providers.llm_service")
LLMCredentials = llm_service.LLMCredentials
LLMService = llm_service.LLMService


class FakeResponse:
    def __init__(self, status: int, data: dict[str, Any]):
        self.status = status
        self._data = data

    async def __aenter__(self) -> "FakeResponse":
        return self

    async def __aexit__(self, *args: Any) -> None:
        return None

    async def json(self) -> dict[str, Any]:
        return self._data

    async def text(self) -> str:
        return str(self._data)


class FakeSession:
    def __init__(self, response: FakeResponse):
        self.response = response
        self.calls: list[dict[str, Any]] = []

    async def __aenter__(self) -> "FakeSession":
        return self

    async def __aexit__(self, *args: Any) -> None:
        return None

    def post(self, url: str, **kwargs: Any) -> FakeResponse:
        self.calls.append({"method": "POST", "url": url, **kwargs})
        return self.response

    def get(self, url: str, **kwargs: Any) -> FakeResponse:
        self.calls.append({"method": "GET", "url": url, **kwargs})
        return self.response


@pytest.fixture
def fake_session(monkeypatch: pytest.MonkeyPatch):
    def install(data: dict[str, Any], status: int = 200) -> FakeSession:
        session = FakeSession(FakeResponse(status, data))
        monkeypatch.setattr(
            llm_service.aiohttp,
            "ClientSession",
            lambda *args, **kwargs: session,
        )
        return session

    return install


LOCAL_ENDPOINT_CASES = [
    ("ollama", None, "http://localhost:11434/api/chat", "http://localhost:11434/api/tags"),
    (
        "ollama",
        "http://localhost:11434/",
        "http://localhost:11434/api/chat",
        "http://localhost:11434/api/tags",
    ),
    (
        "ollama",
        "http://localhost:11434/api",
        "http://localhost:11434/api/chat",
        "http://localhost:11434/api/tags",
    ),
    (
        "ollama",
        "http://localhost:11434/api/chat?profile=local",
        "http://localhost:11434/api/chat?profile=local",
        "http://localhost:11434/api/tags?profile=local",
    ),
    (
        "ollama",
        "http://localhost:11434/proxy/api?profile=local",
        "http://localhost:11434/proxy/api/chat?profile=local",
        "http://localhost:11434/proxy/api/tags?profile=local",
    ),
    ("lmstudio", None, "http://localhost:1234/v1/chat/completions", "http://localhost:1234/v1/models"),
    (
        "lmstudio",
        "http://localhost:1234/",
        "http://localhost:1234/v1/chat/completions",
        "http://localhost:1234/v1/models",
    ),
    (
        "lmstudio",
        "http://localhost:1234/v1",
        "http://localhost:1234/v1/chat/completions",
        "http://localhost:1234/v1/models",
    ),
    (
        "lmstudio",
        "http://localhost:1234/api/v1/",
        "http://localhost:1234/api/v1/chat/completions",
        "http://localhost:1234/api/v1/models",
    ),
    (
        "lmstudio",
        "http://localhost:1234/v1/chat/completions?profile=local",
        "http://localhost:1234/v1/chat/completions?profile=local",
        "http://localhost:1234/v1/models?profile=local",
    ),
    (
        "lmstudio",
        "http://localhost:1234/proxy/v1?profile=local",
        "http://localhost:1234/proxy/v1/chat/completions?profile=local",
        "http://localhost:1234/proxy/v1/models?profile=local",
    ),
]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("provider", "endpoint", "expected_chat", "_expected_models"),
    LOCAL_ENDPOINT_CASES,
)
async def test_chat_uses_one_normalized_local_endpoint(
    provider: str,
    endpoint: str | None,
    expected_chat: str,
    _expected_models: str,
    fake_session,
) -> None:
    response_data = (
        {"message": {"content": "ollama result"}}
        if provider == "ollama"
        else {"choices": [{"message": {"content": "lm studio result"}}]}
    )
    session = fake_session(response_data)
    model = "ollama:llama3:latest" if provider == "ollama" else "local-model"

    result = await LLMService().enhance_prompt(
        "user prompt",
        "system prompt",
        provider,
        model,
        LLMCredentials(endpoint=endpoint),
    )

    assert result.success is True
    assert result.content in {"ollama result", "lm studio result"}
    assert result.model_used == ("llama3:latest" if provider == "ollama" else model)
    assert session.calls[0]["method"] == "POST"
    assert session.calls[0]["url"] == expected_chat


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("provider", "endpoint", "_expected_chat", "expected_models"),
    LOCAL_ENDPOINT_CASES,
)
async def test_model_discovery_uses_matching_normalized_endpoint(
    provider: str,
    endpoint: str | None,
    _expected_chat: str,
    expected_models: str,
    fake_session,
) -> None:
    response_data = (
        {
            "models": [
                {"name": "llama3:latest", "size": 123},
                {"name": "nomic-embed-text", "size": 456},
            ]
        }
        if provider == "ollama"
        else {"data": [{"id": "local-model"}]}
    )
    session = fake_session(response_data)

    result = await LLMService().fetch_provider_models(
        provider,
        LLMCredentials(endpoint=endpoint),
    )

    assert result["success"] is True
    assert session.calls[0]["method"] == "GET"
    assert session.calls[0]["url"] == expected_models
    if provider == "ollama":
        assert [model["id"] for model in result["models"]] == ["llama3:latest"]
    else:
        assert result["models"] == [
            {"id": "local-model", "name": "local-model", "recommended": False}
        ]


@pytest.mark.asyncio
async def test_local_request_errors_are_returned_without_network_calls(fake_session) -> None:
    session = fake_session({"error": {"message": "server unavailable"}}, status=503)

    result = await LLMService().enhance_prompt(
        "user",
        "system",
        "lmstudio",
        "local-model",
        LLMCredentials(),
    )

    assert result.success is False
    assert "Local LLM error" in result.error
    assert "server unavailable" in result.error
    assert session.calls[0]["url"] == "http://localhost:1234/v1/chat/completions"


@pytest.mark.asyncio
async def test_model_discovery_request_errors_are_returned(fake_session) -> None:
    session = fake_session({}, status=503)

    result = await LLMService().fetch_provider_models("ollama", LLMCredentials())

    assert result == {
        "success": False,
        "error": "Server not responding (status 503)",
        "models": [],
    }
    assert session.calls[0]["url"] == "http://localhost:11434/api/tags"
