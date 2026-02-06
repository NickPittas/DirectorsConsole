"""Pydantic models for AI provider configuration."""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class ProviderType(str, Enum):
    """Type of authentication/connection for a provider."""
    API_KEY = "api_key"
    LOCAL = "local"
    OAUTH = "oauth"


class ConnectionStatus(str, Enum):
    """Current connection status."""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    ERROR = "error"


class ProviderConfig(BaseModel):
    """Configuration for a single AI provider."""
    id: str = Field(..., description="Unique provider identifier")
    name: str = Field(..., description="Display name")
    type: ProviderType = Field(..., description="Authentication type")
    description: str = Field(..., description="Provider description")
    default_endpoint: Optional[str] = Field(None, description="Default API endpoint")
    api_key: Optional[str] = Field(None, description="API key (encrypted)")
    endpoint: Optional[str] = Field(None, description="Custom endpoint override")
    enabled: bool = Field(default=True, description="Whether provider is enabled")
    
    class Config:
        use_enum_values = True


class CustomEndpoint(BaseModel):
    """Configuration for a custom OpenAI-compatible endpoint."""
    id: str = Field(..., description="Unique endpoint identifier")
    name: str = Field(..., description="Display name")
    endpoint: str = Field(..., description="API endpoint URL")
    api_key: Optional[str] = Field(None, description="API key if required")
    model: Optional[str] = Field(None, description="Default model to use")
    enabled: bool = Field(default=True, description="Whether endpoint is enabled")


class AISettings(BaseModel):
    """Complete AI provider settings."""
    providers: dict[str, ProviderConfig] = Field(default_factory=dict)
    custom_endpoints: list[CustomEndpoint] = Field(default_factory=list)
    active_provider: Optional[str] = Field(None, description="Currently active provider ID")


class ConnectionTestResult(BaseModel):
    """Result of a connection test."""
    success: bool
    status: ConnectionStatus
    message: str
    latency_ms: Optional[float] = None
    models_available: Optional[list[str]] = None
