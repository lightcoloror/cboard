import { createCommunicationRepository } from './repository';

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

describe('communication repository conversation session', () => {
  test('shares one session across express and confirmed receive turns', () => {
    let timestamp = 100;
    let idSequence = 0;
    const repository = createCommunicationRepository({
      storage: createMemoryStorage(),
      now: () => timestamp,
      createId: prefix => `${prefix}-${++idSequence}`
    });
    const session = repository.getActiveConversationSession();

    timestamp = 110;
    repository.appendCommunicationHistory({
      direction: 'express',
      sentence: '我想喝水',
      labels: ['我想要', '水'],
      output: [{ id: 'want', label: '我想要' }, { id: 'water', label: '水' }]
    });

    timestamp = 120;
    const draft = repository.createReceiverDraft({
      direction: 'receive',
      inputText: '你想喝水吗',
      labels: ['喝', '水'],
      pictogramSequence: [
        {
          pictogramId: 'water',
          label: '水',
          originalToken: '水',
          matchType: 'exact'
        }
      ]
    });

    timestamp = 130;
    const confirmed = repository.confirmReceiverDraft(draft, {
      direction: 'receive',
      inputText: '你想喝水吗',
      labels: ['喝', '水'],
      pictogramSequence: [
        {
          pictogramId: 'water',
          label: '水',
          originalToken: '水',
          matchType: 'exact'
        }
      ]
    });

    expect(draft.sessionId).toBe(session.id);
    expect(confirmed.sessionId).toBe(session.id);
    expect(repository.loadConversationContext()).toEqual({
      contractVersion: 1,
      sessionId: session.id,
      turns: [
        expect.objectContaining({
          direction: 'express',
          text: '我想喝水',
          pictogramIds: ['want', 'water']
        }),
        expect.objectContaining({
          direction: 'receive',
          text: '你想喝水吗',
          pictogramIds: ['water']
        })
      ]
    });
  });

  test('manual reset starts an empty current context without deleting history', () => {
    let idSequence = 0;
    const repository = createCommunicationRepository({
      storage: createMemoryStorage(),
      now: () => 100,
      createId: prefix => `${prefix}-${++idSequence}`
    });
    const previous = repository.getActiveConversationSession();

    repository.appendCommunicationHistory({
      direction: 'express',
      sentence: '旧对话',
      labels: ['旧对话']
    });
    const selected = repository.setConversationScene('hospital');

    expect(selected.scene).toBe('hospital');
    expect(repository.getActiveConversationSession().scene).toBe('hospital');
    expect(repository.loadConversationContext().scene).toBe('hospital');

    const next = repository.resetConversationSession();

    expect(next.id).not.toBe(previous.id);
    expect(next.scene).toBeUndefined();
    expect(repository.loadConversationContext()).toEqual({
      contractVersion: 1,
      sessionId: next.id,
      turns: []
    });
    expect(repository.loadCommunicationHistory()).toHaveLength(1);
    expect(
      repository.loadConversationContext({ sessionId: previous.id }).turns
    ).toHaveLength(1);
  });
});
