import {
  BOARD_DTO_TYPE,
  COMMUNICATION_DTO_VERSION,
  TILE_DTO_TYPE,
  assertTileDTO,
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
          communicationSynonyms: '需要, 要',
          communicationRelatedTerms: '选择,愿望'
        },
        {
          id: 'water',
          label: '水',
          vocalization: '喝水',
          image: '/symbols/water.svg',
          sound: 'https://cdn.example.test/water.mp3',
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
          relatedTerms: ['选择', '愿望'],
          excludeTokens: [],
          category: ''
        }
      })
    );
    expect(board.tiles[1].loadBoardId).toBe('drinks');
    expect(board.tiles[1].sound).toBe('https://cdn.example.test/water.mp3');
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
    expect(tile.communication.relatedTerms).toEqual([]);
  });

  test('accepts legacy TileDTO v1 snapshots without a sound field', () => {
    const tile = createTileDTO(
      { id: 'water', label: '水' },
      { boardId: 'needs' }
    );
    const { sound, ...legacyTile } = tile;

    expect(sound).toBe('');
    expect(() => assertTileDTO(legacyTile)).not.toThrow();
  });

  test('derives traceable attribution for a bundled CBoard pictogram', () => {
    const tile = createTileDTO(
      {
        id: 'water',
        label: '水',
        image: '/symbols/mulberry/water.svg'
      },
      { boardId: 'needs' }
    );

    expect(tile.pictogramAttribution).toEqual(
      expect.objectContaining({
        provider: 'mulberry',
        license: 'CC BY-SA 4.0'
      })
    );
  });

  test('preserves CBoard concept identity and matcher hints across DTO boundaries', () => {
    const tile = createTileDTO(
      {
        id: 'want',
        labelKey: 'cboard.symbol.iWant',
        label: '我想',
        image: '/symbols/want.svg'
      },
      { boardId: 'actions' }
    );

    expect(tile.keyPath).toBe('cboard.symbol.iWant');
    expect(tile.communication.synonyms).toEqual(
      expect.arrayContaining(['我想', '希望'])
    );
    expect(tile.communication.category).toBe('actions');
  });

  test('can calibrate official default labels without replacing custom labels', () => {
    const source = {
      id: 'vomit',
      labelKey: 'symbol.healthcareMedicalConditions.toVomit',
      label: '进入番茄',
      vocalization: '进入番茄',
      image: '/symbols/vomit.svg'
    };
    const calibrated = createTileDTO(source, {
      boardId: 'medical',
      conceptProfileLabelKeys: ['symbol.healthcareMedicalConditions.toVomit']
    });
    const custom = createTileDTO(
      { ...source, label: '我的专用图', vocalization: '我的专用图' },
      { boardId: 'medical' }
    );

    expect(calibrated.label).toBe('想吐');
    expect(calibrated.vocalization).toBe('想吐');
    expect(calibrated.communication.synonyms).toEqual(
      expect.arrayContaining(['恶心', '呕吐', '反胃'])
    );
    expect(custom.label).toBe('我的专用图');
    expect(custom.vocalization).toBe('我的专用图');
  });

  test('can synchronize a reviewed translated label without changing other vocalizations', () => {
    const source = {
      id: 'milk',
      labelKey: 'symbol.drinkType.milk',
      label: '牛肉',
      vocalization: '牛肉',
      image: '/symbols/milk.svg'
    };
    const synchronized = createTileDTO(source, {
      boardId: 'drinks',
      resolveLabel: () => '牛奶',
      synchronizeVocalizationLabelKeys: ['symbol.drinkType.milk']
    });
    const preserved = createTileDTO(source, {
      boardId: 'drinks',
      resolveLabel: () => '牛奶'
    });

    expect(synchronized.label).toBe('牛奶');
    expect(synchronized.vocalization).toBe('牛奶');
    expect(preserved.label).toBe('牛奶');
    expect(preserved.vocalization).toBe('牛肉');
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

  test('preserves short-video media while accepting legacy image-only tiles', () => {
    const videoTile = createTileDTO(
      {
        id: 'drink-water-video',
        label: '喝水',
        image: 'wxfile://saved/drink-water-poster.jpg',
        video: 'wxfile://saved/drink-water.mp4',
        mediaType: 'video'
      },
      { boardId: 'needs' }
    );
    const gifTile = createTileDTO(
      { id: 'wave', label: '挥手', image: '/symbols/wave.gif' },
      { boardId: 'actions' }
    );
    const { mediaType, video, ...legacyTile } = createTileDTO(
      { id: 'water', label: '水', image: '/symbols/water.svg' },
      { boardId: 'needs' }
    );

    expect(videoTile).toEqual(
      expect.objectContaining({
        mediaType: 'video',
        video: 'wxfile://saved/drink-water.mp4',
        image: 'wxfile://saved/drink-water-poster.jpg'
      })
    );
    expect(gifTile.mediaType).toBe('gif');
    expect(mediaType).toBe('image');
    expect(video).toBe('');
    expect(() => assertTileDTO(legacyTile)).not.toThrow();
    expect(() => assertTileDTO({ ...videoTile, video: '' })).toThrow(
      'Invalid or unsupported TileDTO'
    );
  });

  test('preserves short-video media while accepting legacy image-only tiles', () => {
    const videoTile = createTileDTO(
      {
        id: 'drink-water-video',
        label: '喝水',
        image: 'wxfile://saved/drink-water-poster.jpg',
        video: 'wxfile://saved/drink-water.mp4',
        mediaType: 'video'
      },
      { boardId: 'needs' }
    );
    const gifTile = createTileDTO(
      { id: 'wave', label: '挥手', image: '/symbols/wave.gif' },
      { boardId: 'actions' }
    );
    const { mediaType, video, ...legacyTile } = createTileDTO(
      { id: 'water', label: '水', image: '/symbols/water.svg' },
      { boardId: 'needs' }
    );

    expect(videoTile).toEqual(
      expect.objectContaining({
        mediaType: 'video',
        video: 'wxfile://saved/drink-water.mp4',
        image: 'wxfile://saved/drink-water-poster.jpg'
      })
    );
    expect(gifTile.mediaType).toBe('gif');
    expect(mediaType).toBe('image');
    expect(video).toBe('');
    expect(() => assertTileDTO(legacyTile)).not.toThrow();
    expect(() => assertTileDTO({ ...videoTile, video: '' })).toThrow(
      'Invalid or unsupported TileDTO'
    );
  });
});
