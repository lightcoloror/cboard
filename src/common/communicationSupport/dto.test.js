import {
  BOARD_DTO_TYPE,
  COMMUNICATION_DTO_VERSION,
  TILE_DTO_TYPE,
  assertBoardDTO,
  createBoardDTO,
  createTileDTO,
  getBoardDTOTilesInDisplayOrder
} from './dto';

describe('communication support DTO v1', () => {
  test('normalizes a CBoard board and preserves display order and matching data', () => {
    const source = {
      id: 'daily-needs',
      nameKey: 'cboard.board.dailyNeeds',
      communicationCategory: 'needs',
      grid: {
        rows: 2,
        columns: 2,
        order: [['water', 'want'], [null, null]]
      },
      tiles: [
        {
          id: 'want',
          label: '想',
          image: '/symbols/want.svg',
          backgroundColor: '#fff176',
          communicationSynonyms: '需要, 要'
        },
        {
          id: 'water',
          label: '水',
          vocalization: '喝水',
          image: '/symbols/water.svg',
          loadBoard: 'drinks',
          tuyujiaExcludeTokens: '浇水'
        }
      ]
    };

    const board = createBoardDTO(source, {
      resolveName: () => '日常需求'
    });

    expect(board).toEqual(
      expect.objectContaining({
        dtoType: BOARD_DTO_TYPE,
        version: COMMUNICATION_DTO_VERSION,
        id: 'daily-needs',
        name: '日常需求',
        category: 'needs'
      })
    );
    expect(board.layout).toEqual({
      rows: 2,
      columns: 2,
      tileIds: ['water', 'want']
    });
    expect(board.tiles[0]).toEqual(
      expect.objectContaining({
        dtoType: TILE_DTO_TYPE,
        version: COMMUNICATION_DTO_VERSION,
        boardId: 'daily-needs',
        vocalization: '想',
        communication: {
          synonyms: ['需要', '要'],
          excludeTokens: [],
          category: ''
        }
      })
    );
    expect(board.tiles[1].loadBoardId).toBe('drinks');
    expect(board.tiles[1].communication.excludeTokens).toEqual(['浇水']);
    expect(getBoardDTOTilesInDisplayOrder(board).map(tile => tile.id)).toEqual([
      'water',
      'want'
    ]);
  });

  test('creates a detached TileDTO snapshot', () => {
    const source = {
      id: 'water',
      label: '水',
      communicationSynonyms: '饮用水'
    };
    const tile = createTileDTO(source, { boardId: 'needs' });

    source.label = '已改变';
    source.communicationSynonyms = '已改变';

    expect(tile.label).toBe('水');
    expect(tile.communication.synonyms).toEqual(['饮用水']);
  });

  test('rejects missing labels, duplicate ids, and unsupported versions', () => {
    expect(() => createTileDTO({ id: 'empty' }, { boardId: 'root' })).toThrow(
      'TileDTO.label'
    );
    expect(() =>
      createBoardDTO({
        id: 'duplicate',
        name: '重复',
        tiles: [{ id: 'same', label: '一' }, { id: 'same', label: '二' }]
      })
    ).toThrow('unique ids');
    expect(() =>
      assertBoardDTO({
        dtoType: BOARD_DTO_TYPE,
        version: 2,
        id: 'future',
        name: '未来版本',
        layout: { rows: 1, columns: 1, tileIds: [] },
        tiles: []
      })
    ).toThrow('unsupported BoardDTO');
  });
  test('rejects incoherent external board snapshots', () => {
    const board = createBoardDTO({
      id: 'strict',
      name: '严格契约',
      grid: { rows: 1, columns: 2, order: [['one', 'two']] },
      tiles: [{ id: 'one', label: '一' }, { id: 'two', label: '二' }]
    });

    expect(() =>
      assertBoardDTO({
        ...board,
        layout: { ...board.layout, tileIds: ['one', 'one'] }
      })
    ).toThrow('Invalid or unsupported BoardDTO');
    expect(() =>
      assertBoardDTO({
        ...board,
        tiles: [board.tiles[0], { ...board.tiles[1], boardId: 'another-board' }]
      })
    ).toThrow('Invalid or unsupported BoardDTO');
    expect(() =>
      assertBoardDTO({
        ...board,
        layout: { rows: 1, columns: 1, tileIds: ['one', 'two'] }
      })
    ).toThrow('Invalid or unsupported BoardDTO');
  });
});
