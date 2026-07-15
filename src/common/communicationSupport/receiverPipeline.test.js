import {
  buildReceiverHistoryEntry,
  buildReceiverLoopState,
  buildReceiverMatchQuality,
  deleteReceiverReviewItem,
  moveReceiverReviewItem,
  replaceReceiverReviewItem
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
        contractVersion: 1,
        direction: 'receive',
        inputText: '我想喝水',
        labels: ['饮料', '想'],
        output: expect.any(Array),
        pictogramSequence: [
          expect.objectContaining({
            pictogramId: 'drink',
            label: '饮料',
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
});
