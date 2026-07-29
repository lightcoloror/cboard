import { normalizeExpressionCandidateFeedbackDraft } from './candidateFeedback';
import { normalizePersonalImagePreferences } from './personalImagePreferences';
import {
  PICTURE_LIBRARY_ARCHIVE_MANIFEST,
  PICTURE_LIBRARY_CONFLICT_STRATEGIES,
  PICTURE_LIBRARY_ARCHIVE_SCOPES,
  normalizePictureLibraryArchiveManifest
} from './pictureLibraryArchive';
import { normalizeSavedPhraseTombstones } from './savedPhraseSync';
import {
  normalizeCommunicationHistory,
  normalizeCommunicationMissingTokens,
  normalizeCommunicationReceiverCorrections,
  normalizeCommunicationReceiverRecords,
  normalizeCommunicationSavedPhrases
} from './storage';

export const LOCAL_DEVICE_DATA_FORMAT = 'picinterpreter-local-device-data';
export const LOCAL_DEVICE_DATA_VERSION = 1;
export const LOCAL_DEVICE_DATA_MANIFEST = 'device-data.json';
export const LOCAL_DEVICE_DATA_PICTOGRAMS = 'pictograms.json';
export const LOCAL_DEVICE_DATA_CATEGORIES = 'categories.json';
export const LOCAL_DEVICE_DATA_EXPRESSIONS = 'expressions.json';
export const LOCAL_DEVICE_DATA_PURPOSES = Object.freeze({
  completeDeviceBackup: 'complete-device-backup',
  accountPrivateSnapshot: 'account-private-snapshot'
});

const DEVICE_PRIVATE_PROVIDER = 'device-private';

function normalizeText(value) {
  return String(value || '').trim();
}

