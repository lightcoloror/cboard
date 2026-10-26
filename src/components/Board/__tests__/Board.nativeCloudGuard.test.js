import { applyMiddleware, combineReducers, createStore } from 'redux';
import thunk from 'redux-thunk';
import boardReducer from '../Board.reducer';
import communicatorReducer from '../../Communicator/Communicator.reducer';
import { changeCommunicator } from '../../Communicator/Communicator.actions';
import { createApiBoard, updateApiBoard, updateApiObjectsNoChild, updateApiObjects,
  updateBoard, createBoard, upsertApiBoard, deleteApiBoard } from '../Board.actions';
import { SYNC_STATUS } from '../Board.constants';
import API from '../../../api/api';

jest.mock('../../../api/api', () => ({
  __esModule: true,
  default: { uploadBoardLocalMedia: jest.fn(), updateBoard: jest.fn(), createBoard: jest.fn(),
    updateCommunicator: jest.fn(), createCommunicator: jest.fn(), deleteBoard: jest.fn() }
}));

const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const board = { id: 'native-server-board-1234', name: '原板', email: 'synthetic@example.test',
  tiles: [{ id: 'card', image: 'data:image/png;base64,c3ludGhldGlj' }], isPublic: false };
const communicator = { id: 'native-server-communicator', email: board.email, boards: [board.id], rootBoard: board.id,
  defaultBoardsIncluded: [{ nameOnJSON: 'advanced', homeBoard: board.id }] };
const setup = (initialBoard = board, initialCommunicator = communicator) => createStore(combineReducers({
  board: boardReducer, communicator: communicatorReducer,
  app: (state = { userData: { name: 'Synthetic', email: board.email } }) => state
}), {
  board: { boards: [clone(initialBoard)], syncMeta: { [initialBoard.id]: { status: SYNC_STATUS.PENDING } },
    activeBoardId: initialBoard.id, navHistory: [initialBoard.id], output: [] },
  communicator: { activeCommunicatorId: initialCommunicator.id, communicators: [clone(initialCommunicator),
    { id: 'another-profile', boards: [], rootBoard: 'other-root' }] }
}, applyMiddleware(thunk));

beforeEach(() => {
  jest.resetAllMocks();
  API.uploadBoardLocalMedia.mockImplementation(async value => ({ board: value, hadFailure: false }));
  API.updateBoard.mockImplementation(async value => ({ ...value, lastEdited: 'remote-time' }));
  API.createBoard.mockImplementation(async value => ({ ...value, id: 'server-created-board-1234', lastEdited: 'remote-time' }));
  API.updateCommunicator.mockImplementation(async value => ({ ...value, lastEdited: 'remote-time' }));
  API.createCommunicator.mockImplementation(async value => ({ ...value, id: 'server-created-communicator', lastEdited: 'remote-time' }));
  API.deleteBoard.mockImplementation(async id => ({ id }));
});

test('optional guard blocks a late media replacement and the following API request after scope changes', async () => {
  const store = setup(), gate = deferred(), started = deferred();
  let current = true;
  API.uploadBoardLocalMedia.mockImplementation(async () => { started.resolve(); return gate.promise; });
  const saving = store.dispatch(updateApiBoard(board, { guard: () => current }));
  const rejected = expect(saving).rejects.toBeDefined();
  await started.promise;
  current = false;
  gate.resolve({ board: { ...board, tiles: [{ id: 'card', image: 'https://synthetic.invalid/old.png' }] }, hadFailure: false });
  await rejected;
  expect(store.getState().board.boards[0].tiles).toEqual(board.tiles);
  expect(API.updateBoard).not.toHaveBeenCalled();
});

test('optional guard does not let a late update response overwrite or mark a newer local edit synced', async () => {
  const store = setup(), gate = deferred(), started = deferred();
  API.updateBoard.mockImplementation(async () => { started.resolve(); return gate.promise; });
  const saving = store.dispatch(updateApiBoard(board, { guard: () => true }));
  const rejected = expect(saving).rejects.toBeDefined();
  await started.promise;
  store.dispatch(updateBoard({ ...board, name: '后续本机修改' }));
  gate.resolve({ ...board, name: '旧远端内容', isLocalUpdateNeeded: true });
  await rejected;
  expect(store.getState().board.boards[0].name).toBe('后续本机修改');
  expect(store.getState().board.syncMeta[board.id].status).toBe(SYNC_STATUS.PENDING);
});

test('optional guard reaches the communicator request nested after a board save', async () => {
  const localComm = { ...communicator, id: 'local-comm' };
  const store = setup(board, localComm), gate = deferred(), started = deferred();
  API.createCommunicator.mockImplementation(async () => { started.resolve(); return gate.promise; });
  const saving = store.dispatch(updateApiObjectsNoChild(board, false, { guard: () => true }));
  const rejected = expect(saving).rejects.toBeDefined();
  await started.promise;
  store.dispatch(changeCommunicator('another-profile'));
  expect(store.getState().communicator.activeCommunicatorId).toBe('another-profile');
  const before = clone(store.getState().communicator);
  gate.resolve({ ...localComm, id: 'late-remote-communicator', lastEdited: 'remote-time' });
  await rejected;
  expect(store.getState().communicator).toEqual(before);
});

test('a guard false at entry rejects before any media or remote request', async () => {
  const store = setup();
  await expect(store.dispatch(updateApiBoard(board, { guard: () => false }))).rejects.toMatchObject({ code: 'BOARD_SAVE_CANCELLED' });
  expect(API.uploadBoardLocalMedia).not.toHaveBeenCalled();
  expect(API.updateBoard).not.toHaveBeenCalled();
});

