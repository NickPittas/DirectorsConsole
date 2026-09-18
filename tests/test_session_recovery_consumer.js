#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const fakeIndexedDB = require(path.join(__dirname, '..', 'CinemaPromptEngineering/frontend/node_modules/fake-indexeddb'));

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'CinemaPromptEngineering/frontend');
const typescript = require(path.join(frontend, 'node_modules/typescript'));
const frontendRequire = createRequire(path.join(frontend, 'package.json'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'directors-console-consumer-'));

function compile(name) {
  const source = fs.readFileSync(path.join(frontend, 'src/storyboard/services', `${name}.ts`), 'utf8');
  const output = typescript.transpileModule(source, {
    fileName: `${name}.ts`,
    compilerOptions: { target: typescript.ScriptTarget.ES2020, module: typescript.ModuleKind.CommonJS },
  }).outputText;
  const filename = path.join(temp, `${name}.js`);
  fs.writeFileSync(filename, output);
  return filename;
}

function loadFrontendModule(relativePath) {
  const filename = path.join(frontend, relativePath);
  const output = typescript.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { target: typescript.ScriptTarget.ES2020, module: typescript.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    require: request => request === 'react'
      ? { useState: initial => [initial, () => {}], useCallback: callback => callback }
      : frontendRequire(request),
    console,
    localStorage: global.localStorage,
    window: global.window,
    Blob,
    Date,
    Map,
    Set,
    ArrayBuffer,
    WeakMap,
    URL,
    fetch: (...args) => global.fetch(...args),
  }, { filename });
  return module.exports;
}

function loadStore(recovery) {
  const source = fs.readFileSync(path.join(frontend, 'src/store/index.ts'), 'utf8');
  const output = typescript.transpileModule(source, {
    fileName: 'store.ts',
    compilerOptions: { target: typescript.ScriptTarget.ES2020, module: typescript.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    require: request => request === '@/storyboard/services/session-recovery' ? recovery : frontendRequire(request),
    console,
    setTimeout,
    clearTimeout,
  }, { filename: 'store.ts' });
  return module.exports;
}

function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = fakeIndexedDB.indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error || new Error('failed to delete test database'));
    request.onblocked = () => reject(new Error('database deletion blocked'));
    request.onsuccess = () => resolve();
  });
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function testProjectSaveSnapshot() {
  const { ProjectManager } = loadFrontendModule('src/storyboard/services/project-manager.ts');
  const manager = new ProjectManager();
  manager.restoreFromSession({
    name: 'Snapshot', path: '/tmp/snapshot', orchestratorUrl: 'http://orchestrator:9820',
    created: new Date('2026-01-01'), lastModified: new Date('2026-01-01'),
  });

  const frame = new Blob(['generated-frame'], { type: 'image/png' });
  const panel = {
    id: 1,
    name: 'Hero',
    x: 10,
    y: 20,
    width: 300,
    height: 300,
    imageHistory: [{
      id: 'generated-1',
      url: 'blob:generated-preview',
      metadata: {
        timestamp: new Date('2026-02-01'),
        workflowId: 'workflow-a',
        workflowName: 'Generated',
        seed: 42,
        promptSummary: 'hero',
        parameters: { nested: { keep: true } },
        workflow: { node: { class_type: 'KSampler' } },
        sourceUrl: 'http://managed-node/view',
        savedPath: '/tmp/snapshot/Hero/v001.png',
        version: 1,
        rating: 5,
      },
    }],
    parameterValues: {
      reference: 'data:image/png;base64,AA==',
      nested: { preview: frame, generated: [{ seed: 42 }] },
    },
  };
  const globalParameters = { mask: 'data:video/mp4;base64,BB==', nested: { frame } };
  const originalPanels = structuredCloneLike(panel);
  const originalGlobal = structuredCloneLike(globalParameters);
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    requests.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    if (url.includes('/api/save-base64-image')) {
      const body = JSON.parse(init.body);
      return response(200, { success: true, saved_path: `${body.folder_path}/stored-${body.filename}` });
    }
    if (url.includes('/api/save-project')) return response(500, { success: false, message: 'save failed' });
    return response(200, { success: true });
  };
  try {
    const failed = await manager.saveProjectState([panel], undefined, globalParameters);
    assert.equal(failed.success, false);
    assert.deepEqual(panel, originalPanels, 'failed Save As must not mutate the live panel or generated history');
    assert.deepEqual(globalParameters, originalGlobal, 'failed Save As must not mutate live global media');
    assert.equal(requests.filter(request => request.url.includes('/api/save-base64-image')).length, 2);

    global.fetch = async (url, init) => {
      requests.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
      if (url.includes('/api/save-base64-image')) {
        const body = JSON.parse(init.body);
        return response(200, { success: true, saved_path: `${body.folder_path}/stored-${body.filename}` });
      }
      if (url.includes('/api/save-project')) return response(200, { success: true, saved_path: '/tmp/snapshot/Snapshot_project.json' });
      return response(200, { success: true });
    };
    const saved = await manager.saveProjectState([panel], undefined, globalParameters);
    assert.equal(saved.success, true);
    assert.deepEqual(panel, originalPanels, 'successful save also keeps live data URLs and history untouched');
    assert.deepEqual(globalParameters, originalGlobal);
    const projectRequest = requests.find(request => request.url.includes('/api/save-project'));
    assert.match(projectRequest.body.state.panels[0].parameterValues.reference, /^__fileref::/);
    assert.match(projectRequest.body.state.parameter_values.mask, /^__fileref::/);
    assert.equal(Object.prototype.toString.call(panel.parameterValues.nested.preview), '[object Blob]');
    assert.equal(Object.prototype.toString.call(globalParameters.nested.frame), '[object Blob]');
  } finally {
    global.fetch = originalFetch;
  }
}

