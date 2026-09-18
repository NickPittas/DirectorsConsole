import {
  readActiveDraft,
  clearActiveDraftPointer,
  saveDraft,
  SessionDraftStorageError,
  type VersionedDraftRecord,
} from './session-draft-storage';

export type RecoveryTab = 'cinema' | 'storyboard' | 'gallery';

export interface StoryboardDraftState {
  activeTab: string;
  activeSubTab: string;
  panels: unknown[];
  selectedPanelId: number | null;
  canvasZoom: number;
  canvasPan: { x: number; y: number };
  leftPanelWidth: number;
  rightPanelWidth: number;
  selectedWorkflowId: string | null;
  selectedBackendIds?: string[];
  comfyUrl?: string;
  parameterValues: Record<string, unknown>;
  cameraAngles: Record<string, unknown>;
  globalPromptOverride: string;
  useGlobalPrompt: boolean;
}

export interface CinemaDraftState {
  projectType: string;
  liveActionConfig: unknown;
  animationConfig: unknown;
  generatedPrompt: string;
  negativePrompt: string | null;
  /** User-entered and AI-enhanced CPE text is work state, not provider configuration. */
  userPrompt?: string;
  enhancedPrompt?: string;
  cpePromptForStoryboard?: string | null;
  targetModel: string;
  selectedLiveActionPreset: unknown;
  selectedAnimationPreset: unknown;
}

export interface SessionDraftData {
  app: { activeTab: RecoveryTab };
  project: { settings: Record<string, unknown> };
  storyboard: StoryboardDraftState;
  cinema: CinemaDraftState;
}

export interface RecoveryStatus {
  state: 'idle' | 'saving' | 'saved' | 'failed';
  message?: string;
}

type StatusListener = (status: RecoveryStatus) => void;

const BLOB_MARKER = '__directors_console_blob__';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined'
    && (value instanceof Blob || Object.prototype.toString.call(value) === '[object Blob]');
}

function isRecoveryTab(value: unknown): value is RecoveryTab {
  return value === 'cinema' || value === 'storyboard' || value === 'gallery';
}

export function isSessionDraftData(value: unknown): value is SessionDraftData {
  if (!isRecord(value) || !isRecord(value.app) || !isRecoveryTab(value.app.activeTab)) return false;
  if (!isRecord(value.project) || !isRecord(value.project.settings)) return false;
  if (!isRecord(value.storyboard) || !Array.isArray(value.storyboard.panels)) return false;
  if (!isRecord(value.cinema)) return false;
  return typeof value.storyboard.activeTab === 'string'
    && typeof value.storyboard.activeSubTab === 'string'
    && isRecord(value.storyboard.parameterValues)
    && isRecord(value.storyboard.cameraAngles)
    && (value.storyboard.selectedBackendIds === undefined
      || (Array.isArray(value.storyboard.selectedBackendIds)
        && value.storyboard.selectedBackendIds.every(item => typeof item === 'string')))
    && (value.storyboard.comfyUrl === undefined || typeof value.storyboard.comfyUrl === 'string')
    && (value.storyboard.selectedPanelId === null || typeof value.storyboard.selectedPanelId === 'number')
    && typeof value.storyboard.canvasZoom === 'number'
    && typeof value.cinema.projectType === 'string'
    && isRecord(value.cinema.liveActionConfig)
    && isRecord(value.cinema.animationConfig)
    && typeof value.cinema.generatedPrompt === 'string'
    && (value.cinema.negativePrompt === null || typeof value.cinema.negativePrompt === 'string')
    && (value.cinema.userPrompt === undefined || typeof value.cinema.userPrompt === 'string')
    && (value.cinema.enhancedPrompt === undefined || typeof value.cinema.enhancedPrompt === 'string')
    && typeof value.cinema.targetModel === 'string';
}

export function recoverInterruptedPanels(panels: unknown[]): unknown[] {
  return panels.map(panel => {
    if (!isRecord(panel)) return panel;
    if (panel.status !== 'generating') return panel;
    return {
      ...panel,
      status: 'error',
      progress: 0,
      progressPhase: undefined,
      progressNodeName: undefined,
      progressNodesExecuted: 0,
      progressTotalNodes: 0,
      parallelJobs: undefined,
      batchSaveTriggered: undefined,
      errorMessage: 'Interrupted by refresh; not resubmitted automatically.',
    };
  });
}

