/**
 * Media Drop Zone Component
 * 
 * Allows drag-and-drop of images and videos from:
 * - Canvas panels
 * - File manager
 * - Browse button for file selection
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { CropMaskEditor } from './CropMaskEditor';
import './ImageDropZone.css';

// Normalized crop rect (0-1 range, relative to image dimensions)
interface NormalizedCropRect {
  x: number;  // 0-1
  y: number;  // 0-1
  width: number;  // 0-1
  height: number;  // 0-1
}

/**
 * Component to show the preview with original image (optionally cropped) + red mask overlay.
 * This shows the full image without transparency, with red overlay where mask is applied.
 */
function PreviewWithMask({ 
  originalImage, 
  cropRect, 
  displayMask 
}: { 
  originalImage: string; 
  cropRect: NormalizedCropRect | null;
  displayMask: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  
  // Create cropped version of original image for display
  useEffect(() => {
    if (!cropRect) {
      setCroppedImage(originalImage);
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      const cropX = cropRect.x * img.naturalWidth;
      const cropY = cropRect.y * img.naturalHeight;
      const cropWidth = cropRect.width * img.naturalWidth;
      const cropHeight = cropRect.height * img.naturalHeight;
      
      const canvas = document.createElement('canvas');
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(
          img,
          cropX, cropY, cropWidth, cropHeight,
          0, 0, cropWidth, cropHeight
        );
        setCroppedImage(canvas.toDataURL('image/png'));
      }
    };
    img.src = originalImage;
  }, [originalImage, cropRect]);
  
  return (
    <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
      {/* Show the cropped original image (no transparency) */}
      {croppedImage && (
        <img 
          src={croppedImage} 
          alt="Preview" 
          style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
        />
      )}
      {/* Show red overlay for masked areas */}
      {displayMask && <MaskPreviewOverlay maskData={displayMask} />}
    </div>
  );
}

/**
 * Component to render a red overlay showing where the mask is applied.
 * Uses canvas to properly render the mask as a red semi-transparent overlay.
 * Only shows red where the mask has white pixels (masked areas).
 */
function MaskPreviewOverlay({ maskData }: { maskData: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Load the mask image
    const maskImg = new Image();
    maskImg.onload = () => {
      // Set canvas size to match mask
      canvas.width = maskImg.width;
      canvas.height = maskImg.height;
      
      // Draw mask to get pixel data
      ctx.drawImage(maskImg, 0, 0);
      const maskImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const maskPixels = maskImageData.data;
      
      // Clear and create red overlay data
      const overlayData = ctx.createImageData(canvas.width, canvas.height);
      
      for (let i = 0; i < maskPixels.length; i += 4) {
        const maskValue = maskPixels[i]; // R channel (grayscale mask)
        if (maskValue > 10) { // Threshold to avoid noise
          overlayData.data[i] = 255;     // R
          overlayData.data[i + 1] = 50;  // G
          overlayData.data[i + 2] = 50;  // B
          overlayData.data[i + 3] = Math.floor(maskValue * 0.6); // A - semi-transparent based on mask intensity
        } else {
          // Fully transparent where mask is black
          overlayData.data[i] = 0;
          overlayData.data[i + 1] = 0;
          overlayData.data[i + 2] = 0;
          overlayData.data[i + 3] = 0;
        }
      }
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(overlayData, 0, 0);
    };
    maskImg.src = maskData;
  }, [maskData]);
  
  return (
    <canvas 
      ref={canvasRef} 
      className="mask-overlay"
    />
  );
}

type MediaType = 'image' | 'video' | 'any';

interface ImageDropZoneProps {
  name: string;
  displayName: string;
  value: string | null;
  onChange: (name: string, value: string | null) => void;
  onBrowse?: () => void;
  disabled?: boolean;
  acceptType?: MediaType; // 'image', 'video', or 'any'
  isBypassed?: boolean;
  onBypassChange?: (bypassed: boolean) => void;
  comfyUrl?: string; // ComfyUI server URL for uploading dropped images
}

