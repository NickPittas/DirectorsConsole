#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx'),
  'utf8',
);
const parallelResultsSource = fs.readFileSync(
  path.resolve(__dirname, '../CinemaPromptEngineering/frontend/src/components/ParallelResultsView.tsx'),
  'utf8',
);
assert.match(source, /const generationRunsRef = useRef/);
const emptyResultsGuard = parallelResultsSource.indexOf('if (!jobGroup || jobGroup.child_jobs.length === 0)');
assert.ok(emptyResultsGuard > 0, 'parallel results empty-state guard should remain present');
assert.ok(
  parallelResultsSource.indexOf('const handleCardClick = useCallback') < emptyResultsGuard,
  'parallel results callbacks must be declared before the empty-state return',
);
assert.match(source, /const activeGenerations = activeGenerationsRef\.current;\n\s*const generationRuns = generationRunsRef\.current;/);
assert.match(source, /activeGenerations\.clear\(\);\n\s*generationRuns\.clear\(\);/);
assert.match(source, /Panel \$\{panelId\} is already generating/);
assert.match(source, /j\.nodeId === nodeId && j\.promptId === promptId/);

class RunGuard {
  constructor() {
    this.runs = new Map();
    this.nextId = 1;
  }

  claim(panelId) {
    if (this.runs.has(panelId)) return null;
    const run = { id: this.nextId++, submissionFinished: false, jobs: new Set(), settled: new Set() };
    this.runs.set(panelId, run);
    return run;
  }

  register(run, promptId) {
    run.jobs.add(promptId);
  }

  finishSubmission(run) {
    run.submissionFinished = true;
    this.release(run);
  }

  finishJob(run, promptId) {
    run.settled.add(promptId);
    this.release(run);
  }

  release(run) {
    if (run.submissionFinished && run.jobs.size === run.settled.size) {
      this.runs.delete([...this.runs.entries()].find(([, current]) => current === run)[0]);
    }
  }
}

const guard = new RunGuard();
const first = guard.claim(1);
assert.ok(first);
assert.equal(guard.claim(1), null, 'rapid repeat is rejected before a prompt ID exists');
guard.register(first, 'node-a-prompt');
guard.register(first, 'node-b-prompt');
guard.finishSubmission(first);
assert.equal(guard.claim(2) !== null, true, 'a different panel may generate concurrently');
assert.equal(guard.claim(1), null, 'one node finishing does not release the panel run');
guard.finishJob(first, 'node-a-prompt');
assert.equal(guard.claim(1), null);
guard.finishJob(first, 'node-b-prompt');
assert.ok(guard.claim(1), 'all node terminal handling releases the panel');

const failedSubmission = guard.claim(3);
assert.ok(failedSubmission);
guard.finishSubmission(failedSubmission);
assert.ok(guard.claim(3), 'submission failure with no tracked prompt releases the lock');

console.log('Storyboard generation-run guard regression passed');