function clonePlainValue(value) {
  if (Array.isArray(value)) return value.map(clonePlainValue);
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

function getProvider(value) {
  return normalizeText(
    value && value.source && value.source.provider
      ? value.source.provider
      : value &&
          value.pictogramAttribution &&
          value.pictogramAttribution.provider
  ).toLocaleLowerCase();
}

function getScope(value) {
  return getProvider(value) === DEVICE_PRIVATE_PROVIDER
    ? 'device-private'
    : 'public';
}

function normalizeDrafts(value) {
  return (Array.isArray(value) ? value : [])
    .map(normalizeExpressionCandidateFeedbackDraft)
    .filter(Boolean);
}

function buildCategoryFile(archive) {
  return {
    format: LOCAL_DEVICE_DATA_FORMAT,
    version: LOCAL_DEVICE_DATA_VERSION,
    createdAt: archive.createdAt,
    items: archive.boards.map(board => ({
      id: board.id,
      name: board.name,
      nameKey: board.nameKey,
      category: board.category,
      locale: board.locale,
      hidden: board.hidden,
      grid: clonePlainValue(board.grid),
      pictogramIds: board.tiles.map(tile => tile.id)
    }))
  };
}

function buildPictogramFile(archive) {
  const boardPictograms = archive.boards.flatMap(board =>
    board.tiles.map(tile => ({
      ...clonePlainValue(tile),
      kind: 'board-tile',
      categoryId: board.id,
      scope: getScope(tile)
    }))
  );
  const personalPictograms = archive.personalImagePreferences.map(
    preference => ({
      ...clonePlainValue(preference),
      id: `personal:${preference.boardId}:${preference.tileId}`,
      kind: 'personal-override',
      scope: 'device-private'
    })
  );
  const runtimePictograms = archive.missingTokenResolutions.map(record => ({
    ...clonePlainValue(record.resolvedPictogram),
    id:
      record.resolvedPictogramId ||
      (record.resolvedPictogram && record.resolvedPictogram.id),
    kind: 'missing-token-resolution',
    normalizedToken: record.normalizedToken,
    scope: getScope(record.resolvedPictogram)
  }));

  return {
    format: LOCAL_DEVICE_DATA_FORMAT,
    version: LOCAL_DEVICE_DATA_VERSION,
    createdAt: archive.createdAt,
    items: [...boardPictograms, ...personalPictograms, ...runtimePictograms]
  };
}

export function buildLocalDeviceDataFiles({
  libraryManifest,
  savedPhrases = [],
  savedPhraseTombstones = [],
  history = [],
  receiverRecords = [],
  receiverCorrections = [],
  expressionCandidateFeedbackDrafts = [],
  purpose = LOCAL_DEVICE_DATA_PURPOSES.completeDeviceBackup,
  sourcePlatform = '',
  createdAt
} = {}) {
  const archive = normalizePictureLibraryArchiveManifest(libraryManifest);
  const normalizedPurpose = normalizeText(purpose);
  const isCompleteBackup =
    normalizedPurpose === LOCAL_DEVICE_DATA_PURPOSES.completeDeviceBackup &&
    archive.scope === PICTURE_LIBRARY_ARCHIVE_SCOPES.full;
  const isAccountPrivateSnapshot =
    normalizedPurpose === LOCAL_DEVICE_DATA_PURPOSES.accountPrivateSnapshot &&
    archive.scope === PICTURE_LIBRARY_ARCHIVE_SCOPES.custom;
  if (!isCompleteBackup && !isAccountPrivateSnapshot) {
    throw new TypeError(
      'Local device data purpose does not match the picture library scope'
    );
  }
  const exportedAt = Number.isFinite(Number(createdAt))
    ? Math.max(0, Math.floor(Number(createdAt)))
    : archive.createdAt;
  const categories = buildCategoryFile(archive);
  const pictograms = buildPictogramFile(archive);
  const expressions = {
    format: LOCAL_DEVICE_DATA_FORMAT,
    version: LOCAL_DEVICE_DATA_VERSION,
    createdAt: exportedAt,
    savedPhrases: normalizeCommunicationSavedPhrases(savedPhrases),
    savedPhraseTombstones: normalizeSavedPhraseTombstones(
      savedPhraseTombstones
    ),
    history: normalizeCommunicationHistory(history),
    receiverRecords: normalizeCommunicationReceiverRecords(receiverRecords),
    receiverCorrections: normalizeCommunicationReceiverCorrections(
      receiverCorrections
    ),
    expressionCandidateFeedbackDrafts: normalizeDrafts(
      expressionCandidateFeedbackDrafts
    )
  };
  const manifest = {
    format: LOCAL_DEVICE_DATA_FORMAT,
    version: LOCAL_DEVICE_DATA_VERSION,
    createdAt: exportedAt,
    sourcePlatform: normalizeText(sourcePlatform),
    purpose: normalizedPurpose,
    libraryManifest: 'library.json',
    files: {
      pictograms: LOCAL_DEVICE_DATA_PICTOGRAMS,
      categories: LOCAL_DEVICE_DATA_CATEGORIES,
      expressions: LOCAL_DEVICE_DATA_EXPRESSIONS
    },
    stats: {
      pictogramCount: pictograms.items.length,
      categoryCount: categories.items.length,
      expressionCount:
        expressions.history.length + expressions.receiverRecords.length,
      savedPhraseCount: expressions.savedPhrases.length,
      savedPhraseTombstoneCount: expressions.savedPhraseTombstones.length,
      correctionCount: expressions.receiverCorrections.length,
      draftCount: expressions.expressionCandidateFeedbackDrafts.length
    }
  };

  return {
    manifest,
    files: {
      [LOCAL_DEVICE_DATA_MANIFEST]: manifest,
      [LOCAL_DEVICE_DATA_PICTOGRAMS]: pictograms,
      [LOCAL_DEVICE_DATA_CATEGORIES]: categories,
      [LOCAL_DEVICE_DATA_EXPRESSIONS]: expressions
    }
  };
}

function normalizeLocalDeviceDataEnvelope(value, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.format !== LOCAL_DEVICE_DATA_FORMAT ||
    value.version !== LOCAL_DEVICE_DATA_VERSION
  ) {
    throw new TypeError(`Invalid local device data ${label}`);
  }
  return value;
}

function assertLocalDeviceDataCount(stats, key, actual) {
  if (!stats || typeof stats !== 'object' || Number(stats[key]) !== actual) {
    throw new TypeError(`Invalid local device data ${key}`);
  }
}

