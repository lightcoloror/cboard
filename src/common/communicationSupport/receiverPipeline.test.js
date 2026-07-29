import {
  buildReceiverHistoryEntry,
  buildReceiverLoopState,
  buildReceiverMatchQuality,
  buildReceiverOutputPreview,
  deleteReceiverReviewItem,
  insertReceiverReviewItem,
  moveReceiverReviewItem,
  replaceReceiverReviewItem,
  restoreReceiverLoopState
} from './receiverPipeline';

const boards = [
  {
    id: 'home',
    name: '首页',
    tiles: [
      {
        id: 'want',
        label: '想',
        image: '/want.png'
      },
      {
        id: 'water',
        label: '水',
        image: '/water.png'
      },
      {
        id: 'drink',
        label: '饮料',
        image: '/drink.png',
        communicationSynonyms: '喝的'
      }
    ]
  }
];

describe('receiverPipeline', () => {
  test('builds a pure text-token-image review state', () => {
    const result = buildReceiverLoopState('我想喝水', boards, {
      preSegmented: ['想', '水'],
      createId: () => 'review-fixed'
    });

    expect(result.segmentation.segments).toEqual(['想', '水']);
    expect(result.reviewItems).toEqual([
      expect.objectContaining({
        id: 'review-fixed',
        token: '想',
        matchType: 'exact'
      }),
      expect.objectContaining({
        id: 'review-fixed',
        token: '水',
        matchType: 'exact'
      })
    ]);
    expect(result.outputPreview).toEqual([
      expect.objectContaining({ id: 'want', label: '想' }),
      expect.objectContaining({ id: 'water', label: '水' })
    ]);
  });

  test('supports review item move, replace, delete, and history output', () => {
    const state = buildReceiverLoopState('我想喝水', boards, {
      preSegmented: ['想', '水'],
      createId: (() => {
        let index = 0;
        return () => 'review-' + index++;
      })()
    });

    const moved = moveReceiverReviewItem(state.reviewItems, 'review-0', 1);
    expect(moved.map(item => item.token)).toEqual(['水', '想']);

    const replaced = replaceReceiverReviewItem(moved, 'review-1', {
      id: 'drink',
      boardId: 'home',
      boardName: '首页',
      labels: ['饮料'],
      synonyms: ['喝的'],
      tile: {
        id: 'drink',
        label: '饮料',
        image: '/drink.png'
      }
    });
    expect(replaced[0]).toEqual(
      expect.objectContaining({
        matchType: 'manual',
        source: 'corrected',
        tile: expect.objectContaining({
          tile: expect.objectContaining({ label: '饮料' })
        })
      })
    );

    const trimmed = deleteReceiverReviewItem(replaced, 'review-0');
    expect(trimmed.map(item => item.token)).toEqual(['水']);

    const historyEntry = buildReceiverHistoryEntry('我想喝水', replaced);
    expect(historyEntry).toEqual(
      expect.objectContaining({
        contractVersion: 2,
        direction: 'receive',
        inputText: '我想喝水',
        labels: ['饮料', '想'],
        output: expect.any(Array),
        pictogramSequence: [
          expect.objectContaining({
            pictogramId: 'drink',
            label: '饮料',
            source: 'corrected',
            matchType: 'manual',
            confidence: 1,
            originalToken: '水'
          }),
          expect.objectContaining({
            pictogramId: 'want',
            label: '想',
            matchType: 'exact',
            confidence: 1,
            originalToken: '想'
          })
        ]
      })
    );
  });

  test('restores manual order, missing tokens, and saved runtime images', () => {
    let id = 0;
    const restored = restoreReceiverLoopState(
      {
        direction: 'receive',
        recordStatus: 'draft',
        inputText: '水头晕妈妈',
        output: [
          {
            id: 'water',
            image: '/water.png',
            label: '水',
            vocalization: '水'
          },
          {
            id: 'family-photo',
            image: 'wxfile://family-photo.png',
            label: '妈妈',
            vocalization: '妈妈'
          }
        ],
        pictogramSequence: [
          {
            pictogramId: 'water',
            label: '水',
            source: 'corrected',
            matchType: 'manual',
            originalToken: '水'
          },
          {
            pictogramId: null,
            label: '头晕',
            source: 'unresolved',
            matchType: 'none',
            originalToken: '头晕'
          },
          {
            pictogramId: 'family-photo',
            label: '妈妈',
            source: 'online',
            matchType: 'online',
            originalToken: '妈妈'
          }
        ]
      },
      boards,
      { createId: () => `restored-${id++}` }
    );

    expect(restored).toEqual(
      expect.objectContaining({
        inputText: '水头晕妈妈',
        missingTokens: ['头晕'],
        matchRate: 2 / 3
      })
    );
    expect(restored.reviewItems.map(item => item.token)).toEqual([
      '水',
      '头晕',
      '妈妈'
    ]);
    expect(restored.reviewItems[0]).toEqual(
      expect.objectContaining({
        id: 'restored-0',
        source: 'corrected',
        tile: expect.objectContaining({ id: 'water' })
      })
    );
    expect(restored.reviewItems[1].tile).toBeNull();
    expect(restored.reviewItems[2]).toEqual(
      expect.objectContaining({
        id: 'restored-2',
        source: 'online',
        tile: expect.objectContaining({
          tile: expect.objectContaining({
            image: 'wxfile://family-photo.png'
          })
        })
      })
    );
    expect(restored.outputPreview).toHaveLength(2);
  });

  test('inserts a manually selected pictogram after the chosen item', () => {
    const state = buildReceiverLoopState('想水', boards, {
      preSegmented: ['想', '水'],
      createId: (() => {
        let index = 0;
        return () => 'review-' + index++;
      })()
    });
    const candidate = {
      id: 'drink',
      boardId: 'home',
      boardName: '首页',
      displayLabel: '饮料',
      labels: ['饮料'],
      synonyms: ['喝的'],
      tile: {
        id: 'drink',
        label: '饮料',
        image: '/drink.png'
      }
    };

    const inserted = insertReceiverReviewItem(
      state.reviewItems,
      'review-0',
      candidate,
      { itemId: 'review-inserted' }
    );
    const historyEntry = buildReceiverHistoryEntry('想水', inserted);

    expect(inserted.map(item => item.token)).toEqual(['想', '饮料', '水']);
    expect(inserted[1]).toEqual(
      expect.objectContaining({
        id: 'review-inserted',
        matchType: 'manual',
        source: 'manual'
      })
    );
    expect(historyEntry.pictogramSequence[1]).toEqual(
      expect.objectContaining({
        pictogramId: 'drink',
        label: '饮料',
        source: 'manual'
      })
    );
  });

  test('reports unresolved and partial matches as needing caregiver review', () => {
    const quality = buildReceiverMatchQuality([
      { tile: { id: 'exact' }, matchType: 'exact' },
      { tile: { id: 'partial' }, matchType: 'partial' },
      { tile: null, matchType: 'none' }
    ]);

    expect(quality).toEqual({
      totalCount: 3,
      matchedCount: 2,
      missingCount: 1,
      partialCount: 1,
      matchRate: 2 / 3,
      needsReview: true
    });

    expect(
      buildReceiverMatchQuality([{ tile: { id: 'exact' }, matchType: 'exact' }])
        .needsReview
    ).toBe(false);
  });

  test('ignores invalid review items when building confirmed history', () => {
    expect(buildReceiverHistoryEntry('空值保护', [null, undefined])).toEqual(
      expect.objectContaining({
        labels: [],
        output: [],
        pictogramSequence: []
      })
    );
  });

  test('uses a caregiver-resolved pictogram for a previously missing token', () => {
    const result = buildReceiverLoopState('头晕', boards, {
      preSegmented: ['头晕'],
      createId: () => 'review-dizzy',
      missingTokenRecords: [
        {
          normalizedToken: '头晕',
          status: 'resolved',
          resolvedPictogramId: 'water'
        }
      ]
    });

    expect(result.reviewItems).toEqual([
      expect.objectContaining({
        token: '头晕',
        matchType: 'manual',
        tile: expect.objectContaining({
          tile: expect.objectContaining({ id: 'water', label: '水' })
        })
      })
    ]);
    expect(result.missingTokens).toEqual([]);
    expect(result.outputPreview).toEqual([
      expect.objectContaining({ id: 'water', label: '水' })
    ]);
    expect(result.matchRate).toBe(1);
  });

  test('preserves OpenSymbols attribution in output and confirmed history', () => {
    const attribution = {
      provider: 'opensymbols',
      originalId: 'mulberry:rehab',
      name: 'OpenSymbols / mulberry',
      license: 'CC BY-SA 2.0 UK',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/uk/',
      author: 'Mulberry Symbols',
      authorUrl: 'https://mulberrysymbols.org/',
      sourceUrl: 'https://www.opensymbols.org/symbols/mulberry/rehab',
      repoKey: 'mulberry'
    };
    const reviewItems = [
      {
        id: 'review-online',
        token: '康复训练图',
        matchType: 'online',
        tile: {
          id: 'runtime:opensymbols:rehab',
          displayLabel: '康复训练',
          pictogramAttribution: attribution,
          tile: {
            id: 'runtime:opensymbols:rehab',
            label: '康复训练',
            vocalization: '康复训练',
            image: '/cached/rehab.png',
            pictogramAttribution: attribution
          }
        }
      }
    ];

    expect(buildReceiverOutputPreview(reviewItems)[0].attribution).toEqual(
      attribution
    );
    expect(
      buildReceiverHistoryEntry('康复训练图', reviewItems).pictogramSequence[0]
    ).toEqual(
      expect.objectContaining({
        source: 'opensymbols',
        attribution
      })
    );
  });

  test('preserves short-video media in preview and confirmed history', () => {
    const reviewItems = [
      {
        id: 'review-video',
        token: '喝水',
        matchType: 'manual',
        tile: {
          id: 'drink-video',
          displayLabel: '喝水动作',
          tile: {
            id: 'drink-video',
            label: '喝水动作',
            vocalization: '喝水',
            image: '/saved/drink-poster.jpg',
            mediaType: 'video',
            video: '/saved/drink.mp4'
          }
        }
      }
    ];

    expect(buildReceiverOutputPreview(reviewItems)[0]).toEqual(
      expect.objectContaining({
        mediaType: 'video',
        video: '/saved/drink.mp4'
      })
    );
    expect(buildReceiverHistoryEntry('喝水', reviewItems).output[0]).toEqual(
      expect.objectContaining({
        image: '/saved/drink-poster.jpg',
        mediaType: 'video',
        video: '/saved/drink.mp4'
      })
    );
  });
});
