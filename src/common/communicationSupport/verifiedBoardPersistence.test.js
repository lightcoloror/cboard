import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import { persistStore } from 'redux-persist';
import createReducer, { createPersistenceContext } from '../../reducers';
import { createVerifiedBoardPersistence, saveVerifiedBoard, saveVerifiedBoards } from './verifiedBoardPersistence';
import { deleteBoard, updateBoard } from '../../components/Board/Board.actions';

const board = { id: 'device_private_board_test', name: '合成图板', tiles: [], grid: { rows: 1, columns: 2, order: [] } };
const edited = { ...board, tiles: [{ id: 'person-fixed-id', label: '合成人物', image: 'data:image/png;base64,c3ludGhldGlj', communicationCategory: 'people' }] };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const memory = () => {
  const values = new Map();
  return { values, getItem: jest.fn(async key => values.get(key) ?? null),
    setItem: jest.fn(async (key, value) => { values.set(key, value); }),
    removeItem: jest.fn(async key => { values.delete(key); }) };
};
const fixtures = [];
async function setup({ backend = memory(), legacy = memory(), initialBoard = board } = {}) {
  const persistence = createPersistenceContext({ storage: backend, legacyStorage: legacy });
  const services = {};
  const store = createStore(createReducer({ persistence }), {
    board: { boards: initialBoard ? [initialBoard] : [], syncMeta: {}, navHistory: [] },
    communicator: { activeCommunicatorId: 'comm', communicators: [{ id: 'comm', boards: initialBoard ? [initialBoard.id] : [] }] }
  }, applyMiddleware(thunk.withExtraArgument(services)));
  const ready = deferred();
  const persistor = persistStore(store, {}, ready.resolve);
  services.verifiedBoardPersistence = createVerifiedBoardPersistence({ store, persistor, persistence });
  fixtures.push(persistor);
  await ready.promise;
  await persistor.flush();
  return { backend, legacy, store, persistor, persistence, save: (value, options = {}) => store.dispatch(saveVerifiedBoard(value, { expectedBoard: initialBoard, ...options })) };
}
afterEach(async () => { for (const p of fixtures.splice(0)) { await p.flush(); p.pause(); } jest.restoreAllMocks(); });

test('confirms complete board content through the existing persisted root', async () => {
  const f = await setup();
  await expect(f.save(edited)).resolves.toBe(true);
  const root = JSON.parse(f.backend.values.get('persist:root'));
  expect(JSON.parse(root.board).boards[0].tiles).toEqual(edited.tiles);
});

test('flush swallowing write rejection cannot report a successful save; retry is safe', async () => {
  const f = await setup();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const write = f.backend.setItem.getMockImplementation();
  f.backend.setItem.mockRejectedValue(new Error('synthetic quota'));
  await expect(f.save(edited)).rejects.toMatchObject({ code: 'BOARD_PERSISTENCE_FAILED' });
  expect(f.store.getState().board.boards[0].tiles).toEqual(edited.tiles);
  f.backend.setItem.mockImplementation(write);
  await expect(f.save(edited)).resolves.toBe(true);
  expect(f.store.getState().board.boards[0].tiles).toHaveLength(1);
});

test('silent no-op writes are not accepted', async () => {
  const f = await setup();
  f.backend.setItem.mockResolvedValue(undefined);
  await expect(f.save(edited)).rejects.toMatchObject({ code: 'BOARD_PERSISTENCE_FAILED' });
});

test('strict read failure never consults or migrates a matching legacy copy', async () => {
  const f = await setup();
  f.legacy.getItem.mockClear();
  f.legacy.values.set('persist:root', f.backend.values.get('persist:root'));
  f.backend.getItem.mockRejectedValue(new Error('synthetic read failure'));
  await expect(f.save(edited)).rejects.toMatchObject({ code: 'BOARD_PERSISTENCE_FAILED' });
  expect(f.legacy.getItem).not.toHaveBeenCalled();
});

test('write completed but readback failed retries the same intended board', async () => {
  const f = await setup();
  const read = f.backend.getItem.getMockImplementation();
  f.backend.getItem.mockRejectedValue(new Error('read unavailable'));
  await expect(f.save(edited)).rejects.toMatchObject({ code: 'BOARD_PERSISTENCE_FAILED' });
  f.backend.getItem.mockImplementation(read);
  await expect(f.save(edited)).resolves.toBe(true);
  expect(f.store.getState().board.boards[0].tiles).toHaveLength(1);
});

test('new board retry confirms membership without duplicating the board', async () => {
  const f = await setup({ initialBoard: null });
  const read = f.backend.getItem.getMockImplementation();
  f.backend.getItem.mockRejectedValue(new Error('read unavailable'));
  await expect(f.save(board, { create: true, expectedBoard: null })).rejects.toMatchObject({ code: 'BOARD_PERSISTENCE_FAILED' });
  f.backend.getItem.mockImplementation(read);
  await expect(f.save(board, { create: true, expectedBoard: null })).resolves.toBe(board.id);
  expect(f.store.getState().board.boards).toHaveLength(1);
  expect(f.store.getState().communicator.communicators[0].boards).toEqual([board.id]);
});

