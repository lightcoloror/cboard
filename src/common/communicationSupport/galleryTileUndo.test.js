import {
  clearGalleryTileUndoSessions,
  createGalleryTileUndoService,
  MAX_GALLERY_TILE_UNDO
} from './galleryTileUndo';
import { clearSavedPhraseUndoSession } from './savedPhraseUse';

const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const person = (id, extra = {}) => ({
  id, label: '合成林安', vocalization: '合成林安', personId: id,
  image: `synthetic-private:${id}`, sound: `synthetic-sound:${id}`,
  mediaType: 'image', video: '', backgroundColor: '#fff176',
  communicationCategory: 'people', communicationSynonyms: '合成昵称',
  pictogramAttribution: {
    provider: 'device-private', originalId: id,
    author: '合成作者', license: '合成测试资料'
  },
  extension: { preserve: [id, '完整原始字段'] }, ...extra
});
const board = (tiles = [person('a'), person('b'), person('c')]) => ({
  id: 'device_private_board_synthetic', name: '合成图库',
  tiles, isFixed: true,
  grid: { rows: 2, columns: 3, order: [[tiles[0]?.id || null, null, tiles[1]?.id || null],
    [tiles[2]?.id || null, null, null]] }
});

// Separate visible state and durable data: a failed adapter may already have
// changed its Redux-like visible state, but cannot issue a durable receipt.
function fixture(initial = [board()], asynchronous = false) {
  let scope = 'scope-a';
  let allowed = true;
  let mode = '';
  const visible = new Map([[scope, clone(initial)]]);
  const durable = new Map([[scope, clone(initial)]]);
  const read = () => clone(visible.get(scope) || []);
  const loadBoards = jest.fn(() => asynchronous ? Promise.resolve().then(read) : read());
  const commit = (next, { expectedBoard, guard }) => {
    if (!guard()) throw new Error('synthetic expired guard');
    const current = read().find(item => item.id === next.id);
    if (JSON.stringify(current) !== JSON.stringify(expectedBoard)) throw new Error('synthetic conflict');
    if (mode === 'throw-before') throw new Error('synthetic write failure');
    if (mode === 'silent') return true;
    const nextBoards = read().map(item => item.id === next.id ? clone(next) : item);
    visible.set(scope, nextBoards);
    if (mode === 'memory-only') throw new Error('synthetic durable write failure');
    durable.set(scope, clone(nextBoards));
    if (mode === 'throw-after') throw new Error('synthetic lost receipt');
    return true;
  };
  const saveBoard = jest.fn((next, options) => asynchronous
    ? Promise.resolve().then(() => commit(next, options)) : commit(next, options));
  const service = createGalleryTileUndoService({
    getScopeKey: () => scope, loadBoards, saveBoard,
    canManage: () => allowed, now: () => 100
  });
  return {
    // Platforms keep one service per store. Reopening a manager reconnects to
    // that service; distinct repositories must not share their undo snapshots.
    service, open: () => service, saveBoard, loadBoards, read,
    persisted: () => clone(durable.get(scope) || []),
    fail: value => { mode = value; },
    allow: value => { allowed = value; },
    switchScope: value => { scope = value; },
    replace: value => { visible.set(scope, clone(value)); durable.set(scope, clone(value)); }
  };
}
const tileIds = f => f.read()[0].tiles.map(tile => tile.id);
const remove = (f, id = 'b', options) => f.service.delete(f.read()[0].id, id, options);

beforeEach(clearGalleryTileUndoSessions);
afterEach(clearGalleryTileUndoSessions);

test('ordinary communication workspace remount keeps the gallery session while explicit cleanup clears it', async () => {
  const f = fixture();
  await remove(f);
  const original = f.service.state();
  clearSavedPhraseUndoSession({ preserveGallery: true });
  expect(f.service.state()).toEqual(original);
  clearSavedPhraseUndoSession();
  expect(f.service.state().count).toBe(0);
});

test('workspace initialization still clears a gallery session if its identity actually changed', async () => {
  const f = fixture(); await remove(f);
  f.switchScope('scope-b');
  clearSavedPhraseUndoSession({ preserveGallery: true });
  f.switchScope('scope-a');
  clearSavedPhraseUndoSession({ preserveGallery: true });
  expect(f.service.state().count).toBe(0);
});

