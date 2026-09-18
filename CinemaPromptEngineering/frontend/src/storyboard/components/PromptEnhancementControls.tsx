import { useEffect, useMemo } from 'react';
import { effectiveEnhancementAssets, resolveEnhancementTask } from '../services/prompt-enhancement';
import type {
  EnhancementAssetCandidate,
  EnhancementPreferences,
  EnhancementProfile,
  EnhancementTask,
} from '../services/prompt-enhancement';

interface PromptEnhancementControlsProps {
  profiles: EnhancementProfile[];
  assets: EnhancementAssetCandidate[];
  preferences: EnhancementPreferences;
  onChange: (preferences: EnhancementPreferences) => void;
  durationSeconds?: number;
  profilesLoading?: boolean;
  profilesError?: string | null;
  onRetryProfiles?: () => void;
  disabled?: boolean;
}

const taskLabels: Record<EnhancementTask, string> = {
  t2v: 'Text to video',
  i2v: 'Image/keyframe to video',
  ref2v: 'Reference media to video',
};

export function PromptEnhancementControls({
  profiles,
  assets,
  preferences,
  onChange,
  durationSeconds,
  profilesLoading = false,
  profilesError,
  onRetryProfiles,
  disabled = false,
}: PromptEnhancementControlsProps) {
  const profile = profiles.find(item => item.target_model === preferences.targetModel);
  const dialect = profile?.dialects.find(item => item.id === preferences.referenceDialect);
  const effectiveAssets = effectiveEnhancementAssets(assets, preferences);
  const resolvedTask = resolveEnhancementTask(preferences.taskMode, preferences.task, effectiveAssets);
  const frameAssets = effectiveAssets.filter(asset => {
    const role = preferences.assets?.[asset.binding_id]?.role || asset.role;
    return role === 'first_frame' || role === 'last_frame';
  });
  const availableTasks = useMemo(() => {
    if (!profile || !dialect) return [];
    return profile.tasks.filter(task => dialect.tasks.includes(task)) as EnhancementTask[];
  }, [dialect, profile]);

  useEffect(() => {
    if (!profile) return;
    const nextDialect = profile.dialects.some(item => item.id === preferences.referenceDialect)
      ? preferences.referenceDialect
      : profile.default_dialect;
    if (nextDialect !== preferences.referenceDialect) {
      onChange({ ...preferences, referenceDialect: nextDialect, referenceOrderConfirmed: false });
    }
  }, [onChange, preferences, profile]);

  const updateAsset = (bindingId: string, patch: NonNullable<EnhancementPreferences['assets']>[string]) => {
    onChange({
      ...preferences,
      referenceOrderConfirmed: false,
      assets: {
        ...preferences.assets,
        [bindingId]: { ...preferences.assets?.[bindingId], ...patch },
      },
    });
  };

  return (
    <div className="prompt-enhancement-controls" aria-label="Prompt enhancement controls">
      {profilesLoading && <small role="status">Loading verified video enhancement profiles…</small>}
      {!profilesLoading && profilesError && (
        <small role="alert">{profilesError} <button type="button" onClick={onRetryProfiles}>Retry</button></small>
      )}
      <div className="prompt-enhancement-row">
        <label>
          Target
          <select
            aria-label="Enhancement target"
            value={preferences.targetModel}
            disabled={disabled}
            onChange={event => {
              const next = profiles.find(item => item.target_model === event.target.value);
              onChange({
                ...preferences,
                targetModel: event.target.value,
                referenceDialect: next?.default_dialect || '',
                referenceOrderConfirmed: false,
              });
            }}
          >
            <option value="">Select target</option>
            {profiles.map(item => <option key={item.target_model} value={item.target_model}>{item.label}</option>)}
          </select>
        </label>
        <label>
          Dialect
          <select
            aria-label="Enhancement dialect"
            value={preferences.referenceDialect}
            disabled={disabled || !profile}
            onChange={event => onChange({ ...preferences, referenceDialect: event.target.value, referenceOrderConfirmed: false })}
          >
            {profile?.dialects.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>
          Task
          <select
            aria-label="Enhancement task"
            value={preferences.taskMode === 'auto' ? 'auto' : preferences.task || ''}
            disabled={disabled || !profile}
            onChange={event => {
              const value = event.target.value;
              onChange({
                ...preferences,
                taskMode: value === 'auto' ? 'auto' : 'manual',
                task: value === 'auto' ? undefined : value as EnhancementTask,
                referenceOrderConfirmed: false,
              });
            }}
          >
            <option value="auto">Auto ({effectiveAssets.length ? 'media detected' : 'T2V'})</option>
            {availableTasks.map(task => <option key={task} value={task}>{taskLabels[task]}</option>)}
          </select>
        </label>
      </div>

      {profile?.target_model === 'minimax_h3' && preferences.referenceDialect === 'local_h3' && resolvedTask === 'i2v' && (
        <small role="status">
          Required local H3 keyframe positions: {frameAssets.some(asset => (preferences.assets?.[asset.binding_id]?.role || asset.role) === 'first_frame') && frameAssets.some(asset => (preferences.assets?.[asset.binding_id]?.role || asset.role) === 'last_frame')
            ? 'first frame = ordinal 1, last frame = ordinal 2 (FLF)'
            : frameAssets.some(asset => (preferences.assets?.[asset.binding_id]?.role || asset.role) === 'first_frame')
              ? 'first frame = ordinal 1'
              : 'last frame = ordinal 1'}; ordinals are never renumbered automatically.
        </small>
      )}
      {profile && (profile.target_model === 'ltx_2.3' || profile.target_model === 'ltx_2.5') && resolvedTask === 'i2v' && (
        <small role="status">{profile.label} requires a first frame; last-frame-only is unsupported.</small>
      )}
      {!resolvedTask && effectiveAssets.length > 0 && preferences.taskMode === 'auto' && (
        <small role="alert">Mixed keyframe/reference roles need an explicit I2V or R2V task.</small>
      )}
      {resolvedTask === 'ref2v' && effectiveAssets.length > 0 && (
        <small role="status">R2V preserves original per-kind ordinals, including intentional gaps after exclusions.</small>
      )}
      {assets.length > 0 && (
        <div className="prompt-enhancement-assets">
          {assets.map(asset => {
            const override = preferences.assets?.[asset.binding_id];
            const include = override?.include ?? asset.include;
            return (
              <div className="prompt-enhancement-asset" key={asset.binding_id}>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Include ${asset.label || asset.binding_id}`}
                    checked={include}
                    disabled={disabled}
                    onChange={event => updateAsset(asset.binding_id, { include: event.target.checked })}
                  />
                  <span>{asset.label || asset.binding_id}{asset.ambiguous ? ' (ambiguous — confirm manually)' : ''}</span>
                </label>
                <select
                  aria-label={`Role for ${asset.label || asset.binding_id}`}
                  value={override?.role || asset.role}
                  disabled={disabled || !include}
                  onChange={event => updateAsset(asset.binding_id, { role: event.target.value as EnhancementAssetCandidate['role'] })}
                >
                  <option value="reference_image">Reference image</option>
                  <option value="first_frame">First frame</option>
                  <option value="last_frame">Last frame</option>
                  <option value="reference_video">Reference video</option>
                  <option value="reference_audio">Reference audio</option>
                </select>
                <input
                  aria-label={`Ordinal for ${asset.label || asset.binding_id}`}
                  type="number"
                  min={1}
                  value={override?.ordinal ?? asset.ordinal}
                  disabled={disabled || !include}
                  onChange={event => updateAsset(asset.binding_id, { ordinal: Number(event.target.value) })}
                />
                <input
                  aria-label={`Description for ${asset.label || asset.binding_id}`}
                  type="text"
                  placeholder="Optional semantic description"
                  value={override?.description || ''}
                  disabled={disabled || !include}
                  onChange={event => updateAsset(asset.binding_id, { description: event.target.value })}
                />
                {preferences.targetModel.startsWith('kling_3.0') && (
                  <input
                    aria-label={`Kling reference name for ${asset.label || asset.binding_id}`}
                    type="text"
                    placeholder="Kling name (optional)"
                    value={override?.referenceName || ''}
                    disabled={disabled || !include}
                    onChange={event => updateAsset(asset.binding_id, { referenceName: event.target.value })}
                  />
                )}
              </div>
            );
          })}
          <label className="prompt-enhancement-confirm">
            <input
              type="checkbox"
              aria-label="Confirm media mapping"
              checked={preferences.referenceOrderConfirmed}
              disabled={disabled}
              onChange={event => onChange({ ...preferences, referenceOrderConfirmed: event.target.checked })}
            />
            Confirm media mapping and original ordinals
          </label>
        </div>
      )}
      <small>Metadata only: media stays local; no upload, vision pass, path, URL, or data URL is sent to the LLM.</small>
      {preferences.targetModel === 'minimax_h3' && preferences.referenceDialect === 'local_h3'
        && assets.some(asset => (preferences.assets?.[asset.binding_id]?.role || asset.role) === 'last_frame') && (
          <small role="status">
            Effective duration: {durationSeconds === undefined ? 'missing (required for last-frame alignment)' : `${durationSeconds.toFixed(2)}s`}
          </small>
        )}
      {dialect?.reference_style && <small>{dialect.reference_style}</small>}
    </div>
  );
}
