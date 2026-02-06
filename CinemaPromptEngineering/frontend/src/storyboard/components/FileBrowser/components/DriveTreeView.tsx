/**
 * DriveTreeView - Left pane tree navigation
 * Displays drives and expandable folder tree with lazy loading
 */

import { HardDrive, Folder, FolderOpen, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import type { TreeNode } from '../hooks/useFileBrowser';

interface DriveTreeViewProps {
  nodes: TreeNode[];
  selectedPath: string;
  expandedPaths: Set<string>;
  onSelectFolder: (path: string) => void;
  onExpandFolder: (path: string) => void;
  onCollapseFolder: (path: string) => void;
}

function TreeNodeItem({
  node,
  level,
  selectedPath,
  expandedPaths,
  onSelectFolder,
  onExpandFolder,
  onCollapseFolder,
}: {
  node: TreeNode;
  level: number;
  selectedPath: string;
  expandedPaths: Set<string>;
  onSelectFolder: (path: string) => void;
  onExpandFolder: (path: string) => void;
  onCollapseFolder: (path: string) => void;
}) {
  const isSelected = node.path === selectedPath;
  const isExpanded = expandedPaths.has(node.path);

  const handleClick = () => {
    onSelectFolder(node.path);
  };

  const handleExpandToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExpanded) {
      onCollapseFolder(node.path);
    } else {
      onExpandFolder(node.path);
    }
  };

  const getIcon = () => {
    if (node.type === 'drive') {
      return <HardDrive size={16} className="tree-icon drive" />;
    }
    if (isExpanded) {
      return <FolderOpen size={16} className="tree-icon folder-open" />;
    }
    return <Folder size={16} className="tree-icon folder" />;
  };

  return (
    <div className="tree-node-wrapper">
      <div
        className={`tree-node ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        {/* Expand/collapse toggle button */}
        {node.type === 'folder' && (
          <button
            className="tree-expand-btn"
            onClick={handleExpandToggle}
            disabled={node.isLoading}
          >
            {node.isLoading ? (
              <Loader2 size={14} className="tree-loading-icon" />
            ) : isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>
        )}
        {node.type === 'drive' && <span className="tree-spacer" />}

        {getIcon()}
        <span className="tree-label">{node.name}</span>
      </div>

      {/* Render children if expanded */}
      {isExpanded && node.children && node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              level={level + 1}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onSelectFolder={onSelectFolder}
              onExpandFolder={onExpandFolder}
              onCollapseFolder={onCollapseFolder}
            />
          ))}
        </div>
      )}

      {/* Show empty state if expanded but no children */}
      {isExpanded && node.children && node.children.length === 0 && !node.isLoading && (
        <div
          className="tree-empty-children"
          style={{ paddingLeft: `${(level + 1) * 12 + 32}px` }}
        >
          (empty)
        </div>
      )}
    </div>
  );
}

export function DriveTreeView({
  nodes,
  selectedPath,
  expandedPaths,
  onSelectFolder,
  onExpandFolder,
  onCollapseFolder,
}: DriveTreeViewProps) {
  return (
    <div className="drive-tree-view">
      <div className="tree-header">
        <span>Quick Access</span>
      </div>
      <div className="tree-content">
        {nodes.length === 0 ? (
          <div className="tree-empty">No drives found</div>
        ) : (
          nodes.map((node) => (
            <TreeNodeItem
              key={node.path}
              node={node}
              level={0}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onSelectFolder={onSelectFolder}
              onExpandFolder={onExpandFolder}
              onCollapseFolder={onCollapseFolder}
            />
          ))
        )}
      </div>
    </div>
  );
}
