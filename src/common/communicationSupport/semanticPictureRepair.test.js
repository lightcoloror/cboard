import boardsFixture from '../../api/boards.json';
import zhMessages from '../../translations/zh-CN.communication';
import {
  matchTextToCommunicationTiles,
  buildCommunicationTileCatalog
} from './symbolMatching';
import { applyMissingTokenResolutions } from './missingTokens';
import {
  buildReceiverLoopState,
  buildReceiverOutputPreview
} from './receiverPipeline';

const intl = {
  messages: zhMessages,
  formatMessage: ({ id }) => zhMessages[id] || id
};
const options = { intl, allowPartial: false };
const legacyCan = {
  id: 'pi-core-can',
  label: '可以',
  vocalization: '可以',
  image: '/symbols/arasaac/picinterpreter-care/6544.png',
  pictogramOriginalId: '6544',
  communicationSynonyms: '能,能够'
};

test('fork keeps the cutlery sense separate from a branching road, including old boards', () => {
  const result = matchTextToCommunicationTiles(
    '路在前面分叉',
    boardsFixture.advanced,
    options
  );
  expect(result.matches.map(item => item.token).join('')).toBe('路在前面分叉');
  expect(result.matches.find(item => item.token === '分叉').tile).toBeNull();
  const cutlery = matchTextToCommunicationTiles(
    '餐叉',
    boardsFixture.advanced,
    { ...options, preSegmented: ['餐叉'] }
  );
  expect(cutlery.matches[0].tile.displayLabel).toBe('叉子');
  for (const label of ['叉子', '分叉']) {
    const old = [
      {
        id: 'old',
        tiles: [
          {
            id: 'old-fork',
            label,
            vocalization: label,
            image: '/symbols/mulberry/fork.svg',
            communicationSynonyms: '分叉'
          }
        ]
      }
    ];
    expect(
      matchTextToCommunicationTiles('分叉', old, {
        ...options,
        preSegmented: ['分叉']
      }).matches[0].tile
    ).toBeNull();
  }
  const personal = [
    {
      id: 'personal',
      tiles: [{ id: 'branch', label: '分叉', image: '/personal/branch.png' }]
    }
  ];
  expect(
    matchTextToCommunicationTiles('分叉', personal, {
      ...options,
      preSegmented: ['分叉']
    }).matches[0].tile
  ).not.toBeNull();
});

test('old permission-can card is rejected while the corrected noun is usable', () => {
  for (const token of ['可以', '能', '能够']) {
    const result = matchTextToCommunicationTiles(
      token,
      [{ id: 'legacy', tiles: [legacyCan] }],
      { ...options, preSegmented: [token] }
    );
    expect(result.matches[0].tile).toBeNull();
  }
  const result = matchTextToCommunicationTiles('罐头', boardsFixture.advanced, {
    ...options,
    preSegmented: ['罐头']
  });
  expect(result.matches[0].tile.tile.image).toContain('6544.png');
  expect(result.matches[0].tile.displayLabel).toBe('罐头');
});

test('offline automatic resolutions cannot reintroduce cached permission-can, explicit review remains manual', () => {
  const record = {
    id: 'cached-can',
    normalizedToken: '可以',
    status: 'resolved',
    resolvedPictogramId: 'arasaac_6544',
    resolvedPictogram: {
      id: 'arasaac_6544',
      label: '可以',
      image: '/offline/hash.png',
      source: {
        provider: 'arasaac',
        originalId: '6544',
        name: 'ARASAAC',
        license: 'CC BY-NC-SA 4.0',
        sourceUrl: 'https://arasaac.org/pictograms/zh/6544'
      }
    }
  };
  const item = { token: '可以', tile: null, matchType: 'none' };
  expect(applyMissingTokenResolutions([item], [record], [])[0].tile).toBeNull();
  expect(
    applyMissingTokenResolutions(
      [item],
      [{ ...record, reviewedByCaregiver: true }],
      []
    )[0].tile
  ).not.toBeNull();
});

test.each([
  ['喝水', '水'],
  ['饮水', '水'],
  ['喝茶', '茶'],
  ['吃药', '药'],
  ['服药', '药'],
  ['不开心', '伤心']
])('old synonyms do not turn %s into %s', (token, label) => {
  const old = [
    {
      id: 'old',
      tiles: [
        {
          id: 'old-tile',
          label,
          vocalization: label,
          image: '/old.png',
          communicationSynonyms: token
        }
      ]
    }
  ];
  const result = matchTextToCommunicationTiles(token, old, {
    ...options,
    preSegmented: [token]
  });
  expect(result.matches[0].tile).toBeNull();
  const correct = [
    {
      id: 'correct',
      tiles: [
        {
          id: 'correct-tile',
          label: token,
          vocalization: token,
          image: '/personal-reviewed.png'
        }
      ]
    }
  ];
  expect(
    matchTextToCommunicationTiles(token, correct, {
      ...options,
      preSegmented: [token]
    }).matches[0].tile
  ).not.toBeNull();
});

test('drinking uses the existing action drawing instead of the beverage object', () => {
  const result = matchTextToCommunicationTiles(
    '喝',
    boardsFixture.advanced,
    options
  );
  expect(result.matches[0].tile.tile.image).toBe(
    '/symbols/mulberry/drink_,_to.svg'
  );
});

test('receiver labels and speech retain the current person rather than first-person quick-card captions', () => {
  const state = buildReceiverLoopState(
    '你不舒服',
    boardsFixture.advanced,
    options
  );
  expect(
    buildReceiverOutputPreview(state.reviewItems)
      .map(i => i.vocalization)
      .join('')
  ).toBe('你不舒服');
  expect(
    buildReceiverOutputPreview(state.reviewItems).some(
      i => i.label === '我不舒服'
    )
  ).toBe(false);
  const catalog = buildCommunicationTileCatalog(boardsFixture.advanced, intl);
  expect(
    catalog.find(c => c.id === 'pi-home-uncomfortable').tile.vocalization
  ).toBe('我不舒服');
});
