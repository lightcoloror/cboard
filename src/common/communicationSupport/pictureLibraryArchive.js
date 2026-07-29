import {
  normalizePersonalImageAttribution,
  normalizePersonalImagePreferences
} from './personalImagePreferences';
import { normalizePictogramOrderingState } from './pictogramOrdering';
import { normalizeCommunicationMissingTokens } from './storage';

export const PICTURE_LIBRARY_ARCHIVE_FORMAT = 'picinterpreter-picture-library';
export const PICTURE_LIBRARY_ARCHIVE_VERSION = 1;
export const PICTURE_LIBRARY_ARCHIVE_MANIFEST = 'library.json';
export const PICTURE_LIBRARY_ARCHIVE_SCOPES = Object.freeze({
  custom: 'custom',
  full: 'full'
});
export const PICTURE_LIBRARY_CONFLICT_STRATEGIES = Object.freeze({
  merge: 'merge',
  skip: 'skip'
});
export const PICTURE_LIBRARY_PROGRESS_PHASES = Object.freeze({
  collecting: 'collecting',
  compressing: 'compressing',
  reading: 'reading',
  restoring: 'restoring',
  complete: 'complete'
});

const MAX_ARCHIVE_BOARDS = 500;
const MAX_ARCHIVE_TILES = 20000;
const MAX_ARCHIVE_ASSETS = 20000;
const MAX_ARCHIVE_CUSTOM_ITEMS = 2000;
const SAFE_EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/;

function normalizeText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp >= 0
    ? Math.floor(timestamp)
    : 0;
}

function normalizeUsageCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(count))
    : 0;
}

