import {
  MAX_COMMUNICATION_AI_LABELS,
  MAX_COMMUNICATION_AI_VOCABULARY,
  applyCommunicationAiResegmentation,
  applyCommunicationAiSentenceResponse,
  buildCommunicationAiResegmentRequest,
  buildCommunicationAiSentenceRequest
} from './communicationAi';
import { buildExpressionLoopState } from './expressionPipeline';
import { buildReceiverLoopState } from './receiverPipeline';

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
  test('builds a bounded request and excludes receiver drafts from context', () => {
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
    expect(request.context.recentSentences).toEqual(['上一句']);
    expect(request.context.candidateFeedback).toEqual([
      { sentence: '符合意图', feedback: 'up' },
      { sentence: '不符合意图', feedback: 'down' }
    ]);
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
        candidateSentences: ['我想喝水。'],
        candidateProvider: 'test-ai',
        isOfflineFallback: false,
        selectedIndex: 0
      })
    );
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

  test('accepts only a non-worse AI resegmentation result', () => {
    const boards = createBoards();
    const current = buildReceiverLoopState('想喝火星水', boards, {
      preSegmented: ['想', '喝', '火星', '水']
    });
    const applied = applyCommunicationAiResegmentation({
      currentReviewItems: current.reviewItems,
      response: {
        tokens: ['想', '喝', '水'],
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
    expect(applied.reviewItems.every(item => item.matchType === 'ai')).toBe(
      true
    );
    expect(rejected.applied).toBe(false);
    expect(rejected.reviewItems).toBe(current.reviewItems);
  });
});
