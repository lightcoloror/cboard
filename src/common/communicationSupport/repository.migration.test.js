import {
  COMMUNICATION_REPOSITORY_SCHEMA_VERSION,
  COMMUNICATION_STORAGE_KEYS,
  createCommunicationRepository
} from './repository';

function createMemoryStorage(initialValue = {}) {
  const values = new Map(Object.entries(initialValue));

  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    snapshot: () => Object.fromEntries(values)
  };
}

const legacyPhrase = {
  sentence: '旧常用语',
  output: [{ id: 'legacy-tile', label: '旧图' }],
  createdAt: 10
};

const receiverDraft = {
  id: 'receiver-old-1',
  sessionId: 'session-old-1',
  patientId: 'patient-old',
  workspaceId: 'workspace-old',
  direction: 'receive',
  inputText: '想喝水',
  labels: ['水'],
  recordStatus: 'draft',
  createdAt: 20,
  updatedAt: 20
};

describe('communication repository schema migration', () => {
  test('initializes schema v1 once on a fresh installation', () => {
    const storage = createMemoryStorage();
    const repository = createCommunicationRepository({
      storage,
      now: () => 100,
      createId: prefix => `${prefix}-fresh`
    });

    expect(repository.loadCommunicationIdentity()).toEqual({
      patientId: 'patient-fresh',
      workspaceId: 'workspace-fresh'
    });
    expect(repository.loadAnonymousUserIdentity()).toBe('user-fresh');
    expect(repository.getAnonymousAccountMergeState('account-1')).toEqual(
      expect.objectContaining({
        anonymousUserId: 'user-fresh',
        status: 'unlinked',
        shouldPrompt: true
      })
    );
    expect(repository.loadReceiverRecords()).toEqual([]);
    expect(repository.loadReceiverCorrections()).toEqual([]);
    expect(repository.loadMissingTokens()).toEqual([]);
    expect(repository.loadCommunicationSavedPhraseTombstones()).toEqual([]);
    expect(
      JSON.parse(storage.getItem(COMMUNICATION_STORAGE_KEYS.schema))
    ).toEqual({
      schemaVersion: COMMUNICATION_REPOSITORY_SCHEMA_VERSION,
      migratedAt: 100
    });

    const firstSnapshot = storage.snapshot();
    createCommunicationRepository({
      storage,
      now: () => {
        throw new Error('An idempotent migration must not request a new time');
      },
      createId: () => {
        throw new Error('An idempotent migration must not replace identities');
      }
    });

    expect(storage.snapshot()).toEqual(firstSnapshot);
  });

  test('merges unversioned neutral and Tuyujia values without losing receiver data', () => {
    const storage = createMemoryStorage({
      cboard_communication_saved_phrases: JSON.stringify([
        {
          sentence: '中性常用语',
          output: [{ id: 'neutral-tile', label: '中性图' }],
          createdAt: 30
        }
      ]),
      cboard_tuyujia_saved_phrases: JSON.stringify([legacyPhrase]),
      cboard_tuyujia_history: JSON.stringify([
        {
          direction: 'express',
          sentence: '旧历史',
          labels: ['旧图'],
          createdAt: 11
        }
      ]),
      cboard_communication_receiver_records: JSON.stringify([receiverDraft]),
      cboard_communication_receiver_corrections: JSON.stringify([
        {
          id: 'correction-old-1',
          expressionId: receiverDraft.id,
          action: 'replace_pictogram',
          originalToken: '水',
          createdAt: 21
        }
      ]),
      cboard_communication_missing_tokens: JSON.stringify([
        {
          id: 'missing-old-1',
          normalizedToken: '头晕',
          status: 'new',
          occurrenceCount: 2,
          scenes: ['receiver'],
          rawTextSamples: ['我头晕'],
          patientId: 'patient-old',
          workspaceId: 'workspace-old',
          createdAt: 22,
          updatedAt: 23
        }
      ]),
      cboard_communication_patient_id: 'patient-old',
      cboard_communication_workspace_id: 'workspace-old'
    });
    const repository = createCommunicationRepository({
      storage,
      now: () => 500,
      createId: prefix => `${prefix}-migrated`
    });

    expect(
      repository.loadCommunicationSavedPhrases().map(item => item.sentence)
    ).toEqual(['中性常用语', '旧常用语']);
    expect(repository.loadCommunicationHistory()[0].sentence).toBe('旧历史');
    expect(repository.loadReceiverRecords()[0]).toEqual(
      expect.objectContaining({ id: receiverDraft.id, recordStatus: 'draft' })
    );
    expect(repository.loadReceiverCorrections()[0]).toEqual(
      expect.objectContaining({ id: 'correction-old-1' })
    );
    expect(repository.loadMissingTokens()[0]).toEqual(
      expect.objectContaining({
        id: 'missing-old-1',
        normalizedToken: '头晕',
        occurrenceCount: 2
      })
    );
    expect(repository.loadCommunicationIdentity()).toEqual({
      patientId: 'patient-old',
      workspaceId: 'workspace-old'
    });
    expect(repository.loadAnonymousUserIdentity()).toBe('user-migrated');
    expect(
      JSON.parse(storage.getItem('cboard_communication_saved_phrases'))
    ).toHaveLength(2);
    expect(
      JSON.parse(storage.getItem(COMMUNICATION_STORAGE_KEYS.schema))
        .schemaVersion
    ).toBe(COMMUNICATION_REPOSITORY_SCHEMA_VERSION);
  });

  test('repairs corrupted current values without copying private raw data', () => {
    const storage = createMemoryStorage({
      cboard_communication_repository_schema: JSON.stringify({
        schemaVersion: COMMUNICATION_REPOSITORY_SCHEMA_VERSION,
        migratedAt: 1
      }),
      cboard_communication_saved_phrases: '{broken-json',
      cboard_communication_saved_phrase_tombstones: '{broken-tombstones',
      cboard_tuyujia_saved_phrases: JSON.stringify([legacyPhrase]),
      cboard_communication_receiver_records: JSON.stringify([
        receiverDraft,
        { id: 'invalid-record' }
      ]),
      cboard_communication_receiver_corrections: 'broken-corrections',
      cboard_communication_missing_tokens: JSON.stringify({ broken: true }),
      cboard_communication_user_id: '[object Object]',
      cboard_communication_patient_id: '[object Object]',
      cboard_communication_workspace_id: '{"bad":true}',
      cboard_communication_account_identity: '{broken-account'
    });
    const repository = createCommunicationRepository({
      storage,
      now: () => 900,
      createId: prefix => `${prefix}-repaired`
    });

    expect(repository.loadCommunicationSavedPhrases()[0].sentence).toBe(
      '旧常用语'
    );
    expect(repository.loadCommunicationSavedPhraseTombstones()).toEqual([]);
    expect(repository.loadReceiverRecords()).toEqual([
      expect.objectContaining({ id: receiverDraft.id })
    ]);
    expect(repository.loadReceiverCorrections()).toEqual([]);
    expect(repository.loadMissingTokens()).toEqual([]);
    expect(repository.loadCommunicationIdentity()).toEqual({
      patientId: 'patient-repaired',
      workspaceId: 'workspace-repaired'
    });
    expect(repository.loadAnonymousUserIdentity()).toBe('user-repaired');

    const metadataRaw = storage.getItem(COMMUNICATION_STORAGE_KEYS.schema);
    const metadata = JSON.parse(metadataRaw);
    expect(metadata).toEqual(
      expect.objectContaining({
        schemaVersion: COMMUNICATION_REPOSITORY_SCHEMA_VERSION,
        migratedAt: 1,
        lastRepairAt: 900,
        repairedKeys: expect.arrayContaining([
          COMMUNICATION_STORAGE_KEYS.savedPhrases,
          COMMUNICATION_STORAGE_KEYS.savedPhraseTombstones,
          COMMUNICATION_STORAGE_KEYS.receiverRecords,
          COMMUNICATION_STORAGE_KEYS.receiverCorrections,
          COMMUNICATION_STORAGE_KEYS.missingTokens,
          COMMUNICATION_STORAGE_KEYS.userId,
          COMMUNICATION_STORAGE_KEYS.patientId,
          COMMUNICATION_STORAGE_KEYS.workspaceId,
          COMMUNICATION_STORAGE_KEYS.accountIdentity
        ])
      })
    );
    expect(metadataRaw).not.toContain('旧常用语');
    expect(metadataRaw).not.toContain('broken-json');
  });

  test('does not downgrade or write through a future repository schema', () => {
    const storage = createMemoryStorage({
      cboard_communication_repository_schema: JSON.stringify({
        schemaVersion: COMMUNICATION_REPOSITORY_SCHEMA_VERSION + 1,
        migratedAt: 1000
      }),
      cboard_communication_saved_phrases: JSON.stringify([legacyPhrase])
    });
    const initialSnapshot = storage.snapshot();
    const repository = createCommunicationRepository({ storage });

    expect(storage.snapshot()).toEqual(initialSnapshot);
    expect(repository.loadCommunicationSavedPhrases()[0].sentence).toBe(
      '旧常用语'
    );
    expect(() =>
      repository.appendCommunicationHistory({
        direction: 'express',
        sentence: '不应覆写',
        labels: ['不应覆写']
      })
    ).toThrow('newer schema version');
    expect(storage.snapshot()).toEqual(initialSnapshot);
  });
});
