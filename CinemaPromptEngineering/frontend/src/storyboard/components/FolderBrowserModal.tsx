/**
 * FolderBrowserModal - Browse and select folders via Orchestrator API
 */

import { useState, useEffect, useCallback } from 'react';
import { Folder, FolderOpen, HardDrive, ChevronLeft, Check, X, RefreshCw } from 'lucide-react';
import './FolderBrowserModal.css';

interface FolderItem {
  name: string;
  path: string;
  type: 'drive' | 'folder';
}

interface FolderBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  orchestratorUrl: string;
  initialPath?: string;
  title?: string;
}

export function FolderBrowserModal({
  isOpen,
  onClose,
  onSelect,
  orchestratorUrl,
  initialPath = '',
  title = 'Select Folder'
}: FolderBrowserModalProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);

  const loadFolder = useCallback(async (path: string) => {
    if (!orchestratorUrl) {
      setError('Orchestrator URL not configured');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${orchestratorUrl}/api/browse-folders?path=${encodeURIComponent(path)}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setCurrentPath(data.current || '');
        setItems(data.items || []);
        setParentPath(data.parent);
      } else {
        setError(data.error || 'Failed to load folder');
      }
    } catch (err) {
      setError(`Failed to connect: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [orchestratorUrl]);

  useEffect(() => {
    if (isOpen) {
      loadFolder(initialPath);
    }
  }, [isOpen, initialPath, loadFolder]);

  const handleSelect = () => {
    if (currentPath) {
      onSelect(currentPath);
      onClose();
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const response = await fetch(`${orchestratorUrl}/api/create-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_path: currentPath || 'C:/',
          folder_name: newFolderName.trim(),
        }),
      });

      const result = await response.json();
      
      if (!result.success) {
        setError(result.message);
        return;
      }

      // Folder created successfully - navigate to it
      setShowNewFolder(false);
      setNewFolderName('');
      const newPath = result.created_path.replace(/\//g, '\\');
      setCurrentPath(newPath);
      
      // Refresh the folder list
      await loadFolder(newPath);
    } catch (err) {
      setError(`Failed to create folder: ${err}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="folder-browser-overlay" onClick={onClose}>
      <div className="folder-browser-modal" onClick={(e) => e.stopPropagation()}>
        <div className="folder-browser-header">
          <h3>{title}</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="folder-browser-toolbar">
          <button
            onClick={() => parentPath && loadFolder(parentPath)}
            disabled={!parentPath || loading}
            title="Go to parent folder"
          >
            <ChevronLeft size={18} />
          </button>
          <input
            type="text"
            value={currentPath}
            onChange={(e) => setCurrentPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadFolder(currentPath)}
            placeholder="Enter path..."
          />
          <button onClick={() => loadFolder(currentPath)} disabled={loading} title="Refresh">
            <RefreshCw size={18} className={loading ? 'spinning' : ''} />
          </button>
        </div>

        <div className="folder-browser-content">
          {error && <div className="folder-error">{error}</div>}
          
          {loading ? (
            <div className="folder-loading">Loading...</div>
          ) : (
            <div className="folder-list">
              {items.length === 0 && !error && (
                <div className="folder-empty">No folders found</div>
              )}
              {items.map((item) => (
                <div
                  key={item.path}
                  className="folder-item"
                  onDoubleClick={() => loadFolder(item.path)}
                >
                  {item.type === 'drive' ? (
                    <HardDrive size={18} />
                  ) : (
                    <Folder size={18} />
                  )}
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {showNewFolder && (
          <div className="new-folder-input">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder name..."
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              autoFocus
            />
            <button onClick={handleCreateFolder}>Create</button>
            <button onClick={() => setShowNewFolder(false)}>Cancel</button>
          </div>
        )}

        <div className="folder-browser-footer">
          <div className="folder-path-display">
            <FolderOpen size={16} />
            <span>{currentPath || 'No folder selected'}</span>
          </div>
          <div className="folder-actions">
            <button
              className="new-folder-btn"
              onClick={() => setShowNewFolder(true)}
              disabled={!currentPath}
            >
              New Folder
            </button>
            <button className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="select-btn"
              onClick={handleSelect}
              disabled={!currentPath}
            >
              <Check size={16} />
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
