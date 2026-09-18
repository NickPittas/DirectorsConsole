#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'CinemaPromptEngineering/frontend');

function loadTypeScript() {
  const candidates = [
    process.env.TYPESCRIPT_PATH,
    path.join(frontend, 'node_modules/typescript'),
    path.join(root, 'node_modules/typescript'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch (_) { /* try the next install */ }
  }
  throw new Error('TypeScript is required; run npm install in CinemaPromptEngineering/frontend or set TYPESCRIPT_PATH.');
}

const typescript = loadTypeScript();

function compile(filename, requireImpl, jsx = false) {
  const result = typescript.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2020,
      module: typescript.ModuleKind.CommonJS,
      ...(jsx ? { jsx: typescript.JsxEmit.ReactJSX } : {}),
    },
    reportDiagnostics: true,
  });
  const diagnostics = (result.diagnostics || []).filter(d => d.category === typescript.DiagnosticCategory.Error);
  assert.equal(diagnostics.length, 0, diagnostics.map(d => typescript.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  const module = { exports: {} };
  vm.runInNewContext(result.outputText, {
    module,
    exports: module.exports,
    require: requireImpl || require,
    console,
    fetch: (...args) => global.fetch(...args),
    AbortController,
    setTimeout,
    clearTimeout,
    Date,
    localStorage: { setItem() {} },
  }, { filename });
  return module.exports;
}

function createHookHarness() {
  const slots = [];
  let hookIndex = 0;
  let pendingEffects = [];
  let dirty = false;
  let tree;
  let component;

  function useState(initial) {
    const index = hookIndex++;
    if (!slots[index]) slots[index] = { kind: 'state', value: initial };
    const slot = slots[index];
    return [slot.value, value => {
      const next = typeof value === 'function' ? value(slot.value) : value;
      if (!Object.is(next, slot.value)) dirty = true;
      slot.value = next;
    }];
  }

  function useRef(initial) {
    const index = hookIndex++;
    if (!slots[index]) slots[index] = { kind: 'ref', current: initial };
    return slots[index];
  }

  function useCallback(callback) {
    hookIndex++;
    return callback;
  }

  function useEffect(effect, dependencies) {
    const index = hookIndex++;
    const slot = slots[index] || (slots[index] = { kind: 'effect' });
    const changed = !slot.dependencies || !dependencies || dependencies.some((value, i) => !Object.is(value, slot.dependencies[i]));
    if (changed) {
      pendingEffects.push({ slot, effect, dependencies });
      slot.dependencies = dependencies;
    }
  }

  function jsx(type, props, key) {
    return { type, props: props || {}, key };
  }

  async function settle(props) {
    let passes = 0;
    do {
      assert.ok(++passes < 20, 'component effect harness did not settle');
      dirty = false;
      hookIndex = 0;
      tree = component(props);
      const effects = pendingEffects;
      pendingEffects = [];
      for (const pending of effects) {
        if (pending.slot.cleanup) pending.slot.cleanup();
        pending.slot.cleanup = pending.effect() || undefined;
      }
      await new Promise(resolve => setImmediate(resolve));
      for (let i = 0; i < 6; i++) await Promise.resolve();
    } while (dirty || pendingEffects.length > 0);
    return tree;
  }

  function find(node, predicate) {
    if (!node) return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = find(child, predicate);
        if (found) return found;
      }
      return null;
    }
    if (predicate(node)) return node;
    return find(node.props?.children, predicate);
  }

  return {
    react: { useState, useRef, useCallback, useEffect },
    jsxRuntime: { jsx, jsxs: jsx, Fragment: Symbol('Fragment') },
    attach(value) { component = value; },
    settle,
    find,
    state(index) { return slots[index]?.value; },

  };
}

function definitionResponse(checkpoint, lora) {
  return {
    CheckpointLoaderSimple: { input: { required: { ckpt_name: [[checkpoint], {}] } } },
    LoraLoader: { input: { required: { lora_name: [[lora], {}] } } },
  };
}