function normalizeStringList(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).map(normalizeText).filter(item => {
    if (!item || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function clonePlainValue(value) {
  if (Array.isArray(value)) {
    return value.map(clonePlainValue);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((result, key) => {
      if (key !== '__proto__' && key !== 'prototype' && key !== 'constructor') {
        result[key] = clonePlainValue(value[key]);
      }
      return result;
    }, {});
  }
  return value;
}

function sanitizePathPart(value, fallback) {
  const normalized = normalizeText(value)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || fallback;
}

function inferAssetExtension(source, mediaKind) {
  const normalized = normalizeText(source);
  const dataMatch = normalized.match(
    new RegExp(`^data:${mediaKind}\\/([a-z0-9.+-]+);`, 'i')
  );
  const sourceExtension = dataMatch
    ? dataMatch[1]
    : normalized
        .split(/[?#]/)[0]
        .split('.')
        .pop();
  const extension = normalizeText(sourceExtension)
    .toLocaleLowerCase()
    .replace('svg+xml', 'svg')
    .replace('jpeg', 'jpg')
    .replace('x-wav', 'wav')
    .replace('x-m4a', 'm4a')
    .replace('mpeg', 'mp3')
    .replace('mpga', 'mp3')
    .replace('mp4', mediaKind === 'audio' ? 'm4a' : 'mp4');
  return SAFE_EXTENSION_PATTERN.test(extension) ? extension : 'bin';
}

function normalizeArchivePath(value) {
  const path = normalizeText(value).replace(/\\/g, '/');
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\0') ||
    path.split('/').some(part => !part || part === '.' || part === '..')
  ) {
    return '';
  }
  return path;
}

function normalizeArchiveAsset(value, assetPaths, mediaKind) {
  if (!value) return null;
  const path = normalizeArchivePath(
    typeof value === 'string' ? value : value.path
  );
  const root =
    mediaKind === 'sound'
      ? 'sounds/'
      : mediaKind === 'video'
      ? 'videos/'
      : 'images/';
  if (!path || !path.startsWith(root) || !assetPaths.has(path)) {
    throw new TypeError(
      `Picture library archive references a missing ${mediaKind}`
    );
  }
  return { path };
}

function normalizeArchiveImage(value, assetPaths) {
  return normalizeArchiveAsset(value, assetPaths, 'image');
}

function normalizeArchiveSound(value, assetPaths) {
  return normalizeArchiveAsset(value, assetPaths, 'sound');
}

function normalizeArchiveVideo(value, assetPaths) {
  return normalizeArchiveAsset(value, assetPaths, 'video');
}

function normalizeTileMediaType(value, video) {
  const mediaType = normalizeText(value).toLocaleLowerCase();
  if (mediaType === 'image' || mediaType === 'gif' || mediaType === 'video') {
    return mediaType;
  }
  return normalizeText(video) ? 'video' : 'image';
}

function normalizeCommunicationMetadata(value) {
  const communication =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    synonyms: normalizeStringList(communication.synonyms),
    relatedTerms: normalizeStringList(communication.relatedTerms),
    excludeTokens: normalizeStringList(communication.excludeTokens),
    category: normalizeText(communication.category)
  };
}

function normalizeGrid(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const rows = Number(value.rows);
  const columns = Number(value.columns);
  if (
    !Number.isInteger(rows) ||
    rows <= 0 ||
    !Number.isInteger(columns) ||
    columns <= 0 ||
    !Array.isArray(value.order)
  ) {
    return null;
  }
  return {
    rows,
    columns,
    order: value.order.map(row =>
      Array.isArray(row)
        ? row.map(tileId => {
            const normalized = normalizeText(tileId);
            return normalized || null;
          })
        : []
    )
  };
}

function normalizeBoardGrid(board) {
  const grid = normalizeGrid(board && board.grid);
  if (grid) return grid;
  const layout =
    board && board.layout && typeof board.layout === 'object'
      ? board.layout
      : null;
  const rows = Number(layout && layout.rows);
  const columns = Number(layout && layout.columns);
  const tileIds = Array.isArray(layout && layout.tileIds) ? layout.tileIds : [];
  if (
    !Number.isInteger(rows) ||
    rows <= 0 ||
    !Number.isInteger(columns) ||
    columns <= 0
  ) {
    return null;
  }
  const order = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    order.push(
      Array.from({ length: columns }, (_, columnIndex) => {
        const tileId = normalizeText(tileIds[rowIndex * columns + columnIndex]);
        return tileId || null;
      })
    );
  }
  return { rows, columns, order };
}

function createAssetRegistry() {
  const assetsBySource = new Map();
  const assets = [];
  const countsByKind = { image: 0, sound: 0, video: 0 };

  return {
    register(source, group, key, mediaKind = 'image') {
      const normalizedSource = normalizeText(source);
      if (!normalizedSource) return null;
      const registryKey = `${mediaKind}:${normalizedSource}`;
      const existing = assetsBySource.get(registryKey);
      if (existing) return existing.path;

      const root =
        mediaKind === 'sound'
          ? 'sounds'
          : mediaKind === 'video'
          ? 'videos'
          : 'images';
      const mimeRoot =
        mediaKind === 'sound'
          ? 'audio'
          : mediaKind === 'video'
          ? 'video'
          : 'image';
      countsByKind[mediaKind] += 1;
      const index = countsByKind[mediaKind];
      const path = [
        root,
        sanitizePathPart(group, 'library'),
        `${String(index).padStart(5, '0')}-${sanitizePathPart(
          key,
          'picture'
        )}.${inferAssetExtension(normalizedSource, mimeRoot)}`
      ].join('/');
      const asset = { path, source: normalizedSource, mediaKind };
      assets.push(asset);
      assetsBySource.set(registryKey, asset);
      return path;
    },
    list() {
      return assets.slice();
    }
  };
}

function archiveTile(tile, boardId, orderingState, assets) {
  if (!tile || typeof tile !== 'object') return null;
  const id = normalizeText(tile.id);
  if (!id) return null;
  const resolvedBoardId = normalizeText(tile.boardId || boardId);
  const usageKey = resolvedBoardId && id ? `${resolvedBoardId}:${id}` : '';
  const usageRecord =
    usageKey && orderingState.usageByTileKey[usageKey]
      ? orderingState.usageByTileKey[usageKey]
      : null;
  const communication = normalizeCommunicationMetadata({
    synonyms:
      tile.communicationSynonyms ||
      (tile.communication && tile.communication.synonyms),
    relatedTerms:
      tile.communicationRelatedTerms ||
      (tile.communication && tile.communication.relatedTerms),
    excludeTokens:
      tile.communicationExcludeTokens ||
      (tile.communication && tile.communication.excludeTokens),
    category:
      tile.communicationCategory ||
      tile.categoryId ||
      (tile.communication && tile.communication.category)
  });
  const imagePath = assets.register(
    tile.image || tile.imageUrl,
    'boards',
    `${resolvedBoardId}-${id}`
  );
  const soundPath = assets.register(
    tile.sound,
    'boards',
    `${resolvedBoardId}-${id}`,
    'sound'
  );
  const videoPath = assets.register(
    tile.video,
    'boards',
    `${resolvedBoardId}-${id}`,
    'video'
  );
  const mediaType = normalizeTileMediaType(tile.mediaType, tile.video);

  return {
    id,
    boardId: resolvedBoardId,
    label: normalizeText(tile.label),
    labelKey: normalizeText(tile.labelKey),
    vocalization: normalizeText(tile.vocalization),
    backgroundColor: normalizeText(tile.backgroundColor),
    borderColor: normalizeText(tile.borderColor),
    keyPath: normalizeText(tile.keyPath),
    loadBoard: normalizeText(tile.loadBoard || tile.loadBoardId),
    loadBoardId: normalizeText(tile.loadBoardId || tile.loadBoard),
    action: normalizeText(tile.action),
    communication,
    communicationSynonyms: communication.synonyms,
    communicationRelatedTerms: communication.relatedTerms,
    communicationExcludeTokens: communication.excludeTokens,
    communicationCategory: communication.category,
    categoryId: communication.category,
    usageCount: normalizeUsageCount(
      tile.usageCount || (usageRecord && usageRecord.count)
    ),
    pictogramAttribution: clonePlainValue(
      tile.pictogramAttribution || tile.attribution || null
    ),
    mediaType,
    image: imagePath ? { path: imagePath } : null,
    sound: soundPath ? { path: soundPath } : null,
    video: videoPath ? { path: videoPath } : null
  };
}

function archiveBoard(board, orderingState, assets) {
  if (!board || typeof board !== 'object') return null;
  const id = normalizeText(board.id);
  if (!id) return null;
  const tiles = (Array.isArray(board.tiles) ? board.tiles : [])
    .map(tile => archiveTile(tile, id, orderingState, assets))
    .filter(Boolean)
    .slice(0, MAX_ARCHIVE_TILES);

  return {
    id,
    name: normalizeText(board.name),
    nameKey: normalizeText(board.nameKey),
    category: normalizeText(board.category),
    locale: normalizeText(board.locale),
    hidden: Boolean(board.hidden),
    isFixed: Boolean(board.isFixed),
    grid: normalizeBoardGrid(board),
    communicationSynonyms: normalizeStringList(board.communicationSynonyms),
    communicationRelatedTerms: normalizeStringList(
      board.communicationRelatedTerms
    ),
    communicationExcludeTokens: normalizeStringList(
      board.communicationExcludeTokens
    ),
    communicationCategory: normalizeText(board.communicationCategory),
    tiles
  };
}

function archivePersonalImagePreference(preference, assets) {
  const tileId = normalizeText(preference && preference.tileId);
  const boardId = normalizeText(preference && preference.boardId);
  const imagePath = assets.register(
    preference && preference.image,
    'custom',
    `${boardId}-${tileId}`
  );
  if (!tileId || !imagePath) return null;

  return {
    contractVersion: 1,
    scope: 'device-private',
    tileId,
    boardId,
    labelSnapshot: normalizeText(preference.labelSnapshot),
    pictogramAttribution: clonePlainValue(preference.pictogramAttribution),
    createdAt: normalizeTimestamp(preference.createdAt),
    updatedAt: normalizeTimestamp(preference.updatedAt),
    image: { path: imagePath }
  };
}

function archiveMissingTokenResolution(record, assets) {
  const pictogram =
    record &&
    record.resolvedPictogram &&
    typeof record.resolvedPictogram === 'object'
      ? record.resolvedPictogram
      : null;
  const normalizedToken = normalizeText(record && record.normalizedToken);
  const pictogramId = normalizeText(
    (record && record.resolvedPictogramId) || (pictogram && pictogram.id)
  );
  const imagePath = assets.register(
    pictogram && (pictogram.image || pictogram.imageUrl),
    'runtime',
    `${normalizedToken}-${pictogramId}`
  );
  if (!normalizedToken || !pictogramId || !pictogram || !imagePath) {
    return null;
  }

  return {
    id: normalizeText(record.id),
    normalizedToken,
    status: 'resolved',
    occurrenceCount: normalizeUsageCount(record.occurrenceCount),
    source: normalizeText(record.source),
    reviewedByCaregiver: Boolean(record.reviewedByCaregiver),
    createdAt: normalizeTimestamp(record.createdAt),
    updatedAt: normalizeTimestamp(record.updatedAt),
    resolvedPictogramId: pictogramId,
    resolvedPictogram: {
      id: pictogramId,
      label: normalizeText(pictogram.label) || normalizedToken,
      vocalization:
        normalizeText(pictogram.vocalization) ||
        normalizeText(pictogram.label) ||
        normalizedToken,
      backgroundColor: normalizeText(pictogram.backgroundColor) || '#ffffff',
      source: clonePlainValue(pictogram.source || null),
      image: { path: imagePath }
    }
  };
}

function filterOrderingForScope(orderingState, scope, preferences) {
  if (scope === PICTURE_LIBRARY_ARCHIVE_SCOPES.full) {
    return orderingState;
  }
  const allowedKeys = new Set(
    preferences.map(item => `${item.boardId}:${item.tileId}`)
  );
  const usageByTileKey = {};
  Object.keys(orderingState.usageByTileKey).forEach(key => {
    if (allowedKeys.has(key)) {
      usageByTileKey[key] = orderingState.usageByTileKey[key];
    }
  });
  return {
    schemaVersion: orderingState.schemaVersion,
    manualOrderByBoard: {},
    usageByTileKey
  };
}

export function createPictureLibraryArchivePlan({
  scope = PICTURE_LIBRARY_ARCHIVE_SCOPES.custom,
  boards = [],
  personalImagePreferences = [],
  missingTokens = [],
  orderingState = null,
  sourcePlatform = '',
  createdAt = Date.now()
} = {}) {
  if (!Object.values(PICTURE_LIBRARY_ARCHIVE_SCOPES).includes(scope)) {
    throw new TypeError('Picture library archive requires a valid scope');
  }
  const assets = createAssetRegistry();
  const normalizedOrdering = normalizePictogramOrderingState(orderingState);
  const preferences = normalizePersonalImagePreferences(
    personalImagePreferences
  )
    .map(preference => archivePersonalImagePreference(preference, assets))
    .filter(Boolean)
    .slice(0, MAX_ARCHIVE_CUSTOM_ITEMS);
  const resolutions = normalizeCommunicationMissingTokens(missingTokens)
    .filter(record => record.status === 'resolved')
    .map(record => archiveMissingTokenResolution(record, assets))
    .filter(Boolean)
    .slice(0, MAX_ARCHIVE_CUSTOM_ITEMS);
  const archivedBoards =
    scope === PICTURE_LIBRARY_ARCHIVE_SCOPES.full
      ? (Array.isArray(boards) ? boards : [])
          .map(board => archiveBoard(board, normalizedOrdering, assets))
          .filter(Boolean)
          .slice(0, MAX_ARCHIVE_BOARDS)
      : [];
  const assetList = assets.list();

  return {
    manifest: {
      format: PICTURE_LIBRARY_ARCHIVE_FORMAT,
      version: PICTURE_LIBRARY_ARCHIVE_VERSION,
      scope,
      createdAt: normalizeTimestamp(createdAt),
      sourcePlatform: normalizeText(sourcePlatform),
      boards: archivedBoards,
      personalImagePreferences: preferences,
      missingTokenResolutions: resolutions,
      orderingState: filterOrderingForScope(
        normalizedOrdering,
        scope,
        preferences
      ),
      assets: assetList.map(asset => ({
        path: asset.path,
        mediaType: '',
        size: 0
      })),
      stats: {
        boardCount: archivedBoards.length,
        tileCount: archivedBoards.reduce(
          (count, board) => count + board.tiles.length,
          0
        ),
        customPictureCount: preferences.length + resolutions.length,
        assetCount: assetList.length,
        pictureAssetCount: assetList.filter(asset =>
          asset.path.startsWith('images/')
        ).length,
        soundAssetCount: assetList.filter(asset =>
          asset.path.startsWith('sounds/')
        ).length,
        videoAssetCount: assetList.filter(asset =>
          asset.path.startsWith('videos/')
        ).length
      }
    },
    assets: assetList
  };
}

function normalizeAssetList(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map(asset => {
      const path = normalizeArchivePath(asset && asset.path);
      if (
        !path ||
        (!path.startsWith('images/') &&
          !path.startsWith('sounds/') &&
          !path.startsWith('videos/')) ||
        seen.has(path)
      ) {
        return null;
      }
      seen.add(path);
      return {
        path,
        mediaType: normalizeText(asset.mediaType),
        size: normalizeUsageCount(asset.size)
      };
    })
    .filter(Boolean)
    .slice(0, MAX_ARCHIVE_ASSETS);
}

function normalizeArchivedTile(tile, boardId, assetPaths) {
  const id = normalizeText(tile && tile.id);
  if (!id) return null;
  return {
    id,
    boardId: normalizeText(tile.boardId || boardId),
    label: normalizeText(tile.label),
    labelKey: normalizeText(tile.labelKey),
    vocalization: normalizeText(tile.vocalization),
    backgroundColor: normalizeText(tile.backgroundColor),
    borderColor: normalizeText(tile.borderColor),
    keyPath: normalizeText(tile.keyPath),
    loadBoard: normalizeText(tile.loadBoard || tile.loadBoardId),
    loadBoardId: normalizeText(tile.loadBoardId || tile.loadBoard),
    action: normalizeText(tile.action),
    communication: normalizeCommunicationMetadata(tile.communication),
    communicationSynonyms: normalizeStringList(tile.communicationSynonyms),
    communicationRelatedTerms: normalizeStringList(
      tile.communicationRelatedTerms
    ),
    communicationExcludeTokens: normalizeStringList(
      tile.communicationExcludeTokens
    ),
    communicationCategory: normalizeText(tile.communicationCategory),
    categoryId: normalizeText(tile.categoryId),
    usageCount: normalizeUsageCount(tile.usageCount),
    pictogramAttribution: clonePlainValue(tile.pictogramAttribution || null),
    mediaType: normalizeTileMediaType(tile.mediaType, tile.video),
    image: normalizeArchiveImage(tile.image, assetPaths),
    sound: normalizeArchiveSound(tile.sound, assetPaths),
    video: normalizeArchiveVideo(tile.video, assetPaths)
  };
}

function normalizeArchivedBoard(board, assetPaths) {
  const id = normalizeText(board && board.id);
  if (!id) return null;
  return {
    id,
    name: normalizeText(board.name),
    nameKey: normalizeText(board.nameKey),
    category: normalizeText(board.category),
    locale: normalizeText(board.locale),
    hidden: Boolean(board.hidden),
    isFixed: Boolean(board.isFixed),
    grid: normalizeGrid(board.grid),
    communicationSynonyms: normalizeStringList(board.communicationSynonyms),
    communicationRelatedTerms: normalizeStringList(
      board.communicationRelatedTerms
    ),
    communicationExcludeTokens: normalizeStringList(
      board.communicationExcludeTokens
    ),
    communicationCategory: normalizeText(board.communicationCategory),
    tiles: (Array.isArray(board.tiles) ? board.tiles : [])
      .map(tile => normalizeArchivedTile(tile, id, assetPaths))
      .filter(Boolean)
      .slice(0, MAX_ARCHIVE_TILES)
  };
}

export function normalizePictureLibraryArchiveManifest(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.format !== PICTURE_LIBRARY_ARCHIVE_FORMAT ||
    value.version !== PICTURE_LIBRARY_ARCHIVE_VERSION ||
    !Object.values(PICTURE_LIBRARY_ARCHIVE_SCOPES).includes(value.scope)
  ) {
    throw new TypeError('Invalid or unsupported picture library archive');
  }
  const assets = normalizeAssetList(value.assets);
  const assetPaths = new Set(assets.map(asset => asset.path));
  const boards = (Array.isArray(value.boards) ? value.boards : [])
    .map(board => normalizeArchivedBoard(board, assetPaths))
    .filter(Boolean)
    .slice(0, MAX_ARCHIVE_BOARDS);
  const personalImagePreferences = (Array.isArray(
    value.personalImagePreferences
  )
    ? value.personalImagePreferences
    : []
  )
    .map(preference => {
      const tileId = normalizeText(preference && preference.tileId);
      if (!tileId) return null;
      const boardId = normalizeText(preference.boardId);
      const labelSnapshot = normalizeText(preference.labelSnapshot);
      return {
        contractVersion: 1,
        scope: 'device-private',
        tileId,
        boardId,
        labelSnapshot,
        pictogramAttribution: normalizePersonalImageAttribution(
          preference.pictogramAttribution,
          {
            boardId,
            tileId,
            label: labelSnapshot
          }
        ),
        createdAt: normalizeTimestamp(preference.createdAt),
        updatedAt: normalizeTimestamp(preference.updatedAt),
        image: normalizeArchiveImage(preference.image, assetPaths)
      };
    })
    .filter(Boolean)
    .slice(0, MAX_ARCHIVE_CUSTOM_ITEMS);
  const missingTokenResolutions = (Array.isArray(value.missingTokenResolutions)
    ? value.missingTokenResolutions
    : []
  )
    .map(record => {
      const normalizedToken = normalizeText(record && record.normalizedToken);
      const pictogram =
        record &&
        record.resolvedPictogram &&
        typeof record.resolvedPictogram === 'object'
          ? record.resolvedPictogram
          : null;
      const pictogramId = normalizeText(
        (record && record.resolvedPictogramId) || (pictogram && pictogram.id)
      );
      if (!normalizedToken || !pictogramId || !pictogram) return null;
      return {
        id: normalizeText(record.id),
        normalizedToken,
        status: 'resolved',
        occurrenceCount: normalizeUsageCount(record.occurrenceCount),
        source: normalizeText(record.source),
        reviewedByCaregiver: Boolean(record.reviewedByCaregiver),
        createdAt: normalizeTimestamp(record.createdAt),
        updatedAt: normalizeTimestamp(record.updatedAt),
        resolvedPictogramId: pictogramId,
        resolvedPictogram: {
          id: pictogramId,
          label: normalizeText(pictogram.label) || normalizedToken,
          vocalization:
            normalizeText(pictogram.vocalization) ||
            normalizeText(pictogram.label) ||
            normalizedToken,
          backgroundColor:
            normalizeText(pictogram.backgroundColor) || '#ffffff',
          source: clonePlainValue(pictogram.source || null),
          image: normalizeArchiveImage(pictogram.image, assetPaths)
        }
      };
    })
    .filter(Boolean)
    .slice(0, MAX_ARCHIVE_CUSTOM_ITEMS);

  return {
    format: PICTURE_LIBRARY_ARCHIVE_FORMAT,
    version: PICTURE_LIBRARY_ARCHIVE_VERSION,
    scope: value.scope,
    createdAt: normalizeTimestamp(value.createdAt),
    sourcePlatform: normalizeText(value.sourcePlatform),
    boards,
    personalImagePreferences,
    missingTokenResolutions,
    orderingState: normalizePictogramOrderingState(value.orderingState),
    assets,
    stats: {
      boardCount: boards.length,
      tileCount: boards.reduce((count, board) => count + board.tiles.length, 0),
      customPictureCount:
        personalImagePreferences.length + missingTokenResolutions.length,
      assetCount: assets.length,
      pictureAssetCount: assets.filter(asset =>
        asset.path.startsWith('images/')
      ).length,
      soundAssetCount: assets.filter(asset => asset.path.startsWith('sounds/'))
        .length,
      videoAssetCount: assets.filter(asset => asset.path.startsWith('videos/'))
        .length
    }
  };
}

export function updatePictureLibraryArchiveAssetMetadata(
  manifest,
  assetMetadata
) {
  const metadataByPath = new Map(
    (Array.isArray(assetMetadata) ? assetMetadata : []).map(item => [
      normalizeArchivePath(item && item.path),
      item
    ])
  );
  return normalizePictureLibraryArchiveManifest({
    ...manifest,
    assets: (manifest.assets || []).map(asset => {
      const metadata = metadataByPath.get(asset.path);
      return {
        ...asset,
        mediaType: normalizeText(metadata && metadata.mediaType),
        size: normalizeUsageCount(metadata && metadata.size)
      };
    })
  });
}

export function createPictureLibraryProgress(
  phase,
  completed,
  total,
  detail = ''
) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeCompleted = Math.max(
    0,
    Math.min(safeTotal, Number(completed) || 0)
  );
  return {
    phase: Object.values(PICTURE_LIBRARY_PROGRESS_PHASES).includes(phase)
      ? phase
      : PICTURE_LIBRARY_PROGRESS_PHASES.collecting,
    completed: safeCompleted,
    total: safeTotal,
    percent: safeTotal
      ? Math.round((safeCompleted / safeTotal) * 100)
      : phase === PICTURE_LIBRARY_PROGRESS_PHASES.complete
      ? 100
      : 0,
    detail: normalizeText(detail)
  };
}

