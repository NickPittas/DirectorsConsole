import { getAgentMediaAsset } from './agent-media-library';

const MAX_FRAME_DATA = 6 * 1024 * 1024;
const EVENT_TIMEOUT_MS = 20_000;

function assertAssetCurrent(assetId: string, file: File, name: string): void {
  if (getAgentMediaAsset(assetId)?.file !== file) {
    throw new Error(`Media asset "${name}" was removed before its video frames were prepared.`);
  }
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'loadeddata' | 'seeked',
  signal: AbortSignal,
  operation: string,
  start?: () => void,
  timeoutMs = EVENT_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onReady);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onError = () => finish(new Error('This browser cannot decode the attached video codec.'));
    const onAbort = () => finish(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    const timeout = window.setTimeout(() => finish(new Error(`Timed out after 20 seconds while ${operation}.`)), timeoutMs);

    video.addEventListener(eventName, onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    else {
      try {
        start?.();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(`Could not start ${operation}.`));
      }
    }
  });
}

export async function extractAgentVideoFrames(
  assetId: string,
  signal: AbortSignal,
): Promise<{ assetId: string; name: string; durationSeconds: number; width: number; height: number;
  frames: Array<{ timestampSeconds: number; data: string; mimeType: 'image/jpeg' }> }> {
  signal.throwIfAborted();
  const asset = getAgentMediaAsset(assetId);
  if (!asset || asset.kind !== 'video') throw new Error(`Video asset "${assetId}" is no longer available.`);

  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  video.muted = true;
  video.preload = 'metadata';
  video.playsInline = true;

  try {
    const loadDeadline = Date.now() + EVENT_TIMEOUT_MS;
    assertAssetCurrent(assetId, asset.file, asset.name);
    await waitForVideoEvent(video, 'loadedmetadata', signal, 'loading video metadata', () => {
      video.src = asset.url;
      video.load();
    });
    assertAssetCurrent(assetId, asset.file, asset.name);
    signal.throwIfAborted();

    const { duration } = video;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('The attached video has no finite, positive duration.');
    if (!width || !height) throw new Error('The browser could not read the attached video dimensions.');

    if (video.readyState < video.HAVE_CURRENT_DATA) {
      assertAssetCurrent(assetId, asset.file, asset.name);
      await waitForVideoEvent(video, 'loadeddata', signal, 'loading the first video frame', undefined, Math.max(0, loadDeadline - Date.now()));
      assertAssetCurrent(assetId, asset.file, asset.name);
    }

    const scale = Math.min(1, 1024 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser could not create a canvas for video frames.');

    const lastTimestamp = Math.max(0, duration - 0.05);
    const timestamps = [0.1, 0.5, 0.9].map(fraction => lastTimestamp * fraction);
    const frames: Array<{ timestampSeconds: number; data: string; mimeType: 'image/jpeg' }> = [];
    let totalDataBytes = 0;

    for (const timestampSeconds of timestamps) {
      signal.throwIfAborted();
      assertAssetCurrent(assetId, asset.file, asset.name);
      if (Math.abs(video.currentTime - timestampSeconds) > 0.001) {
        await waitForVideoEvent(video, 'seeked', signal, `seeking to ${timestampSeconds.toFixed(3)} seconds`, () => {
          video.currentTime = timestampSeconds;
        });
        assertAssetCurrent(assetId, asset.file, asset.name);
      }

      let jpeg: string;
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        jpeg = canvas.toDataURL('image/jpeg', 0.8);
      } catch {
        throw new Error('The browser could not decode or encode the requested video frame.');
      }
      const prefix = 'data:image/jpeg;base64,';
      if (!jpeg.startsWith(prefix)) throw new Error('The browser could not encode a JPEG video frame.');
      const data = jpeg.slice(prefix.length);
      totalDataBytes += data.length;
      if (totalDataBytes > MAX_FRAME_DATA) throw new Error('The combined sampled video frames exceed 6 MiB.');
      frames.push({ timestampSeconds: video.currentTime, data, mimeType: 'image/jpeg' });
    }

    assertAssetCurrent(assetId, asset.file, asset.name);
    signal.throwIfAborted();
    return { assetId, name: asset.name, durationSeconds: duration, width, height, frames };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    canvas.width = 0;
    canvas.height = 0;
  }
}
