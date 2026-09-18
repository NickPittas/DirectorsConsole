import { useState, useEffect } from 'react';
import { CinemaPromptEngineering } from './CinemaPromptEngineering';
import { useCinemaStore } from './store';
import { StoryboardUI } from './StoryboardUI';
import { GalleryUI } from './gallery';
import { projectManager } from './storyboard/services/project-manager';
import {
  installSessionFlushHandlers,
  readRecoverableActiveDraft,
  restoreSessionDraft,
  sessionDraftController,
  type RecoveryStatus,
  type SessionDraftData,
  type StoryboardDraftState,
} from './storyboard/services/session-recovery';
import { clearActiveDraftPointer, deleteDraft } from './storyboard/services/session-draft-storage';
import OAuthCallback from '@/components/OAuthCallback';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './App.css';

// Check if this is an OAuth callback
const isOAuthCallback = window.location.pathname.includes('/oauth/callback') || 
                         window.location.search.includes('code=') ||
                         window.location.search.includes('error=');

type TabId = 'cinema' | 'storyboard' | 'gallery';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

function RecoveryGate({ message, onRetry, onStartNew, onDiscard }: {
  message: string;
  onRetry: () => void;
  onStartNew: () => void;
  onDiscard?: () => void;
}) {
  return (
    <main style={{ padding: 32, maxWidth: 720, margin: '10vh auto', color: 'inherit' }}>
      <h1>Session recovery needs attention</h1>
      <p>{message}</p>
      <p>Your previous snapshot was kept. Retry storage, explicitly discard it, or start a new session.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onRetry}>Retry</button>
        {onDiscard && <button onClick={onDiscard}>Discard snapshot</button>}
        <button onClick={onStartNew}>Start new</button>
      </div>
    </main>
  );
}

const TABS: Tab[] = [
  { id: 'cinema', label: 'Cinema Prompt Engineering', icon: '🎬' },
  { id: 'storyboard', label: 'Storyboard', icon: '📋' },
  { id: 'gallery', label: 'Gallery', icon: '🖼️' },
];

function DirectorsConsole({ initialDraft, initialTab, recoveryStatus }: {
  initialDraft?: SessionDraftData;
  initialTab: TabId;
  recoveryStatus: RecoveryStatus;
}) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [galleryProject, setGalleryProject] = useState(() => projectManager.getProject());
  const [projectRevision, setProjectRevision] = useState(0);
  const [isProjectLoading, setIsProjectLoading] = useState(false);

  useEffect(() => projectManager.subscribe((settings) => {
    setGalleryProject(settings);
    setProjectRevision((revision) => revision + 1);
  }), []);

  useEffect(() => {
    sessionDraftController.update({ app: { activeTab } });
  }, [activeTab]);

  return (
    <div className="directors-console">
      {/* Tab Navigation */}
      <nav className="directors-console__nav">
        <div className="directors-console__logo">
          <span className="logo-icon">🎬</span>
          <span className="logo-text">Director's Console</span>
        </div>
        
        <div className="directors-console__tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Tab Content - All components stay mounted to preserve state */}
      <main className="directors-console__content">
        <div style={{ display: activeTab === 'cinema' ? 'contents' : 'none' }}>
          <ErrorBoundary>
            <CinemaPromptEngineering />
          </ErrorBoundary>
        </div>
        <div style={{ display: activeTab === 'storyboard' ? 'contents' : 'none' }}>
          <ErrorBoundary>
            <StoryboardUI
              initialSession={initialDraft?.storyboard as StoryboardDraftState | undefined}
              onProjectLoadingChange={setIsProjectLoading}
            />
          </ErrorBoundary>
        </div>
        <div style={{ display: activeTab === 'gallery' ? 'contents' : 'none' }}>
          <ErrorBoundary>
            <GalleryUI
              orchestratorUrl={galleryProject.orchestratorUrl}
              projectPath={galleryProject.path}
              projectRevision={projectRevision}
              isProjectLoading={isProjectLoading}
              isActive={activeTab === 'gallery'}
            />
          </ErrorBoundary>
        </div>
      </main>
      {(recoveryStatus.state === 'saving' || recoveryStatus.state === 'failed') && (
        <div role="status" style={{ position: 'fixed', bottom: 12, left: 12, zIndex: 1000 }}>
          {recoveryStatus.state === 'saving' ? 'Autosaving…' : recoveryStatus.message}
        </div>
      )}
    </div>
  );
}

