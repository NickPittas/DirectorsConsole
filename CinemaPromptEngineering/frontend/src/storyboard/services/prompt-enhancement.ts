export type EnhancementTask = 't2v' | 'i2v' | 'ref2v';
export type EnhancementAssetKind = 'image' | 'video' | 'audio';
export type EnhancementAssetRole = 'first_frame' | 'last_frame' | 'reference_image' | 'reference_video' | 'reference_audio';

export interface EnhancementProfileDialect {
  id: string;
  label: string;
  tasks: string[];
  reference_style: string;
  requires_order_confirmation: boolean;
}

export interface EnhancementProfile {
  target_model: string;
  label: string;
  tasks: string[];
  default_dialect: string;
  dialects: EnhancementProfileDialect[];
  source_urls: string[];
}

export interface EnhancementPreferences {
  targetModel: string;
  referenceDialect: string;
  taskMode: 'auto' | 'manual';
  task?: EnhancementTask;
  referenceOrderConfirmed: boolean;
  assets?: Record<string, {
    include?: boolean;
    role?: EnhancementAssetRole;
    ordinal?: number;
    description?: string;
    referenceName?: string;
  }>;
}

type EnhancementAssetOverride = {
  include?: boolean;
  role?: EnhancementAssetRole;
  ordinal?: number;
  description?: string;
  referenceName?: string;
};

export interface EnhancementAssetCandidate {
  binding_id: string;
  kind: EnhancementAssetKind;
  role: EnhancementAssetRole;
  ordinal: number;
  label?: string;
  description?: string;
  reference_name?: string;
  valueFingerprint: string;
  ambiguous: boolean;
  include: boolean;
}

export interface EnhancementContext {
  task: EnhancementTask;
  reference_dialect?: string;
  duration_seconds?: number;
  assets: Array<{
    binding_id: string;
    kind: EnhancementAssetKind;
    role: EnhancementAssetRole;
    ordinal: number;
    label?: string;
    description?: string;
    reference_name?: string;
  }>;
  reference_order_confirmed: boolean;
}

interface WorkflowNode {
  class_type?: string;
  meta?: unknown;
  version?: unknown;
  inputs?: Record<string, unknown>;
  mode?: number;
  _meta?: { title?: string };
}

interface WorkflowConfig {
  name: string;
  node_id: string;
  input_name: string;
  display_name?: string;
  type?: string;
  default?: unknown;
  exposed?: boolean;
}

interface EnhancementWorkflow {
  workflow: Record<string, WorkflowNode>;
  config?: WorkflowConfig[];
}

const MEDIA_TYPES = new Set(['image', 'image_list', 'video', 'video_list', 'audio', 'audio_list', 'media']);
const EXCLUDED_INPUT = /mask|latent|model|checkpoint|clip|vae|conditioning|output|filename|path|prefix|audio_output/i;
const NATIVE_H3 = /minimax.?h3/i;
const FIRST_FRAME = /first.?frame|start.?frame|start.?image|initial.?frame|key.?frame/i;
const LAST_FRAME = /last.?frame|end.?frame|ending.?frame|final.?frame/i;
const VIDEO_INPUT = /video|movie/i;
const AUDIO_INPUT = /audio|sound/i;
const IMAGE_INPUT = /image|picture|photo|frame|reference|ref/i;
const DURATION_INPUT = /duration(?:_seconds)?|seconds|video_length|length_seconds/i;
const FRAME_INPUT = /frames?|frame_count/i;
const FPS_INPUT = /fps|frame_rate|framerate/i;

function isLink(value: unknown): value is [string, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Number.isInteger(value[1]);
}

function populated(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '' && value !== '__BYPASSED__';
}

function stringValue(value: unknown): string | undefined {
  return populated(value) ? value as string : undefined;
}

function bindingFor(configs: WorkflowConfig[], nodeId: string, inputName: string): WorkflowConfig | undefined {
  return configs.find(config => config.node_id === nodeId && config.input_name === inputName);
}

function effectiveValue(
  configs: WorkflowConfig[],
  values: Record<string, unknown>,
  nodeId: string,
  inputName: string,
  fallback: unknown,
): unknown {
  const config = bindingFor(configs, nodeId, inputName);
  for (const key of [config?.name, inputName, `${inputName}_${nodeId}`]) {
    if (key && Object.prototype.hasOwnProperty.call(values, key)) return values[key];
  }
  return fallback;
}

