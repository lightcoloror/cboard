const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseConllu,
  makePrediction
} = require('./benchmarkCommunicationSegmentation.cjs');
const row = (id, word) => `${id}\t${word}\t_\tX\t_\t_\t0\troot\t_\t_`;
const source = `# sent_id = one\n# text = 不要喝水。\n${row(1, '不要')}\n${row(
  2,
  '喝水'
)}\n${row(3, '。')}\n\n`;
test('parser exposes only original text and ID, never gold segmentation', () => {
  assert.deepEqual(parseConllu(source), [{ id: 'one', text: '不要喝水。' }]);
});
test('reference mismatch and duplicate sentences are rejected', () => {
  assert.throws(
    () => parseConllu(source.replace('不要喝水。', '要喝水。')),
    /SOURCE_MISMATCH/
  );
  assert.throws(() => parseConllu(source + source), /METADATA/);
});
test('multiword and empty rows are explicitly rejected instead of silently dropped', () => {
  for (const id of ['1-2', '1.1'])
    assert.throws(
      () => parseConllu(source.replace(row(1, '不要'), row(id, '不要'))),
      /UNSUPPORTED/
    );
});
test('prediction refuses deletion, duplication and reordering', () => {
  for (const tokens of [
    ['要', '喝水', '。'],
    ['不要', '喝水', '喝水', '。'],
    ['喝水', '不要', '。']
  ])
    assert.throws(
      () => makePrediction(parseConllu(source), () => tokens),
      /SOURCE_MISMATCH/
    );
});
test('Unicode spaces normalized only for scoring, source retained exactly', () => {
  const prediction = makePrediction(
    [{ id: 'spaces', text: '不\u00a0喝💧' }],
    () => ['不', '\u00a0', '喝', '💧']
  );
  assert.match(prediction, /3\t💧/);
  assert.doesNotMatch(prediction, /\u00a0/);
});
test('format-injection characters are rejected', () => {
  assert.throws(
    () => makePrediction([{ id: 'x', text: '不\n喝' }], text => [text]),
    /INVALID_PREDICTION/
  );
});
