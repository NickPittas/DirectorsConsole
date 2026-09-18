'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ts = require(path.join(__dirname, '..', 'CinemaPromptEngineering/frontend/node_modules/typescript'));
const domHarness = require('./test_workflow_schema_production');
const root = path.join(__dirname, '..');

function parse(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function findVariable(source, fileName, name) {
  const tree = parse(source, fileName);
  let found;
  function visit(node) {
    if (found) return;
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) found = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(found, `${name} was not found`);
  if (ts.isCallExpression(found) && found.arguments.length > 0) found = found.arguments[0];
  assert.ok(ts.isArrowFunction(found), `${name} is not an arrow function`);
  return source.slice(found.getStart(tree), found.end);
}

function compile(file, replacements = {}, jsx = false, requireImpl = {}) {
  let source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const [from, to] of Object.entries(replacements)) source = source.split(from).join(to);
  const output = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    require: request => {
        return !request || request.endsWith('.css') ? {}
        : (Object.prototype.hasOwnProperty.call(requireImpl, request) ? requireImpl[request] : require(request));
    },
    console,
    Promise,
    setTimeout,
    clearTimeout,
    document: global.document,
    window: global.window,
    localStorage: global.localStorage,
    fetch: global.fetch,
    URL,
  }, { filename: file });
  return module.exports;
}

