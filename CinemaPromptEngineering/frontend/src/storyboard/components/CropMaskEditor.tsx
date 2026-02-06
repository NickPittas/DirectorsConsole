/**
 * Crop and Mask Editor Component
 * 
 * Provides modal interface for cropping images, painting masks, and drawing on images.
 * Supports crop mode (with aspect ratio presets), mask mode (brush painting), and paint mode (draw on image).
 */

import { useState, useRef, useCallback } from 'react';
import './CropMaskEditor.css';

type EditorMode = 'crop' | 'mask' | 'paint';

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Normalized crop rect (0-1 range, relative to image dimensions)
interface NormalizedCropRect {
  x: number;  // 0-1
  y: number;  // 0-1
  width: number;  // 0-1
  height: number;  // 0-1
}

interface CropMaskEditorProps {
  imageData: string;
  mode: EditorMode;
  initialMask?: string | null; // Optional initial mask data to load
  initialCrop?: NormalizedCropRect | null; // Optional initial crop (normalized 0-1)
  initialPaint?: string | null; // Optional initial paint layer data to load
  onSave: (croppedImage: string | null, maskData: string | null, cropRect: NormalizedCropRect | null, paintData: string | null) => void;
  onCancel: () => void;
}

interface Point {
  x: number;
  y: number;
}

// Aspect ratio presets
const ASPECT_PRESETS = [
  { label: 'Free', ratio: null as number | null },
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '2.35:1', ratio: 2.35 },
  { label: '9:16', ratio: 9 / 16 },
  { label: '3:4', ratio: 3 / 4 },
];

// Tolerance for comparing crop rect to full image (in pixels, display scale)
const CROP_TOLERANCE = 2;

/**
 * Check if the mask canvas has any painted (white) pixels.
 * Returns true if any pixel is non-black (has mask content).
 */
function hasMaskContent(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  
  // Check if any pixel is non-black (R, G, or B > 0)
  // Mask is grayscale: black = no mask, white = mask
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] > 0) { // Check red channel (all channels same for grayscale)
      return true;
    }
  }
  return false;
}

/**
 * Check if the paint canvas has any painted pixels.
 * Returns true if any pixel has alpha > 0 (has paint content).
 */
function hasPaintContent(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  
  // Check if any pixel has any opacity (A > 0)
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > 0) {
      return true;
    }
  }
  return false;
}

