/**
 * ComfyUI WebSocket Progress Tracking
 * 
 * Connects to ComfyUI's WebSocket for real-time progress updates during generation.
 */

export interface ProgressData {
  value: number;
  max: number;
  promptId: string;
  nodeId?: string;
  /** Overall progress percentage (0-100) accounting for all sampler phases */
  overallPercent?: number;
  /** Current sampler phase index (1-based) */
  currentPhase?: number;
  /** Total number of sampler phases in this workflow */
  totalPhases?: number;
  /** Name/type of the currently executing node */
  currentNodeName?: string;
  /** Total nodes executed so far (including non-sampler nodes) */
  nodesExecuted?: number;
  /** Total nodes in workflow */
  totalNodes?: number;
}

export interface ExecutionStatus {
  type: 'executing' | 'executed' | 'execution_start' | 'execution_cached' | 'progress' | 'status' | 'kaytool.resources';
  data: any;
}

/**
 * System metrics from KayTool monitor
 * WebSocket event type: 'kaytool.resources'
 */
export interface KayToolMetrics {
  cpu_percent: number;
  cpu_count: number;
  cpu_name: string;
  ram_total: number; // GB
  ram_used: number; // GB
  ram_percent: number;
  gpu: Array<{
    index: number;
    name: string;
    load: number; // GPU utilization %
    memory_used: number; // GB
    memory_total: number; // GB
    memory_percent: number;
    temperature: number; // Celsius
  }>;
}

type ProgressCallback = (progress: ProgressData) => void;
type CompletedCallback = (promptId: string, outputs: any) => void;
type ErrorCallback = (promptId: string, error: string) => void;
type StatusCallback = (status: ExecutionStatus) => void;
type KayToolMetricsCallback = (metrics: KayToolMetrics) => void;

/**
 * Info about the workflow being executed, used to calculate multi-phase progress.
 */
export interface WorkflowProgressInfo {
  /** Total node count in the workflow */
  totalNodes: number;
  /** Node IDs of nodes that report step-by-step progress (KSampler, SamplerCustom, etc.) */
  samplerNodeIds: string[];
  /** Map of node ID -> class_type for display purposes */
  nodeTypes: Record<string, string>;
}

interface PendingPrompt {
  promptId: string;
  panelId: number;
  onProgress: ProgressCallback;
  onCompleted: CompletedCallback;
  onError: ErrorCallback;
  /** Workflow info for multi-phase progress tracking */
  workflowInfo?: WorkflowProgressInfo;
  /** Execution tracking state */
  executionState: {
    /** Node IDs that have started executing (in order) */
    executedNodes: string[];
    /** Node IDs of samplers that have completed their progress phase */
    completedSamplerPhases: string[];
    /** The sampler node currently reporting progress */
    currentSamplerNodeId: string | null;
    /** Accumulated completed steps from previous sampler phases */
    completedSteps: number;
    /** Total steps across all sampler phases (sum of all max values seen) */
    totalStepsEstimate: number;
    /** Max value of the current sampler phase */
    currentPhaseMax: number;
  };
}

