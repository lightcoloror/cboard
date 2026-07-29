import {
  buildConfirmedReceiverSyncPayload,
  mergeConfirmedReceiverRecords,
  removeDeletedReceiverHistory
} from './receiverSync';

const baseRecord = {
  id: 'receiver-1',
  sessionId: 'session-1',
  patientId: 'patient-1',
  workspaceId: 'workspace-1',
  direction: 'receive',
  recordStatus: 'confirmed',
  inputText: '我想喝水',
  labels: ['想', '水'],
  pictogramSequence: [
    {
      pictogramId: 'water',
      label: '水',
      source: 'online',
      boardId: 'runtime',
      matchType: 'online',
      confidence: 0.75,
      originalToken: '水',
      attribution: {
        provider: 'opensymbols',
        originalId: 'mulberry:water',
        name: 'OpenSymbols / mulberry',
        license: 'CC BY-SA 2.0 UK',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/uk/',
        author: 'Mulberry Symbols',
        authorUrl: 'https://mulberrysymbols.org/',
        sourceUrl: 'https://www.opensymbols.org/symbols/mulberry/water',
        repoKey: 'mulberry'
      }
    }
  ],
  createdAt: 10,
  updatedAt: 20,
  confirmedAt: 20
};

describe('confirmed receiver sync contract', () => {
  test('uploads confirmed records only and strips local maintenance fields', () => {
    const payload = buildConfirmedReceiverSyncPayload([
      {
        ...baseRecord,
        patientFeedback: 'understood',
        patientFeedbackAt: 30,
        patientFeedbackEvents: [
          { type: 'repeat_requested', createdAt: 25 },
          { type: 'understood', createdAt: 30 }
        ],
        receiverCorrections: [{ action: 'replace_pictogram' }],
        missingTokens: ['秘密词']
      },
      {
        ...baseRecord,
        id: 'draft-1',
        recordStatus: 'draft'
      }
    ]);

    expect(payload).toHaveLength(1);
    expect(payload[0].pictogramSequence[0]).toEqual({
      pictogramId: 'water',
      label: '水',
      source: 'opensymbols',
      matchType: 'online',
      confidence: 0.75,
      originalToken: '水',
      attribution: baseRecord.pictogramSequence[0].attribution
    });
    expect(payload[0]).not.toHaveProperty('receiverCorrections');
    expect(payload[0]).not.toHaveProperty('missingTokens');
    expect(payload[0]).toEqual(
      expect.objectContaining({
        baseVersion: 0,
        patientFeedback: 'understood',
        patientFeedbackAt: 30,
        patientFeedbackEvents: [
          { type: 'repeat_requested', createdAt: 25 },
          { type: 'understood', createdAt: 30 }
        ]
      })
    );
    expect(payload[0].pictogramSequence[0]).not.toHaveProperty('boardId');
  });

  test('uses the last accepted server version as the next base version', () => {
    const payload = buildConfirmedReceiverSyncPayload([
      {
        ...baseRecord,
        serverVersion: 4,
        conflicted: true
      }
    ]);

    expect(payload[0].baseVersion).toBe(4);
    expect(payload[0]).not.toHaveProperty('serverVersion');
    expect(payload[0]).not.toHaveProperty('conflicted');
  });

  test('never uploads device-private attribution or its local pictogram id', () => {
    const payload = buildConfirmedReceiverSyncPayload([
      {
        ...baseRecord,
        pictogramSequence: [
          {
            pictogramId: 'device_private_missing_family-photo',
            label: '妈妈',
            source: 'user',
            matchType: 'manual',
            confidence: 1,
            originalToken: '妈妈',
            attribution: {
              provider: 'device-private',
              originalId: 'family-photo',
              name: '当前设备私有图片',
              license: '用户提供，仅限本机使用',
              licenseUrl: null,
              author: null,
              authorUrl: null,
              sourceUrl: 'device-private://missing-token/family-photo',
              repoKey: null
            }
          }
        ]
      }
    ]);

    expect(payload[0].pictogramSequence[0]).not.toHaveProperty('pictogramId');
    expect(payload[0].pictogramSequence[0]).not.toHaveProperty('attribution');
    expect(payload[0].pictogramSequence[0].source).toBe('user');
  });

  test('merges newer confirmed remote records without removing local drafts', () => {
    const localDraft = {
      ...baseRecord,
      id: 'draft-1',
      recordStatus: 'draft'
    };
    const merged = mergeConfirmedReceiverRecords(
      [baseRecord, localDraft],
      [
        {
          ...baseRecord,
          inputText: '请给我水',
          updatedAt: 30,
          confirmedAt: 30
        }
      ]
    );

    expect(merged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'receiver-1',
          inputText: '请给我水'
        }),
        expect.objectContaining({
          id: 'draft-1',
          recordStatus: 'draft'
        })
      ])
    );
  });

  test('sanitizes device-private references in old remote receiver records', () => {
    const merged = mergeConfirmedReceiverRecords(
      [],
      [
        {
          ...baseRecord,
          pictogramSequence: [
            {
              pictogramId: 'device_private_missing_family-photo',
              label: '妈妈',
              source: 'user',
              boardId: 'device-private-pictograms',
              matchType: 'manual',
              confidence: 1,
              originalToken: '妈妈',
              attribution: {
                provider: 'device-private',
                originalId: 'family-photo',
                name: '当前设备私有图片',
                license: '用户提供，仅限本机使用',
                sourceUrl: 'device-private://missing-token/family-photo'
              }
            }
          ]
        }
      ]
    );

    expect(merged[0].pictogramSequence[0]).toEqual({
      pictogramId: null,
      label: '妈妈',
      source: 'user',
      boardId: '',
      matchType: 'manual',
      confidence: 1,
      originalToken: '妈妈'
    });
    expect(JSON.stringify(merged)).not.toContain('device-private');
    expect(JSON.stringify(merged)).not.toContain('family-photo');
  });

  test('accepts the server canonical record when a stale client conflicted', () => {
    const merged = mergeConfirmedReceiverRecords(
      [
        {
          ...baseRecord,
          inputText: '旧设备改写',
          updatedAt: 50,
          serverVersion: 1,
          patientFeedback: 'repeat_requested',
          patientFeedbackAt: 40,
          patientFeedbackEvents: [{ type: 'repeat_requested', createdAt: 40 }]
        }
      ],
      [
        {
          ...baseRecord,
          inputText: '服务端已确认内容',
          updatedAt: 20,
          serverVersion: 2,
          conflicted: true,
          patientFeedback: 'understood',
          patientFeedbackAt: 30,
          patientFeedbackEvents: [{ type: 'understood', createdAt: 30 }]
        }
      ]
    );

    expect(merged[0]).toEqual(
      expect.objectContaining({
        inputText: '服务端已确认内容',
        serverVersion: 2,
        conflicted: true,
        patientFeedback: 'repeat_requested',
        patientFeedbackEvents: [
          { type: 'understood', createdAt: 30 },
          { type: 'repeat_requested', createdAt: 40 }
        ]
      })
    );

    const resolved = mergeConfirmedReceiverRecords(merged, [
      {
        ...baseRecord,
        inputText: '服务端已确认内容',
        updatedAt: 20,
        serverVersion: 2,
        conflicted: false
      }
    ]);
    expect(resolved[0]).not.toHaveProperty('conflicted');
  });

  test('applies server tombstones to receiver records and visible history', () => {
    expect(
      mergeConfirmedReceiverRecords(
        [baseRecord],
        [baseRecord],
        [
          {
            id: 'receiver-1',
            deletedAt: 30,
            deletedBy: 'user-1',
            serverVersion: 2
          }
        ]
      )
    ).toEqual([]);
    expect(
      removeDeletedReceiverHistory(
        [
          baseRecord,
          {
            id: 'expression-1',
            direction: 'express',
            sentence: '我要休息',
            labels: ['休息'],
            createdAt: 5
          }
        ],
        ['receiver-1']
      )
    ).toEqual([expect.objectContaining({ id: 'expression-1' })]);
  });
});
