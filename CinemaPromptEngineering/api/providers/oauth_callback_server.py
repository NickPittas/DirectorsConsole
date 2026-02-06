"""OAuth Callback Server - Temporary HTTP server for receiving OAuth callbacks.

This module provides a temporary HTTP server that listens on specific ports
for OAuth callbacks from providers with pre-registered redirect URIs.

The flow:
1. Frontend calls /start-callback-server to start temp server on provider's port
2. User is redirected to OAuth provider
3. Provider redirects back to registered redirect_uri (our temp server)
4. Temp server receives callback, exchanges code for token
5. Frontend polls /poll-token to get the result
6. Temp server shuts down after success or timeout
"""

import asyncio
import logging
from typing import Optional
from dataclasses import dataclass, field
from urllib.parse import urlparse, parse_qs
from aiohttp import web

logger = logging.getLogger(__name__)


@dataclass
class CallbackResult:
    """Result from OAuth callback."""
    success: bool
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: Optional[str] = None
    expires_in: Optional[int] = None
    scope: Optional[str] = None
    error: Optional[str] = None
    error_description: Optional[str] = None


@dataclass
class CallbackServerState:
    """State for a running callback server."""
    provider_id: str
    state: str
    code_verifier: Optional[str]
    port: int
    redirect_uri: Optional[str] = None  # Store the redirect_uri used for token exchange
    server: Optional[web.AppRunner] = None
    site: Optional[web.TCPSite] = None
    result: Optional[CallbackResult] = None
    shutdown_event: asyncio.Event = field(default_factory=asyncio.Event)


# Global registry of running callback servers keyed by state
_callback_servers: dict[str, CallbackServerState] = {}

# Results storage keyed by state (persists briefly after server shuts down)
_callback_results: dict[str, CallbackResult] = {}


def get_provider_callback_port(provider_id: str) -> Optional[int]:
    """Get the registered callback port for a provider.
    
    Returns:
        Port number if provider has registered redirect_uri, None otherwise.
    """
    from .oauth import OAUTH_CONFIGS
    
    config = OAUTH_CONFIGS.get(provider_id, {})
    redirect_uri = config.get("redirect_uri")
    
    if redirect_uri:
        parsed = urlparse(redirect_uri)
        return parsed.port
    
    return None


def get_provider_callback_path(provider_id: str) -> str:
    """Get the callback path for a provider's redirect_uri.
    
    Returns:
        Path component of redirect_uri (e.g., '/oauth-callback')
    """
    from .oauth import OAUTH_CONFIGS
    
    config = OAUTH_CONFIGS.get(provider_id, {})
    redirect_uri = config.get("redirect_uri", "")
    
    if redirect_uri:
        parsed = urlparse(redirect_uri)
        return parsed.path or "/"
    
    return "/oauth/callback"


