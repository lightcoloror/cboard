import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { persistStore } from 'redux-persist';
import createReducer, { createPersistenceContext } from '../../reducers';
import { createVerifiedBoardPersistence, saveVerifiedBoards } from './verifiedBoardPersistence';
import { createWebGalleryTileUndo } from './webGalleryTileUndo';
import { clearGalleryTileUndoSessions } from './galleryTileUndo';
import { updateApiObjectsNoChild, createBoard } from '../../components/Board/Board.actions';
import { changeCommunicator } from '../../components/Communicator/Communicator.actions';
import { BoardContainer } from '../../components/Board/Board.container';
import API from '../../api/api';

jest.mock('ogv', () => ({ OGVLoader: {}, OGVPlayer: jest.fn() }));
jest.mock('../../api/api', () => ({ __esModule: true, default: {
  uploadBoardLocalMedia: jest.fn(), updateBoard: jest.fn(), createBoard: jest.fn(),
  updateCommunicator: jest.fn(), createCommunicator: jest.fn()
} }));
jest.mock('./localData', () => ({ ...jest.requireActual('./localData'),
  getCommunicationGalleryIdentity: () => 'synthetic-scope', canManageCommunicationLibrary: () => true
}));
jest.mock('../../components/Board/Board.messages', () => ({ __esModule: true,
  default: new Proxy({}, { get: (_, id) => ({ id: String(id) }) })
}));

const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const email = 'synthetic@example.test';
const serverBoardId = 'server-board-1234567890';
const serverCommId = 'server-communicator-1234567890';
const person = (id, boardId) => ({ id, boardId, label: '合成同名', personId: `person-${id}`,
  image: `data:image/png;base64,${id}`, sound: `synthetic:${id}`, communicationCategory: 'people',
  extra: { original: id }, pictogramAttribution: { provider: 'device-private', originalId: id }
});
const fixtures = [];
async function setup({ owned = true, boardId = 'local' } = {}) {
  const board = { id: boardId, name: '合成图库', email, isPublic: false, isFixed: true,
    tiles: [person('a', boardId), person('b', boardId)],
    grid: { rows: 1, columns: 3, order: [['a', null, 'b']] }
  };
  const communicator = { id: 'local-comm', email: owned ? email : 'default@example.test',
    boards: [boardId], rootBoard: boardId,
    defaultBoardsIncluded: [{ nameOnJSON: 'advanced', homeBoard: boardId }] };
  const values = new Map();
  const backend = { getItem: jest.fn(async key => values.get(key) ?? null),
    setItem: jest.fn(async (key, value) => { values.set(key, value); }),
    removeItem: jest.fn(async key => { values.delete(key); }) };
  const persistence = createPersistenceContext({ storage: backend, legacyStorage: backend });
  const services = {};
  const store = createStore(createReducer({ persistence }), {
    app: { userData: { id: 'synthetic-user', name: 'Synthetic', email, authToken: 'synthetic-token' } },
    board: { boards: [clone(board)], syncMeta: {}, navHistory: [boardId], activeBoardId: boardId, output: [] },
    communicator: { activeCommunicatorId: communicator.id, communicators: [clone(communicator),
      { id: 'other-profile', email, boards: [], rootBoard: 'other-root' }] }
  }, applyMiddleware(thunk.withExtraArgument(services)));
  const ready = deferred();
  const persistor = persistStore(store, {}, ready.resolve);
  services.verifiedBoardPersistence = createVerifiedBoardPersistence({ store, persistor, persistence });
  services.galleryTileUndo = createWebGalleryTileUndo({ store, persistence: services.verifiedBoardPersistence });
  fixtures.push(persistor);
  await ready.promise;
  await persistor.flush();
  const remove = async (id = 'b') => {
    const before = store.getState().board.boards.find(item => item.id === boardId);
    const changes = [{ board: { ...before, tiles: before.tiles.filter(tile => tile.id !== id) }, expectedBoard: before }];
    await expect(store.dispatch(saveVerifiedBoards(changes, { guard: () => true, galleryDeleteTileId: id }))).resolves.toBe(true);
    expect(changes[0].galleryUndoOperationId).toBe(services.galleryTileUndo.state().operationId);
    return changes[0];
  };
  const sync = (change, options = {}) => store.dispatch(updateApiObjectsNoChild(change.board, boardId.length < 14, {
    guard: () => true, galleryUndoOperationId: change.galleryUndoOperationId,
    ...(!owned ? { ownedCommunicator: communicator } : {}), ...options
  }));
  const persisted = () => JSON.parse(JSON.parse(values.get('persist:root')).board).boards;
  return { board, communicator, store, services, service: services.galleryTileUndo, backend, persistor, remove, sync, persisted };
}