test.each([false, true])('restores exact original identity and all fields with sync/Promise adapters (%s)', async asynchronous => {
  const initial = board();
  const f = fixture([initial], asynchronous);
  await remove(f);
  const state = f.service.state();
  expect(state).toMatchObject({ count: 1, label: '合成林安' });
  expect(state.operationId).toBeTruthy();
  expect(tileIds(f)).toEqual(['a', 'c']);
  await f.open().undo(state.operationId);
  expect(f.read()[0].tiles).toEqual(initial.tiles);
  expect(f.persisted()).toEqual(f.read());
  expect(f.service.state().count).toBe(0);
  // All labels are deliberately equal: restoration must not match by text.
  expect(f.read()[0].tiles[1].image).toBe('synthetic-private:b');
  expect(f.read()[0].tiles[1].personId).toBe('b');
});

test('restores the original grid cell, including gaps and unrelated cells', async () => {
  const initial = board();
  const f = fixture([initial]);
  await remove(f);
  expect(f.read()[0].grid.order.flat()).not.toContain('b');
  await f.service.undo(f.service.state().operationId);
  expect(f.read()[0].grid).toEqual(initial.grid);
});

test('an occupied original grid cell rejects undo without displacing a later tile', async () => {
  const f = fixture();
  await remove(f);
  const operationId = f.service.state().operationId;
  const latest = f.read();
  latest[0].tiles.push(person('later'));
  latest[0].grid.order[0][2] = 'later';
  f.replace(latest);
  const calls = f.saveBoard.mock.calls.length;
  await expect(f.service.undo(operationId)).rejects.toThrow();
  expect(f.saveBoard).toHaveBeenCalledTimes(calls);
  expect(f.read()).toEqual(latest);
  expect(f.service.state()).toMatchObject({ count: 1, operationId });
});

test('restores mini layout display order independently of tiles array order', async () => {
  const initial = board();
  delete initial.grid;
  initial.layout = { rows: 1, columns: 3, tileIds: ['c', 'b', 'a'] };
  const f = fixture([initial]);
  await remove(f);
  expect(f.read()[0].layout.tileIds).toEqual(['c', 'a']);
  await f.service.undo(f.service.state().operationId);
  expect(f.read()[0].layout).toEqual(initial.layout);
  expect(f.read()[0].tiles).toEqual(initial.tiles);
});

test('twenty-one consecutive deletions retain only the latest twenty, in LIFO order', async () => {
  expect(MAX_GALLERY_TILE_UNDO).toBe(20);
  const initial = board(Array.from({ length: 21 }, (_, i) => person(`p${i}`)));
  delete initial.grid;
  const f = fixture([initial]);
  for (const tile of initial.tiles) await remove(f, tile.id);
  expect(f.open().state().count).toBe(20);
  for (let i = 20; i >= 1; i--) {
    const operationId = f.service.state().operationId;
    await f.open().undo(operationId);
    expect(tileIds(f)).toContain(`p${i}`);
    expect(f.service.state().count).toBe(i - 1);
  }
  expect(tileIds(f)).toEqual(initial.tiles.slice(1).map(tile => tile.id));
  expect(tileIds(f)).not.toContain('p0');
});

test('double delete and double undo never duplicate records or restored tiles', async () => {
  const f = fixture(undefined, true);
  const deletions = await Promise.allSettled([remove(f), remove(f)]);
  expect(deletions.some(result => result.status === 'fulfilled')).toBe(true);
  expect(f.service.state().count).toBe(1);
  const operationId = f.service.state().operationId;
  const restores = await Promise.allSettled([f.service.undo(operationId), f.service.undo(operationId)]);
  expect(restores.some(result => result.status === 'fulfilled')).toBe(true);
  expect(tileIds(f).filter(id => id === 'b')).toHaveLength(1);
  expect(f.service.state().count).toBe(0);
  const calls = f.saveBoard.mock.calls.length;
  await f.service.undo(operationId);
  expect(f.saveBoard.mock.calls.length).toBeGreaterThan(calls);
  expect(f.persisted()[0].tiles.filter(tile => tile.id === 'b')).toHaveLength(1);
});

test.each(['throw-before', 'throw-after', 'memory-only'])('failed deletion remains undoable (%s)', async mode => {
  const initial = board();
  const f = fixture([initial]);
  f.fail(mode);
  await expect(remove(f)).rejects.toThrow();
  const operationId = f.service.state().operationId;
  expect(f.service.state().count).toBe(1);
  f.fail('');
  const before = f.saveBoard.mock.calls.length;
  await f.service.undo(operationId);
  expect(f.saveBoard.mock.calls.length).toBeGreaterThan(before);
  expect(f.persisted()).toEqual([initial]);
  expect(f.service.state().count).toBe(0);
});

