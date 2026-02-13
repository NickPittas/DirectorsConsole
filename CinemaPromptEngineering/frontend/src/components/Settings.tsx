import { useState, useCallback, useEffect } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';

// =============================================================================
// Pywebview Detection and Helper Functions
// =============================================================================

/**
 * Detect if we're running inside pywebview (standalone executable)
 */
const isPywebview = (): boolean => {
  // Check for pywebview API exposed by the Python backend
  return !!(window as unknown as { pywebview?: { api?: unknown } }).pywebview?.api;
};

/**
 * Open a URL in the system's default browser.
 * In pywebview, uses the exposed API. Otherwise, opens normally.
 */
const openInExternalBrowser = async (url: string): Promise<boolean> => {
  const pywebviewApi = (window as unknown as { pywebview?: { api?: { open_in_browser?: (url: string) => Promise<boolean> } } }).pywebview?.api;
  
  if (pywebviewApi?.open_in_browser) {
    // Use pywebview's exposed Python function to open in system browser
    try {
      await pywebviewApi.open_in_browser(url);
      return true;
    } catch (e) {
      console.error('Failed to open URL via pywebview API:', e);
    }
  }
  
  // Fallback: Create a temporary link with target="_blank"
  // This works in pywebview when OPEN_EXTERNAL_LINKS_IN_BROWSER is enabled
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
};

// =============================================================================
// Types
// =============================================================================

export type ProviderType = 'api_key' | 'local' | 'oauth';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  description: string;
  defaultEndpoint?: string;
  docsUrl?: string;
}

export interface ProviderCredentials {
  apiKey?: string;
  endpoint?: string;
  oauthToken?: string;
  oauthRefreshToken?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
}

export interface SavedSettings {
  activeProvider: string | null;
  providers: Record<string, ProviderCredentials>;
}

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'cinema-ai-provider-settings';  // Legacy localStorage key for migration
const LLM_SETTINGS_KEY = 'cinema-llm-settings';     // Legacy localStorage key for migration
const TARGET_MODEL_KEY = 'cinema-target-model';     // Legacy localStorage key for migration
const MIGRATION_FLAG_KEY = 'cinema-credentials-migrated';  // Flag to track migration status

// LLM providers only - removed image generation tools (ComfyUI, A1111, etc.)
const LLM_PROVIDERS: ProviderConfig[] = [
  // Cloud API Providers
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'api_key',
    description: 'GPT-4, GPT-4V for prompt enhancement and analysis',
    defaultEndpoint: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/docs',
  },
  {
    id: 'google',
    name: 'Google AI (Gemini)',
    type: 'api_key',
    description: 'Gemini Pro for multimodal prompt generation',
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1',
    docsUrl: 'https://ai.google.dev/docs',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'api_key',
    description: 'Claude for prompt refinement and analysis',
    defaultEndpoint: 'https://api.anthropic.com/v1',
    docsUrl: 'https://docs.anthropic.com',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'api_key',
    description: 'Aggregated access to multiple AI models',
    defaultEndpoint: 'https://openrouter.ai/api/v1',
    docsUrl: 'https://openrouter.ai/docs',
  },
  {
    id: 'replicate',
    name: 'Replicate',
    type: 'api_key',
    description: 'Run open-source models including Llama, Mistral',
    defaultEndpoint: 'https://api.replicate.com/v1',
    docsUrl: 'https://replicate.com/docs',
  },
  {
    id: 'stability',
    name: 'Stability AI',
    type: 'api_key',
    description: 'Stable LM and language models',
    defaultEndpoint: 'https://api.stability.ai/v1',
    docsUrl: 'https://platform.stability.ai/docs',
  },
  // Local Providers
  {
    id: 'ollama',
    name: 'Ollama',
    type: 'local',
    description: 'Local LLM server (Llama, Mistral, etc.)',
    defaultEndpoint: 'http://localhost:11434',
    docsUrl: 'https://ollama.ai/docs',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    type: 'local',
    description: 'Local LLM with OpenAI-compatible API',
    defaultEndpoint: 'http://localhost:1234/v1',
    docsUrl: 'https://lmstudio.ai/docs',
  },
  // OAuth Providers
  {
    id: 'github_copilot',
    name: 'GitHub Copilot',
    type: 'oauth',
    description: 'AI assistance via GitHub OAuth (device flow)',
    docsUrl: 'https://docs.github.com/en/copilot',
  },
  {
    id: 'github_models',
    name: 'GitHub Models',
    type: 'api_key',
    description: 'Access GPT-4o, Claude, Llama via GitHub PAT (requires models:read permission)',
    docsUrl: 'https://docs.github.com/en/github-models/quickstart',
  },
  {
    id: 'antigravity',
    name: 'Antigravity (Gemini/Claude)',
    type: 'oauth',
    description: 'Google OAuth for Gemini 3 Pro and Claude models via Antigravity',
    docsUrl: 'https://github.com/NoeFabris/opencode-antigravity-auth',
  },
  {
    id: 'openai_codex',
    name: 'OpenAI Codex (ChatGPT Plus/Pro)',
    type: 'oauth',
    description: 'OAuth for GPT-5.x models with ChatGPT subscription',
    docsUrl: 'https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan',
  },
];

