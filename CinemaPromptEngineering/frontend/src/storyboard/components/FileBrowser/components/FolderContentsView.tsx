/**
 * FolderContentsView - Right pane folder/project contents
 * Displays folders and project files with inline selection
 */

import { HardDrive, Folder, FileText, Clock, LayoutGrid } from 'lucide-react';
import type { FolderItem } from '../hooks/useFileBrowser';

interface FolderContentsViewProps {
  items: FolderItem[];
  selectedItem: FolderItem | null;
  onSelectItem: (item: FolderItem) => void;
  onOpenItem: (item: FolderItem) => void;
  isLoading: boolean;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes <= 1 ? 'Just now' : `${diffMinutes} minutes ago`;
    }
    return `${diffHours} hours ago`;
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)} weeks ago`;
  }

  return date.toLocaleDateString();
}

export function FolderContentsView({
  items,
  selectedItem,
  onSelectItem,
  onOpenItem,
  isLoading,
}: FolderContentsViewProps) {
  const handleItemClick = (item: FolderItem) => {
    onSelectItem(item);
  };

  const handleItemDoubleClick = (item: FolderItem) => {
    onOpenItem(item);
  };

  const getItemIcon = (item: FolderItem) => {
    switch (item.type) {
      case 'drive':
        return <HardDrive size={24} className="item-icon drive" />;
      case 'folder':
        return <Folder size={24} className="item-icon folder" />;
      case 'project':
        return <FileText size={24} className="item-icon project" />;
      default:
        return <Folder size={24} className="item-icon" />;
    }
  };

  // Sort items: drives first, then folders, then projects, alphabetically within each group
  const sortedItems = [...items].sort((a, b) => {
    const typeOrder = { drive: 0, folder: 1, project: 2 };
    const orderDiff = typeOrder[a.type] - typeOrder[b.type];
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name);
  });

  // Separate folders and projects for display
  const folders = sortedItems.filter((item) => item.type === 'drive' || item.type === 'folder');
  const projects = sortedItems.filter((item) => item.type === 'project');

  if (isLoading) {
    return (
      <div className="folder-contents-view loading">
        <div className="contents-loading">
          <div className="loading-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (sortedItems.length === 0) {
    return (
      <div className="folder-contents-view empty">
        <div className="contents-empty">
          <Folder size={48} className="empty-icon" />
          <span>This folder is empty</span>
        </div>
      </div>
    );
  }

  return (
    <div className="folder-contents-view">
      {/* Folders Section */}
      {folders.length > 0 && (
        <div className="contents-section">
          <div className="section-header">
            <Folder size={14} />
            <span>Folders ({folders.length})</span>
          </div>
          <div className="items-grid">
            {folders.map((item) => (
              <div
                key={item.path}
                className={`content-item ${selectedItem?.path === item.path ? 'selected' : ''} ${item.type}`}
                onClick={() => handleItemClick(item)}
                onDoubleClick={() => handleItemDoubleClick(item)}
                title={item.name}
              >
                {getItemIcon(item)}
                <span className="item-name">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects Section */}
      {projects.length > 0 && (
        <div className="contents-section">
          <div className="section-header">
            <FileText size={14} />
            <span>Projects ({projects.length})</span>
          </div>
          <div className="items-grid">
            {projects.map((item) => (
              <div
                key={item.path}
                className={`content-item ${selectedItem?.path === item.path ? 'selected' : ''} ${item.type}`}
                onClick={() => handleItemClick(item)}
                onDoubleClick={() => handleItemDoubleClick(item)}
                title={item.name}
              >
                {getItemIcon(item)}
                <div className="item-details">
                  <span className="item-name">{item.name}</span>
                  {item.metadata && (
                    <div className="item-meta">
                      <span className="meta-item">
                        <Clock size={12} />
                        {formatDate(item.metadata.savedAt)}
                      </span>
                      <span className="meta-item">
                        <LayoutGrid size={12} />
                        {item.metadata.panelCount} panels
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
