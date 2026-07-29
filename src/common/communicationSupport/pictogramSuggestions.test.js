import {
  PICTOGRAM_SUGGESTION_MODES,
  buildExpressionPictogramSuggestions
} from './pictogramSuggestions';
import { createBoardDTO } from './dto';

function createTile(id, category, options = {}) {
  return {
    id,
    label: options.label || id,
    loadBoard: options.loadBoardId || '',
    tuyujiaCategory: category
  };
}

function createBoard(id, tiles) {
  return createBoardDTO({
    id,
    name: id,
    layout: {
      columns: Math.max(1, tiles.length),
      rows: 1,
      tileIds: tiles.map(tile => tile.id)
    },
    tiles
  });
}

const rootBoard = createBoard('root', [
  createTile('folder', 'navigation', {
    label: '饮食',
    loadBoardId: 'food'
  })
]);
const foodBoard = createBoard('food', [
  createTile('water', 'drink', { label: '水' }),
  createTile('tea', 'drink', { label: '茶' }),
  createTile('juice', 'drink', { label: '果汁' }),
  createTile('rice', 'food', { label: '米饭' })
]);
const [water, tea, juice, rice] = foodBoard.tiles;
const folder = rootBoard.tiles[0];
const boards = [rootBoard, foodBoard];

describe('expression pictogram suggestions', () => {
  test('shows recently used expression tiles when the sequence is empty', () => {
    const result = buildExpressionPictogramSuggestions(boards, [], {
      usageByTileKey: {
        'food:water': { count: 2, lastUsedAt: 200 },
        'food:tea': { count: 5, lastUsedAt: 100 },
        'root:folder': { count: 99, lastUsedAt: 999 }
      }
    });

    expect(result.mode).toBe(PICTOGRAM_SUGGESTION_MODES.recent);
    expect(result.tiles.map(tile => tile.id)).toEqual(['water', 'tea']);
  });

  test('suggests popular tiles from the last selected category', () => {
    const result = buildExpressionPictogramSuggestions(boards, [water], {
      usageByTileKey: {
        'food:tea': { count: 2, lastUsedAt: 100 },
        'food:juice': { count: 4, lastUsedAt: 50 },
        'food:rice': { count: 20, lastUsedAt: 500 }
      }
    });

    expect(result).toEqual({
      mode: PICTOGRAM_SUGGESTION_MODES.next,
      category: 'drink',
      tiles: [juice, tea]
    });
  });

  test('excludes every already selected tile and respects the limit', () => {
    const result = buildExpressionPictogramSuggestions(
      boards,
      [water, tea],
      {},
      { limit: 1 }
    );

    expect(result.tiles).toEqual([juice]);
  });

  test('resolves legacy output without boardId through the active board', () => {
    const result = buildExpressionPictogramSuggestions(
      boards,
      [{ id: 'water', label: '水' }],
      {},
      { activeBoardId: 'food' }
    );

    expect(result.category).toBe('drink');
    expect(result.tiles.map(tile => tile.id)).toEqual(['tea', 'juice']);
  });

  test('does not invent recent suggestions before any tile was used', () => {
    expect(buildExpressionPictogramSuggestions(boards, [], {}).tiles).toEqual(
      []
    );
  });
});