test.each(['throw-before', 'throw-after', 'memory-only'])('failed undo retains operation and retries with the same ID (%s)', async mode => {
  const initial = board();
  const f = fixture([initial]);
  await remove(f);
  const operationId = f.service.state().operationId;
  f.fail(mode);
  await expect(f.service.undo(operationId)).rejects.toThrow();
  expect(f.service.state()).toMatchObject({ count: 1, operationId });
  if (mode === 'memory-only') {
    expect(tileIds(f)).toContain('b');
    expect(f.persisted()[0].tiles.map(tile => tile.id)).not.toContain('b');
  }
  f.fail('');
  const before = f.saveBoard.mock.calls.length;
  await f.service.undo(operationId);
  expect(f.saveBoard.mock.calls.length).toBeGreaterThan(before);
  expect(f.persisted()).toEqual([initial]);
  expect(f.service.state().count).toBe(0);
});

test('post-save readback rejects silent writes and retains the recovery snapshot', async () => {
  const f = fixture();
  f.fail('silent');
  await expect(remove(f)).rejects.toThrow();
  expect(f.service.state().count).toBe(1);
  expect(tileIds(f)).toContain('b');
  f.fail('');
  await f.service.undo(f.service.state().operationId);
  await remove(f);
  const operationId = f.service.state().operationId;
  f.fail('silent');
  await expect(f.service.undo(operationId)).rejects.toThrow();
  expect(f.service.state()).toMatchObject({ count: 1, operationId });
  expect(tileIds(f)).not.toContain('b');
});

test('lost post-save readback keeps undo retryable even when the original ID is visible', async () => {
  const f = fixture();
  await remove(f);
  const operationId = f.service.state().operationId;
  const save = f.saveBoard.getMockImplementation();
  f.saveBoard.mockImplementationOnce((next, options) => {
    const result = save(next, options);
    f.loadBoards.mockImplementationOnce(() => { throw new Error('synthetic unreadable receipt'); });
    return result;
  });
  await expect(f.service.undo(operationId)).rejects.toThrow();
  expect(f.service.state()).toMatchObject({ count: 1, operationId });
  expect(tileIds(f)).toContain('b');
  const calls = f.saveBoard.mock.calls.length;
  await f.service.undo(operationId);
  expect(f.saveBoard.mock.calls.length).toBeGreaterThan(calls);
  expect(f.service.state().count).toBe(0);
});

test('undo merges into the latest board and keeps another tile and board metadata edits', async () => {
  const f = fixture();
  await remove(f);
  const operationId = f.service.state().operationId;
  const latest = f.read();
  latest[0].name = '合成后续板名';
  latest[0].tiles[0].label = '合成后续修改';
  latest[0].tiles.push(person('later'));
  latest[0].grid.order[1][1] = 'later';
  f.replace(latest);
  await f.service.undo(operationId);
  expect(tileIds(f)).toEqual(['a', 'b', 'c', 'later']);
  expect(f.read()[0].name).toBe('合成后续板名');
  expect(f.read()[0].tiles[0].label).toBe('合成后续修改');
  expect(f.read()[0].grid.order[1][1]).toBe('later');
  expect(f.persisted()).toEqual(f.read());
});

test('a conflicting original ID is never overwritten or resolved by its equal label', async () => {
  const f = fixture();
  await remove(f);
  const operationId = f.service.state().operationId;
  const latest = f.read();
  latest[0].tiles.push(person('b', { image: 'synthetic-private:different-person' }));
  f.replace(latest);
  const calls = f.saveBoard.mock.calls.length;
  await expect(f.service.undo(operationId)).rejects.toThrow();
  expect(f.saveBoard).toHaveBeenCalledTimes(calls);
  expect(f.read()).toEqual(latest);
  expect(f.service.state()).toMatchObject({ count: 1, operationId });
});

