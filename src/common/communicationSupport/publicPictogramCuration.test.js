import { createPersonalCommunicationBoard } from './boardManagement';
import { createBoardDTO } from './dto';
import {
  CURATED_PUBLIC_PICTOGRAM_ID_PREFIX,
  createCuratedPublicPictogram,
  listCuratedPublicPictograms,
  removeCuratedPublicPictogram
} from './publicPictogramCuration';

function publicAttribution(originalId = 'apple') {
  return {
    provider: 'arasaac',
    originalId,
    name: 'ARASAAC',
    license: 'CC BY-NC-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    author: 'Sergio Palao',
    authorUrl: 'https://arasaac.org/',
    sourceUrl: 'https://arasaac.org/',
    repoKey: 'arasaac'
  };
}

function createBoards() {
  const source = createBoardDTO({
    id: 'food',
    name: '饮食',
    tiles: [
      {
        id: 'apple',
        label: '苹果',
        vocalization: '我要苹果',
        image: 'https://example.test/apple.svg',
        communicationSynonyms: '水果,红苹果',
        pictogramAttribution: publicAttribution()
      }
    ]
  });
  return createPersonalCommunicationBoard([source], {
    id: 'device_private_board_favorites',
    name: '我的常用',
    columns: 3
  }).boards;
}

describe('public pictogram curation', () => {
  test('copies an attributed content tile into a personal board', () => {
    const boards = createBoards();
    const sourceTile = boards[0].tiles[0];
    const result = createCuratedPublicPictogram(boards, {
      id: `${CURATED_PUBLIC_PICTOGRAM_ID_PREFIX}1`,
      targetBoardId: 'device_private_board_favorites',
      sourceTile
    });

    expect(result.tile).toEqual(
      expect.objectContaining({
        label: '苹果',
        vocalization: '我要苹果',
        image: 'https://example.test/apple.svg',
        sound: '',
        boardId: 'device_private_board_favorites',
        pictogramAttribution: expect.objectContaining({
          provider: 'arasaac',
          originalId: 'apple'
        })
      })
    );
    expect(result.tile.communication.synonyms).toEqual(['水果', '红苹果']);
    expect(listCuratedPublicPictograms(result.boards)).toHaveLength(1);
  });

  test('rejects private, navigation, duplicate and built-in targets', () => {
    const boards = createBoards();
    const sourceTile = boards[0].tiles[0];
    const create = overrides =>
      createCuratedPublicPictogram(boards, {
        id: `${CURATED_PUBLIC_PICTOGRAM_ID_PREFIX}blocked`,
        targetBoardId: 'device_private_board_favorites',
        sourceTile: { ...sourceTile, ...overrides }
      });

    expect(() =>
      create({
        pictogramAttribution: {
          provider: 'device-private',
          originalId: 'private',
          name: '本机图片',
          license: '仅本机',
          sourceUrl: 'device-private://private'
        }
      })
    ).toThrow('Public pictogram attribution is required');
    expect(() => create({ loadBoardId: 'another-board' })).toThrow(
      'Navigation tiles cannot be curated'
    );
    expect(() =>
      createCuratedPublicPictogram(boards, {
        id: `${CURATED_PUBLIC_PICTOGRAM_ID_PREFIX}built-in`,
        targetBoardId: 'food',
        sourceTile
      })
    ).toThrow('only be curated into personal boards');

    const first = createCuratedPublicPictogram(boards, {
      id: `${CURATED_PUBLIC_PICTOGRAM_ID_PREFIX}first`,
      targetBoardId: 'device_private_board_favorites',
      sourceTile
    });
    expect(() =>
      createCuratedPublicPictogram(first.boards, {
        id: `${CURATED_PUBLIC_PICTOGRAM_ID_PREFIX}duplicate`,
        targetBoardId: 'device_private_board_favorites',
        sourceTile
      })
    ).toThrow('already exists');
  });

  test('removes only managed public copies', () => {
    const boards = createBoards();
    const created = createCuratedPublicPictogram(boards, {
      id: `${CURATED_PUBLIC_PICTOGRAM_ID_PREFIX}remove`,
      targetBoardId: 'device_private_board_favorites',
      sourceTile: boards[0].tiles[0]
    });
    const removed = removeCuratedPublicPictogram(
      created.boards,
      'device_private_board_favorites',
      created.tile.id
    );

    expect(removed?.removed.tile.id).toBe(created.tile.id);
    expect(listCuratedPublicPictograms(removed?.boards)).toEqual([]);
    expect(
      removeCuratedPublicPictogram(
        boards,
        'device_private_board_favorites',
        `${CURATED_PUBLIC_PICTOGRAM_ID_PREFIX}missing`
      )
    ).toBeNull();
  });
});
