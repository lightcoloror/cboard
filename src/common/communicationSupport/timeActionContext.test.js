import boards from '../../api/boards.json';
import zh from '../../translations/zh-CN.communication';
import { segmentChineseCommunicationText } from './segmentation';
import {
  buildReceiverLoopState,
  buildReceiverHistoryEntry,
  restoreReceiverLoopState,
  retainReceiverReviewItemAsText
} from './receiverPipeline';
import { buildDevicePrivateRuntimePictogram } from './runtimePictogram';
import {
  applyPersonalImagePreferencesToBoards,
  upsertPersonalImagePreference
} from './personalImagePreferences';
import { buildCommunicationTileCatalog } from './symbolMatching';
const intl = { messages: zh, formatMessage: ({ id }) => zh[id] || id };

test.each([
  ['明早七点半叫醒我，请再说一次。', ['明早', '七点半']],
  ['明晚八点一刻回家', ['明晚', '八点一刻']],
  ['今天7:30吃饭', ['今天', '7:30', '吃饭']],
  ['下午三点十五分去医院', ['下午', '三点十五分']],
  ['早上八点钟起床', ['早上', '八点钟']],
  ['明早七点到八点吃饭', ['明早', '七点', '八点', '吃饭']],
  ['晚上二十三点零五分睡觉', ['晚上', '二十三点零五分']],
  ['明早不是七点半，是八点半', ['明早', '不是', '七点半', '八点半']]
])('time units are intact on both engines: %s', (text, units) => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  try {
    for (const fallback of [false, true]) {
      if (fallback)
        Object.defineProperty(Intl, 'Segmenter', {
          configurable: true,
          value: undefined
        });
      const state = buildReceiverLoopState(text, boards.advanced, { intl });
      const tokens = state.reviewItems.map(i => i.token);
      expect(tokens.join('')).toBe(text);
      units.forEach(unit => expect(tokens).toContain(unit));
      const reviewed = state.reviewItems.reduce(
        (items, i) =>
          i.tile ? items : retainReceiverReviewItemAsText(items, i.id),
        state.reviewItems
      );
      const record = JSON.parse(
        JSON.stringify(buildReceiverHistoryEntry(text, reviewed))
      );
      expect(
        restoreReceiverLoopState({ ...record, recordStatus: 'confirmed' }, [], {
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

test.each([
  '给我一点水',
  '我有一点热',
  '三点建议',
  '一点五升水',
  '25:99',
  '147:30',
  '七点半个苹果'
])('quantity, invalid clock and source text remain intact: %s', text => {
  const tokens = segmentChineseCommunicationText(text).segments;
  expect(tokens.join('')).toBe(text);
  expect(tokens).not.toContain('7:30');
  if (text === '给我一点水') expect(tokens).not.toContain('一点水');
});

test('meal reuses a personal edited card without imposing breakfast or dinner', () => {
  const meal = buildDevicePrivateRuntimePictogram({
    recordId: 'synthetic-meal',
    label: '吃饭',
    image: 'data:image/png;base64,c3ludGhldGlj'
  });
  const personal = [
    ...boards.advanced,
    {
      id: 'personal-meals',
      tiles: [
        meal,
        { id: 'breakfast', label: '吃早饭', image: '/breakfast-with-sun.png' },
        { id: 'dinner', label: '吃晚饭', image: '/dinner-with-moon.png' }
      ]
    }
  ];
  const state = buildReceiverLoopState('我今晚不回家吃饭', personal, { intl });
  expect(state.reviewItems.map(i => i.token)).toEqual([
    '我',
    '今晚',
    '不',
    '回家',
    '吃饭'
  ]);
  expect(state.reviewItems.find(i => i.token === '吃饭').tile.tile.image).toBe(
    meal.image
  );
  expect(state.reviewItems.find(i => i.token === '回家').tile).toBeNull();
  expect(
    buildReceiverLoopState('吃饭', boards.advanced, { intl }).reviewItems[0]
      .tile
  ).toBeNull();
  const reviewed = state.reviewItems.reduce(
    (items, i) =>
      i.tile ? items : retainReceiverReviewItemAsText(items, i.id),
    state.reviewItems
  );
  const record = JSON.parse(
    JSON.stringify(
      buildReceiverHistoryEntry(state.inputText || '我今晚不回家吃饭', reviewed)
    )
  );
  const restored = restoreReceiverLoopState(
    { ...record, recordStatus: 'confirmed' },
    [],
    { intl }
  );
  expect(
    restored.reviewItems.find(i => i.token === '吃饭').tile.tile.image
  ).toBe(meal.image);
});

test('full-name-only policy keeps a legacy relation photo available but never auto-identifies it', () => {
  const photo = buildDevicePrivateRuntimePictogram({
    recordId: 'grandma',
    label: '奶奶',
    image: 'data:image/png;base64,c3ludGhldGlj'
  });
  const personal = [
    ...boards.advanced,
    { id: 'family', tiles: [{ ...photo, communicationCategory: 'people' }] }
  ];
  const a = buildReceiverLoopState('请叫奶奶来', personal, { intl });
  expect(a.reviewItems.find(i => i.token === '奶奶').tile).toBeNull();
  expect(
    buildCommunicationTileCatalog(personal, intl).find(i => i.id === photo.id)
      .tile.image
  ).toBe(photo.image);
  expect(
    buildReceiverLoopState('请叫外婆来', personal, { intl }).reviewItems.find(
      i => i.token === '外婆'
    ).tile
  ).toBeNull();
  expect(
    buildReceiverLoopState('请叫奶奶来', boards.advanced, {
      intl
    }).reviewItems.find(i => i.token === '奶奶').tile.tile.image
  ).not.toBe(photo.image);
});

test('existing patient/workspace preferences remain isolated after a JSON restart', () => {
  const tile = boards.advanced
    .flatMap(b => b.tiles)
    .find(t => t.id === 'r19yB0cTX5F-');
  const board = boards.advanced.find(b => b.tiles.includes(tile));
  const identity = { patientId: 'synthetic-a', workspaceId: 'family-a' };
  const prefs = JSON.parse(
    JSON.stringify(
      upsertPersonalImagePreference(
        [],
        {
          tileId: tile.id,
          boardId: board.id,
          image: '/local/grandma.png',
          labelSnapshot: '奶奶'
        },
        { identity }
      )
    )
  );
  const own = applyPersonalImagePreferencesToBoards(
    boards.advanced,
    prefs,
    identity
  );
  const other = applyPersonalImagePreferencesToBoards(boards.advanced, prefs, {
    ...identity,
    patientId: 'synthetic-b'
  });
  expect(
    buildReceiverLoopState('奶奶', own, { intl }).reviewItems[0].tile
  ).toBeNull();
  expect(
    buildCommunicationTileCatalog(own, intl).find(i => i.id === tile.id).tile
      .image
  ).toBe('/local/grandma.png');
  expect(
    buildReceiverLoopState('奶奶', other, { intl }).reviewItems[0].tile.tile
      .image
  ).toBe(tile.image);
});
