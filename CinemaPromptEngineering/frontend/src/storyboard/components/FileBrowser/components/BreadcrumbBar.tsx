/**
 * BreadcrumbBar - Clickable path navigation bar with editable path input
 * Displays the current path as clickable segments for quick navigation
 * and allows direct path entry via text input
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Home, ChevronRight, RefreshCw } from 'lucide-react';

interface BreadcrumbBarProps {
  path: string;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function BreadcrumbBar({ path, onNavigate, onRefresh, isLoading }: BreadcrumbBarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editPath, setEditPath] = useState(path);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update editPath when path changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditPath(path);
    }
  }, [path, isEditing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Parse path into segments
  const parsePath = useCallback((fullPath: string): Array<{ name: string; path: string }> => {
    if (!fullPath) {
      return [{ name: 'Computer', path: '' }];
    }

    // Normalize path separators
    const normalizedPath = fullPath.replace(/\\/g, '/');
    const segments = normalizedPath.split('/').filter(Boolean);

    const result: Array<{ name: string; path: string }> = [];
    let currentPath = '';

    // Handle Windows drive letters specially
    if (segments.length > 0 && segments[0].includes(':')) {
      result.push({
        name: segments[0],
        path: segments[0] + (segments[0].endsWith(':') ? '\\' : ''),
      });
      currentPath = segments[0] + (segments[0].endsWith(':') ? '\\' : '');

      for (let i = 1; i < segments.length; i++) {
        currentPath += (currentPath.endsWith('\\') ? '' : '\\') + segments[i];
        result.push({
          name: segments[i],
          path: currentPath,
        });
      }
    } else {
      // Unix-style or relative path
      result.push({ name: 'Computer', path: '' });

      for (const segment of segments) {
        currentPath += (currentPath ? '/' : '') + segment;
        result.push({
          name: segment,
          path: currentPath,
        });
      }
    }

    return result;
  }, []);

  const segments = parsePath(path);

  const handleSegmentClick = (segmentPath: string) => {
    onNavigate(segmentPath);
  };

  const handleHomeClick = () => {
    onNavigate('');
  };

  const handlePathClick = () => {
    setIsEditing(true);
  };

  const handlePathSubmit = () => {
    const trimmedPath = editPath.trim();
    if (trimmedPath) {
      onNavigate(trimmedPath);
    } else {
      onNavigate('');
    }
    setIsEditing(false);
  };

  const handlePathCancel = () => {
    setEditPath(path);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePathSubmit();
    } else if (e.key === 'Escape') {
      handlePathCancel();
    }
  };

  return (
    <div className="breadcrumb-bar">
      <button
        className="breadcrumb-home-btn"
        onClick={handleHomeClick}
        title="Go to Computer"
      >
        <Home size={14} />
      </button>

      {isEditing ? (
        <div className="breadcrumb-edit-container">
          <input
            ref={inputRef}
            type="text"
            className="breadcrumb-input"
            value={editPath}
            onChange={(e) => setEditPath(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handlePathSubmit}
            placeholder="Enter path..."
          />
        </div>
      ) : (
        <div className="breadcrumb-segments" onClick={handlePathClick} title="Click to edit path">
          {segments.map((segment, index) => (
            <div key={segment.path} className="breadcrumb-segment-wrapper">
              {index > 0 && (
                <ChevronRight size={14} className="breadcrumb-separator" />
              )}
              <button
                className={`breadcrumb-segment ${index === segments.length - 1 ? 'current' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSegmentClick(segment.path);
                }}
                disabled={index === segments.length - 1}
              >
                {segment.name}
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        className="breadcrumb-refresh-btn"
        onClick={onRefresh}
        disabled={isLoading}
        title="Refresh"
      >
        <RefreshCw size={14} className={isLoading ? 'spinning' : ''} />
      </button>
    </div>
  );
}
