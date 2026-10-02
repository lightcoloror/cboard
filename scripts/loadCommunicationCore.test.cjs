'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { loadCore } = require('./loadCommunicationCore.cjs');

test('local adapter exposes real segmentation/matching and restores JS loading', () => {
  const previous = require.extensions['.js'];
  const core = loadCore();
  assert.equal(require.extensions['.js'], previous);
  assert.deepEqual(core.segmentChineseCommunicationText('痛痛痛').segments, ['痛', '痛', '痛']);
  assert.equal(core.matchTextToCommunicationTiles('不想', []).matches[0].tile, null);
  assert.equal(typeof core.intl.formatMessage({ id: 'not-present' }), 'string');
});

test('local adapter does not load AI, receiver pipeline or evaluation corpus', () => {
  const root = path.resolve(__dirname, '..');
  for (const name of ['communicationAi.js', 'receiverPipeline.js', 'resegmentationContract.js']) {
    assert.equal(require.cache[path.join(root, 'src/common/communicationSupport', name)], undefined);
  }
  assert.equal(require.cache[path.join(root, 'src/common/communicationSupport/fixtures/resegmentationEvaluation.json')], undefined);
});

test('JS loading hook is restored if a local module cannot be compiled', () => {
  const target = path.resolve(__dirname, '../src/common/communicationSupport/segmentation.js');
  const cached = require.cache[target];
  const read = fs.readFileSync;
  const previous = require.extensions['.js'];
  delete require.cache[target];
  fs.readFileSync = (file, options) => path.resolve(String(file)) === target ? 'export const =' : read(file, options);
  try {
    assert.throws(() => loadCore());
    assert.equal(require.extensions['.js'], previous);
  } finally {
    fs.readFileSync = read;
    if (cached) require.cache[target] = cached;
  }
});