test('a late create result cannot migrate an edited local board or its links', async () => {
  const localBoard = { ...board, id: 'local' };
  const store = setup(localBoard, { ...communicator, boards: ['local'], rootBoard: 'local' });
  const gate = deferred(), started = deferred();
  API.createBoard.mockImplementation(async () => { started.resolve(); return gate.promise; });
  const saving = store.dispatch(createApiBoard(localBoard, localBoard.id, { guard: () => true }));
  const rejected = expect(saving).rejects.toBeDefined();
  await started.promise;
  store.dispatch(updateBoard({ ...localBoard, name: '更新的本机输入' }));
  const before = clone(store.getState());
  gate.resolve({ ...localBoard, id: 'late-server-board-id', lastEdited: 'remote-time' });
  await rejected;
  expect(store.getState().board.boards).toEqual(before.board.boards);
  expect(store.getState().communicator).toEqual(before.communicator);
  expect(store.getState().board.syncMeta).toEqual(before.board.syncMeta);
});

test.each(['local', 'server-existing-board'])('upsert forwards its optional guard for %s IDs', async id => {
  const value = { ...board, id };
  const store = setup(value), gate = deferred(), started = deferred();
  let current = true;
  API.uploadBoardLocalMedia.mockImplementation(async () => { started.resolve(); return gate.promise; });
  const saving = store.dispatch(upsertApiBoard(value, { guard: () => current }));
  const rejected = expect(saving).rejects.toBeDefined();
  await started.promise;
  current = false;
  gate.resolve({ board: value, hadFailure: false });
  await rejected;
  expect(API.createBoard).not.toHaveBeenCalled();
  expect(API.updateBoard).not.toHaveBeenCalled();
});

test('a guarded delete acknowledgement cannot remove content after its scope expires', async () => {
  const store = setup(), gate = deferred();
  let current = true;
  API.deleteBoard.mockReturnValue(gate.promise);
  const saving = store.dispatch(deleteApiBoard(board.id, { guard: () => current }));
  const rejected = expect(saving).rejects.toBeDefined();
  current = false;
  gate.resolve({ id: board.id });
  await rejected;
  expect(store.getState().board.boards).toEqual([board]);
});

const child = { id: 'child', name: '子板', tiles: [], email: board.email, isPublic: false };
const folderSetup = () => {
  const parent = { ...board, id: 'parent', tiles: [{ id: 'folder', loadBoard: child.id }] };
  const comm = { ...communicator, id: 'local-comm', boards: [parent.id, child.id], rootBoard: parent.id,
    defaultBoardsIncluded: [{ nameOnJSON: 'advanced', homeBoard: parent.id }] };
  const store = setup(parent, comm);
  store.dispatch(createBoard(child));
  return { store, parent, comm };
};

test('a folder chain accepts its own child, parent and communicator migrations', async () => {
  const { store, parent } = folderSetup();
  let finalGuard;
  API.createBoard.mockImplementation(async value => ({ ...value, id: `server-created-${value.id}-123456`, lastEdited: 'remote-time' }));
  await expect(store.dispatch(updateApiObjects(child, parent, true,
    { guard: () => true, onGuard: value => { finalGuard = value; } }))).resolves.toBe('server-created-parent-123456');
  expect(finalGuard()).toBe(true);
  const savedParent = store.getState().board.boards.find(value => value.id === 'server-created-parent-123456');
  expect(savedParent.tiles[0].loadBoard).toBe('server-created-child-123456');
  const savedComm = store.getState().communicator.communicators[0];
  expect(savedComm.boards).toEqual(['server-created-parent-123456', 'server-created-child-123456']);
  expect(savedComm.rootBoard).toBe('server-created-parent-123456');
  expect(savedComm.defaultBoardsIncluded[0].homeBoard).toBe('server-created-parent-123456');
  store.dispatch(updateBoard({ ...savedParent, name: '随后的修改' }));
  expect(finalGuard()).toBe(false);
});

test('an edited parent during child creation stops the remaining folder requests and state changes', async () => {
  const { store, parent } = folderSetup(), gate = deferred(), started = deferred();
  API.createBoard.mockImplementation(async () => { started.resolve(); return gate.promise; });
  const saving = store.dispatch(updateApiObjects(child, parent, true, { guard: () => true }));
  const rejected = expect(saving).rejects.toBeDefined();
  await started.promise;
  store.dispatch(updateBoard({ ...parent, name: '新父板内容' }));
  const before = clone(store.getState().board);
  gate.resolve({ ...child, id: 'late-server-child' });
  await rejected;
  expect(store.getState().board.boards).toEqual(before.boards);
  expect(API.createBoard).toHaveBeenCalledTimes(1);
  expect(API.createCommunicator).not.toHaveBeenCalled();
});

test('guarded ordinary API failure remains a rejection and retains the local pending board', async () => {
  const store = setup();
  API.updateBoard.mockRejectedValue(new Error('synthetic remote failure'));
  await expect(store.dispatch(updateApiObjectsNoChild(board, false, { guard: () => true }))).rejects.toThrow('synthetic remote failure');
  expect(store.getState().board.boards[0]).toEqual(board);
  expect(store.getState().board.syncMeta[board.id].status).toBe(SYNC_STATUS.PENDING);
});

test('without an optional guard the existing response behavior is preserved', async () => {
  const store = setup(), gate = deferred(), started = deferred();
  API.updateBoard.mockImplementation(async () => { started.resolve(); return gate.promise; });
  const saving = store.dispatch(updateApiBoard(board));
  await started.promise;
  store.dispatch(updateBoard({ ...board, name: '后续本机修改' }));
  gate.resolve({ ...board, name: '旧接口响应', isLocalUpdateNeeded: true });
  await saving;
  expect(store.getState().board.boards[0].name).toBe('旧接口响应');
});
