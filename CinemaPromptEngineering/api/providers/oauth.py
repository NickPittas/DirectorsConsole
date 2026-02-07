"""OAuth authentication flows for AI providers.

Supports two OAuth flows:
1. Device Flow (GitHub Copilot) - For CLI/desktop apps without browser redirect
2. Authorization Code Flow with PKCE (Google, Antigravity, OpenAI Codex) - Standard web OAuth

SECURITY: No credentials are stored in source code. All client IDs and secrets
are managed through the encrypted credential storage system (%APPDATA%) and
configured via the frontend Settings UI.
"""

import logging
import os
from typing import Optional
from pydantic import BaseModel
import secrets
import hashlib
import base64
from urllib.parse import urlencode

logger = logging.getLogger(__name__)


class OAuthConfig(BaseModel):
    """OAuth configuration for a provider."""
    client_id: str
    client_secret: Optional[str] = None
    authorize_url: str
    token_url: str
    scopes: list[str]
    redirect_uri: str
    use_pkce: bool = True


class OAuthState(BaseModel):
    """State for OAuth flow."""
    state: str
    code_verifier: Optional[str] = None
    provider_id: str


class DeviceCodeResponse(BaseModel):
    """Response from device code request."""
    device_code: str
    user_code: str
    verification_uri: str
    expires_in: int
    interval: int


# =============================================================================
# OAUTH CONFIGURATIONS
# =============================================================================
# Structural OAuth configuration only — URLs, scopes, flow types, headers.
# Client IDs and secrets are stored in encrypted credential storage (%APPDATA%)
# and configured through the frontend Settings UI. No defaults in source code.

OAUTH_CONFIGS = {
    # =========================================================================
    # GITHUB COPILOT - Device Flow (RFC 8628)
    # =========================================================================
    # NOTE: GitHub Copilot uses a PUBLIC client ID for device flow OAuth.
    # This is the official VS Code Copilot extension client ID, which is safe
    # to embed in source code per GitHub's OAuth documentation for device flow.
    # Users can override this by setting their own client_id in Settings.
    "github_copilot": {
        "flow_type": "device",
        "device_code_url": "https://github.com/login/device/code",
        "token_url": "https://github.com/login/oauth/access_token",
        "copilot_token_url": "https://api.github.com/copilot_internal/v2/token",
        "verification_uri": "https://github.com/login/device",
        "scopes": ["read:user"],
        "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
        # Public client ID for VS Code Copilot extension (safe for device flow)
        "client_id": "Iv1.b507a08c87ecfe98",
        # Required headers for Copilot API - must match VS Code Copilot extension
        "headers": {
            "User-Agent": "GitHubCopilotChat/0.26.7",
            "Editor-Version": "vscode/1.99.3",
            "Editor-Plugin-Version": "copilot-chat/0.26.7",
            "Copilot-Integration-Id": "vscode-chat",
        },
    },
    
    # =========================================================================
    # GOOGLE GEMINI API - Authorization Code Flow with PKCE
    # =========================================================================
    "google": {
        "flow_type": "authorization_code",
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "scopes": [
            "https://www.googleapis.com/auth/generative-language.retriever",
            "https://www.googleapis.com/auth/cloud-platform",
        ],
        "use_pkce": True,
        "access_type": "offline",
        "prompt": "consent",
    },
    
    # =========================================================================
    # ANTIGRAVITY (Google Cloud AI Companion) - Authorization Code Flow
    # =========================================================================
    # NOTE: Antigravity uses Google OAuth with a PUBLIC client ID from the
    # official VS Code Cloud Code extension. Google considers client secrets
    # for installed/desktop applications to be non-confidential (see:
    # https://developers.google.com/identity/protocols/oauth2/native-app).
    # Override via ANTIGRAVITY_CLIENT_ID / ANTIGRAVITY_CLIENT_SECRET env vars.
    "antigravity": {
        "flow_type": "authorization_code",
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "redirect_uri": "http://localhost:36742/oauth-callback",
        # Public client credentials from VS Code Cloud Code extension (non-confidential per Google OAuth docs)
        "client_id": os.environ.get("ANTIGRAVITY_CLIENT_ID") or "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
        "client_secret": os.environ.get("ANTIGRAVITY_CLIENT_SECRET") or "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",
        "scopes": [
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/cclog",
            "https://www.googleapis.com/auth/experimentsandconfigs",
        ],
        "use_pkce": True,
        "access_type": "offline",
        "prompt": "consent",
        # API endpoints (in fallback order)
        "api_endpoints": [
            "https://daily-cloudcode-pa.sandbox.googleapis.com",
            "https://autopush-cloudcode-pa.sandbox.googleapis.com",
            "https://cloudcode-pa.googleapis.com",
        ],
        "load_endpoints": [
            "https://cloudcode-pa.googleapis.com",
            "https://daily-cloudcode-pa.sandbox.googleapis.com",
            "https://autopush-cloudcode-pa.sandbox.googleapis.com",
        ],
        "default_project_id": "rising-fact-p41fc",
        # Models are fetched dynamically via v1internal:fetchAvailableModels
        "models": [],
        "headers": {
            "User-Agent": "antigravity/1.11.5 windows/amd64",
            "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
            "Client-Metadata": '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
        },
    },
    
    # =========================================================================
    # OPENAI CODEX - Authorization Code Flow with PKCE
    # =========================================================================
    # NOTE: OpenAI Codex uses a PUBLIC client ID from the official Codex CLI.
    # This is safe to embed per OpenAI's OAuth documentation for PKCE flows.
    "openai_codex": {
        "flow_type": "authorization_code",
        "authorize_url": "https://auth.openai.com/oauth/authorize",
        "token_url": "https://auth.openai.com/oauth/token",
        "redirect_uri": "http://localhost:1455/auth/callback",
        # Public client ID from OpenAI Codex CLI (safe for PKCE flows)
        # Updated 2025-06 - OpenAI migrated from Auth0-format IDs to app_ prefix
        "client_id": "app_EMoamEEZ73f0CkXaXp7hrann",
        "scopes": ["openid", "profile", "email", "offline_access"],
        "use_pkce": True,
        # Extra params for OpenAI's OAuth
        "extra_auth_params": {
            "id_token_add_organizations": "true",
            "codex_cli_simplified_flow": "true",
            "originator": "codex_cli_rs",
        },
        # API configuration
        "api_base_url": "https://chatgpt.com/backend-api",
        # Models are fetched dynamically via /backend-api/codex/models
        "models": [],
        "requires_subscription": "ChatGPT Plus/Pro",
        "headers": {
            "OpenAI-Beta": "responses=experimental",
            "originator": "codex_cli_rs",
        },
    },
}


