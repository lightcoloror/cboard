import React from 'react';
import { BoardContainer } from '../Board.container';
import TileEditor from '../TileEditor';
import Board from '../Board.component';
import configureStore from '../../../store';
import { createPersistenceContext } from '../../../reducers';
import { saveVerifiedBoards } from '../../../common/communicationSupport/verifiedBoardPersistence';
import { updateBoard } from '../Board.actions';
import { invalidateImageOperations } from '../../../common/communicationSupport/imageOperationEpoch';

jest.mock('ogv', () => ({ OGVLoader: { base: '' } }));
jest.mock('dom-to-image', () => ({}));
jest.mock('../Board.component', () => () => null);
jest.mock('../Board.messages', () => ({
  __esModule: true,
  default: new Proxy({}, { get: (_, id) => ({ id: String(id) }) })
}));

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const original = { id: 'native-parent', name: 'Parent', tiles: [{ id: 'card', label: '原图', image: 'data:image/png;base64,b2xk' }] };
const make = (overrides = {}) => {
  const props = {
    userData: {}, board: original, boards: [original], playbackScope: 'scope-a', navHistory: [],
    communicator: { id: 'comm', boards: [original.id] },
    intl: { formatMessage: jest.fn(message => message.id) },
    saveVerifiedBoards: jest.fn().mockResolvedValue(true),
    createBoard: jest.fn(), updateBoard: jest.fn(), createTile: jest.fn(),
    editTiles: jest.fn(), deleteTiles: jest.fn(), switchBoard: jest.fn(),
    verifyAndAddBoardCommunicator: jest.fn(), showNotification: jest.fn(),
    history: { replace: jest.fn() }, setIsSaving: jest.fn(), ...overrides
  };
  const instance = new BoardContainer(props);
  instance.setState = jest.fn(change => Object.assign(instance.state,
    typeof change === 'function' ? change(instance.state, instance.props) : change));
  instance.state = { ...instance.state, selectedTileIds: ['card'], isSelecting: true };
  return { instance, props };
};

const renderedProp = (instance, component, name) => React.Children.toArray(instance.render().props.children)
  .find(child => child.type === component).props[name];

test('cross-board selected IDs never become undefined editor tiles', () => {
  const { instance, props } = make();
  instance.handleEditClick();
  instance.props = { ...props, board: { id: 'other-board', tiles: [{ id: 'other-card', label: 'Other' }] } };
  expect(renderedProp(instance, TileEditor, 'editingTiles')).toEqual([]);
  expect(instance.selectedTiles()).toEqual([]);
});

test('same board ID in a new profile cannot reuse the previous editor snapshot', () => {
  const { instance, props } = make();
  instance.handleEditClick();
  instance.props = { ...props, playbackScope: 'scope-b', board: { ...original, tiles: [{ ...original.tiles[0], image: 'new-profile' }] } };
  const tiles = renderedProp(instance, TileEditor, 'editingTiles');
  expect(tiles).not.toContainEqual(original.tiles[0]);
});

test('delete scope is forwarded to the toolbar board independently of the selected IDs', () => {
  const { instance } = make();
  const context = instance.nativeSaveContextKey();
  expect(renderedProp(instance, Board, 'deleteContextKey')).toBe(context);
  instance.state.selectedTileIds = [];
  expect(renderedProp(instance, Board, 'deleteContextKey')).toBe(context);
});

test('a scope change clears old selection before it can target coincident IDs in another profile', () => {
  const { instance, props } = make();
  instance.handleEditClick();
  instance.props = { ...props, playbackScope: 'scope-b' };
  instance.componentDidUpdate(props);
  expect(instance.state.selectedTileIds).toEqual([]);
  expect(instance.state.tileEditorOpen).toBe(false);
  expect(instance.nativeEditorBaseline).toBeNull();
});

test('normal board refresh retains failed edit snapshots including distinct images with repeated labels', () => {
  const tiles = [{ id: 'first', label: '同名', image: 'one', meaning: { person: 'one' } },
    { id: 'second', label: '同名', image: 'two', meaning: { person: 'two' } }];
  const { instance, props } = make({ board: { ...original, tiles } });
  instance.state.selectedTileIds = tiles.map(tile => tile.id);
  instance.handleEditClick();
  instance.props = { ...props, board: { ...props.board, tiles: [] } };
  instance.componentDidUpdate(props);
  expect(renderedProp(instance, TileEditor, 'editingTiles')).toEqual(tiles);
});

