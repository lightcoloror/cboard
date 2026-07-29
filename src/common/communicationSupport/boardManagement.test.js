import {
  PERSONAL_COMMUNICATION_BOARD_LINK_ID_PREFIX,
  PERSONAL_COMMUNICATION_BOARD_ID_PREFIX,
  addCommunicationBoardLink,
  addPersonalCommunicationBoardLink,
  createPersonalCommunicationBoard,
  isPersonalCommunicationBoard,
  moveCommunicationBoard,
  removeCommunicationBoardLink,
  removePersonalCommunicationBoardLink,
  removePersonalCommunicationBoard,
  renamePersonalCommunicationBoard,
  wouldCreateCommunicationBoardLinkCycle
} from './boardManagement';
import { createBoardDTO } from './dto';

function builtInBoards() {
  return [
    createBoardDTO({
      id: 'root',
      name: '首页',
      tiles: [{ id: 'water', label: '水' }]
    }),
    createBoardDTO({
      id: 'food',
      name: '饮食',
      tiles: [{ id: 'rice', label: '米饭' }]
    })
  ];
}

describe('communication board management', () => {
  test('creates a normalized empty personal board without mutating CBoard fixtures', () => {
    const source = builtInBoards();
    const result = createPersonalCommunicationBoard(source, {
      id: `${PERSONAL_COMMUNICATION_BOARD_ID_PREFIX}family`,
      name: '  我的   家人  ',
      columns: 4
    });

    expect(result.boards).not.toBe(source);
    expect(source).toHaveLength(2);
    expect(result.board).toEqual(
      expect.objectContaining({
        id: 'device_private_board_family',
        name: '我的 家人',
        category: 'device-private',
        layout: {
          columns: 4,
          rows: 1,
          tileIds: []
        },
        tiles: []
      })
    );
    expect(isPersonalCommunicationBoard(result.board)).toBe(true);
  });

  test('rejects duplicate names, duplicate ids and ids outside the private namespace', () => {
    const source = builtInBoards();

    expect(() =>
      createPersonalCommunicationBoard(source, {
        id: 'custom',
        name: '家人'
      })
    ).toThrow('private prefix');
    expect(() =>
      createPersonalCommunicationBoard(source, {
        id: 'device_private_board_food',
        name: '饮食'
      })
    ).toThrow('Board name already exists');
    expect(() =>
      createPersonalCommunicationBoard(
        [
          ...source,
          createBoardDTO({
            id: 'device_private_board_food',
            name: '个人饮食',
            tiles: []
          })
        ],
        {
          id: 'device_private_board_food',
          name: '另一个板块'
        }
      )
    ).toThrow('Board id already exists');
  });

  test('renames only personal boards and keeps the original snapshot unchanged', () => {
    const created = createPersonalCommunicationBoard(builtInBoards(), {
      id: 'device_private_board_family',
      name: '家人'
    }).boards;
    const renamed = renamePersonalCommunicationBoard(
      created,
      'device_private_board_family',
      '熟悉的人'
    );

    expect(renamed).not.toBe(created);
    expect(created[2].name).toBe('家人');
    expect(renamed[2].name).toBe('熟悉的人');
    expect(() =>
      renamePersonalCommunicationBoard(created, 'food', '餐饮')
    ).toThrow('cannot be renamed');
  });

  test('keeps managed navigation labels aligned when a personal board is renamed', () => {
    const created = createPersonalCommunicationBoard(builtInBoards(), {
      id: 'device_private_board_family',
      name: '家人'
    }).boards;
    const linked = addCommunicationBoardLink(created, {
      sourceBoardId: 'root',
      targetBoardId: 'device_private_board_family',
      tileId: 'device_private_link_family'
    }).boards;
    const renamed = renamePersonalCommunicationBoard(
      linked,
      'device_private_board_family',
      '熟悉的人'
    );
    const navigationTile = renamed[0].tiles.find(
      tile => tile.loadBoardId === 'device_private_board_family'
    );

    expect(linked[0].tiles[1].label).toBe('家人');
    expect(navigationTile.label).toBe('熟悉的人');
    expect(navigationTile.vocalization).toBe('熟悉的人');
  });

  test('moves boards up and down while preserving each BoardDTO', () => {
    const source = createPersonalCommunicationBoard(builtInBoards(), {
      id: 'device_private_board_family',
      name: '家人'
    }).boards;
    const movedUp = moveCommunicationBoard(
      source,
      'device_private_board_family',
      'up'
    );
    const movedBack = moveCommunicationBoard(
      movedUp,
      'device_private_board_family',
      'down'
    );

    expect(movedUp.map(board => board.id)).toEqual([
      'root',
      'device_private_board_family',
      'food'
    ]);
    expect(movedBack.map(board => board.id)).toEqual([
      'root',
      'food',
      'device_private_board_family'
    ]);
    expect(moveCommunicationBoard(source, 'root', 'up')).toBe(source);
  });

  test('adds and removes a personal board navigation tile without mutating its source', () => {
    const source = createPersonalCommunicationBoard(builtInBoards(), {
      id: 'device_private_board_family',
      name: '家人'
    }).boards;
    const result = addPersonalCommunicationBoardLink(source, {
      sourceBoardId: 'device_private_board_family',
      targetBoardId: 'food',
      tileId: `${PERSONAL_COMMUNICATION_BOARD_LINK_ID_PREFIX}food`,
      image: '/assets/food.png'
    });
    const linkedBoard = result.boards.find(
      board => board.id === 'device_private_board_family'
    );

    expect(source[2].tiles).toEqual([]);
    expect(result.tile).toEqual(
      expect.objectContaining({
        id: 'device_private_link_food',
        boardId: 'device_private_board_family',
        label: '饮食',
        vocalization: '饮食',
        image: '/assets/food.png',
        loadBoardId: 'food'
      })
    );
    expect(linkedBoard.layout.tileIds).toEqual(['device_private_link_food']);
    expect(linkedBoard.tiles).toHaveLength(1);

    const removed = removePersonalCommunicationBoardLink(
      result.boards,
      'device_private_board_family',
      'food'
    );
    expect(
      removed.find(board => board.id === 'device_private_board_family').tiles
    ).toEqual([]);
  });

  test('adds managed links to built-in boards without allowing native links to be removed', () => {
    const created = createPersonalCommunicationBoard(builtInBoards(), {
      id: 'device_private_board_family',
      name: '家人'
    }).boards;
    const linked = addCommunicationBoardLink(created, {
      sourceBoardId: 'root',
      targetBoardId: 'device_private_board_family',
      tileId: 'device_private_link_family'
    }).boards;
    const removed = removeCommunicationBoardLink(
      linked,
      'root',
      'device_private_board_family'
    );

    expect(linked[0].tiles.map(tile => tile.id)).toEqual([
      'water',
      'device_private_link_family'
    ]);
    expect(removed[0].tiles.map(tile => tile.id)).toEqual(['water']);

    const nativeLinked = [
      createBoardDTO({
        id: 'root',
        name: '首页',
        tiles: [{ id: 'native-food-link', label: '饮食', loadBoardId: 'food' }]
      }),
      builtInBoards()[1]
    ];
    expect(() =>
      removeCommunicationBoardLink(nativeLinked, 'root', 'food')
    ).toThrow('not found');
  });

  test('rejects built-in sources, duplicate links, self links and cycles', () => {
    const familyBoards = createPersonalCommunicationBoard(builtInBoards(), {
      id: 'device_private_board_family',
      name: '家人'
    }).boards;
    const personalBoards = createPersonalCommunicationBoard(familyBoards, {
      id: 'device_private_board_needs',
      name: '需要'
    }).boards;

    expect(() =>
      addPersonalCommunicationBoardLink(personalBoards, {
        sourceBoardId: 'root',
        targetBoardId: 'food',
        tileId: 'device_private_link_food'
      })
    ).toThrow('cannot be edited');
    expect(() =>
      addPersonalCommunicationBoardLink(personalBoards, {
        sourceBoardId: 'device_private_board_family',
        targetBoardId: 'device_private_board_family',
        tileId: 'device_private_link_self'
      })
    ).toThrow('create a cycle');

    const linked = addPersonalCommunicationBoardLink(personalBoards, {
      sourceBoardId: 'device_private_board_family',
      targetBoardId: 'device_private_board_needs',
      tileId: 'device_private_link_needs'
    }).boards;
    expect(
      wouldCreateCommunicationBoardLinkCycle(
        linked,
        'device_private_board_needs',
        'device_private_board_family'
      )
    ).toBe(true);
    expect(() =>
      addPersonalCommunicationBoardLink(linked, {
        sourceBoardId: 'device_private_board_family',
        targetBoardId: 'device_private_board_needs',
        tileId: 'device_private_link_duplicate'
      })
    ).toThrow('already exists');
    expect(() =>
      addPersonalCommunicationBoardLink(linked, {
        sourceBoardId: 'device_private_board_needs',
        targetBoardId: 'device_private_board_family',
        tileId: 'device_private_link_family'
      })
    ).toThrow('create a cycle');
  });

  test('deletes only empty, unreferenced personal boards', () => {
    const created = createPersonalCommunicationBoard(builtInBoards(), {
      id: 'device_private_board_family',
      name: '家人'
    }).boards;
    const removed = removePersonalCommunicationBoard(
      created,
      'device_private_board_family'
    );

    expect(removed.map(board => board.id)).toEqual(['root', 'food']);
    expect(created).toHaveLength(3);
    expect(() => removePersonalCommunicationBoard(created, 'food')).toThrow(
      'cannot be deleted'
    );

    const nonEmpty = [
      ...builtInBoards(),
      createBoardDTO({
        id: 'device_private_board_family',
        name: '家人',
        tiles: [{ id: 'grandma', label: '奶奶' }]
      })
    ];
    expect(() =>
      removePersonalCommunicationBoard(nonEmpty, 'device_private_board_family')
    ).toThrow('Move or delete all board pictograms first');

    const referenced = createPersonalCommunicationBoard(
      [
        createBoardDTO({
          id: 'root',
          name: '首页',
          tiles: [
            {
              id: 'family-link',
              label: '家人',
              loadBoardId: 'device_private_board_family'
            }
          ]
        })
      ],
      {
        id: 'device_private_board_family',
        name: '家人'
      }
    ).boards;
    expect(() =>
      removePersonalCommunicationBoard(
        referenced,
        'device_private_board_family'
      )
    ).toThrow('still referenced');
  });
});