def generate_code_verifier() -> str:
    """Generate a PKCE code verifier."""
    return secrets.token_urlsafe(64)


def generate_code_challenge(verifier: str) -> str:
    """Generate a PKCE code challenge from a verifier."""
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b'=').decode()


def generate_state() -> str:
    """Generate a random state string."""
    return secrets.token_urlsafe(32)


def build_authorization_url(
    provider_id: str,
    client_id: str,
    redirect_uri: str,
    state: Optional[str] = None,
    code_verifier: Optional[str] = None,
) -> tuple[str, OAuthState]:
    """Build the OAuth authorization URL for a provider.
    
    Args:
        provider_id: The provider identifier
        client_id: OAuth client ID (use built-in if None)
        redirect_uri: Callback URL after authorization
        state: Optional state string (generated if not provided)
        code_verifier: Optional PKCE verifier (generated if needed)
        
    Returns:
        Tuple of (authorization_url, oauth_state)
    """
    if provider_id not in OAUTH_CONFIGS:
        raise ValueError(f"Unknown OAuth provider: {provider_id}")
    
    config = OAUTH_CONFIGS[provider_id]
    
    # Use built-in client_id if provider has one and none provided
    if config.get("client_id") and not client_id:
        client_id = config["client_id"]
    
    # IMPORTANT: For providers with registered redirect_uris, we MUST use the built-in one
    # because OAuth providers only accept callbacks at pre-registered URIs.
    # The frontend's redirect_uri is ignored for these providers.
    if config.get("redirect_uri"):
        # Provider has a registered redirect_uri - use it regardless of what was passed
        redirect_uri = config["redirect_uri"]
    elif not redirect_uri:
        raise ValueError(f"redirect_uri is required for provider {provider_id}")
    
    # Generate state if not provided
    if state is None:
        state = generate_state()
    
    # Build base parameters
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": state,
        "scope": " ".join(config["scopes"]),
    }
    
    # Add PKCE if required
    if config.get("use_pkce", False):
        if code_verifier is None:
            code_verifier = generate_code_verifier()
        code_challenge = generate_code_challenge(code_verifier)
        params["code_challenge"] = code_challenge
        params["code_challenge_method"] = "S256"
    
    # Add access_type for offline access (Google)
    if config.get("access_type"):
        params["access_type"] = config["access_type"]
    
    # Add prompt (Google)
    if config.get("prompt"):
        params["prompt"] = config["prompt"]
    
    # Add extra auth params (OpenAI)
    if config.get("extra_auth_params"):
        params.update(config["extra_auth_params"])
    
    # Build URL
    url = f"{config['authorize_url']}?{urlencode(params)}"
    
    # Create state object for later verification
    oauth_state = OAuthState(
        state=state,
        code_verifier=code_verifier,
        provider_id=provider_id,
    )
    
    return url, oauth_state


