"""AI Provider configuration and connection management."""

from .models import (
    ProviderType,
    ConnectionStatus,
    ProviderConfig,
    CustomEndpoint,
    AISettings,
    ConnectionTestResult,
)
from .registry import (
    PROVIDER_REGISTRY,
    get_provider_defaults,
)
from .tester import test_provider_connection
from .oauth import (
    OAuthConfig,
    OAuthState,
    OAUTH_CONFIGS,
    build_authorization_url,
    exchange_code_for_token,
    refresh_token,
)
from .llm_service import (
    llm_service,
    LLMService,
    LLMCredentials,
    LLMResponse,
)
from .system_prompts import (
    get_system_prompt,
    build_enhancement_prompt,
    get_target_models,
    SYSTEM_PROMPTS,
    TARGET_MODELS,
)

__all__ = [
    # Models
    "ProviderType",
    "ConnectionStatus",
    "ProviderConfig",
    "CustomEndpoint",
    "AISettings",
    "ConnectionTestResult",
    # Registry
    "PROVIDER_REGISTRY",
    "get_provider_defaults",
    # Tester
    "test_provider_connection",
    # OAuth
    "OAuthConfig",
    "OAuthState",
    "OAUTH_CONFIGS",
    "build_authorization_url",
    "exchange_code_for_token",
    "refresh_token",
    # LLM Service
    "llm_service",
    "LLMService",
    "LLMCredentials",
    "LLMResponse",
    # System Prompts
    "get_system_prompt",
    "build_enhancement_prompt",
    "get_target_models",
    "SYSTEM_PROMPTS",
    "TARGET_MODELS",
]
