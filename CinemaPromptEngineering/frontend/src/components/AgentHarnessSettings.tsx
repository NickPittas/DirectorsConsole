import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AgentSelection } from '@/api/client';
import { CodexLoginControls } from './CodexLoginControls';
import {
  getAgentGatewaySnapshot,
  getAgentSettingsState,
  loadAgentSettings,
  refreshAgentGatewayModels,
  saveAgentSettings,
  subscribeAgentGateway,
  subscribeAgentSettings,
} from '@/services/agent-gateway-client';

const panelStyle = {
  backgroundColor: 'var(--bg-medium)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '1rem',
  marginBottom: '1.25rem',
};

const selectStyle = {
  width: '100%',
  padding: '0.65rem 0.75rem',
  backgroundColor: 'var(--bg-dark)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '6px',
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
};

const buttonStyle = {
  padding: '0.5rem 0.85rem',
  borderRadius: '6px',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-light)',
  color: 'var(--text-primary)',
  fontSize: '0.8rem',
  cursor: 'pointer',
};

function modelKey(provider: string, modelId: string): string {
  return JSON.stringify([provider, modelId]);
}

export function AgentHarnessSettings() {
  const settings = useSyncExternalStore(subscribeAgentSettings, getAgentSettingsState, getAgentSettingsState);
  const gateway = useSyncExternalStore(subscribeAgentGateway, getAgentGatewaySnapshot, getAgentGatewaySnapshot);
  const [draft, setDraft] = useState<AgentSelection | null>(settings.record?.selection ?? null);
  const [selectedHarness, setSelectedHarness] = useState<'pi' | 'codex'>(settings.record?.selection?.harnessId === 'codex' ? 'codex' : 'pi');
  const refreshRequested = useRef<'pi' | 'codex' | null>(null);
  const harnessLabel = selectedHarness === 'codex' ? 'Codex' : 'Pi';

  useEffect(() => { if (settings.record) { setDraft(settings.record.selection); setSelectedHarness(settings.record.selection?.harnessId === 'codex' ? 'codex' : 'pi'); } }, [settings.record]);

  const inventoryReady = gateway.status === 'ready' && gateway.modelsHarnessId === selectedHarness && gateway.availability?.state === 'ready' && !gateway.modelsLoading && !gateway.modelError;
  const models = inventoryReady ? gateway.models : [];
  const refreshInventory = (harness: 'pi' | 'codex') => { refreshRequested.current = harness; void refreshAgentGatewayModels(harness).catch(() => {}); };

  useEffect(() => { if (gateway.modelsHarnessId === selectedHarness) refreshRequested.current = null; else if (gateway.status === 'ready' && !gateway.modelsLoading && refreshRequested.current !== selectedHarness) refreshInventory(selectedHarness); },
    [gateway.status, gateway.modelsHarnessId, gateway.modelsLoading, selectedHarness]);

  const savedHarness = settings.record?.selection?.harnessId;
  const savedInventoryReady = Boolean((savedHarness === 'pi' || savedHarness === 'codex') && gateway.status === 'ready' && gateway.modelsHarnessId === savedHarness && gateway.availability?.state === 'ready' && !gateway.modelsLoading && !gateway.modelError);
  const selectedModel = draft?.harnessId === selectedHarness ? models.find(model => model.provider === draft.provider && model.modelId === draft.modelId) : undefined;
  const selectedKey = selectedModel && draft ? modelKey(draft.provider, draft.modelId) : '';
  const selectedThinkingLevel = draft?.thinkingLevel && selectedModel?.thinkingLevels.includes(draft.thinkingLevel)
    ? draft.thinkingLevel
    : '';
  const canSaveSelection = Boolean(selectedModel)
    && (!draft?.thinkingLevel || Boolean(selectedModel?.thinkingLevels.includes(draft.thinkingLevel)))
    && inventoryReady
    && draft?.harnessId === selectedHarness
    && !settings.loading
    && !settings.saving;

  const handleModelChange = (value: string) => {
    const model = models.find(item => modelKey(item.provider, item.modelId) === value);
    if (!model) return;
    const sameModel = draft?.harnessId === selectedHarness && draft.provider === model.provider && draft.modelId === model.modelId;
    const currentThinkingLevel = sameModel ? draft?.thinkingLevel : undefined;
    setDraft({
      schemaVersion: 1,
      harnessId: selectedHarness,
      provider: model.provider,
      modelId: model.modelId,
      ...(currentThinkingLevel && model.thinkingLevels.includes(currentThinkingLevel)
        ? { thinkingLevel: currentThinkingLevel }
        : {}),
    });
  };

  const handleThinkingChange = (value: string) => {
    if (!draft || draft.harnessId !== selectedHarness) return;
    if (value) {
      setDraft({ ...draft, thinkingLevel: value as NonNullable<AgentSelection['thinkingLevel']> });
    } else {
      setDraft({ schemaVersion: 1, harnessId: draft.harnessId, provider: draft.provider, modelId: draft.modelId });
    }
  };

  const handleSaveSelection = async () => {
    if (!draft || !selectedModel || !canSaveSelection) return;
    try {
      await saveAgentSettings({ schemaVersion: 1, migrationState: 'harness_configured', selection: draft });
    } catch {
      // The shared settings store exposes the save failure to this panel.
    }
  };

  const handleUseLegacy = async () => {
    try {
      await saveAgentSettings({
        schemaVersion: 1,
        migrationState: 'legacy_explicit',
        selection: settings.record?.selection ?? null,
      });
    } catch {
      // The shared settings store exposes the save failure to this panel.
    }
  };

  const migrationState = settings.record?.migrationState ?? 'unconfigured';
  const savedModel = savedHarness && savedInventoryReady ? gateway.models.find(model => model.provider === settings.record?.selection?.provider && model.modelId === settings.record?.selection?.modelId) : undefined;

  return (
    <section style={panelStyle} aria-labelledby="agent-harness-title">
      <h3 id="agent-harness-title" style={{ margin: '0 0 0.5rem', color: 'var(--text-primary)', fontSize: '1rem' }}>
        Agent harness and model
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.45, margin: '0 0 0.75rem' }}>
        This shared selection is used by Prompt Engineer and Console. It is separate from the media generation target model.
      </p>

      <div role="status" aria-live="polite" style={{ color: gateway.status === 'ready' && gateway.availability?.state === 'ready' ? 'var(--success)' : 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
        {settings.loading
          ? 'Loading saved agent settings…'
          : gateway.status === 'ready' && gateway.availability && gateway.availability.state !== 'ready'
            ? `Gateway connected; ${harnessLabel} is ${gateway.availability.state}.`
            : gateway.message}
      </div>
      {settings.error && <p role="alert" style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{settings.error}</p>}
      {settings.error && (
        <button type="button" style={buttonStyle} onClick={() => void loadAgentSettings()} disabled={settings.loading || settings.saving}>
          Retry loading agent settings
        </button>
      )}
      {gateway.modelError && <p role="alert" style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{gateway.modelError}</p>}
      {gateway.availability && gateway.availability.state !== 'ready' && <p role="status" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.45 }}>{harnessLabel} availability: {gateway.availability.message} {selectedHarness === 'codex' ? 'Codex model inventory requires sign-in.' : `Complete any required ${harnessLabel} authentication through its user-managed flow.`} The saved selection is preserved.</p>}
      {selectedHarness === 'codex' && gateway.status === 'ready' && gateway.availability?.state === 'ready' && !gateway.modelsLoading && !gateway.modelError && gateway.modelsHarnessId !== selectedHarness && <p role="status" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Codex model inventory requires sign-in before models are available.</p>}
      {settings.record?.selection && settings.record.selection.harnessId !== 'pi' && settings.record.selection.harnessId !== 'codex' && (
        <p role="status" style={{ color: 'var(--text-warning, #f59e0b)', fontSize: '0.8rem' }}>
          Saved harness “{settings.record.selection.harnessId}” is not supported yet. Its selection is preserved; no legacy provider fallback will run.
        </p>
      )}
      {gateway.status !== 'ready' && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.45 }}>
          Pairing is supplied by the local launcher. Restart it to receive a fresh one-time link; this page cannot mint pairing tokens. No model choices are shown while disconnected.
        </p>
      )}
      {inventoryReady && models.length === 0 && <p role="status" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{harnessLabel} reported no authenticated models. {selectedHarness === 'codex' ? 'Codex model inventory requires sign-in.' : `Complete ${harnessLabel} authentication through its user-managed flow, then refresh the inventory.`}</p>}

      <select aria-label="Agent harness" style={selectStyle} value={selectedHarness} onChange={event => { const harness = event.target.value as 'pi' | 'codex'; setSelectedHarness(harness); setDraft(null); refreshInventory(harness); }} disabled={settings.loading || settings.saving}>
        <option value="pi">Pi</option>
        <option value="codex">Codex</option>
      </select>
      {selectedHarness === 'codex' && <CodexLoginControls />}

      <label htmlFor="agent-harness-model" style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.75rem 0 0.35rem' }}>
        {harnessLabel} model from authenticated inventory
      </label>
      <select
        id="agent-harness-model"
        style={selectStyle}
        value={models.some(model => modelKey(model.provider, model.modelId) === selectedKey) ? selectedKey : ''}
        onChange={event => handleModelChange(event.target.value)}
        disabled={settings.loading || settings.saving || !inventoryReady || models.length === 0}
      >
        <option value="">{gateway.modelsLoading ? `Loading ${harnessLabel} models…` : `Select an available ${harnessLabel} model`}</option>
        {models.map(model => (
          <option key={modelKey(model.provider, model.modelId)} value={modelKey(model.provider, model.modelId)}>
            {model.name} — {model.provider}:{model.modelId}{model.reasoning ? ' · reasoning' : ''}
          </option>
        ))}
      </select>
      {draft?.harnessId === selectedHarness && !selectedModel && draft.modelId && (
        <p role="status" style={{ color: 'var(--text-warning, #f59e0b)', fontSize: '0.75rem' }}>
          Saved {harnessLabel} selection: {draft.provider}:{draft.modelId}. It remains stored until you choose another model.
        </p>
      )}
      {draft?.harnessId === selectedHarness && draft.thinkingLevel && selectedModel && !selectedModel.thinkingLevels.includes(draft.thinkingLevel) && (
        <p role="status" style={{ color: 'var(--text-warning, #f59e0b)', fontSize: '0.75rem' }}>
          Saved thinking level “{draft.thinkingLevel}” is no longer reported for this model. It remains stored until you choose a supported level or clear it.
        </p>
      )}

      <label htmlFor="agent-thinking-level" style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.75rem 0 0.35rem' }}>
        Thinking level reported by this model
      </label>
      <select
        id="agent-thinking-level"
        style={selectStyle}
        value={selectedThinkingLevel}
        onChange={event => handleThinkingChange(event.target.value)}
        disabled={!selectedModel || selectedModel.thinkingLevels.length === 0 || settings.loading || settings.saving}
      >
        <option value="">No thinking level selected</option>
        {selectedModel?.thinkingLevels.map(level => <option key={level} value={level}>{level}</option>)}
      </select>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.85rem' }}>
        <button type="button" style={buttonStyle} onClick={() => refreshInventory(selectedHarness)} disabled={gateway.status !== 'ready' || gateway.modelsLoading || settings.saving}>
          {gateway.modelsLoading ? 'Checking models…' : `Refresh ${harnessLabel} inventory`}
        </button>
        <button type="button" style={buttonStyle} onClick={() => void handleSaveSelection()} disabled={!canSaveSelection}>
          {settings.saving ? 'Saving…' : `Save ${harnessLabel} selection`}
        </button>
        <button type="button" style={buttonStyle} onClick={() => void handleUseLegacy()} disabled={settings.loading || settings.saving || migrationState === 'legacy_explicit'}>
          {migrationState === 'legacy_explicit' ? 'Legacy direct provider selected' : 'Use legacy direct provider'}
        </button>
      </div>

      <p role="status" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '0.85rem 0 0' }}>Claude Code is unavailable for prompt enhancement; any saved Claude selection remains preserved and unsupported.</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '0.5rem 0 0' }}>
        Antigravity remains assessment-only. Existing provider credentials are retained and are never copied into a harness.
      </p>
      {settings.record?.migrationState === 'harness_configured' && savedInventoryReady && <p role="status" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 0 }}>{savedModel ? `Prompt enhancement uses ${savedHarness === 'codex' ? 'Codex' : 'Pi'} (${savedModel.provider}:${savedModel.modelId}). Authentication stays with ${savedHarness === 'codex' ? 'Codex' : 'Pi'}; no legacy provider fallback is used.` : `The saved ${savedHarness === 'codex' ? 'Codex' : 'Pi'} model is not in its authenticated inventory. Prompt enhancement is paused and the saved selection is preserved; no legacy provider fallback is used.`}</p>}
      {settings.record?.migrationState === 'legacy_explicit' && (
        <p role="status" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 0 }}>
          Prompt enhancement uses the legacy direct provider selected below. Its credentials remain separate from the agent harness.
        </p>
      )}
      {migrationState === 'unconfigured' && (
        <p role="status" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 0 }}>
          Prompt enhancement is not configured. Select an authenticated {harnessLabel} model or explicitly choose the legacy direct provider.
        </p>
      )}
    </section>
  );
}
