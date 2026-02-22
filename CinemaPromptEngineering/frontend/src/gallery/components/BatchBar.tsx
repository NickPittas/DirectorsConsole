import { useState, useEffect, useRef, useCallback } from 'react';
import { Star, Tag, FolderOpen, Trash2, CheckSquare, XSquare, Columns } from 'lucide-react';
import { useGalleryStore } from '../store/gallery-store';
import { setRatings, updateFileTags } from '../services/gallery-service';
import './components.css';

interface BatchBarProps {
  orchestratorUrl: string;
  projectPath: string;
  totalFiles: number;
  allFilePaths: string[];
  onMove: (filePaths: string[]) => void;
  onTrash: (filePaths: string[]) => void;
  onCompare: (filePaths: string[]) => void;
  onRefresh: () => void;
}

/**
 * Derive a relative path by stripping the projectPath prefix.
 * E.g. "/projects/foo/bar/image.png" with projectPath "/projects/foo"
 * → "bar/image.png"
 */
function toRelPath(filePath: string, projectPath: string): string {
  const idx = filePath.indexOf(projectPath);
  if (idx === -1) return filePath;
  let rel = filePath.slice(idx + projectPath.length);
  if (rel.startsWith('/') || rel.startsWith('\\')) {
    rel = rel.slice(1);
  }
  return rel;
}

