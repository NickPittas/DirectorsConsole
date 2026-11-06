import { orchestratorManager } from '../storyboard/services/orchestrator';
import { addAgentMediaFile, getAgentMediaAsset } from './agent-media-library';

const MAX_FILE_SIZE = 256 * 1024 * 1024;
const MAX_OUTPUTS = 16;
const MAX_CACHE_ENTRIES = 128;
const CAPTURE_TIMEOUT_MS = 20_000;

interface CapturedRunMedia {
  assetId: string;
  mediaId: string;
  name: string;
  kind: 'image' | 'video' | 'audio';
  mimeType: string;
  url: string;
}

const captures = new Map<string, Promise<CapturedRunMedia>>();

class CaptureDeadlineError extends Error {
  constructor() {
    super('The run output media capture exceeded its 20-second deadline.');
  }
}

function remainingCaptureTime(deadline: number): number {
  return deadline - performance.now();
}

async function awaitBeforeDeadline<T>(pending: Promise<T>, deadline: number): Promise<T> {
  const remaining = Math.ceil(remainingCaptureTime(deadline));
  if (remaining <= 0) {
    void pending.catch(() => undefined);
    throw new CaptureDeadlineError();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CaptureDeadlineError()), remaining);
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function validateViewUrl(backendId: string, url: string): URL {
  const backend = orchestratorManager.getNodes().find(node => node.id === backendId);
  if (!backend) throw new Error('The managed backend is no longer configured.');
  const backendUrl = new URL(backend.url);
  const outputUrl = new URL(url);
  if (!['http:', 'https:'].includes(backendUrl.protocol)
    || !['http:', 'https:'].includes(outputUrl.protocol)
    || outputUrl.username !== ''
    || outputUrl.password !== ''
    || outputUrl.origin !== backendUrl.origin
    || outputUrl.pathname !== '/view') {
    throw new Error('The output URL is outside the managed backend /view endpoint.');
  }
  return outputUrl;
}

function outputName(url: URL, index: number): string {
  const name = (url.searchParams.get('filename') || '').replace(/\\/g, '/').split('/').pop() || '';
  return name.replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_').replace(/^\.+$/, '').trim() || `generated-${index + 1}`;
}

async function downloadOutput(url: URL, originalUrl: string, index: number, timeoutMs: number): Promise<CapturedRunMedia> {
  const response = await fetch(originalUrl, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  const rejectResponse = async (message: string): Promise<never> => {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(message);
  };
  if (!response.ok) return rejectResponse(`The backend returned HTTP ${response.status}.`);
  const mimeType = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (!/^(image|video|audio)\/[a-z0-9!#$&^_.+-]+$/.test(mimeType)) return rejectResponse('The backend returned an unsupported media type.');
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_FILE_SIZE) return rejectResponse('The media exceeds 256 MiB and was not downloaded.');
  if (!response.body) throw new Error('The backend response did not provide a readable media stream.');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FILE_SIZE) {
        await reader.cancel();
        throw new Error('The media exceeds 256 MiB and was not downloaded.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size === 0) throw new Error('The backend returned an empty media file.');

  const parts = chunks.map(chunk => {
    const buffer = new ArrayBuffer(chunk.byteLength);
    new Uint8Array(buffer).set(chunk);
    return buffer;
  });
  const file = new File(parts, outputName(url, index), { type: mimeType });
  const asset = addAgentMediaFile(file, 'generated');
  return {
    assetId: asset.id,
    mediaId: `media:${asset.id}`,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mimeType,
    url: originalUrl,
  };
}

async function captureOne(runId: string, backendId: string, originalUrl: string, index: number, deadline: number): Promise<CapturedRunMedia> {
  const url = validateViewUrl(backendId, originalUrl);
  const key = JSON.stringify([runId, backendId, originalUrl]);
  const cached = captures.get(key);
  if (cached) {
    const media = await awaitBeforeDeadline(cached, deadline);
    if (getAgentMediaAsset(media.assetId)) return media;
    if (captures.get(key) === cached) captures.delete(key);
  }

  const timeoutMs = Math.min(15000, Math.ceil(remainingCaptureTime(deadline)));
  if (timeoutMs <= 0) throw new CaptureDeadlineError();
  let pending: Promise<CapturedRunMedia>;
  pending = downloadOutput(url, originalUrl, index, timeoutMs).catch(error => {
    if (captures.get(key) === pending) captures.delete(key);
    throw error;
  });
  captures.set(key, pending);
  while (captures.size > MAX_CACHE_ENTRIES) captures.delete(captures.keys().next().value!);
  return await awaitBeforeDeadline(pending, deadline);
}

export async function captureRunOutputMedia(
  runId: string,
  backendId: string,
  urls: readonly string[],
): Promise<{ media: CapturedRunMedia[]; warnings: string[] }> {
  const deadline = performance.now() + CAPTURE_TIMEOUT_MS;
  const media: CapturedRunMedia[] = [];
  const warnings: string[] = [];
  if (urls.length > MAX_OUTPUTS) warnings.push(`Only the first ${MAX_OUTPUTS} outputs were considered.`);
  const seen = new Set<string>();
  for (const [index, url] of urls.slice(0, MAX_OUTPUTS).entries()) {
    if (seen.has(url)) continue;
    if (remainingCaptureTime(deadline) <= 0) {
      const remaining = new Set(urls.slice(index, MAX_OUTPUTS).filter(candidate => !seen.has(candidate))).size;
      if (remaining > 0) warnings.push(`The capture deadline was reached; ${remaining} remaining output${remaining === 1 ? ' was' : 's were'} not captured.`);
      break;
    }
    seen.add(url);
    try {
      media.push(await captureOne(runId, backendId, url, index, deadline));
    } catch (error) {
      warnings.push(`Output ${index + 1} was not captured: ${error instanceof Error ? error.message : 'unknown capture error'}`);
    }
  }
  return { media, warnings };
}