async def exchange_code_for_token(
    provider_id: str,
    code: str,
    client_id: str,
    client_secret: Optional[str],
    redirect_uri: str,
    code_verifier: Optional[str] = None,
) -> dict:
    """Exchange an authorization code for an access token.
    
    Args:
        provider_id: The provider identifier
        code: Authorization code from callback
        client_id: OAuth client ID
        client_secret: OAuth client secret (optional for PKCE)
        redirect_uri: Same redirect URI used in authorization
        code_verifier: PKCE verifier if used
        
    Returns:
        Token response dictionary
    """
    if provider_id not in OAUTH_CONFIGS:
        raise ValueError(f"Unknown OAuth provider: {provider_id}")
    
    config = OAUTH_CONFIGS[provider_id]
    
    # Use built-in credentials if available
    if config.get("client_id") and not client_id:
        client_id = config["client_id"]
    if config.get("client_secret") and not client_secret:
        client_secret = config["client_secret"]
    # IMPORTANT: For providers with registered redirect_uris, we MUST use the built-in one
    # This must match exactly what was used in the authorization URL
    if config.get("redirect_uri"):
        redirect_uri = config["redirect_uri"]
    
    # Build token request parameters
    params = {
        "client_id": client_id,
        "code": code,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    
    if client_secret:
        params["client_secret"] = client_secret
    
    # PKCE code_verifier must be sent if it was used in authorization
    # Don't check config - if we have a verifier, we must send it
    if code_verifier:
        params["code_verifier"] = code_verifier
    
    # Make token request
    try:
        import httpx
        
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                config["token_url"],
                data=params,
                headers=headers,
            )
            
            if response.status_code != 200:
                try:
                    error_data = response.json()
                    return {
                        "error": error_data.get("error", "token_exchange_failed"),
                        "error_description": error_data.get(
                            "error_description",
                            f"Server returned status {response.status_code}"
                        ),
                    }
                except Exception:
                    return {
                        "error": "token_exchange_failed",
                        "error_description": f"Server returned status {response.status_code}: {response.text}",
                    }
            
            return response.json()
    except ImportError:
        return {
            "error": "missing_dependency",
            "error_description": "httpx library required for OAuth",
        }
    except Exception as e:
        return {
            "error": "request_failed",
            "error_description": str(e),
        }


