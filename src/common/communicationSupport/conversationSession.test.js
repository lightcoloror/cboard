import {
  CONVERSATION_SCENES,
  DEFAULT_CONVERSATION_IDLE_TIMEOUT_MS,
  buildConversationContext,
  createConversationSession,
  normalizeConversationScene,
  resolveConversationSession,
  setConversationSessionScene,
  touchConversationSession
} from './conversationSession';

describe('conversation session contract', () => {
  test('keeps one session until the 30-minute idle boundary', () => {
    const current = createConversationSession({
      now: () => 100,
      createId: () => 'session-a'
    });
    const active = resolveConversationSession(current, {
      now: () => 100 + DEFAULT_CONVERSATION_IDLE_TIMEOUT_MS - 1,
      createId: () => 'session-b'
    });
    const idle = resolveConversationSession(current, {
      now: () => 100 + DEFAULT_CONVERSATION_IDLE_TIMEOUT_MS,
      createId: () => 'session-b'
    });

    expect(active).toEqual({ session: current, reason: 'active' });
    expect(idle).toEqual({
      session: expect.objectContaining({
        id: 'session-b',
        startedAt: 100 + DEFAULT_CONVERSATION_IDLE_TIMEOUT_MS
      }),
      reason: 'idle'
    });
  });

  test('touches activity without changing the stable session id', () => {
    const current = createConversationSession({
      now: () => 100,
      createId: () => 'session-a'
    });

    expect(touchConversationSession(current, { now: () => 200 })).toEqual({
      ...current,
      lastActivityAt: 200
    });
  });

  test('selects only a fixed caregiver scene and clears it explicitly', () => {
    const current = createConversationSession({
      now: () => 100,
      createId: () => 'session-a'
    });
    const selected = setConversationSessionScene(current, 'hospital', {
      now: () => 200
    });

    expect(CONVERSATION_SCENES.map(scene => scene.id)).toEqual([
      'hospital',
      'home',
      'rehab_clinic'
    ]);
    expect(selected).toEqual({
      ...current,
      scene: 'hospital',
      lastActivityAt: 200
    });
    expect(
      setConversationSessionScene(selected, null, { now: () => 300 })
    ).toEqual({
      ...current,
      lastActivityAt: 300
    });
    expect(normalizeConversationScene('arbitrary-location')).toBeNull();
  });

  test('builds ordered local context and excludes drafts and other sessions', () => {
    const context = buildConversationContext(
      [
        {
          id: 'receive-confirmed',
          sessionId: 'session-a',
          direction: 'receive',
          inputText: '你想喝水吗',
          labels: ['喝', '水'],
          recordStatus: 'confirmed',
          pictogramSequence: [{ pictogramId: 'water' }],
          createdAt: 30
        },
        {
          id: 'receive-draft',
          sessionId: 'session-a',
          direction: 'receive',
          inputText: '未确认内容',
          labels: ['未确认'],
          recordStatus: 'draft',
          createdAt: 20
        },
        {
          id: 'express-a',
          sessionId: 'session-a',
          direction: 'express',
          sentence: '我想喝水',
          labels: ['我想要', '水'],
          output: [{ id: 'want' }, { id: 'water' }],
          candidates: [
            { sentence: '我想喝水', feedback: 'up' },
            { sentence: '请给我饮料', feedback: 'down' }
          ],
          createdAt: 10
        },
        {
          id: 'express-other',
          sessionId: 'session-b',
          direction: 'express',
          sentence: '其他会话',
          labels: ['其他'],
          createdAt: 40
        }
      ],
      { sessionId: 'session-a', scene: 'home' }
    );

    expect(context).toEqual({
      contractVersion: 1,
      sessionId: 'session-a',
      scene: 'home',
      turns: [
        expect.objectContaining({
          id: 'express-a',
          direction: 'express',
          text: '我想喝水',
          pictogramIds: ['want', 'water'],
          candidateFeedback: [
            { sentence: '我想喝水', feedback: 'up' },
            { sentence: '请给我饮料', feedback: 'down' }
          ]
        }),
        expect.objectContaining({
          id: 'receive-confirmed',
          direction: 'receive',
          text: '你想喝水吗',
          pictogramIds: ['water']
        })
      ]
    });
  });
});
