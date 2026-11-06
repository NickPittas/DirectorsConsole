import { getAgentMediaAsset, type AgentMediaAsset } from './agent-media-library';
import { extractAgentVideoFrames } from './agent-video-frames';

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_DECODES = 4;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type AgentMediaManifestEntry = {
  id: string;
  mediaId: string;
  name: string;
  mimeType: string;
  kind: 'image' | 'video' | 'audio';
  size: number;
  perception: 'image-bytes' | 'sampled-video-frames' | 'not-yet-supported';
  sampledTimestampsSeconds?: number[];
  durationSeconds?: number;
  width?: number;
  height?: number;
  note?: string;
};

type AgentPiImageBlock = {
  data: string;
  mimeType: string;
  applicationMediaId?: string;
  applicationMediaKind?: 'image';
};

function base64ByteLength(data: string): number {
  return Math.floor(data.length * 3 / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
}

function isSupportedImage(asset: AgentMediaAsset): boolean {
  return asset.kind === 'image' && SUPPORTED_IMAGE_TYPES.has(asset.mimeType.toLowerCase());
}

function assertCurrentFile(asset: AgentMediaAsset): void {
  if (getAgentMediaAsset(asset.id)?.file !== asset.file) {
    throw new Error(`Media asset "${asset.name}" was removed or replaced before the Pi turn was prepared.`);
  }
}

function readAsDataUrl(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
    };
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reason);
    };
    const succeed = (value: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onAbort = () => {
      fail(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        fail(new Error('The selected image could not be read as a data URL.'));
        return;
      }
      succeed(reader.result);
    };
    reader.onerror = () => fail(reader.error ?? new Error('The selected image could not be read.'));
    reader.onabort = () => fail(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }

    try {
      reader.readAsDataURL(file);
    } catch (error) {
      fail(error);
    }
  });
}

