import { isPersonalCommunicationBoard } from './boardManagement';
import { createTileDTO } from './dto';
import {
  appendPersonalPictogramToBoard,
  removePersonalPictogramFromBoard
} from './pictogramMetadataSuggestion';
import { normalizePublicPictogramAttribution } from './pictogramAttribution';

export const CURATED_PUBLIC_PICTOGRAM_ID_PREFIX = 'curated_public_';

function requireCuratedId(value) {
  const id = String(value || '').trim();
  if (!id.startsWith(CURATED_PUBLIC_PICTOGRAM_ID_PREFIX)) {
    throw new TypeError('Curated pictogram id must use the public prefix');
  }
  return id;
}

function requirePersonalBoard(boards, boardId) {
  const board = boards.find(item => item.id === boardId);
  if (!board) throw new TypeError('Target board was not found');
  if (!isPersonalCommunicationBoard(board)) {
    throw new TypeError(
      'Public pictograms can only be curated into personal boards'
    );
  }
  return board;
}

function publicSourceKey(value) {
  const attribution = normalizePublicPictogramAttribution(value);
  return attribution ? `${attribution.provider}:${attribution.originalId}` : '';
}

export function listCuratedPublicPictograms(boards) {
  return (Array.isArray(boards) ? boards : []).flatMap(board =>
    board.tiles
      .filter(
        tile =>
          tile.id.startsWith(CURATED_PUBLIC_PICTOGRAM_ID_PREFIX) &&
          Boolean(
            normalizePublicPictogramAttribution(tile.pictogramAttribution)
          )
      )
      .map(tile => ({
        boardId: board.id,
        boardName: board.name,
        tile
      }))
  );
}

export function createCuratedPublicPictogram(
  boards,
  { id, targetBoardId, sourceTile } = {}
) {
  const sourceBoards = Array.isArray(boards) ? boards : [];
  const curatedId = requireCuratedId(id);
  const targetBoard = requirePersonalBoard(sourceBoards, targetBoardId);
  const attribution = normalizePublicPictogramAttribution(
    sourceTile && sourceTile.pictogramAttribution
  );

  if (!sourceTile || sourceTile.loadBoardId) {
    throw new TypeError('Navigation tiles cannot be curated as pictograms');
  }
  if (!String(sourceTile.image || '').trim()) {
    throw new TypeError('Public pictogram image is required');
  }
  if (!attribution) {
    throw new TypeError('Public pictogram attribution is required');
  }

  const sourceKey = publicSourceKey(attribution);
  const duplicate = targetBoard.tiles.some(
    tile => publicSourceKey(tile.pictogramAttribution) === sourceKey
  );
  if (duplicate) {
    throw new TypeError('Public pictogram already exists in target board');
  }

  const tile = createTileDTO(
    {
      ...sourceTile,
      id: curatedId,
      boardId: targetBoard.id,
      loadBoardId: '',
      sound: '',
      pictogramAttribution: attribution
    },
    { boardId: targetBoard.id }
  );

  return {
    tile,
    boards: appendPersonalPictogramToBoard(sourceBoards, targetBoard.id, tile)
  };
}

export function removeCuratedPublicPictogram(boards, boardId, tileId) {
  const sourceBoards = Array.isArray(boards) ? boards : [];
  const targetBoard = requirePersonalBoard(sourceBoards, boardId);
  const curatedId = requireCuratedId(tileId);
  const tile = targetBoard.tiles.find(item => item.id === curatedId);

  if (
    !tile ||
    !normalizePublicPictogramAttribution(tile.pictogramAttribution)
  ) {
    return null;
  }

  return {
    removed: {
      boardId: targetBoard.id,
      boardName: targetBoard.name,
      tile
    },
    boards: removePersonalPictogramFromBoard(
      sourceBoards,
      targetBoard.id,
      curatedId
    )
  };
}
