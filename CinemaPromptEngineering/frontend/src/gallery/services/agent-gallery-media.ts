import { getFileInfo } from './gallery-service';
import { getGalleryWorkspace } from './gallery-workspace';
import { addAgentMediaFile } from '../../services/agent-media-library';

const MAX_MEDIA_SIZE = 256 * 1024 * 1024;
const IMPORT_TIMEOUT_MS = 20_000;

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(signal.reason ?? new Error('Gallery media import was cancelled or timed out.'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    promise.then(
      value => { cleanup(); resolve(value); },
      error => { cleanup(); reject(error); },
    );
  });
}

export async function importGalleryMedia(
  filePath: string,
  signal: AbortSignal | undefined,
  isCurrent: () => boolean,
): Promise<{
  mediaId: string;
  assetId: string;
  name: string;
  kind: 'image' | 'video' | 'audio';
  mimeType: string;
  size: number;
  sourceFilePath: string;
  workspaceRevision: number;
  perception: 'available_via_inspect_media' | 'metadata-only';
}> {
  if (!filePath.trim() || filePath.length > 4096 || filePath.includes('\0')) {
    throw new Error('Choose a valid Gallery file path of 4096 characters or fewer.');
  }

  const workspace = getGalleryWorkspace();
  if (!workspace.rootPath.trim()) throw new Error('Choose a Gallery folder first.');

  let serverUrl: URL;
  try {
    serverUrl = new URL(workspace.orchestratorUrl);
  } catch {
    throw new Error('The selected Gallery server URL is invalid.');
  }
  if ((serverUrl.protocol !== 'http:' && serverUrl.protocol !== 'https:')
    || serverUrl.username || serverUrl.password || serverUrl.search || serverUrl.hash) {
    throw new Error('The selected Gallery server URL is not safe to use.');
  }

  const deadlineSignal = AbortSignal.timeout(IMPORT_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, deadlineSignal]) : deadlineSignal;
  const ensureCurrent = () => {
    if (requestSignal.aborted) throw requestSignal.reason ?? new Error('Gallery media import was cancelled or timed out.');
    if (!isCurrent()) throw new Error('The selected Gallery file is no longer current.');
    const current = getGalleryWorkspace();
    if (current.revision !== workspace.revision
      || current.rootPath !== workspace.rootPath
      || current.orchestratorUrl !== workspace.orchestratorUrl) {
      throw new Error('The Gallery workspace changed while the file was being imported.');
    }
  };

  ensureCurrent();
  const result = await awaitWithAbort(
    getFileInfo(workspace.orchestratorUrl, filePath, workspace.rootPath),
    requestSignal,
  );
  ensureCurrent();
  if (!result.success || !result.file) throw new Error(result.message || 'The Gallery file could not be read.');

  const entry = result.file;
  if (typeof entry.path !== 'string' || !entry.path.trim() || entry.path.includes('\0') || entry.path.length > 4096
    || typeof entry.name !== 'string' || !entry.name.trim()
    || !Number.isSafeInteger(entry.size) || entry.size <= 0 || entry.size > MAX_MEDIA_SIZE) {
    throw new Error('The Gallery returned invalid file metadata or an unsafe media size.');
  }

  const basename = entry.name.replace(/\\/g, '/').split('/').pop() || '';
  const name = basename.replace(/[\x00-\x1f\x7f-\x9f/\\<>:"|?*]/g, '_').replace(/^\.+$/, '_').trim();
  if (!name) throw new Error('The Gallery file has no usable filename.');

  const serveUrl = new URL(`${workspace.orchestratorUrl}/api/serve-image`);
  serveUrl.searchParams.set('path', entry.path);
  ensureCurrent();
  const response = await fetch(serveUrl, { redirect: 'error', signal: requestSignal });
  const rejectResponse = async (message: string): Promise<never> => {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(message);
  };

  try {
    ensureCurrent();
  } catch (error) {
    await response.body?.cancel().catch(() => undefined);
    throw error;
  }
  if (!response.ok) return rejectResponse(`The Gallery server returned HTTP ${response.status}.`);

  const mimeType = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  const kind = mimeType.startsWith('image/') ? 'image'
    : mimeType.startsWith('video/') ? 'video'
      : mimeType.startsWith('audio/') ? 'audio' : null;
  if (!kind || !/^(image|video|audio)\/[a-z0-9!#$&^_.+-]+$/.test(mimeType)) {
    return rejectResponse('The Gallery server returned an unsupported media type.');
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const length = Number(contentLength);
    if (!Number.isSafeInteger(length) || length < 0) return rejectResponse('The Gallery server returned an invalid content length.');
    if (length > MAX_MEDIA_SIZE) return rejectResponse('The media exceeds 256 MiB and was not downloaded.');
  }
  if (!response.body) return rejectResponse('The Gallery response did not provide a readable media stream.');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      ensureCurrent();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MEDIA_SIZE) throw new Error('The media exceeds 256 MiB and was not downloaded.');
      chunks.push(value);
    }
    if (size === 0) throw new Error('The Gallery server returned an empty media file.');
    if (size !== entry.size) throw new Error('The media size changed while it was being imported.');
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const parts = chunks.map(chunk => {
    const buffer = new ArrayBuffer(chunk.byteLength);
    new Uint8Array(buffer).set(chunk);
    return buffer;
  });
  ensureCurrent();
  const asset = addAgentMediaFile(new File(parts, name, { type: mimeType }), 'gallery');
  return {
    mediaId: `media:${asset.id}`,
    assetId: asset.id,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mimeType,
    size: asset.size,
    sourceFilePath: entry.path,
    workspaceRevision: workspace.revision,
    perception: asset.kind === 'audio' ? 'metadata-only' : 'available_via_inspect_media',
  };
}
