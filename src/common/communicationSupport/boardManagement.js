import { assertBoardDTO, createBoardDTO, createTileDTO } from './dto';

export const PERSONAL_COMMUNICATION_BOARD_ID_PREFIX = 'device_private_board_';
export const PERSONAL_COMMUNICATION_BOARD_LINK_ID_PREFIX =
  'device_private_link_';

const BOARD_NAME_LIMIT = 40;
const BOARD_ID_LIMIT = 120;

function normalizeText(value, maxLength) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

function requireText(value, fieldName, maxLength) {
  const normalized = normalizeText(value, maxLength);
  if (!normalized) {
    throw new TypeError(`${fieldName} is required`);
  }
  return normalized;
}

function assertBoards(boards) {
  if (!Array.isArray(boards)) {
    throw new TypeError('Boards must be an array');
  }
  boards.forEach(assertBoardDTO);
  return boards;
}

function assertUniqueName(boards, name, ignoredBoardId = '') {
  const comparableName = name.toLocaleLowerCase();
  if (
    boards.some(
      board =>
        board.id !== ignoredBoardId &&
        board.name.trim().toLocaleLowerCase() === comparableName
    )
  ) {
    throw new TypeError('Board name already exists');
  }
}

function requireBoard(boards, boardId) {
  const board = boards.find(item => item.id === boardId);
  if (!board) throw new TypeError('Board was not found');
  return board;
}

function requirePersonalBoard(boards, boardId) {
  const board = requireBoard(boards, boardId);
  if (!isPersonalCommunicationBoard(board)) {
    throw new TypeError('Built-in CBoard boards cannot be edited here');
  }
  return board;
}

function replaceBoard(boards, nextBoard) {
  return boards.map(board => (board.id === nextBoard.id ? nextBoard : board));
}

export function isPersonalCommunicationBoard(board) {
  return Boolean(
    board &&
      typeof board.id === 'string' &&
      board.id.startsWith(PERSONAL_COMMUNICATION_BOARD_ID_PREFIX)
  );
}

export function createPersonalCommunicationBoard(
  boards,
  { id, name, columns = 3 } = {}
) {
  const sourceBoards = assertBoards(boards);
  const normalizedId = requireText(id, 'Board id', BOARD_ID_LIMIT);
  const normalizedName = requireText(name, 'Board name', BOARD_NAME_LIMIT);

  if (!normalizedId.startsWith(PERSONAL_COMMUNICATION_BOARD_ID_PREFIX)) {
    throw new TypeError('Personal board id must use the private prefix');
  }
  if (sourceBoards.some(board => board.id === normalizedId)) {
    throw new TypeError('Board id already exists');
  }
  assertUniqueName(sourceBoards, normalizedName);

  const board = createBoardDTO({
    id: normalizedId,
    name: normalizedName,
    communicationCategory: 'device-private',
    columns,
    tiles: []
  });
  return {
    board,
    boards: [...sourceBoards, board]
  };
}

export function renamePersonalCommunicationBoard(boards, boardId, name) {
  const sourceBoards = assertBoards(boards);
  const normalizedBoardId = requireText(boardId, 'Board id', BOARD_ID_LIMIT);
  const normalizedName = requireText(name, 'Board name', BOARD_NAME_LIMIT);
  const board = sourceBoards.find(item => item.id === normalizedBoardId);

  if (!board) throw new TypeError('Board was not found');
  if (!isPersonalCommunicationBoard(board)) {
    throw new TypeError('Built-in CBoard boards cannot be renamed here');
  }
  assertUniqueName(sourceBoards, normalizedName, normalizedBoardId);
  if (board.name === normalizedName) return sourceBoards;

  return sourceBoards.map(item => {
    const renamedTiles = item.tiles.map(tile =>
      tile.loadBoardId === normalizedBoardId
        ? { ...tile, label: normalizedName, vocalization: normalizedName }
        : tile
    );
    const hasRenamedLink = renamedTiles.some(
      (tile, index) => tile !== item.tiles[index]
    );
    const hasRenamedBoard = item.id === normalizedBoardId;

    if (!hasRenamedBoard && !hasRenamedLink) return item;
    return assertBoardDTO({
      ...item,
      ...(hasRenamedBoard ? { name: normalizedName } : {}),
      tiles: renamedTiles
    });
  });
}

