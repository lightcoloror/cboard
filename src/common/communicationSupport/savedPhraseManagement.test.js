import {
  addCommunicationSavedPhrase,
  buildCommunicationSavedPhraseExport,
  deleteCommunicationSavedPhrase,
  getCommunicationQuickPhrases,
  importCommunicationSavedPhrases,
  markCommunicationSavedPhraseUsed,
  renameCommunicationSavedPhrase
} from './savedPhraseManagement';

const waterTile = { id: 'water', label: '水', image: '/water.png' };

function phrase(overrides = {}) {
  return {
    id: 'phrase-water',
    sentence: '我要喝水',
    output: [waterTile],
    usageCount: 0,
    createdAt: 100,
    lastUsedAt: 100,
    ...overrides
  };
}

describe('saved phrase management', () => {
  test('adds, renames and deletes a phrase without duplicating its sentence', () => {
    const added = addCommunicationSavedPhrase([], phrase(), { now: () => 100 });
    const duplicate = addCommunicationSavedPhrase(
      added.items,
      phrase({ id: 'another' }),
      { now: () => 101 }
    );
    const renamed = renameCommunicationSavedPhrase(
      added.items,
      'phrase-water',
      '请给我水',
      { now: () => 200 }
    );
    const removed = deleteCommunicationSavedPhrase(
      renamed.items,
      'phrase-water'
    );

    expect(added.changed).toBe(true);
    expect(duplicate).toEqual(
      expect.objectContaining({
        changed: false,
        reason: 'duplicate'
      })
    );
    expect(renamed.item).toEqual(
      expect.objectContaining({
        sentence: '请给我水',
        updatedAt: 200
      })
    );
    expect(removed.items).toEqual([]);
  });

  test('tracks use and returns the six most useful phrases', () => {
    const phrases = Array.from({ length: 8 }, (_, index) =>
      phrase({
        id: `phrase-${index}`,
        sentence: `短语${index}`,
        usageCount: index,
        lastUsedAt: index
      })
    );
    const used = markCommunicationSavedPhraseUsed(phrases, 'phrase-0', {
      now: () => 500
    });
    const quick = getCommunicationQuickPhrases(used.items);

    expect(used.item).toEqual(
      expect.objectContaining({
        usageCount: 1,
        lastUsedAt: 500
      })
    );
    expect(quick).toHaveLength(6);
    expect(quick[0].id).toBe('phrase-7');
  });

  test('round-trips the neutral export and accepts legacy Tuyujia JSON', () => {
    const exported = buildCommunicationSavedPhraseExport([phrase()], {
      now: () => Date.UTC(2026, 6, 17)
    });
    const roundTrip = importCommunicationSavedPhrases(
      JSON.stringify(exported),
      [],
      { availableTileIds: new Set(['water']), now: () => 100 }
    );
    const legacy = importCommunicationSavedPhrases(
      JSON.stringify({
        version: 1,
        appId: 'tuyujia',
        phrases: [
          {
            id: 'legacy',
            sentence: '我要苹果',
            pictogramIds: ['apple', 'missing'],
            usageCount: 2,
            lastUsedAt: 50
          }
        ]
      }),
      [],
      {
        availableTileIds: new Set(['apple']),
        resolveTile: id =>
          id === 'apple' ? { id: 'apple', label: '苹果' } : null,
        now: () => 100
      }
    );

    expect(roundTrip).toEqual(
      expect.objectContaining({
        ok: true,
        addedCount: 1,
        missingPictogramCount: 0
      })
    );
    expect(legacy).toEqual(
      expect.objectContaining({
        ok: true,
        addedCount: 1,

        missingPictogramCount: 1
      })
    );
    expect(legacy.items[0].output).toEqual([
      expect.objectContaining({ id: 'apple', label: '苹果' })
    ]);
  });

  test('keeps a known legacy pictogram id even without a resolver', () => {
    const imported = importCommunicationSavedPhrases(
      {
        version: 1,
        appId: 'tuyujia',
        phrases: [phrase({ pictogramIds: ['water'], output: undefined })]
      },
      [],
      { availableTileIds: new Set(['water']), now: () => 100 }
    );

    expect(imported.missingPictogramCount).toBe(0);
    expect(imported.items[0].output).toEqual([{ id: 'water', label: '' }]);
  });

  test('reports malformed and duplicate imports without replacing local data', () => {
    const malformed = importCommunicationSavedPhrases('{bad', [phrase()]);
    const duplicate = importCommunicationSavedPhrases(
      buildCommunicationSavedPhraseExport([phrase({ id: 'different-id' })]),
      [phrase()]
    );

    expect(malformed).toEqual(
      expect.objectContaining({
        ok: false,
        addedCount: 0
      })
    );
    expect(duplicate).toEqual(
      expect.objectContaining({
        ok: true,
        addedCount: 0,
        skippedCount: 1
      })
    );
  });
});
