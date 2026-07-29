import { createCommunicationRepository } from './repository';

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

describe('communication repository missing tokens', () => {
  test('persists and aggregates unresolved receiver tokens locally', () => {
    let timestamp = 100;
    let id = 0;
    const repository = createCommunicationRepository({
      storage: createMemoryStorage(),
      now: () => ++timestamp,
      createId: prefix => `${prefix}-${++id}`
    });

    repository.recordMissingTokens({
      tokens: ['头晕', '头晕'],
      rawText: '我头晕',
      scene: 'receiver'
    });
    repository.recordMissingTokens({
      tokens: ['头晕'],
      rawText: '还是头晕',
      scene: 'receiver'
    });

    expect(repository.loadMissingTokens()).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^missing_token-/),
        normalizedToken: '头晕',
        status: 'new',
        occurrenceCount: 3,
        scenes: ['receiver'],
        rawTextSamples: ['还是头晕', '我头晕'],
        patientId: expect.stringMatching(/^patient-/),
        workspaceId: expect.stringMatching(/^workspace-/),
        reviewedByCaregiver: false
      })
    ]);
  });

  test('keeps vocabulary-gap evidence outside settings synchronization', () => {
    const repository = createCommunicationRepository({
      storage: createMemoryStorage(),
      now: () => 100,
      createId: prefix => `${prefix}-fixed`
    });

    repository.recordMissingTokens({ tokens: ['头晕'], rawText: '我头晕' });
    repository.overwriteCommunicationSettings({
      savedPhrases: [],
      history: []
    });

    expect(repository.loadMissingTokens()).toHaveLength(1);
    expect(repository.overwriteCommunicationSettings({})).toEqual({
      savedPhrases: [],
      history: []
    });
  });

  test('persists caregiver ignore, restore, and pictogram resolution', () => {
    let timestamp = 100;
    const storage = createMemoryStorage();
    const repository = createCommunicationRepository({
      storage,
      now: () => ++timestamp,
      createId: prefix => `${prefix}-fixed`
    });

    const [missing] = repository.recordMissingTokens({
      tokens: ['头晕'],
      rawText: '我头晕'
    });

    expect(
      repository.reviewMissingToken(missing.id, { status: 'ignored' })
    ).toEqual(
      expect.objectContaining({ status: 'ignored', reviewedByCaregiver: true })
    );
    expect(
      repository.reviewMissingToken(missing.id, { status: 'new' })
    ).toEqual(
      expect.objectContaining({ status: 'new', reviewedByCaregiver: false })
    );
    expect(
      repository.reviewMissingToken(missing.id, {
        status: 'resolved',
        resolvedPictogramId: 'dizzy'
      })
    ).toEqual(
      expect.objectContaining({
        status: 'resolved',
        resolvedPictogramId: 'dizzy',
        source: 'caregiver'
      })
    );

    expect(
      createCommunicationRepository({ storage }).loadMissingTokens()[0]
    ).toEqual(
      expect.objectContaining({
        status: 'resolved',
        resolvedPictogramId: 'dizzy'
      })
    );
  });
});
