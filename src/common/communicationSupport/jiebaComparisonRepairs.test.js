import { segmentChineseCommunicationText } from './segmentation';
import { matchTextToCommunicationTiles } from './symbolMatching';
import { buildReceiverLoopState, buildReceiverHistoryEntry, restoreReceiverLoopState, retainReceiverReviewItemAsText, replaceReceiverReviewItem } from './receiverPipeline';
import boards from '../../api/boards.json';
import messages from '../../translations/zh-CN.communication';

const intl = { messages, formatMessage: ({ id }) => messages[id] || id };
function bothEngines(run) {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  try {
    run();
    Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
    run();
  } finally { Object.defineProperty(Intl, 'Segmenter', descriptor); }
}

test.each([
  ['我不喝水', ['我', '不', '喝', '水']],
  ['不吃苹果', ['不', '吃', '苹果']],
  ['不去医院', ['不', '去', '医院']],
  ['不喝不喝', ['不', '喝', '不', '喝']],
  ['我今晚不回家吃饭', ['我', '今晚', '不', '回家', '吃饭']],
  ['不要不想不是', ['不要', '不', '想', '不是']]
])('separates compositional negation while protecting lexical negative units: %s', (text, tokens) => {
  bothEngines(() => {
    expect(segmentChineseCommunicationText(text).segments).toEqual(tokens);
    // A legacy compound picture must not undo the source grammar boundary.
    const library = [{ id: 'distractors', tiles: [{ id: 'negative', label: '不喝', image: '/x.png' }] }];
    expect(matchTextToCommunicationTiles(text, library).segmentation.segments).toEqual(tokens);
  });
});

test.each(['慢一点，慢一点', '走慢一点', '吃慢一点'])('does not infer speech from an unspecified slower action: %s', text => {
  bothEngines(() => {
    const result = matchTextToCommunicationTiles(text, boards.advanced, { intl });
    expect(result.matches.filter(m => m.token === '慢一点').length).toBeGreaterThan(0);
    expect(result.matches.filter(m => m.token === '慢一点').every(m => m.tile === null)).toBe(true);
    expect(result.matches.some(m => m.tile && m.tile.id === 'pi-repair-slowly')).toBe(false);
  });
});

test('keeps a correctly labelled slow-action picture and an explicit speech request available', () => {
  const generic = [{ id: 'custom', tiles: [{ id: 'slow', label: '慢一点', vocalization: '慢一点', image: '/slow.png' }] }];
  expect(matchTextToCommunicationTiles('慢一点', generic).matches[0].tile.id).toBe('slow');
  expect(matchTextToCommunicationTiles('说慢一点', boards.advanced, { intl }).matches.some(m => m.tile && m.tile.id === 'pi-repair-slowly')).toBe(true);
});

test.each(['我不要吃药', '我想上厕所', '我右肩疼，左肩不疼', '请帮我翻身', '慢一点，慢一点'])('automatic pictures preserve received words through confirmation and restart: %s', text => {
  const state = buildReceiverLoopState(text, boards.advanced, { intl });
  let review = state.reviewItems;
  review.filter(m => !m.tile).forEach(m => { review = retainReceiverReviewItemAsText(review, m.id); });
  const history = JSON.parse(JSON.stringify(buildReceiverHistoryEntry(text, review)));
  expect(history.output.map(m => m.label).join('')).toBe(text);
  expect(history.output.map(m => m.vocalization).join('')).toBe(text);
  for (const catalog of [boards.advanced, []]) {
    const restored = restoreReceiverLoopState(history, catalog, { intl });
    expect(restored.outputPreview.map(m => m.vocalization).join('')).toBe(text);
  }
});

test('explicit manual replacement retains its chosen utterance', () => {
  const state = buildReceiverLoopState('水', boards.advanced, { intl });
  const candidate = { id: 'custom', displayLabel: '温水', tile: { id: 'custom', label: '温水', vocalization: '请给我温水', image: '/warm.png' } };
  const review = replaceReceiverReviewItem(state.reviewItems, state.reviewItems[0].id, candidate);
  expect(buildReceiverHistoryEntry('水', review).output[0].vocalization).toBe('请给我温水');
});
