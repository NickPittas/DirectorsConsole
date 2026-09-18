#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'CinemaPromptEngineering/frontend');
const typescript = require(path.join(frontend, 'node_modules/typescript'));

function compile(filename, dependency = require) {
  const result = typescript.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { target: typescript.ScriptTarget.ES2020, module: typescript.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  const diagnostics = (result.diagnostics || []).filter(d => d.category === typescript.DiagnosticCategory.Error);
  assert.equal(diagnostics.length, 0, diagnostics.map(d => typescript.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  const module = { exports: {} };
  vm.runInNewContext(result.outputText, {
    module,
    exports: module.exports,
    require: dependency,
    console,
    window: { setInterval, clearInterval },
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    fetch: (...args) => global.fetch(...args),
  }, { filename });
  return module.exports;
}

function loadProbeService() {
  return compile(path.join(frontend, 'src/storyboard/comfyui-client.ts'));
}

function loadTargetService() {
  const probeService = loadProbeService();
  return compile(
    path.join(frontend, 'src/storyboard/services/generation-target.ts'),
    request => request === '../comfyui-client' ? probeService : require(request),
  );
}

function loadLifecycleService(probeService) {
  return compile(
    path.join(frontend, 'src/storyboard/services/comfyui-probe-lifecycle.ts'),
    request => request === '../comfyui-client' ? probeService : require(request),
  );
}

function response(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function main() {
  const probeService = loadProbeService();
  global.fetch = async url => {
    assert.equal(url, 'http://node/system_stats');
    return response(200, { system: { os: 'linux' }, devices: [] });
  };
  const success = await probeService.probeComfyUI('http://node/');
  assert.equal(success.ok, true);
  assert.equal(success.stats.system.os, 'linux');

  global.fetch = async () => { throw new TypeError('Failed to fetch'); };
  assert.equal((await probeService.probeComfyUI('http://node')).failure, 'network');

  const target = loadTargetService();
  const nodes = [
    { id: 'a', name: 'A', url: 'http://a', status: 'online', os: 'linux' },
    { id: 'b', name: 'B', url: 'http://b', status: 'online', os: 'linux' },
  ];
  const connected = { 'http://a': 'connected', 'http://b': 'connected' };
  const base = {
    managedNodes: nodes, browserStatuses: connected,
    selectedBackendIds: [], connectionStatus: 'connected',
  };
  assert.equal(target.resolveGenerationTarget({ ...base, panelNodeId: 'a' }).url, 'http://a');
  assert.match(target.getGenerationDisabledReason(true, { ...base, panelNodeId: 'missing' }), /assignment is missing/);
  assert.match(target.getGenerationDisabledReason(true, { ...base, panelNodeId: 'a', managedNodes: [{ ...nodes[0], status: 'busy' }, nodes[1]] }), /busy/);
  assert.match(target.getGenerationDisabledReason(true, { ...base, panelNodeId: 'a', managedNodes: [{ ...nodes[0], status: 'offline' }, nodes[1]] }), /offline/);
  assert.equal(target.resolveGenerationTarget({ ...base, panelNodeId: 'auto' }).url, 'http://a');
  assert.equal(target.resolveGenerationTarget({ ...base, selectedBackendIds: ['b'] }).url, 'http://b');
  const noNodes = target.resolveGenerationTarget({
    ...base,
    managedNodes: [],
    browserStatuses: { 'http://legacy-direct': 'connected' },
    panelNodeId: '',
  });
  assert.equal(noNodes.kind, 'none');
  assert.match(noNodes.reason, /Manage Nodes/);
  assert.equal(target.resolveGenerationTarget({
    ...base,
    managedNodes: [{ ...nodes[0], status: 'offline' }],
    browserStatuses: { 'http://legacy-direct': 'connected' },
    panelNodeId: '',
  }).kind, 'none', 'offline managed nodes cannot fall back to an unmanaged URL');
  assert.equal(target.resolveGenerationTarget({
    ...base,
    managedNodes: [{ ...nodes[0], status: 'busy' }],
    browserStatuses: { 'http://legacy-direct': 'connected' },
    panelNodeId: '',
  }).kind, 'none', 'busy managed nodes cannot fall back to an unmanaged URL');
  assert.equal(target.resolveGenerationTarget({ ...base, panelNodeId: 'missing' }).kind, 'blocked');

  const lifecycle = loadLifecycleService(probeService);
  const remoteUrls = lifecycle.getManagedComfyUIProbeUrls([
    { url: 'http://remote:8188/' },
    { url: 'http://remote:8188' },
    { url: 'http://other:8188' },
  ]);
  assert.deepEqual(Array.from(remoteUrls), ['http://remote:8188', 'http://other:8188']);
  const probedRemoteUrls = [];
  const cleanupRemote = lifecycle.startComfyUIProbeLifecycle({
    urls: remoteUrls,
    probe: async url => { probedRemoteUrls.push(url); return { ok: true }; },
    setStatuses: () => {},
    onResult: () => {},
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });
  await new Promise(resolve => setImmediate(resolve));
  cleanupRemote();
  assert.deepEqual(probedRemoteUrls, Array.from(remoteUrls));
  assert.equal(probedRemoteUrls.some(url => url.includes('localhost')), false);

  const cleanupNoNodes = lifecycle.startComfyUIProbeLifecycle({
    urls: lifecycle.getManagedComfyUIProbeUrls([]),
    probe: async () => { throw new Error('no probe expected'); },
    setStatuses: statuses => assert.equal(Object.keys(statuses).length, 0),
    onResult: () => {},
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });
  await Promise.resolve();
  cleanupNoNodes();

  const localNode = { id: 'local', name: 'Local', url: 'http://localhost:8188', status: 'online', os: 'linux' };
  assert.equal(target.resolveGenerationTarget({
    ...base,
    managedNodes: [localNode],
    browserStatuses: { 'http://localhost:8188': 'connected' },
    panelNodeId: 'local',
  }).url, 'http://localhost:8188');
  const probedLocalUrls = [];
  const cleanupLocal = lifecycle.startComfyUIProbeLifecycle({
    urls: lifecycle.getManagedComfyUIProbeUrls([localNode]),
    probe: async url => { probedLocalUrls.push(url); return { ok: true }; },
    setStatuses: () => {},
    onResult: () => {},
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });
  await new Promise(resolve => setImmediate(resolve));
  cleanupLocal();
  assert.deepEqual(probedLocalUrls, ['http://localhost:8188']);

  let intervalCallback;
  let cleared = false;
  const results = [];
  let resolveOld;
  let resolveNew;
  const oldPromise = new Promise(resolve => { resolveOld = resolve; });
  const newPromise = new Promise(resolve => { resolveNew = resolve; });
  const cleanupA = lifecycle.startComfyUIProbeLifecycle({
    urls: ['http://old'],
    setStatuses: statuses => assert.equal(statuses['http://old'], 'connecting'),
    probe: () => oldPromise,
    onResult: (url, result) => results.push([url, result]),
    setIntervalFn: callback => { intervalCallback = callback; return 1; },
    clearIntervalFn: () => { cleared = true; },
  });
  await Promise.resolve();
  cleanupA();
  assert.equal(cleared, true);

  const cleanupB = lifecycle.startComfyUIProbeLifecycle({
    urls: ['http://new'],
    setStatuses: statuses => assert.equal(statuses['http://new'], 'connecting'),
    probe: () => newPromise,
    onResult: (url, result) => results.push([url, result]),
    setIntervalFn: callback => { intervalCallback = callback; return 2; },
    clearIntervalFn: () => {},
  });
  resolveNew({ ok: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(results, [['http://new', { ok: true }]], 'new URL completion must win over old URL completion');
  resolveOld({ ok: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(results, [['http://new', { ok: true }]], 'late old completion must not overwrite the selected URL');
  assert.equal(typeof intervalCallback, 'function');
  cleanupB();

  console.log('Storyboard issue #6 connection/target/lifecycle regression passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
