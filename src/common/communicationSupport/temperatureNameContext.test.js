import boards from '../../api/boards.json';
import zh from '../../translations/zh-CN.communication';
import { matchTextToCommunicationTiles } from './symbolMatching';
import { segmentChineseCommunicationText } from './segmentation';
import { applyCommunicationAiResegmentation } from './communicationAi';
import { buildDevicePrivateRuntimePictogram } from './runtimePictogram';
import {
  buildReceiverLoopState,
  buildReceiverHistoryEntry,
  restoreReceiverLoopState,
  retainReceiverReviewItemAsText,
  replaceReceiverReviewItem
} from './receiverPipeline';
const intl = { messages: zh, formatMessage: ({ id }) => zh[id] || id };
const run = (text, extra = {}) =>
  buildReceiverLoopState(text, boards.advanced, { intl, ...extra });
const hotId = 'SyS0fA96XqtW';

test.each([
  '这杯水太热吗？',
  '水热不热？',
  '这碗汤很热。',
  '饭太热了',
  '杯子很热',
  '房间太热了',
  '水太热，我很热。'
])(
  'object temperature cannot automatically use a hot-person picture: %s',
  text => {
    const state = run(text),
      hot = state.reviewItems.find(i => i.token.includes('热'));
    expect(hot).toBeDefined();
    expect(hot.tile.tile.image).toBe('/symbols/mulberry/hot.svg');
    expect(state.reviewItems.map(i => i.token).join('')).toBe(text);
    expect(state.missingTokens).not.toContain(hot.token);
  }
);
test.each([
  '我很热',
  '你热不热？',
  '我喝水后觉得热',
  '水太热，但我觉得热',
  '水太热我也热'
])('person feeling still uses the existing picture: %s', text => {
  const hot = run(text)
    .reviewItems.filter(i => i.token.includes('热'))
    .pop();
  expect(hot.tile.id).toBe(hotId);
});
test.each(['小岚', '小铭', '阿澈', '老吴'])(
  'an unfamiliar nickname is kept whole, with no fragment picture: %s',
  name => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
    try {
      for (const fallback of [false, true]) {
        if (fallback)
          Object.defineProperty(Intl, 'Segmenter', {
            configurable: true,
            value: undefined
          });
        const state = run(`请帮我找${name}`);
        expect(state.reviewItems.map(i => i.token)).toEqual([
          '请帮我',
          '找',
          name
        ]);
        expect(state.reviewItems[2].tile).toBeNull();
      }
    } finally {
      Object.defineProperty(Intl, 'Segmenter', descriptor);
    }
  }
);
test.each(['小苹果', '小杯子', '小心', '小便', '老人', '老朋友', '阿司匹林'])(
  'ordinary words are not treated as nickname prefixes: %s',
  word => {
    const tokens = segmentChineseCommunicationText(`请找${word}`).segments;
    if (word.length > 2) expect(tokens).not.toContain(word.slice(0, 2));
    expect(tokens.join('')).toBe(`请找${word}`);
  }
);
test('personal people photos take precedence and do not leak between libraries', () => {
  for (const image of ['/family-a.png', '/family-b.png']) {
    const personal = [
      ...boards.advanced,
      {
        id: 'people',
        tiles: [
          { id: 'named', label: '小岚', communicationCategory: 'people', image }
        ]
      }
    ];
    const state = buildReceiverLoopState('请找小岚', personal, { intl });
    expect(
      state.reviewItems.find(i => i.token === '小岚').tile.tile.image
    ).toBe(image);
  }
  expect(
    run('请找小岚').reviewItems.find(i => i.token === '小岚').tile
  ).toBeNull();
});
test('AI-preserved split names and global correction/backfill cannot reinstate a fragment image', () => {
  const result = applyCommunicationAiResegmentation({
    text: '请找小岚',
    boards: boards.advanced,
    intl,
    response: { tokens: ['请', '找', '小', '岚'] },
    currentReviewItems: [],
    missingTokenRecords: [
      {
        normalizedToken: '小',
        status: 'resolved',
        resolvedPictogramId: 'r18bVC96m9t-',
        reviewedByCaregiver: true
      }
    ]
  });
  expect(result.applied).toBe(true);
  expect(result.reviewItems.map(i => i.token)).toEqual([
    '请',
    '找',
    '小',
    '岚'
  ]);
  expect(result.reviewItems.find(i => i.token === '小').tile).toBeNull();
});
test('temperature context also guards AI boundaries and token-level backfill', () => {
  const result = applyCommunicationAiResegmentation({
    text: '水太热',
    boards: boards.advanced,
    intl,
    response: { tokens: ['水', '太', '热'] },
    currentReviewItems: [],
    missingTokenRecords: [
      {
        normalizedToken: '热',
        status: 'resolved',
        resolvedPictogramId: hotId,
        reviewedByCaregiver: true
      }
    ]
  });
  expect(result.applied).toBe(true);
  expect(result.reviewItems.find(i => i.token === '热').tile.id).toBe(
    'tuyujia-builtin-object-heat'
  );
  const learned = run('水太热', {
    correctionMemory: { rules: [{ token: '热', preferredPictogramId: hotId }] }
  });
  expect(learned.reviewItems.find(i => i.token === '热').tile.id).toBe(
    'tuyujia-builtin-object-heat'
  );
});