test('a legitimate cloud communicator migration after closing does not increment the editor revision twice', () => {
  const { instance, props } = make();
  instance.handleAddClick();
  instance.handleTileEditorCancel();
  const revision = instance.nativeEditorRevision;
  instance.props = { ...props, communicator: { id: 'cloud-comm', boards: [original.id] } };
  instance.componentDidUpdate(props);
  expect(instance.nativeEditorRevision).toBe(revision);
});

test('native edit returns a confirmation promise and preserves source props until the editor consumes it', async () => {
  const gate = deferred();
  const { instance, props } = make({ saveVerifiedBoards: jest.fn(() => gate.promise) });
  const result = instance.handleEditTileEditorSubmit([{ ...original.tiles[0], label: '新图' }]);
  expect(result).toBeInstanceOf(Promise);
  expect(instance.state.selectedTileIds).toEqual(['card']);
  expect(props.editTiles).not.toHaveBeenCalled();
  gate.resolve(true);
  await expect(result).resolves.toBe(true);
  expect(instance.state.selectedTileIds).toEqual(['card']);
  instance.handleTileEditorCancel();
  expect(instance.state.selectedTileIds).toEqual([]);
});

test('native add cannot finish before verified local save', async () => {
  const gate = deferred();
  const { instance, props } = make({ saveVerifiedBoards: jest.fn(() => gate.promise) });
  const tile = { id: 'stable-new-card', label: '新增', image: 'data:image/png;base64,bmV3' };
  const result = instance.handleAddTileEditorSubmit(tile);
  expect(props.saveVerifiedBoards).toHaveBeenCalledTimes(1);
  expect(props.createTile).not.toHaveBeenCalled();
  gate.resolve(true);
  await expect(result).resolves.toBe(true);
});

test('native delete keeps selected IDs and never announces completion before readback', async () => {
  const gate = deferred();
  const { instance, props } = make({ saveVerifiedBoards: jest.fn(() => gate.promise) });
  const result = instance.handleDeleteClick();
  expect(result).toBeInstanceOf(Promise);
  expect(props.showNotification).not.toHaveBeenCalled();
  expect(instance.state.selectedTileIds).toEqual(['card']);
  gate.resolve(true);
  await expect(result).resolves.toBe(true);
  expect(props.showNotification).toHaveBeenCalledTimes(1);
});

test.each(['edit', 'add', 'delete'])('native %s rejection preserves inputs/selection and does not start cloud sync', async kind => {
  const error = new Error('synthetic quota');
  const { instance, props } = make({ saveVerifiedBoards: jest.fn().mockRejectedValue(error), userData: { name: 'Synthetic', email: 'synthetic@example.test' } });
  instance.handleApiUpdates = jest.fn();
  const result = kind === 'edit' ? instance.handleEditTileEditorSubmit([{ ...original.tiles[0], label: '更改' }])
    : kind === 'add' ? instance.handleAddTileEditorSubmit({ id: 'new', label: '新增' }) : instance.handleDeleteClick();
  await expect(result).rejects.toBe(error);
  expect(instance.state.selectedTileIds).toEqual(['card']);
  expect(instance.state.isSelecting).toBe(true);
  expect(props.showNotification).not.toHaveBeenCalled();
  expect(instance.handleApiUpdates).not.toHaveBeenCalled();
});

test('explicit false from the persistence callback is not accepted as success', async () => {
  const { instance, props } = make({ saveVerifiedBoards: jest.fn().mockResolvedValue(false) });
  await expect(instance.handleDeleteClick()).rejects.toMatchObject({ code: 'BOARD_PERSISTENCE_FAILED' });
  expect(props.showNotification).not.toHaveBeenCalled();
  expect(instance.state.selectedTileIds).toEqual(['card']);
});

test('native double submit shares one pending local operation', async () => {
  const gate = deferred();
  const { instance, props } = make({ saveVerifiedBoards: jest.fn(() => gate.promise) });
  const tile = { id: 'new', label: '新增' };
  const first = instance.handleAddTileEditorSubmit(tile);
  const second = instance.handleAddTileEditorSubmit({ ...tile });
  expect(first).toBe(second);
  expect(props.saveVerifiedBoards).toHaveBeenCalledTimes(1);
  gate.resolve(true);
  await expect(first).resolves.toBe(true);
});

