import { createBoardDTO } from './dto';
import { projectCareBoards, queueCareBoards } from './careProjection';
import { boardDTOToCboardBoard } from './cboardBoardAdapter';
import { buildPersonalPictogramTileDTO } from './pictogramMetadataSuggestion';
import { buildCommunicationTileCatalog } from './symbolMatching';
import { getPersonalPeople, filterPublicPictureTokens } from './personalPeople';

test('fixed geometry requires server capability before any queue mutation, then round-trips exact holes', async () => {
  const board=createBoardDTO({id:'fixed',name:'合成固定板',grid:{rows:2,columns:3,order:[['a',null,'b'],[null,'c',null]]},
    tiles:['a','b','c'].map(id=>({id,label:id}))});
  const state={resources:{},media:{},locked:false,capabilities:{}};
  const edit=jest.fn(async (kind,id,value)=>{ state.resources[`${kind}:${id}`]={kind,id,value}; });
  const engine={view:()=>state,edit};
  await expect(queueCareBoards(engine,[board])).rejects.toThrow('服务器尚不支持');
  expect(edit).not.toHaveBeenCalled();
  state.capabilities.fixedBoardLayout=1;
  await queueCareBoards(engine,[board]);
  const restored=projectCareBoards(state)[0];
  expect(restored.layout.cells).toEqual(['a',null,'b',null,'c',null]);
  expect(boardDTOToCboardBoard(restored).grid.order).toEqual([['a',null,'b'],[null,'c',null]]);
});

test('native CBoard person cards retain their identity category across queued offline projection', async () => {
  const snapshot = { resources: {}, media: {}, locked: false, capabilities: { fixedBoardLayout: 1 } };
  const engine = {
    view: () => snapshot,
    edit: async (kind, id, value) => {
      snapshot.resources[`${kind}:${id}`] = { kind, id, value };
    },
    addMedia: async asset => {
      snapshot.media[asset.mediaId] = asset;
    }
  };
  const boardId = 'device_private_board_people';
  const board = createBoardDTO({
    id: boardId,
    name: 'Synthetic people',
    tiles: ['one', 'two'].map(id =>
      buildPersonalPictogramTileDTO({
        id,
        boardId,
        label: '欧阳明澈',
        image: `synthetic-private:${id}`,
        category: 'people'
      })
    )
  });
  const native = boardDTOToCboardBoard(board);
  expect(native.tiles[0].communicationCategory).toBe('people');
  await queueCareBoards(engine, [native], async source => ({
    type: 'image/png',
    data: source,
    sha256: source
  }));
  const restored = projectCareBoards(
    JSON.parse(JSON.stringify(snapshot)),
    asset => asset.data
  );
  const catalog = buildCommunicationTileCatalog(restored);
  expect(getPersonalPeople(catalog).map(item => item.id)).toEqual([
    'one',
    'two'
  ]);
  expect(restored[0].tiles.map(tile => tile.image)).toEqual(
    board.tiles.map(tile => tile.image)
  );
  expect(filterPublicPictureTokens(['欧阳明澈', '苹果'], catalog)).toEqual([
    '苹果'
  ]);
  expect(restored[0].layout.tileIds).toEqual(['one', 'two']);
});

test('shared boards preserve expression, navigation, matching hints and manual order through a round trip', async () => {
  const snapshot = { resources: {}, media: {}, locked: false, capabilities: { fixedBoardLayout: 1 } };
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
