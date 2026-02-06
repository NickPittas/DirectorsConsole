/**
 * Viewer Utilities - Helper functions for image viewer functionality
 * 
 * Features:
 * - Image dimension loading with caching
 * - File size formatting
 * - File size fetching via HEAD request
 * - Model name extraction from workflows
 * - Keyboard shortcut handling
 */

// ============================================================================
// Types
// ============================================================================

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageMetadataExtended {
  url: string;
  dimensions?: ImageDimensions;
  fileSize?: number;
  fileSizeFormatted?: string;
  lastModified?: Date;
}

// ============================================================================
// Cache for image dimensions to avoid redundant loading
// ============================================================================

const dimensionsCache = new Map<string, ImageDimensions>();
const fileSizeCache = new Map<string, { size: number; timestamp: number }>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Image Dimension Loading
// ============================================================================

/**
 * Load natural dimensions of an image from URL
 * Uses caching to avoid redundant requests
 */
export async function loadImageDimensions(url: string): Promise<ImageDimensions | undefined> {
  // Check cache first
  const cached = dimensionsCache.get(url);
  if (cached) {
    return cached;
  }

  try {
    const img = new Image();
    const dimensions = await new Promise<ImageDimensions | undefined>((resolve) => {
      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.onerror = () => {
        resolve(undefined);
      };
      // Set a timeout to avoid hanging
      setTimeout(() => resolve(undefined), 10000);
      img.src = url;
    });

    if (dimensions) {
      dimensionsCache.set(url, dimensions);
    }
    return dimensions;
  } catch (error) {
    console.warn('[viewer-utils] Failed to load image dimensions:', error);
    return undefined;
  }
}

/**
 * Clear dimensions cache for a specific URL or all URLs
 */
export function clearDimensionsCache(url?: string): void {
  if (url) {
    dimensionsCache.delete(url);
  } else {
    dimensionsCache.clear();
  }
}

// ============================================================================
// File Size Utilities
// ============================================================================

/**
 * Format file size in bytes to human-readable string
 */
export function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) {
    return 'Unknown';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Fetch file size via HEAD request
 * Uses caching to avoid redundant requests
 */
export async function fetchFileSize(url: string): Promise<number | undefined> {
  // Check cache first
  const cached = fileSizeCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.size;
  }

  try {
    const response = await fetch(url, { method: 'HEAD' });
    const contentLength = response.headers.get('content-length');
    
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      fileSizeCache.set(url, { size, timestamp: Date.now() });
      return size;
    }
    return undefined;
  } catch (error) {
    console.warn('[viewer-utils] Failed to fetch file size:', error);
    return undefined;
  }
}

/**
 * Get file size with automatic caching
 */
export async function getFileSize(url: string): Promise<number | undefined> {
  return fetchFileSize(url);
}

// ============================================================================
// Model Name Extraction
// ============================================================================

/**
 * Extract model name from workflow parameters
 * Looks for common model-related parameter names
 */
export function extractModelName(parameters: Record<string, unknown> | undefined): string | undefined {
  if (!parameters) return undefined;

  // Common model parameter names in ComfyUI workflows
  const modelKeys = [
    'model',
    'ckpt_name',
    'checkpoint',
    'model_name',
    'unet_name',
    'clip_name',
    'vae_name',
  ];

  for (const key of modelKeys) {
    const value = parameters[key];
    if (typeof value === 'string' && value.trim()) {
      // Extract just the filename without path
      const parts = value.split(/[\\/]/);
      const filename = parts[parts.length - 1];
      // Remove common extensions
      return filename.replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, '');
    }
  }

  // Check for nested parameters (e.g., "15:ckpt_name")
  for (const [key, value] of Object.entries(parameters)) {
    if (typeof value === 'string' && value.trim()) {
      for (const modelKey of modelKeys) {
        if (key.toLowerCase().includes(modelKey)) {
          const parts = value.split(/[\\/]/);
          const filename = parts[parts.length - 1];
          return filename.replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, '');
        }
      }
    }
  }

  return undefined;
}

/**
 * Extract sampler name from workflow parameters
 */
