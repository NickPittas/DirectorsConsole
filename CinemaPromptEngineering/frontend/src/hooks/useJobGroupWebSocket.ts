/** React hook for managing job group WebSocket connections */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { JobGroupEvent, ChildJobStatus } from '@/types/jobGroup';
import { createJobGroupWebSocket } from '@/services/parallelGenerationService';

// =============================================================================
// Hook State Types
// =============================================================================

export interface UseJobGroupWebSocketState {
  /** Whether the WebSocket is currently connected */
  connected: boolean;
  /** Whether the connection is in progress */
  connecting: boolean;
  /** Connection error message if any */
  error: string | null;
  /** Collected events from the WebSocket */
  events: JobGroupEvent[];
  /** Current status of child jobs by ID */
  childJobStatuses: Map<string, ChildJobStatus>;
  /** Whether all jobs are complete */
  isComplete: boolean;
}

export interface UseJobGroupWebSocketReturn extends UseJobGroupWebSocketState {
  /** Manually connect to the WebSocket */
  connect: () => void;
  /** Manually disconnect from the WebSocket */
  disconnect: () => void;
  /** Send a ping to keep the connection alive */
  ping: () => void;
  /** Clear all collected events */
  clearEvents: () => void;
}

// =============================================================================
// Hook Options
// =============================================================================