function resolveArchivedAsset(asset, assetLocations) {
  if (!asset) return '';
  const resolved = assetLocations[asset.path];
  if (!normalizeText(resolved)) {
    throw new TypeError(
      `Picture library archive asset was not restored: ${asset.path}`
    );
  }
  return normalizeText(resolved);
}

function restoreTile(tile, assetLocations) {
  const image = resolveArchivedAsset(tile.image, assetLocations);
  const sound = resolveArchivedAsset(tile.sound, assetLocations);
  const video = resolveArchivedAsset(tile.video, assetLocations);
  const communication = normalizeCommunicationMetadata({
    synonyms: tile.communicationSynonyms || tile.communication.synonyms,
    relatedTerms:
      tile.communicationRelatedTerms || tile.communication.relatedTerms,
    excludeTokens:
      tile.communicationExcludeTokens || tile.communication.excludeTokens,
    category:
      tile.communicationCategory ||
      tile.categoryId ||
      tile.communication.category
  });
  return {
    id: tile.id,
    boardId: tile.boardId,
    label: tile.label,
    labelKey: tile.labelKey,
    vocalization: tile.vocalization,
    mediaType: normalizeTileMediaType(tile.mediaType, video),
    image,
    sound,
    video,
    backgroundColor: tile.backgroundColor,
    borderColor: tile.borderColor,
    keyPath: tile.keyPath,
    loadBoard: tile.loadBoard,
    loadBoardId: tile.loadBoardId,
    action: tile.action,
    communication,
    communicationSynonyms: communication.synonyms,
    communicationRelatedTerms: communication.relatedTerms,
    communicationExcludeTokens: communication.excludeTokens,
    communicationCategory: communication.category,
    categoryId: communication.category,
    usageCount: tile.usageCount,
    pictogramAttribution: clonePlainValue(tile.pictogramAttribution)
  };
}