export function normalizeLocalDeviceDataArchiveFiles({
  manifest,
  pictograms,
  categories,
  expressions,
  libraryManifest
} = {}) {
  const sourceManifest = normalizeLocalDeviceDataEnvelope(manifest, 'manifest');
  const sourcePictograms = normalizeLocalDeviceDataEnvelope(
    pictograms,
    'pictograms'
  );
  const sourceCategories = normalizeLocalDeviceDataEnvelope(
    categories,
    'categories'
  );
  const sourceExpressions = normalizeLocalDeviceDataEnvelope(
    expressions,
    'expressions'
  );
  const files = sourceManifest.files;
  const purpose =
    normalizeText(sourceManifest.purpose) ||
    LOCAL_DEVICE_DATA_PURPOSES.completeDeviceBackup;

  if (libraryManifest) {
    const archive = normalizePictureLibraryArchiveManifest(libraryManifest);
    const validPurpose =
      (purpose === LOCAL_DEVICE_DATA_PURPOSES.completeDeviceBackup &&
        archive.scope === PICTURE_LIBRARY_ARCHIVE_SCOPES.full) ||
      (purpose === LOCAL_DEVICE_DATA_PURPOSES.accountPrivateSnapshot &&
        archive.scope === PICTURE_LIBRARY_ARCHIVE_SCOPES.custom);
    if (!validPurpose) {
      throw new TypeError(
        'Local device data purpose does not match the picture library scope'
      );
    }
  }

  if (
    sourceManifest.libraryManifest !== PICTURE_LIBRARY_ARCHIVE_MANIFEST ||
    !files ||
    files.pictograms !== LOCAL_DEVICE_DATA_PICTOGRAMS ||
    files.categories !== LOCAL_DEVICE_DATA_CATEGORIES ||
    files.expressions !== LOCAL_DEVICE_DATA_EXPRESSIONS ||
    !Array.isArray(sourcePictograms.items) ||
    !Array.isArray(sourceCategories.items)
  ) {
    throw new TypeError('Invalid local device data file map');
  }

  const normalizedExpressions = {
    format: LOCAL_DEVICE_DATA_FORMAT,
    version: LOCAL_DEVICE_DATA_VERSION,
    createdAt: Number.isFinite(Number(sourceExpressions.createdAt))
      ? Math.max(0, Math.floor(Number(sourceExpressions.createdAt)))
      : 0,
    savedPhrases: normalizeCommunicationSavedPhrases(
      sourceExpressions.savedPhrases
    ),
    savedPhraseTombstones: normalizeSavedPhraseTombstones(
      sourceExpressions.savedPhraseTombstones
    ),
    history: normalizeCommunicationHistory(sourceExpressions.history),
    receiverRecords: normalizeCommunicationReceiverRecords(
      sourceExpressions.receiverRecords
    ),
    receiverCorrections: normalizeCommunicationReceiverCorrections(
      sourceExpressions.receiverCorrections
    ),
    expressionCandidateFeedbackDrafts: normalizeDrafts(
      sourceExpressions.expressionCandidateFeedbackDrafts
    )
  };
  const stats = sourceManifest.stats;

  assertLocalDeviceDataCount(
    stats,
    'pictogramCount',
    sourcePictograms.items.length
  );
  assertLocalDeviceDataCount(
    stats,
    'categoryCount',
    sourceCategories.items.length
  );
  assertLocalDeviceDataCount(
    stats,
    'expressionCount',
    normalizedExpressions.history.length +
      normalizedExpressions.receiverRecords.length
  );
  assertLocalDeviceDataCount(
    stats,
    'savedPhraseCount',
    normalizedExpressions.savedPhrases.length
  );
  if (
    Object.prototype.hasOwnProperty.call(stats, 'savedPhraseTombstoneCount')
  ) {
    assertLocalDeviceDataCount(
      stats,
      'savedPhraseTombstoneCount',
      normalizedExpressions.savedPhraseTombstones.length
    );
  }
  assertLocalDeviceDataCount(
    stats,
    'correctionCount',
    normalizedExpressions.receiverCorrections.length
  );
  assertLocalDeviceDataCount(
    stats,
    'draftCount',
    normalizedExpressions.expressionCandidateFeedbackDrafts.length
  );

  return {
    manifest: {
      ...clonePlainValue(sourceManifest),
      purpose
    },
    pictograms: {
      ...clonePlainValue(sourcePictograms),
      items: clonePlainValue(sourcePictograms.items)
    },
    categories: {
      ...clonePlainValue(sourceCategories),
      items: clonePlainValue(sourceCategories.items)
    },
    expressions: normalizedExpressions
  };
}

