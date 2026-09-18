#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'CinemaPromptEngineering/frontend');
const src = path.join(frontend, 'src/storyboard');
const typescript = createRequire(path.join(frontend, 'package.json'))('typescript');
const frontendRequire = createRequire(path.join(frontend, 'package.json'));

function compile(filename, requireImpl = {}, jsx = false) {
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
    require: request => Object.prototype.hasOwnProperty.call(requireImpl, request)
      ? requireImpl[request]
      : frontendRequire(request),
    console,
    fetch: global.fetch,
    setTimeout,
    clearTimeout,
  }, { filename });
  return module.exports;
}

const definitions = compile(path.join(src, 'services/node-definitions.ts'));
const parserModule = compile(path.join(src, 'services/workflow-parser.ts'), {
  './node-definitions': definitions,
  '../data/cameraAngleData': { ANGLE_LORA_NAME: '__test_angle__' },
});
const parser = new parserModule.WorkflowParser();

// Sanitized API-shaped fixture: no prompt/media contents are copied from the
// user's artifact. It retains the literal input shapes needed for this check.
const workflow = {
  '105:11': { class_type: 'BasicScheduler', inputs: { scheduler: 'normal', steps: 8, sigmas: ['105:24', 0] } },
  '105:24': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
  '3': { class_type: 'RandomNoise', inputs: { noise_seed: 123 } },
  '4': { class_type: 'SaveVideo', inputs: { format: 'video/h264', 'format.codec': 'h264', fps: 24 } },
  '5': { class_type: 'MiniMaxH3ImageToVideo', inputs: { prompt: 'fixture prompt', megapixels: 1.5, flag: false } },
  '6': { class_type: 'BasicGuider', inputs: { cfg: 1 } },
  '7': { class_type: 'ComfyMathExpression', inputs: { 'values.a': 5 } },
};

const offline = parser.parseWorkflow(workflow);
const offlineNames = new Set(offline.parameters.map(parameter => parameter.name));
assert.ok(offlineNames.has('prompt'));
assert.ok(offlineNames.has('megapixels'));
assert.ok(offlineNames.has('fps'));
assert.ok(offlineNames.has('steps'));
assert.ok(offlineNames.has('format.codec'));
assert.ok(offlineNames.has('values.a'));
assert.ok(offlineNames.has('cfg'), 'literal custom-node inputs are discoverable without a catalog');
assert.equal(offline.parameters.find(parameter => parameter.name === 'steps').default, 8);
assert.equal(offline.parameters.find(parameter => parameter.name === 'format.codec').default, 'h264');
assert.equal(offline.parameters.find(parameter => parameter.name === 'sigmas'), undefined, 'real node links are not controls');

const objectInfo = {
  BasicScheduler: { input: { required: {
    scheduler: ['COMBO', { options: ['normal', 2, true] }],
    steps: ['INT', { default: 8, min: 1, max: 20, step: 1 }],
  } } },
  SaveVideo: { input: { required: {
    format: ['COMFY_DYNAMICCOMBO_V3', { options: [{ key: 'video/h264', inputs: { required: {
      codec: ['COMBO', { options: ['h264', 7] }],
    } } }] }],
  } } },
  MiniMaxH3ImageToVideo: { input: { required: {
    prompt: ['STRING', { multiline: true }],
    megapixels: ['FLOAT', { min: 0.1, max: 3, step: 0.1 }],
    flag: ['BOOLEAN', { default: false }],
  } } },
};
const live = parser.parseWorkflow(workflow, objectInfo);
const byName = name => live.parameters.find(parameter => parameter.name === name);
assert.equal(byName('steps').type, 'integer');
assert.equal(JSON.stringify(byName('steps').constraints), JSON.stringify({ min: 1, max: 20, step: 1 }));
assert.equal(byName('megapixels').type, 'float', 'schema type wins over integer-looking values');
assert.equal(byName('flag').type, 'boolean');
assert.equal(byName('format').type, 'enum');
assert.equal(JSON.stringify(byName('format').constraints.options), JSON.stringify(['video/h264']));
assert.equal(byName('format.codec').type, 'enum');
assert.equal(JSON.stringify(byName('format.codec').constraints.options), JSON.stringify(['h264', 7]));
assert.equal(byName('format.codec').schemaStatus, 'available');
assert.equal(byName('sampler_name').schemaStatus, 'unsupported');

const bindingConfigs = live.parameters.map((parameter, index) => ({
  name: parameter.name,
  node_id: parameter.node_id,
  input_name: parameter.input_name,
  exposed: ['prompt', 'megapixels', 'steps', 'format.codec', 'flag'].includes(parameter.name),
  order: index,
}));
const updated = parser.buildWorkflow(
  workflow,
  { prompt: 'changed', megapixels: 2, steps: 12, 'format.codec': 7, flag: true, cfg: 99 },
  {},
  {},
  bindingConfigs,
);
assert.equal(updated['5'].inputs.prompt, 'changed');
assert.equal(updated['5'].inputs.megapixels, 2);
assert.equal(updated['5'].inputs.flag, true);
assert.equal(updated['105:11'].inputs.steps, 12);
assert.equal(updated['4'].inputs['format.codec'], 7);
assert.equal(updated['6'].inputs.cfg, 1, 'hidden/stale values cannot write unrelated inputs');
const emptyConfig = parser.buildWorkflow(workflow, { steps: 99, cfg: 99 }, {}, {}, []);
assert.equal(emptyConfig['105:11'].inputs.steps, 8, 'explicit [] remains authoritative');
assert.equal(emptyConfig['6'].inputs.cfg, 1);

// Render production ParameterWidget output through React 18 / react-dom/server
// (no user browser or network). This catches string-only enum controls and
// verifies that the shipped component is fed typed values.
const React = frontendRequire('react');
const ReactDOMServer = frontendRequire('react-dom/server');
const widgets = compile(path.join(src, 'components/ParameterWidgets.tsx'), {
  '../services/workflow-parser': {},
  '../services/workflow-editor-options': { bindingKey: value => `${value.node_id}\0${value.input_name}` },
  './ImageDropZone': { ImageDropZone: () => null },
  '../data/cameraAngleData': { parseAngleFromPrompt: () => null, removeAnglePrefix: value => value },
  './CameraAngleSelector': () => null,
  '@/store': { useCinemaStore: () => ({ cpePromptForStoryboard: null, setCpePromptForStoryboard() {} }) },
  './ParameterWidgets.css': {},
}, true);
const markup = ReactDOMServer.renderToStaticMarkup(React.createElement(widgets.ParameterWidget, {
  parameter: { name: 'codec', input_name: 'format.codec', node_id: '4', display_name: 'Codec', type: 'enum', default: 7, constraints: { options: ['h264', 7] }, description: '' },
  value: 7,
  onChange() {},
}));
assert.match(markup, /value="1"/, 'typed enum option is selected by index, not string coercion');
console.log('Workflow schema/control regression passed');
