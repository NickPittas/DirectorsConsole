#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'CinemaPromptEngineering/frontend');
const fakeIndexedDB = require(path.join(frontend, 'node_modules/fake-indexeddb'));

function loadTypeScript() {
  const candidates = [
    process.env.TYPESCRIPT_PATH,
    path.join(frontend, 'node_modules/typescript'),
    path.join(root, 'node_modules/typescript'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch (_) { /* try the next install */ }
  }
  throw new Error('TypeScript is required; run npm install in CinemaPromptEngineering/frontend or set TYPESCRIPT_PATH.');
}

function loadService(indexedDB = fakeIndexedDB.indexedDB) {
  const typescript = loadTypeScript();
  const filename = path.join(frontend, 'src/storyboard/services/session-draft-storage.ts');
  const result = typescript.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { target: typescript.ScriptTarget.ES2020, module: typescript.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  const diagnostics = (result.diagnostics || []).filter(d => d.category === typescript.DiagnosticCategory.Error);
  assert.equal(
    diagnostics.length,
    0,
    diagnostics.map(d => typescript.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'),
  );
  const module = { exports: {} };
  vm.runInNewContext(result.outputText, {
    module,
    exports: module.exports,
    console,
    indexedDB,
    Blob,
    setTimeout,
    clearTimeout,
  }, { filename });
  return module.exports;
}

function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = fakeIndexedDB.indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error || new Error('failed to delete test database'));
    request.onblocked = () => reject(new Error('test database deletion was blocked by an open connection'));
    request.onsuccess = () => resolve();
  });
}

