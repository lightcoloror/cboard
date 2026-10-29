import { createBoardDTO, getBoardDTOGridSlots, assertBoardDTO } from './dto';
import { boardDTOToCboardBoard } from './cboardBoardAdapter';
import { projectCareBoards, queueCareBoards } from './careProjection';
import { createPictogramLibraryDTO, pictogramLibraryDTOToBoards } from './pictogramLibrary';
import { createPictureLibraryArchivePlan, restorePictureLibraryArchive } from './pictureLibraryArchive';

const source = () => ({
  id: 'synthetic-fixed', name: '合成固定图板', isFixed: true,
  grid: { rows: 2, columns: 3, order: [['one', null, 'two'], [null, 'three', null]] },
  tiles: [
    { id: 'one', label: '合成人甲', communicationCategory: 'people' },
    { id: 'two', label: '合成人甲', communicationCategory: 'people' },
    { id: 'three', label: '水' }
  ]
});
test('native to DTO, JSON persistence and back preserve sparse coordinates and identities', () => {
  const dto = createBoardDTO(source());
  const persisted = JSON.parse(JSON.stringify(dto));
  expect(getBoardDTOGridSlots(persisted).map(tile => tile ? tile.id : null)).toEqual(['one', null, 'two', null, 'three', null]);
  expect(boardDTOToCboardBoard(persisted).grid).toEqual(source().grid);
  expect(createBoardDTO(persisted)).toEqual(dto);
});
test('Care queue and projection preserve dimensions, empty positions and do not requeue unchanged state', async () => {
  const snapshot = { resources: {}, media: {}, locked: false };
  const edit = jest.fn(async (kind, id, value) => { snapshot.resources[`${kind}:${id}`] = { kind, id, value }; });
  const engine = { view: () => snapshot, edit };
  await queueCareBoards(engine, [source()]);
  const copy = JSON.parse(JSON.stringify(snapshot));
  const board = projectCareBoards(copy)[0];
  expect(boardDTOToCboardBoard(board).grid).toEqual(source().grid);
  expect(board.tiles.filter(tile => tile.label === '合成人甲').map(tile => tile.id)).toEqual(['one', 'two']);
  edit.mockClear();
  await queueCareBoards(engine, [board]);
  expect(edit).not.toHaveBeenCalled();
});
test('deleting and adding a card preserve the positions of all other cards', () => {
  const dto = createBoardDTO(source());
  const next = createBoardDTO({ ...dto, tiles: [...dto.tiles.filter(tile => tile.id !== 'two'), { id: 'four', label: '饭' }] });
  expect(next.layout.cells).toEqual(['one', 'four', null, null, 'three', null]);
  expect(boardDTOToCboardBoard(next).grid.order[1][1]).toBe('three');
});
test('incoherent external snapshots are rejected instead of silently packing or confusing identities', () => {
  const dto = createBoardDTO(source());
  expect(() => assertBoardDTO({ ...dto, layout: { ...dto.layout, cells: ['one', 'one', 'two', null, 'three', null] } })).toThrow();
  expect(() => createBoardDTO({ ...dto, layout: { ...dto.layout, cells: ['one', 'one', 'two', null, 'three', null] } })).toThrow();
});
test('legacy layouts without cells remain compact and usable', () => {
  const dto = createBoardDTO({ id: 'old', name: '旧图板', tiles: [{ id: 'water', label: '水' }] });
  expect(dto.layout.cells).toBeUndefined();
  expect(getBoardDTOGridSlots(dto).map(tile => tile.id)).toEqual(['water']);
});
test('library serialization and archive conversion both retain sparse positions', () => {
  const dto = createBoardDTO(source());
  const library = JSON.parse(JSON.stringify(createPictogramLibraryDTO([dto])));
  const restoredLibrary = pictogramLibraryDTOToBoards(library)[0];
  expect(restoredLibrary.layout.cells).toEqual(dto.layout.cells);
  const plan = createPictureLibraryArchivePlan({ boards: [restoredLibrary], scope: 'full' });
  const restoredArchive = restorePictureLibraryArchive({ manifest: plan.manifest, assetLocations: {}, existingBoards: [], identity: {} }).boards[0];
  expect(restoredArchive.layout.cells).toEqual(dto.layout.cells);
  expect(boardDTOToCboardBoard(createBoardDTO(restoredArchive)).grid).toEqual(source().grid);
});


test('personal-library add/delete/move reuse fixed cells without losing identity or holes', () => {
  const { appendPersonalPictogramToBoard, removePersonalPictogramFromBoard,
    movePersonalPictogramInBoard, buildPersonalPictogramTileDTO } = require('./pictogramMetadataSuggestion');
  const dto = createBoardDTO(source());
  const original = JSON.stringify(dto);
  const person = buildPersonalPictogramTileDTO({ id: 'person-four', boardId: dto.id,
    label: '合成人乙', image: 'data:image/png;base64,c3ludGhldGlj', category: 'people' });
  const added = appendPersonalPictogramToBoard([dto], dto.id, person)[0];
  expect(added.layout.cells).toEqual(['one', 'person-four', 'two', null, 'three', null]);
  const moved = movePersonalPictogramInBoard([added], dto.id, person.id, 'earlier')[0];
  expect(moved.layout.cells).toEqual(['one', 'three', 'two', null, 'person-four', null]);
  const removed = removePersonalPictogramFromBoard([moved], dto.id, person.id)[0];
  expect(removed.layout.cells).toEqual(['one', 'three', 'two', null, null, null]);
  expect(removed.layout.rows).toBe(2);
  expect(JSON.stringify(dto)).toBe(original);
  expect(assertBoardDTO(removed)).toBe(removed);
});
