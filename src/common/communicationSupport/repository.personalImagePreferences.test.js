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
    removeItem: key => values.delete(key),
    snapshot: () => Object.fromEntries(values)
  };
}

describe('communication repository personal image preferences', () => {
  test('persists private image overrides under a dedicated local key', () => {
    const storage = createStorage();
    const repository = createCommunicationRepository({
      storage,
      now: () => 100,
      createId: prefix => `${prefix}-local`
    });

    const saved = repository.savePersonalImagePreference({
      tileId: 'water',
      boardId: 'home',
      labelSnapshot: 'Water',
      image: 'local://familiar-cup'
    });

    expect(saved).toEqual(
      expect.objectContaining({
        scope: 'device-private',
        patientId: 'patient-local',
        workspaceId: 'workspace-local',
        image: 'local://familiar-cup'
      })
    );
    expect(repository.loadPersonalImagePreferences()).toEqual([saved]);
    expect(
      JSON.parse(
        storage.getItem(COMMUNICATION_STORAGE_KEYS.personalImagePreferences)
      )
    ).toEqual([saved]);
  });

  test('keeps different patient preferences isolated in the same store', () => {
    const storage = createStorage();
    const patientA = createCommunicationRepository({
      storage,
      now: () => 100,
      createId: prefix => `${prefix}-a`
    });
    patientA.savePersonalImagePreference({
      tileId: 'water',
      image: 'local://patient-a'
    });

    storage.setItem(COMMUNICATION_STORAGE_KEYS.patientId, 'patient-b');
    const patientB = createCommunicationRepository({
      storage,
      now: () => 200
    });
    expect(patientB.loadPersonalImagePreferences()).toEqual([]);
    patientB.savePersonalImagePreference({
      tileId: 'water',
      image: 'local://patient-b'
    });

    storage.setItem(COMMUNICATION_STORAGE_KEYS.patientId, 'patient-a');
    const restoredPatientA = createCommunicationRepository({ storage });
    expect(restoredPatientA.loadPersonalImagePreferences()).toEqual([
      expect.objectContaining({ image: 'local://patient-a' })
    ]);
    expect(
      JSON.parse(
        storage.getItem(COMMUNICATION_STORAGE_KEYS.personalImagePreferences)
      )
    ).toHaveLength(2);
  });

  test('atomically restores the current identity without overwriting another patient', () => {
    const storage = createStorage();
    const patientA = createCommunicationRepository({
      storage,
      now: () => 10,
      createId: prefix => `${prefix}-a`
    });
    patientA.savePersonalImagePreference({
      tileId: 'water',
      boardId: 'food',
      image: 'data:image/png;base64,patient-a'
    });

    storage.setItem(COMMUNICATION_STORAGE_KEYS.patientId, 'patient-b');
    storage.setItem(COMMUNICATION_STORAGE_KEYS.workspaceId, 'workspace-b');
    const patientB = createCommunicationRepository({
      storage,
      now: () => 20
    });
    patientB.savePersonalImagePreference({
      tileId: 'water',
      boardId: 'food',
      image: 'data:image/png;base64,patient-b'
    });

    const restored = patientB.overwritePersonalImagePreferences([
      {
        tileId: 'cup',
        boardId: 'food',
        image: 'data:image/png;base64,restored',
        patientId: 'archived-patient',
        workspaceId: 'archived-workspace',
        createdAt: 2,
        updatedAt: 3
      }
    ]);

    expect(restored).toEqual([
      expect.objectContaining({
        tileId: 'cup',
        patientId: 'patient-b',
        workspaceId: 'workspace-b',
        createdAt: 2,
        updatedAt: 3
      })
    ]);
    storage.setItem(COMMUNICATION_STORAGE_KEYS.patientId, 'patient-a');
    storage.setItem(COMMUNICATION_STORAGE_KEYS.workspaceId, 'workspace-a');
    expect(
      createCommunicationRepository({ storage }).loadPersonalImagePreferences()
    ).toEqual([
      expect.objectContaining({
        tileId: 'water',
        image: 'data:image/png;base64,patient-a'
      })
    ]);
  });

  test('settings overwrite never copies or removes private image data', () => {
    const storage = createStorage();
    const repository = createCommunicationRepository({
      storage,
      now: () => 100,
      createId: prefix => `${prefix}-private`
    });
    repository.savePersonalImagePreference({
      tileId: 'water',
      image: 'local://familiar-cup'
    });
    const privateSnapshot = storage.getItem(
      COMMUNICATION_STORAGE_KEYS.personalImagePreferences
    );

    const normalizedSettings = repository.overwriteCommunicationSettings({
      savedPhrases: [],
      history: []
    });

    expect(normalizedSettings).toEqual({
      savedPhrases: [],
      history: []
    });
    expect(
      storage.getItem(COMMUNICATION_STORAGE_KEYS.personalImagePreferences)
    ).toBe(privateSnapshot);
  });

  test('removes only the active patient override and preserves fallback data', () => {
    const repository = createCommunicationRepository({
      storage: createStorage(),
      now: () => 100,
      createId: prefix => `${prefix}-private`
    });
    repository.savePersonalImagePreference({
      tileId: 'water',
      boardId: 'home',
      image: 'local://familiar-cup'
    });

    expect(
      repository.removePersonalImagePreference('water', {
        boardId: 'home'
      })
    ).toBe(true);
    expect(repository.loadPersonalImagePreferences()).toEqual([]);
    expect(
      repository.removePersonalImagePreference('water', {
        boardId: 'home'
      })
    ).toBe(false);
  });

  test('does not write through a future schema', () => {
    const storage = createStorage({
      [COMMUNICATION_STORAGE_KEYS.schema]: JSON.stringify({
        schemaVersion: COMMUNICATION_REPOSITORY_SCHEMA_VERSION + 1
      })
    });
    const repository = createCommunicationRepository({ storage });
    const snapshot = storage.snapshot();

    expect(() =>
      repository.savePersonalImagePreference({
        tileId: 'water',
        image: 'local://blocked'
      })
    ).toThrow('newer schema version');
    expect(storage.snapshot()).toEqual(snapshot);
  });
});
