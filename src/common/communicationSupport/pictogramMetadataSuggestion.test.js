import {
  applyPictogramMetadataSuggestionToTile,
  appendPersonalPictogramToBoard,
  buildPersonalPictogramTileDTO,
  copyPersonalPictogramToBoard,
  movePersonalPictogramInBoard,
  normalizePictogramMetadataSuggestion,
  removePersonalPictogramFromBoard,
  updatePersonalPictogramInBoards
} from './pictogramMetadataSuggestion';
import { createBoardDTO } from './dto';
import { getCommunicationTileMetadata } from './tileMetadata';

describe('pictogram metadata suggestions', () => {
  test('bounds, de-duplicates and normalizes editable fields', () => {
    expect(
      normalizePictogramMetadataSuggestion({
        label: ' 苹果 ',
        synonyms: ['水果', '水果', '苹果', '', ...Array(10).fill('食物')],
        category: ' 饮食 ',
        provider: 'cboard-api-ai',
        sourceStored: false
      })
    ).toEqual({
      label: '苹果',
      synonyms: ['水果', '食物'],
      category: '饮食',
      provider: 'cboard-api-ai',
      sourceStored: false
    });
  });

  test('fills only empty tile fields without mutating the source', () => {
    const source = { id: 'new', label: '', vocalization: '', type: 'button' };
    const result = applyPictogramMetadataSuggestionToTile(source, {
      label: '苹果',
      synonyms: ['水果'],
      category: '饮食'
    });

    expect(result).not.toBe(source);
    expect(source).toEqual({
      id: 'new',
      label: '',
      vocalization: '',
      type: 'button'
    });
    expect(result.label).toBe('苹果');
    expect(result.vocalization).toBe('苹果');
    expect(getCommunicationTileMetadata(result)).toEqual(
      expect.objectContaining({
        synonyms: '水果',
        category: '饮食'
      })
    );
  });

  test('does not overwrite caregiver edits made while the request is pending', () => {
    const result = applyPictogramMetadataSuggestionToTile(
      {
        label: '奶奶',
        vocalization: '我的奶奶',
        communicationSynonyms: '祖母',
        communicationCategory: '家人'
      },
      {
        label: '人物',
        synonyms: ['家人'],
        category: '人物'
      }
    );

    expect(result.label).toBe('奶奶');
    expect(result.vocalization).toBe('我的奶奶');
    expect(getCommunicationTileMetadata(result)).toEqual(
      expect.objectContaining({
        synonyms: '祖母',
        category: '家人'
      })
    );
  });

  test('creates an attributed private TileDTO and appends it without mutating the board', () => {
    const board = createBoardDTO({
      id: 'food',
      name: '饮食',
      columns: 1,
      tiles: [{ id: 'water', label: '水', image: 'water.png' }]
    });
    const source = [board];
    const tile = buildPersonalPictogramTileDTO({
      id: 'device_private_custom_1',
      boardId: 'food',
      label: '奶奶的苹果',
      vocalization: '我要奶奶的苹果',
      image: 'wxfile://saved/apple.jpg',
      sound: 'wxfile://saved/apple.mp3',
      synonyms: '苹果,水果',
      category: '饮食',
      author: '家属'
    });
    const result = appendPersonalPictogramToBoard(source, 'food', tile);

    expect(result).not.toBe(source);
    expect(board.tiles).toHaveLength(1);
    expect(result[0].tiles).toHaveLength(2);
    expect(result[0].layout).toEqual({
      columns: 1,
      rows: 2,
      tileIds: ['water', 'device_private_custom_1']
    });
    expect(result[0].tiles[1]).toEqual(
      expect.objectContaining({
        label: '奶奶的苹果',
        vocalization: '我要奶奶的苹果',
        image: 'wxfile://saved/apple.jpg',
        sound: 'wxfile://saved/apple.mp3',
        communication: expect.objectContaining({
          synonyms: ['苹果', '水果'],
          category: '饮食'
        }),
        pictogramAttribution: expect.objectContaining({
          provider: 'device-private',
          author: '家属'
        })
      })
    );
  });

  test('rejects unknown boards and duplicate ids', () => {
    const board = createBoardDTO({
      id: 'food',
      name: '饮食',
      tiles: [{ id: 'water', label: '水' }]
    });
    const duplicate = buildPersonalPictogramTileDTO({
      id: 'water',
      boardId: 'food',
      label: '水杯',
      image: 'wxfile://saved/cup.jpg'
    });

    expect(() =>
      appendPersonalPictogramToBoard([board], 'missing', duplicate)
    ).toThrow('already exists');
    expect(() =>
      appendPersonalPictogramToBoard(
        [board],
        'missing',
        buildPersonalPictogramTileDTO({
          id: 'new',
          boardId: 'missing',
          label: '新图',
          image: 'wxfile://saved/new.jpg'
        })
      )
    ).toThrow('Target board was not found');
  });

  test('removes a personal tile and compacts the board layout', () => {
    const board = createBoardDTO({
      id: 'food',
      name: '饮食',
      columns: 1,
      tiles: [{ id: 'water', label: '水' }, { id: 'private', label: '私图' }]
    });
    const result = removePersonalPictogramFromBoard([board], 'food', 'private');

    expect(result[0].tiles.map(tile => tile.id)).toEqual(['water']);
    expect(result[0].layout).toEqual({
      columns: 1,
      rows: 1,
      tileIds: ['water']
    });
  });

  test('updates a personal tile in place without changing its layout position', () => {
    const board = createBoardDTO({
      id: 'food',
      name: '饮食',
      columns: 2,
      tiles: [
        { id: 'water', label: '水' },
        {
          id: 'device_private_custom_1',
          label: '旧苹果',
          image: 'wxfile://saved/apple.jpg'
        },
        { id: 'rice', label: '米饭' }
      ]
    });
    const updatedTile = buildPersonalPictogramTileDTO({
      id: 'device_private_custom_1',
      boardId: 'food',
      label: '奶奶的苹果',
      vocalization: '我要奶奶的苹果',
      image: 'wxfile://saved/apple.jpg',
      synonyms: '水果,红苹果',
      category: '点心',
      author: '家属'
    });

    const result = updatePersonalPictogramInBoards(
      [board],
      'food',
      'food',
      updatedTile
    );

    expect(result).not.toEqual([board]);
    expect(board.tiles[1].label).toBe('旧苹果');
    expect(result[0].layout.tileIds).toEqual([
      'water',
      'device_private_custom_1',
      'rice'
    ]);
    expect(result[0].tiles[1]).toEqual(
      expect.objectContaining({
        label: '奶奶的苹果',
        vocalization: '我要奶奶的苹果',
        communication: expect.objectContaining({
          synonyms: ['水果', '红苹果'],
          category: '点心'
        })
      })
    );
  });

  test('moves a personal tile to another board and rejects unknown source tiles', () => {
    const food = createBoardDTO({
      id: 'food',
      name: '饮食',
      columns: 1,
      tiles: [
        { id: 'water', label: '水' },
        {
          id: 'device_private_custom_1',
          label: '苹果',
          image: 'wxfile://saved/apple.jpg'
        }
      ]
    });
    const family = createBoardDTO({
      id: 'family',
      name: '家人',
      columns: 2,
      tiles: [{ id: 'mother', label: '妈妈' }]
    });
    const movedTile = buildPersonalPictogramTileDTO({
      id: 'device_private_custom_1',
      boardId: 'family',
      label: '奶奶的苹果',
      image: 'wxfile://saved/apple.jpg'
    });

    const result = updatePersonalPictogramInBoards(
      [food, family],
      'food',
      'family',
      movedTile
    );

    expect(result[0].tiles.map(tile => tile.id)).toEqual(['water']);
    expect(result[0].layout).toEqual({
      columns: 1,
      rows: 1,
      tileIds: ['water']
    });
    expect(result[1].layout.tileIds).toEqual([
      'mother',
      'device_private_custom_1'
    ]);
    expect(result[1].tiles[1].boardId).toBe('family');
    expect(() =>
      updatePersonalPictogramInBoards([food, family], 'food', 'family', {
        ...movedTile,
        id: 'missing'
      })
    ).toThrow('Personal pictogram was not found');
  });

  test('copies one private pictogram into another board without duplicating media', () => {
    const food = createBoardDTO({
      id: 'food',
      name: '饮食',
      tiles: [{ id: 'water', label: '水' }]
    });
    const family = createBoardDTO({
      id: 'family',
      name: '家人',
      tiles: [{ id: 'mother', label: '妈妈' }]
    });
    const sourceTile = buildPersonalPictogramTileDTO({
      id: 'device_private_custom_source',
      boardId: 'food',
      label: '奶奶的苹果',
      image: 'wxfile://saved/apple.jpg',
      sound: 'wxfile://saved/apple.mp3',
      synonyms: '苹果,水果',
      category: '家人'
    });
    const withSource = appendPersonalPictogramToBoard(
      [food, family],
      'food',
      sourceTile
    );

    const copied = copyPersonalPictogramToBoard(
      withSource,
      'food',
      sourceTile.id,
      'family',
      'device_private_custom_copy'
    );

    expect(copied.boards[0].tiles.map(tile => tile.id)).toEqual([
      'water',
      sourceTile.id
    ]);
    expect(copied.boards[1].tiles.map(tile => tile.id)).toEqual([
      'mother',
      copied.tile.id
    ]);
    expect(copied.tile).toEqual(
      expect.objectContaining({
        boardId: 'family',
        image: sourceTile.image,
        sound: sourceTile.sound,
        communication: sourceTile.communication,
        pictogramAttribution: sourceTile.pictogramAttribution
      })
    );
    expect(() =>
      copyPersonalPictogramToBoard(
        copied.boards,
        'food',
        sourceTile.id,
        'family',
        'device_private_custom_second_copy'
      )
    ).toThrow('already exists in target board');
    expect(() =>
      copyPersonalPictogramToBoard(
        withSource,
        'food',
        sourceTile.id,
        'food',
        'device_private_custom_same_board'
      )
    ).toThrow('must be different');
  });

  test('moves only a private pictogram within layout order without mutating tiles', () => {
    const board = createBoardDTO({
      id: 'food',
      name: '饮食',
      columns: 2,
      tiles: [{ id: 'water', label: '水' }, { id: 'rice', label: '米饭' }]
    });
    const personal = buildPersonalPictogramTileDTO({
      id: 'device_private_custom_move',
      boardId: 'food',
      label: '奶奶的苹果',
      image: 'wxfile://saved/apple.jpg'
    });
    const source = appendPersonalPictogramToBoard([board], 'food', personal);
    const earlier = movePersonalPictogramInBoard(
      source,
      'food',
      personal.id,
      'earlier'
    );
    const restored = movePersonalPictogramInBoard(
      earlier,
      'food',
      personal.id,
      'later'
    );

    expect(earlier).not.toBe(source);
    expect(source[0].layout.tileIds).toEqual(['water', 'rice', personal.id]);
    expect(earlier[0].layout.tileIds).toEqual(['water', personal.id, 'rice']);
    expect(earlier[0].tiles).toBe(source[0].tiles);
    expect(restored[0].layout.tileIds).toEqual(['water', 'rice', personal.id]);
  });

  test('preserves boundary identity and rejects non-private moves', () => {
    const personal = buildPersonalPictogramTileDTO({
      id: 'device_private_custom_first',
      boardId: 'food',
      label: '苹果',
      image: 'wxfile://saved/apple.jpg'
    });
    const board = createBoardDTO({
      id: 'food',
      name: '饮食',
      tiles: [personal, { id: 'water', label: '水' }]
    });

    expect(
      movePersonalPictogramInBoard([board], 'food', personal.id, 'earlier')
    ).toEqual([board]);
    const source = [board];
    expect(
      movePersonalPictogramInBoard(source, 'food', personal.id, 'earlier')
    ).toBe(source);
    expect(() =>
      movePersonalPictogramInBoard(source, 'food', 'water', 'later')
    ).toThrow('Personal pictogram was not found');
    expect(() =>
      movePersonalPictogramInBoard(source, 'food', personal.id, 'sideways')
    ).toThrow('earlier or later');
  });

  test('creates a private short-video tile with an image poster fallback', () => {
    const tile = buildPersonalPictogramTileDTO({
      id: 'device_private_custom_video_1',
      boardId: 'actions',
      label: '喝水动作',
      image: 'wxfile://saved/drink-poster.jpg',
      mediaType: 'video',
      video: 'wxfile://saved/drink.mp4'
    });

    expect(tile).toEqual(
      expect.objectContaining({
        mediaType: 'video',
        video: 'wxfile://saved/drink.mp4',
        image: 'wxfile://saved/drink-poster.jpg'
      })
    );
  });
});
