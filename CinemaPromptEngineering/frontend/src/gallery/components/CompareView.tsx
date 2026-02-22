import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Columns, Layers, Blend, Maximize, Minimize, ScanSearch } from 'lucide-react';
import type { FileEntry } from '../services/gallery-service';
import './components.css';

interface CompareViewProps {
  files: FileEntry[];
  orchestratorUrl: string;
  onClose: () => void;
}

type CompareMode = 'side-by-side' | 'slider' | 'difference';
type ScaleMode = 'fit' | 'fill' | 'original';

function imageUrl(orchestratorUrl: string, file: FileEntry): string {
  return `${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(file.path)}`;
}

/** Hook to load both images and return their natural dimensions. */
function useImageDimensions(urlA: string, urlB: string) {
  const [dims, setDims] = useState<{ wA: number; hA: number; wB: number; hB: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const imgA = new Image();
    const imgB = new Image();
    imgA.crossOrigin = 'anonymous';
    imgB.crossOrigin = 'anonymous';

    let loadedCount = 0;
    function onLoad() {
      loadedCount++;
      if (loadedCount < 2 || cancelled) return;
      setDims({
        wA: imgA.naturalWidth,
        hA: imgA.naturalHeight,
        wB: imgB.naturalWidth,
        hB: imgB.naturalHeight,
      });
    }
    imgA.onload = onLoad;
    imgB.onload = onLoad;
    imgA.src = urlA;
    imgB.src = urlB;

    return () => { cancelled = true; };
  }, [urlA, urlB]);

  return dims;
}

function DifferenceCanvas({ urlA, urlB, scaleMode }: { urlA: string; urlB: string; scaleMode: ScaleMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgA = new Image();
    const imgB = new Image();
    imgA.crossOrigin = 'anonymous';
    imgB.crossOrigin = 'anonymous';

    let loadedCount = 0;

    function onLoad() {
      loadedCount++;
      if (loadedCount < 2) return;

      const w = Math.max(imgA.naturalWidth, imgB.naturalWidth);
      const h = Math.max(imgA.naturalHeight, imgB.naturalHeight);
      canvas!.width = w;
      canvas!.height = h;

      // Draw image A
      ctx!.drawImage(imgA, 0, 0, w, h);
      const dataA = ctx!.getImageData(0, 0, w, h);

      // Draw image B
      ctx!.clearRect(0, 0, w, h);
      ctx!.drawImage(imgB, 0, 0, w, h);
      const dataB = ctx!.getImageData(0, 0, w, h);

      // Compute difference
      const diff = ctx!.createImageData(w, h);
      for (let i = 0; i < dataA.data.length; i += 4) {
        diff.data[i] = Math.abs(dataA.data[i] - dataB.data[i]);       // R
        diff.data[i + 1] = Math.abs(dataA.data[i + 1] - dataB.data[i + 1]); // G
        diff.data[i + 2] = Math.abs(dataA.data[i + 2] - dataB.data[i + 2]); // B
        diff.data[i + 3] = 255; // Full alpha
      }
      ctx!.putImageData(diff, 0, 0);
    }

    imgA.onload = onLoad;
    imgB.onload = onLoad;
    imgA.src = urlA;
    imgB.src = urlB;
  }, [urlA, urlB]);

  const canvasStyle: React.CSSProperties =
    scaleMode === 'original'
      ? {}
      : scaleMode === 'fill'
        ? { width: '100%', height: '100%', objectFit: 'cover' }
        : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' };

  return (
    <div
      className="compare-view-difference-container"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        overflow: scaleMode === 'original' ? 'auto' : 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        className="compare-view-difference-canvas"
        style={canvasStyle}
      />
    </div>
  );
}

