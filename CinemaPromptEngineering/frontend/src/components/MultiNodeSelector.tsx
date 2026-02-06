/** Multi-Node Selector Component
 *
 * Chip-based UI for selecting multiple render backends for parallel generation.
 */

import { useState, useEffect } from 'react';
import { useRenderNodes, type RenderNode } from '@/storyboard/services/orchestrator';
import {
  Cpu,
  Check,
  X,
  Zap,
  AlertCircle,
  Loader2,
  Power,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import './MultiNodeSelector.css';

// =============================================================================
// Props Interface
// =============================================================================

export interface MultiNodeSelectorProps {
  /** Currently selected backend IDs */
  selectedBackendIds: string[];
  /** Callback when selection changes */
  onSelectionChange: (backendIds: string[]) => void;
  /** Maximum number of backends that can be selected */
  maxSelections?: number;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Optional className for styling */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function MultiNodeSelector({
  selectedBackendIds,
  onSelectionChange,
  maxSelections = 10,
  disabled = false,
  className = '',
}: MultiNodeSelectorProps) {
  const nodes = useRenderNodes();

  // Collapsed state - persisted to localStorage
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem('multiNodeSelector_collapsed');
    return saved === 'true';
  });

  // Save collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem('multiNodeSelector_collapsed', isCollapsed.toString());
  }, [isCollapsed]);

  // Filter to only online or busy nodes
  const availableNodes = nodes.filter(
    (node) => node.status === 'online' || node.status === 'busy'
  );

  // Sort by priority (lower = higher priority) then by name
  const sortedNodes = [...availableNodes].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.name.localeCompare(b.name);
  });

  // Toggle a node's selection
  const toggleNode = (nodeId: string) => {
    if (disabled) return;

    if (selectedBackendIds.includes(nodeId)) {
      onSelectionChange(selectedBackendIds.filter((id) => id !== nodeId));
    } else if (selectedBackendIds.length < maxSelections) {
      onSelectionChange([...selectedBackendIds, nodeId]);
    }
  };

  // Select all available nodes
  const selectAll = () => {
    if (disabled) return;
    onSelectionChange(sortedNodes.slice(0, maxSelections).map((n) => n.id));
  };

  // Clear all selections
  const clearAll = () => {
    if (disabled) return;
    onSelectionChange([]);
  };

  // Get status icon for a node
  const getStatusIcon = (node: RenderNode) => {
    switch (node.status) {
      case 'online':
        return <Power className="status-icon online" size={10} />;
      case 'busy':
        return <Loader2 className="status-icon busy" size={10} />;
      case 'error':
        return <AlertCircle className="status-icon error" size={10} />;
      default:
        return <Power className="status-icon offline" size={10} />;
    }
  };

  // Get status color class
  const getStatusClass = (node: RenderNode): string => {
    switch (node.status) {
      case 'online':
        return 'online';
      case 'busy':
        return 'busy';
      case 'error':
        return 'error';
      default:
        return 'offline';
    }
  };

  // Format VRAM display
  const formatVram = (mb: number): string => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb} MB`;
  };

  const isMultiSelect = selectedBackendIds.length > 1;
  const isMaxReached = selectedBackendIds.length >= maxSelections;
  const allSelected =
    sortedNodes.length > 0 && selectedBackendIds.length === sortedNodes.length;

  return (
    <div className={`multi-node-selector ${className} ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="selector-header">
        <div className="selector-label">
          <Cpu size={14} />
          <span>Target Nodes</span>
          <span className="selection-count">
            ({selectedBackendIds.length}/{sortedNodes.length})
          </span>
        </div>

        <div className="selector-actions">
          {!isCollapsed && (
            <>
              <button
                type="button"
                className="action-btn select-all"
                onClick={selectAll}
                disabled={disabled || allSelected || sortedNodes.length === 0}
                title="Select all available nodes"
              >
                <Check size={12} />
                All
              </button>
              <button
                type="button"
                className="action-btn clear-all"
                onClick={clearAll}
                disabled={disabled || selectedBackendIds.length === 0}
                title="Clear all selections"
              >
                <X size={12} />
                Clear
              </button>
            </>
          )}
          <button
            type="button"
            className="action-btn collapse-toggle"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand node selector' : 'Collapse node selector'}
          >
            {isCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        </div>
      </div>

      {/* Node Chips */}
      {!isCollapsed && (
        <div className="node-chips-container">
        {sortedNodes.length === 0 ? (
          <div className="no-nodes-message">
            <AlertCircle size={16} />
            <span>No render nodes available</span>
            <span className="hint">
              Add nodes in the Node Manager to enable parallel generation
            </span>
          </div>
        ) : (
          <div className="node-chips">
            {sortedNodes.map((node) => {
              const isSelected = selectedBackendIds.includes(node.id);
              const statusClass = getStatusClass(node);

              return (
                <button
                  key={node.id}
                  type="button"
                  className={`node-chip ${isSelected ? 'selected' : ''} ${statusClass} ${
                    disabled ? 'disabled' : ''
                  }`}
                  onClick={() => toggleNode(node.id)}
                  disabled={disabled || (!isSelected && isMaxReached)}
                  title={`${node.name} - ${node.gpuName} - ${formatVram(
                    node.vramTotal
                  )} VRAM`}
                >
                  {getStatusIcon(node)}

                  <span className="node-name">{node.name}</span>

                  {isSelected && (
                    <span className="selection-indicator">
                      <Check size={10} />
                    </span>
                  )}

                  {/* VRAM indicator */}
                  {node.vramTotal > 0 && (
                    <span className="vram-badge">
                      {formatVram(node.vramTotal)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        </div>
      )}

      {/* Parallel generation hint */}
      {!isCollapsed && isMultiSelect && (
        <div className="parallel-hint">
          <Zap size={12} />
          <span>
            <strong>{selectedBackendIds.length}</strong> parallel generations with
            unique seeds
          </span>
        </div>
      )}

      {/* Max selection warning */}
      {!isCollapsed && isMaxReached && (
        <div className="max-selection-warning">
          <AlertCircle size={10} />
          <span>Maximum {maxSelections} nodes can be selected</span>
        </div>
      )}
    </div>
  );
}

export default MultiNodeSelector;
