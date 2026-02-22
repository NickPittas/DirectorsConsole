import { useMemo, useState } from 'react';
import { Clock, Calendar } from 'lucide-react';
import type { FileEntry } from '../services/gallery-service';
import './components.css';

interface TimelineViewProps {
  files: FileEntry[];
  orchestratorUrl: string;
  onSelectFile: (file: FileEntry) => void;
}

interface DateGroup {
  key: string;       // YYYY-MM-DD
  label: string;     // "Today", "Yesterday", "Feb 18, 2026", etc.
  files: FileEntry[];
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function isToday(ts: number): boolean {
  const d = new Date(ts * 1000);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isYesterday(ts: number): boolean {
  const d = new Date(ts * 1000);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  );
}

function formatDateLabel(ts: number): string {
  if (isToday(ts)) return 'Today';
  if (isYesterday(ts)) return 'Yesterday';
  return dateFormatter.format(new Date(ts * 1000));
}

function toDateKey(ts: number): string {
  const d = new Date(ts * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function TimelineView({
  files,
  orchestratorUrl,
  onSelectFile,
}: TimelineViewProps) {
  const [thumbErrors, setThumbErrors] = useState<Set<string>>(() => new Set());

  const groups: DateGroup[] = useMemo(() => {
    const map = new Map<string, FileEntry[]>();

    for (const file of files) {
      const key = toDateKey(file.created);
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(file);
      } else {
        map.set(key, [file]);
      }
    }

    const result: DateGroup[] = [];
    for (const [key, bucket] of map) {
      // Use the first file's timestamp to derive the label
      result.push({
        key,
        label: formatDateLabel(bucket[0].created),
        files: bucket,
      });
    }

    // Sort newest first (descending by key string, which is YYYY-MM-DD)
    result.sort((a, b) => b.key.localeCompare(a.key));

    return result;
  }, [files]);

  const totalDays = groups.length;

  function handleThumbError(path: string) {
    setThumbErrors((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }

  if (files.length === 0) {
    return (
      <div className="timeline-view">
        <div className="timeline-view-empty">No files to display</div>
      </div>
    );
  }

  return (
    <div className="timeline-view">
      {/* Summary stats */}
      <div className="timeline-view-summary">
        <Clock size={14} />
        <span>
          {files.length} file{files.length !== 1 ? 's' : ''} over{' '}
          {totalDays} day{totalDays !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Timeline entries */}
      <div className="timeline-view-entries">
        {groups.map((group, idx) => (
          <div key={group.key} className="timeline-view-entry">
            {/* Left: date column with timeline line */}
            <div className="timeline-view-date">
              <div className="timeline-view-dot" />
              {idx < groups.length - 1 && <div className="timeline-view-line" />}
              <div className="timeline-view-date-info">
                <span className="timeline-view-date-label">
                  <Calendar size={13} />
                  {group.label}
                </span>
                <span className="timeline-view-date-count">
                  {group.files.length} file{group.files.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Right: horizontal thumbnail row */}
            <div className="timeline-view-thumbnails">
              {group.files.map((file) => {
                const url = `${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(file.path)}`;
                const hasError = thumbErrors.has(file.path);

                return (
                  <button
                    key={file.path}
                    className="timeline-view-thumb"
                    title={file.name}
                    onClick={() => onSelectFile(file)}
                  >
                    {hasError ? (
                      <div className="timeline-view-thumb-placeholder">?</div>
                    ) : (
                      <img
                        className="timeline-view-thumb-img"
                        src={url}
                        alt={file.name}
                        loading="lazy"
                        onError={() => handleThumbError(file.path)}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
