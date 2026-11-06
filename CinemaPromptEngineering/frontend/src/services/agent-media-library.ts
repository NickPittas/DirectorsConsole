export interface AgentMediaAsset {
  id: string;
  name: string;
  mimeType: string;
  kind: 'image' | 'video' | 'audio';
  size: number;
  file: File;
  url: string;
  source: 'user' | 'generated' | 'gallery';
}

const MAX_FILE_SIZE = 256 * 1024 * 1024;
const MAX_TOTAL_SIZE = 512 * 1024 * 1024;
const assets = new Map<string, AgentMediaAsset>();
const listeners = new Set<() => void>();

export function addAgentMediaFile(file: File, source: AgentMediaAsset['source'] = 'user'): AgentMediaAsset {
  const mimeType = file.type.toLowerCase();
  let kind: AgentMediaAsset['kind'];

  if (mimeType.startsWith('image/')) kind = 'image';
  else if (mimeType.startsWith('video/')) kind = 'video';
  else if (mimeType.startsWith('audio/')) kind = 'audio';
  else throw new Error('Unsupported file type. Choose an image, video, or audio file.');

  if (file.size === 0) throw new Error('The selected file is empty.');
  if (file.size > MAX_FILE_SIZE) throw new Error('Each media file must be 256 MiB or smaller.');

  const totalSize = [...assets.values()].reduce((total, asset) => total + asset.size, 0);
  if (totalSize + file.size > MAX_TOTAL_SIZE) {
    throw new Error('Attachments must total 512 MiB or less. Remove a file before adding this one.');
  }

  const asset: AgentMediaAsset = {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type,
    kind,
    size: file.size,
    file,
    url: URL.createObjectURL(file),
    source,
  };

  assets.set(asset.id, asset);
  listeners.forEach((listener) => listener());
  return { ...asset };
}

export function getAgentMediaAsset(id: string): AgentMediaAsset | null {
  const asset = assets.get(id);
  return asset ? { ...asset } : null;
}

export function listAgentMediaAssets(): AgentMediaAsset[] {
  return [...assets.values()].map((asset) => ({ ...asset }));
}

export function removeAgentMediaAsset(id: string): boolean {
  const asset = assets.get(id);
  if (!asset) return false;

  assets.delete(id);
  URL.revokeObjectURL(asset.url);
  listeners.forEach((listener) => listener());
  return true;
}

export function subscribeAgentMediaAssets(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
