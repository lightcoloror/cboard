import {
  PUBLIC_BOARD_IMPORT_PREFIX,
  PUBLIC_BOARD_UNKNOWN_LICENSE,
  importPublicBoardBundle,
  isPublicBoardBundle
} from './publicBoardLibrary';

function bundle() {
  return {
    format: 'cboard-public-board-bundle',
    contractVersion: 1,
    rootBoardId: 'root',
    source: 'cboard-public',
    sourceUrl: 'https://github.com/cboard-org/cboard',
    licenseStatus: 'unknown',
    warnings: ['Verify image rights.'],
    data: [
      {
        id: 'root',
        name: '公开首页',
        author: '照护者',
        tiles: [
          {
            id: 'drink',
            label: '喝水',
            image: 'https://cdn.example.test/drink.png',
            offlineImagePath: '/board/public/root/tile/drink/image',
            loadBoard: 'needs'
          }
        ]
      },
      {
        id: 'needs',
        name: '需求',
        author: '照护者',
        tiles: [{ id: 'help', label: '帮助' }]
      }
    ],
    diagnostics: {
      boardCount: 2,
      tileCount: 2,
      unavailableLinkedBoardCount: 0
    }
  };
}

describe('public CBoard library import', () => {
  test('creates stable private BoardDTOs and remaps linked boards', () => {
    const imported = importPublicBoardBundle(bundle());

    expect(imported.rootBoardId).toBe(`${PUBLIC_BOARD_IMPORT_PREFIX}root`);
    expect(imported.boards.map(board => board.id)).toEqual([
      `${PUBLIC_BOARD_IMPORT_PREFIX}root`,
      `${PUBLIC_BOARD_IMPORT_PREFIX}needs`
    ]);
    expect(imported.boards[0].tiles[0].loadBoardId).toBe(
      `${PUBLIC_BOARD_IMPORT_PREFIX}needs`
    );
    expect(imported.boards[0].tiles[0].image).toBe(
      'https://cdn.example.test/drink.png'
    );
    expect(imported.boards[0].tiles[0].pictogramAttribution).toEqual(
      expect.objectContaining({
        provider: 'cboard',
        license: PUBLIC_BOARD_UNKNOWN_LICENSE,
        author: '照护者'
      })
    );
  });

  test('rejects malformed contracts and missing roots', () => {
    expect(isPublicBoardBundle({ data: [] })).toBe(false);
    expect(() => importPublicBoardBundle({ data: [] })).toThrow(
      'Invalid or unsupported'
    );
    expect(() =>
      importPublicBoardBundle({ ...bundle(), rootBoardId: 'missing' })
    ).toThrow('root board is missing');
  });
});
