/**
 * FileBrowserDialog - Main modal wrapper with dual-pane layout
 * Provides Windows Explorer-like file browser for Load/Save operations
 */

import { useState, useEffect, useCallback } from 'react';
import { X, FolderPlus, Save, FolderOpen, AlertCircle } from 'lucide-react';
import { useFileBrowser, FolderItem } from './hooks/useFileBrowser';
import { DriveTreeView } from './components/DriveTreeView';
import { FolderContentsView } from './components/FolderContentsView';
import { BreadcrumbBar } from './components/BreadcrumbBar';
import './FileBrowserDialog.css';

// ============================================================================
// Types
// ============================================================================

export interface FileBrowserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'open' | 'save' | 'select-folder';
  orchestratorUrl: string;
  initialPath?: string;
  projectName?: string; // For save mode - default filename
  title?: string; // Custom dialog title (used in select-folder mode)
  onOpenProject: (projectPath: string) => void;
  onSaveProject?: (folderPath: string, projectName: string) => void;
  onSelectFolder?: (folderPath: string) => void; // For select-folder mode
}

// ============================================================================
// Component
// ============================================================================

export function FileBrowserDialog({
  isOpen,
  onClose,
  mode,
  orchestratorUrl,
  initialPath = '',
  projectName: defaultProjectName = '',
  title,
  onOpenProject,
  onSaveProject,
  onSelectFolder,
}: FileBrowserDialogProps) {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const {
    state,
    navigateTo,
    selectItem,
    expandTreeNode,
    collapseTreeNode,
    refresh,
    goToParent,
  } = useFileBrowser(orchestratorUrl, initialPath, isOpen);

  const [saveFileName, setSaveFileName] = useState(defaultProjectName);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Update saveFileName when defaultProjectName changes
  useEffect(() => {
    if (defaultProjectName) {
      setSaveFileName(defaultProjectName);
    }
  }, [defaultProjectName]);

  // Reset error when navigating
  useEffect(() => {
    setError(null);
  }, [state.currentPath]);

  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape - Close dialog
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Enter - Open/Confirm
      if (e.key === 'Enter') {
        e.preventDefault();
        if (mode === 'select-folder' && state.currentPath) {
          handlePrimaryAction();
        } else if (mode === 'open' && state.selectedItem?.type === 'project') {
          handlePrimaryAction();
        } else if (mode === 'save' && saveFileName.trim()) {
          handlePrimaryAction();
        }
        return;
      }

      // Backspace - Go to parent (if not in input field)
      if (e.key === 'Backspace' && !e.shiftKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT') {
          e.preventDefault();
          goToParent();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, mode, state.selectedItem, saveFileName, onClose, goToParent]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleTreeSelect = useCallback(
    async (path: string) => {
      await navigateTo(path);
    },
    [navigateTo]
  );

  const handleItemSelect = useCallback(
    (item: FolderItem) => {
      selectItem(item);

      // For save mode, update filename when selecting a project
      if (mode === 'save' && item.type === 'project') {
        // Extract project name from file (remove _project.json suffix)
        const name = item.name.replace(/_project\.json$/i, '');
        setSaveFileName(name);
      }
    },
    [selectItem, mode]
  );

  const handleItemOpen = useCallback(
    (item: FolderItem) => {
      if (item.type === 'folder' || item.type === 'drive') {
        navigateTo(item.path);
      } else if (item.type === 'project' && mode === 'open') {
        onOpenProject(item.path);
      }
    },
    [navigateTo, onOpenProject, mode]
  );

  const handlePrimaryAction = () => {
    if (mode === 'select-folder') {
      // Select the currently selected folder item, or the current path
      const folderPath = (state.selectedItem?.type === 'folder' || state.selectedItem?.type === 'drive')
        ? state.selectedItem.path
        : state.currentPath;
      if (!folderPath) {
        setError('Please select a folder');
        return;
      }
      if (onSelectFolder) {
        onSelectFolder(folderPath);
      }
      onClose();
    } else if (mode === 'open') {
      if (state.selectedItem?.type === 'project') {
        onOpenProject(state.selectedItem.path);
      } else if (state.selectedItem?.type === 'folder') {
        // If folder selected in open mode, navigate into it
        navigateTo(state.selectedItem.path);
      } else {
        setError('Please select a project file to open');
      }
    } else if (mode === 'save') {
      if (!saveFileName.trim()) {
        setError('Please enter a project name');
        return;
      }
      if (!state.currentPath) {
        setError('Please select a folder to save in');
        return;
      }
      if (onSaveProject) {
        onSaveProject(state.currentPath, saveFileName.trim());
      }
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const response = await fetch(`${orchestratorUrl}/api/create-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_path: state.currentPath,
          folder_name: newFolderName.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setShowNewFolderInput(false);
          setNewFolderName('');
          await refresh();
          // Navigate to new folder
          if (data.folder_path) {
            await navigateTo(data.folder_path);
          }
        } else {
          setError(data.message || 'Failed to create folder');
        }
      } else {
        setError('Failed to create folder');
      }
    } catch (err) {
      setError(`Error creating folder: ${err}`);
    }
  };

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const getDialogTitle = () => {
    if (mode === 'select-folder') {
      return (
        <>
          <FolderOpen size={18} />
          <span>{title || 'Select Folder'}</span>
        </>
      );
    }
    if (mode === 'open') {
      return (
        <>
          <FolderOpen size={18} />
          <span>{title || 'Load Project'}</span>
        </>
      );
    }
    return (
      <>
        <Save size={18} />
        <span>{title || 'Save Project As'}</span>
      </>
    );
  };

  const getPrimaryButtonText = () => {
    if (mode === 'select-folder') {
      return 'Select Folder';
    }
    if (mode === 'open') {
      return state.selectedItem?.type === 'project' ? 'Open Project' : 'Select Folder';
    }
    return 'Save';
  };

  const isPrimaryButtonDisabled = () => {
    if (mode === 'select-folder') {
      // Allow selecting the current path or a selected folder item
      const hasFolder = (state.selectedItem?.type === 'folder' || state.selectedItem?.type === 'drive') || !!state.currentPath;
      return !hasFolder;
    }
    if (mode === 'open') {
      return state.selectedItem?.type !== 'project' && state.selectedItem?.type !== 'folder';
    }
    return !saveFileName.trim() || !state.currentPath;
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!isOpen) return null;

  return (
    <div className="file-browser-overlay" onClick={onClose}>
      <div className="file-browser-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="file-browser-header">
          <div className="file-browser-title">{getDialogTitle()}</div>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Main content area - dual pane */}
        <div className="file-browser-body">
          {/* Left pane - Tree view */}
          <div className="file-browser-left-pane">
            <DriveTreeView
              nodes={state.treeNodes}
              selectedPath={state.currentPath}
              expandedPaths={state.expandedPaths}
              onSelectFolder={handleTreeSelect}
              onExpandFolder={expandTreeNode}
              onCollapseFolder={collapseTreeNode}
            />
          </div>

          {/* Right pane - Contents view */}
          <div className="file-browser-right-pane">
            <BreadcrumbBar
              path={state.currentPath}
              onNavigate={navigateTo}
              onRefresh={refresh}
              isLoading={state.isLoading}
            />

            <FolderContentsView
              items={state.folderContents}
              selectedItem={state.selectedItem}
              onSelectItem={handleItemSelect}
              onOpenItem={handleItemOpen}
              isLoading={state.isLoading}
            />

            {/* Error display */}
            {error && (
              <div className="file-browser-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Save filename input */}
            {mode === 'save' && (
              <div className="file-browser-save-input">
                <label>Project Name:</label>
                <input
                  type="text"
                  value={saveFileName}
                  onChange={(e) => setSaveFileName(e.target.value)}
                  placeholder="Enter project name..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handlePrimaryAction();
                    }
                  }}
                  autoFocus
                />
              </div>
            )}

            {/* New folder input */}
            {showNewFolderInput && (
              <div className="file-browser-new-folder">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New folder name..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateFolder();
                    } else if (e.key === 'Escape') {
                      setShowNewFolderInput(false);
                      setNewFolderName('');
                    }
                  }}
                  autoFocus
                />
                <button onClick={handleCreateFolder}>Create</button>
                <button
                  onClick={() => {
                    setShowNewFolderInput(false);
                    setNewFolderName('');
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="file-browser-footer">
          <button
            className="new-folder-btn"
            onClick={() => setShowNewFolderInput(true)}
            disabled={showNewFolderInput || !state.currentPath}
          >
            <FolderPlus size={16} />
            <span>New Folder</span>
          </button>

          {mode === 'select-folder' && state.currentPath && (
            <div className="file-browser-selected-path" title={
              (state.selectedItem?.type === 'folder' || state.selectedItem?.type === 'drive')
                ? state.selectedItem.path
                : state.currentPath
            }>
              <span className="selected-path-label">Selected:</span>
              <span className="selected-path-value">
                {(state.selectedItem?.type === 'folder' || state.selectedItem?.type === 'drive')
                  ? state.selectedItem.path
                  : state.currentPath}
              </span>
            </div>
          )}

          <div className="file-browser-actions">
            <button className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary-btn"
              onClick={handlePrimaryAction}
              disabled={isPrimaryButtonDisabled()}
            >
              {getPrimaryButtonText()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
