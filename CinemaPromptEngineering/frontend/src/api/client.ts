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

// ComfyUI serves the bundled app under the node's route prefix.  Development
// and standalone builds keep using the CPE backend at the origin.
const API_BASE = import.meta.env.PROD && import.meta.env.VITE_BUILD_MODE === 'comfyui'
  ? '../api'
  : '';

export type EnhancementTask = 't2v' | 'i2v' | 'ref2v';
export type PromptSkillTask = 't2v' | 'i2v' | 'first_last' | 'reference' | 'v2v' | 't2i' | 'edit' | 'multi_reference' | 'style_reference' | 'outpaint' | 'rgba' | 'control' | 'relight' | 'restore' | 'upscale' | 'hdr' | 'audio_edit';
export type PromptConditioningAdapter = 'ingredients' | 'union_control' | 'motion_track_control' | 'layout_to_render' | 'in_outpainting' | 'relight' | 'day_to_night' | 'colorization' | 'decompression' | 'deblur' | 'water_simulation' | 'clean_plate' | 'instant_shave' | 'cross_eyed' | 'pixel_spatial_upscaler' | 'refine_details' | 'restore' | 'alpha_gen' | 'hdr' | 'sdr_to_hdr' | 'dub_it';
export type EnhancementAssetKind = 'image' | 'video' | 'audio';
export type EnhancementAssetRole = 'first_frame' | 'last_frame' | 'reference_image' | 'reference_video' | 'reference_audio';

export type AgentHarnessId = 'pi' | 'codex' | 'claude-code';
export type AgentThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';
export type AgentMigrationState = 'unconfigured' | 'legacy_explicit' | 'harness_configured';
export type AgentSurface = 'prompt-engineer' | 'prompt-enhancement' | 'console' | 'workspace';

export interface AgentSelection {
  schemaVersion: 1;
  harnessId: AgentHarnessId;
  provider: string;
  modelId: string;
  thinkingLevel?: AgentThinkingLevel | null;
}

export interface AgentSettingsRecord {
  schemaVersion: 1;
  migrationState: AgentMigrationState;
  selection: AgentSelection | null;
}

export interface AgentSessionRef {
  surface: AgentSurface;
  harnessId: AgentHarnessId;
  sessionId: string;
  projectIdentity?: string;
}

export interface PiAvailability {
  state: 'unconfigured' | 'ready' | 'unavailable' | 'disposed';
  authenticatedModelCount: number;
  checkedAt?: string;
  message: string;
}

export interface EnhancementContext {
  task: EnhancementTask;
  referenceDialect?: string;
  durationSeconds?: number;
  assets: Array<{
    bindingId: string;
    kind: EnhancementAssetKind;
    role: EnhancementAssetRole;
    ordinal: number;
    label?: string;
    description?: string;
    referenceName?: string;
  }>;
  referenceOrderConfirmed: boolean;
}

export interface PromptEnhancementProfileDialect {
  id: string;
  label: string;
  tasks: string[];
  reference_style: string;
  requires_order_confirmation: boolean;
}

export interface PromptEnhancementProfile {
  target_model: string;
  label: string;
  tasks: string[];
  default_dialect: string;
  dialects: PromptEnhancementProfileDialect[];
  source_urls: string[];
}

export interface EnhancementImage {
  id: number;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string;
}

export interface PromptEnhancementInput {
  userPrompt: string;
  targetModel: string;
  projectType: 'live_action' | 'animation';
  config: LiveActionConfig | AnimationConfig;
  enhancementContext?: EnhancementContext;
  presetId?: string;
  images?: EnhancementImage[];
  imageMode?: EnhancementImageMode;
  imageDialect?: string;
  skillModelVersion?: string;
  skillTask?: PromptSkillTask;
  conditioningAdapter?: PromptConditioningAdapter;
}

export interface StandalonePromptInput {
  userPrompt: string;
  targetModel: string;
  task?: PromptSkillTask;
  modelVersion?: string;
  dialectId?: string;
  conditioningAdapter?: PromptConditioningAdapter;
  enhancementContext?: EnhancementContext;
}

export interface PromptSkillResolution {
  status: 'available' | 'requires_selection' | 'unsupported';
  skill_id: string | null;
  skill_version: string | null;
  model_version: string | null;
  task: string | null;
  dialect_id: string | null;
  conditioning_adapter: string | null;
  resource_ids: string[];
  resources: Array<{ id: string; path: string; sha256: string }>;
  sources: Array<{ id: string; kind: string; title: string; url?: string; reviewedAt: string; note?: string }>;
  content_hash: string;
  manifest_hash: string;
  fingerprint: string;
  message?: string | null;
}

