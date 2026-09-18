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

function loadFunction(functionSource, globals = {}, jsx = false) {
  const filename = path.join(src, 'extracted.tsx');
  const result = typescript.transpileModule(`module.exports = ${functionSource};`, {
    fileName: filename,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2020,
      module: typescript.ModuleKind.CommonJS,
      ...(jsx ? { jsx: typescript.JsxEmit.React } : {}),
    },
    reportDiagnostics: true,
  });
  const module = { exports: {} };
  vm.runInNewContext(result.outputText, {
    module,
    exports: module.exports,
    console,
    setTimeout,
    clearTimeout,
    Promise,
    ...globals,
  }, { filename });
  return module.exports;
}

function findJsxAttribute(source, filename, elementName, attributeName) {
  const tree = typescript.createSourceFile(filename, source, typescript.ScriptTarget.Latest, true, typescript.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (initializer) return;
    const opening = typescript.isJsxElement(node) ? node.openingElement
      : typescript.isJsxSelfClosingElement(node) ? node : undefined;
    if (opening && opening.tagName.getText(tree) === elementName) {
      const attribute = opening.attributes.properties.find(property =>
        typescript.isJsxAttribute(property) && property.name.getText(tree) === attributeName);
      if (attribute?.initializer && typescript.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
        initializer = attribute.initializer.expression;
      }
    }
    typescript.forEachChild(node, visit);
  }
  visit(tree);
  return initializer ? source.slice(initializer.getStart(tree), initializer.end) : undefined;
}

