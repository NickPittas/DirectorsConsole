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

import aiohttp

logger = logging.getLogger(__name__)


@dataclass
class LLMResponse:
    """Response from an LLM call."""
    success: bool
    content: str = ""
    error: str = ""
    tokens_used: int = 0
    model_used: str = ""


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
    ) -> LLMResponse:
        """
        Enhance a prompt using the specified LLM provider.
        
        Args:
            user_prompt: The user's prompt to enhance
            system_prompt: System prompt with enhancement instructions
            provider: LLM provider ID (openai, anthropic, etc.)
            model: Model name/ID
            credentials: Authentication credentials
            
        Returns:
            LLMResponse with enhanced prompt or error
        """
        provider_lower = provider.lower()
        
        try:
            if provider_lower == "openai":
                return await self._call_openai(user_prompt, system_prompt, model, credentials)
            elif provider_lower == "anthropic":
                return await self._call_anthropic(user_prompt, system_prompt, model, credentials)
            elif provider_lower == "google":
                return await self._call_google(user_prompt, system_prompt, model, credentials)
            elif provider_lower == "openrouter":
                return await self._call_openrouter(user_prompt, system_prompt, model, credentials)
            elif provider_lower in ("ollama", "lmstudio"):
                return await self._call_local(user_prompt, system_prompt, model, credentials, provider_lower)
            elif provider_lower == "github_copilot":
                return await self._call_github_copilot(user_prompt, system_prompt, model, credentials)
            elif provider_lower == "antigravity":
                return await self._call_antigravity(user_prompt, system_prompt, model, credentials)
            elif provider_lower == "github_models":
                return await self._call_github_models(user_prompt, system_prompt, model, credentials)
            elif provider_lower == "openai_codex":
                return await self._call_openai_codex(user_prompt, system_prompt, model, credentials)
            else:
                return LLMResponse(success=False, error=f"Unsupported provider: {provider}")
        except asyncio.TimeoutError:
            return LLMResponse(success=False, error="Request timed out")
        except aiohttp.ClientError as e:
            return LLMResponse(success=False, error=f"Network error: {str(e)}")
        except Exception as e:
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
    ) -> LLMResponse:
        """Call OpenAI API."""
        if not credentials.api_key:
            return LLMResponse(success=False, error="OpenAI API key required")
        
        if not model:
            return LLMResponse(success=False, error="No model selected. Fetch available models first.")
        
        endpoint = credentials.endpoint or PROVIDER_ENDPOINTS["openai"]
        
        # Debug logging for 404 investigation
        logger.info(f"OpenAI request - model: '{model}', endpoint: '{endpoint}'")
        logger.info(f"OpenAI API key prefix: {credentials.api_key[:12]}..." if credentials.api_key else "No API key")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {credentials.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 1000,
                    "temperature": 0.7,
                },
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                data = await response.json()
                
                # Log full response for debugging
                logger.info(f"OpenAI response status: {response.status}")
                if response.status != 200:
                    logger.error(f"OpenAI error response: {data}")
                
                if response.status != 200:
                    error_msg = data.get("error", {}).get("message", str(data))
                    # Provide helpful error for common issues
                    if response.status == 404:
                        # Log more details about 404
                        logger.error(f"OpenAI 404 - endpoint: {endpoint}, model: {model}")
                        return LLMResponse(success=False, error=f"OpenAI API returned 404. Check endpoint and model. Model: '{model}', Endpoint: '{endpoint}'")
                    elif response.status == 401:
                        return LLMResponse(success=False, error="Invalid OpenAI API key. Check your key in Settings.")
                    return LLMResponse(success=False, error=f"OpenAI error ({response.status}): {error_msg}")
                
                content = data["choices"][0]["message"]["content"]
                tokens = data.get("usage", {}).get("total_tokens", 0)
                
                return LLMResponse(
                    success=True,
                    content=content,
                    tokens_used=tokens,
                    model_used=model,
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
    ) -> LLMResponse:
        """Call Anthropic API."""
        if not credentials.api_key:
            return LLMResponse(success=False, error="Anthropic API key required")
        
        endpoint = credentials.endpoint or PROVIDER_ENDPOINTS["anthropic"]
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers={
                    "x-api-key": credentials.api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "system": system_prompt,
                    "messages": [
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 1000,
                },
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                data = await response.json()
                
                if response.status != 200:
                    error_msg = data.get("error", {}).get("message", str(data))
                    return LLMResponse(success=False, error=f"Anthropic error: {error_msg}")
                
                content = data["content"][0]["text"]
                tokens = data.get("usage", {}).get("input_tokens", 0) + data.get("usage", {}).get("output_tokens", 0)
                
                return LLMResponse(
                    success=True,
                    content=content,
                    tokens_used=tokens,
                    model_used=model,
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
    ) -> LLMResponse:
        """Call Google Gemini API."""
        if not credentials.api_key:
            return LLMResponse(success=False, error="Google API key required")
        
        endpoint = PROVIDER_ENDPOINTS["google"].format(model=model) + f"?key={credentials.api_key}"
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [
                        {
                            "parts": [
                                {"text": f"{system_prompt}\n\n{user_prompt}"}
                            ]
                        }
                    ],
                    "generationConfig": {
                        "maxOutputTokens": 1000,
                        "temperature": 0.7,
                    }
                },
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                data = await response.json()
                
                if response.status != 200:
                    error_msg = data.get("error", {}).get("message", str(data))
                    return LLMResponse(success=False, error=f"Google error: {error_msg}")
                
                content = data["candidates"][0]["content"]["parts"][0]["text"]
                
                return LLMResponse(
                    success=True,
                    content=content,
                    model_used=model,
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
    ) -> LLMResponse:
        """Call OpenRouter API (OpenAI-compatible)."""
        if not credentials.api_key:
            return LLMResponse(success=False, error="OpenRouter API key required")
        
        endpoint = credentials.endpoint or PROVIDER_ENDPOINTS["openrouter"]
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {credentials.api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://cinema-prompt-engineering.local",
                    "X-Title": "Cinema Prompt Engineering",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 1000,
                    "temperature": 0.7,
                },
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                data = await response.json()
                
                if response.status != 200:
                    error_msg = data.get("error", {}).get("message", str(data))
                    return LLMResponse(success=False, error=f"OpenRouter error: {error_msg}")
                
                content = data["choices"][0]["message"]["content"]
                tokens = data.get("usage", {}).get("total_tokens", 0)
                
                return LLMResponse(
                    success=True,
                    content=content,
                    tokens_used=tokens,
                    model_used=model,
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
    ) -> LLMResponse:
        """Call local LLM providers (Ollama or LM Studio)."""
        default_endpoint = PROVIDER_ENDPOINTS.get(provider, PROVIDER_ENDPOINTS["ollama"])
        endpoint = credentials.endpoint or default_endpoint
        
        if provider == "ollama":
            # Ollama uses its own API format
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": False,
            }
        else:
            # LM Studio uses OpenAI-compatible format
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "max_tokens": 1000,
                "temperature": 0.7,
            }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                data = await response.json()
                
                if response.status != 200:
                    error_msg = data.get("error", {})
                    if isinstance(error_msg, dict):
                        error_msg = error_msg.get("message", str(data))
                    return LLMResponse(success=False, error=f"Local LLM error: {error_msg}")
                
                if provider == "ollama":
                    content = data.get("message", {}).get("content", "")
                else:
                    # LM Studio uses OpenAI-compatible format with choices array
                    choices = data.get("choices")
                    if not choices or not isinstance(choices, list) or len(choices) == 0:
                        error_info = data.get("error", "No choices returned in response")
                        return LLMResponse(
                            success=False, 
                            error=f"LM Studio response error: {error_info}"
                        )
                    content = choices[0].get("message", {}).get("content", "")
                    if not content:
                        return LLMResponse(
                            success=False,
                            error="LM Studio returned empty content"
                        )
                
                return LLMResponse(
                    success=True,
                    content=content,
                    model_used=model,
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
    ) -> LLMResponse:
        """Call GitHub Copilot API via OAuth token.
        
        Uses the Copilot chat completions API with OAuth authentication.
        The oauth_token should be the Copilot JWT token (not the raw GitHub token).
        
        Token types:
        - GitHub OAuth token: starts with "gho_..." - WRONG for Copilot API
        - Copilot JWT token: starts with "eyJ..." - CORRECT for Copilot API
        """
        if not credentials.oauth_token:
            return LLMResponse(success=False, error="GitHub Copilot OAuth token required. Click 'Connect' to authenticate.")
        
        if not model:
            return LLMResponse(success=False, error="No model selected. Fetch available models first.")
        
        # Debug: Log the token type to help diagnose issues
        token = credentials.oauth_token
        token_preview = token[:15] if token else "NONE"
        is_jwt = token.startswith("eyJ") if token else False
        is_github_oauth = token.startswith("gho_") if token else False
        logger.info(f"[Copilot API] Token preview: {token_preview}... | Is JWT: {is_jwt} | Is GitHub OAuth: {is_github_oauth}")
        
        if is_github_oauth:
            logger.warning("[Copilot API] WARNING: Token appears to be a GitHub OAuth token (gho_...), not a Copilot JWT (eyJ...)! This will cause 403 errors.")
        
        endpoint = PROVIDER_ENDPOINTS["github_copilot"]
        
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
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": 2000,
            "temperature": 0.7,
            "stream": False,
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                # Get response content, handling both JSON and text responses
                content_type = response.headers.get("Content-Type", "")
                
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
                                error=f"GitHub Copilot authentication error. Your token may be the wrong type (need Copilot JWT, not GitHub OAuth token). Try re-authenticating. Details: {error_msg[:200]}"
                            )
                        return LLMResponse(success=False, error=f"GitHub Copilot request error: {error_msg[:300]}")
                    elif response.status == 401:
                        return LLMResponse(success=False, error="GitHub Copilot token expired or invalid. Please re-authenticate.")
                    elif response.status == 403:
                        return LLMResponse(success=False, error="GitHub Copilot access denied. Ensure you have an active Copilot subscription.")
                    elif response.status == 404:
                        return LLMResponse(success=False, error=f"GitHub Copilot model '{model}' not found. Try a different model.")
                    else:
                        return LLMResponse(success=False, error=f"GitHub Copilot error ({response.status}): {error_msg[:300]}")
                
                # Success - parse JSON response
                try:
                    data = await response.json()
                except Exception as e:
                    text = await response.text()
                    return LLMResponse(success=False, error=f"GitHub Copilot returned invalid JSON: {text[:200]}")
                
                content = data["choices"][0]["message"]["content"]
                
                return LLMResponse(
                    success=True,
                    content=content,
                    model_used=model,
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
    ) -> LLMResponse:
        """Call GitHub Models API (models.github.ai).
        
        GitHub Models provides access to various LLMs including GPT-4o, Claude, Llama, etc.
        Uses OpenAI-compatible chat completions format.
        Requires a GitHub Personal Access Token (PAT) with 'models:read' permission.
        """
        if not credentials.api_key:
            return LLMResponse(success=False, error="GitHub Personal Access Token (PAT) required. Create one at https://github.com/settings/tokens with 'models:read' permission.")
        
        if not model:
            return LLMResponse(success=False, error="No model selected. Fetch available models first.")
        
        endpoint = PROVIDER_ENDPOINTS["github_models"]
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {credentials.api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 2000,
                    "temperature": 0.7,
                },
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                data = await response.json()
                
                if response.status != 200:
                    error_msg = data.get("error", {}).get("message", str(data))
                    return LLMResponse(success=False, error=f"GitHub Models error: {error_msg}")
                
                content = data["choices"][0]["message"]["content"]
                
                return LLMResponse(
                    success=True,
                    content=content,
                    model_used=model,
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
            return LLMResponse(success=False, error="No model selected. Fetch available models first.")
        
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
        inner_request = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]
                }
            ],
            "generationConfig": {
                "maxOutputTokens": 2000,
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
                                
                                usage = response_data.get("usageMetadata", {})
                                tokens = usage.get("totalTokenCount", 0)
                                
                                return LLMResponse(
                                    success=True,
                                    content=text,
                                    tokens_used=tokens,
                                    model_used=model,
                                )
                            except (KeyError, IndexError) as e:
                                last_error = f"Failed to parse response: {e}"
                                continue
                        
                        # Check for quota/rate limit - try next endpoint
                        error_data = data.get("error", {})
                        error_status = error_data.get("status", "")
                        error_msg = error_data.get("message", str(data))
                        
                        if error_status == "RESOURCE_EXHAUSTED" or "quota" in error_msg.lower():
                            logger.warning(f"Antigravity quota exhausted on {endpoint}, trying next...")
                            last_error = f"Quota exhausted: {error_msg}"
                            continue
                        
                        # Auth errors - don't retry, return immediately
                        if response.status == 401 or error_status == "UNAUTHENTICATED":
                            return LLMResponse(
                                success=False, 
                                error="Antigravity OAuth token expired or invalid. Please re-authenticate: Settings → Antigravity → Connect"
                            )
                        elif response.status == 403:
                            return LLMResponse(
                                success=False,
                                error="Antigravity access denied. Ensure your Google account has access to Cloud Code Assist."
                            )
                        
                        # Other error - try next endpoint
                        last_error = f"Antigravity error: {error_msg}"
                        
                except aiohttp.ClientError as e:
                    last_error = f"Network error on {endpoint}: {e}"
                    continue
            
            # All endpoints failed
            return LLMResponse(success=False, error=last_error or "All Antigravity endpoints failed")
    
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
                error="Failed to extract ChatGPT account ID from token. Please re-authenticate."
            )
        
        # Codex uses the /codex/responses endpoint, not /conversation
        endpoint = "https://chatgpt.com/backend-api/codex/responses"
        
        # Normalize model name (remove provider prefix if present)
        normalized_model = self._normalize_codex_model(model)
        
        # Build request in Codex Responses API format
        request_body = {
            "model": normalized_model,
            "store": False,  # Required: stateless mode
            "stream": True,   # API always streams, we'll collect the full response
            "instructions": system_prompt,
            "input": [
                {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": user_prompt
                        }
                    ]
                }
            ],
            "reasoning": {
                "effort": "medium",
                "summary": "auto"
            },
            "text": {
                "verbosity": "medium"
            },
            "include": ["reasoning.encrypted_content"],
        }
        
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
        
        logger.info(f"Calling Codex API: model={normalized_model}, account={account_id[:8]}...")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers=headers,
                json=request_body,
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as response:
                if response.status != 200:
                    # Try to parse error from response
                    try:
                        error_text = await response.text()
                        logger.error(f"Codex API error {response.status}: {error_text[:500]}")
                        
                        # Try JSON first
                        try:
                            error_data = json.loads(error_text)
                            error_msg = error_data.get("error", {}).get("message", error_text)
                            error_code = error_data.get("error", {}).get("code", "")
                            
                            # Map specific error codes to helpful messages
                            if error_code == "usage_limit_reached" or "usage limit" in error_msg.lower():
                                return LLMResponse(
                                    success=False, 
                                    error="ChatGPT usage limit reached. Please wait until your limit resets (usually 5 hours or weekly)."
                                )
                        except json.JSONDecodeError:
                            error_msg = error_text[:500] if error_text else f"HTTP {response.status}"
                    except (aiohttp.ClientError, asyncio.TimeoutError):
                        error_msg = f"HTTP {response.status}"
                    
                    # Provide helpful error messages based on status code
                    if response.status == 401:
                        return LLMResponse(
                            success=False, 
                            error="OAuth token expired or invalid. Please re-authenticate: Settings → OpenAI Codex → Connect"
                        )
                    elif response.status == 403:
                        return LLMResponse(
                            success=False, 
                            error="Access denied. Ensure you have an active ChatGPT Plus/Pro subscription."
                        )
                    elif response.status == 404:
                        # 404 with usage limit is actually a rate limit (mapped to 429 in reference)
                        if "usage" in error_msg.lower():
                            return LLMResponse(
                                success=False, 
                                error="ChatGPT usage limit reached. Please wait until your limit resets."
                            )
                        return LLMResponse(
                            success=False, 
                            error="Codex API endpoint not found. The API may have changed or your account may not have Codex access."
                        )
                    elif response.status == 429:
                        return LLMResponse(
                            success=False, 
                            error="Rate limited. Please wait a moment before trying again."
                        )
                    
                    return LLMResponse(success=False, error=f"OpenAI Codex error ({response.status}): {error_msg}")
                
                # Parse SSE stream to get the final response
                content, tokens = await self._parse_codex_sse_response(response)
                
                if not content:
                    return LLMResponse(
                        success=False, 
                        error="No response content received from Codex API"
                    )
                
                return LLMResponse(
                    success=True,
                    content=content,
                    tokens_used=tokens,
                    model_used=normalized_model,
                )
    
    def _extract_chatgpt_account_id(self, token: str) -> Optional[str]:
        """Extract ChatGPT account ID from JWT token.
        
        The account ID is stored in the JWT claim at:
        https://api.openai.com/auth -> chatgpt_account_id
        """
        try:
            # JWT format: header.payload.signature
            parts = token.split('.')
            if len(parts) != 3:
                return None
            
            # Decode the payload (base64url encoded)
            payload_b64 = parts[1]
            # Add padding if needed
            padding = 4 - len(payload_b64) % 4
            if padding != 4:
                payload_b64 += '=' * padding
            
            payload_bytes = base64.urlsafe_b64decode(payload_b64)
            payload = json.loads(payload_bytes.decode('utf-8'))
            
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
    
    async def _parse_codex_sse_response(self, response: aiohttp.ClientResponse) -> tuple[str, int]:
        """Parse SSE stream from Codex API to extract final response.
        
        The stream contains multiple events, we're looking for:
        - 'response.done' or 'response.completed' event with the final response
        - Response contains 'output' array with the generated content
        
        Returns:
            Tuple of (content_text, token_count)
        """
        content = ""
        tokens = 0
        
        try:
            async for line in response.content:
                line_str = line.decode('utf-8').strip()
                
                if not line_str.startswith('data: '):
                    continue
                
                data_str = line_str[6:]  # Remove 'data: ' prefix
                if data_str == '[DONE]':
                    break
                
                try:
                    data = json.loads(data_str)
                    event_type = data.get('type', '')
                    
                    # Look for the final response event
                    if event_type in ('response.done', 'response.completed'):
                        response_data = data.get('response', {})
                        
                        # Extract content from output array
                        output = response_data.get('output', [])
                        for item in output:
                            if item.get('type') == 'message':
                                item_content = item.get('content', [])
                                for part in item_content:
                                    if part.get('type') == 'output_text':
                                        content += part.get('text', '')
                        
                        # Extract token usage
                        usage = response_data.get('usage', {})
                        tokens = usage.get('total_tokens', 0)
                        break
                    
                    # Also handle streaming content deltas
                    elif event_type == 'response.output_item.done':
                        item = data.get('item', {})
                        if item.get('type') == 'message':
                            item_content = item.get('content', [])
                            for part in item_content:
                                if part.get('type') == 'output_text':
                                    content += part.get('text', '')
                    
                except json.JSONDecodeError:
                    continue
        
        except Exception as e:
            logger.warning(f"Error parsing Codex SSE response: {e}")
        
        return content, tokens

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
                return {"success": False, "error": f"Model listing not supported for provider: {provider}", "models": []}
        except Exception as e:
            logger.exception(f"Failed to fetch models for provider {provider}")
            return {"success": False, "error": str(e), "models": []}
    
    async def _fetch_antigravity_models(self, credentials: LLMCredentials) -> dict:
        """Fetch available models from Antigravity (Google Cloud AI Companion)."""
        if not credentials.oauth_token:
            return {"success": False, "error": "Antigravity OAuth required. Click 'Connect' to authenticate with Google.", "models": []}
        
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
                        return {"success": False, "error": "OAuth token expired. Please re-authenticate: Settings → Antigravity → Connect", "models": []}
                    elif response.status == 403:
                        return {"success": False, "error": "Access denied. Ensure your Google account has Cloud Code Assist access.", "models": []}
                    return {"success": False, "error": f"API error {response.status}: {error_text[:200]}", "models": []}
                
                data = await response.json()
                
                # Parse the models from the response
                models_dict = data.get("models", {})
                models = []
                
                for model_id, model_info in models_dict.items():
                    models.append({
                        "id": model_id,
                        "name": model_info.get("displayName", model_id),
                        "recommended": model_info.get("recommended", False),
                        "supports_images": model_info.get("supportsImages", False),
                        "supports_thinking": model_info.get("supportsThinking", False),
                        "max_tokens": model_info.get("maxTokens"),
                        "provider": model_info.get("modelProvider", "unknown"),
                    })
                
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
    
    async def _fetch_openai_codex_models(self, credentials: LLMCredentials) -> dict:
        """Fetch available models for OpenAI Codex (ChatGPT backend).
        
        Uses bundled models list (like the official Codex CLI) as the source of truth.
        The official CLI at https://github.com/openai/codex bundles models.json and
        uses it directly - there is no public /codex/models API endpoint.
        
        Optionally tries to fetch fresh models from GitHub, falls back to bundled list.
        """
        if not credentials.oauth_token:
            return {"success": False, "error": "OpenAI Codex OAuth required. Click 'Connect' to authenticate with your ChatGPT Plus/Pro account.", "models": []}
        
        # Verify token is valid by extracting account ID
        account_id = self._extract_chatgpt_account_id(credentials.oauth_token)
        if not account_id:
            return {"success": False, "error": "Invalid or expired OAuth token. Please re-authenticate: Settings → OpenAI Codex → Connect", "models": []}
        
        # Try to fetch fresh models from GitHub (optional, non-blocking)
        fresh_models = await self._try_fetch_codex_models_from_github()
        
        # Use fresh models if available, otherwise use bundled list
        model_list = fresh_models if fresh_models else self.CODEX_BUNDLED_MODELS
        source = "GitHub" if fresh_models else "bundled"
        
        models = []
        for model_info in model_list:
            slug = model_info.get("slug", "")
            if not slug:
                continue
            
            # Skip hidden models (visibility: "hide")
            visibility = model_info.get("visibility", "list")
            if visibility == "hide":
                continue
                
            display_name = model_info.get("display_name", slug)
            description = model_info.get("description", "")
            context_window = model_info.get("context_window")
            priority = model_info.get("priority", 999)
            
            # Check for reasoning support
            reasoning_levels = model_info.get("supported_reasoning_levels", [])
            supports_reasoning = len(reasoning_levels) > 0
            default_reasoning = model_info.get("default_reasoning_level", "none")
            
            # Determine if recommended (priority 0-1 are latest/best models)
            is_recommended = priority <= 1
            
            models.append({
                "id": slug,
                "name": display_name,
                "recommended": is_recommended,
                "description": description,
                "context_window": context_window,
                "priority": priority,
                "supports_reasoning": supports_reasoning,
                "default_reasoning_level": default_reasoning,
                "reasoning_levels": reasoning_levels if isinstance(reasoning_levels, list) and all(isinstance(r, str) for r in reasoning_levels) else [r.get("effort") for r in reasoning_levels] if reasoning_levels else [],
            })
        
        # Sort by priority (lower = better), then by name
        models.sort(key=lambda m: (m.get("priority", 999), m["name"]))
        logger.info(f"[Codex Models] Loaded {len(models)} models from {source}")
        
        return {"success": True, "models": models}
    
    async def _try_fetch_codex_models_from_github(self) -> list | None:
        """Try to fetch fresh models.json from GitHub. Returns None on failure."""
        try:
            github_url = "https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/models.json"
            
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    github_url,
                    timeout=aiohttp.ClientTimeout(total=5),  # Short timeout
                ) as response:
                    if response.status != 200:
                        logger.debug(f"[Codex Models] GitHub fetch returned {response.status}")
                        return None
                    
                    data = await response.json()
                    models = data.get("models", [])
                    
                    if models:
                        logger.info(f"[Codex Models] Fetched {len(models)} models from GitHub")
                        return models
                    return None
                    
        except Exception as e:
            logger.debug(f"[Codex Models] GitHub fetch failed (using bundled): {e}")
            return None
    
    async def _fetch_openai_models(self, credentials: LLMCredentials) -> dict:
        """Fetch available models from OpenAI API."""
        if not credentials.api_key:
            return {"success": False, "error": "API key required", "models": []}
        
        endpoint = "https://api.openai.com/v1/models"
        
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
                    return {"success": False, "error": f"API error {response.status}: {error_text[:200]}", "models": []}
                
                data = await response.json()
                
                # Filter to chat models only
                chat_models = []
                for model in data.get("data", []):
                    model_id = model.get("id", "")
                    # Include GPT models suitable for chat
                    if any(prefix in model_id for prefix in ["gpt-4", "gpt-3.5", "o1", "o3", "chatgpt"]):
                        # Recommend newer, commonly available models
                        is_recommended = any(name in model_id for name in ["gpt-4o", "gpt-4-turbo"])
                        chat_models.append({
                            "id": model_id,
                            "name": model_id,
                            "recommended": is_recommended,
                        })
                
                # Sort recommended first
                chat_models.sort(key=lambda m: (not m["recommended"], m["name"]))
                
                if not chat_models:
                    return {"success": False, "error": "No chat models available for this API key. Check your OpenAI account permissions.", "models": []}
                
                return {"success": True, "models": chat_models}
    
    async def _fetch_google_models(self, credentials: LLMCredentials) -> dict:
        """Fetch available models from Google AI."""
        if not credentials.api_key:
            return {"success": False, "error": "API key required", "models": []}
        
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models?key={credentials.api_key}"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(
                endpoint,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    return {"success": False, "error": f"API error {response.status}: {error_text[:200]}", "models": []}
                
                data = await response.json()
                
                models = []
                for model in data.get("models", []):
                    model_name = model.get("name", "")
                    # Extract model ID from full name (e.g., "models/gemini-1.5-pro" -> "gemini-1.5-pro")
                    model_id = model_name.split("/")[-1] if "/" in model_name else model_name
                    
                    # Only include generative models
                    if "generateContent" in model.get("supportedGenerationMethods", []):
                        is_recommended = "gemini-1.5" in model_id or "gemini-2" in model_id
                        models.append({
                            "id": model_id,
                            "name": model.get("displayName", model_id),
                            "recommended": is_recommended,
                            "description": model.get("description", ""),
                        })
                
                models.sort(key=lambda m: (not m["recommended"], m["name"]))
                
                return {"success": True, "models": models}
    
    async def _fetch_local_models(self, credentials: LLMCredentials, provider: str) -> dict:
        """Fetch available models from local providers (Ollama, LM Studio)."""
        if provider == "ollama":
            endpoint = credentials.endpoint or "http://localhost:11434"
            models_url = f"{endpoint}/api/tags"
        else:  # lmstudio
            endpoint = credentials.endpoint or "http://localhost:1234"
            models_url = f"{endpoint}/v1/models"
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(
                    models_url,
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as response:
                    if response.status != 200:
                        return {"success": False, "error": f"Server not responding (status {response.status})", "models": []}
                    
                    data = await response.json()
                    
                    models = []
                    if provider == "ollama":
                        for model in data.get("models", []):
                            models.append({
                                "id": model.get("name"),
                                "name": model.get("name"),
                                "recommended": False,
                                "size": model.get("size"),
                            })
                    else:  # lmstudio (OpenAI-compatible)
                        for model in data.get("data", []):
                            models.append({
                                "id": model.get("id"),
                                "name": model.get("id"),
                                "recommended": False,
                            })
                    
                    return {"success": True, "models": models}
            except aiohttp.ClientError:
                return {"success": False, "error": f"{provider} server not running at {endpoint}", "models": []}
    
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
                    return {"success": False, "error": f"API error {response.status}: {error_text[:200]}", "models": []}
                
                data = await response.json()
                
                models = []
                for model in data.get("data", []):
                    model_id = model.get("id", "")
                    # Filter to text/chat models only
                    if model.get("architecture", {}).get("modality") == "text->text" or "chat" in model_id.lower() or "instruct" in model_id.lower():
                        context_length = model.get("context_length", 0)
                        pricing = model.get("pricing", {})
                        
                        # Recommend popular/powerful models
                        is_recommended = any(name in model_id.lower() for name in [
                            "gpt-4o", "claude-3", "claude-sonnet", "gemini-2", "llama-3.3", "mistral-large"
                        ])
                        
                        models.append({
                            "id": model_id,
                            "name": model.get("name", model_id),
                            "recommended": is_recommended,
                            "description": model.get("description", ""),
                            "context_window": context_length,
                            "provider": model_id.split("/")[0] if "/" in model_id else "unknown",
                        })
                
                # Sort by recommended first, then by name
                models.sort(key=lambda m: (not m["recommended"], m["name"]))
                
                return {"success": True, "models": models}
    
    async def _fetch_anthropic_models(self, credentials: LLMCredentials) -> dict:
        """Fetch available models from Anthropic API dynamically."""
        if not credentials.api_key:
            return {"success": False, "error": "API key required", "models": []}
        
        endpoint = "https://api.anthropic.com/v1/models"
        
        headers = {
            "x-api-key": credentials.api_key,
            "anthropic-version": "2023-06-01",
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(
                endpoint,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    if response.status == 404:
                        return {"success": False, "error": "Anthropic models API endpoint not available. The API may have changed.", "models": []}
                    return {"success": False, "error": f"API error {response.status}: {error_text[:200]}", "models": []}
                
                data = await response.json()
                
                models = []
                for model in data.get("data", []):
                    model_id = model.get("id", "")
                    display_name = model.get("display_name", model_id)
                    
                    # Recommend latest models
                    is_recommended = "sonnet-4" in model_id or "3-5-sonnet" in model_id
                    
                    models.append({
                        "id": model_id,
                        "name": display_name,
                        "recommended": is_recommended,
                        "description": model.get("description", ""),
                        "context_window": model.get("context_window"),
                    })
                
                models.sort(key=lambda m: (not m["recommended"], m["name"]))
                
                return {"success": True, "models": models}
    
    async def _fetch_github_copilot_models_oauth(self, credentials: LLMCredentials) -> dict:
        """Fetch available models for GitHub Copilot (OAuth-based) dynamically.
        
        Fetches models from https://api.individual.githubcopilot.com/models
        
        Token requirements:
        - Copilot token (starts with "tid=" or "eyJ...")
        - NOT GitHub OAuth token (starts with "gho_...")
        """
        if not credentials.oauth_token:
            return {"success": False, "error": "GitHub Copilot OAuth required. Click 'Connect' to authenticate with GitHub.", "models": []}
        
        token = credentials.oauth_token
        token_preview = token[:15] if token else "NONE"
        is_copilot_token = token.startswith("tid=") or token.startswith("eyJ") if token else False
        is_github_oauth = token.startswith("gho_") if token else False
        logger.info(f"[Copilot Models] Token preview: {token_preview}... | Is Copilot token: {is_copilot_token} | Is GitHub OAuth: {is_github_oauth}")
        
        if is_github_oauth:
            logger.warning("[Copilot Models] WARNING: Token is GitHub OAuth (gho_...), not Copilot token! This means token exchange failed.")
            return {"success": False, "error": "Invalid token type. Please re-authenticate with GitHub Copilot.", "models": []}
        
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
                        logger.error(f"[Copilot Models] API error {response.status}: {error_text[:200]}")
                        
                        if response.status == 401:
                            return {"success": False, "error": "Copilot token expired. Please re-authenticate.", "models": []}
                        elif response.status == 403:
                            return {"success": False, "error": "Access denied. Ensure you have an active Copilot subscription.", "models": []}
                        else:
                            return {"success": False, "error": f"API error {response.status}: {error_text[:200]}", "models": []}
                    
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
                            for name in ["gpt-5", "claude-sonnet-4", "claude-opus", "gemini-3", "gemini-2.5-pro"]
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
                            if (picker_enabled and not existing.get("picker_enabled")) or \
                               (supports.get("vision") and not existing.get("supports_images")) or \
                               ((limits.get("max_context_window_tokens") or 0) > (existing.get("context_window") or 0)):
                                models_dict[model_id] = model_entry
                        else:
                            models_dict[model_id] = model_entry
                    
                    models = list(models_dict.values())
                    
                    # Sort: recommended first, then picker-enabled, then by name
                    models.sort(key=lambda m: (
                        not m["recommended"],
                        not m.get("picker_enabled", False),
                        m["name"]
                    ))
                    
                    logger.info(f"[Copilot Models] Fetched {len(models)} models dynamically (deduplicated)")
                    return {"success": True, "models": models}
                    
        except asyncio.TimeoutError:
            logger.error("[Copilot Models] Request timed out")
            return {"success": False, "error": "Request timed out while fetching models. Please try again.", "models": []}
        except Exception as e:
            logger.exception(f"[Copilot Models] Error fetching models: {e}")
            return {"success": False, "error": f"Failed to fetch models: {str(e)}", "models": []}
    
    async def _fetch_github_models_models(self, credentials: LLMCredentials) -> dict:
        """Fetch available models from GitHub Models API (models.github.ai).
        
        Requires a GitHub Personal Access Token (PAT) with 'models:read' permission.
        """
        if not credentials.api_key:
            return {"success": False, "error": "GitHub PAT with models:read permission required. Create one at https://github.com/settings/tokens", "models": []}
        
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
                        return {"success": False, "error": "Invalid or expired GitHub PAT. Ensure it has 'models:read' permission.", "models": []}
                    elif response.status == 403:
                        return {"success": False, "error": "GitHub PAT lacks 'models:read' permission. Create a new token with this scope.", "models": []}
                    elif response.status == 404:
                        return {"success": False, "error": "GitHub Models API not accessible. Check your token permissions.", "models": []}
                    return {"success": False, "error": f"API error {response.status}: {error_text[:200]}", "models": []}
                
                data = await response.json()
                
                models = []
                for model in data if isinstance(data, list) else data.get("models", []):
                    model_id = model.get("id") or model.get("name", "")
                    display_name = model.get("display_name") or model.get("friendly_name") or model_id
                    
                    # Filter to chat/completion models
                    model_type = model.get("model_type", "").lower()
                    if model_type and model_type not in ("chat", "completion", "text-generation"):
                        continue
                    
                    is_recommended = any(name in model_id.lower() for name in ["gpt-4o", "claude-3", "sonnet"])
                    
                    models.append({
                        "id": model_id,
                        "name": display_name,
                        "recommended": is_recommended,
                        "description": model.get("description", ""),
                        "provider": model.get("publisher") or model.get("provider", ""),
                    })
                
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
                                {"id": "meta/llama-2-70b-chat", "name": "Llama 2 70B Chat", "recommended": True},
                                {"id": "meta/llama-3-70b-instruct", "name": "Llama 3 70B Instruct", "recommended": True},
                                {"id": "mistralai/mixtral-8x7b-instruct-v0.1", "name": "Mixtral 8x7B Instruct", "recommended": True},
                                {"id": "mistralai/mistral-7b-instruct-v0.2", "name": "Mistral 7B Instruct", "recommended": False},
                            ],
                        }
                    return {"success": False, "error": f"API error {response.status}: {error_text[:200]}", "models": []}
                
                data = await response.json()
                
                models = []
                for model in data.get("models", []):
                    model_id = model.get("url", "").replace("https://replicate.com/", "") if model.get("url") else model.get("name", "")
                    if not model_id:
                        continue
                    
                    display_name = model.get("name", model_id)
                    
                    is_recommended = any(name in model_id.lower() for name in ["llama-3", "mixtral", "70b"])
                    
                    models.append({
                        "id": model_id,
                        "name": display_name,
                        "recommended": is_recommended,
                        "description": model.get("description", ""),
                    })
                
                models.sort(key=lambda m: (not m["recommended"], m["name"]))
                
                return {"success": True, "models": models}


# Global service instance
llm_service = LLMService()