function restoreBoard(board, assetLocations) {
  const grid = clonePlainValue(board.grid);
  const tileIds = grid
    ? grid.order.reduce(
        (result, row) => result.concat(row.filter(tileId => Boolean(tileId))),
        []
      )
    : board.tiles.map(tile => tile.id);
  return {
    dtoType: 'BoardDTO',
    version: 1,
    id: board.id,
    name: board.name,
    nameKey: board.nameKey,
    category: board.category,
    locale: board.locale,
    hidden: board.hidden,
    isFixed: board.isFixed,
    grid,
    layout: {
      columns: grid ? grid.columns : Math.max(1, board.tiles.length),
      rows: grid ? grid.rows : 1,
      tileIds
    },
    communicationSynonyms: board.communicationSynonyms,
    communicationRelatedTerms: board.communicationRelatedTerms,
    communicationExcludeTokens: board.communicationExcludeTokens,
    communicationCategory: board.communicationCategory,
    tiles: board.tiles.map(tile => restoreTile(tile, assetLocations))
  };
}

function mergeByKey(existing, imported, keyOf, strategy) {
  const existingList = Array.isArray(existing) ? existing : [];
  const importedList = Array.isArray(imported) ? imported : [];
  const importedKeys = new Set(importedList.map(keyOf));
  const existingKeys = new Set(existingList.map(keyOf));

  if (strategy === PICTURE_LIBRARY_CONFLICT_STRATEGIES.skip) {
    return [
      ...existingList,
      ...importedList.filter(item => !existingKeys.has(keyOf(item)))
    ];
  }
  return [
    ...importedList,
    ...existingList.filter(item => !importedKeys.has(keyOf(item)))
  ];
}