test('a later edit is never overwritten by an old retry', async () => {
  const f = await setup();
  f.backend.setItem.mockResolvedValue(undefined);
  await expect(f.save(edited)).rejects.toBeDefined();
  const newer = { ...f.store.getState().board.boards[0], name: '随后修改' };
  f.store.dispatch(updateBoard(newer));
  await expect(f.save(edited)).rejects.toMatchObject({ code: 'BOARD_SAVE_CONFLICT' });
  expect(f.store.getState().board.boards[0].name).toBe('随后修改');
});

test('scope invalidation before dispatch prevents changes', async () => {
  const f = await setup();
  await expect(f.save(edited, { guard: () => false })).rejects.toMatchObject({ code: 'BOARD_SAVE_CANCELLED' });
  expect(f.store.getState().board.boards[0].tiles).toEqual([]);
});

test('late completion after scope change cannot confirm or replay old content', async () => {
  const f = await setup();
  const gate = deferred(), started = deferred();
  const write = f.backend.setItem.getMockImplementation();
  let active = true;
  f.backend.setItem.mockImplementation(async (key, value) => { started.resolve(); await gate.promise; return write(key, value); });
  const pending = f.save(edited, { guard: () => active });
  await started.promise;
  active = false;
  f.store.dispatch(updateBoard({ ...edited, name: '当前内容' }));
  gate.resolve();
  await expect(pending).rejects.toMatchObject({ code: 'BOARD_SAVE_CANCELLED' });
  expect(f.store.getState().board.boards[0].name).toBe('当前内容');
});

test('serializes writes and removals and recovers the queue after rejection', async () => {
  const backend = memory(), gate = deferred(), started = deferred();
  backend.setItem.mockImplementationOnce(async (key, value) => { started.resolve(); await gate.promise; backend.values.set(key, value); });
  const { strictStorage } = createPersistenceContext({ storage: backend });
  const first = strictStorage.setItem('root', 'first');
  await started.promise;
  const second = strictStorage.setItem('root', 'second');
  const remove = strictStorage.removeItem('root');
  expect(backend.setItem).toHaveBeenCalledTimes(1);
  gate.resolve();
  await Promise.all([first, second, remove]);
  expect(await strictStorage.getItem('root')).toBeNull();
  backend.setItem.mockRejectedValueOnce(new Error('failed write'));
  await expect(strictStorage.setItem('root', 'bad')).rejects.toThrow();
  await strictStorage.setItem('root', 'good');
  expect(await strictStorage.getItem('root')).toBe('good');
});

test('rejects before rehydration and before any board dispatch', async () => {
  const f = await setup();
  const service = createVerifiedBoardPersistence({ store: f.store, persistence: f.persistence,
    persistor: { getState: () => ({ bootstrapped: false }) } });
  await expect(service.save(edited, { expectedBoard: board })).rejects.toMatchObject({ code: 'BOARD_PERSISTENCE_FAILED' });
  expect(f.store.getState().board.boards[0].tiles).toEqual([]);
});

test('does not accept existing unrelated IDs or deleted boards as successful creation', async () => {
  const f = await setup();
  await expect(f.save(board, { create: true, expectedBoard: null })).rejects.toMatchObject({ code: 'BOARD_SAVE_CONFLICT' });
  f.store.dispatch(deleteBoard(board.id));
  await expect(f.save(edited)).rejects.toMatchObject({ code: 'BOARD_SAVE_CONFLICT' });
  expect(f.store.getState().board.boards).toHaveLength(1);
});

test('readback verifies membership and image data rather than only board IDs and labels', async () => {
  const f = await setup({ initialBoard: null });
  const realRead = f.backend.getItem.getMockImplementation();
  f.backend.getItem.mockImplementation(async key => {
    const raw = await realRead(key);
    if (key !== 'persist:root') return raw;
    const root = JSON.parse(raw);
    root.communicator = JSON.stringify({ activeCommunicatorId: 'comm', communicators: [{ id: 'comm', boards: [] }] });
    return JSON.stringify(root);
  });
  await expect(f.save(board, { create: true, expectedBoard: null })).rejects.toMatchObject({ code: 'BOARD_PERSISTENCE_FAILED' });
  f.backend.getItem.mockImplementation(realRead);
  await expect(f.save(board, { create: true, expectedBoard: null })).resolves.toBe(board.id);
  const baseline = f.store.getState().board.boards[0];
  f.backend.getItem.mockImplementation(async key => {
    const raw = await realRead(key);
    if (key !== 'persist:root') return raw;
    const root = JSON.parse(raw), boards = JSON.parse(root.board);
    boards.boards[0].tiles[0].image = 'data:image/png;base64,ZGlmZmVyZW50';
    root.board = JSON.stringify(boards);
    return JSON.stringify(root);
  });
  await expect(f.save(edited, { expectedBoard: baseline })).rejects.toMatchObject({ code: 'BOARD_PERSISTENCE_FAILED' });
});

