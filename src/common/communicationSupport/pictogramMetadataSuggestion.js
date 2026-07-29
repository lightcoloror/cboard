import {
  getCommunicationTileMetadata,
  setCommunicationTileMetadata
} from './tileMetadata';
import { assertBoardDTO, createTileDTO } from './dto';
import {
  createDevicePrivatePictogramAttribution,
  DEVICE_PRIVATE_PICTOGRAM_PROVIDER,
  normalizePictogramAttribution
} from './pictogramAttribution';

export const PICTOGRAM_METADATA_SUGGESTION_LIMITS = Object.freeze({
  labelLength: 40,
  synonymCount: 8,
  synonymLength: 24,
  categoryLength: 40
});

function normalizeText(value, maxLength) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

function normalizeList(value, maxItems, maxLength) {
  const values = Array.isArray(value)
    ? value
    : String(value || '').split(/[,，、\n]/);
  const seen = new Set();

  return values
    .map(item => normalizeText(item, maxLength))
    .filter(item => {
      if (!item || seen.has(item) || seen.size >= maxItems) return false;
      seen.add(item);
      return true;
    });
}

export function normalizePictogramMetadataSuggestion(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const label = normalizeText(
    value.label,
    PICTOGRAM_METADATA_SUGGESTION_LIMITS.labelLength
  );
  if (!label) return null;

  return {
    label,
    synonyms: normalizeList(
      value.synonyms,
      PICTOGRAM_METADATA_SUGGESTION_LIMITS.synonymCount,
      PICTOGRAM_METADATA_SUGGESTION_LIMITS.synonymLength
    ).filter(item => item !== label),
    category: normalizeText(
      value.category,
      PICTOGRAM_METADATA_SUGGESTION_LIMITS.categoryLength
    ),
    provider: normalizeText(value.provider, 80),
    sourceStored: Boolean(value.sourceStored)
  };
}

export function applyPictogramMetadataSuggestionToTile(
  tile,
  value,
  { fillEmptyOnly = true } = {}
) {
  const suggestion = normalizePictogramMetadataSuggestion(value);
  if (!suggestion) return tile;

  const current = tile || {};
  const metadata = getCommunicationTileMetadata(current);
  const next = {
    ...current,
    label:
      fillEmptyOnly && normalizeText(current.label, 1000)
        ? current.label
        : suggestion.label,
    labelKey: '',
    vocalization:
      fillEmptyOnly && normalizeText(current.vocalization, 1000)
        ? current.vocalization
        : normalizeText(current.label, 1000) || suggestion.label
  };

  return setCommunicationTileMetadata(next, {
    ...metadata,
    synonyms:
      fillEmptyOnly && normalizeText(metadata.synonyms, 1000)
        ? metadata.synonyms
        : suggestion.synonyms.join(','),
    category:
      fillEmptyOnly && normalizeText(metadata.category, 1000)
        ? metadata.category
        : suggestion.category
  });
}

function requireText(value, fieldName) {
  const normalized = normalizeText(value, 500);
  if (!normalized) {
    throw new TypeError(`${fieldName} is required`);
  }
  return normalized;
}

export function buildPersonalPictogramTileDTO(value = {}) {
  const id = requireText(value.id, 'Personal pictogram id');
  const boardId = requireText(value.boardId, 'Personal pictogram boardId');
  const image = requireText(value.image, 'Personal pictogram image');
  const suggestion = normalizePictogramMetadataSuggestion({
    label: value.label,
    synonyms: value.synonyms,
    category: value.category
  });
  if (!suggestion) {
    throw new TypeError('Personal pictogram label is required');
  }

  return createTileDTO(
    {
      id,
      label: suggestion.label,
      vocalization: normalizeText(value.vocalization, 60) || suggestion.label,
      image,
      mediaType: normalizeText(value.mediaType, 20),
      video: normalizeText(value.video, 2000),
      sound: normalizeText(value.sound, 2000),
      backgroundColor: '#fff176',
      communicationSynonyms: suggestion.synonyms.join(','),
      communicationCategory: suggestion.category,
      pictogramAttribution: createDevicePrivatePictogramAttribution({
        boardId,
        tileId: id,
        label: suggestion.label,
        author: normalizeText(value.author, 80),
        license: normalizeText(value.license, 160)
      })
    },
    { boardId }
  );
}