test('a learned object-heat picture cannot become a personal sensation globally', () => {
  const state = run('我很热', {
    correctionMemory: {
      rules: [
        { token: '热', preferredPictogramId: 'tuyujia-builtin-object-heat' }
      ]
    }
  });
  const hot = state.reviewItems.find(i => i.token.includes('热'));
  expect(hot.tile && hot.tile.id).not.toBe('tuyujia-builtin-object-heat');
});
test('name private-image backfill, explicit text and offline restore reuse the existing flow', () => {
  const photo = buildDevicePrivateRuntimePictogram({
    recordId: 'synthetic-name',
    label: '小岚',
    image: 'data:image/png;base64,c3ludGhldGlj'
  });
  const state = run('请找小岚', {
    missingTokenRecords: [
      {
        normalizedToken: '小岚',
        status: 'resolved',
        resolvedPictogramId: photo.id,
        resolvedPictogram: photo,
        reviewedByCaregiver: true
      }
    ]
  });
  expect(state.reviewItems.find(i => i.token === '小岚').tile.tile.image).toBe(
    photo.image
  );
  const reviewed = state.reviewItems.reduce(
    (items, i) =>
      i.tile ? items : retainReceiverReviewItemAsText(items, i.id),
    state.reviewItems
  );
  const record = {
    ...buildReceiverHistoryEntry('请找小岚', reviewed),
    recordStatus: 'draft'
  };
  const restored = restoreReceiverLoopState(
    JSON.parse(JSON.stringify(record)),
    [],
    { intl }
  );
  expect(restored.outputPreview.map(i => i.vocalization).join('')).toBe(
    '请找小岚'
  );
  expect(
    restored.reviewItems.find(i => i.token === '小岚').tile.tile.image
  ).toBe(photo.image);
});
test('old automatic drafts are rechecked, but explicit choices and completed history stay intact', () => {
  const original = matchTextToCommunicationTiles('我很热', boards.advanced, {
    intl
  }).matches.find(i => i.token.includes('热')).tile;
  const state = run('水太热');
  const hot = state.reviewItems.find(i => i.token === '热');
  const legacy = state.reviewItems.map(i =>
    i.id === hot.id ? { ...i, tile: original, matchType: 'exact' } : i
  );
  const record = buildReceiverHistoryEntry('水太热', legacy);
  expect(
    restoreReceiverLoopState({ ...record, recordStatus: 'draft' }, [], {
      intl
    }).reviewItems.find(i => i.token === '热').tile
  ).toBeNull();
  expect(
    restoreReceiverLoopState({ ...record, recordStatus: 'confirmed' }, [], {
      intl
    }).reviewItems.find(i => i.token === '热').tile.id
  ).toBe(hotId);
  const explicit = buildReceiverHistoryEntry(
    '水太热',
    replaceReceiverReviewItem(state.reviewItems, hot.id, original)
  );
  expect(
    restoreReceiverLoopState({ ...explicit, recordStatus: 'draft' }, [], {
      intl
    }).reviewItems.find(i => i.token === '热').tile.id
  ).toBe(hotId);
});
test.each(['冷不冷', '热不热'])(
  'temperature questions keep negation as a separate operator: %s',
  text => {
    expect(segmentChineseCommunicationText(text).segments).toEqual([
      text[0],
      '不',
      text[0]
    ]);
    expect(segmentChineseCommunicationText('不舒服').segments).toEqual([
      '不舒服'
    ]);
  }
);
