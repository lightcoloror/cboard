import { PERSONAL_COMMUNICATION_BOARD_ID_PREFIX } from './boardManagement';
import { createBoardDTO } from './dto';
import { createDevicePrivatePictogramAttribution } from './pictogramAttribution';

export const OPEN_BOARD_FORMAT_VERSION = 'open-board-0.1';
export const OPEN_BOARD_IMPORT_BOARD_ID_PREFIX = `${PERSONAL_COMMUNICATION_BOARD_ID_PREFIX}obf_`;

const CBOARD_EXTENSION_PREFIX = 'ext_cboard_';
export const MAX_OPEN_BOARD_DOCUMENTS = 500;
export const MAX_OPEN_BOARD_BUTTONS = 20000;

function normalizeText(value, maxLength = 500) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .slice(0, maxLength);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function stableHash(value) {
  let hash = 2166136261;
  const text = normalizeText(value, 5000);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function safeIdPart(value, fallback) {
  const normalized = normalizeText(value, 80)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function toCamelCase(value) {
  return normalizeText(value).replace(/(_\w)/g, match =>
    match[1].toUpperCase()
  );
}

function copyCboardExtensions(source, target) {
  Object.keys(source || {})
    .filter(key => key.startsWith(CBOARD_EXTENSION_PREFIX))
    .forEach(key => {
      target[toCamelCase(key.slice(CBOARD_EXTENSION_PREFIX.length))] =
        source[key];
    });
  return target;
}

export function normalizeOpenBoardArchivePath(value) {
  const normalized = normalizeText(value, 500)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/{2,}/g, '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.includes('\0') ||
    normalized.split('/').some(part => !part || part === '.' || part === '..')
  ) {
    return '';
  }
  return normalized;
}

export function isOpenBoardDocument(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value instanceof Error ||
    value.format !== OPEN_BOARD_FORMAT_VERSION ||
    !Array.isArray(value.buttons) ||
    !value.buttons.every(
      button => button && typeof button === 'object' && !Array.isArray(button)
    )
  ) {
    return false;
  }

  if (typeof value.grid === 'undefined') {
    return true;
  }

  return Boolean(
    value.grid &&
      typeof value.grid === 'object' &&
      !Array.isArray(value.grid) &&
      isPositiveInteger(value.grid.rows) &&
      isPositiveInteger(value.grid.columns) &&
      Array.isArray(value.grid.order) &&
      value.grid.order.every(row => Array.isArray(row))
  );
}

function sourceBoardIdentity(entry, index) {
  return (
    normalizeText(entry.board && entry.board.id, 160) ||
    normalizeText(entry.path, 300) ||
    `board-${index + 1}`
  );
}

function importedBoardId(entry, index) {
  const identity = sourceBoardIdentity(entry, index);
  return (
    OPEN_BOARD_IMPORT_BOARD_ID_PREFIX +
    safeIdPart(identity, `board-${index + 1}`) +
    '_' +
    stableHash(`${normalizeText(entry.path, 300)}\u0000${identity}`)
  ).slice(0, 120);
}

function defaultResolveImage(image) {
  const data = normalizeText(image && image.data, 4 * 1024 * 1024);
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i.test(data)) {
    return data;
  }
  const url = normalizeText(image && image.url, 2000);
  return /^https:\/\//i.test(url) ? url : '';
}

function defaultResolveSound(sound) {
  const data = normalizeText(sound && sound.data, 8 * 1024 * 1024);
  if (
    /^data:audio\/(?:aac|mp4|mpeg|mp3|ogg|wav|webm|x-m4a|x-wav);base64,/i.test(
      data
    )
  ) {
    return data;
  }
  const url = normalizeText(sound && sound.url, 2000);
  return /^https:\/\//i.test(url) ? url : '';
}