export function appendPersonalPictogramToBoard(boards, boardId, tile) {
  const sourceBoards = Array.isArray(boards) ? boards : [];
  const normalizedBoardId = requireText(boardId, 'Target board id');
  if (
    sourceBoards.some(board => board.tiles.some(item => item.id === tile.id))
  ) {
    throw new TypeError('Personal pictogram id already exists');
  }

  let found = false;
  const nextBoards = sourceBoards.map(board => {
    if (board.id !== normalizedBoardId) return board;
    found = true;
    const nextTile = createTileDTO(tile, {
      boardId: normalizedBoardId
    });
    const tileIds = [...board.layout.tileIds, nextTile.id];
    return assertBoardDTO({
      ...board,
      layout: {
        ...board.layout,
        rows: Math.max(1, Math.ceil(tileIds.length / board.layout.columns)),
        tileIds
      },
      tiles: [...board.tiles, nextTile]
    });
  });
  if (!found) throw new TypeError('Target board was not found');
  return nextBoards;
}

function privatePictogramSourceKey(tile) {
  const attribution = normalizePictogramAttribution(
    tile && tile.pictogramAttribution
  );
  return attribution &&
    attribution.provider === DEVICE_PRIVATE_PICTOGRAM_PROVIDER
    ? `${attribution.provider}:${attribution.originalId}`
    : '';
}

export function movePersonalPictogramInBoard(
  boards,
  boardId,
  tileId,
  direction
) {
  const sourceBoards = Array.isArray(boards) ? boards : [];
  const normalizedBoardId = requireText(boardId, 'Target board id');
  const normalizedTileId = requireText(tileId, 'Personal pictogram id');
  if (direction !== 'earlier' && direction !== 'later') {
    throw new TypeError('Move direction must be earlier or later');
  }

  const board = sourceBoards.find(item => item.id === normalizedBoardId);
  if (!board) throw new TypeError('Target board was not found');

  const tile = board.tiles.find(item => item.id === normalizedTileId);
  if (!tile || !privatePictogramSourceKey(tile) || tile.loadBoardId) {
    throw new TypeError('Personal pictogram was not found');
  }

  const sourceIndex = board.layout.tileIds.indexOf(normalizedTileId);
  if (sourceIndex < 0) {
    throw new TypeError('Personal pictogram is missing from board layout');
  }
  const targetIndex =
    direction === 'earlier' ? sourceIndex - 1 : sourceIndex + 1;
  if (targetIndex < 0 || targetIndex >= board.layout.tileIds.length) {
    return boards;
  }

  const tileIds = [...board.layout.tileIds];
  tileIds[sourceIndex] = tileIds[targetIndex];
  tileIds[targetIndex] = normalizedTileId;

  return sourceBoards.map(item =>
    item.id === normalizedBoardId
      ? assertBoardDTO({
          ...item,
          layout: {
            ...item.layout,
            tileIds
          }
        })
      : item
  );
}

