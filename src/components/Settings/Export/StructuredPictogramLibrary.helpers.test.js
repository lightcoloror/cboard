import { buildStructuredPictogramLibraryExport } from './StructuredPictogramLibrary.helpers';

describe('structured pictogram library export', () => {
  test('exports localized concepts, English names, attribution, and nested boards', () => {
    const boards = [
      {
        id: 'home',
        name: '首页',
        tiles: [
          {
            id: 'want',
            label: '我想',
            labelKey: 'cboard.symbol.iWant',
            image: '/symbols/want.svg',
            loadBoard: 'needs',
            communicationSynonyms: '需要'
          }
        ]
      },
      {
        id: 'needs',
        name: '需求',
        tiles: [{ id: 'water', label: '水' }]
      },
      {
        id: 'unlinked',
        name: '不相关',
        tiles: []
      }
    ];
    const result = buildStructuredPictogramLibraryExport({
      boards,
      rootBoard: boards[0],
      intl: {
        locale: 'zh-CN',
        formatMessage: ({ id }) => id
      }
    });

    expect(result.library.boards.map(board => board.id)).toEqual([
      'home',
      'needs'
    ]);
    expect(result.library.concepts[0]).toEqual(
      expect.objectContaining({
        canonicalLabel: '我想',
        canonicalLabelEn: 'I want',
        synonyms: expect.arrayContaining(['需要'])
      })
    );
    expect(result.stats).toEqual(
      expect.objectContaining({
        boardCount: 2,
        boardItemCount: 2,
        conceptCount: 2
      })
    );
  });
});
