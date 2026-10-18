import { getPictogramSegmentationTerms } from './pictogramSemantics';
import { segmentChineseCommunicationText } from './segmentation';
import { buildReceiverLoopState } from './receiverPipeline';
import { matchTextToCommunicationTiles } from './symbolMatching';

const terms = [
  '停车场',
  '洗衣机',
  '洗衣液',
  '洗碗液',
  '沐浴露',
  '肥皂块',
  '鸡肉卷',
  '豆腐脑',
  '电动车',
  '电话卡',
  '热水袋',
  '饮用水'
];

test.each(terms)(
  'preserves the object %s, its negation, source span and whole missing-image query',
  term => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
    try {
      for (const fallback of [false, true]) {
        if (fallback)
          Object.defineProperty(Intl, 'Segmenter', {
            configurable: true,
            value: undefined
          });
        const text = `我不要${term}`;
        const state = buildReceiverLoopState(text, []);
        expect(state.reviewItems.map(x => x.token)).toEqual([
          '我',
          '不要',
          term
        ]);
        expect(state.missingTokens).toContain(term);
        const item = state.reviewItems[2];
        expect(text.slice(item.sourceSpan.start, item.sourceSpan.end)).toBe(
          term
        );
        const whole = [
          {
            id: 'b',
            tiles: [{ id: 'object', label: term, image: '/whole.png' }]
          }
        ];
        expect(buildReceiverLoopState(text, whole).reviewItems[2].tile.id).toBe(
          'object'
        );
      }
    } finally {
      Object.defineProperty(Intl, 'Segmenter', descriptor);
    }
  }
);

test.each([
  ['不要停车，去停车场', ['不要', '停车', '，', '去', '停车场']],
  ['我要洗衣液，不要洗手液', ['我', '要', '洗衣液', '，', '不要', '洗手液']],
  ['洗手液不是沐浴露', ['洗手液', '不是', '沐浴露']],
  ['请帮我妈妈拿洗手液', ['请', '帮', '我', '妈妈', '拿', '洗手液']],
  // The established communication lexicon already accepts this whole phrase.
  ['我感冒了', ['我', '感冒了']],
  ['我今晚不回家吃饭', ['我', '今晚', '不', '回家', '吃饭']]
])('keeps contrasts and grammatical boundaries in %s', (text, expected) => {
  expect(segmentChineseCommunicationText(text).segments).toEqual(expected);
});

test('reuses all canonical meanings, not the capped metadata list or inflected search aliases', () => {
  const terms = getPictogramSegmentationTerms();
  expect(terms).toEqual(
    expect.arrayContaining(['停车场', '洗手液', '沐浴露', '吃药'])
  );
  expect(terms).not.toContain('感冒了');
});

test('an explicit manual segmentation remains intact', () => {
  const tokens = ['停车', '场'];
  expect(
    matchTextToCommunicationTiles('停车场', [], {
      preSegmented: tokens,
      preserveSegments: true
    }).matches.map(x => x.token)
  ).toEqual(tokens);
});
