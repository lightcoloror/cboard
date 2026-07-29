import {
  buildCommunicationSavedPhraseSyncPayload,
  mergeVersionedCommunicationSavedPhrases,
  normalizeSavedPhraseTombstones
} from './savedPhraseSync';

function phrase(overrides = {}) {
  return {
    id: 'phrase-water',
    sentence: '我要喝水',
    output: [{ id: 'water', label: '水', image: '/water.png' }],
    usageCount: 1,
    createdAt: 100,
    lastUsedAt: 100,
    updatedAt: 100,
    ...overrides
  };
}

describe('versioned saved phrase sync', () => {
  test('builds a base-version payload and removes device-private image data', () => {
    const payload = buildCommunicationSavedPhraseSyncPayload([
      phrase({
        serverVersion: 3,
        conflicted: true,
        output: [
          {
            id: 'device_private_cup',
            label: '家庭杯子',
            image: 'wxfile://private/cup.png',
            source: 'user'
          },
          { id: 'water', label: '水', image: '/water.png' }
        ]
      })
    ]);

    expect(payload).toEqual([
      expect.objectContaining({
        id: 'phrase-water',
        baseVersion: 3,
        output: [
          { label: '家庭杯子' },
          expect.objectContaining({ id: 'water', label: '水' })
        ]
      })
    ]);
    expect(payload[0]).not.toHaveProperty('serverVersion');
    expect(payload[0]).not.toHaveProperty('conflicted');
    expect(JSON.stringify(payload)).not.toContain('wxfile:');
    expect(JSON.stringify(payload)).not.toContain('device_private_cup');
  });

  test('keeps the newer local edit after a server conflict and advances its base version', () => {
    const merged = mergeVersionedCommunicationSavedPhrases(
      [
        phrase({
          sentence: '本机新文字',
          updatedAt: 300,
          serverVersion: 1
        })
      ],
      [
        phrase({
          sentence: '云端文字',
          updatedAt: 200,
          serverVersion: 2,
          conflicted: true
        })
      ]
    );

    expect(merged).toEqual(
      expect.objectContaining({
        conflictCount: 1,
        items: [
          expect.objectContaining({
            sentence: '本机新文字',
            serverVersion: 2,
            baseVersion: 2,
            conflicted: true
          })
        ]
      })
    );
  });

  test('keeps the newer remote edit after a conflict without losing conflict visibility', () => {
    const merged = mergeVersionedCommunicationSavedPhrases(
      [
        phrase({
          sentence: '本机旧文字',
          updatedAt: 150,
          serverVersion: 1
        })
      ],
      [
        phrase({
          sentence: '云端新文字',
          updatedAt: 250,
          serverVersion: 2,
          conflicted: true
        })
      ]
    );

    expect(merged.items[0]).toEqual(
      expect.objectContaining({
        sentence: '云端新文字',
        serverVersion: 2,
        conflicted: true
      })
    );
    expect(merged.conflictCount).toBe(1);
  });

  test('lets server tombstones remove stale local phrases and deduplicates tombstones by version', () => {
    const tombstones = normalizeSavedPhraseTombstones([
      {
        id: 'phrase-water',
        deletedAt: 200,
        deletedBy: 'account-1',
        serverVersion: 2
      },
      {
        id: 'phrase-water',
        deletedAt: 300,
        deletedBy: 'account-1',
        serverVersion: 3
      }
    ]);
    const merged = mergeVersionedCommunicationSavedPhrases(
      [phrase({ serverVersion: 1 })],
      [],
      tombstones
    );

    expect(tombstones).toEqual([
      expect.objectContaining({
        id: 'phrase-water',
        serverVersion: 3
      })
    ]);
    expect(merged.items).toEqual([]);
    expect(merged.tombstones).toEqual(tombstones);
  });

  test('clears a previous conflict after the server accepts the same phrase', () => {
    const merged = mergeVersionedCommunicationSavedPhrases(
      [
        phrase({
          sentence: '已重试文字',
          updatedAt: 300,
          serverVersion: 2,
          conflicted: true
        })
      ],
      [
        phrase({
          sentence: '已重试文字',
          updatedAt: 300,
          serverVersion: 3
        })
      ]
    );

    expect(merged.conflictCount).toBe(0);
    expect(merged.items[0]).toEqual(
      expect.objectContaining({
        sentence: '已重试文字',
        serverVersion: 3
      })
    );
    expect(merged.items[0]).not.toHaveProperty('conflicted');
  });
});
