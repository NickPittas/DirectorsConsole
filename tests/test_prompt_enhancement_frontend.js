'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(path.join(__dirname, '..', 'CinemaPromptEngineering/frontend/node_modules/typescript'));
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
  for (const [from, to] of Object.entries(replacements)) source = source.replace(from, to);
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
    fetch: global.fetch,
    URL,
  }, { filename: file });
  return module.exports;
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
      '4': { class_type: 'MiniMaxH3ReferenceVideo', inputs: { first_frame: ['1', 0], reference_image: ['2', 0] } },
      '5': { class_type: 'MiniMaxH3TextToVideo', inputs: { prompt: 'keep' } },
      '6': { class_type: 'CustomReferenceNode', inputs: { reference_image: 'loose.png' } },
    },
    config: [
      { name: 'first_input', node_id: '1', input_name: 'image', type: 'image' },
      { name: 'second_input', node_id: '2', input_name: 'image', type: 'image' },
      { name: 'mask_input', node_id: '3', input_name: 'image', type: 'image' },
      { name: 'first_frame', node_id: '4', input_name: 'first_frame', type: 'image' },
      { name: 'reference_image', node_id: '4', input_name: 'reference_image', type: 'image' },
      { name: 'loose_input', node_id: '6', input_name: 'reference_image', type: 'image' },
    ],
  };
  const values = { prompt: 'prompt', first_input: 'data:image/png;base64,local-a', second_input: 'data:image/png;base64,local-b', mask_input: 'data:image/png;base64,mask', loose_input: 'data:image/png;base64,loose' };
  const assets = enhancement.discoverEnhancementAssets(workflow, values);
  assert.equal(assets.length, 3, 'only enabled populated media bindings should be discovered');
  assert.equal(JSON.stringify(assets.map(asset => asset.ordinal)), JSON.stringify([1, 2, 3]));
  assert.equal(assets.some(asset => asset.role === 'first_frame'), true, 'verified native H3 destination establishes first frame');
  assert.equal(assets.some(asset => asset.ambiguous), true, 'generic reference mapping remains explicitly ambiguous');
  assert.equal(Object.values(assets[0]).some(value => typeof value === 'string' && value.includes('data:image')), false, 'asset values never enter metadata');

  const prefs = {
    targetModel: 'minimax_h3', referenceDialect: 'local_h3', taskMode: 'manual', task: 'ref2v', referenceOrderConfirmed: false,
    assets: { [assets[0].binding_id]: { role: 'reference_image' } },
  };
  const blocked = enhancement.buildEnhancementContext(workflow, values, profile, prefs);
  assert.match(blocked.error, /confirm/i, 'ambiguous mapping blocks enhancement');
  const confirmed = enhancement.buildEnhancementContext(workflow, values, {
    ...profile,
    dialects: [{ ...profile.dialects[0], requires_order_confirmation: false }],
  }, { ...prefs, referenceOrderConfirmed: true });
  assert.equal(confirmed.context.task, 'ref2v');
  assert.equal(JSON.stringify(confirmed.context.assets.map(asset => asset.ordinal)), JSON.stringify([1, 2, 3]));
  assert.equal(Object.prototype.hasOwnProperty.call(confirmed.context.assets[0], 'value'), false);
  const changed = enhancement.buildEnhancementContext(workflow, { ...values, loose_input: 'changed-local-value' }, {
    ...profile,
    dialects: [{ ...profile.dialects[0], requires_order_confirmation: false }],
  }, { ...prefs, referenceOrderConfirmed: true });
  assert.notEqual(changed.mappingFingerprint, confirmed.mappingFingerprint, 'editing a reference invalidates the mapping fingerprint');
  const excluded = enhancement.buildEnhancementContext(workflow, values, {
    ...profile,
    dialects: [{ ...profile.dialects[0], requires_order_confirmation: false }],
  }, { ...prefs, referenceOrderConfirmed: true, assets: { [assets[0].binding_id]: { include: false } } });
  assert.equal(JSON.stringify(excluded.context.assets.map(asset => asset.ordinal)), JSON.stringify([2, 3]), 'excluding media never renumbers original ordinals');

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
    },
  };
  const last = enhancement.buildEnhancementContext(h3Last, values, profile, lastPrefs);
  assert.equal(last.context.duration_seconds, 6);
  const badLast = enhancement.buildEnhancementContext(h3Last, values, profile, {
    ...lastPrefs,
    assets: { ...lastPrefs.assets, [assets[0].binding_id]: { role: 'last_frame', ordinal: 2 } },
  });
  assert.match(badLast.error, /last-frame-only.*ordinal 1/i, 'local H3 last-only never silently renumbers');
  const flf = enhancement.buildEnhancementContext(h3Last, values, profile, {
    ...prefs,
    task: 'i2v',
    referenceOrderConfirmed: true,
    assets: {
      [assets[0].binding_id]: { role: 'first_frame', ordinal: 1 },
      [assets[1].binding_id]: { role: 'last_frame', ordinal: 2 },
      [assets[2].binding_id]: { include: false },
    },
  });
  assert.equal(flf.context.duration_seconds, 6);
  assert.equal(JSON.stringify(flf.context.assets.map(asset => [asset.role, asset.ordinal])), JSON.stringify([['first_frame', 1], ['last_frame', 2]]));
  const ltxLastOnly = enhancement.buildEnhancementContext(h3Last, values, {
    target_model: 'ltx_2.5', label: 'LTX-2.5', tasks: ['t2v', 'i2v'], default_dialect: 'ltx_native',
    dialects: [{ id: 'ltx_native', label: 'LTX native', tasks: ['t2v', 'i2v'], reference_style: 'natural_prose', requires_order_confirmation: false }], source_urls: [],
  }, {
    targetModel: 'ltx_2.5', referenceDialect: 'ltx_native', taskMode: 'manual', task: 'i2v', referenceOrderConfirmed: true,
    assets: { [assets[0].binding_id]: { role: 'last_frame' }, [assets[1].binding_id]: { include: false }, [assets[2].binding_id]: { include: false } },
  });
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

  let callbackOptions;
  const storyboardSource = fs.readFileSync(path.join(root, 'CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx'), 'utf8');
  const callback = compileArrow(findVariable(storyboardSource, 'StoryboardUI.tsx', 'handleEnhancePrompt'), {
    api: { enhancePrompt: async options => { callbackOptions = options; return { success: true, enhanced_prompt: 'enhanced' }; } },
    panelsRef: { current: [{ id: 1, workflowId: 'workflow-a', parameterValues: values, enhancementPreferences: { ...prefs, targetModel: 'minimax_h3', referenceDialect: 'local_h3', referenceOrderConfirmed: true } }] },
    selectedPanelIdRef: { current: 1 },
    parameterValuesRef: { current: values },
    enhancementPreferencesRef: { current: { ...prefs, targetModel: 'minimax_h3', referenceDialect: 'local_h3', referenceOrderConfirmed: true } },
    selectedWorkflowIdRef: { current: 'workflow-a' },
    workflowsRef: { current: [{ id: 'workflow-a', workflow: workflow.workflow, config: workflow.config }] },
    enhancementProfiles: [profile],
    getSelectedLlmSettings: () => ({ provider: 'local', model: 'model' }),
    getConfiguredProviders: () => [{ providerId: 'local', credentials: {} }],
    updateSavedOAuthToken() {},
    showInfo() {},
    showWarning() {},
    showError(message) { throw new Error(message); },
    buildEnhancementContext: enhancement.buildEnhancementContext,
  });
  await callback('prompt', 'prompt');
  assert.equal(callbackOptions.enhancementContext.task, 'ref2v');
  assert.equal(callbackOptions.enhancementContext.assets[0].bindingId, 'media:4:first_frame');
  assert.equal(callbackOptions.enhancementContext.assets[0].value, undefined);

  const React = require(path.join(root, 'CinemaPromptEngineering/frontend/node_modules/react'));
  const server = require(path.join(root, 'CinemaPromptEngineering/frontend/node_modules/react-dom/server'));
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
  const markup = server.renderToStaticMarkup(React.createElement(widgets.ParameterWidget, {
    parameter: { name: 'prompt', input_name: 'prompt', node_id: '5', display_name: 'Prompt', type: 'prompt', default: '', description: '' },
    value: 'integrated multimodal description\n<Picture 1> subject <d>[English] literal</d>',
    onChange() {},
  }));
  assert.match(markup, /integrated multimodal description/);
  assert.match(markup, /&lt;Picture 1&gt;/);
  assert.match(markup, /&lt;d&gt;\[English\] literal&lt;\/d&gt;/);

  const controls = compile('CinemaPromptEngineering/frontend/src/storyboard/components/PromptEnhancementControls.tsx', {}, true, {
    'react': React,
    'react/jsx-runtime': require(path.join(root, 'CinemaPromptEngineering/frontend/node_modules/react/jsx-runtime')),
    '../services/prompt-enhancement': enhancement,
  });
  const controlsMarkup = server.renderToStaticMarkup(React.createElement(controls.PromptEnhancementControls, {
    profiles: [profile],
    assets: [
      { binding_id: 'first', kind: 'image', role: 'first_frame', ordinal: 1, label: 'First', valueFingerprint: '1:x', ambiguous: false, include: true },
      { binding_id: 'last', kind: 'image', role: 'last_frame', ordinal: 2, label: 'Last', valueFingerprint: '1:y', ambiguous: false, include: true },
    ],
    preferences: { targetModel: 'minimax_h3', referenceDialect: 'local_h3', taskMode: 'manual', task: 'i2v', referenceOrderConfirmed: false },
    onChange() {},
    durationSeconds: 6,
  }));
  assert.match(controlsMarkup, /first frame = ordinal 1, last frame = ordinal 2/);
  assert.match(controlsMarkup, /Confirm media mapping/);
  console.log('Prompt enhancement frontend regression passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
