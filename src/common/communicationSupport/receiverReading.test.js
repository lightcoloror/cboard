import { buildReceiverReading } from './receiverReading';
import { buildReceiverLoopState, buildReceiverHistoryEntry, retainReceiverReviewItemAsText } from './receiverPipeline';

function fixture(tokens) {
  let start = 0;
  const sequence = tokens.map(originalToken => {
    const end = start + Array.from(originalToken).length;
    const item = { originalToken, sourceSpan: { start, end, offsetUnit: 'unicode-code-point' } };
    start = end;
    return item;
  });
  const items = tokens.map((label, index) => ({ id: `synthetic-${index}`, label }));
  return { text: tokens.join(''), sequence, items };
}
test.each([
  [['我', '今晚', '不', '回家', '吃饭', '，', '明早', '七点半', '回家'], ['我今晚不回家吃饭，', '明早七点半回家']],
  [['林小明', '不', '喝水', '。', '林小明', '喝水'], ['林小明不喝水。', '林小明喝水']],
  [['水温', '37.5', '℃', '，', '只', '喝', '两口'], ['水温37.5℃，', '只喝两口']],
  [['😀', '不', '去', '！', '。', '我', '去'], ['😀不去！。', '我去']],
  [['我', '喝水'], ['我喝水']]
])('segments confirmed positions without changing meaning: %j', (tokens, expected) => {
  const f = fixture(tokens), result = buildReceiverReading(f.text, f.sequence, f.items);
  expect(result.segments.map(s => s.text)).toEqual(expected);
  expect(result.segments.flatMap(s => s.itemIndices)).toEqual(tokens.map((_, i) => i));
  expect(result.canSegment).toBe(expected.length > 1);
});
test('a compound card spanning punctuation remains whole', () => {
  const f = fixture(['不，不去', '。', '回家']);
  expect(buildReceiverReading(f.text, f.sequence, f.items).segments.map(s => s.text)).toEqual(['不，不去。', '回家']);
});
test.each(['missing', 'reorder', 'insert', 'wrong-token', 'utf16', 'delete'])('fails closed for %s', failure => {
  const f = fixture(['林小明', '，', '喝水']);
  if (failure === 'missing') delete f.sequence[0].sourceSpan;
  if (failure === 'reorder') f.sequence.reverse();
  if (failure === 'insert') f.items.push({ label: '合成新增' });
  if (failure === 'wrong-token') f.sequence[0].originalToken = '另一个人';
  if (failure === 'utf16') f.sequence[0].sourceSpan.offsetUnit = 'utf-16';
  if (failure === 'delete') { f.sequence.shift(); f.items.shift(); }
  const result = buildReceiverReading(f.text, f.sequence, f.items);
  expect(result.canSegment).toBe(false);
  expect(result.segments).toEqual([]);
});
test('real local matcher and text fallback preserve negation, whole actions, time and repeated names', () => {
  const text = '我今晚不回家吃饭，明早七点半回家';
  const matched = buildReceiverLoopState(text, []);
  let review = matched.reviewItems;
  review.filter(item => !item.tile).forEach(item => { review = retainReceiverReviewItemAsText(review, item.id); });
  const record = buildReceiverHistoryEntry(text, review);
  const result = buildReceiverReading(text, record.pictogramSequence, record.output);
  expect(result.segments.map(s => s.text)).toEqual(['我今晚不回家吃饭，', '明早七点半回家']);
  expect(record.output.map(item => item.label)).toContain('吃饭');
});