export interface ModelPromptGuidance {
  status: 'available' | 'requires_selection' | 'unsupported';
  target_model: string;
  model_version: string | null;
  task: PromptSkillTask | null;
  dialect_id: string | null;
  conditioning_adapter: PromptConditioningAdapter | null;
  guidance: string;
  fingerprint: string | null;
  resources: Array<{ path: string; sha256: string }>;
  sources: PromptSkillResolution['sources'];
  media_requirements: Record<string, unknown>;
  readiness: 'guidance_only';
  message: string | null;
  choices: Array<{
    target_model: string;
    model_version: string;
    task: PromptSkillTask;
    dialect_id: string | null;
    conditioning_adapter: PromptConditioningAdapter | null;
  }>;
}

export interface PromptSkillCatalogMatch {
  skill_id: string;
  label: string;
  skill_version: string;
  target_model: string;
  model_version: string;
  version_required: boolean;
  task: PromptSkillTask;
  dialect_id: string | null;
  conditioning_adapter: PromptConditioningAdapter | null;
  resources: string[];
  media: {
    imageModes?: EnhancementImageMode[];
    minImages?: number;
    maxImages?: number;
    requiresImagesWhenMode?: EnhancementImageMode[];
    requiredRoles?: EnhancementAssetRole[];
    requiredRolesAny?: EnhancementAssetRole[];
  };
  sources: PromptSkillResolution['sources'];
  status: 'available' | 'requires_selection' | 'unsupported';
  message?: string | null;
}

export interface PromptSkillCatalogResponse {
  manifest_version: string;
  manifest_hash: string;
  status: 'available' | 'requires_selection' | 'unsupported';
  target_model: string | null;
  message: string | null;
  matches: PromptSkillCatalogMatch[];
  context_limit_bytes: number;
  availability_scope: string;
}

export interface PreparedPromptEnhancement {
  system_prompt: string;
  user_prompt: string;
  canonical_target_model: string;
  task: EnhancementTask | null;
  dialect_id: string | null;
  enhancement_context: {
    task: EnhancementTask;
    reference_dialect?: string | null;
    duration_seconds?: number | null;
    assets: Array<{
      binding_id: string;
      kind: EnhancementAssetKind;
      role: EnhancementAssetRole;
      ordinal: number;
      label?: string | null;
      description?: string | null;
      reference_name?: string | null;
    }>;
    reference_order_confirmed: boolean;
  } | null;
  images: Array<{ id: number; mime_type: EnhancementImage['mimeType']; data: string }> | null;
  images_were_supplied: boolean;
  prompt_skill: PromptSkillResolution;
}

export interface StandalonePromptPreparation {
  system_prompt: string;
  user_prompt: string;
  canonical_target_model: string;
  task: PromptSkillTask | null;
  dialect_id: string | null;
  enhancement_context: PreparedPromptEnhancement['enhancement_context'];
  prompt_skill: ModelPromptGuidance;
  fingerprint: string;
  warnings: string[];
}

export interface WorkflowRecipeSearch {
  query?: string;
  targetModel?: string;
  modelVersion?: string;
  task?: string;
  dialectId?: string;
  conditioningAdapter?: string;
}

export interface WorkflowRecipeSearchResult {
  count: number;
  catalogFingerprint: string;
  recipes: Array<Record<string, unknown>>;
}

function serializeEnhancementInput(options: PromptEnhancementInput): Record<string, unknown> {
  return {
    user_prompt: options.userPrompt,
    target_model: options.targetModel,
    project_type: options.projectType,
    config: options.config,
    ...(options.presetId !== undefined ? { preset_id: options.presetId } : {}),
    ...(options.images !== undefined ? {
      images: options.images.map(image => ({ id: image.id, mime_type: image.mimeType, data: image.data })),
    } : {}),
    ...(options.imageMode !== undefined ? { image_mode: options.imageMode } : {}),
    ...(options.imageDialect !== undefined ? { image_dialect: options.imageDialect } : {}),
    ...(options.skillModelVersion !== undefined ? { skill_model_version: options.skillModelVersion } : {}),
    ...(options.skillTask !== undefined ? { skill_task: options.skillTask } : {}),
    ...(options.conditioningAdapter !== undefined ? { conditioning_adapter: options.conditioningAdapter } : {}),
    ...(options.enhancementContext ? {
      enhancement_context: {
        task: options.enhancementContext.task,
        ...(options.enhancementContext.referenceDialect ? { reference_dialect: options.enhancementContext.referenceDialect } : {}),
        ...(options.enhancementContext.durationSeconds !== undefined ? { duration_seconds: options.enhancementContext.durationSeconds } : {}),
        assets: options.enhancementContext.assets.map(asset => ({
          binding_id: asset.bindingId,
          kind: asset.kind,
          role: asset.role,
          ordinal: asset.ordinal,
          ...(asset.label !== undefined ? { label: asset.label } : {}),
          ...(asset.description !== undefined ? { description: asset.description } : {}),
          ...(asset.referenceName !== undefined ? { reference_name: asset.referenceName } : {}),
        })),
        reference_order_confirmed: options.enhancementContext.referenceOrderConfirmed,
      },
    } : {}),
  };
}

