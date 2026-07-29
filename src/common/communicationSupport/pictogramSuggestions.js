import { getBoardDTOTilesInDisplayOrder } from './dto';
import {
  getPictogramTileKey,
  normalizePictogramOrderingState
} from './pictogramOrdering';

export const PICTOGRAM_SUGGESTION_MODES = Object.freeze({
  recent: 'recent',
  next: 'next'
});

const DEFAULT_SUGGESTION_LIMIT = 6;
const MAX_SUGGESTION_LIMIT = 12;

function normalizeText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeLimit(value) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return DEFAULT_SUGGESTION_LIMIT;
  return Math.max(0, Math.min(MAX_SUGGESTION_LIMIT, Math.floor(limit)));
}

function isNavigationTile(tile) {
  return Boolean(normalizeText(tile && tile.loadBoardId));
}

function buildCatalog(boards) {
  return (Array.isArray(boards) ? boards : []).flatMap((board, boardIndex) => {
    const boardId = normalizeText(board && board.id);
    if (!boardId) return [];

    return getBoardDTOTilesInDisplayOrder(board).flatMap((tile, tileIndex) =>
      tile && normalizeText(tile.id) && !isNavigationTile(tile)
        ? [
            {
              tile,
              boardId,
              key: getPictogramTileKey(boardId, tile.id),
              index: boardIndex * 10000 + tileIndex
            }
          ]
        : []
    );
  });
}

function resolveSelectedCatalogItem(catalog, selected, activeBoardId) {
  const tileId = normalizeText(selected && selected.id);
  if (!tileId) return null;
  const boardId = normalizeText(selected && selected.boardId);
  const preferredBoardId = boardId || normalizeText(activeBoardId);

  return (
    catalog.find(
      item => item.tile.id === tileId && item.boardId === preferredBoardId
    ) ||
    catalog.find(item => item.tile.id === tileId) ||
    null
  );
}

function getUsage(orderingState, item) {
  return (
    orderingState.usageByTileKey[item.key] || {
      count: 0,
      lastUsedAt: 0
    }
  );
}

function compareRecent(left, right, orderingState) {
  const leftUsage = getUsage(orderingState, left);
  const rightUsage = getUsage(orderingState, right);
  return (
    rightUsage.lastUsedAt - leftUsage.lastUsedAt ||
    rightUsage.count - leftUsage.count ||
    left.index - right.index
  );
}

function comparePopular(left, right, orderingState) {
  const leftUsage = getUsage(orderingState, left);
  const rightUsage = getUsage(orderingState, right);
  return (
    rightUsage.count - leftUsage.count ||
    rightUsage.lastUsedAt - leftUsage.lastUsedAt ||
    left.index - right.index
  );
}

export function buildExpressionPictogramSuggestions(
  boards,
  selectedTiles,
  orderingState,
  options = {}
) {
  const limit = normalizeLimit(options.limit);
  const catalog = buildCatalog(boards);
  const selected = Array.isArray(selectedTiles) ? selectedTiles : [];
  const normalizedOrdering = normalizePictogramOrderingState(orderingState);

  if (!limit || !catalog.length) {
    return {
      mode: selected.length
        ? PICTOGRAM_SUGGESTION_MODES.next
        : PICTOGRAM_SUGGESTION_MODES.recent,
      category: '',
      tiles: []
    };
  }

  if (!selected.length) {
    const tiles = catalog
      .filter(item => getUsage(normalizedOrdering, item).lastUsedAt > 0)
      .sort((left, right) => compareRecent(left, right, normalizedOrdering))
      .slice(0, limit)
      .map(item => item.tile);

    return {
      mode: PICTOGRAM_SUGGESTION_MODES.recent,
      category: '',
      tiles
    };
  }

  const lastSelected = resolveSelectedCatalogItem(
    catalog,
    selected[selected.length - 1],
    options.activeBoardId
  );
  const category = normalizeText(
    lastSelected &&
      lastSelected.tile.communication &&
      lastSelected.tile.communication.category
  );
  const selectedIds = new Set(
    selected.map(item => normalizeText(item && item.id)).filter(Boolean)
  );
  const tiles = category
    ? catalog
        .filter(
          item =>
            normalizeText(
              item.tile.communication && item.tile.communication.category
            ) === category && !selectedIds.has(item.tile.id)
        )
        .sort((left, right) => comparePopular(left, right, normalizedOrdering))
        .slice(0, limit)
        .map(item => item.tile)
    : [];

  return {
    mode: PICTOGRAM_SUGGESTION_MODES.next,
    category,
    tiles
  };
}
