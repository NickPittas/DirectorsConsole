"""Connection testing utilities for AI providers."""

import asyncio
import time
from typing import Optional

from .models import ConnectionStatus, ConnectionTestResult, ProviderConfig
from .registry import PROVIDER_REGISTRY


async def test_provider_connection(
    provider: ProviderConfig,
    timeout_seconds: float = 10.0,
) -> ConnectionTestResult:
    """Test connection to an AI provider.
    
    Args:
        provider: Provider configuration to test
        timeout_seconds: Maximum time to wait for response
        
    Returns:
        ConnectionTestResult with status and details
    """
    endpoint = provider.endpoint or provider.default_endpoint
    if not endpoint:
        return ConnectionTestResult(
            success=False,
            status=ConnectionStatus.ERROR,
            message="No endpoint configured",
        )
    
    # Get health check path from registry
    registry_info = PROVIDER_REGISTRY.get(provider.id, {})
    health_check = registry_info.get("health_check", "")
    
    try:
        import httpx
        
        start_time = time.time()
        
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            # Build the test URL
            if provider.type == "local":
                # Local providers use health check endpoint
                test_url = f"{endpoint.rstrip('/')}{health_check}"
                headers = {}
            else:
                # Cloud providers - test with a lightweight endpoint
                test_url = f"{endpoint.rstrip('/')}/models"
                headers = {}
                if provider.api_key:
                    headers["Authorization"] = f"Bearer {provider.api_key}"
            
            response = await client.get(test_url, headers=headers)
            latency_ms = (time.time() - start_time) * 1000
            
            if response.status_code == 200:
                # Try to extract available models
                models = []
                try:
                    data = response.json()
                    if isinstance(data, dict):
                        if "data" in data:  # OpenAI format
                            models = [m.get("id", "") for m in data["data"]]
                        elif "models" in data:  # Ollama format
                            models = [m.get("name", "") for m in data["models"]]
                except Exception:
                    pass
                
                return ConnectionTestResult(
                    success=True,
                    status=ConnectionStatus.CONNECTED,
                    message="Connection successful",
                    latency_ms=latency_ms,
                    models_available=models if models else None,
                )
            elif response.status_code == 401:
                return ConnectionTestResult(
                    success=False,
                    status=ConnectionStatus.ERROR,
                    message="Authentication failed - check API key",
                    latency_ms=latency_ms,
                )
            elif response.status_code == 403:
                return ConnectionTestResult(
                    success=False,
                    status=ConnectionStatus.ERROR,
                    message="Access forbidden - check permissions",
                    latency_ms=latency_ms,
                )
            else:
                return ConnectionTestResult(
                    success=False,
                    status=ConnectionStatus.ERROR,
                    message=f"Server returned status {response.status_code}",
                    latency_ms=latency_ms,
                )
                
    except ImportError:
        # httpx not installed - use basic check
        return ConnectionTestResult(
            success=False,
            status=ConnectionStatus.ERROR,
            message="httpx library not installed for connection testing",
        )
    except asyncio.TimeoutError:
        return ConnectionTestResult(
            success=False,
            status=ConnectionStatus.ERROR,
            message=f"Connection timed out after {timeout_seconds}s",
        )
    except Exception as e:
        return ConnectionTestResult(
            success=False,
            status=ConnectionStatus.ERROR,
            message=f"Connection failed: {str(e)}",
        )


async def auto_detect_local_providers() -> list[tuple[str, str]]:
    """Scan common ports for running local LLM services.
    
    Returns:
        List of (provider_id, endpoint) tuples for detected services
    """
    detected = []
    
    # LLM providers only - image generation tools removed
    local_checks = [
        ("ollama", "http://localhost:11434"),
        ("lmstudio", "http://localhost:1234"),
    ]
    
    try:
        import httpx
        
        async with httpx.AsyncClient(timeout=2.0) as client:
            for provider_id, endpoint in local_checks:
                registry_info = PROVIDER_REGISTRY.get(provider_id, {})
                health_check = registry_info.get("health_check", "")
                
                try:
                    url = f"{endpoint}{health_check}"
                    response = await client.get(url)
                    if response.status_code == 200:
                        detected.append((provider_id, endpoint))
                except Exception:
                    continue
    except ImportError:
        pass
    
    return detected
