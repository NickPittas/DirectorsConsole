import { useState, useEffect } from 'react';
import { CinemaPromptEngineering } from './CinemaPromptEngineering';
import { StoryboardUI } from './StoryboardUI';
import { GalleryUI } from './gallery';
import { projectManager } from './storyboard/services/project-manager';
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

const TABS: Tab[] = [
  { id: 'cinema', label: 'Cinema Prompt Engineering', icon: '🎬' },
  { id: 'storyboard', label: 'Storyboard', icon: '📋' },
  { id: 'gallery', label: 'Gallery', icon: '🖼️' },
];

function DirectorsConsole() {
  const [activeTab, setActiveTab] = useState<TabId>('cinema');
  const [galleryProject, setGalleryProject] = useState(() => projectManager.getProject());
  const [projectRevision, setProjectRevision] = useState(0);
  const [isProjectLoading, setIsProjectLoading] = useState(false);

  useEffect(() => projectManager.subscribe((settings) => {
    setGalleryProject(settings);
    setProjectRevision((revision) => revision + 1);
  }), []);

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
            <StoryboardUI onProjectLoadingChange={setIsProjectLoading} />
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
    </div>
  );
}

// Wrapper component that handles routing between main app and OAuth callback
function App() {
  // If this is an OAuth callback, render the callback handler
  if (isOAuthCallback) {
    return <OAuthCallback />;
  }
  
  // Otherwise, render the Director's Console wrapped in error boundary
  return (
    <ErrorBoundary>
      <DirectorsConsole />
    </ErrorBoundary>
  );
}

export default App;
