import {
  PICTOGRAM_LIBRARY_DTO_TYPE,
  PICTOGRAM_LIBRARY_DTO_VERSION,
  assertPictogramLibraryDTO,
  createPictogramLibraryDTO,
  getPictogramLibraryDTOStats,
  pictogramLibraryDTOToBoards
} from './pictogramLibrary';
import { matchTextToCommunicationTiles } from './symbolMatching';

const ATTRIBUTION = {
  provider: 'arasaac',
  originalId: 'water-1',
  name: 'ARASAAC',
  license: 'CC BY-NC-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  author: 'Sergio Palao',
  authorUrl: 'https://arasaac.org/',
  sourceUrl: 'https://arasaac.org/pictograms/water-1',
  repoKey: 'arasaac'
};

function createBoards() {
  return [
    {
      id: 'home',
      name: '首页',
      columns: 1,
      tiles: [
        {
          id: 'water-home',
          label: '水',
          vocalization: '喝水',
          keyPath: 'symbol.drink.water',
          image: '/symbols/water.svg',
          pictogramAttribution: ATTRIBUTION,
          communicationSynonyms: ['饮用水'],
          communicationRelatedTerms: ['口渴'],
          communicationExcludeTokens: ['浇水'],
          communicationCategory: 'drink'
        }
      ]
    },
    {
      id: 'drinks',
      name: '饮品',
      columns: 1,
      tiles: [
        {
          id: 'water-drinks',
          label: '水',
          keyPath: 'symbol.drink.water',
          image: '/symbols/water.svg',
          pictogramAttribution: ATTRIBUTION,
          communicationSynonyms: ['白水'],
          communicationCategory: 'drink'
        }
      ]
    }
  ];
}

describe('structured pictogram library DTO v1', () => {
  test('separates concepts, symbol assets, boards, and placements', () => {
    const library = createPictogramLibraryDTO(createBoards(), {
      locale: 'zh-CN',
      resolveEnglishName: tile =>
        tile.keyPath === 'symbol.drink.water' ? 'water' : ''
    });

    expect(library).toEqual(
      expect.objectContaining({
        dtoType: PICTOGRAM_LIBRARY_DTO_TYPE,
        version: PICTOGRAM_LIBRARY_DTO_VERSION,
        locale: 'zh-CN'
      })
    );
    expect(library.concepts).toHaveLength(1);
    expect(library.concepts[0]).toEqual(
      expect.objectContaining({
        canonicalLabel: '水',
        canonicalLabelEn: 'water',
        synonyms: ['饮用水', '白水'],
        relatedTerms: ['口渴'],
        excludeTokens: ['浇水']
      })
    );
    expect(library.symbolAssets).toHaveLength(1);
    expect(library.symbolAssets[0]).toEqual(
      expect.objectContaining({
        sourceProvider: 'arasaac',
        sourceAssetId: 'water-1',
        license: 'CC BY-NC-SA 4.0'
      })
    );
    expect(library.conceptSymbolLinks).toHaveLength(1);
    expect(library.boards).toHaveLength(2);
    expect(library.boardItems).toHaveLength(2);
    expect(getPictogramLibraryDTOStats(library)).toEqual({
      boardCount: 2,
      boardItemCount: 2,
      conceptCount: 1,
      symbolAssetCount: 1,
      attributedSymbolAssetCount: 1,
      unattributedSymbolAssetCount: 0,
      linkedConceptCount: 1
    });
  });

  test('restores BoardDTOs that remain usable by the matcher', () => {
    const library = createPictogramLibraryDTO(createBoards(), {
      locale: 'zh-CN'
    });
    const boards = pictogramLibraryDTOToBoards(
      JSON.parse(JSON.stringify(library))
    );
    const result = matchTextToCommunicationTiles('饮用水', boards, {
      preSegmented: ['饮用水']
    });

    expect(boards.map(board => board.id)).toEqual(['home', 'drinks']);
    expect(boards[0].tiles[0]).toEqual(
      expect.objectContaining({
        label: '水',
        image: '/symbols/water.svg',
        pictogramAttribution: expect.objectContaining({
          provider: 'arasaac',
          originalId: 'water-1'
        })
      })
    );
    expect(result.matches[0]).toEqual(
      expect.objectContaining({
        token: '饮用水',
        matchType: 'synonym',
        tile: expect.objectContaining({
          tile: expect.objectContaining({ label: '水' })
        })
      })
    );
  });

  test('rejects unsupported versions and broken references', () => {
    const library = createPictogramLibraryDTO(createBoards());

    expect(() => assertPictogramLibraryDTO({ ...library, version: 2 })).toThrow(
      'Invalid or unsupported PictogramLibraryDTO'
    );
    expect(() =>
      assertPictogramLibraryDTO({
        ...library,
        conceptSymbolLinks: [
          {
            ...library.conceptSymbolLinks[0],
            symbolAssetId: 'asset:missing'
          }
        ]
      })
    ).toThrow('references missing data');
    expect(() =>
      assertPictogramLibraryDTO({
        ...library,
        boards: [
          {
            ...library.boards[0],
            layout: {
              ...library.boards[0].layout,
              tileIds: ['wrong-tile']
            }
          },
          library.boards[1]
        ]
      })
    ).toThrow('do not match the board layout');
  });

  test('represents a structured vocabulary larger than 10000 placements', () => {
    const tiles = Array.from({ length: 12000 }, (_, index) => ({
      id: `tile-${index + 1}`,
      label: `词语 ${index + 1}`
    }));
    const library = createPictogramLibraryDTO([
      { id: 'large', name: '大型词库', tiles }
    ]);

    expect(getPictogramLibraryDTOStats(library)).toEqual(
      expect.objectContaining({ boardCount: 1, boardItemCount: 12000 })
    );
    expect(pictogramLibraryDTOToBoards(library)[0].tiles).toHaveLength(12000);
  });
});
