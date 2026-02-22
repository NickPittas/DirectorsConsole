/**
 * MoveDialog — Modal dialog for moving files to a different folder.
 *
 * Displays a folder picker built from the flat FolderEntry array, a conflict
 * resolution dropdown, and handles the API call with result summary.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Folder, Check } from 'lucide-react';
import { moveFiles } from '../services/gallery-service';
import type { FileEntry, TreeFolderEntry, MoveFilesResult } from '../services/gallery-service';

// =============================================================================
// Types
// =============================================================================

interface MoveDialogProps {
  files: FileEntry[];
  orchestratorUrl: string;
  projectPath: string;
  folderTree: TreeFolderEntry[];
  onClose: () => void;
  onMoved: () => void;
}

type ConflictStrategy = 'skip' | 'overwrite' | 'rename';

interface FlatFolderItem {
  folder: TreeFolderEntry;
  depth: number;
  displayName: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Flatten the folder tree into a sorted list with depth derived from
 * the number of segments in `rel_path`.
 */
function flattenFolders(folders: TreeFolderEntry[]): FlatFolderItem[] {
  return folders
    .slice()
    .sort((a, b) => a.rel_path.localeCompare(b.rel_path))
    .map((folder) => {
      const segments = folder.rel_path
        .replace(/\\/g, '/')
        .replace(/\/$/, '')
        .split('/')
        .filter(Boolean);
      return {
        folder,
        depth: Math.max(0, segments.length - 1),
        displayName: folder.name,
      };
    });
}

/**
 * Collect unique source folder paths from the files being moved.
 * Normalises path separators for reliable comparison.
 */
function getSourceFolders(files: FileEntry[]): Set<string> {
  const paths = new Set<string>();
  for (const file of files) {
    const normalized = file.path.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash > 0) {
      paths.add(normalized.substring(0, lastSlash));
    }
  }
  return paths;
}

// =============================================================================
// Inline styles (no CSS import, all classes prefixed gallery-move-*)
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
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
    width: 460,
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
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
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 20px',
    gap: 12,
  },
  label: {
    fontSize: 12,
    color: 'var(--color-text-muted, #888)',
    marginBottom: 4,
  },
  folderList: {
    flex: 1,
    minHeight: 0,
    maxHeight: 280,
    overflowY: 'auto',
    border: '1px solid var(--color-border, #333)',
    borderRadius: 4,
    background: 'var(--color-bg-primary, #141420)',
  },
  folderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    cursor: 'pointer',
    borderRadius: 3,
    margin: '1px 2px',
    transition: 'background 0.1s',
  },
  folderRowSelected: {
    background: 'var(--color-accent, #3b82f6)',
    color: '#fff',
  },
  folderRowDimmed: {
    opacity: 0.4,
    cursor: 'default',
  },
  folderRowHover: {
    background: 'var(--color-bg-hover, rgba(255,255,255,0.06))',
  },
  conflictRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  select: {
    flex: 1,
    background: 'var(--color-bg-primary, #141420)',
    color: 'var(--color-text, #e0e0e0)',
    border: '1px solid var(--color-border, #333)',
    borderRadius: 4,
    padding: '5px 8px',
    fontSize: 13,
    outline: 'none',
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
  resultBox: {
    padding: '10px 14px',
    borderRadius: 4,
    background: 'var(--color-bg-primary, #141420)',
    border: '1px solid var(--color-border, #333)',
    fontSize: 12,
    lineHeight: 1.6,
  },
  errorList: {
    maxHeight: 120,
    overflowY: 'auto',
    marginTop: 8,
    padding: '6px 10px',
    background: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 4,
    fontSize: 11,
    color: '#f87171',
  },
};

// =============================================================================
// Component
// =============================================================================

