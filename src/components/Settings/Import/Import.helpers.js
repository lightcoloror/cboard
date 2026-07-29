import JSZipUtils from 'jszip-utils';
import JSZip from 'jszip';
import shortid from 'shortid';
import { IMPORT_PATHS, CBOARD_EXT_PREFIX } from './Import.constants';
import API from '../../../api';
import {
  PICTURE_LIBRARY_ARCHIVE_NOT_FOUND,
  readPictureLibraryArchive
} from '../Export/PictureLibraryArchive.helpers';
import {
  PICTOGRAM_LIBRARY_DTO_TYPE,
  assertPictogramLibraryDTO,
  getPictogramLibraryDTOStats,
  pictogramLibraryDTOToBoards
} from '../../../common/communicationSupport/pictogramLibrary';
import { isOpenBoardDocument } from '../../../common/communicationSupport/openBoardFormat';
import { createBoardDTO } from '../../../common/communicationSupport/dto';
import {
  boardDTOToCboardBoard,
  createCboardGridOrder
} from '../../../common/communicationSupport/cboardBoardAdapter';

export { isOpenBoardDocument };

const INVALID_OPEN_BOARD_ERROR = 'Invalid or unsupported Open Board document';

function toCamelCase(scString = '') {
  const find = /(_\w)/g;
  const convertFn = matches => matches[1].toUpperCase();

  return scString.replace(find, convertFn);
}

async function readZip(file) {
  const zipBlob = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = event => {
      if (event.target.readyState === 2) {
        try {
          resolve(new Blob([reader.result]));
        } catch (err) {
          resolve(null);
        }
      }
    };
    reader.readAsArrayBuffer(file);
  });

  if (zipBlob === null) {
    return Promise.reject();
  }

  const filePath = URL.createObjectURL(zipBlob);
  return new Promise(resolve => {
    JSZipUtils.getBinaryContent(filePath, (err, data) => {
      if (err) {
        resolve(err);
      } else {
        resolve(JSZip.loadAsync(data));
      }
    });
  });
}

function obfButtonToCboardButton(button) {
  const cboardButton = {
    id: button.id || shortid.generate(),
    label: button.label || ''
  };

  if (button['background_color']) {
    cboardButton.backgroundColor = button['background_color'];
  }

  if (button['border_color']) {
    cboardButton.borderColor = button['border_color'];
  }

  if (button.vocalization) {
    cboardButton.vocalization = button.vocalization;
  }

  if (button.action) {
    cboardButton.action = button.action;
  }

  return cboardButton;
}

function attachImportDiagnostics(boards, diagnostics) {
  Object.defineProperty(boards, 'importDiagnostics', {
    configurable: true,
    value: diagnostics
  });
  return boards;
}

function normalizeCboardBoardImport(board) {
  const dto = createBoardDTO(board);
  const normalized = {
    ...board,
    id: dto.id,
    name: dto.name,
    tiles: board.tiles.map((tile, index) => {
      const normalizedTile = {
        ...tile,
        id: dto.tiles[index].id
      };
      if (tile.loadBoard || tile.loadBoardId) {
        normalizedTile.loadBoard = dto.tiles[index].loadBoardId;
      }
      return normalizedTile;
    })
  };

  if (board.grid || board.isFixed) {
    normalized.grid = {
      rows: dto.layout.rows,
      columns: dto.layout.columns,
      order: createCboardGridOrder(dto.layout)
    };
  }

  return normalized;
}

