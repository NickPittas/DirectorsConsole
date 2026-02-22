/**
 * FolderTree — Recursive folder tree sidebar component.
 *
 * Renders the project folder hierarchy with expand/collapse, active highlighting,
 * and file-count badges. Builds a tree from the flat FolderEntry array.
 */

import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useGalleryStore } from '../store/gallery-store';
import type { TreeFolderEntry } from '../services/gallery-service';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FolderPlus } from 'lucide-react';
import './components.css';

// =============================================================================
// Types
// =============================================================================

interface FolderTreeProps {
  folders: TreeFolderEntry[];
  currentPath: string;
  projectPath: string;
  onNavigate: (path: string) => void;
  onDropFiles?: (filePaths: string[], targetFolder: string) => void;
  onCreateFolder?: (parentPath: string, folderName: string) => Promise<void>;
}

interface TreeNode {
  folder: TreeFolderEntry;
  children: TreeNode[];
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get the parent path of a given path by removing the last segment.
 */
function getParentPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return '';
  return normalized.substring(0, lastSlash);
}

/**
 * Build a tree structure from a flat array of FolderEntry items.
 * Parent-child relationships are derived by comparing each folder's
 * parent path against other folders' paths.
 */
function buildTree(folders: TreeFolderEntry[], projectPath: string): TreeNode[] {
  // Index folders by their normalized path
  const byPath = new Map<string, TreeNode>();
  for (const folder of folders) {
    const normPath = folder.path.replace(/\\/g, '/').replace(/\/$/, '');
    byPath.set(normPath, { folder, children: [] });
  }

  const roots: TreeNode[] = [];
  const normProjectPath = projectPath.replace(/\\/g, '/').replace(/\/$/, '');

  for (const folder of folders) {
    const normPath = folder.path.replace(/\\/g, '/').replace(/\/$/, '');
    const parentPath = getParentPath(normPath);

    if (normPath === normProjectPath || parentPath === '' || !byPath.has(parentPath)) {
      // This is a root-level folder (or the project root itself)
      const node = byPath.get(normPath);
      if (node) roots.push(node);
    } else {
      // Attach as a child of the parent
      const parentNode = byPath.get(parentPath);
      const childNode = byPath.get(normPath);
      if (parentNode && childNode) {
        parentNode.children.push(childNode);
      }
    }
  }

  // Sort children alphabetically at each level
  function sortTree(nodes: TreeNode[]) {
    nodes.sort((a, b) => a.folder.name.localeCompare(b.folder.name));
    for (const node of nodes) {
      sortTree(node.children);
    }
  }
  sortTree(roots);

  return roots;
}

// =============================================================================
// Sub-component: Single tree row
// =============================================================================

interface FolderTreeItemProps {
  node: TreeNode;
  depth: number;
  currentPath: string;
  expandedFolders: Set<string>;
  onToggle: (path: string) => void;
  onNavigate: (path: string) => void;
  onDropFiles?: (filePaths: string[], targetFolder: string) => void;
  onCreateFolder?: (parentPath: string, folderName: string) => Promise<void>;
}