function createGrid(board, buttonIdMap) {
  if (!board.grid) return undefined;
  return {
    rows: board.grid.rows,
    columns: board.grid.columns,
    order: board.grid.order.map(row =>
      row.map(value => {
        const sourceId = normalizeText(value, 160);
        return sourceId ? buttonIdMap.get(sourceId) || null : null;
      })
    )
  };
}

function resolveLoadBoardId(loadBoard, boardIdsByPath, boardIdsBySourceId) {
  if (!loadBoard || typeof loadBoard !== 'object') return '';
  const path = normalizeOpenBoardArchivePath(loadBoard.path);
  if (path && boardIdsByPath.has(path)) return boardIdsByPath.get(path);
  const sourceId = normalizeText(loadBoard.id, 160);
  return sourceId ? boardIdsBySourceId.get(sourceId) || '' : '';
}

function createTileSourceId(button, index, boardIdentity) {
  return (
    normalizeText(button.id, 160) ||
    `obf_tile_${index + 1}_${stableHash(
      `${boardIdentity}\u0000${index}\u0000${normalizeText(button.label, 160)}`
    )}`
  );
}

function normalizeDocuments(value) {
  if (!Array.isArray(value)) {
    throw new TypeError('Open Board documents must be an array');
  }
  if (value.length > MAX_OPEN_BOARD_DOCUMENTS) {
    throw new TypeError('Open Board archive contains too many boards');
  }
  return value.map((entry, index) => ({
    path:
      normalizeOpenBoardArchivePath(entry && entry.path) ||
      `boards/board-${index + 1}.obf`,
    board: entry && entry.board
  }));
}

