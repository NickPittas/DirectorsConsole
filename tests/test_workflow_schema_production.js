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
const frontendRequire = createRequire(path.join(frontend, 'package.json'));
const typescript = frontendRequire('typescript');

class Event {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = init.bubbles !== false;
    this.cancelable = Boolean(init.cancelable);
    this.defaultPrevented = false;
    Object.assign(this, init);
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this._stopped = true; }
}

class DataTransfer {
  constructor() { this.data = new Map(); this.effectAllowed = ''; this.dropEffect = ''; }
  setData(type, value) { this.data.set(type, value); }
  getData(type) { return this.data.get(type) || ''; }
}

class Node {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this.listeners = new Map();
    this.nodeType = 1;
  }
  appendChild(child) { return this.insertBefore(child, null); }
  insertBefore(child, before) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    const index = before ? this.childNodes.indexOf(before) : -1;
    if (index < 0) this.childNodes.push(child); else this.childNodes.splice(index, 0, child);
    return child;
  }
  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== listener));
  }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    let node = this;
    while (node) {
      event.currentTarget = node;
      for (const listener of node.listeners.get(event.type) || []) listener.call(node, event);
      if (event._stopped || !event.bubbles) break;
      node = node.parentNode;
    }
    return !event.defaultPrevented;
  }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  contains(node) { return node === this || this.childNodes.some(child => child.contains(node)); }
}

class TextNode extends Node {
  constructor(ownerDocument, text) { super(ownerDocument); this.nodeType = 3; this.text = text; }
  get textContent() { return this.text; }
  set textContent(value) { this.text = String(value); }
  contains(node) { return node === this; }
}

function getReactProps(element) {
  const key = Object.keys(element).find(name => name.startsWith('__reactProps$'));
  return key ? element[key] : null;
}

class Element extends Node {
  constructor(ownerDocument, tagName, namespaceURI = 'http://www.w3.org/1999/xhtml') {
    super(ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.namespaceURI = namespaceURI;
    this.attributes = new Map();
    this.style = {};
    this.className = '';
    this._text = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.type = '';
    this.tabIndex = 0;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class' || name === 'className') this.className = String(value);
    if (name === 'value') this.value = String(value);
    if (name === 'type') this.type = String(value);
    if (name === 'checked') this.checked = true;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'checked') this.checked = false; }
  get textContent() { return this._text + this.childNodes.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.childNodes = []; }
  get options() { return this.childNodes.filter(child => child.nodeType === 1); }
  focus() { this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  click() {
    if (this.tagName === 'INPUT' && this.type === 'checkbox') this.checked = !this.checked;
    this.dispatchEvent(new Event('click', { bubbles: true }));
    const props = getReactProps(this);
    if (this.tagName === 'INPUT' && this.type === 'checkbox' && props?.onChange) {
      props.onChange({ target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} });
    }
  }
  matches(selector) {
    const attr = selector.match(/^([\w-]+)?\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]$/);
    if (attr) return (!attr[1] || this.tagName.toLowerCase() === attr[1].toLowerCase()) &&
      this.hasAttribute(attr[2]) && (!attr[3] || (this.getAttribute(attr[2]) || '') === attr[3]);
    if (selector.startsWith('.')) return selector.slice(1).split('.').every(className => this.className.split(/\s+/).includes(className));
    if (selector.startsWith('#')) return this.getAttribute('id') === selector.slice(1);
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
  querySelectorAll(selector) {
    const descendant = selector.match(/^(.+?)\s+(.+)$/);
    if (descendant) {
      return this.querySelectorAll(descendant[1]).flatMap(parent => parent.querySelectorAll(descendant[2]));
    }
    const found = [];
    const visit = node => {
      for (const child of node.childNodes) {
        if (child.nodeType === 1) {
          if (child.matches(selector)) found.push(child);
          visit(child);
        }
      }
    };
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class Document extends Node {
  constructor() {
    super(null);
    this.nodeType = 9;
    this.ownerDocument = this;
    this.documentElement = new Element(this, 'html');
    this.body = new Element(this, 'body');
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
    this.activeElement = this.body;
    this.defaultView = null;
  }
  createElement(tagName) { return new Element(this, tagName); }
  createElementNS(namespaceURI, tagName) { return new Element(this, tagName, namespaceURI); }
  createTextNode(text) { return new TextNode(this, String(text)); }
  createComment(text) { return new TextNode(this, `<!--${text}-->`); }
  createDocumentFragment() { return new Element(this, 'fragment'); }
  querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
  querySelector(selector) { return this.documentElement.querySelector(selector); }
}

function installDom() {
  const document = new Document();
  const window = { document, Event, HTMLElement: Element, HTMLIFrameElement: Element, SVGElement: Element };
  document.defaultView = window;
  global.document = document;
  global.window = window;
  global.Event = Event;
  global.HTMLElement = Element;
  global.HTMLIFrameElement = Element;
  global.SVGElement = Element;
  global.Node = Node;
  Object.defineProperty(global, 'navigator', { value: { userAgent: 'node' }, configurable: true });
  global.IS_REACT_ACT_ENVIRONMENT = true;
  return document;
}

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
    setTimeout,
    clearTimeout,
    fetch: global.fetch,
    localStorage: { setItem() {} },
  }, { filename });
  return module.exports;
}

