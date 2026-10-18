import boards from '../../api/boards.json';
import zh from '../../translations/zh-CN.communication';
import {
  segmentChineseCommunicationText,
  findCommunicationPersonSpans
} from './segmentation';
import {
  matchTextToCommunicationTiles,
  applyCommunicationContextGuards
} from './symbolMatching';
import {
  buildReceiverLoopState,
  buildReceiverHistoryEntry,
  restoreReceiverLoopState,
  retainReceiverReviewItemAsText
} from './receiverPipeline';
import {
  buildPictogramSemantics,
  rankPictogramCandidates,
  isPictogramSemanticMatchAllowed
} from './pictogramSemantics';
import {
  getMissingTokenSuggestions,
  reviewMissingTokenRecord
} from './missingTokens';
const intl = { messages: zh, formatMessage: ({ id }) => zh[id] || id };
const run = (text, options = {}) =>
  buildReceiverLoopState(text, boards.advanced, { intl, ...options });

test.each([
  ['饭太凉了，请热一下。', '热一下'],
  ['请把牛奶热一热', '热一热'],
  ['汤不要加热', '加热'],
  ['轮椅的刹车还没松开。', '刹车'],
  ['先刹车再下车', '刹车'],
  ['小岚不去，小林陪我去。', '小岚'],
  ['小铭还没来', '小铭'],
  ['我先去，阿澈不想去', '阿澈']
])('whole expression retained with Intl and fallback: %s', (text, unit) => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  try {
    for (const fallback of [false, true]) {
      if (fallback)
        Object.defineProperty(Intl, 'Segmenter', {
          configurable: true,
          value: undefined
        });
      const state = run(text);
      expect(state.reviewItems.map(i => i.token)).toContain(unit);
      expect(state.reviewItems.map(i => i.token).join('')).toBe(text);
      const reviewed = state.reviewItems.reduce(
        (items, i) =>
          i.tile ? items : retainReceiverReviewItemAsText(items, i.id),
        state.reviewItems
      );
      const saved = JSON.parse(
        JSON.stringify(buildReceiverHistoryEntry(text, reviewed))
      );
      expect(
        restoreReceiverLoopState({ ...saved, recordStatus: 'confirmed' }, [], {
          intl
        })
          .outputPreview.map(i => i.vocalization)
          .join('')
      ).toBe(text);
    }
  } finally {
    Object.defineProperty(Intl, 'Segmenter', descriptor);
  }
});

test.each(['小苹果不吃', '小杯子不热', '老人不去', '阿司匹林不吃', '小心刹车'])(
  'known common words are not inferred names: %s',
  text => {
    expect(findCommunicationPersonSpans(text)).toEqual([]);
    expect(segmentChineseCommunicationText(text).segments.join('')).toBe(text);
  }
);

test.each([
  ['请热一下', ['请', '热', '一下']],
  ['水热一下', ['水', '热', '一下']],
  ['给饭加热', ['给', '饭', '加', '热']],
  ['把汤热一热', ['把', '汤', '热', '一', '热']]
])(
  'split AI tokens and learned temperature cards cannot replace heating: %s',
  (text, tokens) => {
    for (const id of ['SyS0fA96XqtW', 'tuyujia-builtin-object-heat']) {
      const state = run(text, {
        preSegmented: tokens,
        correctionMemory: {
          rules: [{ token: '热', preferredPictogramId: id }]
        },
        missingTokenRecords: [
          {
            normalizedToken: '热',
            status: 'resolved',
            resolvedPictogramId: id,
            reviewedByCaregiver: true
          }
        ]
      });
      expect(state.reviewItems.map(i => i.token)).toEqual(tokens);
      state.reviewItems
        .filter(i => i.token === '热')
        .forEach(i => expect(i.tile).toBeNull());
    }
  }
);

test('heating does not borrow personal sensation or object state, while both states remain usable', () => {
  const state = run('饭太凉了，请热一下。');
  expect(state.reviewItems.find(i => i.token === '热一下').tile).toBeNull();
  expect(
    run('我很热').reviewItems.find(i => i.token.includes('热')).tile.id
  ).toBe('SyS0fA96XqtW');
  expect(run('水太热').reviewItems.find(i => i.token === '热').tile.id).toBe(
    'tuyujia-builtin-object-heat'
  );
  const person = matchTextToCommunicationTiles('我很热', boards.advanced, {
    intl
  }).matches.find(i => i.token.includes('热')).tile;
  const explicit = [
    { token: '热一下', tile: person, matchType: 'manual', source: 'manual' }
  ];
  expect(
    applyCommunicationContextGuards(explicit, [], {
      preserveExplicitChoices: true
    })[0].tile
  ).toBe(person);
  expect(applyCommunicationContextGuards(explicit, [])[0].tile).toBeNull();
});

