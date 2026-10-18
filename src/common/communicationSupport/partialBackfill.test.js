import {
  buildCommunicationTileCatalog,
  matchTextToCommunicationTiles
} from './symbolMatching';
import {
  applyMissingTokenResolutions,
  findSafeLocalMissingTokenResolutions
} from './missingTokens';
import {
  buildReceiverLoopState,
  restoreReceiverLoopState
} from './receiverPipeline';
import { createCommunicationRepository } from './repository';

const boardFor = label => [
  { id: 'synthetic', tiles: [{ id: 'generic', label, image: '/generic.png' }] }
];
const candidate = {
  id: 'opensymbols-grapefruit',
  label: '葡萄柚',
  image: 'data:image/png;base64,aGVsbG8=',
  source: {
    provider: 'opensymbols',
    originalId: 'grapefruit',
    name: 'OpenSymbols',
    license: 'CC BY-SA',
    sourceUrl: 'https://example.test/grapefruit'
  }
};

test.each([
  ['葡萄柚', '葡萄'],
  ['葡萄干', '葡萄'],
  ['苹果醋', '苹果'],
  ['菠萝蜜', '菠萝'],
  ['胡萝卜汁', '胡萝卜'],
  ['西红柿酱', '西红柿'],
  ['花生油', '花生'],
  ['花生酱', '花生'],
  ['牛肉面', '牛肉'],
  ['牛肉丸', '牛肉'],
  ['鸡蛋糕', '蛋糕'],
  ['蛋糕卷', '蛋糕'],
  ['洗手液', '洗手'],
  ['自行车道', '自行车'],
  ['牙刷架', '牙刷'],
  ['牙膏盒', '牙膏'],
  ['手机壳', '手机'],
  ['游泳池', '游泳'],
  ['开心果', '开心'],
  ['开心果', '水果'],
  ['洗手液', '肥皂块']
])(
  '%s does not adopt a substring picture %s or suppress backfill',
  (token, label) => {
    const boards = boardFor(label);
    const result = buildReceiverLoopState(token, boards, {
      preSegmented: [token]
    });
    expect(result.missingTokens).toEqual([token]);
    expect(result.outputPreview).toEqual([]);
    expect(result.reviewItems[0].tile).toBeNull();
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
    try {
      for (const fallback of [false, true]) {
        if (fallback)
          Object.defineProperty(Intl, 'Segmenter', {
            configurable: true,
            value: undefined
          });
        const natural = buildReceiverLoopState(token, boards);
        expect(natural.reviewItems.map(item => item.token)).toEqual([token]);
        expect(natural.missingTokens).toEqual([token]);
      }
    } finally {
      if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor);
      else delete Intl.Segmenter;
    }
    expect(
      findSafeLocalMissingTokenResolutions(
        [{ id: 'gap', normalizedToken: token, status: 'new' }],
        buildCommunicationTileCatalog(boards)
      )
    ).toEqual([]);
    const exact = buildReceiverLoopState(token, boardFor(token), {
      preSegmented: [token]
    });
    expect(exact.reviewItems[0].matchType).toBe('exact');
    expect(exact.missingTokens).toEqual([]);
  }
);

test('keeps explicit synonym reuse while containment remains an opt-in retrieval hint', () => {
  const boards = boardFor('葡萄');
  expect(
    matchTextToCommunicationTiles('葡萄柚', boards, {
      preSegmented: ['葡萄柚'],
      allowPartial: true
    }).matches[0].matchType
  ).toBe('partial');
  const synonyms = [
    {
      id: 'b',
      tiles: [
        {
          id: 'help',
          label: '请帮忙',
          communicationSynonyms: '帮帮忙',
          image: '/help.png'
        }
      ]
    }
  ];
  expect(
    buildReceiverLoopState('帮帮忙', synonyms, { preSegmented: ['帮帮忙'] })
      .missingTokens
  ).toEqual([]);
});

test('confirmed cached image replaces a legacy partial guess, but never an exact, manual or text choice', () => {
  const repo = createCommunicationRepository({ storage: localStorage });
  localStorage.clear();
  const [record] = repo.recordMissingTokens({
    tokens: ['葡萄柚'],
    rawText: '葡萄柚'
  });
  repo.reviewMissingToken(record.id, {
    status: 'suggested',
    suggestedPictogram: candidate,
    source: 'online'
  });
  const legacy = {
    token: '葡萄柚',
    matchType: 'partial',
    tile: buildCommunicationTileCatalog(boardFor('葡萄'))[0]
  };
  expect(
    applyMissingTokenResolutions([legacy], repo.loadMissingTokens(), [])[0]
  ).toBe(legacy);
  repo.reviewMissingToken(record.id, {
    status: 'resolved',
    resolvedPictogram: candidate,
    resolvedPictogramId: candidate.id,
    source: 'online',
    reviewedByCaregiver: true
  });
  const saved = createCommunicationRepository({
    storage: localStorage
  }).loadMissingTokens();
  const adopted = applyMissingTokenResolutions([legacy], saved, [])[0];
  expect(adopted.tile.id).toBe(candidate.id);
  expect(adopted.tile.tile.vocalization).toBe('葡萄柚');
  expect(adopted.tile.tile.image).toBe(candidate.image);
  for (const item of [
    { ...legacy, matchType: 'manual' },
    { ...legacy, matchType: 'exact' },
    { ...legacy, source: 'manual' },
    { ...legacy, source: 'corrected' },
    { ...legacy, tile: { ...legacy.tile, textOnly: true } }
  ])
    expect(applyMissingTokenResolutions([item], saved, [])[0]).toBe(item);
  expect(
    buildReceiverLoopState('葡萄柚', boardFor('葡萄'), {
      preSegmented: ['葡萄柚'],
      missingTokenRecords: saved
    }).missingTokens
  ).toEqual([]);
  localStorage.clear();
});

test('reopens old partial drafts for backfill while preserving explicit choices and completed history', () => {
  const entry = {
    direction: 'receive',
    recordStatus: 'draft',
    inputText: '葡萄柚',
    output: [{ id: 'generic', label: '葡萄', image: '/generic.png' }],
    pictogramSequence: [
      {
        pictogramId: 'generic',
        label: '葡萄',
        originalToken: '葡萄柚',
        matchType: 'partial'
      }
    ]
  };
  expect(
    restoreReceiverLoopState(entry, boardFor('葡萄')).missingTokens
  ).toEqual(['葡萄柚']);
  expect(
    restoreReceiverLoopState(
      { ...entry, recordStatus: 'confirmed' },
      boardFor('葡萄')
    ).reviewItems[0].tile
  ).not.toBeNull();
  expect(
    restoreReceiverLoopState(
      {
        ...entry,
        pictogramSequence: [
          { ...entry.pictogramSequence[0], matchType: 'manual' }
        ]
      },
      boardFor('葡萄')
    ).reviewItems[0].tile
  ).not.toBeNull();
});
