import { useEffect, useState } from 'react';
import {
  addAgentMediaFile,
  listAgentMediaAssets,
  removeAgentMediaAsset,
  subscribeAgentMediaAssets,
  type AgentMediaAsset,
} from '@/services/agent-media-library';

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function AgentMediaAttachments() {
  const [assets, setAssets] = useState<AgentMediaAsset[]>(listAgentMediaAssets);
  const [error, setError] = useState('');

  useEffect(() => {
    const syncAssets = () => setAssets(listAgentMediaAssets());
    const unsubscribe = subscribeAgentMediaAssets(syncAssets);
    syncAssets();
    return unsubscribe;
  }, []);

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    setError('');
    for (const file of Array.from(input.files ?? [])) {
      try {
        addAgentMediaFile(file);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not add this media file.');
      }
    }
    input.value = '';
  };

  return (
    <section aria-label="Agent media attachments">
      <label className="agent-chat__handoff-row">
        <span className="agent-chat__handoff-hint">Add image, video, or audio files</span>
        <input type="file" accept="image/*,video/*,audio/*" multiple onChange={handleFiles} />
      </label>
      {error && <p className="agent-chat__msg-error" role="alert">{error}</p>}
      <ul className="agent-chat__feed-list">
        {assets.map((asset) => (
          <li key={asset.id} className="agent-chat__feed-item">
            {asset.kind === 'image' && <img src={asset.url} alt={`Preview of ${asset.name}`} width={80} />}
            {asset.kind === 'video' && <video src={asset.url} controls preload="metadata" width={160} aria-label={`Preview of ${asset.name}`} />}
            {asset.kind === 'audio' && <audio src={asset.url} controls preload="metadata" aria-label={`Preview of ${asset.name}`} />}
            <span>{asset.name} · {asset.kind} · {formatSize(asset.size)}</span>
            <button type="button" aria-label={`Remove ${asset.name}`} onClick={() => removeAgentMediaAsset(asset.id)}>Remove</button>
          </li>
        ))}
      </ul>
      <details className="agent-chat__info"><summary>Attachment info</summary><p className="agent-chat__notice">Attachments stay in this tab’s memory until reload. JPEG, PNG, and WebP originals can be sent as image data; videos can contribute up to three sampled frames when the browser can decode them, within Pi’s four-image and 8 MiB limits. Only the sampled visuals are sent, not the entire video or sound. Audio and other image formats are metadata-only.</p></details>
    </section>
  );
}
