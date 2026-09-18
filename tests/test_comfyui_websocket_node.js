#!/usr/bin/env node
/* Standalone regression test: transpile the service with TypeScript, then run it in Node. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadService() {
  const frontend = path.resolve(__dirname, '../CinemaPromptEngineering/frontend');
  const candidates = [
    process.env.TYPESCRIPT_PATH,
    path.join(frontend, 'node_modules/typescript'),
    path.resolve(__dirname, '../node_modules/typescript'),
  ].filter(Boolean);
  let typescript;
  for (const candidate of candidates) {
    try {
      typescript = require(candidate);
      break;
    } catch (_) {
      // Try the next existing project install.
    }
  }
  if (!typescript) {
    throw new Error('TypeScript is required; run npm install in CinemaPromptEngineering/frontend or set TYPESCRIPT_PATH.');
  }

  const filename = path.resolve(frontend, 'src/storyboard/services/comfyui-websocket.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const result = typescript.transpileModule(source, {
    fileName: filename,
    compilerOptions: { target: typescript.ScriptTarget.ES2020, module: typescript.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  const diagnostics = (result.diagnostics || []).filter((diagnostic) => diagnostic.category === typescript.DiagnosticCategory.Error);
  assert.equal(diagnostics.length, 0, diagnostics.map((diagnostic) => typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'));

  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require,
    console,
    setTimeout,
    clearTimeout,
    fetch: (...args) => global.fetch(...args),
    AbortController,
    AbortSignal,
    Blob,
    WebSocket: MockWebSocket,
    Math,
    Date,
  };
  vm.runInNewContext(result.outputText, sandbox, { filename });
  return module.exports.ComfyUIWebSocket;
}

const sockets = [];
class MockWebSocket {
  static OPEN = 1;

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    sockets.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  message(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  close() {
    this.readyState = 3;
  }
}

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  };
}

function waitForWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function installFetch(state) {
  const calls = [];
  global.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.push({ url, method, init });
    const parsed = new URL(url);
    if (parsed.pathname === '/history/error-after-null') {
      return response(200, {
        'error-after-null': {
          status: {
            completed: true,
            status_str: 'error',
            messages: [['execution_error', { exception_type: 'RuntimeError', exception_message: 'interrupted render' }]],
          },
        },
      });
    }
    if (parsed.pathname.startsWith('/history/')) {
      const history = typeof state.history === 'function' ? state.history() : (state.history || {});
      return response(200, history);
    }
    if (parsed.pathname === '/queue' && method === 'GET') {
      return response(state.queueStatusCode || 200, state.queuePayload());
    }
    if (parsed.pathname === '/queue' && method === 'POST') {
      const body = JSON.parse(init.body);
      assert.deepEqual(body, { delete: [state.promptId] });
      if (state.deleteStatus) return response(state.deleteStatus);
      if (state.onDelete) state.onDelete();
      if (state.queueState === 'pending') state.deleted = true;
      return response(200, {});
    }
    if (parsed.pathname === '/interrupt' && method === 'POST') {
      state.interruptCalls = (state.interruptCalls || 0) + 1;
      if (state.onInterrupt) state.onInterrupt();
      return response(state.interruptStatus || 200);
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  };
  return calls;
}

function queueState(state) {
  if (state.deleted && state.queueState === 'pending') return 'absent';
  return state.queueState;
}

async function test() {
  const ComfyUIWebSocket = loadService();

  // An interruption owns the terminal result; a following executing(null) must not succeed.
  {
    const state = { promptId: 'interrupted', queueState: 'running', queuePayload: () => ({ queue_running: [['x', 'interrupted']], queue_pending: [] }) };
    const calls = installFetch(state);
    const service = new ComfyUIWebSocket('http://node');
    const errors = [];
    let completed = 0;
    service.trackPrompt('interrupted', 1, () => {}, () => { completed++; }, (_id, error) => errors.push(error));
    service.connect();
    const socket = sockets.at(-1);
    socket.open();
    socket.message({ type: 'execution_interrupted', data: { prompt_id: 'interrupted' } });
    socket.message({ type: 'executing', data: { prompt_id: 'interrupted', node: null } });
    await waitForWork();
    assert.equal(completed, 0);
    assert.deepEqual(errors, ['Generation cancelled']);
    assert.equal(calls.length, 0, 'terminal WS event should clean reconciliation before it polls');
    service.disconnect();
  }

  // A null execution event must verify history and surface its error, not report success.
  {
    const state = { promptId: 'error-after-null', queueState: 'running', queuePayload: () => ({ queue_running: [['x', 'error-after-null']], queue_pending: [] }) };
    installFetch(state);
    const service = new ComfyUIWebSocket('http://node');
    const errors = [];
    let completed = 0;
    service.trackPrompt('error-after-null', 1, () => {}, () => { completed++; }, (_id, error) => errors.push(error));
    service.connect();
    const socket = sockets.at(-1);
    socket.open();
    socket.message({ type: 'executing', data: { prompt_id: 'error-after-null', node: null } });
    await waitForWork();
    assert.equal(completed, 0);
    assert.deepEqual(errors, ['RuntimeError: interrupted render']);
    service.disconnect();
  }

  // History recovery passes only outputs and cleans the prompt exactly once.
  {
    const outputs = { '9': { images: [{ filename: 'recovered.png' }] } };
    const state = { promptId: 'recovered', history: { recovered: { outputs, status: { completed: true, status_str: 'success' } } }, queueState: 'absent', queuePayload: () => ({ queue_running: [], queue_pending: [] }) };
    installFetch(state);
    const service = new ComfyUIWebSocket('http://node');
    const seen = [];
    service.trackPrompt('recovered', 1, () => {}, (id, result) => seen.push([id, result]), (_id, error) => { throw new Error(error); });
    await sleep(20);
    assert.deepEqual(seen, [['recovered', outputs]]);
    service.untrackPrompt('recovered');
  }

  // A queued prompt is confirmed cancelled only after bounded queue reconciliation.
  {
    const state = { promptId: 'queued-cancel', queueState: 'pending', queuePayload: () => ({
      queue_running: [],
      queue_pending: queueState(state) === 'pending' ? [['x', 'queued-cancel']] : [],
    }) };
    installFetch(state);
    const service = new ComfyUIWebSocket('http://node');
    const errors = [];
    service.trackPrompt('queued-cancel', 1, () => {}, () => {}, (_id, error) => errors.push(error));
    assert.equal(await service.cancelGeneration('queued-cancel'), true);
    assert.deepEqual(errors, ['Generation cancelled']);
    assert.equal(state.interruptCalls || 0, 0);
    service.disconnect();
  }

  // An interrupt 200 with the prompt still running is only an acknowledgement.
  {
    const state = {
      promptId: 'ack-only', queueState: 'running', interruptRequested: false,
      queuePayload: () => ({
        queue_running: state.interruptRequested ? [] : [['x', 'ack-only']], queue_pending: [],
      }),
      onInterrupt: () => { state.interruptRequested = true; },
    };
    installFetch(state);
    const service = new ComfyUIWebSocket('http://node');
    const errors = [];
    service.trackPrompt('ack-only', 1, () => {}, () => {}, (_id, error) => errors.push(error));
    assert.equal(await service.cancelGeneration('ack-only'), false);
    assert.deepEqual(errors, []);
    assert.equal(state.interruptCalls, 1);
    service.untrackPrompt('ack-only');
    service.disconnect();
  }

  // True interruption is confirmed by history, and a buffered null event cannot duplicate it.
  {
    const state = {
      promptId: 'true-interrupt', queueState: 'running', interrupted: false,
      queuePayload: () => ({ queue_running: state.interrupted ? [] : [['x', 'true-interrupt']], queue_pending: [] }),
      history: () => state.interrupted ? { 'true-interrupt': { status: {
        completed: true, status_str: 'success', messages: [['execution_interrupted', {}]],
      } } } : {},
      onInterrupt: () => {
        state.interrupted = true;
        sockets.at(-1)?.message({ type: 'execution_interrupted', data: { prompt_id: 'true-interrupt' } });
        sockets.at(-1)?.message({ type: 'executing', data: { prompt_id: 'true-interrupt', node: null } });
      },
    };
    installFetch(state);
    const service = new ComfyUIWebSocket('http://node');
    const errors = [];
    let completed = 0;
    service.trackPrompt('true-interrupt', 1, () => {}, () => completed++, (_id, error) => errors.push(error));
    service.connect();
    sockets.at(-1).open();
    await waitForWork();
    assert.equal(await service.cancelGeneration('true-interrupt'), true);
    assert.equal(completed, 0);
    assert.deepEqual(errors, ['Generation cancelled']);
    service.disconnect();
  }

  // A render completing during /interrupt keeps its outputs and resumes normal completion.
  {
    const outputs = { '9': { images: [{ filename: 'during-interrupt.png' }] } };
    const state = {
      promptId: 'complete-interrupt', queueState: 'running', completed: false,
      queuePayload: () => ({ queue_running: state.completed ? [] : [['x', 'complete-interrupt']], queue_pending: [] }),
      history: () => state.completed ? { 'complete-interrupt': {
        outputs, status: { completed: true, status_str: 'success' },
      } } : {},
      onInterrupt: () => {
        state.completed = true;
        sockets.at(-1)?.message({ type: 'executing', data: { prompt_id: 'complete-interrupt', node: null } });
      },
    };
    installFetch(state);
    const service = new ComfyUIWebSocket('http://node');
    const results = [];
    const errors = [];
    service.trackPrompt('complete-interrupt', 1, () => {}, (_id, value) => results.push(value), (_id, error) => errors.push(error));
    service.connect();
    sockets.at(-1).open();
    await waitForWork();
    assert.equal(await service.cancelGeneration('complete-interrupt'), false);
    assert.deepEqual(results, [outputs]);
    assert.deepEqual(errors, []);
    service.disconnect();
  }

  // A pending prompt can start before deletion; interrupt it only after observing that exact ID running.
  {
    const state = {
      promptId: 'promoted', queueState: 'pending', interrupted: false,
      onDelete: () => { state.queueState = 'running'; },
      queuePayload: () => ({
        queue_running: state.queueState === 'running' && !state.interrupted ? [['x', 'promoted']] : [],
        queue_pending: state.queueState === 'pending' ? [['x', 'promoted']] : [],
      }),
      history: () => state.interrupted ? { promoted: { status: {
        completed: false, status_str: 'error', messages: [['execution_interrupted', {}]],
      } } } : {},
      onInterrupt: () => { state.interrupted = true; },
    };
    installFetch(state);
    const service = new ComfyUIWebSocket('http://node');
    const errors = [];
    service.trackPrompt('promoted', 1, () => {}, () => {}, (_id, error) => errors.push(error));
    assert.equal(await service.cancelGeneration('promoted'), true);
    assert.equal(state.interruptCalls, 1);
    assert.deepEqual(errors, ['Generation cancelled']);
    service.disconnect();
  }

  // Absent prompts and HTTP failures are false, with no fake cancellation callback.
  {
    const absent = { promptId: 'absent', queueState: 'absent', queuePayload: () => ({ queue_running: [], queue_pending: [] }) };
    installFetch(absent);
    const service = new ComfyUIWebSocket('http://node');
    assert.equal(await service.cancelGeneration('absent'), false);
    assert.equal(absent.interruptCalls || 0, 0);
    service.disconnect();

    const failed = { promptId: 'failed', queueState: 'running', deleteStatus: 503, queuePayload: () => ({ queue_running: [['x', 'failed']], queue_pending: [] }) };
    const failedCalls = installFetch(failed);
    const failedService = new ComfyUIWebSocket('http://node');
    const errors = [];
    failedService.trackPrompt('failed', 1, () => {}, () => {}, (_id, error) => errors.push(error));
    assert.equal(await failedService.cancelGeneration('failed'), false);
    assert.deepEqual(errors, []);
    failedService.untrackPrompt('failed');
    const callsBeforeWait = failedCalls.length;
    await sleep(20);
    assert.equal(failedCalls.length, callsBeforeWait, 'untrackPrompt must leave no polling timer behind');
    failedService.disconnect();
  }

  // Missing/unreachable recovery is bounded, but queued long renders remain tracked.
  for (const mode of ['missing', 'unreachable', 'queued']) {
    const state = { promptId: mode, queueState: mode === 'queued' ? 'pending' : 'absent',
      queuePayload: () => ({ queue_running: [], queue_pending: mode === 'queued' ? [['x', mode]] : [] }) };
    installFetch(state);
    if (mode === 'unreachable') global.fetch = async () => { throw new Error('offline'); };
    const service = new ComfyUIWebSocket('http://node');
    const errors = [];
    service.reconciliationIntervalMs = 10000;
    service.trackPrompt(mode, 1, () => {}, () => assert.fail('unexpected completion'), (_id, error) => errors.push(error));
    for (let attempt = 0; attempt < 4; attempt++) await service.reconcilePrompt(mode);
    assert.equal(errors.length, mode === 'queued' ? 0 : 1);
    service.disconnect();
  }

  // Completing while cancellation is in flight must retain the output, not report cancelled.
  {
    const outputs = { '9': { images: [{ filename: 'finished.png' }] } };
    const state = { promptId: 'race', queueState: 'pending',
      history: { race: { outputs, status: { completed: true, status_str: 'success' } } },
      queuePayload: () => ({ queue_running: [], queue_pending: state.deleted ? [] : [['x', 'race']] }) };
    installFetch(state);
    const service = new ComfyUIWebSocket('http://node');
    const results = [];
    service.trackPrompt('race', 1, () => {}, (_id, value) => results.push(value), () => assert.fail('unexpected cancellation'));
    assert.equal(await service.cancelGeneration('race'), false);
    await sleep(20);
    assert.deepEqual(results, [outputs]);
    service.disconnect();
  }

  // Disconnect while HTTP recovery is in flight cannot fire a late UI/save callback.
  {
    let resolveHistory;
    global.fetch = async url => url.includes('/history/')
      ? new Promise(resolve => { resolveHistory = resolve; })
      : response(200, { queue_running: [], queue_pending: [] });
    const service = new ComfyUIWebSocket('http://node');
    let callbacks = 0;
    service.trackPrompt('late', 1, () => {}, () => callbacks++, () => callbacks++);
    const recovery = service.reconcilePrompt('late');
    service.disconnect();
    resolveHistory(response(200, { late: { status: { completed: true }, outputs: {} } }));
    await recovery;
    assert.equal(callbacks, 0);
  }

  console.log('comfyui-websocket regression checks passed');
}

test().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