function mergeOrdering(existing, imported, strategy) {
  const local = normalizePictogramOrderingState(existing);
  const archive = normalizePictogramOrderingState(imported);
  const importedWins = strategy === PICTURE_LIBRARY_CONFLICT_STRATEGIES.merge;
  return normalizePictogramOrderingState({
    schemaVersion: 1,
    manualOrderByBoard: importedWins
      ? {
          ...local.manualOrderByBoard,
          ...archive.manualOrderByBoard
        }
      : {
          ...archive.manualOrderByBoard,
          ...local.manualOrderByBoard
        },
    usageByTileKey: importedWins
      ? {
          ...local.usageByTileKey,
          ...archive.usageByTileKey
        }
      : {
          ...archive.usageByTileKey,
          ...local.usageByTileKey
        }
  });
}

export function restorePictureLibraryArchive({
  manifest,
  assetLocations = {},
  existingBoards = [],
  existingPersonalImagePreferences = [],
  existingMissingTokens = [],
  existingOrderingState = null,
  identity = {},
  conflictStrategy = PICTURE_LIBRARY_CONFLICT_STRATEGIES.merge
} = {}) {
  if (
    !Object.values(PICTURE_LIBRARY_CONFLICT_STRATEGIES).includes(
      conflictStrategy
    )
  ) {
    throw new TypeError(
      'Picture library restore requires a valid conflict strategy'
    );
  }
  const archive = normalizePictureLibraryArchiveManifest(manifest);
  const patientId = normalizeText(identity.patientId);
  const workspaceId = normalizeText(identity.workspaceId);
  if (
    (archive.personalImagePreferences.length ||
      archive.missingTokenResolutions.length) &&
    (!patientId || !workspaceId)
  ) {
    throw new TypeError(
      'Picture library restore requires the current local identity'
    );
  }

  const importedBoards = archive.boards.map(board =>
    restoreBoard(board, assetLocations)
  );
  const importedPreferences = archive.personalImagePreferences.map(
    preference => ({
      ...preference,
      image: resolveArchivedAsset(preference.image, assetLocations),
      patientId,
      workspaceId
    })
  );
  const importedMissingTokens = archive.missingTokenResolutions.map(record => ({
    ...record,
    patientId,
    workspaceId,
    resolvedPictogram: {
      ...record.resolvedPictogram,
      image: resolveArchivedAsset(
        record.resolvedPictogram.image,
        assetLocations
      )
    }
  }));
  const boards =
    archive.scope === PICTURE_LIBRARY_ARCHIVE_SCOPES.full
      ? mergeByKey(
          existingBoards,
          importedBoards,
          board => normalizeText(board && board.id),
          conflictStrategy
        )
      : Array.isArray(existingBoards)
      ? existingBoards.slice()
      : [];
  const personalImagePreferences = mergeByKey(
    normalizePersonalImagePreferences(existingPersonalImagePreferences),
    importedPreferences,
    preference =>
      [
        normalizeText(preference.patientId),
        normalizeText(preference.workspaceId),
        normalizeText(preference.boardId),
        normalizeText(preference.tileId)
      ].join(':'),
    conflictStrategy
  );
  const missingTokens = mergeByKey(
    normalizeCommunicationMissingTokens(existingMissingTokens),
    importedMissingTokens,
    record => normalizeText(record && record.normalizedToken),
    conflictStrategy
  );

  return {
    archive,
    boards,
    personalImagePreferences,
    missingTokens,
    orderingState: mergeOrdering(
      existingOrderingState,
      archive.orderingState,
      conflictStrategy
    ),
    summary: {
      scope: archive.scope,
      boardCount: importedBoards.length,
      tileCount: importedBoards.reduce(
        (count, board) => count + board.tiles.length,
        0
      ),
      customPictureCount:
        importedPreferences.length + importedMissingTokens.length,
      assetCount: archive.assets.length,
      pictureAssetCount: archive.stats.pictureAssetCount,
      soundAssetCount: archive.stats.soundAssetCount,
      videoAssetCount: archive.stats.videoAssetCount,
      conflictStrategy
    }
  };
}
