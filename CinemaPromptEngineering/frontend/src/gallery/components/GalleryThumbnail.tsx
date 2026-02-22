/**
 * GalleryThumbnail — Individual file thumbnail card.
 *
 * Displays an image/video thumbnail loaded from the Orchestrator's serve-image
 * endpoint, with file name, star rating overlay, type badge, and video overlay.
 */

import { useState, useCallback } from 'react';
import { Star, Film, Image as ImageIcon } from 'lucide-react';
import { VideoScrubber } from './VideoScrubber';
import type { FileEntry } from '../services/gallery-service';
import './components.css';

// =============================================================================
// Types
// =============================================================================

interface GalleryThumbnailProps {
  file: FileEntry;
  thumbnailSize: number;
  isSelected: boolean;
  orchestratorUrl: string;
  rating: number;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

// =============================================================================
// Component
// =============================================================================

export function GalleryThumbnail({
  file,
  thumbnailSize,
  isSelected,
  orchestratorUrl,
  rating,
  onClick,
  onDoubleClick,
  onContextMenu,
}: GalleryThumbnailProps) {
  const [imgError, setImgError] = useState(false);

  const handleImgError = useCallback(() => {
    setImgError(true);
  }, []);

  const isVideo = file.type === 'video';

  const thumbnailUrl = `${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(file.path)}`;

  const containerClass = [
    'gallery-thumbnail',
    isSelected ? 'gallery-thumbnail--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={containerClass}
      style={isSelected ? { transform: 'scale(1.02)' } : undefined}
      draggable={true}
      onDragStart={(e) => {
        const dragData = JSON.stringify({
          url: `${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(file.path)}`,
          filePath: file.path,
        });
        e.dataTransfer.setData('application/x-storyboard-image', dragData);
        e.dataTransfer.setData('text/plain', dragData);
        e.dataTransfer.effectAllowed = 'copyMove';
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* Image area */}
      <div className="gallery-thumbnail-image-container">
        {imgError ? (
          <div className="gallery-thumbnail-placeholder">
            <ImageIcon size={Math.max(24, thumbnailSize * 0.2)} />
          </div>
        ) : isVideo ? (
          <VideoScrubber
            videoUrl={thumbnailUrl}
            className="gallery-thumbnail-image"
          />
        ) : (
          <img
            className="gallery-thumbnail-image"
            src={thumbnailUrl}
            alt={file.name}
            loading="lazy"
            onError={handleImgError}
            draggable={false}
          />
        )}

        {/* Video overlay */}
        {isVideo && !imgError && (
          <div className="gallery-thumbnail-video-overlay">
            <Film size={18} />
          </div>
        )}

        {/* Type badge */}
        <span
          className={`gallery-thumbnail-type-badge gallery-thumbnail-type-badge--${isVideo ? 'video' : 'image'}`}
        />

        {/* Star rating overlay */}
        {rating > 0 && (
          <div className="gallery-thumbnail-rating">
            {Array.from({ length: rating }, (_, i) => (
              <Star
                key={i}
                className="gallery-thumbnail-rating-star"
                size={10}
                fill="#f5c542"
              />
            ))}
          </div>
        )}
      </div>

      {/* Tag dots */}
      {file.tags && file.tags.length > 0 && (
        <div className="gallery-thumbnail-tags">
          {file.tags.slice(0, 5).map((tag) => (
            <span
              key={tag.id}
              className="gallery-thumbnail-tag-dot"
              style={{ backgroundColor: tag.color || '#58a6ff' }}
              title={tag.name}
            />
          ))}
          {file.tags.length > 5 && (
            <span className="gallery-thumbnail-tag-overflow">
              +{file.tags.length - 5}
            </span>
          )}
        </div>
      )}

      {/* File name */}
      <div className="gallery-thumbnail-name" title={file.name}>
        {file.name}
      </div>
    </div>
  );
}
