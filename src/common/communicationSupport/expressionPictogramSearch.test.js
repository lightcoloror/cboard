import { createBoardDTO } from './dto';
import {
  EXPRESSION_PICTOGRAM_MATCH_TYPES,
  normalizeExpressionPictogramSearchQuery,
  searchExpressionPictograms
} from './expressionPictogramSearch';

function createBoard(id, name, tiles) {
  return createBoardDTO({
    id,
    name,
    layout: {
      columns: Math.max(1, tiles.length),
      rows: 1,
      tileIds: tiles.map(tile => tile.id)
    },
    tiles
  });
}

const boards = [
  createBoard('root', '首页', [
    {
      id: 'folder',
      label: '汤匙',
      loadBoard: 'food'
    }
  ]),
  createBoard('food', '餐具', [
    {
      id: 'spoon',
      label: '勺子',
      communication: {
        synonyms: ['勺', '汤匙'],
        relatedTerms: ['吃饭']
      }
    },
    {
      id: 'blocked-spoon',
      label: '汤勺图',
      communication: {
        synonyms: ['汤匙'],
        excludeTokens: ['汤匙']
      }
    },
    {
      id: 'related-only',
      label: '吃饭',
      communication: {
        relatedTerms: ['汤匙']
      }
    }
  ]),
  createBoard('drinks', '饮品', [
    { id: 'water', label: '水' },
    {
      id: 'cup',
      label: '杯子',
      communication: { synonyms: ['水'] }
    },
    { id: 'water-cup', label: '水杯' }
  ])
];

describe('expression pictogram search', () => {
  test('normalizes whitespace, width, and letter case', () => {
    expect(normalizeExpressionPictogramSearchQuery('  ＷＡＴＥＲ   Cup ')).toBe(
      'water cup'
    );
  });

  test('searches every board by Chinese synonyms without returning folders', () => {
    const result = searchExpressionPictograms(boards, ' 汤匙 ');

    expect(result.query).toBe('汤匙');
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toEqual(
      expect.objectContaining({
        boardId: 'food',
        boardName: '餐具',
        matchType: EXPRESSION_PICTOGRAM_MATCH_TYPES.exactSynonym,
        matchedText: '汤匙'
      })
    );
    expect(result.matches[0].tile.id).toBe('spoon');
  });

  test('does not promote related terms or candidates excluded for the query', () => {
    const result = searchExpressionPictograms(boards, '汤匙');

    expect(result.matches.map(match => match.tile.id)).toEqual(['spoon']);
  });

  test('ranks exact labels before exact synonyms and label prefixes', () => {
    const result = searchExpressionPictograms(boards, '水');

    expect(result.matches.map(match => match.tile.id)).toEqual([
      'water',
      'cup',
      'water-cup'
    ]);
    expect(result.matches.map(match => match.matchType)).toEqual([
      EXPRESSION_PICTOGRAM_MATCH_TYPES.exactLabel,
      EXPRESSION_PICTOGRAM_MATCH_TYPES.exactSynonym,
      EXPRESSION_PICTOGRAM_MATCH_TYPES.labelPrefix
    ]);
  });

  test('returns no catalog scan results for an empty query or zero limit', () => {
    expect(searchExpressionPictograms(boards, '  ').matches).toEqual([]);
    expect(
      searchExpressionPictograms(boards, '水', { limit: 0 }).matches
    ).toEqual([]);
  });

  test('caps results at the requested limit while preserving catalog order', () => {
    expect(
      searchExpressionPictograms(boards, '水', { limit: 2 }).matches.map(
        match => match.tile.id
      )
    ).toEqual(['water', 'cup']);
  });
});
