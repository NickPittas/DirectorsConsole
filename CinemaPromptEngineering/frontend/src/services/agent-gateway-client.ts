import {
  api,
  type AgentSelection,
  type AgentSessionRef,
  type AgentSettingsRecord,
  type AgentSurface,
  type AgentThinkingLevel,
  type PiAvailability,
} from '@/api/client';
import type { ApplicationBridgeMessage, ApplicationResult } from '../storyboard/actions/application-actions';
import type { WorkspaceCommandMessage, WorkspaceActionResult } from './workspace-agent-contracts';

export interface PiModelSummary {
  provider: string;
  modelId: string;
  name: string;
  reasoning: boolean;
  acceptsImages: boolean;
  thinkingLevels: AgentThinkingLevel[];
}

export interface AgentGatewaySnapshot {
  status: 'disconnected' | 'connecting' | 'ready' | 'unavailable';
  message: string;
  models: PiModelSummary[];
  modelsHarnessId: 'pi' | 'codex' | null;
  availability: PiAvailability | null;
  bridgeId: string | null;
  surface: AgentSurface | null;
  projectIdentity?: string;
  sessions: AgentSessionRef[];
  modelsLoading: boolean;
  modelError: string | null;
}

export interface AgentSettingsSnapshot {
  record: AgentSettingsRecord | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

export type PiAgentActivity = {
  activityType: 'thinking_delta' | 'tool_start' | 'tool_end';
  delta?: string;
  toolCallId?: string;
  toolName?: string;
  summary?: string;
  isError?: boolean;
};

const initialGatewaySnapshot: AgentGatewaySnapshot = {
  status: 'disconnected',
  message: 'Pair this browser with the local Pi gateway from the launcher.',
  models: [],
  modelsHarnessId: null,
  availability: null,
  bridgeId: null,
  surface: null,
  sessions: [],
  modelsLoading: false,
  modelError: null,
};

const initialSettingsSnapshot: AgentSettingsSnapshot = {
  record: null,
  loading: true,
  saving: false,
  error: null,
};

let gatewaySnapshot = initialGatewaySnapshot;
let settingsSnapshot = initialSettingsSnapshot;
let gatewayOrigin: string | null = null;
let connectionCredential: string | null = null;
let credentialExpiresAt = 0;
let gatewayRevision = 0;
let modelRequestRevision = 0;
let settingsMutationRevision = 0;
let settingsLoadRevision = 0;
let bridgeIdCache: string | null = null;
let connectionAbort: AbortController | null = null;
let modelAbort: AbortController | null = null;
let settingsWriteQueue: Promise<void> = Promise.resolve();
let initialized = false;

const gatewayListeners = new Set<() => void>();
const settingsListeners = new Set<() => void>();
const promptSessions = new Map<string, AgentSessionRef>();

function publishGateway(next: AgentGatewaySnapshot): void {
  gatewaySnapshot = next;
  gatewayListeners.forEach(listener => listener());
}

function publishSettings(next: AgentSettingsSnapshot): void {
  settingsSnapshot = next;
  settingsListeners.forEach(listener => listener());
}

export function getAgentGatewaySnapshot(): AgentGatewaySnapshot {
  return gatewaySnapshot;
}

export function subscribeAgentGateway(listener: () => void): () => void {
  gatewayListeners.add(listener);
  return () => gatewayListeners.delete(listener);
}

export function getAgentSettingsState(): AgentSettingsSnapshot {
  return settingsSnapshot;
}

export function getAgentSettingsSnapshot(): AgentSettingsRecord | null {
  return settingsSnapshot.record;
}

export function subscribeAgentSettings(listener: () => void): () => void {
  settingsListeners.add(listener);
  return () => settingsListeners.delete(listener);
}

export async function loadAgentSettings(): Promise<void> {
  const loadRevision = ++settingsLoadRevision;
  const mutationRevision = settingsMutationRevision;
  publishSettings({ ...settingsSnapshot, loading: true, error: null });
  try {
    const record = await api.getAgentSettings();
    if (loadRevision !== settingsLoadRevision || mutationRevision !== settingsMutationRevision) return;
    publishSettings({ record, loading: false, saving: settingsSnapshot.saving, error: null });
  } catch {
    if (loadRevision !== settingsLoadRevision || mutationRevision !== settingsMutationRevision) return;
    publishSettings({ ...settingsSnapshot, loading: false, error: 'Agent settings could not be loaded. Retry from Settings.' });
  }
}

export async function saveAgentSettings(record: AgentSettingsRecord): Promise<AgentSettingsRecord> {
  const mutationRevision = ++settingsMutationRevision;
  const request = settingsWriteQueue.catch(() => undefined).then(() => api.updateAgentSettings(record));
  settingsWriteQueue = request.then(() => undefined, () => undefined);
  publishSettings({ ...settingsSnapshot, saving: true, error: null });
  try {
    const saved = await request;
    if (mutationRevision === settingsMutationRevision) {
      publishSettings({ record: saved, loading: false, saving: false, error: null });
    }
    return saved;
  } catch (error) {
    if (mutationRevision === settingsMutationRevision) {
      publishSettings({ ...settingsSnapshot, saving: false, error: 'Agent settings were not saved. Check the CPE connection and retry.' });
    }
    throw error;
  }
}

function decodeFragmentPart(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function fragmentKey(field: string): string {
  return decodeFragmentPart(field.split('=', 1)[0]);
}

function fragmentValue(field: string): string {
  const separator = field.indexOf('=');
  return separator < 0 ? '' : decodeFragmentPart(field.slice(separator + 1));
}

function loopbackGatewayOrigin(value: string): string {
  const match = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):(\d+)\/?$/i.exec(value.trim());
  if (!match) throw new Error('The launcher supplied an unsupported gateway address.');
  const parsed = new URL(value.trim());
  const port = Number(match[2]);
  if (parsed.protocol !== 'http:' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('The launcher supplied an unsupported gateway address.');
  }
  return `http://${match[1].toLowerCase()}:${port}`;
}

function isLocalBrowserOrigin(): boolean {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(window.location.hostname.toLowerCase());
}

function browserBridgeId(): string {
  if (bridgeIdCache) return bridgeIdCache;
  try {
    const existing = sessionStorage.getItem('dc_agent_bridge_id');
    if (existing && /^[A-Za-z0-9_-]{43}$/.test(existing)) {
      bridgeIdCache = existing;
      return existing;
    }
  } catch {
    // Private browsing may disable sessionStorage; the in-memory ID still binds this page.
  }
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  bridgeIdCache = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  try {
    sessionStorage.setItem('dc_agent_bridge_id', bridgeIdCache);
  } catch {
    // The ID is non-secret and remains usable for this page lifetime.
  }
  return bridgeIdCache;
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(10_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function responseJson(response: Response, action: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${action} failed with HTTP ${response.status}.`);
  return response.json();
}

function isPiModelSummary(value: unknown): value is PiModelSummary {
  if (!value || typeof value !== 'object') return false;
  const model = value as Record<string, unknown>;
  const supportedThinking = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
  return typeof model.provider === 'string' && Boolean(model.provider.trim()) && model.provider === model.provider.trim()
    && typeof model.modelId === 'string' && Boolean(model.modelId.trim()) && model.modelId === model.modelId.trim()
    && typeof model.name === 'string'
    && typeof model.reasoning === 'boolean'
    && typeof model.acceptsImages === 'boolean'
    && Array.isArray(model.thinkingLevels)
    && model.thinkingLevels.every(level => supportedThinking.includes(String(level)));
}

function isPiAvailability(value: unknown): value is PiAvailability {
  if (!value || typeof value !== 'object') return false;
  const availability = value as Record<string, unknown>;
  return ['unconfigured', 'ready', 'unavailable', 'disposed'].includes(String(availability.state))
    && Number.isInteger(availability.authenticatedModelCount)
    && Number(availability.authenticatedModelCount) >= 0
    && typeof availability.message === 'string'
    && (availability.checkedAt === undefined || typeof availability.checkedAt === 'string');
}

function isAgentSessionRef(value: unknown): value is AgentSessionRef {
  if (!value || typeof value !== 'object') return false;
  const ref = value as Record<string, unknown>;
  return (ref.surface === 'prompt-engineer' || ref.surface === 'prompt-enhancement' || ref.surface === 'console' || ref.surface === 'workspace')
    && (ref.harnessId === 'pi' || ref.harnessId === 'codex' || ref.harnessId === 'claude-code')
    && typeof ref.sessionId === 'string' && Boolean(ref.sessionId.trim())
    && (ref.projectIdentity === undefined || typeof ref.projectIdentity === 'string');
}

interface GatewayCredentialResponse {
  credential: string;
  expiresAt: string;
  bridgeId: string;
  surface: AgentSurface;
  projectIdentity?: string;
  sessions: AgentSessionRef[];
}

function parseCredentialResponse(value: unknown, bridgeId: string, surface: AgentSurface): GatewayCredentialResponse {
  if (!value || typeof value !== 'object') throw new Error('The local gateway returned an invalid connection credential.');
  const response = value as Record<string, unknown>;
  const expiry = typeof response.expiresAt === 'string' ? Date.parse(response.expiresAt) : NaN;
  if (typeof response.credential !== 'string' || !response.credential
    || !Number.isFinite(expiry) || expiry <= Date.now()
    || response.bridgeId !== bridgeId || response.surface !== surface
    || (response.projectIdentity !== undefined && typeof response.projectIdentity !== 'string')
    || !Array.isArray(response.sessions) || !response.sessions.every(isAgentSessionRef)
    || response.sessions.some((ref: unknown) => {
      const session = ref as AgentSessionRef;
      return session.surface !== 'console'
        ? session.projectIdentity !== undefined
        : session.projectIdentity !== response.projectIdentity;
    })) {
    throw new Error('The local gateway returned an invalid connection credential.');
  }
  return response as unknown as GatewayCredentialResponse;
}

function installCredential(response: GatewayCredentialResponse, message: string, preserveInventory = false): void {
  if (!preserveInventory) {
    modelRequestRevision += 1;
    modelAbort?.abort();
    modelAbort = null;
  }
  connectionCredential = response.credential;
  credentialExpiresAt = Date.parse(response.expiresAt);
  publishGateway({
    ...gatewaySnapshot,
    status: 'ready',
    message,
    ...(preserveInventory ? {} : { models: [], availability: null, modelsLoading: false, modelError: null }),
    bridgeId: response.bridgeId,
    surface: response.surface,
    projectIdentity: response.projectIdentity,
    sessions: response.sessions,
  });
}

export function initializeAgentGatewayFromLocation(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const fragment = window.location.hash.slice(1);
  const fields = fragment.split('&');
  const pairingField = fields.find(field => fragmentKey(field) === 'dc_agent_pair');
  const gatewayField = fields.find(field => fragmentKey(field) === 'dc_agent_gateway');
  if (pairingField || gatewayField) {
    const remaining = fields.filter(field => !['dc_agent_pair', 'dc_agent_gateway'].includes(fragmentKey(field)));
    const hash = remaining.length ? `#${remaining.join('&')}` : '';
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`);
  }

  const pairingToken = pairingField ? fragmentValue(pairingField) : '';
  const gatewayAddress = gatewayField ? fragmentValue(gatewayField) : '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(pairingToken) || !gatewayAddress) {
    if (pairingField || gatewayField) {
      publishGateway({ ...initialGatewaySnapshot, status: 'unavailable', message: 'The launcher pairing link was incomplete. Restart the local launcher to create a new pairing link.' });
    }
    return;
  }
  if (!isLocalBrowserOrigin()) {
    publishGateway({ ...initialGatewaySnapshot, status: 'unavailable', message: 'Remote browser access to the local agent gateway is unsupported. Open Director’s Console on this machine to pair.' });
    return;
  }

  let origin: string;
  try {
    origin = loopbackGatewayOrigin(gatewayAddress);
  } catch {
    publishGateway({ ...initialGatewaySnapshot, status: 'unavailable', message: 'The launcher gateway address was rejected. Restart the local launcher and use its local browser link.' });
    return;
  }

  const revision = ++gatewayRevision;
  connectionAbort?.abort();
  modelAbort?.abort();
  connectionAbort = new AbortController();
  gatewayOrigin = origin;
  connectionCredential = null;
  credentialExpiresAt = 0;
  publishGateway({ status: 'connecting', message: 'Pairing with the local agent gateway…', models: [], modelsHarnessId: null, availability: null, bridgeId: null, surface: null, sessions: [], modelsLoading: false, modelError: null });
  void establishGatewayConnection(pairingToken, origin, browserBridgeId(), revision, connectionAbort.signal);
}

async function establishGatewayConnection(
  pairingToken: string,
  origin: string,
  bridgeId: string,
  revision: number,
  signal: AbortSignal,
): Promise<void> {
  try {
    const healthResponse = await fetch(`${origin}/health`, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: requestSignal(signal),
    });
    const health = await responseJson(healthResponse, 'Gateway health check') as { status?: unknown };
    if (health.status !== 'ok') throw new Error('The local gateway is not ready.');

    const pairResponse = await fetch(`${origin}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The browser supplies its exact Origin; the project is bound later by an explicit app action.
      body: JSON.stringify({ token: pairingToken, bridgeId, surface: 'prompt-engineer' }),
      cache: 'no-store',
      redirect: 'error',
      signal: requestSignal(signal),
    });
    const pair = parseCredentialResponse(await responseJson(pairResponse, 'Gateway pairing'), bridgeId, 'prompt-engineer');
    if (revision !== gatewayRevision) return;
    installCredential(pair, 'Connected to the local Pi gateway. Checking its authenticated model inventory…');
    void refreshAgentGatewayModels();
  } catch {
    if (revision !== gatewayRevision) return;
    connectionCredential = null;
    credentialExpiresAt = 0;
    publishGateway({ ...initialGatewaySnapshot, status: 'unavailable', message: 'Could not pair with the local Pi gateway. Restart the launcher to get a fresh pairing link; legacy providers were not used.' });
  }
}

