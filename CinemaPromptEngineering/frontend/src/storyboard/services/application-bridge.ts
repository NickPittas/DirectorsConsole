import {
  connectAgentApplicationBridge,
  getAgentGatewaySnapshot,
  subscribeAgentGateway,
} from '../../services/agent-gateway-client';
import type { ApplicationBridgeMessage, ApplicationResult } from '../actions/application-actions';

const RECONNECT_DELAY_MS = 1500;

function waitForReconnect(signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const finish = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, RECONNECT_DELAY_MS);
    signal.addEventListener('abort', finish, { once: true });
  });
}

/** Connects only while this mounted Storyboard matches its explicitly paired project. */
export function mountStoryboardApplicationBridge(
  getProjectIdentity: () => string,
  subscribeProject: (listener: () => void) => () => void,
  handleCommand: (message: ApplicationBridgeMessage) => Promise<ApplicationResult>,
): () => void {
  let activeKey = '';
  let activeController: AbortController | null = null;
  let closed = false;

  const sync = () => {
    const gateway = getAgentGatewaySnapshot();
    const projectIdentity = getProjectIdentity();
    const nextKey = gateway.status === 'ready' && gateway.bridgeId
      && gateway.projectIdentity === projectIdentity
      ? `${gateway.bridgeId}:${projectIdentity}`
      : '';
    if (nextKey === activeKey) return;
    activeController?.abort();
    activeController = null;
    activeKey = nextKey;
    if (!nextKey || closed) return;

    const controller = new AbortController();
    activeController = controller;
    void (async () => {
      while (!controller.signal.aborted && !closed && activeKey === nextKey) {
        try {
          await connectAgentApplicationBridge(projectIdentity, handleCommand, controller.signal);
        } catch {
          if (controller.signal.aborted || closed || activeKey !== nextKey) break;
        }
        if (controller.signal.aborted || closed || activeKey !== nextKey) break;
        await waitForReconnect(controller.signal);
      }
    })();
  };

  const unsubscribeGateway = subscribeAgentGateway(sync);
  const unsubscribeProject = subscribeProject(sync);
  sync();

  return () => {
    closed = true;
    activeKey = '';
    activeController?.abort();
    activeController = null;
    unsubscribeGateway();
    unsubscribeProject();
  };
}