function mergeEntriesById(current, imported, conflictStrategy) {
  const ordered =
    conflictStrategy === PICTURE_LIBRARY_CONFLICT_STRATEGIES.merge
      ? [...imported, ...current]
      : [...current, ...imported];
  const seen = new Set();

  return ordered.filter(entry => {
    const id = normalizeText(entry && entry.id);
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function indexEntriesById(entries) {
  const result = new Map();

  entries.forEach(entry => {
    const id = normalizeText(entry && entry.id);
    if (id) result.set(id, entry);
  });
  return result;
}

function mergeSavedPhraseState(
  currentPhrases,
  currentTombstones,
  importedPhrases,
  importedTombstones,
  conflictStrategy
) {
  const currentPhraseById = indexEntriesById(currentPhrases);
  const currentTombstoneById = indexEntriesById(currentTombstones);
  const importedPhraseById = indexEntriesById(importedPhrases);
  const importedTombstoneById = indexEntriesById(importedTombstones);
  const ids = new Set([
    ...currentPhraseById.keys(),
    ...currentTombstoneById.keys(),
    ...importedPhraseById.keys(),
    ...importedTombstoneById.keys()
  ]);
  const savedPhrases = [];
  const savedPhraseTombstones = [];

  ids.forEach(id => {
    const importedWins =
      conflictStrategy === PICTURE_LIBRARY_CONFLICT_STRATEGIES.merge;
    const primaryPhrase = importedWins
      ? importedPhraseById.get(id)
      : currentPhraseById.get(id);
    const primaryTombstone = importedWins
      ? importedTombstoneById.get(id)
      : currentTombstoneById.get(id);
    const fallbackPhrase = importedWins
      ? currentPhraseById.get(id)
      : importedPhraseById.get(id);
    const fallbackTombstone = importedWins
      ? currentTombstoneById.get(id)
      : importedTombstoneById.get(id);

    if (primaryPhrase) savedPhrases.push(primaryPhrase);
    else if (primaryTombstone) {
      savedPhraseTombstones.push(primaryTombstone);
    } else if (fallbackPhrase) savedPhrases.push(fallbackPhrase);
    else if (fallbackTombstone) {
      savedPhraseTombstones.push(fallbackTombstone);
    }
  });

  return { savedPhrases, savedPhraseTombstones };
}

function rebindIdentity(entries, identity) {
  return entries.map(entry => ({
    ...entry,
    ...(Object.prototype.hasOwnProperty.call(entry, 'patientId')
      ? { patientId: identity.patientId }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(entry, 'workspaceId')
      ? { workspaceId: identity.workspaceId }
      : {})
  }));
}

function requiresIdentity(entries) {
  return entries.some(
    entry =>
      Object.prototype.hasOwnProperty.call(entry, 'patientId') ||
      Object.prototype.hasOwnProperty.call(entry, 'workspaceId')
  );
}

export function mergeLocalDeviceDataRestore({
  current = {},
  imported,
  identity = {},
  conflictStrategy = PICTURE_LIBRARY_CONFLICT_STRATEGIES.merge
} = {}) {
  if (
    !Object.values(PICTURE_LIBRARY_CONFLICT_STRATEGIES).includes(
      conflictStrategy
    )
  ) {
    throw new TypeError(
      'Local device data restore requires a valid conflict strategy'
    );
  }

  const expressions =
    imported && imported.expressions ? imported.expressions : imported || {};
  const currentSavedPhrases = normalizeCommunicationSavedPhrases(
    current.savedPhrases
  );
  const currentSavedPhraseTombstones = normalizeSavedPhraseTombstones(
    current.savedPhraseTombstones
  );
  const importedSavedPhrases = normalizeCommunicationSavedPhrases(
    expressions.savedPhrases
  );
  const importedSavedPhraseTombstones = normalizeSavedPhraseTombstones(
    expressions.savedPhraseTombstones
  );
  const currentHistory = normalizeCommunicationHistory(current.history);
  const importedHistory = normalizeCommunicationHistory(expressions.history);
  const currentReceiverRecords = normalizeCommunicationReceiverRecords(
    current.receiverRecords
  );
  const importedReceiverRecords = normalizeCommunicationReceiverRecords(
    expressions.receiverRecords
  );
  const currentReceiverCorrections = normalizeCommunicationReceiverCorrections(
    current.receiverCorrections
  );
  const importedReceiverCorrections = normalizeCommunicationReceiverCorrections(
    expressions.receiverCorrections
  );
  const currentFeedbackDrafts = normalizeDrafts(
    current.expressionCandidateFeedbackDrafts
  );
  const importedFeedbackDrafts = normalizeDrafts(
    expressions.expressionCandidateFeedbackDrafts
  );
  const importedIdentityEntries = [
    ...importedHistory,
    ...importedReceiverRecords,
    ...importedReceiverCorrections,
    ...importedFeedbackDrafts
  ];
  const normalizedIdentity = {
    patientId: normalizeText(identity.patientId),
    workspaceId: normalizeText(identity.workspaceId)
  };

  if (
    requiresIdentity(importedIdentityEntries) &&
    (!normalizedIdentity.patientId || !normalizedIdentity.workspaceId)
  ) {
    throw new TypeError(
      'Local device data restore requires the current local identity'
    );
  }

  return {
    ...mergeSavedPhraseState(
      currentSavedPhrases,
      currentSavedPhraseTombstones,
      importedSavedPhrases,
      importedSavedPhraseTombstones,
      conflictStrategy
    ),
    history: mergeEntriesById(
      currentHistory,
      rebindIdentity(importedHistory, normalizedIdentity),
      conflictStrategy
    ),
    receiverRecords: mergeEntriesById(
      currentReceiverRecords,
      rebindIdentity(importedReceiverRecords, normalizedIdentity),
      conflictStrategy
    ),
    receiverCorrections: mergeEntriesById(
      currentReceiverCorrections,
      rebindIdentity(importedReceiverCorrections, normalizedIdentity),
      conflictStrategy
    ),
    expressionCandidateFeedbackDrafts: mergeEntriesById(
      currentFeedbackDrafts,
      rebindIdentity(importedFeedbackDrafts, normalizedIdentity),
      conflictStrategy
    )
  };
}

function isPrivateRuntimePictogram(value) {
  return getProvider(value) === DEVICE_PRIVATE_PROVIDER;
}

function clearPrivateMissingToken(record, timestamp) {
  const hasPrivatePictogram =
    isPrivateRuntimePictogram(record.resolvedPictogram) ||
    isPrivateRuntimePictogram(record.suggestedPictogram);
  if (!hasPrivatePictogram) return record;

  return {
    ...record,
    status: 'new',
    suggestedPictogramId: null,
    suggestedPictogram: null,
    resolvedPictogramId: null,
    resolvedPictogram: null,
    source: null,
    reviewedByCaregiver: false,
    updatedAt: timestamp
  };
}

export function buildPrivatePictogramClearPlan({
  personalImagePreferences = [],
  missingTokens = [],
  now = Date.now()
} = {}) {
  const preferences = normalizePersonalImagePreferences(
    personalImagePreferences
  );
  const records = normalizeCommunicationMissingTokens(missingTokens);
  const timestamp = Number.isFinite(Number(now))
    ? Math.max(0, Math.floor(Number(now)))
    : Date.now();
  const privateRuntimeRecords = records.filter(
    record =>
      isPrivateRuntimePictogram(record.resolvedPictogram) ||
      isPrivateRuntimePictogram(record.suggestedPictogram)
  );
  const imageSources = Array.from(
    new Set(
      [
        ...preferences.map(preference => preference.image),
        ...privateRuntimeRecords.flatMap(record => [
          record.resolvedPictogram && record.resolvedPictogram.image,
          record.suggestedPictogram && record.suggestedPictogram.image
        ])
      ]
        .map(normalizeText)
        .filter(Boolean)
    )
  );

  return {
    personalImagePreferences: [],
    missingTokens: records.map(record =>
      clearPrivateMissingToken(record, timestamp)
    ),
    imageSources,
    removedPreferenceCount: preferences.length,
    removedRuntimePictogramCount: privateRuntimeRecords.length
  };
}
