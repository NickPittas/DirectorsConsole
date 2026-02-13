/**
 * MainMenu - Top-left dropdown menu for project operations
 */

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  Printer
} from 'lucide-react';
import './MainMenu.css';

interface MainMenuProps {
  onProjectSettings: () => void;
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
  const { t } = useTranslation();

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
        <span className="project-name">{projectName || t('storyboard.project.untitled')}</span>
        <ChevronDown size={14} className={`chevron ${isOpen ? 'rotated' : ''}`} />
      </button>

      {isOpen && (
        <div className="main-menu-dropdown">
          <div className="menu-section">
            <div className="menu-section-title">{t('storyboard.menu.project')}</div>
            
            <button
              className="menu-item"
              onClick={() => {
                onNewProject();
                setIsOpen(false);
              }}
            >
              <FilePlus size={16} />
              <span>{t('storyboard.menu.newProject')}</span>
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
              <span>{isLoading ? t('storyboard.menu.loading') : t('storyboard.menu.loadProject')}</span>
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
              <span>{isSaving ? t('storyboard.menu.saving') : t('storyboard.menu.saveProject')}</span>
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
                <span>{t('storyboard.menu.saveAs')}</span>
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
              <span>{t('storyboard.menu.projectSettings')}</span>
              <span className="menu-shortcut">{mod}+,</span>
            </button>

            {onPrintStoryboard && (
              <button
                className="menu-item"
                onClick={() => {
                  onPrintStoryboard();
                  setIsOpen(false);
                }}
              >
                <Printer size={16} />
                <span>{t('storyboard.menu.printStoryboard')}</span>
                <span className="menu-shortcut">{mod}+P</span>
              </button>
            )}
          </div>

          <div className="menu-divider" />

          <div className="menu-section">
            <div className="menu-section-title">{t('storyboard.menu.system')}</div>
            
            <button 
              className="menu-item"
              onClick={() => {
                onManageNodes();
                setIsOpen(false);
              }}
            >
              <Server size={16} />
              <span>{t('storyboard.menu.manageNodes')}</span>
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
                title={nodeCount === 0 ? t('storyboard.menu.noNodesToRestart') : t('storyboard.menu.restartNodesTitle')}
              >
                <RefreshCw size={16} className={isRestarting ? 'spinning' : ''} />
                <span>{isRestarting ? t('storyboard.menu.restarting') : t('storyboard.menu.restartNodes')}</span>
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
                title={isGenerating ? t('storyboard.menu.cancelAllTitle') : t('storyboard.menu.cancelDisabledTitle')}
              >
                <OctagonX size={16} />
                <span>{t('storyboard.menu.cancelAllGenerations')}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