async def refresh_token(
    provider_id: str,
    refresh_token: str,
    client_id: str,
    client_secret: Optional[str] = None,
) -> dict:
    """Refresh an access token.
    
    Args:
        provider_id: The provider identifier
        refresh_token: The refresh token
        client_id: OAuth client ID
        client_secret: OAuth client secret
        
    Returns:
        New token response dictionary
    """
    if provider_id not in OAUTH_CONFIGS:
        raise ValueError(f"Unknown OAuth provider: {provider_id}")
    
    config = OAUTH_CONFIGS[provider_id]
    
    # Use built-in credentials if available
    if config.get("client_id") and not client_id:
        client_id = config["client_id"]
    if config.get("client_secret") and not client_secret:
        client_secret = config["client_secret"]
    
    params = {
        "client_id": client_id,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    
    if client_secret:
        params["client_secret"] = client_secret
    
    try:
        import httpx
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                config["token_url"],
                data=params,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            
            if response.status_code != 200:
                return {
                    "error": "refresh_failed",
                    "error_description": f"Server returned status {response.status_code}",
                }
            
            return response.json()
    except Exception as e:
        return {
            "error": "request_failed",
            "error_description": str(e),
        }


# =============================================================================
# DEVICE FLOW (GitHub Copilot)
# =============================================================================

async def request_device_code(
    provider_id: str,
    client_id: Optional[str] = None,
) -> dict:
    """Request a device code for the OAuth device flow.
    
    This is Step 1 of the device flow - get device_code and user_code.
    
    Args:
        provider_id: The provider identifier (must support device flow)
        client_id: OAuth client ID (uses built-in if not provided)
        
    Returns:
        Device code response with device_code, user_code, verification_uri, etc.
    """
    if provider_id not in OAUTH_CONFIGS:
        raise ValueError(f"Unknown OAuth provider: {provider_id}")
    
    config = OAUTH_CONFIGS[provider_id]
    
    if config.get("flow_type") != "device":
        raise ValueError(f"Provider {provider_id} does not support device flow")
    
    # Use built-in client_id if available
    if config.get("client_id") and not client_id:
        client_id = config["client_id"]
    
    if not client_id:
        raise ValueError(f"client_id is required for {provider_id}")
    
    params = {
        "client_id": client_id,
    }
    
    # Add scopes if any
    if config.get("scopes"):
        params["scope"] = " ".join(config["scopes"])
    
    try:
        import httpx
        
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        
        # Add provider-specific headers
        if config.get("headers"):
            headers.update(config["headers"])
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                config["device_code_url"],
                data=params,
                headers=headers,
            )
            
            if response.status_code != 200:
                # Try to parse error response
                try:
                    error_data = response.json()
                    return {
                        "error": error_data.get("error", "device_code_failed"),
                        "error_description": error_data.get(
                            "error_description", 
                            f"Server returned status {response.status_code}"
                        ),
                    }
                except Exception:
                    return {
                        "error": "device_code_failed",
                        "error_description": f"Server returned status {response.status_code}: {response.text}",
                    }
            
            data = response.json()
            
            # Return device code info
            return {
                "device_code": data.get("device_code"),
                "user_code": data.get("user_code"),
                "verification_uri": data.get("verification_uri", config.get("verification_uri")),
                "expires_in": data.get("expires_in", 900),
                "interval": data.get("interval", 5),
            }
            
    except ImportError:
        return {
            "error": "missing_dependency",
            "error_description": "httpx library required for OAuth",
        }
    except Exception as e:
        return {
            "error": "request_failed",
            "error_description": str(e),
        }


async def poll_device_token(
    provider_id: str,
    device_code: str,
    client_id: Optional[str] = None,
) -> dict:
    """Poll for the access token after user has authorized.
    
    This is Step 3 of the device flow - exchange device_code for access_token.
    The frontend should call this repeatedly until success or error.
    
    Args:
        provider_id: The provider identifier
        device_code: The device_code from request_device_code()
        client_id: OAuth client ID (uses built-in if not provided)
        
    Returns:
        Token response or error status (authorization_pending, slow_down, etc.)
    """
    if provider_id not in OAUTH_CONFIGS:
        raise ValueError(f"Unknown OAuth provider: {provider_id}")
    
    config = OAUTH_CONFIGS[provider_id]
    
    if config.get("flow_type") != "device":
        raise ValueError(f"Provider {provider_id} does not support device flow")
    
    # Use built-in client_id if available
    if config.get("client_id") and not client_id:
        client_id = config["client_id"]
    
    if not client_id:
        raise ValueError(f"client_id is required for {provider_id}")
    
    params = {
        "client_id": client_id,
        "device_code": device_code,
        "grant_type": config.get("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
    }
    
    try:
        import httpx
        
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        
        # Add provider-specific headers
        if config.get("headers"):
            headers.update(config["headers"])
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                config["token_url"],
                data=params,
                headers=headers,
            )
            
            data = response.json()
            
            # Check for access token (success)
            if "access_token" in data:
                github_token = data["access_token"]
                token_preview = github_token[:10] if github_token else "NONE"
                logger.info(f"[OAuth] Got GitHub access_token ({token_preview}...) for {provider_id}")
                
                result = {
                    "success": True,
                    "access_token": github_token,
                    "token_type": data.get("token_type", "bearer"),
                    "scope": data.get("scope", ""),
                    "refresh_token": data.get("refresh_token"),
                }
                
                # For GitHub Copilot, we need to exchange for Copilot token
                if provider_id == "github_copilot" and config.get("copilot_token_url"):
                    logger.info(f"[OAuth] GitHub Copilot detected - exchanging for Copilot JWT...")
                    copilot_result = await _get_copilot_token(
                        github_token,
                        config["copilot_token_url"],
                        config.get("headers", {}),
                    )
                    if copilot_result.get("error"):
                        logger.error(f"[OAuth] Copilot token exchange FAILED: {copilot_result}")
                        return copilot_result
                    result["copilot_token"] = copilot_result.get("token")
                    result["copilot_expires_at"] = copilot_result.get("expires_at")
                    logger.info(f"[OAuth] Copilot token exchange SUCCESS. copilot_token present: {bool(result.get('copilot_token'))}")
                
                return result
            
            # Return error status for polling logic
            error = data.get("error", "unknown_error")
            return {
                "success": False,
                "error": error,
                "error_description": data.get("error_description", ""),
                # These indicate the frontend should keep polling
                "should_continue": error in ["authorization_pending", "slow_down"],
                "slow_down": error == "slow_down",
            }
            
    except ImportError:
        return {
            "success": False,
            "error": "missing_dependency",
            "error_description": "httpx library required for OAuth",
            "should_continue": False,
        }
    except Exception as e:
        return {
            "success": False,
            "error": "request_failed",
            "error_description": str(e),
            "should_continue": False,
        }


