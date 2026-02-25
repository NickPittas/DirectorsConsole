/**
 * GalleryMasonry — Pinterest-style masonry layout for file thumbnails.
 *
 * An alternative to GalleryGrid that preserves the natural aspect ratio of
 * each image, producing a staggered column layout via CSS `columns`. Uses the
 * same store fields, sort/filter logic, and selection behaviour as GalleryGrid.
 */

import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { Star, Film, Image as ImageIcon } from 'lucide-react';
import { useGalleryStore } from '../store/gallery-store';
import { VideoScrubber } from './VideoScrubber';
import type { FileEntry } from '../services/gallery-service';
import './components.css';

// =============================================================================
// Types
// =============================================================================

interface GalleryMasonryProps {
  orchestratorUrl: string;
  projectPath: string;
  onContextMenu?: (e: React.MouseEvent, file: FileEntry) => void;
  onDoubleClick?: (file: FileEntry) => void;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compare two file entries for sorting.
 *
 * @param a - First file entry.
 * @param b - Second file entry.
 * @param field - Sort field key.
 * @param direction - Sort direction ('asc' | 'desc').
 * @param ratings - Ratings map keyed by file path.
 * @returns Negative, zero, or positive comparison value.
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
// Masonry Item
// =============================================================================

interface MasonryItemProps {
  file: FileEntry;
  isSelected: boolean;
  rating: number;
  orchestratorUrl: string;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

/**
 * Single masonry card with natural aspect-ratio image.
 */
function MasonryItem({
  file,
  isSelected,
  rating,
  orchestratorUrl,
  onClick,
  onDoubleClick,
  onContextMenu,
}: MasonryItemProps) {
  const [imgError, setImgError] = useState(false);

  const handleImgError = useCallback(() => {
    setImgError(true);
  }, []);

  const isVideo = file.type === 'video';
  const thumbnailUrl = `${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(file.path)}`;

  const containerClass = [
    'gallery-masonry-item',
    isSelected ? 'gallery-masonry-item--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={containerClass}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* Image area — natural aspect ratio (videos need explicit aspect-ratio) */}
      <div className={`gallery-masonry-image-container${isVideo ? ' gallery-masonry-image-container--video' : ''}`}>
        {imgError ? (
          <div className="gallery-masonry-placeholder">
            <ImageIcon size={48} />
          </div>
        ) : isVideo ? (
          <VideoScrubber
            videoUrl={thumbnailUrl}
            className="gallery-masonry-image"
          />
        ) : (
          <img
            className="gallery-masonry-image"
            src={thumbnailUrl}
            alt={file.name}
            loading="lazy"
            onError={handleImgError}
            draggable={false}
          />
        )}

        {/* Video overlay */}
        {isVideo && !imgError && (
          <div className="gallery-masonry-video-overlay">
            <Film size={20} />
          </div>
        )}

        {/* Type badge (top-right dot) */}
        <span
          className={`gallery-masonry-type-badge gallery-masonry-type-badge--${isVideo ? 'video' : 'image'}`}
        />

        {/* Star rating overlay (bottom-left) */}
        {rating > 0 && (
          <div className="gallery-masonry-rating">
            {Array.from({ length: rating }, (_, i) => (
              <Star
                key={i}
                className="gallery-masonry-rating-star"
                size={10}
                fill="#f5c542"
              />
            ))}
          </div>
        )}
      </div>

      {/* File name */}
      <div className="gallery-masonry-name" title={file.name}>
        {file.name}
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function GalleryMasonry({ orchestratorUrl, onContextMenu, onDoubleClick }: GalleryMasonryProps) {
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

  // Ref to the sorted/filtered list for shift-click range selection
  const sortedFilesRef = useRef<FileEntry[]>([]);

  // Container ref for measuring width
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(3);

  // ---------------------------------------------------------------------------
  // Measure container width and compute column count
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function updateColumns() {
      if (!el) return;
      const width = el.clientWidth;
      const cols = Math.floor(width / thumbnailSize);
      setColumnCount(Math.max(2, Math.min(8, cols)));
    }

    // Initial measurement
    updateColumns();

    const observer = new ResizeObserver(() => {
      updateColumns();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [thumbnailSize]);

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
      <div className="gallery-masonry-empty">
        {currentFiles.length === 0
          ? 'No files in this folder'
          : 'No files match the current filters'}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="gallery-masonry"
      style={{
        gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
      }}
    >
      {visibleFiles.map((file) => (
        <MasonryItem
          key={file.path}
          file={file}
          isSelected={selectedFiles.has(file.path)}
          rating={ratings[file.path] ?? file.rating ?? 0}
          orchestratorUrl={orchestratorUrl}
          onClick={(e) => handleFileClick(file, e)}
          onDoubleClick={() => handleFileDoubleClick(file)}
          onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(e, file); } : undefined}
        />
      ))}
    </div>
  );
}
