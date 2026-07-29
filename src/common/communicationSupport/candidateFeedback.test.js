import {
  CANDIDATE_FEEDBACK,
  buildExpressionCandidateFeedbackDraft,
  findExpressionCandidateFeedbackDraft,
  normalizeExpressionCandidateFeedbackDraft,
  normalizeExpressionCandidates,
  toggleExpressionCandidateFeedback
} from './candidateFeedback';

describe('candidate feedback contract', () => {
  test('normalizes legacy sentences and toggles or replaces feedback', () => {
    const initial = normalizeExpressionCandidates(
      [],
      ['我要喝水。', '请给我水。']
    );
    const liked = toggleExpressionCandidateFeedback(
      initial,
      0,
      CANDIDATE_FEEDBACK.up
    );
    const replaced = toggleExpressionCandidateFeedback(
      liked,
      0,
      CANDIDATE_FEEDBACK.down
    );
    const cancelled = toggleExpressionCandidateFeedback(
      replaced,
      0,
      CANDIDATE_FEEDBACK.down
    );

    expect(initial).toEqual([
      { sentence: '我要喝水。', feedback: null },
      { sentence: '请给我水。', feedback: null }
    ]);
    expect(liked[0].feedback).toBe('up');
    expect(replaced[0].feedback).toBe('down');
    expect(cancelled[0].feedback).toBeNull();
  });

  test('builds only a traceable draft containing actual feedback', () => {
    const draft = buildExpressionCandidateFeedbackDraft(
      {
        sessionId: 'session-1',
        outputSignature: 'output-1',
        candidates: [
          { sentence: '我要喝水。', feedback: 'up' },
          { sentence: '请给我水。', feedback: null }
        ]
      },
      {
        now: () => 100,
        createId: () => 'feedback-1'
      }
    );

    expect(draft).toEqual({
      contractVersion: 1,
      id: 'feedback-1',
      sessionId: 'session-1',
      outputSignature: 'output-1',
      candidates: [
        { sentence: '我要喝水。', feedback: 'up' },
        { sentence: '请给我水。', feedback: null }
      ],
      createdAt: 100,
      updatedAt: 100
    });
    expect(
      normalizeExpressionCandidateFeedbackDraft({
        ...draft,
        candidates: [{ sentence: '我要喝水。', feedback: null }]
      })
    ).toBeNull();
  });

  test('restores the newest matching draft and aligns feedback by sentence', () => {
    const drafts = [
      {
        contractVersion: 1,
        id: 'older',
        sessionId: 'session-1',
        outputSignature: 'output-1',
        candidates: [{ sentence: '我要喝水。', feedback: 'down' }],
        createdAt: 10,
        updatedAt: 20
      },
      {
        contractVersion: 1,
        id: 'newer',
        sessionId: 'session-1',
        outputSignature: 'output-1',
        candidates: [
          { sentence: '请给我水。', feedback: 'down' },
          { sentence: '我要喝水。', feedback: 'up' }
        ],
        createdAt: 10,
        updatedAt: 30
      },
      {
        contractVersion: 1,
        id: 'other-session',
        sessionId: 'session-2',
        outputSignature: 'output-1',
        candidates: [{ sentence: '我要喝水。', feedback: 'down' }],
        createdAt: 10,
        updatedAt: 40
      }
    ];

    expect(
      findExpressionCandidateFeedbackDraft(drafts, {
        sessionId: 'session-1',
        outputSignature: 'output-1',
        candidateSentences: ['我要喝水。', '新的候选句。']
      })
    ).toEqual(
      expect.objectContaining({
        id: 'newer',
        candidates: [
          { sentence: '我要喝水。', feedback: 'up' },
          { sentence: '新的候选句。', feedback: null }
        ]
      })
    );
  });

  test('does not restore a stale draft when no current candidate matches', () => {
    expect(
      findExpressionCandidateFeedbackDraft(
        [
          {
            contractVersion: 1,
            id: 'draft-1',
            sessionId: 'session-1',
            outputSignature: 'output-1',
            candidates: [{ sentence: '旧候选句。', feedback: 'up' }],
            createdAt: 10,
            updatedAt: 20
          }
        ],
        {
          sessionId: 'session-1',
          outputSignature: 'output-1',
          candidateSentences: ['新候选句。']
        }
      )
    ).toBeNull();
  });
});
