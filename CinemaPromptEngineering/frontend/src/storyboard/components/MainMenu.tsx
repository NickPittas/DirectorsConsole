/**
 * MainMenu - Top-left dropdown menu for project operations
 */

import { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Save,
  FolderInput,
  Settings,
  Server,
  ChevronDown,
  FilePlus,
  SaveAll,
  RefreshCw,
  OctagonX,
  Printer,
  ArrowRightLeft
} from 'lucide-react';
import './MainMenu.css';

interface MainMenuProps {
  onProjectSettings: () => void;
  onPathMappings?: () => void;
  onSaveProject: () => void;
  onSaveProjectAs?: () => void;
  onLoadProject: () => void;
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
  const menuRef = useRef<HTMLDivElement>(null);

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
