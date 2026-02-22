/**
 * MoveToNewFolderDialog — Asks for a folder name, creates it in the current
 * folder, and moves the selected files into it.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FolderPlus } from 'lucide-react';
import { moveFiles, createFolder } from '../services/gallery-service';
import type { FileEntry } from '../services/gallery-service';

interface MoveToNewFolderDialogProps {
  files: FileEntry[];
  currentFolder: string;       // The folder we're currently browsing — new folder is created here
  orchestratorUrl: string;
  projectPath: string;
  onMoved: () => void;         // Called on success so parent can refresh
  onClose: () => void;
}

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
    width: 420,
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    color: 'var(--color-text, #e0e0e0)',
    fontSize: 13,
  },
  header: {
    padding: '16px 20px 12px',
    borderBottom: '1px solid var(--color-border, #333)',
    fontWeight: 600,
    fontSize: 15,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  body: {
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  label: {
    fontSize: 12,
    color: 'var(--color-text-muted, #888)',
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    fontSize: 13,
    background: 'var(--color-bg-primary, #141420)',
    color: 'var(--color-text, #e0e0e0)',
    border: '1px solid var(--color-border, #444)',
    borderRadius: 4,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  inputFocused: {
    borderColor: 'var(--color-accent, #5b9aff)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '12px 20px',
    borderTop: '1px solid var(--color-border, #333)',
  },
  btn: {
    padding: '6px 16px',
    borderRadius: 4,
    border: '1px solid var(--color-border, #444)',
    background: 'var(--color-bg-secondary, #1e1e2e)',
    color: 'var(--color-text, #e0e0e0)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  btnPrimary: {
    background: 'var(--color-accent, #3b82f6)',
    color: '#fff',
    border: '1px solid var(--color-accent, #3b82f6)',
  },
  btnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
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

export function MoveToNewFolderDialog({
  files,
  currentFolder,
  orchestratorUrl,
  projectPath,
  onMoved,
  onClose,
}: MoveToNewFolderDialogProps) {
  const [folderName, setFolderName] = useState('New Folder');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus and select text on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Auto-close on success
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        onMoved();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [success, onMoved]);

  const handleSubmit = useCallback(async () => {
    const trimmed = folderName.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);

    try {
      // Step 1: Create the folder
      const createResult = await createFolder(orchestratorUrl, currentFolder, trimmed);
      if (!createResult.success) {
        setError(createResult.message || 'Failed to create folder');
        setLoading(false);
        return;
      }

      // Step 2: Move the files
      const filePaths = files.map((f) => f.path);
      const moveResult = await moveFiles(orchestratorUrl, filePaths, createResult.created_path, projectPath, 'rename');

      if (moveResult.errors?.length > 0) {
        setError(`Moved ${moveResult.moved?.length || 0} files, ${moveResult.errors.length} failed`);
        setLoading(false);
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
      setLoading(false);
    }
  }, [folderName, loading, orchestratorUrl, currentFolder, files, projectPath]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const canSubmit = folderName.trim().length > 0 && !loading && !success;

  const dialog = (
    <div style={S.overlay} onClick={handleBackdropClick}>
      <div style={S.dialog} role="dialog" aria-modal="true">
        {/* Header */}
        <div style={S.header}>
          <FolderPlus size={18} />
          Move {files.length} file{files.length !== 1 ? 's' : ''} to New Folder
        </div>

        {/* Body */}
        <div style={S.body}>
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

          {/* Input — hidden after success */}
          {!success && (
            <>
              <div style={S.label}>Folder name</div>
              <input
                ref={inputRef}
                style={S.input}
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter folder name"
                disabled={loading}
              />
            </>
          )}

          {/* Loading state */}
          {loading && !success && (
            <div style={{ ...S.statusMsg, color: 'var(--color-text-muted, #888)' }}>
              Creating folder and moving files...
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button type="button" style={S.btn} onClick={onClose}>
            {success ? 'Close' : 'Cancel'}
          </button>
          {!success && (
            <button
              type="button"
              style={{
                ...S.btn,
                ...S.btnPrimary,
                ...(canSubmit ? {} : S.btnDisabled),
              }}
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              {loading ? 'Moving...' : 'Create & Move'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
