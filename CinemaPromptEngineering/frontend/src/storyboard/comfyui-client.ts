/**
 * ComfyUI Client - TypeScript port from StoryboardUI's comfyui_client.py
 * 
 * Handles communication with ComfyUI server for workflow submission and progress polling.
 * Connects through the Orchestrator API when available, or directly to ComfyUI.
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ComfyUIConfig {
  serverUrl: string;
  timeout?: number;
  maxRetries?: number;
  useOrchestrator?: boolean;
  orchestratorUrl?: string;
}

export interface GenerationProgress {
  promptId: string;
  node: string;
  value: number;
  max: number;
  status: 'queued' | 'processing' | 'complete' | 'error';
  preview?: string;
}

export interface GenerationResult {
  promptId: string;
  success: boolean;
  images: GeneratedImage[];
  error?: string;
  executionTime?: number;
}

export interface GeneratedImage {
  filename: string;
  subfolder: string;
  type: string;
  url: string;
}

export interface SystemStats {
  cpuPercent: number;
  ramPercent: number;
  gpuMemoryUsed: number;
  gpuMemoryTotal: number;
  gpuUtilization: number;
  queueRemaining: number;
}

export interface ComfyUINode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
}

export type ComfyUIWorkflow = Record<string, ComfyUINode>;

// ============================================================================
// Errors
// ============================================================================

export class ComfyUIError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'ComfyUIError';
  }
}

export class ComfyUIConnectionError extends ComfyUIError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'ComfyUIConnectionError';
  }
}

export class ComfyUITimeoutError extends ComfyUIError {
  constructor(message: string) {
    super(message, 'TIMEOUT');
    this.name = 'ComfyUITimeoutError';
  }
}

export class ComfyUIWorkflowError extends ComfyUIError {
  constructor(message: string, public nodeId?: string, public nodeType?: string) {
    super(message, 'WORKFLOW_ERROR');
    this.name = 'ComfyUIWorkflowError';
  }
}

// ============================================================================
// ComfyUI Client Class
// ============================================================================

export class ComfyUIClient {
  private serverUrl: string;
  private timeout: number;
  private maxRetries: number;
  private useOrchestrator: boolean;
  private orchestratorUrl: string;
  private clientId: string;
  private ws: WebSocket | null = null;
  private wsListeners: Map<string, Set<(data: GenerationProgress) => void>> = new Map();
  
  // WebSocket reconnection with exponential backoff
  private wsReconnectAttempts = 0;
  private readonly wsMaxReconnectAttempts = 20;
  private readonly wsMinReconnectDelay = 1000; // 1 second
  private readonly wsMaxReconnectDelay = 30000; // 30 seconds
  private wsReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private wsIntentionallyClosed = false;

  constructor(config: ComfyUIConfig) {
    this.serverUrl = config.serverUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 300000; // 5 minutes default
    this.maxRetries = config.maxRetries ?? 3;
    this.useOrchestrator = config.useOrchestrator ?? false;
    this.orchestratorUrl = config.orchestratorUrl ?? 'http://localhost:9820';
    this.clientId = this.generateClientId();
  }

  private generateClientId(): string {
    return 'dc_' + Math.random().toString(36).substring(2, 15);
  }

  // --------------------------------------------------------------------------
  // Connection Management
  // --------------------------------------------------------------------------

  async checkAvailable(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.serverUrl}/system_stats`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getSystemStats(): Promise<SystemStats> {
    const response = await this.fetchWithTimeout(`${this.serverUrl}/system_stats`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new ComfyUIConnectionError(`Failed to get system stats: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Parse ComfyUI system stats format
    const devices = data.devices || [];
    const gpu = devices[0] || {};
    
    return {
      cpuPercent: data.cpu_percent ?? 0,
      ramPercent: (data.ram?.used ?? 0) / (data.ram?.total ?? 1) * 100,
      gpuMemoryUsed: gpu.vram_used ?? 0,
      gpuMemoryTotal: gpu.vram_total ?? 0,
      gpuUtilization: gpu.gpu_utilization ?? 0,
      queueRemaining: data.execInfo?.queue_remaining ?? 0,
    };
  }

  // --------------------------------------------------------------------------
  // Workflow Submission
  // --------------------------------------------------------------------------

  async submitWorkflow(workflow: ComfyUIWorkflow): Promise<string> {
    if (this.useOrchestrator) {
      return this.submitViaOrchestrator(workflow);
    }
    return this.submitDirect(workflow);
  }

  private async submitDirect(workflow: ComfyUIWorkflow): Promise<string> {
    const payload = {
      prompt: workflow,
      client_id: this.clientId,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(`${this.serverUrl}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error?.message || response.statusText;
          
          if (errorData.node_errors) {
            const nodeId = Object.keys(errorData.node_errors)[0];
            const nodeError = errorData.node_errors[nodeId];
            throw new ComfyUIWorkflowError(
              `Workflow error in node ${nodeId}: ${nodeError.class_type} - ${nodeError.errors?.[0]?.message || 'Unknown error'}`,
              nodeId,
              nodeError.class_type
            );
          }
          
          throw new ComfyUIError(`Failed to submit workflow: ${errorMsg}`);
        }

        const data = await response.json();
        return data.prompt_id;

      } catch (error) {
        lastError = error as Error;
        if (error instanceof ComfyUIWorkflowError) {
          throw error; // Don't retry workflow errors
        }
        if (attempt < this.maxRetries - 1) {
          await this.delay(1000 * (attempt + 1)); // Exponential backoff
        }
      }
    }

    throw lastError || new ComfyUIError('Failed to submit workflow after retries');
  }

  private async submitViaOrchestrator(workflow: ComfyUIWorkflow): Promise<string> {
    const response = await this.fetchWithTimeout(`${this.orchestratorUrl}/api/job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow,
        source: 'directors-console',
        client_id: this.clientId,
      }),
    });

    if (!response.ok) {
      throw new ComfyUIError(`Orchestrator error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.job_id || data.prompt_id;
  }

  // --------------------------------------------------------------------------
  // Progress Polling
  // --------------------------------------------------------------------------

  async pollProgress(promptId: string): Promise<GenerationProgress> {
    const response = await this.fetchWithTimeout(`${this.serverUrl}/history/${promptId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          promptId,
          node: '',
          value: 0,
          max: 100,
          status: 'queued',
        };
      }
      throw new ComfyUIError(`Failed to get progress: ${response.statusText}`);
    }

    const data = await response.json();
    const history = data[promptId];

    if (!history) {
      return {
        promptId,
        node: '',
        value: 0,
        max: 100,
        status: 'queued',
      };
    }

    if (history.status?.completed) {
      return {
        promptId,
        node: '',
        value: 100,
        max: 100,
        status: 'complete',
      };
    }

    if (history.status?.status_str === 'error') {
      return {
        promptId,
        node: '',
        value: 0,
        max: 100,
        status: 'error',
      };
    }

    return {
      promptId,
      node: history.status?.current_node || '',
      value: history.status?.progress || 0,
      max: 100,
      status: 'processing',
    };
  }

  // --------------------------------------------------------------------------
  // Results
  // --------------------------------------------------------------------------

  async getResult(promptId: string): Promise<GenerationResult> {
    const response = await this.fetchWithTimeout(`${this.serverUrl}/history/${promptId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new ComfyUIError(`Failed to get result: ${response.statusText}`);
    }

    const data = await response.json();
    const history = data[promptId];

    if (!history) {
      throw new ComfyUIError(`No history found for prompt ${promptId}`);
    }

    if (history.status?.status_str === 'error') {
      return {
        promptId,
        success: false,
        images: [],
        error: history.status?.error || 'Unknown error',
      };
    }

    // Extract output images from all nodes
    const images: GeneratedImage[] = [];
    const outputs = history.outputs || {};

    for (const nodeId of Object.keys(outputs)) {
      const nodeOutput = outputs[nodeId];
      if (nodeOutput.images) {
        for (const img of nodeOutput.images) {
          images.push({
            filename: img.filename,
            subfolder: img.subfolder || '',
            type: img.type || 'output',
            url: `${this.serverUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`,
          });
        }
      }
    }

    return {
      promptId,
      success: true,
      images,
      executionTime: history.status?.execution_time,
    };
  }

  // --------------------------------------------------------------------------
  // Image Upload
  // --------------------------------------------------------------------------

  async uploadImage(file: File | Blob, filename?: string): Promise<string> {
    const formData = new FormData();
    formData.append('image', file, filename || 'upload.png');
    formData.append('overwrite', 'true');

    const response = await this.fetchWithTimeout(`${this.serverUrl}/upload/image`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new ComfyUIError(`Failed to upload image: ${response.statusText}`);
    }

    const data = await response.json();
    return data.name;
  }

  // --------------------------------------------------------------------------
  // WebSocket Connection for Real-time Progress
  // --------------------------------------------------------------------------

  connectWebSocket(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    // Clear any pending reconnect
    if (this.wsReconnectTimeout) {
      clearTimeout(this.wsReconnectTimeout);
      this.wsReconnectTimeout = null;
    }

    this.wsIntentionallyClosed = false;
    const wsUrl = this.serverUrl.replace(/^http/, 'ws') + `/ws?clientId=${this.clientId}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[ComfyUI WS] Connected');
      // Reset reconnection attempts on successful connection
      this.wsReconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleWebSocketMessage(message);
      } catch {
        console.warn('Failed to parse WebSocket message:', event.data);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      // Schedule reconnect with exponential backoff if not intentionally closed
      if (!this.wsIntentionallyClosed) {
        this.scheduleReconnect();
      }
    };
  }

  private calculateWsReconnectDelay(): number {
    // Exponential backoff: min(maxDelay, minDelay * 2^attempt)
    const exponentialDelay = Math.min(
      this.wsMaxReconnectDelay,
      this.wsMinReconnectDelay * Math.pow(2, this.wsReconnectAttempts)
    );
    // Add random jitter (±20%) to prevent thundering herd
    const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
    return Math.max(this.wsMinReconnectDelay, exponentialDelay + jitter);
  }

  private scheduleReconnect(): void {
    if (this.wsReconnectAttempts >= this.wsMaxReconnectAttempts) {
      console.warn('[ComfyUI WS] Max reconnection attempts reached');
      return;
    }

    const delay = this.calculateWsReconnectDelay();
    console.log(
      `[ComfyUI WS] Reconnecting in ${Math.round(delay)}ms (attempt ${this.wsReconnectAttempts + 1}/${this.wsMaxReconnectAttempts})`
    );
    this.wsReconnectAttempts++;

    this.wsReconnectTimeout = setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  private handleWebSocketMessage(message: Record<string, unknown>): void {
    const type = message.type as string;
    const data = message.data as Record<string, unknown>;

    if (type === 'progress') {
      const progress: GenerationProgress = {
        promptId: data.prompt_id as string,
        node: data.node as string,
        value: data.value as number,
        max: data.max as number,
        status: 'processing',
      };

      // Notify all listeners for this prompt
      const listeners = this.wsListeners.get(progress.promptId);
      if (listeners) {
        listeners.forEach((callback) => callback(progress));
      }
    }

    if (type === 'executed') {
      const progress: GenerationProgress = {
        promptId: data.prompt_id as string,
        node: data.node as string,
        value: 100,
        max: 100,
        status: 'complete',
      };

      const listeners = this.wsListeners.get(progress.promptId);
      if (listeners) {
        listeners.forEach((callback) => callback(progress));
      }
    }

    if (type === 'execution_error') {
      const progress: GenerationProgress = {
        promptId: data.prompt_id as string,
        node: data.node as string || '',
        value: 0,
        max: 100,
        status: 'error',
      };

      const listeners = this.wsListeners.get(progress.promptId);
      if (listeners) {
        listeners.forEach((callback) => callback(progress));
      }
    }
  }

  subscribeToProgress(promptId: string, callback: (progress: GenerationProgress) => void): () => void {
    if (!this.wsListeners.has(promptId)) {
      this.wsListeners.set(promptId, new Set());
    }
    this.wsListeners.get(promptId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.wsListeners.get(promptId);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.wsListeners.delete(promptId);
        }
      }
    };
  }

  disconnectWebSocket(): void {
    this.wsIntentionallyClosed = true;
    if (this.wsReconnectTimeout) {
      clearTimeout(this.wsReconnectTimeout);
      this.wsReconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.wsReconnectAttempts = 0;
  }

  /** Reset reconnection attempts (call after manual reconnect) */
  resetWsReconnectAttempts(): void {
    this.wsReconnectAttempts = 0;
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw new ComfyUITimeoutError(`Request timed out after ${this.timeout}ms`);
      }
      throw new ComfyUIConnectionError(`Connection failed: ${(error as Error).message}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------

  getClientId(): string {
    return this.clientId;
  }

  getServerUrl(): string {
    return this.serverUrl;
  }
}

// ============================================================================
// Default Export & Factory
// ============================================================================

export function createComfyUIClient(config: Partial<ComfyUIConfig> = {}): ComfyUIClient {
  return new ComfyUIClient({
    serverUrl: config.serverUrl ?? 'http://localhost:8188',
    timeout: config.timeout,
    maxRetries: config.maxRetries,
    useOrchestrator: config.useOrchestrator,
    orchestratorUrl: config.orchestratorUrl,
  });
}

export default ComfyUIClient;
