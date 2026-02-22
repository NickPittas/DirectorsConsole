/**
 * VideoScrubber — Hover-to-scrub video thumbnail component.
 *
 * Shows a static poster frame by default (captured eagerly on mount).
 * On mouse enter the video becomes visible for scrubbing. Moving the mouse
 * horizontally scrubs through the video proportionally. On mouse leave the
 * video is hidden and the poster canvas is shown again. A thin progress bar
 * at the bottom visualises the current scrub position.
 *
 * Performance: the `<video>` element is created once on mount (via useEffect)
 * and reused across interactions. All scrub updates go through refs to avoid
 * re-renders.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import './components.css';

// =============================================================================
// Types
// =============================================================================

interface VideoScrubberProps {
  videoUrl: string;
  /** Pixel width — pass a number, or omit to fill container via CSS. */
  width?: number;
  /** Pixel height — pass a number, or omit to fill container via CSS. */
  height?: number;
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function VideoScrubber({
  videoUrl,
  width,
  height,
  className,
}: VideoScrubberProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLCanvasElement>(null);

  // Track whether the video metadata has loaded so we know duration is valid.
  const metaLoaded = useRef(false);
  const videoFailed = useRef(false);
  // Track whether we've captured the poster frame.
  const posterCaptured = useRef(false);

  // Only used to toggle poster <-> video visibility; kept minimal.
  const [hovering, setHovering] = useState(false);

  // -----------------------------------------------------------------------
  // Eagerly create the video element on mount and capture poster frame.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (videoRef.current || videoFailed.current) return;

    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.className = 'video-scrubber-video';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'contain';
    // Hidden by default; only shown when hovering for scrub.
    video.style.display = 'none';

    video.addEventListener('loadedmetadata', () => {
      metaLoaded.current = true;
      // Seek to time 0 to ensure the first frame is decoded.
      video.currentTime = 0;
    });

    video.addEventListener('seeked', () => {
      // Capture the first frame as poster on the canvas once.
      if (!posterCaptured.current && posterRef.current && video.videoWidth > 0) {
        const canvas = posterRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          posterCaptured.current = true;
        }
      }
    });

    video.addEventListener('error', () => {
      videoFailed.current = true;
      videoRef.current = null;
    });

    // Append into the container so it renders alongside the canvas.
    containerRef.current?.appendChild(video);
    videoRef.current = video;

    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
      videoRef.current = null;
      metaLoaded.current = false;
      posterCaptured.current = false;
    };
  }, [videoUrl]);

  // -----------------------------------------------------------------------
  // Event handlers — all use refs, no state updates during scrub.
  // -----------------------------------------------------------------------

  const handleMouseEnter = useCallback(() => {
    const video = videoRef.current;
    if (!video || videoFailed.current) return;

    setHovering(true);
    video.style.display = 'block';
    video.play().catch(() => {
      // Autoplay may be blocked; silently degrade to poster.
    });
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const video = videoRef.current;
      if (!video || !metaLoaded.current || !Number.isFinite(video.duration)) {
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, mouseX / rect.width));

      // Pause playback while scrubbing so we control the frame.
      if (!video.paused) {
        video.pause();
      }
      video.currentTime = ratio * video.duration;

      // Update progress bar via ref.
      if (progressRef.current) {
        progressRef.current.style.width = `${ratio * 100}%`;
      }
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.style.display = 'none';
    }

    // Reset progress bar.
    if (progressRef.current) {
      progressRef.current.style.width = '0%';
    }

    setHovering(false);
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const rootClassName = ['video-scrubber-container', className]
    .filter(Boolean)
    .join(' ');

  // Use explicit pixel sizes when provided, otherwise fill container via CSS.
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    ...(width != null ? { width } : { width: '100%' }),
    ...(height != null ? { height } : { height: '100%' }),
  };

  return (
    <div
      ref={containerRef}
      className={rootClassName}
      style={containerStyle}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Poster canvas — always visible when not hovering */}
      <canvas
        ref={posterRef}
        className="video-scrubber-poster"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: hovering ? 'none' : 'block',
        }}
      />

      {/* Progress bar */}
      <div className="video-scrubber-progress-track">
        <div
          ref={progressRef}
          className="video-scrubber-progress-fill"
          style={{ width: '0%' }}
        />
      </div>
    </div>
  );
}
