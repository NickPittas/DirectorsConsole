/**
 * HoverPreview — Floating preview card displayed on thumbnail hover.
 *
 * Shows a larger image/video preview alongside file metadata (name, size,
 * dimensions, date, rating, tags). The card is positioned with `position:
 * fixed` to the right of the anchor thumbnail, flipping to the left if it
 * would overflow the viewport.
 *
 * A 200 ms close delay prevents flicker when the cursor moves between the
 * thumbnail and the preview card.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Star, Film } from 'lucide-react';
import type { FileEntry } from '../services/gallery-service';
import './components.css';

// =============================================================================
// Types
// =============================================================================

interface HoverPreviewProps {
  file: FileEntry;
  orchestratorUrl: string;
  rating: number;
  anchorRect: { top: number; left: number; width: number; height: number };
  onClose: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

/** Format a byte count into a human-readable string (B, KB, MB, GB). */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Format a UNIX timestamp (seconds) into YYYY-MM-DD HH:mm. */
function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// =============================================================================
// Constants
// =============================================================================

const CARD_WIDTH = 320;
const GAP = 8;
const CLOSE_DELAY_MS = 200;

// =============================================================================
// Component
// =============================================================================

export function HoverPreview({
  file,
  orchestratorUrl,
  rating,
  anchorRect,
  onClose,
}: HoverPreviewProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [imgError, setImgError] = useState(false);

  // -----------------------------------------------------------------------
  // Close delay — prevents flicker when cursor moves between thumbnail and
  // preview card.
  // -----------------------------------------------------------------------

  const scheduleClose = useCallback(() => {
    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, CLOSE_DELAY_MS);
  }, [onClose]);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  // Clear timer on unmount.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  // -----------------------------------------------------------------------
  // Positioning
  // -----------------------------------------------------------------------

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;

  // Try right side first; flip to left if it overflows.
  let left = anchorRect.left + anchorRect.width + GAP;
  if (left + CARD_WIDTH > viewportWidth) {
    left = anchorRect.left - CARD_WIDTH - GAP;
  }
  // Ensure it doesn't go off the left edge.
  if (left < 0) left = GAP;

  // Vertically centre relative to the anchor, clamped to viewport.
  const anchorCentreY = anchorRect.top + anchorRect.height / 2;
  // Estimate a card height so we can clamp. Actual height is dynamic.
  const estimatedCardHeight = 400;
  let top = anchorCentreY - estimatedCardHeight / 2;
  if (top < GAP) top = GAP;
  if (top + estimatedCardHeight > viewportHeight - GAP) {
    top = viewportHeight - estimatedCardHeight - GAP;
  }

  // -----------------------------------------------------------------------
  // Preview media URL
  // -----------------------------------------------------------------------

  const previewUrl = `${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(file.path)}`;
  const isVideo = file.type === 'video';

  // -----------------------------------------------------------------------
  // Star rating renderer
  // -----------------------------------------------------------------------

  const stars: React.ReactNode[] = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Star
        key={i}
        size={14}
        className={
          i <= rating
            ? 'hover-preview-star-filled'
            : 'hover-preview-star-empty'
        }
      />,
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div
      ref={cardRef}
      className="hover-preview-card"
      style={{
        position: 'fixed',
        top,
        left,
        width: CARD_WIDTH,
        zIndex: 9999,
      }}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      {/* Media preview */}
      <div className="hover-preview-media">
        {isVideo ? (
          <video
            className="hover-preview-video"
            src={previewUrl}
            controls
            autoPlay
            muted
            loop
          />
        ) : imgError ? (
          <div className="hover-preview-placeholder">
            <Film size={48} />
          </div>
        ) : (
          <img
            className="hover-preview-image"
            src={previewUrl}
            alt={file.name}
            onError={() => setImgError(true)}
            draggable={false}
          />
        )}
      </div>

      {/* Metadata */}
      <div className="hover-preview-meta">
        <div className="hover-preview-filename">{file.name}</div>

        <div className="hover-preview-details">
          <span className="hover-preview-detail">{formatFileSize(file.size)}</span>
          {file.width != null && file.height != null && (
            <span className="hover-preview-detail">
              {file.width} &times; {file.height}
            </span>
          )}
          <span className="hover-preview-detail">{formatDate(file.modified)}</span>
          <span className="hover-preview-detail hover-preview-extension">
            {file.extension.toUpperCase()}
          </span>
        </div>

        {/* Star rating */}
        {rating > 0 && (
          <div className="hover-preview-rating">{stars}</div>
        )}

        {/* Tags */}
        {file.tags.length > 0 && (
          <div className="hover-preview-tags">
            {file.tags.map((tag) => (
              <span
                key={tag.id}
                className="hover-preview-tag"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
