/**
 * AgentConversations — the Agent tab layout: two visible conversation panels
 * (Prompt Engineer and Director Console). Both consume the shared harness,
 * provider, model, and thinking selection from Agent Settings while their
 * sessions and histories stay isolated per surface and project.
 */

import type { AgentSurface } from '@/api/client';
import { AgentChatPanel } from './AgentChatPanel';
import './agent.css';

const PANELS: Exclude<AgentSurface, 'prompt-enhancement'>[] = ['prompt-engineer', 'console'];

export function AgentConversations() {
  return (
    <div className="agent-conversations">
      {PANELS.map(surface => (
        <AgentChatPanel key={surface} surface={surface} />
      ))}
    </div>
  );
}
