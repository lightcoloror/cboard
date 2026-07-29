export const PICTOGRAM_ORDERING_SCHEMA_VERSION = 1;
export const DEFAULT_PICTOGRAM_SORT_MODE = 'manual';
export const PICTOGRAM_SORT_MODES = Object.freeze([
  DEFAULT_PICTOGRAM_SORT_MODE,
  'popularity'
]);

const MAX_BOARD_COUNT = 200;
const MAX_TILE_COUNT = 5000;

function normalizeText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0
    ? Math.floor(timestamp)
    : 0;
}

function normalizeUsageCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(count))
    : 0;
}

function normalizeIdList(value, limit = MAX_TILE_COUNT) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map(normalizeText)
    .filter(id => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, limit);
}

function isNavigationTile(tile) {
  return Boolean(normalizeText(tile && (tile.loadBoardId || tile.loadBoard)));
}

function normalizeBoardTileIds(tiles, savedOrder) {
  const sourceTiles = Array.isArray(tiles) ? tiles : [];
  const sourceIds = normalizeIdList(sourceTiles.map(tile => tile && tile.id));
  const availableIds = new Set(sourceIds);
  const orderedIds = normalizeIdList(savedOrder).filter(id =>
    availableIds.has(id)
  );
  const seen = new Set(orderedIds);

  sourceIds.forEach(id => {
    if (!seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  });

  return orderedIds;
}

export function getPictogramTileKey(boardId, tileId) {
  const normalizedBoardId = normalizeText(boardId);
  const normalizedTileId = normalizeText(tileId);
  return normalizedBoardId && normalizedTileId
    ? `${normalizedBoardId}:${normalizedTileId}`
    : '';
}

export function normalizePictogramSortMode(value) {
  return PICTOGRAM_SORT_MODES.includes(value)
    ? value
    : DEFAULT_PICTOGRAM_SORT_MODE;
}

export function normalizePictogramOrderingState(value) {
  const input = value && typeof value === 'object' ? value : {};
  const rawOrders =
    input.manualOrderByBoard && typeof input.manualOrderByBoard === 'object'
      ? input.manualOrderByBoard
      : {};
  const rawUsage =
    input.usageByTileKey && typeof input.usageByTileKey === 'object'
      ? input.usageByTileKey
      : {};
  const manualOrderByBoard = {};
  const usageByTileKey = {};

  Object.keys(rawOrders)
    .slice(0, MAX_BOARD_COUNT)
    .forEach(rawBoardId => {
      const boardId = normalizeText(rawBoardId);
      const tileIds = normalizeIdList(rawOrders[rawBoardId]);
      if (boardId && tileIds.length) manualOrderByBoard[boardId] = tileIds;
    });

  Object.keys(rawUsage)
    .slice(0, MAX_TILE_COUNT)
    .forEach(rawKey => {
      const key = normalizeText(rawKey);
      const record = rawUsage[rawKey];
      const count = normalizeUsageCount(record && record.count);
      if (!key || !count) return;
      usageByTileKey[key] = {
        count,
        lastUsedAt: normalizeTimestamp(record && record.lastUsedAt)
      };
    });

  return {
    schemaVersion: PICTOGRAM_ORDERING_SCHEMA_VERSION,
    manualOrderByBoard,
    usageByTileKey
  };
}

export function getManualPictogramOrder(tiles, state, boardId) {
  const normalized = normalizePictogramOrderingState(state);
  return normalizeBoardTileIds(
    tiles,
    normalized.manualOrderByBoard[normalizeText(boardId)]
  );
}

export function getPictogramUsageCount(state, boardId, tileId) {
  const key = getPictogramTileKey(boardId, tileId);
  const normalized = normalizePictogramOrderingState(state);
  return key && normalized.usageByTileKey[key]
    ? normalized.usageByTileKey[key].count
    : 0;
}

export function sortPictogramsForDisplay(tiles, mode, state, boardId) {
  const sourceTiles = Array.isArray(tiles) ? tiles : [];
  const normalizedState = normalizePictogramOrderingState(state);
  const normalizedBoardId = normalizeText(boardId);
  const tilesById = new Map(
    sourceTiles
      .filter(tile => tile && normalizeText(tile.id))
      .map(tile => [normalizeText(tile.id), tile])
  );
  const manualIds = normalizeBoardTileIds(
    sourceTiles,
    normalizedState.manualOrderByBoard[normalizedBoardId]
  );
  const manualTiles = manualIds.map(id => tilesById.get(id)).filter(Boolean);

  if (normalizePictogramSortMode(mode) === 'manual') return manualTiles;

  const manualIndex = new Map(manualIds.map((id, index) => [id, index]));
  const usageCount = tileId => {
    const key = getPictogramTileKey(normalizedBoardId, tileId);
    const record = key && normalizedState.usageByTileKey[key];
    return record ? record.count : 0;
  };
  const popularTiles = manualTiles
    .filter(tile => !isNavigationTile(tile))
    .sort((left, right) => {
      const usageDifference = usageCount(right.id) - usageCount(left.id);
      if (usageDifference) return usageDifference;
      return manualIndex.get(left.id) - manualIndex.get(right.id);
    });
  let popularIndex = 0;

  return manualTiles.map(tile =>
    isNavigationTile(tile) ? tile : popularTiles[popularIndex++]
  );
}

export function movePictogramManualOrder(
  tiles,
  state,
  boardId,
  tileId,
  direction
) {
  const normalized = normalizePictogramOrderingState(state);
  const normalizedBoardId = normalizeText(boardId);
  const normalizedTileId = normalizeText(tileId);
  if (
    !normalizedBoardId ||
    !normalizedTileId ||
    (direction !== 'up' && direction !== 'down')
  ) {
    return normalized;
  }

  const sourceTiles = Array.isArray(tiles) ? tiles : [];
  const tilesById = new Map(
    sourceTiles
      .filter(tile => tile && normalizeText(tile.id))
      .map(tile => [normalizeText(tile.id), tile])
  );
  const order = normalizeBoardTileIds(
    sourceTiles,
    normalized.manualOrderByBoard[normalizedBoardId]
  );
  const movableIds = order.filter(id => !isNavigationTile(tilesById.get(id)));
  const movableIndex = movableIds.indexOf(normalizedTileId);
  const targetIndex = direction === 'up' ? movableIndex - 1 : movableIndex + 1;

  if (movableIndex < 0 || targetIndex < 0 || targetIndex >= movableIds.length) {
    return normalized;
  }

  const nextOrder = [...order];
  const currentPosition = nextOrder.indexOf(movableIds[movableIndex]);
  const targetPosition = nextOrder.indexOf(movableIds[targetIndex]);
  [nextOrder[currentPosition], nextOrder[targetPosition]] = [
    nextOrder[targetPosition],
    nextOrder[currentPosition]
  ];

  return {
    ...normalized,
    manualOrderByBoard: {
      ...normalized.manualOrderByBoard,
      [normalizedBoardId]: nextOrder
    }
  };
}

export function recordPictogramUsage(state, boardId, tileId, now = Date.now()) {
  const normalized = normalizePictogramOrderingState(state);
  const key = getPictogramTileKey(boardId, tileId);
  if (!key) return normalized;
  const previous = normalized.usageByTileKey[key];

  return {
    ...normalized,
    usageByTileKey: {
      ...normalized.usageByTileKey,
      [key]: {
        count: Math.min(
          Number.MAX_SAFE_INTEGER,
          (previous ? previous.count : 0) + 1
        ),
        lastUsedAt: normalizeTimestamp(now)
      }
    }
  };
}
