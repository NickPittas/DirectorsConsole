export interface GalleryWorkspaceSnapshot {
  rootPath: string;
  orchestratorUrl: string;
  revision: number;
}

const STORAGE_KEY = 'directors_console_gallery_workspace_v1';
const listeners = new Set<() => void>();

function defaultOrchestratorUrl(): string {
  const pageUrl = new URL(window.location.href);
  const hostname = pageUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLoopback = hostname === 'localhost'
    || hostname === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname);

  pageUrl.protocol = isLoopback || pageUrl.protocol !== 'https:' ? 'http:' : 'https:';
  pageUrl.port = '9820';
  return pageUrl.origin;
}

function validateRootPath(rootPath: string): string {
  if (!rootPath.trim()) throw new Error('Choose a folder path.');
  if (rootPath.length > 4096) throw new Error('Folder paths must be 4096 characters or fewer.');
  if (rootPath.includes('\0')) throw new Error('Folder paths cannot contain NUL characters.');
  return rootPath;
}

function validateOrchestratorUrl(orchestratorUrl: string): string {
  const value = orchestratorUrl.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid Gallery server URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Gallery server must use http or https.');
  }
  if (url.username || url.password) {
    throw new Error('Gallery server URLs cannot contain a username or password.');
  }
  return value.replace(/\/+$/, '');
}

function initialWorkspace(): GalleryWorkspaceSnapshot {
  const fallback = { rootPath: '', orchestratorUrl: defaultOrchestratorUrl(), revision: 0 };
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return fallback;
    const saved = JSON.parse(value) as { rootPath?: unknown; orchestratorUrl?: unknown };
    if (typeof saved.rootPath !== 'string' || typeof saved.orchestratorUrl !== 'string') return fallback;
    return {
      rootPath: validateRootPath(saved.rootPath),
      orchestratorUrl: validateOrchestratorUrl(saved.orchestratorUrl),
      revision: 0,
    };
  } catch {
    return fallback;
  }
}

let snapshot = initialWorkspace();

export function getGalleryWorkspace(): GalleryWorkspaceSnapshot {
  return snapshot;
}

export function subscribeGalleryWorkspace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setGalleryWorkspace(input: { rootPath: string; orchestratorUrl: string }): void {
  const next = {
    rootPath: validateRootPath(input.rootPath),
    orchestratorUrl: validateOrchestratorUrl(input.orchestratorUrl),
  };
  const changed = next.rootPath !== snapshot.rootPath || next.orchestratorUrl !== snapshot.orchestratorUrl;

  if (changed) {
    snapshot = { ...next, revision: snapshot.revision + 1 };
    listeners.forEach((listener) => listener());
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    throw new Error('Gallery is open for this session, but its folder settings could not be saved for next time.');
  }
}

export function refreshGalleryWorkspace(expectedRevision: number): void {
  if (snapshot.revision !== expectedRevision) {
    throw new Error('Gallery workspace changed while the request was running.');
  }
  snapshot = { ...snapshot, revision: snapshot.revision + 1 };
  listeners.forEach((listener) => listener());
}