function isMediaInput(node: WorkflowNode, inputName: string, config?: WorkflowConfig): boolean {
  const classType = node.class_type || '';
  if (EXCLUDED_INPUT.test(inputName) || EXCLUDED_INPUT.test(classType) && !NATIVE_H3.test(classType)) return false;
  if (config?.type && MEDIA_TYPES.has(config.type)) return true;
  if (/loadimage|loadvideo|videoloader|audio.*loader|load.*audio/i.test(classType)) return true;
  return IMAGE_INPUT.test(inputName) || VIDEO_INPUT.test(inputName) || AUDIO_INPUT.test(inputName);
}

function kindFor(node: WorkflowNode, inputName: string, config?: WorkflowConfig): EnhancementAssetKind | undefined {
  const type = config?.type || '';
  if (type.startsWith('video') || VIDEO_INPUT.test(inputName)) return 'video';
  if (type.startsWith('audio') || AUDIO_INPUT.test(inputName)) return 'audio';
  if (type.startsWith('image') || type === 'media' || IMAGE_INPUT.test(inputName)) return 'image';
  if (/loadimage|loadvideo|videoloader|audio.*loader|load.*audio/i.test(node.class_type || '')) {
    return VIDEO_INPUT.test(node.class_type || '') ? 'video' : 'image';
  }
  return undefined;
}

function roleFor(inputName: string, kind: EnhancementAssetKind): EnhancementAssetRole {
  if (kind === 'video') return 'reference_video';
  if (kind === 'audio') return 'reference_audio';
  if (FIRST_FRAME.test(inputName)) return 'first_frame';
  if (LAST_FRAME.test(inputName)) return 'last_frame';
  // A generic LoadImage is intentionally only a reference image. It is not a
  // first frame unless the destination slot names that role.
  return 'reference_image';
}

function labelFor(node: WorkflowNode, inputName: string, config?: WorkflowConfig): string {
  const label = config?.display_name || node._meta?.title || inputName.replace(/[_.-]+/g, ' ');
  return /:\/\/|^data:|[\\/]/.test(label) ? inputName.replace(/[_.-]+/g, ' ') : label;
}

