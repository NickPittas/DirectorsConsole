#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx'),
  'utf8',
);

assert.match(source, /type GenerationSnapshot =/);
assert.equal(
  (source.match(/const restorableParameters = JSON\.parse\(JSON\.stringify\(paramsToUse\)\);/g) || []).length,
  2,
  'single and parallel paths deep-copy parameters before media conversion',
);
assert.equal(
  (source.match(/const processedParams = JSON\.parse\(JSON\.stringify\(paramsToUse\)\);/g) || []).length,
  2,
);
assert.equal((source.match(/parameters: restorableParameters,/g) || []).length, 2);
assert.match(source, /processedParams\[key\] = globalPromptOverride;\n\s*restorableParameters\[key\] = globalPromptOverride;/);
assert.match(source, /workflow: JSON\.parse\(JSON\.stringify\(workflow\.workflow\)\)/);
assert.match(source, /selectedOutputNodeIds: workflow\.parsed\.outputs\.filter\(output => output\.selected\)\.map\(output => output\.node_id\)/);
assert.match(source, /prompt: builtWorkflow/);
assert.match(source, /prompt: workflowCopy/);
assert.match(source, /applySeedToWorkflow\(workflowCopy, seed\)/);
assert.match(source, /const paramsWithSeed = \{\n\s*\.\.\.generationSnapshot\.parameters,\n\s*seed: job\.seed,/);
assert.match(source, /generationSnapshot\.selectedOutputNodeIds/);
assert.match(source, /generationSnapshot\.workflowId/);
assert.match(source, /generationSnapshot\.workflowName/);
assert.match(source, /generationSnapshot\.workflow/);
assert.match(source, /paramsWithSeed,\n\s*generationTime/);

function captureSubmission(ui, promptOverride, submittedSeed, uploadedImage, uploadedVideo) {
  const restorableParameters = structuredClone(ui.parameters);
  const transportParameters = structuredClone(ui.parameters);

  for (const key of Object.keys(transportParameters)) {
    if (key.toLowerCase().includes('prompt') || key === 'text' || key === 'positive') {
      transportParameters[key] = promptOverride;
      restorableParameters[key] = promptOverride;
    }
  }

  // Media conversion belongs to the submitted transport only.
  transportParameters.image = uploadedImage;
  transportParameters.video = uploadedVideo;

  const submittedWorkflow = {
    inputs: {
      image: transportParameters.image,
      video: transportParameters.video,
      prompt: transportParameters.prompt,
      seed: submittedSeed,
    },
  };
  const parameters = { ...restorableParameters, seed: submittedSeed };

  return {
    snapshot: {
      workflowId: ui.workflow.id,
      workflowName: ui.workflow.name,
      workflow: structuredClone(ui.workflow.workflow),
      selectedOutputNodeIds: [...ui.outputIds],
      parameters,
    },
    submittedWorkflow,
  };
}

const imageReference = 'data:image/png;base64,original-image';
const videoReference = 'data:video/mp4;base64,original-video';
const ui = {
  workflow: {
    id: 'original-id',
    name: 'Original',
    workflow: { '1': { inputs: { seed: 17 } } },
  },
  parameters: {
    prompt: 'original prompt',
    image: imageReference,
    video: videoReference,
    seed: 17,
    lora: { strength: 0.5 },
  },
  outputIds: ['1'],
};

const single = captureSubmission(
  ui,
  'overridden prompt',
  17,
  'storyboard_uploaded-image.png',
  'storyboard_uploaded-video.mp4',
);
const parallel = captureSubmission(
  ui,
  'overridden prompt',
  23,
  'parallel_uploaded-image.png',
  'parallel_uploaded-video.mp4',
);

for (const generation of [single, parallel]) {
  assert.equal(generation.snapshot.parameters.image, imageReference, 'metadata keeps original image reference');
  assert.equal(generation.snapshot.parameters.video, videoReference, 'metadata keeps original video reference');
  assert.equal(generation.submittedWorkflow.inputs.image.endsWith('uploaded-image.png'), true);
  assert.equal(generation.submittedWorkflow.inputs.video.endsWith('uploaded-video.mp4'), true);
  assert.equal(generation.snapshot.parameters.prompt, 'overridden prompt');
  assert.equal(generation.submittedWorkflow.inputs.prompt, 'overridden prompt');
}
assert.equal(parallel.snapshot.parameters.seed, 23, 'parallel metadata uses the actual per-node seed');
assert.equal(parallel.submittedWorkflow.inputs.seed, 23, 'parallel workflow uses the same per-node seed');

// Later UI edits must not alter any saved provenance, including nested values.
ui.workflow.id = 'edited-id';
ui.workflow.name = 'Edited';
ui.workflow.workflow['1'].inputs.seed = 99;
ui.parameters.prompt = 'edited prompt';
ui.parameters.image = 'edited-image';
ui.parameters.video = 'edited-video';
ui.parameters.seed = 99;
ui.parameters.lora.strength = 99;
ui.outputIds.splice(0, 1);

assert.deepEqual(single.snapshot, {
  workflowId: 'original-id',
  workflowName: 'Original',
  workflow: { '1': { inputs: { seed: 17 } } },
  selectedOutputNodeIds: ['1'],
  parameters: {
    prompt: 'overridden prompt',
    image: imageReference,
    video: videoReference,
    seed: 17,
    lora: { strength: 0.5 },
  },
});
assert.equal(parallel.snapshot.parameters.seed, 23);
assert.equal(parallel.snapshot.parameters.image, imageReference);
assert.equal(parallel.snapshot.parameters.video, videoReference);
assert.equal(parallel.snapshot.parameters.lora.strength, 0.5);

console.log('Storyboard generation metadata snapshot regression passed');
