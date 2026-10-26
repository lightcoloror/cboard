import {
  COMMUNICATION_REPOSITORY_SCHEMA_VERSION,
  COMMUNICATION_STORAGE_KEYS,
  createCommunicationRepository
} from './repository';
import { createScopedCommunicationStorage } from './scopedCommunicationStorage';

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
  test.each(['{broken', '', '{}', 'null', '[null]'])('preserves unreadable preference list %s through construction and save', raw => {
    const key = COMMUNICATION_STORAGE_KEYS.personalImagePreferences;
    const storage = createStorage({ [key]: raw });
    const repository = createCommunicationRepository({ storage });
    expect(storage.getItem(key)).toBe(raw);
    expect(() => repository.savePersonalImagePreference({ tileId: 'water', image: 'local://new' })).toThrow();
    expect(storage.getItem(key)).toBe(raw);
  });

  test('failed pre-read cannot replace the existing preferences', () => {
    const storage = createStorage();
    const repository = createCommunicationRepository({ storage });
    repository.savePersonalImagePreference({ tileId: 'old', image: 'local://old' });
    const key = COMMUNICATION_STORAGE_KEYS.personalImagePreferences;
    const before = storage.getItem(key), read = storage.getItem;
    storage.getItem = name => { if (name === key) throw new Error('denied'); return read(name); };
    expect(() => repository.savePersonalImagePreference({ tileId: 'new', image: 'local://new' })).toThrow('denied');
    expect(read(key)).toBe(before);
  });

  test('failed write receipt keeps a retry safe without duplicate preferences', () => {
    const storage = createStorage();
    const repository = createCommunicationRepository({ storage, now: () => 100 });
    const key = COMMUNICATION_STORAGE_KEYS.personalImagePreferences;
    const entry = { tileId: 'water', boardId: 'home', image: 'local://new' };
    const read = storage.getItem;
    let reads = 0;
    storage.getItem = name => {
      if (name === key && ++reads === 2) throw new Error('receipt unavailable');
      return read(name);
    };
    expect(() => repository.savePersonalImagePreference(entry)).toThrow('receipt unavailable');
    storage.getItem = read;
    expect(repository.savePersonalImagePreference(entry).image).toBe('local://new');
    expect(JSON.parse(read(key))).toHaveLength(1);
  });

  test.each(['false', 'drop'])('a %s write never confirms success and can retry the same input', failure => {
    const storage = createStorage();
    const repository = createCommunicationRepository({ storage });
    repository.savePersonalImagePreference({ tileId: 'other', image: 'local://other' });
    const key = COMMUNICATION_STORAGE_KEYS.personalImagePreferences, before = storage.getItem(key);
    const write = storage.setItem;
    storage.setItem = (name, value) => name === key ? failure === 'false' ? false : undefined : write(name, value);
    const entry = { tileId: 'water', image: 'local://new' };
    expect(() => repository.savePersonalImagePreference(entry)).toThrow();
    expect(storage.getItem(key)).toBe(before);
    storage.setItem = write;
    expect(repository.savePersonalImagePreference(entry).image).toBe('local://new');
    expect(repository.loadPersonalImagePreferences()).toHaveLength(2);
  });

  test('retry never overwrites a later modification after a failed receipt', () => {
    const storage = createStorage();
    const repository = createCommunicationRepository({ storage, now: () => 100 });
    const key = COMMUNICATION_STORAGE_KEYS.personalImagePreferences;
    const entry = { tileId: 'water', image: 'local://attempt' };
    const read = storage.getItem;
    let reads = 0;
    storage.getItem = name => { if (name === key && ++reads === 2) throw new Error('receipt'); return read(name); };
    expect(() => repository.savePersonalImagePreference(entry)).toThrow('receipt');
    storage.getItem = read;
    repository.savePersonalImagePreference({ tileId: 'water', image: 'local://later' });
    const latest = read(key);
    expect(() => repository.savePersonalImagePreference(entry)).toThrow('后续修改');
    expect(read(key)).toBe(latest);
  });

  test('a scope switch during pre-read cannot write into the next profile', () => {
    const base = createStorage();
    let context = { accountId: 'account-a', familyId: 'family-a', profileId: 'patient-a' };
    const storage = createScopedCommunicationStorage(base, () => context);
    const repository = createCommunicationRepository({ storage });
    const read = storage.getItem;
    storage.getItem = name => {
      const value = read(name);
      if (name === COMMUNICATION_STORAGE_KEYS.personalImagePreferences) context = { accountId: 'account-b', familyId: 'family-b', profileId: 'patient-b' };
      return value;
    };
    expect(() => repository.savePersonalImagePreference({ tileId: 'water', image: 'local://a' })).toThrow('对象已切换');
    expect(Object.keys(base.snapshot()).filter(key => key.endsWith(COMMUNICATION_STORAGE_KEYS.personalImagePreferences))).toEqual([]);
  });

  test('an unconfirmed retry cannot be transferred to another identity', () => {
    const storage = createStorage();
    const repository = createCommunicationRepository({ storage });
    const write = storage.setItem;
    storage.setItem = (name, value) => name === COMMUNICATION_STORAGE_KEYS.personalImagePreferences ? false : write(name, value);
    const entry = { tileId: 'water', image: 'local://a' };
    expect(() => repository.savePersonalImagePreference(entry)).toThrow();
    storage.setItem = write;
    storage.setItem(COMMUNICATION_STORAGE_KEYS.patientId, 'patient-b');
    expect(() => repository.savePersonalImagePreference(entry)).toThrow('未覆盖');
    expect(repository.loadPersonalImagePreferences()).toEqual([]);
  });

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
