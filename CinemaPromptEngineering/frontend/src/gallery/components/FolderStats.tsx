/**
 * FolderStats — Compact folder statistics display panel.
 *
 * Shows aggregate information about the currently viewed folder:
 * total files, total size, image/video/subfolder counts, and a
 * per-extension breakdown rendered as inline badges.
 *
 * Data is fetched from the Orchestrator gallery API whenever the
 * folderPath prop changes. Stale in-flight requests are discarded.
 */

import { useState, useEffect, useRef } from 'react';
import { Folder, Image as ImageIcon, Film, HardDrive } from 'lucide-react';
import './components.css';

// =============================================================================
// Types
// =============================================================================

interface FolderStatsProps {
  orchestratorUrl: string;
  folderPath: string;
  className?: string;
}

interface FolderStatsData {
  success: boolean;
  path: string;
  total_files: number;
  total_size: number;
  image_count: number;
  video_count: number;
  subfolder_count: number;
  by_extension: Record<string, number>;
  message: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert a raw byte count into a human-readable file-size string.
 *
 * @param bytes - Size in bytes (must be >= 0).
 * @returns Formatted string, e.g. "4.2 MB".
 */
function formatFileSize(bytes: number): string {
  if (bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// =============================================================================
// Component
// =============================================================================

export function FolderStats({ orchestratorUrl, folderPath, className }: FolderStatsProps) {
  const [stats, setStats] = useState<FolderStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the latest request so stale responses can be discarded.
  const requestIdRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!folderPath || !orchestratorUrl) {
      setStats(null);
      setError(null);
      return;
    }

    const currentRequestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);

    fetch(`${orchestratorUrl}/api/gallery/folder-stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_path: folderPath }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        return res.json() as Promise<FolderStatsData>;
      })
      .then((data) => {
        // Guard against stale responses.
        if (currentRequestId !== requestIdRef.current) return;

        if (!data.success) {
          setError(data.message || 'Failed to retrieve folder stats');
          setStats(null);
        } else {
          setStats(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (currentRequestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
        setStats(null);
      })
      .finally(() => {
        if (currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      });
  }, [orchestratorUrl, folderPath]);

  // ---------------------------------------------------------------------------
  // Render: loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className={`folder-stats-container${className ? ` ${className}` : ''}`}>
        <span className="folder-stats-loading">Loading stats…</span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: error state
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div className={`folder-stats-container${className ? ` ${className}` : ''}`}>
        <span className="folder-stats-error">{error}</span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: no data
  // ---------------------------------------------------------------------------

  if (!stats) return null;

  // ---------------------------------------------------------------------------
  // Render: extension badges
  // ---------------------------------------------------------------------------

  const extensionEntries = Object.entries(stats.by_extension).sort(
    ([, a], [, b]) => b - a,
  );

  // ---------------------------------------------------------------------------
  // Render: main display
  // ---------------------------------------------------------------------------

  return (
    <div className={`folder-stats-container${className ? ` ${className}` : ''}`}>
      {/* Total files */}
      <span className="folder-stats-item" title="Total files">
        <HardDrive size={13} className="folder-stats-icon" />
        <span className="folder-stats-value">{stats.total_files}</span>
        <span className="folder-stats-label">files</span>
      </span>

      {/* Total size */}
      <span className="folder-stats-item" title={`${stats.total_size} bytes`}>
        <span className="folder-stats-value">{formatFileSize(stats.total_size)}</span>
      </span>

      <span className="folder-stats-separator" />

      {/* Image count */}
      <span className="folder-stats-item" title="Images">
        <span className="folder-stats-dot folder-stats-dot--image" />
        <ImageIcon size={13} className="folder-stats-icon" />
        <span className="folder-stats-value">{stats.image_count}</span>
      </span>

      {/* Video count */}
      <span className="folder-stats-item" title="Videos">
        <span className="folder-stats-dot folder-stats-dot--video" />
        <Film size={13} className="folder-stats-icon" />
        <span className="folder-stats-value">{stats.video_count}</span>
      </span>

      {/* Subfolder count */}
      <span className="folder-stats-item" title="Subfolders">
        <Folder size={13} className="folder-stats-icon" />
        <span className="folder-stats-value">{stats.subfolder_count}</span>
      </span>

      {/* Extension breakdown badges */}
      {extensionEntries.length > 0 && (
        <>
          <span className="folder-stats-separator" />
          <span className="folder-stats-extensions">
            {extensionEntries.map(([ext, count]) => (
              <span key={ext} className="folder-stats-badge" title={`${ext}: ${count} file${count !== 1 ? 's' : ''}`}>
                <span className="folder-stats-badge-ext">{ext}</span>
                <span className="folder-stats-badge-count">{count}</span>
              </span>
            ))}
          </span>
        </>
      )}
    </div>
  );
}
