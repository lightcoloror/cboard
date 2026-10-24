// Reuses the verified board repository supplied by each platform. Snapshots
// live only in this runtime; neither media nor communication records are edited.
export const MAX_GALLERY_TILE_UNDO = 20;
const sessions = new Set();
let serial = 0;
const clone = value => JSON.parse(JSON.stringify(value));
const key = value => JSON.stringify(value, function (name, item) {
  return item && typeof item === 'object' && !Array.isArray(item)
    ? Object.keys(item).sort().reduce((result, field) => { result[field] = item[field]; return result; }, {}) : item;
});
const fail = message => new Error(message);

export function clearGalleryTileUndoSessions() {
  sessions.forEach(service => service.clear());
}

export function refreshGalleryTileUndoScopes() {
  sessions.forEach(service => service.state());
}

function removeTile(board, tileId) {
  const next = { ...board, tiles: board.tiles.filter(tile => tile.id !== tileId) };
  // Native CBoard fixed boards use a matrix of tile IDs. Preserve other cells.
  if (board.grid && Array.isArray(board.grid.order)) {
    next.grid = { ...board.grid, order: board.grid.order.map(row => Array.isArray(row)
      ? row.map(id => id === tileId ? null : id) : row === tileId ? null : row) };
  }
  if (board.layout && Array.isArray(board.layout.tileIds))
    next.layout = { ...board.layout, tileIds: board.layout.tileIds.filter(id => id !== tileId) };
  return next;
}

function restoreTile(board, operation) {
  const next = clone(board);
  const following = operation.followingIds.find(id => next.tiles.some(tile => tile.id === id));
  const preceding = [...operation.precedingIds].reverse().find(id => next.tiles.some(tile => tile.id === id));
  const index = following ? next.tiles.findIndex(tile => tile.id === following)
    : preceding ? next.tiles.findIndex(tile => tile.id === preceding) + 1 : Math.min(operation.index, next.tiles.length);
  next.tiles.splice(index, 0, clone(operation.snapshot));
  if (next.layout && Array.isArray(next.layout.tileIds) && operation.layoutOrder) {
    const ids = next.layout.tileIds;
    const oldIndex = operation.layoutOrder.indexOf(operation.tileId);
    if (oldIndex >= 0) {
      const followingId = operation.layoutOrder.slice(oldIndex + 1).find(id => ids.includes(id));
      const precedingId = operation.layoutOrder.slice(0, oldIndex).reverse().find(id => ids.includes(id));
      const at = followingId ? ids.indexOf(followingId) : precedingId ? ids.indexOf(precedingId) + 1 : Math.min(oldIndex, ids.length);
      if (!ids.includes(operation.tileId)) ids.splice(at, 0, operation.tileId);
      next.layout.rows = Math.max(next.layout.rows || 1, Math.ceil(ids.length / (next.layout.columns || 1)));
    }
  }
  const order = next.grid && next.grid.order;
  if (Array.isArray(order) && operation.gridOrder) {
    operation.gridOrder.forEach((row, rowIndex) => {
      if (Array.isArray(row)) row.forEach((id, colIndex) => {
        if (id !== operation.tileId) return;
        if (!Array.isArray(order[rowIndex])) throw fail('图板布局已变化，未覆盖当前图卡；撤销记录仍保留。');
        if (order[rowIndex][colIndex] != null && order[rowIndex][colIndex] !== id)
          throw fail('原图卡位置已被占用，未覆盖当前图卡；撤销记录仍保留。');
        order[rowIndex][colIndex] = id;
      });
      else if (row === operation.tileId) {
        if (order[rowIndex] != null && order[rowIndex] !== row)
          throw fail('原图卡位置已被占用，未覆盖当前图卡；撤销记录仍保留。');
        order[rowIndex] = row;
      }
    });
  }
  return next;
}

