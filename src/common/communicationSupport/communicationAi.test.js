import {
  MAX_COMMUNICATION_AI_LABELS,
  MAX_COMMUNICATION_AI_VOCABULARY,
  applyCommunicationAiResegmentation,
  applyCommunicationAiSentenceResponse,
  buildCommunicationAiResegmentRequest,
  buildCommunicationAiSentenceRequest
} from './communicationAi';
import {
  normalizeResegmentResponse,
  validateResegmentSource
} from './resegmentationContract';
import { buildExpressionLoopState } from './expressionPipeline';
import {
  buildReceiverLoopState,
  buildReceiverHistoryEntry,
  replaceReceiverReviewItem,
  retainReceiverReviewItemAsText,
  restoreReceiverLoopState
} from './receiverPipeline';

function createBoards() {
  return [
    {
      id: 'core',
      name: '核心',
      tiles: [
        { id: 'want', label: '想', image: '/want.png' },
        { id: 'drink', label: '喝', image: '/drink.png' },
        { id: 'water', label: '水', image: '/water.png' }
      ]
    }
  ];
}

describe('communicationAi contract', () => {
  test('keeps occurrence-specific manual pictures and text through AI adoption and offline restore', () => {
    const text = '🙂水水';
    const boards = createBoards();
    const local = buildReceiverLoopState(text, boards, {
      preSegmented: ['🙂', '水', '水'],
      preserveSegments: true
    });
    const selected = {
      id: 'personal-water',
      displayLabel: '我的水杯',
      tile: {
        id: 'personal-water',
        label: '我的水杯',
        image: '/cached/personal-water.png'
      }
    };
    let items = retainReceiverReviewItemAsText(
      local.reviewItems,
      local.reviewItems[0].id
    );
    items = replaceReceiverReviewItem(items, items[1].id, selected);
    items = retainReceiverReviewItemAsText(items, items[2].id);
    const result = applyCommunicationAiResegmentation({
      text,
      boards,
      currentReviewItems: items,
      response: { tokens: ['🙂', '水', '水'] }
    });
    expect(result.requiresConfirmation).toBe(true);
    expect(result.reviewItems[0].tile.textOnly).toBe(true);
    expect(result.reviewItems[1].tile).toBe(selected);
    expect(result.reviewItems[1]).toMatchObject({
      matchType: 'manual',
      source: 'corrected'
    });
    expect(result.reviewItems[2].tile.textOnly).toBe(true);
    expect(result.quality).toMatchObject({
      imageCount: 1,
      textOnlyCount: 2,
      missingCount: 0
    });
    const entry = JSON.parse(
      JSON.stringify(buildReceiverHistoryEntry(text, result.reviewItems))
    );
    const restored = restoreReceiverLoopState(
      { ...entry, recordStatus: 'draft' },
      []
    );
    expect(restored.reviewItems[1].tile.tile.image).toBe(
      '/cached/personal-water.png'
    );
    expect(restored.reviewItems[2].tile.textOnly).toBe(true);
    expect(restored.reviewItems.map(item => item.token).join('')).toBe(text);
  });

  test('keeps confirmed backfill provenance instead of relabeling pictures as AI matches', () => {
    const local = buildReceiverLoopState('水', createBoards());
    const current = [
      { ...local.reviewItems[0], matchType: 'online', source: 'opensymbols' }
    ];
    const result = applyCommunicationAiResegmentation({
      text: '水',
      boards: createBoards(),
      currentReviewItems: current,
      response: { tokens: ['水'] }
    });
    expect(result.reviewItems[0]).toMatchObject({
      matchType: 'online',
      source: 'opensymbols'
    });
    const fresh = applyCommunicationAiResegmentation({
      text: '水',
      boards: createBoards(),
      currentReviewItems: [],
      response: { tokens: ['水'] }
    });
    expect(fresh.reviewItems[0].matchType).toBe('exact');
  });

  test('does not move a manual choice onto a split token or a changed source', () => {
    const boards = createBoards();
    const current = buildReceiverLoopState('喝水', boards, {
      preSegmented: ['喝水'],
      preserveSegments: true
    });
    const selected = {
      id: 'personal-action',
      displayLabel: '我的动作',
      tile: {
        id: 'personal-action',
        label: '我的动作',
        image: '/cached/action.png'
      }
    };
    const items = replaceReceiverReviewItem(
      current.reviewItems,
      current.reviewItems[0].id,
      selected
    );
    const split = applyCommunicationAiResegmentation({
      text: '喝水',
      boards,
      currentReviewItems: items,
      response: { tokens: ['喝', '水'] }
    });
    expect(split.reviewItems.every(item => item.tile !== selected)).toBe(true);
    const changed = applyCommunicationAiResegmentation({
      text: '喝水水',
      boards,
      currentReviewItems: items,
      response: { tokens: ['喝水', '水'] }
    });
    expect(changed.reviewItems.every(item => item.tile !== selected)).toBe(
      true
    );
  });

  test('builds a bounded current-request payload without previous conversations or feedback', () => {
    const output = Array.from({ length: 20 }, (_, index) => ({
      id: String(index),
      label: `词${index}`
    }));
    const request = buildCommunicationAiSentenceRequest({
      output,
      candidateCount: 99,
      context: {
        scene: 'rehab_clinic',
        turns: [
          {
            direction: 'express',
            text: '上一句',
            candidateFeedback: [
              { sentence: '符合意图', feedback: 'up' },
              { sentence: '不符合意图', feedback: 'down' },
              { sentence: '未评价', feedback: null }
            ]
          },
          {
            direction: 'receive',
            inputText: '未确认草稿',
            recordStatus: 'draft'
          }
        ]
      }
    });

    expect(request.pictogramLabels).toHaveLength(MAX_COMMUNICATION_AI_LABELS);
    expect(request.candidateCount).toBe(5);
    expect(request.context.recentSentences).toEqual([]);
    expect(request.context.candidateFeedback).toEqual([]);
    expect(request.context.scene).toBe('rehab_clinic');
    expect(
      buildCommunicationAiSentenceRequest({
        output,
        context: { scene: 'untrusted-location' }
      }).context.scene
    ).toBeUndefined();
  });

  test('keeps the local candidates when the online response is empty', () => {
    const localState = buildExpressionLoopState([{ id: 'water', label: '水' }]);

    expect(applyCommunicationAiSentenceResponse(localState, {})).toBe(
      localState
    );
    expect(
      applyCommunicationAiSentenceResponse(localState, {
        candidates: [' 我想喝水。 ', '我想喝水。'],
        provider: 'test-ai'
      })
    ).toEqual(
      expect.objectContaining({
        candidateSentences: ['我想喝水。', '水。', '我水。'],
        candidateProvider: 'test-ai',
        isOfflineFallback: false,
        selectedIndex: 0
      })
    );
  });

  test('requests three choices and keeps the first three distinct AI alternatives', () => {
    const output = [{ id: 'drink', label: '喝水' }];
    expect(buildCommunicationAiSentenceRequest({ output }).candidateCount).toBe(
      3
    );
    const state = applyCommunicationAiSentenceResponse(
      buildExpressionLoopState(output),
      {
        candidates: [
          '我要喝水。',
          '请给我水。',
          '我要喝水。',
          '我想喝水。',
          '请递给我水。'
        ]
      }
    );
    expect(state.candidateSentences).toEqual([
      '我要喝水。',
      '请给我水。',
      '我想喝水。'
    ]);
  });

  test('limits resegmentation to missing tokens and a bounded local vocabulary', () => {
    const boards = createBoards();
    const review = buildReceiverLoopState('想喝火星水', boards, {
      preSegmented: ['想', '喝', '火星', '水']
    });
    const request = buildCommunicationAiResegmentRequest({
      text: '想喝火星水',
      reviewItems: review.reviewItems,
      boards
    });

    expect(request.unmatchedTokens).toEqual(['火星']);
    expect(request.pictogramVocabulary.length).toBeLessThanOrEqual(
      MAX_COMMUNICATION_AI_VOCABULARY
    );
    expect(request.pictogramVocabulary).toEqual(
      expect.arrayContaining(['想', '喝', '水'])
    );
  });

  test('keeps unknown source words even when filtering them would improve match rate', () => {
    const boards = createBoards();
    const current = buildReceiverLoopState('想喝火星水', boards, {
      preSegmented: ['想', '喝', '火星', '水']
    });
    const applied = applyCommunicationAiResegmentation({
      currentReviewItems: current.reviewItems,
      response: {
        tokens: ['想', '喝', '火星', '水'],
        provider: 'test-ai'
      },
      text: '想喝火星水',
      boards
    });
    const rejected = applyCommunicationAiResegmentation({
      currentReviewItems: current.reviewItems,
      response: { tokens: ['不存在'] },
      text: '想喝火星水',
      boards
    });

    expect(applied.applied).toBe(true);
    expect(applied.reviewItems.map(item => item.token)).toEqual([
      '想',
      '喝',
      '火星',
      '水'
    ]);
    expect(applied.reviewItems.find(item => item.token === '火星').tile).toBe(
      null
    );
    expect(rejected.applied).toBe(false);
    expect(rejected.reviewItems).toBe(current.reviewItems);
  });

  test.each([
    ['别打针', ['打针']],
    ['喝水喝水', ['喝水']],
    ['我不是不想吃饭', ['我', '吃饭']],
    ['先吃药再喝水', ['先', '喝水', '再', '吃药']],
    ['喝水？', ['喝水']]
  ])(
    'rejects lossy output for %s and leaves the editable state untouched',
    (text, tokens) => {
      const current = buildReceiverLoopState(text, createBoards());
      const result = applyCommunicationAiResegmentation({
        text,
        response: { tokens },
        boards: createBoards(),
        currentReviewItems: current.reviewItems
      });
      expect(result.applied).toBe(false);
      expect(result.reviewItems).toBe(current.reviewItems);
    }
  );

  test('retains repeated occurrences and disables unsafe substring image matches', () => {
    const text = '喝水喝水开心果';
    const boards = [
      {
        id: 'test',
        tiles: [
          { id: 'water', label: '喝水', image: '/water.png' },
          { id: 'happy', label: '开心', image: '/happy.png' }
        ]
      }
    ];
    const result = applyCommunicationAiResegmentation({
      text,
      response: { tokens: ['喝水', '喝水', '开心果'] },
      boards,
      currentReviewItems: []
    });
    expect(result.applied).toBe(true);
    expect(result.reviewItems.map(item => item.token)).toEqual([
      '喝水',
      '喝水',
      '开心果'
    ]);
    expect(result.reviewItems[2].tile).toBe(null);
    expect(result.requiresConfirmation).toBe(true);
  });

  test('validates source identity, Unicode spans and supported response versions', () => {
    const text = '🙂喝水 喝水？';
    const normalized = normalizeResegmentResponse(text, {
      tokens: ['🙂', '喝水', ' ', '喝水', '？']
    });
    expect(normalized.segments[0]).toEqual({ start: 0, end: 1, surface: '🙂' });
    expect(normalizeResegmentResponse(text, normalized)).toEqual(normalized);
    expect(
      normalizeResegmentResponse(text, {
        ...normalized,
        sourceText: '另一个原文'
      })
    ).toBe(null);
    expect(
      normalizeResegmentResponse(text, { ...normalized, contractVersion: 99 })
    ).toBe(null);
    expect(
      normalizeResegmentResponse(text, {
        ...normalized,
        segments: [{ start: 0, end: 2, surface: '🙂' }]
      })
    ).toBe(null);
    expect(
      normalizeResegmentResponse('🙂', { tokens: ['\ud83d', '\ude42'] })
    ).toBe(null);
    expect(validateResegmentSource('水'.repeat(121))).toBe(false);
    expect(
      buildCommunicationAiResegmentRequest({
        text: '水'.repeat(121),
        boards: []
      }).text
    ).toHaveLength(121);
  });
});
