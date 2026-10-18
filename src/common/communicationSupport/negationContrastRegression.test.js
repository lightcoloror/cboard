import fixtures from './fixtures/negationContrastRegression.json';
import boards from '../../api/boards.json';
import messages from '../../translations/zh-CN.communication';
import { segmentChineseCommunicationText } from './segmentation';
import { matchTextToCommunicationTiles } from './symbolMatching';
import {
  buildReceiverLoopState,
  retainReceiverReviewItemAsText,
  buildReceiverHistoryEntry,
  restoreReceiverLoopState
} from './receiverPipeline';

const intl = { messages, formatMessage: ({ id }) => messages[id] || id };
const distractors = [
  {
    id: 'synthetic-phrases',
    tiles: [
      '不想',
      '想不',
      '想吃药',
      '不太',
      '不要出门',
      '别回家',
      '没有呼吸困难',
      '不是不',
      '我不是',
      '我不',
      '不得',
      '不',
      '呼吸'
    ].map((label, i) => ({ id: `trap-${i}`, label, image: '/synthetic.png' }))
  }
];
function bothEngines(run) {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  try {
    run();
    Object.defineProperty(Intl, 'Segmenter', {
      configurable: true,
      value: undefined
    });
    run();
  } finally {
    Object.defineProperty(Intl, 'Segmenter', descriptor);
  }
}

test.each(fixtures.cases)(
  'keeps lexical and grammatical boundaries: $id',
  ({ text, tokens }) => {
    bothEngines(() => {
      expect(segmentChineseCommunicationText(text).segments).toEqual(tokens);
      for (const library of [boards.advanced, distractors, []]) {
        const match = matchTextToCommunicationTiles(text, library, { intl });
        expect(match.segmentation.segments).toEqual(tokens);
        expect(
          match.matches.map(m =>
            Array.from(text)
              .slice(m.sourceSpan.start, m.sourceSpan.end)
              .join('')
          )
        ).toEqual(tokens);
      }
    });
  }
);

test.each(fixtures.cases)(
  'retains ordered negation through text retention, save and restore: $id',
  ({ text, tokens }) => {
    const state = buildReceiverLoopState(text, boards.advanced, { intl });
    let review = state.reviewItems;
    review
      .filter(m => !m.tile)
      .forEach(m => {
        review = retainReceiverReviewItemAsText(review, m.id);
      });
    const history = JSON.parse(
      JSON.stringify(buildReceiverHistoryEntry(text, review))
    );
    expect(history.output.map(m => m.vocalization).join('')).toBe(text);
    for (const library of [boards.advanced, []]) {
      const restored = restoreReceiverLoopState(history, library, { intl });
      expect(restored.reviewItems.map(m => m.token)).toEqual(tokens);
      expect(restored.outputPreview.map(m => m.label).join('')).toBe(text);
      expect(restored.outputPreview.map(m => m.vocalization).join('')).toBe(
        text
      );
    }
  }
);

test.each(['没关系', '不一定', '不得不', '呼吸困难'])(
  'does not substitute a related fragment for protected concept %s',
  text => {
    const result = matchTextToCommunicationTiles(text, distractors, { intl });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].tile).toBeNull();
  }
);

test('explicitly reviewed segmentation is not rewritten by default rules', () => {
  const text = '我不想吃药';
  const tokens = ['我', '不想', '吃药'];
  expect(
    matchTextToCommunicationTiles(text, distractors, {
      preSegmented: tokens,
      preserveSegments: true
    }).segmentation.segments
  ).toEqual(tokens);
});

test.each([
  ['我吃药', ['我', '吃药']],
  ['想吃药', ['想', '吃药']],
  ['我不吃饭', ['我', '不', '吃饭']]
])(
  'a grammatical chunk cannot consume the start of an action: %s',
  (text, tokens) => {
    bothEngines(() =>
      expect(segmentChineseCommunicationText(text).segments).toEqual(tokens)
    );
  }
);
