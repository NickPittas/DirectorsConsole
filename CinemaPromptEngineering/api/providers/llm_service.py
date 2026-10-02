"""LLM Service for prompt enhancement.

Supports multiple LLM providers:
- OpenAI (API key)
- Anthropic (API key)
- Google Gemini (API key)
- OpenRouter (API key)
- Local providers (Ollama, LM Studio)
- OAuth providers (GitHub Copilot, Antigravity, OpenAI Codex)
"""

import asyncio
import base64
import json
import logging
from dataclasses import dataclass
from typing import Optional, Dict, Any, Literal
from urllib.parse import urlsplit, urlunsplit

import aiohttp

from api.providers.enhancement_images import EnhancementImage, ensure_payload_size

logger = logging.getLogger(__name__)


@dataclass
class LLMResponse:
    """Response from an LLM call."""

    success: bool
    content: str = ""
    error: str = ""
    tokens_used: int = 0
    model_used: str = ""
    truncated: bool = False


@dataclass
class LLMCredentials:
    """Credentials for LLM provider authentication."""

    api_key: Optional[str] = None
    endpoint: Optional[str] = None
    oauth_token: Optional[str] = None


# =============================================================================
# PROVIDER ENDPOINTS
# =============================================================================

PROVIDER_ENDPOINTS: Dict[str, str] = {
    "openai": "https://api.openai.com/v1/chat/completions",
    "anthropic": "https://api.anthropic.com/v1/messages",
    "google": "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
    "replicate": "https://api.replicate.com/v1/predictions",
    "ollama": "http://localhost:11434/api/chat",
    "lmstudio": "http://localhost:1234/v1/chat/completions",
    # GitHub Copilot uses Copilot API (OAuth)
    "github_copilot": "https://api.githubcopilot.com/chat/completions",
    # GitHub Models uses models.github.ai (PAT-based)
    "github_models": "https://models.github.ai/inference/chat/completions",
    # Antigravity uses Google Cloud AI Companion endpoints
    "antigravity": "https://cloudcode-pa.googleapis.com/v1internal:generateContent",
    # OpenAI Codex uses ChatGPT backend Codex Responses API
    "openai_codex": "https://chatgpt.com/backend-api/codex/responses",
}


def _local_endpoint_url(endpoint: str, provider: str, resource: str) -> str:
    """Build a local-provider route without duplicating its API path."""
    parsed = urlsplit(endpoint)
    path = parsed.path.rstrip("/")

    if provider == "ollama":
        api_suffix = "/api"
        known_suffixes = ("/api/chat", "/api/tags", "/api")
    else:
        api_suffix = "/v1"
        known_suffixes = ("/v1/chat/completions", "/v1/models", "/v1")

    for suffix in known_suffixes:
        if path == suffix or path.endswith(suffix):
            path = path[: -len(suffix)]
            break

    return urlunsplit(parsed._replace(path=f"{path}{api_suffix}/{resource}"))


def _compatible_endpoint_url(endpoint: str, resource: str, *, anthropic: bool = False) -> str:
    """Validate a compatible API URL and build its inference or discovery route."""
    try:
        parsed = urlsplit(endpoint)
        host = parsed.hostname
        port = parsed.port
    except ValueError as exc:
        raise ValueError("Endpoint must be a valid absolute HTTP(S) URL") from exc

    if (
        parsed.scheme not in {"http", "https"}
        or not host
        or (port is not None and not 1 <= port <= 65535)
        or any(char.isspace() for char in parsed.netloc)
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or "?" in endpoint
        or "#" in endpoint
    ):
        raise ValueError("Endpoint must be an absolute HTTP(S) URL without credentials, query, or fragment")

    path = parsed.path.rstrip("/")
    explicit_route = path.endswith(("/chat/completions", "/messages", "/models"))
    for suffix in ("/chat/completions", "/messages", "/models"):
        if path == suffix or path.endswith(suffix):
            path = path[: -len(suffix)]
            break

    if not path:
        path = "/v1"
    elif anthropic and not explicit_route and not path.endswith("/v1"):
        path += "/v1"
    return urlunsplit(parsed._replace(path=f"{path}/{resource}"))


def openai_user_content(
    user_prompt: str, images: list[EnhancementImage] | None = None
) -> str | list[dict]:
    if not images:
        return user_prompt
    return [
        {"type": "text", "text": user_prompt},
        *({"type": "image_url", "image_url": {"url": image.data_url}} for image in images),
    ]


def image_request_error(provider: str, status: int) -> LLMResponse:
    messages = {
        400: "Request rejected (400). Check the request format and whether the selected model supports image input.",
        401: "Authentication failed (401). Check the provider credentials.",
        403: "Access denied (403). Check account access and image-input permissions.",
        413: "Image request is too large (413). Reduce the image data or prompt text.",
        429: "Provider quota or rate limit reached (429). Wait and try again.",
    }
    return LLMResponse(
        success=False,
        error=f"{provider} {messages.get(status, f'request failed ({status})')}",
    )


def _openai_chat_body(
    model: str,
    system_prompt: str,
    user_prompt: str,
    token_budget: int,
    images: list[EnhancementImage] | None = None,
) -> dict:
    model_id = model.lower().rsplit("/", 1)[-1]
    generation = model_id.removeprefix("gpt-").split("-", 1)[0].split(".", 1)[0]
    newer_gpt = model_id.startswith("gpt-") and generation.isdigit() and int(generation) >= 5
    o_series = model_id.startswith("o") and model_id[1:2].isdigit()
    reasoning = newer_gpt or o_series
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": openai_user_content(user_prompt, images)},
        ],
        "max_completion_tokens" if reasoning else "max_tokens": token_budget,
    }
    if not reasoning:
        body["temperature"] = 0.7
    return body


def _is_non_chat_openai_model(model_id: str) -> bool:
    return any(
        category in model_id.lower()
        for category in (
            "embed", "audio", "tts", "whisper", "transcrib", "dall-e", "image",
            "moderation", "realtime", "search", "instruct", "davinci", "babbage",
            "curie", "ada",
        )
    )


def _format_anthropic_models(items: list) -> list[dict]:
    return [
        {
            "id": model["id"],
            "name": model.get("display_name") or model["id"],
            "recommended": False,
            "description": model.get("description", ""),
            "context_window": model.get("context_window"),
        }
        for model in items
        if isinstance(model, dict) and isinstance(model.get("id"), str) and model["id"]
    ]


# =============================================================================
# LLM SERVICE CLASS
# =============================================================================


