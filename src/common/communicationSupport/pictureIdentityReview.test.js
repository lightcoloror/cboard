import boards from '../../api/boards.json';
import zh from '../../translations/zh-CN.communication';
import {
  buildCommunicationTileCatalog,
  matchTextToCommunicationTiles
} from './symbolMatching';
import {
  buildReceiverLoopState,
  buildReceiverOutputPreview,
  restoreReceiverLoopState,
  retainReceiverReviewItemAsText
} from './receiverPipeline';
import {
  findSafeLocalMissingTokenResolutions,
  applyMissingTokenResolutions
} from './missingTokens';

const intl = { messages: zh, formatMessage: ({ id }) => zh[id] || id };
const legacyHelpImages = [
  '/symbols/mulberry/help_,_to.svg',
  '/assets/cboard-default/5083f4d4500e0f76.png'
];
const match = (token, tiles) =>
  matchTextToCommunicationTiles(token, [{ id: 'old', tiles }], {
    intl,
    preSegmented: [token],
    allowPartial: false
  }).matches[0];

test.each(['自己', '本人'])(
  'does not turn the reflexive %s into the speaker even on old boards',
  token => {
    const firstPerson = {
      id: 'old-me',
      label: '我',
      vocalization: '我',
      image: '/symbols/arasaac/picinterpreter-care/6632.png',
      communicationSynonyms: '自己,本人'
    };
    expect(match(token, [firstPerson]).tile).toBeNull();
    // A stale/imported translation can relabel the pixels without changing them.
    expect(
      match(token, [{ ...firstPerson, label: token, vocalization: token }]).tile
    ).toBeNull();
    expect(
      match(token, [
        { id: 'family', label: token, image: '/family/reflexive.png' }
      ]).tile.id
    ).toBe('family');
    expect(match('我', [firstPerson]).tile.id).toBe('old-me');
  }
);

test.each(['我自己回家', '你自己回家', '她自己回家', '他本人回家'])(
  'retains the subject and a whole lookup term in %s',
  text => {
    const state = buildReceiverLoopState(text, boards.advanced, { intl });
    expect(state.reviewItems.map(item => item.token).join('')).toBe(text);
    const reflexive = state.reviewItems.find(item =>
      ['自己', '本人'].includes(item.token)
    );
    expect(reflexive.tile).toBeNull();
    expect(state.missingTokens).toContain(reflexive.token);
    const retained = state.reviewItems.reduce(
      (items, item) =>
        item.tile ? items : retainReceiverReviewItemAsText(items, item.id),
      state.reviewItems
    );
    expect(
      buildReceiverOutputPreview(retained)
        .map(item => item.vocalization)
        .join('')
    ).toBe(text);
  }
);

test.each(legacyHelpImages)(
  'rejects the known help picture as a need on saved boards: %s',
  image => {
    for (const token of ['要', '需要', '想要', '需']) {
      expect(
        match(token, [
          { id: 'old-need', label: token, vocalization: token, image }
        ]).tile
      ).toBeNull();
    }
    expect(match('帮忙', [{ id: 'help', label: '帮忙', image }]).tile.id).toBe(
      'help'
    );
  }
);

test('reuses the existing want drawing in all three corrected need cards', () => {
  const tiles = boards.advanced
    .flatMap(board => board.tiles)
    .filter(tile => tile.labelKey === 'cboard.symbol.iNeed');
  expect(tiles).toHaveLength(3);
  expect(
    tiles.every(tile => tile.image === '/symbols/mulberry/want_,_to.svg')
  ).toBe(true);
  const state = buildReceiverLoopState('我要杯子', boards.advanced, { intl });
  expect(
    state.reviewItems.find(item => item.token === '要').tile.tile.image
  ).toBe('/symbols/mulberry/want_,_to.svg');
});

test.each([
  ['自己', '我', '/symbols/arasaac/picinterpreter-care/6632.png'],
  ['要', '要', '/symbols/mulberry/help_,_to.svg']
])(
  'old automatic backfill and drafts cannot restore %s → %s; explicit confirmation survives',
  (token, label, image) => {
    const board = [
      {
        id: 'old',
        tiles: [
          {
            id: 'old-image',
            label,
            vocalization: label,
            image,
            communicationSynonyms: token
          }
        ]
      }
    ];
    const catalog = buildCommunicationTileCatalog(board, intl);
    const record = { id: 'missing', normalizedToken: token, status: 'new' };
    expect(findSafeLocalMissingTokenResolutions([record], catalog)).toEqual([]);
    const resolved = {
      ...record,
      status: 'resolved',
      resolvedPictogramId: 'old-image'
    };
    expect(
      applyMissingTokenResolutions(
        [{ token, tile: null }],
        [resolved],
        catalog
      )[0].tile
    ).toBeNull();
    expect(
      applyMissingTokenResolutions(
        [{ token, tile: null }],
        [{ ...resolved, reviewedByCaregiver: true }],
        catalog
      )[0].tile.id
    ).toBe('old-image');
    const entry = {
      inputText: token,
      direction: 'receive',
      recordStatus: 'draft',
      output: [{ id: 'old-image', label, image }],
      pictogramSequence: [
        {
          originalToken: token,
          pictogramId: 'old-image',
          label,
          matchType: 'synonym'
        }
      ]
    };
    expect(
      restoreReceiverLoopState(entry, [], { intl }).reviewItems[0].tile
    ).toBeNull();
    expect(
      restoreReceiverLoopState(
        {
          ...entry,
          pictogramSequence: [
            {
              ...entry.pictogramSequence[0],
              matchType: 'manual',
              source: 'manual'
            }
          ]
        },
        [],
        { intl }
      ).reviewItems[0].tile
    ).not.toBeNull();
    expect(
      restoreReceiverLoopState({ ...entry, recordStatus: 'confirmed' }, [], {
        intl
      }).reviewItems[0].tile
    ).not.toBeNull();
  }
);

test('generic discomfort drawing preserves the current subject in text and speech', () => {
  for (const text of ['我不舒服', '你不舒服', '她不舒服']) {
    const state = buildReceiverLoopState(text, boards.advanced, { intl });
    expect(
      buildReceiverOutputPreview(state.reviewItems)
        .map(item => item.vocalization)
        .join('')
    ).toBe(text);
  }
});
