#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fakeIndexedDB = require(path.join(__dirname, '..', 'CinemaPromptEngineering/frontend/node_modules/fake-indexeddb'));

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'CinemaPromptEngineering/frontend');
const typescript = require(path.join(frontend, 'node_modules/typescript'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'directors-console-recovery-'));

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

function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = fakeIndexedDB.indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error || new Error('failed to delete test database'));
    request.onsuccess = () => resolve();
  });
}

async function main() {
  global.indexedDB = fakeIndexedDB.indexedDB;
  await deleteDatabase('directors-console-session-drafts');
  const storage = require(compile('session-draft-storage'));
  const recovery = require(compile('session-recovery'));
  const { SessionDraftController, recoverInterruptedPanels, restoreSessionDraft, cleanupRestoredMedia } = recovery;
  const { readActiveDraft } = storage;

  const data = {
    app: { activeTab: 'storyboard' },
    project: { settings: { name: 'A', path: '/tmp/A' } },
    storyboard: {
      activeTab: 'image-generation', activeSubTab: 'text2img', panels: [], selectedPanelId: 1,
      canvasZoom: 1, canvasPan: { x: 0, y: 0 }, leftPanelWidth: 250, rightPanelWidth: 200,
      selectedWorkflowId: 'wf-a',
      parameterValues: {
        prompt: 'fixture prompt',
        dataUrl: 'data:image/png;base64,AA==',
        blob: new Blob(['frame'], { type: 'image/png' }),
      },
      cameraAngles: {}, globalPromptOverride: '', useGlobalPrompt: false,
    },
    cinema: {
      projectType: 'live_action', liveActionConfig: { camera: { body: 'Alexa' } }, animationConfig: {},
      generatedPrompt: 'generated fixture', negativePrompt: null, targetModel: 'generic',
      selectedLiveActionPreset: null, selectedAnimationPreset: null,
    },
  };

  const controller = new SessionDraftController();
  controller.hydrate('unsaved:test-a', data);
  controller.update({ storyboard: {
    ...data.storyboard,
    parameterValues: { ...data.storyboard.parameterValues, prompt: 'changed fixture' },
  } });
  await controller.flush();
  let active = await readActiveDraft();
  assert.equal(active.identity, 'unsaved:test-a');
  assert.equal(active.data.storyboard.parameterValues.prompt, 'changed fixture');
  assert.equal(active.data.storyboard.parameterValues.dataUrl, 'data:image/png;base64,AA==');
  assert.equal(active.data.storyboard.parameterValues.blob instanceof Blob, true);
  assert.equal(await active.data.storyboard.parameterValues.blob.text(), 'frame');
  const restored = await restoreSessionDraft(active.data);
  assert.match(restored.storyboard.parameterValues.blob, /^blob:/);
  cleanupRestoredMedia();

  controller.setIdentity('project:/tmp/B/project.json');
  controller.update({ project: { settings: { name: 'B', path: '/tmp/B' } } });
  await controller.flush();
  active = await readActiveDraft();
  assert.equal(active.identity, 'project:/tmp/B/project.json');
  assert.equal(active.data.project.settings.name, 'B');

  const interrupted = recoverInterruptedPanels([
    { id: 1, status: 'generating', progress: 42, parallelJobs: [{ status: 'running' }] },
    { id: 2, status: 'complete', progress: 100 },
  ]);
  assert.equal(interrupted[0].status, 'error');
  assert.equal(interrupted[0].progress, 0);
  assert.equal(interrupted[0].parallelJobs, undefined);
  assert.match(interrupted[0].errorMessage, /not resubmitted/i);
  assert.equal(interrupted[1].status, 'complete');

  console.log('session recovery consumer regression checks passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