function serializeStandalonePromptInput(options: StandalonePromptInput): Record<string, unknown> {
  return {
    user_prompt: options.userPrompt,
    target_model: options.targetModel,
    ...(options.task !== undefined ? { task: options.task } : {}),
    ...(options.modelVersion !== undefined ? { model_version: options.modelVersion } : {}),
    ...(options.dialectId !== undefined ? { dialect_id: options.dialectId } : {}),
    ...(options.conditioningAdapter !== undefined ? { conditioning_adapter: options.conditioningAdapter } : {}),
    ...(options.enhancementContext ? {
      enhancement_context: {
        task: options.enhancementContext.task,
        ...(options.enhancementContext.referenceDialect ? { reference_dialect: options.enhancementContext.referenceDialect } : {}),
        ...(options.enhancementContext.durationSeconds !== undefined ? { duration_seconds: options.enhancementContext.durationSeconds } : {}),
        assets: options.enhancementContext.assets.map(asset => ({
          binding_id: asset.bindingId,
          kind: asset.kind,
          role: asset.role,
          ordinal: asset.ordinal,
          ...(asset.label !== undefined ? { label: asset.label } : {}),
          ...(asset.description !== undefined ? { description: asset.description } : {}),
          ...(asset.referenceName !== undefined ? { reference_name: asset.referenceName } : {}),
        })),
        reference_order_confirmed: options.enhancementContext.referenceOrderConfirmed,
      },
    } : {}),
  };
}

export type EnhancementImageMode = 'reference' | 'starting_frame' | 'description_only';

export interface ImageReferenceDialect {
  id: string;
  label: string;
  status: 'native' | 'workflow' | 'unsupported' | 'unknown';
  supports_reference: boolean;
  supports_starting_frame: boolean;
  reference_limit: number | null;
  reference_scope: 'identity_scene' | 'style' | 'edit' | 'composite_sheet' | 'none';
  reference_format: string;
  requires_composite_sheet: boolean;
  source_urls: string[];
  notes: string;
}

export interface ImageTargetCapability {
  target_model: string;
  label: string;
  default_dialect: string;
  dialects: ImageReferenceDialect[];
}

export interface ImageCapabilities {
  limits: {
    max_images: number;
    max_image_bytes: number;
    max_total_image_bytes: number;
    max_source_bytes: number;
    max_edge: number;
    max_payload_bytes: number;
  };
  targets: ImageTargetCapability[];
}

export interface PromptEnhancementProfilesResponse {
  profiles: PromptEnhancementProfile[];
  image_capabilities?: ImageCapabilities;
}