export function CompareView({ files, orchestratorUrl, onClose }: CompareViewProps) {
  const [mode, setMode] = useState<CompareMode>('slider');
  const [scaleMode, setScaleMode] = useState<ScaleMode>('fit');
  const [dividerPos, setDividerPos] = useState(50);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const fileA = files[0];
  const fileB = files[1];
  const urlA = imageUrl(orchestratorUrl, fileA);
  const urlB = imageUrl(orchestratorUrl, fileB);

  const dims = useImageDimensions(urlA, urlB);

  // --- Track container dimensions for slider alignment ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- Keyboard: Escape to close ---
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // --- Drag helpers ---
  const calcPercent = useCallback((clientX: number): number => {
    const container = containerRef.current;
    if (!container) return 50;
    const rect = container.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, pct));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return;
      setDividerPos(calcPercent(e.clientX));
    },
    [calcPercent],
  );

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // --- Scale-mode derived styles ---
  const sideImageStyle: React.CSSProperties =
    scaleMode === 'fill'
      ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
      : scaleMode === 'original'
        ? { display: 'block' }
        : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' };

  const sideContainerOverflow = scaleMode === 'original' ? 'auto' : 'hidden';

  // For slider mode: both images must render at exactly the same size.
  // In 'original' mode, use the larger of the two natural dimensions.
  const sliderObjectFit: React.CSSProperties['objectFit'] =
    scaleMode === 'fill' ? 'cover' : 'contain';

  // For original mode in slider, size the wrapper to the max of both images
  const sliderOriginalSize =
    scaleMode === 'original' && dims
      ? {
          width: Math.max(dims.wA, dims.wB),
          height: Math.max(dims.hA, dims.hB),
        }
      : null;

  // --- Render ---
  const overlay = (
    <div className="compare-view-backdrop" onClick={onClose}>
      <div className="compare-view" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="compare-view-header">
          <span className="compare-view-label compare-view-label--left" title={fileA.name}>
            {fileA.name}
          </span>

          <div className="compare-view-mode-toggle">
            <button
              className={`compare-view-mode-btn${mode === 'side-by-side' ? ' compare-view-mode-btn--active' : ''}`}
              onClick={() => setMode('side-by-side')}
              title="Side by Side"
            >
              <Columns size={14} />
              Side by Side
            </button>
            <button
              className={`compare-view-mode-btn${mode === 'slider' ? ' compare-view-mode-btn--active' : ''}`}
              onClick={() => setMode('slider')}
              title="Slider"
            >
              <Layers size={14} />
              Slider
            </button>
            <button
              className={`compare-view-mode-btn${mode === 'difference' ? ' compare-view-mode-btn--active' : ''}`}
              onClick={() => setMode('difference')}
              title="Difference"
            >
              <Blend size={14} />
              Difference
            </button>
          </div>

          {/* Scale mode control */}
          <div className="compare-view-scale-toggle">
            <button
              className={`compare-view-scale-btn${scaleMode === 'fit' ? ' compare-view-scale-btn--active' : ''}`}
              onClick={() => setScaleMode('fit')}
              title="Fit — scale to fit viewport"
            >
              <Minimize size={13} />
              Fit
            </button>
            <button
              className={`compare-view-scale-btn${scaleMode === 'fill' ? ' compare-view-scale-btn--active' : ''}`}
              onClick={() => setScaleMode('fill')}
              title="Fill — fill viewport (may crop)"
            >
              <Maximize size={13} />
              Fill
            </button>
            <button
              className={`compare-view-scale-btn${scaleMode === 'original' ? ' compare-view-scale-btn--active' : ''}`}
              onClick={() => setScaleMode('original')}
              title="Original — native resolution (may scroll)"
            >
              <ScanSearch size={13} />
              1:1
            </button>
          </div>

          <span className="compare-view-label compare-view-label--right" title={fileB.name}>
            {fileB.name}
          </span>

          <button className="compare-view-close-btn" onClick={onClose} title="Close (Esc)">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="compare-view-content" ref={containerRef}>
          {mode === 'side-by-side' ? (
            <>
              <div
                className="compare-view-side"
                style={{ width: `${dividerPos}%`, overflow: sideContainerOverflow }}
              >
                <img src={urlA} alt={fileA.name} style={sideImageStyle} draggable={false} />
                <span className="compare-view-side-label">{fileA.name}</span>
              </div>

              <div className="compare-view-divider" style={{ left: `${dividerPos}%` }} onMouseDown={handleMouseDown}>
                <div className="compare-view-divider-handle" />
              </div>

              <div
                className="compare-view-side"
                style={{ width: `${100 - dividerPos}%`, overflow: sideContainerOverflow }}
              >
                <img src={urlB} alt={fileB.name} style={sideImageStyle} draggable={false} />
                <span className="compare-view-side-label">{fileB.name}</span>
              </div>
            </>
          ) : mode === 'slider' ? (
            <div
              className={`compare-view-slider-container${scaleMode === 'original' ? ' compare-view-slider-container--original' : ''}`}
              style={
                sliderOriginalSize
                  ? { width: sliderOriginalSize.width, height: sliderOriginalSize.height }
                  : undefined
              }
            >
              {/* Image B — base (full) */}
              <img
                src={urlB}
                alt={fileB.name}
                className="compare-view-slider-img compare-view-slider-img--normalized"
                style={{ objectFit: scaleMode === 'original' ? undefined : sliderObjectFit }}
                draggable={false}
              />

              {/* Image A — clipped to dividerPos% from left */}
              <div className="compare-view-slider-clip" style={{ width: `${dividerPos}%` }}>
                <img
                  src={urlA}
                  alt={fileA.name}
                  className="compare-view-slider-img compare-view-slider-img--normalized"
                  style={{
                    objectFit: scaleMode === 'original' ? undefined : sliderObjectFit,
                    width: containerSize.w > 0 ? containerSize.w : '100%',
                    height: containerSize.h > 0 ? containerSize.h : '100%',
                  }}
                  draggable={false}
                />
              </div>

              {/* Slider line + handle */}
              <div className="compare-view-slider-line" style={{ left: `${dividerPos}%` }} onMouseDown={handleMouseDown}>
                <div className="compare-view-slider-handle" />
              </div>
            </div>
          ) : (
            <DifferenceCanvas urlA={urlA} urlB={urlB} scaleMode={scaleMode} />
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(overlay, document.body);
}
