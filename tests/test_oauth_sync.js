'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const cinemaSource = fs.readFileSync(
  path.resolve(__dirname, '../CinemaPromptEngineering/frontend/src/CinemaPromptEngineering.tsx'),
  'utf8',
);
const storyboardSource = fs.readFileSync(
  path.resolve(__dirname, '../CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx'),
  'utf8',
);

for (const [relativePath, source] of [
  ['../CinemaPromptEngineering/frontend/src/CinemaPromptEngineering.tsx', cinemaSource],
  ['../CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx', storyboardSource],
]) {
  const sync = source.indexOf('const currentProvider = getConfiguredProviders().find(');
  const success = source.indexOf('if (result.success)', sync);
  assert.ok(sync >= 0, `${relativePath} must synchronize refreshed credentials`);
  assert.ok(sync < success, `${relativePath} must synchronize before success handling`);
  const guard = source.slice(sync, success);
  assert.match(guard, /submittedOAuthToken/);
  assert.match(guard, /currentProvider\?\.credentials\.oauthToken === submittedOAuthToken/);
}
assert.match(cinemaSource, /updateSavedOAuthToken\(selectedLlmProvider, result\.oauth_token\);\n\s*setConfiguredProviders\(getConfiguredProviders\(\)\);/);

function loadSettingsModule(localStorage) {
  const frontend = path.resolve(__dirname, '../CinemaPromptEngineering/frontend');
  const typescriptPath = process.env.TYPESCRIPT_PATH || path.join(frontend, 'node_modules/typescript');
  const typescript = require(typescriptPath);
  const settingsSource = fs.readFileSync(path.resolve(frontend, 'src/components/Settings.tsx'), 'utf8');
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

  const noop = () => {};
  const exportsObject = {};
  const context = {
    module: { exports: exportsObject },
    exports: exportsObject,
    console,
    localStorage,
    sessionStorage: localStorage,
    window: {},
    document: { createElement: noop },
    React: { createElement: noop },
    require(id) {
      if (id === 'react') {
        return { useState: noop, useRef: noop, useCallback: noop, useEffect: noop, createElement: noop };
      }
      if (id === '@/api/client') return { api: {} };
      throw new Error(`Unexpected import: ${id}`);
    },
  };
  vm.runInNewContext(result.outputText, context, { filename: 'Settings.tsx' });
  return context.module.exports;
}

// Execute the real CPE synchronization block, rather than reproducing its
// guards in a test double. The failed enhancement path must refresh the React
// state so the next request uses the rotated token.
const values = new Map([
  ['cinema-ai-provider-settings', JSON.stringify({
    activeProvider: 'github_copilot',
    providers: { github_copilot: { oauthToken: 'old-token', oauthRefreshToken: 'refresh' } },
  })],
  ['cinema-llm-settings', JSON.stringify({ provider: 'github_copilot', model: 'gpt-test' })],
]);
const localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};
const settings = loadSettingsModule(localStorage);
let configuredProviders = settings.getConfiguredProviders();
const setConfiguredProviders = providers => { configuredProviders = providers; };
const syncStart = cinemaSource.indexOf('      const currentProvider = getConfiguredProviders().find(');
const success = cinemaSource.indexOf('      if (result.success)', syncStart);
assert.ok(syncStart >= 0 && success > syncStart);
const syncBlock = cinemaSource.slice(syncStart, success);
const runActualSync = new Function(
  'result',
  'submittedOAuthToken',
  'selectedLlmProvider',
  'getConfiguredProviders',
  'getSelectedLlmSettings',
  'updateSavedOAuthToken',
  'setConfiguredProviders',
  syncBlock,
);
runActualSync(
  { success: false, oauth_token: 'rotated-token' },
  'old-token',
  'github_copilot',
  settings.getConfiguredProviders,
  settings.getSelectedLlmSettings,
  settings.updateSavedOAuthToken,
  setConfiguredProviders,
);
const refreshedProvider = configuredProviders.find(provider => provider.providerId === 'github_copilot');
assert.equal(refreshedProvider.credentials.oauthToken, 'rotated-token');
const nextRequestProvider = configuredProviders.find(provider => provider.providerId === 'github_copilot');
assert.equal(nextRequestProvider.credentials.oauthToken, 'rotated-token');
assert.equal(
  JSON.parse(localStorage.getItem('cinema-ai-provider-settings')).providers.github_copilot.oauthRefreshToken,
  'refresh',
);

console.log('OAuth response synchronization regression passed');