test('changing profile while a native save waits cannot clear current selection or start cloud sync', async () => {
  const gate = deferred();
  const { instance, props } = make({ saveVerifiedBoards: jest.fn(() => gate.promise), userData: { name: 'Synthetic', email: 'synthetic@example.test' } });
  instance.handleApiUpdates = jest.fn();
  const saving = instance.handleEditTileEditorSubmit([{ ...original.tiles[0], label: '更改' }]);
  instance.props = { ...props, playbackScope: 'scope-b' };
  instance.state.selectedTileIds = ['new-selection'];
  gate.resolve(true);
  await expect(saving).rejects.toMatchObject({ code: 'BOARD_SAVE_CANCELLED' });
  expect(instance.state.selectedTileIds).toEqual(['new-selection']);
  expect(instance.handleApiUpdates).not.toHaveBeenCalled();
});

test('opening or cancelling another editor invalidates an older operation', async () => {
  const gate = deferred();
  const { instance, props } = make({ saveVerifiedBoards: jest.fn(() => gate.promise) });
  instance.handleEditClick();
  const saving = instance.handleEditTileEditorSubmit([{ ...original.tiles[0], label: '更改' }]);
  instance.handleTileEditorCancel();
  gate.resolve(true);
  await expect(saving).rejects.toMatchObject({ code: 'BOARD_SAVE_CANCELLED' });
  expect(props.showNotification).not.toHaveBeenCalled();
});

test('edit baseline is the board at editor opening, not a later board received through Redux', async () => {
  const { instance, props } = make();
  instance.handleEditClick();
  instance.props = { ...props, board: { ...original, name: '后续变化' } };
  await instance.handleEditTileEditorSubmit([{ ...original.tiles[0], label: '更改' }]);
  expect(props.saveVerifiedBoards.mock.calls[0][0][0].expectedBoard).toEqual(original);
});

const cleanups = [];
afterEach(async () => { for (const clean of cleanups.splice(0)) await clean(); });
async function persistedInstance() {
  const values = new Map();
  const backend = {
    getItem: jest.fn(async key => values.get(key) ?? null),
    setItem: jest.fn(async (key, value) => { values.set(key, value); }),
    removeItem: jest.fn(async key => { values.delete(key); })
  };
  const persistence = createPersistenceContext({ storage: backend });
  const { store, persistor } = configureStore({
    board: { boards: [original], syncMeta: {}, navHistory: [], activeBoardId: original.id },
    communicator: { activeCommunicatorId: 'comm', communicators: [{ id: 'comm', boards: [original.id] }] }
  }, { demoMode: true, persistence });
  if (!persistor.getState().bootstrapped) await new Promise(resolve => {
    const unsubscribe = persistor.subscribe(() => { if (persistor.getState().bootstrapped) { unsubscribe(); resolve(); } });
  });
  await persistor.flush();
  const result = make({ saveVerifiedBoards: jest.fn((changes, options) => store.dispatch(saveVerifiedBoards(changes, options))) });
  const refresh = () => { result.instance.props = { ...result.instance.props,
    board: store.getState().board.boards.find(item => item.id === original.id),
    boards: store.getState().board.boards,
    communicator: store.getState().communicator.communicators[0]
  }; };
  const unsubscribe = store.subscribe(refresh); refresh();
  cleanups.push(async () => { unsubscribe(); await persistor.flush(); persistor.pause(); });
  return { ...result, backend, store, persistor, values };
}

test.each(['add', 'edit', 'delete'])('real persisted native %s fails safely and retries the original snapshot', async kind => {
  const { instance, backend, store } = await persistedInstance();
  const write = backend.setItem.getMockImplementation();
  backend.setItem.mockResolvedValue(undefined);
  const payload = kind === 'edit' ? [{ ...original.tiles[0], label: '更改' }] : { id: 'stable-new-card', label: '新增' };
  const submit = () => kind === 'edit' ? instance.handleEditTileEditorSubmit(payload)
    : kind === 'add' ? instance.handleAddTileEditorSubmit(payload) : instance.handleDeleteClick();
  await expect(submit()).rejects.toMatchObject({ code: 'BOARD_PERSISTENCE_FAILED' });
  expect(instance.state.selectedTileIds).toEqual(['card']);
  backend.setItem.mockImplementation(write);
  await expect(submit()).resolves.toBe(true);
  const tiles = store.getState().board.boards[0].tiles;
  expect(tiles).toHaveLength(kind === 'add' ? 2 : kind === 'delete' ? 0 : 1);
  if (kind === 'edit') expect(tiles[0].label).toBe('更改');
});

