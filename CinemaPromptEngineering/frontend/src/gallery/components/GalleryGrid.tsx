/**
 * GalleryGrid — Main grid of file thumbnails.
 *
 * Reads files from the store, applies sorting and filtering, then renders
 * a CSS grid of GalleryThumbnail components with full selection support
 * (click, Ctrl+click, Shift+click).
 */

import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useGalleryStore } from '../store/gallery-store';
import { GalleryThumbnail } from './GalleryThumbnail';
import type { FileEntry } from '../services/gallery-service';
import './components.css';

// =============================================================================
// Types
// =============================================================================

interface GalleryGridProps {
  orchestratorUrl: string;
  projectPath: string;
  onContextMenu?: (e: React.MouseEvent, file: FileEntry) => void;
  onDoubleClick?: (file: FileEntry) => void;
}

// =============================================================================
// Helpers
// =============================================================================

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
// Component
// =============================================================================

export function GalleryGrid({ orchestratorUrl, onContextMenu, onDoubleClick }: GalleryGridProps) {
  const {
    currentFiles,
    thumbnailSize,
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

  // Keep a ref to the current sorted/filtered list for shift-click range selection
  const sortedFilesRef = useRef<FileEntry[]>([]);

  // Virtual scroll refs and state
  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Track container width for dynamic column count
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
  // Virtual grid
  // ---------------------------------------------------------------------------

  const columnCount = Math.max(1, Math.floor(containerWidth / thumbnailSize));
  const rowCount = Math.ceil(visibleFiles.length / columnCount);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => thumbnailSize + 40,
    overscan: 3,
  });

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------

  const handleFileClick = useCallback(
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

  const handleFileDoubleClick = useCallback(
    (file: FileEntry) => {
      onDoubleClick?.(file);
    },
    [onDoubleClick],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (visibleFiles.length === 0) {
    return (
      <div className="gallery-grid-empty">
        {currentFiles.length === 0
          ? 'No files in this folder'
          : 'No files match the current filters'}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="gallery-grid-virtual-scroll"
      style={{ overflow: 'auto', flex: 1 }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columnCount;
          const rowFiles = visibleFiles.slice(startIndex, startIndex + columnCount);
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
                display: 'grid',
                gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                gap: '8px',
                padding: '0 4px',
              }}
            >
              {rowFiles.map((file) => (
                <GalleryThumbnail
                  key={file.path}
                  file={file}
                  thumbnailSize={thumbnailSize}
                  isSelected={selectedFiles.has(file.path)}
                  orchestratorUrl={orchestratorUrl}
                  rating={ratings[file.path] ?? file.rating ?? 0}
                  onClick={(e) => handleFileClick(file, e)}
                  onDoubleClick={() => handleFileDoubleClick(file)}
                  onContextMenu={onContextMenu ? (e) => onContextMenu(e, file) : undefined}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
