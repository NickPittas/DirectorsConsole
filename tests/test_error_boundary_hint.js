#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'CinemaPromptEngineering/frontend');
const typescript = require(path.join(frontend, 'node_modules/typescript'));
const React = require(path.join(frontend, 'node_modules/react'));

function loadBoundary() {
  const filename = path.join(frontend, 'src/components/ErrorBoundary.tsx');
  const result = typescript.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2020,
      module: typescript.ModuleKind.CommonJS,
      jsx: typescript.JsxEmit.React,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });
  const diagnostics = (result.diagnostics || []).filter(d => d.category === typescript.DiagnosticCategory.Error);
  assert.equal(diagnostics.length, 0, diagnostics.map(d => typescript.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  const module = { exports: {} };
  vm.runInNewContext(result.outputText, {
    module,
    exports: module.exports,
    require: request => request === 'react' ? React : require(request),
    React,
    console,
    window: { location: { reload() {} } },
  }, { filename });
  return module.exports;
}

function textContent(value) {
  if (value == null || typeof value === 'boolean') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textContent).join('');
  return textContent(value.props?.children);
}

function renderFallback(ErrorBoundary, error) {
  const instance = new ErrorBoundary({ children: React.createElement('span', null, 'child') });
  instance.state = { ...instance.state, ...ErrorBoundary.getDerivedStateFromError(error) };
  return textContent(instance.render());
}

const { ErrorBoundary, isBrowserDomMutationError } = loadBoundary();
assert.equal(isBrowserDomMutationError(new DOMException('The node to be removed is not a child of this node', 'NotFoundError')), true);
assert.equal(isBrowserDomMutationError(new Error('ordinary render failure')), false);
const affected = renderFallback(ErrorBoundary, new DOMException('The node to be removed is not a child of this node', 'NotFoundError'));
assert.match(affected, /page translation or a DOM-modifying browser extension/);
const ordinary = renderFallback(ErrorBoundary, new Error('ordinary render failure'));
assert.doesNotMatch(ordinary, /page translation or a DOM-modifying browser extension/);
assert.match(ordinary, /Try Again/);
assert.match(ordinary, /Refresh Page/);
console.log('ErrorBoundary qualified DOM mutation hint regression passed');