export async function refreshAgentGatewayModels(harnessId: 'pi' | 'codex' = settingsSnapshot.record?.selection?.harnessId === 'codex' ? 'codex' : 'pi'): Promise<void> {
  if (harnessId !== 'pi' && harnessId !== 'codex') throw new Error('Unsupported agent gateway inventory harness.');
  const requestedHarness = harnessId;
  const harnessLabel = requestedHarness === 'codex' ? 'Codex' : 'Pi';
  const credential = connectionCredential;
  const origin = gatewayOrigin;
  if (!credential || !origin || credentialExpiresAt <= Date.now()) {
    modelRequestRevision += 1;
    modelAbort?.abort();
    modelAbort = null;
    connectionCredential = null;
    credentialExpiresAt = 0;
    publishGateway({ ...initialGatewaySnapshot, status: 'disconnected', message: 'The local gateway connection expired. Restart the launcher to pair again; the saved selection is preserved.' });
    return;
  }

  const revision = gatewayRevision;
  const requestRevision = ++modelRequestRevision;
  modelAbort?.abort();
  modelAbort = new AbortController();
  publishGateway({ ...gatewaySnapshot, models: [], modelsHarnessId: requestedHarness, availability: null, modelsLoading: true, modelError: null });
  try {
    const response = await fetch(`${origin}/models?harnessId=${encodeURIComponent(requestedHarness)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${credential}` },
      cache: 'no-store',
      redirect: 'error',
      signal: requestSignal(modelAbort.signal),
    });
    if (revision !== gatewayRevision || requestRevision !== modelRequestRevision || credential !== connectionCredential) return;
    if (response.status === 401 || response.status === 403) {
      modelRequestRevision += 1;
      modelAbort?.abort();
      modelAbort = null;
      connectionCredential = null;
      credentialExpiresAt = 0;
      publishGateway({ ...initialGatewaySnapshot, status: 'unavailable', message: 'The local gateway connection expired or was rejected. Restart the launcher to pair again; the saved selection is preserved.', modelsHarnessId: requestedHarness });
      return;
    }
    const inventory = await responseJson(response, 'Authenticated model inventory') as { models?: unknown; availability?: unknown };
    if (!Array.isArray(inventory.models) || !inventory.models.every(isPiModelSummary) || !isPiAvailability(inventory.availability)
      || inventory.availability.authenticatedModelCount !== inventory.models.length) {
      throw new Error('The gateway returned an invalid model inventory.');
    }
    if (revision !== gatewayRevision || requestRevision !== modelRequestRevision || credential !== connectionCredential) return;
    const availability = inventory.availability;
    const isAvailable = availability.state === 'ready';
    publishGateway({
      ...gatewaySnapshot,
      status: 'ready',
      message: isAvailable ? `Authenticated ${harnessLabel} model inventory is current.` : availability.message,
      models: isAvailable ? inventory.models : [],
      modelsHarnessId: requestedHarness,
      availability,
      modelsLoading: false,
      modelError: null,
    });
  } catch {
    if (revision !== gatewayRevision || requestRevision !== modelRequestRevision || credential !== connectionCredential) return;
    publishGateway({ ...gatewaySnapshot, status: connectionCredential ? 'ready' : 'unavailable', message: `The ${harnessLabel} model inventory is unavailable. Retry the authenticated inventory request; the saved selection is preserved.`, models: [], modelsHarnessId: requestedHarness, availability: null, modelsLoading: false, modelError: `No authenticated ${harnessLabel} models are currently available.` });
  }
}