class LLMService:
    """Service for calling various LLM providers."""

    def __init__(self, timeout: int = 60):
        self.timeout = timeout

    async def enhance_prompt(
        self,
        user_prompt: str,
        system_prompt: str,
        provider: str,
        model: str,
        credentials: LLMCredentials,
        output_token_budget: int | None = None,
        images: list[EnhancementImage] | None = None,
    ) -> LLMResponse:
        """
        Enhance a prompt using the specified LLM provider.

        Args:
            user_prompt: The user's prompt to enhance
            system_prompt: System prompt with enhancement instructions
            provider: LLM provider ID (openai, anthropic, etc.)
            model: Model name/ID
            credentials: Authentication credentials
            output_token_budget: Optional provider output limit for structured prompts

        Returns:
            LLMResponse with enhanced prompt or error
        """
        provider_lower = provider.lower()
        image_kwargs = {"images": images} if images else {}

        try:
            if provider_lower.startswith("openai-compatible-"):
                return await self._call_openai(
                    user_prompt, system_prompt, model, credentials, output_token_budget,
                    allow_keyless=True, **image_kwargs
                )
            elif provider_lower.startswith("anthropic-compatible-"):
                return await self._call_anthropic(
                    user_prompt, system_prompt, model, credentials, output_token_budget,
                    allow_keyless=True, **image_kwargs
                )
            elif provider_lower == "openai":
                return await self._call_openai(
                    user_prompt, system_prompt, model, credentials, output_token_budget, **image_kwargs
                )
            elif provider_lower == "anthropic":
                return await self._call_anthropic(
                    user_prompt, system_prompt, model, credentials, output_token_budget, **image_kwargs
                )
            elif provider_lower == "google":
                return await self._call_google(
                    user_prompt, system_prompt, model, credentials, output_token_budget, **image_kwargs
                )
            elif provider_lower == "openrouter":
                return await self._call_openrouter(
                    user_prompt, system_prompt, model, credentials, output_token_budget, **image_kwargs
                )
            elif provider_lower in ("ollama", "lmstudio"):
                return await self._call_local(
                    user_prompt, system_prompt, model, credentials, provider_lower, output_token_budget,
                    **image_kwargs
                )
            elif provider_lower == "github_copilot":
                return await self._call_github_copilot(
                    user_prompt, system_prompt, model, credentials, output_token_budget, **image_kwargs
                )
            elif provider_lower == "antigravity":
                return await self._call_antigravity(
                    user_prompt, system_prompt, model, credentials, output_token_budget, **image_kwargs
                )
            elif provider_lower == "github_models":
                return await self._call_github_models(
                    user_prompt, system_prompt, model, credentials, output_token_budget, **image_kwargs
                )
            elif provider_lower == "openai_codex":
                return await self._call_openai_codex(
                    user_prompt, system_prompt, model, credentials, output_token_budget, **image_kwargs
                )
            else:
                return LLMResponse(success=False, error=f"Unsupported provider: {provider}")
        except asyncio.TimeoutError:
            if images:
                return LLMResponse(success=False, error="Image request failed; check model image support and retry.")
            return LLMResponse(success=False, error="Request timed out")
        except aiohttp.ClientError as e:
            if images:
                return LLMResponse(success=False, error="Image request failed; check model image support and retry.")
            return LLMResponse(success=False, error=f"Network error: {str(e)}")
        except ValueError as e:
            if images:
                message = str(e)
                if message.startswith("Image request payload"):
                    return LLMResponse(success=False, error=message)
                return LLMResponse(success=False, error="Image request failed; check model image support and retry.")
            logger.exception(f"LLM call failed for provider {provider}")
            return LLMResponse(success=False, error=str(e))
        except Exception as e:
            if images:
                logger.error("Image request failed for provider %s", provider)
                return LLMResponse(success=False, error="Image request failed; check model image support and retry.")
            logger.exception(f"LLM call failed for provider {provider}")
            return LLMResponse(success=False, error=str(e))

    # -------------------------------------------------------------------------
    # OpenAI
    # -------------------------------------------------------------------------

    async def _call_openai(
        self,
        user_prompt: str,
        system_prompt: str,
        model: str,
        credentials: LLMCredentials,
        output_token_budget: int | None = None,
        allow_keyless: bool = False,
        images: list[EnhancementImage] | None = None,
    ) -> LLMResponse:
        """Call OpenAI or an OpenAI-compatible API."""
        if not credentials.api_key and not allow_keyless:
            return LLMResponse(success=False, error="OpenAI API key required")
        if allow_keyless and not credentials.endpoint:
            return LLMResponse(success=False, error="Compatible provider endpoint required")

        if not model:
            return LLMResponse(
                success=False, error="No model selected. Fetch available models first."
            )

        endpoint = _compatible_endpoint_url(
            credentials.endpoint or PROVIDER_ENDPOINTS["openai"], "chat/completions"
        )
        output_token_budget = output_token_budget or 4096
        headers = {"Content-Type": "application/json"}
        if credentials.api_key:
            headers["Authorization"] = f"Bearer {credentials.api_key}"

        payload = _openai_chat_body(model, system_prompt, user_prompt, output_token_budget, images)
        if images:
            ensure_payload_size(payload)

        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                if images and response.status != 200:
                    return image_request_error("OpenAI", response.status)
                try:
                    data = await response.json()
                except (aiohttp.ContentTypeError, json.JSONDecodeError, UnicodeDecodeError):
                    if images:
                        return LLMResponse(success=False, error="OpenAI returned an invalid response for the image request.")
                    raise
                return self._openai_response(data, response.status, model)

    def _openai_response(self, data: dict, status: int, model: str) -> LLMResponse:
        if status == 401:
            return LLMResponse(success=False, error="OpenAI authentication failed (401)")
        if status == 404:
            return LLMResponse(
                success=False, error="OpenAI-compatible API returned 404. Check endpoint and model."
            )
        if status != 200:
            error_msg = data.get("error", {}).get("message", str(data))
            return LLMResponse(success=False, error=f"OpenAI error ({status}): {error_msg}")

        choices = data.get("choices") or []
        if not choices:
            return LLMResponse(success=False, error="The model returned no completion choices.")
        choice = choices[0]
        message = choice.get("message") or {}
        content = message.get("content")
        if isinstance(content, list):
            content = "".join(
                block.get("text", "") for block in content
                if isinstance(block, dict) and block.get("type") == "text"
            )
        truncated = choice.get("finish_reason") in {"length", "max_tokens"}
        if not isinstance(content, str) or not content.strip():
            error = "The model returned no text."
            if truncated:
                error += " Its token budget was exhausted, possibly by reasoning."
            elif message.get("refusal"):
                error = "The model declined this request."
            return LLMResponse(success=False, error=error, model_used=model, truncated=truncated)
        return LLMResponse(
            success=True,
            content=content,
            tokens_used=data.get("usage", {}).get("total_tokens", 0),
            model_used=model,
            truncated=truncated,
        )

    # -------------------------------------------------------------------------
    # Anthropic
    # -------------------------------------------------------------------------

    async def _call_anthropic(
        self,
        user_prompt: str,
        system_prompt: str,
        model: str,
        credentials: LLMCredentials,
        output_token_budget: int | None = None,
        allow_keyless: bool = False,
        images: list[EnhancementImage] | None = None,
    ) -> LLMResponse:
        """Call Anthropic or an Anthropic-compatible API."""
        if not credentials.api_key and not allow_keyless:
            return LLMResponse(success=False, error="Anthropic API key required")
        if allow_keyless and not credentials.endpoint:
            return LLMResponse(success=False, error="Compatible provider endpoint required")

        endpoint = _compatible_endpoint_url(
            credentials.endpoint or PROVIDER_ENDPOINTS["anthropic"], "messages", anthropic=True
        )
        output_token_budget = output_token_budget or 1000
        headers = {"anthropic-version": "2023-06-01", "Content-Type": "application/json"}
        if credentials.api_key:
            headers["x-api-key"] = credentials.api_key

        payload = {
            "model": model,
            "system": system_prompt,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": user_prompt},
                *({"type": "image", "source": {
                    "type": "base64", "media_type": image.mime_type, "data": image.data
                }} for image in images or []),
            ] if images else user_prompt}],
            "max_tokens": output_token_budget,
        }
        if images:
            ensure_payload_size(payload)

        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint, headers=headers, json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                if images and response.status != 200:
                    return image_request_error("Anthropic", response.status)
                return self._anthropic_response(await response.json(), response.status, model)

    def _anthropic_response(self, data: dict, status: int, model: str) -> LLMResponse:
        if status == 401:
            return LLMResponse(success=False, error="Anthropic authentication failed (401)")
        if status != 200:
            error_msg = data.get("error", {}).get("message", str(data))
            return LLMResponse(success=False, error=f"Anthropic error: {error_msg}")
        usage = data.get("usage", {})
        content = "".join(
            block.get("text", "")
            for block in (data.get("content") or [])
            if isinstance(block, dict)
            and block.get("type") == "text"
            and isinstance(block.get("text"), str)
        )
        if not content.strip():
            return LLMResponse(
                success=False,
                error="The model returned no text.",
                model_used=model,
                truncated=data.get("stop_reason") == "max_tokens",
            )
        return LLMResponse(
            success=True,
            content=content,
            tokens_used=usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
            model_used=model,
            truncated=data.get("stop_reason") == "max_tokens",
        )

    # -------------------------------------------------------------------------
    # Google Gemini
    # -------------------------------------------------------------------------

    async def _call_google(
        self,
        user_prompt: str,
        system_prompt: str,
        model: str,
        credentials: LLMCredentials,
        output_token_budget: int | None = None,
        images: list[EnhancementImage] | None = None,
    ) -> LLMResponse:
        """Call Google Gemini API."""
        if not credentials.api_key:
            return LLMResponse(success=False, error="Google API key required")

        endpoint = PROVIDER_ENDPOINTS["google"].format(model=model) + f"?key={credentials.api_key}"
        output_token_budget = output_token_budget or 1000

        parts = [{"text": f"{system_prompt}\n\n{user_prompt}"}]
        if images:
            parts.extend({"inline_data": {"mime_type": image.mime_type, "data": image.data}} for image in images)
        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {"maxOutputTokens": output_token_budget, "temperature": 0.7},
        }
        if images:
            ensure_payload_size(payload)

        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint, headers={"Content-Type": "application/json"}, json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                if images and response.status != 200:
                    return image_request_error("Google", response.status)
                data = await response.json()

                if response.status != 200:
                    error_msg = data.get("error", {}).get("message", str(data))
                    return LLMResponse(success=False, error=f"Google error: {error_msg}")

                if not images:
                    candidate = data["candidates"][0]
                    content = candidate["content"]["parts"][0]["text"]
                else:
                    candidates = data.get("candidates", [])
                    candidate = candidates[0] if candidates else {}
                    response_parts = candidate.get("content", {}).get("parts", [])
                    content = "".join(part.get("text", "") for part in response_parts if isinstance(part, dict) and isinstance(part.get("text"), str))
                    if not content.strip():
                        return LLMResponse(success=False, error="Google returned no text for the image request.", model_used=model)
                return LLMResponse(
                    success=True, content=content, model_used=model,
                    truncated=candidate.get("finishReason") in {"MAX_TOKENS", "LENGTH"},
                )

    # -------------------------------------------------------------------------
    # OpenRouter
    # -------------------------------------------------------------------------

    async def _call_openrouter(
        self,
        user_prompt: str,
        system_prompt: str,
        model: str,
        credentials: LLMCredentials,
        output_token_budget: int | None = None,
        images: list[EnhancementImage] | None = None,
    ) -> LLMResponse:
        """Call OpenRouter API (OpenAI-compatible)."""
        if not credentials.api_key:
            return LLMResponse(success=False, error="OpenRouter API key required")

        endpoint = credentials.endpoint or PROVIDER_ENDPOINTS["openrouter"]
        output_token_budget = output_token_budget or 1000

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": openai_user_content(user_prompt, images)},
            ],
            "max_tokens": output_token_budget,
            "temperature": 0.7,
        }
        if images:
            ensure_payload_size(payload)

        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {credentials.api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://cinema-prompt-engineering.local",
                    "X-Title": "Cinema Prompt Engineering",
                },
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                if images and response.status != 200:
                    return image_request_error("OpenRouter", response.status)
                try:
                    data = await response.json()
                except (aiohttp.ContentTypeError, json.JSONDecodeError, UnicodeDecodeError):
                    if images:
                        return LLMResponse(success=False, error="OpenRouter returned an invalid response for the image request.")
                    raise

                if response.status != 200:
                    error_msg = data.get("error", {}).get("message", str(data))
                    return LLMResponse(success=False, error=f"OpenRouter error: {error_msg}")

                choice = data["choices"][0]
                content = choice["message"]["content"]
                tokens = data.get("usage", {}).get("total_tokens", 0)

                return LLMResponse(
                    success=True,
                    content=content,
                    tokens_used=tokens,
                    model_used=model,
                    truncated=choice.get("finish_reason") in {"length", "max_tokens"},
                )

    # -------------------------------------------------------------------------
    # Local Providers (Ollama, LM Studio)
    # -------------------------------------------------------------------------

    async def _call_local(
        self,
        user_prompt: str,
        system_prompt: str,
        model: str,
        credentials: LLMCredentials,
        provider: str,
        output_token_budget: int | None = None,
        images: list[EnhancementImage] | None = None,
    ) -> LLMResponse:
        """Call local LLM providers (Ollama or LM Studio)."""
        default_endpoint = PROVIDER_ENDPOINTS.get(provider, PROVIDER_ENDPOINTS["ollama"])
        endpoint = _local_endpoint_url(
            credentials.endpoint or default_endpoint,
            provider,
            "chat" if provider == "ollama" else "chat/completions",
        )

        if provider == "ollama":
            # Strip provider prefix if present (e.g., "ollama:llama3" -> "llama3")
            if model.startswith("ollama:"):
                model = model.split(":", 1)[1]

            # Ollama uses its own API format
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": user_prompt,
                        **({"images": [image.data for image in images]} if images else {}),
                    },
                ],
                "stream": False,
                **({"options": {"num_predict": output_token_budget}} if output_token_budget else {}),
            }
        else:
            # LM Studio uses OpenAI-compatible format
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": openai_user_content(user_prompt, images)},
                ],
                "max_tokens": output_token_budget or 1000,
                "temperature": 0.7,
            }

        if images:
            ensure_payload_size(payload)

        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                if images and response.status != 200:
                    return image_request_error("Ollama" if provider == "ollama" else "LM Studio", response.status)
                try:
                    data = await response.json()
                except (aiohttp.ContentTypeError, json.JSONDecodeError, UnicodeDecodeError):
                    if images:
                        return LLMResponse(success=False, error="Local provider returned an invalid image-request response.")
                    raise

                if response.status != 200:
                    error_msg = data.get("error", {})
                    if isinstance(error_msg, dict):
                        error_msg = error_msg.get("message", str(data))
                    return LLMResponse(success=False, error=f"Local LLM error: {error_msg}")

                if provider == "ollama":
                    content = data.get("message", {}).get("content", "")
                    truncated = data.get("done_reason") in {"length", "max_tokens"}
                else:
                    # LM Studio uses OpenAI-compatible format with choices array
                    choices = data.get("choices")
                    if not choices or not isinstance(choices, list) or len(choices) == 0:
                        if images:
                            return LLMResponse(success=False, error="LM Studio returned no completion choices for the image request.")
                        error_info = data.get("error", "No choices returned in response")
                        return LLMResponse(
                            success=False, error=f"LM Studio response error: {error_info}"
                        )
                    content = choices[0].get("message", {}).get("content", "")
                    truncated = choices[0].get("finish_reason") in {"length", "max_tokens"}
                    if not content:
                        return LLMResponse(success=False, error="LM Studio returned empty content")

                return LLMResponse(
                    success=True,
                    content=content,
                    model_used=model,
                    truncated=truncated,
                )

    # -------------------------------------------------------------------------
    # GitHub Copilot (OAuth) - Uses Copilot API
    # -------------------------------------------------------------------------

    async def _call_github_copilot(
        self,
        user_prompt: str,
        system_prompt: str,
        model: str,
        credentials: LLMCredentials,
        output_token_budget: int | None = None,
        images: list[EnhancementImage] | None = None,
    ) -> LLMResponse:
        """Call GitHub Copilot API via OAuth token.

        Uses the Copilot chat completions API with OAuth authentication.
        The oauth_token should be the Copilot JWT token (not the raw GitHub token).

        Token types:
        - GitHub OAuth token: starts with "gho_..." - WRONG for Copilot API
        - Copilot JWT token: starts with "eyJ..." - CORRECT for Copilot API
        """
        if not credentials.oauth_token:
            return LLMResponse(
                success=False,
                error="GitHub Copilot OAuth token required. Click 'Connect' to authenticate.",
            )

        if not model:
            return LLMResponse(
                success=False, error="No model selected. Fetch available models first."
            )

        # Debug: Log the token type to help diagnose issues
        token = credentials.oauth_token
        is_jwt = token.startswith("eyJ") if token else False
        is_github_oauth = token.startswith("gho_") if token else False
        logger.info(
            f"[Copilot API] Token type | Is JWT: {is_jwt} | Is GitHub OAuth: {is_github_oauth}"
        )

        if is_github_oauth:
            logger.warning(
                "[Copilot API] WARNING: Token appears to be a GitHub OAuth token (gho_...), not a Copilot JWT (eyJ...)! This will cause 403 errors."
            )

        endpoint = PROVIDER_ENDPOINTS["github_copilot"]
        output_token_budget = output_token_budget or 2000

        # Must use exact headers that VS Code Copilot extension uses
        headers = {
            "Authorization": f"Bearer {credentials.oauth_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "GitHubCopilotChat/0.26.7",
            "Editor-Version": "vscode/1.99.3",
            "Editor-Plugin-Version": "copilot-chat/0.26.7",
            "Copilot-Integration-Id": "vscode-chat",
            "Openai-Organization": "github-copilot",
            "Openai-Intent": "conversation-panel",
        }

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": openai_user_content(user_prompt, images)},
            ],
            "max_tokens": output_token_budget,
            "temperature": 0.7,
            "stream": False,
        }
        if images:
            ensure_payload_size(payload)

        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                # Get response content, handling both JSON and text responses
                content_type = response.headers.get("Content-Type", "")

                if images and response.status != 200:
                    return image_request_error("GitHub Copilot", response.status)
                if response.status != 200:
                    # Handle error responses (may be text/plain)
                    if "application/json" in content_type:
                        try:
                            data = await response.json()
                            error_msg = data.get("error", {}).get("message", str(data))
                        except (json.JSONDecodeError, ValueError, KeyError):
                            error_msg = await response.text()
                    else:
                        error_msg = await response.text()

                    if response.status == 400:
                        # Check if token might be wrong type
                        if "token" in error_msg.lower() or "auth" in error_msg.lower():
                            return LLMResponse(
                                success=False,
                                error=f"GitHub Copilot authentication error. Your token may be the wrong type (need Copilot JWT, not GitHub OAuth token). Try re-authenticating. Details: {error_msg[:200]}",
                            )
                        return LLMResponse(
                            success=False, error=f"GitHub Copilot request error: {error_msg[:300]}"
                        )
                    elif response.status == 401:
                        return LLMResponse(
                            success=False,
                            error="GitHub Copilot token expired or invalid. Please re-authenticate.",
                        )
                    elif response.status == 403:
                        return LLMResponse(
                            success=False,
                            error="GitHub Copilot access denied. Ensure you have an active Copilot subscription.",
                        )
                    elif response.status == 404:
                        return LLMResponse(
                            success=False,
                            error=f"GitHub Copilot model '{model}' not found. Try a different model.",
                        )
                    else:
                        return LLMResponse(
                            success=False,
                            error=f"GitHub Copilot error ({response.status}): {error_msg[:300]}",
                        )

                # Success - parse JSON response
                try:
                    data = await response.json()
                except Exception as e:
                    if images:
                        return LLMResponse(success=False, error="GitHub Copilot returned an invalid response for the image request.")
                    text = await response.text()
                    return LLMResponse(
                        success=False, error=f"GitHub Copilot returned invalid JSON: {text[:200]}"
                    )

                choice = data["choices"][0]
                content = choice["message"]["content"]

                return LLMResponse(
                    success=True,
                    content=content,
                    model_used=model,
                    truncated=choice.get("finish_reason") in {"length", "max_tokens"},
                )

    # -------------------------------------------------------------------------
    # GitHub Models (PAT-based) - Uses models.github.ai
    # -------------------------------------------------------------------------

    async def _call_github_models(
        self,
        user_prompt: str,
        system_prompt: str,
        model: str,
        credentials: LLMCredentials,
        output_token_budget: int | None = None,
        images: list[EnhancementImage] | None = None,
    ) -> LLMResponse:
        """Call GitHub Models API (models.github.ai).

        GitHub Models provides access to various LLMs including GPT-4o, Claude, Llama, etc.
        Uses OpenAI-compatible chat completions format.
        Requires a GitHub Personal Access Token (PAT) with 'models:read' permission.
        """
        if not credentials.api_key:
            return LLMResponse(
                success=False,
                error="GitHub Personal Access Token (PAT) required. Create one at https://github.com/settings/tokens with 'models:read' permission.",
            )

        if not model:
            return LLMResponse(
                success=False, error="No model selected. Fetch available models first."
            )

        endpoint = PROVIDER_ENDPOINTS["github_models"]
        output_token_budget = output_token_budget or 2000
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": openai_user_content(user_prompt, images)},
            ],
            "max_tokens": output_token_budget,
            "temperature": 0.7,
        }
        if images:
            ensure_payload_size(payload)

        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {credentials.api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                if images and response.status != 200:
                    return image_request_error("GitHub Models", response.status)
                try:
                    data = await response.json()
                except (aiohttp.ContentTypeError, json.JSONDecodeError, UnicodeDecodeError):
                    if images:
                        return LLMResponse(success=False, error="GitHub Models returned an invalid response for the image request.")
                    raise

                if response.status != 200:
                    error_msg = data.get("error", {}).get("message", str(data))
                    return LLMResponse(success=False, error=f"GitHub Models error: {error_msg}")

                choice = data["choices"][0]
                content = choice["message"]["content"]

                return LLMResponse(
                    success=True,
                    content=content,
                    model_used=model,
                    truncated=choice.get("finish_reason") in {"length", "max_tokens"},
                )

    # -------------------------------------------------------------------------
    # Antigravity (Google Cloud AI Companion)
    # NOTE: Antigravity uses Google Cloud's AI Companion API, not OpenAI-compatible format.
    # This is a simplified implementation - full support would require complex request transformation.
    # -------------------------------------------------------------------------

    async def _call_antigravity(
        self,
        user_prompt: str,
        system_prompt: str,
        model: str,
        credentials: LLMCredentials,
        output_token_budget: int | None = None,
        images: list[EnhancementImage] | None = None,
    ) -> LLMResponse:
        """Call Antigravity API (Google Cloud AI Companion).

        Uses Google Cloud Code Assist internal API with v1internal endpoint.
        Requires OAuth token from Google authentication flow.

        IMPORTANT: Cloud Code Assist API uses a wrapped request format where
        the actual Gemini payload must be nested inside a "request" field.
        """
        import uuid

        if not credentials.oauth_token:
            return LLMResponse(success=False, error="Antigravity OAuth token required")

        if not model:
            return LLMResponse(
                success=False, error="No model selected. Fetch available models first."
            )

        # Try endpoints in order - sandbox endpoints often have better quota availability
        endpoints = [
            "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent",
            "https://autopush-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent",
            "https://cloudcode-pa.googleapis.com/v1internal:generateContent",
        ]

        # Full Antigravity headers matching the official client
        headers = {
            "Authorization": f"Bearer {credentials.oauth_token}",
            "Content-Type": "application/json",
            "User-Agent": "antigravity/1.11.5 windows/amd64",
            "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
            "Client-Metadata": '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
        }

        # Build the INNER request (standard Gemini format)
        parts = [{"text": f"{system_prompt}\n\n{user_prompt}"}]
        if images:
            parts.extend({"inline_data": {"mime_type": image.mime_type, "data": image.data}} for image in images)
        inner_request = {
            "contents": [
                {"role": "user", "parts": parts}
            ],
            "generationConfig": {
                "maxOutputTokens": output_token_budget or 2000,
                "temperature": 0.7,
            },
        }

        # Cloud Code Assist requires a WRAPPED format with model, project, and request fields
        request_body = {
            "model": model,
            "project": "rising-fact-p41fc",  # Default Antigravity project ID
            "user_prompt_id": str(uuid.uuid4()),
            "request": inner_request,
        }

        if images:
            ensure_payload_size(request_body)

        last_error = None
        async with aiohttp.ClientSession() as session:
            for endpoint in endpoints:
                try:
                    async with session.post(
                        endpoint,
                        headers=headers,
                        json=request_body,
                        timeout=aiohttp.ClientTimeout(total=self.timeout),
                    ) as response:
                        if images and response.status != 200:
                            try:
                                data = await response.json()
                            except (aiohttp.ContentTypeError, json.JSONDecodeError, UnicodeDecodeError):
                                data = {}
                        else:
                            data = await response.json()

                        if response.status == 200:
                            # Success - extract response
                            try:
                                response_data = data.get("response", data)
                                candidates = response_data.get("candidates", [])
                                if not candidates:
                                    last_error = "No response from Antigravity"
                                    continue

                                content = candidates[0].get("content", {})
                                parts = content.get("parts", [])
                                text = parts[0].get("text", "") if parts else ""
                                if images:
                                    text = "".join(part["text"] for part in parts if isinstance(part, dict) and isinstance(part.get("text"), str))
                                    if not text.strip():
                                        last_error = "Antigravity returned no text for the image request."
                                        continue

                                usage = response_data.get("usageMetadata", {})
                                tokens = usage.get("totalTokenCount", 0)
                                finish_reason = candidates[0].get("finishReason")

                                return LLMResponse(
                                    success=True,
                                    content=text,
                                    tokens_used=tokens,
                                    model_used=model,
                                    truncated=finish_reason in {"MAX_TOKENS", "LENGTH"},
                                )
                            except (KeyError, IndexError) as e:
                                last_error = "Failed to parse Antigravity image response" if images else f"Failed to parse response: {e}"
                                continue

                        # Check for quota/rate limit - try next endpoint
                        error_data = data.get("error", {})
                        error_status = error_data.get("status", "")
                        error_msg = error_data.get("message", str(data))

                        if error_status == "RESOURCE_EXHAUSTED" or "quota" in error_msg.lower():
                            logger.warning(
                                f"Antigravity quota exhausted on {endpoint}, trying next..."
                            )
                            last_error = "Quota exhausted" if images else f"Quota exhausted: {error_msg}"
                            continue

                        # Auth errors - don't retry, return immediately
                        if response.status == 401 or error_status == "UNAUTHENTICATED":
                            return LLMResponse(
                                success=False,
                                error="Antigravity OAuth token expired or invalid. Please re-authenticate: Settings → Antigravity → Connect",
                            )
                        elif response.status == 403:
                            return LLMResponse(
                                success=False,
                                error="Antigravity access denied. Ensure your Google account has access to Cloud Code Assist.",
                            )

                        # Other error - try next endpoint
                        last_error = "Antigravity image request failed" if images else f"Antigravity error: {error_msg}"

                except aiohttp.ClientError as e:
                    last_error = "Antigravity image request network error" if images else f"Network error on {endpoint}: {e}"
                    continue

            # All endpoints failed
            return LLMResponse(
                success=False, error=last_error or "All Antigravity endpoints failed"
            )

    # -------------------------------------------------------------------------
    # OpenAI Codex (OAuth via ChatGPT Backend)
    # NOTE: This uses the ChatGPT backend Codex API, NOT the standard OpenAI API.
    # Based on: https://github.com/numman-ali/opencode-openai-codex-auth
    # -------------------------------------------------------------------------

    async def _call_openai_codex(
        self,
        user_prompt: str,
        system_prompt: str,
        model: str,
        credentials: LLMCredentials,
        output_token_budget: int | None = None,
        images: list[EnhancementImage] | None = None,
    ) -> LLMResponse:
        """Call OpenAI Codex API via ChatGPT backend.

        This uses the Codex Responses API at chatgpt.com/backend-api/codex/responses.
        The format is different from the standard OpenAI Chat Completions API:
        - Uses 'input' array instead of 'messages'
        - Uses 'instructions' instead of system prompt in messages
        - Returns Server-Sent Events (SSE) stream
        - Requires specific headers including chatgpt-account-id
        """
        if not credentials.oauth_token:
            return LLMResponse(success=False, error="OpenAI Codex OAuth token required")

        # Extract account ID from JWT token
        account_id = self._extract_chatgpt_account_id(credentials.oauth_token)
        if not account_id:
            return LLMResponse(
                success=False,
                error="Failed to extract ChatGPT account ID from token. Please re-authenticate.",
            )

        # Codex uses the /codex/responses endpoint, not /conversation
        endpoint = "https://chatgpt.com/backend-api/codex/responses"

        # Normalize model name (remove provider prefix if present)
        normalized_model = self._normalize_codex_model(model)

        # Build request in Codex Responses API format
        request_body = {
            "model": normalized_model,
            "store": False,  # Required: stateless mode
            "stream": True,  # API always streams, we'll collect the full response
            "instructions": system_prompt,
            "input": [
                {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": user_prompt},
                        *({"type": "input_image", "image_url": image.data_url} for image in images or []),
                    ],
                }
            ],
            "reasoning": {"effort": "medium", "summary": "auto"},
            "text": {"verbosity": "medium"},
            "include": ["reasoning.encrypted_content"],
        }

        if images:
            ensure_payload_size(request_body)

        # Required headers for Codex backend
        # Header names match the reference implementation exactly
        headers = {
            "Authorization": f"Bearer {credentials.oauth_token}",
            "Content-Type": "application/json",
            "accept": "text/event-stream",  # lowercase to match reference
            "chatgpt-account-id": account_id,
            "OpenAI-Beta": "responses=experimental",
            "originator": "codex_cli_rs",
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers=headers,
                json=request_body,
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                if images and response.status != 200:
                    return image_request_error("OpenAI Codex", response.status)
                if response.status != 200:
                    # Try to parse error from response
                    try:
                        error_text = await response.text()

                        # Try JSON first
                        try:
                            error_data = json.loads(error_text)
                            error_msg = error_data.get("error", {}).get("message", error_text)
                            error_code = error_data.get("error", {}).get("code", "")

                            # Map specific error codes to helpful messages
                            if (
                                error_code == "usage_limit_reached"
                                or "usage limit" in error_msg.lower()
                            ):
                                return LLMResponse(
                                    success=False,
                                    error="ChatGPT usage limit reached. Please wait until your limit resets (usually 5 hours or weekly).",
                                )
                        except json.JSONDecodeError:
                            error_msg = (
                                error_text[:500] if error_text else f"HTTP {response.status}"
                            )
                    except (aiohttp.ClientError, asyncio.TimeoutError):
                        error_msg = f"HTTP {response.status}"

                    # Provide helpful error messages based on status code
                    if response.status == 401:
                        return LLMResponse(
                            success=False,
                            error="OAuth token expired or invalid. Please re-authenticate: Settings → OpenAI Codex → Connect",
                        )
                    elif response.status == 403:
                        return LLMResponse(
                            success=False,
                            error="Access denied. Ensure you have an active ChatGPT Plus/Pro subscription.",
                        )
                    elif response.status == 404:
                        # 404 with usage limit is actually a rate limit (mapped to 429 in reference)
                        if "usage" in error_msg.lower():
                            return LLMResponse(
                                success=False,
                                error="ChatGPT usage limit reached. Please wait until your limit resets.",
                            )
                        return LLMResponse(
                            success=False,
                            error="Codex API endpoint not found. The API may have changed or your account may not have Codex access.",
                        )
                    elif response.status == 429:
                        return LLMResponse(
                            success=False,
                            error="Rate limited. Please wait a moment before trying again.",
                        )

                    return LLMResponse(
                        success=False, error=f"OpenAI Codex error ({response.status}): {error_msg}"
                    )

                # Parse SSE stream to get the final response
                content, tokens, truncated = await self._parse_codex_sse_response(response, image_safe=bool(images))

                if not content:
                    return LLMResponse(
                        success=False, error="No response content received from Codex API"
                    )

                return LLMResponse(
                    success=True,
                    content=content,
                    tokens_used=tokens,
                    model_used=normalized_model,
                    truncated=truncated,
                )

    def _extract_chatgpt_account_id(self, token: str) -> Optional[str]:
        """Extract ChatGPT account ID from JWT token.

        The account ID is stored in the JWT claim at:
        https://api.openai.com/auth -> chatgpt_account_id
        """
        try:
            # JWT format: header.payload.signature
            parts = token.split(".")
            if len(parts) != 3:
                return None

            # Decode the payload (base64url encoded)
            payload_b64 = parts[1]
            # Add padding if needed
            padding = 4 - len(payload_b64) % 4
            if padding != 4:
                payload_b64 += "=" * padding

            payload_bytes = base64.urlsafe_b64decode(payload_b64)
            payload = json.loads(payload_bytes.decode("utf-8"))

            # Extract account ID from the OpenAI auth claim
            auth_claim = payload.get("https://api.openai.com/auth", {})
            account_id = auth_claim.get("chatgpt_account_id")

            return account_id
        except Exception as e:
            logger.warning(f"Failed to extract ChatGPT account ID from token: {e}")
            return None

    def _normalize_codex_model(self, model: str) -> str:
        """Normalize model name for Codex API.

        Handles various input formats:
        - "openai/gpt-5.2-codex" -> "gpt-5.2-codex"
        - "gpt-5.2-codex-low" -> "gpt-5.2-codex" (strips variant suffix)
        - "gpt-5.2" -> "gpt-5.2"
        """
        if not model:
            return "gpt-5.1"

        # Strip provider prefix
        if "/" in model:
            model = model.split("/")[-1]

        # Model name mapping for known variants
        model_map = {
            # GPT-5.2 family
            "gpt-5.2-codex-low": "gpt-5.2-codex",
            "gpt-5.2-codex-medium": "gpt-5.2-codex",
            "gpt-5.2-codex-high": "gpt-5.2-codex",
            "gpt-5.2-codex-xhigh": "gpt-5.2-codex",
            "gpt-5.2-none": "gpt-5.2",
            "gpt-5.2-low": "gpt-5.2",
            "gpt-5.2-medium": "gpt-5.2",
            "gpt-5.2-high": "gpt-5.2",
            "gpt-5.2-xhigh": "gpt-5.2",
            # GPT-5.1 family
            "gpt-5.1-codex-max-low": "gpt-5.1-codex-max",
            "gpt-5.1-codex-max-medium": "gpt-5.1-codex-max",
            "gpt-5.1-codex-max-high": "gpt-5.1-codex-max",
            "gpt-5.1-codex-max-xhigh": "gpt-5.1-codex-max",
            "gpt-5.1-codex-low": "gpt-5.1-codex",
            "gpt-5.1-codex-medium": "gpt-5.1-codex",
            "gpt-5.1-codex-high": "gpt-5.1-codex",
            "gpt-5.1-codex-mini-medium": "gpt-5.1-codex-mini",
            "gpt-5.1-codex-mini-high": "gpt-5.1-codex-mini",
            "gpt-5.1-none": "gpt-5.1",
            "gpt-5.1-low": "gpt-5.1",
            "gpt-5.1-medium": "gpt-5.1",
            "gpt-5.1-high": "gpt-5.1",
        }

        return model_map.get(model.lower(), model)

    async def _parse_codex_sse_response(self, response: aiohttp.ClientResponse, image_safe: bool = False) -> tuple[str, int, bool]:
        """Parse SSE stream from Codex API to extract final response.

        The stream contains multiple events, we're looking for:
        - 'response.done' or 'response.completed' event with the final response
        - Response contains 'output' array with the generated content

        Returns:
            Tuple of (content_text, token_count, truncated)
        """
        content = ""
        tokens = 0
        truncated = False

        try:
            async for line in response.content:
                line_str = line.decode("utf-8").strip()

                if not line_str.startswith("data: "):
                    continue

                data_str = line_str[6:]  # Remove 'data: ' prefix
                if data_str == "[DONE]":
                    break

                try:
                    data = json.loads(data_str)
                    event_type = data.get("type", "")

                    # Look for the final response event
                    if event_type in ("response.done", "response.completed"):
                        response_data = data.get("response", {})

                        # Extract content from output array
                        output = response_data.get("output", [])
                        for item in output:
                            if item.get("type") == "message":
                                item_content = item.get("content", [])
                                for part in item_content:
                                    if part.get("type") == "output_text":
                                        content += part.get("text", "")

                        # Extract token usage
                        usage = response_data.get("usage", {})
                        tokens = usage.get("total_tokens", 0)
                        truncated = response_data.get("status") in {"incomplete", "max_tokens"}
                        break

                    # Also handle streaming content deltas
                    elif event_type == "response.output_item.done":
                        item = data.get("item", {})
                        if item.get("type") == "message":
                            item_content = item.get("content", [])
                            for part in item_content:
                                if part.get("type") == "output_text":
                                    content += part.get("text", "")

                except json.JSONDecodeError:
                    continue

        except Exception as e:
            if image_safe:
                logger.warning("Error parsing Codex SSE image response")
            else:
                logger.warning(f"Error parsing Codex SSE response: {e}")

        return content, tokens, truncated

    # -------------------------------------------------------------------------
    # Dynamic Model Fetching
    # -------------------------------------------------------------------------

    async def fetch_provider_models(
        self,
        provider: str,
        credentials: LLMCredentials,
    ) -> dict:
        """
        Fetch available models from a provider dynamically.

        Args:
            provider: Provider ID (antigravity, openai_codex, etc.)
            credentials: Authentication credentials

        Returns:
            Dict with 'success', 'models' list, and optional 'error'
        """
        provider_lower = provider.lower()

        try:
            if provider_lower == "antigravity":
                return await self._fetch_antigravity_models(credentials)
            elif provider_lower == "openai_codex":
                return await self._fetch_openai_codex_models(credentials)
            elif provider_lower.startswith("openai-compatible-"):
                return await self._fetch_openai_models(credentials, compatible=True)
            elif provider_lower.startswith("anthropic-compatible-"):
                return await self._fetch_anthropic_models(credentials, compatible=True)
            elif provider_lower == "openai":
                return await self._fetch_openai_models(credentials)
            elif provider_lower == "anthropic":
                return await self._fetch_anthropic_models(credentials)
            elif provider_lower == "google":
                return await self._fetch_google_models(credentials)
            elif provider_lower in ("ollama", "lmstudio"):
                return await self._fetch_local_models(credentials, provider_lower)
            elif provider_lower == "openrouter":
                return await self._fetch_openrouter_models(credentials)
            elif provider_lower == "github_copilot":
                return await self._fetch_github_copilot_models_oauth(credentials)
            elif provider_lower == "github_models":
                return await self._fetch_github_models_models(credentials)
            elif provider_lower == "replicate":
                return await self._fetch_replicate_models(credentials)
            else:
                return {
                    "success": False,
                    "error": f"Model listing not supported for provider: {provider}",
                    "models": [],
                }
        except Exception as e:
            logger.exception(f"Failed to fetch models for provider {provider}")
            return {"success": False, "error": str(e), "models": []}

    async def _fetch_antigravity_models(self, credentials: LLMCredentials) -> dict:
        """Fetch available models from Antigravity (Google Cloud AI Companion)."""
        if not credentials.oauth_token:
            return {
                "success": False,
                "error": "Antigravity OAuth required. Click 'Connect' to authenticate with Google.",
                "models": [],
            }

        # Use the v1internal endpoint for model listing
        endpoint = "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels"

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {credentials.oauth_token}",
            "User-Agent": "antigravity/1.104.0 cinema-prompt-engineering",
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers=headers,
                json={},  # Empty body required
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    # Parse and provide helpful error messages
                    if response.status == 401:
                        return {
                            "success": False,
                            "error": "OAuth token expired. Please re-authenticate: Settings → Antigravity → Connect",
                            "models": [],
                        }
                    elif response.status == 403:
                        return {
                            "success": False,
                            "error": "Access denied. Ensure your Google account has Cloud Code Assist access.",
                            "models": [],
                        }
                    return {
                        "success": False,
                        "error": f"API error {response.status}: {error_text[:200]}",
                        "models": [],
                    }

                data = await response.json()

                # Parse the models from the response
                models_dict = data.get("models", {})
                models = []

                for model_id, model_info in models_dict.items():
                    models.append(
                        {
                            "id": model_id,
                            "name": model_info.get("displayName", model_id),
                            "recommended": model_info.get("recommended", False),
                            "supports_images": model_info.get("supportsImages", False),
                            "supports_thinking": model_info.get("supportsThinking", False),
                            "max_tokens": model_info.get("maxTokens"),
                            "provider": model_info.get("modelProvider", "unknown"),
                        }
                    )

                # Sort by recommended first, then by name
                models.sort(key=lambda m: (not m["recommended"], m["name"]))

                return {
                    "success": True,
                    "models": models,
                    "default_model": data.get("defaultAgentModelId"),
                }

    # Bundled Codex models - from official Codex CLI models.json
    # Source: https://github.com/openai/codex/blob/main/codex-rs/core/models.json
    # The official CLI bundles this list and uses it as the source of truth.
    # These are the ONLY models that work with Codex OAuth (ChatGPT Plus/Pro accounts).
    CODEX_BUNDLED_MODELS = [
        {
            "slug": "gpt-5.2-codex",
            "display_name": "GPT-5.2 Codex",
            "description": "Latest frontier agentic coding model.",
            "priority": 0,
            "visibility": "list",
            "context_window": 272000,
            "supported_reasoning_levels": ["low", "medium", "high", "xhigh"],
            "default_reasoning_level": "medium",
        },
        {
            "slug": "gpt-5.2",
            "display_name": "GPT-5.2",
            "description": "Latest frontier model with improvements across knowledge, reasoning and coding",
            "priority": 1,
            "visibility": "list",
            "context_window": 272000,
            "supported_reasoning_levels": ["low", "medium", "high", "xhigh"],
            "default_reasoning_level": "medium",
        },
        {
            "slug": "gpt-5.1-codex-max",
            "display_name": "GPT-5.1 Codex Max",
            "description": "Codex-optimized flagship for deep and fast reasoning.",
            "priority": 2,
            "visibility": "list",
            "context_window": 272000,
            "supported_reasoning_levels": ["low", "medium", "high", "xhigh"],
            "default_reasoning_level": "medium",
        },
        {
            "slug": "gpt-5.1-codex-mini",
            "display_name": "GPT-5.1 Codex Mini",
            "description": "Lightweight Codex model for fast iteration.",
            "priority": 3,
            "visibility": "list",
            "context_window": 272000,
            "supported_reasoning_levels": ["low", "medium", "high"],
            "default_reasoning_level": "medium",
        },
        {
            "slug": "gpt-5.1-mini",
            "display_name": "GPT-5.1 Mini",
            "description": "Lightweight GPT-5.1 for fast iteration.",
            "priority": 4,
            "visibility": "list",
            "context_window": 272000,
            "supported_reasoning_levels": ["low", "medium", "high"],
            "default_reasoning_level": "medium",
        },
        {
            "slug": "o4-mini",
            "display_name": "O4 Mini",
            "description": "Reasoning-optimized model for complex tasks.",
            "priority": 7,
            "visibility": "list",
            "context_window": 200000,
            "supported_reasoning_levels": ["low", "medium", "high"],
            "default_reasoning_level": "medium",
        },
        {
            "slug": "o3",
            "display_name": "O3",
            "description": "Advanced reasoning model.",
            "priority": 8,
            "visibility": "list",
            "context_window": 200000,
            "supported_reasoning_levels": ["low", "medium", "high"],
            "default_reasoning_level": "medium",
        },
        {
            "slug": "codex-auto-balanced",
            "display_name": "Codex Auto (Balanced)",
            "description": "Automatically selects the best model for your task.",
            "priority": 99,
            "visibility": "list",
            "context_window": 272000,
            "supported_reasoning_levels": [],
            "default_reasoning_level": "medium",
        },
    ]

    def _format_codex_models(self, model_list: list) -> list[dict]:
        models = []
        for item in model_list:
            if not isinstance(item, dict):
                continue
            slug = item.get("slug")
            visibility = item.get("visibility")
            if (
                not isinstance(slug, str)
                or not slug
                or isinstance(visibility, str) and visibility.lower() in {"hide", "hidden"}
            ):
                continue
            levels = item.get("supported_reasoning_levels", [])
            reasoning_levels = [
                level if isinstance(level, str) else level.get("effort")
                for level in levels
                if isinstance(level, (str, dict))
            ] if isinstance(levels, list) else []
            reasoning_levels = [level for level in reasoning_levels if isinstance(level, str)]
            priority = item.get("priority", 999)
            if not isinstance(priority, (int, float)):
                priority = 999
            display_name = item.get("display_name")
            if not isinstance(display_name, str) or not display_name:
                display_name = slug
            models.append({
                "id": slug,
                "name": display_name,
                "recommended": priority <= 1,
                "description": item.get("description", ""),
                "context_window": item.get("context_window"),
                "priority": priority,
                "supports_reasoning": bool(reasoning_levels),
                "default_reasoning_level": item.get("default_reasoning_level", "none"),
                "reasoning_levels": reasoning_levels,
            })
        models.sort(key=lambda model: (model.get("priority", 999), model["name"]))
        return models

    async def _fetch_codex_live_models(
        self, token: str, account_id: str
    ) -> tuple[list[dict] | None, str | None, bool]:
        endpoint = "https://chatgpt.com/backend-api/codex/models"
        headers = {
            "Authorization": f"Bearer {token}",
            "ChatGPT-Account-Id": account_id,
            "originator": "codex_cli_rs",
            "Accept": "application/json",
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    endpoint,
                    headers=headers,
                    params={"client_version": "0.159.3"},
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as response:
                    if response.status in (401, 403):
                        error = "Codex model catalogue authentication failed" if response.status == 401 else "Codex model catalogue access denied"
                        return None, error, False
                    if response.status != 200:
                        return None, f"Live Codex catalogue returned HTTP {response.status}", True
                    try:
                        payload = await response.json()
                    except (aiohttp.ContentTypeError, json.JSONDecodeError, UnicodeDecodeError):
                        return None, "Live Codex catalogue returned non-JSON data", True
        except (aiohttp.ClientError, asyncio.TimeoutError):
            return None, "Unable to reach the live Codex model catalogue", True

        raw_models = payload.get("models") if isinstance(payload, dict) else None
        if not isinstance(raw_models, list):
            return None, "Live Codex catalogue response has no models list", True
        if not raw_models:
            return None, "Live Codex model catalogue is empty", False
        models = self._format_codex_models(raw_models)
        if not models:
            return None, "Live Codex catalogue contains no valid model slugs", False
        return models, None, False

    async def _fetch_openai_codex_models(self, credentials: LLMCredentials) -> dict:
        """Fetch the signed-in ChatGPT account's Codex catalogue first."""
        if not credentials.oauth_token:
            return {"success": False, "error": "OpenAI Codex OAuth required", "models": [], "source": "live", "warning": None}
        account_id = self._extract_chatgpt_account_id(credentials.oauth_token)
        if not account_id:
            return {"success": False, "error": "Invalid or expired OAuth token", "models": [], "source": "live", "warning": None}

        models, live_error, fallback = await self._fetch_codex_live_models(
            credentials.oauth_token, account_id
        )
        if models is not None:
            return {"success": True, "models": models, "source": "live", "warning": None}
        if not fallback:
            return {"success": False, "error": live_error, "models": [], "source": "live", "warning": None}

        warning = live_error or "Live Codex catalogue unavailable"
        github_models = await self._try_fetch_codex_models_from_github()
        if github_models:
            models = self._format_codex_models(github_models)
            if models:
                return {
                    "success": True,
                    "models": models,
                    "source": "github",
                    "warning": f"{warning}; using the GitHub catalogue.",
                }
        models = self._format_codex_models(self.CODEX_BUNDLED_MODELS)
        if models:
            return {
                "success": True,
                "models": models,
                "source": "bundled",
                "warning": f"{warning}; GitHub catalogue unavailable, using bundled models.",
            }
        return {"success": False, "error": "No Codex models are available", "models": [], "source": "bundled", "warning": warning}

    async def _try_fetch_codex_models_from_github(self) -> list | None:
        """Try to fetch fresh models.json from GitHub. Returns None on failure."""
        try:
            github_url = (
                "https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/models.json"
            )

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    github_url,
                    timeout=aiohttp.ClientTimeout(total=5),  # Short timeout
                ) as response:
                    if response.status != 200:
                        logger.debug(f"[Codex Models] GitHub fetch returned {response.status}")
                        return None

                    data = await response.json(content_type=None)
                    models = data.get("models", [])

                    if models:
                        logger.info(f"[Codex Models] Fetched {len(models)} models from GitHub")
                        return models
                    return None

        except Exception:
            logger.debug("[Codex Models] GitHub fetch failed (using bundled)")
            return None

    async def _fetch_openai_models(self, credentials: LLMCredentials, compatible: bool = False) -> dict:
        """Fetch available models from OpenAI or an OpenAI-compatible API."""
        if not credentials.api_key and not compatible:
            return {"success": False, "error": "API key required", "models": []}
        if compatible and not credentials.endpoint:
            return {"success": False, "error": "Compatible provider endpoint required", "models": []}

        endpoint = _compatible_endpoint_url(
            credentials.endpoint or PROVIDER_ENDPOINTS["openai"], "models"
        )
        headers = {"Authorization": f"Bearer {credentials.api_key}"} if credentials.api_key else {}

        async with aiohttp.ClientSession() as session:
            async with session.get(
                endpoint,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status != 200:
                    error = (
                        "OpenAI authentication failed (401)"
                        if response.status == 401
                        else f"OpenAI API error {response.status}"
                    )
                    return {"success": False, "error": error, "models": []}

                data = await response.json()

                chat_models = []
                for model in data.get("data", []):
                    if not isinstance(model, dict):
                        continue
                    model_id = model.get("id", "")
                    if not isinstance(model_id, str) or not model_id:
                        continue
                    if not compatible and _is_non_chat_openai_model(model_id):
                        continue
                    chat_models.append({"id": model_id, "name": model_id, "recommended": False})

                chat_models.sort(key=lambda model: model["name"])

                if not chat_models:
                    return {
                        "success": False,
                        "error": "No chat models available from this OpenAI API endpoint.",
                        "models": [],
                    }

                return {"success": True, "models": chat_models}

    async def _fetch_google_models(self, credentials: LLMCredentials) -> dict:
        """Fetch available models from Google AI."""
        if not credentials.api_key:
            return {"success": False, "error": "API key required", "models": []}

        endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models?key={credentials.api_key}"
        )

        async with aiohttp.ClientSession() as session:
            async with session.get(
                endpoint,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    return {
                        "success": False,
                        "error": f"API error {response.status}: {error_text[:200]}",
                        "models": [],
                    }

                data = await response.json()

                models = []
                for model in data.get("models", []):
                    model_name = model.get("name", "")
                    # Extract model ID from full name (e.g., "models/gemini-1.5-pro" -> "gemini-1.5-pro")
                    model_id = model_name.split("/")[-1] if "/" in model_name else model_name

                    # Only include generative models
                    if "generateContent" in model.get("supportedGenerationMethods", []):
                        is_recommended = "gemini-1.5" in model_id or "gemini-2" in model_id
                        models.append(
                            {
                                "id": model_id,
                                "name": model.get("displayName", model_id),
                                "recommended": is_recommended,
                                "description": model.get("description", ""),
                            }
                        )

                models.sort(key=lambda m: (not m["recommended"], m["name"]))

                return {"success": True, "models": models}

    async def _fetch_local_models(self, credentials: LLMCredentials, provider: str) -> dict:
        """Fetch available models from local providers (Ollama, LM Studio)."""
        endpoint = credentials.endpoint or PROVIDER_ENDPOINTS.get(
            provider, PROVIDER_ENDPOINTS["ollama"]
        )
        models_url = _local_endpoint_url(
            endpoint,
            provider,
            "tags" if provider == "ollama" else "models",
        )

        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(
                    models_url,
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as response:
                    if response.status != 200:
                        return {
                            "success": False,
                            "error": f"Server not responding (status {response.status})",
                            "models": [],
                        }

                    data = await response.json()

                    models = []
                    if provider == "ollama":
                        for model in data.get("models", []):
                            model_name = model.get("name", "")
                            # Filter out embedding models (they can't be used for chat)
                            if "embed" in model_name.lower() or "embedding" in model_name.lower():
                                continue
                            models.append(
                                {
                                    "id": model_name,
                                    "name": model_name,
                                    "recommended": False,
                                    "size": model.get("size"),
                                }
                            )
                    else:  # lmstudio (OpenAI-compatible)
                        for model in data.get("data", []):
                            models.append(
                                {
                                    "id": model.get("id"),
                                    "name": model.get("id"),
                                    "recommended": False,
                                }
                            )

                    return {"success": True, "models": models}
            except aiohttp.ClientError:
                return {
                    "success": False,
                    "error": f"{provider} server not running at {endpoint}",
                    "models": [],
                }

    async def _fetch_openrouter_models(self, credentials: LLMCredentials) -> dict:
        """Fetch available models from OpenRouter API."""
        if not credentials.api_key:
            return {"success": False, "error": "API key required", "models": []}

        endpoint = "https://openrouter.ai/api/v1/models"

        headers = {
            "Authorization": f"Bearer {credentials.api_key}",
            "HTTP-Referer": "https://cinema-prompt-engineering.local",
            "X-Title": "Cinema Prompt Engineering",
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(
                endpoint,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    return {
                        "success": False,
                        "error": f"API error {response.status}: {error_text[:200]}",
                        "models": [],
                    }

                data = await response.json()

                models = []
                for model in data.get("data", []):
                    model_id = model.get("id", "")
                    # Filter to text/chat models only
                    if (
                        model.get("architecture", {}).get("modality") == "text->text"
                        or "chat" in model_id.lower()
                        or "instruct" in model_id.lower()
                    ):
                        context_length = model.get("context_length", 0)
                        pricing = model.get("pricing", {})

                        # Recommend popular/powerful models
                        is_recommended = any(
                            name in model_id.lower()
                            for name in [
                                "gpt-4o",
                                "claude-3",
                                "claude-sonnet",
                                "gemini-2",
                                "llama-3.3",
                                "mistral-large",
                            ]
                        )

                        models.append(
                            {
                                "id": model_id,
                                "name": model.get("name", model_id),
                                "recommended": is_recommended,
                                "description": model.get("description", ""),
                                "context_window": context_length,
                                "provider": model_id.split("/")[0]
                                if "/" in model_id
                                else "unknown",
                            }
                        )

                # Sort by recommended first, then by name
                models.sort(key=lambda m: (not m["recommended"], m["name"]))

                return {"success": True, "models": models}

    async def _fetch_anthropic_models_page(
        self, session: aiohttp.ClientSession, endpoint: str, headers: dict, cursor: str | None
    ) -> tuple[dict | None, int | None]:
        params: dict[str, str | int] = {"limit": 100}
        if cursor:
            params["after_id"] = cursor
        async with session.get(
            endpoint, headers=headers, params=params, timeout=aiohttp.ClientTimeout(total=10)
        ) as response:
            if response.status != 200:
                return None, response.status
            return await response.json(), None

    async def _fetch_anthropic_models(
        self, credentials: LLMCredentials, compatible: bool = False
    ) -> dict:
        """Fetch Anthropic models, following the API's pagination cursor."""
        if not credentials.api_key and not compatible:
            return {"success": False, "error": "API key required", "models": []}
        if compatible and not credentials.endpoint:
            return {"success": False, "error": "Compatible provider endpoint required", "models": []}

        endpoint = _compatible_endpoint_url(
            credentials.endpoint or PROVIDER_ENDPOINTS["anthropic"], "models", anthropic=True
        )
        headers = {"anthropic-version": "2023-06-01"}
        if credentials.api_key:
            headers["x-api-key"] = credentials.api_key

        models: list[dict] = []
        cursors: set[str] = set()
        cursor: str | None = None
        async with aiohttp.ClientSession() as session:
            while True:
                data, status = await self._fetch_anthropic_models_page(
                    session, endpoint, headers, cursor
                )
                if status is not None:
                    return {"success": False, "error": f"Anthropic API error {status}", "models": []}
                if not isinstance(data, dict) or not isinstance(data.get("data"), list):
                    return {"success": False, "error": "Invalid Anthropic models response", "models": []}

                models.extend(_format_anthropic_models(data["data"]))
                if not data.get("has_more"):
                    break
                next_cursor = data.get("last_id")
                if (
                    not isinstance(next_cursor, str)
                    or not next_cursor.strip()
                    or next_cursor != next_cursor.strip()
                    or next_cursor in cursors
                ):
                    return {"success": False, "error": "Invalid Anthropic model pagination cursor", "models": []}
                cursors.add(next_cursor)
                cursor = next_cursor

        models.sort(key=lambda model: model["name"])
        return {"success": True, "models": models}

    async def _fetch_github_copilot_models_oauth(self, credentials: LLMCredentials) -> dict:
        """Fetch available models for GitHub Copilot (OAuth-based) dynamically.

        Fetches models from https://api.individual.githubcopilot.com/models

        Token requirements:
        - Copilot token (starts with "tid=" or "eyJ...")
        - NOT GitHub OAuth token (starts with "gho_...")
        """
        if not credentials.oauth_token:
            return {
                "success": False,
                "error": "GitHub Copilot OAuth required. Click 'Connect' to authenticate with GitHub.",
                "models": [],
            }

        token = credentials.oauth_token
        is_copilot_token = token.startswith("tid=") or token.startswith("eyJ") if token else False
        is_github_oauth = token.startswith("gho_") if token else False
        logger.info(
            f"[Copilot Models] Token type | Is Copilot token: {is_copilot_token} | Is GitHub OAuth: {is_github_oauth}"
        )

        if is_github_oauth:
            logger.warning(
                "[Copilot Models] WARNING: Token is GitHub OAuth (gho_...), not Copilot token! This means token exchange failed."
            )
            return {
                "success": False,
                "error": "Invalid token type. Please re-authenticate with GitHub Copilot.",
                "models": [],
            }

        # Fetch models dynamically from Copilot API
        endpoint = "https://api.individual.githubcopilot.com/models"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Editor-Version": "vscode/1.96.0",
            "Editor-Plugin-Version": "copilot-chat/0.25.1",
            "Openai-Intent": "conversation-agent",
            "Openai-Organization": "github-copilot",
            "X-GitHub-Api-Version": "2025-04-01",
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    endpoint,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(
                            f"[Copilot Models] API error {response.status}: {error_text[:200]}"
                        )

                        if response.status == 401:
                            return {
                                "success": False,
                                "error": "Copilot token expired. Please re-authenticate.",
                                "models": [],
                            }
                        elif response.status == 403:
                            return {
                                "success": False,
                                "error": "Access denied. Ensure you have an active Copilot subscription.",
                                "models": [],
                            }
                        else:
                            return {
                                "success": False,
                                "error": f"API error {response.status}: {error_text[:200]}",
                                "models": [],
                            }

                    data = await response.json()

                    # Use dict to deduplicate by model_id, keeping the best version
                    models_dict = {}
                    for model in data.get("data", []):
                        model_id = model.get("id", "")
                        model_name = model.get("name", model_id)
                        vendor = model.get("vendor", "Unknown")
                        picker_enabled = model.get("model_picker_enabled", False)
                        is_preview = model.get("preview", False)

                        # Skip embedding models
                        if "embedding" in model_id.lower():
                            continue

                        # Get capabilities
                        capabilities = model.get("capabilities", {})
                        limits = capabilities.get("limits", {})
                        supports = capabilities.get("supports", {})

                        # Determine if recommended (picker-enabled and from major providers)
                        is_recommended = picker_enabled and any(
                            name in model_id.lower()
                            for name in [
                                "gpt-5",
                                "claude-sonnet-4",
                                "claude-opus",
                                "gemini-3",
                                "gemini-2.5-pro",
                            ]
                        )

                        # Build description
                        desc_parts = [f"via {vendor}"]
                        if is_preview:
                            desc_parts.append("Preview")
                        if supports.get("vision"):
                            desc_parts.append("Vision")
                        if supports.get("tool_calls"):
                            desc_parts.append("Tools")
                        description = " | ".join(desc_parts)

                        model_entry = {
                            "id": model_id,
                            "name": model_name,
                            "recommended": is_recommended,
                            "description": description,
                            "supports_images": supports.get("vision", False),
                            "max_tokens": limits.get("max_output_tokens"),
                            "context_window": limits.get("max_context_window_tokens"),
                            "provider": vendor,
                            "picker_enabled": picker_enabled,
                        }

                        # If duplicate, keep the one with picker_enabled=True or more capabilities
                        if model_id in models_dict:
                            existing = models_dict[model_id]
                            # Prefer picker-enabled, then vision support, then higher context
                            if (
                                (picker_enabled and not existing.get("picker_enabled"))
                                or (supports.get("vision") and not existing.get("supports_images"))
                                or (
                                    (limits.get("max_context_window_tokens") or 0)
                                    > (existing.get("context_window") or 0)
                                )
                            ):
                                models_dict[model_id] = model_entry
                        else:
                            models_dict[model_id] = model_entry

                    models = list(models_dict.values())

                    # Sort: recommended first, then picker-enabled, then by name
                    models.sort(
                        key=lambda m: (
                            not m["recommended"],
                            not m.get("picker_enabled", False),
                            m["name"],
                        )
                    )

                    logger.info(
                        f"[Copilot Models] Fetched {len(models)} models dynamically (deduplicated)"
                    )
                    return {"success": True, "models": models}

        except asyncio.TimeoutError:
            logger.error("[Copilot Models] Request timed out")
            return {
                "success": False,
                "error": "Request timed out while fetching models. Please try again.",
                "models": [],
            }
        except Exception as e:
            logger.exception(f"[Copilot Models] Error fetching models: {e}")
            return {"success": False, "error": f"Failed to fetch models: {str(e)}", "models": []}

    async def _fetch_github_models_models(self, credentials: LLMCredentials) -> dict:
        """Fetch available models from GitHub Models API (models.github.ai).

        Requires a GitHub Personal Access Token (PAT) with 'models:read' permission.
        """
        if not credentials.api_key:
            return {
                "success": False,
                "error": "GitHub PAT with models:read permission required. Create one at https://github.com/settings/tokens",
                "models": [],
            }

        # GitHub Models catalog endpoint
        endpoint = "https://models.github.ai/catalog/models"

        headers = {
            "Authorization": f"Bearer {credentials.api_key}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(
                endpoint,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    # Return proper error - no fallback models
                    if response.status == 401:
                        return {
                            "success": False,
                            "error": "Invalid or expired GitHub PAT. Ensure it has 'models:read' permission.",
                            "models": [],
                        }
                    elif response.status == 403:
                        return {
                            "success": False,
                            "error": "GitHub PAT lacks 'models:read' permission. Create a new token with this scope.",
                            "models": [],
                        }
                    elif response.status == 404:
                        return {
                            "success": False,
                            "error": "GitHub Models API not accessible. Check your token permissions.",
                            "models": [],
                        }
                    return {
                        "success": False,
                        "error": f"API error {response.status}: {error_text[:200]}",
                        "models": [],
                    }

                data = await response.json()

                models = []
                for model in data if isinstance(data, list) else data.get("models", []):
                    model_id = model.get("id") or model.get("name", "")
                    display_name = (
                        model.get("display_name") or model.get("friendly_name") or model_id
                    )

                    # Filter to chat/completion models
                    model_type = model.get("model_type", "").lower()
                    if model_type and model_type not in ("chat", "completion", "text-generation"):
                        continue

                    is_recommended = any(
                        name in model_id.lower() for name in ["gpt-4o", "claude-3", "sonnet"]
                    )

                    models.append(
                        {
                            "id": model_id,
                            "name": display_name,
                            "recommended": is_recommended,
                            "description": model.get("description", ""),
                            "provider": model.get("publisher") or model.get("provider", ""),
                        }
                    )

                models.sort(key=lambda m: (not m["recommended"], m["name"]))

                return {"success": True, "models": models}

    async def _fetch_replicate_models(self, credentials: LLMCredentials) -> dict:
        """Fetch available language models from Replicate API."""
        if not credentials.api_key:
            return {"success": False, "error": "API key required", "models": []}

        # Replicate collections endpoint for language models
        endpoint = "https://api.replicate.com/v1/collections/language-models"

        headers = {
            "Authorization": f"Bearer {credentials.api_key}",
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(
                endpoint,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    # Fall back to known models
                    if response.status in (401, 403, 404):
                        return {
                            "success": True,
                            "models": [
                                {
                                    "id": "meta/llama-2-70b-chat",
                                    "name": "Llama 2 70B Chat",
                                    "recommended": True,
                                },
                                {
                                    "id": "meta/llama-3-70b-instruct",
                                    "name": "Llama 3 70B Instruct",
                                    "recommended": True,
                                },
                                {
                                    "id": "mistralai/mixtral-8x7b-instruct-v0.1",
                                    "name": "Mixtral 8x7B Instruct",
                                    "recommended": True,
                                },
                                {
                                    "id": "mistralai/mistral-7b-instruct-v0.2",
                                    "name": "Mistral 7B Instruct",
                                    "recommended": False,
                                },
                            ],
                        }
                    return {
                        "success": False,
                        "error": f"API error {response.status}: {error_text[:200]}",
                        "models": [],
                    }

                data = await response.json()

                models = []
                for model in data.get("models", []):
                    model_id = (
                        model.get("url", "").replace("https://replicate.com/", "")
                        if model.get("url")
                        else model.get("name", "")
                    )
                    if not model_id:
                        continue

                    display_name = model.get("name", model_id)

                    is_recommended = any(
                        name in model_id.lower() for name in ["llama-3", "mixtral", "70b"]
                    )

                    models.append(
                        {
                            "id": model_id,
                            "name": display_name,
                            "recommended": is_recommended,
                            "description": model.get("description", ""),
                        }
                    )

                models.sort(key=lambda m: (not m["recommended"], m["name"]))

                return {"success": True, "models": models}


# Global service instance
llm_service = LLMService()
