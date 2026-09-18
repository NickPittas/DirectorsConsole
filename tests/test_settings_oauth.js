#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const settingsSource = fs.readFileSync(
  path.resolve(__dirname, '../CinemaPromptEngineering/frontend/src/components/Settings.tsx'),
  'utf8',
);

assert.match(settingsSource, /const updateOAuthCredentials = useCallback\(async/);
assert.match(settingsSource, /await saveCredentialsToServer\(providerId, updatedCredentials\);/);
assert.match(settingsSource, /saveSettingsToLocalStorageOrThrow/);
assert.match(settingsSource, /oauthMutationQueueRef\.current = mutation\.catch/);
assert.doesNotMatch(settingsSource, /persistLocalStorage/);
assert.match(settingsSource, /serverUpdated = true/);
assert.match(settingsSource, /server rollback failed/);
assert.ok(
  (settingsSource.match(/await updateOAuthCredentials\(activeProvider/g) || []).length >= 3,
  'device and callback paths use the serialized OAuth helper',
);

function loadSettings(api, localStorage, logger = console, initialState = {}) {
  const frontend = path.resolve(__dirname, '../CinemaPromptEngineering/frontend');
  const typescriptPath = process.env.TYPESCRIPT_PATH || path.join(frontend, 'node_modules/typescript');
  const typescript = require(typescriptPath);
  const result = typescript.transpileModule(settingsSource, {
    fileName: path.resolve(frontend, 'src/components/Settings.tsx'),
    compilerOptions: {
      target: typescript.ScriptTarget.ES2020,
      module: typescript.ModuleKind.CommonJS,
      jsx: typescript.JsxEmit.React,
    },
    reportDiagnostics: true,
  });
  const diagnostics = (result.diagnostics || []).filter(
    diagnostic => diagnostic.category === typescript.DiagnosticCategory.Error,
  );
  assert.equal(
    diagnostics.length,
    0,
    diagnostics.map(diagnostic => typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'),
  );

  const hooks = [];
  let hookIndex = 0;
  let rerender;
  let tree;
  function useState(initial) {
    const index = hookIndex++;
    if (!(index in hooks)) {
      if (index === 0 && 'activeProvider' in initialState) hooks[index] = initialState.activeProvider;
      else if (index === 1 && 'credentials' in initialState) hooks[index] = initialState.credentials;
      else hooks[index] = typeof initial === 'function' ? initial() : initial;
    }
    return [hooks[index], value => {
      hooks[index] = typeof value === 'function' ? value(hooks[index]) : value;
      rerender();
    }];
  }
  function useRef(initial) {
    const index = hookIndex++;
    if (!(index in hooks)) hooks[index] = { current: initial };
    return hooks[index];
  }
  function useCallback(callback) {
    hookIndex++;
    return callback;
  }
  function useEffect() {
    hookIndex++;
  }
  function createElement(type, props, ...children) {
    return { type, props: props || {}, children };
  }

  const exportsObject = {};
  const context = {
    module: { exports: exportsObject },
    exports: exportsObject,
    console: logger,
    localStorage,
    sessionStorage: localStorage,
    window: {},
    document: { createElement: () => ({}) },
    setTimeout,
    clearTimeout,
    atob,
    React: { createElement },
    require(id) {
      if (id === 'react') return { useState, useRef, useCallback, useEffect, createElement };
      if (id === '@/api/client') return { api };
      throw new Error(`Unexpected import: ${id}`);
    },
  };
  vm.runInNewContext(result.outputText, context, { filename: 'Settings.tsx' });

  const Component = context.module.exports.default;
  rerender = () => {
    hookIndex = 0;
    tree = Component({ isOpen: true, onClose: () => {} });
  };
  rerender();

  function find(node, predicate, matches = []) {
    if (!node || typeof node !== 'object') return matches;
    if (predicate(node)) matches.push(node);
    for (const child of node.children || []) find(child, predicate, matches);
    return matches;
  }
  function text(node) {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    return node && typeof node === 'object' ? (node.children || []).map(text).join('') : '';
  }
  return {
    module: context.module.exports,
    get tree() { return tree; },
    find,
    text,
  };
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

(async () => {
  const values = new Map([
    ['cinema-ai-provider-settings', JSON.stringify({
      activeProvider: 'github_copilot',
      providers: {
        github_copilot: {
          apiKey: 'unrelated-api-key',
          endpoint: 'http://localhost:1',
          oauthToken: 'old-access',
          oauthRefreshToken: 'old-refresh',
          oauthExpiresAt: 10,
        },
      },
    })],
    ['cinema-credentials-migrated', 'true'],
  ]);
  let failCredentialWrite = false;
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      if (key === 'cinema-ai-provider-settings' && failCredentialWrite) throw new Error('quota exceeded');
      values.set(key, value);
    },
    removeItem: key => values.delete(key),
  };
  const calls = [];
  const logErrors = [];
  const testConsole = {
    ...console,
    error: (...args) => logErrors.push(args.map(String).join(' ')),
  };
  const api = {
    getOAuthFlowType: async () => ({ flow_type: 'device' }),
    requestDeviceCode: async () => ({
      user_code: 'ABCD-1234',
      verification_uri: 'https://example.test/device',
      device_code: 'device-code',
      interval: 0,
      expires_in: 60,
    }),
    pollDeviceToken: async () => ({
      success: true,
      access_token: 'github-access',
      copilot_token: 'copilot-jwt',
      copilot_expires_at: 123,
    }),
    updateProviderCredentials: async (providerId, credentials) => {
      calls.push({ providerId, credentials: structuredClone(credentials) });
      return { success: true };
    },
  };
  const mounted = loadSettings(api, localStorage, testConsole, {
    credentials: {
      github_copilot: {
        apiKey: 'unrelated-api-key',
        endpoint: 'http://localhost:1',
      },
    },
  });
  const providerSelect = mounted.find(mounted.tree, node => node.type === 'select' && node.props.id === 'provider-select')[0];
  providerSelect.props.onChange({ target: { value: 'github_copilot' } });

  // Exercise the real device-flow caller and helper: localStorage is updated
  // immediately while unrelated provider settings survive the tuple merge.
  const connect = mounted.find(mounted.tree, node => node.type === 'button' && mounted.text(node).includes('Connect with'))[0];
  await connect.props.onClick();
  await sleep(20);
  const connected = JSON.parse(localStorage.getItem('cinema-ai-provider-settings'));
  assert.deepEqual(connected.providers.github_copilot, {
    apiKey: 'unrelated-api-key',
    endpoint: 'http://localhost:1',
    oauthToken: 'copilot-jwt',
    oauthRefreshToken: 'github-access',
    oauthExpiresAt: 123,
  });
  assert.equal(calls.length, 1);

  // A failed disconnect must roll the server/UI back and leave the usable
  // local tuple in place; the handler must surface the failure.
  failCredentialWrite = true;
  const disconnect = mounted.find(mounted.tree, node => node.type === 'button' && mounted.text(node).includes('Disconnect'))[0];
  await disconnect.props.onClick();
  const afterFailedDisconnect = JSON.parse(localStorage.getItem('cinema-ai-provider-settings'));
  assert.equal(afterFailedDisconnect.providers.github_copilot.oauthToken, 'copilot-jwt');
  assert.equal(afterFailedDisconnect.providers.github_copilot.oauthRefreshToken, 'github-access');
  assert.deepEqual(calls.slice(-2).map(call => call.credentials.oauth_token), ['', 'copilot-jwt']);
  assert.equal(calls.at(-1).credentials.oauth_refresh_token, 'github-access');
  assert.equal(calls.at(-1).credentials.oauth_expires_at, 123);
  assert.equal(calls.at(-1).credentials.api_key, 'unrelated-api-key');
  assert.equal(calls.at(-1).credentials.endpoint, 'http://localhost:1');
  assert.ok(mounted.text(mounted.tree).includes('Connection failed'));
  assert.ok(logErrors.some(message => message.includes('Failed to persist OAuth disconnect')));

  // A fresh authorization with no refresh token must clear the old tuple. If
  // local persistence fails after the first server write, rollback must send
  // explicit empty/null OAuth fields while preserving client credentials.
  const freshValues = new Map([
    ['cinema-ai-provider-settings', JSON.stringify({
      activeProvider: 'antigravity',
      providers: { antigravity: { oauthClientId: 'client-only' } },
    })],
    ['cinema-credentials-migrated', 'true'],
  ]);
  const freshLocalStorage = {
    getItem: key => freshValues.get(key) ?? null,
    setItem: (key, value) => {
      if (key === 'cinema-ai-provider-settings') throw new Error('quota exceeded');
      freshValues.set(key, value);
    },
    removeItem: key => freshValues.delete(key),
  };
  const freshCalls = [];
  const freshApi = {
    getOAuthFlowType: async () => ({ flow_type: 'device' }),
    requestDeviceCode: async () => ({
      user_code: 'ABCD-1234',
      verification_uri: 'https://example.test/device',
      device_code: 'device-code',
      interval: 0,
      expires_in: 60,
    }),
    pollDeviceToken: async () => ({
      success: true,
      access_token: 'account-b-access',
      // No refresh_token or expires_at: this is a fresh account replacement.
    }),
    updateProviderCredentials: async (providerId, credentials) => {
      freshCalls.push({ providerId, credentials: structuredClone(credentials) });
      return { success: true };
    },
  };
  const freshMounted = loadSettings(
    freshApi,
    freshLocalStorage,
    testConsole,
    { activeProvider: 'antigravity', credentials: { antigravity: { oauthClientId: 'client-only' } } },
  );
  const freshConnect = freshMounted.find(
    freshMounted.tree,
    node => node.type === 'button' && freshMounted.text(node).includes('Connect with'),
  )[0];
  await freshConnect.props.onClick();
  await sleep(20);

  assert.equal(freshCalls.length, 2);
  assert.equal(freshCalls[0].credentials.oauth_token, 'account-b-access');
  assert.equal(freshCalls[0].credentials.oauth_refresh_token, '');
  assert.equal(freshCalls[0].credentials.oauth_expires_at, null);
  assert.equal(freshCalls[1].credentials.oauth_token, '');
  assert.equal(freshCalls[1].credentials.oauth_refresh_token, '');
  assert.equal(freshCalls[1].credentials.oauth_expires_at, null);
  assert.equal(freshCalls[1].credentials.oauth_client_id, 'client-only');
  assert.ok(freshMounted.text(freshMounted.tree).includes('Connection failed'));

  // A fresh authorization for account B must not retain account A's refresh token.
  const replacementValues = new Map([
    ['cinema-ai-provider-settings', JSON.stringify({
      activeProvider: 'antigravity',
      providers: {
        antigravity: {
          oauthRefreshToken: 'account-a-refresh',
          oauthExpiresAt: 123,
        },
      },
    })],
    ['cinema-credentials-migrated', 'true'],
  ]);
  const replacementLocalStorage = {
    getItem: key => replacementValues.get(key) ?? null,
    setItem: (key, value) => replacementValues.set(key, value),
    removeItem: key => replacementValues.delete(key),
  };
  const replacementCalls = [];
  const replacementApi = {
    getOAuthFlowType: async () => ({ flow_type: 'device' }),
    requestDeviceCode: async () => ({
      user_code: 'ABCD-1234',
      verification_uri: 'https://example.test/device',
      device_code: 'device-code',
      interval: 0,
      expires_in: 60,
    }),
    pollDeviceToken: async () => ({ success: true, access_token: 'account-b-access' }),
    updateProviderCredentials: async (providerId, credentials) => {
      replacementCalls.push({ providerId, credentials: structuredClone(credentials) });
      return { success: true };
    },
  };
  const replacementMounted = loadSettings(
    replacementApi,
    replacementLocalStorage,
    testConsole,
    {
      activeProvider: 'antigravity',
      credentials: {
        antigravity: {
          oauthRefreshToken: 'account-a-refresh',
          oauthExpiresAt: 123,
        },
      },
    },
  );
  const replacementConnect = replacementMounted.find(
    replacementMounted.tree,
    node => node.type === 'button' && replacementMounted.text(node).includes('Connect with'),
  )[0];
  await replacementConnect.props.onClick();
  await sleep(20);

  assert.equal(replacementCalls.length, 1);
  assert.equal(replacementCalls[0].credentials.oauth_token, 'account-b-access');
  assert.equal(replacementCalls[0].credentials.oauth_refresh_token, '');
  assert.equal(replacementCalls[0].credentials.oauth_expires_at, null);
  const replaced = JSON.parse(replacementLocalStorage.getItem('cinema-ai-provider-settings'));
  assert.equal(replaced.providers.antigravity.oauthToken, 'account-b-access');
  assert.equal(replaced.providers.antigravity.oauthRefreshToken, '');
  assert.equal(replaced.providers.antigravity.oauthExpiresAt, null);

  console.log('Settings OAuth persistence regression passed');
})();