async function rotateGatewayCredential(path: '/pair/renew' | '/pair/rebind', body: { projectIdentity?: string }): Promise<AgentSessionRef[]> {
  const credential = connectionCredential;
  const origin = gatewayOrigin;
  const bridgeId = gatewaySnapshot.bridgeId;
  const surface = gatewaySnapshot.surface;
  const expectedProjectIdentity = path === '/pair/rebind' ? body.projectIdentity : gatewaySnapshot.projectIdentity;
  if (!credential || !origin || !bridgeId || !surface || credentialExpiresAt <= Date.now()) {
    throw new Error('The local gateway connection expired. Restart the launcher to pair again.');
  }
  const revision = gatewayRevision;
  try {
    const response = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'error',
      signal: requestSignal(),
    });
    const rotated = parseCredentialResponse(await responseJson(response, 'Gateway credential rotation'), bridgeId, surface);
    if (rotated.projectIdentity !== expectedProjectIdentity) throw new Error('The gateway returned a different project binding.');
    if (revision !== gatewayRevision || credential !== connectionCredential) return gatewaySnapshot.sessions;
    const preserveInventory = path === '/pair/rebind';
    installCredential(rotated, path === '/pair/rebind' ? 'Gateway connection is bound to the selected project.' : 'Gateway connection credential renewed.', preserveInventory);
    if (!preserveInventory) void refreshAgentGatewayModels();
    return rotated.sessions;
  } catch {
    if (revision === gatewayRevision) {
      connectionCredential = null;
      credentialExpiresAt = 0;
      publishGateway({ ...initialGatewaySnapshot, status: 'unavailable', message: 'The gateway credential could not be rotated. Restart the launcher to pair again; no legacy provider was used.' });
    }
    throw new Error('The local gateway credential could not be rotated. Restart the launcher to pair again.');
  }
}