// =============================================================================
// Styles
// =============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    justifyContent: 'flex-end',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  panel: {
    width: '420px',
    maxWidth: '100%',
    height: '100%',
    backgroundColor: 'var(--bg-medium)',
    borderLeft: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    animation: 'slideInRight 0.2s ease-out',
  },
  header: {
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid var(--border-subtle)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'var(--bg-dark)',
  },
  headerTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '0.5rem',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '1.5rem',
  },
  section: {
    marginBottom: '1.5rem',
  },
  sectionTitle: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '0.75rem',
  },
  label: {
    display: 'block',
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    marginBottom: '0.5rem',
  },
  select: {
    width: '100%',
    padding: '0.65rem 0.75rem',
    backgroundColor: 'var(--bg-dark)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    outline: 'none',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.75rem center',
  },
  providerInfo: {
    backgroundColor: 'var(--bg-dark)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    padding: '1rem',
    marginTop: '1rem',
  },
  providerName: {
    fontSize: '1rem',
    fontWeight: 500,
    color: 'var(--text-primary)',
    marginBottom: '0.35rem',
  },
  providerDescription: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    marginBottom: '1rem',
    lineHeight: 1.4,
  },
  inputGroup: {
    marginBottom: '0.75rem',
  },
  inputLabel: {
    display: 'block',
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
    marginBottom: '0.35rem',
  },
  input: {
    width: '100%',
    padding: '0.6rem 0.75rem',
    backgroundColor: 'var(--bg-medium)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
    outline: 'none',
    transition: 'border-color 0.15s ease',
    boxSizing: 'border-box' as const,
  },
  buttonRow: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '1rem',
  },
  button: {
    padding: '0.5rem 0.85rem',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    border: 'none',
  },
  buttonPrimary: {
    backgroundColor: 'var(--accent-primary)',
    color: 'white',
  },
  buttonSecondary: {
    backgroundColor: 'var(--bg-light)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)',
  },
  buttonOAuth: {
    backgroundColor: 'var(--bg-light)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    width: '100%',
    justifyContent: 'center',
    padding: '0.65rem 1rem',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.75rem',
    padding: '0.5rem 0.75rem',
    backgroundColor: 'var(--bg-medium)',
    borderRadius: '6px',
    fontSize: '0.8rem',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  footer: {
    padding: '1rem 1.5rem',
    borderTop: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-dark)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
  },
  errorText: {
    fontSize: '0.75rem',
    color: 'var(--error)',
    marginTop: '0.35rem',
  },
  successText: {
    fontSize: '0.75rem',
    color: 'var(--success)',
    marginTop: '0.35rem',
  },
  docsLink: {
    fontSize: '0.75rem',
    color: 'var(--accent-primary)',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    marginTop: '0.5rem',
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

// Legacy localStorage functions (kept for migration and fallback)
function loadSettingsFromLocalStorage(): SavedSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load settings from localStorage:', e);
  }
  return { activeProvider: null, providers: {} };
}

function saveSettingsToLocalStorage(settings: SavedSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings to localStorage:', e);
  }
}

// Check if migration has been done
function isMigrationComplete(): boolean {
  return localStorage.getItem(MIGRATION_FLAG_KEY) === 'true';
}

// Mark migration as complete
function markMigrationComplete(): void {
  localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
}

// Server-side API functions
async function loadSettingsFromServer(): Promise<SavedSettings> {
  try {
    // Get all credentials from server
    const serverData = await api.getAllCredentials();
    
    // Fetch full credentials for each provider (with per-provider error handling)
    const providers: Record<string, ProviderCredentials> = {};
    for (const providerId of Object.keys(serverData.providers)) {
      try {
        const fullCreds = await api.getProviderCredentials(providerId);
        if (fullCreds.exists) {
          providers[providerId] = {
            apiKey: fullCreds.api_key,
            endpoint: fullCreds.endpoint,
            oauthToken: fullCreds.oauth_token,
            oauthRefreshToken: fullCreds.oauth_refresh_token,
            oauthClientId: fullCreds.oauth_client_id,
            oauthClientSecret: fullCreds.oauth_client_secret,
          };
        }
      } catch (providerError) {
        // Log but continue loading other providers
        console.warn(`Failed to load credentials for ${providerId}:`, providerError);
      }
    }
    
    return {
      activeProvider: serverData.active_provider,
      providers,
    };
  } catch (e) {
    console.error('Failed to load settings from server:', e);
    // Fallback to localStorage
    return loadSettingsFromLocalStorage();
  }
}

async function saveCredentialsToServer(providerId: string, creds: ProviderCredentials): Promise<void> {
  try {
    await api.updateProviderCredentials(providerId, {
      api_key: creds.apiKey,
      endpoint: creds.endpoint,
      oauth_token: creds.oauthToken,
      oauth_refresh_token: creds.oauthRefreshToken,
      oauth_client_id: creds.oauthClientId,
      oauth_client_secret: creds.oauthClientSecret,
    });
  } catch (e) {
    console.error(`Failed to save credentials for ${providerId} to server:`, e);
    throw e;
  }
}

async function saveSettingsToServer(activeProvider: string | null, selectedModel: string | null): Promise<void> {
  try {
    await api.updateSettings({
      active_provider: activeProvider || undefined,
      selected_model: selectedModel || undefined,
    });
  } catch (e) {
    console.error('Failed to save settings to server:', e);
    throw e;
  }
}

async function migrateLocalStorageToServer(): Promise<boolean> {
  try {
    // Check if already migrated
    if (isMigrationComplete()) {
      return false;
    }
    
    // Check if there's data in localStorage
    const localData = loadSettingsFromLocalStorage();
    const hasLocalData = localData.activeProvider || Object.keys(localData.providers).length > 0;
    
    if (!hasLocalData) {
      markMigrationComplete();
      return false;
    }
    
    // Check if server already has data
    const serverData = await api.getAllCredentials();
    const hasServerData = serverData.active_provider || Object.keys(serverData.providers).length > 0;
    
    if (hasServerData) {
      // Server has data, don't overwrite - just mark migration complete
      markMigrationComplete();
      return false;
    }
    
    // Migrate localStorage to server
    console.log('[Settings] Migrating credentials from localStorage to server...');
    await api.importCredentials({
      activeProvider: localData.activeProvider || undefined,
      providers: localData.providers,
    });
    
    // Also migrate LLM settings
    const llmSettings = loadLlmSettingsFromLocalStorage();
    if (llmSettings) {
      await api.updateSettings({
        selected_model: llmSettings.model,
      });
    }
    
    // Migrate target model
    const targetModel = loadTargetModelFromLocalStorage();
    if (targetModel) {
      await api.updateSettings({
        target_model: targetModel,
      });
    }
    
    markMigrationComplete();
    console.log('[Settings] Migration complete!');
    return true;
  } catch (e) {
    console.error('Failed to migrate localStorage to server:', e);
    return false;
  }
}

// Legacy: kept as synchronous fallback for components that need immediate access
function loadSettings(): SavedSettings {
  return loadSettingsFromLocalStorage();
}

function saveSettings(settings: SavedSettings): void {
  saveSettingsToLocalStorage(settings);
}

function getStatusColor(status: ConnectionStatus): string {
  const colors: Record<ConnectionStatus, string> = {
    disconnected: 'var(--text-muted)',
    connecting: 'var(--warning)',
    connected: 'var(--success)',
    error: 'var(--error)',
  };
  return colors[status];
}

function getStatusTextI18n(t: TFunction, status: ConnectionStatus): string {
  const texts: Record<ConnectionStatus, string> = {
    disconnected: t('settings.status.disconnected'),
    connecting: t('settings.status.connecting'),
    connected: t('settings.status.connected'),
    error: t('settings.status.error'),
  };
  return texts[status];
}

// =============================================================================
// LLM Settings Helper Functions
// =============================================================================

export interface LlmSettings {
  provider: string;
  model: string;
}

