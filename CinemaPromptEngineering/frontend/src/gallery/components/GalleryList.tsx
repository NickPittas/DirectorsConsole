/**
 * GalleryList — Table/list view for gallery files.
 *
 * Alternative to GalleryGrid that displays files in a sortable table with
 * columns for thumbnail, name, type, size, modified date, and rating.
 * Supports the same selection model (click, Ctrl+click, Shift+click).
 */

import { useMemo, useCallback, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Star, Film, Image as ImageIcon } from 'lucide-react';
import { useGalleryStore } from '../store/gallery-store';
import type { FileEntry } from '../services/gallery-service';
import './components.css';

// =============================================================================
// Types
// =============================================================================

interface GalleryListProps {
  orchestratorUrl: string;
  projectPath: string;
  onContextMenu?: (e: React.MouseEvent, file: FileEntry) => void;
  onDoubleClick?: (file: FileEntry) => void;
}

type SortField = 'name' | 'modified' | 'created' | 'size' | 'type' | 'rating';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format a byte count into a human-readable string (B, KB, MB, GB).
 *
 * @param bytes - Raw byte count.
 * @returns Formatted string such as "1.23 MB".
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format a unix timestamp (seconds) into `YYYY-MM-DD HH:mm`.
 *
 * @param timestamp - Unix epoch in seconds.
 * @returns Formatted date string.
 */
function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Compare two files for sorting.
 *
 * @param a - First file entry.
 * @param b - Second file entry.
 * @param field - Sort field name.
 * @param direction - Sort direction ('asc' or 'desc').
 * @param ratings - External ratings map keyed by file path.
 * @returns Negative, zero, or positive comparison result.
 */
function compareFiles(
  a: FileEntry,
  b: FileEntry,
  field: string,
  direction: 'asc' | 'desc',
  ratings: Record<string, number>,
): number {
  let result = 0;

  switch (field) {
    case 'name':
      result = a.name.localeCompare(b.name, undefined, { numeric: true });
      break;
    case 'modified':
      result = a.modified - b.modified;
      break;
    case 'created':
      result = a.created - b.created;
      break;
    case 'size':
      result = a.size - b.size;
      break;
    case 'type':
      result = a.type.localeCompare(b.type) || a.extension.localeCompare(b.extension);
      break;
    case 'rating': {
      const rA = ratings[a.path] ?? a.rating ?? 0;
      const rB = ratings[b.path] ?? b.rating ?? 0;
      result = rA - rB;
      break;
    }
    default:
      result = 0;
  }

  return direction === 'desc' ? -result : result;
}

// =============================================================================
// Column definitions
// =============================================================================

interface ColumnDef {
  key: SortField | 'thumbnail';
  label: string;
  sortable: boolean;
  sortKey?: SortField;
}

const COLUMNS: ColumnDef[] = [
  { key: 'thumbnail', label: '', sortable: false },
  { key: 'name', label: 'Name', sortable: true, sortKey: 'name' },
  { key: 'type', label: 'Type', sortable: true, sortKey: 'type' },
  { key: 'size', label: 'Size', sortable: true, sortKey: 'size' },
  { key: 'created', label: 'Created', sortable: true, sortKey: 'created' },
  { key: 'modified', label: 'Modified', sortable: true, sortKey: 'modified' },
  { key: 'rating', label: 'Rating', sortable: true, sortKey: 'rating' },
];

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Inline thumbnail with error fallback to a placeholder icon.
 */