function findFunctionDeclaration(source, filename, name) {
  const tree = typescript.createSourceFile(filename, source, typescript.ScriptTarget.Latest, true, typescript.ScriptKind.TSX);
  let declaration;
  function visit(node) {
    if (declaration) return;
    if (typescript.isFunctionDeclaration(node) && node.name?.getText(tree) === name) declaration = node;
    typescript.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(declaration, `${name} was not found`);
  return source.slice(declaration.getStart(tree), declaration.end);
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

function mutateOnce(source, needle, replacement) {
  assert.equal(source.split(needle).length - 1, 1, `mutation needle must be unique: ${needle}`);
  return source.replace(needle, replacement);
}

function exerciseActualStoryboardSave(source, options, workflow, parsed, baseConfig, typedValue) {
  const fileName = path.join(src, 'StoryboardUI.tsx');
  const saveSource = findJsxAttribute(source, fileName, 'WorkflowEditor', 'onSave');
  assert.ok(saveSource, 'StoryboardUI WorkflowEditor onSave registration was not found');

  const editingWorkflow = { id: 'workflow-main', name: 'Main', workflow, parsed, config: [baseConfig] };
  const parameterValuesRef = { current: { steps: typedValue, stale_old_name: 999 } };
  let parameterValues = { ...parameterValuesRef.current };
  let panels = [
    { id: 'same-a', workflowId: editingWorkflow.id, parameterValues: { steps: 31 }, imageHistory: [{ id: 'a' }] },
    { id: 'same-b', workflowId: editingWorkflow.id, parameterValues: { steps: 32 }, imageHistory: [{ id: 'b' }] },
    { id: 'other', workflowId: 'other-workflow', parameterValues: { steps: 77 }, imageHistory: [{ id: 'other' }] },
  ];
  const otherPanelBefore = JSON.parse(JSON.stringify(panels[2]));
  let savedConfig;
  let workflows = [editingWorkflow];
  let editorClosed = false;
  const skipParameterReset = { current: false };
  const selectedPanelIdRef = { current: 'same-a' };
  const actualSave = loadFunction(saveSource, {
    editingWorkflow,
    parameterValuesRef,
    reconcileParameterValues: options.reconcileParameterValues,
    skipParameterReset,
    setParameterValues: value => { parameterValues = value; },
    setPanels: updater => { panels = updater(panels); },
    selectedPanelIdRef,
    setWorkflows: updater => { workflows = updater(workflows); },
    setShowWorkflowEditor: value => { editorClosed = value; },
    addLog: () => {},
  });
  const config = [{ ...baseConfig, name: 'renamed_steps', display_name: 'Renamed Steps', exposed: true }];
  actualSave(config);

  assert.equal(skipParameterReset.current, true);
  assert.equal(parameterValues.renamed_steps, typedValue, 'sidebar controlled value must follow the renamed binding');
  assert.equal(parameterValuesRef.current.renamed_steps, typedValue, 'generation ref must use the same renamed binding');
  assert.equal(Object.hasOwn(parameterValues, 'steps'), false);
  assert.equal(JSON.stringify(panels[0].parameterValues), JSON.stringify({ renamed_steps: 31 }));
  assert.equal(JSON.stringify(panels[1].parameterValues), JSON.stringify({ renamed_steps: 32 }));
  assert.equal(JSON.stringify(panels[2]), JSON.stringify(otherPanelBefore), 'another workflow panel must remain untouched');
  assert.equal(workflows[0].config[0].name, 'renamed_steps');
  assert.equal(editorClosed, false);
  return { config, parameterValues, parameterValuesRef, panels };
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
  const runtimeNodeDefinitions = {};
  const editor = compile(path.join(src, 'components/WorkflowEditor.tsx'), {
    'react/jsx-runtime': frontendRequire('react/jsx-runtime'),
    '../services/workflow-parser': { WorkflowParser: parserModule.WorkflowParser },
    '../services/node-definitions': { nodeDefinitions: runtimeNodeDefinitions },
    '../services/workflow-editor-options': options,
    './WorkflowEditor.css': {},
  }, true);
  const widgets = compile(path.join(src, 'components/ParameterWidgets.tsx'), {
    'react/jsx-runtime': frontendRequire('react/jsx-runtime'),
    '../services/workflow-parser': {},
    '../services/workflow-editor-options': options,
    './ImageDropZone': { ImageDropZone: () => null },
    '../data/cameraAngleData': { parseAngleFromPrompt: () => null, removeAnglePrefix: value => value },
    './CameraAngleSelector': { default: () => null },
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
  const parameterContainer = document.createElement('div');
  document.body.appendChild(parameterContainer);
  let liveParameterValues = { steps: 21, megapixels: 1.5, enabled: false, sampler: 7 };
  const parameterRoot = createRoot(parameterContainer);
  await act(async () => parameterRoot.render(React.createElement(widgets.ParameterPanel, {
    parameters: parsed.parameters,
    values: liveParameterValues,
    onChange: (name, value) => { liveParameterValues = { ...liveParameterValues, [name]: value }; },
  })));
  await flush();
  await changeInput(parameterContainer.querySelector('input[type="number"]'), 25);
  assert.equal(liveParameterValues.steps, 25, 'real parameter input edit must update the typed value');

  const storyboardFile = path.join(src, 'StoryboardUI.tsx');
  const storyboardSource = fs.readFileSync(storyboardFile, 'utf8');
  const actualTransaction = exerciseActualStoryboardSave(
    storyboardSource,
    options,
    workflow,
    parsed,
    baseConfig,
    liveParameterValues.steps,
  );
  const generatedPayload = parser.buildWorkflow(
    workflow,
    actualTransaction.parameterValuesRef.current,
    {},
    {},
    actualTransaction.config,
  );
  assert.equal(generatedPayload['1'].inputs.steps, 25, 'generation must use the typed renamed value');
  const renamedParameters = parsed.parameters.map(parameter =>
    parameter.name === 'steps' ? { ...parameter, name: 'renamed_steps', display_name: 'Renamed Steps' } : parameter,
  );
  await act(async () => parameterRoot.render(React.createElement(widgets.ParameterPanel, {
    parameters: renamedParameters,
    values: actualTransaction.parameterValues,
    onChange: () => {},
  })));
  await flush();
  assert.equal(parameterContainer.querySelector('input[type="number"]').value, '25', 'renamed control must re-render with its typed value');
  await act(async () => parameterRoot.unmount());
  document.body.removeChild(parameterContainer);

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

  // Combined restored FastVideo state: only prompt/megapixels/fps/steps are exposed,
  // managed schema arrives asynchronously, and a removed binding stays removed.
  await act(async () => rootNode.unmount());
  container.textContent = '';
  const fastWorkflow = {
    '1': {
      class_type: 'FastVideo',
      inputs: { prompt: 'restored prompt', megapixels: 1.5, fps: 24, steps: 8 },
    },
  };
  const fastSchema = { FastVideo: { input: { required: {
    prompt: ['STRING', { default: 'restored prompt' }],
    megapixels: ['FLOAT', { default: 1.5, min: 0.1, max: 3, step: 0.1 }],
    fps: ['INT', { default: 24, min: 1, max: 120, step: 1 }],
    steps: ['INT', { default: 8, min: 1, max: 30, step: 1 }],
  } } } };
  const fastParsed = parser.parseWorkflow(fastWorkflow, fastSchema);
  assert.equal(
    JSON.stringify(fastParsed.parameters.map(parameter => parameter.name).sort()),
    JSON.stringify(['fps', 'megapixels', 'prompt', 'steps']),
  );
  const fastConfig = fastParsed.parameters.map((parameter, index) => ({
    ...parameter,
    order: index,
    exposed: true,
    category: 'parameter',
    auto_detected: true,
    user_modified: false,
  }));
  let resolveDefinitions;
  const definitionsArrived = new Promise(resolve => { resolveDefinitions = resolve; });
  runtimeNodeDefinitions.fetchDefinitions = () => definitionsArrived;
  runtimeNodeDefinitions.getLoras = () => Promise.resolve([]);
  const managedContainer = document.createElement('div');
  const managedParameterContainer = document.createElement('div');
  document.body.appendChild(managedContainer);
  document.body.appendChild(managedParameterContainer);
  const managedValues = { prompt: 'restored prompt', megapixels: 1.5, fps: 24, steps: 8 };
  const managedParameterRoot = createRoot(managedParameterContainer);
  await act(async () => managedParameterRoot.render(React.createElement(widgets.ParameterPanel, {
    parameters: fastParsed.parameters,
    values: managedValues,
    onChange: (name, value) => { managedValues[name] = value; },
  })));
  await flush();
  await changeInput(managedParameterContainer.querySelector('textarea'), 'edited prompt');
  const managedNumbers = managedParameterContainer.querySelectorAll('input[type="number"]');
  await changeInput(managedNumbers[0], 2.25);
  await changeInput(managedNumbers[1], 30);
  await changeInput(managedNumbers[2], 12);
  assert.deepEqual(managedValues, { prompt: 'edited prompt', megapixels: 2.25, fps: 30, steps: 12 });

  let savedFastConfig;
  let managedRoot = createRoot(managedContainer);
  await act(async () => managedRoot.render(React.createElement(editor.WorkflowEditor, {
    workflow: fastWorkflow,
    parsedWorkflow: fastParsed,
    initialConfig: fastConfig,
    comfyUrl: 'http://managed-node:8188',
    onSave: config => { savedFastConfig = config; },
    onCancel() {},
  })));
  await flush();
  assert.equal(managedContainer.querySelectorAll('.parameter-config-card').length, 4);
  await act(async () => {
    resolveDefinitions(fastSchema);
    await definitionsArrived;
  });
  await flush();
  assert.equal(managedContainer.querySelectorAll('.parameter-config-card').length, 4, 'schema arrival must preserve visibility');
  assert.deepEqual(managedValues, { prompt: 'edited prompt', megapixels: 2.25, fps: 30, steps: 12 });
  await click(textButton(document, 'Save Configuration'));
  assert.equal(savedFastConfig.length, 4);
  const fastPayload = parser.buildWorkflow(fastWorkflow, managedValues, {}, {}, savedFastConfig);
  assert.deepEqual(
    Object.fromEntries(Object.entries(fastPayload['1'].inputs).filter(([name]) => ['prompt', 'megapixels', 'fps', 'steps'].includes(name))),
    managedValues,
  );

  await act(async () => managedRoot.unmount());
  managedContainer.textContent = '';
  managedRoot = createRoot(managedContainer);
  const removedFastConfig = savedFastConfig.filter(config => config.name !== 'fps');
  await act(async () => managedRoot.render(React.createElement(editor.WorkflowEditor, {
    workflow: fastWorkflow,
    parsedWorkflow: fastParsed,
    initialConfig: removedFastConfig,
    comfyUrl: 'http://managed-node:8188',
    onSave() {},
    onCancel() {},
  })));
  await flush();
  assert.equal(managedContainer.querySelectorAll('.parameter-config-card').length, 3);
  assert.equal(Array.from(managedContainer.querySelectorAll('.config-name')).some(input => input.value === 'Fps'), false);
  await act(async () => managedRoot.unmount());
  await act(async () => managedParameterRoot.unmount());
  document.body.removeChild(managedContainer);
  document.body.removeChild(managedParameterContainer);

  const sidebarMutation = mutateOnce(
    storyboardSource,
    `                parameterValuesRef.current = reconciledValues;\n                setParameterValues(reconciledValues);`,
    '                // mutation: sidebar state and generation ref omitted',
  );
  assert.throws(
    () => exerciseActualStoryboardSave(sidebarMutation, options, workflow, parsed, baseConfig, 25),
    /sidebar controlled value|generation ref/,
  );
  console.log('Sidebar/ref omission mutation failed as expected');
  const panelMutation = mutateOnce(
    storyboardSource,
    '                  if (!belongsToWorkflow || !panel.parameterValues) return panel;',
    '                  if (true) return panel;',
  );
  assert.throws(
    () => exerciseActualStoryboardSave(panelMutation, options, workflow, parsed, baseConfig, 25),
    /another workflow panel|renamed_steps/,
  );
  console.log('All-panel reconciliation mutation failed as expected');

  await act(async () => rootNode.unmount());
  console.log('Production workflow schema controls regression passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