export function createGalleryTileUndoService({
  getScopeKey = () => 'local', loadBoards, saveBoard, canManage = () => true, now = Date.now
}) {
  let scope = getScopeKey();
  let generation = 0;
  let operations = [];
  let receipts = new Map();
  let pending = null;
  let identityTransition = null;
  const listeners = new Set();
  const snapshot = () => {
    const last = operations[operations.length - 1];
    return { count: operations.length, operationId: last ? last.operationId : null,
      label: last ? last.snapshot.label || last.snapshot.vocalization || '图卡' : '' };
  };
  const notify = () => listeners.forEach(listener => { try { listener(snapshot()); } catch (_) {} });
  function clear() {
    generation += 1; operations = []; receipts = new Map(); pending = null; scope = getScopeKey(); notify();
  }
  function syncScope() {
    const current = getScopeKey();
    // A synchronous, explicitly mapped store dispatch may notify subscribers
    // before its caller returns. Only its two exact scope keys are accepted.
    if (identityTransition && (current === identityTransition.from || current === identityTransition.to)) return;
    if (scope !== current) clear();
  }
  function assertPermission(board) {
    if (!board || !Array.isArray(board.tiles)) throw fail('原图板不可用，未恢复或替换其他图板。');
    if (!canManage(board) || board.careSharedReadOnly || board.readOnly)
      throw fail('当前图板为只读或权限已变化，未修改内容；撤销记录仍保留。');
  }
  function run(operationKey, options, execute) {
    syncScope();
    if (pending) return pending.key === operationKey ? pending.promise
      : Promise.reject(fail('正在确认图卡保存，请稍后重试。'));
    const expectedGeneration = generation;
    const expectedScope = scope;
    const current = () => generation === expectedGeneration && getScopeKey() === expectedScope &&
      (!options.guard || options.guard());
    const check = () => { if (!current()) throw fail('当前操作已取消或档案已切换，旧结果未应用。'); };
    const result = Promise.resolve().then(() => { check(); return execute({ check, current }); });
    const entry = { key: operationKey, promise: result };
    pending = entry;
    const done = () => { if (pending === entry) pending = null; };
    result.then(done, done);
    return result;
  }
  async function readBoard(boardId, check) {
    check(); const boards = await loadBoards(); check();
    const board = (boards || []).find(item => item.id === boardId);
    assertPermission(board);
    return clone(board);
  }
  async function commit(board, before, context) {
    context.check(); assertPermission(before);
    const saved = await saveBoard(clone(board), { expectedBoard: clone(before), guard: context.current });
    context.check();
    if (saved === false) throw fail('本机保存未确认，撤销记录仍保留，请重试。');
    const actual = await readBoard(board.id, context.check);
    // Platforms may stamp a board modification time. Every user field and the
    // full ordered tile snapshots must still equal this operation's result.
    const content = item => { const value = { ...item }; delete value.lastEdited; return value; };
    if (key(content(actual)) !== key(content(board)))
      throw fail('本机保存后核对失败，未显示成功；撤销记录仍保留。');
    return actual;
  }
  const service = {
    state() { syncScope(); return snapshot(); },
    clear,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    captureIdentityMigration(operationId, boardId) {
      syncScope();
      const operation = operations.find(item => item.operationId === operationId && item.boardId === boardId);
      const expectedGeneration = generation;
      const current = () => Boolean(operation) && generation === expectedGeneration &&
        operations.includes(operation) && !pending && scope === getScopeKey();
      return {
        isCurrent: current,
        apply({ nextScope = scope, fromBoardId, toBoardId } = {}, dispatch) {
          if (!current() || identityTransition || typeof dispatch !== 'function' ||
              (fromBoardId && (!toBoardId || typeof toBoardId !== 'string')))
            throw fail('同步身份迁移已过期，未修改撤销记录。');
          const transition = { from: scope, to: nextScope };
          identityTransition = transition;
          try {
            const result = dispatch();
            if ((result && typeof result.then === 'function') || generation !== expectedGeneration ||
                getScopeKey() !== nextScope || !operations.includes(operation)) {
              clear();
              throw fail('同步身份与预期不一致，旧撤销记录已失效。');
            }
            scope = nextScope;
            if (fromBoardId && fromBoardId !== toBoardId) {
              // Map only the IDs reported by this accepted store action. Keep
              // every tile identity, person field, media and ordering snapshot.
              new Set([...operations, ...receipts.values()]).forEach(item => {
                if (item.boardId !== fromBoardId) return;
                item.boardId = toBoardId;
                if (item.snapshot.boardId === fromBoardId) item.snapshot.boardId = toBoardId;
              });
            }
            notify();
            return result;
          } finally {
            identityTransition = null;
            syncScope();
          }
        }
      };
    },
    delete(boardId, tileId, options = {}) {
      return run(`delete:${boardId}:${tileId}`, options, async context => {
        const before = await readBoard(boardId, context.check);
        const tile = before.tiles.find(item => item.id === tileId);
        let operation = operations.find(item => item.boardId === boardId && item.tileId === tileId);
        if (!tile && !operation) throw fail('该图卡已不存在，请重新查看。');
        if (tile && (tile.loadBoard || tile.loadBoardId || tile.linkedBoard || tile.type === 'board'))
          throw fail('此撤销入口只用于单张图卡，不用于文件夹或批量删除。');
        if (operation && tile && key(operation.snapshot) !== key(tile))
          throw fail('图卡已变化，未删除后续修改的内容。');
        if (!operation) {
          if (options.expectedBoard && key(options.expectedBoard) !== key(before))
            throw fail('图板已变化，请重新查看后删除。');
          const index = before.tiles.findIndex(item => item.id === tileId);
          operation = { operationId: `gallery_${now().toString(36)}_${++serial}`, boardId, tileId, index,
            snapshot: clone(tile), gridOrder: before.grid && Array.isArray(before.grid.order) ? clone(before.grid.order) : null,
            layoutOrder: before.layout && Array.isArray(before.layout.tileIds) ? clone(before.layout.tileIds) : null,
            precedingIds: before.tiles.slice(0, index).map(item => item.id),
            followingIds: before.tiles.slice(index + 1).map(item => item.id) };
          operations = [...operations, operation].slice(-MAX_GALLERY_TILE_UNDO); notify();
        }
        let desired = removeTile(before, tileId);
        if (options.desiredBoard && options.expectedBoard && key(before) === key(options.expectedBoard)) {
          if (options.desiredBoard.id !== boardId || key(options.desiredBoard.tiles) !== key(desired.tiles))
            throw fail('删除内容与当前图卡不一致，未保存。');
          // Preserve the native editor's ownership/featured-board conversion,
          // while retaining this operation's grid reference removal.
          desired = { ...clone(options.desiredBoard), ...(desired.grid ? { grid: desired.grid } : {}) };
        }
        const actual = await commit(desired, before, context);
        context.check(); notify();
        return { changed: Boolean(tile), board: actual, deleteOperationId: operation.operationId, ...snapshot() };
      });
    },
    undo(operationId, options = {}) {
      return run(`undo:${operationId}`, options, async context => {
        const receipt = receipts.get(operationId);
        const operation = receipt || operations[operations.length - 1];
        if (!operation || operation.operationId !== operationId) throw fail('撤销状态已变化，请重新查看。');
        const before = await readBoard(operation.boardId, context.check);
        const existing = before.tiles.find(tile => tile.id === operation.tileId);
        if (existing && key(existing) !== key(operation.snapshot))
          throw fail('相同身份的图卡已被修改，未覆盖当前内容；撤销记录仍保留。');
        if (receipt && !existing) throw fail('恢复后的图卡已再次删除，未复活旧内容。');
        // Even an exact in-memory match requires the verified persistence path:
        // a previous write may have mutated memory but failed on disk.
        const actual = await commit(existing ? before : restoreTile(before, operation), before, context);
        context.check();
        if (!receipt) {
          operations.pop(); receipts.set(operationId, operation);
          if (receipts.size > MAX_GALLERY_TILE_UNDO) receipts.delete(receipts.keys().next().value);
        }
        notify();
        return { changed: !existing, board: actual, tile: clone(operation.snapshot), ...snapshot() };
      });
    }
  };
  sessions.add(service);
  return service;
}