export async function importOpenBoardDocuments({
  documents,
  existingBoards = [],
  conflictStrategy = 'merge',
  resolveImage = defaultResolveImage,
  resolveSound = defaultResolveSound
} = {}) {
  if (conflictStrategy !== 'merge' && conflictStrategy !== 'skip') {
    throw new TypeError('Open Board conflict strategy must be merge or skip');
  }
  if (typeof resolveImage !== 'function') {
    throw new TypeError('Open Board image resolver must be a function');
  }
  if (typeof resolveSound !== 'function') {
    throw new TypeError('Open Board sound resolver must be a function');
  }

  const normalizedDocuments = normalizeDocuments(documents);
  const diagnostics = {
    sourceBoardCount: normalizedDocuments.length,
    importedBoardCount: 0,
    importedTileCount: 0,
    conflictBoardCount: 0,
    skippedMalformedBoardCount: 0,
    skippedMalformedButtonCount: 0,
    unresolvedImageCount: 0,
    unresolvedSoundCount: 0
  };
  const validDocuments = normalizedDocuments.filter(entry => {
    if (!isOpenBoardDocument(entry.board)) {
      diagnostics.skippedMalformedBoardCount += 1;
      return false;
    }
    return true;
  });
  const totalButtons = validDocuments.reduce(
    (total, entry) => total + entry.board.buttons.length,
    0
  );
  if (totalButtons > MAX_OPEN_BOARD_BUTTONS) {
    throw new TypeError('Open Board archive contains too many buttons');
  }

  const boardIdsByPath = new Map();
  const boardIdsBySourceId = new Map();
  validDocuments.forEach((entry, index) => {
    const id = importedBoardId(entry, index);
    boardIdsByPath.set(entry.path, id);
    const sourceId = normalizeText(entry.board.id, 160);
    if (sourceId && !boardIdsBySourceId.has(sourceId)) {
      boardIdsBySourceId.set(sourceId, id);
    }
  });

  const existingIds = new Set(
    (Array.isArray(existingBoards) ? existingBoards : [])
      .map(board => normalizeText(board && board.id, 160))
      .filter(Boolean)
  );
  const importedBoards = [];

  for (
    let documentIndex = 0;
    documentIndex < validDocuments.length;
    documentIndex += 1
  ) {
    const entry = validDocuments[documentIndex];
    const board = entry.board;
    const boardId = boardIdsByPath.get(entry.path);
    const hasConflict = existingIds.has(boardId);
    if (hasConflict) {
      diagnostics.conflictBoardCount += 1;
      if (conflictStrategy === 'skip') continue;
    }

    const boardIdentity = sourceBoardIdentity(entry, documentIndex);
    const boardImages = Array.isArray(board.images) ? board.images : [];
    const imagesById = new Map(
      boardImages
        .filter(image => image && typeof image === 'object')
        .map(image => [normalizeText(image.id, 160), image])
        .filter(([id]) => Boolean(id))
    );
    const boardSounds = Array.isArray(board.sounds) ? board.sounds : [];
    const soundsById = new Map(
      boardSounds
        .filter(sound => sound && typeof sound === 'object')
        .map(sound => [normalizeText(sound.id, 160), sound])
        .filter(([id]) => Boolean(id))
    );
    const buttonIdMap = new Map();
    const seenTileIds = new Set();
    const tileSources = [];

    for (
      let buttonIndex = 0;
      buttonIndex < board.buttons.length;
      buttonIndex += 1
    ) {
      const button = board.buttons[buttonIndex];
      const sourceTileId = createTileSourceId(
        button,
        buttonIndex,
        boardIdentity
      );
      const label =
        normalizeText(button.label, 200) ||
        normalizeText(button.vocalization, 200);
      if (!label || seenTileIds.has(sourceTileId)) {
        diagnostics.skippedMalformedButtonCount += 1;
        continue;
      }
      seenTileIds.add(sourceTileId);
      buttonIdMap.set(
        normalizeText(button.id, 160) || sourceTileId,
        sourceTileId
      );

      const tile = copyCboardExtensions(button, {
        id: sourceTileId,
        label,
        vocalization: normalizeText(button.vocalization, 300) || label,
        backgroundColor: normalizeText(button.background_color, 100),
        loadBoard: resolveLoadBoardId(
          button.load_board,
          boardIdsByPath,
          boardIdsBySourceId
        )
      });
      const imageId = normalizeText(button.image_id, 160);
      const image = imageId ? imagesById.get(imageId) : null;
      if (image) {
        const resolvedImage = normalizeText(
          await resolveImage(image, {
            board,
            boardId,
            boardPath: entry.path,
            button,
            tileId: sourceTileId
          }),
          4 * 1024 * 1024
        );
        if (resolvedImage) {
          tile.image = resolvedImage;
          tile.pictogramAttribution = createDevicePrivatePictogramAttribution({
            boardId,
            tileId: sourceTileId,
            originalId: imageId,
            label,
            author: image.author || board.author,
            license: image.license || board.license
          });
        } else {
          diagnostics.unresolvedImageCount += 1;
        }
      }
      const soundId = normalizeText(button.sound_id, 160);
      const sound = soundId ? soundsById.get(soundId) : null;
      if (sound) {
        const resolvedSound = normalizeText(
          await resolveSound(sound, {
            board,
            boardId,
            boardPath: entry.path,
            button,
            tileId: sourceTileId
          }),
          8 * 1024 * 1024
        );
        if (resolvedSound) {
          tile.sound = resolvedSound;
        } else {
          diagnostics.unresolvedSoundCount += 1;
        }
      }
      tileSources.push(tile);
    }

    const boardSource = copyCboardExtensions(board, {
      id: boardId,
      name:
        normalizeText(board.name, 200) ||
        normalizeText(board.id, 160) ||
        '导入沟通板',
      communicationCategory: 'device-private',
      tiles: tileSources
    });
    const grid = createGrid(board, buttonIdMap);
    if (grid) boardSource.grid = grid;

    try {
      const imported = createBoardDTO(boardSource);
      importedBoards.push(imported);
      diagnostics.importedBoardCount += 1;
      diagnostics.importedTileCount += imported.tiles.length;
    } catch (error) {
      diagnostics.skippedMalformedBoardCount += 1;
    }
  }

  return { boards: importedBoards, diagnostics };
}
