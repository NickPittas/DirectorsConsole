import { getAgentMediaAsset, type AgentMediaAsset } from './agent-media-library';
import { extractAgentVideoFrames } from './agent-video-frames';

const MAX_PREVIEW_BYTES = 192 * 1024;
const MAX_FRAME_BYTES = 64 * 1024;
const MAX_EDGE = 768;
const SCALES = [1, 0.8, 0.65, 0.5, 0.4, 0.3, 0.2];
const QUALITIES = [0.8, 0.62, 0.45, 0.3];

type InspectionImage = { data: string; mimeType: 'image/jpeg'; timestampSeconds?: number };

function assertCurrent(asset: AgentMediaAsset): void {
  if (getAgentMediaAsset(asset.id)?.file !== asset.file) {
    throw new Error(`Media asset "${asset.name}" was removed or replaced during inspection.`);
  }
}

function decodeBitmap(source: Blob, signal: AbortSignal): Promise<ImageBitmap> {
  signal.throwIfAborted();
  const pending = createImageBitmap(source);
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(bitmap => {
      if (settled || signal.aborted) {
        bitmap.close();
        return;
      }
      settled = true;
      cleanup();
      resolve(bitmap);
    }, error => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    if (signal.aborted) onAbort();
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      canvas.toBlob(blob => {
        if (settled) return;
        settled = true;
        cleanup();
        if (blob) resolve(blob);
        else reject(new Error('The browser could not encode a JPEG preview.'));
      }, 'image/jpeg', quality);
    } catch (error) {
      settled = true;
      cleanup();
      reject(error);
    }
    if (signal.aborted) onAbort();
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function encodePreview(
  bitmap: ImageBitmap,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string | null> {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error('The browser could not create a canvas for the preview.');
  }
  const edgeScale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  try {
    for (const scale of SCALES) {
      signal.throwIfAborted();
      canvas.width = Math.max(1, Math.round(bitmap.width * edgeScale * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * edgeScale * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of QUALITIES) {
        signal.throwIfAborted();
        const blob = await canvasBlob(canvas, quality, signal);
        signal.throwIfAborted();
        if (blob.size <= maxBytes) {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          signal.throwIfAborted();
          return toBase64(bytes);
        }
      }
    }
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function result(asset: AgentMediaAsset, perception: 'image-preview' | 'sampled-video-frames' | 'metadata-only', images: InspectionImage[], note?: string) {
  return { assetId: asset.id, name: asset.name, kind: asset.kind, perception, images, ...(note ? { note } : {}) };
}

export async function inspectAgentMedia(
  assetId: string,
  signal: AbortSignal,
): Promise<{
  assetId: string;
  name: string;
  kind: 'image' | 'video' | 'audio';
  perception: 'image-preview' | 'sampled-video-frames' | 'metadata-only';
  images: Array<{ data: string; mimeType: 'image/jpeg'; timestampSeconds?: number }>;
  note?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
}> {
  signal.throwIfAborted();
  const asset = getAgentMediaAsset(assetId);
  if (!asset) throw new Error(`Media asset "${assetId}" is no longer available.`);
  assertCurrent(asset);

  if (asset.kind === 'audio') {
    return { ...result(asset, 'metadata-only', [], 'Audio is metadata-only; no speech analysis or transcription was performed.') };
  }

  if (asset.kind === 'image') {
    try {
      const bitmap = await decodeBitmap(asset.file, signal);
      try {
        signal.throwIfAborted();
        assertCurrent(asset);
        const width = bitmap.width;
        const height = bitmap.height;
        const data = await encodePreview(bitmap, MAX_PREVIEW_BYTES, signal);
        signal.throwIfAborted();
        assertCurrent(asset);
        return {
          ...(data
            ? result(asset, 'image-preview', [{ data, mimeType: 'image/jpeg' }])
            : result(asset, 'metadata-only', [], 'The image preview did not fit within the 192 KiB limit after resizing and compression.')),
          width,
          height,
        };
      } finally {
        bitmap.close();
      }
    } catch (error) {
      signal.throwIfAborted();
      assertCurrent(asset);
      return result(asset, 'metadata-only', [], error instanceof Error
        ? `Image preview unavailable: ${error.message}`
        : 'Image preview unavailable because this browser could not decode it.');
    }
  }

  let videoMetadata: { durationSeconds: number; width: number; height: number } | undefined;
  try {
    const decoded = await extractAgentVideoFrames(asset.id, signal);
    signal.throwIfAborted();
    assertCurrent(asset);
    videoMetadata = {
      durationSeconds: decoded.durationSeconds,
      width: decoded.width,
      height: decoded.height,
    };
    const images: InspectionImage[] = [];
    let omitted = false;
    for (const frame of decoded.frames.slice(0, 3)) {
      signal.throwIfAborted();
      assertCurrent(asset);
      const bitmap = await decodeBitmap(
        new Blob([Uint8Array.from(atob(frame.data), character => character.charCodeAt(0))], { type: frame.mimeType }),
        signal,
      );
      try {
        signal.throwIfAborted();
        assertCurrent(asset);
        const data = await encodePreview(bitmap, MAX_FRAME_BYTES, signal);
        signal.throwIfAborted();
        assertCurrent(asset);
        if (data) images.push({ data, mimeType: 'image/jpeg', timestampSeconds: frame.timestampSeconds });
        else omitted = true;
      } finally {
        bitmap.close();
      }
    }
    signal.throwIfAborted();
    assertCurrent(asset);
    const note = omitted ? 'Some sampled frames were omitted because they could not fit the 64 KiB per-frame limit.' : undefined;
    return {
      ...result(asset, images.length ? 'sampled-video-frames' : 'metadata-only', images,
        images.length ? note : 'No sampled frame fit within the 64 KiB per-frame limit.'),
      ...videoMetadata,
    };
  } catch (error) {
    signal.throwIfAborted();
    assertCurrent(asset);
    return {
      ...result(asset, 'metadata-only', [], error instanceof Error
        ? `Video previews unavailable: ${error.message}`
        : 'Video previews unavailable because this browser could not decode them.'),
      ...videoMetadata,
    };
  }
}