async function flush() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

function textButton(document, text) {
  return document.querySelectorAll('button').find(button => button.textContent.includes(text));
}

let act;

async function click(element) {
  assert.ok(element, 'expected DOM element');
  await act(async () => element.click());
  await flush();
}

async function changeInput(element, value) {
  assert.ok(element, 'expected input');
  await act(async () => {
    element.value = String(value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    const props = getReactProps(element);
    if (props?.onChange) props.onChange({ target: element, currentTarget: element, preventDefault() {}, stopPropagation() {} });
  });
  await flush();
}

async function main() {
  const document = installDom();
  const React = frontendRequire('react');
  act = React.act || frontendRequire('react-dom/test-utils').act;
  const { createRoot } = frontendRequire('react-dom/client');
  const options = compile(path.join(src, 'services/workflow-editor-options.ts'));
  const definitions = compile(path.join(src, 'services/node-definitions.ts'));
  const parserModule = compile(path.join(src, 'services/workflow-parser.ts'), {
    './node-definitions': definitions,
    '../data/cameraAngleData': { ANGLE_LORA_NAME: '__test_angle__' },
  });
  const parser = new parserModule.WorkflowParser();
  const editor = compile(path.join(src, 'components/WorkflowEditor.tsx'), {
    'react/jsx-runtime': frontendRequire('react/jsx-runtime'),
    '../services/workflow-parser': { WorkflowParser: parserModule.WorkflowParser },
    '../services/node-definitions': { nodeDefinitions: {} },
    '../services/workflow-editor-options': options,
    './WorkflowEditor.css': {},
  }, true);
  const widgets = compile(path.join(src, 'components/ParameterWidgets.tsx'), {
    'react/jsx-runtime': frontendRequire('react/jsx-runtime'),
    '../services/workflow-parser': {},
    '../services/workflow-editor-options': options,
    './ImageDropZone': { ImageDropZone: () => null },
    '../data/cameraAngleData': { parseAngleFromPrompt: () => null, removeAnglePrefix: value => value },
    './CameraAngleSelector': () => null,
    '@/store': { useCinemaStore: () => ({ cpePromptForStoryboard: null, setCpePromptForStoryboard() {} }) },
    './ParameterWidgets.css': {},
  }, true);

  const workflow = {
    '1': { class_type: 'FastVideo', inputs: { steps: 8, megapixels: 1.5, enabled: false, sampler: 'euler' } },
  };
  // Sanitized userFastVideo-shaped API fixture plus a real /object_info contract.
  const objectInfo = {
    FastVideo: { input: { required: {
      steps: ['INT', { default: 8, min: 1, max: 30, step: 1 }],
      megapixels: ['FLOAT', { default: 1.5, min: 0.1, max: 3, step: 0.1 }],
      enabled: ['BOOLEAN', { default: false }],
      sampler: ['COMBO', { options: ['euler', 7] }],
    } } },
  };
  const parsed = parser.parseWorkflow(workflow, objectInfo);
  assert.equal(parsed.parameters.find(parameter => parameter.name === 'megapixels').type, 'float');
  assert.deepEqual(Array.from(parsed.parameters.find(parameter => parameter.name === 'sampler').constraints.options), ['euler', 7]);
  const baseConfig = {
    name: 'steps', display_name: 'Steps', node_id: '1', input_name: 'steps', type: 'integer', default: 8,
    description: 'preserve me', constraints: { min: 1, max: 30, step: 1 }, order: 0, exposed: false,
    category: 'parameter', auto_detected: true, user_modified: false,
  };

  const container = document.createElement('div');
  document.body.appendChild(container);
  let savedConfig;
  let values = { steps: 21, stale_old_name: 999 };
  const configProps = initialConfig => ({
    workflow,
    parsedWorkflow: parsed,
    initialConfig,
    onSave: config => {
      savedConfig = config;
      values = options.reconcileParameterValues(values, initialConfig, config);
    },
    onCancel() {},
  });
  let rootNode = createRoot(container);
  await act(async () => rootNode.render(React.createElement(editor.WorkflowEditor, configProps([baseConfig]))));
  await flush();

  // Hidden imported binding appears in All Nodes, and the real NodeCard callback re-exposes it.
  await click(textButton(document, 'All Nodes'));
  await click(document.querySelector('.node-header'));
  await click(textButton(document, '+ Expose'));
  await click(textButton(document, 'Exposed Parameters'));
  assert.equal(document.querySelectorAll('.parameter-config-card').length, 1);

  // Rename and edit through the real card callbacks.
  await click(document.querySelector('.config-toggle'));
  const detailInputs = document.querySelectorAll('.config-details input');
  await changeInput(detailInputs[0], 'renamed_steps');
  await changeInput(detailInputs[1], 21);
  await changeInput(detailInputs[2], 'edited description');

  // Hide, re-expose, and verify edited metadata/value survived instead of duplicating.
  const exposedToggle = document.querySelector('.config-flags input');
  await click(exposedToggle);
  await click(textButton(document, 'All Nodes'));
  await click(document.querySelector('.node-header'));
  await click(textButton(document, '+ Expose'));
  const configsAfterReExpose = document.querySelectorAll('.node-input.exposed');
  assert.equal(configsAfterReExpose.length, 1);
  await click(textButton(document, 'Exposed Parameters'));
  await click(document.querySelector('.config-toggle'));
  assert.equal(document.querySelector('.config-details input').value, 'renamed_steps');
  assert.equal(document.querySelectorAll('.config-details input')[1].value, '21');
  assert.equal(document.querySelectorAll('.config-details input')[2].value, 'edited description');

  // Hide, save, reopen, then re-expose; explicit hidden config remains authoritative until chosen.
  await click(document.querySelector('.config-flags input'));
  await click(textButton(document, 'Save Configuration'));
  await flush();
  assert.equal(savedConfig.length, 1);
  assert.equal(savedConfig[0].exposed, false);
  assert.equal(savedConfig[0].name, 'renamed_steps');
  assert.equal(values.stale_old_name, 999);
  assert.equal(values.renamed_steps, 21);

  await act(async () => rootNode.unmount());
  container.textContent = '';
  rootNode = createRoot(container);
  await act(async () => rootNode.render(React.createElement(editor.WorkflowEditor, configProps(savedConfig))));
  await flush();
  assert.equal(document.querySelectorAll('.parameter-config-card').length, 0);
  await click(textButton(document, 'All Nodes'));
  await click(document.querySelector('.node-header'));
  await click(textButton(document, '+ Expose'));
  assert.equal(document.querySelectorAll('.node-input.exposed').length, 1);

  // Removal is also binding-based: remove then expose creates one control, never a duplicate.
  await click(textButton(document, 'Exposed Parameters'));
  await click(document.querySelector('.config-remove'));
  assert.equal(document.querySelectorAll('.parameter-config-card').length, 0);
  await click(textButton(document, 'All Nodes'));
  await click(document.querySelector('.node-header'));
  await click(textButton(document, '+ Expose'));
  assert.equal(document.querySelectorAll('.node-input.exposed').length, 1);

  // Filtered drag reorder moves displayed bindings only; hidden controls retain their slot.
  const reorderConfigs = [
    { ...baseConfig, name: 'alpha', display_name: 'Alpha', input_name: 'steps', exposed: true, order: 0 },
    { ...baseConfig, name: 'hidden', display_name: 'Hidden', input_name: 'megapixels', exposed: false, order: 1 },
    { ...baseConfig, name: 'beta', display_name: 'Beta', input_name: 'enabled', exposed: true, order: 2 },
  ];
  await act(async () => rootNode.unmount());
  container.textContent = '';
  rootNode = createRoot(container);
  let reordered;
  await act(async () => rootNode.render(React.createElement(editor.WorkflowEditor, {
    ...configProps(reorderConfigs), onSave: config => { reordered = config; },
  })));
  await flush();
  const search = document.querySelector('.editor-search input');
  await changeInput(search, 'a');
  const cards = document.querySelectorAll('.parameter-config-card');
  assert.equal(cards.length, 2);
  const dataTransfer = new DataTransfer();
  await act(async () => {
    const sourceProps = getReactProps(cards[0].querySelector('.drag-handle'));
    const targetProps = getReactProps(cards[1]);
    sourceProps.onDragStart({ stopPropagation() {}, dataTransfer });
    targetProps.onDragEnter({ preventDefault() {}, stopPropagation() {} });
  });
  await flush();
  await click(textButton(document, 'Save Configuration'));
  assert.equal(JSON.stringify(reordered.map(config => [config.name, config.order])), JSON.stringify([['beta', 0], ['hidden', 1], ['alpha', 2]]));
  await act(async () => rootNode.unmount());
  container.textContent = '';
  rootNode = createRoot(container);
  await act(async () => rootNode.render(React.createElement(editor.WorkflowEditor, configProps(reordered))));
  await flush();
  assert.equal(JSON.stringify(document.querySelectorAll('.config-name').map(input => input.value)), JSON.stringify(['Beta', 'Alpha']));

  // ParameterPanel events retain typed values, and the builder uses the renamed binding over a stale alias.
  await act(async () => rootNode.unmount());
  container.textContent = '';
  rootNode = createRoot(container);
  const queued = [];
  const panelParameters = parsed.parameters.map((parameter, index) => index === 0
    ? { ...parameter, name: 'renamed_steps', display_name: 'Renamed Steps' }
    : parameter);
  await act(async () => rootNode.render(React.createElement(widgets.ParameterPanel, {
    parameters: panelParameters,
    values: { steps: 21, renamed_steps: 21, megapixels: 1.5, enabled: false, sampler: 7 },
    onChange: (name, value) => queued.push([name, value]),
  })));
  await flush();
  const enumSelect = document.querySelector('.parameter-select');
  assert.equal(enumSelect.options.length, 2);
  assert.match(enumSelect.textContent, /7/);
  const numericInputs = document.querySelectorAll('input[type="number"]');
  await changeInput(numericInputs[0], 25);
  await changeInput(numericInputs[1], 2.5);
  const checkbox = document.querySelector('input[type="checkbox"]');
  await click(checkbox);
  assert.deepEqual(queued.slice(0, 3), [['renamed_steps', 25], ['megapixels', 2.5], ['enabled', true]]);

  const renamedConfig = [{ ...baseConfig, name: 'renamed_steps', exposed: true }];
  const apiValues = options.reconcileParameterValues({ steps: 21, renamed_steps: 25 }, [baseConfig], renamedConfig);
  const built = parser.buildWorkflow(workflow, { steps: 999, renamed_steps: 25 }, {}, {}, renamedConfig);
  assert.equal(apiValues.renamed_steps, 25);
  assert.equal(Object.hasOwn(apiValues, 'steps'), false);
  assert.equal(built['1'].inputs.steps, 25);

  await act(async () => rootNode.unmount());
  console.log('Production workflow schema controls regression passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
