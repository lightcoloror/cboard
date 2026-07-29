import { createBoardDTO } from './dto';
import { getPictogramAttribution } from './pictogramAttribution';

export const PUBLIC_BOARD_BUNDLE_FORMAT = 'cboard-public-board-bundle';
export const PUBLIC_BOARD_BUNDLE_VERSION = 1;
export const PUBLIC_BOARD_IMPORT_PREFIX = 'cboard-public-';
export const PUBLIC_BOARD_UNKNOWN_LICENSE =
  '原作者未提供逐图公开许可证，导入前请人工确认使用权';
export const PUBLIC_BOARD_SOURCE_URL = 'https://github.com/cboard-org/cboard';

function normalizeText(value) {
  return String(value || '').trim();
}

function toStableId(value) {
  const normalized = normalizeText(value)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  if (!normalized) {
    throw new TypeError('Public CBoard id must be a non-empty stable id');
  }
  return `${PUBLIC_BOARD_IMPORT_PREFIX}${normalized}`;
}

function linkedBoardId(tile) {
  return normalizeText(
    tile &&
      (tile.loadBoardId ||
        tile.loadBoard ||
        (tile.load_board && (tile.load_board.id || tile.load_board.path)))
  );
}

export function isPublicBoardBundle(value) {
  return Boolean(
    value &&
      value.format === PUBLIC_BOARD_BUNDLE_FORMAT &&
      value.contractVersion === PUBLIC_BOARD_BUNDLE_VERSION &&
      value.source === 'cboard-public' &&
      value.licenseStatus === 'unknown' &&
      normalizeText(value.rootBoardId) &&
      Array.isArray(value.warnings) &&
      value.warnings.every(item => typeof item === 'string') &&
      Array.isArray(value.data) &&
      value.data.length > 0 &&
      value.data.length <= 100 &&
      value.diagnostics &&
      Number.isInteger(value.diagnostics.boardCount) &&
      value.diagnostics.boardCount === value.data.length &&
      Number.isInteger(value.diagnostics.tileCount) &&
      value.diagnostics.tileCount >= 0 &&
      value.diagnostics.tileCount <= 5000
  );
}

export function importPublicBoardBundle(value) {
  if (!isPublicBoardBundle(value)) {
    throw new TypeError('Invalid or unsupported public CBoard bundle');
  }

  const sourceIds = value.data.map(board => normalizeText(board && board.id));
  if (
    sourceIds.some(id => !id) ||
    new Set(sourceIds).size !== sourceIds.length
  ) {
    throw new TypeError('Public CBoard bundle must use unique board ids');
  }
  const localIdBySourceId = new Map(sourceIds.map(id => [id, toStableId(id)]));
  const sourceUrl = /^https:\/\//i.test(normalizeText(value.sourceUrl))
    ? normalizeText(value.sourceUrl)
    : PUBLIC_BOARD_SOURCE_URL;
  const boards = value.data.map(sourceBoard => {
    const sourceBoardId = normalizeText(sourceBoard.id);
    const boardId = localIdBySourceId.get(sourceBoardId);
    const prepared = {
      ...sourceBoard,
      id: boardId,
      isPublic: false,
      tiles: (Array.isArray(sourceBoard.tiles) ? sourceBoard.tiles : []).map(
        sourceTile => {
          const targetId = linkedBoardId(sourceTile);
          const localTargetId = localIdBySourceId.get(targetId) || '';
          const existingAttribution = getPictogramAttribution(sourceTile);
          return {
            ...sourceTile,
            loadBoard: localTargetId,
            loadBoardId: localTargetId,
            ...(normalizeText(sourceTile.image) && !existingAttribution
              ? {
                  pictogramAttribution: {
                    provider: 'cboard',
                    originalId: `${sourceBoardId}:${normalizeText(
                      sourceTile.id
                    )}`,
                    name: 'CBoard 公共沟通板',
                    license: PUBLIC_BOARD_UNKNOWN_LICENSE,
                    licenseUrl: null,
                    author: normalizeText(sourceBoard.author) || null,
                    authorUrl: null,
                    sourceUrl,
                    repoKey: 'cboard-public'
                  }
                }
              : {})
          };
        }
      )
    };
    return createBoardDTO(prepared);
  });
  const rootBoardId = localIdBySourceId.get(normalizeText(value.rootBoardId));
  if (!rootBoardId) {
    throw new TypeError('Public CBoard root board is missing from the bundle');
  }

  return {
    rootBoardId,
    boards,
    warnings: value.warnings.slice(),
    diagnostics: { ...value.diagnostics }
  };
}