export interface UseJobGroupWebSocketOptions {
  /** Auto-connect on mount if groupId is provided */
  autoConnect?: boolean;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Minimum reconnect delay in milliseconds (default: 1000) */
  minReconnectDelay?: number;
  /** Maximum reconnect delay in milliseconds (default: 30000) */
  maxReconnectDelay?: number;
  /** Maximum reconnection attempts (default: 20) */
  maxReconnectAttempts?: number;
  /** Callback for when connection opens */
  onConnect?: () => void;
  /** Callback for when connection closes */
  onDisconnect?: () => void;
  /** Callback for connection errors */
  onError?: (error: string) => void;
  /** Callback for all events */
  onEvent?: (event: JobGroupEvent) => void;
  /** Callback for child job progress */
  onChildProgress?: (jobId: string, progress: number) => void;
  /** Callback for child job completion */
  onChildCompleted?: (jobId: string, outputs: unknown) => void;
  /** Callback for child job failure */
  onChildFailed?: (jobId: string, error: string) => void;
  /** Callback for child job timeout */
  onChildTimeout?: (jobId: string, timeoutSeconds: number) => void;
  /** Callback for group completion */
  onGroupComplete?: (succeeded: number, failed: number, total: number) => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * React hook for managing a job group WebSocket connection
 *
 * @param groupId - Job group ID to connect to (null to disconnect)
 * @param options - Hook options and callbacks
 * @returns WebSocket state and control functions
 *
 * @example
 * ```tsx
 * function MyComponent({ jobGroupId }: { jobGroupId: string }) {
 *   const { connected, events, connect, disconnect } = useJobGroupWebSocket(
 *     jobGroupId,
 *     {
 *       autoConnect: true,
 *       onChildCompleted: (jobId, outputs) => {
 *         console.log('Job completed:', jobId, outputs);
 *       },
 *     }
 *   );
 *
 *   return (
 *     <div>
 *       {connected ? 'Connected' : 'Disconnected'}
 *       <button onClick={disconnect}>Disconnect</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useJobGroupWebSocket(
  groupId: string | null,
  options: UseJobGroupWebSocketOptions = {}
): UseJobGroupWebSocketReturn {
  const {
    autoConnect = true,
    autoReconnect = true,
    minReconnectDelay = 1000,
    maxReconnectDelay = 30000,
    maxReconnectAttempts = 20,
    onConnect,
    onDisconnect,
    onError,
    onEvent,
    onChildProgress,
    onChildCompleted,
    onChildFailed,
    onChildTimeout,
    onGroupComplete,
  } = options;

  // Calculate exponential backoff delay with jitter
  const calculateReconnectDelay = useCallback((attempt: number): number => {
    // Exponential backoff: min(maxDelay, minDelay * 2^attempt)
    const exponentialDelay = Math.min(
      maxReconnectDelay,
      minReconnectDelay * Math.pow(2, attempt)
    );
    // Add random jitter (±20%) to prevent thundering herd
    const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
    return Math.max(minReconnectDelay, exponentialDelay + jitter);
  }, [minReconnectDelay, maxReconnectDelay]);

  // State
  const [state, setState] = useState<UseJobGroupWebSocketState>({
    connected: false,
    connecting: false,
    error: null,
    events: [],
    childJobStatuses: new Map(),
    isComplete: false,
  });

  // Refs for mutable values that shouldn't trigger re-renders
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const groupIdRef = useRef(groupId);

  // Keep ref in sync
  useEffect(() => {
    groupIdRef.current = groupId;
  }, [groupId]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      window.clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      // Remove listeners before closing to prevent reconnection
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
  }, []);

  // Connect function
  const connect = useCallback(() => {
    const currentGroupId = groupIdRef.current;

    if (!currentGroupId) {
      setState((prev) => ({
        ...prev,
        error: 'No job group ID provided',
      }));
      return;
    }

    // Don't connect if already connected to same group
    if (
      wsRef.current?.readyState === WebSocket.OPEN &&
      reconnectAttemptsRef.current === 0
    ) {
      return;
    }

    // Clean up existing connection
    cleanup();

    setState((prev) => ({
      ...prev,
      connecting: true,
      error: null,
    }));

    // Create new WebSocket
    const ws = createJobGroupWebSocket(currentGroupId, {
      onConnect: () => {
        reconnectAttemptsRef.current = 0;
        setState((prev) => ({
          ...prev,
          connected: true,
          connecting: false,
          error: null,
        }));

        // Start ping interval
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 30000);

        onConnect?.();
      },

      onDisconnect: () => {
        setState((prev) => ({
          ...prev,
          connected: false,
          connecting: false,
        }));

        // Clear ping interval
        if (pingIntervalRef.current) {
          window.clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        onDisconnect?.();

        // Attempt reconnection if enabled and not complete
        if (
          autoReconnect &&
          reconnectAttemptsRef.current < maxReconnectAttempts &&
          !state.isComplete
        ) {
          const delay = calculateReconnectDelay(reconnectAttemptsRef.current);
          console.log(
            `[JobGroup WS] Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`
          );
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          console.warn('[JobGroup WS] Max reconnection attempts reached');
        }
      },

      onError: (_error) => {
        const errorMessage = 'WebSocket connection failed';
        setState((prev) => ({
          ...prev,
          error: errorMessage,
          connecting: false,
        }));
        onError?.(errorMessage);
      },

      onEvent: (event) => {
        setState((prev) => ({
          ...prev,
          events: [...prev.events, event],
        }));
        onEvent?.(event);
      },

      onChildProgress: (jobId, _, progress) => {
        setState((prev) => {
          const newStatuses = new Map(prev.childJobStatuses);
          newStatuses.set(jobId, 'running');
          return { ...prev, childJobStatuses: newStatuses };
        });
        onChildProgress?.(jobId, progress);
      },

      onChildCompleted: (jobId, _, outputs) => {
        setState((prev) => {
          const newStatuses = new Map(prev.childJobStatuses);
          newStatuses.set(jobId, 'completed');
          return { ...prev, childJobStatuses: newStatuses };
        });
        onChildCompleted?.(jobId, outputs);
      },

      onChildFailed: (jobId, _, error) => {
        setState((prev) => {
          const newStatuses = new Map(prev.childJobStatuses);
          newStatuses.set(jobId, 'failed');
          return { ...prev, childJobStatuses: newStatuses };
        });
        onChildFailed?.(jobId, error);
      },

      onChildTimeout: (jobId, _, timeoutSeconds) => {
        setState((prev) => {
          const newStatuses = new Map(prev.childJobStatuses);
          newStatuses.set(jobId, 'timeout');
          return { ...prev, childJobStatuses: newStatuses };
        });
        onChildTimeout?.(jobId, timeoutSeconds);
      },

      onGroupComplete: (succeeded, failed, total) => {
        setState((prev) => ({
          ...prev,
          isComplete: true,
        }));
        onGroupComplete?.(succeeded, failed, total);
      },
    });

    wsRef.current = ws;

    // Handle WebSocket close
    ws.onclose = () => {
      setState((prev) => ({
        ...prev,
        connected: false,
        connecting: false,
      }));

      // Trigger reconnection logic through onDisconnect callback
      // which is set up in createJobGroupWebSocket
    };
  }, [
    autoReconnect,
    cleanup,
    maxReconnectAttempts,
    calculateReconnectDelay,
    state.isComplete,
    onConnect,
    onDisconnect,
    onError,
    onEvent,
    onChildProgress,
    onChildCompleted,
    onChildFailed,
    onChildTimeout,
    onGroupComplete,
  ]);

  // Disconnect function
  const disconnect = useCallback(() => {
    cleanup();
    setState((prev) => ({
      ...prev,
      connected: false,
      connecting: false,
    }));
  }, [cleanup]);

  // Ping function
  const ping = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send('ping');
    }
  }, []);

  // Clear events function
  const clearEvents = useCallback(() => {
    setState((prev) => ({
      ...prev,
      events: [],
    }));
  }, []);

  // Auto-connect effect
  useEffect(() => {
    if (autoConnect && groupId) {
      connect();
    }

    return () => {
      cleanup();
    };
  }, [groupId, autoConnect, connect, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    ...state,
    connect,
    disconnect,
    ping,
    clearEvents,
  };
}

export default useJobGroupWebSocket;
