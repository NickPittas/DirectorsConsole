/**
 * DropMoveDialog — Shown when files are dropped onto a folder in the tree.
 *
 * Offers two choices:
 * 1. Move directly to the target folder
 * 2. Create a new subfolder inside the target and move there
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderPlus, ArrowRight } from 'lucide-react';
import { moveFiles, createFolder } from '../services/gallery-service';

// =============================================================================
// Types
// =============================================================================

interface DropMoveDialogProps {
  filePaths: string[];
  targetFolder: string;
  orchestratorUrl: string;
  projectPath: string;
  onMoved: () => void;
  onClose: () => void;
}

// =============================================================================
// Styles
// =============================================================================

const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  dialog: {
    background: 'var(--color-bg-secondary, #1e1e2e)',
    border: '1px solid var(--color-border, #333)',
    borderRadius: 8,
    width: 400,
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    color: 'var(--color-text, #e0e0e0)',
    fontSize: 13,
  },
  header: {
    padding: '16px 20px 12px',
    borderBottom: '1px solid var(--color-border, #333)',
    fontWeight: 600,
    fontSize: 15,
  },
  body: {
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  targetInfo: {
    fontSize: 12,
    color: 'var(--color-text-muted, #888)',
    marginBottom: 4,
  },
  optionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderRadius: 6,
    border: '1px solid var(--color-border, #333)',
    background: 'var(--color-bg-primary, #141420)',
    color: 'var(--color-text, #e0e0e0)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    transition: 'all 0.15s',
    width: '100%',
    textAlign: 'left' as const,
  },
  optionBtnHover: {
    borderColor: 'var(--color-accent, #5b9aff)',
    background: 'rgba(91, 154, 255, 0.08)',
  },
  newFolderRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    padding: '7px 10px',
    fontSize: 13,
    background: 'var(--color-bg-primary, #141420)',
    color: 'var(--color-text, #e0e0e0)',
    border: '1px solid var(--color-accent, #5b9aff)',
    borderRadius: 4,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  createBtn: {
    padding: '7px 14px',
    borderRadius: 4,
    border: '1px solid var(--color-accent, #5b9aff)',
    background: 'var(--color-accent, #3b82f6)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '12px 20px',
    borderTop: '1px solid var(--color-border, #333)',
  },
  cancelBtn: {
    padding: '6px 16px',
    borderRadius: 4,
    border: '1px solid var(--color-border, #444)',
    background: 'var(--color-bg-secondary, #1e1e2e)',
    color: 'var(--color-text, #e0e0e0)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  statusMsg: {
    fontSize: 12,
    padding: '8px 12px',
    borderRadius: 4,
    background: 'var(--color-bg-primary, #141420)',
    border: '1px solid var(--color-border, #333)',
  },
  errorMsg: {
    color: '#f87171',
    borderColor: '#ef4444',
  },
  successMsg: {
    color: '#4ade80',
    borderColor: '#22c55e',
  },
};

// =============================================================================
// Component
// =============================================================================

export function DropMoveDialog({
  filePaths,
  targetFolder,
  orchestratorUrl,
  projectPath,
  onMoved,
  onClose,
}: DropMoveDialogProps) {
  const [mode, setMode] = useState<'choose' | 'newFolder' | 'moving'>('choose');
  const [newFolderName, setNewFolderName] = useState('New Folder');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Extract display name from target folder path
  const targetName = targetFolder.split(/[/\\]/).filter(Boolean).pop() || 'folder';
  const fileCount = filePaths.length;

  // Focus input when switching to new folder mode
  useEffect(() => {
    if (mode === 'newFolder' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mode]);

  // Auto-close on success
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        onMoved();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [success, onMoved]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleMoveHere = useCallback(async () => {
    setMode('moving');
    setError(null);
    try {
      const result = await moveFiles(orchestratorUrl, filePaths, targetFolder, projectPath, 'rename');
      if (result.errors?.length > 0) {
        setError(`Moved ${result.moved?.length || 0} files, ${result.errors.length} errors`);
        setMode('choose');
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed');
      setMode('choose');
    }
  }, [orchestratorUrl, filePaths, targetFolder, projectPath]);

  const handleCreateAndMove = useCallback(async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;

    setMode('moving');
    setError(null);
    try {
      // Step 1: Create the subfolder
      const createResult = await createFolder(orchestratorUrl, targetFolder, trimmed);
      if (!createResult.success) {
        setError(createResult.message || 'Failed to create folder');
        setMode('newFolder');
        return;
      }

      // Step 2: Move files to the new folder
      const newPath = createResult.created_path;
      const moveResult = await moveFiles(orchestratorUrl, filePaths, newPath, projectPath, 'rename');
      if (moveResult.errors?.length > 0) {
        setError(`Moved ${moveResult.moved?.length || 0} files, ${moveResult.errors.length} errors`);
        setMode('newFolder');
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
      setMode('newFolder');
    }
  }, [orchestratorUrl, filePaths, targetFolder, projectPath, newFolderName]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCreateAndMove();
      } else if (e.key === 'Escape') {
        setMode('choose');
      }
    },
    [handleCreateAndMove],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const dialog = (
    <div style={S.overlay} onClick={handleBackdropClick}>
      <div style={S.dialog} role="dialog" aria-modal="true">
        {/* Header */}
        <div style={S.header}>
          Move {fileCount} file{fileCount !== 1 ? 's' : ''}
        </div>

        {/* Body */}
        <div style={S.body}>
          <div style={S.targetInfo}>
            Dropped onto: <strong>{targetName}</strong>
          </div>

          {/* Error */}
          {error && (
            <div style={{ ...S.statusMsg, ...S.errorMsg }}>{error}</div>
          )}

          {/* Success */}
          {success && (
            <div style={{ ...S.statusMsg, ...S.successMsg }}>
              Files moved successfully
            </div>
          )}

          {/* Option buttons — shown in 'choose' mode */}
          {mode === 'choose' && !success && (
            <>
              <button
                type="button"
                style={{
                  ...S.optionBtn,
                  ...(hoveredBtn === 'move' ? S.optionBtnHover : {}),
                }}
                onMouseEnter={() => setHoveredBtn('move')}
                onMouseLeave={() => setHoveredBtn(null)}
                onClick={handleMoveHere}
              >
                <Folder size={16} />
                <span style={{ flex: 1 }}>Move to "{targetName}"</span>
                <ArrowRight size={14} style={{ opacity: 0.5 }} />
              </button>

              <button
                type="button"
                style={{
                  ...S.optionBtn,
                  ...(hoveredBtn === 'new' ? S.optionBtnHover : {}),
                }}
                onMouseEnter={() => setHoveredBtn('new')}
                onMouseLeave={() => setHoveredBtn(null)}
                onClick={() => setMode('newFolder')}
              >
                <FolderPlus size={16} />
                <span style={{ flex: 1 }}>Create new subfolder and move</span>
                <ArrowRight size={14} style={{ opacity: 0.5 }} />
              </button>
            </>
          )}

          {/* New folder input — shown in 'newFolder' mode */}
          {mode === 'newFolder' && !success && (
            <div style={S.newFolderRow}>
              <input
                ref={inputRef}
                style={S.input}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Folder name"
              />
              <button
                type="button"
                style={{
                  ...S.createBtn,
                  ...(newFolderName.trim() ? {} : { opacity: 0.4, cursor: 'not-allowed' }),
                }}
                disabled={!newFolderName.trim()}
                onClick={handleCreateAndMove}
              >
                Create &amp; Move
              </button>
            </div>
          )}

          {/* Moving spinner */}
          {mode === 'moving' && !success && (
            <div style={{ ...S.statusMsg, color: 'var(--color-text-muted, #888)' }}>
              Moving files...
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button type="button" style={S.cancelBtn} onClick={onClose}>
            {success ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