async def _handle_callback(request: web.Request) -> web.Response:
    """Handle incoming OAuth callback request."""
    # Get state from query params
    state = request.query.get("state")
    code = request.query.get("code")
    error = request.query.get("error")
    error_description = request.query.get("error_description", "")
    
    logger.info(f"Received OAuth callback: state={state}, has_code={bool(code)}, error={error}")
    
    # Find the server state for this callback
    server_state = _callback_servers.get(state)
    
    if not server_state:
        logger.warning(f"Received callback for unknown state: {state}")
        return web.Response(
            text=_build_html_response(
                success=False,
                error="Invalid state",
                error_description="OAuth state not found or expired."
            ),
            content_type="text/html"
        )
    
    if error:
        # OAuth error from provider
        result = CallbackResult(
            success=False,
            error=error,
            error_description=error_description
        )
        server_state.result = result
        _callback_results[state] = result
        server_state.shutdown_event.set()
        
        return web.Response(
            text=_build_html_response(
                success=False,
                error=error,
                error_description=error_description
            ),
            content_type="text/html"
        )
    
    if not code:
        result = CallbackResult(
            success=False,
            error="missing_code",
            error_description="No authorization code received"
        )
        server_state.result = result
        _callback_results[state] = result
        server_state.shutdown_event.set()
        
        return web.Response(
            text=_build_html_response(
                success=False,
                error="missing_code",
                error_description="No authorization code received"
            ),
            content_type="text/html"
        )
    
    # Exchange code for token
    try:
        from .oauth import exchange_code_for_token, OAUTH_CONFIGS
        from .credential_storage import get_credential_storage
        
        config = OAUTH_CONFIGS[server_state.provider_id]
        
        # Use the redirect_uri stored in server_state (could be custom or from config)
        redirect_uri = server_state.redirect_uri or config.get("redirect_uri")
        
        # Get client credentials from credential storage
        storage = get_credential_storage()
        creds = storage.get_credentials(server_state.provider_id)
        client_id = creds.oauth_client_id if creds else None
        client_secret = creds.oauth_client_secret if creds else None
        
        token_response = await exchange_code_for_token(
            provider_id=server_state.provider_id,
            code=code,
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
            code_verifier=server_state.code_verifier,
        )
        
        if "error" in token_response:
            result = CallbackResult(
                success=False,
                error=token_response.get("error"),
                error_description=token_response.get("error_description")
            )
        else:
            result = CallbackResult(
                success=True,
                access_token=token_response.get("access_token"),
                refresh_token=token_response.get("refresh_token"),
                token_type=token_response.get("token_type", "Bearer"),
                expires_in=token_response.get("expires_in"),
                scope=token_response.get("scope"),
            )
        
        server_state.result = result
        _callback_results[state] = result
        server_state.shutdown_event.set()
        
        return web.Response(
            text=_build_html_response(
                success=result.success,
                error=result.error,
                error_description=result.error_description
            ),
            content_type="text/html"
        )
        
    except Exception as e:
        logger.exception(f"Error exchanging code for token: {e}")
        result = CallbackResult(
            success=False,
            error="token_exchange_failed",
            error_description=str(e)
        )
        server_state.result = result
        _callback_results[state] = result
        server_state.shutdown_event.set()
        
        return web.Response(
            text=_build_html_response(
                success=False,
                error="token_exchange_failed",
                error_description=str(e)
            ),
            content_type="text/html"
        )


def _build_html_response(success: bool, error: Optional[str] = None, error_description: Optional[str] = None) -> str:
    """Build HTML response page for OAuth callback."""
    if success:
        title = "Authorization Successful"
        message = "You have been successfully authenticated. You can close this window."
        color = "#22c55e"  # Green
        icon = "&#10004;"  # Checkmark
    else:
        title = "Authorization Failed"
        message = f"{error_description or error or 'Unknown error occurred'}"
        color = "#ef4444"  # Red
        icon = "&#10008;"  # X mark
    
    return f"""<!DOCTYPE html>
<html>
<head>
    <title>{title}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #1a1a2e;
            color: #eee;
        }}
        .container {{
            text-align: center;
            padding: 40px;
            background: #16213e;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            max-width: 400px;
        }}
        .icon {{
            font-size: 64px;
            color: {color};
            margin-bottom: 20px;
        }}
        h1 {{
            margin: 0 0 10px 0;
            font-size: 24px;
        }}
        p {{
            margin: 0;
            color: #aaa;
            line-height: 1.5;
        }}
        .close-hint {{
            margin-top: 20px;
            font-size: 12px;
            color: #666;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">{icon}</div>
        <h1>{title}</h1>
        <p>{message}</p>
        <p class="close-hint">This window will close automatically...</p>
    </div>
    <script>
        // Auto-close after 3 seconds
        setTimeout(function() {{ window.close(); }}, 3000);
    </script>
</body>
</html>"""


