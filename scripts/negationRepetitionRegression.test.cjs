'use strict';
// Offline, single-process regression: reuse the existing Babel/core loader.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadCore } = require('./loadCommunicationCore.cjs');
function loadComparedCore() {
  if (!process.env.CBOARD_SEGMENTATION_BASELINE) return loadCore();
  // Reuse the established loader on the exact saved source, without swapping
  // files in the dirty working tree. The override lasts only during loading.
  const baseline = fs.readFileSync(process.env.CBOARD_SEGMENTATION_BASELINE, 'utf8');
  const target = path.resolve(__dirname, '../src/common/communicationSupport/segmentation.js');
  const read = fs.readFileSync;
  fs.readFileSync = (file, options) => path.resolve(String(file)) === target ? baseline : read(file, options);
  try { return loadCore(); } finally { fs.readFileSync = read; }
}
const core = loadComparedCore();
const observed = [];
const cases = [
  ['别给我喝冷水', ['别', '给', '我', '喝', '冷水'], ['别', '给', '我', '喝', '冷', '水']],
  ['痛痛痛', ['痛', '痛', '痛']],
  ['我还不想睡觉', ['我', '还', '不想', '睡觉']],
  ['她也不想吃药', ['她', '也', '不想', '吃药']],
  ['你又不要水', ['你', '又', '不要', '水']],
  ['别让他走', ['别', '让', '他', '走']],
  ['勿给她喝水', ['勿', '给', '她', '喝', '水']],
  ['冷冷冷', ['冷', '冷', '冷']],
  ['我疼疼疼，别走', ['我', '疼', '疼', '疼', '，', '别', '走']],
  ['左左左，右右右', ['左', '左', '左', '，', '右', '右', '右']],
  ['水水水水', ['水', '水', '水', '水']]
];
function noIntl(fn) {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
  try { return fn(); } finally { Object.defineProperty(Intl, 'Segmenter', descriptor); }
}
for (const [text, expected, fallbackExpected = expected] of cases) {
  test(`target boundaries: ${text}`, () => {
    const actual = core.segmentChineseCommunicationText(text).segments;
    observed.push({ text, expected, actual, sourcePreserved: actual.join('') === text });
    assert.deepEqual(actual, expected);
    assert.equal(actual.join(''), text);
    assert.deepEqual(noIntl(() => core.segmentChineseCommunicationText(text).segments), fallbackExpected);
  });
}
const controls = ['别墅', '别人', '区别', '不同', '没有', '不要', '不想', '不去', '一点点', '走走', '画画', '不开心', '呼吸不顺', '精力不足', '苹果手机', '开心果'];
for (const text of controls) test(`protect existing word: ${text}`, () => {
  // Only the Intl path guarantees dictionary words not listed in the AAC lexicon.
  assert.deepEqual(core.segmentChineseCommunicationText(text).segments, [text]);
});
const safetyCases = ['左手不是右手', '只给两口水，不给三口', '我不是不要水', '没说别给水', '别给阿澈2号杯', '她也没有说不想走', '𠮷𠮷𠮷🙂\n 不要不要', '请找B27不是B72'];
for (const text of safetyCases) test(`retain scope, number, unknown and offsets: ${text}`, () => {
  for (const execute of [fn => fn(), noIntl]) execute(() => {
    const result = core.matchTextToCommunicationTiles(text, [], { intl: core.intl });
    assert.equal(result.matches.map(row => row.token).join(''), text);
    const lexical = result.matches.filter(row => !/^[\s\p{P}]+$/u.test(row.token));
    assert.ok(lexical.length);
    for (const row of lexical) { assert.equal(row.tile, null); assert.equal(row.matchType, 'none'); }
    for (const row of result.matches) assert.equal(Array.from(text).slice(row.sourceSpan.start, row.sourceSpan.end).join(''), row.token);
  });
});
test('negated unknown concepts cannot silently select positive or unrelated pictures', () => {
  const boards = [{ id: 'synthetic', tiles: [
    { id: 'want', label: '想', image: '/synthetic.png' },
    { id: 'refuse', label: '不要', synonyms: ['不想'], image: '/synthetic.png' },
    { id: 'generic', label: '痛', synonyms: ['左肩痛'], image: '/synthetic.png' }
  ] }];
  for (const text of ['不想', '左肩痛', '别给']) {
    const result = core.matchTextToCommunicationTiles(text, boards, { preSegmented: [text], preserveSegments: true });
    assert.equal(result.matches[0].tile, null);
    assert.equal(result.matches[0].matchType, 'none');
  }
});
test('repeated image occurrences and negation unmatched survive actual matching', () => {
  const boards = [{ id: 'synthetic', tiles: [{ id: 'pain', label: '痛', image: '/synthetic.png' }] }];
  const result = core.matchTextToCommunicationTiles('痛痛痛，不想', boards);
  assert.equal(result.matches.map(row => row.token).join(''), '痛痛痛，不想');
  assert.equal(result.matches.filter(row => row.tile && row.tile.id === 'pain').length, 3);
  assert.equal(result.matches.find(row => row.token === '不想').matchType, 'none');
});
after(() => {
  if (process.env.CBOARD_CASE_OUTPUT) fs.writeFileSync(process.env.CBOARD_CASE_OUTPUT, JSON.stringify(observed, null, 2));
});