test('a missing board or revoked permission cannot recreate the board or consume undo', async () => {
  const f = fixture();
  await remove(f);
  const operationId = f.service.state().operationId;
  const afterDelete = f.read();
  f.replace([]);
  await expect(f.service.undo(operationId)).rejects.toThrow();
  expect(f.read()).toEqual([]);
  expect(f.service.state().count).toBe(1);
  f.replace(afterDelete);
  f.allow(false);
  await expect(f.service.undo(operationId)).rejects.toThrow();
  expect(f.service.state().count).toBe(1);
  f.allow(true);
  await f.service.undo(operationId);
  expect(tileIds(f)).toContain('b');
});

test.each([{ loadBoard: 'child' }, { loadBoardId: 'child' }, { type: 'board' }])('folder/link tiles are outside single-card undo (%p)', async folder => {
  const f = fixture([board([person('folder', folder)])]);
  await expect(remove(f, 'folder')).rejects.toThrow();
  expect(f.saveBoard).not.toHaveBeenCalled();
  expect(f.service.state().count).toBe(0);
});

test('delete does not rewrite existing favorite, history, draft snapshots or media records', async () => {
  const initial = board();
  const external = {
    favorites: [{ output: [clone(initial.tiles[1])] }],
    history: [{ outputSnapshot: [clone(initial.tiles[1])] }],
    draft: { pipeline: { outputSnapshot: [clone(initial.tiles[1])] } },
    media: new Map([['synthetic-private:b', 'synthetic-original-bytes']])
  };
  const snapshots = JSON.stringify([external.favorites, external.history, external.draft]);
  const f = fixture([initial]);
  await remove(f);
  await f.service.undo(f.service.state().operationId);
  expect(JSON.stringify([external.favorites, external.history, external.draft])).toBe(snapshots);
  expect(Array.from(external.media)).toEqual([['synthetic-private:b', 'synthetic-original-bytes']]);
  expect(initial.tiles[1]).toEqual(person('b'));
  expect(f.saveBoard.mock.calls.every(([value]) => value.id === initial.id)).toBe(true);
});

test('scope A-B-A invalidates a pending deletion even after returning to the same string', async () => {
  const f = fixture();
  const gate = deferred();
  const started = deferred();
  const save = f.saveBoard.getMockImplementation();
  let pendingGuard;
  f.saveBoard.mockImplementationOnce(async (next, options) => {
    pendingGuard = options.guard;
    started.resolve();
    await gate.promise;
    return save(next, options);
  });
  const pending = remove(f).then(() => 'fulfilled', () => 'rejected');
  await started.promise;
  f.switchScope('scope-b');
  expect(f.open().state().count).toBe(0);
  f.switchScope('scope-a');
  const current = f.open();
  expect(current.state().count).toBe(0);
  const stillCurrent = pendingGuard();
  gate.resolve();
  expect(stillCurrent).toBe(false);
  expect(await pending).toBe('rejected');
  expect(tileIds(f)).toEqual(['a', 'b', 'c']);
  expect(current.state().count).toBe(0);
});

test('cancelled restore does not write, pop the snapshot or block a later retry', async () => {
  const f = fixture();
  await remove(f);
  const operationId = f.service.state().operationId;
  const calls = f.saveBoard.mock.calls.length;
  await expect(f.service.undo(operationId, { guard: () => false })).rejects.toThrow();
  expect(f.saveBoard).toHaveBeenCalledTimes(calls);
  expect(f.service.state()).toMatchObject({ count: 1, operationId });
  await f.service.undo(operationId);
  expect(f.service.state().count).toBe(0);
});

test('subscribers share session state and clearing invalidates previous operation IDs', async () => {
  const f = fixture();
  const reopened = f.open();
  const listener = jest.fn();
  const unsubscribe = reopened.subscribe(listener);
  await remove(f);
  expect(listener).toHaveBeenCalled();
  expect(reopened.state()).toEqual(f.service.state());
  const operationId = f.service.state().operationId;
  f.service.clear();
  expect(reopened.state().count).toBe(0);
  await expect(reopened.undo(operationId)).rejects.toThrow();
  unsubscribe();
  listener.mockClear();
  await remove(f, 'a');
  expect(listener).not.toHaveBeenCalled();
  clearGalleryTileUndoSessions();
  expect(f.open().state().count).toBe(0);
});

test('independent stores with equal scope strings never share snapshots', async () => {
  const first = fixture();
  const second = fixture([board([person('other')])]);
  await remove(first);
  expect(first.service.state().count).toBe(1);
  expect(second.service.state().count).toBe(0);
  await expect(second.service.undo(first.service.state().operationId)).rejects.toThrow();
  expect(tileIds(second)).toEqual(['other']);
});
