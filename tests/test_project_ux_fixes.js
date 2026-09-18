#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'CinemaPromptEngineering/frontend');
const typescript = require(path.join(frontend, 'node_modules/typescript'));

function compile(filename, requireImpl) {
  const result = typescript.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2020,
      module: typescript.ModuleKind.CommonJS,
    },
    reportDiagnostics: true,
  });
  const diagnostics = (result.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === typescript.DiagnosticCategory.Error,
  );
  assert.equal(
    diagnostics.length,
    0,
    diagnostics.map((diagnostic) => typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'),
  );
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require: requireImpl || require,
    console,
    Date,
    URL,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(result.outputText, context, { filename });
  return module.exports;
}

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

async function main() {
  const storage = createStorage();
  // The production utility resolves localStorage as a global, so run it once
  // with the same browser storage object used by the test.
  const recentWithStorage = (() => {
    const source = fs.readFileSync(path.join(frontend, 'src/storyboard/services/project-recent.ts'), 'utf8');
    const result = typescript.transpileModule(source, {
      fileName: 'project-recent.ts',
      compilerOptions: { target: typescript.ScriptTarget.ES2020, module: typescript.ModuleKind.CommonJS },
    });
    const module = { exports: {} };
    vm.runInNewContext(result.outputText, {
      module,
      exports: module.exports,
      localStorage: storage,
      Date,
    }, { filename: 'project-recent.ts' });
    return module.exports;
  })();
  recentWithStorage.recordSavedProject('Save As', { success: true, savedPath: '/shots/A_project.json' });
  assert.equal(recentWithStorage.getRecentProjects()[0].path, '/shots/A_project.json');
  recentWithStorage.recordSavedProject('Failed', { success: false, savedPath: '/shots/failed_project.json' });
  assert.equal(recentWithStorage.getRecentProjects().length, 1, 'failed saves must not create recents');
  recentWithStorage.recordSavedProject('Missing path', { success: true });
  assert.equal(recentWithStorage.getRecentProjects().length, 1, 'successful saves without a returned path must not guess one');

  recentWithStorage.recordLoadedProject('/shots/B_project.json', {
    success: true,
    state: { project_settings: { name: 'Loaded B' } },
  });
  recentWithStorage.recordLoadedProject('/shots/failed_project.json', { success: false });
  const loaded = recentWithStorage.getRecentProjects();
  assert.equal(loaded[0].path, '/shots/B_project.json');
  assert.equal(loaded[0].name, 'Loaded B');
  assert.equal(loaded.length, 2, 'failed loads must not create recents');

  for (let i = 0; i < 12; i++) {
    recentWithStorage.addRecentProject(`Project ${i}`, `/shots/${i}_project.json`);
  }
  assert.equal(recentWithStorage.getRecentProjects().length, 10, 'recents must cap at ten');
  recentWithStorage.addRecentProject('Updated', '/shots/11_project.json');
  assert.equal(recentWithStorage.getRecentProjects().length, 10, 'duplicate paths must stay deduplicated');
  assert.equal(recentWithStorage.getRecentProjects()[0].name, 'Updated');
  assert.equal(recentWithStorage.getRecentProjects()[0].path, '/shots/11_project.json');
  assert.equal(recentWithStorage.getRecentProjects().some((entry) => entry.path === '/shots/B_project.json'), false);

  const actions = compile(
    path.join(frontend, 'src/storyboard/services/project-actions.ts'),
    (request) => request === './project-recent' ? recentWithStorage : require(request),
  );
  await actions.saveProjectAndRecordRecent('Save As', async () => ({
    success: true,
    savedPath: '/shots/actual-save-as_project.json',
  }));
  assert.equal(recentWithStorage.getRecentProjects()[0].path, '/shots/actual-save-as_project.json');
  await actions.saveProjectAndRecordRecent('Failed Save As', async () => ({ success: false }));
  assert.equal(recentWithStorage.getRecentProjects()[0].path, '/shots/actual-save-as_project.json');
  await assert.rejects(
    actions.saveProjectAndRecordRecent('Canceled Save As', async () => { throw new Error('canceled'); }),
  );
  await actions.loadProjectAndRecordRecent('/shots/actual-selected_project.json', async () => ({
    success: true,
    state: { project_settings: { name: 'Actual Selected' } },
  }));
  assert.equal(recentWithStorage.getRecentProjects()[0].path, '/shots/actual-selected_project.json');
  await actions.loadProjectAndRecordRecent('/shots/failed-selected_project.json', async () => ({ success: false }));
  assert.equal(recentWithStorage.getRecentProjects()[0].path, '/shots/actual-selected_project.json');
  await assert.rejects(
    actions.loadProjectAndRecordRecent('/shots/canceled-selected_project.json', async () => { throw new Error('canceled'); }),
  );

  const gallery = compile(path.join(frontend, 'src/gallery/gallery-loading.ts'));
  assert.equal(gallery.getGalleryStatus({ projectPath: '', isProjectLoading: false, isLoading: false, isLoadingFiles: false, error: null, currentFiles: [] }).message, 'Open a project in Storyboard to browse the gallery');
  assert.equal(gallery.getGalleryStatus({ projectPath: '', isProjectLoading: true, isLoading: false, isLoadingFiles: false, error: null, currentFiles: [] }).message, 'Loading project…');
  assert.equal(gallery.getGalleryStatus({ projectPath: '/shots/A', isProjectLoading: false, isLoading: true, isLoadingFiles: false, error: null, currentFiles: [] }).message, 'Scanning folders…');
  assert.equal(gallery.getGalleryStatus({ projectPath: '/shots/A', isProjectLoading: false, isLoading: true, isLoadingFiles: true, error: null, currentFiles: [] }).message, 'Loading files…');
  assert.equal(gallery.getGalleryStatus({ projectPath: '/shots/A', isProjectLoading: false, isLoading: false, isLoadingFiles: false, error: null, currentFiles: [] }).message, 'No files in this folder');
  assert.equal(gallery.getGalleryStatus({ projectPath: '/shots/A', isProjectLoading: false, isLoading: false, isLoadingFiles: false, error: 'offline', currentFiles: [] }).message, 'offline');
  assert.equal(gallery.isCurrentGalleryRequest(1, 2, '/shots/A', '/shots/B'), false, 'late A must not be current after switching to B');
  assert.equal(gallery.isCurrentGalleryRequest(2, 2, '/shots/B', '/shots/B'), true);

  let currentGalleryRequest = { requestId: 1, projectPath: '/shots/A' };
  const galleryState = { content: 'old', loading: true, error: null };
  let resolveA;
  let resolveB;
  const loadA = gallery.runGuardedGalleryRequest(
    1,
    '/shots/A',
    () => currentGalleryRequest,
    () => new Promise((resolve) => { resolveA = resolve; }),
    () => { galleryState.content = 'A'; },
    (error) => { galleryState.error = String(error); },
    () => { galleryState.loading = false; },
  );
  currentGalleryRequest = { requestId: 2, projectPath: '/shots/B' };
  const loadB = gallery.runGuardedGalleryRequest(
    2,
    '/shots/B',
    () => currentGalleryRequest,
    () => new Promise((resolve) => { resolveB = resolve; }),
    () => { galleryState.content = 'B'; },
    (error) => { galleryState.error = String(error); },
    () => { galleryState.loading = false; },
  );
  resolveA('late-A');
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(galleryState, { content: 'old', loading: true, error: null }, 'late A must not replace or finish B');
  resolveB('current-B');
  await Promise.all([loadA, loadB]);
  assert.deepEqual(galleryState, { content: 'B', loading: false, error: null });

  const managerStorage = createStorage();
  let mediaSaveSuccess = true;
  let delayedMediaResolve;
  let delayMediaSave = false;
  // ProjectManager only resolves browser globals when methods run, so create a
  // fresh VM module with the browser globals installed for its public contract.
  const projectSource = fs.readFileSync(path.join(frontend, 'src/storyboard/services/project-manager.ts'), 'utf8');
  const projectOutput = typescript.transpileModule(projectSource, {
    fileName: 'project-manager.ts',
    compilerOptions: { target: typescript.ScriptTarget.ES2020, module: typescript.ModuleKind.CommonJS },
  }).outputText;
  const projectModule = { exports: {} };
  vm.runInNewContext(projectOutput, {
    module: projectModule,
    exports: projectModule.exports,
    require: (request) => request === 'react' ? { useState() {}, useCallback(callback) { return callback; } } : require(request),
    localStorage: managerStorage,
    fetch: async (url, options = {}) => {
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
      if (url.endsWith('/api/save-image')) {
        const response = { ok: true, json: async () => ({ success: mediaSaveSuccess, saved_path: '/shots/media.png' }) };
        if (delayMediaSave) return new Promise((resolve) => { delayedMediaResolve = () => resolve(response); });
        return response;
      }
      if (body.file_path) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            state: {
              project_settings: {
                name: 'Loaded',
                path: '/shots/loaded',
                namingTemplate: '{project}',
                autoSave: false,
                orchestratorUrl: 'http://localhost:9820',
                created: '2026-01-01T00:00:00.000Z',
                lastModified: '2026-01-01T00:00:00.000Z',
              },
              panels: [],
              saved_at: '2026-01-01T00:00:00.000Z',
            },
          }),
        };
      }
      return { ok: true, json: async () => ({ success: true, saved_path: '/shots/B_project.json' }) };
    },
    URL,
    Date,
    setTimeout,
    clearTimeout,
    console,
  }, { filename: 'project-manager.ts' });
  const manager = new projectModule.exports.ProjectManager();
  const notifications = [];
  const unsubscribe = manager.subscribe((settings) => notifications.push(settings.path));
  manager.setProject({ path: '/shots/A', name: 'A' });
  assert.deepEqual(notifications, ['/shots/A']);
  manager.setProject({ path: '/shots/B' });
  assert.deepEqual(notifications, ['/shots/A', '/shots/B']);
  const saveResult = await manager.saveProjectState([]);
  assert.equal(saveResult.savedPath, '/shots/B_project.json');
  const loadResult = await manager.loadProjectState('/shots/loaded_project.json');
  assert.equal(loadResult.success, true);
  assert.deepEqual(notifications, ['/shots/A', '/shots/B', '/shots/B', '/shots/loaded']);

  const mediaMetadata = { timestamp: new Date(), workflowId: '', workflowName: '', seed: 1, promptSummary: '', parameters: {}, workflow: {}, sourceUrl: '', version: 1 };
  await Promise.all([
    manager.saveToProjectFolder('http://comfy/image-a.png', 1, 1, mediaMetadata, 'Panel_01'),
    manager.saveToProjectFolder('http://comfy/image-b.png', 1, 2, mediaMetadata, 'Panel_01'),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 140));
  assert.deepEqual(notifications, ['/shots/A', '/shots/B', '/shots/B', '/shots/loaded', '/shots/loaded'], 'parallel media saves should coalesce one revision');

  const batchOrigin = manager.getProjectIdentity();
  const beforeNormalBatch = notifications.length;
  const normalBatchSave = await manager.saveToProjectFolder(
    'http://comfy/batch.png', 1, 3, mediaMetadata, 'Panel_01', { notifyRevision: false },
  );
  assert.equal(normalBatchSave.success, true);
  await new Promise((resolve) => setTimeout(resolve, 140));
  assert.equal(notifications.length, beforeNormalBatch, 'batched media saves wait for batch completion');
  manager.notifyMediaRevision(batchOrigin);
  await new Promise((resolve) => setTimeout(resolve, 140));
  assert.equal(notifications.length, beforeNormalBatch + 1);

  const beforeFailedMediaSave = notifications.length;
  mediaSaveSuccess = false;
  const failedMedia = await manager.saveToProjectFolder('http://comfy/fail.png', 1, 3, mediaMetadata, 'Panel_01');
  assert.equal(failedMedia.success, false);
  await new Promise((resolve) => setTimeout(resolve, 140));
  assert.equal(notifications.length, beforeFailedMediaSave, 'failed media saves must not notify');

  mediaSaveSuccess = true;
  delayMediaSave = true;
  manager.setProject({ path: '/shots/media-A' });
  const oldProjectSave = manager.saveToProjectFolder('http://comfy/old.png', 1, 4, mediaMetadata, 'Panel_01');
  manager.setProject({ path: '/shots/media-B' });
  const afterProjectSwitch = notifications.length;
  delayedMediaResolve();
  await oldProjectSave;
  await new Promise((resolve) => setTimeout(resolve, 140));
  assert.equal(notifications.length, afterProjectSwitch, 'late old-project media save must not refresh the new project');
  delayMediaSave = false;

  const notificationsBeforeUnsubscribe = [...notifications];
  unsubscribe();
  manager.setProject({ path: '/shots/C' });
  assert.deepEqual(notifications, notificationsBeforeUnsubscribe, 'unsubscribe must stop project notifications');

  console.log('Project UX fixes regression passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