async function materializeMedia(value: unknown): Promise<unknown> {
  if (isBlob(value)) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof Map || value instanceof Set || value instanceof ArrayBuffer) return value;
  if (typeof value === 'string') {
    if (!value.startsWith('blob:')) return value;
    // Only local blob URLs are eligible. Remote media is retained as a reference.
    const response = await fetch(value);
    if (!response.ok) throw new Error('a local preview could not be materialized');
    return { [BLOB_MARKER]: await response.blob() };
  }
  if (Array.isArray(value)) return Promise.all(value.map(materializeMedia));
  if (!isRecord(value)) return value;
  const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await materializeMedia(item)] as const));
  return Object.fromEntries(entries);
}

const restoredObjectUrls = new Set<string>();

async function restoreMedia(value: unknown): Promise<unknown> {
  if (isBlob(value)) {
    const url = URL.createObjectURL(value);
    restoredObjectUrls.add(url);
    return url;
  }
  if (value instanceof Date || value instanceof Map || value instanceof Set || value instanceof ArrayBuffer) return value;
  if (isRecord(value) && isBlob(value[BLOB_MARKER])) {
    const url = URL.createObjectURL(value[BLOB_MARKER] as Blob);
    restoredObjectUrls.add(url);
    return url;
  }
  if (Array.isArray(value)) return Promise.all(value.map(restoreMedia));
  if (!isRecord(value)) return value;
  const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await restoreMedia(item)] as const));
  return Object.fromEntries(entries);
}

export function cleanupRestoredMedia(): void {
  for (const url of restoredObjectUrls) URL.revokeObjectURL(url);
  restoredObjectUrls.clear();
}

export async function prepareSessionDraft(data: SessionDraftData): Promise<SessionDraftData> {
  return await materializeMedia(data) as SessionDraftData;
}

export async function restoreSessionDraft(data: SessionDraftData): Promise<SessionDraftData> {
  return await restoreMedia(data) as SessionDraftData;
}

function noActiveDraftError(error: unknown): boolean {
  return error instanceof SessionDraftStorageError
    && /active session draft pointer is missing while the store is not empty/i.test(error.message);
}

export async function readRecoverableActiveDraft(): Promise<VersionedDraftRecord<SessionDraftData> | null> {
  try {
    const record = await readActiveDraft<SessionDraftData>();
    if (record && !isSessionDraftData(record.data)) {
      const error = new SessionDraftStorageError('Stored session draft is corrupt: recovery payload is invalid.');
      error.activeIdentity = record.identity;
      throw error;
    }
    return record;
  } catch (error) {
    // Older adapter revisions reported an empty active pointer as an error when archived drafts existed.
    // Treat only that exact no-active condition as empty; corruption and I/O errors remain blocking.
    if (noActiveDraftError(error)) return null;
    throw error;
  }
}

export interface IdentityTransitionOptions {
  /** Explicit Discard & New/Start new skips the old payload write. */
  discard?: boolean;
}

export async function activateSessionIdentity(
  controller: Pick<SessionDraftController, 'transitionIdentity'>,
  identity: string,
  options: IdentityTransitionOptions = {},
): Promise<void> {
  await controller.transitionIdentity(identity, options);
  await clearActiveDraftPointer();
}

export class SessionDraftController {
  private identity: string | null = null;
  private data: SessionDraftData | null = null;
  private ready = false;
  private dirty = false;
  private revision = 0;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private status: RecoveryStatus = { state: 'idle' };
  private listeners = new Set<StatusListener>();

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  getStatus(): RecoveryStatus { return this.status; }
  getIdentity(): string | null { return this.identity; }
  hasPendingChanges(): boolean { return this.dirty || this.status.state === 'failed'; }
  clearFailure(): void {
    if (this.status.state === 'failed') this.setStatus({ state: 'idle' });
  }

