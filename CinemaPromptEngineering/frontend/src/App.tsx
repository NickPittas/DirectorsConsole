import { useState, useEffect } from 'react';
import { CinemaPromptEngineering } from './CinemaPromptEngineering';
import { StoryboardUI } from './StoryboardUI';
import { GalleryUI } from './gallery';
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

  // Read project settings from Storyboard's saved state for Gallery.
  // Load eagerly (on mount) so the values are ready when the user clicks
  // the Gallery tab — avoids a wasted render cycle with empty props.
  const [galleryProjectPath, setGalleryProjectPath] = useState(() => {
    try {
      const saved = localStorage.getItem('storyboard_project_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.path || '';
      }
    } catch { /* ignore */ }
    return '';
  });
  const [galleryOrchestratorUrl, setGalleryOrchestratorUrl] = useState(() => {
    try {
      const saved = localStorage.getItem('storyboard_project_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.orchestratorUrl || '';
      }
    } catch { /* ignore */ }
    return '';
  });

  useEffect(() => {
    // Only poll for project setting changes while Gallery tab is active
    if (activeTab !== 'gallery') return;

    const loadProjectSettings = () => {
      try {
        const saved = localStorage.getItem('storyboard_project_settings');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.path) setGalleryProjectPath(parsed.path);
          if (parsed.orchestratorUrl) setGalleryOrchestratorUrl(parsed.orchestratorUrl);
        }
      } catch { /* ignore */ }
    };
    // No need to call immediately — initial values already read above
    const interval = setInterval(loadProjectSettings, 2000);
    return () => clearInterval(interval);
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
            <StoryboardUI />
          </ErrorBoundary>
        </div>
        <div style={{ display: activeTab === 'gallery' ? 'contents' : 'none' }}>
          <ErrorBoundary>
            <GalleryUI orchestratorUrl={galleryOrchestratorUrl} projectPath={galleryProjectPath} isActive={activeTab === 'gallery'} />
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
