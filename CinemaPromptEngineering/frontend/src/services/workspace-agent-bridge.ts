import {
  connectWorkspaceApplicationBridge,
  getAgentGatewaySnapshot,
  subscribeAgentGateway,
} from './agent-gateway-client';
import type { WorkspaceActionResult, WorkspaceCommandMessage } from './workspace-agent-contracts';

export function mountWorkspaceApplicationBridge(
  handleCommand: (message: WorkspaceCommandMessage, signal: AbortSignal) => Promise<WorkspaceActionResult>,
): () => void {
  let activeBridge = '';
  let controller: AbortController | null = null;
  let closed = false;

  const sync = () => {
    const gateway = getAgentGatewaySnapshot();
    const bridge = gateway.status === 'ready' ? gateway.bridgeId || '' : '';
    if (bridge === activeBridge) return;
    controller?.abort();
    controller = null;
    activeBridge = bridge;
    if (!bridge || closed) return;
    const active = new AbortController();
    controller = active;
    void (async () => {
      while (!closed && !active.signal.aborted && activeBridge === bridge) {
        try {
          await connectWorkspaceApplicationBridge((message, commandSignal) => handleCommand(message, commandSignal), active.signal);
        } catch {
          if (active.signal.aborted || closed) break;
        }
        if (active.signal.aborted || closed || activeBridge !== bridge) break;
        await new Promise<void>(resolve => {
          const finish = () => {
            window.clearTimeout(timer);
            active.signal.removeEventListener('abort', finish);
            resolve();
          };
          const timer = window.setTimeout(finish, 1500);
          active.signal.addEventListener('abort', finish, { once: true });
          if (active.signal.aborted) finish();
        });
      }
    })();
  };
  const unsubscribe = subscribeAgentGateway(sync);
  sync();
  return () => {
    closed = true;
    activeBridge = '';
    controller?.abort();
    unsubscribe();
  };
}
