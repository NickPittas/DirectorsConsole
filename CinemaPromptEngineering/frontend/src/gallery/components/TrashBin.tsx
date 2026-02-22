/**
 * TrashBin — Modal overlay showing the project's trash contents.
 *
 * Displays all trashed files with selection checkboxes, allowing the
 * user to restore selected files or permanently empty the entire trash.
 * Rendered via createPortal into document.body with a dark backdrop.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { listTrash, restoreFiles, emptyTrash } from '../services/gallery-service';
import type { TrashEntry } from '../services/gallery-service';

// =============================================================================
// Types
// =============================================================================

interface TrashBinProps {
  orchestratorUrl: string;
  projectPath: string;
  onClose: () => void;
  onRestored: () => void;
}

interface ActionResult {
  type: 'restore' | 'empty';
  restoredCount: number;
  errorCount: number;
  message: string;
}

// =============================================================================
// Helpers
// =============================================================================

function formatFileSize(bytes: number): string {
  if (bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTrashedDate(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function extractFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

// =============================================================================
// Component
// =============================================================================

export function TrashBin({
  orchestratorUrl,
  projectPath,
  onClose,
  onRestored,
}: TrashBinProps) {
  const [files, setFiles] = useState<TrashEntry[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);

  // Track the latest fetch so stale responses can be discarded.
  const requestIdRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Fetch trash contents
  // ---------------------------------------------------------------------------

  const fetchTrash = useCallback(async () => {
    const currentRequestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);
    setActionResult(null);

    try {
      const result = await listTrash(orchestratorUrl, projectPath);

      // Guard against stale responses.
      if (currentRequestId !== requestIdRef.current) return;

      if (!result.success) {
        setError(result.message || 'Failed to load trash contents.');
        setFiles([]);
        setTotalSize(0);
      } else {
        setFiles(result.files);
        setTotalSize(result.total_size);
        setSelected(new Set());
      }
    } catch (err: unknown) {
      if (currentRequestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load trash contents.');
      setFiles([]);
      setTotalSize(0);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [orchestratorUrl, projectPath]);

  useEffect(() => {
    fetchTrash();
  }, [fetchTrash]);

  // ---------------------------------------------------------------------------
  // Close on Escape
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (confirmingEmpty) {
          setConfirmingEmpty(false);
        } else {
          onClose();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, confirmingEmpty]);

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------

  const toggleSelect = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === files.length) {
        return new Set();
      }
      return new Set(files.map((f) => f.path));
    });
  }, [files]);

  // ---------------------------------------------------------------------------
  // Restore selected
  // ---------------------------------------------------------------------------

  const handleRestore = useCallback(async () => {
    if (selected.size === 0 || actionLoading) return;

    setActionLoading(true);
    setActionResult(null);

    try {
      const result = await restoreFiles(orchestratorUrl, Array.from(selected), projectPath);
      setActionResult({
        type: 'restore',
        restoredCount: result.restored.length,
        errorCount: result.errors.length,
        message: result.message,
      });
      await fetchTrash();
      onRestored();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Restore failed.';
      setActionResult({
        type: 'restore',
        restoredCount: 0,
        errorCount: selected.size,
        message,
      });
    } finally {
      setActionLoading(false);
    }
  }, [selected, actionLoading, orchestratorUrl, projectPath, fetchTrash, onRestored]);

  // ---------------------------------------------------------------------------
  // Empty trash
  // ---------------------------------------------------------------------------

  const handleEmptyTrash = useCallback(async () => {
    if (actionLoading) return;

    setActionLoading(true);
    setActionResult(null);
    setConfirmingEmpty(false);

    try {
      const result = await emptyTrash(orchestratorUrl, projectPath);
      setActionResult({
        type: 'empty',
        restoredCount: 0,
        errorCount: result.success ? 0 : 1,
        message: result.message,
      });
      await fetchTrash();
      onRestored();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Empty trash failed.';
      setActionResult({
        type: 'empty',
        restoredCount: 0,
        errorCount: 1,
        message,
      });
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, orchestratorUrl, projectPath, fetchTrash, onRestored]);

  // ---------------------------------------------------------------------------
  // Backdrop click
  // ---------------------------------------------------------------------------

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const allSelected = files.length > 0 && selected.size === files.length;
  const someSelected = selected.size > 0 && selected.size < files.length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return createPortal(
    <div
      className="gallery-trash-backdrop"
      onClick={handleBackdropClick}
      style={backdropStyle}
    >
      <div className="gallery-trash-panel" style={panelStyle}>
        {/* Header */}
        <div className="gallery-trash-header" style={headerStyle}>
          <div style={headerLeftStyle}>
            <Trash2 size={18} style={{ color: '#f87171', flexShrink: 0 }} />
            <h3 style={titleStyle}>Trash</h3>
            {!loading && (
              <span className="gallery-trash-badge" style={badgeStyle}>
                {files.length} file{files.length !== 1 ? 's' : ''}
                {totalSize > 0 && <span style={badgeSizeStyle}> &middot; {formatFileSize(totalSize)}</span>}
              </span>
            )}
          </div>
          <button
            className="gallery-trash-close-btn"
            type="button"
            onClick={onClose}
            style={closeButtonStyle}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Action result banner */}
        {actionResult && (
          <div
            className="gallery-trash-result"
            style={{
              ...resultBannerStyle,
              borderColor: actionResult.errorCount > 0 ? '#f87171' : '#4ade80',
              background: actionResult.errorCount > 0 ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)',
            }}
          >
            <span style={{ fontSize: '13px', color: '#e0e0e0' }}>
              {actionResult.type === 'restore' && actionResult.restoredCount > 0 && (
                <>Restored {actionResult.restoredCount} file{actionResult.restoredCount !== 1 ? 's' : ''}. </>
              )}
              {actionResult.errorCount > 0 && (
                <>{actionResult.errorCount} error{actionResult.errorCount !== 1 ? 's' : ''}. </>
              )}
              {actionResult.type === 'empty' && actionResult.errorCount === 0 && (
                <>Trash emptied. </>
              )}
            </span>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="gallery-trash-loading" style={centeredMessageStyle}>
            <span style={spinnerStyle} />
            <span style={{ color: '#aaa', fontSize: '14px' }}>Loading trash contents...</span>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="gallery-trash-error" style={centeredMessageStyle}>
            <AlertTriangle size={24} style={{ color: '#f87171' }} />
            <span style={{ color: '#f87171', fontSize: '14px' }}>{error}</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && files.length === 0 && (
          <div className="gallery-trash-empty" style={centeredMessageStyle}>
            <Trash2 size={32} style={{ color: '#555' }} />
            <span style={{ color: '#888', fontSize: '14px', marginTop: '8px' }}>
              Trash is empty
            </span>
          </div>
        )}

        {/* File list */}
        {!loading && !error && files.length > 0 && (
          <>
            {/* Select all / toolbar */}
            <div className="gallery-trash-toolbar" style={toolbarStyle}>
              <label style={selectAllLabelStyle}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleSelectAll}
                  style={checkboxStyle}
                />
                <span style={{ fontSize: '13px', color: '#aaa' }}>
                  {allSelected ? 'Deselect all' : 'Select all'}
                </span>
              </label>

              <div style={toolbarActionsStyle}>
                <button
                  className="gallery-trash-restore-btn"
                  type="button"
                  onClick={handleRestore}
                  disabled={selected.size === 0 || actionLoading}
                  style={{
                    ...restoreButtonStyle,
                    opacity: selected.size === 0 || actionLoading ? 0.4 : 1,
                    cursor: selected.size === 0 || actionLoading ? 'not-allowed' : 'pointer',
                  }}
                  title="Restore selected files"
                >
                  <RotateCcw size={14} />
                  <span>
                    {actionLoading ? 'Restoring...' : `Restore${selected.size > 0 ? ` (${selected.size})` : ''}`}
                  </span>
                </button>

                <button
                  className="gallery-trash-empty-btn"
                  type="button"
                  onClick={() => setConfirmingEmpty(true)}
                  disabled={actionLoading}
                  style={{
                    ...emptyButtonStyle,
                    opacity: actionLoading ? 0.4 : 1,
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                  }}
                  title="Permanently delete all files"
                >
                  <Trash2 size={14} />
                  <span>Empty Trash</span>
                </button>
              </div>
            </div>

            {/* Scrollable file list */}
            <div className="gallery-trash-list" style={listContainerStyle}>
              {files.map((entry) => {
                const isSelected = selected.has(entry.path);
                return (
                  <div
                    key={entry.path}
                    className="gallery-trash-row"
                    style={{
                      ...rowStyle,
                      background: isSelected ? 'rgba(59,130,246,0.1)' : 'transparent',
                    }}
                    onClick={() => toggleSelect(entry.path)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(entry.path)}
                      onClick={(e) => e.stopPropagation()}
                      style={checkboxStyle}
                    />
                    <div style={rowInfoStyle}>
                      <span className="gallery-trash-filename" style={fileNameStyle}>
                        {extractFileName(entry.name)}
                      </span>
                      <span className="gallery-trash-original-path" style={originalPathStyle} title={entry.original_path}>
                        {entry.original_path}
                      </span>
                    </div>
                    <span className="gallery-trash-size" style={sizeStyle}>
                      {formatFileSize(entry.size)}
                    </span>
                    <span className="gallery-trash-date" style={dateStyle} title={entry.trashed_at}>
                      {formatTrashedDate(entry.trashed_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Empty trash confirmation overlay */}
        {confirmingEmpty && (
          <div className="gallery-trash-confirm-backdrop" style={confirmBackdropStyle}>
            <div className="gallery-trash-confirm-dialog" style={confirmDialogStyle}>
              <AlertTriangle size={28} style={{ color: '#f87171', flexShrink: 0 }} />
              <div style={confirmTextStyle}>
                <strong style={{ color: '#fff', fontSize: '14px' }}>Permanently delete all {files.length} file{files.length !== 1 ? 's' : ''}?</strong>
                <span style={{ color: '#aaa', fontSize: '13px', marginTop: '4px' }}>
                  This action cannot be undone.
                </span>
              </div>
              <div style={confirmButtonsStyle}>
                <button
                  type="button"
                  onClick={() => setConfirmingEmpty(false)}
                  style={confirmCancelStyle}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEmptyTrash}
                  style={confirmDeleteStyle}
                >
                  Delete All
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// =============================================================================
// Inline styles
// =============================================================================

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
};

const panelStyle: React.CSSProperties = {
  position: 'relative',
  background: '#1e1e2e',
  borderRadius: '10px',
  width: '680px',
  maxWidth: '95vw',
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
  color: '#e0e0e0',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: '1px solid #333',
  flexShrink: 0,
};

const headerLeftStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '16px',
  fontWeight: 600,
  color: '#fff',
};

const badgeStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#aaa',
  background: '#2a2a3e',
  padding: '2px 8px',
  borderRadius: '10px',
};

const badgeSizeStyle: React.CSSProperties = {
  color: '#888',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#888',
  cursor: 'pointer',
  padding: '4px',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const resultBannerStyle: React.CSSProperties = {
  padding: '8px 20px',
  borderBottom: '1px solid #333',
  borderLeft: '3px solid',
  flexShrink: 0,
};

const centeredMessageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '48px 20px',
  gap: '12px',
  flex: 1,
};

const spinnerStyle: React.CSSProperties = {
  display: 'inline-block',
  width: '24px',
  height: '24px',
  border: '2px solid #444',
  borderTopColor: '#3b82f6',
  borderRadius: '50%',
  animation: 'gallery-trash-spin 0.8s linear infinite',
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 20px',
  borderBottom: '1px solid #2a2a3e',
  flexShrink: 0,
  gap: '12px',
};

const selectAllLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  cursor: 'pointer',
  userSelect: 'none',
};

const checkboxStyle: React.CSSProperties = {
  width: '15px',
  height: '15px',
  accentColor: '#3b82f6',
  cursor: 'pointer',
  flexShrink: 0,
};

const toolbarActionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const restoreButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '5px 12px',
  fontSize: '13px',
  background: '#2563eb',
  border: 'none',
  borderRadius: '4px',
  color: '#fff',
  fontWeight: 500,
};

const emptyButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '5px 12px',
  fontSize: '13px',
  background: '#991b1b',
  border: 'none',
  borderRadius: '4px',
  color: '#fff',
  fontWeight: 500,
};

const listContainerStyle: React.CSSProperties = {
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '8px 20px',
  borderBottom: '1px solid #2a2a3e',
  cursor: 'pointer',
  transition: 'background 0.1s',
};

const rowInfoStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

const fileNameStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: '#e0e0e0',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const originalPathStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#666',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const sizeStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#888',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  minWidth: '60px',
  textAlign: 'right',
};

const dateStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#888',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  minWidth: '80px',
  textAlign: 'right',
};

const confirmBackdropStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '10px',
  zIndex: 1,
};

const confirmDialogStyle: React.CSSProperties = {
  background: '#252535',
  borderRadius: '8px',
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
  maxWidth: '360px',
  width: '90%',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
};

const confirmTextStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: '4px',
};

const confirmButtonsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  marginTop: '8px',
};

const confirmCancelStyle: React.CSSProperties = {
  padding: '6px 18px',
  fontSize: '13px',
  background: 'transparent',
  border: '1px solid #555',
  borderRadius: '4px',
  color: '#ccc',
  cursor: 'pointer',
};

const confirmDeleteStyle: React.CSSProperties = {
  padding: '6px 18px',
  fontSize: '13px',
  background: '#dc2626',
  border: 'none',
  borderRadius: '4px',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

// =============================================================================
// Global keyframe injection (spinner animation)
// =============================================================================

const STYLE_ID = 'gallery-trash-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `@keyframes gallery-trash-spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}
