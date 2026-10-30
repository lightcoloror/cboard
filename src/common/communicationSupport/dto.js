import { getCboardCommunicationConceptProfile } from './cboardConceptProfiles';
import { getCommunicationTileMetadata } from './tileMetadata';
import {
  getPictogramAttribution,
  normalizePictogramAttribution
} from './pictogramAttribution';

export const COMMUNICATION_DTO_VERSION = 1;
export const FIXED_BOARD_DTO_VERSION = 2;
export const MAX_FIXED_BOARD_CELLS = 2000;
export const BOARD_DTO_TYPE = 'BoardDTO';
export const TILE_DTO_TYPE = 'TileDTO';
export const DEFAULT_BOARD_DTO_COLUMNS = 4;

function normalizeText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeTileMediaType(value, image, video) {
  const explicit = normalizeText(value).toLocaleLowerCase();
  if (['image', 'gif', 'video'].includes(explicit)) return explicit;
  if (normalizeText(video)) return 'video';

  const normalizedImage = normalizeText(image)
    .toLocaleLowerCase()
    .split(/[?#]/)[0];
  return normalizedImage.endsWith('.gif') ||
    normalizedImage.startsWith('data:image/gif')
    ? 'gif'
    : 'image';
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

// Keep sparse native grid positions separate from the compact matching order.
// Deleted cards leave holes; new cards append on a new row. DTO v2 makes old
// readers fail closed instead of silently compressing fixed positions.
function buildFixedCells(board, columns, rows, orderedTileIds) {
  const layout = board.layout || {};
  const grid = board.grid || {};
  let input;
  if (Object.prototype.hasOwnProperty.call(layout, 'cells')) {
    if (!Array.isArray(layout.cells)) throw new TypeError('Invalid fixed grid cells');
    input = layout.cells;
  } else if (Array.isArray(grid.order)) {
    input = grid.order.reduce((flat, row) => {
      if (!Array.isArray(row) || row.length > columns) throw new TypeError('Invalid fixed grid row');
      return flat.concat(Array.from({ length: columns }, (_, index) => row[index] || null));
    }, []);
  } else return null;
  if (rows * columns > MAX_FIXED_BOARD_CELLS || input.length > MAX_FIXED_BOARD_CELLS) {
    throw new TypeError('Fixed grid exceeds the supported cell limit');
  }
  const validIds = new Set(orderedTileIds);
  const seen = new Set();
  const cells = input.map(value => {
    if (value !== null && value !== undefined && typeof value !== 'string') throw new TypeError('Invalid fixed grid cell');
    const id = normalizeText(value);
    if (!id || !validIds.has(id)) return null;
    if (seen.has(id)) throw new TypeError('Duplicate fixed grid identity');
    seen.add(id);
    return id;
  });
  while (cells.length < rows * columns) cells.push(null);
  orderedTileIds.forEach(id => {
    if (seen.has(id)) return;
    // Existing empty positions are intentional. New unpositioned cards are
    // appended on new rows; never assign them to an old empty cell implicitly.
    cells.push(id);
    seen.add(id);
  });
  while (cells.length % columns) cells.push(null);
  return cells;
}

export function createTileDTO(source, options = {}) {
  const tile = source || {};
  const metadata = getCommunicationTileMetadata(tile);
  const conceptProfile = getCboardCommunicationConceptProfile(tile.labelKey);
  const pictogramAttribution = getPictogramAttribution(tile);
  const resolvedLabel = resolveText(tile, options.resolveLabel, [
    'label',
    'vocalization',
    'labelKey'
  ]);
  const preferConceptProfileLabel = Boolean(
    conceptProfile &&
      Array.isArray(options.conceptProfileLabelKeys) &&
      options.conceptProfileLabelKeys.includes(tile.labelKey)
  );
  const synchronizeVocalization = Boolean(
    Array.isArray(options.synchronizeVocalizationLabelKeys) &&
      options.synchronizeVocalizationLabelKeys.includes(tile.labelKey)
  );
  const label = preferConceptProfileLabel
    ? normalizeText(conceptProfile.label) || resolvedLabel
    : resolvedLabel;
  const dto = {
    dtoType: TILE_DTO_TYPE,
    version: COMMUNICATION_DTO_VERSION,
    id: requireText(tile.id, 'TileDTO.id'),
    boardId: requireText(options.boardId || tile.boardId, 'TileDTO.boardId'),
    label: requireText(label, 'TileDTO.label'),
    vocalization:
      preferConceptProfileLabel || synchronizeVocalization
        ? label
        : normalizeText(tile.vocalization) || label,
    image: normalizeText(tile.image),
    mediaType: normalizeTileMediaType(tile.mediaType, tile.image, tile.video),
    video: normalizeText(tile.video),
    sound: normalizeText(tile.sound),
    backgroundColor: normalizeText(tile.backgroundColor),
    keyPath: normalizeText(tile.keyPath || tile.labelKey),
    loadBoardId: normalizeText(tile.loadBoardId || tile.loadBoard),
    ...(pictogramAttribution ? { pictogramAttribution } : {}),
    communication: {
      synonyms: normalizeHintList([
        ...normalizeHintList(metadata.synonyms),
        ...normalizeHintList(conceptProfile && conceptProfile.label),
        ...normalizeHintList(conceptProfile && conceptProfile.synonyms)
      ]),
      relatedTerms: normalizeHintList([
        ...normalizeHintList(metadata.relatedTerms),
        ...normalizeHintList(conceptProfile && conceptProfile.relatedTerms)
      ]),
      excludeTokens: normalizeHintList([
        ...normalizeHintList(metadata.excludeTokens),
        ...normalizeHintList(conceptProfile && conceptProfile.excludeTokens)
      ]),
      category: normalizeText(
        metadata.category || (conceptProfile && conceptProfile.category)
      )
    }
  };

  return assertTileDTO(dto);
}

export function createBoardDTO(source, options = {}) {
  const board = source || {};
  if (board.dtoType === BOARD_DTO_TYPE && ![COMMUNICATION_DTO_VERSION, FIXED_BOARD_DTO_VERSION].includes(board.version)) {
    throw new TypeError('Unsupported BoardDTO version; original data must be preserved');
  }
  if (board.dtoType === BOARD_DTO_TYPE && board.version === FIXED_BOARD_DTO_VERSION && !Array.isArray(board.layout && board.layout.cells)) {
    throw new TypeError('Unsupported fixed BoardDTO layout; original data must be preserved');
  }
  const id = requireText(board.id, 'BoardDTO.id');
  const sourceTiles = Array.isArray(board.tiles) ? board.tiles : [];
  const tiles = sourceTiles.map(tile =>
    createTileDTO(tile, {
      boardId: id,
      resolveLabel: options.resolveTileLabel,
      conceptProfileLabelKeys: options.conceptProfileLabelKeys,
      synchronizeVocalizationLabelKeys: options.synchronizeVocalizationLabelKeys
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
  const cells = buildFixedCells(board, columns, rows, orderedTileIds);
  const metadata = getCommunicationTileMetadata(board);
  const name = resolveText(board, options.resolveName, [
    'name',
    'title',
    'nameKey',
    'id'
  ]);
  const dto = {
    dtoType: BOARD_DTO_TYPE,
    version: cells ? FIXED_BOARD_DTO_VERSION : COMMUNICATION_DTO_VERSION,
    id,
    name: requireText(name, 'BoardDTO.name'),
    nameKey: normalizeText(board.nameKey),
    category: normalizeText(metadata.category),
    layout: {
      columns,
      rows: cells ? cells.length / columns : rows,
      tileIds: orderedTileIds,
      ...(cells ? { cells } : {})
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
      (!Object.prototype.hasOwnProperty.call(value, 'mediaType') ||
        ['image', 'gif', 'video'].includes(value.mediaType)) &&
      (!Object.prototype.hasOwnProperty.call(value, 'video') ||
        typeof value.video === 'string') &&
      (value.mediaType !== 'video' || isNonEmptyString(value.video)) &&
      (!Object.prototype.hasOwnProperty.call(value, 'sound') ||
        typeof value.sound === 'string') &&
      typeof value.backgroundColor === 'string' &&
      typeof value.keyPath === 'string' &&
      typeof value.loadBoardId === 'string' &&
      (!value.pictogramAttribution ||
        Boolean(normalizePictogramAttribution(value.pictogramAttribution))) &&
      value.communication &&
      isStringArray(value.communication.synonyms) &&
      (!Object.prototype.hasOwnProperty.call(
        value.communication,
        'relatedTerms'
      ) ||
        isStringArray(value.communication.relatedTerms)) &&
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

  const cells = value.layout.cells;
  const occupied = Array.isArray(cells) ? cells.filter(id => id !== null) : [];
  const coherentCells = cells === undefined || (
    Array.isArray(cells) &&
    cells.length <= MAX_FIXED_BOARD_CELLS &&
    cells.length === value.layout.rows * value.layout.columns &&
    occupied.length === tileIds.length &&
    new Set(occupied).size === occupied.length &&
    occupied.every(id => typeof id === 'string' && uniqueTileIds.has(id))
  );
  return (
    coherentCells &&
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
      [COMMUNICATION_DTO_VERSION, FIXED_BOARD_DTO_VERSION].includes(value.version) &&
      (value.version !== FIXED_BOARD_DTO_VERSION || Array.isArray(value.layout && value.layout.cells)) &&
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

export function getBoardDTOGridSlots(board) {
  const dto = assertBoardDTO(board);
  const byId = new Map(dto.tiles.map(tile => [tile.id, tile]));
  return (dto.layout.cells || dto.layout.tileIds).map(id => byId.get(id) || null);
}