class ApiClient {
  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const timeout = AbortSignal.timeout(path === '/enhance-prompt' ? 90_000 : 30_000);
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new Error('The backend did not respond in time. Check that CPE is running, then retry.');
      }
      throw error;
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `API error: ${response.status}`);
    }

    return response.json();
  }

  /** Search the locally curated, fingerprinted workflow recipe catalog. */
  async searchWorkflowRecipes(filters: WorkflowRecipeSearch = {}): Promise<WorkflowRecipeSearchResult> {
    const query = new URLSearchParams();
    if (filters.query) query.set('q', filters.query);
    if (filters.targetModel) query.set('target_model', filters.targetModel);
    if (filters.modelVersion) query.set('model_version', filters.modelVersion);
    if (filters.task) query.set('task', filters.task);
    if (filters.dialectId) query.set('dialect_id', filters.dialectId);
    if (filters.conditioningAdapter) query.set('conditioning_adapter', filters.conditioningAdapter);
    const encoded = query.toString();
    return this.fetch(`/api/workflow-recipes${encoded ? `?${encoded}` : ''}`);
  }

  /** Read one pinned recipe by its stable catalog ID, never by a caller path. */
  async getWorkflowRecipe(recipeId: string): Promise<Record<string, unknown>> {
    return this.fetch(`/api/workflow-recipes/${encodeURIComponent(recipeId)}`);
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
    targetModel: string = 'generic',
    presetId?: string
  ): Promise<GeneratePromptResponse> {
    return this.fetch('/generate-prompt', {
      method: 'POST',
      body: JSON.stringify({
        project_type: 'live_action',
        config,
        target_model: targetModel,
        ...(presetId !== undefined ? { preset_id: presetId } : {}),
      }),
    });
  }

  /** Generate a prompt from an animation configuration */
  async generateAnimationPrompt(
    config: AnimationConfig,
    targetModel: string = 'generic',
    presetId?: string
  ): Promise<GeneratePromptResponse> {
    return this.fetch('/generate-prompt', {
      method: 'POST',
      body: JSON.stringify({
        project_type: 'animation',
        config,
        target_model: targetModel,
        ...(presetId !== undefined ? { preset_id: presetId } : {}),
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
    expires_at?: number;
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
    expires_at?: number;
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
    expires_at?: number;
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

  /** Fetch the backend-owned prompt target and dialect catalog. */
  async getPromptEnhancementProfiles(): Promise<PromptEnhancementProfilesResponse> {
    return this.fetch('/prompt-enhancement/profiles');
  }

  /** Fetch the locally packaged task-specific prompting skills. */
  async getPromptEnhancementSkills(options: { targetModel?: string; modelVersion?: string } = {}): Promise<PromptSkillCatalogResponse> {
    const query = new URLSearchParams();
    if (options.targetModel) query.set('target_model', options.targetModel);
    if (options.modelVersion) query.set('model_version', options.modelVersion);
    const encoded = query.toString();
    return this.fetch(`/prompt-enhancement/skills${encoded ? `?${encoded}` : ''}`);
  }

  /** Fetch local model-specific prompt guidance without project context. */
  async getModelPromptGuidance(options: {
    targetModel: string;
    modelVersion?: string;
    task?: PromptSkillTask;
    dialectId?: string;
    conditioningAdapter?: PromptConditioningAdapter;
  }): Promise<ModelPromptGuidance> {
    const query = new URLSearchParams({ target_model: options.targetModel });
    if (options.modelVersion !== undefined) query.set('model_version', options.modelVersion);
    if (options.task !== undefined) query.set('task', options.task);
    if (options.dialectId !== undefined) query.set('dialect_id', options.dialectId);
    if (options.conditioningAdapter !== undefined) query.set('conditioning_adapter', options.conditioningAdapter);
    return this.fetch(`/api/prompt-guidance?${query.toString()}`);
  }

  /** Enhance a user prompt using an LLM with cinematic context */
  async enhancePrompt(options: PromptEnhancementInput & {
    llmProvider: string;
    llmModel: string;
    credentials: {
      apiKey?: string;
      endpoint?: string;
      oauthToken?: string;
    };
    signal?: AbortSignal;
  }): Promise<{
    success: boolean;
    enhanced_prompt: string;
    negative_prompt?: string;
    tokens_used?: number;
    model_used?: string;
    warnings?: string[];
    error?: string;
    oauth_token?: string;
  }> {
    return this.fetch('/enhance-prompt', {
      method: 'POST',
      body: JSON.stringify({
        ...serializeEnhancementInput(options),
        llm_provider: options.llmProvider,
        llm_model: options.llmModel,
        credentials: {
          api_key: options.credentials.apiKey,
          endpoint: options.credentials.endpoint,
          oauth_token: options.credentials.oauthToken,
        },
      }),
      signal: options.signal,
    });
  }

  /** Prepare the exact cinematic prompt without provider credentials. */
  async preparePromptEnhancement(
    options: PromptEnhancementInput & { signal?: AbortSignal },
  ): Promise<PreparedPromptEnhancement> {
    return this.fetch('/prompt-enhancement/prepare', {
      method: 'POST',
      body: JSON.stringify(serializeEnhancementInput(options)),
      signal: options.signal,
    });
  }

  /** Revalidate a completed harness response against the effective request context. */
  async validatePromptEnhancement(
    options: PromptEnhancementInput & {
      expectedTargetModel: string;
      expectedTask: EnhancementTask | null;
      expectedDialectId: string | null;
      expectedEnhancementContext: PreparedPromptEnhancement['enhancement_context'];
      expectedPromptSkillFingerprint?: string;
      enhancedPrompt: string;
      truncated?: boolean;
      signal?: AbortSignal;
    },
  ): Promise<{
    success: boolean;
    enhanced_prompt: string;
    warnings?: string[];
    error?: string;
  }> {
    return this.fetch('/prompt-enhancement/validate', {
      method: 'POST',
      body: JSON.stringify({
        ...serializeEnhancementInput(options),
        expected_target_model: options.expectedTargetModel,
        expected_task: options.expectedTask,
        expected_dialect_id: options.expectedDialectId,
        expected_enhancement_context: options.expectedEnhancementContext,
        ...(options.expectedPromptSkillFingerprint !== undefined ? { expected_prompt_skill_fingerprint: options.expectedPromptSkillFingerprint } : {}),
        enhanced_prompt: options.enhancedPrompt,
        truncated: options.truncated ?? false,
      }),
      signal: options.signal,
    });
  }

  /** Enhance through an explicitly selected legacy provider without PE configuration. */
  async enhanceStandalonePrompt(options: StandalonePromptInput & {
    llmProvider: string;
    llmModel: string;
    credentials: { apiKey?: string; endpoint?: string; oauthToken?: string };
    signal?: AbortSignal;
  }): Promise<{ success: boolean; enhanced_prompt: string; warnings?: string[]; error?: string; oauth_token?: string }> {
    return this.fetch('/prompt-enhancement/standalone/enhance', {
      method: 'POST',
      body: JSON.stringify({
        ...serializeStandalonePromptInput(options),
        llm_provider: options.llmProvider,
        llm_model: options.llmModel,
        credentials: {
          api_key: options.credentials.apiKey,
          endpoint: options.credentials.endpoint,
          oauth_token: options.credentials.oauthToken,
        },
      }),
      signal: options.signal,
    });
  }

  /** Prepare a standalone model-guided prompt without project configuration. */
  async prepareStandalonePrompt(
    options: StandalonePromptInput & { signal?: AbortSignal },
  ): Promise<StandalonePromptPreparation> {
    return this.fetch('/prompt-enhancement/standalone/prepare', {
      method: 'POST',
      body: JSON.stringify(serializeStandalonePromptInput(options)),
      signal: options.signal,
    });
  }

  /** Revalidate an enhanced standalone prompt against its prepared fingerprint. */
  async validateStandalonePrompt(
    options: StandalonePromptInput & {
      expectedFingerprint: string;
      enhancedPrompt: string;
      truncated: boolean;
      signal?: AbortSignal;
    },
  ): Promise<{
    success: boolean;
    enhanced_prompt: string;
    warnings?: string[];
    error?: string;
    oauth_token?: string;
  }> {
    return this.fetch('/prompt-enhancement/standalone/validate', {
      method: 'POST',
      body: JSON.stringify({
        ...serializeStandalonePromptInput(options),
        expected_fingerprint: options.expectedFingerprint,
        enhanced_prompt: options.enhancedPrompt,
        truncated: options.truncated,
      }),
      signal: options.signal,
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
    source?: string;
    warning?: string;
    oauth_token?: string;
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
      oauth_expires_at?: number | null;
      endpoint: string | null;
      name?: string | null;
      updated_at: string | null;
    }>;
  }> {
    return this.fetch('/credentials');
  }

  /** Get full credentials for a specific provider */
  async getProviderCredentials(providerId: string): Promise<{
    exists: boolean;
    name?: string;
    api_key?: string;
    endpoint?: string;
    oauth_token?: string;
    oauth_refresh_token?: string;
    oauth_expires_at?: number | null;
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
      name?: string;
      api_key?: string;
      endpoint?: string;
      oauth_token?: string;
      oauth_refresh_token?: string;
      oauth_expires_at?: number | null;
      oauth_client_id?: string;
      oauth_client_secret?: string;
    }
  ): Promise<{ success: boolean; provider_id: string }> {
    return this.fetch(`/credentials/${providerId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: credentials.name,
        api_key: credentials.api_key,
        endpoint: credentials.endpoint,
        oauth_token: credentials.oauth_token,
        oauth_refresh_token: credentials.oauth_refresh_token,
        oauth_expires_at: credentials.oauth_expires_at,
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
    active_provider?: string | null;
    selected_model?: string | null;
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

  /** Get the versioned, non-secret agent settings record. */
  async getAgentSettings(): Promise<AgentSettingsRecord> {
    return this.fetch('/agent-settings', { cache: 'no-store' });
  }

  /** Replace the versioned, non-secret agent settings record. */
  async updateAgentSettings(settings: AgentSettingsRecord): Promise<AgentSettingsRecord> {
    return this.fetch('/agent-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  /** Import credentials from localStorage format */
  async importCredentials(data: {
    activeProvider?: string;
    providers?: Record<string, {
      name?: string;
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
