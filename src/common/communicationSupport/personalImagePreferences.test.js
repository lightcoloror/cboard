import {
  PERSONAL_IMAGE_PREFERENCE_SCOPE,
  applyPersonalImagePreferencesToBoards,
  applyPersonalImagePreferencesToItems,
  deletePersonalImagePreference,
  getPersonalImagePreferencesForIdentity,
  normalizePersonalImagePreferences,
  upsertPersonalImagePreference
} from './personalImagePreferences';

const identity = { patientId: 'patient-a', workspaceId: 'workspace-a' };

describe('personal image preferences', () => {
  test('normalizes private records and keeps the newest tile override', () => {
    const preferences = normalizePersonalImagePreferences([
      {
        tileId: 'water',
        image: 'local://old-water',
        patientId: identity.patientId,
        workspaceId: identity.workspaceId,
        updatedAt: 10
      },
      {
        tileId: 'water',
        image: 'local://new-water',
        patientId: identity.patientId,
        workspaceId: identity.workspaceId,
        updatedAt: 20
      },
      {
        tileId: 'cloud-only',
        image: 'https://example.test/cloud.png',
        scope: 'cloud',
        patientId: identity.patientId,
        workspaceId: identity.workspaceId
      }
    ]);

    expect(preferences).toEqual([
      expect.objectContaining({
        contractVersion: 1,
        scope: PERSONAL_IMAGE_PREFERENCE_SCOPE,
        tileId: 'water',
        image: 'local://new-water',
        pictogramAttribution: expect.objectContaining({
          provider: 'device-private',
          originalId: 'water'
        })
      })
    ]);
  });

  test('isolates preferences by patient and workspace', () => {
    const preferences = [
      {
        tileId: 'water',
        image: 'local://patient-a',
        patientId: 'patient-a',
        workspaceId: 'workspace-a'
      },
      {
        tileId: 'water',
        image: 'local://patient-b',
        patientId: 'patient-b',
        workspaceId: 'workspace-a'
      }
    ];

    expect(
      getPersonalImagePreferencesForIdentity(preferences, identity)
    ).toEqual([expect.objectContaining({ image: 'local://patient-a' })]);
  });

  test('applies a detached image overlay without mutating source boards', () => {
    const boards = [
      {
        id: 'home',
        tiles: [
          {
            id: 'water',
            boardId: 'home',
            label: 'Water',
            image: 'default://water',
            pictogramAttribution: {
              provider: 'mulberry',
              originalId: 'water',
              name: 'Mulberry Symbols',
              license: 'CC BY-SA 4.0',
              sourceUrl: 'https://mulberrysymbols.org/'
            }
          }
        ]
      }
    ];
    const preferences = upsertPersonalImagePreference(
      [],
      {
        tileId: 'water',
        boardId: 'home',
        labelSnapshot: 'Water',
        image: 'local://familiar-cup'
      },
      { identity, now: () => 100 }
    );
    const applied = applyPersonalImagePreferencesToBoards(
      boards,
      preferences,
      identity
    );

    expect(applied[0].tiles[0].image).toBe('local://familiar-cup');
    expect(applied[0].tiles[0].pictogramAttribution).toEqual(
      expect.objectContaining({
        provider: 'device-private',
        originalId: 'home:water'
      })
    );
    expect(applied[0].tiles[0].attribution).toEqual(
      applied[0].tiles[0].pictogramAttribution
    );
    expect(boards[0].tiles[0].image).toBe('default://water');
    expect(applied[0].tiles[0]).not.toBe(boards[0].tiles[0]);
  });

  test('applies the same override to output snapshots', () => {
    const preferences = upsertPersonalImagePreference(
      [],
      { tileId: 'water', image: 'local://familiar-cup' },
      { identity, now: () => 100 }
    );

    expect(
      applyPersonalImagePreferencesToItems(
        [{ id: 'water', label: 'Water', image: 'default://water' }],
        preferences,
        identity
      )
    ).toEqual([
      expect.objectContaining({
        id: 'water',
        label: 'Water',
        image: 'local://familiar-cup',
        attribution: expect.objectContaining({
          provider: 'device-private'
        })
      })
    ]);
  });

  test('preserves an explicit local provider and usage note', () => {
    const preferences = upsertPersonalImagePreference(
      [],
      {
        tileId: 'water',
        boardId: 'home',
        labelSnapshot: '家里的水杯',
        image: 'local://familiar-cup',
        pictogramAttribution: {
          provider: 'device-private',
          originalId: 'home:water',
          name: '家里的水杯',
          license: '家属提供，仅用于当前设备沟通',
          author: '家属',
          sourceUrl: 'device-private://personal-image/home/water'
        }
      },
      { identity, now: () => 100 }
    );

    expect(preferences[0].pictogramAttribution).toEqual(
      expect.objectContaining({
        provider: 'device-private',
        author: '家属',
        license: '家属提供，仅用于当前设备沟通'
      })
    );
  });

  test('deleting an override restores the default image naturally', () => {
    const boards = [
      {
        id: 'home',
        tiles: [{ id: 'water', label: 'Water', image: 'default://water' }]
      }
    ];
    const preferences = upsertPersonalImagePreference(
      [],
      { tileId: 'water', image: 'local://familiar-cup' },
      { identity, now: () => 100 }
    );
    const deleted = deletePersonalImagePreference(preferences, 'water', {
      identity
    });

    expect(
      applyPersonalImagePreferencesToBoards(boards, deleted, identity)[0]
        .tiles[0].image
    ).toBe('default://water');
  });
});
