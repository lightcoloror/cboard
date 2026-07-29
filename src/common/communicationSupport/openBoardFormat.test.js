import {
  MAX_OPEN_BOARD_BUTTONS,
  MAX_OPEN_BOARD_DOCUMENTS,
  OPEN_BOARD_IMPORT_BOARD_ID_PREFIX,
  importOpenBoardDocuments,
  isOpenBoardDocument,
  normalizeOpenBoardArchivePath
} from './openBoardFormat';

function createBoard(id, name, extra = {}) {
  return {
    format: 'open-board-0.1',
    id,
    name,
    buttons: [],
    ...extra
  };
}

function createDocuments(boardCount, buttonsPerBoard) {
  return Array.from({ length: boardCount }, (_, boardIndex) => ({
    path: `boards/page-${boardIndex + 1}.obf`,
    board: createBoard(`page-${boardIndex + 1}`, `页面 ${boardIndex + 1}`, {
      buttons: Array.from({ length: buttonsPerBoard }, (_, buttonIndex) => ({
        id: `button-${boardIndex + 1}-${buttonIndex + 1}`,
        label: `词语 ${boardIndex + 1}-${buttonIndex + 1}`
      }))
    })
  }));
}

describe('Open Board Format communication core', () => {
  test('keeps the CBoard validator contract and rejects unsafe archive paths', () => {
    expect(isOpenBoardDocument(createBoard('home', '首页'))).toBe(true);
    expect(
      isOpenBoardDocument({
        ...createBoard('home', '首页'),
        grid: { rows: 1, columns: 2, order: [['yes', null]] }
      })
    ).toBe(true);
    expect(isOpenBoardDocument({ format: 'open-board-0.2', buttons: [] })).toBe(
      false
    );
    expect(normalizeOpenBoardArchivePath('boards\\home.obf')).toBe(
      'boards/home.obf'
    );
    expect(normalizeOpenBoardArchivePath('../home.obf')).toBe('');
  });

  test('converts linked OBF boards to editable private BoardDTOs', async () => {
    const result = await importOpenBoardDocuments({
      documents: [
        {
          path: 'boards/home.obf',
          board: createBoard('home', '首页', {
            grid: { rows: 1, columns: 2, order: [['water', 'more']] },
            images: [
              {
                id: 'water-image',
                path: 'images/water.png',
                license: '家庭自有图片'
              }
            ],
            sounds: [
              {
                id: 'water-sound',
                path: 'sounds/water.mp3',
                content_type: 'audio/mpeg'
              }
            ],
            buttons: [
              {
                id: 'water',
                label: '水',
                image_id: 'water-image',
                sound_id: 'water-sound',
                background_color: '#fff176',
                ext_cboard_communication_synonyms: ['喝水']
              },
              {
                id: 'more',
                label: '更多',
                load_board: { path: 'boards/more.obf' }
              }
            ]
          })
        },
        {
          path: 'boards/more.obf',
          board: createBoard('more', '更多', {
            buttons: [{ id: 'help', label: '帮帮我' }]
          })
        }
      ],
      resolveImage: async image => `wxfile://imported/${image.path}`,
      resolveSound: async sound => `wxfile://imported/${sound.path}`
    });

    expect(result.diagnostics).toEqual(
      expect.objectContaining({
        importedBoardCount: 2,
        importedTileCount: 3,
        unresolvedImageCount: 0,
        unresolvedSoundCount: 0
      })
    );
    expect(result.boards[0].id).toMatch(
      new RegExp(`^${OPEN_BOARD_IMPORT_BOARD_ID_PREFIX}`)
    );
    expect(result.boards[0].category).toBe('device-private');
    expect(result.boards[0].layout.tileIds).toEqual(['water', 'more']);
    expect(result.boards[0].tiles[0]).toEqual(
      expect.objectContaining({
        image: 'wxfile://imported/images/water.png',
        sound: 'wxfile://imported/sounds/water.mp3',
        communication: expect.objectContaining({ synonyms: ['喝水'] }),
        pictogramAttribution: expect.objectContaining({
          provider: 'device-private',
          license: '家庭自有图片'
        })
      })
    );
    expect(result.boards[0].tiles[1].loadBoardId).toBe(result.boards[1].id);
  });

  test('keeps supported inline and remote sounds without a custom resolver', async () => {
    const result = await importOpenBoardDocuments({
      documents: [
        {
          path: 'boards/voice.obf',
          board: createBoard('voice', '声音', {
            sounds: [
              {
                id: 'inline',
                data: 'data:audio/mpeg;base64,SUQz'
              },
              {
                id: 'remote',
                url: 'https://cdn.example.test/remote.mp3'
              }
            ],
            buttons: [
              { id: 'one', label: '一', sound_id: 'inline' },
              { id: 'two', label: '二', sound_id: 'remote' }
            ]
          })
        }
      ]
    });

    expect(result.boards[0].tiles.map(tile => tile.sound)).toEqual([
      'data:audio/mpeg;base64,SUQz',
      'https://cdn.example.test/remote.mp3'
    ]);
  });

  test('skips conflicts on request and excludes malformed buttons', async () => {
    const document = {
      path: 'boards/daily.obf',
      board: createBoard('daily', '日常', {
        buttons: [
          { id: 'valid', label: '吃饭' },
          { id: 'blank', label: '' },
          { id: 'valid', label: '重复 ID' }
        ]
      })
    };
    const first = await importOpenBoardDocuments({ documents: [document] });
    const skipped = await importOpenBoardDocuments({
      documents: [document],
      existingBoards: first.boards,
      conflictStrategy: 'skip'
    });

    expect(first.boards[0].tiles).toHaveLength(1);
    expect(first.diagnostics.skippedMalformedButtonCount).toBe(2);
    expect(skipped.boards).toEqual([]);
    expect(skipped.diagnostics.conflictBoardCount).toBe(1);
  });

  test('imports bounded full vocabularies larger than the former limits', async () => {
    const result = await importOpenBoardDocuments({
      documents: createDocuments(120, 50)
    });

    expect(result.boards).toHaveLength(120);
    expect(result.diagnostics.importedTileCount).toBe(6000);
    expect(MAX_OPEN_BOARD_DOCUMENTS).toBe(500);
    expect(MAX_OPEN_BOARD_BUTTONS).toBe(20000);
  });

  test('keeps full-vocabulary document and button limits finite', async () => {
    await expect(
      importOpenBoardDocuments({
        documents: createDocuments(MAX_OPEN_BOARD_DOCUMENTS + 1, 0)
      })
    ).rejects.toThrow('too many boards');

    await expect(
      importOpenBoardDocuments({
        documents: createDocuments(1, MAX_OPEN_BOARD_BUTTONS + 1)
      })
    ).rejects.toThrow('too many buttons');
  });
});