beforeEach(() => {
  jest.clearAllMocks();
  API.uploadBoardLocalMedia.mockImplementation(async board => ({ board, hadFailure: false }));
  API.createBoard.mockImplementation(async board => ({ ...board, id: serverBoardId, lastEdited: 'remote-time' }));
  API.updateBoard.mockImplementation(async board => ({ ...board, lastEdited: 'remote-time' }));
  API.createCommunicator.mockImplementation(async comm => ({ ...comm, id: serverCommId, lastEdited: 'remote-time' }));
  API.updateCommunicator.mockImplementation(async comm => ({ ...comm, lastEdited: 'remote-time' }));
});
afterEach(async () => {
  for (const persistor of fixtures.splice(0)) { await persistor.flush(); persistor.pause(); }
  clearGalleryTileUndoSessions();
  jest.restoreAllMocks();
});

test.each([true, false])('native delete keeps undo across exact board/communicator migrations (already owned: %s)', async owned => {
  const f = await setup({ owned }), change = await f.remove();
  const counts = [];
  const unsubscribe = f.service.subscribe(state => counts.push(state.count));
  let finalGuard;
  await expect(f.sync(change, { onGuard: guard => { finalGuard = guard; } })).resolves.toBe(serverBoardId);
  expect(finalGuard()).toBe(true);
  expect(f.store.getState().communicator.activeCommunicatorId).toBe(serverCommId);
  expect(f.service.state()).toMatchObject({ count: 1, operationId: change.galleryUndoOperationId });
  expect(counts).not.toContain(0);
  unsubscribe();
  const result = await f.service.undo(change.galleryUndoOperationId);
  expect(result.board.id).toBe(serverBoardId);
  expect(result.board.tiles).toEqual([
    f.board.tiles[0], { ...f.board.tiles[1], boardId: serverBoardId }
  ]);
  expect(result.board.grid).toEqual(f.board.grid);
  expect(f.persisted().find(board => board.id === serverBoardId).tiles).toEqual(result.board.tiles);
  expect(finalGuard()).toBe(false);
});

test('every saved snapshot for the exact migrated board remains undoable in order', async () => {
  const f = await setup();
  const first = await f.remove('a'), second = await f.remove('b');
  await f.sync(second);
  await f.service.undo(second.galleryUndoOperationId);
  await f.service.undo(first.galleryUndoOperationId);
  const restored = f.persisted().find(board => board.id === serverBoardId);
  expect(restored.tiles).toEqual(f.board.tiles.map(tile => ({ ...tile, boardId: serverBoardId })));
  expect(restored.grid).toEqual(f.board.grid);
});

test('real A-B-A communicator switching clears the session and rejects a late board mapping', async () => {
  const f = await setup(), change = await f.remove(), gate = deferred(), started = deferred();
  API.createBoard.mockImplementation(async () => { started.resolve(); return gate.promise; });
  const syncing = f.sync(change), rejection = expect(syncing).rejects.toBeDefined();
  await started.promise;
  f.store.dispatch(changeCommunicator('other-profile'));
  f.store.dispatch(changeCommunicator('local-comm'));
  expect(f.service.state().count).toBe(0);
  gate.resolve({ ...change.board, id: serverBoardId });
  await rejection;
  expect(f.store.getState().board.boards[0].id).toBe('local');
  expect(API.createCommunicator).not.toHaveBeenCalled();
});

test.each(['board', 'communicator'])('undo blocks the old delete response while %s creation is pending', async stage => {
  const f = await setup(), change = await f.remove(), gate = deferred(), started = deferred();
  let request;
  const api = stage === 'board' ? API.createBoard : API.createCommunicator;
  api.mockImplementation(async value => { request = value; started.resolve(); return gate.promise; });
  const syncing = f.sync(change), rejection = expect(syncing).rejects.toBeDefined();
  await started.promise;
  const restored = await f.service.undo(change.galleryUndoOperationId);
  expect(restored.board.tiles.map(tile => tile.id)).toEqual(['a', 'b']);
  const before = clone(f.store.getState());
  gate.resolve({ ...request, id: stage === 'board' ? serverBoardId : serverCommId, lastEdited: 'late' });
  await rejection;
  expect(f.store.getState().board.boards).toEqual(before.board.boards);
  expect(f.store.getState().communicator).toEqual(before.communicator);
  expect(f.persisted().find(board => board.id === restored.board.id).tiles).toEqual(restored.board.tiles);
});

test('failed durable undo after migration retains the original operation and retries without duplication', async () => {
  const f = await setup(), change = await f.remove();
  await f.sync(change);
  await f.persistor.flush();
  const write = f.backend.setItem.getMockImplementation();
  f.backend.setItem.mockResolvedValue(undefined);
  await expect(f.service.undo(change.galleryUndoOperationId)).rejects.toBeDefined();
  expect(f.service.state()).toMatchObject({ count: 1, operationId: change.galleryUndoOperationId });
  expect(f.persisted().find(board => board.id === serverBoardId).tiles.map(tile => tile.id)).toEqual(['a']);
  f.backend.setItem.mockImplementation(write);
  await f.service.undo(change.galleryUndoOperationId);
  expect(f.persisted().find(board => board.id === serverBoardId).tiles.map(tile => tile.id)).toEqual(['a', 'b']);
  expect(f.service.state().count).toBe(0);
});

