import { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { X, Search, CheckCircle, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  findDuplicates,
  type DuplicateGroup,
  type FindDuplicatesResult,
} from '../services/gallery-service';
import './components.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DuplicateFinderProps {
  orchestratorUrl: string;
  projectPath: string;
  currentPath: string;
  onClose: () => void;
  onTrash: (filePaths: string[]) => void;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) + ' ' + d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DuplicateFinder({
  orchestratorUrl,
  projectPath,
  currentPath,
  onClose,
  onTrash,
}: DuplicateFinderProps) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [wastedSpace, setWastedSpace] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedForTrash, setSelectedForTrash] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // ---- Scan -----------------------------------------------------------

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedForTrash(new Set());
    setExpandedGroups(new Set());
    try {
      const result: FindDuplicatesResult = await findDuplicates(
        orchestratorUrl,
        currentPath,
        projectPath,
      );
      if (result.success) {
        setGroups(result.groups);
        setWastedSpace(result.wasted_space);
        // Auto-expand all groups
        setExpandedGroups(new Set(result.groups.map((g) => g.hash)));
      } else {
        setError(result.message || 'Scan failed');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to scan for duplicates');
    } finally {
      setLoading(false);
      setScanned(true);
    }
  }, [orchestratorUrl, currentPath, projectPath]);

  // Scan on mount
  useEffect(() => {
    runScan();
  }, [runScan]);

  // ---- Keyboard -------------------------------------------------------

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // ---- Selection helpers -----------------------------------------------

  const toggleFile = useCallback((path: string) => {
    setSelectedForTrash((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((hash: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  }, []);

  const keepNewestInGroup = useCallback((group: DuplicateGroup) => {
    const sorted = [...group.files].sort((a, b) => b.modified - a.modified);
    const toSelect = sorted.slice(1).map((f) => f.path);
    setSelectedForTrash((prev) => {
      const next = new Set(prev);
      // Clear any existing selections in this group first
      group.files.forEach((f) => next.delete(f.path));
      toSelect.forEach((p) => next.add(p));
      return next;
    });
  }, []);

  const keepOldestInGroup = useCallback((group: DuplicateGroup) => {
    const sorted = [...group.files].sort((a, b) => a.modified - b.modified);
    const toSelect = sorted.slice(1).map((f) => f.path);
    setSelectedForTrash((prev) => {
      const next = new Set(prev);
      group.files.forEach((f) => next.delete(f.path));
      toSelect.forEach((p) => next.add(p));
      return next;
    });
  }, []);

  const autoSelectKeepNewestAll = useCallback(() => {
    const next = new Set<string>();
    for (const group of groups) {
      const sorted = [...group.files].sort((a, b) => b.modified - a.modified);
      sorted.slice(1).forEach((f) => next.add(f.path));
    }
    setSelectedForTrash(next);
  }, [groups]);

  const handleTrash = useCallback(() => {
    if (selectedForTrash.size === 0) return;
    onTrash(Array.from(selectedForTrash));
  }, [selectedForTrash, onTrash]);

  // ---- Thumbnail URL --------------------------------------------------

  const thumbUrl = (filePath: string) =>
    `${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(filePath)}`;

  // ---- Render ----------------------------------------------------------

  const totalFiles = groups.reduce((acc, g) => acc + g.files.length, 0);

  const modal = (
    <div className="dup-finder-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dup-finder-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dup-finder-header">
          <div className="dup-finder-header-title">
            <Search size={16} />
            <span>Duplicate Finder</span>
          </div>
          <div className="dup-finder-header-actions">
            <button className="dup-finder-scan-btn" onClick={runScan} disabled={loading}>
              <Search size={14} />
              Re-scan
            </button>
            <button className="dup-finder-close-btn" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="dup-finder-loading">
            <div className="dup-finder-spinner" />
            <span>Scanning for duplicates...</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="dup-finder-error">{error}</div>
        )}

        {/* Empty state */}
        {!loading && !error && scanned && groups.length === 0 && (
          <div className="dup-finder-empty">
            <CheckCircle size={40} />
            <span>No duplicates found</span>
          </div>
        )}

        {/* Results */}
        {!loading && !error && groups.length > 0 && (
          <>
            {/* Summary */}
            <div className="dup-finder-summary">
              <span>
                Found <strong>{groups.length}</strong> duplicate group{groups.length !== 1 ? 's' : ''}{' '}
                ({totalFiles} files, {formatFileSize(wastedSpace)} wasted)
              </span>
            </div>

            {/* Global actions */}
            <div className="dup-finder-actions">
              <button className="dup-finder-auto-btn" onClick={autoSelectKeepNewestAll}>
                Auto-select: Keep Newest
              </button>
              <div className="dup-finder-actions-right">
                <span className="dup-finder-selected-count">
                  {selectedForTrash.size} selected
                </span>
                <button
                  className="dup-finder-trash-btn"
                  disabled={selectedForTrash.size === 0}
                  onClick={handleTrash}
                >
                  <Trash2 size={14} />
                  Trash Selected
                </button>
              </div>
            </div>

            {/* Groups */}
            <div className="dup-finder-groups">
              {groups.map((group) => {
                const expanded = expandedGroups.has(group.hash);
                return (
                  <div className="dup-finder-group" key={group.hash}>
                    <button
                      className="dup-finder-group-header"
                      onClick={() => toggleGroup(group.hash)}
                    >
                      <span className="dup-finder-group-chevron">
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      <span className="dup-finder-group-info">
                        <strong>{group.files.length} copies</strong>
                        <span className="dup-finder-group-size">{formatFileSize(group.size)} each</span>
                      </span>
                      <span className="dup-finder-group-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="dup-finder-keep-btn"
                          onClick={() => keepNewestInGroup(group)}
                          title="Select all except the newest file"
                        >
                          Keep Newest
                        </button>
                        <button
                          className="dup-finder-keep-btn"
                          onClick={() => keepOldestInGroup(group)}
                          title="Select all except the oldest file"
                        >
                          Keep Oldest
                        </button>
                      </span>
                    </button>

                    {expanded && (
                      <div className="dup-finder-file-list">
                        {group.files.map((file) => {
                          const isSelected = selectedForTrash.has(file.path);
                          return (
                            <label
                              className={`dup-finder-file${isSelected ? ' dup-finder-file--selected' : ''}`}
                              key={file.path}
                            >
                              <input
                                type="checkbox"
                                className="dup-finder-file-check"
                                checked={isSelected}
                                onChange={() => toggleFile(file.path)}
                              />
                              <img
                                className="dup-finder-file-thumb"
                                src={thumbUrl(file.path)}
                                alt={file.name}
                                loading="lazy"
                              />
                              <div className="dup-finder-file-info">
                                <span className="dup-finder-file-name">{file.name}</span>
                                <span className="dup-finder-file-path">{file.path}</span>
                                <span className="dup-finder-file-date">{formatDate(file.modified)}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