// Legacy localStorage functions
function loadLlmSettingsFromLocalStorage(): LlmSettings | null {
  try {
    const saved = localStorage.getItem(LLM_SETTINGS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load LLM settings from localStorage:', e);
  }
  return null;
}

function saveLlmSettingsToLocalStorage(settings: LlmSettings): void {
  try {
    localStorage.setItem(LLM_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save LLM settings to localStorage:', e);
  }
}

// Server-side LLM settings functions
async function loadLlmSettingsFromServer(): Promise<LlmSettings | null> {
  try {
    const settings = await api.getSettings();
    // The server stores selected_model directly; we need to also get the provider
    // For now, we store provider + model together in selected_model as "provider:model"
    if (settings.selected_model) {
      const [provider, model] = settings.selected_model.includes(':') 
        ? settings.selected_model.split(':')
        : ['', settings.selected_model];
      return { provider, model };
    }
    return null;
  } catch (e) {
    console.error('Failed to load LLM settings from server:', e);
    return loadLlmSettingsFromLocalStorage();
  }
}

async function saveLlmSettingsToServer(settings: LlmSettings): Promise<void> {
  try {
    // Store as "provider:model" format
    await api.updateSettings({
      selected_model: `${settings.provider}:${settings.model}`,
    });
    // Also save to localStorage as backup
    saveLlmSettingsToLocalStorage(settings);
  } catch (e) {
    console.error('Failed to save LLM settings to server:', e);
    // Fallback to localStorage
    saveLlmSettingsToLocalStorage(settings);
  }
}

// Legacy wrappers for external use
function loadLlmSettings(): LlmSettings | null {
  return loadLlmSettingsFromLocalStorage();
}

function saveLlmSettings(settings: LlmSettings): void {
  saveLlmSettingsToLocalStorage(settings);
  // Fire and forget server save
  saveLlmSettingsToServer(settings).catch(console.error);
}

export function getSelectedLlmSettings(): LlmSettings | null {
  return loadLlmSettings();
}

// Target model persistence - legacy localStorage
function loadTargetModelFromLocalStorage(): string | null {
  try {
    return localStorage.getItem(TARGET_MODEL_KEY);
  } catch (e) {
    console.error('Failed to load target model from localStorage:', e);
    return null;
  }
}

function saveTargetModelToLocalStorage(model: string): void {
  try {
    localStorage.setItem(TARGET_MODEL_KEY, model);
  } catch (e) {
    console.error('Failed to save target model to localStorage:', e);
  }
}

// Server-side target model functions
async function loadTargetModelFromServer(): Promise<string | null> {
  try {
    const settings = await api.getSettings();
    return settings.target_model;
  } catch (e) {
    console.error('Failed to load target model from server:', e);
    return loadTargetModelFromLocalStorage();
  }
}

async function saveTargetModelToServer(model: string): Promise<void> {
  try {
    await api.updateSettings({ target_model: model });
    // Also save to localStorage as backup
    saveTargetModelToLocalStorage(model);
  } catch (e) {
    console.error('Failed to save target model to server:', e);
    saveTargetModelToLocalStorage(model);
  }
}

// Exported functions use server with localStorage fallback
export function loadTargetModel(): string | null {
  // Use localStorage for synchronous access; server sync happens on Settings mount
  return loadTargetModelFromLocalStorage();
}

// Async version for components that can wait
export async function loadTargetModelAsync(): Promise<string | null> {
  return loadTargetModelFromServer();
}

export function saveTargetModel(model: string): void {
  saveTargetModelToLocalStorage(model);
  // Fire and forget server save
  saveTargetModelToServer(model).catch(console.error);
}

// =============================================================================
// Main Settings Component
// =============================================================================

export default function Settings({ isOpen, onClose }: SettingsProps) {
  const { t } = useTranslation();
  // State
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, ProviderCredentials>>({});
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Default LLM model selection state
  const [selectedLlmProvider, setSelectedLlmProvider] = useState<string>('');
  const [selectedLlmModel, setSelectedLlmModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<Array<{id: string, name: string, recommended: boolean}>>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  // Device flow OAuth state
  const [deviceFlowState, setDeviceFlowState] = useState<{
    userCode: string;
    verificationUri: string;
    deviceCode: string;
    interval: number;
    expiresIn: number;
  } | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingError, setPollingError] = useState<string | null>(null);

  // Helper to refresh OAuth tokens for providers that need it
  const refreshExpiredTokens = async (providers: Record<string, ProviderCredentials>): Promise<Record<string, ProviderCredentials>> => {
    const refreshedProviders = { ...providers };
    
    // For GitHub Copilot, try to refresh if we have the GitHub access token stored
    if (providers.github_copilot?.oauthRefreshToken && providers.github_copilot?.oauthToken) {
      try {
        // Check if token looks like a JWT (Copilot JWT starts with eyJ)
        const token = providers.github_copilot.oauthToken;
        if (token.startsWith('eyJ')) {
          // Try to decode and check expiration (JWTs are base64-encoded JSON)
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const expiresAt = payload.exp ? payload.exp * 1000 : 0;
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;
            
            if (expiresAt > 0 && expiresAt - now < fiveMinutes) {
              console.log('[Settings] GitHub Copilot token expires soon, refreshing...');
              const result = await api.refreshOAuthToken('github_copilot');
              if (result.success && result.oauth_token) {
                console.log('[Settings] GitHub Copilot token refreshed successfully');
                refreshedProviders.github_copilot = {
                  ...refreshedProviders.github_copilot,
                  oauthToken: result.oauth_token,
                };
              } else {
                console.warn('[Settings] Failed to refresh GitHub Copilot token:', result.error_description);
              }
            }
          } catch (decodeError) {
            // If we can't decode the JWT, try refreshing anyway
            console.log('[Settings] Could not decode token expiration, attempting refresh...');
            const result = await api.refreshOAuthToken('github_copilot');
            if (result.success && result.oauth_token) {
              refreshedProviders.github_copilot = {
                ...refreshedProviders.github_copilot,
                oauthToken: result.oauth_token,
              };
            }
          }
        }
      } catch (error) {
        console.warn('[Settings] Error refreshing GitHub Copilot token:', error);
      }
    }
    
    return refreshedProviders;
  };

  // Load settings from server on mount (with localStorage migration)
  useEffect(() => {
    if (!isOpen) return;
    
    let isMounted = true;
    
    const loadFromServer = async () => {
      try {
        // First, try migration if needed
        await migrateLocalStorageToServer();
        
        // Then load from server
        let saved = await loadSettingsFromServer();
        
        if (!isMounted) return;
        
        // Try to refresh expired OAuth tokens
        saved = {
          ...saved,
          providers: await refreshExpiredTokens(saved.providers),
        };
        
        if (!isMounted) return;
        
        setActiveProvider(saved.activeProvider);
        setCredentials(saved.providers);
        setConnectionStatus('disconnected');
        setConnectionError(null);
        setHasUnsavedChanges(false);
        
        // Load LLM model settings from server
        const llmSettings = await loadLlmSettingsFromServer();
        if (llmSettings && isMounted) {
          setSelectedLlmProvider(llmSettings.provider);
          setSelectedLlmModel(llmSettings.model);
        }
      } catch (error) {
        console.error('Failed to load settings from server, falling back to localStorage:', error);
        
        if (!isMounted) return;
        
        // Fallback to localStorage
        const saved = loadSettings();
        setActiveProvider(saved.activeProvider);
        setCredentials(saved.providers);
        setConnectionStatus('disconnected');
        setConnectionError(null);
        setHasUnsavedChanges(false);
        
        // Load LLM model settings from localStorage
        const llmSettings = loadLlmSettings();
        if (llmSettings) {
          setSelectedLlmProvider(llmSettings.provider);
          setSelectedLlmModel(llmSettings.model);
        }
      }
    };
    
    loadFromServer();
    
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Fetch LLM models when selected provider changes
  useEffect(() => {
    if (!selectedLlmProvider) {
      setAvailableModels([]);
      return;
    }
    
    // Use credentials state (loaded from server) instead of localStorage
    const creds = credentials[selectedLlmProvider];
    const providerConfig = LLM_PROVIDERS.find(p => p.id === selectedLlmProvider);
    
    // Check if provider has credentials
    const hasCredentials = 
      (providerConfig?.type === 'api_key' && creds?.apiKey) ||
      (providerConfig?.type === 'oauth' && creds?.oauthToken) ||
      (providerConfig?.type === 'local' && (creds?.endpoint || providerConfig?.defaultEndpoint));
    
    if (!hasCredentials) {
      // No credentials - show instruction message instead of models
      const instruction = MODEL_FETCH_INSTRUCTIONS[selectedLlmProvider] || 'Configure credentials to fetch available models.';
      setAvailableModels([{ id: '', name: `⚠️ ${instruction}`, recommended: false }]);
      setSelectedLlmModel('');
      return;
    }
    
    setIsLoadingModels(true);
    api.fetchLlmModels({
      provider: selectedLlmProvider,
      credentials: {
        apiKey: creds?.apiKey,
        endpoint: creds?.endpoint,
        oauthToken: creds?.oauthToken,
      },
    })
      .then(result => {
        if (result.success && result.models.length > 0) {
          setAvailableModels(result.models);
          // Auto-select first recommended or first model if current selection is invalid
          if (!result.models.find(m => m.id === selectedLlmModel)) {
            const recommended = result.models.find(m => m.recommended);
            setSelectedLlmModel(recommended?.id || result.models[0]?.id || '');
          }
        } else {
          // API returned no models - show error
          const errorMsg = result.error || 'No models available. Check your credentials or provider status.';
          setAvailableModels([{ id: '', name: `❌ ${errorMsg}`, recommended: false }]);
          setSelectedLlmModel('');
        }
      })
      .catch((error) => {
        // Network or API error - show error message
        const errorMsg = error?.message || 'Failed to fetch models. Check your connection and credentials.';
        setAvailableModels([{ id: '', name: `❌ ${errorMsg}`, recommended: false }]);
        setSelectedLlmModel('');
      })
      .finally(() => setIsLoadingModels(false));
  }, [selectedLlmProvider, credentials]);

  // Get the currently selected provider config
  const selectedProvider = activeProvider 
    ? LLM_PROVIDERS.find(p => p.id === activeProvider) 
    : null;
  
  // Get credentials for the selected provider
  const currentCredentials = activeProvider ? credentials[activeProvider] || {} : {};
  
  // Handle provider selection change
  const handleProviderChange = useCallback((providerId: string) => {
    setActiveProvider(providerId || null);
    setConnectionStatus('disconnected');
    setConnectionError(null);
    setHasUnsavedChanges(true);
  }, []);

  // Handle credential updates (with immediate server persist for OAuth tokens)
  const updateCredential = useCallback((field: keyof ProviderCredentials, value: string) => {
    if (!activeProvider) return;
    
    setCredentials(prev => {
      const updated = {
        ...prev,
        [activeProvider]: {
          ...prev[activeProvider],
          [field]: value || undefined,
        },
      };
      
      // For OAuth tokens and client credentials, persist immediately to server (fire and forget)
      if (field === 'oauthToken' || field === 'oauthRefreshToken' || field === 'oauthClientId' || field === 'oauthClientSecret') {
        const creds = updated[activeProvider];
        saveCredentialsToServer(activeProvider, creds).catch((err) => {
          console.error(`Failed to persist ${field} to server:`, err);
        });
      }
      
      return updated;
    });
    setHasUnsavedChanges(true);
    setConnectionStatus('disconnected');
  }, [activeProvider]);

  // Test connection
  const handleTestConnection = useCallback(async () => {
    if (!activeProvider || !selectedProvider) return;
    
    setIsTesting(true);
    setConnectionStatus('connecting');
    setConnectionError(null);

    try {
      const creds = credentials[activeProvider] || {};
      const result = await api.testProviderConnection(activeProvider, {
        endpoint: creds.endpoint,
        apiKey: creds.apiKey,
      });
      
      setConnectionStatus(result.status);
      if (!result.success) {
        setConnectionError(result.message);
      }
    } catch (error) {
      setConnectionStatus('error');
      setConnectionError(error instanceof Error ? error.message : 'Connection test failed');
    } finally {
      setIsTesting(false);
    }
  }, [activeProvider, selectedProvider, credentials]);

  // Handle OAuth flow
  const handleOAuthConnect = useCallback(async () => {
    if (!activeProvider || !selectedProvider) return;
    
    setConnectionStatus('connecting');
    setConnectionError(null);
    setPollingError(null);
    
    try {
      // Check flow type from backend
      const flowTypeResponse = await api.getOAuthFlowType(activeProvider);
      const usesDeviceFlow = flowTypeResponse.flow_type === 'device';
      
      if (usesDeviceFlow) {
        // Device Flow (GitHub Copilot, OpenAI Codex)
        // Pass client_id from stored credentials
        const creds = credentials[activeProvider] || {};
        const deviceCodeResponse = await api.requestDeviceCode(activeProvider, creds.oauthClientId);
        
        setDeviceFlowState({
          userCode: deviceCodeResponse.user_code,
          verificationUri: deviceCodeResponse.verification_uri,
          deviceCode: deviceCodeResponse.device_code,
          interval: deviceCodeResponse.interval,
          expiresIn: deviceCodeResponse.expires_in,
        });
        
        // Start polling for token
        setIsPolling(true);
        const pollInterval = deviceCodeResponse.interval * 1000; // Convert to ms
        const expiresAt = Date.now() + (deviceCodeResponse.expires_in * 1000);
        
        const poll = async () => {
          if (Date.now() > expiresAt) {
            setIsPolling(false);
            setDeviceFlowState(null);
            setConnectionStatus('error');
            setConnectionError('Authorization timed out. Please try again.');
            return;
          }
          
          try {
            // Pass client_id from stored credentials
            const tokenResponse = await api.pollDeviceToken(
              activeProvider,
              deviceCodeResponse.device_code,
              creds.oauthClientId
            );
            
            if (tokenResponse.success && tokenResponse.access_token) {
              // Success! Store the token
              setIsPolling(false);
              setDeviceFlowState(null);
              
              // For GitHub Copilot, use the copilot_token (JWT for Copilot API)
              // and store the GitHub access_token for refreshing the JWT later
              if (activeProvider === 'github_copilot' && tokenResponse.copilot_token) {
                // copilot_token is the JWT (eyJ...) that works with api.githubcopilot.com
                updateCredential('oauthToken', tokenResponse.copilot_token);
                // Store the GitHub access_token (gho_...) so we can refresh the JWT later
                updateCredential('oauthRefreshToken', tokenResponse.access_token);
              } else {
                // Standard OAuth token for other providers
                updateCredential('oauthToken', tokenResponse.access_token);
                // Store refresh_token if available
                if (tokenResponse.refresh_token) {
                  updateCredential('oauthRefreshToken', tokenResponse.refresh_token);
                }
              }
              setConnectionStatus('connected');
            } else if (tokenResponse.should_continue) {
              // Keep polling, respect slow_down signal
              const nextInterval = tokenResponse.slow_down ? pollInterval * 2 : pollInterval;
              setTimeout(poll, nextInterval);
            } else {
              // Terminal error
              setIsPolling(false);
              setDeviceFlowState(null);
              setConnectionStatus('error');
              setConnectionError(tokenResponse.error_description || tokenResponse.error || 'Authorization failed');
            }
          } catch (error) {
            setIsPolling(false);
            setDeviceFlowState(null);
            setConnectionStatus('error');
            setConnectionError(error instanceof Error ? error.message : 'Polling failed');
          }
        };
        
        // Start polling after initial interval
        setTimeout(poll, pollInterval);
        
      } else {
        // Authorization Code Flow (Google, Antigravity, OpenAI Codex)
        
        // Determine redirect URI based on environment
        // In pywebview mode, use a local callback server
        // In browser mode, use the app's own /oauth/callback endpoint
        const inPywebview = isPywebview();
        const pywebviewCallbackPort = 8765;  // Fixed port for pywebview callback server
        
        // For pywebview, always use local callback server
        // For browser, use the origin's /oauth/callback
        let redirectUri: string;
        if (inPywebview) {
          // Use local callback server in pywebview mode
          redirectUri = `http://localhost:${pywebviewCallbackPort}/oauth-callback`;
        } else {
          // Use the app's built-in callback endpoint
          redirectUri = `${window.location.origin}/oauth/callback`;
        }
        
        // Request authorization URL from backend
        // Pass client_id from stored credentials
        const creds = credentials[activeProvider] || {};
        const authResponse = await api.initiateOAuth(activeProvider, redirectUri, creds.oauthClientId);
        
        if (!authResponse.authorization_url) {
          throw new Error('Failed to get authorization URL');
        }
        
        // Store state for callback verification
        sessionStorage.setItem('oauth_state', authResponse.state);
        sessionStorage.setItem('oauth_provider', activeProvider);
        
        // Check if provider needs local callback server:
        // 1. Provider has pre-registered redirect_uri (Antigravity, OpenAI Codex)
        // 2. OR we're running in pywebview (standalone app) - always use local server
        const needsLocalServer = flowTypeResponse.redirect_uri != null || inPywebview;
        
        if (needsLocalServer) {
          // Providers with pre-registered redirect URIs (Antigravity, OpenAI Codex)
          // OR running in pywebview standalone app
          // Need to start a local server to receive the callback
          
          // Start the callback server before opening the authorization URL
          // Pass custom_redirect_uri for providers without pre-registered one (like Google in pywebview)
          const serverResponse = await api.startCallbackServer(
            activeProvider,
            authResponse.state,
            undefined,  // code_verifier is handled by backend
            inPywebview && !flowTypeResponse.redirect_uri ? redirectUri : undefined
          );
          
          if (!serverResponse.success) {
            throw new Error(serverResponse.error_description || serverResponse.error || 'Failed to start callback server');
          }
          
          // In pywebview, open in system browser via our helper function
          // Otherwise, try popup first
          let popup: Window | null = null;
          
          if (inPywebview) {
            // Open in system's default browser
            await openInExternalBrowser(authResponse.authorization_url);
          } else {
            // Try to open as popup
            popup = window.open(
              authResponse.authorization_url,
              'oauth-popup',
              'width=600,height=700,scrollbars=yes'
            );
            
            if (!popup) {
              // If popup blocked, open in same window (will redirect back)
              window.location.href = authResponse.authorization_url;
              return;
            }
          }
          
          // Poll for token using the callback server
          setIsPolling(true);
          const pollInterval = 2000; // Poll every 2 seconds
          const expiresAt = Date.now() + 300000; // 5 minute timeout
          
          const pollForToken = async () => {
            if (Date.now() > expiresAt) {
              setIsPolling(false);
              setConnectionStatus('error');
              setConnectionError('Authorization timed out. Please try again.');
              await api.stopCallbackServer(activeProvider, authResponse.state);
              return;
            }
            
            try {
              const tokenResponse = await api.pollCallbackToken(activeProvider, authResponse.state);
              
              if (tokenResponse.success && tokenResponse.access_token) {
                // Success! Store the token
                setIsPolling(false);
                updateCredential('oauthToken', tokenResponse.access_token);
                if (tokenResponse.refresh_token) {
                  updateCredential('oauthRefreshToken', tokenResponse.refresh_token);
                }
                setConnectionStatus('connected');
                
                // Close popup if still open (only if we have a popup reference)
                if (popup) { try { popup.close(); } catch {} }
              } else if (tokenResponse.pending) {
                // Still waiting, keep polling
                setTimeout(pollForToken, pollInterval);
              } else {
                // Error
                setIsPolling(false);
                setConnectionStatus('error');
                setConnectionError(tokenResponse.error_description || tokenResponse.error || 'Authorization failed');
                
                // Close popup if still open (only if we have a popup reference)
                if (popup) { try { popup.close(); } catch {} }
              }
            } catch (error) {
              setIsPolling(false);
              setConnectionStatus('error');
              setConnectionError(error instanceof Error ? error.message : 'Polling failed');
              
              // Close popup if still open (only if we have a popup reference)
              if (popup) { try { popup.close(); } catch {} }
            }
          };
          
          // Start polling after a short delay
          setTimeout(pollForToken, pollInterval);
          
        } else {
          // Providers without pre-registered redirect URIs (Google)
          // Use the popup/postMessage flow
          
          // Open authorization URL in popup
          const popup = window.open(
            authResponse.authorization_url,
            'oauth-popup',
            'width=600,height=700,scrollbars=yes'
          );
          
          if (!popup) {
            throw new Error('Popup blocked. Please allow popups for this site.');
          }
          
          // Listen for callback
          const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            
            if (event.data?.type === 'oauth_callback') {
              window.removeEventListener('message', handleMessage);
              
              if (event.data.error) {
                setConnectionStatus('error');
                setConnectionError(event.data.error_description || event.data.error);
              } else if (event.data.access_token) {
                updateCredential('oauthToken', event.data.access_token);
                if (event.data.refresh_token) {
                  updateCredential('oauthRefreshToken', event.data.refresh_token);
                }
                setConnectionStatus('connected');
              }
            }
          };
          
          window.addEventListener('message', handleMessage);
          
          // Set a timeout for the popup
          setTimeout(() => {
            window.removeEventListener('message', handleMessage);
            if (connectionStatus === 'connecting') {
              setConnectionStatus('disconnected');
              setConnectionError('Authorization timed out or was cancelled. You can paste your access token manually below.');
            }
          }, 120000); // 2 minute timeout
        }
      }
    } catch (error) {
      setConnectionStatus('error');
      setConnectionError(error instanceof Error ? error.message : 'OAuth initiation failed');
      setDeviceFlowState(null);
    }
  }, [activeProvider, selectedProvider, updateCredential, connectionStatus]);
  
  // Cancel device flow polling
  const handleCancelDeviceFlow = useCallback(() => {
    setIsPolling(false);
    setDeviceFlowState(null);
    setConnectionStatus('disconnected');
    setPollingError(null);
  }, []);

  // Auto-detect local providers
  const handleAutoDetect = useCallback(async () => {
    setIsTesting(true);
    try {
      const result = await api.detectLocalProviders();
      
      if (result.count > 0) {
        // Update credentials with detected endpoints
        const newCreds = { ...credentials };
        result.detected.forEach(({ provider_id, endpoint }) => {
          newCreds[provider_id] = {
            ...newCreds[provider_id],
            endpoint,
          };
        });
        setCredentials(newCreds);
        setHasUnsavedChanges(true);
        
        // If we detected the currently selected provider, test it
        const detected = result.detected.find(d => d.provider_id === activeProvider);
        if (detected) {
          setConnectionStatus('connected');
        }
      }
    } catch (error) {
      console.error('Auto-detect failed:', error);
    } finally {
      setIsTesting(false);
    }
  }, [activeProvider, credentials]);

  // Save settings to server
  const handleSave = useCallback(async () => {
    try {
      // Save each provider's credentials to server
      for (const [providerId, creds] of Object.entries(credentials)) {
        // Only save if there's actual data
        if (creds.apiKey || creds.endpoint || creds.oauthToken) {
          await saveCredentialsToServer(providerId, creds);
        }
      }
      
      // Save settings (active provider, selected model) to server
      const modelString = selectedLlmProvider && selectedLlmModel 
        ? `${selectedLlmProvider}:${selectedLlmModel}`
        : null;
      await saveSettingsToServer(activeProvider, modelString);
      
      // Also save to localStorage as backup
      const settings: SavedSettings = {
        activeProvider,
        providers: credentials,
      };
      saveSettings(settings);
      
      // Also save LLM model selection to localStorage
      if (selectedLlmProvider && selectedLlmModel) {
        saveLlmSettings({ provider: selectedLlmProvider, model: selectedLlmModel });
      }
      
      setHasUnsavedChanges(false);
      onClose();
    } catch (error) {
      console.error('Failed to save settings to server:', error);
      
      // Fallback: save to localStorage only
      const settings: SavedSettings = {
        activeProvider,
        providers: credentials,
      };
      saveSettings(settings);
      
      if (selectedLlmProvider && selectedLlmModel) {
        saveLlmSettings({ provider: selectedLlmProvider, model: selectedLlmModel });
      }
      
      setHasUnsavedChanges(false);
      onClose();
    }
  }, [activeProvider, credentials, selectedLlmProvider, selectedLlmModel, onClose]);

  // Cancel without saving
  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(t('settings.unsavedChangesConfirm'));
      if (!confirmed) return;
    }
    onClose();
  }, [hasUnsavedChanges, onClose, t]);

  if (!isOpen) return null;

  return (
    <div 
      style={styles.overlay} 
      onClick={(e) => e.target === e.currentTarget && handleCancel()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div style={styles.panel}>
        <header style={styles.header}>
          <h2 id="settings-title" style={styles.headerTitle}>{t('settings.title')}</h2>
          <button
            style={styles.closeButton}
            onClick={handleCancel}
            aria-label={t('settings.close')}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-light)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div style={styles.content}>
          {/* Provider Selection */}
          <section style={styles.section}>
            <label style={styles.label} htmlFor="provider-select">
              {t('settings.selectProvider')}
            </label>
            <select
              id="provider-select"
              style={styles.select}
              value={activeProvider || ''}
              onChange={(e) => handleProviderChange(e.target.value)}
            >
              <option value="">{t('settings.selectProviderPlaceholder')}</option>
              <optgroup label={t('settings.cloudApi')}>
                {LLM_PROVIDERS.filter(p => p.type === 'api_key').map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
              <optgroup label={t('settings.localNoAuth')}>
                {LLM_PROVIDERS.filter(p => p.type === 'local').map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
              <optgroup label={t('settings.oauth')}>
                {LLM_PROVIDERS.filter(p => p.type === 'oauth').map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
            </select>
          </section>

          {/* Provider Configuration */}
          {selectedProvider && (
            <section style={styles.section}>
              <h3 style={styles.sectionTitle}>{t('settings.configuration')}</h3>
              
              <div style={styles.providerInfo}>
                <div style={styles.providerName}>{selectedProvider.name}</div>
                <p style={styles.providerDescription}>{selectedProvider.description}</p>

                {/* API Key providers */}
                {selectedProvider.type === 'api_key' && (
                  <>
                    <div style={styles.inputGroup}>
                      <label style={styles.inputLabel} htmlFor="api-key">
                        API Key
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          id="api-key"
                          type={showApiKey ? 'text' : 'password'}
                          style={styles.input}
                          placeholder="Enter your API key"
                          value={currentCredentials.apiKey || ''}
                          onChange={(e) => updateCredential('apiKey', e.target.value)}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          style={{
                            position: 'absolute',
                            right: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '4px',
                            fontSize: '0.75rem',
                          }}
                        >
                          {showApiKey ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>

                    <div style={styles.inputGroup}>
                      <label style={styles.inputLabel} htmlFor="endpoint">
                        Custom Endpoint (optional)
                      </label>
                      <input
                        id="endpoint"
                        type="text"
                        style={styles.input}
                        placeholder={selectedProvider.defaultEndpoint}
                        value={currentCredentials.endpoint || ''}
                        onChange={(e) => updateCredential('endpoint', e.target.value)}
                      />
                    </div>

                    <div style={styles.buttonRow}>
                      <button
                        style={{ 
                          ...styles.button, 
                          ...styles.buttonSecondary,
                          opacity: isTesting ? 0.6 : 1,
                        }}
                        onClick={handleTestConnection}
                        disabled={!currentCredentials.apiKey || isTesting}
                      >
                        {isTesting ? 'Testing...' : 'Test Connection'}
                      </button>
                    </div>
                  </>
                )}

                {/* Local providers */}
                {selectedProvider.type === 'local' && (
                  <>
                    <div style={styles.inputGroup}>
                      <label style={styles.inputLabel} htmlFor="endpoint">
                        Endpoint URL
                      </label>
                      <input
                        id="endpoint"
                        type="text"
                        style={styles.input}
                        placeholder={selectedProvider.defaultEndpoint}
                        value={currentCredentials.endpoint || selectedProvider.defaultEndpoint || ''}
                        onChange={(e) => updateCredential('endpoint', e.target.value)}
                      />
                    </div>

                    <div style={styles.buttonRow}>
                      <button
                        style={{ 
                          ...styles.button, 
                          ...styles.buttonSecondary,
                          opacity: isTesting ? 0.6 : 1,
                        }}
                        onClick={handleTestConnection}
                        disabled={isTesting}
                      >
                        {isTesting ? 'Testing...' : 'Test Connection'}
                      </button>
                      <button
                        style={{ 
                          ...styles.button, 
                          ...styles.buttonSecondary,
                          opacity: isTesting ? 0.6 : 1,
                        }}
                        onClick={handleAutoDetect}
                        disabled={isTesting}
                      >
                        Auto-Detect
                      </button>
                    </div>
                  </>
                )}

                {/* OAuth providers */}
                {selectedProvider.type === 'oauth' && (
                  <>
                    {currentCredentials.oauthToken ? (
                      <>
                        <div style={styles.statusRow}>
                          <span 
                            style={{ 
                              ...styles.statusDot, 
                              backgroundColor: 'var(--success)' 
                            }} 
                          />
                          <span style={{ color: 'var(--text-secondary)' }}>
                            Connected via OAuth
                          </span>
                        </div>
                        <div style={styles.buttonRow}>
                          <button
                            style={{ ...styles.button, ...styles.buttonSecondary, flex: 1 }}
                            onClick={() => {
                              updateCredential('oauthToken', '');
                              updateCredential('oauthRefreshToken', '');
                              setConnectionStatus('disconnected');
                            }}
                          >
                            Disconnect
                          </button>
                        </div>
                      </>
                    ) : deviceFlowState ? (
                      /* Device Flow - User Code Display */
                      <div style={{
                        backgroundColor: 'var(--bg-medium)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '1.25rem',
                        textAlign: 'center',
                      }}>
                        <p style={{ 
                          fontSize: '0.85rem', 
                          color: 'var(--text-secondary)',
                          marginBottom: '0.75rem',
                        }}>
                          Enter this code at the link below:
                        </p>
                        
                        {/* User Code - large and prominent */}
                        <div style={{
                          fontSize: '1.75rem',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          color: 'var(--accent-primary)',
                          letterSpacing: '0.15em',
                          padding: '0.75rem 1rem',
                          backgroundColor: 'var(--bg-dark)',
                          borderRadius: '6px',
                          marginBottom: '1rem',
                          userSelect: 'all',
                          cursor: 'pointer',
                        }}
                        title="Click to select"
                        onClick={(e) => {
                          const selection = window.getSelection();
                          const range = document.createRange();
                          range.selectNodeContents(e.currentTarget);
                          selection?.removeAllRanges();
                          selection?.addRange(range);
                        }}
                        >
                          {deviceFlowState.userCode}
                        </div>
                        
                        {/* Verification Link */}
                        <a
                          href={deviceFlowState.verificationUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.6rem 1rem',
                            backgroundColor: 'var(--accent-primary)',
                            color: 'white',
                            textDecoration: 'none',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            marginBottom: '1rem',
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                            <path d="M15 3h6v6" />
                            <path d="M10 14L21 3" />
                          </svg>
                          Open {deviceFlowState.verificationUri.replace('https://', '')}
                        </a>
                        
                        {/* Polling Status */}
                        {isPolling && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            color: 'var(--text-muted)',
                            fontSize: '0.8rem',
                            marginBottom: '1rem',
                          }}>
                            <span style={{
                              width: '12px',
                              height: '12px',
                              border: '2px solid var(--text-muted)',
                              borderTopColor: 'transparent',
                              borderRadius: '50%',
                              animation: 'spin 1s linear infinite',
                            }} />
                            Waiting for authorization...
                          </div>
                        )}
                        
                        {pollingError && (
                          <p style={{ ...styles.errorText, marginBottom: '0.75rem' }}>
                            {pollingError}
                          </p>
                        )}
                        
                        {/* Cancel Button */}
                        <button
                          style={{ 
                            ...styles.button, 
                            ...styles.buttonSecondary,
                            width: '100%',
                          }}
                          onClick={handleCancelDeviceFlow}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          style={{ ...styles.button, ...styles.buttonOAuth }}
                          onClick={handleOAuthConnect}
                          disabled={isPolling}
                        >
                          {activeProvider === 'github_copilot' ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                            </svg>
                          ) : activeProvider === 'openai_codex' ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.392.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                          )}
                          Connect with {selectedProvider.name}
                        </button>
                        
                        {/* Manual token input as fallback */}
                        <div style={{ marginTop: '1rem' }}>
                          <div style={styles.inputGroup}>
                            <label style={styles.inputLabel} htmlFor="oauth-token">
                              Or paste access token manually
                            </label>
                            <input
                              id="oauth-token"
                              type="password"
                              style={styles.input}
                              placeholder="Access token"
                              value={currentCredentials.oauthToken || ''}
                              onChange={(e) => updateCredential('oauthToken', e.target.value)}
                              autoComplete="off"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* Connection Status */}
                {connectionStatus !== 'disconnected' && (
                  <div style={styles.statusRow}>
                    <span 
                      style={{ 
                        ...styles.statusDot, 
                        backgroundColor: getStatusColor(connectionStatus) 
                      }} 
                    />
                    <span style={{ color: 'var(--text-secondary)' }}>
            {getStatusTextI18n(t, connectionStatus)}
                    </span>
                  </div>
                )}

                {connectionError && (
                  <p style={styles.errorText}>{connectionError}</p>
                )}

                {connectionStatus === 'connected' && (
                  <p style={styles.successText}>Connection successful!</p>
                )}

                {/* Documentation link */}
                {selectedProvider.docsUrl && (
                  <a
                    href={selectedProvider.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.docsLink}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                      <path d="M15 3h6v6" />
                      <path d="M10 14L21 3" />
                    </svg>
                    View documentation
                  </a>
                )}
              </div>
            </section>
          )}

          {/* Default LLM Model Selection */}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>Default LLM Model</h3>
            <p style={{ 
              fontSize: '0.8rem', 
              color: 'var(--text-muted)', 
              marginBottom: '1rem',
              lineHeight: 1.4,
            }}>
              Select the default provider and model for AI prompt enhancement. This persists across sessions.
            </p>
            
            <div style={styles.inputGroup}>
              <label style={styles.inputLabel} htmlFor="llm-provider-select">
                LLM Provider
              </label>
              <select
                id="llm-provider-select"
                style={styles.select}
                value={selectedLlmProvider}
                onChange={(e) => {
                  setSelectedLlmProvider(e.target.value);
                  setSelectedLlmModel(''); // Reset model when provider changes
                  setHasUnsavedChanges(true);
                }}
              >
                <option value="">-- Select provider --</option>
                {LLM_PROVIDERS.map(p => {
                  // Use the credentials state (loaded from server) instead of localStorage
                  const creds = credentials[p.id];
                  const hasCredentials = 
                    (p.type === 'api_key' && creds?.apiKey) ||
                    (p.type === 'oauth' && creds?.oauthToken) ||
                    (p.type === 'local' && (creds?.endpoint || p.defaultEndpoint));
                  
                  return (
                    <option 
                      key={p.id} 
                      value={p.id}
                      disabled={!hasCredentials}
                    >
                      {p.name} {!hasCredentials ? '(not configured)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedLlmProvider && (
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel} htmlFor="llm-model-select">
                  Model {isLoadingModels && <span style={{ color: 'var(--text-muted)' }}>(loading...)</span>}
                </label>
                <select
                  id="llm-model-select"
                  style={styles.select}
                  value={selectedLlmModel}
                  onChange={(e) => {
                    setSelectedLlmModel(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  disabled={isLoadingModels || availableModels.length === 0}
                >
                  <option value="">-- Select model --</option>
                  {availableModels.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.recommended ? '(recommended)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>

          {/* No provider selected message */}
          {!selectedProvider && (
            <div style={{ 
              textAlign: 'center', 
              padding: '2rem', 
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
            }}>
              Select an AI provider to configure it for prompt enhancement.
            </div>
          )}
        </div>

        <footer style={styles.footer}>
          <button
            style={{ ...styles.button, ...styles.buttonSecondary }}
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            style={{ 
              ...styles.button, 
              ...styles.buttonPrimary,
              opacity: hasUnsavedChanges ? 1 : 0.5,
            }}
            onClick={handleSave}
            disabled={!hasUnsavedChanges}
          >
            Save Changes
          </button>
        </footer>
      </div>

      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

// =============================================================================
// Export helper to get current provider settings
// =============================================================================

export function getActiveProviderSettings(): { provider: string | null; credentials: ProviderCredentials } | null {
  const settings = loadSettings();
  if (!settings.activeProvider) return null;
  
  return {
    provider: settings.activeProvider,
    credentials: settings.providers[settings.activeProvider] || {},
  };
}

// =============================================================================
// LLM Models per Provider (FALLBACK ONLY - backend fetches dynamically)
// =============================================================================

// =============================================================================
// PROVIDER_MODELS - REMOVED
// Models must be fetched dynamically from providers. No hardcoded fallbacks.
// =============================================================================

// Empty - all models must be fetched dynamically
export const PROVIDER_MODELS: Record<string, string[]> = {};

// Provider-specific instructions for obtaining models
const MODEL_FETCH_INSTRUCTIONS: Record<string, string> = {
  openai: 'Enter your OpenAI API key to fetch available models.',
  anthropic: 'Enter your Anthropic API key to fetch available models.',
  google: 'Enter your Google AI API key to fetch available models.',
  openrouter: 'Enter your OpenRouter API key to fetch available models.',
  replicate: 'Enter your Replicate API token to fetch available models.',
  stability: 'Enter your Stability AI API key to fetch available models.',
  ollama: 'Ensure Ollama is running locally to fetch available models.',
  lmstudio: 'Ensure LM Studio is running locally to fetch available models.',
  github_copilot: 'Enter your GitHub PAT with models:read permission to fetch available models.',
  antigravity: 'Complete Google OAuth authentication to fetch available models.',
  openai_codex: 'Complete ChatGPT OAuth authentication to fetch available models.',
};

// =============================================================================
// Export helper to get all configured providers with credentials
// =============================================================================

export interface ConfiguredProvider {
  providerId: string;
  providerName: string;
  providerType: ProviderType;
  credentials: ProviderCredentials;
  models: string[];
  isActive: boolean;
}

export function getConfiguredProviders(): ConfiguredProvider[] {
  const settings = loadSettings();
  const configured: ConfiguredProvider[] = [];
  
  for (const provider of LLM_PROVIDERS) {
    const creds = settings.providers[provider.id];
    // Check if provider has credentials (API key or OAuth token or is local with endpoint)
    const hasCredentials = 
      (provider.type === 'api_key' && creds?.apiKey) ||
      (provider.type === 'oauth' && creds?.oauthToken) ||
      (provider.type === 'local' && (creds?.endpoint || provider.defaultEndpoint));
    
    if (hasCredentials) {
      configured.push({
        providerId: provider.id,
        providerName: provider.name,
        providerType: provider.type,
        credentials: creds || {},
        models: [], // Models must be fetched dynamically via API
        isActive: settings.activeProvider === provider.id,
      });
    }
  }
  
  return configured;
}

// =============================================================================
// Export LLM_PROVIDERS for external use
// =============================================================================

export { LLM_PROVIDERS };