async def _get_copilot_token(
    github_token: str,
    copilot_token_url: str,
    headers: dict,
) -> dict:
    """Exchange GitHub token for Copilot API token.
    
    Args:
        github_token: The GitHub access token (gho_... format)
        copilot_token_url: URL for Copilot token endpoint
        headers: Provider-specific headers
        
    Returns:
        Copilot token response with JWT token (eyJ... format)
    """
    try:
        import httpx
        
        # Log the token type for debugging (first 10 chars only for security)
        token_prefix = github_token[:10] if github_token else "NONE"
        logger.info(f"[Copilot] Exchanging GitHub token ({token_prefix}...) for Copilot JWT")
        logger.info(f"[Copilot] Token URL: {copilot_token_url}")
        
        # Must use exact headers that VS Code Copilot extension uses
        request_headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {github_token}",
            "User-Agent": headers.get("User-Agent", "GitHubCopilotChat/0.26.7"),
            "Editor-Version": headers.get("Editor-Version", "vscode/1.99.3"),
            "Editor-Plugin-Version": headers.get("Editor-Plugin-Version", "copilot-chat/0.26.7"),
            "Copilot-Integration-Id": headers.get("Copilot-Integration-Id", "vscode-chat"),
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                copilot_token_url,
                headers=request_headers,
            )
            
            logger.info(f"[Copilot] Token exchange response: {response.status_code}")
            
            if response.status_code == 403:
                error_text = response.text
                logger.error(f"[Copilot] 403 Forbidden - No Copilot subscription? Response: {error_text[:200]}")
                return {
                    "error": "copilot_not_available",
                    "error_description": "GitHub Copilot is not available for this account. Ensure you have an active Copilot subscription.",
                }
            
            if response.status_code != 200:
                error_text = response.text
                logger.error(f"[Copilot] Token exchange failed: {response.status_code} - {error_text[:200]}")
                return {
                    "error": "copilot_token_failed",
                    "error_description": f"Failed to get Copilot token: {response.status_code}",
                }
            
            data = response.json()
            copilot_token = data.get("token")
            expires_at = data.get("expires_at")
            
            if copilot_token:
                token_preview = copilot_token[:15] if copilot_token else "NONE"
                logger.info(f"[Copilot] SUCCESS! Got Copilot JWT ({token_preview}...), expires: {expires_at}")
            else:
                logger.error(f"[Copilot] No token in response: {data}")
            
            return {
                "token": copilot_token,
                "expires_at": expires_at,
            }
            
    except Exception as e:
        logger.exception(f"[Copilot] Token exchange exception: {e}")
        return {
            "error": "copilot_token_failed",
            "error_description": str(e),
        }


def get_flow_type(provider_id: str) -> str:
    """Get the OAuth flow type for a provider.
    
    Args:
        provider_id: The provider identifier
        
    Returns:
        'device' or 'authorization_code'
    """
    if provider_id not in OAUTH_CONFIGS:
        raise ValueError(f"Unknown OAuth provider: {provider_id}")
    
    return OAUTH_CONFIGS[provider_id].get("flow_type", "authorization_code")


def get_provider_config(provider_id: str) -> dict:
    """Get the full configuration for a provider.
    
    Args:
        provider_id: The provider identifier
        
    Returns:
        Provider configuration dictionary
    """
    if provider_id not in OAUTH_CONFIGS:
        raise ValueError(f"Unknown OAuth provider: {provider_id}")
    
    return OAUTH_CONFIGS[provider_id].copy()