export function CropMaskEditor({ imageData, mode: initialMode, initialMask, initialCrop, initialPaint, onSave, onCancel }: CropMaskEditorProps) {
  const [mode, setMode] = useState<EditorMode>(initialMode);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  
  // Crop state
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [isMoving, setIsMoving] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null);
  const [moveStart, setMoveStart] = useState<Point>({ x: 0, y: 0 });
  const [cropStart, setCropStart] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
  
  // Mask state
  const [isPainting, setIsPainting] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const [brushOpacity, setBrushOpacity] = useState(0.8);
  const [brushMode, setBrushMode] = useState<'add' | 'erase'>('add');
  
  // Paint state (drawing on image)
  const [isPaintDrawing, setIsPaintDrawing] = useState(false);
  const [paintColor, setPaintColor] = useState('#ff0000');
  const [paintBrushSize, setPaintBrushSize] = useState(15);
  const [paintBrushMode, setPaintBrushMode] = useState<'paint' | 'erase'>('paint');
  const [lastPaintPoint, setLastPaintPoint] = useState<Point | null>(null);
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement>(null); // Canvas for paint layer
  const paintDisplayCanvasRef = useRef<HTMLCanvasElement>(null); // Display canvas for paint
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);

  // Initialize crop rect when image loads
  const handleImageLoad = useCallback(() => {
    const img = imageRef.current;
    if (!img) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    const containerWidth = container.clientWidth - 40;
    const containerHeight = container.clientHeight - 40;
    
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const containerAspect = containerWidth / containerHeight;
    
    let displayWidth: number;
    let displayHeight: number;
    
    if (imgAspect > containerAspect) {
      displayWidth = containerWidth;
      displayHeight = containerWidth / imgAspect;
    } else {
      displayHeight = containerHeight;
      displayWidth = containerHeight * imgAspect;
    }
    
    setImageSize({ width: displayWidth, height: displayHeight });
    const newScale = displayWidth / img.naturalWidth;
    setScale(newScale);
    
    // Initialize crop rect - use initial crop if provided, otherwise full image
    if (initialCrop) {
      setCropRect({
        x: initialCrop.x * displayWidth,
        y: initialCrop.y * displayHeight,
        width: initialCrop.width * displayWidth,
        height: initialCrop.height * displayHeight,
      });
    } else {
      setCropRect({
        x: 0,
        y: 0,
        width: displayWidth,
        height: displayHeight,
      });
    }
    
    // Initialize mask canvas
    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas) {
      maskCanvas.width = img.naturalWidth;
      maskCanvas.height = img.naturalHeight;
      const ctx = maskCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
        
        // Load initial mask if provided
        if (initialMask) {
          const maskImg = new Image();
          maskImg.onload = () => {
            ctx.drawImage(maskImg, 0, 0, maskCanvas.width, maskCanvas.height);
            
            // Also update display canvas to show the mask
            const displayCanvas = displayCanvasRef.current;
            if (displayCanvas) {
              const displayCtx = displayCanvas.getContext('2d');
              if (displayCtx) {
                // Draw mask as red overlay on display canvas
                const maskData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
                const displayData = displayCtx.createImageData(displayCanvas.width, displayCanvas.height);
                
                // Scale mask to display size
                for (let y = 0; y < displayCanvas.height; y++) {
                  for (let x = 0; x < displayCanvas.width; x++) {
                    const srcX = Math.floor(x / newScale);
                    const srcY = Math.floor(y / newScale);
                    const srcIdx = (srcY * maskCanvas.width + srcX) * 4;
                    const dstIdx = (y * displayCanvas.width + x) * 4;
                    
                    const maskValue = maskData.data[srcIdx];
                    if (maskValue > 0) {
                      // Red overlay for masked areas
                      displayData.data[dstIdx] = 255;     // R
                      displayData.data[dstIdx + 1] = 50;  // G
                      displayData.data[dstIdx + 2] = 50;  // B
                      displayData.data[dstIdx + 3] = Math.floor(maskValue * 0.8); // A
                    }
                  }
                }
                displayCtx.putImageData(displayData, 0, 0);
              }
            }
          };
          maskImg.src = initialMask;
        }
      }
    }
    
    // Initialize display canvas
    const displayCanvas = displayCanvasRef.current;
    if (displayCanvas) {
      displayCanvas.width = displayWidth;
      displayCanvas.height = displayHeight;
    }
    
    // Initialize paint canvas (full resolution)
    const paintCanvas = paintCanvasRef.current;
    if (paintCanvas) {
      paintCanvas.width = img.naturalWidth;
      paintCanvas.height = img.naturalHeight;
      const ctx = paintCanvas.getContext('2d');
      if (ctx) {
        // Clear to transparent
        ctx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
        
        // Load initial paint if provided
        if (initialPaint) {
          const paintImg = new Image();
          paintImg.onload = () => {
            ctx.drawImage(paintImg, 0, 0, paintCanvas.width, paintCanvas.height);
            
            // Also update paint display canvas
            const paintDisplayCanvas = paintDisplayCanvasRef.current;
            if (paintDisplayCanvas) {
              const paintDisplayCtx = paintDisplayCanvas.getContext('2d');
              if (paintDisplayCtx) {
                paintDisplayCtx.clearRect(0, 0, paintDisplayCanvas.width, paintDisplayCanvas.height);
                paintDisplayCtx.drawImage(paintImg, 0, 0, paintDisplayCanvas.width, paintDisplayCanvas.height);
              }
            }
          };
          paintImg.src = initialPaint;
        }
      }
    }
    
    // Initialize paint display canvas (scaled for display)
    const paintDisplayCanvas = paintDisplayCanvasRef.current;
    if (paintDisplayCanvas) {
      paintDisplayCanvas.width = displayWidth;
      paintDisplayCanvas.height = displayHeight;
    }
  }, [initialMask, initialCrop, initialPaint]);

  // Get mouse position relative to image wrapper (which contains the crop overlay)
  const getMousePos = useCallback((e: React.MouseEvent): Point => {
    const wrapper = imageWrapperRef.current;
    if (!wrapper) return { x: 0, y: 0 };
    const rect = wrapper.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  // Crop handlers
  const handleCropMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getMousePos(e);
    const handleSize = 20; // Size of handle hit area
    
    // Check if clicking on a resize handle (corners)
    const onTL = pos.x >= cropRect.x - handleSize/2 && pos.x <= cropRect.x + handleSize/2 &&
                 pos.y >= cropRect.y - handleSize/2 && pos.y <= cropRect.y + handleSize/2;
    const onTR = pos.x >= cropRect.x + cropRect.width - handleSize/2 && pos.x <= cropRect.x + cropRect.width + handleSize/2 &&
                 pos.y >= cropRect.y - handleSize/2 && pos.y <= cropRect.y + handleSize/2;
    const onBL = pos.x >= cropRect.x - handleSize/2 && pos.x <= cropRect.x + handleSize/2 &&
                 pos.y >= cropRect.y + cropRect.height - handleSize/2 && pos.y <= cropRect.y + cropRect.height + handleSize/2;
    const onBR = pos.x >= cropRect.x + cropRect.width - handleSize/2 && pos.x <= cropRect.x + cropRect.width + handleSize/2 &&
                 pos.y >= cropRect.y + cropRect.height - handleSize/2 && pos.y <= cropRect.y + cropRect.height + handleSize/2;
    
    if (onTL) {
      setIsResizing(true);
      setResizeHandle('tl');
      setCropStart(cropRect);
      setDragStart(pos);
    } else if (onTR) {
      setIsResizing(true);
      setResizeHandle('tr');
      setCropStart(cropRect);
      setDragStart(pos);
    } else if (onBL) {
      setIsResizing(true);
      setResizeHandle('bl');
      setCropStart(cropRect);
      setDragStart(pos);
    } else if (onBR) {
      setIsResizing(true);
      setResizeHandle('br');
      setCropStart(cropRect);
      setDragStart(pos);
    } else if (
      // Check if clicking inside existing crop (for moving)
      pos.x >= cropRect.x &&
      pos.x <= cropRect.x + cropRect.width &&
      pos.y >= cropRect.y &&
      pos.y <= cropRect.y + cropRect.height &&
      cropRect.width > 10
    ) {
      setIsMoving(true);
      setMoveStart(pos);
      setCropStart(cropRect);
    } else {
      // Start new crop drag
      setIsDragging(true);
      setDragStart(pos);
      setCropRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
    }
  }, [cropRect, getMousePos]);

  const handleCropMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = getMousePos(e);
    
    if (isDragging) {
      let width = pos.x - dragStart.x;
      let height = pos.y - dragStart.y;
      
      // Apply aspect ratio constraint
      if (aspectRatio !== null) {
        const absWidth = Math.abs(width);
        const absHeight = Math.abs(height);
        const targetHeight = absWidth / aspectRatio;
        
        if (targetHeight > absHeight) {
          height = height > 0 ? absWidth / aspectRatio : -absWidth / aspectRatio;
        } else {
          width = width > 0 ? absHeight * aspectRatio : -absHeight * aspectRatio;
        }
      }
      
      setCropRect({
        x: width < 0 ? dragStart.x + width : dragStart.x,
        y: height < 0 ? dragStart.y + height : dragStart.y,
        width: Math.abs(width),
        height: Math.abs(height),
      });
    } else if (isMoving) {
      const dx = pos.x - moveStart.x;
      const dy = pos.y - moveStart.y;
      
      // Clamp to image bounds
      let newX = Math.max(0, Math.min(cropStart.x + dx, imageSize.width - cropStart.width));
      let newY = Math.max(0, Math.min(cropStart.y + dy, imageSize.height - cropStart.height));
      
      setCropRect({
        x: newX,
        y: newY,
        width: cropStart.width,
        height: cropStart.height,
      });
    } else if (isResizing && resizeHandle) {
      let newX = cropStart.x;
      let newY = cropStart.y;
      let newWidth = cropStart.width;
      let newHeight = cropStart.height;
      
      switch (resizeHandle) {
        case 'br': // Bottom-right
          newWidth = pos.x - cropStart.x;
          newHeight = pos.y - cropStart.y;
          break;
        case 'tr': // Top-right
          newWidth = pos.x - cropStart.x;
          newHeight = cropStart.y + cropStart.height - pos.y;
          newY = pos.y;
          break;
        case 'bl': // Bottom-left
          newWidth = cropStart.x + cropStart.width - pos.x;
          newHeight = pos.y - cropStart.y;
          newX = pos.x;
          break;
        case 'tl': // Top-left
          newWidth = cropStart.x + cropStart.width - pos.x;
          newHeight = cropStart.y + cropStart.height - pos.y;
          newX = pos.x;
          newY = pos.y;
          break;
      }
      
      // Apply aspect ratio constraint
      if (aspectRatio !== null) {
        if (resizeHandle === 'br' || resizeHandle === 'tl') {
          newHeight = newWidth / aspectRatio;
          if (resizeHandle === 'tl') {
            newY = cropStart.y + cropStart.height - newHeight;
          }
        } else {
          newHeight = newWidth / aspectRatio;
          if (resizeHandle === 'tr') {
            newY = cropStart.y + cropStart.height - newHeight;
          }
        }
      }
      
      // Ensure positive dimensions and clamp to image bounds
      if (newWidth > 10 && newHeight > 10) {
        newX = Math.max(0, Math.min(newX, imageSize.width - 10));
        newY = Math.max(0, Math.min(newY, imageSize.height - 10));
        newWidth = Math.min(newWidth, imageSize.width - newX);
        newHeight = Math.min(newHeight, imageSize.height - newY);
        
        setCropRect({
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
        });
      }
    }
  }, [isDragging, isMoving, isResizing, resizeHandle, dragStart, moveStart, cropStart, aspectRatio, imageSize, getMousePos]);

  const handleCropMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsMoving(false);
    setIsResizing(false);
    setResizeHandle(null);
  }, []);

  // Mask handlers
  const getCanvasPoint = useCallback((e: React.MouseEvent): Point | null => {
    // Get the image wrapper element (parent of the canvas)
    const canvas = displayCanvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    // Mouse position relative to the canvas/image
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    return { x: x / scale, y: y / scale };
  }, [scale]);

  const paint = useCallback((e: React.MouseEvent) => {
    const point = getCanvasPoint(e);
    if (!point) return;
    
    const displayCanvas = displayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!displayCanvas || !maskCanvas) return;
    
    const displayCtx = displayCanvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    if (!displayCtx || !maskCtx) return;
    
    const displayX = point.x * scale;
    const displayY = point.y * scale;
    const displayBrushSize = brushSize;
    
    if (brushMode === 'add') {
      // Draw on display canvas (red overlay for visibility)
      displayCtx.beginPath();
      displayCtx.arc(displayX, displayY, displayBrushSize / 2, 0, Math.PI * 2);
      displayCtx.fillStyle = `rgba(255, 50, 50, ${brushOpacity})`;
      displayCtx.fill();
      
      // Draw on mask canvas (actual mask - white = masked)
      maskCtx.beginPath();
      maskCtx.arc(point.x, point.y, brushSize / scale / 2, 0, Math.PI * 2);
      maskCtx.fillStyle = 'white';
      maskCtx.fill();
    } else {
      // Erase mode - clear on display canvas
      displayCtx.globalCompositeOperation = 'destination-out';
      displayCtx.beginPath();
      displayCtx.arc(displayX, displayY, displayBrushSize / 2, 0, Math.PI * 2);
      displayCtx.fill();
      displayCtx.globalCompositeOperation = 'source-over';
      
      // Erase on mask canvas (black = not masked)
      maskCtx.beginPath();
      maskCtx.arc(point.x, point.y, brushSize / scale / 2, 0, Math.PI * 2);
      maskCtx.fillStyle = 'black';
      maskCtx.fill();
    }
  }, [getCanvasPoint, brushSize, brushOpacity, brushMode, scale]);

  const handleMaskMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsPainting(true);
    paint(e);
  }, [paint]);

  const handleMaskMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPainting) {
      paint(e);
    }
  }, [isPainting, paint]);

  const handleMaskMouseUp = useCallback(() => {
    setIsPainting(false);
  }, []);

  // Paint handlers (draw on image)
  const getPaintCanvasPoint = useCallback((e: React.MouseEvent): Point | null => {
    const canvas = paintDisplayCanvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    return { x: x / scale, y: y / scale };
  }, [scale]);

  const drawPaintStroke = useCallback((from: Point | null, to: Point) => {
    const paintCanvas = paintCanvasRef.current;
    const paintDisplayCanvas = paintDisplayCanvasRef.current;
    if (!paintCanvas || !paintDisplayCanvas) return;
    
    const paintCtx = paintCanvas.getContext('2d');
    const paintDisplayCtx = paintDisplayCanvas.getContext('2d');
    if (!paintCtx || !paintDisplayCtx) return;
    
    // Configure paint brush for full resolution canvas
    const actualBrushSize = paintBrushSize / scale;
    
    if (paintBrushMode === 'paint') {
      // Draw on full-res paint canvas
      paintCtx.lineCap = 'round';
      paintCtx.lineJoin = 'round';
      paintCtx.lineWidth = actualBrushSize;
      paintCtx.strokeStyle = paintColor;
      paintCtx.fillStyle = paintColor;
      
      if (from) {
        paintCtx.beginPath();
        paintCtx.moveTo(from.x, from.y);
        paintCtx.lineTo(to.x, to.y);
        paintCtx.stroke();
      } else {
        paintCtx.beginPath();
        paintCtx.arc(to.x, to.y, actualBrushSize / 2, 0, Math.PI * 2);
        paintCtx.fill();
      }
      
      // Draw on display canvas (scaled)
      paintDisplayCtx.lineCap = 'round';
      paintDisplayCtx.lineJoin = 'round';
      paintDisplayCtx.lineWidth = paintBrushSize;
      paintDisplayCtx.strokeStyle = paintColor;
      paintDisplayCtx.fillStyle = paintColor;
      
      const displayFrom = from ? { x: from.x * scale, y: from.y * scale } : null;
      const displayTo = { x: to.x * scale, y: to.y * scale };
      
      if (displayFrom) {
        paintDisplayCtx.beginPath();
        paintDisplayCtx.moveTo(displayFrom.x, displayFrom.y);
        paintDisplayCtx.lineTo(displayTo.x, displayTo.y);
        paintDisplayCtx.stroke();
      } else {
        paintDisplayCtx.beginPath();
        paintDisplayCtx.arc(displayTo.x, displayTo.y, paintBrushSize / 2, 0, Math.PI * 2);
        paintDisplayCtx.fill();
      }
    } else {
      // Erase mode
      paintCtx.globalCompositeOperation = 'destination-out';
      paintCtx.lineCap = 'round';
      paintCtx.lineJoin = 'round';
      paintCtx.lineWidth = actualBrushSize;
      
      if (from) {
        paintCtx.beginPath();
        paintCtx.moveTo(from.x, from.y);
        paintCtx.lineTo(to.x, to.y);
        paintCtx.stroke();
      } else {
        paintCtx.beginPath();
        paintCtx.arc(to.x, to.y, actualBrushSize / 2, 0, Math.PI * 2);
        paintCtx.fill();
      }
      paintCtx.globalCompositeOperation = 'source-over';
      
      // Erase on display canvas
      paintDisplayCtx.globalCompositeOperation = 'destination-out';
      paintDisplayCtx.lineCap = 'round';
      paintDisplayCtx.lineJoin = 'round';
      paintDisplayCtx.lineWidth = paintBrushSize;
      
      const displayFrom = from ? { x: from.x * scale, y: from.y * scale } : null;
      const displayTo = { x: to.x * scale, y: to.y * scale };
      
      if (displayFrom) {
        paintDisplayCtx.beginPath();
        paintDisplayCtx.moveTo(displayFrom.x, displayFrom.y);
        paintDisplayCtx.lineTo(displayTo.x, displayTo.y);
        paintDisplayCtx.stroke();
      } else {
        paintDisplayCtx.beginPath();
        paintDisplayCtx.arc(displayTo.x, displayTo.y, paintBrushSize / 2, 0, Math.PI * 2);
        paintDisplayCtx.fill();
      }
      paintDisplayCtx.globalCompositeOperation = 'source-over';
    }
  }, [paintBrushSize, paintBrushMode, paintColor, scale]);

  const handlePaintMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const point = getPaintCanvasPoint(e);
    if (!point) return;
    
    setIsPaintDrawing(true);
    setLastPaintPoint(point);
    drawPaintStroke(null, point);
  }, [getPaintCanvasPoint, drawPaintStroke]);

  const handlePaintMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPaintDrawing) return;
    
    const point = getPaintCanvasPoint(e);
    if (!point) return;
    
    drawPaintStroke(lastPaintPoint, point);
    setLastPaintPoint(point);
  }, [isPaintDrawing, getPaintCanvasPoint, lastPaintPoint, drawPaintStroke]);

  const handlePaintMouseUp = useCallback(() => {
    setIsPaintDrawing(false);
    setLastPaintPoint(null);
  }, []);

  // Clear paint canvas
  const clearPaint = useCallback(() => {
    const paintCanvas = paintCanvasRef.current;
    const paintDisplayCanvas = paintDisplayCanvasRef.current;
    if (!paintCanvas || !paintDisplayCanvas) return;
    
    const paintCtx = paintCanvas.getContext('2d');
    const paintDisplayCtx = paintDisplayCanvas.getContext('2d');
    if (!paintCtx || !paintDisplayCtx) return;
    
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    paintDisplayCtx.clearRect(0, 0, paintDisplayCanvas.width, paintDisplayCanvas.height);
  }, []);

  /**
   * Check if crop rect is effectively the full image (no crop applied).
   */
  const isCropFullImage = useCallback((): boolean => {
    return (
      Math.abs(cropRect.x) < CROP_TOLERANCE &&
      Math.abs(cropRect.y) < CROP_TOLERANCE &&
      Math.abs(cropRect.width - imageSize.width) < CROP_TOLERANCE &&
      Math.abs(cropRect.height - imageSize.height) < CROP_TOLERANCE
    );
  }, [cropRect, imageSize]);

  /**
   * Unified save handler that processes operations in order: Paint → Mask → Crop
   * - Paint applied to original image FIRST
   * - Mask applied as alpha channel SECOND  
   * - Crop applied LAST
   */
  const handleSave = useCallback(() => {
    const img = imageRef.current;
    const maskCanvas = maskCanvasRef.current;
    const paintCanvas = paintCanvasRef.current;
    
    if (!img) {
      console.error('[CropMaskEditor] No image ref');
      onCancel();
      return;
    }
    
    // Determine what operations are needed
    const hasCrop = !isCropFullImage();
    const hasMask = maskCanvas ? hasMaskContent(maskCanvas) : false;
    const hasPaint = paintCanvas ? hasPaintContent(paintCanvas) : false;
    
    console.log('[CropMaskEditor] handleSave - hasPaint:', hasPaint, 'hasMask:', hasMask, 'hasCrop:', hasCrop);
    console.log('[CropMaskEditor] handleSave - cropRect:', cropRect);
    console.log('[CropMaskEditor] handleSave - imageSize:', imageSize);
    
    // Case 1: No changes - do nothing
    if (!hasCrop && !hasMask && !hasPaint) {
      console.log('[CropMaskEditor] No changes detected, closing without saving');
      onSave(null, null, null, null);
      return;
    }
    
    // Calculate normalized crop rect (0-1 range)
    const normalizedCrop: NormalizedCropRect | null = hasCrop ? {
      x: cropRect.x / imageSize.width,
      y: cropRect.y / imageSize.height,
      width: cropRect.width / imageSize.width,
      height: cropRect.height / imageSize.height,
    } : null;
    
    // Calculate crop coordinates in original image space
    const cropX = cropRect.x / scale;
    const cropY = cropRect.y / scale;
    const cropWidth = cropRect.width / scale;
    const cropHeight = cropRect.height / scale;
    
    // Step 1: Create base canvas with original image + paint (Paint FIRST)
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = img.naturalWidth;
    baseCanvas.height = img.naturalHeight;
    const baseCtx = baseCanvas.getContext('2d');
    
    if (!baseCtx) {
      console.error('[CropMaskEditor] Failed to create base canvas context');
      onCancel();
      return;
    }
    
    // Draw original image
    baseCtx.drawImage(img, 0, 0);
    
    // Apply paint layer on top of original (Paint FIRST)
    if (hasPaint && paintCanvas) {
      console.log('[CropMaskEditor] Applying paint layer');
      baseCtx.drawImage(paintCanvas, 0, 0);
    }
    
    // Get raw paint data for re-editing later
    const rawPaintData = hasPaint && paintCanvas ? paintCanvas.toDataURL('image/png') : null;
    
    // Step 2: Apply mask as alpha channel (Mask SECOND)
    if (hasMask && maskCanvas) {
      console.log('[CropMaskEditor] Applying mask as alpha channel');
      
      const imgData = baseCtx.getImageData(0, 0, baseCanvas.width, baseCanvas.height);
      const pixels = imgData.data;
      
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) {
        console.error('[CropMaskEditor] Failed to get mask context');
        onCancel();
        return;
      }
      
      const maskImgData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
      const maskPixels = maskImgData.data;
      
      // Apply mask to alpha channel (white = opaque, black = transparent)
      for (let i = 0; i < pixels.length; i += 4) {
        const maskValue = maskPixels[i]; // R channel (grayscale)
        pixels[i + 3] = maskValue; // Set alpha from mask
      }
      
      baseCtx.putImageData(imgData, 0, 0);
    }
    
    // Get raw mask data for re-editing later
    const rawMaskData = hasMask && maskCanvas ? maskCanvas.toDataURL('image/png') : null;
    
    // Step 3: Apply crop (Crop LAST)
    let resultData: string;
    if (hasCrop) {
      console.log('[CropMaskEditor] Applying crop');
      
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = cropWidth;
      croppedCanvas.height = cropHeight;
      const croppedCtx = croppedCanvas.getContext('2d');
      
      if (!croppedCtx) {
        console.error('[CropMaskEditor] Failed to create cropped canvas context');
        onCancel();
        return;
      }
      
      croppedCtx.drawImage(
        baseCanvas,
        Math.max(0, cropX),
        Math.max(0, cropY),
        Math.min(cropWidth, img.naturalWidth - cropX),
        Math.min(cropHeight, img.naturalHeight - cropY),
        0, 0,
        croppedCanvas.width, croppedCanvas.height
      );
      
      resultData = croppedCanvas.toDataURL('image/png');
    } else {
      resultData = baseCanvas.toDataURL('image/png');
    }
    
    console.log('[CropMaskEditor] Result length:', resultData.length);
    onSave(resultData, rawMaskData, normalizedCrop, rawPaintData);
  }, [cropRect, imageSize, scale, isCropFullImage, onSave, onCancel]);

  // Clear mask
  const clearMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    const displayCanvas = displayCanvasRef.current;
    if (!maskCanvas || !displayCanvas) return;
    
    const maskCtx = maskCanvas.getContext('2d');
    const displayCtx = displayCanvas.getContext('2d');
    if (!maskCtx || !displayCtx) return;
    
    // Clear mask to black (no mask)
    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    
    // Clear display canvas completely
    displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
  }, []);

  // Handle aspect ratio change
  const handleAspectChange = useCallback((ratio: number | null) => {
    setAspectRatio(ratio);
    // Adjust current crop to match new aspect ratio, keeping center
    if (cropRect.width > 0 && cropRect.height > 0 && ratio !== null) {
      const currentAspect = cropRect.width / cropRect.height;
      const centerX = cropRect.x + cropRect.width / 2;
      const centerY = cropRect.y + cropRect.height / 2;
      
      let newWidth = cropRect.width;
      let newHeight = cropRect.height;
      
      if (currentAspect > ratio) {
        // Current is wider, adjust height
        newHeight = newWidth / ratio;
      } else {
        // Current is taller, adjust width
        newWidth = newHeight * ratio;
      }
      
      // Clamp to image bounds (0,0 to width,height)
      newWidth = Math.min(newWidth, imageSize.width);
      newHeight = Math.min(newHeight, imageSize.height);
      
      // Clamp position to keep crop inside image
      let newX = centerX - newWidth / 2;
      let newY = centerY - newHeight / 2;
      newX = Math.max(0, Math.min(newX, imageSize.width - newWidth));
      newY = Math.max(0, Math.min(newY, imageSize.height - newHeight));
      
      setCropRect({
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
      });
    }
  }, [cropRect, imageSize]);

  // Reset crop to full image
  const resetCrop = useCallback(() => {
    setCropRect({
      x: 0,
      y: 0,
      width: imageSize.width,
      height: imageSize.height,
    });
    setAspectRatio(null);
  }, [imageSize]);

  return (
    <div className="crop-mask-editor-overlay">
      <div className="crop-mask-editor-modal">
        {/* Header */}
        <div className="crop-mask-editor-header">
          <h3>{mode === 'crop' ? 'Crop Image' : mode === 'mask' ? 'Edit Mask' : 'Paint on Image'}</h3>
          <div className="mode-toggle">
            <button 
              className={mode === 'crop' ? 'active' : ''} 
              onClick={() => setMode('crop')}
            >
              ✂ Crop
            </button>
            <button 
              className={mode === 'mask' ? 'active' : ''} 
              onClick={() => setMode('mask')}
            >
              🎭 Mask
            </button>
            <button 
              className={mode === 'paint' ? 'active' : ''} 
              onClick={() => setMode('paint')}
            >
              🖌️ Paint
            </button>
          </div>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>

        {/* Toolbar */}
        <div className="crop-mask-editor-toolbar">
          {mode === 'crop' && (
            <div className="crop-toolbar">
              <span>Aspect Ratio:</span>
              <div className="aspect-presets">
                {ASPECT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    className={aspectRatio === preset.ratio ? 'active' : ''}
                    onClick={() => handleAspectChange(preset.ratio)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <button className="reset-crop-btn" onClick={resetCrop} title="Reset crop to full image">
                🗑️ Reset
              </button>
            </div>
          )}
          {mode === 'mask' && (
            <div className="mask-toolbar">
              <div className="brush-controls">
                <label>
                  Size:
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                  />
                  <span>{brushSize}px</span>
                </label>
                <label>
                  Opacity:
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.1"
                    value={brushOpacity}
                    onChange={(e) => setBrushOpacity(Number(e.target.value))}
                  />
                  <span>{Math.round(brushOpacity * 100)}%</span>
                </label>
              </div>
              <div className="brush-modes">
                <button
                  className={brushMode === 'add' ? 'active' : ''}
                  onClick={() => setBrushMode('add')}
                >
                  ✏️ Add
                </button>
                <button
                  className={brushMode === 'erase' ? 'active' : ''}
                  onClick={() => setBrushMode('erase')}
                >
                  🧹 Erase
                </button>
                <button onClick={clearMask}>🗑️ Clear</button>
              </div>
            </div>
          )}
          {mode === 'paint' && (
            <div className="paint-toolbar">
              <div className="brush-controls">
                <label>
                  Size:
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={paintBrushSize}
                    onChange={(e) => setPaintBrushSize(Number(e.target.value))}
                  />
                  <span>{paintBrushSize}px</span>
                </label>
                <label className="color-picker-label">
                  Color:
                  <input
                    type="color"
                    value={paintColor}
                    onChange={(e) => setPaintColor(e.target.value)}
                    className="color-picker"
                  />
                  <span className="color-preview" style={{ backgroundColor: paintColor }} />
                </label>
              </div>
              <div className="brush-modes">
                <button
                  className={paintBrushMode === 'paint' ? 'active' : ''}
                  onClick={() => setPaintBrushMode('paint')}
                >
                  🖌️ Paint
                </button>
                <button
                  className={paintBrushMode === 'erase' ? 'active' : ''}
                  onClick={() => setPaintBrushMode('erase')}
                >
                  🧹 Erase
                </button>
                <button onClick={clearPaint}>🗑️ Clear</button>
              </div>
            </div>
          )}
        </div>

        {/* Canvas Area */}
        <div className="crop-mask-editor-canvas" ref={containerRef}>
          {/* Image wrapper - centered, contains image and overlays */}
          <div 
            ref={imageWrapperRef}
            className="image-wrapper"
            style={{
              width: imageSize.width,
              height: imageSize.height,
              position: 'relative',
            }}
          >
            <img
              ref={imageRef}
              src={imageData}
              alt="Source"
              onLoad={handleImageLoad}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
              }}
            />
            
            {/* Mask display canvas - overlaid on image */}
            <canvas
              ref={displayCanvasRef}
              className="mask-display-canvas"
              style={{
                display: mode === 'mask' ? 'block' : 'none',
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                pointerEvents: mode === 'mask' ? 'auto' : 'none',
              }}
              onMouseDown={handleMaskMouseDown}
              onMouseMove={handleMaskMouseMove}
              onMouseUp={handleMaskMouseUp}
              onMouseLeave={handleMaskMouseUp}
            />
            
            {/* Paint display canvas - overlaid on image, always visible when there's paint */}
            <canvas
              ref={paintDisplayCanvasRef}
              className="paint-display-canvas"
              style={{
                display: 'block',
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                pointerEvents: mode === 'paint' ? 'auto' : 'none',
              }}
              onMouseDown={handlePaintMouseDown}
              onMouseMove={handlePaintMouseMove}
              onMouseUp={handlePaintMouseUp}
              onMouseLeave={handlePaintMouseUp}
            />
            
            {/* Crop overlay - positioned over image */}
            {mode === 'crop' && (
              <div
                className="crop-overlay"
                onMouseDown={handleCropMouseDown}
                onMouseMove={handleCropMouseMove}
                onMouseUp={handleCropMouseUp}
                onMouseLeave={handleCropMouseUp}
              >
                {/* Darkened areas outside crop */}
                <div className="crop-darken" style={{
                  clipPath: `polygon(
                    0 0, 100% 0, 100% 100%, 0 100%,
                    0 ${cropRect.y}px,
                    ${cropRect.x}px ${cropRect.y}px,
                    ${cropRect.x}px ${cropRect.y + cropRect.height}px,
                    ${cropRect.x + cropRect.width}px ${cropRect.y + cropRect.height}px,
                    ${cropRect.x + cropRect.width}px ${cropRect.y}px,
                    ${cropRect.x}px ${cropRect.y}px,
                    0 ${cropRect.y}px
                  )`,
                }} />
                
                {/* Crop rectangle */}
                <div
                  className="crop-rect"
                  style={{
                    left: cropRect.x,
                    top: cropRect.y,
                    width: cropRect.width,
                    height: cropRect.height,
                  }}
                >
                  <div className="crop-handles">
                    <div className="crop-handle tl" />
                    <div className="crop-handle tr" />
                    <div className="crop-handle bl" />
                    <div className="crop-handle br" />
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Hidden mask canvas */}
          <canvas
            ref={maskCanvasRef}
            className="mask-canvas"
            style={{ display: 'none' }}
          />
          
          {/* Hidden paint canvas (full resolution) */}
          <canvas
            ref={paintCanvasRef}
            className="paint-canvas"
            style={{ display: 'none' }}
          />
        </div>

        {/* Footer */}
        <div className="crop-mask-editor-footer">
          <div className="crop-info">
            {mode === 'crop' && cropRect.width > 0 && (
              <span>
                {Math.round(cropRect.width / scale)} × {Math.round(cropRect.height / scale)} px
              </span>
            )}
          </div>
          <div className="action-buttons">
            <button className="cancel-btn" onClick={onCancel}>Cancel</button>
            <button className="save-btn" onClick={handleSave}>
              {mode === 'crop' ? 'Apply Crop' : mode === 'mask' ? 'Save Mask' : 'Apply Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CropMaskEditor;
