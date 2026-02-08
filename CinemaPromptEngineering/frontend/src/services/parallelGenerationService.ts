/** API service for parallel generation job groups */

import type {
  JobGroupRequest,
  JobGroupResponse,
  JobGroupStatusResponse,
  JobGroupEvent,
} from '@/types/jobGroup';

// =============================================================================
// Configuration
// =============================================================================

const ORCHESTRATOR_URL =
  import.meta.env.VITE_ORCHESTRATOR_URL || 'http://localhost:9820';

// =============================================================================
// HTTP API Functions
// =============================================================================

/**
 * Submit a new job group for parallel generation
 * @param request - Job group submission request
 * @returns Job group response with ID and child job status
 */
export async function submitJobGroup(
  request: JobGroupRequest
): Promise<JobGroupResponse> {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/job-group`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to submit job group: ${error}`);
  }

  return response.json();
}

/**
 * Get the current status of a job group
 * @param groupId - Job group ID
 * @returns Full job group status with child jobs
 */
export async function getJobGroupStatus(
  groupId: string
): Promise<JobGroupStatusResponse> {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/job-groups/${groupId}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Job group ${groupId} not found`);
    }
    const error = await response.text();
    throw new Error(`Failed to get job group status: ${error}`);
  }

  return response.json();
}

/**
 * Cancel an active job group
 * @param groupId - Job group ID to cancel
 */
export async function cancelJobGroup(groupId: string): Promise<void> {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/job-groups/${groupId}`, {
    method: 'DELETE',
  });

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Failed to cancel job group: ${error}`);
  }
}

// =============================================================================
// WebSocket Handlers
// =============================================================================

/** Callback handlers for WebSocket events */
export interface WebSocketHandlers {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  onEvent?: (event: JobGroupEvent) => void;
  onChildProgress?: (
    jobId: string,
    backendId: string,
    progress: number
  ) => void;
  onChildCompleted?: (jobId: string, backendId: string, outputs: unknown) => void;
  onChildFailed?: (jobId: string, backendId: string, error: string) => void;
  onChildTimeout?: (jobId: string, backendId: string, timeoutSeconds: number) => void;
  onGroupComplete?: (succeeded: number, failed: number, total: number) => void;
}

/**
 * Create a WebSocket connection for job group events
 * @param groupId - Job group ID to connect to
 * @param handlers - Event handlers
 * @returns WebSocket instance (already connected)
 */
export function createJobGroupWebSocket(
  groupId: string,
  handlers: WebSocketHandlers = {}
): WebSocket {
  const wsUrl = ORCHESTRATOR_URL.replace(/^http/, 'ws');
  const ws = new WebSocket(`${wsUrl}/ws/job-groups/${groupId}`);

  ws.onopen = () => {
    console.log(`[JobGroup WS] Connected to ${groupId}`);
    handlers.onConnect?.();
  };

  ws.onclose = () => {
    console.log(`[JobGroup WS] Disconnected from ${groupId}`);
    handlers.onDisconnect?.();
  };

  ws.onerror = (error) => {
    console.error(`[JobGroup WS] Error:`, error);
    handlers.onError?.(error);
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as JobGroupEvent;
      handlers.onEvent?.(message);

      switch (message.type) {
        case 'child_progress':
          handlers.onChildProgress?.(
            message.job_id,
            message.backend_id,
            message.progress
          );
          break;

        case 'child_completed':
          handlers.onChildCompleted?.(
            message.job_id,
            message.backend_id,
            message.outputs
          );
          break;

        case 'child_failed':
          handlers.onChildFailed?.(
            message.job_id,
            message.backend_id,
            message.error
          );
          break;

        case 'child_timeout':
          handlers.onChildTimeout?.(
            message.job_id,
            message.backend_id,
            message.timeout_seconds
          );
          break;

        case 'group_complete':
          handlers.onGroupComplete?.(
            message.succeeded,
            message.failed,
            message.total
          );
          break;

        case 'pong':
          // Keepalive response - no action needed
          break;

        case 'initial_state':
          // Initial state received - no action needed here
          break;

        default:
          // Unknown event type
          console.warn('[JobGroup WS] Unknown event type:', message);
      }
    } catch (e) {
      console.error('[JobGroup WS] Failed to parse message:', e);
    }
  };

  return ws;
}

// =============================================================================
// Service Class (for complex use cases)
// =============================================================================

export class ParallelGenerationService {
  private activeWebSockets: Map<string, WebSocket> = new Map();
  private pingIntervals: Map<string, number> = new Map();
  private reconnectTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private savedHandlers: Map<string, WebSocketHandlers> = new Map();
  private intentionallyClosed: Set<string> = new Set();
  
  // Exponential backoff configuration
  private readonly maxReconnectAttempts = 20;
  private readonly minReconnectDelay = 1000; // 1 second
  private readonly maxReconnectDelay = 30000; // 30 seconds

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateReconnectDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.maxReconnectDelay,
      this.minReconnectDelay * Math.pow(2, attempt)
    );
    // Add random jitter (±20%) to prevent thundering herd
    const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
    return Math.max(this.minReconnectDelay, exponentialDelay + jitter);
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(groupId: string): void {
    // Don't reconnect if intentionally closed
    if (this.intentionallyClosed.has(groupId)) {
      return;
    }

    const attempts = this.reconnectAttempts.get(groupId) || 0;
    if (attempts >= this.maxReconnectAttempts) {
      console.warn(`[ParallelGen WS] Max reconnection attempts reached for ${groupId}`);
      return;
    }

    const delay = this.calculateReconnectDelay(attempts);
    console.log(
      `[ParallelGen WS] Reconnecting ${groupId} in ${Math.round(delay)}ms (attempt ${attempts + 1}/${this.maxReconnectAttempts})`
    );
    
    this.reconnectAttempts.set(groupId, attempts + 1);
    
    const timeout = setTimeout(() => {
      this.reconnectTimeouts.delete(groupId);
      const handlers = this.savedHandlers.get(groupId);
      if (handlers && !this.intentionallyClosed.has(groupId)) {
        this.connectToGroup(groupId, handlers);
      }
    }, delay);
    
    this.reconnectTimeouts.set(groupId, timeout);
  }

  /**
   * Submit a job group and begin listening for events
   * @param request - Job group request
   * @param panelId - Associated panel ID
   * @param handlers - Event handlers
   * @returns Job group response
   */
  async submitAndListen(
    request: JobGroupRequest,
    panelId: string,
    handlers: WebSocketHandlers = {}
  ): Promise<JobGroupResponse> {
    // Add panel_id to metadata
    const requestWithMetadata = {
      ...request,
      metadata: {
        ...request.metadata,
        panel_id: panelId,
      },
    };

    // Submit job group
    const response = await submitJobGroup(requestWithMetadata);

    // Connect WebSocket
    this.connectToGroup(response.job_group_id, handlers);

    return response;
  }

  /**
   * Connect to a job group WebSocket
   * @param groupId - Job group ID
   * @param handlers - Event handlers
   */
  connectToGroup(groupId: string, handlers: WebSocketHandlers = {}): WebSocket {
    // Close existing connection if any
    this.disconnectFromGroup(groupId);

    // Clear intentionally closed flag and save handlers for reconnection
    this.intentionallyClosed.delete(groupId);
    this.savedHandlers.set(groupId, handlers);

    const ws = createJobGroupWebSocket(groupId, {
      ...handlers,
      onConnect: () => {
        // Reset reconnection attempts on successful connection
        this.reconnectAttempts.set(groupId, 0);
        // Start ping interval
        const pingInterval = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 30000); // Ping every 30 seconds
        this.pingIntervals.set(groupId, pingInterval);
        handlers.onConnect?.();
      },
      onDisconnect: () => {
        this.cleanup(groupId);
        handlers.onDisconnect?.();
        // Schedule reconnection with exponential backoff
        this.scheduleReconnect(groupId);
      },
      onError: (error) => {
        handlers.onError?.(error);
      },
    });

    this.activeWebSockets.set(groupId, ws);
    return ws;
  }

  /**
   * Disconnect from a job group WebSocket
   * @param groupId - Job group ID
   */
  disconnectFromGroup(groupId: string): void {
    // Mark as intentionally closed to prevent auto-reconnect
    this.intentionallyClosed.add(groupId);
    
    // Cancel any pending reconnection
    const reconnectTimeout = this.reconnectTimeouts.get(groupId);
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      this.reconnectTimeouts.delete(groupId);
    }
    
    const ws = this.activeWebSockets.get(groupId);
    if (ws) {
      ws.close();
      this.cleanup(groupId);
    }
  }

  /**
   * Cancel a job group and disconnect
   * @param groupId - Job group ID
   */
  async cancelAndDisconnect(groupId: string): Promise<void> {
    this.disconnectFromGroup(groupId);
    await cancelJobGroup(groupId);
  }

  /**
   * Check if connected to a job group
   * @param groupId - Job group ID
   */
  isConnected(groupId: string): boolean {
    const ws = this.activeWebSockets.get(groupId);
    return ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Clean up resources for a job group
   */
  private cleanup(groupId: string): void {
    this.activeWebSockets.delete(groupId);
    const pingInterval = this.pingIntervals.get(groupId);
    if (pingInterval) {
      window.clearInterval(pingInterval);
      this.pingIntervals.delete(groupId);
    }
    // Note: Don't clear savedHandlers or reconnectAttempts here - needed for reconnection
  }

  /**
   * Full cleanup including reconnection state
   */
  private fullCleanup(groupId: string): void {
    this.cleanup(groupId);
    this.savedHandlers.delete(groupId);
    this.reconnectAttempts.delete(groupId);
    this.intentionallyClosed.delete(groupId);
    
    const reconnectTimeout = this.reconnectTimeouts.get(groupId);
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      this.reconnectTimeouts.delete(groupId);
    }
  }

  /**
   * Disconnect all active WebSockets
   */
  disconnectAll(): void {
    for (const [groupId, ws] of this.activeWebSockets.entries()) {
      this.intentionallyClosed.add(groupId);
      ws.close();
      this.fullCleanup(groupId);
    }
  }

  /**
   * Reset reconnection attempts for a group (call after manual reconnect)
   */
  resetReconnectAttempts(groupId: string): void {
    this.reconnectAttempts.set(groupId, 0);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const parallelGenerationService = new ParallelGenerationService();