async function main() {
  const parserFile = path.join(frontend, 'src/storyboard/services/workflow-parser.ts');
  const definitionsFile = path.join(frontend, 'src/storyboard/services/node-definitions.ts');
  const optionsFile = path.join(frontend, 'src/storyboard/services/workflow-editor-options.ts');
  const editorFile = path.join(frontend, 'src/storyboard/components/WorkflowEditor.tsx');

  const definitions = compile(definitionsFile);
  const nodeDefinitions = definitions.nodeDefinitions;
  nodeDefinitions.clearCache();
  const parser = compile(parserFile, request => {
    if (request === './node-definitions') return definitions;
    if (request === '../data/cameraAngleData') return { ANGLE_LORA_NAME: '__test_angle__' };
    throw new Error(`Unexpected parser dependency: ${request}`);
  }).WorkflowParser;
  const workflowParser = new parser();
  const options = compile(optionsFile);
  const { findWorkflowNode, getWorkflowNodeInput } = options;

  const graph = {
    nodes: [
      { id: 4, type: 'CheckpointLoaderSimple', widgets_values: ['models/imported.safetensors'] },
      { id: 5, type: 'LoraLoader', widgets_values: ['loras/imported.safetensors', 0.5, 0.5] },
    ],
    links: [],
  };
  const sourceGraphNode = findWorkflowNode(graph, '4');
  assert.equal(getWorkflowNodeInput(sourceGraphNode, 'ckpt_name'), 'models/imported.safetensors');
  const parsedGraph = workflowParser.parseWorkflow(graph);
  const graphCheckpoint = parsedGraph.parameters.find(parameter => parameter.node_id === '4' && parameter.input_name === 'ckpt_name');
  assert.ok(graphCheckpoint, 'CheckpointLoaderSimple graph widget should be exposed');
  assert.equal(graphCheckpoint.default, 'models/imported.safetensors');
  assert.deepEqual(Array.from(graphCheckpoint.constraints.options), ['models/imported.safetensors']);

  // API format remains editable and keeps its imported default.
  const apiWorkflow = {
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'models/api.safetensors' } },
    '5': { class_type: 'LoraLoader', inputs: {
      lora_name: 'loras/api.safetensors', strength_model: 0.63, strength_clip: 0.63,
    } },
  };
  const parsedApi = workflowParser.parseWorkflow(apiWorkflow);
  const apiCheckpoint = parsedApi.parameters.find(parameter => parameter.node_id === '4' && parameter.input_name === 'ckpt_name');
  const apiLora = parsedApi.loras.find(lora => lora.node_id === '5');
  assert.equal(apiCheckpoint.default, 'models/api.safetensors');
  assert.equal(apiLora.default_strength, 0.63);
  const apiBuilt = workflowParser.buildWorkflow(apiWorkflow, { ckpt_name: 'models/edited.safetensors' }, {}, {});
  assert.equal(apiBuilt['4'].inputs.ckpt_name, 'models/edited.safetensors');

  const harness = createHookHarness();
  const editor = compile(editorFile, request => {
    if (request === 'react') return harness.react;
    if (request === 'react/jsx-runtime') return harness.jsxRuntime;
    if (request === '../services/workflow-parser') return { ComfyUIWorkflow: undefined, QwenWorkflowFormat: undefined };
    if (request === '../services/node-definitions') return definitions;
    if (request === '../services/workflow-editor-options') return options;
    if (request === './WorkflowEditor.css') return {};
    throw new Error(`Unexpected editor dependency: ${request}`);
  }, true);
  harness.attach(editor.WorkflowEditor);

  const oldUrl = 'http://old:8188';
  const newUrl = 'http://new:8188';
  const pending = new Map();
  global.fetch = url => new Promise((resolve, reject) => pending.set(url, { resolve, reject }));
  const resolveDefinitions = (url, data) => {
    const request = pending.get(`${url}/object_info`);
    assert.ok(request, `no pending object_info request for ${url}`);
    pending.delete(`${url}/object_info`);
    request.resolve({ ok: true, json: async () => data });
  };
  const rejectDefinitions = (url, error = new Error('offline')) => {
    const request = pending.get(`${url}/object_info`);
    assert.ok(request, `no pending object_info request for ${url}`);
    pending.delete(`${url}/object_info`);
    request.reject(error);
  };

  let props = {
    workflow: graph,
    parsedWorkflow: parsedGraph,
    comfyUrl: oldUrl,
    onSave() {},
    onCancel() {},
  };
  // Drive the real component's onUpdate callbacks, rather than calling a merge helper.
  const tree = await harness.settle(props);
  let configs = harness.state(0);
  let checkpointCard;
  checkpointCard = harness.find(tree, node => node?.props?.config?.input_name === 'ckpt_name');
  const loraCard = harness.find(tree, node => node?.props?.config?.category === 'lora');
  assert.ok(checkpointCard && loraCard, 'mounted editor should expose checkpoint and LoRA cards');
  checkpointCard.props.onUpdate({
    default: 'models/edited.safetensors',
    exposed: false,
    constraints: { ...checkpointCard.props.config.constraints, bypassed: true },
  });
  loraCard.props.onUpdate({
    default: 0.37,
    exposed: false,
    constraints: { ...loraCard.props.config.constraints, bypassed: true },
  });
  await harness.settle(props);

  // Change target while the old request is still in flight. This is the race that
  // used to reinitialize configs when the LoRA promise completed.
  props = { ...props, comfyUrl: newUrl };
  await harness.settle(props);
  configs = harness.state(0);
  let edited = configs.find(config => config.input_name === 'ckpt_name');
  let editedLora = configs.find(config => config.category === 'lora');
  assert.equal(edited.default, 'models/edited.safetensors');
  assert.equal(edited.user_modified, true);
  assert.equal(edited.exposed, false);
  assert.equal(edited.constraints.bypassed, true);
  assert.deepEqual(Array.from(edited.constraints.options), ['models/imported.safetensors', 'models/edited.safetensors']);
  assert.equal(editedLora.default, 0.37);
  assert.equal(editedLora.user_modified, true);
  assert.equal(editedLora.exposed, false);
  assert.equal(editedLora.constraints.bypassed, true);

  resolveDefinitions(newUrl, definitionResponse('models/fresh.safetensors', 'loras/fresh.safetensors'));
  await harness.settle(props);
  configs = harness.state(0);
  edited = configs.find(config => config.input_name === 'ckpt_name');
  editedLora = configs.find(config => config.category === 'lora');
  assert.equal(edited.default, 'models/edited.safetensors');
  assert.equal(edited.user_modified, true);
  assert.deepEqual(
    Array.from(edited.constraints.options),
    ['models/imported.safetensors', 'models/edited.safetensors', 'models/fresh.safetensors'],
  );
  assert.equal(edited.constraints.options.includes('models/old.safetensors'), false);
  assert.deepEqual(Array.from(editedLora.constraints.availableLoras), ['loras/fresh.safetensors']);
  assert.equal(editedLora.default, 0.37);
  assert.equal(editedLora.user_modified, true);
  assert.equal(editedLora.exposed, false);
  assert.equal(editedLora.constraints.bypassed, true);

  // A late old response must be ignored by the mounted editor and cache.
  resolveDefinitions(oldUrl, definitionResponse('models/old.safetensors', 'loras/old.safetensors'));
  await harness.settle(props);
  configs = harness.state(0);
  edited = configs.find(config => config.input_name === 'ckpt_name');
  editedLora = configs.find(config => config.category === 'lora');
  assert.equal(edited.constraints.options.includes('models/old.safetensors'), false);
  assert.deepEqual(Array.from(editedLora.constraints.availableLoras), ['loras/fresh.safetensors']);

  // Replacing the graph context with an API context at the same URL must
  // initialize its defaults and reapply the unchanged live LoRA metadata.
  props = { ...props, workflow: apiWorkflow, parsedWorkflow: parsedApi };
  await harness.settle(props);
  configs = harness.state(0);
  const apiEditorCheckpoint = configs.find(config => config.input_name === 'ckpt_name');
  const apiEditorLora = configs.find(config => config.category === 'lora');
  assert.equal(apiEditorCheckpoint.default, 'models/api.safetensors');
  assert.deepEqual(Array.from(apiEditorCheckpoint.constraints.options), ['models/api.safetensors', 'models/fresh.safetensors']);
  assert.equal(apiEditorCheckpoint.user_modified, false);
  assert.equal(apiEditorCheckpoint.exposed, true);
  assert.equal(apiEditorLora.default, 0.63);
  assert.deepEqual(Array.from(apiEditorLora.constraints.availableLoras), ['loras/fresh.safetensors']);
  assert.equal(apiEditorLora.user_modified, false);
  assert.equal(apiEditorLora.exposed, true);
  assert.equal(apiEditorLora.constraints.bypassed, false);

  // Going offline clears live metadata but keeps the newly initialized values.
  props = { ...props, comfyUrl: undefined };
  await harness.settle(props);
  configs = harness.state(0);
  const offlineCheckpoint = configs.find(config => config.input_name === 'ckpt_name');
  const offlineLora = configs.find(config => config.category === 'lora');
  assert.equal(offlineCheckpoint.default, 'models/api.safetensors');
  assert.deepEqual(Array.from(offlineCheckpoint.constraints.options), ['models/api.safetensors']);
  assert.equal(offlineCheckpoint.user_modified, false);
  assert.equal(offlineLora.default, 0.63);
  assert.deepEqual(Array.from(offlineLora.constraints.availableLoras), []);
  assert.equal(offlineLora.user_modified, false);
  assert.equal(offlineLora.exposed, true);
  assert.equal(offlineLora.constraints.bypassed, false);

  // Sequence A: load URL A fully, edit values/flags, switch to pending URL B,
  // then fail/offline. Empty metadata must clear A-specific options immediately.
  const sequenceAUrl = 'http://sequence-a:8188';
  const sequenceBUrl = 'http://sequence-b:8188';
  props = { ...props, comfyUrl: sequenceAUrl };
  await harness.settle(props);
  resolveDefinitions(sequenceAUrl, definitionResponse('models/a.safetensors', 'loras/a.safetensors'));
  await harness.settle(props);
  configs = harness.state(0);
  assert.deepEqual(Array.from(configs.find(config => config.category === 'lora').constraints.availableLoras), ['loras/a.safetensors']);

  const sequenceATree = await harness.settle(props);
  const sequenceACheckpointCard = harness.find(sequenceATree, node => node?.props?.config?.input_name === 'ckpt_name');
  const sequenceALoraCard = harness.find(sequenceATree, node => node?.props?.config?.category === 'lora');
  sequenceACheckpointCard.props.onUpdate({
    default: 'models/a-edited.safetensors',
    exposed: false,
    constraints: { ...sequenceACheckpointCard.props.config.constraints, bypassed: true },
  });
  sequenceALoraCard.props.onUpdate({
    default: 0.19,
    exposed: false,
    constraints: { ...sequenceALoraCard.props.config.constraints, bypassed: true },
  });
  await harness.settle(props);

  props = { ...props, comfyUrl: sequenceBUrl };
  await harness.settle(props);
  configs = harness.state(0);
  const pendingBCheckpoint = configs.find(config => config.input_name === 'ckpt_name');
  const pendingBLora = configs.find(config => config.category === 'lora');
  assert.deepEqual(Array.from(pendingBLora.constraints.availableLoras), []);
  assert.equal(pendingBLora.constraints.availableLoras.includes('loras/a.safetensors'), false);
  assert.equal(pendingBCheckpoint.default, 'models/a-edited.safetensors');
  assert.equal(pendingBCheckpoint.user_modified, true);
  assert.equal(pendingBCheckpoint.exposed, false);
  assert.equal(pendingBCheckpoint.constraints.bypassed, true);
  assert.equal(pendingBLora.default, 0.19);
  assert.equal(pendingBLora.user_modified, true);
  assert.equal(pendingBLora.exposed, false);
  assert.equal(pendingBLora.constraints.bypassed, true);

  rejectDefinitions(sequenceBUrl);
  await harness.settle(props);
  props = { ...props, comfyUrl: undefined };
  await harness.settle(props);
  configs = harness.state(0);
  const offlineBCheckpoint = configs.find(config => config.input_name === 'ckpt_name');
  const offlineBLora = configs.find(config => config.category === 'lora');
  assert.equal(offlineBCheckpoint.default, 'models/a-edited.safetensors');
  assert.equal(offlineBCheckpoint.user_modified, true);
  assert.equal(offlineBCheckpoint.exposed, false);
  assert.equal(offlineBCheckpoint.constraints.bypassed, true);
  assert.equal(offlineBLora.default, 0.19);
  assert.equal(offlineBLora.user_modified, true);
  assert.equal(offlineBLora.exposed, false);
  assert.equal(offlineBLora.constraints.bypassed, true);
  assert.deepEqual(Array.from(offlineBLora.constraints.availableLoras), []);
  assert.equal(offlineBLora.constraints.availableLoras.includes('loras/a.safetensors'), false);

  console.log('Storyboard issue #7 checkpoint consumer regression passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
