import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { batchRename } from '../services/gallery-service';
import type { FileEntry, BatchRenamePreview } from '../services/gallery-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BatchRenameDialogProps {
  files: FileEntry[];
  orchestratorUrl: string;
  projectPath: string;
  onClose: () => void;
  onRenamed: () => void;
}

type DialogPhase = 'input' | 'previewed' | 'applying' | 'done';

// ---------------------------------------------------------------------------
// Available tokens — single source of truth for UI and validation
// ---------------------------------------------------------------------------

const TOKENS: { token: string; description: string }[] = [
  { token: '{original}', description: 'Original filename (no extension)' },
  { token: '{index}', description: 'Sequential number (auto-padded)' },
  { token: '{date}', description: 'File date (YYYY-MM-DD)' },
  { token: '{time}', description: 'File time (HHMMSS)' },
  { token: '{year}', description: 'Year (YYYY)' },
  { token: '{month}', description: 'Month (MM)' },
  { token: '{day}', description: 'Day (DD)' },
  { token: '{project}', description: 'Project name' },
  { token: '{folder}', description: 'Parent folder name' },
  { token: '{ext}', description: 'Original extension without dot (e.g. png)' },
];

// ---------------------------------------------------------------------------
// Inline styles (no CSS import)
// ---------------------------------------------------------------------------

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  dialog: {
    background: 'var(--color-bg-secondary, #1e1e1e)',
    border: '1px solid var(--color-border, #333)',
    borderRadius: '10px',
    width: '660px',
    maxWidth: '90vw',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 20px 12px',
    borderBottom: '1px solid var(--color-border, #333)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--color-text-primary, #eee)',
  },
  body: {
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '14px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '5px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--color-text-secondary, #bbb)',
  },
  input: {
    height: '34px',
    lineHeight: '34px',
    padding: '0 10px',
    background: 'var(--color-bg-tertiary, #2a2a2a)',
    border: '1px solid var(--color-border, #444)',
    borderRadius: '5px',
    color: 'var(--color-text-primary, #eee)',
    fontSize: '13px',
    outline: 'none',
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  inputSmall: {
    width: '80px',
  },
  row: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-end',
  },
  tokenGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px 8px',
    padding: '8px 10px',
    background: 'var(--color-bg-primary, #141414)',
    border: '1px solid var(--color-border, #333)',
    borderRadius: '5px',
  },
  tokenItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    lineHeight: '20px',
  },
  tokenCode: {
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: '11px',
    color: 'var(--color-accent, #5b9aff)',
    cursor: 'pointer',
    padding: '1px 5px',
    borderRadius: '3px',
    background: 'rgba(91, 154, 255, 0.1)',
    border: '1px solid rgba(91, 154, 255, 0.15)',
    transition: 'background 0.1s',
  },
  tokenDesc: {
    color: 'var(--color-text-muted, #777)',
    fontSize: '10px',
  },
  previewTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '12px',
  },
  th: {
    padding: '6px 8px',
    textAlign: 'left' as const,
    fontWeight: 500,
    fontSize: '11px',
    color: 'var(--color-text-muted, #888)',
    borderBottom: '1px solid var(--color-border, #333)',
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '5px 8px',
    color: 'var(--color-text-secondary, #bbb)',
    borderBottom: '1px solid var(--color-border, #222)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    maxWidth: '260px',
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
  },
  tdIndex: {
    width: '36px',
    textAlign: 'right' as const,
    color: 'var(--color-text-muted, #666)',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  tdArrow: {
    width: '28px',
    textAlign: 'center' as const,
    color: 'var(--color-text-muted, #555)',
  },
  tdNew: {
    color: 'var(--color-accent, #5b9aff)',
    fontWeight: 500,
  },
  previewScroll: {
    maxHeight: '240px',
    overflowY: 'auto' as const,
    border: '1px solid var(--color-border, #333)',
    borderRadius: '5px',
    background: 'var(--color-bg-primary, #141414)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    padding: '12px 20px',
    borderTop: '1px solid var(--color-border, #333)',
  },
  btn: {
    height: '32px',
    padding: '0 16px',
    borderRadius: '5px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid var(--color-border, #444)',
    background: 'var(--color-bg-tertiary, #2a2a2a)',
    color: 'var(--color-text-primary, #eee)',
    transition: 'opacity 0.12s',
    fontFamily: 'inherit',
  },
  btnPrimary: {
    background: 'var(--color-accent, #5b9aff)',
    borderColor: 'var(--color-accent, #5b9aff)',
    color: '#fff',
  },
  btnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  error: {
    padding: '8px 10px',
    background: 'rgba(218, 54, 51, 0.12)',
    border: '1px solid rgba(218, 54, 51, 0.3)',
    borderRadius: '5px',
    fontSize: '12px',
    color: '#da3633',
  },
  success: {
    padding: '8px 10px',
    background: 'rgba(63, 185, 80, 0.12)',
    border: '1px solid rgba(63, 185, 80, 0.3)',
    borderRadius: '5px',
    fontSize: '13px',
    color: '#3fb950',
    fontWeight: 500,
    textAlign: 'center' as const,
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the {project} token in a pattern using the project path or
 * saved project settings. Returns the pattern with {project} replaced
 * by the actual project name.
 */
function resolveProjectToken(pattern: string, projectPath: string): string {
  if (!pattern.includes('{project}')) return pattern;

  let projectName = '';

  // Try saved project settings first
  try {
    const saved = localStorage.getItem('storyboard_project_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.name && typeof parsed.name === 'string') {
        projectName = parsed.name;
      }
    }
  } catch {
    // Ignore localStorage errors
  }

  // Fall back to last segment of projectPath
  if (!projectName && projectPath) {
    const segments = projectPath.replace(/[\\/]+$/, '').split(/[\\/]/);
    projectName = segments[segments.length - 1] || '';
  }

  // Default if still empty
  if (!projectName) {
    projectName = 'project';
  }

  return pattern.replace(/\{project\}/g, projectName);
}

/**
 * Sanitize user input: strip path separators and other filesystem-unsafe chars.
 * Tokens like {index} are preserved — we only strip raw characters.
 */
function sanitizePattern(raw: string): string {
  // Remove / and \ (path separators) — these cause the rename to fail
  // or create subdirectories instead of renaming
  return raw.replace(/[/\\]/g, '');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BatchRenameDialog({
  files,
  orchestratorUrl,
  projectPath,
  onClose,
  onRenamed,
}: BatchRenameDialogProps) {
  const [pattern, setPattern] = useState('{original}');
  const [startIndex, setStartIndex] = useState(1);
  const [padWidth, setPadWidth] = useState(3);
  const [phase, setPhase] = useState<DialogPhase>('input');
  const [previews, setPreviews] = useState<BatchRenamePreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [renamedCount, setRenamedCount] = useState(0);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewAbortRef = useRef<AbortController | null>(null);

  // Sort files by creation time — so {index} follows chronological order
  const filePaths = useMemo(
    () => [...files].sort((a, b) => a.created - b.created).map((f) => f.path),
    [files],
  );

  /**
   * Resolve {project} client-side, then sanitize.
   * The backend handles all other tokens.
   */
  const resolvedPattern = useMemo(
    () => sanitizePattern(resolveProjectToken(pattern, projectPath)),
    [pattern, projectPath],
  );

  // Insert a token at the current cursor position in the input
  const insertToken = useCallback((token: string) => {
    const input = inputRef.current;
    if (!input) {
      setPattern((prev) => prev + token);
      return;
    }
    const start = input.selectionStart ?? pattern.length;
    const end = input.selectionEnd ?? pattern.length;
    const before = pattern.slice(0, start);
    const after = pattern.slice(end);
    const newPattern = before + token + after;
    setPattern(newPattern);
    // Restore cursor position after React re-renders
    requestAnimationFrame(() => {
      const newPos = start + token.length;
      input.setSelectionRange(newPos, newPos);
      input.focus();
    });
  }, [pattern]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Auto-close after success
  useEffect(() => {
    if (phase !== 'done') return;
    const timer = setTimeout(() => {
      onRenamed();
      onClose();
    }, 1500);
    return () => clearTimeout(timer);
  }, [phase, onRenamed, onClose]);

  // Auto-preview with debounce — fires silently in background
  useEffect(() => {
    if (phase === 'applying' || phase === 'done') return;
    if (!resolvedPattern.trim() || filePaths.length === 0) {
      setPreviews([]);
      return;
    }

    // Cancel any in-flight preview request
    if (previewAbortRef.current) {
      previewAbortRef.current.abort();
    }

    const controller = new AbortController();
    previewAbortRef.current = controller;

    const timer = setTimeout(async () => {
      if (controller.signal.aborted) return;
      setError(null);
      try {
        const result = await batchRename(
          orchestratorUrl,
          filePaths,
          resolvedPattern,
          startIndex,
          padWidth,
          projectPath,
          true, // dry_run
        );
        if (controller.signal.aborted) return;
        if (!result.success) {
          setError(result.message || 'Preview failed.');
          setPreviews([]);
          return;
        }
        setPreviews(result.previews);
        setPhase('previewed');
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setPreviews([]);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedPattern, startIndex, padWidth, orchestratorUrl, filePaths, projectPath]);

  const handleApply = useCallback(async () => {
    setPhase('applying');
    setError(null);
    try {
      const result = await batchRename(
        orchestratorUrl,
        filePaths,
        resolvedPattern,
        startIndex,
        padWidth,
        projectPath,
        false, // not dry_run
      );
      if (!result.success) {
        setError(result.message || 'Rename failed.');
        setPhase('previewed');
        return;
      }
      if (result.errors.length > 0) {
        setError(`Renamed ${result.renamed} files, but ${result.errors.length} error(s): ${result.errors[0]}`);
        setPhase('previewed');
        return;
      }
      setRenamedCount(result.renamed);
      setPhase('done');

      // Notify Storyboard about renamed files so it can update panel references
      if (result.previews && result.previews.length > 0) {
        const renameMap: Record<string, string> = {};
        for (const p of result.previews) {
          if (p.old_path !== p.new_path) {
            renameMap[p.old_path] = p.new_path;
          }
        }
        if (Object.keys(renameMap).length > 0) {
          window.dispatchEvent(new CustomEvent('gallery:files-renamed', {
            detail: { renameMap },
          }));
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhase('previewed');
    }
  }, [orchestratorUrl, filePaths, resolvedPattern, startIndex, padWidth, projectPath]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  const isApplying = phase === 'applying';
  const inputsDisabled = isApplying || phase === 'done';
  const canApply = (phase === 'previewed') && previews.length > 0 && !isApplying;

  const content = (
    <div
      className="gallery-batch-rename-backdrop"
      style={styles.backdrop}
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="gallery-batch-rename-dialog"
        style={styles.dialog}
        onKeyDown={(e) => {
          // Stop all key events from reaching the global gallery keyboard handler.
          // Without this, typing numbers would set ratings, 't' toggles timeline, etc.
          if (e.key !== 'Escape') {
            e.stopPropagation();
          }
        }}
      >
        {/* Header */}
        <div className="gallery-batch-rename-header" style={styles.header}>
          Batch Rename {files.length} file{files.length !== 1 ? 's' : ''}
        </div>

        {/* Body */}
        <div className="gallery-batch-rename-body" style={styles.body}>
          {/* Pattern input */}
          <div className="gallery-batch-rename-field" style={styles.fieldGroup}>
            <label className="gallery-batch-rename-label" style={styles.label}>
              Naming Pattern
            </label>
            <input
              ref={inputRef}
              className="gallery-batch-rename-input"
              style={styles.input}
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Background_{index}"
              disabled={inputsDisabled}
              autoFocus
            />
          </div>

          {/* Token reference — clickable to insert */}
          <div style={styles.tokenGrid}>
            {TOKENS.map(({ token, description }) => (
              <span key={token} style={styles.tokenItem}>
                <code
                  style={styles.tokenCode}
                  title={`Click to insert ${token}`}
                  onClick={() => insertToken(token)}
                  onMouseOver={(e) => {
                    (e.target as HTMLElement).style.background = 'rgba(91, 154, 255, 0.25)';
                  }}
                  onMouseOut={(e) => {
                    (e.target as HTMLElement).style.background = 'rgba(91, 154, 255, 0.1)';
                  }}
                >
                  {token}
                </code>
                <span style={styles.tokenDesc}>{description}</span>
              </span>
            ))}
          </div>

          {/* Start index + padding width */}
          <div style={styles.row}>
            <div className="gallery-batch-rename-field" style={styles.fieldGroup}>
              <label className="gallery-batch-rename-label" style={styles.label}>
                Start At
              </label>
              <input
                className="gallery-batch-rename-input"
                style={{ ...styles.input, ...styles.inputSmall }}
                type="number"
                min={0}
                value={startIndex}
                onChange={(e) => setStartIndex(parseInt(e.target.value, 10) || 0)}
                disabled={inputsDisabled}
              />
            </div>
            <div className="gallery-batch-rename-field" style={styles.fieldGroup}>
              <label className="gallery-batch-rename-label" style={styles.label}>
                Padding (digits)
              </label>
              <input
                className="gallery-batch-rename-input"
                style={{ ...styles.input, ...styles.inputSmall }}
                type="number"
                min={1}
                max={6}
                value={padWidth}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v >= 1 && v <= 6) setPadWidth(v);
                }}
                disabled={inputsDisabled}
              />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted, #888)', paddingBottom: '7px' }}>
              e.g. {String(startIndex).padStart(padWidth, '0')}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="gallery-batch-rename-error" style={styles.error}>
              {error}
            </div>
          )}

          {/* Preview table — always visible */}
          {phase !== 'done' && (
            <div className="gallery-batch-rename-preview" style={styles.previewScroll}>
              {previews.length > 0 ? (
                <table className="gallery-batch-rename-table" style={styles.previewTable}>
                  <thead>
                    <tr>
                      <th style={{ ...styles.th, ...styles.tdIndex }}>#</th>
                      <th style={styles.th}>Old Name</th>
                      <th style={{ ...styles.th, ...styles.tdArrow }}></th>
                      <th style={styles.th}>New Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previews.map((p, i) => (
                      <tr key={p.old_path}>
                        <td style={{ ...styles.td, ...styles.tdIndex }}>{i + 1}</td>
                        <td style={styles.td} title={p.old_name}>{p.old_name}</td>
                        <td style={{ ...styles.td, ...styles.tdArrow }}>&rarr;</td>
                        <td
                          style={{
                            ...styles.td,
                            ...(p.old_name !== p.new_name ? styles.tdNew : {}),
                          }}
                          title={p.new_name}
                        >
                          {p.new_name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted, #666)', fontSize: '12px' }}>
                  {pattern.trim()
                    ? 'Updating preview...'
                    : 'Type a pattern or click a token to get started'}
                </div>
              )}
            </div>
          )}

          {/* Success */}
          {phase === 'done' && (
            <div className="gallery-batch-rename-success" style={styles.success}>
              Renamed {renamedCount} file{renamedCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Footer */}
        {phase !== 'done' && (
          <div className="gallery-batch-rename-footer" style={styles.footer}>
            <button
              className="gallery-batch-rename-btn"
              style={styles.btn}
              onClick={onClose}
              disabled={isApplying}
            >
              Cancel
            </button>
            <button
              className="gallery-batch-rename-btn gallery-batch-rename-btn--primary"
              style={{
                ...styles.btn,
                ...styles.btnPrimary,
                ...(canApply ? {} : styles.btnDisabled),
              }}
              disabled={!canApply}
              onClick={handleApply}
            >
              {phase === 'applying' ? 'Renaming...' : 'Apply'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