function FolderTreeItem({
  node,
  depth,
  currentPath,
  expandedFolders,
  onToggle,
  onNavigate,
  onDropFiles,
  onCreateFolder,
}: FolderTreeItemProps) {
  const { folder, children } = node;
  const isExpanded = expandedFolders.has(folder.path);
  const isActive = folder.path === currentPath;
  const hasChildren = children.length > 0;
  const [isDragOver, setIsDragOver] = useState(false);
  // Counter tracks nested dragenter/dragleave pairs so we only clear
  // the highlight when the pointer truly leaves the drop-target element.
  const dragCounterRef = useRef(0);

  // Context menu state
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showNewFolderInput && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
      newFolderInputRef.current.select();
    }
  }, [showNewFolderInput]);

  useEffect(() => {
    if (!showContextMenu) return;
    function handleClickOutside() {
      setShowContextMenu(false);
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showContextMenu]);

  const handleChevronClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle(folder.path);
    },
    [folder.path, onToggle],
  );

  const handleNameClick = useCallback(() => {
    onNavigate(folder.path);
  }, [folder.path, onNavigate]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu(true);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleNewFolder = useCallback(() => {
    setShowContextMenu(false);
    setShowNewFolderInput(true);
    setNewFolderName('New Folder');
  }, []);

  // Read value directly from the input ref to avoid stale closures
  const handleNewFolderSubmit = useCallback(() => {
    const trimmed = newFolderInputRef.current?.value.trim() || '';
    // Hide the input immediately — don't wait for async
    setShowNewFolderInput(false);
    setNewFolderName('');
    if (!trimmed || !onCreateFolder) return;
    // Fire-and-forget: the parent's onCreateFolder handles the API call + refresh
    onCreateFolder(folder.path, trimmed).catch(() => {
      // Error handling delegated to parent
    });
  }, [onCreateFolder, folder.path]);

  const handleNewFolderKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleNewFolderSubmit();
    } else if (e.key === 'Escape') {
      setShowNewFolderInput(false);
      setNewFolderName('');
    }
  }, [handleNewFolderSubmit]);

  const hasDragData = useCallback((e: React.DragEvent): boolean => {
    return (
      e.dataTransfer.types.includes('application/x-storyboard-image') ||
      e.dataTransfer.types.includes('text/plain')
    );
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current += 1;
      if (hasDragData(e)) {
        e.dataTransfer.dropEffect = 'move';
        setIsDragOver(true);
      }
    },
    [hasDragData],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      // Must preventDefault on BOTH dragenter and dragover for the
      // browser to allow a drop on this element.
      if (hasDragData(e)) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
      }
    },
    [hasDragData],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      if (!onDropFiles) return;

      // Try the custom MIME type first, fall back to text/plain
      const raw =
        e.dataTransfer.getData('application/x-storyboard-image') ||
        e.dataTransfer.getData('text/plain');
      if (!raw) return;

      try {
        const data = JSON.parse(raw);
        if (data.filePath) {
          onDropFiles([data.filePath], folder.path);
        }
      } catch {
        // Invalid drag data — not a gallery thumbnail
      }
    },
    [folder.path, onDropFiles],
  );

  const itemClass = [
    'folder-tree-item',
    isActive ? 'folder-tree-item--active' : '',
    isDragOver ? 'folder-tree-item--drag-over' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div
        className={itemClass}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleNameClick}
        onContextMenu={handleContextMenu}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Chevron */}
        <span
          className={`folder-tree-chevron${hasChildren ? '' : ' folder-tree-chevron--empty'}`}
          onClick={hasChildren ? handleChevronClick : undefined}
        >
          {hasChildren && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        </span>

        {/* Folder icon */}
        <span className="folder-tree-icon">
          {isActive && isExpanded ? (
            <FolderOpen size={15} />
          ) : (
            <Folder size={15} />
          )}
        </span>

        {/* Folder name */}
        <span className="folder-tree-name">{folder.name}</span>

        {/* File count badge */}
        {folder.file_count > 0 && (
          <span className="folder-tree-count">{folder.file_count}</span>
        )}
      </div>

      {/* Render children recursively when expanded */}
      {isExpanded &&
        children.map((child) => (
          <FolderTreeItem
            key={child.folder.path}
            node={child}
            depth={depth + 1}
            currentPath={currentPath}
            expandedFolders={expandedFolders}
            onToggle={onToggle}
            onNavigate={onNavigate}
            onDropFiles={onDropFiles}
            onCreateFolder={onCreateFolder}
          />
        ))}

      {/* Context menu */}
      {showContextMenu && createPortal(
        <div
          className="folder-tree-context-menu"
          style={{
            position: 'fixed',
            top: contextMenuPos.y,
            left: contextMenuPos.x,
            zIndex: 10000,
            background: 'var(--color-bg-secondary, #1e1e2e)',
            border: '1px solid var(--color-border, #333)',
            borderRadius: 6,
            padding: '4px 0',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            minWidth: 160,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="folder-tree-context-menu-item"
            style={{
              padding: '6px 14px',
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--color-text, #e0e0e0)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover, rgba(255,255,255,0.06))'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            onClick={handleNewFolder}
          >
            <FolderPlus size={14} />
            New Folder
          </div>
        </div>,
        document.body,
      )}

      {/* New folder inline input */}
      {showNewFolderInput && (
        <div
          className="folder-tree-new-folder"
          style={{ paddingLeft: `${(depth + 1) * 16 + 8}px`, padding: '2px 8px 2px' }}
        >
          <input
            ref={newFolderInputRef}
            className="folder-tree-new-folder-input"
            style={{
              width: '100%',
              padding: '3px 6px',
              fontSize: 12,
              background: 'var(--color-bg-primary, #141420)',
              color: 'var(--color-text, #e0e0e0)',
              border: '1px solid var(--color-accent, #5b9aff)',
              borderRadius: 3,
              outline: 'none',
              boxSizing: 'border-box',
            }}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={handleNewFolderKeyDown}
            onBlur={() => { setShowNewFolderInput(false); setNewFolderName(''); }}
            placeholder="Folder name"
          />
        </div>
      )}
    </>
  );
}

// =============================================================================
// Main component
// =============================================================================

export function FolderTree({ folders, currentPath, projectPath, onNavigate, onDropFiles, onCreateFolder }: FolderTreeProps) {
  const { expandedFolders, toggleFolder } = useGalleryStore();

  const tree = useMemo(() => buildTree(folders, projectPath), [folders, projectPath]);

  return (
    <div className="folder-tree">
      {tree.map((node) => (
        <FolderTreeItem
          key={node.folder.path}
          node={node}
          depth={0}
          currentPath={currentPath}
          expandedFolders={expandedFolders}
          onToggle={toggleFolder}
          onNavigate={onNavigate}
          onDropFiles={onDropFiles}
          onCreateFolder={onCreateFolder}
        />
      ))}
      {tree.length === 0 && (
        <div style={{ padding: '12px 16px', color: 'var(--color-text-muted, #666)', fontSize: 12 }}>
          No folders found
        </div>
      )}
    </div>
  );
}
