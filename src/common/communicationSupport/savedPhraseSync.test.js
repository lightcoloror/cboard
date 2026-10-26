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
  const syntheticPhrases = count => Array.from({ length: count }, (_, index) => phrase({
    id: `synthetic-${index}`, sentence: `合成常用语${index}`, createdAt: 100 + index
  }));

  test.each([99, 100])('uploads all %i synthetic phrases without truncation', count => {
    const entries = syntheticPhrases(count);
    const payload = buildCommunicationSavedPhraseSyncPayload(entries);
    expect(payload.map(item => item.id)).toEqual(entries.map(item => item.id));
    expect(mergeVersionedCommunicationSavedPhrases(entries, entries).items).toHaveLength(count);
  });

  test('rejects an existing 101-item upload without mutating the local snapshots', () => {
    const entries = syntheticPhrases(101);
    const before = JSON.stringify(entries);
    expect(() => buildCommunicationSavedPhraseSyncPayload(entries)).toThrow(/100|容量/);
    expect(JSON.stringify(entries)).toBe(before);
  });

  test('rejects a 99 plus 2 merged overflow, retains inputs, and permits a safe retry', () => {
    const local = syntheticPhrases(99);
    const remote = syntheticPhrases(101).slice(99);
    const before = JSON.stringify({ local, remote });
    expect(() => mergeVersionedCommunicationSavedPhrases(local, remote)).toThrow(/100|容量/);
    expect(JSON.stringify({ local, remote })).toBe(before);
    const retry = mergeVersionedCommunicationSavedPhrases(local, remote, [
      { id: 'synthetic-0', deletedAt: 500, serverVersion: 1 }
    ]);
    expect(retry.items).toHaveLength(100);
    expect(retry.items.some(item => item.id === 'synthetic-0')).toBe(false);
    expect(retry.items.slice(-2).map(item => item.id)).toEqual(remote.map(item => item.id));
    expect(mergeVersionedCommunicationSavedPhrases(local, [...local, remote[0]]).items).toHaveLength(100);
  });

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
