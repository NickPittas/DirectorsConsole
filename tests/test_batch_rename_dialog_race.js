#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.resolve(__dirname, '../CinemaPromptEngineering/frontend/src/gallery/components/BatchRenameDialog.tsx'),
  'utf8',
);

assert.match(
  source,
  /previewAbortRef\.current\?\.abort\(\);\n\s*setPhase\('applying'\)/,
  'Apply must cancel preview before entering the applying phase',
);
assert.equal(
  (source.match(/if \(!canCommitPreview\(controller, phaseRef\.current\)\) return;/g) || []).length,
  2,
  'debounced and completed previews must both check the live lifecycle',
);

const helperStart = source.indexOf('export function canCommitPreview');
const helperEnd = source.indexOf('\n}\n', helperStart) + 2;
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'preview lifecycle helper should be present');
const helperSource = source
  .slice(helperStart, helperEnd)
  .replace(/^export /, '')
  .replace(/: AbortController/g, '')
  .replace(/: DialogPhase/g, '')
  .replace(/: boolean/g, '');
const canCommitPreview = vm.runInNewContext(`(${helperSource})`, { AbortController });

function canApply(phase, previews) {
  return phase === 'previewed' && previews.length > 0 && phase !== 'applying';
}

async function main() {
  const controller = new AbortController();
  let phase = 'previewed';
  let previews = ['current-preview'];
  let previewUpdates = 0;
  let renameCalls = 0;
  let resolvePreview;
  let resolveApply;

  const preview = new Promise((resolve) => {
    resolvePreview = resolve;
  }).then((result) => {
    if (!canCommitPreview(controller, phase)) return;
    previews = result;
    previewUpdates += 1;
    phase = 'previewed';
  });

  const pendingDebounce = new Promise((resolve) => {
    setTimeout(() => {
      resolve(canCommitPreview(controller, phase));
    }, 0);
  });

  const applyRequest = new Promise((resolve) => {
    resolveApply = resolve;
  });
  const apply = async () => {
    if (!canApply(phase, previews)) return false;
    controller.abort();
    phase = 'applying';
    renameCalls += 1;
    await applyRequest;
    phase = 'done';
    return true;
  };

  const firstApply = apply();
  assert.equal(firstApply instanceof Promise, true);
  assert.equal(await apply(), false, 'a second Apply must be rejected while applying');

  resolvePreview(['stale-preview']);
  await preview;
  assert.equal(phase, 'applying', 'late preview must not leave Apply in previewed state');
  assert.equal(previewUpdates, 0, 'late preview must not update component state');
  assert.equal(previews[0], 'current-preview', 'late preview must not replace current previews');
  assert.equal(await pendingDebounce, false, 'pending debounce must not start after Apply');

  resolveApply();
  assert.equal(await firstApply, true);
  assert.equal(phase, 'done');
  assert.equal(renameCalls, 1, 'late preview must not permit a duplicate rename');
}

main().then(
  () => console.log('Batch rename dialog race regression passed'),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