test('delete cancellation during readback cannot announce success and the same selection retries without duplicate mutation', async () => {
  const { instance, props, backend, store } = await persistedInstance();
  const entered = deferred(), receipt = deferred();
  const read = backend.getItem.getMockImplementation();
  backend.getItem.mockImplementationOnce(async key => { entered.resolve(); await receipt.promise; return read(key); });
  let dialogCurrent = true;
  const saving = instance.handleDeleteClick({ guard: () => dialogCurrent });
  await entered.promise;
  const firstChanges = props.saveVerifiedBoards.mock.calls[0][0];
  dialogCurrent = false;
  receipt.resolve();
  await expect(saving).rejects.toMatchObject({ code: 'BOARD_SAVE_CANCELLED' });
  expect(instance.state.selectedTileIds).toEqual(['card']);
  expect(props.showNotification).not.toHaveBeenCalled();
  await expect(instance.handleDeleteClick({ guard: () => true })).resolves.toBe(true);
  expect(props.saveVerifiedBoards.mock.calls[1][0]).toEqual(firstChanges);
  expect(store.getState().board.boards[0].tiles).toEqual([]);
  expect(props.showNotification).toHaveBeenCalledTimes(1);
});

test('changed selection during delete rejects the old completion and preserves the new selection', async () => {
  const gate = deferred();
  const { instance, props } = make({ saveVerifiedBoards: jest.fn(() => gate.promise) });
  const saving = instance.handleDeleteClick({ guard: () => true });
  instance.deselectTile('card');
  gate.resolve(true);
  await expect(saving).rejects.toMatchObject({ code: 'BOARD_SAVE_CANCELLED' });
  expect(instance.state.selectedTileIds).toEqual([]);
  expect(props.showNotification).not.toHaveBeenCalled();
});

test('native folder failure and lost readback retry keep one child, one parent link and membership', async () => {
  const { instance, backend, store } = await persistedInstance();
  const read = backend.getItem.getMockImplementation();
  backend.getItem.mockRejectedValue(new Error('lost readback'));
  const folder = { id: 'folder', label: '文件夹', loadBoard: 'stable-child', type: 'folder' };
  await expect(instance.handleAddTileEditorSubmit(folder)).rejects.toMatchObject({ code: 'BOARD_PERSISTENCE_FAILED' });
  backend.getItem.mockImplementation(read);
  await expect(instance.handleAddTileEditorSubmit(folder)).resolves.toBe(true);
  expect(store.getState().board.boards).toHaveLength(2);
  expect(store.getState().board.boards[0].tiles.map(tile => tile.id)).toEqual(['card', 'folder']);
  expect(store.getState().communicator.communicators[0].boards).toEqual([original.id, 'stable-child']);
});

test('an unconfirmed native retry cannot overwrite a later board modification', async () => {
  const { instance, backend, store } = await persistedInstance();
  backend.setItem.mockResolvedValue(undefined);
  const tile = { id: 'stable-new-card', label: '新增' };
  await expect(instance.handleAddTileEditorSubmit(tile)).rejects.toBeDefined();
  store.dispatch(updateBoard({ ...store.getState().board.boards[0], name: '后续修改' }));
  const before = JSON.stringify(store.getState().board);
  await expect(instance.handleAddTileEditorSubmit(tile)).rejects.toMatchObject({ code: 'BOARD_SAVE_CONFLICT' });
  expect(JSON.stringify(store.getState().board)).toBe(before);
});

test('privacy epoch changes reject an old native callback before dispatch', async () => {
  const { instance, props } = make();
  instance.handleEditClick();
  invalidateImageOperations();
  await expect(instance.handleEditTileEditorSubmit([{ ...original.tiles[0], label: '更改' }])).rejects.toMatchObject({ code: 'BOARD_SAVE_CANCELLED' });
  expect(props.saveVerifiedBoards).not.toHaveBeenCalled();
});

