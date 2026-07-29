import {
  PICTOGRAM_ORDERING_STORAGE_KEY,
  createPictogramOrderingStore
} from './pictogramOrderingStore';

function createMemoryStorage(initial = {}) {
  const values = { ...initial };
  return {
    getItem: key =>
      Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null,
    setItem: (key, value) => {
      values[key] = value;
    }
  };
}

describe('pictogram ordering store', () => {
  test('persists manual order and actual usage in one local schema', () => {
    const storage = createMemoryStorage();
    const store = createPictogramOrderingStore(storage);
    const tiles = [{ id: 'water' }, { id: 'rice' }];

    store.moveManualOrder(tiles, 'food', 'rice', 'up');
    store.recordUsage('food', 'water', 123);

    expect(store.load()).toEqual({
      schemaVersion: 1,
      manualOrderByBoard: { food: ['rice', 'water'] },
      usageByTileKey: {
        'food:water': { count: 1, lastUsedAt: 123 }
      }
    });
  });

  test('falls back safely when persisted JSON is corrupt', () => {
    const store = createPictogramOrderingStore(
      createMemoryStorage({
        [PICTOGRAM_ORDERING_STORAGE_KEY]: '{broken'
      })
    );

    expect(store.load()).toEqual({
      schemaVersion: 1,
      manualOrderByBoard: {},
      usageByTileKey: {}
    });
  });
});