function fingerprint(value: unknown): string {
  if (typeof value !== 'string') return '';
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${value.length}:${(hash >>> 0).toString(16)}`;
}

function isLoaderNode(node: WorkflowNode): boolean {
  return /loadimage|loadvideo|videoloader|audio.*loader|load.*audio/i.test(node.class_type || '');
}

function isVerifiedNativeReference(node: WorkflowNode, inputName: string): boolean {
  return NATIVE_H3.test(node.class_type || '') &&
    (IMAGE_INPUT.test(inputName) || VIDEO_INPUT.test(inputName) || AUDIO_INPUT.test(inputName)) &&
    !/prompt|text|negative|positive/i.test(inputName);
}

function candidatesForValue(
  node: WorkflowNode,
  nodeId: string,
  inputName: string,
  value: unknown,
  configs: WorkflowConfig[],
  values: Record<string, unknown>,
  ordinalByKind: Record<EnhancementAssetKind, number>,
  bindingPrefix?: string,
): EnhancementAssetCandidate[] {
  const config = bindingFor(configs, nodeId, inputName);
  if (!isMediaInput(node, inputName, config)) return [];
  const kind = kindFor(node, inputName, config);
  if (!kind) return [];
  const valuesToCheck = Array.isArray(value) ? value : [value];
  const candidates: EnhancementAssetCandidate[] = [];
  valuesToCheck.forEach((rawValue, index) => {
    const resolved = effectiveValue(configs, values, nodeId, inputName, rawValue);
    const source = stringValue(Array.isArray(resolved) ? resolved[index] : resolved);
    if (!source) return;
    ordinalByKind[kind] += 1;
    const binding_id = bindingPrefix || `media:${nodeId}:${inputName}${Array.isArray(value) ? `:${index}` : ''}`;
    const role = roleFor(inputName, kind);
    const verified = isVerifiedNativeReference(node, inputName);
    candidates.push({
      binding_id,
      kind,
      role,
      ordinal: ordinalByKind[kind],
      label: labelFor(node, inputName, config),
      valueFingerprint: fingerprint(source),
      ambiguous: !verified && role === 'reference_image',
      include: true,
    });
  });
  return candidates;
}

/**
 * Discover populated, enabled media without reading or uploading its contents.
 * Ordinals are assigned before filtering, so excluded inputs leave gaps.
 */
export function discoverEnhancementAssets(
  workflow: EnhancementWorkflow,
  values: Record<string, unknown>,
): EnhancementAssetCandidate[] {
  const configs = workflow.config || [];
  const nodes = workflow.workflow || {};
  const candidates: EnhancementAssetCandidate[] = [];
  const ordinalByKind: Record<EnhancementAssetKind, number> = { image: 0, video: 0, audio: 0 };
  const consumedSourceBindings = new Set<string>();
  const consumedNodeIds = new Set<string>();
  for (const node of Object.values(nodes)) {
    if (!node?.inputs) continue;
    for (const [inputName, inputValue] of Object.entries(node.inputs)) {
      if (!isLink(inputValue)) continue;
      consumedNodeIds.add(inputValue[0]);
      if (!isVerifiedNativeReference(node, inputName)) continue;
      const sourceNode = nodes[inputValue[0]];
      if (!sourceNode?.inputs) continue;
      const sourceInputName = Object.keys(sourceNode.inputs).find(name =>
        isMediaInput(sourceNode, name, bindingFor(configs, inputValue[0], name))
      );
      if (sourceInputName) consumedSourceBindings.add(`${inputValue[0]}:${sourceInputName}`);
    }
  }

  for (const [nodeId, node] of Object.entries(nodes)) {
    if (!node || node.mode === 4 || !node.inputs) continue;
    if (isLoaderNode(node) && !consumedNodeIds.has(nodeId)) continue;
    for (const [inputName, inputValue] of Object.entries(node.inputs)) {
      if (consumedSourceBindings.has(`${nodeId}:${inputName}`) && !isLink(inputValue)) continue;
      if (isLink(inputValue)) {
        // A native H3 destination establishes the role; a generic graph edge
        // does not establish upload order or first-frame semantics.
        if (!isVerifiedNativeReference(node, inputName)) continue;
        const sourceNode = nodes[inputValue[0]];
        if (!sourceNode || sourceNode.mode === 4 || !sourceNode.inputs) continue;
        const sourceInputName = Object.keys(sourceNode.inputs).find(name =>
          isMediaInput(sourceNode, name, bindingFor(configs, inputValue[0], name)) &&
          populated(effectiveValue(configs, values, inputValue[0], name, sourceNode.inputs?.[name]))
        );
        if (!sourceInputName) continue;
        const sourceValue = effectiveValue(configs, values, inputValue[0], sourceInputName, sourceNode.inputs[sourceInputName]);
        const sourceKind = kindFor(sourceNode, sourceInputName, bindingFor(configs, inputValue[0], sourceInputName)) || kindFor(node, inputName);
        if (!sourceKind) continue;
        ordinalByKind[sourceKind] += 1;
        candidates.push({
          binding_id: `media:${nodeId}:${inputName}`,
          kind: sourceKind,
          role: roleFor(inputName, sourceKind),
          ordinal: ordinalByKind[sourceKind],
          label: labelFor(node, inputName, bindingFor(configs, nodeId, inputName)),
          valueFingerprint: fingerprint(sourceValue),
          ambiguous: false,
          include: true,
        });
        continue;
      }
      candidates.push(...candidatesForValue(node, nodeId, inputName, inputValue, configs, values, ordinalByKind));
    }
  }

  // A configured media binding may be present in the schema but absent as a
  // literal workflow input (hidden custom-node input). It is still eligible
  // when the effective panel value populates it.
  for (const config of configs) {
    if (!config.type || !MEDIA_TYPES.has(config.type) || !Object.prototype.hasOwnProperty.call(values, config.name)) continue;
    const node = nodes[config.node_id];
    if (!node || node.mode === 4) continue;
    if (isLoaderNode(node) && !consumedNodeIds.has(config.node_id)) continue;
    if (node.inputs && config.input_name in node.inputs) continue;
    candidates.push(...candidatesForValue(node, config.node_id, config.input_name, values[config.name], configs, values, ordinalByKind));
  }
  return candidates;
}

function findNumber(workflow: EnhancementWorkflow, values: Record<string, unknown>, matcher: RegExp): number | undefined {
  const configs = workflow.config || [];
  for (const config of configs) {
    if (!matcher.test(config.name) && !matcher.test(config.input_name)) continue;
    const value = effectiveValue(configs, values, config.node_id, config.input_name, config.default);
    const number = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  for (const node of Object.values(workflow.workflow || {})) {
    for (const [name, value] of Object.entries(node.inputs || {})) {
      if (!matcher.test(name)) continue;
      const number = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(number) && number > 0) return number;
    }
  }
  return undefined;
}

export function getEffectiveDuration(workflow: EnhancementWorkflow, values: Record<string, unknown>): number | undefined {
  const duration = findNumber(workflow, values, DURATION_INPUT);
  if (duration !== undefined) return Number(duration.toFixed(2));
  const frames = findNumber(workflow, values, FRAME_INPUT);
  const fps = findNumber(workflow, values, FPS_INPUT);
  if (frames !== undefined && fps !== undefined) return Number((frames / fps).toFixed(2));
  return undefined;
}

export function resolveEnhancementTask(
  mode: 'auto' | 'manual',
  requested: EnhancementTask | undefined,
  assets: EnhancementAssetCandidate[],
): EnhancementTask {
  if (mode === 'manual' && requested) return requested;
  if (assets.some(asset => asset.role === 'first_frame' || asset.role === 'last_frame')) return 'i2v';
  return assets.length > 0 ? 'ref2v' : 't2v';
}

function cloneAsset(candidate: EnhancementAssetCandidate, override?: EnhancementAssetOverride): EnhancementAssetCandidate {
  return {
    ...candidate,
    include: override?.include ?? candidate.include,
    role: override?.role ?? candidate.role,
    ordinal: override?.ordinal ?? candidate.ordinal,
    description: override?.description,
    reference_name: override?.referenceName,
  };
}

export function enhancementMappingFingerprint(
  assets: EnhancementAssetCandidate[],
  preferences: EnhancementPreferences,
): string {
  return JSON.stringify({
    target: preferences.targetModel,
    dialect: preferences.referenceDialect,
    taskMode: preferences.taskMode,
    task: preferences.task,
    confirmed: preferences.referenceOrderConfirmed,
    assets: assets.map(asset => ({
      id: asset.binding_id,
      kind: asset.kind,
      role: preferences.assets?.[asset.binding_id]?.role || asset.role,
      ordinal: preferences.assets?.[asset.binding_id]?.ordinal || asset.ordinal,
      include: preferences.assets?.[asset.binding_id]?.include ?? asset.include,
      description: preferences.assets?.[asset.binding_id]?.description || '',
      referenceName: preferences.assets?.[asset.binding_id]?.referenceName || '',
      fingerprint: asset.valueFingerprint,
    })),
  });
}

/** Build the frozen wire context; asset values never enter this object. */
export function buildEnhancementContext(
  workflow: EnhancementWorkflow,
  values: Record<string, unknown>,
  profile: EnhancementProfile,
  preferences: EnhancementPreferences,
): { context?: EnhancementContext; error?: string; mappingFingerprint: string } {
  const candidates = discoverEnhancementAssets(workflow, values);
  const mappingFingerprint = enhancementMappingFingerprint(candidates, preferences);
  const dialect = profile.dialects.find(item => item.id === preferences.referenceDialect);
  if (!dialect) return { error: 'Select a dialect supported by the selected target.', mappingFingerprint };
  const task = resolveEnhancementTask(preferences.taskMode, preferences.task, candidates);
  if (!profile.tasks.includes(task) || !dialect.tasks.includes(task)) {
    return { error: `${profile.label} does not support ${task.toUpperCase()} with this dialect.`, mappingFingerprint };
  }

  const assets = candidates.map(candidate => cloneAsset(candidate, preferences.assets?.[candidate.binding_id]))
    .filter(candidate => candidate.include);
  if (task === 't2v' && assets.length > 0) {
    return { error: 'T2V does not use media references; exclude irrelevant detected media first.', mappingFingerprint };
  }
  if (task !== 't2v' && assets.length === 0) {
    return { error: `${task.toUpperCase()} requires at least one enabled media binding.`, mappingFingerprint };
  }
  const frameAssets = assets.filter(asset => asset.role === 'first_frame' || asset.role === 'last_frame');
  const referenceAssets = assets.filter(asset => asset.role === 'reference_image' || asset.role === 'reference_video' || asset.role === 'reference_audio');
  if (frameAssets.filter(asset => asset.role === 'first_frame').length > 1 || frameAssets.filter(asset => asset.role === 'last_frame').length > 1) {
    return { error: 'Only one first-frame and one last-frame binding can be confirmed.', mappingFingerprint };
  }
  if (task === 'ref2v' && frameAssets.length > 0) {
    return { error: 'Reference-to-video uses reference roles, not first/last-frame roles.', mappingFingerprint };
  }
  if (task === 'i2v') {
    const isKling = profile.target_model.startsWith('kling_3.0');
    if (!isKling && assets.some(asset => !frameAssets.includes(asset))) {
      return { error: 'I2V accepts only confirmed first-frame or last-frame bindings.', mappingFingerprint };
    }
    if (isKling) {
      if (!frameAssets.some(asset => asset.role === 'first_frame')) {
        return { error: 'Kling I2V requires a confirmed first-frame binding.', mappingFingerprint };
      }
      if (referenceAssets.some(asset => asset.kind !== 'image' || asset.role !== 'reference_image' || !asset.reference_name)) {
        return { error: 'Kling I2V named references need a confirmed Kling reference name.', mappingFingerprint };
      }
    } else if (referenceAssets.length > 0) {
      return { error: 'I2V cannot mix keyframes with reference media for this target.', mappingFingerprint };
    }
    if ((profile.target_model === 'ltx_2.3' || profile.target_model === 'ltx_2.5')
      && !frameAssets.some(asset => asset.role === 'first_frame')) {
      return { error: `${profile.label} I2V requires a confirmed first-frame binding; last-frame-only is unsupported.`, mappingFingerprint };
    }
    if (profile.target_model === 'minimax_h3' && preferences.referenceDialect === 'local_h3') {
      const first = frameAssets.find(asset => asset.role === 'first_frame');
      const last = frameAssets.find(asset => asset.role === 'last_frame');
      const expected = first && last
        ? 'FLF requires first-frame ordinal 1 and last-frame ordinal 2.'
        : first
          ? 'First-frame-only local H3 requires ordinal 1.'
          : 'Last-frame-only local H3 requires ordinal 1.';
      if ((first && first.ordinal !== 1) || (last && last.ordinal !== (first ? 2 : 1))) {
        return { error: expected + ' Set the mapping explicitly; ordinals are never renumbered automatically.', mappingFingerprint };
      }
    }
  }
  if (assets.some(asset => asset.ordinal < 1 || !Number.isInteger(asset.ordinal))) {
    return { error: 'Every reference ordinal must be a positive integer.', mappingFingerprint };
  }
  const seen = new Set<string>();
  for (const asset of assets) {
    const key = `${asset.kind}:${asset.ordinal}`;
    if (seen.has(key)) return { error: 'Reference ordinals must be unique within each media kind.', mappingFingerprint };
    seen.add(key);
    if (asset.kind === 'image' && asset.role !== 'first_frame' && asset.role !== 'last_frame' && asset.role !== 'reference_image') {
      return { error: 'Image bindings must use an image or keyframe role.', mappingFingerprint };
    }
    if (asset.kind === 'video' && asset.role !== 'reference_video') {
      return { error: 'Video bindings must use the reference-video role.', mappingFingerprint };
    }
    if (asset.kind === 'audio' && asset.role !== 'reference_audio') {
      return { error: 'Audio bindings must use the reference-audio role.', mappingFingerprint };
    }
  }
  if (assets.length > 0 && !preferences.referenceOrderConfirmed) {
    return { error: 'Confirm the detected media mapping and original ordinals before enhancing.', mappingFingerprint };
  }
  const duration = getEffectiveDuration(workflow, values);
  const requiresDuration = profile.target_model === 'minimax_h3'
    && preferences.referenceDialect === 'local_h3'
    && task === 'i2v'
    && assets.some(asset => asset.role === 'last_frame');
  if (requiresDuration && duration === undefined) {
    return { error: 'A last-frame local H3 enhancement needs the workflow’s effective duration.', mappingFingerprint };
  }
  if (preferences.taskMode === 'manual' && !preferences.task) {
    return { error: 'Choose a task or switch task selection back to Auto.', mappingFingerprint };
  }

  const context: EnhancementContext = {
    task,
    reference_dialect: preferences.referenceDialect,
    ...(requiresDuration && duration !== undefined ? { duration_seconds: duration } : {}),
    assets: assets.map(asset => ({
      binding_id: asset.binding_id,
      kind: asset.kind,
      role: asset.role,
      ordinal: asset.ordinal,
      ...(asset.label ? { label: asset.label } : {}),
      ...(asset.description ? { description: asset.description } : {}),
      ...(asset.reference_name && profile.target_model.startsWith('kling_3.0') && asset.kind === 'image' && asset.role === 'reference_image'
        ? { reference_name: asset.reference_name }
        : {}),
    })),
    reference_order_confirmed: preferences.referenceOrderConfirmed,
  };
  return { context, mappingFingerprint };
}