function structuredCloneLike(value) {
  if (value instanceof Blob) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(structuredCloneLike);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, structuredCloneLike(item)]));
  return value;
}

function makeData(project) {
  return {
    app: { activeTab: 'storyboard' },
    project: { settings: { name: project, path: `/tmp/${project}` } },
    storyboard: {
      activeTab: 'image-generation', activeSubTab: 'text2img', panels: [], selectedPanelId: null,
      canvasZoom: 1, canvasPan: { x: 0, y: 0 }, leftPanelWidth: 250, rightPanelWidth: 200,
      selectedWorkflowId: null, parameterValues: {}, cameraAngles: {}, globalPromptOverride: '', useGlobalPrompt: false,
    },
    cinema: {
      projectType: 'live_action', liveActionConfig: {}, animationConfig: {}, generatedPrompt: 'generated',
      negativePrompt: null, userPrompt: 'user text', enhancedPrompt: 'enhanced text', targetModel: 'restored-model',
      selectedLiveActionPreset: null, selectedAnimationPreset: null,
    },
  };
}

async function main() {
  global.indexedDB = fakeIndexedDB.indexedDB;
  const values = new Map();
  global.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  await deleteDatabase('directors-console-session-drafts');

  const storage = require(compile('session-draft-storage'));
  const recovery = require(compile('session-recovery'));
  compile('project-recent');
  const actions = require(compile('project-actions'));
  const { SessionDraftController, activateSessionIdentity, isSessionDraftData, readRecoverableActiveDraft } = recovery;
  const { readActiveDraft, readDraft, saveDraft, deleteDraft } = storage;

  const dataA = makeData('A');
  assert.equal(isSessionDraftData(dataA), true);
  const { useCinemaStore } = loadStore(recovery);
  useCinemaStore.getState().hydrateSession(dataA.cinema);
  const hydratedCinema = useCinemaStore.getState();
  assert.equal(hydratedCinema.userPrompt, 'user text');
  assert.equal(hydratedCinema.enhancedPrompt, 'enhanced text');
  assert.equal(hydratedCinema.targetModel, 'restored-model');
  assert.equal(await readActiveDraft(), null, 'initial store hydration must not autosave defaults');
  const controller = new SessionDraftController();
  dataA.storyboard.parameterValues.preview = 'blob:held-for-transition';
  const originalFetch = global.fetch;
  let releaseMaterialization;
  let heldMaterialization = false;
  let materializationStarted;
  const materializationReady = new Promise(resolve => { materializationStarted = resolve; });
  global.fetch = url => {
    if (url === 'blob:held-for-transition') {
      materializationStarted();
      if (heldMaterialization) return Promise.resolve({ ok: true, blob: async () => new Blob(['frame']) });
      heldMaterialization = true;
      return new Promise(resolve => { releaseMaterialization = () => resolve({ ok: true, blob: async () => new Blob(['frame']) }); });
    }
    return originalFetch(url);
  };
  controller.hydrate('project:A', dataA);
  controller.update({ project: { settings: { name: 'A changed' } } });
  const oldFlush = controller.flush();
  await Promise.race([
    materializationReady,
    new Promise((_, reject) => setTimeout(() => reject(new Error('materialization did not start')), 1000)),
  ]);

  // Queue an old autosave while Save As is waiting on its long write.
  const transition = activateSessionIdentity(controller, 'project:B');
  controller.update({ project: { settings: { name: 'latest A' } } });
  releaseMaterialization();
  await Promise.race([
    oldFlush,
    new Promise((_, reject) => setTimeout(() => reject(new Error('old flush did not finish')), 1000)),
  ]);
  await transition;
  assert.equal(controller.getIdentity(), 'project:B');
  assert.equal(await readActiveDraft(), null, 'transition must clear A before B writes');
  assert.equal((await readDraft('project:A')).data.project.settings.name, 'latest A');

  // The new B payload becomes active only after its own write.
  assert.equal(controller.getIdentity(), 'project:B');
  assert.equal(await readActiveDraft(), null, 'new identity must not recover A before B writes');
  controller.update({ project: { settings: { name: 'B' } } });
  await controller.flush();
  assert.equal((await readActiveDraft()).identity, 'project:B');
  assert.equal((await readDraft('project:A')).data.project.settings.name, 'latest A');
  global.fetch = originalFetch;

  // A requested manual save failure leaves the old identity and dirty work intact.
  controller.hydrate('project:A', dataA);
  controller.update({ project: { settings: { name: 'unsaved A' } } });
  const originalPut = fakeIndexedDB.IDBObjectStore.prototype.put;
  try {
    fakeIndexedDB.IDBObjectStore.prototype.put = function failA(value, key) {
      if (key === 'draft:project:A') throw new DOMException('quota', 'QuotaExceededError');
      return originalPut.call(this, value, key);
    };
    await controller.flush();
    assert.equal(controller.getStatus().state, 'failed');
    assert.equal(controller.getStatus().message, 'Autosave unavailable — save manually.');
    assert.equal(controller.hasPendingChanges(), true, 'quota failure remains visibly dirty for retry/manual save');
    await assert.rejects(controller.transitionIdentity('project:B'));
  } finally {
    fakeIndexedDB.IDBObjectStore.prototype.put = originalPut;
  }
  assert.equal(controller.getIdentity(), 'project:A');
  assert.equal(controller.hasPendingChanges(), true);
  await controller.flush();
  await activateSessionIdentity(controller, 'project:B', { discard: true });
  assert.equal(controller.getIdentity(), 'project:B');

  // Invalid active payload exposes only its pointed record for confirmed discard.
  await saveDraft({ version: 1, identity: 'project:corrupt', updatedAt: Date.now(), data: { invalid: true } }, { activate: true });
  await assert.rejects(readRecoverableActiveDraft, error => {
    assert.equal(error.activeIdentity, 'project:corrupt');
    return true;
  });
  await deleteDraft('project:corrupt');
  assert.equal(await readActiveDraft(), null);

  // Failed project action is visible and does not create a recent-project entry.
  const failed = await actions.saveProjectAndRecordRecent('A', async () => ({ success: false, error: 'cancelled' }));
  assert.equal(failed.success, false);
  assert.equal(global.localStorage.getItem('storyboard_recent_projects'), null);

  await testProjectSaveSnapshot();
  console.log('session recovery production consumer checks passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