/** Rotate the in-memory bearer without changing the bridge's project or session refs. */
export function renewAgentGatewayCredential(): Promise<AgentSessionRef[]> {
  return rotateGatewayCredential('/pair/renew', {});
}

/** Use only on an explicit app project switch; the gateway disposes the previous project's sessions. */
export function rebindAgentGatewayProject(projectIdentity?: string): Promise<AgentSessionRef[]> {
  return rotateGatewayCredential('/pair/rebind', projectIdentity === undefined ? {} : { projectIdentity })
    .then(sessions => {
      for (const [key, session] of promptSessions) {
        if (session.surface === 'console') promptSessions.delete(key);
      }
      return sessions;
    });
}

export function getAgentExecutionFingerprint(surface?: AgentSurface): string {
  const record = settingsSnapshot.record;
  return JSON.stringify({
    settings: {
      loading: settingsSnapshot.loading,
      error: settingsSnapshot.error,
      migrationState: record?.migrationState,
      selection: record?.selection,
    },
    gateway: {
      status: gatewaySnapshot.status,
      bridgeId: gatewaySnapshot.bridgeId,
      projectIdentity: surface === undefined || surface === 'console' ? gatewaySnapshot.projectIdentity : undefined,
      credentialAvailable: Boolean(connectionCredential) && credentialExpiresAt > Date.now(),
      modelsLoading: gatewaySnapshot.modelsLoading,
      modelError: gatewaySnapshot.modelError,
      modelsHarnessId: gatewaySnapshot.modelsHarnessId,
      availability: gatewaySnapshot.availability?.state,
      models: gatewaySnapshot.models.map(model => [model.provider, model.modelId, model.acceptsImages]),
    },
  });
}

interface PiPromptTurnInput {
  surface: AgentSurface;
  projectIdentity?: string;
  systemPrompt: string;
  text: string;
  images?: Array<{
    data: string;
    mimeType: string;
    applicationMediaId?: string;
    applicationMediaKind?: 'image' | 'video';
  }>;
  signal: AbortSignal;
  /** Additive T7 hook: invoked with each streamed text delta; existing callers are unaffected. */
  onTextDelta?: (delta: string) => void;
  onActivity?: (activity: PiAgentActivity) => void;
  /** Prevent a prepared turn from being submitted after its application context changed. */
  isCurrent?: () => boolean;
}

interface PiPromptTurnResult {
  text: string;
  stopReason?: string;
  truncated: boolean;
}

function gatewaySelection(selection: AgentSelection): AgentSelection {
  const { thinkingLevel, ...rest } = selection;
  return thinkingLevel == null ? rest : { ...rest, thinkingLevel };
}

function sessionScopeKey(
  surface: AgentSurface,
  projectIdentity: string | null | undefined,
  selection: AgentSelection | null | undefined,
): string {
  return JSON.stringify([
    surface,
    projectIdentity ?? null,
    selection?.harnessId ?? null,
    selection?.provider ?? null,
    selection?.modelId ?? null,
    selection?.thinkingLevel ?? null,
  ]);
}

/** Stable surface/project/model key shared by visible histories and Pi sessions. */
export function getAgentSessionScopeKey(surface: AgentSurface, projectIdentity?: string | null): string {
  const project = surface !== 'console'
    ? undefined
    : projectIdentity === undefined ? gatewaySnapshot.projectIdentity : projectIdentity;
  return sessionScopeKey(surface, project, settingsSnapshot.record?.selection);
}

function promptSessionKey(
  surface: AgentSurface,
  projectIdentity: string | undefined,
  selection: AgentSelection,
): string {
  return sessionScopeKey(surface, projectIdentity, selection);
}

async function parseGatewayJson<T>(response: Response, action: string): Promise<T> {
  const value = await response.json().catch(() => null) as {
    error?: { message?: string };
    detail?: string;
  } | null;
  if (!response.ok) {
    const message = value?.error?.message || value?.detail;
    throw new Error(message || `${action} failed with HTTP ${response.status}.`);
  }
  if (!value) throw new Error(`${action} returned an invalid response.`);
  return value as T;
}