export function BatchBar({
  orchestratorUrl,
  projectPath,
  totalFiles,
  allFilePaths,
  onMove,
  onTrash,
  onCompare,
  onRefresh,
}: BatchBarProps) {
  const selectedFiles = useGalleryStore((s) => s.selectedFiles);
  const selectAll = useGalleryStore((s) => s.selectAll);
  const clearSelection = useGalleryStore((s) => s.clearSelection);
  const allTags = useGalleryStore((s) => s.allTags);

  const [rateOpen, setRateOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const rateRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (rateRef.current && !rateRef.current.contains(e.target as Node)) {
        setRateOpen(false);
      }
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setTagOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedPaths = Array.from(selectedFiles);

  const handleSetRating = useCallback(
    async (rating: number) => {
      if (busy) return;
      setBusy(true);
      setRateOpen(false);
      try {
        const ratings: Record<string, number> = {};
        for (const fp of selectedPaths) {
          ratings[toRelPath(fp, projectPath)] = rating;
        }
        await setRatings(orchestratorUrl, projectPath, ratings);
        onRefresh();
      } catch (err) {
        console.error('BatchBar: failed to set ratings', err);
      } finally {
        setBusy(false);
      }
    },
    [busy, selectedPaths, orchestratorUrl, projectPath, onRefresh],
  );

  const handleAddTag = useCallback(
    async (tagId: number) => {
      if (busy) return;
      setBusy(true);
      setTagOpen(false);
      try {
        await Promise.all(
          selectedPaths.map((fp) =>
            updateFileTags(orchestratorUrl, projectPath, toRelPath(fp, projectPath), [tagId], 'add'),
          ),
        );
        onRefresh();
      } catch (err) {
        console.error('BatchBar: failed to add tag', err);
      } finally {
        setBusy(false);
      }
    },
    [busy, selectedPaths, orchestratorUrl, projectPath, onRefresh],
  );

  const handleRemoveTag = useCallback(
    async (tagId: number) => {
      if (busy) return;
      setBusy(true);
      setTagOpen(false);
      try {
        await Promise.all(
          selectedPaths.map((fp) =>
            updateFileTags(orchestratorUrl, projectPath, toRelPath(fp, projectPath), [tagId], 'remove'),
          ),
        );
        onRefresh();
      } catch (err) {
        console.error('BatchBar: failed to remove tag', err);
      } finally {
        setBusy(false);
      }
    },
    [busy, selectedPaths, orchestratorUrl, projectPath, onRefresh],
  );

  if (selectedFiles.size === 0) return null;

  const starOptions = [0, 1, 2, 3, 4, 5];

  return (
    <div className="batch-bar">
      {/* Selection info */}
      <div className="batch-bar-info">
        <span className="batch-bar-count">
          {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
        </span>

        {selectedFiles.size < totalFiles && (
          <button
            className="batch-bar-select-all"
            onClick={() => selectAll(allFilePaths)}
            title="Select all files"
          >
            <CheckSquare size={14} />
            Select All
          </button>
        )}

        <button
          className="batch-bar-clear"
          onClick={clearSelection}
          title="Clear selection"
        >
          <XSquare size={14} />
          Clear
        </button>
      </div>

      {/* Batch actions */}
      <div className="batch-bar-actions">
        {/* Rate dropdown */}
        <div className="batch-bar-dropdown-wrapper" ref={rateRef}>
          <button
            className="batch-bar-btn"
            onClick={() => { setRateOpen((v) => !v); setTagOpen(false); }}
            disabled={busy}
            title="Set rating on selected files"
          >
            <Star size={14} />
            Rate
          </button>
          {rateOpen && (
            <div className="batch-bar-dropdown">
              {starOptions.map((n) => (
                <button
                  key={n}
                  className="batch-bar-dropdown-item"
                  onClick={() => handleSetRating(n)}
                >
                  {n === 0 ? (
                    <span className="batch-bar-dropdown-label">No rating</span>
                  ) : (
                    <span className="batch-bar-dropdown-stars">
                      {Array.from({ length: n }, (_, i) => (
                        <Star key={i} size={12} fill="#f5c542" color="#f5c542" />
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tag dropdown */}
        <div className="batch-bar-dropdown-wrapper" ref={tagRef}>
          <button
            className="batch-bar-btn"
            onClick={() => { setTagOpen((v) => !v); setRateOpen(false); }}
            disabled={busy}
            title="Add or remove tag on selected files"
          >
            <Tag size={14} />
            Tag
          </button>
          {tagOpen && (
            <div className="batch-bar-dropdown batch-bar-dropdown--tags">
              {allTags.length === 0 ? (
                <div className="batch-bar-dropdown-empty">No tags defined</div>
              ) : (
                <>
                  <div className="batch-bar-dropdown-section-label">Add tag</div>
                  {allTags.map((t) => (
                    <button
                      key={`add-${t.id}`}
                      className="batch-bar-dropdown-item"
                      onClick={() => handleAddTag(t.id)}
                    >
                      <span
                        className="batch-bar-tag-dot"
                        style={{ background: t.color }}
                      />
                      {t.name}
                    </button>
                  ))}
                  <div className="batch-bar-dropdown-divider" />
                  <div className="batch-bar-dropdown-section-label">Remove tag</div>
                  {allTags.map((t) => (
                    <button
                      key={`rm-${t.id}`}
                      className="batch-bar-dropdown-item batch-bar-dropdown-item--remove"
                      onClick={() => handleRemoveTag(t.id)}
                    >
                      <span
                        className="batch-bar-tag-dot"
                        style={{ background: t.color }}
                      />
                      {t.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Move */}
        <button
          className="batch-bar-btn"
          onClick={() => onMove(selectedPaths)}
          disabled={busy}
          title="Move selected files"
        >
          <FolderOpen size={14} />
          Move
        </button>

        {/* Compare */}
        <button
          className="batch-bar-btn"
          onClick={() => onCompare(selectedPaths)}
          disabled={busy || selectedFiles.size !== 2}
          title={selectedFiles.size === 2 ? 'Compare selected files' : 'Select exactly 2 files to compare'}
        >
          <Columns size={14} />
          Compare
        </button>

        {/* Trash */}
        <button
          className="batch-bar-btn batch-bar-btn--danger"
          onClick={() => onTrash(selectedPaths)}
          disabled={busy}
          title="Trash selected files"
        >
          <Trash2 size={14} />
          Trash
        </button>
      </div>
    </div>
  );
}