async function getTilesData(
  obfBoard,
  boards = {},
  images = {},
  sounds = {},
  { deferMediaUpload = false } = {}
) {
  const boardImages = Array.isArray(obfBoard.images) ? obfBoard.images : [];
  const boardSounds = Array.isArray(obfBoard.sounds) ? obfBoard.sounds : [];
  const tiles = await Promise.all(
    obfBoard.buttons.map(async button => {
      const tileButton = obfButtonToCboardButton(button);

      if (button['load_board']) {
        const loadBoardData = button['load_board'];
        if (loadBoardData.path && boards[loadBoardData.path]) {
          tileButton.loadBoard = boards[loadBoardData.path].id;
        }
      }

      if (button['image_id']) {
        let imageID = button['image_id'];
        let image = boardImages.find(image => image.id === imageID);

        if (image) {
          let imageData = image.data || null;
          if (image['content_type'] && image.path && images[image.path]) {
            // Certain OBF files have an incorrect MIME type for SVG files, so
            // the resulting data URI cannot be rendered. We need to fix the
            // MIME type ourselves.
            const contentType =
              image['content_type'] === 'image/svg'
                ? 'image/svg+xml'
                : image['content_type'];
            imageData = `data:${contentType};base64,${images[image.path]}`;
          }
          if (image.url) {
            tileButton.image = image.url;
          }
          if (imageData) {
            let url = imageData;
            if (!deferMediaUpload) {
              try {
                const apiURL = await API.uploadFromDataURL(url, imageID, true);
                url = apiURL || url;
              } catch (err) {
                console.log(err.message);
              }
            }
            tileButton.image = url;
          }
        }
      }

      if (button['sound_id']) {
        const soundID = button['sound_id'];
        const sound = boardSounds.find(sound => sound.id === soundID);
        if (sound) {
          let soundData = sound.data || null;
          if (sound.path && sounds[sound.path]) {
            const contentType = sound['content_type'] || 'audio/mpeg';
            soundData = `data:${contentType};base64,${sounds[sound.path]}`;
          }
          if (sound.url) {
            tileButton.sound = sound.url;
          }
          if (soundData) {
            let url = soundData;
            if (!deferMediaUpload) {
              try {
                const apiURL = await API.uploadFromDataURL(url, soundID, true);
                url = apiURL || url;
              } catch (err) {
                console.log(err.message);
              }
            }
            tileButton.sound = url;
          }
        }
      }

      const extKeys = Object.keys(button).filter(k =>
        k.startsWith(CBOARD_EXT_PREFIX)
      );
      extKeys.forEach(key => {
        const tileKey = toCamelCase(key.slice(CBOARD_EXT_PREFIX.length));
        tileButton[tileKey] = button[key];
      });

      return tileButton;
    })
  );

  return tiles;
}

async function obfToCboard(
  obfBoard,
  boards = {},
  images = {},
  sounds = {},
  allBoards = [],
  options = {}
) {
  const allBoardsIds = getBoardsIds(allBoards);
  if (allBoardsIds.includes(obfBoard.id) && !options.includeConflicts) {
    return undefined;
  }
  let tiles = [];
  if (obfBoard.buttons) {
    tiles = await getTilesData(obfBoard, boards, images, sounds, options);
  }
  let board = {
    id: obfBoard.id || shortid.generate(),
    tiles
  };

  if (obfBoard.grid) {
    board = { ...board, isFixed: true, grid: obfBoard.grid };
  }

  const extKeys = Object.keys(obfBoard).filter(k =>
    k.startsWith(CBOARD_EXT_PREFIX)
  );
  extKeys.forEach(key => {
    const tileKey = toCamelCase(key.slice(CBOARD_EXT_PREFIX.length));
    board[tileKey] = obfBoard[key];
  });
  if (typeof obfBoard.name !== 'undefined') {
    board.name = obfBoard.name;
  } else {
    board.name = 'unknown name';
  }

  if (obfBoard.locale) {
    board.locale = obfBoard.locale;
  }

  return board;
}

function getBoardsIds(boards) {
  const allBoardsIds = [];
  boards.forEach(board => {
    if (typeof board.id !== 'undefined') {
      allBoardsIds.push(board.id);
    }
    if (typeof board.prevId !== 'undefined') {
      allBoardsIds.push(board.prevId);
    }
  });
  return allBoardsIds;
}

export async function cboardImportAdapter(
  file,
  intl,
  allBoards,
  { includeConflicts = false } = {}
) {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = async event => {
      if (event.target.readyState === 2) {
        try {
          const parsed = JSON.parse(reader.result);
          let boards = parsed;
          let structuredStats = null;
          if (parsed && parsed.dtoType === PICTOGRAM_LIBRARY_DTO_TYPE) {
            const library = assertPictogramLibraryDTO(parsed);
            structuredStats = getPictogramLibraryDTOStats(library);
            boards = pictogramLibraryDTOToBoards(library).map(
              boardDTOToCboardBoard
            );
          }
          if (!Array.isArray(boards)) {
            throw new TypeError('Invalid CBoard or structured AAC JSON');
          }
          const allBoardsIds = getBoardsIds(allBoards);
          const diagnostics = {
            skippedMalformedBoardCount: 0,
            skippedUnsupportedBoardCount: 0,
            conflictBoardCount: 0,
            ...(structuredStats
              ? {
                  structuredLibrary: true,
                  ...structuredStats
                }
              : {})
          };
          const fboards = [];
          const importedBoardIds = new Set();
          boards.forEach(board => {
            if (
              !board ||
              typeof board !== 'object' ||
              !Array.isArray(board.tiles)
            ) {
              diagnostics.skippedMalformedBoardCount += 1;
              return;
            }
            if (board.ext_cboard_hidden || board.id === 'root') {
              diagnostics.skippedUnsupportedBoardCount += 1;
              return;
            }
            let normalizedBoard;
            try {
              normalizedBoard = normalizeCboardBoardImport(board);
            } catch (error) {
              diagnostics.skippedMalformedBoardCount += 1;
              return;
            }
            if (importedBoardIds.has(normalizedBoard.id)) {
              diagnostics.skippedMalformedBoardCount += 1;
              return;
            }
            importedBoardIds.add(normalizedBoard.id);
            if (allBoardsIds.includes(normalizedBoard.id)) {
              diagnostics.conflictBoardCount += 1;
              if (!includeConflicts) return;
            }
            fboards.push(normalizedBoard);
          });
          resolve(attachImportDiagnostics(fboards, diagnostics));
        } catch (err) {
          reject(err);
        }
      }
    };
    reader.readAsText(file);
  });
}

