/**
 * MainMenu - Top-left dropdown menu for project operations
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Menu,
  Save,
  FolderInput,
  Settings,
  Server,
  ChevronDown,
  ChevronRight,
  FilePlus,
  SaveAll,
  RefreshCw,
  OctagonX,
  Printer,
  ArrowRightLeft,
  Clock,
  X
} from 'lucide-react';
import './MainMenu.css';

// ---------------------------------------------------------------------------
// Recent Projects utility — stored in localStorage
// ---------------------------------------------------------------------------

const RECENT_PROJECTS_KEY = 'storyboard_recent_projects';
const MAX_RECENTS = 10;

export interface RecentProject {
  name: string;
  path: string;         // The _project.json file path
  projectDir: string;   // The directory containing the project
  lastOpened: string;    // ISO date
}

export function getRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentProject(name: string, projectFilePath: string): void {
  const recents = getRecentProjects();
  // Derive the project directory
  const lastSlash = Math.max(projectFilePath.lastIndexOf('/'), projectFilePath.lastIndexOf('\\'));
  const projectDir = lastSlash > 0 ? projectFilePath.substring(0, lastSlash) : projectFilePath;

  // Remove any existing entry for the same path (case-insensitive)
  const filtered = recents.filter(
    r => r.path.toLowerCase() !== projectFilePath.toLowerCase()
  );

  // Prepend new entry
  filtered.unshift({
    name: name || projectDir.split('/').pop() || 'Untitled',
    path: projectFilePath,
    projectDir,
    lastOpened: new Date().toISOString(),
  });

  // Trim to max
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(filtered.slice(0, MAX_RECENTS)));
}

export function removeRecentProject(projectFilePath: string): void {
  const recents = getRecentProjects();
  const filtered = recents.filter(
    r => r.path.toLowerCase() !== projectFilePath.toLowerCase()
  );
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(filtered));
}

export function clearRecentProjects(): void {
  localStorage.removeItem(RECENT_PROJECTS_KEY);
}

// ---------------------------------------------------------------------------

interface MainMenuProps {
  onProjectSettings: () => void;
  onPathMappings?: () => void;
  onSaveProject: () => void;
  onSaveProjectAs?: () => void;
  onLoadProject: () => void;
  onLoadRecentProject?: (projectFilePath: string) => void;
  onManageNodes: () => void;
  onNewProject: () => void;
  onRestartNodes?: () => void;
  onCancelGenerations?: () => void;
  onPrintStoryboard?: () => void;
  nodeCount: number;
  projectName: string;
  isSaving?: boolean;
  isLoading?: boolean;
  isRestarting?: boolean;
  isGenerating?: boolean;
}

export function MainMenu({
  onProjectSettings,
  onPathMappings,
  onSaveProject,
  onSaveProjectAs,
  onLoadProject,
  onLoadRecentProject,
  onManageNodes,
  onNewProject,
  onRestartNodes,
  onCancelGenerations,
  onPrintStoryboard,
  nodeCount,
  projectName,
  isSaving,
  isLoading,
  isRestarting,
  isGenerating,
}: MainMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showRecents, setShowRecents] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const recentsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load recent projects whenever the menu opens
  useEffect(() => {
    if (isOpen) {
      setRecentProjects(getRecentProjects());
    } else {
      setShowRecents(false);
    }
  }, [isOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menu when pressing Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const mod = isMac ? '⌘' : 'Ctrl';

  const handleRecentsMouseEnter = useCallback(() => {
    if (recentsTimeoutRef.current) clearTimeout(recentsTimeoutRef.current);
    setShowRecents(true);
  }, []);

  const handleRecentsMouseLeave = useCallback(() => {
    recentsTimeoutRef.current = setTimeout(() => setShowRecents(false), 200);
  }, []);

  const handleRemoveRecent = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    removeRecentProject(path);
    setRecentProjects(getRecentProjects());
  }, []);

  const formatRecentsDate = useCallback((iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}d ago`;
      return d.toLocaleDateString();
    } catch {
      return '';
    }
  }, []);

  return (
    <div className="main-menu" ref={menuRef}>
      <button 
        className={`main-menu-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Menu size={18} />
        <span className="project-name">{projectName || 'Untitled Project'}</span>
        <ChevronDown size={14} className={`chevron ${isOpen ? 'rotated' : ''}`} />
      </button>

      {isOpen && (
        <div className="main-menu-dropdown">
          <div className="menu-section">
            <div className="menu-section-title">Project</div>
            
            <button
              className="menu-item"
              onClick={() => {
                onNewProject();
                setIsOpen(false);
              }}
            >
              <FilePlus size={16} />
              <span>New Project</span>
              <span className="menu-shortcut">{mod}+N</span>
            </button>

            <button
              className="menu-item"
              onClick={() => {
                onLoadProject();
                setIsOpen(false);
              }}
              disabled={isLoading}
            >
              <FolderInput size={16} />
              <span>{isLoading ? 'Loading...' : 'Load Project'}</span>
              <span className="menu-shortcut">{mod}+O</span>
            </button>

            {/* Recent Projects submenu */}
            {onLoadRecentProject && (
              <div
                className="menu-item-with-submenu"
                onMouseEnter={handleRecentsMouseEnter}
                onMouseLeave={handleRecentsMouseLeave}
              >
                <button
                  className={`menu-item ${showRecents ? 'menu-item--active' : ''}`}
                  disabled={isLoading || recentProjects.length === 0}
                >
                  <Clock size={16} />
                  <span>Recent Projects</span>
                  <ChevronRight size={14} className="menu-submenu-arrow" />
                </button>

                {showRecents && recentProjects.length > 0 && (
                  <div className="menu-submenu">
                    {recentProjects.map((rp) => (
                      <button
                        key={rp.path}
                        className="menu-submenu-item"
                        title={rp.projectDir}
                        onClick={() => {
                          onLoadRecentProject(rp.path);
                          setIsOpen(false);
                        }}
                      >
                        <div className="menu-recent-info">
                          <span className="menu-recent-name">{rp.name}</span>
                          <span className="menu-recent-path">{rp.projectDir}</span>
                        </div>
                        <span className="menu-recent-date">{formatRecentsDate(rp.lastOpened)}</span>
                        <button
                          className="menu-recent-remove"
                          title="Remove from recents"
                          onClick={(e) => handleRemoveRecent(e, rp.path)}
                        >
                          <X size={12} />
                        </button>
                      </button>
                    ))}
                    <div className="menu-submenu-divider" />
                    <button
                      className="menu-submenu-item menu-submenu-item--clear"
                      onClick={() => {
                        clearRecentProjects();
                        setRecentProjects([]);
                      }}
                    >
                      Clear Recent Projects
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              className="menu-item"
              onClick={() => {
                onSaveProject();
                setIsOpen(false);
              }}
              disabled={isSaving}
            >
              <Save size={16} />
              <span>{isSaving ? 'Saving...' : 'Save Project'}</span>
              <span className="menu-shortcut">{mod}+S</span>
            </button>

            {onSaveProjectAs && (
              <button
                className="menu-item"
                onClick={() => {
                  onSaveProjectAs();
                  setIsOpen(false);
                }}
                disabled={isSaving}
              >
                <SaveAll size={16} />
                <span>Save As...</span>
                <span className="menu-shortcut">{mod}+⇧+S</span>
              </button>
            )}

            <button
              className="menu-item"
              onClick={() => {
                onProjectSettings();
                setIsOpen(false);
              }}
            >
              <Settings size={16} />
              <span>Project Settings</span>
              <span className="menu-shortcut">{mod}+,</span>
            </button>

            {onPathMappings && (
              <button
                className="menu-item"
                onClick={() => {
                  onPathMappings();
                  setIsOpen(false);
                }}
              >
                <ArrowRightLeft size={16} />
                <span>Path Mappings</span>
              </button>
            )}

            {onPrintStoryboard && (
              <button
                className="menu-item"
                onClick={() => {
                  onPrintStoryboard();
                  setIsOpen(false);
                }}
              >
                <Printer size={16} />
                <span>Print Storyboard</span>
                <span className="menu-shortcut">{mod}+P</span>
              </button>
            )}
          </div>

          <div className="menu-divider" />

          <div className="menu-section">
            <div className="menu-section-title">System</div>
            
            <button 
              className="menu-item"
              onClick={() => {
                onManageNodes();
                setIsOpen(false);
              }}
            >
              <Server size={16} />
              <span>Manage Nodes</span>
              <span className="menu-badge">{nodeCount}</span>
            </button>

            {onRestartNodes && (
              <button 
                className="menu-item"
                onClick={() => {
                  onRestartNodes();
                  setIsOpen(false);
                }}
                disabled={isRestarting || nodeCount === 0}
                title={nodeCount === 0 ? "No nodes available to restart" : "Restart all ComfyUI backends"}
              >
                <RefreshCw size={16} className={isRestarting ? 'spinning' : ''} />
                <span>{isRestarting ? 'Restarting...' : 'Restart Nodes'}</span>
              </button>
            )}

            {onCancelGenerations && (
              <button 
                className="menu-item cancel-btn"
                onClick={() => {
                  onCancelGenerations();
                  setIsOpen(false);
                }}
                disabled={!isGenerating}
                title={isGenerating ? "Cancel all running generations" : "No generations running"}
              >
                <OctagonX size={16} />
                <span>Cancel All Generations</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