export function MoveDialog({
  files,
  orchestratorUrl,
  projectPath,
  folderTree,
  onClose,
  onMoved,
}: MoveDialogProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictStrategy>('skip');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MoveFilesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  // Flatten folders for the picker
  const flatFolders = useMemo(() => flattenFolders(folderTree), [folderTree]);

  // Source folder paths — moving to the same folder is pointless
  const sourceFolders = useMemo(() => getSourceFolders(files), [files]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Auto-close after successful move (no errors) with 1.5s delay
  useEffect(() => {
    if (result && result.errors.length === 0) {
      const timer = setTimeout(() => {
        onClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [result, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  const handleFolderSelect = useCallback(
    (folderPath: string) => {
      const normalized = folderPath.replace(/\\/g, '/');
      // Don't allow selecting source folders
      if (sourceFolders.has(normalized)) return;
      setSelectedPath(folderPath);
    },
    [sourceFolders],
  );

  const handleMove = useCallback(async () => {
    if (!selectedPath || loading) return;

    const filePaths = files.map((f) => f.path);
    setLoading(true);
    setError(null);

    try {
      const res = await moveFiles(
        orchestratorUrl,
        filePaths,
        selectedPath,
        projectPath,
        conflict,
      );
      setResult(res);
      if (res.moved.length > 0) {
        onMoved();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Move operation failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [selectedPath, loading, files, orchestratorUrl, projectPath, conflict, onMoved]);

  // ---- Render ----

  const canMove = selectedPath !== null && !loading && !result;

  const dialog = (
    <div
      className="gallery-move-overlay"
      style={styles.overlay}
      onClick={handleBackdropClick}
    >
      <div
        className="gallery-move-dialog"
        style={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`Move ${files.length} file(s)`}
      >
        {/* Header */}
        <div className="gallery-move-header" style={styles.header}>
          Move {files.length} file{files.length !== 1 ? 's' : ''}
        </div>

        {/* Body */}
        <div className="gallery-move-body" style={styles.body}>
          {/* Result summary (shown after move completes) */}
          {result && (
            <div className="gallery-move-result" style={styles.resultBox}>
              <div>
                <Check size={13} style={{ verticalAlign: 'middle', marginRight: 4, color: '#4ade80' }} />
                Moved {result.moved.length}
                {result.skipped.length > 0 && `, Skipped ${result.skipped.length}`}
                {result.errors.length > 0 && (
                  <span style={{ color: '#f87171' }}>, Errors {result.errors.length}</span>
                )}
              </div>
              {result.errors.length > 0 && (
                <div className="gallery-move-errors" style={styles.errorList}>
                  {result.errors.map((errMsg, i) => (
                    <div key={i}>{errMsg}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error from fetch failure */}
          {error && !result && (
            <div
              className="gallery-move-error"
              style={{ ...styles.resultBox, borderColor: '#ef4444', color: '#f87171' }}
            >
              {error}
            </div>
          )}

          {/* Folder picker (hidden after completion) */}
          {!result && (
            <>
              <div>
                <div style={styles.label}>Destination folder</div>
                <div className="gallery-move-folder-list" style={styles.folderList}>
                  {flatFolders.map((item) => {
                    const normalizedPath = item.folder.path.replace(/\\/g, '/');
                    const isSource = sourceFolders.has(normalizedPath);
                    const isSelected = selectedPath === item.folder.path;
                    const isHovered = hoveredPath === item.folder.path && !isSource && !isSelected;

                    const rowStyle: React.CSSProperties = {
                      ...styles.folderRow,
                      paddingLeft: `${item.depth * 18 + 10}px`,
                      ...(isSelected ? styles.folderRowSelected : {}),
                      ...(isSource ? styles.folderRowDimmed : {}),
                      ...(isHovered ? styles.folderRowHover : {}),
                    };

                    return (
                      <div
                        key={item.folder.path}
                        className={
                          'gallery-move-folder-row' +
                          (isSelected ? ' gallery-move-folder-row--selected' : '') +
                          (isSource ? ' gallery-move-folder-row--dimmed' : '')
                        }
                        style={rowStyle}
                        onClick={() => handleFolderSelect(item.folder.path)}
                        onMouseEnter={() => setHoveredPath(item.folder.path)}
                        onMouseLeave={() => setHoveredPath(null)}
                        title={isSource ? 'Source folder (cannot move here)' : item.folder.rel_path}
                      >
                        <Folder size={14} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.displayName}
                        </span>
                        {isSelected && <Check size={14} />}
                      </div>
                    );
                  })}
                  {flatFolders.length === 0 && (
                    <div style={{ padding: '12px 14px', color: 'var(--color-text-muted, #666)' }}>
                      No folders available
                    </div>
                  )}
                </div>
              </div>

              {/* Conflict resolution */}
              <div>
                <div style={styles.label}>If file already exists</div>
                <div className="gallery-move-conflict" style={styles.conflictRow}>
                  <select
                    className="gallery-move-select"
                    style={styles.select}
                    value={conflict}
                    onChange={(e) => setConflict(e.target.value as ConflictStrategy)}
                  >
                    <option value="skip">Skip existing</option>
                    <option value="overwrite">Overwrite</option>
                    <option value="rename">Auto-rename</option>
                  </select>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="gallery-move-footer" style={styles.footer}>
          <button
            className="gallery-move-btn gallery-move-btn--cancel"
            style={styles.btn}
            onClick={onClose}
            type="button"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              className="gallery-move-btn gallery-move-btn--move"
              style={{
                ...styles.btn,
                ...styles.btnPrimary,
                ...(canMove ? {} : styles.btnDisabled),
              }}
              onClick={handleMove}
              disabled={!canMove}
              type="button"
            >
              {loading ? 'Moving...' : 'Move'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