export function copyPersonalPictogramToBoard(
  boards,
  sourceBoardId,
  tileId,
  targetBoardId,
  copiedTileId
) {
  const sourceBoards = Array.isArray(boards) ? boards : [];
  const normalizedSourceBoardId = requireText(sourceBoardId, 'Source board id');
  const normalizedTileId = requireText(tileId, 'Personal pictogram id');
  const normalizedTargetBoardId = requireText(targetBoardId, 'Target board id');
  const normalizedCopiedTileId = requireText(
    copiedTileId,
    'Copied pictogram id'
  );
  if (normalizedSourceBoardId === normalizedTargetBoardId) {
    throw new TypeError('Source and target boards must be different');
  }

  const sourceBoard = sourceBoards.find(
    board => board.id === normalizedSourceBoardId
  );
  const targetBoard = sourceBoards.find(
    board => board.id === normalizedTargetBoardId
  );
  if (!sourceBoard) throw new TypeError('Source board was not found');
  if (!targetBoard) throw new TypeError('Target board was not found');

  const sourceTile = sourceBoard.tiles.find(
    tile => tile.id === normalizedTileId
  );
  const sourceKey = privatePictogramSourceKey(sourceTile);
  if (!sourceTile || !sourceKey || sourceTile.loadBoardId) {
    throw new TypeError('Personal pictogram was not found');
  }
  if (
    targetBoard.tiles.some(
      tile => privatePictogramSourceKey(tile) === sourceKey
    )
  ) {
    throw new TypeError('Personal pictogram already exists in target board');
  }

  const copiedTile = createTileDTO(
    {
      ...sourceTile,
      id: normalizedCopiedTileId,
      boardId: normalizedTargetBoardId,
      loadBoardId: '',
      pictogramAttribution: sourceTile.pictogramAttribution
    },
    { boardId: normalizedTargetBoardId }
  );

  return {
    source: {
      boardId: sourceBoard.id,
      boardName: sourceBoard.name,
      tile: sourceTile
    },
    tile: copiedTile,
    boards: appendPersonalPictogramToBoard(
      sourceBoards,
      normalizedTargetBoardId,
      copiedTile
    )
  };
}

export function updatePersonalPictogramInBoards(
  boards,
  sourceBoardId,
  targetBoardId,
  tile
) {
  const sourceBoards = Array.isArray(boards) ? boards : [];
  const normalizedSourceBoardId = requireText(sourceBoardId, 'Source board id');
  const normalizedTargetBoardId = requireText(targetBoardId, 'Target board id');
  const sourceBoard = sourceBoards.find(
    board => board.id === normalizedSourceBoardId
  );
  if (!sourceBoard) {
    throw new TypeError('Source board was not found');
  }
  if (!sourceBoards.some(board => board.id === normalizedTargetBoardId)) {
    throw new TypeError('Target board was not found');
  }

  const normalizedTile = createTileDTO(tile, {
    boardId: normalizedTargetBoardId
  });
  if (!sourceBoard.tiles.some(item => item.id === normalizedTile.id)) {
    throw new TypeError('Personal pictogram was not found');
  }
  if (
    sourceBoards.some(
      board =>
        board.id !== normalizedSourceBoardId &&
        board.tiles.some(item => item.id === normalizedTile.id)
    )
  ) {
    throw new TypeError('Personal pictogram id already exists');
  }

  if (normalizedSourceBoardId === normalizedTargetBoardId) {
    return sourceBoards.map(board =>
      board.id === normalizedSourceBoardId
        ? assertBoardDTO({
            ...board,
            tiles: board.tiles.map(item =>
              item.id === normalizedTile.id ? normalizedTile : item
            )
          })
        : board
    );
  }

  return appendPersonalPictogramToBoard(
    removePersonalPictogramFromBoard(
      sourceBoards,
      normalizedSourceBoardId,
      normalizedTile.id
    ),
    normalizedTargetBoardId,
    normalizedTile
  );
}

export function removePersonalPictogramFromBoard(boards, boardId, tileId) {
  const normalizedBoardId = requireText(boardId, 'Target board id');
  const normalizedTileId = requireText(tileId, 'Personal pictogram id');
  let removed = false;
  const nextBoards = (Array.isArray(boards) ? boards : []).map(board => {
    if (board.id !== normalizedBoardId) return board;
    const tiles = board.tiles.filter(tile => tile.id !== normalizedTileId);
    if (tiles.length === board.tiles.length) return board;
    removed = true;
    const tileIds = board.layout.tileIds.filter(id => id !== normalizedTileId);
    return assertBoardDTO({
      ...board,
      layout: {
        ...board.layout,
        rows: Math.max(1, Math.ceil(tileIds.length / board.layout.columns)),
        tileIds
      },
      tiles
    });
  });
  return removed ? nextBoards : boards;
}
