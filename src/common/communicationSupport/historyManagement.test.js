import {
  buildCommunicationHistoryAnonymizedOpenBoardLog,
  buildCommunicationHistoryExportText,
  buildCommunicationHistoryOpenBoardLog,
  clearCommunicationHistory,
  deleteCommunicationHistoryEntry,
  getCommunicationHistoryPatientFeedbackText,
  getCommunicationHistoryReplayText,
  groupCommunicationHistoryBySession,
  importCommunicationHistoryOpenBoardLog,
  normalizeManagedCommunicationHistory,
  OPEN_BOARD_LOG_FORMAT,
  OPEN_BOARD_LOG_ANONYMIZATIONS,
  OPEN_BOARD_LOG_NOTICE,
  toggleCommunicationHistoryFavorite,
  updateCommunicationHistoryCandidateFeedback
} from './historyManagement';

function history(overrides = {}) {
  return {
    id: 'history-1',
    sessionId: 'session-1',
    direction: 'express',
    sentence: '我要喝水',
    labels: ['水'],
    createdAt: 100,
    ...overrides
  };
}

describe('communication history management', () => {
  test('keeps the newest 100 records and creates stable legacy identities', () => {
    const entries = Array.from({ length: 110 }, (_, index) =>
      history({ id: '', sentence: `记录${index}`, createdAt: index })
    );
    const first = normalizeManagedCommunicationHistory(entries);
    const second = normalizeManagedCommunicationHistory(entries);

    expect(first).toHaveLength(100);
    expect(first[0].sentence).toBe('记录109');
    expect(first.map(item => item.id)).toEqual(second.map(item => item.id));
  });

  test('toggles favorite, deletes one record and clears all records', () => {
    const toggled = toggleCommunicationHistoryFavorite(
      [history()],
      'history-1',
      { now: () => 500 }
    );
    const removed = deleteCommunicationHistoryEntry(toggled.items, 'history-1');

    expect(toggled.item).toEqual(
      expect.objectContaining({
        isFavorite: true,
        updatedAt: 500
      })
    );
    expect(removed.items).toEqual([]);
    expect(clearCommunicationHistory()).toEqual([]);
  });

  test('updates, replaces and cancels feedback on a historical candidate', () => {
    const entry = history({
      candidateSentences: ['我要喝水', '请给我水'],
      candidates: [
        { sentence: '我要喝水', feedback: null },
        { sentence: '请给我水', feedback: null }
      ]
    });
    const liked = updateCommunicationHistoryCandidateFeedback(
      [entry],
      entry.id,
      0,
      'up',
      { now: () => 200 }
    );
    const replaced = updateCommunicationHistoryCandidateFeedback(
      liked.items,
      entry.id,
      0,
      'down',
      { now: () => 300 }
    );
    const cancelled = updateCommunicationHistoryCandidateFeedback(
      replaced.items,
      entry.id,
      0,
      'down',
      { now: () => 400 }
    );

    expect(liked.item.candidates[0].feedback).toBe('up');
    expect(replaced.item.candidates[0].feedback).toBe('down');
    expect(cancelled.item.candidates[0].feedback).toBeNull();
    expect(cancelled.item.updatedAt).toBe(400);
  });

  test('groups both directions by session and resolves replay text', () => {
    const entries = [
      history({ id: 'e2', sessionId: 'session-2', createdAt: 300 }),
      history({
        id: 'r1',
        sessionId: 'session-1',
        direction: 'receive',
        sentence: '',
        inputText: '请坐下',
        createdAt: 200
      }),
      history()
    ];
    const groups = groupCommunicationHistoryBySession(entries);

    expect(groups.map(group => group.sessionId)).toEqual([
      'session-2',
      'session-1'
    ]);
    expect(groups[1].items).toHaveLength(2);
    expect(getCommunicationHistoryReplayText(groups[1].items[0])).toBe(
      '请坐下'
    );
  });

  test('exports chronological readable text with favorites and labels', () => {
    const text = buildCommunicationHistoryExportText(
      [
        history({ id: 'new', sentence: '后来', createdAt: 200 }),
        history({
          id: 'receive',
          direction: 'receive',
          sentence: '',
          inputText: '请喝水',
          patientFeedback: 'not_understood',
          createdAt: 150
        }),
        history({ id: 'old', sentence: '先说', isFavorite: true })
      ],
      { now: () => new Date(2026, 6, 17, 12, 30).getTime() }
    );

    expect(text).toContain('图语家 · 对话记录导出');
    expect(text).toContain('句子：先说');
    expect(text).toContain('图片：[水]');
    expect(text).toContain('患者反馈：没明白');
    expect(text).toContain('已收藏');
    expect(text.indexOf('句子：先说')).toBeLessThan(text.indexOf('句子：后来'));
    expect(
      getCommunicationHistoryPatientFeedbackText({
        direction: 'receive',
        patientFeedback: 'not_understood'
      })
    ).toBe('患者反馈：没明白');
    expect(
      getCommunicationHistoryPatientFeedbackText({
        direction: 'express',
        patientFeedback: 'understood'
      })
    ).toBe('');
  });

  test('exports private Open Board Logging 0.1 sessions without claiming anonymization', () => {
    const text = buildCommunicationHistoryOpenBoardLog(
      [
        history({
          id: 'internal-new',
          sessionId: 'internal-session-2',
          sentence: '后来',
          createdAt: 300
        }),
        history({
          id: 'internal-receive',
          sessionId: 'internal-session-1',
          direction: 'receive',
          sentence: '',
          inputText: '请喝水',
          labels: ['喝', '水'],
          patientFeedback: 'understood',
          createdAt: 200
        }),
        history({
          id: 'internal-old',
          sessionId: 'internal-session-1',
          sentence: '先说',
          createdAt: 100
        })
      ],
      { now: () => 500, source: 'picinterpreter-test' }
    );
    const parsed = JSON.parse(text.slice(text.indexOf('{')));

    expect(text.startsWith(OPEN_BOARD_LOG_NOTICE)).toBe(true);
    expect(parsed).toEqual(
      expect.objectContaining({
        format: OPEN_BOARD_LOG_FORMAT,
        source: 'picinterpreter-test',
        locale: 'zh-CN'
      })
    );
    expect(parsed.user_id).toMatch(/^export-/);
    expect(parsed).not.toHaveProperty('user_name');
    expect(parsed).not.toHaveProperty('anonymized');
    expect(parsed.sessions.map(session => session.id)).toEqual([
      'session-1',
      'session-2'
    ]);
    expect(parsed.sessions[0].events.map(event => event.text)).toEqual([
      '先说',
      '请喝水'
    ]);
    expect(parsed.sessions[0].events[1]).toEqual(
      expect.objectContaining({
        type: 'utterance',
        modeling: true,
        ext_picinterpreter_direction: 'receive',
        ext_picinterpreter_labels: ['喝', '水'],
        ext_picinterpreter_patient_feedback: 'understood'
      })
    );
    expect(parsed.sessions[1].events[0].modeling).toBe(false);
    expect(text).not.toContain('internal-session');
    expect(text).not.toContain('internal-receive');
  });

  test('does not create an invalid empty Open Board Logging file', () => {
    expect(buildCommunicationHistoryOpenBoardLog([])).toBe('');
    expect(buildCommunicationHistoryAnonymizedOpenBoardLog([])).toBe('');
  });

  test('exports a strict anonymized Open Board Logging archive for research', () => {
    const randomValues = [0, 1, 0.25];
    const text = buildCommunicationHistoryAnonymizedOpenBoardLog(
      [
        history({
          id: 'private-new',
          sessionId: 'private-session',
          sentence: '我叫小明，住在人民路 1 号',
          labels: ['小明', '家'],
          createdAt: Date.parse('2026-07-20T10:00:20.000Z')
        }),
        history({
          id: 'private-old',
          sessionId: 'private-session',
          direction: 'receive',
          sentence: '',
          inputText: '你的妈妈在医院吗？',
          labels: ['妈妈', '医院'],
          patientFeedback: 'understood',
          createdAt: Date.parse('2026-07-20T10:00:10.000Z')
        })
      ],
      {
        now: () => Date.parse('2026-07-20T11:00:00.000Z'),
        source: 'picinterpreter-test',
        userId: 'private-account-id',
        random: () => randomValues.shift()
      }
    );
    const parsed = JSON.parse(text.slice(text.indexOf('{')));

    expect(parsed).toEqual(
      expect.objectContaining({
        format: OPEN_BOARD_LOG_FORMAT,
        user_id: 'user-1',
        anonymized: true,
        source: 'picinterpreter-test'
      })
    );
    expect(parsed.sessions[0].started).toBe('2000-01-01T00:00:00.000Z');
    expect(parsed.sessions[0].anonymizations).toEqual(
      OPEN_BOARD_LOG_ANONYMIZATIONS
    );
    expect(parsed.sessions[0].events).toEqual([
      expect.objectContaining({
        id: 'event-1',
        text: ':fringe-1',
        modeling: true,
        redacted: true
      }),
      expect.objectContaining({
        id: 'event-2',
        text: ':fringe-2',
        modeling: false,
        redacted: true
      })
    ]);
    expect(
      Date.parse(parsed.sessions[0].events[0].timestamp)
    ).toBeLessThanOrEqual(Date.parse(parsed.sessions[0].events[1].timestamp));
    expect(text).not.toContain('小明');
    expect(text).not.toContain('人民路');
    expect(text).not.toContain('妈妈');
    expect(text).not.toContain('医院');
    expect(text).not.toContain('private-account-id');
    expect(text).not.toContain('ext_picinterpreter');
  });

  test('imports Open Board Logging utterances without retaining identity fields', () => {
    const text =
      OPEN_BOARD_LOG_NOTICE +
      '\n' +
      JSON.stringify({
        format: OPEN_BOARD_LOG_FORMAT,
        user_id: 'private-user-id',
        user_name: 'Private Person',
        source: 'another-aac-app',
        anonymized: false,
        sessions: [
          {
            id: 'external-session',
            type: 'log',
            started: '2026-07-20T10:00:00.000Z',
            ended: '2026-07-20T10:01:00.000Z',
            device_id: 'private-device',
            events: [
              {
                id: 'external-express',
                timestamp: '2026-07-20T10:00:00.000Z',
                type: 'utterance',
                text: '我要喝水',
                modeling: false,
                ext_picinterpreter_labels: ['喝', '水']
              },
              {
                id: 'external-button',
                timestamp: '2026-07-20T10:00:30.000Z',
                type: 'button',
                label: 'water'
              },
              {
                id: 'external-receive',
                timestamp: '2026-07-20T10:01:00.000Z',
                type: 'utterance',
                text: '请慢慢喝',
                modeling: true,
                ext_picinterpreter_patient_feedback: 'understood'
              }
            ]
          }
        ]
      });
    const first = importCommunicationHistoryOpenBoardLog(
      text,
      [history({ id: 'local-entry', createdAt: 1 })],
      { maxItems: 4 }
    );

    expect(first).toEqual(
      expect.objectContaining({
        ok: true,
        addedCount: 2,
        skippedCount: 0,
        unsupportedEventCount: 1,
        anonymized: false
      })
    );
    expect(first.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: 'express',
          sentence: '我要喝水',
          labels: ['喝', '水'],
          localOnly: true,
          importSource: 'open-board-log'
        }),
        expect.objectContaining({
          direction: 'receive',
          inputText: '请慢慢喝',
          patientFeedback: 'understood',
          localOnly: true
        }),
        expect.objectContaining({ id: 'local-entry' })
      ])
    );
    expect(JSON.stringify(first.items)).not.toContain('private-user-id');
    expect(JSON.stringify(first.items)).not.toContain('Private Person');
    expect(JSON.stringify(first.items)).not.toContain('private-device');

    const second = importCommunicationHistoryOpenBoardLog(text, first.items, {
      maxItems: 4
    });
    expect(second.addedCount).toBe(0);
    expect(second.duplicateCount).toBe(2);
  });

  test('rejects anonymized research logs without changing local history', () => {
    const existing = [history({ id: 'local-entry', createdAt: 1 })];
    const anonymizedText = buildCommunicationHistoryAnonymizedOpenBoardLog(
      [history({ sentence: '我叫小明，住在人民路 1 号' })],
      { random: () => 0.5 }
    );
    const result = importCommunicationHistoryOpenBoardLog(
      anonymizedText,
      existing
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        addedCount: 0,
        anonymized: true,
        error:
          '匿名研究日志不能恢复为本机沟通历史；请使用包含原文的私密 .obl 文件。'
      })
    );
    expect(result.items).toEqual(
      normalizeManagedCommunicationHistory(existing)
    );
    expect(JSON.stringify(result.items)).not.toContain(':fringe-');
  });

  test('keeps existing history when the local limit is full', () => {
    const input = {
      format: OPEN_BOARD_LOG_FORMAT,
      user_id: 'external-user',
      sessions: [
        {
          id: 'external-session',
          type: 'log',
          events: [
            {
              id: 'external-event',
              timestamp: '2026-07-20T10:00:00.000Z',
              type: 'utterance',
              text: '外部记录'
            }
          ]
        }
      ]
    };
    const existing = [
      history({ id: 'local-new', createdAt: 20 }),
      history({ id: 'local-old', createdAt: 10 })
    ];
    const result = importCommunicationHistoryOpenBoardLog(input, existing, {
      maxItems: 2
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        addedCount: 0,
        capacitySkippedCount: 1,
        skippedCount: 1
      })
    );
    expect(result.items.map(item => item.id)).toEqual([
      'local-new',
      'local-old'
    ]);
  });

  test('rejects incompatible or non-utterance Open Board Logging files', () => {
    const incompatible = importCommunicationHistoryOpenBoardLog(
      JSON.stringify({
        format: 'open-board-log-9.9',
        user_id: 'user',
        sessions: []
      }),
      []
    );
    const noUtterance = importCommunicationHistoryOpenBoardLog(
      {
        format: OPEN_BOARD_LOG_FORMAT,
        user_id: 'user',
        sessions: [
          {
            id: 'session',
            type: 'log',
            events: [
              {
                id: 'button',
                timestamp: '2026-07-20T10:00:00.000Z',
                type: 'button'
              }
            ]
          }
        ]
      },
      []
    );

    expect(incompatible.ok).toBe(false);
    expect(incompatible.error).toContain('open-board-log-0.1');
    expect(noUtterance.ok).toBe(false);
    expect(noUtterance.error).toContain('utterance');
    expect(noUtterance.unsupportedEventCount).toBe(1);
  });
});
