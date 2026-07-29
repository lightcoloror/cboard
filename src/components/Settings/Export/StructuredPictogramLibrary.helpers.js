import { saveAs } from 'file-saver';
import {
  isAndroid,
  isIOS,
  requestCvaWritePermissions,
  writeCvaFile
} from '../../../cordova-util';
import enUS from '../../../translations/en-US.json';
import {
  createPictogramLibraryDTO,
  getPictogramLibraryDTOStats
} from '../../../common/communicationSupport/pictogramLibrary';
import { EXPORT_CONFIG_BY_TYPE } from './Export.constants';

function normalizeText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function resolveIntlValue(target, valueKey, messageKey, intl) {
  const direct = normalizeText(target && target[valueKey]);
  const key = normalizeText(target && target[messageKey]);
  if (direct) return direct;
  if (!key || !intl || typeof intl.formatMessage !== 'function') return key;
  return normalizeText(intl.formatMessage({ id: key })) || key;
}

function collectNestedBoards(allBoards, rootBoardId) {
  const byId = new Map(
    (Array.isArray(allBoards) ? allBoards : []).map(board => [board.id, board])
  );
  const selected = [];
  const visited = new Set();
  const pending = [rootBoardId];

  while (pending.length) {
    const boardId = pending.shift();
    if (!boardId || visited.has(boardId)) continue;
    visited.add(boardId);
    const board = byId.get(boardId);
    if (!board) continue;
    selected.push(board);
    (Array.isArray(board.tiles) ? board.tiles : []).forEach(tile => {
      const loadBoardId = tile && (tile.loadBoard || tile.loadBoardId);
      if (loadBoardId && !visited.has(loadBoardId)) {
        pending.push(loadBoardId);
      }
    });
  }

  return selected;
}

function createFileName(date = new Date()) {
  const timestamp = date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .replace(/\.\d{3}Z$/, '');
  return `${timestamp}-${EXPORT_CONFIG_BY_TYPE.structured.filename}`;
}

export function buildStructuredPictogramLibraryExport({
  boards = [],
  rootBoard = null,
  intl
} = {}) {
  const selectedBoards = rootBoard
    ? collectNestedBoards(boards, rootBoard.id)
    : boards;
  const library = createPictogramLibraryDTO(selectedBoards, {
    locale: (intl && intl.locale) || 'zh-CN',
    resolveBoardName: board => resolveIntlValue(board, 'name', 'nameKey', intl),
    resolveTileLabel: tile => resolveIntlValue(tile, 'label', 'labelKey', intl),
    resolveEnglishName: tile => enUS[tile.keyPath] || ''
  });

  return {
    library,
    stats: getPictogramLibraryDTOStats(library)
  };
}

export async function structuredPictogramLibraryExportAdapter(options = {}) {
  const result = buildStructuredPictogramLibraryExport(options);
  const content = new Blob([JSON.stringify(result.library, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  const fileName = createFileName();

  if (isAndroid() || isIOS()) {
    requestCvaWritePermissions();
    await writeCvaFile(`Download/${fileName}`, content);
  } else {
    saveAs(content, fileName);
  }

  return result;
}