test('local receipt completes before legacy cloud work can change its own communicator', async () => {
  jest.useFakeTimers();
  const { instance, props } = make({ userData: { name: 'Synthetic', email: 'synthetic@example.test' } });
  const edited = { ...original.tiles[0], label: '更改' };
  props.saveVerifiedBoards.mockImplementation(async changes => {
    const board = changes[0].board;
    instance.props = { ...instance.props, board, boards: [board] };
    return true;
  });
  instance.handleApiUpdates = jest.fn(() => {
    instance.props = { ...instance.props, communicator: { id: 'own-new-communicator' } };
    return Promise.resolve();
  });
  await expect(instance.handleEditTileEditorSubmit([edited])).resolves.toBe(true);
  expect(instance.handleApiUpdates).not.toHaveBeenCalled();
  instance.handleTileEditorCancel();
  jest.runOnlyPendingTimers();
  expect(instance.handleApiUpdates).toHaveBeenCalledWith(null, null, [edited],
    expect.objectContaining({ tiles: [edited] }), expect.objectContaining({ localCommitted: true }));
  const cloudGuard = instance.handleApiUpdates.mock.calls[0][4].scopeGuard;
  expect(cloudGuard()).toBe(true);
  instance.handleEditClick();
  expect(cloudGuard()).toBe(false);
  jest.useRealTimers();
});

test.each(['scope', 'board', 'editor'])('a %s change after the local receipt prevents stale cloud kickoff', async changed => {
  jest.useFakeTimers();
  const { instance, props } = make({ userData: { name: 'Synthetic', email: 'synthetic@example.test' } });
  props.saveVerifiedBoards.mockImplementation(async changes => {
    const board = changes[0].board;
    instance.props = { ...instance.props, board, boards: [board] };
    return true;
  });
  instance.handleApiUpdates = jest.fn().mockResolvedValue(undefined);
  await instance.handleEditTileEditorSubmit([{ ...original.tiles[0], label: '更改' }]);
  if (changed === 'scope') instance.props = { ...instance.props, playbackScope: 'other' };
  else if (changed === 'board') instance.props = { ...instance.props, boards: [{ ...instance.props.board, name: '后续修改' }] };
  else { instance.handleTileEditorCancel(); instance.handleEditClick(); }
  jest.runOnlyPendingTimers();
  expect(instance.handleApiUpdates).not.toHaveBeenCalled();
  jest.useRealTimers();
});

test('the native cloud handoff does not re-dispatch its already confirmed boards', async () => {
  const { instance, props } = make({
    userData: { name: 'Synthetic', email: 'synthetic@example.test' },
    communicator: { id: 'own', email: 'synthetic@example.test', boards: [original.id] },
    updateApiObjects: jest.fn().mockResolvedValue('parent'),
    updateApiObjectsNoChild: jest.fn().mockResolvedValue('parent'),
    replaceBoard: jest.fn(), lang: 'zh-CN'
  });
  await instance.handleApiUpdates({ id: 'folder', loadBoard: 'child', label: '文件夹' },
    null, null, { ...original, id: 'long-native-parent' }, { guard: () => true, localCommitted: true });
  expect(props.updateBoard).not.toHaveBeenCalled();
  expect(props.updateApiObjects).toHaveBeenCalledTimes(1);
});

test('a native cloud sound wait checks current scope and content again before dispatch', async () => {
  const gate = deferred();
  let current = true;
  const { instance, props } = make({ userData: { name: 'Synthetic', email: 'synthetic@example.test' } });
  instance.uploadTileSound = jest.fn(() => gate.promise);
  const tile = { id: 'new', sound: 'data:audio/mp3;base64,synthetic' };
  const syncing = instance.handleApiUpdates(tile, null, null, original,
    { guard: () => current, localCommitted: true });
  current = false;
  gate.resolve(tile);
  await expect(syncing).rejects.toMatchObject({ code: 'BOARD_SAVE_CANCELLED' });
  expect(props.updateBoard).not.toHaveBeenCalled();
  expect(props.verifyAndAddBoardCommunicator).not.toHaveBeenCalled();
});