export class ComfyUIWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private baseUrl: string;
  private clientId: string;
  private pendingPrompts: Map<string, PendingPrompt> = new Map();
  private reconnectTimeout: number | null = null;
  private statusCallback: StatusCallback | null = null;
  private kayToolMetricsCallback: KayToolMetricsCallback | null = null;
  private isConnected: boolean = false;
  private kayToolMonitorStarted: boolean = false;
  
  // Reconnection settings with exponential backoff
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 20;
  private readonly minReconnectDelay: number = 1000; // 1 second
  private readonly maxReconnectDelay: number = 30000; // 30 seconds
  private isIntentionallyClosed: boolean = false;
  
  constructor(baseUrl: string, clientId: string = 'storyboard-ui') {
    // Convert http(s) to ws(s)
    this.baseUrl = baseUrl;
    this.url = baseUrl.replace(/^http/, 'ws') + '/ws?clientId=' + clientId;
    this.clientId = clientId;
  }
  
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      
      // Clear any pending reconnect when manually connecting
      this.cancelReconnect();
      this.isIntentionallyClosed = false;
      
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
          console.log('[ComfyUI WS] Connected');
          this.isConnected = true;
          this.reconnectAttempts = 0; // Reset attempts on successful connection
          resolve();
        };
        
        this.ws.onclose = (event) => {
          console.log(`[ComfyUI WS] Disconnected (code: ${event.code}, reason: ${event.reason || 'none'})`);
          this.isConnected = false;
          
          // Only auto-reconnect if not intentionally closed
          if (!this.isIntentionallyClosed) {
            this.scheduleReconnect();
          }
        };
        
        this.ws.onerror = (error) => {
          console.error('[ComfyUI WS] Error:', error);
          this.isConnected = false;
          reject(error);
        };
        
        this.ws.onmessage = (event) => {
          // ComfyUI sends both JSON text messages and binary Blob data (preview images)
          if (event.data instanceof Blob) {
            // Binary data (preview image) - ignore for now
            // Could be used for real-time preview in the future
            return;
          }
          
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (e) {
            console.error('[ComfyUI WS] Failed to parse message:', e);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }
  
  disconnect() {
    this.isIntentionallyClosed = true;
    this.cancelReconnect();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.reconnectAttempts = 0;
  }
  
  private cancelReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
  
  /**
   * Calculate reconnection delay using exponential backoff with jitter.
   * Formula: min(maxDelay, minDelay * 2^attempt) + random jitter
   */
  private calculateReconnectDelay(): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    const exponentialDelay = Math.min(
      this.maxReconnectDelay,
      this.minReconnectDelay * Math.pow(2, this.reconnectAttempts)
    );
    
    // Add random jitter (0-25% of delay) to prevent thundering herd
    const jitter = Math.random() * 0.25 * exponentialDelay;
    
    return Math.floor(exponentialDelay + jitter);
  }
  
  private scheduleReconnect() {
    // Don't reconnect if already reconnecting or max attempts reached
    if (this.reconnectTimeout) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`[ComfyUI WS] Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      return;
    }
    
    const delay = this.calculateReconnectDelay();
    this.reconnectAttempts++;
    
    console.log(`[ComfyUI WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect().catch((error) => {
        console.error('[ComfyUI WS] Reconnection failed:', error);
        // scheduleReconnect will be called by onclose handler
      });
    }, delay);
  }
  
  /**
   * Reset reconnection attempts (call when user manually reconnects)
   */
  resetReconnectAttempts() {
    this.reconnectAttempts = 0;
    this.isIntentionallyClosed = false;
  }
  
  private handleMessage(message: any) {
    const { type, data } = message;
    
    // Notify status callback (but not for high-frequency monitoring events)
    if (this.statusCallback && !this.isMonitoringEvent(type)) {
      this.statusCallback({ type, data });
    }
    
    switch (type) {
      case 'progress':
        this.handleProgress(data);
        break;
        
      case 'executing':
        this.handleExecuting(data);
        break;
        
      case 'executed':
        this.handleExecuted(data);
        break;
        
      case 'execution_error':
        this.handleError(data);
        break;
        
      case 'execution_start':
        // Silently handled - progress tracking started
        break;
        
      case 'execution_cached':
        // Silently handled - cached nodes don't need logging
        break;
        
      case 'status':
        // Queue status update - handled silently
        break;
        
      case 'kaytool.resources':
        // KayTool system metrics update - pass to callback silently
        if (this.kayToolMetricsCallback && data) {
          this.kayToolMetricsCallback(data as KayToolMetrics);
        }
        break;
        
      case 'crystools.monitor':
      case 'kikostats.monitor':
        // Known monitoring extensions - ignore silently
        break;
        
      default:
        // Only log truly unknown message types (not monitoring extensions)
        if (!this.isMonitoringEvent(type)) {
          console.log('[ComfyUI WS] Unknown message type:', type);
        }
    }
  }
  
  private isMonitoringEvent(type: string): boolean {
    return type.includes('.monitor') || 
           type.includes('crystools') || 
           type.includes('kikostats') ||
           type === 'kaytool.resources';
  }
  
  private handleProgress(data: any) {
    const { value, max, prompt_id, node } = data;
    
    console.log('[ComfyUI WS] Progress:', prompt_id, value, '/', max, 'node:', node);
    
    const pending = this.pendingPrompts.get(prompt_id);
    if (!pending) {
      console.warn('[ComfyUI WS] No pending prompt found for:', prompt_id);
      return;
    }

    const state = pending.executionState;
    const wfInfo = pending.workflowInfo;

    // Track which sampler is currently reporting progress
    if (node && node !== state.currentSamplerNodeId) {
      // A new sampler node started reporting — the previous one is done
      if (state.currentSamplerNodeId) {
        state.completedSteps += state.currentPhaseMax;
        if (!state.completedSamplerPhases.includes(state.currentSamplerNodeId)) {
          state.completedSamplerPhases.push(state.currentSamplerNodeId);
        }
      }
      state.currentSamplerNodeId = node;
      state.currentPhaseMax = max;
    } else if (node && max > state.currentPhaseMax) {
      // Update max if it increased (shouldn't happen normally, but be safe)
      state.currentPhaseMax = max;
    }

    // Calculate overall progress
    let overallPercent: number;
    let currentPhase = 1;
    let totalPhases = 1;

    if (wfInfo && wfInfo.samplerNodeIds.length > 1) {
      totalPhases = wfInfo.samplerNodeIds.length;
      currentPhase = state.completedSamplerPhases.length + 1;
      
      // Estimate total steps: assume each sampler phase has ~max steps
      // (they usually have the same step count, but may differ)
      const estimatedTotalSteps = max * totalPhases;
      const completedSteps = state.completedSteps + value;
      overallPercent = Math.round((completedSteps / estimatedTotalSteps) * 100);
    } else {
      overallPercent = Math.round((value / max) * 100);
    }

    const currentNodeName = wfInfo?.nodeTypes[node] || undefined;

    pending.onProgress({
      value,
      max,
      promptId: prompt_id,
      nodeId: node,
      overallPercent,
      currentPhase,
      totalPhases,
      currentNodeName,
      nodesExecuted: state.executedNodes.length,
      totalNodes: wfInfo?.totalNodes,
    });
  }
  
  private handleExecuting(data: any) {
    const { prompt_id, node } = data;
    
    console.log('[ComfyUI WS] Executing:', prompt_id, 'node:', node);
    
    // When node is null, execution is complete - this is the ONLY place we should trigger completion
    if (node === null) {
      console.log('[ComfyUI WS] Execution complete for:', prompt_id);
      // Trigger completion callback
      const pending = this.pendingPrompts.get(prompt_id);
      if (pending) {
        console.log('[ComfyUI WS] Calling onCompleted callback');
        pending.onCompleted(prompt_id, null);
        this.pendingPrompts.delete(prompt_id);
      } else {
        console.warn('[ComfyUI WS] No pending prompt found for completion:', prompt_id);
      }
    } else {
      // Track that this node started executing
      const pending = this.pendingPrompts.get(prompt_id);
      if (pending) {
        if (!pending.executionState.executedNodes.includes(node)) {
          pending.executionState.executedNodes.push(node);
        }
        // Send an executing progress update so the UI can show which node is running
        const wfInfo = pending.workflowInfo;
        const currentNodeName = wfInfo?.nodeTypes[node] || undefined;
        // Only send executing update if we have workflow info (for node name display)
        if (wfInfo) {
          pending.onProgress({
            value: 0,
            max: 1,
            promptId: prompt_id,
            nodeId: node,
            overallPercent: pending.executionState.completedSamplerPhases.length > 0
              ? Math.round((pending.executionState.completedSamplerPhases.length / wfInfo.samplerNodeIds.length) * 100)
              : undefined,
            currentPhase: pending.executionState.completedSamplerPhases.length + 1,
            totalPhases: wfInfo.samplerNodeIds.length,
            currentNodeName,
            nodesExecuted: pending.executionState.executedNodes.length,
            totalNodes: wfInfo.totalNodes,
          });
        }
      }
      console.log('[ComfyUI WS] Executing node:', node, 'for prompt:', prompt_id);
    }
  }
  
  private handleExecuted(data: any) {
    const { prompt_id, output, node } = data;
    
    // 'executed' fires for EACH node that produces output (e.g., SaveImage, Image Comparer)
    // We should NOT trigger completion here - wait for 'executing' with node=null
    console.log('[ComfyUI WS] Executed node:', node, 'for prompt:', prompt_id, 'output:', output);
    
    // Just log, don't trigger completion - that's handled by handleExecuting with node=null
  }
  
  private handleError(data: any) {
    const { prompt_id, exception_message, exception_type } = data;
    
    const pending = this.pendingPrompts.get(prompt_id);
    if (pending) {
      pending.onError(prompt_id, `${exception_type}: ${exception_message}`);
      this.pendingPrompts.delete(prompt_id);
    }
  }
  
  /**
   * Track a prompt for progress updates
   */
  trackPrompt(
    promptId: string,
    panelId: number,
    onProgress: ProgressCallback,
    onCompleted: CompletedCallback,
    onError: ErrorCallback,
    workflowInfo?: WorkflowProgressInfo
  ) {
    console.log('[ComfyUI WS] Tracking prompt:', promptId, 'for panel:', panelId, 'clientId:', this.clientId);
    if (workflowInfo) {
      console.log('[ComfyUI WS] Workflow info:', workflowInfo.totalNodes, 'nodes,', 
        workflowInfo.samplerNodeIds.length, 'sampler phases:', workflowInfo.samplerNodeIds);
    }
    this.pendingPrompts.set(promptId, {
      promptId,
      panelId,
      onProgress,
      onCompleted,
      onError,
      workflowInfo,
      executionState: {
        executedNodes: [],
        completedSamplerPhases: [],
        currentSamplerNodeId: null,
        completedSteps: 0,
        totalStepsEstimate: 0,
        currentPhaseMax: 0,
      },
    });
    console.log('[ComfyUI WS] Pending prompts after add:', Array.from(this.pendingPrompts.keys()));
  }
  
  /**
   * Stop tracking a prompt
   */
  untrackPrompt(promptId: string) {
    this.pendingPrompts.delete(promptId);
  }
  
  /**
   * Cancel/interrupt the current generation
   * Sends POST to /interrupt endpoint
   */
  async cancelGeneration(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/interrupt`, {
        method: 'POST',
      });
      if (response.ok) {
        console.log('[ComfyUI WS] Generation interrupted');
        return true;
      }
      console.error('[ComfyUI WS] Failed to interrupt:', response.statusText);
      return false;
    } catch (error) {
      console.error('[ComfyUI WS] Error interrupting generation:', error);
      return false;
    }
  }
  
  /**
   * Set a callback for all status updates
   */
  onStatus(callback: StatusCallback | null) {
    this.statusCallback = callback;
  }
  
  /**
   * Set a callback for KayTool metrics updates
   * Will automatically start the KayTool monitor if not already started
   */
  onKayToolMetrics(callback: KayToolMetricsCallback | null) {
    this.kayToolMetricsCallback = callback;
    
    // Start KayTool monitor if callback is set and not already started
    if (callback && !this.kayToolMonitorStarted) {
      this.startKayToolMonitor();
    }
  }
  
  /**
   * Start the KayTool resource monitor
   * Calls POST /kaytool/start_monitor to begin receiving metrics via WebSocket
   */
  async startKayToolMonitor(): Promise<void> {
    if (this.kayToolMonitorStarted) return;
    
    try {
      const response = await fetch(`${this.baseUrl}/kaytool/start_monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        this.kayToolMonitorStarted = true;
        console.log('[KayTool] Monitor started');
      } else {
        console.warn('[KayTool] Failed to start monitor:', response.status);
      }
    } catch (error) {
      console.warn('[KayTool] Monitor not available:', error);
    }
  }
  
  /**
   * Stop the KayTool resource monitor
   */
  async stopKayToolMonitor(): Promise<void> {
    if (!this.kayToolMonitorStarted) return;
    
    try {
      await fetch(`${this.baseUrl}/kaytool/stop_monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      this.kayToolMonitorStarted = false;
      console.log('[KayTool] Monitor stopped');
    } catch (error) {
      // Ignore errors when stopping
    }
  }
  
  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }
  
  /**
   * Get client ID
   */
  getClientId(): string {
    return this.clientId;
  }
}

// Singleton instance manager
const instances: Map<string, ComfyUIWebSocket> = new Map();

export function getComfyUIWebSocket(baseUrl: string, clientId?: string): ComfyUIWebSocket {
  const key = `${baseUrl}:${clientId || 'storyboard-ui'}`;
  
  if (!instances.has(key)) {
    instances.set(key, new ComfyUIWebSocket(baseUrl, clientId));
  }
  
  return instances.get(key)!;
}

/**
 * Disconnect and remove a specific WebSocket instance by its key.
 * Call this after a generation completes to free the connection.
 */
export function disconnectWebSocket(baseUrl: string, clientId?: string): void {
  const key = `${baseUrl}:${clientId || 'storyboard-ui'}`;
  const ws = instances.get(key);
  if (ws) {
    ws.disconnect();
    instances.delete(key);
  }
}

export function disconnectAllWebSockets() {
  instances.forEach(ws => ws.disconnect());
  instances.clear();
}
