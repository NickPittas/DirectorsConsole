/** API client for the Cinema Prompt Engineering backend */

import type {
  LiveActionConfig,
  AnimationConfig,
  ValidationResult,
  GeneratePromptResponse,
  EnumResponse,
  LiveActionPresetsResponse,
  AnimationPresetsResponse,
  ApplyLiveActionPresetResponse,
  ApplyAnimationPresetResponse,
  PresetSearchResponse,
  FilmPreset,
  AnimationPreset,
  CinematographyStyle,
  OptionsResponse,
} from '@/types';

// API base URL:
// - In development (Vite dev server): '/api' is proxied to localhost:9800
// - In production/ComfyUI: Use absolute URL to backend server
// Set VITE_API_BASE in .env.production for ComfyUI builds
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

class ApiClient {
  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `API error: ${response.status}`);
    }

    return response.json();
  }

  /** Get options for a specific field based on current configuration */
  async getOptions(
    projectType: 'live_action' | 'animation',
    fieldPath: string,
    currentConfig: LiveActionConfig | AnimationConfig
  ): Promise<OptionsResponse> {
    return this.fetch('/options', {
      method: 'POST',
      body: JSON.stringify({
        project_type: projectType,
        field_path: fieldPath,
        current_config: currentConfig,
      }),
    });
  }

  /** Get all values for an enum */
  async getEnumValues(enumName: string): Promise<string[]> {
    const result = await this.fetch<EnumResponse>(`/enums/${enumName}`);
    return result.values;
  }

  /** List all available enums */
  async listEnums(): Promise<Record<string, string[]>> {
    return this.fetch('/enums');
  }

  /** Validate a live-action configuration */
  async validateLiveAction(config: LiveActionConfig): Promise<ValidationResult> {
    return this.fetch('/validate', {
      method: 'POST',
      body: JSON.stringify({
        project_type: 'live_action',
        config,
      }),
    });
  }

  /** Validate an animation configuration */
  async validateAnimation(config: AnimationConfig): Promise<ValidationResult> {
    return this.fetch('/validate', {
      method: 'POST',
      body: JSON.stringify({
        project_type: 'animation',
        config,
      }),
    });
  }

  /** Generate a prompt from a live-action configuration */
  async generateLiveActionPrompt(
    config: LiveActionConfig,
    targetModel: string = 'generic'
  ): Promise<GeneratePromptResponse> {
    return this.fetch('/generate-prompt', {
      method: 'POST',
      body: JSON.stringify({
        project_type: 'live_action',
        config,
        target_model: targetModel,
      }),
    });
  }

  /** Generate a prompt from an animation configuration */
  async generateAnimationPrompt(
    config: AnimationConfig,
    targetModel: string = 'generic'
  ): Promise<GeneratePromptResponse> {
    return this.fetch('/generate-prompt', {
      method: 'POST',
      body: JSON.stringify({
        project_type: 'animation',
        config,
        target_model: targetModel,
      }),
    });
  }

  /** Get live-action presets */
  async getLiveActionPresets(): Promise<LiveActionPresetsResponse> {
    return this.fetch('/presets/live-action');
  }

  /** Get animation presets */
  async getAnimationPresets(): Promise<AnimationPresetsResponse> {
    return this.fetch('/presets/animation');
  }

  /** Get a specific live-action preset by ID */
  async getLiveActionPreset(presetId: string): Promise<FilmPreset> {
    return this.fetch(`/presets/live-action/${presetId}`);
  }

  /** Get cinematography style details for a live-action preset */
  async getCinematographyStyle(presetId: string): Promise<CinematographyStyle> {
    return this.fetch(`/presets/live-action/${presetId}/cinematography-style`);
  }

  /** Get a specific animation preset by ID */
  async getAnimationPreset(presetId: string): Promise<AnimationPreset> {
    return this.fetch(`/presets/animation/${presetId}`);
  }

  /** Apply a live-action preset with optional overrides */
  async applyLiveActionPreset(
    presetId: string,
    overrides?: Record<string, unknown>
  ): Promise<ApplyLiveActionPresetResponse> {
    return this.fetch('/apply-preset/live-action', {
      method: 'POST',
      body: JSON.stringify({
        preset_id: presetId,
        overrides: overrides ?? null,
      }),
    });
  }

  /** Apply an animation preset with optional overrides */
  async applyAnimationPreset(
    presetId: string,
    overrides?: Record<string, unknown>
  ): Promise<ApplyAnimationPresetResponse> {
    return this.fetch('/apply-preset/animation', {
      method: 'POST',
      body: JSON.stringify({
        preset_id: presetId,
        overrides: overrides ?? null,
      }),
    });
  }

  /** Search presets across both live-action and animation */
  async searchPresets(
    query: string,
    projectType?: 'live_action' | 'animation',
    limit?: number
  ): Promise<PresetSearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (projectType) params.append('project_type', projectType);
    if (limit) params.append('limit', limit.toString());
    return this.fetch(`/presets/search?${params.toString()}`);
  }

  /** Get available eras for live-action presets */
  async getEras(): Promise<{ eras: string[] }> {
    return this.fetch('/presets/eras');
  }

  /** Get available domains for animation presets */
  async getDomains(): Promise<{ domains: string[] }> {
    return this.fetch('/presets/domains');
  }

  // ===========================================================================
  // AI PROVIDER SETTINGS
  // ===========================================================================

  /** List all available AI providers */
  async listProviders(): Promise<{
    count: number;
    providers: Array<{
      id: string;
      name: string;
      type: 'api_key' | 'local' | 'oauth';
      description: string;
      default_endpoint?: string;
      docs_url?: string;
      supports: string[];
    }>;
  }> {
    return this.fetch('/settings/providers');
  }

  /** Get detailed information about a specific provider */
  async getProvider(providerId: string): Promise<{
    id: string;
    name: string;
    type: 'api_key' | 'local' | 'oauth';
    description: string;
    default_endpoint?: string;
    docs_url?: string;
    supports: string[];
    models: string[];
    health_check?: string;
    oauth_url?: string;
  }> {
    return this.fetch(`/settings/providers/${providerId}`);
  }

  /** Test connection to a provider */
  async testProviderConnection(
    providerId: string,
    options?: { endpoint?: string; apiKey?: string }
  ): Promise<{
    success: boolean;
    status: 'disconnected' | 'connecting' | 'connected' | 'error';
    message: string;
    latency_ms?: number;
    models_available?: string[];
  }> {
    return this.fetch(`/settings/providers/${providerId}/test`, {
      method: 'POST',
      body: JSON.stringify({
        endpoint: options?.endpoint,
        api_key: options?.apiKey,
      }),
    });
  }

  /** Auto-detect running local AI services */
  async detectLocalProviders(): Promise<{
    count: number;
    detected: Array<{ provider_id: string; endpoint: string }>;
  }> {
    return this.fetch('/settings/providers/local/detect');
  }

  /** Test a custom OpenAI-compatible endpoint */
  async testCustomEndpoint(
    endpoint: string,
    apiKey?: string
  ): Promise<{
    success: boolean;
    status: 'disconnected' | 'connecting' | 'connected' | 'error';
    message: string;
    latency_ms?: number;
    models_available?: string[];
  }> {
    return this.fetch('/settings/custom-endpoint/test', {
      method: 'POST',
      body: JSON.stringify({
        endpoint,
        api_key: apiKey,
      }),
    });
  }

  // ===========================================================================
  // OAUTH AUTHENTICATION
  // ===========================================================================

  /** List providers that support OAuth */
  async listOAuthProviders(): Promise<{
    count: number;
    providers: Array<{
      id: string;
      flow_type: 'device' | 'authorization_code';
      authorize_url?: string;
      device_code_url?: string;
      verification_uri?: string;
      scopes: string[];
      use_pkce?: boolean;
      models?: string[];
      api_endpoint?: string;
    }>;
  }> {
    return this.fetch('/settings/oauth/providers');
  }

  /** Initiate OAuth flow for a provider (authorization_code flow) */
  async initiateOAuth(
    providerId: string,
    redirectUri: string,
    clientId?: string
  ): Promise<{
    authorization_url: string;
    state: string;
  }> {
    return this.fetch(`/settings/oauth/${providerId}/authorize`, {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId || '',  // Falls back to credential storage if empty
        redirect_uri: redirectUri,
      }),
    });
  }

  /** Exchange OAuth code for token */
  async exchangeOAuthCode(
    providerId: string,
    code: string,
    state: string,
    redirectUri: string,
    clientId?: string,
    clientSecret?: string
  ): Promise<{
    success: boolean;
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  }> {
    return this.fetch(`/settings/oauth/${providerId}/callback`, {
      method: 'POST',
      body: JSON.stringify({
        code,
        state,
        client_id: clientId || '',
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
  }

  // ===========================================================================
  // DEVICE FLOW OAUTH (GitHub Copilot only)
  // ===========================================================================

  /** Get the OAuth flow type for a provider */
  async getOAuthFlowType(providerId: string): Promise<{
    provider_id: string;
    flow_type: 'device' | 'authorization_code';
    verification_uri?: string;
    authorize_url?: string;
    redirect_uri?: string;
    use_pkce?: boolean;
    models?: string[];
    requires_subscription?: string;
    has_builtin_client?: boolean;
  }> {
    return this.fetch(`/settings/oauth/${providerId}/flow-type`);
  }

  /** Request a device code for OAuth device flow (GitHub Copilot) */
  async requestDeviceCode(
    providerId: string,
    clientId?: string  // Optional - falls back to credential storage
  ): Promise<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  }> {
    return this.fetch(`/settings/oauth/${providerId}/device-code`, {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId || null,
      }),
    });
  }

  /** Poll for access token in device flow */
  async pollDeviceToken(
    providerId: string,
    deviceCode: string,
    clientId?: string  // Optional - falls back to credential storage
  ): Promise<{
    success: boolean;
    access_token?: string;
    token_type?: string;
    scope?: string;
    refresh_token?: string;
    copilot_token?: string;  // GitHub Copilot specific
    copilot_expires_at?: number;
    error?: string;
    error_description?: string;
    should_continue?: boolean;
    slow_down?: boolean;
  }> {
    return this.fetch(`/settings/oauth/${providerId}/device-poll`, {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId || null,
        device_code: deviceCode,
      }),
    });
  }

  // ===========================================================================
  // LOCAL CALLBACK SERVER (Antigravity, OpenAI Codex, and pywebview mode)
  // ===========================================================================
  // For OAuth providers with pre-registered redirect URIs at specific ports,
  // or for providers running in pywebview (standalone app) mode

  /** Start local callback server for OAuth providers with registered redirect URIs */
  async startCallbackServer(
    providerId: string,
    state: string,
    codeVerifier?: string,
    customRedirectUri?: string  // For providers without pre-registered redirect_uri (e.g., Google in pywebview)
  ): Promise<{
    success: boolean;
    port?: number;
    callback_path?: string;
    already_running?: boolean;
    needs_local_server?: boolean;
    error?: string;
    error_description?: string;
  }> {
    return this.fetch(`/settings/oauth/${providerId}/start-callback-server`, {
      method: 'POST',
      body: JSON.stringify({
        state,
        code_verifier: codeVerifier || null,
        custom_redirect_uri: customRedirectUri || null,
      }),
    });
  }

  /** Poll for OAuth token after callback server receives callback */
  async pollCallbackToken(
    providerId: string,
    state: string
  ): Promise<{
    pending: boolean;
    success: boolean;
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
    message?: string;
    error?: string;
    error_description?: string;
  }> {
    return this.fetch(`/settings/oauth/${providerId}/poll-token?state=${encodeURIComponent(state)}`);
  }

  /** Stop the callback server (for cleanup) */
  async stopCallbackServer(
    providerId: string,
    state: string
  ): Promise<{
    success: boolean;
    was_running?: boolean;
  }> {
    return this.fetch(`/settings/oauth/${providerId}/callback-server?state=${encodeURIComponent(state)}`, {
      method: 'DELETE',
    });
  }

  /** Check callback server status */
  async getCallbackServerStatus(
    providerId: string,
    state: string
  ): Promise<{
    running: boolean;
    port?: number;
    has_result: boolean;
    result_success?: boolean;
  }> {
    return this.fetch(`/settings/oauth/${providerId}/callback-server-status?state=${encodeURIComponent(state)}`);
  }

  /** Refresh OAuth token for a provider */
  async refreshOAuthToken(
    providerId: string
  ): Promise<{
    success: boolean;
    oauth_token?: string;
    expires_at?: number;
    error?: string;
    error_description?: string;
  }> {
    return this.fetch(`/settings/oauth/${providerId}/refresh`, {
      method: 'POST',
    });
  }

  // ===========================================================================
  // LLM PROMPT ENHANCEMENT
  // ===========================================================================

  /** Enhance a user prompt using an LLM with cinematic context */
  async enhancePrompt(options: {
    userPrompt: string;
    llmProvider: string;
    llmModel: string;
    targetModel: string;
    projectType: 'live_action' | 'animation';
    config: LiveActionConfig | AnimationConfig;
    credentials: {
      apiKey?: string;
      endpoint?: string;
      oauthToken?: string;
    };
  }): Promise<{
    success: boolean;
    enhanced_prompt: string;
    negative_prompt?: string;
    tokens_used?: number;
    model_used?: string;
    warnings?: string[];
    error?: string;
  }> {
    return this.fetch('/enhance-prompt', {
      method: 'POST',
      body: JSON.stringify({
        user_prompt: options.userPrompt,
        llm_provider: options.llmProvider,
        llm_model: options.llmModel,
        target_model: options.targetModel,
        project_type: options.projectType,
        config: options.config,
        credentials: {
          api_key: options.credentials.apiKey,
          endpoint: options.credentials.endpoint,
          oauth_token: options.credentials.oauthToken,
        },
      }),
    });
  }

  // ===========================================================================
  // DYNAMIC MODEL FETCHING
  // ===========================================================================

  /** Fetch available models from an LLM provider dynamically */
  async fetchLlmModels(options: {
    provider: string;
    credentials: {
      apiKey?: string;
      endpoint?: string;
      oauthToken?: string;
    };
  }): Promise<{
    success: boolean;
    models: Array<{
      id: string;
      name: string;
      recommended: boolean;
      description?: string;
      supports_images?: boolean;
      supports_thinking?: boolean;
      max_tokens?: number;
      context_window?: number;
      provider?: string;
    }>;
    default_model?: string;
    error?: string;
  }> {
    return this.fetch('/llm/models', {
      method: 'POST',
      body: JSON.stringify({
        provider: options.provider,
        credentials: {
          api_key: options.credentials.apiKey,
          endpoint: options.credentials.endpoint,
          oauth_token: options.credentials.oauthToken,
        },
      }),
    });
  }

  /** Fetch available target AI models for prompt generation */
  async getTargetModels(): Promise<Array<{id: string; name: string; category: string}>> {
    return this.fetch('/target-models');
  }

  // ===========================================================================
  // CREDENTIAL STORAGE (Server-side)
  // ===========================================================================

  /** Get all credentials (masked for display) */
  async getAllCredentials(): Promise<{
    active_provider: string | null;
    selected_model: string | null;
    target_model: string | null;
    providers: Record<string, {
      has_api_key: boolean;
      has_oauth_token: boolean;
      has_refresh_token: boolean;
      endpoint: string | null;
      updated_at: string | null;
    }>;
  }> {
    return this.fetch('/credentials');
  }

  /** Get full credentials for a specific provider */
  async getProviderCredentials(providerId: string): Promise<{
    exists: boolean;
    api_key?: string;
    endpoint?: string;
    oauth_token?: string;
    oauth_refresh_token?: string;
    oauth_client_id?: string;
    oauth_client_secret?: string;
    updated_at?: string;
  }> {
    return this.fetch(`/credentials/${providerId}`);
  }

  /** Update credentials for a provider */
  async updateProviderCredentials(
    providerId: string,
    credentials: {
      api_key?: string;
      endpoint?: string;
      oauth_token?: string;
      oauth_refresh_token?: string;
      oauth_client_id?: string;
      oauth_client_secret?: string;
    }
  ): Promise<{ success: boolean; provider_id: string }> {
    return this.fetch(`/credentials/${providerId}`, {
      method: 'PUT',
      body: JSON.stringify({
        api_key: credentials.api_key,
        endpoint: credentials.endpoint,
        oauth_token: credentials.oauth_token,
        oauth_refresh_token: credentials.oauth_refresh_token,
        oauth_client_id: credentials.oauth_client_id,
        oauth_client_secret: credentials.oauth_client_secret,
      }),
    });
  }

  /** Delete credentials for a provider */
  async deleteProviderCredentials(providerId: string): Promise<{ success: boolean; provider_id: string }> {
    return this.fetch(`/credentials/${providerId}`, {
      method: 'DELETE',
    });
  }

  /** Get non-credential settings */
  async getSettings(): Promise<{
    active_provider: string | null;
    selected_model: string | null;
    target_model: string | null;
  }> {
    return this.fetch('/settings');
  }

  /** Update non-credential settings */
  async updateSettings(settings: {
    active_provider?: string;
    selected_model?: string;
    target_model?: string;
  }): Promise<{ success: boolean }> {
    return this.fetch('/settings', {
      method: 'PUT',
      body: JSON.stringify({
        active_provider: settings.active_provider,
        selected_model: settings.selected_model,
        target_model: settings.target_model,
      }),
    });
  }

  /** Import credentials from localStorage format */
  async importCredentials(data: {
    activeProvider?: string;
    providers?: Record<string, {
      apiKey?: string;
      endpoint?: string;
      oauthToken?: string;
      oauthRefreshToken?: string;
    }>;
  }): Promise<{
    success: boolean;
    imported_providers: string[];
    count: number;
  }> {
    return this.fetch('/credentials/import', {
      method: 'POST',
      body: JSON.stringify({ data }),
    });
  }
}

export const api = new ApiClient();
