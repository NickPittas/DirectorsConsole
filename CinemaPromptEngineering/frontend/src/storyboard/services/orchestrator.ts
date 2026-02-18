/**
 * Orchestrator Node Management
 * 
 * Manages render nodes for distributed rendering across multiple GPUs/machines
 */

import { getComfyUIWebSocket, ComfyUIWebSocket, KayToolMetrics } from './comfyui-websocket';

export type NodeOS = 'windows' | 'linux' | 'darwin' | 'unknown';

export interface RenderNode {
  id: string;
  name: string;
  url: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  os: NodeOS; // detected from ComfyUI /system_stats
  gpuName: string;
  vramTotal: number; // in MB
  vramUsed: number; // in MB
  gpuUsage: number; // percentage 0-100
  gpuTemp: number; // temperature in Celsius
  cpuUsage: number; // percentage 0-100
  ramUsed: number; // in GB
  ramTotal: number; // in GB
  lastSeen: Date;
  priority: number; // lower = higher priority
}

export interface NodeStats {
  gpuName: string;
  vramTotal: number;
  vramUsed: number;
  gpuUsage: number;
  gpuTemp: number;
  cpuUsage: number;
  ramUsed: number;
  ramTotal: number;
}

class OrchestratorManager {
  private nodes: Map<string, RenderNode> = new Map();
  private listeners: Set<(nodes: RenderNode[]) => void> = new Set();
  private pollingInterval: number | null = null;
  private nodeWebSockets: Map<string, ComfyUIWebSocket> = new Map();
  private removedNodeIds: Set<string> = new Set(); // Track manually removed nodes to prevent API from re-adding them

  /**
   * Fetch backends from Orchestrator API
   */
  async fetchBackendsFromAPI(orchestratorUrl: string): Promise<void> {
    try {
      const response = await fetch(`${orchestratorUrl}/api/backends`);
      if (!response.ok) {
        console.error('[Orchestrator] Failed to fetch backends:', response.status);
        return;
      }
      
      const data = await response.json();
      
      // Merge backends from API with existing nodes (preserving manual nodes)
      // We do NOT clear existing nodes to prevent data loss or flickering
      
      // Add backends from API with their actual IDs
      for (const backend of data.backends || []) {
        // Skip nodes that were manually removed by the user
        if (this.removedNodeIds.has(backend.id)) {
          console.log(`[Orchestrator] Skipping removed node: ${backend.id}`);
          continue;
        }
        
        // Fix #4: Trust backend status from Orchestrator, don't override with browser pings
        const backendStatus = backend.online ? (backend.status === 'busy' ? 'busy' : 'online') : 'offline';
        
        const node: RenderNode = {
          id: backend.id, // Use the actual backend ID from the API
          name: backend.name,
          url: `http://${backend.host}:${backend.port}`,
          status: backendStatus,
          os: 'unknown',
          gpuName: backend.gpu_name || 'Unknown',
          vramTotal: backend.gpu_memory_total || 0,
          vramUsed: backend.gpu_memory_used || 0,
          gpuUsage: backend.gpu_utilization || 0,
          gpuTemp: backend.gpu_temperature || 0,
          cpuUsage: backend.cpu_utilization || 0,
          ramUsed: backend.ram_used || 0,
          ramTotal: backend.ram_total || 0,
          lastSeen: backend.last_seen ? new Date(backend.last_seen) : new Date(),
          priority: this.nodes.size,
        };
        
        this.nodes.set(node.id, node);
        
        // Connect WebSocket for KayTool metrics if online
        if (backend.online) {
          this.connectNodeWebSocket(node);
        }
      }
      
      this.notifyListeners();
      this.saveToStorage();
      
      console.log(`[Orchestrator] Loaded ${this.nodes.size} backends from API`);
    } catch (error) {
      console.error('[Orchestrator] Error fetching backends:', error);
    }
  }