test('a later change while the write is pending survives an old completion', async () => {
  const f = await setup();
  const gate = deferred(), started = deferred();
  const write = f.backend.setItem.getMockImplementation();
  f.backend.setItem.mockImplementationOnce(async (key, value) => { started.resolve(); await gate.promise; return write(key, value); });
  const pending = f.save(edited);
  await started.promise;
  f.store.dispatch(updateBoard({ ...edited, name: '后续图板名称' }));
  gate.resolve();
  await expect(pending).rejects.toMatchObject({ code: 'BOARD_SAVE_CONFLICT' });
  await f.persistor.flush();
  const root = JSON.parse(f.backend.values.get('persist:root'));
  expect(JSON.parse(root.board).boards[0].name).toBe('后续图板名称');
});

test('serializable optional fields do not make the expected baseline conflict', async () => {
  const initialBoard = { ...board, optionalMetadata: undefined };
  const f = await setup({ initialBoard });
  await expect(f.save(edited, { expectedBoard: initialBoard })).resolves.toBe(true);
});

test('a second store rehydrates the verified complete board from the same backend', async () => {
  const f = await setup();
  await f.save(edited);
  f.persistor.pause();
  const reloaded = await setup({ backend: f.backend, initialBoard: null });
  expect(reloaded.store.getState().board.boards[0].tiles).toEqual(edited.tiles);
});

const child = { id: 'stable-native-child', name: '文件夹', tiles: [] };
const folderParent = { ...board, tiles: [{ id: 'stable-folder-card', label: '文件夹', loadBoard: child.id }] };
const folderChanges = () => [
  { board: child, expectedBoard: null, create: true },
  { board: folderParent, expectedBoard: board }
];

test('native folder confirms child, communicator membership and parent link in one stored root', async () => {
  const f = await setup();
  await expect(f.store.dispatch(saveVerifiedBoards(folderChanges()))).resolves.toBe(true);
  const root = JSON.parse(f.backend.values.get('persist:root'));
  expect(JSON.parse(root.board).boards).toEqual(expect.arrayContaining([
    expect.objectContaining(child), expect.objectContaining(folderParent)
  ]));
  expect(JSON.parse(root.communicator).communicators[0].boards).toEqual([board.id, child.id]);
});

test('native folder write failure retries the exact two boards without duplicate child or parent card', async () => {
  const f = await setup();
  const write = f.backend.setItem.getMockImplementation();
  f.backend.setItem.mockResolvedValue(undefined);
  await expect(f.store.dispatch(saveVerifiedBoards(folderChanges()))).rejects.toMatchObject({ code: 'BOARD_PERSISTENCE_FAILED' });
  f.backend.setItem.mockImplementation(write);
  await expect(f.store.dispatch(saveVerifiedBoards(folderChanges()))).resolves.toBe(true);
  expect(f.store.getState().board.boards).toHaveLength(2);
  expect(f.store.getState().board.boards[0].tiles).toHaveLength(1);
  expect(f.store.getState().communicator.communicators[0].boards).toEqual([board.id, child.id]);
});

test('a partial folder readback is rejected even when its parent link is present', async () => {
  const f = await setup();
  const read = f.backend.getItem.getMockImplementation();
  f.backend.getItem.mockImplementation(async key => {
    const raw = await read(key);
    if (key !== 'persist:root') return raw;
    const root = JSON.parse(raw), storedBoards = JSON.parse(root.board);
    storedBoards.boards = storedBoards.boards.filter(item => item.id !== child.id);
    root.board = JSON.stringify(storedBoards);
    return JSON.stringify(root);
  });
  await expect(f.store.dispatch(saveVerifiedBoards(folderChanges()))).rejects.toMatchObject({ code: 'BOARD_PERSISTENCE_FAILED' });
  f.backend.getItem.mockImplementation(read);
  await expect(f.store.dispatch(saveVerifiedBoards(folderChanges()))).resolves.toBe(true);
});

test('preflights every native board before dispatching any part of a folder', async () => {
  const f = await setup();
  f.store.dispatch(updateBoard({ ...board, name: '已变化' }));
  await expect(f.store.dispatch(saveVerifiedBoards(folderChanges()))).rejects.toMatchObject({ code: 'BOARD_SAVE_CONFLICT' });
  expect(f.store.getState().board.boards).toHaveLength(1);
  expect(f.store.getState().communicator.communicators[0].boards).toEqual([board.id]);
});

test('an edited child prevents an old folder retry from overwriting either board', async () => {
  const f = await setup();
  f.backend.setItem.mockResolvedValue(undefined);
  await expect(f.store.dispatch(saveVerifiedBoards(folderChanges()))).rejects.toBeDefined();
  f.store.dispatch(updateBoard({ ...child, tiles: [{ id: 'newer-card', label: '后续子图卡' }] }));
  const before = JSON.stringify(f.store.getState().board);
  await expect(f.store.dispatch(saveVerifiedBoards(folderChanges()))).rejects.toMatchObject({ code: 'BOARD_SAVE_CONFLICT' });
  expect(JSON.stringify(f.store.getState().board)).toBe(before);
});
