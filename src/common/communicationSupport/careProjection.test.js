import { createBoardDTO } from './dto';
import { projectCareBoards, queueCareBoards } from './careProjection';

test('shared boards preserve expression, navigation, matching hints and manual order through a round trip', async () => {
  const snapshot = { resources: {}, media: {}, locked: false };
  const engine = {
    view: () => snapshot,
    edit: jest.fn(async (kind, id, value) => {
      snapshot.resources[`${kind}:${id}`] = { kind, id, value };
    })
  };
  const boards = [
    createBoardDTO({
      id: 'root',
      name: 'Synthetic root',
      orderedTileIds: ['link', 'water'],
      tiles: [
        {
          id: 'water',
          label: '水',
          vocalization: '我想喝水',
          backgroundColor: '#ffffff',
          communication: {
            synonyms: ['喝水'],
            relatedTerms: ['饮料'],
            excludeTokens: ['水果'],
            category: '饮品'
          }
        },
        { id: 'link', label: '饮品', loadBoardId: 'drinks' }
      ]
    }),
    createBoardDTO({ id: 'drinks', name: 'Synthetic drinks', tiles: [] })
  ];
  await queueCareBoards(engine, boards);
  const restored = projectCareBoards(snapshot);
  expect(restored).toEqual(boards);
  engine.edit.mockClear();
  await queueCareBoards(engine, restored);
  expect(engine.edit).not.toHaveBeenCalled();

  restored[0].tiles[1].loadBoardId = '';
  restored[0].tiles[0].vocalization = '请给我水';
  restored[0].tiles[0].communication.synonyms = [];
  await queueCareBoards(engine, restored);
  const edited = projectCareBoards(snapshot);
  expect(edited[0].tiles[1].loadBoardId).toBe('');
  expect(edited[0].tiles[0].vocalization).toBe('请给我水');
  expect(edited[0].tiles[0].communication.synonyms).toEqual([]);
});
