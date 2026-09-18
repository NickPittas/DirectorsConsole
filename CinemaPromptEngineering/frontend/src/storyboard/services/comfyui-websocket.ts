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
  type: 'executing' | 'executed' | 'execution_start' | 'execution_cached' | 'execution_error' | 'execution_interrupted' | 'progress' | 'status' | 'kaytool.resources';
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

type CancellationOutcome = 'cancelled' | 'completed' | 'unconfirmed';

type CancellationEvent = {
  completed?: boolean;
  outputs?: any;
  interrupted?: boolean;
  error?: string;
};

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
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
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
  private connectPromise: Promise<void> | null = null;
  private connectReject: ((reason?: unknown) => void) | null = null;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private socketGeneration = 0;
  private reconciliationTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private reconciliationInFlight: Set<string> = new Set();
  private reconciliationState: Map<string, { missingChecks: number; failedRequests: number }> = new Map();
  private cancellationInFlight: Set<string> = new Set();
  private cancellationOperations: Map<string, Promise<boolean>> = new Map();
  private cancellationEvents: Map<string, CancellationEvent> = new Map();
  private awaitingHistoryCompletion: Set<string> = new Set();
  private readonly reconciliationIntervalMs = 1000;
  private readonly requestTimeoutMs = 2500;
  private readonly maxMissingChecks = 3;
  private readonly maxFailedRequests = 3;
  
  constructor(baseUrl: string, clientId: string = 'storyboard-ui') {
    // Convert http(s) to ws(s)
    this.baseUrl = baseUrl;
    this.url = baseUrl.replace(/^http/, 'ws') + '/ws?clientId=' + clientId;
    this.clientId = clientId;
  }
  
  connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    // Clear any pending reconnect when manually connecting.
    this.cancelReconnect();
    this.isIntentionallyClosed = false;
    const socketGeneration = ++this.socketGeneration;
    let socket: WebSocket;
    let settled = false;

    const promise = new Promise<void>((resolve, reject) => {
      const fail = (reason: unknown) => {
        if (settled) return;
        settled = true;
        if (this.connectTimeout !== null) clearTimeout(this.connectTimeout);
        this.connectTimeout = null;
        this.connectPromise = null;
        this.connectReject = null;
        reject(reason);
      };
      this.connectReject = fail;

      try {
        socket = new WebSocket(this.url);
        this.ws = socket;
      } catch (error) {
        fail(error);
        return;
      }

      const isCurrentSocket = () => this.ws === socket && this.socketGeneration === socketGeneration;
      this.connectTimeout = setTimeout(() => {
        if (!isCurrentSocket()) return;
        fail(new Error('ComfyUI WebSocket connection timed out; using HTTP recovery'));
        socket.close();
      }, 10000);

      socket.onopen = () => {
        if (!isCurrentSocket() || settled) return;
        settled = true;
        if (this.connectTimeout !== null) clearTimeout(this.connectTimeout);
        this.connectTimeout = null;
        this.connectPromise = null;
        this.connectReject = null;
        console.log('[ComfyUI WS] Connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconcileAllPrompts();
        resolve();
      };

      socket.onclose = (event) => {
        if (!isCurrentSocket()) return;
        console.log(`[ComfyUI WS] Disconnected (code: ${event.code}, reason: ${event.reason || 'none'})`);
        this.isConnected = false;
        this.ws = null;
        if (!settled) {
          fail(new Error(`ComfyUI WebSocket closed before connecting (code: ${event.code})`));
        }

        // Keep HTTP reconciliation alive while an unexpected socket failure is recovering.
        if (!this.isIntentionallyClosed) {
          this.reconcileAllPrompts();
          this.scheduleReconnect();
        }
      };

      socket.onerror = (error) => {
        if (!isCurrentSocket()) return;
        console.error('[ComfyUI WS] Error:', error);
        this.isConnected = false;
        if (!settled) fail(error);
      };

      socket.onmessage = (event) => {
        if (!isCurrentSocket()) return;
        // ComfyUI sends both JSON text messages and binary Blob data (preview images).
        if (typeof Blob !== 'undefined' && event.data instanceof Blob) return;

        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[ComfyUI WS] Failed to parse message:', error);
        }
      };
    });

    if (!settled) this.connectPromise = promise;
    return promise;
  }
  
  disconnect() {
    this.isIntentionallyClosed = true;
    this.cancelReconnect();
    this.socketGeneration++;

    const socket = this.ws;
    this.ws = null;
    if (socket) {
      socket.onopen = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.close();
    }
    if (this.connectReject) {
      const reject = this.connectReject;
      this.connectReject = null;
      this.connectPromise = null;
      reject(new Error('ComfyUI WebSocket disconnected'));
    }
    this.clearAllReconciliationTimers();
    for (const promptId of this.pendingPrompts.keys()) this.clearPromptTracking(promptId);
    this.isConnected = false;
    this.reconnectAttempts = 0;
  }
  
  private cancelReconnect() {
    if (this.reconnectTimeout !== null) {
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
    // Don't reconnect if already reconnecting or max attempts reached.
    if (this.reconnectTimeout !== null || this.connectPromise) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`[ComfyUI WS] Max reconnect attempts (${this.maxReconnectAttempts}) reached.`);
      // HTTP reconciliation remains authoritative for reachable long renders;
      // only prompts whose recovery requests are already failing are terminal.
      this.failUnreachablePrompts();
      return;
    }

    const delay = this.calculateReconnectDelay();
    this.reconnectAttempts++;
    console.log(`[ComfyUI WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect().catch((error) => {
        console.error('[ComfyUI WS] Reconnection failed:', error);
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
    
    // Notify status callback (but not for high-frequency monitoring events).
    // Cancellation owns this prompt until its HTTP result is known.
    const promptId = this.getPromptId(data);
    if (this.statusCallback && !this.isMonitoringEvent(type) &&
        !(promptId && this.cancellationInFlight.has(promptId))) {
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

      case 'execution_interrupted':
        this.handleInterrupted(data);
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

    if (this.cancellationInFlight.has(prompt_id)) return;
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

    if (this.cancellationInFlight.has(prompt_id)) {
      if (node === null) this.bufferCancellationEvent(prompt_id, { completed: true });
      return;
    }
    console.log('[ComfyUI WS] Executing:', prompt_id, 'node:', node);

    // When node is null, execution is complete. Cancellation and interruption are
    // handled first so a late null event cannot turn a cancelled render into success.
    if (node === null) {
      console.log('[ComfyUI WS] Execution complete for:', prompt_id);
      // Confirm history before reporting success. A late null can follow an
      // interruption/error event that was lost on the socket.
      if (!this.pendingPrompts.has(prompt_id)) return;
      this.awaitingHistoryCompletion.add(prompt_id);
      this.reconcilePromptImmediately(prompt_id);
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

    // 'executed' fires for EACH node that produces output. Completion remains
    // owned by executing(null) or HTTP history reconciliation.
    if (this.cancellationInFlight.has(prompt_id)) return;
    console.log('[ComfyUI WS] Executed node:', node, 'for prompt:', prompt_id, 'output:', output);
  }
  
  private handleError(data: any) {
    const { prompt_id, exception_message, exception_type } = data;
    const error = `${exception_type}: ${exception_message}`;

    if (this.cancellationInFlight.has(prompt_id)) {
      this.bufferCancellationEvent(prompt_id, { error });
      return;
    }
    this.finishError(prompt_id, error);
  }

  private handleInterrupted(data: any) {
    const promptId = this.getPromptId(data);
    if (!promptId) return;
    if (this.cancellationInFlight.has(promptId)) {
      this.bufferCancellationEvent(promptId, { interrupted: true });
      return;
    }
    this.finishError(promptId, 'Generation cancelled');
  }

  private getPromptId(data: any): string | undefined {
    const promptId = data?.prompt_id ?? data?.promptId;
    return typeof promptId === 'string' ? promptId : undefined;
  }

  private bufferCancellationEvent(
    promptId: string,
    event: CancellationEvent
  ) {
    this.cancellationEvents.set(promptId, {
      ...this.cancellationEvents.get(promptId),
      ...event,
    });
  }

  private finishCompleted(promptId: string, outputs: any) {
    const pending = this.pendingPrompts.get(promptId);
    if (!pending) return;
    this.clearPromptTracking(promptId);
    pending.onCompleted(promptId, outputs);
  }

  private finishError(promptId: string, error: string) {
    const pending = this.pendingPrompts.get(promptId);
    if (!pending) return;
    this.clearPromptTracking(promptId);
    pending.onError(promptId, error);
  }

  private clearPromptTracking(promptId: string) {
    this.pendingPrompts.delete(promptId);
    this.cancellationInFlight.delete(promptId);
    this.cancellationEvents.delete(promptId);
    this.awaitingHistoryCompletion.delete(promptId);
    this.reconciliationState.delete(promptId);
    const timer = this.reconciliationTimers.get(promptId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.reconciliationTimers.delete(promptId);
    }
  }

  private clearAllReconciliationTimers() {
    for (const timer of this.reconciliationTimers.values()) clearTimeout(timer);
    this.reconciliationTimers.clear();
  }

  private failUnreachablePrompts() {
    for (const promptId of Array.from(this.pendingPrompts.keys())) {
      const state = this.reconciliationState.get(promptId);
      if (state && state.failedRequests >= this.maxFailedRequests) {
        this.finishError(promptId, `Unable to reconnect to ComfyUI while recovering prompt ${promptId}; check its queue/history.`);
      }
    }
  }

  private reconcileAllPrompts() {
    if (this.isIntentionallyClosed) return;
    for (const promptId of this.pendingPrompts.keys()) {
      const timer = this.reconciliationTimers.get(promptId);
      if (timer !== undefined) clearTimeout(timer);
      this.reconciliationTimers.delete(promptId);
      this.reconciliationState.set(promptId, { missingChecks: 0, failedRequests: 0 });
      this.schedulePromptReconciliation(promptId, 0);
    }
  }

  private schedulePromptReconciliation(promptId: string, delay = this.reconciliationIntervalMs) {
    if (this.isIntentionallyClosed || !this.pendingPrompts.has(promptId) ||
        this.cancellationInFlight.has(promptId) || this.reconciliationTimers.has(promptId)) return;

    this.reconciliationTimers.set(promptId, setTimeout(() => {
      this.reconciliationTimers.delete(promptId);
      void this.reconcilePrompt(promptId);
    }, delay));
  }

  private reconcilePromptImmediately(promptId: string) {
    const timer = this.reconciliationTimers.get(promptId);
    if (timer !== undefined) clearTimeout(timer);
    this.reconciliationTimers.delete(promptId);
    void this.reconcilePrompt(promptId);
  }

  private async reconcilePrompt(promptId: string): Promise<void> {
    if (!this.pendingPrompts.has(promptId) || this.cancellationInFlight.has(promptId) ||
        this.isIntentionallyClosed) return;
    if (this.reconciliationInFlight.has(promptId)) {
      this.schedulePromptReconciliation(promptId);
      return;
    }

    this.reconciliationInFlight.add(promptId);
    try {
      const [history, queue] = await Promise.all([
        this.readHistory(promptId),
        this.readQueue(),
      ]);
      if (this.isIntentionallyClosed || !this.pendingPrompts.has(promptId) || this.cancellationInFlight.has(promptId)) return;

      const terminal = history.entry ? this.getHistoryTerminal(history.entry) : null;
      if (terminal?.kind === 'completed') {
        this.finishCompleted(promptId, history.entry.outputs ?? null);
        return;
      }
      if (terminal?.kind === 'interrupted') {
        this.finishError(promptId, 'Generation cancelled');
        return;
      }
      if (terminal?.kind === 'error') {
        this.finishError(promptId, terminal.error);
        return;
      }

      const state = this.reconciliationState.get(promptId) || { missingChecks: 0, failedRequests: 0 };
      this.reconciliationState.set(promptId, state);
      if (!history.reachable && !queue.reachable) {
        state.failedRequests++;
        if (state.failedRequests >= this.maxFailedRequests) {
          this.finishError(promptId, `Unable to reach ComfyUI while recovering prompt ${promptId} after ${state.failedRequests} attempts.`);
        } else {
          this.schedulePromptReconciliation(promptId);
        }
        return;
      }

      const queueStatus = queue.reachable ? this.getQueueStatus(queue.data, promptId) : 'absent';
      if (!history.reachable || !queue.reachable) {
        // A nonterminal history record is useful evidence that a render still
        // exists, even if the other endpoint is temporarily unavailable.
        if (history.entry || (queue.reachable && queueStatus !== 'absent')) {
          state.failedRequests = 0;
          this.schedulePromptReconciliation(promptId);
        } else {
          state.failedRequests++;
          if (state.failedRequests >= this.maxFailedRequests) {
            this.finishError(promptId, `Unable to reach ComfyUI while recovering prompt ${promptId} after ${state.failedRequests} attempts.`);
          } else {
            this.schedulePromptReconciliation(promptId);
          }
        }
        return;
      }

      state.failedRequests = 0;
      if (!history.entry && queueStatus === 'absent') {
        state.missingChecks++;
        if (state.missingChecks >= this.maxMissingChecks) {
          this.finishError(promptId, `Prompt ${promptId} is missing from ComfyUI history and queue after ${state.missingChecks} checks; verify that it was submitted to this node.`);
        } else {
          this.schedulePromptReconciliation(promptId);
        }
        return;
      }

      state.missingChecks = 0;
      // A successful queue check is enough while the socket is live. When it is
      // down, retain polling so a lost socket cannot leave a prompt hanging.
      if (queue.reachable && queueStatus !== 'absent' && this.isConnected &&
          !this.awaitingHistoryCompletion.has(promptId)) {
        return;
      }
      this.schedulePromptReconciliation(promptId);
    } finally {
      this.reconciliationInFlight.delete(promptId);
    }
  }

  private async readHistory(promptId: string): Promise<{ reachable: boolean; entry: any | null }> {
    try {
      const response = await this.fetchBounded(`${this.baseUrl}/history/${encodeURIComponent(promptId)}`);
      if (response.status === 404) return { reachable: true, entry: null };
      if (!response.ok) return { reachable: false, entry: null };
      const data = await response.json();
      const entry = data?.[promptId] ?? (data?.status ? data : null);
      return { reachable: true, entry: entry || null };
    } catch (error) {
      console.warn(`[ComfyUI WS] History reconciliation failed for ${promptId}:`, error);
      return { reachable: false, entry: null };
    }
  }

  private async readQueue(): Promise<{ reachable: boolean; data: any | null }> {
    try {
      const response = await this.fetchBounded(`${this.baseUrl}/queue`);
      if (!response.ok) return { reachable: false, data: null };
      return { reachable: true, data: await response.json() };
    } catch (error) {
      console.warn('[ComfyUI WS] Queue reconciliation failed:', error);
      return { reachable: false, data: null };
    }
  }

  private getHistoryTerminal(
    entry: any
  ): { kind: 'completed' } | { kind: 'interrupted' } | { kind: 'error'; error: string } | null {
    const status = entry?.status;
    if (!status) return null;
    const statusString = String(status.status_str || '').toLowerCase();
    if (Array.isArray(status.messages) && status.messages.some((message: any) =>
      Array.isArray(message) && message[0] === 'execution_interrupted')) {
      // Some ComfyUI versions leave completed=true on an interrupted record.
      return { kind: 'interrupted' };
    }
    // Error status must win over a stale completed flag.
    if (statusString === 'error' || statusString === 'failed' || statusString === 'failure' ||
        statusString === 'exception' || statusString === 'execution_error') {
      return { kind: 'error', error: this.historyError(status) };
    }
    if (status.completed === true || statusString === 'success' || statusString === 'completed') {
      return { kind: 'completed' };
    }
    return null;
  }

  private historyError(status: any): string {
    const messages = Array.isArray(status?.messages) ? status.messages : [];
    for (const message of messages) {
      const details = Array.isArray(message) ? message[1] : message;
      if (details?.exception_message) {
        return `${details.exception_type ? `${details.exception_type}: ` : ''}${details.exception_message}`;
      }
      if (typeof details === 'string' && details) return details;
    }
    return `ComfyUI reported an execution error (${status?.status_str || 'unknown'}).`;
  }

  private getQueueStatus(queue: any, promptId: string): 'running' | 'pending' | 'absent' {
    if (this.queueIncludes(queue?.queue_running, promptId)) return 'running';
    if (this.queueIncludes(queue?.queue_pending, promptId)) return 'pending';
    return 'absent';
  }

  private queueIncludes(entries: any, promptId: string): boolean {
    if (!Array.isArray(entries)) return false;
    return entries.some((entry: any) => {
      if (typeof entry === 'string') return entry === promptId;
      if (Array.isArray(entry)) return entry[1] === promptId;
      return entry?.prompt_id === promptId || entry?.promptId === promptId || entry?.id === promptId;
    });
  }

  private async fetchBounded(url: string, init: RequestInit = {}): Promise<Response> {
    // Keep the timeout active while callers consume the response body, too.
    return fetch(url, { ...init, signal: AbortSignal.timeout(this.requestTimeoutMs) });
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
    if (this.pendingPrompts.has(promptId)) this.clearPromptTracking(promptId);
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
    this.reconciliationState.set(promptId, { missingChecks: 0, failedRequests: 0 });
    // Tracking is deliberately independent of socket connection state.
    this.schedulePromptReconciliation(promptId, 0);
    console.log('[ComfyUI WS] Pending prompts after add:', Array.from(this.pendingPrompts.keys()));
  }
  
  /**
   * Stop tracking a prompt
   */
  untrackPrompt(promptId: string) {
    this.clearPromptTracking(promptId);
  }
  
  private async reconcileCancellation(
    promptId: string,
    allowQueuedRemoval: boolean,
    interruptIfRunning = false
  ): Promise<CancellationOutcome> {
    let sawRemovedQueueEntry = false;
    let sawActiveQueueEntry = false;
    for (let attempt = 0; attempt < this.maxMissingChecks; attempt++) {
      const [history, queue] = await Promise.all([
        this.readHistory(promptId),
        this.readQueue(),
      ]);
      const terminal = history.entry ? this.getHistoryTerminal(history.entry) : null;
      if (terminal?.kind === 'completed') {
        this.bufferCancellationEvent(promptId, {
          completed: true,
          outputs: history.entry.outputs ?? null,
        });
        return 'completed';
      }
      if (terminal?.kind === 'interrupted') {
        this.bufferCancellationEvent(promptId, { interrupted: true });
        return 'cancelled';
      }
      if (terminal?.kind === 'error') {
        this.bufferCancellationEvent(promptId, { error: terminal.error });
        return 'unconfirmed';
      }
      if (!history.reachable || !queue.reachable) continue;

      const queueStatus = this.getQueueStatus(queue.data, promptId);
      if (queueStatus === 'running' && interruptIfRunning) {
        try {
          const interrupt = await this.fetchBounded(`${this.baseUrl}/interrupt`, { method: 'POST' });
          if (!interrupt.ok) return 'unconfirmed';
          return this.reconcileCancellation(promptId, false);
        } catch (error) {
          console.error('[ComfyUI WS] Error interrupting promoted prompt:', error);
          return 'unconfirmed';
        }
      }
      if (queueStatus === 'absent' && !history.entry && !sawActiveQueueEntry) {
        sawRemovedQueueEntry = true;
      }
      if (queueStatus !== 'absent') {
        sawActiveQueueEntry = true;
        sawRemovedQueueEntry = false;
      }
    }

    // An empty queue proves removal only for a prompt that was known to be
    // queued. It cannot prove that a running prompt was interrupted.
    const hint = this.cancellationEvents.get(promptId);
    if (allowQueuedRemoval && sawRemovedQueueEntry && !sawActiveQueueEntry &&
        !hint?.completed && !hint?.interrupted) {
      return 'cancelled';
    }
    return 'unconfirmed';
  }

  private async performCancellation(promptId: string): Promise<CancellationOutcome> {
    // First establish that the prompt exists. Without this check a successful
    // /queue delete on an already-finished prompt would be reported as stopped.
    const before = await this.readQueue();
    if (!before.reachable) return 'unconfirmed';
    const stateBeforeDelete = this.getQueueStatus(before.data, promptId);
    if (stateBeforeDelete === 'absent') return 'unconfirmed';

    let response: Response;
    try {
      response = await this.fetchBounded(`${this.baseUrl}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete: [promptId] }),
      });
    } catch (error) {
      console.error('[ComfyUI WS] Error removing prompt from queue:', error);
      return 'unconfirmed';
    }
    if (!response.ok) {
      console.error('[ComfyUI WS] Failed to remove prompt from queue:', response.statusText);
      return 'unconfirmed';
    }

    const after = await this.readQueue();
    if (!after.reachable) return 'unconfirmed';
    const stateAfterDelete = this.getQueueStatus(after.data, promptId);
    if (stateAfterDelete === 'pending') return 'unconfirmed';
    if (stateAfterDelete === 'absent') {
      // A prompt that was already running may have completed or been
      // interrupted while /queue was in flight. Empty queue alone is not proof.
      return this.reconcileCancellation(
        promptId,
        stateBeforeDelete === 'pending',
        stateBeforeDelete === 'pending'
      );
    }

    // /interrupt is a legacy node-wide endpoint. Only call it after this exact
    // prompt was observed in queue_running. Legacy servers still have a race:
    // a different prompt can start between this inspection and the interrupt.
    const historyBeforeInterrupt = await this.readHistory(promptId);
    const terminalBeforeInterrupt = historyBeforeInterrupt.entry
      ? this.getHistoryTerminal(historyBeforeInterrupt.entry)
      : null;
    if (terminalBeforeInterrupt?.kind === 'completed') {
      this.bufferCancellationEvent(promptId, {
        completed: true,
        outputs: historyBeforeInterrupt.entry.outputs ?? null,
      });
      return 'completed';
    }
    if (terminalBeforeInterrupt?.kind === 'interrupted') {
      this.bufferCancellationEvent(promptId, { interrupted: true });
      return 'cancelled';
    }
    if (terminalBeforeInterrupt?.kind === 'error') {
      this.bufferCancellationEvent(promptId, { error: terminalBeforeInterrupt.error });
      return 'unconfirmed';
    }

    try {
      const interrupt = await this.fetchBounded(`${this.baseUrl}/interrupt`, { method: 'POST' });
      if (!interrupt.ok) {
        console.error('[ComfyUI WS] Failed to interrupt running prompt:', interrupt.statusText);
        return 'unconfirmed';
      }
      // A 200 only acknowledges receipt. History must confirm interruption;
      // execution events are hints used to avoid treating an empty queue as proof.
      return this.reconcileCancellation(promptId, false);
    } catch (error) {
      console.error('[ComfyUI WS] Error interrupting running prompt:', error);
      return 'unconfirmed';
    }
  }

  private resumeAfterCancellationFailure(promptId: string) {
    const pending = this.pendingPrompts.get(promptId);
    const event = this.cancellationEvents.get(promptId);
    this.cancellationEvents.delete(promptId);
    if (!pending) return;

    // These are only consumed after performCancellation verified the terminal
    // history record. Buffered execution events by themselves are hints.
    if (event?.completed && Object.prototype.hasOwnProperty.call(event, 'outputs')) {
      this.finishCompleted(promptId, event.outputs);
      return;
    }
    if (event?.error) {
      this.finishError(promptId, event.error);
      return;
    }

    this.reconciliationState.set(promptId, { missingChecks: 0, failedRequests: 0 });
    this.schedulePromptReconciliation(promptId, 0);
  }

  /**
   * Cancel one prompt. Queued prompts are removed from /queue; running prompts
   * use ComfyUI's legacy node-wide /interrupt only after an exact queue match.
   */
  async cancelGeneration(promptId: string): Promise<boolean> {
    const existing = this.cancellationOperations.get(promptId);
    if (existing) return existing;

    this.cancellationInFlight.add(promptId);
    const operation = (async () => {
      let outcome: CancellationOutcome = 'unconfirmed';
      try {
        outcome = await this.performCancellation(promptId);
      } catch (error) {
        console.error('[ComfyUI WS] Error cancelling generation:', error);
      }

      this.cancellationInFlight.delete(promptId);
      if (outcome === 'cancelled') {
        // Delete tracking before invoking the callback so late WS events cannot
        // deliver a second terminal result.
        this.finishError(promptId, 'Generation cancelled');
      } else {
        // Completion/error outcomes are resumed from verified history. Unknown
        // outcomes retain tracking and continue normal reconciliation.
        this.resumeAfterCancellationFailure(promptId);
      }
      return outcome === 'cancelled';
    })();
    this.cancellationOperations.set(promptId, operation);
    operation.finally(() => {
      if (this.cancellationOperations.get(promptId) === operation) {
        this.cancellationOperations.delete(promptId);
      }
    });
    return operation;
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