function ListThumbnail({
  file,
  orchestratorUrl,
}: {
  file: FileEntry;
  orchestratorUrl: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError || file.type === 'video') {
    const Icon = file.type === 'video' ? Film : ImageIcon;
    return (
      <div className="gallery-list-thumb-fallback">
        <Icon size={20} />
      </div>
    );
  }

  return (
    <img
      className="gallery-list-thumb-img"
      src={`${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(file.path)}`}
      alt={file.name}
      width={40}
      height={40}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

// =============================================================================
// Component
// =============================================================================

export function GalleryList({ orchestratorUrl, onContextMenu, onDoubleClick }: GalleryListProps) {
  const {
    currentFiles,
    sortField,
    sortDirection,
    filterType,
    filterRating,
    ratings,
    selectedFiles,
    lastSelectedFile,
    selectFile,
    clearSelection,
    toggleFileSelection,
    selectAll,
  } = useGalleryStore();

  const setSortField = useGalleryStore((s) => s.setSortField);
  const setSortDirection = useGalleryStore((s) => s.setSortDirection);

  // Keep a ref to the sorted/filtered list for shift-click range selection
  const sortedFilesRef = useRef<FileEntry[]>([]);

  // Virtual scroll ref
  const parentRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Filter and sort
  // ---------------------------------------------------------------------------

  const visibleFiles = useMemo(() => {
    let filtered = currentFiles;

    // Filter by type
    if (filterType === 'image') {
      filtered = filtered.filter((f) => f.type === 'image');
    } else if (filterType === 'video') {
      filtered = filtered.filter((f) => f.type === 'video');
    }

    // Filter by minimum rating
    if (filterRating > 0) {
      filtered = filtered.filter((f) => {
        const r = ratings[f.path] ?? f.rating ?? 0;
        return r >= filterRating;
      });
    }

    // Sort
    const sorted = [...filtered].sort((a, b) =>
      compareFiles(a, b, sortField, sortDirection, ratings),
    );

    sortedFilesRef.current = sorted;
    return sorted;
  }, [currentFiles, filterType, filterRating, sortField, sortDirection, ratings]);

  // ---------------------------------------------------------------------------
  // Virtual list
  // ---------------------------------------------------------------------------

  const virtualizer = useVirtualizer({
    count: visibleFiles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  // ---------------------------------------------------------------------------
  // Column header click — toggle sort field / direction
  // ---------------------------------------------------------------------------

  const handleHeaderClick = useCallback(
    (column: ColumnDef) => {
      if (!column.sortable || !column.sortKey) return;

      if (sortField === column.sortKey) {
        // Toggle direction on the same column
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        setSortField(column.sortKey);
        setSortDirection('asc');
      }
    },
    [sortField, sortDirection, setSortField, setSortDirection],
  );

  // ---------------------------------------------------------------------------
  // Row selection handlers
  // ---------------------------------------------------------------------------

  const handleRowClick = useCallback(
    (file: FileEntry, e: React.MouseEvent) => {
      if (e.shiftKey && lastSelectedFile) {
        // Range select
        const list = sortedFilesRef.current;
        const startIdx = list.findIndex((f) => f.path === lastSelectedFile);
        const endIdx = list.findIndex((f) => f.path === file.path);
        if (startIdx !== -1 && endIdx !== -1) {
          const lo = Math.min(startIdx, endIdx);
          const hi = Math.max(startIdx, endIdx);
          const rangePaths = list.slice(lo, hi + 1).map((f) => f.path);
          selectAll(rangePaths);
        }
      } else if (e.ctrlKey || e.metaKey) {
        // Toggle individual
        toggleFileSelection(file.path);
      } else {
        // Single select
        clearSelection();
        selectFile(file.path);
      }
    },
    [lastSelectedFile, clearSelection, selectFile, toggleFileSelection, selectAll],
  );

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  /** Render the sort direction indicator arrow for a column header. */
  function renderSortIndicator(column: ColumnDef): React.ReactNode {
    if (!column.sortable || sortField !== column.sortKey) return null;
    return (
      <span className="gallery-list-sort-indicator">
        {sortDirection === 'asc' ? '\u25B2' : '\u25BC'}
      </span>
    );
  }

  /** Render star icons for a file's rating. */
  function renderRating(file: FileEntry): React.ReactNode {
    const r = ratings[file.path] ?? file.rating ?? 0;
    if (r <= 0) return null;

    const stars: React.ReactNode[] = [];
    for (let i = 0; i < r; i++) {
      stars.push(
        <Star key={i} size={12} fill="#f5c542" color="#f5c542" />,
      );
    }
    return <span className="gallery-list-stars">{stars}</span>;
  }

  /** Render the type badge (colored dot + label). */
  function renderTypeBadge(file: FileEntry): React.ReactNode {
    const isVideo = file.type === 'video';
    return (
      <span className="gallery-list-type-badge">
        <span
          className="gallery-list-type-dot"
          style={{ backgroundColor: isVideo ? '#a855f7' : '#3b82f6' }}
        />
        {isVideo ? 'Video' : 'Image'}
      </span>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  if (visibleFiles.length === 0) {
    return (
      <div className="gallery-list-empty">
        {currentFiles.length === 0
          ? 'No files in this folder'
          : 'No files match the current filters'}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="gallery-list-container" ref={parentRef} style={{ overflow: 'auto', flex: 1 }}>
      {/* Sticky header — uses same flex layout + vcell widths as body rows */}
      <div className="gallery-list-header-row" style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center' }}>
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            className={
              'gallery-list-vcell gallery-list-vcell--' + col.key +
              ' gallery-list-header-cell' +
              (col.sortable ? ' gallery-list-header-cell--sortable' : '') +
              (col.sortKey && sortField === col.sortKey ? ' gallery-list-header-cell--active' : '')
            }
            onClick={() => handleHeaderClick(col)}
          >
            <span className="gallery-list-header-label">
              {col.label}
              {renderSortIndicator(col)}
            </span>
          </div>
        ))}
      </div>

      {/* Virtualized body */}
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const file = visibleFiles[virtualRow.index];
          const isSelected = selectedFiles.has(file.path);
          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'flex',
                alignItems: 'center',
              }}
              className={'gallery-list-row' + (isSelected ? ' gallery-list-row--selected' : '')}
              draggable={true}
              onDragStart={(e) => {
                const dragData = JSON.stringify({
                  url: `${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(file.path)}`,
                  filePath: file.path,
                });
                e.dataTransfer.setData('application/x-storyboard-image', dragData);
                e.dataTransfer.setData('text/plain', dragData);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={(e) => handleRowClick(file, e)}
              onDoubleClick={() => onDoubleClick?.(file)}
              onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(e, file); } : undefined}
            >
              {/* Thumbnail */}
              <div className="gallery-list-vcell gallery-list-vcell--thumb">
                <ListThumbnail file={file} orchestratorUrl={orchestratorUrl} />
              </div>
              {/* Name */}
              <div className="gallery-list-vcell gallery-list-vcell--name" title={file.name}>
                {file.name}
              </div>
              {/* Type */}
              <div className="gallery-list-vcell gallery-list-vcell--type">
                {renderTypeBadge(file)}
              </div>
              {/* Size */}
              <div className="gallery-list-vcell gallery-list-vcell--size">
                {formatFileSize(file.size)}
              </div>
              {/* Created */}
              <div className="gallery-list-vcell gallery-list-vcell--created">
                {formatDate(file.created)}
              </div>
              {/* Modified */}
              <div className="gallery-list-vcell gallery-list-vcell--modified">
                {formatDate(file.modified)}
              </div>
              {/* Rating */}
              <div className="gallery-list-vcell gallery-list-vcell--rating">
                {renderRating(file)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
