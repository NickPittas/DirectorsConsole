import { useEffect, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import { GalleryUI } from './GalleryUI';
import {
  getGalleryWorkspace,
  setGalleryWorkspace,
  subscribeGalleryWorkspace,
} from './services/gallery-workspace';

export function GalleryWorkspace({ isActive }: { isActive: boolean }) {
  const workspace = useSyncExternalStore(
    subscribeGalleryWorkspace,
    getGalleryWorkspace,
    getGalleryWorkspace,
  );
  const [rootPath, setRootPath] = useState(workspace.rootPath);
  const [orchestratorUrl, setOrchestratorUrl] = useState(workspace.orchestratorUrl);
  const [error, setError] = useState('');

  useEffect(() => {
    setRootPath(workspace.rootPath);
    setOrchestratorUrl(workspace.orchestratorUrl);
  }, [workspace]);

  function handleOpenFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      setGalleryWorkspace({ rootPath, orchestratorUrl });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open this Gallery folder.');
    }
  }

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0, minHeight: 0, gap: 8, padding: 12 }}>
      <form onSubmit={handleOpenFolder} aria-label="Open Gallery folder" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 8 }}>
        <label htmlFor="gallery-folder-path" style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 4, minWidth: 240 }}>
          Folder
          <input
            id="gallery-folder-path"
            type="text"
            value={rootPath}
            onChange={(event) => { setRootPath(event.currentTarget.value); setError(''); }}
            style={{ boxSizing: 'border-box', minWidth: 0, width: '100%' }}
          />
        </label>
        <button type="submit">Open folder</button>
      </form>
      <details>
        <summary>Gallery server</summary>
        <label htmlFor="gallery-server-url" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          Server URL
          <input
            id="gallery-server-url"
            type="text"
            value={orchestratorUrl}
            onChange={(event) => { setOrchestratorUrl(event.currentTarget.value); setError(''); }}
            style={{ boxSizing: 'border-box', maxWidth: 520, width: '100%' }}
          />
        </label>
      </details>
      {error && <div role="alert">{error}</div>}
      {workspace.rootPath ? (
        <div style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0 }}>
          <GalleryUI
            projectPath={workspace.rootPath}
            orchestratorUrl={workspace.orchestratorUrl}
            projectRevision={workspace.revision}
            isProjectLoading={false}
            isActive={isActive}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0, alignItems: 'center', justifyContent: 'center' }}>
          Choose a server folder here to browse its Gallery.
        </div>
      )}
    </div>
  );
}
