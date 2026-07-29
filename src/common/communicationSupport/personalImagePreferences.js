import {
  DEVICE_PRIVATE_PICTOGRAM_PROVIDER,
  createDevicePrivatePictogramAttribution,
  normalizePictogramAttribution
} from './pictogramAttribution';

export const PERSONAL_IMAGE_PREFERENCE_SCOPE = 'device-private';
export const DEFAULT_PERSONAL_IMAGE_PREFERENCE_LIMIT = 50;

function normalizeText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : 0;
}

function preferenceKey(value) {
  return [
    normalizeText(value.patientId),
    normalizeText(value.workspaceId),
    normalizeText(value.boardId),
    normalizeText(value.tileId)
  ].join(':');
}

export function normalizePersonalImageAttribution(value, fallback = {}) {
  const normalized = normalizePictogramAttribution(value);
  return normalized && normalized.provider === DEVICE_PRIVATE_PICTOGRAM_PROVIDER
    ? normalized
    : createDevicePrivatePictogramAttribution(fallback);
}

export function normalizePersonalImagePreference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const scope = normalizeText(value.scope);
  const tileId = normalizeText(value.tileId);
  const boardId = normalizeText(value.boardId);
  const labelSnapshot = normalizeText(value.labelSnapshot);
  const image = normalizeText(value.image);
  const patientId = normalizeText(value.patientId);
  const workspaceId = normalizeText(value.workspaceId);

  if (
    (scope && scope !== PERSONAL_IMAGE_PREFERENCE_SCOPE) ||
    !tileId ||
    !image ||
    !patientId ||
    !workspaceId
  ) {
    return null;
  }

  return {
    contractVersion: 1,
    scope: PERSONAL_IMAGE_PREFERENCE_SCOPE,
    tileId,
    boardId,
    labelSnapshot,
    image,
    pictogramAttribution: normalizePersonalImageAttribution(
      value.pictogramAttribution || value.attribution,
      {
        boardId,
        tileId,
        label: labelSnapshot
      }
    ),
    patientId,
    workspaceId,
    createdAt: normalizeTimestamp(value.createdAt),
    updatedAt: normalizeTimestamp(value.updatedAt)
  };
}

export function normalizePersonalImagePreferences(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const byKey = new Map();

  value.forEach(item => {
    const normalized = normalizePersonalImagePreference(item);
    if (!normalized) {
      return;
    }

    const key = preferenceKey(normalized);
    const existing = byKey.get(key);
    if (!existing || normalized.updatedAt >= existing.updatedAt) {
      byKey.set(key, normalized);
    }
  });

  return [...byKey.values()].sort(
    (left, right) => right.updatedAt - left.updatedAt
  );
}

export function getPersonalImagePreferencesForIdentity(preferences, identity) {
  const patientId = normalizeText(identity && identity.patientId);
  const workspaceId = normalizeText(identity && identity.workspaceId);

  if (!patientId || !workspaceId) {
    return [];
  }

  return normalizePersonalImagePreferences(preferences).filter(
    preference =>
      preference.patientId === patientId &&
      preference.workspaceId === workspaceId
  );
}

export function upsertPersonalImagePreference(
  preferences,
  value,
  { identity, now = Date.now } = {}
) {
  if (typeof now !== 'function') {
    throw new TypeError('Personal image preference requires a clock function');
  }

  const patientId = normalizeText(identity && identity.patientId);
  const workspaceId = normalizeText(identity && identity.workspaceId);
  const tileId = normalizeText(value && value.tileId);
  const boardId = normalizeText(value && value.boardId);
  const image = normalizeText(value && value.image);

  if (!patientId || !workspaceId || !tileId || !image) {
    throw new TypeError(
      'Personal image preference requires identity, tileId and image'
    );
  }

  const current = normalizePersonalImagePreferences(preferences);
  const key = [patientId, workspaceId, boardId, tileId].join(':');
  const existing = current.find(item => preferenceKey(item) === key);
  const timestamp = now();
  const next = normalizePersonalImagePreference({
    ...existing,
    ...value,
    scope: PERSONAL_IMAGE_PREFERENCE_SCOPE,
    patientId,
    workspaceId,
    createdAt: existing ? existing.createdAt : timestamp,
    updatedAt: timestamp
  });

  return [next, ...current.filter(item => preferenceKey(item) !== key)];
}

export function deletePersonalImagePreference(
  preferences,
  tileId,
  { boardId = '', identity } = {}
) {
  const normalizedTileId = normalizeText(tileId);
  const normalizedBoardId = normalizeText(boardId);
  const patientId = normalizeText(identity && identity.patientId);
  const workspaceId = normalizeText(identity && identity.workspaceId);

  return normalizePersonalImagePreferences(preferences).filter(preference => {
    const belongsToIdentity =
      preference.patientId === patientId &&
      preference.workspaceId === workspaceId;
    const matchesTile =
      preference.tileId === normalizedTileId &&
      (!normalizedBoardId || preference.boardId === normalizedBoardId);

    return !(belongsToIdentity && matchesTile);
  });
}

function createPreferenceMap(preferences, identity) {
  return new Map(
    getPersonalImagePreferencesForIdentity(preferences, identity).map(
      preference => [`${preference.boardId}:${preference.tileId}`, preference]
    )
  );
}

function findPreference(preferenceMap, item, boardId = '') {
  const tileId = normalizeText(item && item.id);
  const resolvedBoardId = normalizeText(boardId || (item && item.boardId));

  return (
    preferenceMap.get(`${resolvedBoardId}:${tileId}`) ||
    preferenceMap.get(`:${tileId}`) ||
    null
  );
}

function applyPersonalImagePreference(item, preference) {
  return {
    ...item,
    image: preference.image,
    pictogramAttribution: preference.pictogramAttribution,
    attribution: preference.pictogramAttribution
  };
}

export function applyPersonalImagePreferencesToItems(
  items,
  preferences,
  identity
) {
  if (!Array.isArray(items)) {
    return [];
  }

  const preferenceMap = createPreferenceMap(preferences, identity);

  return items.map(item => {
    const preference = findPreference(preferenceMap, item);
    return preference ? applyPersonalImagePreference(item, preference) : item;
  });
}

export function applyPersonalImagePreferencesToBoards(
  boards,
  preferences,
  identity
) {
  if (!Array.isArray(boards)) {
    return [];
  }

  const preferenceMap = createPreferenceMap(preferences, identity);

  return boards.map(board => {
    const boardId = normalizeText(board && board.id);
    const tiles = Array.isArray(board && board.tiles) ? board.tiles : [];
    let changed = false;
    const nextTiles = tiles.map(tile => {
      const preference = findPreference(preferenceMap, tile, boardId);
      if (!preference) {
        return tile;
      }

      changed = true;
      return applyPersonalImagePreference(tile, preference);
    });

    return changed ? { ...board, tiles: nextTiles } : board;
  });
}