export interface CodexLoginSnapshot {
  state: 'idle' | 'starting' | 'awaiting_login' | 'success' | 'failed' | 'cancelled';
  authUrl?: string;
}

function parseCodexLoginSnapshot(value: unknown): CodexLoginSnapshot {
  const invalid = () => new Error('Codex sign-in returned an invalid response.');
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalid();
  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload);
  const states = ['idle', 'starting', 'awaiting_login', 'success', 'failed', 'cancelled'];
  if (!keys.includes('state') || keys.some(key => key !== 'state' && key !== 'authUrl')
    || typeof payload.state !== 'string' || !states.includes(payload.state)) throw invalid();
  if (payload.state === 'awaiting_login') {
    if (keys.length !== 2 || typeof payload.authUrl !== 'string' || payload.authUrl.length > 8192
      || payload.authUrl.includes('\0') || payload.authUrl.includes('#')) throw invalid();
    try {
      const url = new URL(payload.authUrl);
      const authority = /^https:\/\/([^/?#]*)/i.exec(payload.authUrl)?.[1];
      if (url.origin !== 'https://auth.openai.com' || url.username || url.password || url.hash
        || url.port || !authority || authority.includes('@')) throw invalid();
    } catch {
      throw invalid();
    }
    return { state: 'awaiting_login', authUrl: payload.authUrl };
  }
  if (keys.length !== 1) throw invalid();
  return { state: payload.state as CodexLoginSnapshot['state'] };
}

async function requestCodexLogin(method: 'GET' | 'POST' | 'DELETE'): Promise<CodexLoginSnapshot> {
  const origin = gatewayOrigin;
  const credential = connectionCredential;
  const revision = gatewayRevision;
  if (!origin || !credential || credentialExpiresAt <= Date.now() || gatewaySnapshot.status === 'disconnected') {
    throw new Error('The local agent gateway connection is unavailable. Reopen the launcher link to pair again.');
  }
  const assertCurrent = () => {
    if (revision !== gatewayRevision || credential !== connectionCredential || credentialExpiresAt <= Date.now()) {
      throw new Error('The local agent gateway connection changed during Codex sign-in.');
    }
  };
  const response = await fetch(`${origin}/harnesses/codex/login`, {
    method,
    headers: { Authorization: `Bearer ${credential}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify({}) } : {}),
    cache: 'no-store',
    redirect: 'error',
    signal: requestSignal(),
  });
  assertCurrent();
  let value: unknown;
  try { value = await parseGatewayJson<unknown>(response, 'Codex sign-in'); }
  finally { assertCurrent(); }
  return parseCodexLoginSnapshot(value);
}

export function startCodexLogin(): Promise<CodexLoginSnapshot> { return requestCodexLogin('POST'); }
export function getCodexLogin(): Promise<CodexLoginSnapshot> { return requestCodexLogin('GET'); }
export function cancelCodexLogin(): Promise<CodexLoginSnapshot> { return requestCodexLogin('DELETE'); }

/** The persisted Pi session the next turn on this surface would resume, or null when a fresh session would open. */
export function getCurrentPiSessionRef(surface: AgentSurface, projectIdentity?: string): AgentSessionRef | null {
  const settings = settingsSnapshot;
  const record = settings.record;
  if (settings.loading || settings.error || !record
    || record.migrationState !== 'harness_configured' || !record.selection
    || (record.selection.harnessId !== 'pi' && record.selection.harnessId !== 'codex')) return null;
  const project = surface !== 'console' ? undefined : projectIdentity ?? gatewaySnapshot.projectIdentity;
  return promptSessions.get(promptSessionKey(surface, project, gatewaySelection(record.selection))) ?? null;
}

export async function resetAgentSession(surface: AgentSurface, projectIdentity?: string): Promise<void> {
  const selection = settingsSnapshot.record?.selection;
  if (!selection) return;
  const project = surface === 'console' ? projectIdentity ?? gatewaySnapshot.projectIdentity : undefined;
  const key = promptSessionKey(surface, project, gatewaySelection(selection));
  const ref = promptSessions.get(key);
  if (!ref) return;
  const credential = connectionCredential;
  const origin = gatewayOrigin;
  if (!credential || !origin || credentialExpiresAt <= Date.now()) throw new Error('Pair the agent gateway before starting a new conversation.');
  const response = await fetch(`${origin}/sessions/${encodeURIComponent(ref.sessionId)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${credential}` }, cache: 'no-store', redirect: 'error', signal: requestSignal(),
  });
  await parseGatewayJson(response, 'Starting a new conversation');
  if (promptSessions.get(key) === ref) promptSessions.delete(key);
  publishGateway({ ...gatewaySnapshot, sessions: gatewaySnapshot.sessions.filter(session => session.sessionId !== ref.sessionId) });
}

async function openPromptSession(
  selection: AgentSelection,
  surface: AgentSurface,
  projectIdentity: string | undefined,
  systemPrompt: string,
  signal: AbortSignal,
  isCurrent?: () => boolean,
): Promise<AgentSessionRef> {
  const origin = gatewayOrigin;
  const credential = connectionCredential;
  if (!origin || !credential || credentialExpiresAt <= Date.now()) {
    throw new Error('The local agent gateway connection expired. Reopen the launcher link to pair again.');
  }
  const sessionKey = promptSessionKey(surface, projectIdentity, selection);
  const existing = promptSessions.get(sessionKey);
  if (isCurrent && !isCurrent()) throw new Error('The chat context changed before the agent session could open.');
  const body = {
    selection: gatewaySelection(selection),
    surface,
    ...(projectIdentity === undefined ? {} : { projectIdentity }),
    reviewedContext: [{ id: 'cinematic-guidance', content: systemPrompt }],
    ...(existing ? { session: existing } : {}),
  };
  const route = existing ? '/sessions/resume' : '/sessions';
  const response = await fetch(`${origin}${route}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    redirect: 'error',
    signal: requestSignal(signal),
  });
  const result = await parseGatewayJson<{ session?: unknown; applicationToolsAvailable?: unknown }>(response, 'Agent session opening');
  if (!isAgentSessionRef(result.session)
    || result.session.surface !== surface
    || result.session.harnessId !== selection.harnessId
    || result.session.projectIdentity !== projectIdentity) {
    throw new Error('The local gateway returned a session outside the selected project.');
  }
  const applicationToolsExpected = surface === 'console' || surface === 'workspace';
  if (result.applicationToolsAvailable !== applicationToolsExpected) {
    throw new Error(applicationToolsExpected
      ? 'The agent gateway did not confirm registration of the application tools; no turn was sent.'
      : 'Prompt sessions must not receive application tools; no turn was sent.');
  }
  promptSessions.set(sessionKey, result.session);
  return result.session;
}

function parsePiEventStream(
  response: Response,
  signal: AbortSignal,
  onTextDelta?: (delta: string) => void,
  onActivity?: (activity: PiAgentActivity) => void,
): Promise<PiPromptTurnResult> {
  if (!response.body) throw new Error('The local gateway returned no event stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = '';
  let dataLines: string[] = [];
  let text = '';
  const turnState: { settled: { aborted: boolean; stopReason?: string; truncated: boolean } | null } = { settled: null };

  const dispatch = () => {
    if (dataLines.length === 0) {
      eventName = '';
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(dataLines.join('\n'));
    } catch {
      throw new Error('The local gateway returned a malformed event.');
    }
    const value = payload as Record<string, unknown>;
    if (eventName === 'text_delta') {
      if (turnState.settled || typeof value.delta !== 'string') throw new Error('The local gateway returned an invalid text event.');
      text += value.delta;
      onTextDelta?.(value.delta);
    } else if (eventName === 'agent_activity') {
      if (turnState.settled || value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('The local gateway returned an invalid activity event.');
      }
      const activity = value as Record<string, unknown>;
      const keys = Object.keys(activity);
      let parsed: PiAgentActivity;
      if (activity.activityType === 'thinking_delta'
        && keys.every(key => ['activityType', 'delta'].includes(key))
        && typeof activity.delta === 'string' && activity.delta.length <= 8000) {
        parsed = { activityType: 'thinking_delta', delta: activity.delta };
      } else if (activity.activityType === 'tool_start'
        && keys.every(key => ['activityType', 'toolCallId', 'toolName', 'summary'].includes(key))
        && typeof activity.toolCallId === 'string' && activity.toolCallId.length <= 256
        && typeof activity.toolName === 'string' && activity.toolName.length <= 128
        && (activity.summary === undefined || typeof activity.summary === 'string' && activity.summary.length <= 8000)) {
        parsed = {
          activityType: 'tool_start',
          toolCallId: activity.toolCallId,
          toolName: activity.toolName,
          ...(typeof activity.summary === 'string' ? { summary: activity.summary } : {}),
        };
      } else if (activity.activityType === 'tool_end'
        && keys.every(key => ['activityType', 'toolCallId', 'toolName', 'summary', 'isError'].includes(key))
        && typeof activity.toolCallId === 'string' && activity.toolCallId.length <= 256
        && typeof activity.toolName === 'string' && activity.toolName.length <= 128
        && (activity.summary === undefined || typeof activity.summary === 'string' && activity.summary.length <= 8000)
        && typeof activity.isError === 'boolean') {
        parsed = {
          activityType: 'tool_end',
          toolCallId: activity.toolCallId,
          toolName: activity.toolName,
          ...(typeof activity.summary === 'string' ? { summary: activity.summary } : {}),
          isError: activity.isError,
        };
      } else {
        throw new Error('The local gateway returned an invalid activity event.');
      }
      onActivity?.(parsed);
    } else if (eventName === 'failure') {
      const failure = value.error as { message?: unknown } | undefined;
      throw new Error(typeof failure?.message === 'string' ? failure.message : 'The agent could not complete this prompt.');
    } else if (eventName === 'turn_settled') {
      if (turnState.settled || typeof value.aborted !== 'boolean'
        || (value.stopReason !== undefined && typeof value.stopReason !== 'string')
        || (value.truncated !== undefined && typeof value.truncated !== 'boolean')) {
        throw new Error('The local gateway returned invalid turn settlement metadata.');
      }
      turnState.settled = {
        aborted: value.aborted,
        ...(typeof value.stopReason === 'string' ? { stopReason: value.stopReason } : {}),
        truncated: value.truncated === true,
      };
    }
    eventName = '';
    dataLines = [];
  };

  const line = (value: string) => {
    if (value === '') {
      dispatch();
      return;
    }
    if (value.startsWith(':')) return;
    const colon = value.indexOf(':');
    const field = colon < 0 ? value : value.slice(0, colon);
    const content = colon < 0 ? '' : value.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') eventName = content;
    else if (field === 'data') dataLines.push(content);
  };

  return (async () => {
    try {
      while (true) {
        if (signal.aborted) throw new DOMException('Prompt enhancement cancelled.', 'AbortError');
        const { value, done } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const rawLine of lines) line(rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine);
        if (done) {
          if (buffer) line(buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer);
          dispatch();
          break;
        }
      }
      if (!turnState.settled) throw new Error('The agent closed the event stream before settling the turn.');
      if (turnState.settled.aborted) throw new DOMException('Prompt enhancement cancelled.', 'AbortError');
      return { text, stopReason: turnState.settled.stopReason, truncated: turnState.settled.truncated || turnState.settled.stopReason === 'length' };
    } finally {
      try { await reader.cancel(); } catch { /* The connection may already be closed. */ }
    }
  })();
}

/** Open or resume the selected Pi session, then stream one prompt without retrying it. */
export async function runPiPromptTurn(input: PiPromptTurnInput): Promise<PiPromptTurnResult> {
  input.signal.throwIfAborted();
  const settings = settingsSnapshot;
  const record = settings.record;
  if (settings.loading) throw new Error('Agent settings are still loading. Retry after they finish loading.');
  if (settings.error || !record) throw new Error(settings.error || 'Agent settings are unavailable.');
  if (record.migrationState !== 'harness_configured' || !record.selection) {
    throw new Error('Select an authenticated agent model in Agent Settings before using harness enhancement.');
  }
  if (record.selection.harnessId !== 'pi' && record.selection.harnessId !== 'codex') throw new Error('This agent harness is not available for prompt enhancement.');
  const harnessLabel = record.selection.harnessId === 'codex' ? 'Codex' : 'Pi';
  const selection = gatewaySelection(record.selection);
  const gateway = gatewaySnapshot;
  if (gateway.status !== 'ready' || gateway.availability?.state !== 'ready'
    || gateway.modelsHarnessId !== selection.harnessId || gateway.modelsLoading || gateway.modelError) {
    throw new Error(gateway.modelError || gateway.availability?.message || gateway.message || `The ${harnessLabel} model inventory is unavailable. Refresh it in Agent Settings.`);
  }
  const projectIdentity = input.surface !== 'console' ? undefined : input.projectIdentity ?? gateway.projectIdentity;
  if (input.surface === 'console' && projectIdentity !== gateway.projectIdentity) {
    throw new Error('The local agent gateway is bound to a different project. Switch projects to update the session binding.');
  }
  const model = gateway.models.find(item => item.provider === selection.provider && item.modelId === selection.modelId);
  if (!model) throw new Error(`The saved ${harnessLabel} model is not in the authenticated inventory. Its selection was preserved.`);
  if (selection.thinkingLevel != null && !model.thinkingLevels.includes(selection.thinkingLevel)) throw new Error(`The selected ${harnessLabel} model (${model.provider}:${model.modelId}) does not support ${selection.thinkingLevel} thinking.`);
  const images = input.images;
  if (images && images.length > 0 && !model.acceptsImages) {
    throw new Error(`The selected ${harnessLabel} model (${model.provider}:${model.modelId}) does not accept image inputs.`);
  }
  if (images) {
    if (images.length > 4) throw new Error(`${harnessLabel} accepts at most 4 reference images per enhancement. Remove images; none were dropped.`);
    const byteSizes = images.map(image => Math.floor(image.data.length * 3 / 4)
      - (image.data.endsWith('==') ? 2 : image.data.endsWith('=') ? 1 : 0));
    if (byteSizes.some(size => size > 6 * 1024 * 1024)) {
      throw new Error(`Each ${harnessLabel} reference image must be 6 MiB or smaller. Remove or replace the larger image; it was not resized.`);
    }
    if (byteSizes.reduce((total, size) => total + size, 0) > 8 * 1024 * 1024) {
      throw new Error(`${harnessLabel} accepts at most 8 MiB of combined reference image data. Remove images; none were dropped.`);
    }
  }
  const promptBytes = new TextEncoder().encode(input.text).byteLength;
  if (!input.text.trim() || promptBytes > 64 * 1024) {
    throw new Error(`The prepared ${harnessLabel} prompt must contain text and fit within 64 KiB.`);
  }
  const systemPromptBytes = new TextEncoder().encode(input.systemPrompt).byteLength;
  if (!systemPromptBytes || systemPromptBytes > 64 * 1024) {
    throw new Error(`Reviewed cinematic guidance exceeds the ${harnessLabel} gateway limit.`);
  }

  const session = await openPromptSession(selection, input.surface, projectIdentity, input.systemPrompt, input.signal, input.isCurrent);
  input.signal.throwIfAborted();
  if (input.isCurrent && !input.isCurrent()) throw new Error('The chat context changed before the agent turn could start.');
  const origin = gatewayOrigin;
  const credential = connectionCredential;
  if (!origin || !credential || credentialExpiresAt <= Date.now()) {
    throw new Error('The local agent gateway connection expired before the turn began.');
  }
  const controller = new AbortController();
  const relayAbort = () => controller.abort(input.signal.reason);
  input.signal.addEventListener('abort', relayAbort, { once: true });
  const connectionTimer = setTimeout(() => controller.abort(new DOMException('Gateway connection timed out.', 'TimeoutError')), 10_000);
  let requestSettled = false;
  try {
    const response = await fetch(`${origin}/sessions/${encodeURIComponent(session.sessionId)}/turn`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session,
        text: input.text,
        ...(images === undefined ? {} : { images: images.map(image => ({
          data: image.data,
          mimeType: image.mimeType,
          ...(image.applicationMediaId === undefined ? {} : {
            applicationMediaId: image.applicationMediaId,
            applicationMediaKind: image.applicationMediaKind,
          }),
        })) }),
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    clearTimeout(connectionTimer);
    if (!response.ok) {
      await parseGatewayJson(response, `${harnessLabel} prompt turn`);
      throw new Error(`${harnessLabel} prompt turn failed with HTTP ${response.status}.`);
    }
    const result = await parsePiEventStream(response, input.signal, input.onTextDelta, input.onActivity);
    requestSettled = true;
    return result;
  } catch (error) {
    if (input.signal.aborted) {
      void fetch(`${origin}/sessions/${encodeURIComponent(session.sessionId)}/abort`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${credential}` },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(2_000),
      }).catch(() => undefined);
      throw new DOMException('Prompt enhancement cancelled.', 'AbortError');
    }
    throw error;
  } finally {
    clearTimeout(connectionTimer);
    input.signal.removeEventListener('abort', relayAbort);
    if (!requestSettled) controller.abort();
  }
}

export function closeAgentGateway(): void {
  gatewayRevision += 1;
  modelRequestRevision += 1;
  connectionAbort?.abort();
  modelAbort?.abort();
  connectionAbort = null;
  modelAbort = null;
  gatewayOrigin = null;
  connectionCredential = null;
  credentialExpiresAt = 0;
  initialized = false;
  promptSessions.clear();
  publishGateway({ ...initialGatewaySnapshot, message: 'The local Pi gateway connection is closed. Restart the launcher to pair again.' });
}

/** Keep one authenticated SSE command stream open for the currently paired Storyboard tab. */
export async function connectAgentApplicationBridge(
  projectIdentity: string,
  handleCommand: (message: ApplicationBridgeMessage) => Promise<ApplicationResult>,
  signal: AbortSignal,
): Promise<void> {
  return connectApplicationBridge(projectIdentity, message => handleCommand(message as ApplicationBridgeMessage), signal, false);
}

export async function connectWorkspaceApplicationBridge(
  handleCommand: (message: WorkspaceCommandMessage, signal: AbortSignal) => Promise<WorkspaceActionResult>,
  signal: AbortSignal,
): Promise<void> {
  return connectApplicationBridge(undefined, (message, commandSignal) => handleCommand(message as WorkspaceCommandMessage, commandSignal), signal, true);
}

async function connectApplicationBridge(
  projectIdentity: string | undefined,
  handleCommand: (message: ApplicationBridgeMessage | WorkspaceCommandMessage, signal: AbortSignal) => Promise<ApplicationResult>,
  signal: AbortSignal,
  workspace: boolean,
): Promise<void> {
  const origin = gatewayOrigin;
  const credential = connectionCredential;
  const bridgeId = gatewaySnapshot.bridgeId;
  if (!origin || !credential || !bridgeId || credentialExpiresAt <= Date.now()
    || gatewaySnapshot.status !== 'ready' || !workspace && gatewaySnapshot.projectIdentity !== projectIdentity) {
    throw new Error(workspace ? 'The authenticated workspace connection is unavailable.' : 'The paired application bridge is not bound to the active project.');
  }
  const response = await fetch(`${origin}/${workspace ? 'workspace-bridge' : 'application-bridge'}/commands`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(workspace ? {} : { projectIdentity }),
    cache: 'no-store',
    redirect: 'error',
    signal,
  });
  if (!response.ok) {
    await parseGatewayJson(response, 'Application bridge connection');
    throw new Error('The local application bridge could not connect.');
  }
  if (!response.body) throw new Error('The local application bridge returned no command stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const commandTasks = new Set<Promise<void>>();
  const commandControllers = new Map<string, { sessionId: string; controller: AbortController }>();
  let buffer = '';
  const dispatchBlock = (block: string) => {
    let eventName = '';
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length === 0) return;
    if (eventName === 'application_cancel') {
      try {
        const cancellation = JSON.parse(data.join('\n')) as { commandId?: unknown; sessionId?: unknown };
        if (typeof cancellation.commandId !== 'string' || typeof cancellation.sessionId !== 'string') return;
        const active = commandControllers.get(cancellation.commandId);
        if (active?.sessionId === cancellation.sessionId) active.controller.abort();
      } catch { /* Invalid cancellation frames cannot target a command. */ }
      return;
    }
    if (eventName !== 'application_command') return;
    let message: ApplicationBridgeMessage | WorkspaceCommandMessage;
    try {
      const parsed = JSON.parse(data.join('\n')) as Partial<ApplicationBridgeMessage>;
      if (typeof parsed.sessionId !== 'string' || !parsed.command
        || (workspace ? 'projectIdentity' in parsed.command : parsed.command.projectIdentity !== projectIdentity)) return;
      message = parsed as ApplicationBridgeMessage | WorkspaceCommandMessage;
    } catch {
      return;
    }
    if (commandControllers.has(message.command.commandId)) return;
    const commandController = new AbortController();
    commandControllers.set(message.command.commandId, { sessionId: message.sessionId, controller: commandController });
    const commandSignal = AbortSignal.any([signal, commandController.signal]);
    const task = (async () => {
      let result: ApplicationResult;
      try {
        result = await handleCommand(message, commandSignal);
      } catch (error) {
        result = {
          ok: false,
          commandId: message.command.commandId,
          action: message.command.action,
          ...(message.command.expectedConsoleBindingId ? { consoleBindingId: message.command.expectedConsoleBindingId } : {}),
          error: { code: 'application_action_failed', message: error instanceof Error ? error.message : 'The application action failed.', retryable: false },
        };
      }
      if (commandSignal.aborted || !connectionCredential || credentialExpiresAt <= Date.now() || bridgeId !== gatewaySnapshot.bridgeId
        || !workspace && gatewaySnapshot.projectIdentity !== projectIdentity) return;
      if (result.commandId !== message.command.commandId || result.action !== message.command.action) return;
      const resultResponse = await fetch(`${origin}/${workspace ? 'workspace-bridge' : 'application-bridge'}/results`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${connectionCredential}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(workspace ? {} : { projectIdentity }), sessionId: message.sessionId, result }),
        cache: 'no-store',
        redirect: 'error',
        signal: commandSignal,
      });
      if (!resultResponse.ok) await parseGatewayJson(resultResponse, 'Application action result');
    })();
    commandTasks.add(task);
    const finish = () => {
      commandTasks.delete(task);
      if (commandControllers.get(message.command.commandId)?.controller === commandController) commandControllers.delete(message.command.commandId);
    };
    void task.then(finish, finish);
  };

  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separator = buffer.search(/\r?\n\r?\n/);
      while (separator >= 0) {
        const block = buffer.slice(0, separator);
        const delimiter = buffer.slice(separator).match(/^\r?\n\r?\n/)?.[0] || '\n\n';
        buffer = buffer.slice(separator + delimiter.length);
        dispatchBlock(block);
        separator = buffer.search(/\r?\n\r?\n/);
      }
    }
  } finally {
    for (const active of commandControllers.values()) active.controller.abort();
    await reader.cancel().catch(() => undefined);
    await Promise.allSettled([...commandTasks]);
  }
}
