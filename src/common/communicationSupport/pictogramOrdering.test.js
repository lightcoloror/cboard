import {
  getManualPictogramOrder,
  getPictogramUsageCount,
  movePictogramManualOrder,
  normalizePictogramOrderingState,
  recordPictogramUsage,
  sortPictogramsForDisplay
} from './pictogramOrdering';

const tiles = [
  { id: 'folder', label: '饮食', loadBoard: 'food' },
  { id: 'water', label: '水' },
  { id: 'rice', label: '米饭' },
  { id: 'apple', label: '苹果' }
];

describe('pictogram ordering', () => {
  test('uses fixed manual order by default and restores a saved override', () => {
    const state = {
      manualOrderByBoard: {
        home: ['folder', 'apple', 'water', 'rice']
      }
    };

    expect(
      sortPictogramsForDisplay(tiles, 'manual', state, 'home').map(
        tile => tile.id
      )
    ).toEqual(['folder', 'apple', 'water', 'rice']);
  });

  test('sorts by actual usage with manual order as the stable tiebreaker', () => {
    let state = normalizePictogramOrderingState({
      manualOrderByBoard: {
        home: ['folder', 'apple', 'water', 'rice']
      }
    });
    state = recordPictogramUsage(state, 'home', 'water', 100);
    state = recordPictogramUsage(state, 'home', 'rice', 200);
    state = recordPictogramUsage(state, 'home', 'rice', 300);

    expect(
      sortPictogramsForDisplay(tiles, 'popularity', state, 'home').map(
        tile => tile.id
      )
    ).toEqual(['folder', 'rice', 'water', 'apple']);
    expect(getPictogramUsageCount(state, 'home', 'rice')).toBe(2);
  });

  test('moves only expression tiles and keeps navigation positions stable', () => {
    const state = movePictogramManualOrder(tiles, {}, 'home', 'rice', 'up');

    expect(getManualPictogramOrder(tiles, state, 'home')).toEqual([
      'folder',
      'rice',
      'water',
      'apple'
    ]);
    expect(
      movePictogramManualOrder(tiles, state, 'home', 'folder', 'down')
    ).toEqual(state);
  });

  test('keeps manual order and usage counters independent', () => {
    const ordered = movePictogramManualOrder(tiles, {}, 'home', 'apple', 'up');
    const used = recordPictogramUsage(ordered, 'home', 'water', 456);

    expect(getManualPictogramOrder(tiles, used, 'home')).toEqual([
      'folder',
      'water',
      'apple',
      'rice'
    ]);
    expect(used.usageByTileKey['home:water']).toEqual({
      count: 1,
      lastUsedAt: 456
    });
  });

  test('normalizes malformed persisted values without throwing', () => {
    expect(
      normalizePictogramOrderingState({
        manualOrderByBoard: { home: ['water', '', 'water'] },
        usageByTileKey: {
          'home:water': { count: '2.8', lastUsedAt: '123' },
          broken: { count: -1 }
        }
      })
    ).toEqual({
      schemaVersion: 1,
      manualOrderByBoard: { home: ['water'] },
      usageByTileKey: {
        'home:water': { count: 2, lastUsedAt: 123 }
      }
    });
  });
});