export function ImageDropZone({ 
  name, 
  displayName, 
  value, 
  onChange, 
  onBrowse,
  disabled = false,
  acceptType = 'image',
  isBypassed = false,
  onBypassChange,
  comfyUrl: _comfyUrl, // eslint-disable-line @typescript-eslint/no-unused-vars
}: ImageDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine accept string for file input
  const getAcceptString = useCallback(() => {
    switch (acceptType) {
      case 'image': return 'image/*';
      case 'video': return 'video/*';
      case 'any': return 'image/*,video/*';
      default: return 'image/*';
    }
  }, [acceptType]);

  // Check if file type is valid
  const isValidFile = useCallback((file: File) => {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    
    switch (acceptType) {
      case 'image': return isImage;
      case 'video': return isVideo;
      case 'any': return isImage || isVideo;
      default: return isImage;
    }
  }, [acceptType]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    console.log('[DropZone] DragEnter fired');
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    console.log('[DropZone] DragLeave fired');
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const processFile = useCallback((file: File) => {
    if (!isValidFile(file)) return;
    
    const isVideo = file.type.startsWith('video/');
    setMediaType(isVideo ? 'video' : 'image');
    
    // Reset crop/mask/paint state when loading new image
    setOriginalImage(null);
    setMaskData(null);
    setPaintData(null);
    setCropRect(null);
    setDisplayMask(null);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        onChange(name, event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  }, [isValidFile, name, onChange]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    console.log('[DropZone] Drop fired!');
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setIsDragOver(false);

    if (disabled) {
      console.log('[DropZone] Drop ignored - disabled');
      return;
    }
    
    console.log('[DropZone] Drop data types:', e.dataTransfer.types);
    console.log('[DropZone] Drop text data:', e.dataTransfer.getData('text/plain').substring(0, 100));

    // Handle files dropped from Windows Explorer
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
      return;
    }

    // Handle dropped data from canvas panel
    const droppedData = e.dataTransfer.getData('text/plain');
    if (!droppedData) return;

    // Reset crop/mask/paint state when loading new image
    setOriginalImage(null);
    setMaskData(null);
    setPaintData(null);
    setCropRect(null);
    setDisplayMask(null);
    setMediaType('image');

    // Try to parse as JSON (from canvas drag with url + filePath)
    try {
      const parsed = JSON.parse(droppedData);
      const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:9800';
      
      // Case 1: Has URL - try direct fetch first, fallback to CPE proxy if CORS fails
      if (parsed.url && typeof parsed.url === 'string') {
        console.log('[DropZone] Fetching image from URL:', parsed.url.substring(0, 80));
        
        // Try direct fetch first (works for ComfyUI and same-origin)
        try {
          const response = await fetch(parsed.url);
          if (response.ok) {
            const blob = await response.blob();
            console.log('[DropZone] Got blob via direct fetch, size:', blob.size);
            const reader = new FileReader();
            reader.onload = () => {
              console.log('[DropZone] FileReader loaded, calling onChange');
              onChange(name, reader.result as string);
            };
            reader.onerror = (err) => {
              console.error('[DropZone] FileReader error:', err);
            };
            reader.readAsDataURL(blob);
            return;
          }
        } catch (directErr) {
          console.log('[DropZone] Direct fetch failed (likely CORS), trying CPE proxy...');
          
          // Fallback: use CPE backend as proxy
          try {
            const proxyResponse = await fetch(
              `${apiBase}/api/fetch-image?url=${encodeURIComponent(parsed.url)}`
            );
            const proxyResult = await proxyResponse.json();
            
            if (proxyResult.success && proxyResult.dataUrl) {
              console.log('[DropZone] Successfully fetched via CPE proxy');
              onChange(name, proxyResult.dataUrl);
              return;
            } else {
              console.warn('[DropZone] CPE proxy failed:', proxyResult.message);
            }
          } catch (proxyErr) {
            console.warn('[DropZone] CPE proxy error:', proxyErr);
          }
        }
      }
      
      // Case 2: Has filePath - try CPE backend to read from filesystem
      if (parsed.filePath && typeof parsed.filePath === 'string') {
        console.log('[DropZone] Trying CPE backend for filePath:', parsed.filePath);
        const response = await fetch(`${apiBase}/api/read-image?path=${encodeURIComponent(parsed.filePath)}`);
        const result = await response.json();
        if (result.success && result.dataUrl) {
          onChange(name, result.dataUrl);
          return;
        }
      }
    } catch (err) {
      console.warn('[DropZone] Error parsing/handling dropped data:', err);
      // Not JSON, handle as regular data
    }

    // Handle data URL directly
    if (droppedData.startsWith('data:')) {
      onChange(name, droppedData);
    }
  }, [disabled, name, onChange, processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, [processFile]);

  const handleBrowse = useCallback(() => {
    if (onBrowse) {
      onBrowse();
    } else {
      fileInputRef.current?.click();
    }
  }, [onBrowse]);

  const handleClear = useCallback(() => {
    onChange(name, null);
    setMediaType(null);
    // Reset all editing state
    setOriginalImage(null);
    setMaskData(null);
    setPaintData(null);
    setCropRect(null);
    setDisplayMask(null);
  }, [name, onChange]);

  // State for crop/mask editor
  const [showCropMaskEditor, setShowCropMaskEditor] = useState(false);
  const [cropMaskMode, setCropMaskMode] = useState<'crop' | 'mask' | 'paint'>('crop');
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [maskData, setMaskData] = useState<string | null>(null); // Raw mask for re-editing (full image size)
  const [paintData, setPaintData] = useState<string | null>(null); // Raw paint layer for re-editing
  const [cropRect, setCropRect] = useState<NormalizedCropRect | null>(null); // Store crop rect for remembering
  const [displayMask, setDisplayMask] = useState<string | null>(null); // Cropped mask for preview display

  const handleCropClick = useCallback(() => {
    // Store original image when opening crop editor (only if not already stored)
    console.log('[ImageDropZone] handleCropClick called, value:', value ? value.substring(0, 50) + '...' : 'null');
    console.log('[ImageDropZone] originalImage exists:', !!originalImage);
    if (value && !originalImage) {
      console.log('[ImageDropZone] Storing original image');
      setOriginalImage(value);
    }
    setCropMaskMode('crop');
    setShowCropMaskEditor(true);
  }, [value, originalImage]);

  const handleMaskClick = useCallback(() => {
    // Store original image when opening mask editor (only if not already stored)
    console.log('[ImageDropZone] handleMaskClick called, value:', value ? value.substring(0, 50) + '...' : 'null');
    console.log('[ImageDropZone] originalImage exists:', !!originalImage);
    if (value && !originalImage) {
      console.log('[ImageDropZone] Storing original image');
      setOriginalImage(value);
    }
    setCropMaskMode('mask');
    setShowCropMaskEditor(true);
  }, [value, originalImage]);

  const handlePaintClick = useCallback(() => {
    // Store original image when opening paint editor (only if not already stored)
    console.log('[ImageDropZone] handlePaintClick called, value:', value ? value.substring(0, 50) + '...' : 'null');
    console.log('[ImageDropZone] originalImage exists:', !!originalImage);
    if (value && !originalImage) {
      console.log('[ImageDropZone] Storing original image');
      setOriginalImage(value);
    }
    setCropMaskMode('paint');
    setShowCropMaskEditor(true);
  }, [value, originalImage]);

  /**
   * Create a cropped version of the mask for display preview.
   * The raw mask is at full image size, but if we crop the image,
   * the display mask needs to be cropped to match.
   */
  const createDisplayMask = useCallback((
    rawMask: string, 
    crop: NormalizedCropRect | null,
    originalImg: string
  ): Promise<string> => {
    return new Promise((resolve) => {
      if (!crop) {
        // No crop, use mask as-is
        resolve(rawMask);
        return;
      }
      
      // Load the original image to get dimensions
      const img = new Image();
      img.onload = () => {
        const maskImg = new Image();
        maskImg.onload = () => {
          // Calculate crop in pixels
          const cropX = crop.x * img.naturalWidth;
          const cropY = crop.y * img.naturalHeight;
          const cropWidth = crop.width * img.naturalWidth;
          const cropHeight = crop.height * img.naturalHeight;
          
          // Create cropped mask canvas
          const canvas = document.createElement('canvas');
          canvas.width = cropWidth;
          canvas.height = cropHeight;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(
              maskImg,
              cropX, cropY, cropWidth, cropHeight,
              0, 0, cropWidth, cropHeight
            );
            resolve(canvas.toDataURL('image/png'));
          } else {
            resolve(rawMask);
          }
        };
        maskImg.src = rawMask;
      };
      img.src = originalImg;
    });
  }, []);

  const handleCropMaskSave = useCallback(async (
    processedImage: string | null, 
    rawMaskData: string | null,
    newCropRect: NormalizedCropRect | null,
    rawPaintData: string | null
  ) => {
    console.log('[ImageDropZone] handleCropMaskSave called');
    console.log('[ImageDropZone] processedImage:', processedImage ? processedImage.substring(0, 50) + '...' : 'null');
    console.log('[ImageDropZone] rawMaskData:', rawMaskData ? rawMaskData.substring(0, 50) + '...' : 'null');
    console.log('[ImageDropZone] rawPaintData:', rawPaintData ? rawPaintData.substring(0, 50) + '...' : 'null');
    console.log('[ImageDropZone] newCropRect:', newCropRect);
    
    // Case 1: No changes (null, null, null, null) - just close dialog
    if (!processedImage && !rawMaskData && !newCropRect && !rawPaintData) {
      console.log('[ImageDropZone] No changes detected, closing dialog');
      setShowCropMaskEditor(false);
      return;
    }
    
    // Store the crop rect for remembering
    if (newCropRect !== undefined) {
      setCropRect(newCropRect);
    }
    
    // Store the raw mask data (replaces any previous mask)
    if (rawMaskData !== undefined) {
      setMaskData(rawMaskData);
      
      // Create cropped display mask if we have both mask and crop
      if (rawMaskData && originalImage) {
        const croppedMask = await createDisplayMask(rawMaskData, newCropRect, originalImage);
        setDisplayMask(croppedMask);
      } else {
        setDisplayMask(rawMaskData);
      }
    }
    
    // Store the raw paint data for re-editing
    if (rawPaintData !== undefined) {
      setPaintData(rawPaintData);
    }
    
    // If we have a processed image, update the value
    if (processedImage) {
      console.log('[ImageDropZone] Calling onChange with processed image');
      onChange(name, processedImage);
    }
    
    setShowCropMaskEditor(false);
  }, [name, onChange, originalImage, createDisplayMask]);

  const handleCropMaskCancel = useCallback(() => {
    setShowCropMaskEditor(false);
  }, []);



  // Detect media type from value
  const currentMediaType = value?.startsWith('data:video') ? 'video' : (mediaType || 'image');
  
  // Get icon and text based on accept type
  const getPlaceholderContent = () => {
    switch (acceptType) {
      case 'video':
        return { icon: '🎬', text: isDragging ? 'Drop video here' : 'Drag video or browse' };
      case 'any':
        return { icon: '🎞️', text: isDragging ? 'Drop media here' : 'Drag image/video or browse' };
      default:
        return { icon: '🖼️', text: isDragging ? 'Drop image here' : 'Drag image from canvas or browse' };
    }
  };
  
  const placeholder = getPlaceholderContent();

  return (
    <div className={`image-drop-zone-container ${isBypassed ? 'bypassed' : ''}`}>
      <div className="image-drop-zone-header">
        <label className="image-drop-zone-label">{displayName}</label>
        {onBypassChange && (
          <label className="bypass-toggle" title={isBypassed ? 'Enable this input' : 'Bypass this input (skip in workflow)'}>
            <input
              type="checkbox"
              checked={isBypassed}
              onChange={(e) => onBypassChange(e.target.checked)}
            />
            <span className="bypass-label">{isBypassed ? 'Bypassed' : 'Active'}</span>
          </label>
        )}
      </div>
      
      {isBypassed ? (
        <div className="image-drop-zone bypassed-placeholder">
          <div className="bypassed-content">
            <div className="bypassed-icon">⏸️</div>
            <div className="bypassed-text">Input bypassed</div>
            <div className="bypassed-hint">This input will be skipped</div>
          </div>
        </div>
      ) : (
        <>
          <div
            className={`image-drop-zone ${isDragOver ? 'drag-over' : ''} ${value ? 'has-image' : ''} ${disabled ? 'disabled' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {value ? (
              <div className="image-preview">
                {currentMediaType === 'video' ? (
                  <video src={value} controls muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <>
                    {/* Show the processed value - but we need to show it without transparency for preview */}
                    {/* For preview, show original image cropped, with red overlay for mask */}
                    <img src={value} alt={displayName} style={{ opacity: maskData ? 0 : 1 }} />
                    {/* When we have a mask, show original (cropped) without alpha + red overlay */}
                    {maskData && originalImage && (
                      <PreviewWithMask 
                        originalImage={originalImage}
                        cropRect={cropRect}
                        displayMask={displayMask}
                      />
                    )}
                  </>
                )}
                <div className="image-preview-actions">
                  <button 
                    className="image-action-btn crop-btn"
                    onClick={handleCropClick}
                    disabled={disabled || currentMediaType === 'video'}
                    title="Crop image"
                  >
                    ✂
                  </button>
                  <button 
                    className="image-action-btn mask-btn"
                    onClick={handleMaskClick}
                    disabled={disabled || currentMediaType === 'video'}
                    title="Add mask"
                  >
                    �
                  </button>
                  <button 
                    className="image-action-btn paint-btn"
                    onClick={handlePaintClick}
                    disabled={disabled || currentMediaType === 'video'}
                    title="Paint on image"
                  >
                    🖌️
                  </button>
                  <button 
                    className="image-action-btn clear-btn"
                    onClick={handleClear}
                    disabled={disabled}
                    title="Remove media"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <div className="drop-placeholder">
                <div className="drop-icon">{placeholder.icon}</div>
                <div className="drop-text">{placeholder.text}</div>
                <div className="drop-actions">
                  <button 
                    className="browse-btn"
                    onClick={handleBrowse}
                    disabled={disabled}
                  >
                    Browse...
                  </button>
                </div>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={getAcceptString()}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </>
      )}

      {/* Crop/Mask/Paint Editor Modal */}
      {showCropMaskEditor && value && (
        <CropMaskEditor
          imageData={originalImage || value}
          mode={cropMaskMode}
          initialMask={maskData}
          initialCrop={cropRect}
          initialPaint={paintData}
          onSave={handleCropMaskSave}
          onCancel={handleCropMaskCancel}
        />
      )}
    </div>
  );
}

export default ImageDropZone;
