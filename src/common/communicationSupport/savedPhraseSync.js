import {
  normalizeCommunicationSavedPhrase,
  normalizeCommunicationSavedPhraseList
} from './savedPhraseManagement';
import { buildCommunicationSupportCloudSettings } from './storage';

export const MAX_SAVED_PHRASE_SYNC_ITEMS = 100;

function normalizeVersion(value, allowZero = false) {
  const version = Number(value);
  return Number.isInteger(version) && (allowZero ? version >= 0 : version > 0)
    ? version
    : null;
}

function normalizeTimestamp(value, fallback = 0) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0
    ? Math.floor(timestamp)
    : fallback;
}

function normalizeSavedPhraseSyncEntry(entry) {
  const normalized = normalizeCommunicationSavedPhrase(entry);
  if (!normalized) return null;

  const serverVersion = normalizeVersion(entry && entry.serverVersion);
  const baseVersion = normalizeVersion(entry && entry.baseVersion, true);
  const result = { ...normalized };
  delete result.serverVersion;
  delete result.baseVersion;
  delete result.conflicted;

  if (serverVersion) result.serverVersion = serverVersion;
  if (baseVersion !== null) result.baseVersion = baseVersion;
  if (entry && entry.conflicted === true) result.conflicted = true;
  return result;
}

export function normalizeSavedPhraseTombstone(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '').trim();
  const deletedAt = normalizeTimestamp(value.deletedAt);
  const deletedBy = String(value.deletedBy || '').trim();
  const serverVersion = normalizeVersion(value.serverVersion, true) || 0;
  if (!id || !deletedAt) return null;

  return {
    id,
    deletedAt,
    ...(deletedBy ? { deletedBy } : {}),
    serverVersion,
    ...(value.pending === true ? { pending: true } : {})
  };
}

export function normalizeSavedPhraseTombstones(values) {
  const byId = new Map();

  (Array.isArray(values) ? values : [])
    .map(normalizeSavedPhraseTombstone)
    .filter(Boolean)
    .forEach(item => {
      const current = byId.get(item.id);
      if (
        !current ||
        item.serverVersion > current.serverVersion ||
        (item.serverVersion === current.serverVersion &&
          item.deletedAt >= current.deletedAt)
      ) {
        byId.set(item.id, item);
      }
    });

  return [...byId.values()]
    .sort((left, right) => right.deletedAt - left.deletedAt)
    .slice(0, MAX_SAVED_PHRASE_SYNC_ITEMS);
}

export function buildCommunicationSavedPhraseSyncPayload(entries) {
  return normalizeCommunicationSavedPhraseList(entries)
    .map(normalizeSavedPhraseSyncEntry)
    .filter(Boolean)
    .slice(0, MAX_SAVED_PHRASE_SYNC_ITEMS)
    .map(entry => {
      const cloudEntry = buildCommunicationSupportCloudSettings([entry], [])
        .savedPhrases[0];
      if (!cloudEntry) return null;
      const payloadEntry = { ...cloudEntry };
      delete payloadEntry.serverVersion;
      delete payloadEntry.baseVersion;
      delete payloadEntry.conflicted;
      return {
        ...payloadEntry,
        baseVersion:
          normalizeVersion(entry.serverVersion) ||
          normalizeVersion(entry.baseVersion, true) ||
          0
      };
    })
    .filter(Boolean);
}

export function mergeVersionedCommunicationSavedPhrases(
  localEntries,
  remoteEntries,
  deletedPhrases = []
) {
  const tombstones = normalizeSavedPhraseTombstones(deletedPhrases);
  const deletedIds = new Set(tombstones.map(item => item.id));
  const byId = new Map();
  let conflictCount = 0;

  normalizeCommunicationSavedPhraseList(localEntries)
    .map(normalizeSavedPhraseSyncEntry)
    .filter(item => item && !deletedIds.has(item.id))
    .forEach(item => byId.set(item.id, item));

  (Array.isArray(remoteEntries) ? remoteEntries : [])
    .map(normalizeSavedPhraseSyncEntry)
    .filter(item => item && !deletedIds.has(item.id))
    .forEach(remote => {
      const local = byId.get(remote.id);
      if (!local) {
        byId.set(remote.id, remote);
        if (remote.conflicted === true) conflictCount += 1;
        return;
      }

      const remoteVersion = normalizeVersion(remote.serverVersion) || 0;
      const localVersion = normalizeVersion(local.serverVersion) || 0;

      if (remote.conflicted === true) {
        conflictCount += 1;
        const localWins =
          normalizeTimestamp(local.updatedAt) >=
          normalizeTimestamp(remote.updatedAt);
        const winner = localWins ? local : remote;
        byId.set(remote.id, {
          ...winner,
          ...(remoteVersion ? { serverVersion: remoteVersion } : {}),
          baseVersion: remoteVersion,
          conflicted: true
        });
        return;
      }

      if (remoteVersion >= localVersion) {
        const resolved = { ...remote };
        delete resolved.conflicted;
        delete resolved.baseVersion;
        byId.set(remote.id, resolved);
      }
    });

  const items = normalizeCommunicationSavedPhraseList([...byId.values()])
    .filter(item => !deletedIds.has(item.id))
    .slice(0, MAX_SAVED_PHRASE_SYNC_ITEMS);

  return { items, tombstones, conflictCount };
}