test('a late new-board navigation cannot replace a newer editor or profile', async () => {
  jest.useFakeTimers();
  const { instance, props } = make();
  await instance.handleAddTileEditorSubmit({ id: 'board-card', loadBoard: 'child', type: 'board', label: '新图板' });
  instance.handleTileEditorCancel();
  instance.handleAddClick();
  jest.runOnlyPendingTimers();
  expect(props.switchBoard).not.toHaveBeenCalled();
  jest.useRealTimers();
});

test('native cloud result checks the action boundary before navigation and does not replace the verified board again', async () => {
  const gate = deferred();
  let current = true;
  const { instance, props } = make({
    userData: { name: 'Synthetic', email: 'synthetic@example.test' },
    communicator: { id: 'owned-communicator', email: 'synthetic@example.test' },
    updateApiObjectsNoChild: jest.fn((value, create, options) => {
      options.onGuard(() => current);
      return gate.promise;
    }), replaceBoard: jest.fn()
  });
  instance.historyReplaceBoardId = jest.fn();
  await instance.handleApiUpdates(null, null, original.tiles, original,
    { guard: () => true, scopeGuard: () => true, localCommitted: true });
  current = false;
  gate.resolve('late-server-id');
  await gate.promise;
  await Promise.resolve();
  expect(instance.historyReplaceBoardId).not.toHaveBeenCalled();
  expect(props.replaceBoard).not.toHaveBeenCalled();
  expect(props.updateApiObjectsNoChild.mock.calls[0][2].guard()).toBe(true);
});

test('an older cloud failure cannot clear the busy state of a newer native cloud request', async () => {
  const old = deferred(), newer = deferred();
  const { instance, props } = make({
    userData: { name: 'Synthetic', email: 'synthetic@example.test' },
    communicator: { id: 'owned-communicator', email: 'synthetic@example.test' },
    updateApiObjectsNoChild: jest.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise)
  });
  const options = () => ({ guard: () => true, scopeGuard: () => true, localCommitted: true });
  await instance.handleApiUpdates(null, null, original.tiles, original, options());
  await instance.handleApiUpdates(null, null, original.tiles, original, options());
  old.reject(new Error('late cloud error'));
  await old.promise.catch(() => {});
  await Promise.resolve();
  expect(props.setIsSaving).not.toHaveBeenCalledWith(false);
  newer.resolve('current-server-id');
  await newer.promise;
  await Promise.resolve();
  expect(props.setIsSaving).toHaveBeenCalledWith(false);
});

test('scope invalidation after the first sound upload prevents another sound request', async () => {
  const gate = deferred();
  let current = true;
  const { instance, props } = make({ userData: { name: 'Synthetic', email: 'synthetic@example.test' } });
  instance.uploadTileSound = jest.fn(() => gate.promise);
  const edited = [{ id: 'first', sound: 'data:audio/mp3;base64,c3ludGhldGlj' },
    { id: 'second', sound: 'data:audio/mp3;base64,c3ludGhldGlj' }];
  const saving = instance.handleApiUpdates(null, null, edited, original,
    { guard: () => current, scopeGuard: () => current, localCommitted: true });
  current = false;
  gate.resolve(edited[0]);
  await expect(saving).rejects.toMatchObject({ code: 'BOARD_SAVE_CANCELLED' });
  expect(instance.uploadTileSound).toHaveBeenCalledTimes(1);
  expect(instance.state.isSaving).toBe(false);
  expect(props.setIsSaving).toHaveBeenCalledWith(false);
});

test('unmount releases its active cloud indicator and a late result cannot navigate or clear new state', async () => {
  const gate = deferred();
  const { instance, props } = make({
    userData: { name: 'Synthetic', email: 'synthetic@example.test' },
    communicator: { id: 'owned-communicator', email: 'synthetic@example.test' },
    updateApiObjectsNoChild: jest.fn().mockReturnValue(gate.promise)
  });
  instance.stopTileAudio = jest.fn();
  instance.historyReplaceBoardId = jest.fn();
  await instance.handleApiUpdates(null, null, original.tiles, original,
    { guard: () => true, scopeGuard: () => true, localCommitted: true });
  instance.componentWillUnmount();
  expect(props.setIsSaving).toHaveBeenCalledWith(false);
  props.setIsSaving.mockClear();
  gate.resolve('late-server-id');
  await gate.promise;
  await Promise.resolve();
  expect(instance.historyReplaceBoardId).not.toHaveBeenCalled();
  expect(props.setIsSaving).not.toHaveBeenCalled();
});
