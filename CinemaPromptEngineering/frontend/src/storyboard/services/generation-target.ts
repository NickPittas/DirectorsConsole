import { normalizeComfyUIUrl } from '../comfyui-client';

export type BrowserNodeStatus = 'connecting' | 'connected' | 'disconnected';
export type GenerationConnectionStatus = 'disconnected' | 'connecting' | 'connected';
export type GenerationNodeStatus = {
  id: string;
  url: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  name?: string;
  os?: 'windows' | 'linux' | 'darwin' | 'unknown';
};

export interface GenerationTargetContext {
  managedNodes: GenerationNodeStatus[];
  browserStatuses: Record<string, BrowserNodeStatus>;
  selectedBackendIds?: string[];
  panelNodeId?: string | null;
  connectionStatus: GenerationConnectionStatus;
}

export type GenerationTarget = {
  kind: 'managed' | 'none' | 'blocked';
  url?: string;
  node?: GenerationNodeStatus;
  reason?: string;
};

export function isUnassignedNodeId(nodeId?: string | null): boolean {
  const value = nodeId?.trim().toLowerCase();
  return !value || value === 'auto' || value === 'unassigned' || value === 'none' || value === 'default';
}

function isBrowserReachable(node: GenerationNodeStatus, browserStatuses: Record<string, BrowserNodeStatus>): boolean {
  return node.status === 'online' && browserStatuses[normalizeComfyUIUrl(node.url)] === 'connected';
}

function selectedNodes(context: GenerationTargetContext): { ids: string[]; nodes: GenerationNodeStatus[]; missing: boolean } {
  const ids = context.selectedBackendIds || [];
  const nodes = context.managedNodes.filter(node => ids.includes(node.id));
  return { ids, nodes, missing: ids.some(id => !context.managedNodes.some(node => node.id === id)) };
}

/** Resolve the exact ComfyUI URL used by editor, gating, and dispatch. */
export function resolveGenerationTarget(context: GenerationTargetContext): GenerationTarget {
  const selected = selectedNodes(context);
  if (selected.ids.length > 0) {
    if (selected.missing) return { kind: 'blocked', reason: 'A selected render node is missing. Check Manage Nodes.' };
    const unavailable = selected.nodes.find(node => node.status === 'busy');
    if (unavailable) return { kind: 'blocked', node: unavailable, reason: `${unavailable.name || 'Selected render node'} is busy. Wait for it to finish or choose another node.` };
    const unreachable = selected.nodes.find(node => !isBrowserReachable(node, context.browserStatuses));
    if (unreachable) {
      return {
        kind: 'blocked',
        node: unreachable,
        reason: `${unreachable.name || 'Selected render node'} is not reachable from this browser. Check Manage Nodes.`,
      };
    }
    return { kind: 'managed', node: selected.nodes[0], url: selected.nodes[0].url };
  }

  if (!isUnassignedNodeId(context.panelNodeId)) {
    const node = context.managedNodes.find(candidate => candidate.id === context.panelNodeId);
    if (!node) return { kind: 'blocked', reason: 'The panel render-node assignment is missing. Choose Auto or check Manage Nodes.' };
    if (node.status === 'busy') return { kind: 'blocked', node, reason: `${node.name || 'The panel render node'} is busy. Wait for it to finish or cancel the current generation.` };
    if (node.status !== 'online') return { kind: 'blocked', node, reason: `${node.name || 'The panel render node'} is ${node.status}. Choose Auto or check Manage Nodes.` };
    if (!isBrowserReachable(node, context.browserStatuses)) {
      return { kind: 'blocked', node, reason: `${node.name || 'The panel render node'} is not reachable from this browser. Check Manage Nodes.` };
    }
    return { kind: 'managed', node, url: node.url };
  }

  const autoNode = context.managedNodes.find(node => isBrowserReachable(node, context.browserStatuses));
  if (autoNode) return { kind: 'managed', node: autoNode, url: autoNode.url };

  if (context.managedNodes.length === 0) {
    return { kind: 'none', reason: 'No managed ComfyUI nodes configured. Add one in Manage Nodes.' };
  }
  if (context.connectionStatus === 'connecting') return { kind: 'none', reason: 'Checking managed ComfyUI browser connectivity…' };
  if (context.managedNodes.some(node => node.status === 'busy')) {
    return { kind: 'none', reason: 'All reachable render nodes are busy. Wait for a node or cancel the current generation.' };
  }
  if (context.managedNodes.some(node => node.status === 'online')) {
    return { kind: 'none', reason: 'No reachable managed ComfyUI node. Check Manage Nodes, network, CORS, or mixed-content policy.' };
  }
  return { kind: 'none', reason: 'No reachable managed ComfyUI node. Check Manage Nodes.' };
}

export function getGenerationDisabledReason(
  hasWorkflow: boolean,
  context: GenerationTargetContext,
): string | null {
  if (!hasWorkflow) return 'Select a workflow before generating.';
  return resolveGenerationTarget(context).reason || null;
}