function upgradeAndCloseDatabase(name, version) {
  return new Promise((resolve, reject) => {
    const request = fakeIndexedDB.indexedDB.open(name, version);
    request.onerror = () => reject(request.error || new Error('failed to upgrade test database'));
    request.onblocked = () => reject(new Error('test database upgrade was blocked'));
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
}

function waitForWork() {
  return new Promise(resolve => setImmediate(resolve));
}

function makeLifecycleFactory(mode) {
  let injected = false;
  return {
    open(name, version) {
      if (injected) return fakeIndexedDB.indexedDB.open(name, version);
      injected = true;

      if (mode === 'sync-error') throw new Error('simulated IndexedDB open failure');

      const actual = fakeIndexedDB.indexedDB.open(name, version);
      const facade = {
        result: undefined,
        transaction: null,
        error: null,
        onupgradeneeded: null,
        onblocked: null,
        onerror: null,
        onsuccess: null,
      };
      actual.onupgradeneeded = event => {
        facade.result = actual.result;
        facade.transaction = actual.transaction;
        facade.onupgradeneeded?.({ ...event, target: facade });
      };
      actual.onsuccess = () => {
        facade.result = actual.result;
        facade.transaction = actual.transaction;
        if (mode === 'blocked-late') {
          facade.onsuccess?.({ target: facade });
        } else {
          actual.result.close();
        }
      };
      actual.onerror = () => {
        facade.error = actual.error;
        facade.onerror?.({ target: facade });
      };

      if (mode === 'request-error') {
        queueMicrotask(() => {
          facade.error = new DOMException('simulated IndexedDB open error', 'UnknownError');
          facade.onerror?.({ target: facade });
        });
      } else if (mode === 'blocked-late') {
        queueMicrotask(() => facade.onblocked?.({ target: facade }));
      }
      return facade;
    },
  };
}

function rawWrite(databaseName, key, value) {
  return new Promise((resolve, reject) => {
    const request = fakeIndexedDB.indexedDB.open(databaseName, 1);
    request.onerror = () => reject(request.error || new Error('failed to open raw test database'));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('drafts', 'readwrite');
      transaction.objectStore('drafts').put(value, key);
      transaction.onerror = () => reject(transaction.error || new Error('failed to write raw test value'));
      transaction.onabort = () => reject(transaction.error || new Error('raw test transaction aborted'));
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
    };
  });
}

async function expectFailure(action, text) {
  await assert.rejects(action, error => {
    assert.match(error.message, /Session draft|session draft|IndexedDB/i);
    if (text) assert.match(error.message, text);
    return true;
  });
}

async function main() {
  const databaseName = 'directors-console-session-drafts';
  await deleteDatabase(databaseName);
  const storage = loadService();
  const { saveDraft, readDraft, readActiveDraft, deleteDraft } = storage;

  assert.equal(await readDraft('project:empty'), null);
  assert.equal(await readActiveDraft(), null);

  const inactiveOnly = { version: 1, identity: 'project:inactive-only', updatedAt: 50, data: { archived: true } };
  await saveDraft(inactiveOnly, { activate: false });
  assert.deepEqual(await readDraft('project:inactive-only'), inactiveOnly);
  assert.equal(await readActiveDraft(), null, 'inactive-only stores have no active draft');
  await deleteDraft('project:inactive-only');
  assert.equal(await readActiveDraft(), null);

  const mediaPayload = {
    prompt: 'a quiet room',
    dataUrl: 'data:image/png;base64,AA==',
    blob: new Blob(['frame'], { type: 'image/png' }),
    nested: [{ count: 3, enabled: true }, null, 4.5],
  };
  const recordA = { version: 1, identity: 'project:a', updatedAt: 100, data: mediaPayload };
  await saveDraft(recordA, { activate: true });
  assert.deepEqual(await readDraft('project:a'), recordA);
  assert.deepEqual(await readActiveDraft(), recordA);
  const storedBlob = (await readDraft('project:a')).data.blob;
  assert.equal(storedBlob instanceof Blob, true);
  assert.equal(storedBlob.type, 'image/png');
  assert.equal(await storedBlob.text(), 'frame');

  const recordB = { version: 1, identity: 'project:b', updatedAt: 200, data: { panel: 2 } };
  await saveDraft(recordB, { activate: false });
  assert.deepEqual(await readActiveDraft(), recordA);
  await deleteDraft('project:a');
  assert.equal(await readActiveDraft(), null, 'deleting active A must clear only its active pointer');
  assert.deepEqual(await readDraft('project:b'), recordB, 'inactive B must survive active A deletion');
  await saveDraft(recordA, { activate: true });
  await saveDraft(recordB, { activate: true });
  await saveDraft({ ...recordA, updatedAt: 101, data: { flushed: true } }, { activate: false });
  assert.deepEqual(await readActiveDraft(), recordB, 'inactive flush must not steal active identity');
  assert.deepEqual(await readDraft('project:a'), { ...recordA, updatedAt: 101, data: { flushed: true } });
  assert.deepEqual(await readDraft('project:b'), recordB);

  await saveDraft({ version: 1, identity: 'unsaved:c', updatedAt: 300, data: { value: 'c' } }, { activate: false });
  assert.deepEqual(await readDraft('unsaved:c'), {
    version: 1, identity: 'unsaved:c', updatedAt: 300, data: { value: 'c' },
  });
  assert.equal(await readDraft('unsaved:missing'), null);

  const oldB = await readDraft('project:b');
  await expectFailure(
    () => saveDraft({ version: 1, identity: 'project:b', updatedAt: 201, data: { cannotClone: () => {} } }, { activate: true }),
    /save/i,
  );
  assert.deepEqual(await readDraft('project:b'), oldB);
  assert.deepEqual(await readActiveDraft(), oldB);

  const originalPut = fakeIndexedDB.IDBObjectStore.prototype.put;
  try {
    fakeIndexedDB.IDBObjectStore.prototype.put = function putWithQuotaFailure(value, key) {
      if (key === 'draft:project:b') {
        throw new DOMException('simulated quota exhaustion', 'QuotaExceededError');
      }
      return originalPut.call(this, value, key);
    };
    await expectFailure(
      () => saveDraft({ version: 1, identity: 'project:b', updatedAt: 202, data: { quota: true } }, { activate: true }),
      /save/i,
    );
  } finally {
    fakeIndexedDB.IDBObjectStore.prototype.put = originalPut;
  }
  assert.deepEqual(await readDraft('project:b'), oldB);
  assert.deepEqual(await readActiveDraft(), oldB);

  try {
    fakeIndexedDB.IDBObjectStore.prototype.put = function putWithAbort(value, key) {
      const request = originalPut.call(this, value, key);
      if (key === 'draft:project:b') this.transaction.abort();
      return request;
    };
    await expectFailure(
      () => saveDraft({ version: 1, identity: 'project:b', updatedAt: 203, data: { aborted: true } }, { activate: true }),
      /save/i,
    );
  } finally {
    fakeIndexedDB.IDBObjectStore.prototype.put = originalPut;
  }
  assert.deepEqual(await readDraft('project:b'), oldB);
  assert.deepEqual(await readActiveDraft(), oldB);

  // fake-indexeddb cannot consume real browser quota; this boundary simulation
  // aborts after the draft request succeeds but before the transaction commits.
  try {
    fakeIndexedDB.IDBObjectStore.prototype.put = function putWithAsyncAbort(value, key) {
      const request = originalPut.call(this, value, key);
      if (key === 'draft:project:b') request.onsuccess = () => this.transaction.abort();
      return request;
    };
    await expectFailure(
      () => saveDraft({ version: 1, identity: 'project:b', updatedAt: 203.5, data: { afterWrite: true } }, { activate: true }),
      /save/i,
    );
  } finally {
    fakeIndexedDB.IDBObjectStore.prototype.put = originalPut;
  }
  assert.deepEqual(await readDraft('project:b'), oldB);
  assert.deepEqual(await readActiveDraft(), oldB);

  try {
    fakeIndexedDB.IDBObjectStore.prototype.put = function putWithPointerFailure(value, key) {
      if (key === 'active:pointer') {
        throw new Error('simulated pointer write failure');
      }
      return originalPut.call(this, value, key);
    };
    await expectFailure(
      () => saveDraft({ version: 1, identity: 'project:new', updatedAt: 204, data: { pointer: true } }, { activate: true }),
      /save/i,
    );
  } finally {
    fakeIndexedDB.IDBObjectStore.prototype.put = originalPut;
  }
  assert.equal(await readDraft('project:new'), null, 'failed pointer write must roll back its draft record');
  assert.deepEqual(await readActiveDraft(), oldB, 'failed pointer write must preserve the old active pointer');

  await rawWrite(databaseName, 'draft:corrupt', { version: 1, identity: 'project:wrong', updatedAt: 1, data: {} });
  await expectFailure(() => readDraft('corrupt'), /identity|corrupt/i);
  await rawWrite(databaseName, 'draft:unsupported', { version: 99, identity: 'unsupported', updatedAt: 1, data: {} });
  await expectFailure(() => readDraft('unsupported'), /unsupported|version/i);
  await rawWrite(databaseName, 'active:pointer', { kind: 'not-an-active-pointer', identity: 'project:b' });
  await expectFailure(() => readActiveDraft(), /corrupt/i);
  await rawWrite(databaseName, 'active:pointer', { kind: 'active-draft-pointer', identity: 'project:missing' });
  await expectFailure(() => readActiveDraft(), /missing|reference/i);
  await rawWrite(databaseName, 'active:pointer', { kind: 'active-draft-pointer', identity: 'project:b' });
  assert.deepEqual(await readActiveDraft(), oldB);

  await deleteDraft('project:a');
  assert.deepEqual(await readDraft('project:b'), oldB, 'deleting one draft must not delete another');
  assert.deepEqual(await readActiveDraft(), oldB);
  await deleteDraft('project:b');
  assert.equal(await readDraft('project:b'), null);
  await deleteDraft('unsaved:c');
  await deleteDraft('corrupt');
  await deleteDraft('unsupported');
  assert.equal(await readActiveDraft(), null, 'empty store has no active draft');

  // A real versionchange closes the adapter connection; deleting the upgraded
  // test database lets the same adapter reopen its original schema cleanly.
  await upgradeAndCloseDatabase(databaseName, 2);
  await deleteDatabase(databaseName);
  assert.equal(await readDraft('lifecycle:reopened'), null);

  // An asynchronous open error must be actionable and must not poison retries.
  const requestErrorStorage = loadService(makeLifecycleFactory('request-error'));
  await expectFailure(() => requestErrorStorage.readDraft('lifecycle:error'), /open/i);
  await waitForWork();
  assert.equal(await requestErrorStorage.readDraft('lifecycle:error-retry'), null);

  // A blocked open can reject before its late success; the late connection must
  // be closed, allowing both a retry and final database deletion to complete.
  const blockedStorage = loadService(makeLifecycleFactory('blocked-late'));
  await expectFailure(() => blockedStorage.readDraft('lifecycle:blocked'), /open|blocked/i);
  await waitForWork();
  assert.equal(await blockedStorage.readDraft('lifecycle:blocked-retry'), null);
  await deleteDatabase(databaseName);

  console.log('session draft storage regression checks passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
