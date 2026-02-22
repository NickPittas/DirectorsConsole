import { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import type { FileEntry } from '../services/gallery-service';
import './components.css';

interface GalleryLightboxProps {
  file: FileEntry;
  files: FileEntry[];
  orchestratorUrl: string;
  onClose: () => void;
  onNavigate: (file: FileEntry) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function GalleryLightbox({
  file,
  files,
  orchestratorUrl,
  onClose,
  onNavigate,
}: GalleryLightboxProps) {
  const [zoomed, setZoomed] = useState(false);

  const currentIndex = files.findIndex((f) => f.path === file.path);
  const total = files.length;

  const mediaUrl = `${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(file.path)}`;

  const navigatePrev = useCallback(() => {
    if (total <= 1) return;
    const prevIndex = currentIndex <= 0 ? total - 1 : currentIndex - 1;
    setZoomed(false);
    onNavigate(files[prevIndex]);
  }, [currentIndex, total, files, onNavigate]);

  const navigateNext = useCallback(() => {
    if (total <= 1) return;
    const nextIndex = currentIndex >= total - 1 ? 0 : currentIndex + 1;
    setZoomed(false);
    onNavigate(files[nextIndex]);
  }, [currentIndex, total, files, onNavigate]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          navigatePrev();
          break;
        case 'ArrowRight':
          navigateNext();
          break;
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, navigatePrev, navigateNext]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const toggleZoom = useCallback(() => {
    setZoomed((prev) => !prev);
  }, []);

  const infoParts: string[] = [];
  if (file.width && file.height) {
    infoParts.push(`${file.width} x ${file.height}`);
  }
  if (file.size) {
    infoParts.push(formatFileSize(file.size));
  }

  return ReactDOM.createPortal(
    <div className="gallery-lightbox-backdrop" onClick={handleBackdropClick}>
      {/* Header */}
      <div className="gallery-lightbox-header">
        <div className="gallery-lightbox-header-left">
          <span className="gallery-lightbox-filename">{file.name}</span>
          {infoParts.length > 0 && (
            <span className="gallery-lightbox-info">{infoParts.join('  |  ')}</span>
          )}
        </div>
        <button className="gallery-lightbox-close" onClick={onClose} title="Close (Esc)">
          <X size={20} />
        </button>
      </div>

      {/* Media area */}
      <div className="gallery-lightbox-media" onClick={handleBackdropClick}>
        {file.type === 'video' ? (
          <video
            className="gallery-lightbox-video"
            src={mediaUrl}
            controls
            autoPlay
            loop
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <img
            className={
              'gallery-lightbox-image' +
              (zoomed ? ' gallery-lightbox-image--zoomed' : '')
            }
            src={mediaUrl}
            alt={file.name}
            draggable={false}
            style={{ cursor: zoomed ? 'zoom-out' : 'zoom-in' }}
            onClick={(e) => {
              e.stopPropagation();
              toggleZoom();
            }}
          />
        )}
      </div>

      {/* Zoom indicator for images */}
      {file.type === 'image' && (
        <button
          className="gallery-lightbox-zoom-btn"
          onClick={toggleZoom}
          title={zoomed ? 'Fit to screen' : 'Zoom to 100%'}
        >
          {zoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
        </button>
      )}

      {/* Left nav */}
      {total > 1 && (
        <button
          className="gallery-lightbox-nav gallery-lightbox-nav--left"
          onClick={navigatePrev}
          title="Previous (Left Arrow)"
        >
          <ChevronLeft size={32} />
        </button>
      )}

      {/* Right nav */}
      {total > 1 && (
        <button
          className="gallery-lightbox-nav gallery-lightbox-nav--right"
          onClick={navigateNext}
          title="Next (Right Arrow)"
        >
          <ChevronRight size={32} />
        </button>
      )}

      {/* Position counter */}
      {total > 1 && (
        <div className="gallery-lightbox-position">
          {currentIndex + 1} / {total}
        </div>
      )}
    </div>,
    document.body
  );
}