test('negative personal name also guards presegmented fragments and scoped private cards', () => {
  const text = '小岚不去，小林陪我去。';
  const split = run(text, {
    preSegmented: [
      '小',
      '岚',
      '不',
      '去',
      '，',
      '小',
      '林',
      '陪',
      '我',
      '去',
      '。'
    ]
  });
  split.reviewItems
    .filter(i => i.token === '小')
    .forEach(i => expect(i.tile).toBeNull());
  const personal = [
    ...boards.advanced,
    {
      id: 'synthetic-people',
      tiles: [
        {
          id: 'synthetic-name',
          label: '小岚',
          communicationCategory: 'people',
          image: '/synthetic-avatar.svg'
        }
      ]
    }
  ];
  expect(
    buildReceiverLoopState(text, personal, { intl }).reviewItems.find(
      i => i.token === '小岚'
    ).tile.tile.image
  ).toBe('/synthetic-avatar.svg');
  expect(run(text).reviewItems.find(i => i.token === '小岚').tile).toBeNull();
});

const picture = (token, id, labels, extra = {}) => ({
  id: 'runtime_' + id,
  image: '/synthetic-public.png',
  label: labels[0],
  source: {
    provider: 'arasaac',
    originalId: String(id),
    name: 'ARASAAC',
    license: 'CC BY-NC-SA 4.0',
    sourceUrl: `https://arasaac.org/pictograms/${id}`
  },
  semantics: buildPictogramSemantics({
    token,
    query: token,
    provider: 'arasaac',
    originalId: String(id),
    sourceLabels: labels,
    ...extra
  })
});

test('parking place rejects the mislabeled action and preserves the two place candidates', () => {
  const source = [
    picture('停车场', 5379, ['放置车辆', '停车场']),
    picture('停车场', 6283, ['停车场']),
    picture('停车场', 24755, ['停车场'])
  ];
  expect(
    rankPictogramCandidates('停车场', source).map(p => p.source.originalId)
  ).toEqual(['6283', '24755']);
  expect(source[0].semantics.sourceLabels).toEqual(['放置车辆', '停车场']);
  const forged = { ...source[0], semantics: { ...source[1].semantics } };
  expect(rankPictogramCandidates('停车场', [forged])).toEqual([]);
  expect(
    rankPictogramCandidates('停车', [
      picture('停车', 5379, ['放置车辆', '停车场'])
    ])
  ).toHaveLength(1);
});

test('daily help excludes financial aid, including mixed labels, without excluding ordinary aid', () => {
  const source = [
    picture('请帮忙', 25620, ['help']),
    picture('请帮忙', 998, ['help', 'subsidies']),
    picture('请帮忙', 9046, ['help', 'rescue']),
    picture('请帮忙', 10141, ['help'], {
      sourceCategories: ['medical procedure']
    }),
    picture('请帮忙', 4570, ['help', 'cooperate', 'aid']),
    picture('请帮忙', 12252, ['support', 'help', 'cooperation'])
  ];
  const ranked = rankPictogramCandidates('请帮忙', source);
  expect(ranked.map(p => p.source.originalId)).toEqual([
    '4570',
    '12252',
    '10141',
    '9046'
  ]);
  expect(
    ranked.every(
      p =>
        p.semantics.requiresReview &&
        !isPictogramSemanticMatchAllowed('请帮忙', p.semantics)
    )
  ).toBe(true);
});

test('the existing review/cache path retains manual confirmation across an evidence version upgrade', () => {
  const p = picture('刹车', 37920, ['刹车']);
  const stored = reviewMissingTokenRecord(
    [{ id: 'brake', normalizedToken: '刹车', status: 'new' }],
    'brake',
    { status: 'suggested', suggestedPictograms: [p] }
  );
  expect(getMissingTokenSuggestions(stored[0])).toHaveLength(1);
  const pending = run('轮椅的刹车还没松开。', { missingTokenRecords: stored });
  expect(pending.reviewItems.find(i => i.token === '刹车').tile).toBeNull();
  const selected = reviewMissingTokenRecord(stored, 'brake', {
    status: 'resolved',
    resolvedPictogramId: p.id,
    reviewedByCaregiver: true
  });
  selected[0].resolvedPictogram.semantics.mappingVersion = '2026-10-18.1';
  const restored = run('轮椅的刹车还没松开。', {
    missingTokenRecords: JSON.parse(JSON.stringify(selected))
  });
  expect(
    restored.reviewItems.find(i => i.token === '刹车').tile.tile.image
  ).toBe(p.image);
  const stale = {
    ...p,
    semantics: { ...p.semantics, mappingVersion: '2026-10-18.1' }
  };
  expect(rankPictogramCandidates('刹车', [stale])).toEqual([]);
});