export async function prepareAgentMediaTurn(
  assetIds: readonly string[],
  signal: AbortSignal,
): Promise<{
  images: AgentPiImageBlock[];
  manifest: AgentMediaManifestEntry[];
}> {
  signal.throwIfAborted();
  const seen = new Set<string>();
  const assets: AgentMediaAsset[] = [];
  for (const id of assetIds) {
    signal.throwIfAborted();
    if (seen.has(id)) throw new Error(`Media asset "${id}" was selected more than once.`);
    seen.add(id);
    const asset = getAgentMediaAsset(id);
    if (!asset) throw new Error(`Media asset "${id}" is no longer available.`);
    assets.push(asset);
  }

  const imageAssets = assets.filter(asset => asset.kind === 'image');
  if (imageAssets.length > MAX_IMAGES) {
    throw new Error(`Pi accepts at most ${MAX_IMAGES} reference images per turn. Remove images; none were dropped.`);
  }
  if (imageAssets.some(asset => asset.file.size > MAX_IMAGE_BYTES)) {
    throw new Error('Each Pi reference image must be 6 MiB or smaller. Remove or replace the larger image; it was not resized.');
  }
  if (imageAssets.reduce((total, asset) => total + asset.file.size, 0) > MAX_TOTAL_IMAGE_BYTES) {
    throw new Error('Pi accepts at most 8 MiB of combined reference image data. Remove images; none were dropped.');
  }

  const manifest: AgentMediaManifestEntry[] = assets.map(asset => ({
    id: asset.id,
    mediaId: `media:${asset.id}`,
    name: asset.name,
    mimeType: asset.mimeType,
    kind: asset.kind,
    size: asset.file.size,
    perception: isSupportedImage(asset) ? 'image-bytes' as const : 'not-yet-supported' as const,
    ...(!isSupportedImage(asset) ? { note: asset.kind === 'audio'
      ? 'Audio is metadata-only; no audio analysis or transcription was performed.'
      : asset.kind === 'image' ? 'This image format is metadata-only and is not sent as image data.' : undefined } : {}),
  }));
  const images: AgentPiImageBlock[] = [];
  const supportedImages = imageAssets.filter(isSupportedImage);
  const videos = assets.filter(asset => asset.kind === 'video');
  const decodeVideos = videos.slice(0, MAX_VIDEO_DECODES);
  const frameCounts = new Map<string, number>(decodeVideos.map(video => [video.id, 0] as [string, number]));
  let frameSlots = MAX_IMAGES - supportedImages.length;
  while (frameSlots > 0) {
    let allocated = false;
    for (const video of decodeVideos) {
      const count = frameCounts.get(video.id) ?? 0;
      if (count < 3 && frameSlots > 0) {
        frameCounts.set(video.id, count + 1);
        frameSlots -= 1;
        allocated = true;
      }
    }
    if (!allocated) break;
  }
  let remainingFrameBytes = MAX_TOTAL_IMAGE_BYTES - supportedImages.reduce((total, asset) => total + asset.file.size, 0);

  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    const entry = manifest[index];
    signal.throwIfAborted();
    if (isSupportedImage(asset)) {
      assertCurrentFile(asset);
      signal.throwIfAborted();
      const dataUrl = await readAsDataUrl(asset.file, signal);
      signal.throwIfAborted();
      assertCurrentFile(asset);
      const separator = dataUrl.indexOf(',');
      if (!dataUrl.startsWith('data:') || separator < 0) {
        throw new Error(`The selected image "${asset.name}" could not be serialized.`);
      }
      images.push({
        data: dataUrl.slice(separator + 1),
        mimeType: asset.mimeType,
        applicationMediaId: `media:${asset.id}`,
        applicationMediaKind: 'image',
      });
      continue;
    }
    if (asset.kind !== 'video') continue;

    const assignedFrames = frameCounts.get(asset.id);
    if (assignedFrames === undefined) {
      entry.note = 'This turn decodes at most four videos; this video is metadata-only.';
      continue;
    }
    if (assignedFrames === 0) {
      entry.note = 'No image-frame slots remained after the selected images and earlier videos.';
      continue;
    }
    if (remainingFrameBytes === 0) {
      entry.note = 'No image-data budget remained for video samples; this video is metadata-only.';
      continue;
    }

    assertCurrentFile(asset);
    try {
      const decoded = await extractAgentVideoFrames(asset.id, signal);
      signal.throwIfAborted();
      assertCurrentFile(asset);
      entry.durationSeconds = decoded.durationSeconds;
      entry.width = decoded.width;
      entry.height = decoded.height;
      const frameIndexes = assignedFrames === 1 ? [1] : assignedFrames === 2 ? [0, 2] : [0, 1, 2];
      const sampledTimestampsSeconds: number[] = [];
      let omittedFrames = 0;
      for (const frameIndex of frameIndexes) {
        signal.throwIfAborted();
        assertCurrentFile(asset);
        const frame = decoded.frames[frameIndex];
        const frameBytes = base64ByteLength(frame.data);
        if (frameBytes > MAX_IMAGE_BYTES || frameBytes > remainingFrameBytes) {
          omittedFrames += 1;
          continue;
        }
        images.push({ data: frame.data, mimeType: frame.mimeType });
        remainingFrameBytes -= frameBytes;
        sampledTimestampsSeconds.push(frame.timestampSeconds);
      }
      if (sampledTimestampsSeconds.length > 0) {
        entry.perception = 'sampled-video-frames';
        entry.sampledTimestampsSeconds = sampledTimestampsSeconds;
        if (omittedFrames > 0) entry.note = 'Some selected frames were omitted by Pi’s per-image or combined image-data limits.';
      } else {
        entry.note = 'No selected frame fit Pi’s 6 MiB per-image and 8 MiB combined image-data limits.';
      }
    } catch (error) {
      signal.throwIfAborted();
      assertCurrentFile(asset);
      entry.note = error instanceof Error
        ? `Video frames were not attached: ${error.message}`
        : 'Video frames were not attached because the browser could not decode this video.';
    }
  }

  signal.throwIfAborted();
  for (const asset of assets) assertCurrentFile(asset);
  return { images, manifest };
}
