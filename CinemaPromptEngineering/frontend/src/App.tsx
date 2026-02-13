import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CinemaPromptEngineering } from './CinemaPromptEngineering';
import { StoryboardUI } from './StoryboardUI';
import OAuthCallback from '@/components/OAuthCallback';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './App.css';

// Check if this is an OAuth callback
const isOAuthCallback = window.location.pathname.includes('/oauth/callback') || 
                         window.location.search.includes('code=') ||
                         window.location.search.includes('error=');

type TabId = 'cinema' | 'storyboard';

interface Tab {
  id: TabId;
  labelKey: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: 'cinema', labelKey: 'tabs.cinema', icon: '🎬' },
  { id: 'storyboard', labelKey: 'tabs.storyboard', icon: '📋' },
];

function DirectorsConsole() {
  const [activeTab, setActiveTab] = useState<TabId>('cinema');
  const { t, i18n } = useTranslation();

  const languageOptions = useMemo(() => {
    return [
      { code: 'en', label: 'English' },
      { code: 'zh-CN', label: '简体中文' },
    ];
  }, []);

  return (
    <div className="directors-console">
      {/* Tab Navigation */}
      <nav className="directors-console__nav">
        <div className="directors-console__logo">
          <span className="logo-icon">🎬</span>
          <span className="logo-text">{t('app.title')}</span>
        </div>
        
        <div className="directors-console__tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{t(tab.labelKey)}</span>
            </button>
          ))}
        </div>

        <div className="directors-console__nav-right">
          <label className="language-switcher">
            <span className="language-switcher__label">{t('language.label')}</span>
            <select
              className="language-switcher__select"
              value={i18n.resolvedLanguage || i18n.language}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
            >
              {languageOptions.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </nav>

      {/* Tab Content - Both components stay mounted to preserve state */}
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