export async function obzImportAdapter(file, intl, allBoards, options = {}) {
  const zipFile = await readZip(file);
  if (!zipFile || typeof zipFile !== 'object' || !zipFile.files) {
    throw new TypeError(INVALID_OPEN_BOARD_ERROR);
  }

  const keys = Object.keys(zipFile.files);
  const boardKeys = keys.filter(
    k => !zipFile.files[k].dir && k.endsWith(IMPORT_PATHS.boards)
  );
  const imageKeys = keys.filter(
    k => !zipFile.files[k].dir && k.startsWith(IMPORT_PATHS.images)
  );
  const soundKeys = keys.filter(
    k => !zipFile.files[k].dir && k.startsWith(IMPORT_PATHS.sounds)
  );
  const boards = {};
  const images = {};
  const sounds = {};
  const allBoardsIds = getBoardsIds(allBoards);
  const diagnostics = {
    skippedMalformedBoardCount: 0,
    skippedUnsupportedBoardCount: 0,
    conflictBoardCount: 0
  };
  await Promise.all(
    keys.map(async k => {
      const isBoard = boardKeys.indexOf(k) >= 0;
      const isImage = imageKeys.indexOf(k) >= 0;
      const isSound = soundKeys.indexOf(k) >= 0;

      if (!isBoard && !isImage && !isSound) {
        return Promise.resolve();
      }

      const type = isBoard ? 'text' : 'base64';
      let result = null;
      try {
        result = await zipFile.files[k].async(type);

        if (isBoard) {
          const tempBoard = JSON.parse(result);
          if (!isOpenBoardDocument(tempBoard)) {
            diagnostics.skippedMalformedBoardCount += 1;
          } else if (tempBoard.ext_cboard_hidden || tempBoard.id === 'root') {
            diagnostics.skippedUnsupportedBoardCount += 1;
          } else if (allBoardsIds.includes(tempBoard.id)) {
            diagnostics.conflictBoardCount += 1;
            if (options.includeConflicts) boards[k] = tempBoard;
          } else {
            boards[k] = tempBoard;
          }
        } else if (isImage) {
          if (k.startsWith('images//')) {
            images[k.substring(7)] = result;
          } else {
            images[k] = result;
          }
        } else {
          sounds[k] = result;
        }
      } catch (e) {
        if (isBoard) diagnostics.skippedMalformedBoardCount += 1;
      }

      return result;
    })
  );

  const cboardBoards = [];
  for (let key in boards) {
    const board = await obfToCboard(
      boards[key],
      boards,
      images,
      sounds,
      allBoards,
      options
    );
    cboardBoards.push(board);
  }

  return attachImportDiagnostics(cboardBoards, diagnostics);
}

export async function zipImportAdapter(file, intl, allBoards, options = {}) {
  const { conflictStrategy, onProgress } = options;
  try {
    const restored = await readPictureLibraryArchive({
      file,
      existingBoards: allBoards,
      conflictStrategy,
      onProgress
    });
    return {
      kind: 'picture-library',
      ...restored
    };
  } catch (error) {
    if (error && error.code === PICTURE_LIBRARY_ARCHIVE_NOT_FOUND) {
      return obzImportAdapter(file, intl, allBoards, options);
    }
    throw error;
  }
}

