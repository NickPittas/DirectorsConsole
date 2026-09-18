#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'CinemaPromptEngineering/frontend');
const typescript = require(path.join(frontend, 'node_modules/typescript'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'directors-console-ui-consumer-'));

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function parse(source, fileName) {
  return typescript.createSourceFile(fileName, source, typescript.ScriptTarget.Latest, true, typescript.ScriptKind.TSX);
}

function findVariable(source, fileName, name) {
  const tree = parse(source, fileName);
  let found;
  function visit(node) {
    if (found) return;
    if (typescript.isVariableDeclaration(node) && node.name.getText(tree) === name) found = node.initializer;
    typescript.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(found, `${name} was not found in ${fileName}`);
  if (typescript.isCallExpression(found) && found.arguments.length > 0) found = found.arguments[0];
  assert.ok(typescript.isArrowFunction(found), `${name} is not an arrow function`);
  return source.slice(found.getStart(tree), found.end);
}

function findEffect(source, fileName, marker) {
  const tree = parse(source, fileName);
  let found;
  function visit(node) {
    if (found) return;
    if (typescript.isCallExpression(node)
      && node.expression.getText(tree) === 'useEffect'
      && node.arguments.length > 0
      && source.slice(node.arguments[0].getStart(tree), node.arguments[0].end).includes(marker)) {
      found = node.arguments[0];
    }
    typescript.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(found, `useEffect containing ${marker} was not found`);
  return source.slice(found.getStart(tree), found.end);
}

function loadFunction(functionSource, globals = {}) {
  const filename = path.join(temp, 'extracted.ts');
  const output = typescript.transpileModule(`module.exports = ${functionSource};`, {
    fileName: filename,
    compilerOptions: { target: typescript.ScriptTarget.ES2020, module: typescript.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    Set,
    Map,
    Blob,
    URL,
    ...globals,
  };
  vm.runInNewContext(output, context, { filename });
  return module.exports;
}

function makeSettings(name, filePath = undefined) {
  return {
    name,
    path: `/projects/${name}`,
    projectFilePath: filePath,
    orchestratorUrl: 'http://orchestrator:9820',
    namingTemplate: '{project}_{panel}_{version}',
    autoSave: true,
    created: new Date('2026-01-01'),
    lastModified: new Date('2026-01-01'),
  };
}

function makePanel() {
  return { id: 1, image: 'generated.png', images: [], imageHistory: [{ id: 'history-1' }], notes: 'keep' };
}

async function testStoryboardHandlers() {
  const fileName = 'CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx';
  const source = read(fileName);
  const panels = [makePanel()];
  const parameterValues = { prompt: 'keep me', nested: { generated: [{ seed: 9 }] } };
  let settings = makeSettings('A');
  const events = [];
  const errors = [];
  let saveResult = { success: false, error: 'server rejected' };
  const controller = {
    flush: async () => events.push('flush'),
    hasPendingChanges: () => true,
    getStatus: () => ({ state: 'idle' }),
    clearFailure: () => events.push('clearFailure'),
  };
  const manager = {
    getProject: () => settings,
    getSessionIdentity: target => `identity:${target.projectFilePath || target.name}`,
    saveProjectState: (...args) => { events.push(['save', args]); return Promise.resolve(saveResult); },
    restoreFromSession: target => { events.push(['restore', target]); settings = target; },
    setProject: patch => { events.push(['setProject', patch]); settings = { ...settings, ...patch }; },
    createUnsavedIdentity: () => 'unsaved:new',
    rotateUnsavedIdentity: identity => events.push(['rotate', identity]),
  };
  const saveRecent = async (name, save) => {
    events.push(['recent-save', name]);
    return save();
  };
  const activate = async (_controller, identity, options) => events.push(['activate', identity, options]);

  const save = loadFunction(findVariable(source, fileName, 'handleSaveProject'), {
    sessionDraftController: controller,
    saveProjectAndRecordRecent: saveRecent,
    projectManager: manager,
    panels,
    parameterValues,
    selectedWorkflowId: 'workflow-a',
    renderNodes: [{ id: 'node-a' }],
    comfyUrl: 'http://managed-node:8188',
    cameraAngles: { angle: 'wide' },
    projectSettings: settings,
    activateSessionIdentity: activate,
    showError: message => errors.push(message),
    showInfo: message => events.push(['info', message]),
  });

  const failed = await save();
  assert.equal(failed.success, false);
  assert.equal(failed.error, 'server rejected');
  assert.deepEqual(events.slice(0, 2).map(event => Array.isArray(event) ? event[0] : event), ['flush', 'recent-save']);
  assert.equal(events.some(event => Array.isArray(event) && event[0] === 'activate'), false);
  assert.match(errors[0], /server rejected/);

  saveResult = { success: true, savedPath: '/projects/A/A_project.json' };
  const succeeded = await save();
  assert.equal(succeeded.success, true);
  assert.equal(events.some(event => Array.isArray(event) && event[0] === 'activate'), true);
  assert.equal(events.some(event => Array.isArray(event) && event[0] === 'setProject'), true);

  // Save As remains deferred until the real save resolves; identity and UI state
  // do not move while the request is pending or after a rejected request.
  let resolveSaveAs;
  const saveAsEvents = [];
  const saveAs = loadFunction(findVariable(source, fileName, 'handleSaveFromDialog'), {
    sessionDraftController: { flush: async () => saveAsEvents.push('flush') },
    saveProjectAndRecordRecent: async (_name, callback) => callback(),
    projectManager: {
      getProject: () => makeSettings('A', '/projects/A/A_project.json'),
      saveProjectState: (...args) => {
        saveAsEvents.push(['save', args]);
        return new Promise(resolve => { resolveSaveAs = resolve; });
      },
      getSessionIdentity: target => `identity:${target.projectFilePath}`,
      restoreFromSession: target => saveAsEvents.push(['restore', target]),
    },
    panels,
    parameterValues,
    selectedWorkflowId: 'workflow-a', renderNodes: [], comfyUrl: '', cameraAngles: {},
    activateSessionIdentity: async (_controller, identity) => saveAsEvents.push(['activate', identity]),
    setProjectSettings: target => saveAsEvents.push(['setSettings', target]),
    setFileBrowserMode: value => saveAsEvents.push(['dialog', value]),
    sessionDraftController: {
      flush: async () => saveAsEvents.push('flush'),
      clearFailure: () => saveAsEvents.push('clearFailure'),
    },
    showError: message => saveAsEvents.push(['error', message]),
    showInfo: message => saveAsEvents.push(['info', message]),
  });
  const pending = saveAs('/projects/B', 'B');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saveAsEvents.some(event => Array.isArray(event) && event[0] === 'activate'), false);
  resolveSaveAs({ success: true, savedPath: '/projects/B/B_project.json' });
  await pending;
  assert.equal(saveAsEvents.some(event => Array.isArray(event) && event[0] === 'activate'), true);
  assert.deepEqual(saveAsEvents.at(-1), ['dialog', null]);

  const newSource = findVariable(source, fileName, 'handleNewProject');
  let confirmCalls = 0;
  const newEvents = [];
  const runNew = async (saveProject, confirmations) => {
    confirmCalls = 0;
    const handler = loadFunction(newSource, {
      panels: [makePanel()],
      sessionDraftController: { hasPendingChanges: () => true },
      window: { confirm: () => confirmations[confirmCalls++] },
      handleSaveProject: saveProject,
      projectManager: manager,
      activateSessionIdentity: async (_controller, identity, options) => newEvents.push(['activate', identity, options]),
      useCinemaStore: { getState: () => ({ resetSession: () => newEvents.push('resetCinema') }) },
      projectSettings: { orchestratorUrl: 'http://orchestrator:9820' },
      setProjectSettings: value => newEvents.push(['settings', value]),
      setPanels: value => newEvents.push(['panels', value]),
      setParameterValues: value => newEvents.push(['parameters', value]),
      parameterValuesRef: { current: { old: true } },
      setSelectedWorkflowId: value => newEvents.push(['workflow', value]),
      setShowProjectSettings: value => newEvents.push(['showSettings', value]),
      showError: value => newEvents.push(['error', value]),
    });
    await handler();
  };
  await runNew(async () => ({ success: false, error: 'save failed' }), [true]);
  assert.equal(newEvents.some(event => Array.isArray(event) && event[0] === 'activate'), false, 'failed Save & New must not reset the live project');
  newEvents.length = 0;
  await runNew(async () => ({ success: true }), [false, false]);
  assert.equal(newEvents.some(event => Array.isArray(event) && event[0] === 'activate'), false, 'cancelled Discard & New must preserve the live project');

  // Execute the real Load handler's failure and success branches, including the
  // old-project preservation boundary around its staged filesystem scan.
  let loadSucceeded = false;
  const load = loadFunction(findVariable(source, fileName, 'handleLoadFromDialog'), {
    sessionDraftController: { flush: async () => {}, getStatus: () => ({ state: 'idle' }) },
    projectManager: {
      getProject: () => makeSettings('A', '/projects/A/A_project.json'),
      loadProjectState: async () => loadSucceeded
        ? {
          success: true,
          state: {
            project_settings: makeSettings('B', '/projects/B/B_project.json'),
            panels: [], parameter_values: { restored: true }, camera_angles: {},
            selected_workflow_id: null, comfy_url: null, deleted_images: [], saved_at: '2026-01-01',
          },
        }
        : { success: false, error: 'late read failed' },
      scanProjectPanels: async () => ({ success: true, panels: [] }),
      getSessionIdentity: target => `identity:${target.projectFilePath}`,
      restoreFromSession: target => newEvents.push(['loadRestore', target]),
    },
    loadProjectAndRecordRecent: async (_path, callback) => callback(),
    getDefaultOrchestratorUrl: () => 'http://orchestrator:9820',
    setFileBrowserMode: value => newEvents.push(['loadDialog', value]),
    setProjectSettings: value => newEvents.push(['loadSettings', value]),
    setIsLoadingProject: value => newEvents.push(['loading', value]),
    setLoadingProgress: value => newEvents.push(['progress', value]),
    setDeletedImages: value => newEvents.push(['deleted', value]),
    setPanels: value => newEvents.push(['loadedPanels', value]),
    setParameterValues: value => newEvents.push(['loadedParameters', value]),
    parameterValuesRef: { current: {} },
    setCameraAngles: () => {}, setSelectedWorkflowId: () => {}, setComfyUrl: () => {},
    activateSessionIdentity: async (_controller, identity) => newEvents.push(['loadActivate', identity]),
    showError: value => newEvents.push(['loadError', value]), showInfo: value => newEvents.push(['loadInfo', value]),
  });
  await load('/projects/B/B_project.json');
  assert.equal(newEvents.some(event => Array.isArray(event) && event[0] === 'loadActivate'), false);
  assert.equal(newEvents.some(event => Array.isArray(event) && event[0] === 'loadError'), true);
  loadSucceeded = true;
  await load('/projects/B/B_project.json');
  assert.equal(newEvents.some(event => Array.isArray(event) && event[0] === 'loadActivate'), true);
  assert.equal(newEvents.some(event => Array.isArray(event) && event[0] === 'loadRestore' && event[1].name === 'B'), true);
  assert.equal(newEvents.some(event => Array.isArray(event) && event[0] === 'loadedParameters'), true);
}

async function testAppHydrationAndDiscard() {
  const fileName = 'CinemaPromptEngineering/frontend/src/App.tsx';
  const source = read(fileName);
  const calls = [];
  const restored = {
    app: { activeTab: 'storyboard' },
    project: { settings: { name: 'Recovered' } },
    storyboard: { panels: [] },
    cinema: { userPrompt: 'restored user', enhancedPrompt: 'restored enhanced' },
  };
  const hydrate = loadFunction(findVariable(source, fileName, 'hydrate'), {
    setHydration: value => calls.push(['hydration', value]),
    readRecoverableActiveDraft: async () => ({ identity: 'project:recovered', data: restored }),
    restoreSessionDraft: async data => { calls.push(['restoreDraft', data]); return data; },
    projectManager: {
      getSessionIdentity: () => 'unsaved:old',
      restoreFromSession: settings => calls.push(['restoreProject', settings]),
      rotateUnsavedIdentity: () => calls.push('rotate'),
      setProject: settings => calls.push(['newProject', settings]),
    },
    useCinemaStore: { getState: () => ({ hydrateSession: data => calls.push(['hydrateCinema', data]) }) },
    sessionDraftController: {
      hydrate: (identity, data) => calls.push(['hydrateController', identity, data]),
      update: () => { throw new Error('default write occurred before hydration'); },
    },
    clearActiveDraftPointer: async () => calls.push('clearPointer'),
  });
  await hydrate(false);
  assert.deepEqual(calls.filter(call => Array.isArray(call) && (call[0] === 'hydrateCinema' || call[0] === 'hydrateController')).map(call => call[0]), ['hydrateCinema', 'hydrateController']);
  assert.equal(calls.some(call => call[0] === 'hydration' && call[1].state === 'ready'), true);

  const archives = new Set(['project:archive']);
  const discard = loadFunction(findVariable(source, fileName, 'discard'), {
    hydration: { recordIdentity: 'project:corrupt' },
    window: { confirm: () => true },
    deleteDraft: async identity => { assert.equal(identity, 'project:corrupt'); archives.add(identity); archives.delete(identity); },
    clearActiveDraftPointer: async () => { throw new Error('wrong discard target'); },
    hydrate: async startNew => calls.push(['startNew', startNew]),
    setHydration: () => {},
  });
  await discard();
  assert.deepEqual([...archives], ['project:archive'], 'confirmed discard deletes only the corrupt active target');
  assert.deepEqual(calls.at(-1), ['startNew', true]);
}

async function testCpeMountConsumers() {
  const fileName = 'CinemaPromptEngineering/frontend/src/CinemaPromptEngineering.tsx';
  const source = read(fileName);
  const updates = [];
  const handler = loadFunction(findVariable(source, fileName, 'handler'), {
    suppressPromptReset: { current: false },
    suppressUserPromptSync: { current: false },
    setProjectType: value => updates.push(['type', value]),
    setLiveActionConfig: value => updates.push(['live', value]),
    setAnimationConfig: value => updates.push(['animation', value]),
    setUserPrompt: value => updates.push(['user', value]),
    setGeneratedPrompt: (...value) => updates.push(['generated', value]),
    setEnhancedPrompt: value => updates.push(['enhanced', value]),
  });
  const config = { camera: { body: 'RecoveredCamera' } };
  handler({ data: {
    type: 'INIT_CONFIG',
    payload: {
      projectType: 'live_action',
      config,
      userPrompt: 'restored user prompt',
      prompt: 'restored generated prompt',
      enhancedPrompt: 'restored enhanced prompt',
    },
  } });
  assert.deepEqual(updates, [
    ['type', 'live_action'], ['live', config], ['user', 'restored user prompt'],
    ['generated', ['restored generated prompt', null]], ['enhanced', 'restored enhanced prompt'],
  ]);

  const catalogUpdates = [];
  const targetModelRef = { current: 'recovered-target' };
  const effect = loadFunction(findEffect(source, fileName, 'api.getTargetModels()'), {
    sessionHydrated: true,
    loadTargetModel: () => { throw new Error('hydrated sessions must not read local target preference'); },
    targetModelRef,
    setTargetModelRef: { current: () => { throw new Error('hydrated target was overwritten'); } },
    setIsLoadingTargetModels: value => catalogUpdates.push(['loading', value]),
    setAvailableTargetModels: value => catalogUpdates.push(['catalog', value]),
    setTargetModelWarning: value => catalogUpdates.push(['warning', value]),
    api: { getTargetModels: async () => [{ id: 'other-target', name: 'Other', category: 'Image' }] },
  });
  effect();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(catalogUpdates.some(update => update[0] === 'catalog'), true);
  assert.match(catalogUpdates.find(update => update[0] === 'warning')[1], /recovered-target/);
  assert.equal(targetModelRef.current, 'recovered-target');
}

async function main() {
  await testStoryboardHandlers();
  await testAppHydrationAndDiscard();
  await testCpeMountConsumers();
  console.log('session recovery UI consumer checks passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