async def start_callback_server(
    provider_id: str,
    state: str,
    code_verifier: Optional[str] = None,
    timeout: int = 300,  # 5 minutes default
    custom_redirect_uri: Optional[str] = None,  # Allow custom redirect_uri for providers without pre-registered one
) -> dict:
    """Start a temporary callback server for OAuth.
    
    Args:
        provider_id: The OAuth provider ID
        state: The OAuth state parameter
        code_verifier: PKCE code verifier if using PKCE
        timeout: Maximum time to wait for callback (seconds)
        custom_redirect_uri: Custom redirect URI (e.g., "http://localhost:8765/oauth-callback")
                           Used for providers without pre-registered redirect_uri (like Google in pywebview mode)
    
    Returns:
        Dict with server info or error
    """
    # Try to get port from provider config, or from custom redirect_uri
    port = get_provider_callback_port(provider_id)
    callback_path = get_provider_callback_path(provider_id)
    
    if not port and custom_redirect_uri:
        # Use custom redirect_uri
        parsed = urlparse(custom_redirect_uri)
        port = parsed.port or 8765  # Default to 8765 for pywebview mode
        callback_path = parsed.path or "/oauth-callback"
    
    if not port:
        return {
            "success": False,
            "error": "no_redirect_uri",
            "error_description": f"Provider {provider_id} does not have a registered redirect_uri and no custom_redirect_uri was provided"
        }
    
    # Check if server already running for this state
    if state in _callback_servers:
        return {
            "success": True,
            "port": port,
            "already_running": True
        }
    
    # Create aiohttp app
    app = web.Application()
    
    # Use the callback_path we determined earlier (from provider config or custom_redirect_uri)
    app.router.add_get(callback_path, _handle_callback)
    
    # Also handle root path for safety
    if callback_path != "/":
        app.router.add_get("/", _handle_callback)
    
    # Create server state
    # Compute the actual redirect_uri that will be used for token exchange
    actual_redirect_uri = custom_redirect_uri or f"http://localhost:{port}{callback_path}"
    
    server_state = CallbackServerState(
        provider_id=provider_id,
        state=state,
        code_verifier=code_verifier,
        port=port,
        redirect_uri=actual_redirect_uri,  # Store for token exchange
    )
    
    try:
        # Start the server
        runner = web.AppRunner(app)
        await runner.setup()
        
        site = web.TCPSite(runner, 'localhost', port)
        await site.start()
        
        server_state.server = runner
        server_state.site = site
        
        # Register the server
        _callback_servers[state] = server_state
        
        logger.info(f"Started OAuth callback server on port {port} for provider {provider_id}")
        
        # Schedule auto-shutdown after timeout
        asyncio.create_task(_auto_shutdown_server(state, timeout))
        
        return {
            "success": True,
            "port": port,
            "callback_path": callback_path,
            "already_running": False
        }
        
    except OSError as e:
        if "address already in use" in str(e).lower() or e.errno == 10048:  # WSAEADDRINUSE on Windows
            return {
                "success": False,
                "error": "port_in_use",
                "error_description": f"Port {port} is already in use. Please close any application using this port."
            }
        raise


async def _auto_shutdown_server(state: str, timeout: int):
    """Auto-shutdown server after timeout or callback received."""
    server_state = _callback_servers.get(state)
    if not server_state:
        return
    
    try:
        # Wait for either shutdown signal or timeout
        await asyncio.wait_for(
            server_state.shutdown_event.wait(),
            timeout=timeout
        )
    except asyncio.TimeoutError:
        # Timeout - set error result
        if not server_state.result:
            server_state.result = CallbackResult(
                success=False,
                error="timeout",
                error_description="OAuth callback timeout - no response received"
            )
            _callback_results[state] = server_state.result
    
    # Give a moment for the response to be sent
    await asyncio.sleep(1)
    
    # Shutdown the server
    await stop_callback_server(state)


async def stop_callback_server(state: str) -> bool:
    """Stop a callback server by state.
    
    Returns:
        True if server was stopped, False if not found
    """
    server_state = _callback_servers.pop(state, None)
    
    if not server_state:
        return False
    
    try:
        if server_state.site:
            await server_state.site.stop()
        if server_state.server:
            await server_state.server.cleanup()
        
        logger.info(f"Stopped OAuth callback server for state {state[:8]}...")
        return True
        
    except Exception as e:
        logger.error(f"Error stopping callback server: {e}")
        return False


def get_callback_result(state: str) -> Optional[CallbackResult]:
    """Get the result for a callback state.
    
    Returns:
        CallbackResult if available, None if still pending
    """
    # Check server state first
    server_state = _callback_servers.get(state)
    if server_state and server_state.result:
        return server_state.result
    
    # Check results storage
    return _callback_results.get(state)


def clear_callback_result(state: str):
    """Clear stored callback result."""
    _callback_results.pop(state, None)


def is_server_running(state: str) -> bool:
    """Check if callback server is running for a state."""
    return state in _callback_servers