export function moveCommunicationBoard(boards, boardId, direction) {
  const sourceBoards = assertBoards(boards);
  const normalizedBoardId = requireText(boardId, 'Board id', BOARD_ID_LIMIT);
  const index = sourceBoards.findIndex(board => board.id === normalizedBoardId);
  if (index < 0) throw new TypeError('Board was not found');
  if (direction !== 'up' && direction !== 'down') {
    throw new TypeError('Board direction must be up or down');
  }

  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= sourceBoards.length) {
    return sourceBoards;
  }

  const nextBoards = [...sourceBoards];
  const current = nextBoards[index];
  nextBoards[index] = nextBoards[nextIndex];
  nextBoards[nextIndex] = current;
  return nextBoards;
}

export function wouldCreateCommunicationBoardLinkCycle(
  boards,
  sourceBoardId,
  targetBoardId
) {
  const sourceBoards = assertBoards(boards);
  const normalizedSourceId = requireText(
    sourceBoardId,
    'Source board id',
    BOARD_ID_LIMIT
  );
  const normalizedTargetId = requireText(
    targetBoardId,
    'Target board id',
    BOARD_ID_LIMIT
  );
  requireBoard(sourceBoards, normalizedSourceId);
  requireBoard(sourceBoards, normalizedTargetId);

  if (normalizedSourceId === normalizedTargetId) return true;

  const visited = new Set();
  const pending = [normalizedTargetId];

  while (pending.length) {
    const currentId = pending.shift();
    if (currentId === normalizedSourceId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentBoard = sourceBoards.find(board => board.id === currentId);
    if (!currentBoard) continue;
    currentBoard.tiles.forEach(tile => {
      const linkedId = tile.loadBoardId.trim();
      if (linkedId && !visited.has(linkedId)) pending.push(linkedId);
    });
  }

  return false;
}

export function addCommunicationBoardLink(
  boards,
  {
    sourceBoardId,
    targetBoardId,
    tileId,
    image = '',
    backgroundColor = '#dcece6'
  } = {}
) {
  const sourceBoards = assertBoards(boards);
  const normalizedSourceId = requireText(
    sourceBoardId,
    'Source board id',
    BOARD_ID_LIMIT
  );
  const normalizedTargetId = requireText(
    targetBoardId,
    'Target board id',
    BOARD_ID_LIMIT
  );
  const normalizedTileId = requireText(tileId, 'Link tile id', BOARD_ID_LIMIT);
  const sourceBoard = requireBoard(sourceBoards, normalizedSourceId);
  const targetBoard = requireBoard(sourceBoards, normalizedTargetId);

  if (
    !normalizedTileId.startsWith(PERSONAL_COMMUNICATION_BOARD_LINK_ID_PREFIX)
  ) {
    throw new TypeError(
      'Personal board link id must use the private link prefix'
    );
  }
  if (sourceBoard.tiles.some(tile => tile.id === normalizedTileId)) {
    throw new TypeError('Link tile id already exists');
  }
  if (sourceBoard.tiles.some(tile => tile.loadBoardId === normalizedTargetId)) {
    throw new TypeError('Board link already exists');
  }
  if (
    wouldCreateCommunicationBoardLinkCycle(
      sourceBoards,
      normalizedSourceId,
      normalizedTargetId
    )
  ) {
    throw new TypeError('Board link would create a cycle');
  }

  const tile = createTileDTO(
    {
      id: normalizedTileId,
      label: targetBoard.name,
      vocalization: targetBoard.name,
      image: normalizeText(image, 2000),
      backgroundColor: normalizeText(backgroundColor, 80) || '#dcece6',
      loadBoardId: normalizedTargetId,
      communicationCategory: 'core'
    },
    { boardId: normalizedSourceId }
  );
  const tileIds = [...sourceBoard.layout.tileIds, tile.id];
  const nextBoard = assertBoardDTO({
    ...sourceBoard,
    layout: {
      ...sourceBoard.layout,
      rows: Math.max(
        sourceBoard.layout.rows,
        Math.ceil(tileIds.length / sourceBoard.layout.columns)
      ),
      tileIds
    },
    tiles: [...sourceBoard.tiles, tile]
  });

  return {
    tile,
    boards: replaceBoard(sourceBoards, nextBoard)
  };
}

export function addPersonalCommunicationBoardLink(boards, input = {}) {
  const sourceBoards = assertBoards(boards);
  const normalizedSourceId = requireText(
    input.sourceBoardId,
    'Source board id',
    BOARD_ID_LIMIT
  );
  requirePersonalBoard(sourceBoards, normalizedSourceId);
  return addCommunicationBoardLink(sourceBoards, input);
}

export function removeCommunicationBoardLink(
  boards,
  sourceBoardId,
  targetBoardId
) {
  const sourceBoards = assertBoards(boards);
  const normalizedSourceId = requireText(
    sourceBoardId,
    'Source board id',
    BOARD_ID_LIMIT
  );
  const normalizedTargetId = requireText(
    targetBoardId,
    'Target board id',
    BOARD_ID_LIMIT
  );
  const sourceBoard = requireBoard(sourceBoards, normalizedSourceId);
  const removedTiles = sourceBoard.tiles.filter(
    tile =>
      tile.loadBoardId === normalizedTargetId &&
      tile.id.startsWith(PERSONAL_COMMUNICATION_BOARD_LINK_ID_PREFIX)
  );

  if (!removedTiles.length) throw new TypeError('Board link was not found');

  const removedIds = new Set(removedTiles.map(tile => tile.id));
  const nextBoard = assertBoardDTO({
    ...sourceBoard,
    layout: {
      ...sourceBoard.layout,
      tileIds: sourceBoard.layout.tileIds.filter(id => !removedIds.has(id))
    },
    tiles: sourceBoard.tiles.filter(tile => !removedIds.has(tile.id))
  });

  return replaceBoard(sourceBoards, nextBoard);
}

export function removePersonalCommunicationBoardLink(
  boards,
  sourceBoardId,
  targetBoardId
) {
  const sourceBoards = assertBoards(boards);
  const normalizedSourceId = requireText(
    sourceBoardId,
    'Source board id',
    BOARD_ID_LIMIT
  );
  requirePersonalBoard(sourceBoards, normalizedSourceId);
  return removeCommunicationBoardLink(
    sourceBoards,
    normalizedSourceId,
    targetBoardId
  );
}

export function removePersonalCommunicationBoard(boards, boardId) {
  const sourceBoards = assertBoards(boards);
  const normalizedBoardId = requireText(boardId, 'Board id', BOARD_ID_LIMIT);
  const board = sourceBoards.find(item => item.id === normalizedBoardId);

  if (!board) throw new TypeError('Board was not found');
  if (!isPersonalCommunicationBoard(board)) {
    throw new TypeError('Built-in CBoard boards cannot be deleted here');
  }
  if (board.tiles.length) {
    throw new TypeError('Move or delete all board pictograms first');
  }
  if (
    sourceBoards.some(item =>
      item.tiles.some(tile => tile.loadBoardId === normalizedBoardId)
    )
  ) {
    throw new TypeError('Board is still referenced by a navigation tile');
  }
  if (sourceBoards.length <= 1) {
    throw new TypeError('Picture library must contain at least one board');
  }

  return sourceBoards.filter(item => item.id !== normalizedBoardId);
}
