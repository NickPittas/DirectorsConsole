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
  const connected = { 'http://a': 'connected', 'http://b': 'connected', 'http://direct': 'connected' };
  const base = {
    directUrl: 'http://direct', managedNodes: nodes, browserStatuses: connected,
    selectedBackendIds: [], connectionStatus: 'connected',
  };
  assert.equal(target.resolveGenerationTarget({ ...base, panelNodeId: 'a' }).url, 'http://a');
  assert.match(target.getGenerationDisabledReason(true, { ...base, panelNodeId: 'missing' }), /assignment is missing/);
  assert.match(target.getGenerationDisabledReason(true, { ...base, panelNodeId: 'a', managedNodes: [{ ...nodes[0], status: 'busy' }, nodes[1]] }), /busy/);
  assert.match(target.getGenerationDisabledReason(true, { ...base, panelNodeId: 'a', managedNodes: [{ ...nodes[0], status: 'offline' }, nodes[1]] }), /offline/);
  assert.equal(target.resolveGenerationTarget({ ...base, panelNodeId: 'auto' }).url, 'http://a');
  assert.equal(target.resolveGenerationTarget({ ...base, selectedBackendIds: ['b'] }).url, 'http://b');
  assert.equal(target.resolveGenerationTarget({ ...base, managedNodes: [], panelNodeId: '' }).url, 'http://direct');
  assert.equal(target.resolveGenerationTarget({ ...base, directUrl: 'http://a', managedNodes: [{ ...nodes[0], status: 'offline' }], panelNodeId: '' }).kind, 'none', 'managed URL is never used as an unmanaged fallback');

  let intervalCallback;
  let cleared = false;
  const results = [];
  let resolveOld;
  let resolveNew;
  const oldPromise = new Promise(resolve => { resolveOld = resolve; });
  const newPromise = new Promise(resolve => { resolveNew = resolve; });
  const lifecycle = loadLifecycleService(probeService);
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