function findJsxAttribute(source, fileName, elementName, attributeName) {
  const tree = parse(source, fileName);
  let expression;
  function visit(node) {
    if (expression) return;
    const opening = ts.isJsxElement(node) ? node.openingElement
      : ts.isJsxSelfClosingElement(node) ? node : undefined;
    if (opening && opening.tagName.getText(tree) === elementName) {
      const attribute = opening.attributes.properties.find(property =>
        ts.isJsxAttribute(property) && property.name.getText(tree) === attributeName);
      if (attribute?.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
        expression = source.slice(attribute.initializer.expression.getStart(tree), attribute.initializer.expression.end);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(expression, `${elementName}.${attributeName} was not found`);
  return expression;
}

function compileArrow(source, globals) {
  const output = ts.transpileModule(`module.exports = ${source};`, {
    fileName: 'callback.ts',
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    console,
    Promise,
    ...globals,
  }, { filename: 'callback.ts' });
  return module.exports;
}

async function main() {
  const enhancement = compile('CinemaPromptEngineering/frontend/src/storyboard/services/prompt-enhancement.ts');
  const structuredThreeOutput = `integrated_multimodal_description: [Shot 1] <Picture 1> subject <d>[English] literal words</d>
line two

overall_soundscape: room tone

non_diegetic_music: N/A`;
  const structuredSixOutput = `subject_definitions:
<Subject 1> derives from <Picture 1>.
summary:
[reference generation] Use <Subject 1>.
retention_analysis:
<Subject 1>: fully_preserved
detailed_description:
[Shot 1] <Subject 1> speaks with <d>[English] literal words</d>.
overall_soundscape:
room tone
non_diegetic_music:
N/A`;
  const profile = {
    target_model: 'minimax_h3',
    label: 'MiniMax H3',
    tasks: ['t2v', 'i2v', 'ref2v'],
    default_dialect: 'local_h3',
    dialects: [{ id: 'local_h3', label: 'Local H3', tasks: ['t2v', 'i2v', 'ref2v'], reference_style: 'Picture tokens', requires_order_confirmation: true }],
    source_urls: [],
  };
  const workflow = {
    workflow: {
      '1': { class_type: 'LoadImage', inputs: { image: 'first.png' } },
      '2': { class_type: 'LoadImage', inputs: { image: 'second.png' } },
      '3': { class_type: 'LoadImageMask', inputs: { image: 'mask.png' } },
      '4': { class_type: 'MiniMaxH3ReferenceToVideo', inputs: { first_frame: ['1', 0], reference_image: ['2', 0] } },
      '5': { class_type: 'MiniMaxH3TextToVideo', inputs: { prompt: 'keep' } },
      '6': { class_type: 'CustomReferenceNode', inputs: { reference_image: 'loose.png' } },
      '7': { class_type: 'SaveVideo', inputs: { video: ['6', 0] } },
      '8': { class_type: 'CustomReferenceNode', inputs: { reference_image: 'disconnected.png' } },
      '9': { class_type: 'ApiMiniMaxH3ImageToVideo', inputs: { image: 'api.png' } },
      '10': { class_type: 'SaveVideo', inputs: { video: ['9', 0] } },
    },
    config: [
      { name: 'first_input', node_id: '1', input_name: 'image', type: 'image' },
      { name: 'second_input', node_id: '2', input_name: 'image', type: 'image' },
      { name: 'mask_input', node_id: '3', input_name: 'image', type: 'image' },
      { name: 'first_frame', node_id: '4', input_name: 'first_frame', type: 'image' },
      { name: 'reference_image', node_id: '4', input_name: 'reference_image', type: 'image' },
      { name: 'loose_input', node_id: '6', input_name: 'reference_image', type: 'image' },
      { name: 'disconnected_input', node_id: '8', input_name: 'reference_image', type: 'image' },
      { name: 'api_input', node_id: '9', input_name: 'image', type: 'image' },
    ],
  };
  const values = { prompt: 'prompt', first_input: 'data:image/png;base64,local-a', second_input: 'data:image/png;base64,local-b', mask_input: 'data:image/png;base64,mask', loose_input: 'data:image/png;base64,loose', disconnected_input: 'data:image/png;base64,disconnected', api_input: 'data:image/png;base64,api' };
  const assets = enhancement.discoverEnhancementAssets(workflow, values);
  assert.equal(assets.length, 4, 'only connected populated media bindings should be discovered');
  assert.equal(assets.some(asset => asset.binding_id === 'media:8:reference_image'), false, 'disconnected custom references are excluded');
  assert.equal(assets.find(asset => asset.binding_id === 'media:10:video')?.ambiguous, true, 'API wrappers are not trusted as native H3 slots');
  assert.equal(JSON.stringify(assets.map(asset => asset.ordinal)), JSON.stringify([1, 2, 3, 4]));
  assert.equal(assets.some(asset => asset.role === 'first_frame'), true, 'verified native H3 destination establishes first frame');
  assert.equal(assets.some(asset => asset.ambiguous), true, 'generic reference mapping remains explicitly ambiguous');
  assert.equal(Object.values(assets[0]).some(value => typeof value === 'string' && value.includes('data:image')), false, 'asset values never enter metadata');

  const audioWorkflow = {
    workflow: {
      '1': { class_type: 'LoadAudio', inputs: { audio: 'voice.wav' } },
      '2': { class_type: 'MiniMaxH3ReferenceToVideo', inputs: { reference_audio: ['1', 0] } },
    },
    config: [{ name: 'voice', node_id: '1', input_name: 'audio', type: 'audio' }],
  };
  const audioValues = { voice: 'data:audio/wav;base64:voice' };
  const audioAssets = enhancement.discoverEnhancementAssets(audioWorkflow, audioValues);
  assert.equal(audioAssets[0].kind, 'audio');
  const audioPrefs = { targetModel: 'minimax_h3', referenceDialect: 'local_h3', taskMode: 'auto', referenceOrderConfirmed: true };
  const audioFingerprint = enhancement.enhancementMappingFingerprint(audioAssets, audioPrefs);
  const rewiredFingerprint = enhancement.enhancementMappingFingerprint(audioAssets.map(asset => ({ ...asset, connectionTopology: 'rewired' })), audioPrefs);
  assert.notEqual(audioFingerprint, rewiredFingerprint, 'audio and connection topology participate in confirmation');

  const prefs = {
    targetModel: 'minimax_h3', referenceDialect: 'local_h3', taskMode: 'manual', task: 'ref2v', referenceOrderConfirmed: false,
    assets: { [assets[0].binding_id]: { role: 'reference_image' } },
  };
  const blocked = enhancement.buildEnhancementContext(workflow, values, profile, prefs);
  assert.match(blocked.error, /confirm/i, 'ambiguous mapping blocks enhancement');
  const confirmedPrefs = { ...prefs, referenceOrderConfirmed: true };
  confirmedPrefs.mappingFingerprint = enhancement.enhancementMappingFingerprint(assets, confirmedPrefs);
  const confirmed = enhancement.buildEnhancementContext(workflow, values, {
    ...profile,
    dialects: [{ ...profile.dialects[0], requires_order_confirmation: false }],
  }, confirmedPrefs);
  assert.equal(confirmed.context.task, 'ref2v');
  assert.equal(JSON.stringify(confirmed.context.assets.map(asset => asset.ordinal)), JSON.stringify([1, 2, 3, 4]));
  assert.equal(Object.prototype.hasOwnProperty.call(confirmed.context.assets[0], 'value'), false);
  const changed = enhancement.buildEnhancementContext(workflow, { ...values, loose_input: 'changed-local-value' }, {
    ...profile,
    dialects: [{ ...profile.dialects[0], requires_order_confirmation: false }],
  }, confirmedPrefs);
  assert.notEqual(changed.mappingFingerprint, confirmed.mappingFingerprint, 'editing a reference invalidates the mapping fingerprint');
  const excluded = enhancement.buildEnhancementContext(workflow, values, {
    ...profile,
    dialects: [{ ...profile.dialects[0], requires_order_confirmation: false }],
  }, (() => {
    const next = { ...confirmedPrefs, assets: { ...confirmedPrefs.assets, [assets[0].binding_id]: { include: false } } };
    next.mappingFingerprint = enhancement.enhancementMappingFingerprint(assets, next);
    return next;
  })());
  assert.equal(JSON.stringify(excluded.context.assets.map(asset => asset.ordinal)), JSON.stringify([2, 3, 4]), 'excluding media never renumbers original ordinals');
  const rawImagePrefs = {
    ...confirmedPrefs,
    taskMode: 'auto', task: undefined,
    assets: Object.fromEntries(assets.map((asset, index) => [asset.binding_id, { include: index === 2 }])),
  };
  rawImagePrefs.mappingFingerprint = enhancement.enhancementMappingFingerprint(assets, rawImagePrefs);
  const rawImage = enhancement.buildEnhancementContext(workflow, values, profile, rawImagePrefs);
  assert.ok(rawImage.context, rawImage.error);
  assert.equal(rawImage.context.task, 'ref2v', 'ambiguous raw images do not become first frames');
  const firstFramePrefs = {
    ...rawImagePrefs,
    assets: { ...rawImagePrefs.assets, [assets[2].binding_id]: { include: true, role: 'first_frame', ordinal: 1 } },
  };
  firstFramePrefs.mappingFingerprint = enhancement.enhancementMappingFingerprint(assets, firstFramePrefs);
  const firstFrame = enhancement.buildEnhancementContext(workflow, values, profile, firstFramePrefs);
  assert.equal(firstFrame.context.task, 'i2v', 'an explicit first-frame override submits I2V');
  const allExcludedPrefs = {
    ...confirmedPrefs,
    taskMode: 'auto', task: undefined,
    assets: Object.fromEntries(assets.map(asset => [asset.binding_id, { include: false }])),
  };
  allExcludedPrefs.mappingFingerprint = enhancement.enhancementMappingFingerprint(assets, allExcludedPrefs);
  const allExcluded = enhancement.buildEnhancementContext(workflow, values, profile, allExcludedPrefs);
  assert.equal(allExcluded.context.task, 't2v', 'excluding all media resolves Auto to T2V');
  assert.equal(allExcluded.context.assets.length, 0);
  const mixedAutoPrefs = {
    ...confirmedPrefs,
    taskMode: 'auto', task: undefined,
    assets: { [assets[0].binding_id]: { role: 'first_frame' } },
  };
  mixedAutoPrefs.mappingFingerprint = enhancement.enhancementMappingFingerprint(assets, mixedAutoPrefs);
  const mixedAuto = enhancement.buildEnhancementContext(workflow, values, profile, mixedAutoPrefs);
  assert.match(mixedAuto.error, /mix keyframe.*reference/i, 'Auto does not guess mixed roles');

  const h3Last = {
    ...workflow,
    config: [...workflow.config, { name: 'duration_seconds', node_id: '5', input_name: 'duration_seconds', type: 'float', default: 6 }],
  };
  const lastPrefs = {
    ...prefs,
    task: 'i2v',
    referenceOrderConfirmed: true,
    assets: {
      [assets[0].binding_id]: { role: 'last_frame' },
      [assets[1].binding_id]: { include: false },
      [assets[2].binding_id]: { include: false },
      [assets[3].binding_id]: { include: false },
    },
  };
  lastPrefs.mappingFingerprint = enhancement.enhancementMappingFingerprint(assets, lastPrefs);
  const last = enhancement.buildEnhancementContext(h3Last, values, profile, lastPrefs);
  assert.equal(last.context.duration_seconds, 6);
  const badLastPrefs = {
    ...lastPrefs,
    assets: { ...lastPrefs.assets, [assets[0].binding_id]: { role: 'last_frame', ordinal: 2 } },
  };
  badLastPrefs.mappingFingerprint = enhancement.enhancementMappingFingerprint(assets, badLastPrefs);
  const badLast = enhancement.buildEnhancementContext(h3Last, values, profile, badLastPrefs);
  assert.match(badLast.error, /last-frame-only.*ordinal 1/i, 'local H3 last-only never silently renumbers');
  const flfPrefs = {
    ...prefs,
    task: 'i2v',
    referenceOrderConfirmed: true,
    assets: {
      [assets[0].binding_id]: { role: 'first_frame', ordinal: 1 },
      [assets[1].binding_id]: { role: 'last_frame', ordinal: 2 },
      [assets[2].binding_id]: { include: false },
      [assets[3].binding_id]: { include: false },
    },
  };
  flfPrefs.mappingFingerprint = enhancement.enhancementMappingFingerprint(assets, flfPrefs);
  const flf = enhancement.buildEnhancementContext(h3Last, values, profile, flfPrefs);
  assert.equal(flf.context.duration_seconds, 6);
  assert.equal(JSON.stringify(flf.context.assets.map(asset => [asset.role, asset.ordinal])), JSON.stringify([['first_frame', 1], ['last_frame', 2]]));
  const ltxProfile = {
    target_model: 'ltx_2.5', label: 'LTX-2.5', tasks: ['t2v', 'i2v'], default_dialect: 'ltx_native',
    dialects: [{ id: 'ltx_native', label: 'LTX native', tasks: ['t2v', 'i2v'], reference_style: 'natural_prose', requires_order_confirmation: false }], source_urls: [],
  };
  const ltxPrefs = {
    targetModel: 'ltx_2.5', referenceDialect: 'ltx_native', taskMode: 'manual', task: 'i2v', referenceOrderConfirmed: true,
    assets: { [assets[0].binding_id]: { role: 'last_frame' }, [assets[1].binding_id]: { include: false }, [assets[2].binding_id]: { include: false }, [assets[3].binding_id]: { include: false } },
  };
  ltxPrefs.mappingFingerprint = enhancement.enhancementMappingFingerprint(assets, ltxPrefs);
  const ltxLastOnly = enhancement.buildEnhancementContext(h3Last, values, ltxProfile, ltxPrefs);
  assert.match(ltxLastOnly.error, /first-frame.*last-frame-only/i);

  let request;
  let profileRequestPath;
  global.fetch = async (url, options) => {
    profileRequestPath = url;
    request = options?.body ? JSON.parse(options.body) : undefined;
    return { ok: true, json: async () => ({ success: true, enhanced_prompt: 'ok', profiles: [profile] }) };
  };
  const client = compile('CinemaPromptEngineering/frontend/src/api/client.ts', {
    "import.meta.env.PROD && import.meta.env.VITE_BUILD_MODE === 'comfyui'": 'false',
  });
  const profiles = await client.api.getPromptEnhancementProfiles();
  assert.equal(profileRequestPath, '/prompt-enhancement/profiles');
  assert.equal(profiles.profiles[0].target_model, 'minimax_h3');
  await client.api.enhancePrompt({
    userPrompt: 'prompt', llmProvider: 'local', llmModel: 'model', targetModel: 'minimax_h3',
    projectType: 'live_action', config: {},
    enhancementContext: {
      task: 'ref2v', referenceDialect: 'local_h3', assets: [{
        bindingId: 'slot:1', kind: 'image', role: 'reference_image', ordinal: 2,
        label: 'Reference image', description: 'hero', referenceName: 'named',
      }], referenceOrderConfirmed: true,
    },
    credentials: {},
  });
  assert.equal(request.enhancement_context.task, 'ref2v');
  assert.equal(request.enhancement_context.reference_dialect, 'local_h3');
  assert.equal(request.enhancement_context.reference_order_confirmed, true);
  assert.equal(request.enhancement_context.assets.length, 1);
  assert.equal(request.enhancement_context.assets[0].binding_id, 'slot:1');
  assert.equal(request.enhancement_context.assets[0].value, undefined);
  assert.equal(request.enhancement_context.assets[0].url, undefined);
  assert.equal(request.enhancement_context.referenceDialect, undefined);

  const cpeSource = fs.readFileSync(path.join(root, 'CinemaPromptEngineering/frontend/src/CinemaPromptEngineering.tsx'), 'utf8');
  const cpeCallback = findVariable(cpeSource, 'CinemaPromptEngineering.tsx', 'handleEnhancePrompt');
  let resolveCpe;
  const cpeRevision = { current: 0 };
  const cpeRefs = {
    userPrompt: { current: 'original prompt' },
    targetModel: { current: 'generic' },
    projectType: { current: 'live_action' },
    enhancementDialect: { current: '' },
    enhancementConfig: { current: {} },
  };
  const cpeApplied = [];
  const cpeErrors = [];
  const cpeHandler = compileArrow(cpeCallback, {
    setEnhanceWarnings() {},
    userPrompt: cpeRefs.userPrompt.current,
    selectedLlmProvider: 'local', selectedLlmModel: 'model',
    configuredProviders: [{ providerId: 'local', credentials: {} }],
    setIsEnhancing() {}, setEnhanceError: error => cpeErrors.push(error),
    targetModel: cpeRefs.targetModel.current, projectType: cpeRefs.projectType.current,
    liveActionConfig: {}, animationConfig: {}, enhancementProfiles: [],
    enhancementDialect: cpeRefs.enhancementDialect.current,
    enhancementRevisionRef: cpeRevision,
    userPromptRef: cpeRefs.userPrompt,
    targetModelRef: cpeRefs.targetModel,
    projectTypeRef: cpeRefs.projectType,
    enhancementDialectRef: cpeRefs.enhancementDialect,
    enhancementConfigRef: cpeRefs.enhancementConfig,
    getSelectedLlmSettings: () => ({ provider: 'local', model: 'model' }),
    getConfiguredProviders: () => [{ providerId: 'local', credentials: {} }],
    api: { enhancePrompt: () => new Promise(resolve => { resolveCpe = resolve; }) },
    setEnhancedPrompt: prompt => cpeApplied.push(prompt),
  });
  const cpePromise = cpeHandler();
  cpeRefs.userPrompt.current = 'edited prompt';
  cpeRevision.current += 1;
  resolveCpe({ success: true, enhanced_prompt: 'stale CPE result' });
  await cpePromise;
  assert.deepEqual(cpeApplied, [], 'CPE refs reject a late enhanced prompt after a rerender/edit');
  assert.match(cpeErrors.at(-1), /discarded/i);

  let callbackOptions;
  const callbackPreferences = {
    ...prefs,
    taskMode: 'manual',
    task: 'i2v',
    referenceOrderConfirmed: true,
    assets: {
      [assets[0].binding_id]: { role: 'first_frame' },
      [assets[1].binding_id]: { include: false },
      [assets[2].binding_id]: { include: false },
      [assets[3].binding_id]: { include: false },
    },
  };
  callbackPreferences.mappingFingerprint = enhancement.enhancementMappingFingerprint(assets, callbackPreferences);
  const storyboardSource = fs.readFileSync(path.join(root, 'CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx'), 'utf8');
  const callback = compileArrow(findVariable(storyboardSource, 'StoryboardUI.tsx', 'handleEnhancePrompt'), {
    api: { enhancePrompt: async options => { callbackOptions = options; return { success: true, enhanced_prompt: structuredThreeOutput }; } },
    panelsRef: { current: [{ id: 1, workflowId: 'workflow-a', parameterValues: values, enhancementPreferences: { ...callbackPreferences, targetModel: 'minimax_h3', referenceDialect: 'local_h3', referenceOrderConfirmed: true } }] },
    selectedPanelIdRef: { current: 1 },
    parameterValuesRef: { current: values },
    enhancementPreferencesRef: { current: { ...callbackPreferences, targetModel: 'minimax_h3', referenceDialect: 'local_h3', referenceOrderConfirmed: true } },
    selectedWorkflowIdRef: { current: 'workflow-a' },
    workflowsRef: { current: [{ id: 'workflow-a', workflow: workflow.workflow, config: workflow.config }] },
    enhancementProfiles: [profile],
    enhancementProfilesLoading: false,
    enhancementProfilesError: null,
    enhancementRequestRevisionRef: { current: 0 },
    enhancementProjectTypeRef: { current: 'live_action' },
    enhancementConfigRef: { current: {} },
    getSelectedLlmSettings: () => ({ provider: 'local', model: 'model' }),
    loadTargetModel: () => 'legacy-image',
    getConfiguredProviders: () => [{ providerId: 'local', credentials: {} }],
    updateSavedOAuthToken() {},
    showInfo() {},
    showWarning() {},
    showError(message) { throw new Error(message); },
    buildEnhancementContext: enhancement.buildEnhancementContext,
  });
  await callback('prompt', 'prompt');
  assert.equal(callbackOptions.enhancementContext.task, 'i2v');
  assert.equal(callbackOptions.enhancementContext.assets[0].bindingId, 'media:4:first_frame');
  assert.equal(callbackOptions.enhancementContext.assets[0].value, undefined);

  const callbackExpression = findVariable(storyboardSource, 'StoryboardUI.tsx', 'handleEnhancePrompt');
  function makeHandler(apiImpl, state, providerToken = 'old-token', currentProviderToken = providerToken, onToken = () => {}, onWarning = () => {}, options = {}) {
    return compileArrow(options.handlerSource || callbackExpression, {
      api: { enhancePrompt: apiImpl },
      panelsRef: { current: [{ id: 1, workflowId: 'workflow-a', parameterValues: state.values, enhancementPreferences: callbackPreferences }] },
      selectedPanelIdRef: { current: 1 },
      parameterValuesRef: { current: state.values },
      enhancementPreferencesRef: { current: callbackPreferences },
      selectedWorkflowIdRef: { current: 'workflow-a' },
      workflowsRef: { current: [{ id: 'workflow-a', category: options.video ? 'video-generation' : 'image-generation', workflow: workflow.workflow, config: workflow.config }] },
      enhancementProfiles: options.profiles || [profile], enhancementProfilesLoading: options.loading || false, enhancementProfilesError: options.profileError || null,
      enhancementRequestRevisionRef: state.revision,
      enhancementProjectTypeRef: { current: 'live_action' }, enhancementConfigRef: { current: {} },
      getSelectedLlmSettings: () => ({ provider: 'local', model: 'model' }),
      loadTargetModel: () => 'legacy-image',
      getConfiguredProviders: (() => {
        let calls = 0;
        return () => [{ providerId: 'local', credentials: { oauthToken: calls++ === 0 ? providerToken : currentProviderToken } }];
      })(),
      updateSavedOAuthToken: onToken,
      showInfo() {}, showWarning: onWarning, showError(message) { options.onError?.(message); },
      buildEnhancementContext: enhancement.buildEnhancementContext,
    });
  }
  let resolveStale;
  const staleTokens = [];
  const staleState = { values: { ...values }, revision: { current: 0 } };
  const staleHandler = makeHandler(() => new Promise(resolve => { resolveStale = resolve; }), staleState, 'old-token', 'old-token', (_provider, token) => staleTokens.push(token));
  const stalePromise = staleHandler('prompt', 'prompt');
  staleState.values.prompt = 'edited prompt';
  staleState.revision.current += 1;
  let staleToken;
  // The guarded OAuth refresh is applied even when content becomes stale.
  resolveStale({ success: true, enhanced_prompt: 'late', oauth_token: 'fresh-token' });
  assert.equal(await stalePromise, null);
  assert.deepEqual(staleTokens, ['fresh-token']);

  const failureTokens = [];
  const failureHandler = makeHandler(async () => ({ success: false, error: 'failed', oauth_token: 'failure-refresh' }), { values: { ...values }, revision: { current: 0 } }, 'old-token', 'old-token', (_provider, token) => failureTokens.push(token));
  await assert.rejects(() => failureHandler('prompt', 'prompt'), /failed/);
  assert.deepEqual(failureTokens, ['failure-refresh'], 'failed responses still propagate guarded OAuth refresh');
  const switchedTokens = [];
  const switchedHandler = makeHandler(async () => ({ success: true, enhanced_prompt: 'ok', oauth_token: 'switched' }), { values: { ...values }, revision: { current: 0 } }, 'old-token', 'different-account', (_provider, token) => switchedTokens.push(token));
  assert.equal(await switchedHandler('prompt', 'prompt'), 'ok');
  assert.deepEqual(switchedTokens, [], 'account switches cannot accept a stale OAuth token');
  const unavailableHandler = makeHandler(async () => ({ success: true, enhanced_prompt: 'must-not-submit' }), { values: { ...values }, revision: { current: 0 } }, 'old-token', 'old-token', () => {}, () => {}, { video: true, profiles: [], loading: true });
  await assert.rejects(() => unavailableHandler('prompt', 'prompt'), /still loading/);
  for (const state of [
    { loading: true, error: null, message: /still loading/ },
    { loading: false, error: 'network unavailable', message: /unavailable.*network unavailable.*Retry/i },
    { loading: false, error: null, message: /unavailable.*Retry/i },
  ]) {
    let calls = 0;
    const errors = [];
    const blocked = makeHandler(async () => { calls += 1; return { success: true, enhanced_prompt: 'must-not-submit' }; }, { values: { ...values }, revision: { current: 0 } }, 'old-token', 'old-token', () => {}, () => {}, {
      video: true, profiles: [], loading: state.loading, profileError: state.error, onError: message => errors.push(message),
    });
    await assert.rejects(() => blocked('prompt', 'prompt'), state.message);
    assert.equal(calls, 0, 'verified video enhancement must not call the API without its profile catalog');
    assert.match(errors.at(-1), state.message);
  }
  let legacyPayload;
  const legacyHandler = makeHandler(async options => {
    legacyPayload = options;
    return { success: true, enhanced_prompt: 'legacy accepted' };
  }, { values: { ...values }, revision: { current: 0 } }, 'old-token', 'old-token', () => {}, () => {}, { profiles: [], video: false });
  assert.equal(await legacyHandler('prompt', 'prompt'), 'legacy accepted');
  assert.equal(legacyPayload.enhancementContext, undefined, 'legacy image enhancement keeps the old context-free request');
  assert.equal(legacyPayload.targetModel, 'legacy-image');

  const profileFallbackMutationSource = callbackExpression.replace(
    'if (!profile && isVideoWorkflow) {',
    'if (false && isVideoWorkflow) {'
  );
  assert.notEqual(profileFallbackMutationSource, callbackExpression, 'profile fallback mutation target missing');
  let mutatedProfileCalls = 0;
  const mutatedProfileHandler = makeHandler(async () => {
    mutatedProfileCalls += 1;
    return { success: true, enhanced_prompt: 'must not submit' };
  }, { values: { ...values }, revision: { current: 0 } }, 'old-token', 'old-token', () => {}, () => {}, {
    video: true, profiles: [], handlerSource: profileFallbackMutationSource,
  });
  await assert.rejects(async () => {
    await mutatedProfileHandler('prompt', 'prompt');
    assert.equal(mutatedProfileCalls, 0, 'profile fallback mutation unexpectedly reached the provider');
  }, /profile fallback mutation unexpectedly reached/);

  const document = domHarness.installDom();
  const windowListeners = new Map();
  window.addEventListener = (type, listener) => windowListeners.set(type, listener);
  window.removeEventListener = type => windowListeners.delete(type);
  window.parent = window;
  window.innerWidth = 1280;
  global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const React = require(path.join(root, 'CinemaPromptEngineering/frontend/node_modules/react'));
  const { createRoot } = require(path.join(root, 'CinemaPromptEngineering/frontend/node_modules/react-dom/client'));
  const widgets = compile('CinemaPromptEngineering/frontend/src/storyboard/components/ParameterWidgets.tsx', {}, true, {
    'react': React,
    'react/jsx-runtime': require(path.join(root, 'CinemaPromptEngineering/frontend/node_modules/react/jsx-runtime')),
    '../services/workflow-parser': {},
    '../services/workflow-editor-options': { bindingKey: value => `${value.node_id}\\0${value.input_name}` },
    './ImageDropZone': { ImageDropZone: () => null },
    '../data/cameraAngleData': { parseAngleFromPrompt: () => null, removeAnglePrefix: value => value },
    './CameraAngleSelector': { default: () => null },
    '@/store': { useCinemaStore: () => ({ cpePromptForStoryboard: null, setCpePromptForStoryboard() {} }) },
    './ParameterWidgets.css': {},
  });

  let cpeFetchImpl;
  global.fetch = (...args) => cpeFetchImpl(...args);
  const cpeApi = compile('CinemaPromptEngineering/frontend/src/api/client.ts', {
    "import.meta.env.PROD && import.meta.env.VITE_BUILD_MODE === 'comfyui'": 'false',
  });
  const cpeStore = compile('CinemaPromptEngineering/frontend/src/store/index.ts', {}, false, {
    'zustand': require(path.join(root, 'CinemaPromptEngineering/frontend/node_modules/zustand')),
    '@/storyboard/services/session-recovery': { sessionDraftController: { update() {} } },
  });
  const settingsMock = {
    default: () => null,
    getConfiguredProviders: () => [{ providerId: 'local', credentials: {}, models: ['model'] }],
    getSelectedLlmSettings: () => ({ provider: 'local', model: 'model' }),
    loadTargetModel: () => 'generic',
    saveTargetModel() {},
    updateSavedOAuthToken() {},
  };
  const cpeCompileDependencies = {
    'react': React,
    'react/jsx-runtime': require(path.join(root, 'CinemaPromptEngineering/frontend/node_modules/react/jsx-runtime')),
    '@tanstack/react-query': { useQueries: ({ queries }) => queries.map(() => ({ data: undefined })) },
    '@/store': cpeStore,
    '@/api/client': cpeApi,
    '@/components/Settings': settingsMock,
  };
  const cpeModule = compile('CinemaPromptEngineering/frontend/src/CinemaPromptEngineering.tsx', {
    'import.meta.env.BASE_URL': '"/"',
  }, true, cpeCompileDependencies);
  const cpeStaleGuardMutation = compile('CinemaPromptEngineering/frontend/src/CinemaPromptEngineering.tsx', {
    'import.meta.env.BASE_URL': '"/"',
    'requestRevision === enhancementRevisionRef.current': 'true',
    'userPromptRef.current.trim() === requestedPrompt': 'true',
  }, true, cpeCompileDependencies);

  const widgetHost = document.createElement('div');
  document.body.appendChild(widgetHost);
  const widgetRoot = createRoot(widgetHost);
  const appliedPrompts = [];
  let resolveEnhancement;
  const widgetEnhance = () => new Promise(resolve => { resolveEnhancement = resolve; });
  await React.act(async () => widgetRoot.render(React.createElement(widgets.PromptWidget, {
    parameter: { name: 'prompt', input_name: 'prompt', node_id: '5', display_name: 'Prompt', type: 'prompt', default: '', description: '' },
    value: `integrated multimodal description
<Picture 1> subject <d>[English] literal</d>`,
    onChange: (_name, value) => { appliedPrompts.push(value); },
    onEnhance: widgetEnhance,
  })));
  const textarea = widgetHost.querySelector('textarea');
  assert.equal(textarea.value, `integrated multimodal description
<Picture 1> subject <d>[English] literal</d>`);
  const enhanceButton = widgetHost.querySelectorAll('button').find(button => button.textContent.includes('✨') && !button.textContent.includes('📐'));
  assert.ok(enhanceButton, `enhance button missing: ${widgetHost.textContent}`);
  await React.act(async () => enhanceButton.click());
  await React.act(async () => {
    const props = domHarness.getReactProps(textarea);
    textarea.value = 'edited prompt';
    props.onChange({ target: textarea, currentTarget: textarea, preventDefault() {}, stopPropagation() {} });
  });
  await React.act(async () => resolveEnhancement('stale enhanced'));
  await domHarness.flush();
  assert.equal(appliedPrompts.at(-1), 'edited prompt', 'PromptWidget must discard a late result after an edit');
  assert.equal(appliedPrompts.includes('stale enhanced'), false);
  await React.act(async () => widgetRoot.unmount());

  const productionHost = document.createElement('div');
  document.body.appendChild(productionHost);
  const productionRoot = createRoot(productionHost);
  const productionChanges = [];
  await React.act(async () => productionRoot.render(React.createElement(widgets.PromptWidget, {
    parameter: { name: 'prompt', input_name: 'prompt', node_id: '5', display_name: 'Prompt', type: 'prompt', default: '', description: '' },
    value: 'prompt', onChange: (_name, value) => productionChanges.push(value), onEnhance: callback,
  })));
  const productionButton = productionHost.querySelectorAll('button').find(button => button.textContent.includes('✨') && !button.textContent.includes('📐'));
  await React.act(async () => productionButton.click());
  await domHarness.flush();
  assert.equal(callbackOptions.enhancementContext.task, 'i2v');
  assert.equal(productionChanges.at(-1), structuredThreeOutput, 'mounted PromptWidget preserves accepted structured output');
  assert.equal(productionHost.querySelector('textarea').value, structuredThreeOutput, 'rendered textarea preserves newlines, tags, and dialogue markers exactly');
  await React.act(async () => productionRoot.unmount());

  const structuredHost = document.createElement('div');
  document.body.appendChild(structuredHost);
  const structuredRoot = createRoot(structuredHost);
  await React.act(async () => structuredRoot.render(React.createElement(widgets.PromptWidget, {
    parameter: { name: 'prompt', input_name: 'prompt', node_id: '5', display_name: 'Prompt', type: 'prompt', default: '', description: '' },
    value: 'reference prompt', onChange() {}, onEnhance: async () => structuredSixOutput,
  })));
  const structuredButton = structuredHost.querySelectorAll('button').find(button => button.textContent.includes('✨') && !button.textContent.includes('📐'));
  await React.act(async () => structuredButton.click());
  await domHarness.flush();
  assert.equal(structuredHost.querySelector('textarea').value, structuredSixOutput, 'rendered textarea preserves the complete six-section result');
  await React.act(async () => structuredRoot.unmount());
  document.body.removeChild(structuredHost);

  const parameterWidgetSource = fs.readFileSync(path.join(root, 'CinemaPromptEngineering/frontend/src/storyboard/components/ParameterWidgets.tsx'), 'utf8');
  const newlineFlattenMutationSource = parameterWidgetSource.replace(
    'setLocalValue(enhanced);',
    "setLocalValue(enhanced.replace(/\\n/g, ' '));"
  );
  assert.notEqual(newlineFlattenMutationSource, parameterWidgetSource, 'newline flattening mutation target missing');
  const flattenedWidgets = compile('CinemaPromptEngineering/frontend/src/storyboard/components/ParameterWidgets.tsx', {
    'setLocalValue(enhanced);': "setLocalValue(enhanced.replace(/\\n/g, ' '));",
  }, true, {
    'react': React,
    'react/jsx-runtime': require(path.join(root, 'CinemaPromptEngineering/frontend/node_modules/react/jsx-runtime')),
    '../services/workflow-parser': {},
    '../services/workflow-editor-options': { bindingKey: value => `${value.node_id}\\0${value.input_name}` },
    './ImageDropZone': { ImageDropZone: () => null },
    '../data/cameraAngleData': { parseAngleFromPrompt: () => null, removeAnglePrefix: value => value },
    './CameraAngleSelector': { default: () => null },
    '@/store': { useCinemaStore: () => ({ cpePromptForStoryboard: null, setCpePromptForStoryboard() {} }) },
    './ParameterWidgets.css': {},
  });
  const flattenedHost = document.createElement('div');
  document.body.appendChild(flattenedHost);
  const flattenedRoot = createRoot(flattenedHost);
  await React.act(async () => flattenedRoot.render(React.createElement(flattenedWidgets.PromptWidget, {
    parameter: { name: 'prompt', input_name: 'prompt', node_id: '5', display_name: 'Prompt', type: 'prompt', default: '', description: '' },
    value: 'prompt', onChange() {}, onEnhance: async () => structuredThreeOutput,
  })));
  const flattenedButton = flattenedHost.querySelectorAll('button').find(button => button.textContent.includes('✨') && !button.textContent.includes('📐'));
  await React.act(async () => flattenedButton.click());
  await domHarness.flush();
  assert.throws(
    () => assert.equal(flattenedHost.querySelector('textarea').value, structuredThreeOutput),
    /Expected values to be strictly equal/,
    'newline flattening mutation must fail the rendered textarea contract'
  );
  await React.act(async () => flattenedRoot.unmount());
  document.body.removeChild(flattenedHost);

  // Exercise the real CPE component/ref lifecycle. Each mutation occurs after
  // the provider request is pending, and each request body is captured before
  // that mutation so a valid late response cannot overwrite newer UI state.
  const cpeTargets = [
    { id: 'generic', name: 'Generic', category: 'General' },
    { id: 'minimax_h3', name: 'MiniMax H3', category: 'Video' },
  ];
  async function cpeChangeInput(element, value) {
    assert.ok(element, 'expected CPE input');
    await React.act(async () => {
      element.value = String(value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      const props = domHarness.getReactProps(element);
      if (props?.onChange) props.onChange({ target: element, currentTarget: element, preventDefault() {}, stopPropagation() {} });
    });
    await domHarness.flush();
  }
  async function cpeClick(element) {
    await React.act(async () => element.click());
    await domHarness.flush();
  }
  async function runCpeStaleScenario(change, Component = cpeModule.default, expectDiscarded = true) {
    cpeStore.useCinemaStore.getState().resetSession();
    let requestBody;
    let resolveRequest;
    cpeFetchImpl = async (url, options) => {
      if (options?.method === 'POST') {
        requestBody = JSON.parse(options.body);
        return new Promise(resolve => { resolveRequest = resolve; });
      }
      if (String(url).endsWith('/target-models')) return { ok: true, json: async () => cpeTargets };
      if (String(url).endsWith('/prompt-enhancement/profiles')) return { ok: true, json: async () => ({ profiles: [profile] }) };
      if (String(url).endsWith('/presets/live-action') || String(url).endsWith('/presets/animation')) return { ok: true, json: async () => ({ presets: [] }) };
      return { ok: true, json: async () => ({}) };
    };
    const cpeHost = document.createElement('div');
    document.body.appendChild(cpeHost);
    assert.ok(Array.isArray(cpeStore.useCinemaStore.getState().liveActionPresetList));
    const cpeRoot = createRoot(cpeHost);
    await React.act(async () => cpeRoot.render(React.createElement(Component)));
    await domHarness.flush();
    const promptInput = cpeHost.querySelector('.toolbar-prompt');
    await cpeChangeInput(promptInput, 'scene with <Picture 1> and dialogue');
    const targetInput = cpeHost.querySelectorAll('select').find(select => select.className.includes('toolbar-model'));
    await cpeChangeInput(targetInput, 'minimax_h3');
    await domHarness.flush();
    if (change === 'dialect') {
      const dialectInput = cpeHost.querySelectorAll('select').find(select => select.getAttribute('aria-label') === 'Enhancement dialect');
      assert.ok(dialectInput, 'CPE dialect control did not render from the merged profile response');
    }
    const enhanceButton = cpeHost.querySelectorAll('button').find(button => button.textContent.includes('Enhance with AI'));
    assert.ok(enhanceButton, 'CPE Enhance with AI action is not rendered');
    await React.act(async () => enhanceButton.click());
    await domHarness.flush();
    assert.ok(requestBody, 'CPE did not submit the captured request');
    assert.equal(requestBody.target_model, 'minimax_h3');
    assert.equal(requestBody.user_prompt, 'scene with <Picture 1> and dialogue');
    assert.equal(requestBody.enhancement_context.reference_dialect, 'local_h3');
    assert.equal(requestBody.project_type, 'live_action');
    const initialConfig = JSON.stringify(requestBody.config);
    if (change === 'prompt') {
      await cpeChangeInput(promptInput, 'new prompt after submit');
    } else if (change === 'target') {
      await cpeChangeInput(targetInput, 'generic');
    } else if (change === 'config') {
      const configInput = cpeHost.querySelectorAll('select').find(select => !select.className.includes('toolbar-model'));
      assert.ok(configInput, 'CPE config control did not render');
      await cpeChangeInput(configInput, 'Film');
      assert.equal(configInput.value, 'Film');
    } else if (change === 'projectType') {
      const animationButton = cpeHost.querySelectorAll('button').find(button => button.textContent.includes('Animation'));
      assert.ok(animationButton, 'CPE project-type control did not render');
      await cpeClick(animationButton);
    } else {
      const dialectInput = cpeHost.querySelectorAll('select').find(select => select.getAttribute('aria-label') === 'Enhancement dialect');
      await cpeChangeInput(dialectInput, 'minimax_api');
    }
    await React.act(async () => {
      resolveRequest({ ok: true, json: async () => ({ success: true, enhanced_prompt: structuredThreeOutput }) });
      await domHarness.flush();
    });
    const outputAreas = cpeHost.querySelectorAll('textarea');
    if (expectDiscarded) {
      assert.notEqual(outputAreas[2].value, structuredThreeOutput, `CPE accepted stale ${change} response`);
      assert.match(outputAreas[2].value, /Click "Enhance with AI"/);
    }
    const output = outputAreas[2].value;
    if (change === 'config') assert.equal(JSON.stringify(requestBody.config), initialConfig, 'request metadata must stay frozen at submit time');
    await React.act(async () => cpeRoot.unmount());
    document.body.removeChild(cpeHost);
    return output;
  }
  for (const change of ['prompt', 'target', 'config', 'projectType', 'dialect']) await runCpeStaleScenario(change);
  const staleMutationOutput = await runCpeStaleScenario('prompt', cpeStaleGuardMutation.default, false);
  let staleMutationError;
  try { assert.notEqual(staleMutationOutput, structuredThreeOutput); } catch (error) { staleMutationError = error; }
  assert.ok(staleMutationError, 'stale-ref guard mutation must fail the mounted CPE behavioral assertion');

  const controls = compile('CinemaPromptEngineering/frontend/src/storyboard/components/PromptEnhancementControls.tsx', {}, true, {
    'react': React,
    'react/jsx-runtime': require(path.join(root, 'CinemaPromptEngineering/frontend/node_modules/react/jsx-runtime')),
    '../services/prompt-enhancement': enhancement,
  });
  const profileStateHost = document.createElement('div');
  document.body.appendChild(profileStateHost);
  const profileStateRoot = createRoot(profileStateHost);
  let retryProfiles = 0;
  const profileProps = {
    assets: [], preferences: { targetModel: 'minimax_h3', referenceDialect: 'local_h3', taskMode: 'auto', referenceOrderConfirmed: false },
    onChange() {}, onRetryProfiles: () => { retryProfiles += 1; },
  };
  await React.act(async () => profileStateRoot.render(React.createElement(controls.PromptEnhancementControls, {
    ...profileProps, profiles: [], profilesLoading: true,
  })));
  assert.match(profileStateHost.textContent, /Loading verified video enhancement profiles/);
  await React.act(async () => profileStateRoot.render(React.createElement(controls.PromptEnhancementControls, {
    ...profileProps, profiles: [], profilesLoading: false, profilesError: 'catalog unavailable',
  })));
  assert.match(profileStateHost.textContent, /catalog unavailable/);
  const retryButton = profileStateHost.querySelectorAll('button').find(button => button.textContent.includes('Retry'));
  assert.ok(retryButton, 'profile error must provide a retry action');
  await React.act(async () => retryButton.click());
  assert.equal(retryProfiles, 1);
  await React.act(async () => profileStateRoot.unmount());
  document.body.removeChild(profileStateHost);

  const controlsHost = document.createElement('div');
  document.body.appendChild(controlsHost);
  const controlsRoot = createRoot(controlsHost);
  let changedPreferences;
  await React.act(async () => controlsRoot.render(React.createElement(controls.PromptEnhancementControls, {
    profiles: [profile],
    assets: [
      { binding_id: 'first', kind: 'image', role: 'reference_image', ordinal: 1, label: 'First', valueFingerprint: '1:x', ambiguous: true, include: true },
    ],
    preferences: { targetModel: 'minimax_h3', referenceDialect: 'local_h3', taskMode: 'auto', referenceOrderConfirmed: false },
    onChange: value => { changedPreferences = value; },
    durationSeconds: 6,
  })));
  assert.match(controlsHost.textContent, /Metadata only/);
  const roleSelect = controlsHost.querySelectorAll('select')[3];
  assert.ok(roleSelect, 'mounted controls role select missing');
  await React.act(async () => {
    const props = domHarness.getReactProps(roleSelect);
    props.onChange({ target: { value: 'first_frame' }, currentTarget: roleSelect });
  });
  assert.equal(changedPreferences.assets.first.role, 'first_frame', 'mounted controls register role overrides');
  assert.equal(enhancement.resolveEnhancementTask(changedPreferences.taskMode, changedPreferences.task, enhancement.effectiveEnhancementAssets([
    { binding_id: 'first', kind: 'image', role: 'reference_image', ordinal: 1, label: 'First', valueFingerprint: '1:x', ambiguous: true, include: true },
  ], changedPreferences)), 'i2v', 'mounted Auto control resolves an explicit first-frame role to I2V');
  await React.act(async () => controlsRoot.unmount());

  // Mount the real consumer wiring: production preference updates feed the
  // production storyboard handler, which uses the real API client.
  const storyboardProductionSource = fs.readFileSync(path.join(root, 'CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx'), 'utf8');
  assert.equal(findJsxAttribute(storyboardProductionSource, 'StoryboardUI.tsx', 'ParameterPanel', 'onEnhancePrompt'), 'handleEnhancePrompt');

  const flowWorkflow = {
    id: 'video-workflow',
    category: 'video-generation',
    workflow: {
      '1': { class_type: 'LoadImage', inputs: { image: 'first.png' } },
      '2': { class_type: 'MiniMaxH3ReferenceToVideo', inputs: { reference_image: ['1', 0] } },
    },
    config: [{ name: 'first_input', node_id: '1', input_name: 'image', type: 'image' }],
  };
  const flowValues = { first_input: 'data:image/png;base64:local-only', prompt: 'user style intent' };
  const flowAssets = enhancement.discoverEnhancementAssets(flowWorkflow, flowValues);
  assert.equal(flowAssets.length, 1);
  assert.equal(flowAssets[0].role, 'reference_image');
  const rawTaskMutation = compile('CinemaPromptEngineering/frontend/src/storyboard/services/prompt-enhancement.ts', {
    "return hasFrame ? 'i2v' : 'ref2v';": "return 't2v';",
  });
  const rawTaskMutationPreferences = {
    targetModel: 'minimax_h3', referenceDialect: 'local_h3', taskMode: 'auto', referenceOrderConfirmed: true,
    assets: { [flowAssets[0].binding_id]: { role: 'first_frame' } },
  };
  rawTaskMutationPreferences.mappingFingerprint = rawTaskMutation.enhancementMappingFingerprint(flowAssets, rawTaskMutationPreferences);
  const rawTaskMutationResult = rawTaskMutation.buildEnhancementContext(flowWorkflow, flowValues, profile, rawTaskMutationPreferences);
  assert.throws(
    () => assert.equal(rawTaskMutationResult.context?.task, 'i2v'),
    /Expected values to be strictly equal/,
    'raw Auto-task mutation must fail the mounted consumer contract'
  );
  const flowProfile = { ...profile, dialects: [{ ...profile.dialects[0], requires_order_confirmation: true }] };
  const flowStoryboardRefs = {
    enhancementRequestRevisionRef: { current: 0 },
    selectedPanelIdRef: { current: 1 },
    panelsRef: { current: [] },
    selectedWorkflowIdRef: { current: flowWorkflow.id },
    workflowsRef: { current: [flowWorkflow] },
    parameterValuesRef: { current: flowValues },
    enhancementPreferencesRef: { current: null },
  };
  let setFlowPreferences = () => {};
  const preferenceCallback = compileArrow(findVariable(storyboardProductionSource, 'StoryboardUI.tsx', 'handleEnhancementPreferencesChange'), {
    ...flowStoryboardRefs,
    setEnhancementPreferences: value => setFlowPreferences(value),
    setPanels: updater => { flowStoryboardRefs.panelsRef.current = updater(flowStoryboardRefs.panelsRef.current); },
    enhancementMappingFingerprint: enhancement.enhancementMappingFingerprint,
    discoverEnhancementAssets: enhancement.discoverEnhancementAssets,
  });
  let fetchImpl;
  let capturedFlowRequest;
  let resolveFlowRequest;
  global.fetch = (...args) => fetchImpl(...args);
  fetchImpl = async (url, options) => {
    if (options?.method === 'POST') {
      capturedFlowRequest = { url, body: JSON.parse(options.body) };
      return new Promise(resolve => { resolveFlowRequest = resolve; });
    }
    return { ok: true, json: async () => ({ profiles: [flowProfile] }) };
  };
  const flowClient = compile('CinemaPromptEngineering/frontend/src/api/client.ts', {
    "import.meta.env.PROD && import.meta.env.VITE_BUILD_MODE === 'comfyui'": 'false',
  });
  let flowHandler;
  const flowHandlerGlobals = {
    api: flowClient.api,
    ...flowStoryboardRefs,
    enhancementProfiles: [flowProfile],
    enhancementProfilesLoading: false,
    enhancementProfilesError: null,
    enhancementRequestRevisionRef: { current: 0 },
    enhancementProjectTypeRef: { current: 'live_action' },
    enhancementConfigRef: { current: {} },
    getSelectedLlmSettings: () => ({ provider: 'openai', model: 'model' }),
    getConfiguredProviders: () => [{ providerId: 'openai', credentials: { apiKey: 'fake-key' } }],
    loadTargetModel: () => 'legacy-image',
    updateSavedOAuthToken() {},
    showInfo() {},
    showWarning() {},
    showError(message) { throw new Error(message); },
    buildEnhancementContext: enhancement.buildEnhancementContext,
  };
  flowHandler = compileArrow(findVariable(storyboardProductionSource, 'StoryboardUI.tsx', 'handleEnhancePrompt'), flowHandlerGlobals);
  flowStoryboardRefs.panelsRef.current = [{ id: 1, workflowId: flowWorkflow.id, parameterValues: flowValues, enhancementPreferences: null }];
  function MountedEnhancementFlow() {
    const initial = {
      targetModel: 'minimax_h3', referenceDialect: 'local_h3', taskMode: 'auto',
      referenceOrderConfirmed: false,
    };
    const [preferences, setPreferences] = React.useState(initial);
    setFlowPreferences = setPreferences;
    flowStoryboardRefs.enhancementPreferencesRef.current = preferences;
    flowStoryboardRefs.panelsRef.current[0].enhancementPreferences = preferences;
    const onPreferenceChange = next => preferenceCallback(next);
    const assets = flowAssets.map(asset => ({ ...asset, ambiguous: true }));
    return React.createElement('div', null,
      React.createElement(controls.PromptEnhancementControls, {
        profiles: [flowProfile], assets, preferences,
        onChange: next => { onPreferenceChange(next); },
      }),
      React.createElement(widgets.PromptWidget, {
        parameter: { name: 'prompt', input_name: 'prompt', node_id: 'prompt', display_name: 'Prompt', type: 'prompt', default: '', description: '' },
        value: 'user style intent',
        onChange() {},
        onEnhance: flowHandler,
      }),
    );
  }

  async function runMountedFlow(mode) {
    const excludeAll = mode === 't2v';
    capturedFlowRequest = undefined;
    resolveFlowRequest = undefined;
    const flowHost = document.createElement('div');
    document.body.appendChild(flowHost);
    const flowRoot = createRoot(flowHost);
    await React.act(async () => flowRoot.render(React.createElement(MountedEnhancementFlow, { key: mode })));
    const asset = flowHost.querySelector('.prompt-enhancement-asset');
    if (excludeAll) {
      const include = asset.querySelector('input[type="checkbox"]');
      await React.act(async () => include.click());
    } else if (mode === 'i2v') {
      const role = asset.querySelector('select');
      const props = domHarness.getReactProps(role);
      await React.act(async () => props.onChange({ target: { value: 'first_frame' }, currentTarget: role }));
      const confirm = flowHost.querySelectorAll('input').find(input => input.getAttribute('aria-label') === 'Confirm media mapping');
      assert.ok(confirm, `confirmation control missing after role change: ${flowHost.textContent}`);
      await React.act(async () => confirm.click());
    } else {
      const confirm = flowHost.querySelectorAll('input').find(input => input.getAttribute('aria-label') === 'Confirm media mapping');
      assert.ok(confirm, 'reference mapping confirmation control missing');
      await React.act(async () => confirm.click());
    }
    const enhanceButton = Array.from(flowHost.querySelectorAll('button')).find(button => button.textContent.includes('✨') && !button.textContent.includes('📐'));
    assert.ok(enhanceButton, 'mounted consumer enhance action missing');
    await React.act(async () => enhanceButton.click());
    await domHarness.flush();
    assert.ok(capturedFlowRequest, 'mounted consumer did not reach the real API client');
    const context = capturedFlowRequest.body.enhancement_context;
    if (excludeAll) {
      assert.equal(context.task, 't2v');
      assert.deepEqual(context.assets, []);
    } else if (mode === 'i2v') {
      assert.equal(context.task, 'i2v', 'ambiguous image promoted to first-frame must submit I2V');
      assert.equal(context.assets[0].role, 'first_frame');
      assert.equal(context.assets[0].ordinal, 1);
    } else {
      assert.equal(context.task, 'ref2v', 'unmodified reference image with Auto must submit R2V');
      assert.equal(context.assets[0].role, 'reference_image');
    }
    await React.act(async () => {
      resolveFlowRequest({ ok: true, json: async () => ({ success: true, enhanced_prompt: 'accepted' }) });
      await domHarness.flush();
    });
    const submitted = capturedFlowRequest.body;
    await React.act(async () => flowRoot.unmount());
    document.body.removeChild(flowHost);
    return submitted;
  }
  const mountedI2vPayload = await runMountedFlow('i2v');
  const mountedT2vPayload = await runMountedFlow('t2v');
  const mountedRef2vPayload = await runMountedFlow('ref2v');

  const backendScript = `
import json, sys
from fastapi.testclient import TestClient
from api import main
import importlib
llm = importlib.import_module('api.providers.llm_service')

class Response:
    status = 200
    headers = {'Content-Type': 'application/json'}
    def __init__(self, data): self.data = data
    async def __aenter__(self): return self
    async def __aexit__(self, *args): return None
    async def json(self): return self.data
    async def text(self): return json.dumps(self.data)

class Session:
    def __init__(self, content): self.content, self.calls = content, []
    async def __aenter__(self): return self
    async def __aexit__(self, *args): return None
    def post(self, url, **kwargs):
        self.calls.append({'url': url, 'json': kwargs.get('json')})
        return Response({'choices': [{'message': {'content': self.content}, 'finish_reason': 'stop'}]})

for payload in json.load(sys.stdin):
    content = ('integrated_multimodal_description: [Shot 1] <d>[English] literal words</d>\\n\\noverall_soundscape: N/A\\n\\nnon_diegetic_music: N/A'
               if payload['enhancement_context']['task'] == 't2v' else
               'subject_definitions:\\n<Subject 1> derives from <Picture 1>.\\nsummary:\\n[reference generation] Use <Subject 1>.\\nretention_analysis:\\n<Subject 1>: fully_preserved\\ndetailed_description:\\n[Shot 1] <Subject 1> remains in the supplied setting.\\noverall_soundscape:\\nN/A\\nnon_diegetic_music:\\nN/A')
    session = Session(content)
    llm.aiohttp.ClientSession = lambda: session
    response = TestClient(main.app).post('/enhance-prompt', json=payload)
    assert response.status_code == 200, response.text
    assert response.json()['success'] is True, response.json()
    assert session.calls and session.calls[0]['json']['max_tokens'] == 4096
    assert '# MiniMax H3 prompt guide' in session.calls[0]['json']['messages'][0]['content']
    assert 'PROMPT DIALECT: local_h3' in session.calls[0]['json']['messages'][1]['content']
    if payload['enhancement_context']['task'] == 'ref2v':
        assert '<Picture 1>' in session.calls[0]['json']['messages'][1]['content']
print('backend bridge passed')
`;
  const pythonCommand = process.env.PYTHON || 'uv';
  const pythonArgs = pythonCommand === 'uv'
    ? ['run', '--no-project', '--python', '3.11', '--with-requirements', 'requirements-dev.txt', 'python', '-c', backendScript]
    : ['-c', backendScript];
  const backendBridge = spawnSync(pythonCommand, pythonArgs, {
    cwd: root,
    env: { ...process.env, PYTHONPATH: path.join(root, 'CinemaPromptEngineering') },
    input: JSON.stringify([mountedT2vPayload, mountedRef2vPayload]), encoding: 'utf8',
  });
  assert.equal(backendBridge.status, 0, backendBridge.stderr || backendBridge.stdout);
  assert.match(backendBridge.stdout, /backend bridge passed/);
  assert.equal(mountedI2vPayload.enhancement_context.task, 'i2v');
  console.log('Prompt enhancement frontend regression passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