function blankSessionData(): SessionDraftData {
  const cinema = useCinemaStore.getState();
  return {
    app: { activeTab: 'cinema' },
    project: { settings: { ...projectManager.getProject() } },
    storyboard: {
      activeTab: 'image-generation',
      activeSubTab: 'text2img',
      panels: [],
      selectedPanelId: null,
      canvasZoom: 1,
      canvasPan: { x: 0, y: 0 },
      leftPanelWidth: 250,
      rightPanelWidth: 200,
      selectedWorkflowId: null,
      parameterValues: {},
      cameraAngles: {},
      globalPromptOverride: '',
      useGlobalPrompt: false,
    },
    cinema: {
      projectType: cinema.projectType,
      liveActionConfig: cinema.liveActionConfig,
      animationConfig: cinema.animationConfig,
      generatedPrompt: cinema.generatedPrompt,
      negativePrompt: cinema.negativePrompt,
      userPrompt: cinema.userPrompt,
      enhancedPrompt: cinema.enhancedPrompt,
      cpePromptForStoryboard: cinema.cpePromptForStoryboard,
      targetModel: cinema.targetModel,
      selectedLiveActionPreset: cinema.selectedLiveActionPreset,
      selectedAnimationPreset: cinema.selectedAnimationPreset,
    },
  };
}

// Wrapper component that handles routing between main app and OAuth callback.
// Children are not mounted until the active snapshot has been validated.
function App() {
  const [hydration, setHydration] = useState<{
    state: 'loading' | 'ready' | 'error';
    draft?: SessionDraftData;
    tab: TabId;
    message?: string;
    recordIdentity?: string;
  }>({ state: 'loading', tab: 'cinema' });
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>({ state: 'idle' });

  const hydrate = async (startNew = false): Promise<void> => {
    setHydration(current => ({ ...current, state: 'loading', message: undefined }));
    try {
      const record = startNew ? null : await readRecoverableActiveDraft();
      let draft: SessionDraftData | undefined;
      let identity = projectManager.getSessionIdentity();
      if (startNew) {
        await clearActiveDraftPointer();
        projectManager.rotateUnsavedIdentity();
        projectManager.setProject({
          name: 'Untitled Project',
          path: '',
          projectFilePath: undefined,
          created: new Date(),
          lastModified: new Date(),
        });
        identity = projectManager.getSessionIdentity();
      }
      if (record) {
        draft = await restoreSessionDraft(record.data);
        const settings = draft.project.settings;
        projectManager.restoreFromSession(settings);
        identity = record.identity;
      }

      const initial = draft || blankSessionData();
      // Hydrate the CPE store before arming the draft controller so restore
      // writes cannot be mistaken for user edits.
      if (draft) useCinemaStore.getState().hydrateSession(draft.cinema);
      sessionDraftController.hydrate(identity, initial);
      setHydration({
        state: 'ready',
        draft,
        tab: draft?.app.activeTab || 'cinema',
        recordIdentity: record?.identity,
      });
    } catch (error) {
      const recordIdentity = error && typeof error === 'object' && 'activeIdentity' in error
        && typeof error.activeIdentity === 'string' ? error.activeIdentity : undefined;
      setHydration({
        state: 'error',
        tab: 'cinema',
        recordIdentity,
        message: 'The saved session could not be validated. Retry storage or explicitly start a new session.',
      });
    }
  };

  useEffect(() => {
    if (isOAuthCallback) return;
    void hydrate();
    return installSessionFlushHandlers();
  }, []);

  useEffect(() => sessionDraftController.subscribe(setRecoveryStatus), []);

  if (isOAuthCallback) return <OAuthCallback />;
  if (hydration.state === 'loading') {
    return <main style={{ padding: 32 }}>Recovering session…</main>;
  }
  if (hydration.state === 'error') {
    const discard = () => {
      const target = hydration.recordIdentity ? `snapshot ${hydration.recordIdentity}` : 'the malformed active pointer';
      if (window.confirm(`Discard ${target}? This removes only the active recovery target.`)) {
        const discardTarget = hydration.recordIdentity
          ? deleteDraft(hydration.recordIdentity)
          : clearActiveDraftPointer();
        void discardTarget
          .then(() => hydrate(true))
          .catch(() => setHydration({
            state: 'error',
            tab: 'cinema',
            recordIdentity: hydration.recordIdentity,
            message: 'The recovery target could not be discarded. Retry storage or start a new session.',
          }));
      }
    };
    return <RecoveryGate
      message={hydration.message || 'Session recovery failed.'}
      onRetry={() => void hydrate()}
      onStartNew={() => {
        if (window.confirm('Start a new session without deleting the saved snapshot?')) void hydrate(true);
      }}
      onDiscard={discard}
    />;
  }

  return (
    <ErrorBoundary>
      <DirectorsConsole
        initialDraft={hydration.draft}
        initialTab={hydration.tab}
        recoveryStatus={recoveryStatus}
      />
    </ErrorBoundary>
  );
}

export default App;