export async function obfImportAdapter(file, intl, allBoards, options = {}) {
  const reader = new FileReader();
  const jsonFile = await new Promise(resolve => {
    reader.onload = event => {
      if (event.target.readyState === 2) {
        try {
          const jsonFile = JSON.parse(reader.result);
          resolve(jsonFile);
        } catch (err) {
          resolve(err);
        }
      }
    };
    reader.readAsText(file);
  });

  if (!isOpenBoardDocument(jsonFile)) {
    throw new TypeError(INVALID_OPEN_BOARD_ERROR);
  }

  const conflict = getBoardsIds(allBoards).includes(jsonFile.id);
  const board = await obfToCboard(jsonFile, {}, {}, {}, allBoards, options);
  if (board) {
    return attachImportDiagnostics([board], {
      skippedMalformedBoardCount: 0,
      skippedUnsupportedBoardCount: 0,
      conflictBoardCount: conflict ? 1 : 0
    });
  }
  return attachImportDiagnostics([], {
    skippedMalformedBoardCount: 0,
    skippedUnsupportedBoardCount: 0,
    conflictBoardCount: conflict ? 1 : 0
  });
}

export async function astericsGridImportAdapter(
  file,
  intl,
  allBoards,
  options = {}
) {
  const reader = new FileReader();
  const text = await new Promise((resolve, reject) => {
    reader.onload = event => {
      if (event.target.readyState === 2) resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
  const {
    convertAstericsGridToOpenBoardDocuments
  } = await import('../../../common/communicationSupport/astericsGrid');
  const documents = await convertAstericsGridToOpenBoardDocuments({
    text,
    fileName: file.name,
    locale: intl && intl.locale
  });
  return openBoardDocumentsImportAdapter(documents, allBoards, options);
}

export async function gridsetImportAdapter(
  file,
  intl,
  allBoards,
  options = {}
) {
  const reader = new FileReader();
  const data = await new Promise((resolve, reject) => {
    reader.onload = event => {
      if (event.target.readyState === 2) resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
  const {
    convertGridsetToOpenBoardDocuments
  } = await import('../../../common/communicationSupport/gridset');
  const {
    createJsZipArchiveAdapter
  } = await import('../../../common/communicationSupport/adapters/jsZipArchive');
  const documents = await convertGridsetToOpenBoardDocuments({
    data,
    fileName: file.name,
    locale: intl && intl.locale,
    zipAdapter: createJsZipArchiveAdapter
  });
  return openBoardDocumentsImportAdapter(documents, allBoards, options);
}

async function serverAacImportAdapter(file, intl, allBoards, options, format) {
  const converted = await API.convertCommunicationAacFile(
    file,
    format,
    intl && intl.locale
  );
  const imported = await openBoardDocumentsImportAdapter(
    converted.documents,
    allBoards,
    options
  );
  imported.importDiagnostics.aacWarnings = Array.isArray(converted.warnings)
    ? converted.warnings.map(value => String(value || '')).filter(Boolean)
    : [];
  imported.importDiagnostics.sourceFormat = converted.sourceFormat;
  return imported;
}

export function snapImportAdapter(file, intl, allBoards, options = {}) {
  return serverAacImportAdapter(file, intl, allBoards, options, 'snap');
}

export function touchChatImportAdapter(file, intl, allBoards, options = {}) {
  return serverAacImportAdapter(file, intl, allBoards, options, 'touchchat');
}

async function openBoardDocumentsImportAdapter(documents, allBoards, options) {
  const allBoardIds = getBoardsIds(allBoards);
  const boards = {};
  const diagnostics = {
    skippedMalformedBoardCount: 0,
    skippedUnsupportedBoardCount: 0,
    conflictBoardCount: 0
  };

  documents.forEach(document => {
    const sourceId = document.board && document.board.id;
    if (allBoardIds.includes(sourceId)) {
      diagnostics.conflictBoardCount += 1;
      if (!options.includeConflicts) return;
    }
    boards[document.path] = document.board;
  });

  const imported = [];
  for (let path in boards) {
    const board = await obfToCboard(
      boards[path],
      boards,
      {},
      {},
      allBoards,
      options
    );
    if (board) imported.push(board);
  }
  return attachImportDiagnostics(imported, diagnostics);
}

export async function requestQuota(json) {
  const size = JSON.stringify(json).length;
  if (size > 1024 * 1024 * 4) {
    const requestQuotaAvailable =
      navigator &&
      navigator.webkitPersistentStorage &&
      navigator.webkitPersistentStorage.requestQuota;
    if (requestQuotaAvailable) {
      try {
        await new Promise((resolve, reject) => {
          navigator.webkitPersistentStorage.requestQuota(
            size * 2,
            grantedSize => {
              if (grantedSize >= size) {
                resolve();
              } else {
                reject(`Granted size is below the limit: ${grantedSize}`);
              }
            },
            err => reject(`Request quota error: ${err}`)
          );
        });
      } catch (e) {
        throw new Error(e);
      }
    } else {
      throw new Error("Can't request quota");
    }
  }

  return size;
}
