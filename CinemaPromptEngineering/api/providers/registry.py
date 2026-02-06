"""Registry of supported AI providers with default configurations."""

from .models import ProviderType, ProviderConfig


# Registry of all supported providers with their default configurations
PROVIDER_REGISTRY: dict[str, dict] = {
    # ==========================================================================
    # CLOUD API PROVIDERS (require API key)
    # ==========================================================================
    "openai": {
        "name": "OpenAI",
        "type": ProviderType.API_KEY,
        "description": "DALL-E 3, GPT-4V for image generation and analysis",
        "default_endpoint": "https://api.openai.com/v1",
        "docs_url": "https://platform.openai.com/docs",
        "models": ["dall-e-3", "dall-e-2", "gpt-4-vision-preview"],
        "supports": ["image_generation", "image_analysis", "text"],
    },
    "google": {
        "name": "Google AI",
        "type": ProviderType.API_KEY,
        "description": "Gemini, Imagen for multimodal generation",
        "default_endpoint": "https://generativelanguage.googleapis.com/v1",
        "docs_url": "https://ai.google.dev/docs",
        "models": ["gemini-pro-vision", "imagen-2"],
        "supports": ["image_generation", "image_analysis", "text"],
    },
    "anthropic": {
        "name": "Anthropic",
        "type": ProviderType.API_KEY,
        "description": "Claude for prompt refinement and analysis",
        "default_endpoint": "https://api.anthropic.com/v1",
        "docs_url": "https://docs.anthropic.com",
        "models": ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
        "supports": ["text", "image_analysis"],
    },
    "openrouter": {
        "name": "OpenRouter",
        "type": ProviderType.API_KEY,
        "description": "Aggregated access to multiple AI models",
        "default_endpoint": "https://openrouter.ai/api/v1",
        "docs_url": "https://openrouter.ai/docs",
        "models": [],  # Dynamic - fetched from API
        "supports": ["text", "image_generation", "image_analysis"],
    },
    "replicate": {
        "name": "Replicate",
        "type": ProviderType.API_KEY,
        "description": "Run open-source models including Flux, SDXL",
        "default_endpoint": "https://api.replicate.com/v1",
        "docs_url": "https://replicate.com/docs",
        "models": ["flux-schnell", "flux-dev", "sdxl"],
        "supports": ["image_generation", "video_generation"],
    },
    "stability": {
        "name": "Stability AI",
        "type": ProviderType.API_KEY,
        "description": "Stable Diffusion, SDXL official API",
        "default_endpoint": "https://api.stability.ai/v1",
        "docs_url": "https://platform.stability.ai/docs",
        "models": ["stable-diffusion-xl-1024-v1-0", "stable-diffusion-v1-6"],
        "supports": ["image_generation"],
    },
    "fal": {
        "name": "fal.ai",
        "type": ProviderType.API_KEY,
        "description": "Fast inference for Flux, SDXL, and video models",
        "default_endpoint": "https://fal.run",
        "docs_url": "https://fal.ai/docs",
        "models": ["flux/schnell", "flux/dev", "stable-diffusion-v3"],
        "supports": ["image_generation", "video_generation"],
    },
    "together": {
        "name": "Together AI",
        "type": ProviderType.API_KEY,
        "description": "Open-source models with fast inference",
        "default_endpoint": "https://api.together.xyz/v1",
        "docs_url": "https://docs.together.ai",
        "models": ["flux-schnell", "sdxl"],
        "supports": ["image_generation", "text"],
    },
    
    # ==========================================================================
    # LOCAL PROVIDERS (auto-detect or manual endpoint)
    # LLM providers only - image generation tools (ComfyUI, A1111, etc.) removed
    # ==========================================================================
    "ollama": {
        "name": "Ollama",
        "type": ProviderType.LOCAL,
        "description": "Local LLM server for prompt enhancement",
        "default_endpoint": "http://localhost:11434",
        "docs_url": "https://ollama.ai/docs",
        "models": [],  # Dynamic - fetched from local server
        "supports": ["text"],
        "health_check": "/api/tags",
    },
    "lmstudio": {
        "name": "LM Studio",
        "type": ProviderType.LOCAL,
        "description": "Local LLM with OpenAI-compatible API",
        "default_endpoint": "http://localhost:1234/v1",
        "docs_url": "https://lmstudio.ai/docs",
        "models": [],  # Dynamic - fetched from local server
        "supports": ["text"],
        "health_check": "/models",
    },
    
    # ==========================================================================
    # OAUTH PROVIDERS
    # ==========================================================================
    "github_copilot": {
        "name": "GitHub Models",
        "type": ProviderType.API_KEY,
        "description": "Access GPT-4o, Claude, Llama via GitHub PAT (requires models:read permission)",
        "default_endpoint": "https://models.github.ai/inference/chat/completions",
        "docs_url": "https://docs.github.com/en/github-models/quickstart",
        "models": [],  # Dynamic - fetched from /catalog/models
        "supports": ["text"],
    },
    "antigravity": {
        "name": "Antigravity (Gemini/Claude)",
        "type": ProviderType.OAUTH,
        "description": "Google OAuth for Gemini 3 Pro and Claude models via Antigravity",
        "default_endpoint": "https://cloudaicompanion.googleapis.com/v1",
        "docs_url": "https://github.com/NoeFabris/opencode-antigravity-auth",
        "oauth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "oauth_flow": "authorization_code",
        "models": [],  # Dynamic - fetched from v1internal:fetchAvailableModels
        "supports": ["text", "image_analysis"],
    },
    "openai_codex": {
        "name": "OpenAI Codex (ChatGPT Plus/Pro)",
        "type": ProviderType.OAUTH,
        "description": "OAuth for GPT-5.x models with ChatGPT subscription (device flow)",
        "default_endpoint": "https://api.openai.com/v1",
        "docs_url": "https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan",
        "oauth_url": "https://auth.openai.com/activate",
        "oauth_flow": "device",
        "models": [],  # Dynamic - fetched from /backend-api/models
        "supports": ["text", "image_generation", "image_analysis"],
        "requires_subscription": "ChatGPT Plus/Pro",
    },
}


def get_provider_defaults(provider_id: str) -> ProviderConfig | None:
    """Get default configuration for a provider.
    
    Args:
        provider_id: The provider identifier
        
    Returns:
        ProviderConfig with defaults, or None if provider not found
    """
    if provider_id not in PROVIDER_REGISTRY:
        return None
    
    reg = PROVIDER_REGISTRY[provider_id]
    return ProviderConfig(
        id=provider_id,
        name=reg["name"],
        type=reg["type"],
        description=reg["description"],
        default_endpoint=reg.get("default_endpoint"),
        api_key=None,
        endpoint=None,
        enabled=True,
    )


def get_all_provider_defaults() -> dict[str, ProviderConfig]:
    """Get default configurations for all providers."""
    result: dict[str, ProviderConfig] = {}
    for pid in PROVIDER_REGISTRY:
        config = get_provider_defaults(pid)
        if config is not None:
            result[pid] = config
    return result
