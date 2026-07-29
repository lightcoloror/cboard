import {
  COMMUNICATION_STORAGE_KEYS,
  createCommunicationRepository
} from './repository';

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

describe('candidate feedback repository', () => {
  test('persists, updates and removes an expression feedback draft', () => {
    const storage = createMemoryStorage();
    let timestamp = 100;
    const repository = createCommunicationRepository({
      storage,
      now: () => timestamp,
      createId: prefix => `${prefix}-1`
    });
    const saved = repository.saveExpressionCandidateFeedbackDraft({
      outputSignature: 'output-1',
      candidates: [
        { sentence: '我要喝水。', feedback: 'up' },
        { sentence: '请给我水。', feedback: null }
      ]
    });

    expect(saved).toEqual(
      expect.objectContaining({
        id: 'expression-feedback-1',
        sessionId: 'session-1',
        outputSignature: 'output-1'
      })
    );
    expect(repository.loadExpressionCandidateFeedbackDrafts()).toEqual([saved]);

    timestamp = 200;
    const updated = repository.saveExpressionCandidateFeedbackDraft({
      ...saved,
      candidates: [
        { sentence: '我要喝水。', feedback: 'down' },
        { sentence: '请给我水。', feedback: null }
      ]
    });
    expect(updated).toEqual(
      expect.objectContaining({
        id: saved.id,
        createdAt: 100,
        updatedAt: 200,
        candidates: [
          { sentence: '我要喝水。', feedback: 'down' },
          { sentence: '请给我水。', feedback: null }
        ]
      })
    );
    expect(
      JSON.parse(
        storage.getItem(
          COMMUNICATION_STORAGE_KEYS.expressionCandidateFeedbackDrafts
        )
      )
    ).toEqual([updated]);
    expect(repository.removeExpressionCandidateFeedbackDraft(saved.id)).toBe(
      true
    );
    expect(repository.loadExpressionCandidateFeedbackDrafts()).toEqual([]);
  });
});