  hydrate(identity: string, data: SessionDraftData | null): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.generation += 1;
    this.identity = identity;
    this.data = data;
    this.ready = true;
    this.dirty = false;
    this.revision += 1;
    this.setStatus({ state: data ? 'saved' : 'idle' });
  }

  /**
   * Change identities only after all writes for the old identity have settled.
   * Generation checks happen immediately before saveDraft so stale queued work
   * cannot activate an old pointer after the transition.
   */
  transitionIdentity(identity: string, options: IdentityTransitionOptions = {}): Promise<void> {
    if (!identity.trim()) return Promise.reject(new Error('Session identity must be non-empty.'));
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const oldIdentity = this.identity;
    const oldGeneration = this.generation;
    const transition = this.queue.then(async () => {
      if (identity === this.identity) return;

      if (!options.discard && this.dirty && this.data && oldIdentity) {
        // A save can overlap updates. Keep taking the latest revision until the
        // old identity is stable, so setIdentity never drops dirty work.
        while (this.identity === oldIdentity && this.dirty && this.data) {
          const revision = this.revision;
          const snapshot = this.data;
          const prepared = await prepareSessionDraft(snapshot);
          if (oldGeneration !== this.generation || oldIdentity !== this.identity) return;
          try {
            await saveDraft({ version: 1, identity: oldIdentity, updatedAt: Date.now(), data: prepared }, { activate: true });
          } catch (error) {
            if (oldGeneration === this.generation && oldIdentity === this.identity) {
              this.setStatus({ state: 'failed', message: 'Autosave unavailable — save manually.' });
            }
            throw error;
          }
          if (revision === this.revision && oldIdentity === this.identity) {
            this.dirty = false;
            this.setStatus({ state: 'saved' });
          }
        }
      }

      this.generation += 1;
      this.identity = identity;
      this.revision += 1;
      this.dirty = false;
      if (this.status.state === 'failed') this.setStatus({ state: 'idle' });
    });
    this.queue = transition.catch(() => undefined);
    return transition;
  }

  /** Compatibility entry point; callers that need ordering should await it. */
  setIdentity(identity: string): Promise<void> {
    return this.transitionIdentity(identity);
  }

  update(patch: Partial<SessionDraftData>): void {
    if (!this.ready || !this.data) return;
    this.data = { ...this.data, ...patch };
    this.revision += 1;
    this.dirty = true;
    this.schedule();
  }

  private setStatus(status: RecoveryStatus): void {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, 500);
  }

  flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.ready || !this.dirty || !this.data || !this.identity) return this.queue;
    const revision = this.revision;
    const identity = this.identity;
    const generation = this.generation;
    const snapshot = this.data;
    this.setStatus({ state: 'saving' });
    const write = this.queue.then(async () => {
      // This check is deliberately before materialization and saveDraft. A
      // stale queued task must never activate the previous identity.
      if (generation !== this.generation || identity !== this.identity) return;
      try {
        const prepared = await prepareSessionDraft(snapshot);
        if (generation !== this.generation || identity !== this.identity) return;
        await saveDraft({ version: 1, identity, updatedAt: Date.now(), data: prepared }, { activate: true });
        if (revision === this.revision && identity === this.identity && generation === this.generation) {
          this.dirty = false;
          this.setStatus({ state: 'saved' });
        }
      } catch {
        // The adapter keeps the prior transaction intact. Keep dirty state so a retry can succeed.
        if (revision === this.revision && identity === this.identity && generation === this.generation) {
          this.setStatus({ state: 'failed', message: 'Autosave unavailable — save manually.' });
        }
      }
    });
    this.queue = write.catch(() => undefined);
    return write;
  }
}

export const sessionDraftController = new SessionDraftController();

export function installSessionFlushHandlers(): () => void {
  const flush = () => { void sessionDraftController.flush(); };
  const warnBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!sessionDraftController.hasPendingChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', flush);
  window.addEventListener('beforeunload', warnBeforeUnload);
  return () => {
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', flush);
    window.removeEventListener('beforeunload', warnBeforeUnload);
    cleanupRestoredMedia();
  };
}