  /**
   * Add a new render node (manual mode - for backwards compatibility)
   */
  addNode(url: string, name: string, id?: string): RenderNode {
    const nodeId = id || `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // If this node was previously removed, allow it to be re-added by clearing its removed status
    if (this.removedNodeIds.has(nodeId)) {
      this.removedNodeIds.delete(nodeId);
      console.log(`[Orchestrator] Re-adding previously removed node: ${nodeId}`);
    }
    
    const node: RenderNode = {
      id: nodeId,
      name,
      url,
      status: 'offline',
      os: 'unknown',
      gpuName: 'Unknown',
      vramTotal: 0,
      vramUsed: 0,
      gpuUsage: 0,
      gpuTemp: 0,
      cpuUsage: 0,
      ramUsed: 0,
      ramTotal: 0,
      lastSeen: new Date(),
      priority: this.nodes.size,
    };
    
    this.nodes.set(nodeId, node);
    this.notifyListeners();
    this.pollNode(node);
    
    return node;
  }

  /**
   * Remove a render node
   */
  removeNode(id: string): boolean {
    const removed = this.nodes.delete(id);
    if (removed) {
      this.removedNodeIds.add(id); // Track removed node to prevent API from re-adding it
      this.saveToStorage(); // Save to localStorage so deletion persists
      this.notifyListeners();
    }
    return removed;
  }

  /**
   * Get all nodes
   */
  getNodes(): RenderNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get online nodes sorted by priority
   */
  getAvailableNodes(): RenderNode[] {
    return this.getNodes()
      .filter(n => n.status === 'online' || n.status === 'busy')
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get best node for rendering
   */
  getBestNode(): RenderNode | null {
    const available = this.getAvailableNodes();
    if (available.length === 0) return null;
    
    // Prefer online nodes over busy ones, then by available VRAM
    return available
      .filter(n => n.status === 'online')
      .sort((a, b) => (b.vramTotal - b.vramUsed) - (a.vramTotal - a.vramUsed))[0] 
      || available[0];
  }

  /**
   * Update node priority
   */
  setNodePriority(id: string, priority: number): void {
    const node = this.nodes.get(id);
    if (node) {
      node.priority = priority;
      this.notifyListeners();
    }
  }

  /**
   * Parse GPU name - removes "cuda:X" prefix and memory allocator suffix
   * e.g., "cuda:0 NVIDIA GeForce RTX 5090:cudaMallocAsync" -> "NVIDIA GeForce RTX 5090"
   */
  private parseGpuName(rawName: string): string {
    if (!rawName) return 'Unknown GPU';
    
    // Remove "cuda:X " prefix
    let name = rawName.replace(/^cuda:\d+\s+/, '');
    
    // Remove memory allocator suffix (e.g., ":cudaMallocAsync")
    name = name.replace(/:\w+Alloc\w*$/, '');
    
    return name.trim() || 'Unknown GPU';
  }

  /**
   * Poll a single node for stats
   * Fix #4: Only used for manually-added nodes, not for Orchestrator-managed backends
   */
  async pollNode(node: RenderNode): Promise<void> {
    try {
      const response = await fetch(`${node.url}/system_stats`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      
      if (response.ok) {
        const stats = await response.json();
        
        // Detect remote OS from ComfyUI system stats
        const rawOS = (stats.system?.os || '').toLowerCase();
        if (rawOS.includes('win')) {
          node.os = 'windows';
        } else if (rawOS.includes('darwin') || rawOS.includes('mac')) {
          node.os = 'darwin';
        } else if (rawOS.includes('linux')) {
          node.os = 'linux';
        }
        // else keep existing value (may already be set from previous poll)
        
        // Extract GPU info from ComfyUI stats
        // Note: ComfyUI returns vram values in bytes, we convert to MB
        const device = stats.devices?.[0];
        if (device) {
          node.gpuName = this.parseGpuName(device.name || 'Unknown GPU');
          // Convert bytes to MB
          node.vramTotal = Math.round((device.vram_total || 0) / 1024 / 1024);
          node.vramUsed = Math.round((device.vram_total - device.vram_free) || 0) / 1024 / 1024;
          // Note: vram_used may not exist, calculate from total - free
          if (device.vram_free !== undefined) {
            node.vramUsed = Math.round((device.vram_total - device.vram_free) / 1024 / 1024);
          }
        }
        
        // Only update status for manually-added nodes (not Orchestrator-managed)
        // Orchestrator-managed nodes get their status from the backend API
        node.status = 'online';
        node.lastSeen = new Date();
        
        // Connect WebSocket for KayTool metrics (GPU usage, temp, CPU, RAM)
        this.connectNodeWebSocket(node);
      } else {
        node.status = 'error';
      }
    } catch (error) {
      // Only mark as offline for manually-added nodes
      node.status = 'offline';
      // Disconnect WebSocket if offline
      this.disconnectNodeWebSocket(node.id);
    }
    
    this.nodes.set(node.id, node);
    this.notifyListeners();
  }
  
  /**
   * Connect WebSocket to a node for KayTool metrics
   */
  private async connectNodeWebSocket(node: RenderNode): Promise<void> {
    // Check if already connected
    if (this.nodeWebSockets.has(node.id)) {
      return;
    }
    
    try {
      const ws = getComfyUIWebSocket(node.url, `orchestrator-${node.id}`);
      await ws.connect();
      
      // Set up KayTool metrics callback
      ws.onKayToolMetrics((metrics: KayToolMetrics) => {
        this.updateNodeFromKayTool(node.id, metrics);
      });
      
      this.nodeWebSockets.set(node.id, ws);
      console.log(`[Orchestrator] WebSocket connected to ${node.name} for KayTool metrics`);
    } catch (error) {
      console.warn(`[Orchestrator] Failed to connect WebSocket to ${node.name}:`, error);
    }
  }
  
  /**
   * Disconnect WebSocket from a node
   */
  private disconnectNodeWebSocket(nodeId: string): void {
    const ws = this.nodeWebSockets.get(nodeId);
    if (ws) {
      ws.stopKayToolMonitor();
      ws.disconnect();
      this.nodeWebSockets.delete(nodeId);
    }
  }
  
  /**
   * Update node metrics from KayTool WebSocket data
   */
  private updateNodeFromKayTool(nodeId: string, metrics: KayToolMetrics): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    
    // Update CPU/RAM
    node.cpuUsage = metrics.cpu_percent || 0;
    node.ramTotal = metrics.ram_total || 0;
    node.ramUsed = metrics.ram_used || 0;
    
    // Update GPU metrics from first GPU
    if (metrics.gpu && metrics.gpu.length > 0) {
      const gpu = metrics.gpu[0];
      node.gpuName = gpu.name || node.gpuName;
      node.gpuUsage = gpu.load || 0;
      node.gpuTemp = gpu.temperature || 0;
      // KayTool reports VRAM in GB, we store in MB
      node.vramUsed = (gpu.memory_used || 0) * 1024;
      node.vramTotal = (gpu.memory_total || 0) * 1024;
    }
    
    node.lastSeen = new Date();
    this.nodes.set(nodeId, node);
    this.notifyListeners();
  }

  /**
   * Start polling all nodes
   */
  startPolling(intervalMs: number = 5000): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    this.pollingInterval = window.setInterval(() => {
      this.nodes.forEach(node => {
        this.pollNode(node);
      });
    }, intervalMs);
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Subscribe to node updates
   */
  subscribe(listener: (nodes: RenderNode[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getNodes());
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of changes
   */
  private notifyListeners(): void {
    const nodes = this.getNodes();
    this.listeners.forEach(listener => listener(nodes));
  }

  /**
   * Save nodes to localStorage
   */
  saveToStorage(): void {
    const data = Array.from(this.nodes.values()).map(n => ({
      id: n.id,
      name: n.name,
      url: n.url,
      priority: n.priority,
      os: n.os,
    }));
    localStorage.setItem('orchestrator_nodes', JSON.stringify(data));
    
    // Save removed node IDs to persist deletions across restarts
    localStorage.setItem('orchestrator_removed_nodes', JSON.stringify(Array.from(this.removedNodeIds)));
  }

  /**
   * Load nodes from localStorage
   */
  loadFromStorage(): void {
    // Load removed node IDs first so we can filter them out
    const removedData = localStorage.getItem('orchestrator_removed_nodes');
    if (removedData) {
      try {
        const removedIds = JSON.parse(removedData);
        this.removedNodeIds = new Set(removedIds);
        console.log(`[Orchestrator] Loaded ${this.removedNodeIds.size} removed node IDs from storage`);
      } catch (e) {
        console.error('Failed to load removed node IDs from storage:', e);
      }
    }
    
    const data = localStorage.getItem('orchestrator_nodes');
    if (data) {
      try {
        const savedNodes = JSON.parse(data);
        
        // Merge with existing nodes instead of clearing to preserve API-fetched data
        savedNodes.forEach((n: any) => {
          // Skip nodes that were manually removed
          if (this.removedNodeIds.has(n.id)) {
            console.log(`[Orchestrator] Skipping removed node during load: ${n.id}`);
            return;
          }
          
          // If node already exists (e.g. from API), preserve it but update priority
          const existingNode = this.nodes.get(n.id);
          if (existingNode) {
            if (n.priority !== undefined) existingNode.priority = n.priority;
            return;
          }

          // Create node with saved ID to prevent duplicates
          const node: RenderNode = {
            id: n.id,
            name: n.name,
            url: n.url,
            status: 'offline',
            os: (n.os as NodeOS) || 'unknown',
            gpuName: 'Unknown',
            vramTotal: 0,
            vramUsed: 0,
            gpuUsage: 0,
            gpuTemp: 0,
            cpuUsage: 0,
            ramUsed: 0,
            ramTotal: 0,
            lastSeen: new Date(),
            priority: n.priority ?? this.nodes.size,
          };
          this.nodes.set(n.id, node);
          this.pollNode(node);
        });
        this.notifyListeners();
      } catch (e) {
        console.error('Failed to load nodes from storage:', e);
      }
    }
  }
  
  /**
   * Clear all nodes
   */
  clearAllNodes(): void {
    this.nodes.clear();
    this.notifyListeners();
    localStorage.removeItem('orchestrator_nodes');
  }

  /**
   * Restart a ComfyUI backend by calling its REST API directly
   * Interrupts any running jobs and frees memory
   * 
   * @param backendId - The ID of the backend to restart
   * @param options - Restart options (interrupt_jobs, free_memory)
   * @returns Promise resolving to success status and message
   */
  async restartBackend(
    backendId: string,
    options: { interrupt_jobs?: boolean; free_memory?: boolean } = {}
  ): Promise<{ success: boolean; message: string }> {
    const node = this.nodes.get(backendId);
    if (!node) {
      return {
        success: false,
        message: `Backend ${backendId} not found`,
      };
    }

    try {
      console.log(`[Orchestrator] Restarting ComfyUI backend ${backendId} at ${node.url}`);
      
      // Step 1: Interrupt any running jobs
      if (options.interrupt_jobs !== false) {
        try {
          const interruptResponse = await fetch(`${node.url}/interrupt`, {
            method: 'POST',
          });
          if (!interruptResponse.ok) {
            console.warn(`[Orchestrator] Interrupt failed for ${backendId}: ${interruptResponse.status}`);
          } else {
            console.log(`[Orchestrator] Interrupted jobs on ${backendId}`);
          }
        } catch (e) {
          console.warn(`[Orchestrator] Failed to interrupt ${backendId}:`, e);
        }
      }

      // Step 2: Free memory and unload models
      if (options.free_memory !== false) {
        try {
          const freeResponse = await fetch(`${node.url}/free`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              unload_models: true,
              free_memory: true 
            }),
          });
          if (!freeResponse.ok) {
            console.warn(`[Orchestrator] Free memory failed for ${backendId}: ${freeResponse.status}`);
          } else {
            console.log(`[Orchestrator] Freed memory on ${backendId}`);
          }
        } catch (e) {
          console.warn(`[Orchestrator] Failed to free memory on ${backendId}:`, e);
        }
      }

      // Step 3: Verify the backend is still responsive
      try {
        const healthResponse = await fetch(`${node.url}/system_stats`, {
          method: 'GET',
        });
        
        if (healthResponse.ok) {
          console.log(`[Orchestrator] Backend ${backendId} health check passed`);
          return {
            success: true,
            message: 'ComfyUI backend restarted successfully. Jobs interrupted, memory freed.',
          };
        } else {
          return {
            success: false,
            message: `Health check failed with status ${healthResponse.status}`,
          };
        }
      } catch (e) {
        return {
          success: false,
          message: `Health check failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
        };
      }
    } catch (error) {
      console.error(`[Orchestrator] Error restarting backend ${backendId}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Restart all online ComfyUI backends
   * 
   * @returns Promise resolving to array of results per backend
   */
  async restartAllBackends(): Promise<Array<{ backendId: string; success: boolean; message: string }>> {
    const nodes = this.getNodes();
    const results = [];

    for (const node of nodes) {
      if (node.status === 'online' || node.status === 'busy') {
        const result = await this.restartBackend(node.id);
        results.push({
          backendId: node.id,
          success: result.success,
          message: result.message,
        });
      }
    }

    return results;
  }

  /**
   * Cancel all running generations across all ComfyUI backends
   * Sends interrupt command to all busy nodes
   * 
   * @returns Promise resolving to array of results per backend
   */
  async cancelAllGenerations(): Promise<Array<{ backendId: string; success: boolean; message: string }>> {
    const nodes = this.getNodes();
    const results = [];

    for (const node of nodes) {
      if (node.status === 'busy') {
        try {
          console.log(`[Orchestrator] Cancelling generation on ${node.id} at ${node.url}`);
          const response = await fetch(`${node.url}/interrupt`, {
            method: 'POST',
          });
          
          if (response.ok) {
            results.push({
              backendId: node.id,
              success: true,
              message: 'Generation cancelled',
            });
          } else {
            results.push({
              backendId: node.id,
              success: false,
              message: `Failed to cancel: HTTP ${response.status}`,
            });
          }
        } catch (error) {
          results.push({
            backendId: node.id,
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return results;
  }
}

// Singleton instance
export const orchestratorManager = new OrchestratorManager();

// Hook for React components
export function useRenderNodes(): RenderNode[] {
  const [nodes, setNodes] = useState<RenderNode[]>([]);
  
  useEffect(() => {
    const unsubscribe = orchestratorManager.subscribe(setNodes);
    return unsubscribe;
  }, []);
  
  return nodes;
}

import { useState, useEffect } from 'react';
