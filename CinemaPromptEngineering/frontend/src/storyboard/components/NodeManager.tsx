import { useState } from 'react';
import { orchestratorManager, RenderNode, useRenderNodes } from '../services/orchestrator';
import { RefreshCw } from 'lucide-react';
import './NodeManager.css';

interface NodeManagerProps {
  onClose: () => void;
  onRestartNodes?: (nodeIds: string[]) => Promise<void>;
}

export function NodeManager({ onClose, onRestartNodes }: NodeManagerProps) {
  const nodes = useRenderNodes();
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [isPolling, setIsPolling] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [isRestarting, setIsRestarting] = useState(false);

  const handleAddNode = () => {
    if (newUrl && newName) {
      orchestratorManager.addNode(newUrl, newName);
      orchestratorManager.saveToStorage();
      setNewUrl('');
      setNewName('');
    }
  };

  const handleRemoveNode = (id: string) => {
    orchestratorManager.removeNode(id);
    orchestratorManager.saveToStorage();
  };

  const togglePolling = () => {
    if (isPolling) {
      orchestratorManager.stopPolling();
    } else {
      orchestratorManager.startPolling(5000);
      // Poll immediately
      nodes.forEach(node => orchestratorManager.pollNode(node));
    }
    setIsPolling(!isPolling);
  };

  const handleSelectNode = (nodeId: string) => {
    const newSelected = new Set(selectedNodes);
    if (newSelected.has(nodeId)) {
      newSelected.delete(nodeId);
    } else {
      newSelected.add(nodeId);
    }
    setSelectedNodes(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedNodes.size === nodes.length) {
      setSelectedNodes(new Set());
    } else {
      setSelectedNodes(new Set(nodes.map(n => n.id)));
    }
  };

  const handleRestartSelected = async () => {
    if (selectedNodes.size === 0) {
      alert('Please select at least one node to restart');
      return;
    }

    setIsRestarting(true);
    try {
      if (onRestartNodes) {
        await onRestartNodes(Array.from(selectedNodes));
      } else {
        // Restart each selected node individually via ComfyUI REST API
        for (const nodeId of selectedNodes) {
          await orchestratorManager.restartBackend(nodeId);
        }
      }
      // Clear selection after restart
      setSelectedNodes(new Set());
    } catch (error) {
      console.error('Failed to restart nodes:', error);
    } finally {
      setIsRestarting(false);
    }
  };

  const formatBytes = (mb: number): string => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb} MB`;
  };

  const getStatusColor = (status: RenderNode['status']): string => {
    switch (status) {
      case 'online': return '#4dff6d';
      case 'busy': return '#ffcc00';
      case 'error': return '#ff4444';
      case 'offline': return '#666';
      default: return '#666';
    }
  };

  return (
    <div className="node-manager-overlay">
      <div className="node-manager-modal">
        <div className="node-manager-header">
          <h2>Render Nodes</h2>
          <div className="header-actions">
            {selectedNodes.size > 0 && (
              <button
                className="restart-selected-btn"
                onClick={handleRestartSelected}
                disabled={isRestarting}
                title={`Restart ${selectedNodes.size} selected node(s)`}
              >
                <RefreshCw size={16} className={isRestarting ? 'spinning' : ''} />
                <span>{isRestarting ? 'Restarting...' : `Restart ${selectedNodes.size}`}</span>
              </button>
            )}
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="node-manager-content">
          {/* Add Node Form */}
          <div className="add-node-form">
            <input
              type="text"
              placeholder="Node Name (e.g., 5090-Node-1)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              type="text"
              placeholder="ComfyUI URL (e.g., http://192.168.1.100:8188)"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
            <button onClick={handleAddNode} disabled={!newUrl || !newName}>
              Add Node
            </button>
          </div>

          {/* Polling Toggle */}
          <div className="polling-control">
            <button 
              className={`polling-btn ${isPolling ? 'active' : ''}`}
              onClick={togglePolling}
            >
              {isPolling ? '⏹ Stop Monitoring' : '▶ Start Monitoring'}
            </button>
          </div>

          {/* Node List */}
          <div className="node-list">
            {nodes.length > 0 && (
              <div className="select-all-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedNodes.size === nodes.length && nodes.length > 0}
                    onChange={handleSelectAll}
                  />
                  <span>Select All ({selectedNodes.size}/{nodes.length})</span>
                </label>
              </div>
            )}
            {nodes.length === 0 ? (
              <p className="no-nodes">No render nodes configured. Add nodes to distribute rendering.</p>
            ) : (
              nodes.map(node => (
                <div 
                  key={node.id} 
                  className={`node-card ${selectedNodes.has(node.id) ? 'selected' : ''}`}
                >
                  <div className="node-header">
                    <div className="node-info">
                      <label className="checkbox-label node-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedNodes.has(node.id)}
                          onChange={() => handleSelectNode(node.id)}
                        />
                      </label>
                      <span className="node-name">{node.name}</span>
                      <span 
                        className="node-status"
                        style={{ color: getStatusColor(node.status) }}
                      >
                        ● {node.status.toUpperCase()}
                      </span>
                    </div>
                    <button 
                      className="remove-btn"
                      onClick={() => handleRemoveNode(node.id)}
                    >
                      Remove
                    </button>
                  </div>
                  
                  <div className="node-url">{node.url}</div>
                  
                  {node.status !== 'offline' && node.gpuName !== 'Unknown' && (
                    <div className="node-stats">
                      <div className="stat-row">
                        <span className="stat-label">GPU:</span>
                        <span className="stat-value">{node.gpuName}</span>
                      </div>
                      
                      <div className="stat-row">
                        <span className="stat-label">VRAM:</span>
                        <span className="stat-value">
                          {formatBytes(node.vramUsed)} / {formatBytes(node.vramTotal)}
                          {' '}
                          <span className="vram-percent">
                            ({node.vramTotal > 0 
                              ? Math.round((node.vramUsed / node.vramTotal) * 100) 
                              : 0}%)
                          </span>
                        </span>
                      </div>
                      
                      <div className="stat-row">
                        <span className="stat-label">GPU Usage:</span>
                        <span className="stat-value">{node.gpuUsage}%</span>
                      </div>
                      
                      <div className="vram-bar">
                        <div 
                          className="vram-fill"
                          style={{ 
                            width: `${node.vramTotal > 0 
                              ? (node.vramUsed / node.vramTotal) * 100 
                              : 0}%` 
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
