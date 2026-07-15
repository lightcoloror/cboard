import { getCommunicationTileMetadata } from './tileMetadata';

export const COMMUNICATION_DTO_VERSION = 1;
export const BOARD_DTO_TYPE = 'BoardDTO';
export const TILE_DTO_TYPE = 'TileDTO';
export const DEFAULT_BOARD_DTO_COLUMNS = 4;

function normalizeText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function isNonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function requireText(value, fieldName) {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }

  return normalized;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeHintList(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[,\n]/);
  const seen = new Set();

  return raw.map(normalizeText).filter(item => {
    if (!item || seen.has(item)) {
      return false;
    }

    seen.add(item);
    return true;
  });
}

function resolveText(source, resolver, fallbackKeys) {
  const resolved = typeof resolver === 'function' ? resolver(source) : '';

  if (normalizeText(resolved)) {
    return normalizeText(resolved);
  }

  for (let index = 0; index < fallbackKeys.length; index += 1) {
    const fallback = normalizeText(source && source[fallbackKeys[index]]);
    if (fallback) {
      return fallback;
    }
  }

  return '';
}

function buildOrderedTileIds(source, tiles) {
  const tileIds = tiles.map(tile => tile.id);
  const validIds = new Set(tileIds);
  const explicitOrder =
    source && source.layout && Array.isArray(source.layout.tileIds)
      ? source.layout.tileIds
      : source && source.grid && Array.isArray(source.grid.order)
      ? source.grid.order.reduce(
          (flatOrder, row) => flatOrder.concat(Array.isArray(row) ? row : []),
          []
        )
      : [];
  const seen = new Set();
  const orderedIds = [];

  explicitOrder.forEach(value => {
    const id = normalizeText(value);
    if (id && validIds.has(id) && !seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  });

  tileIds.forEach(id => {
    if (!seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  });

  return orderedIds;
}

export function createTileDTO(source, options = {}) {
  const tile = source || {};
  const metadata = getCommunicationTileMetadata(tile);
  const label = resolveText(tile, options.resolveLabel, [
    'label',
    'vocalization',
    'labelKey'
  ]);
  const dto = {
    dtoType: TILE_DTO_TYPE,
    version: COMMUNICATION_DTO_VERSION,
    id: requireText(tile.id, 'TileDTO.id'),
    boardId: requireText(options.boardId || tile.boardId, 'TileDTO.boardId'),
    label: requireText(label, 'TileDTO.label'),
    vocalization: normalizeText(tile.vocalization) || label,
    image: normalizeText(tile.image),
    backgroundColor: normalizeText(tile.backgroundColor),
    keyPath: normalizeText(tile.keyPath),
    loadBoardId: normalizeText(tile.loadBoardId || tile.loadBoard),
    communication: {
      synonyms: normalizeHintList(metadata.synonyms),
      excludeTokens: normalizeHintList(metadata.excludeTokens),
      category: normalizeText(metadata.category)
    }
  };

  return assertTileDTO(dto);
}

export function createBoardDTO(source, options = {}) {
  const board = source || {};
  const id = requireText(board.id, 'BoardDTO.id');
  const sourceTiles = Array.isArray(board.tiles) ? board.tiles : [];
  const tiles = sourceTiles.map(tile =>
    createTileDTO(tile, {
      boardId: id,
      resolveLabel: options.resolveTileLabel
    })
  );
  const uniqueIds = new Set(tiles.map(tile => tile.id));

  if (uniqueIds.size !== tiles.length) {
    throw new TypeError('BoardDTO.tiles must use unique ids');
  }

  const orderedTileIds = buildOrderedTileIds(board, tiles);
  const sourceLayout = board.layout || board.grid || {};
  const columns = normalizePositiveInteger(
    sourceLayout.columns || board.columns,
    DEFAULT_BOARD_DTO_COLUMNS
  );
  const minimumRows = Math.max(1, Math.ceil(orderedTileIds.length / columns));
  const rows = Math.max(
    minimumRows,
    normalizePositiveInteger(sourceLayout.rows || board.rows, minimumRows)
  );
  const metadata = getCommunicationTileMetadata(board);
  const name = resolveText(board, options.resolveName, [
    'name',
    'title',
    'nameKey',
    'id'
  ]);
  const dto = {
    dtoType: BOARD_DTO_TYPE,
    version: COMMUNICATION_DTO_VERSION,
    id,
    name: requireText(name, 'BoardDTO.name'),
    nameKey: normalizeText(board.nameKey),
    category: normalizeText(metadata.category),
    layout: {
      columns,
      rows,
      tileIds: orderedTileIds
    },
    tiles
  };

  return assertBoardDTO(dto);
}

export function isTileDTO(value) {
  return Boolean(
    value &&
      value.dtoType === TILE_DTO_TYPE &&
      value.version === COMMUNICATION_DTO_VERSION &&
      isNonEmptyString(value.id) &&
      isNonEmptyString(value.boardId) &&
      isNonEmptyString(value.label) &&
      typeof value.vocalization === 'string' &&
      typeof value.image === 'string' &&
      typeof value.backgroundColor === 'string' &&
      typeof value.keyPath === 'string' &&
      typeof value.loadBoardId === 'string' &&
      value.communication &&
      isStringArray(value.communication.synonyms) &&
      isStringArray(value.communication.excludeTokens) &&
      typeof value.communication.category === 'string'
  );
}
export function assertTileDTO(value) {
  if (!isTileDTO(value)) {
    throw new TypeError('Invalid or unsupported TileDTO');
  }

  return value;
}

function hasCoherentBoardLayout(value) {
  const tileIds = value.tiles.map(tile => tile.id);
  const orderedTileIds = value.layout.tileIds;
  const uniqueTileIds = new Set(tileIds);
  const uniqueOrderedIds = new Set(orderedTileIds);

  return (
    uniqueTileIds.size === tileIds.length &&
    orderedTileIds.length === tileIds.length &&
    uniqueOrderedIds.size === orderedTileIds.length &&
    orderedTileIds.every(id => uniqueTileIds.has(id)) &&
    value.tiles.every(tile => tile.boardId === value.id) &&
    value.layout.rows * value.layout.columns >= orderedTileIds.length
  );
}

export function isBoardDTO(value) {
  return Boolean(
    value &&
      value.dtoType === BOARD_DTO_TYPE &&
      value.version === COMMUNICATION_DTO_VERSION &&
      isNonEmptyString(value.id) &&
      isNonEmptyString(value.name) &&
      typeof value.nameKey === 'string' &&
      typeof value.category === 'string' &&
      value.layout &&
      Number.isInteger(value.layout.columns) &&
      value.layout.columns > 0 &&
      Number.isInteger(value.layout.rows) &&
      value.layout.rows > 0 &&
      isStringArray(value.layout.tileIds) &&
      Array.isArray(value.tiles) &&
      value.tiles.every(isTileDTO) &&
      hasCoherentBoardLayout(value)
  );
}
export function assertBoardDTO(value) {
  if (!isBoardDTO(value)) {
    throw new TypeError('Invalid or unsupported BoardDTO');
  }

  return value;
}

export function getBoardDTOTilesInDisplayOrder(board) {
  const dto = assertBoardDTO(board);
  const byId = new Map(dto.tiles.map(tile => [tile.id, tile]));

  return dto.layout.tileIds.map(id => byId.get(id)).filter(Boolean);
}