test('an existing target board ID cannot be guessed into the delete identity', async () => {
  const f = await setup(), change = await f.remove();
  f.store.dispatch(createBoard({ id: serverBoardId, name: f.board.name, tiles: [] }));
  await expect(f.sync(change)).rejects.toBeDefined();
  expect(f.store.getState().board.boards.map(board => board.id)).toEqual(['local', serverBoardId]);
  expect(f.service.state().count).toBe(1);
  await f.service.undo(change.galleryUndoOperationId);
  expect(f.persisted().find(board => board.id === 'local').tiles).toEqual(f.board.tiles);
});

test('privacy clear rejects the delayed communicator migration', async () => {
  const f = await setup(), change = await f.remove(), gate = deferred(), started = deferred();
  let request;
  API.createCommunicator.mockImplementation(async value => { request = value; started.resolve(); return gate.promise; });
  const syncing = f.sync(change), rejection = expect(syncing).rejects.toBeDefined();
  await started.promise;
  clearGalleryTileUndoSessions();
  gate.resolve({ ...request, id: serverCommId });
  await rejection;
  expect(f.service.state().count).toBe(0);
  expect(f.store.getState().communicator.activeCommunicatorId).toBe('local-comm');
});

test.each(['board', 'communicator'])('a failed %s migration preserves the delete snapshot and never reports sync success', async stage => {
  const f = await setup({ owned: false }), change = await f.remove();
  const api = stage === 'board' ? API.createBoard : API.createCommunicator;
  api.mockRejectedValueOnce(new Error('synthetic API failure'));
  await expect(f.sync(change)).rejects.toBeDefined();
  expect(f.service.state()).toMatchObject({ count: 1, operationId: change.galleryUndoOperationId });
  const restored = await f.service.undo(change.galleryUndoOperationId);
  expect(restored.board.id).toBe(stage === 'board' ? 'local' : serverBoardId);
  expect(restored.board.tiles.map(tile => tile.id)).toEqual(['a', 'b']);
});

test('an unknown operation token cannot grant a scope migration', async () => {
  const f = await setup({ owned: false }), change = await f.remove();
  await expect(f.sync({ ...change, galleryUndoOperationId: 'missing-operation' })).rejects.toBeDefined();
  expect(API.createBoard).not.toHaveBeenCalled();
  expect(f.store.getState().communicator.activeCommunicatorId).toBe('local-comm');
  expect(f.service.state().count).toBe(1);
});

test('a token for another board cannot grant the current cloud chain a migration', async () => {
  const f = await setup(), change = await f.remove();
  const other = { ...change.board, id: 'other-local', tiles: [] };
  f.store.dispatch(createBoard(other));
  await expect(f.sync({ ...change, board: other })).rejects.toBeDefined();
  expect(API.createBoard).not.toHaveBeenCalled();
  expect(f.service.state().count).toBe(1);
});

test('without an operation token the legacy cloud chain does not inherit an undo scope', async () => {
  const f = await setup(), change = await f.remove();
  await f.sync(change, { galleryUndoOperationId: undefined });
  expect(f.store.getState().communicator.activeCommunicatorId).toBe(serverCommId);
  expect(f.service.state().count).toBe(0);
});

test('native container delegates its own communicator migration inside the guarded deletion chain', async () => {
  const f = await setup({ owned: false }), change = await f.remove();
  let syncing;
  const props = { userData: f.store.getState().app.userData, communicator: f.communicator,
    board: change.board, boards: [change.board], intl: { formatMessage: message => message.id }, lang: 'zh',
    verifyAndUpsertCommunicator: jest.fn(), setIsSaving: jest.fn(),
    updateApiObjectsNoChild: jest.fn((...args) => { syncing = f.store.dispatch(updateApiObjectsNoChild(...args)); return syncing; }) };
  const instance = new BoardContainer(props);
  instance.setState = jest.fn(value => Object.assign(instance.state, value));
  instance.historyReplaceBoardId = jest.fn();
  await instance.handleApiUpdates(null, ['b'], null, change.board,
    { guard: () => true, scopeGuard: () => true, localCommitted: true, galleryUndoOperationId: change.galleryUndoOperationId });
  expect(props.verifyAndUpsertCommunicator).not.toHaveBeenCalled();
  expect(props.updateApiObjectsNoChild.mock.calls[0][2]).toMatchObject({
    galleryUndoOperationId: change.galleryUndoOperationId, ownedCommunicator: f.communicator
  });
  await syncing;
  expect(f.service.state().count).toBe(1);
  expect(instance.historyReplaceBoardId).toHaveBeenCalledWith(serverBoardId);
});
