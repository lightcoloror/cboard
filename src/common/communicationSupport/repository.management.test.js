import {
  COMMUNICATION_REPOSITORY_SCHEMA_VERSION,
  COMMUNICATION_STORAGE_KEYS,
  createCommunicationRepository
} from './repository';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

describe('communication repository management schema', () => {
  test('reports a storage write failure instead of confirming unsaved history', () => {
    const storage = createStorage();
    const repository = createCommunicationRepository({
      storage,
      now: () => 1000,
      createId: prefix => `${prefix}-fixed`
    });
    const write = storage.setItem;
    storage.setItem = (key, value) =>
      key === COMMUNICATION_STORAGE_KEYS.history ? false : write(key, value);

    expect(() =>
      repository.appendCommunicationHistory({
        direction: 'express',
        sentence: '我要喝水',
        output: [{ id: 'water', label: '水' }]
      })
    ).toThrow('Communication repository failed to write');
    expect(repository.loadCommunicationHistory()).toEqual([]);
  });

  test('keeps 100 repeated communication events with stable unique ids', () => {
    const storage = createStorage();
    let timestamp = 1000;
    let sequence = 0;
    const repository = createCommunicationRepository({
      storage,
      now: () => ++timestamp,
      createId: prefix => `${prefix}-${++sequence}`
    });

    for (let index = 0; index < 105; index += 1) {
      repository.appendCommunicationHistory({
        direction: 'express',
        sentence: '我要喝水',
        labels: ['水']
      });
    }

    const history = repository.loadCommunicationHistory();
    expect(history).toHaveLength(100);
    expect(new Set(history.map(item => item.id)).size).toBe(100);
    expect(history.every(item => item.sentence === '我要喝水')).toBe(true);
  });

  test('persists phrase identity, usage statistics and sentence-only entries', () => {
    const repository = createCommunicationRepository({
      storage: createStorage(),
      now: () => 500,
      createId: prefix => `${prefix}-fixed`
    });

    repository.saveCommunicationPhrase({
      sentence: '请帮帮我',
      output: [],
      usageCount: 3,
      lastUsedAt: 400
    });

    expect(repository.loadCommunicationSavedPhrases()).toEqual([
      expect.objectContaining({
        id: 'phrase-fixed',
        sentence: '请帮帮我',
        output: [],
        usageCount: 3,
        lastUsedAt: 400,
        updatedAt: 500
      })
    ]);
  });

  test('persists phrase versions and prevents deleted phrases from returning', () => {
    const storage = createStorage();
    let timestamp = 500;
    let sequence = 0;
    const repository = createCommunicationRepository({
      storage,
      now: () => timestamp,
      createId: prefix => `${prefix}-${++sequence}`
    });

    repository.saveCommunicationPhrase({
      id: 'phrase-water',
      sentence: '我要喝水',
      output: [{ id: 'water', label: '水' }],
      serverVersion: 2,
      baseVersion: 2,
      conflicted: true
    });

    expect(repository.loadCommunicationSavedPhrases()[0]).toEqual(
      expect.objectContaining({
        id: 'phrase-water',
        serverVersion: 2,
        baseVersion: 2,
        conflicted: true
      })
    );

    timestamp = 600;
    expect(repository.deleteCommunicationSavedPhrase('phrase-water')).toEqual({
      id: 'phrase-water',
      deletedAt: 600,
      deletedBy: 'local',
      serverVersion: 2,
      pending: true
    });
    expect(repository.loadCommunicationSavedPhrases()).toEqual([]);

    repository.overwriteCommunicationSavedPhrases([
      {
        id: 'phrase-water',
        sentence: '旧设备又传回来',
        createdAt: 100,
        serverVersion: 3
      }
    ]);
    expect(repository.loadCommunicationSavedPhrases()).toEqual([]);

    repository.saveCommunicationPhrase({
      id: 'phrase-help',
      sentence: '请帮帮我',
      serverVersion: 1
    });
    repository.saveCommunicationPhrase({
      id: 'phrase-toilet',
      sentence: '我要去厕所'
    });
    timestamp = 700;

    expect(
      repository
        .clearCommunicationSavedPhrases()
        .map(item => item.id)
        .sort()
    ).toEqual(['phrase-help', 'phrase-toilet']);
    expect(repository.loadCommunicationSavedPhrases()).toEqual([]);
    expect(
      repository
        .loadCommunicationSavedPhraseTombstones()
        .map(item => item.id)
        .sort()
    ).toEqual(['phrase-help', 'phrase-toilet', 'phrase-water']);
  });

  test('migrates v1 history and favorites without deleting repeated events', () => {
    const storage = createStorage({
      [COMMUNICATION_STORAGE_KEYS.schema]: JSON.stringify({ schemaVersion: 1 }),
      [COMMUNICATION_STORAGE_KEYS.history]: JSON.stringify([
        {
          direction: 'receive',
          inputText: '请坐下',
          labels: ['坐'],
          createdAt: 20,
          isFavorite: true
        },
        {
          direction: 'receive',
          inputText: '请坐下',
          labels: ['坐'],
          createdAt: 10
        }
      ])
    });

    const repository = createCommunicationRepository({
      storage,
      now: () => 100,
      createId: prefix => `${prefix}-migration`
    });
    const history = repository.loadCommunicationHistory();
    const metadata = JSON.parse(
      storage.getItem(COMMUNICATION_STORAGE_KEYS.schema)
    );

    expect(metadata.schemaVersion).toBe(
      COMMUNICATION_REPOSITORY_SCHEMA_VERSION
    );
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual(
      expect.objectContaining({
        isFavorite: true,
        id: expect.stringMatching(/^history_/)
      })
    );
  });
});