export function extractSamplerName(parameters: Record<string, unknown> | undefined): string | undefined {
  if (!parameters) return undefined;

  const samplerKeys = ['sampler', 'sampler_name', 'scheduler'];

  for (const key of samplerKeys) {
    const value = parameters[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return undefined;
}

/**
 * Extract resolution from workflow parameters or image dimensions
 */
export function extractResolution(
  parameters: Record<string, unknown> | undefined,
  dimensions?: ImageDimensions
): string | undefined {
  if (dimensions) {
    return `${dimensions.width}×${dimensions.height}`;
  }

  if (!parameters) return undefined;

  // Try to find width/height in parameters
  const width = parameters['width'] || parameters['image_width'];
  const height = parameters['height'] || parameters['image_height'];

  if (typeof width === 'number' && typeof height === 'number') {
    return `${width}×${height}`;
  }

  return undefined;
}

// ============================================================================
// Prompt Formatting
// ============================================================================

/**
 * Extract full prompt text from parameters
 */
export function extractPromptText(parameters: Record<string, unknown> | undefined): string | undefined {
  if (!parameters) return undefined;

  const promptKeys = ['positive_prompt', 'prompt', 'text', 'positive'];

  for (const key of promptKeys) {
    const value = parameters[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  // Check for nested parameters
  for (const [key, value] of Object.entries(parameters)) {
    if (typeof value === 'string' && value.trim()) {
      for (const promptKey of promptKeys) {
        if (key.toLowerCase().includes(promptKey)) {
          return value.trim();
        }
      }
    }
  }

  return undefined;
}

/**
 * Truncate text with ellipsis if it exceeds max length
 */
export function truncateText(text: string | undefined, maxLength: number): string | undefined {
  if (!text) return undefined;
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

export interface KeyboardShortcut {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  description: string;
}

export const VIEWER_SHORTCUTS: Record<string, KeyboardShortcut> = {
  escape: { key: 'Escape', description: 'Close viewer' },
  prevImage: { key: 'ArrowLeft', description: 'Previous image' },
  nextImage: { key: 'ArrowRight', description: 'Next image' },
  zoomIn: { key: '+', description: 'Zoom in' },
  zoomOut: { key: '-', description: 'Zoom out' },
  fitToScreen: { key: 'f', description: 'Fit to screen' },
  actualSize: { key: '1', description: 'Actual size (100%)' },
  toggleMetadata: { key: 'i', description: 'Toggle metadata panel' },
  toggleCompare: { key: 'c', description: 'Toggle compare mode' },
  resetZoom: { key: '0', description: 'Reset zoom and pan' },
};

/**
 * Check if a keyboard event matches a shortcut
 */
export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: KeyboardShortcut
): boolean {
  const keyMatch = event.key === shortcut.key || event.code === shortcut.key;
  const altMatch = !!shortcut.altKey === event.altKey;
  const ctrlMatch = !!shortcut.ctrlKey === event.ctrlKey;
  const shiftMatch = !!shortcut.shiftKey === event.shiftKey;
  const metaMatch = !!shortcut.metaKey === event.metaKey;

  return keyMatch && altMatch && ctrlMatch && shiftMatch && metaMatch;
}

// ============================================================================
// Zoom Calculations
// ============================================================================

/**
 * Calculate zoom level to fit image within container
 */
export function calculateFitZoom(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding: number = 20
): number {
  const availableWidth = containerWidth - padding * 2;
  const availableHeight = containerHeight - padding * 2;

  const scaleX = availableWidth / imageWidth;
  const scaleY = availableHeight / imageHeight;

  return Math.min(scaleX, scaleY, 1); // Never zoom in beyond 100% for fit
}

/**
 * Calculate zoom level for actual size (100%)
 */
export function calculateActualSizeZoom(): number {
  return 1;
}

/**
 * Clamp zoom level to valid range
 */
export function clampZoom(zoom: number, min: number = 0.1, max: number = 5): number {
  return Math.max(min, Math.min(max, zoom));
}

// ============================================================================
// Window Dimensions Helper
// ============================================================================

/**
 * Get current window/viewport dimensions
 */
export function getViewportDimensions(): { width: number; height: number } {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

/**
 * Check if viewport is considered "narrow" (mobile/tablet)
 */
export function isNarrowViewport(threshold: number = 768): boolean {
  return window.innerWidth < threshold;
}

// ============================================================================
// Timestamp Formatting
// ============================================================================

/**
 * Format a timestamp to readable string
 */
export function formatTimestamp(date: Date | string | undefined): string | undefined {
  if (!date) return undefined;
  
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return undefined;

  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
