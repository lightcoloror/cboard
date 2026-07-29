import {
  getReceiverMatchConfidence,
  normalizeReceiverMatchType
} from './receiverContract';
import {
  MAX_MISSING_TOKEN_SAMPLES,
  MISSING_TOKEN_STATUSES,
  getMissingTokenSuggestions,
  normalizeMissingTokenText
} from './missingTokens';
import { normalizeRuntimePictogram } from './runtimePictogram';
import {
  normalizeReceiverPatientFeedback,
  normalizeReceiverPatientFeedbackEvents
} from './receiverPatientFeedback';
import {
  DEVICE_PRIVATE_PICTOGRAM_PROVIDER,
  getPictogramAttribution,
  normalizePublicPictogramAttribution
} from './pictogramAttribution';
import { normalizeExpressionCandidates } from './candidateFeedback';
const MAX_COMMUNICATION_ITEMS = 100;

function normalizeTimestamp(value, fallback = Date.now()) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeUsageCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function createStableRecordId(prefix, values) {
  const input = values.map(value => String(value || '')).join('::');
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function normalizeLabelList(value) {
  return Array.isArray(value)
    ? value.map(item => String(item || '').trim()).filter(Boolean)
    : [];
}

function normalizePictogramIdList(value) {
  return Array.isArray(value)
    ? value.map(item => {
        const normalized = String(item || '').trim();
        return normalized || null;
      })
    : [];
}

function normalizeOutputList(value) {
  return Array.isArray(value)
    ? value
        .filter(item => item && (item.id || item.label))
        .map(item => {
          const attribution = getPictogramAttribution(item);
          const normalized = {
            ...item,
            id: String(item.id || '').trim(),
            label: String(item.label || '').trim()
          };

          if (attribution) normalized.attribution = attribution;
          else delete normalized.attribution;
          return normalized;
        })
        .filter(item => item.id || item.label)
    : [];
}

function normalizeReceiverSequence(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const originalToken = String(item.originalToken || '').trim();
      const label = String(item.label || originalToken).trim();
      const requestedMatchType = String(item.matchType || '').trim();
      const matchType = normalizeReceiverMatchType(requestedMatchType);
      const rawConfidence = Number(item.confidence);
      const confidence = Number.isFinite(rawConfidence)
        ? Math.max(0, Math.min(1, rawConfidence))
        : getReceiverMatchConfidence(matchType);
      const attribution = getPictogramAttribution(item);

      return {
        pictogramId: item.pictogramId ? String(item.pictogramId).trim() : null,
        label,
        source: String(item.source || '').trim(),
        boardId: String(item.boardId || '').trim(),
        matchType,
        confidence,
        originalToken,
        ...(attribution ? { attribution } : {})
      };
    })
    .filter(item => item.originalToken || item.label);
}

function preserveContractVersion(target, entry) {
  if (
    Number.isInteger(entry && entry.contractVersion) &&
    entry.contractVersion > 0
  ) {
    target.contractVersion = entry.contractVersion;
  }

  return target;
}

function normalizeSavedPhraseEntry(entry) {
  const sentence = String((entry && entry.sentence) || '').trim();
  if (!sentence) {
    return null;
  }

  const output = normalizeOutputList(entry.output);
  const createdAt = normalizeTimestamp(entry.createdAt);
  const id =
    String(entry.id || '').trim() ||
    createStableRecordId('phrase', [sentence, createdAt]);

  const normalized = preserveContractVersion(
    {
      id,
      sentence,
      output,
      usageCount: normalizeUsageCount(entry.usageCount),
      createdAt,
      lastUsedAt: normalizeTimestamp(entry.lastUsedAt, createdAt),
      updatedAt: normalizeTimestamp(entry.updatedAt, createdAt)
    },
    entry
  );

  const serverVersion = Number(entry.serverVersion);
  if (Number.isInteger(serverVersion) && serverVersion > 0) {
    normalized.serverVersion = serverVersion;
  }

  const baseVersion = Number(entry.baseVersion);
  if (Number.isInteger(baseVersion) && baseVersion >= 0) {
    normalized.baseVersion = baseVersion;
  }

  if (entry.conflicted === true) {
    normalized.conflicted = true;
  }

  return normalized;
}

function normalizeHistoryEntry(entry) {
  if (!entry || !entry.direction) {
    return null;
  }

  const labels = normalizeLabelList(entry.labels);
  const output = normalizeOutputList(entry.output);
  const pictogramSequence = normalizeReceiverSequence(entry.pictogramSequence);
  const candidateSentences = normalizeLabelList(entry.candidateSentences);
  const candidates = normalizeExpressionCandidates(
    entry.candidates,
    candidateSentences
  );
  const sentence = entry.sentence ? String(entry.sentence).trim() : '';
  const inputText = entry.inputText ? String(entry.inputText).trim() : '';

  if (!labels.length && !sentence && !inputText) {
    return null;
  }

  const createdAt = normalizeTimestamp(entry.createdAt);
  const normalized = {
    direction: String(entry.direction),
    sentence,
    inputText,
    labels,
    createdAt,
    isFavorite: Boolean(entry.isFavorite)
  };
  normalized.id =
    String(entry.id || '').trim() ||
    createStableRecordId('history', [
      normalized.direction,
      entry.sessionId,
      sentence,
      inputText,
      labels.join('|'),
      createdAt
    ]);

  if (output.length) {
    normalized.output = output;
  }

  if (pictogramSequence.length) {
    normalized.pictogramSequence = pictogramSequence;
  }

  if (candidates.length) {
    normalized.candidateSentences = candidates.map(
      candidate => candidate.sentence
    );
    normalized.candidates = candidates;
  }

  if (entry.sessionId) {
    normalized.sessionId = String(entry.sessionId).trim();
  }

  if (entry.patientId) {
    normalized.patientId = String(entry.patientId).trim();
  }

  if (entry.workspaceId) {
    normalized.workspaceId = String(entry.workspaceId).trim();
  }

  if (entry.recordStatus === 'draft' || entry.recordStatus === 'confirmed') {
    normalized.recordStatus = entry.recordStatus;
  }

  normalized.updatedAt = normalizeTimestamp(entry.updatedAt, createdAt);

  const baseVersion = Number(entry.baseVersion);
  if (Number.isInteger(baseVersion) && baseVersion >= 0) {
    normalized.baseVersion = baseVersion;
  }

  const serverVersion = Number(entry.serverVersion);
  if (Number.isInteger(serverVersion) && serverVersion > 0) {
    normalized.serverVersion = serverVersion;
  }

  if (entry.conflicted === true) {
    normalized.conflicted = true;
  }

  if (entry.localOnly === true) {
    normalized.localOnly = true;
  }

  if (entry.importSource === 'open-board-log') {
    normalized.importSource = 'open-board-log';
  }

  if (
    typeof entry.confirmedAt === 'number' &&
    Number.isFinite(entry.confirmedAt)
  ) {
    normalized.confirmedAt = entry.confirmedAt;
  }

  let patientFeedbackEvents = normalizeReceiverPatientFeedbackEvents(
    entry.patientFeedbackEvents
  );
  if (!patientFeedbackEvents.length) {
    const legacyFeedback = normalizeReceiverPatientFeedback(
      entry.patientFeedback
    );
    const legacyFeedbackAt = Number(entry.patientFeedbackAt);
    if (
      legacyFeedback &&
      Number.isFinite(legacyFeedbackAt) &&
      legacyFeedbackAt > 0
    ) {
      patientFeedbackEvents = [
        {
          type: legacyFeedback,
          createdAt: Math.floor(legacyFeedbackAt)
        }
      ];
    }
  }
  if (patientFeedbackEvents.length) {
    const latestFeedback =
      patientFeedbackEvents[patientFeedbackEvents.length - 1];
    normalized.patientFeedback = latestFeedback.type;
    normalized.patientFeedbackAt = latestFeedback.createdAt;
    normalized.patientFeedbackEvents = patientFeedbackEvents;
  }

  return preserveContractVersion(normalized, entry);
}

function isDevicePrivatePictogram(item, attribution) {
  const source = item && item.source;
  const sourceProvider =
    source && typeof source === 'object'
      ? String(source.provider || '')
          .trim()
          .toLocaleLowerCase()
      : '';
  const id = String((item && item.id) || '')
    .trim()
    .toLocaleLowerCase();
  const boardId = String((item && item.boardId) || '')
    .trim()
    .toLocaleLowerCase();

  return Boolean(
    (attribution &&
      attribution.provider === DEVICE_PRIVATE_PICTOGRAM_PROVIDER) ||
      source === 'device-private' ||
      source === 'user' ||
      sourceProvider === DEVICE_PRIVATE_PICTOGRAM_PROVIDER ||
      item.scope === 'device-private' ||
      id.startsWith('device_private_') ||
      boardId === 'device-private-pictograms'
  );
}

function isDeviceLocalImageReference(value) {
  const image = String(value || '').trim();
  return (
    /^(?:blob|data|file|local|wxfile):/i.test(image) ||
    /^https?:\/\/(?:tmp|usr)\//i.test(image) ||
    /^[a-z]:[\\/]/i.test(image)
  );
}

function sanitizeCloudOutputList(value) {
  return normalizeOutputList(value).map(item => {
    const attribution = getPictogramAttribution(item);
    const publicAttribution = normalizePublicPictogramAttribution(attribution);

    if (isDevicePrivatePictogram(item, attribution)) {
      return { label: item.label };
    }

    const normalized = { ...item };
    delete normalized.tile;
    delete normalized.pictogramAttribution;
    if (isDeviceLocalImageReference(normalized.image)) {
      delete normalized.image;
    }
    if (normalized.source && typeof normalized.source === 'object') {
      delete normalized.source;
    }
    if (publicAttribution) normalized.attribution = publicAttribution;
    else delete normalized.attribution;
    return normalized;
  });
}

function sanitizeCloudReceiverSequence(value) {
  return normalizeReceiverSequence(value).map(item => {
    const attribution = getPictogramAttribution(item);
    const publicAttribution = normalizePublicPictogramAttribution(attribution);
    const isDevicePrivate = isDevicePrivatePictogram(item, attribution);
    const pictogramId = String(item.pictogramId || '').trim();

    return {
      ...(pictogramId && !isDevicePrivate ? { pictogramId } : {}),
      label: item.label,
      source: isDevicePrivate ? 'user' : item.source,
      matchType: item.matchType,
      confidence: item.confidence,
      originalToken: item.originalToken,
      ...(publicAttribution ? { attribution: publicAttribution } : {})
    };
  });
}

function sanitizeCommunicationCloudEntry(entry) {
  const normalized = { ...entry };
  if (Array.isArray(entry.output)) {
    normalized.output = sanitizeCloudOutputList(entry.output);
  }
  if (Array.isArray(entry.pictogramSequence)) {
    normalized.pictogramSequence = sanitizeCloudReceiverSequence(
      entry.pictogramSequence
    );
  }
  return normalized;
}

function normalizeReceiverCorrectionRevision(value) {
  if (!value || typeof value !== 'object') return null;

  return {
    labels: normalizeLabelList(value.labels),
    output: normalizeOutputList(value.output),
    pictogramSequence: normalizeReceiverSequence(value.pictogramSequence)
  };
}

function normalizeReceiverCorrection(entry) {
  if (!entry || !entry.id || !entry.expressionId || !entry.action) {
    return null;
  }

  const context = String(entry.context || '').trim();
  const normalized = {
    id: String(entry.id).trim(),
    expressionId: String(entry.expressionId).trim(),
    sessionId: String(entry.sessionId || '').trim(),
    patientId: String(entry.patientId || '').trim(),
    workspaceId: String(entry.workspaceId || '').trim(),
    userId: entry.userId ? String(entry.userId).trim() : null,
    action: String(entry.action).trim(),
    ...(context === 'live_review' || context === 'caregiver_history_review'
      ? { context }
      : {}),
    originalToken: String(entry.originalToken || '').trim(),
    normalizedToken: String(entry.normalizedToken || '').trim(),
    sequenceIndexBefore: Number.isInteger(entry.sequenceIndexBefore)
      ? entry.sequenceIndexBefore
      : null,
    sequenceIndexAfter: Number.isInteger(entry.sequenceIndexAfter)
      ? entry.sequenceIndexAfter
      : null,
    pictogramIdBefore: entry.pictogramIdBefore
      ? String(entry.pictogramIdBefore).trim()
      : null,
    pictogramIdAfter: entry.pictogramIdAfter
      ? String(entry.pictogramIdAfter).trim()
      : null,
    pictogramIdsBefore: normalizePictogramIdList(entry.pictogramIdsBefore),
    pictogramIdsAfter: normalizePictogramIdList(entry.pictogramIdsAfter),
    ...(entry.revisionBefore
      ? {
          revisionBefore: normalizeReceiverCorrectionRevision(
            entry.revisionBefore
          )
        }
      : {}),
    ...(entry.revisionAfter
      ? {
          revisionAfter: normalizeReceiverCorrectionRevision(
            entry.revisionAfter
          )
        }
      : {}),
    isUsedForLearning: Boolean(entry.isUsedForLearning),
    createdAt: normalizeTimestamp(entry.createdAt)
  };

  return normalized.id && normalized.expressionId && normalized.action
    ? normalized
    : null;
}

function normalizeMissingTokenRecord(entry) {
  const normalizedToken = normalizeMissingTokenText(
    entry && entry.normalizedToken
  );
  const status = String((entry && entry.status) || '').trim();

  if (!entry || !entry.id || !normalizedToken) {
    return null;
  }
  const suggestedPictograms = getMissingTokenSuggestions(entry);

  return {
    id: String(entry.id).trim(),
    normalizedToken,
    status: Object.values(MISSING_TOKEN_STATUSES).includes(status)
      ? status
      : MISSING_TOKEN_STATUSES.new,
    occurrenceCount:
      Number.isInteger(entry.occurrenceCount) && entry.occurrenceCount > 0
        ? entry.occurrenceCount
        : 1,
    scenes: normalizeLabelList(entry.scenes).slice(0, 20),
    rawTextSamples: normalizeLabelList(entry.rawTextSamples).slice(
      0,
      MAX_MISSING_TOKEN_SAMPLES
    ),
    suggestedPictogramId: suggestedPictograms[0]
      ? suggestedPictograms[0].id
      : entry.suggestedPictogramId
      ? String(entry.suggestedPictogramId).trim()
      : null,
    suggestedPictogram: suggestedPictograms[0] || null,
    suggestedPictograms,
    source: entry.source ? String(entry.source).trim() : null,
    resolvedPictogramId: entry.resolvedPictogramId
      ? String(entry.resolvedPictogramId).trim()
      : null,
    resolvedPictogram: normalizeRuntimePictogram(entry.resolvedPictogram),
    reviewedByCaregiver: Boolean(entry.reviewedByCaregiver),
    patientId: String(entry.patientId || '').trim(),
    workspaceId: String(entry.workspaceId || '').trim(),
    createdAt: normalizeTimestamp(entry.createdAt),
    updatedAt: normalizeTimestamp(entry.updatedAt)
  };
}

function dedupeBy(list, getKey) {
  const seen = new Set();

  return list.filter(item => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function sortByCreatedAtDesc(list) {
  return list.sort((left, right) => right.createdAt - left.createdAt);
}

function sortByUpdatedAtDesc(list) {
  return list.sort((left, right) => right.updatedAt - left.updatedAt);
}

export function normalizeCommunicationSavedPhrases(value) {
  return sortByCreatedAtDesc(
    dedupeBy(
      (Array.isArray(value) ? value : [])
        .map(normalizeSavedPhraseEntry)
        .filter(Boolean),
      item => item.sentence
    )
  ).slice(0, MAX_COMMUNICATION_ITEMS);
}

export function normalizeCommunicationHistory(value) {
  return sortByCreatedAtDesc(
    dedupeBy(
      (Array.isArray(value) ? value : [])
        .map(normalizeHistoryEntry)
        .filter(Boolean),
      item => item.id
    )
  ).slice(0, MAX_COMMUNICATION_ITEMS);
}

export function normalizeCommunicationReceiverRecords(value) {
  return sortByCreatedAtDesc(
    dedupeBy(
      (Array.isArray(value) ? value : [])
        .map(normalizeHistoryEntry)
        .filter(
          item =>
            item &&
            item.direction === 'receive' &&
            item.id &&
            (item.recordStatus === 'draft' || item.recordStatus === 'confirmed')
        ),
      item => item.id
    )
  ).slice(0, MAX_COMMUNICATION_ITEMS);
}

export function normalizeCommunicationReceiverCorrections(value) {
  return sortByCreatedAtDesc(
    dedupeBy(
      (Array.isArray(value) ? value : [])
        .map(normalizeReceiverCorrection)
        .filter(Boolean),
      item => item.id
    )
  ).slice(0, MAX_COMMUNICATION_ITEMS);
}

export function normalizeCommunicationMissingTokens(value) {
  return dedupeBy(
    sortByUpdatedAtDesc(
      (Array.isArray(value) ? value : [])
        .map(normalizeMissingTokenRecord)
        .filter(Boolean)
    ),
    item => item.normalizedToken
  );
}

export function buildCommunicationSupportSettings(savedPhrases, history) {
  return {
    savedPhrases: normalizeCommunicationSavedPhrases(savedPhrases),
    history: normalizeCommunicationHistory(history)
  };
}

function isDedicatedReceiverSyncRecord(entry) {
  return (
    entry &&
    entry.direction === 'receive' &&
    entry.recordStatus === 'confirmed' &&
    entry.id &&
    entry.sessionId &&
    entry.patientId &&
    entry.workspaceId &&
    entry.inputText
  );
}

export function buildCommunicationSupportCloudSettings(savedPhrases, history) {
  const normalized = buildCommunicationSupportSettings(savedPhrases, history);

  return {
    savedPhrases: normalized.savedPhrases.map(sanitizeCommunicationCloudEntry),
    history: normalized.history
      .filter(
        entry =>
          entry.localOnly !== true && !isDedicatedReceiverSyncRecord(entry)
      )
      .map(sanitizeCommunicationCloudEntry)
  };
}

export function normalizeCommunicationSupportSettings(value) {
  const normalized = value || {};
  return buildCommunicationSupportSettings(
    normalized.savedPhrases,
    normalized.history
  );
}

function getCommunicationMergeTimestamp(entry) {
  return normalizeTimestamp(
    entry && entry.updatedAt,
    normalizeTimestamp(entry && entry.createdAt, 0)
  );
}

function mergeNewestCommunicationEntries(localItems, remoteItems, getKey) {
  const byKey = new Map();
  localItems.forEach(item => {
    byKey.set(getKey(item), item);
  });
  remoteItems.forEach(item => {
    const key = getKey(item);
    const localItem = byKey.get(key);
    if (
      !localItem ||
      getCommunicationMergeTimestamp(item) >
        getCommunicationMergeTimestamp(localItem)
    ) {
      byKey.set(key, item);
    }
  });
  return [...byKey.values()];
}

function buildCommunicationCollectionMergePreview(
  localItems,
  remoteItems,
  getKey
) {
  const localByKey = new Map(localItems.map(item => [getKey(item), item]));
  const remoteByKey = new Map(remoteItems.map(item => [getKey(item), item]));
  let localOnly = 0;
  let remoteOnly = 0;
  let conflicts = 0;
  let localWins = 0;
  let remoteWins = 0;
  let unchanged = 0;

  localByKey.forEach((localItem, key) => {
    const remoteItem = remoteByKey.get(key);
    if (!remoteItem) {
      localOnly += 1;
      return;
    }
    if (JSON.stringify(localItem) === JSON.stringify(remoteItem)) {
      unchanged += 1;
      return;
    }
    conflicts += 1;
    if (
      getCommunicationMergeTimestamp(remoteItem) >
      getCommunicationMergeTimestamp(localItem)
    ) {
      remoteWins += 1;
    } else {
      localWins += 1;
    }
  });
  remoteByKey.forEach((_remoteItem, key) => {
    if (!localByKey.has(key)) remoteOnly += 1;
  });

  return {
    localCount: localItems.length,
    remoteCount: remoteItems.length,
    resultCount: new Set([...localByKey.keys(), ...remoteByKey.keys()]).size,
    localOnly,
    remoteOnly,
    conflicts,
    localWins,
    remoteWins,
    unchanged
  };
}

export function buildCommunicationSupportMergePreview(localValue, remoteValue) {
  const local = normalizeCommunicationSupportSettings(localValue);
  const remote = normalizeCommunicationSupportSettings(remoteValue);
  const savedPhrases = buildCommunicationCollectionMergePreview(
    local.savedPhrases,
    remote.savedPhrases,
    item => item.sentence
  );
  const history = buildCommunicationCollectionMergePreview(
    local.history,
    remote.history,
    item => item.id
  );

  return {
    localCount: savedPhrases.localCount + history.localCount,
    remoteCount: savedPhrases.remoteCount + history.remoteCount,
    resultCount: savedPhrases.resultCount + history.resultCount,
    localOnly: savedPhrases.localOnly + history.localOnly,
    remoteOnly: savedPhrases.remoteOnly + history.remoteOnly,
    conflicts: savedPhrases.conflicts + history.conflicts,
    localWins: savedPhrases.localWins + history.localWins,
    remoteWins: savedPhrases.remoteWins + history.remoteWins,
    unchanged: savedPhrases.unchanged + history.unchanged,
    savedPhrases,
    history
  };
}

export function mergeCommunicationSupportSettings(localValue, remoteValue) {
  const local = normalizeCommunicationSupportSettings(localValue);
  const remote = normalizeCommunicationSupportSettings(remoteValue);

  return buildCommunicationSupportSettings(
    mergeNewestCommunicationEntries(
      local.savedPhrases,
      remote.savedPhrases,
      item => item.sentence
    ),
    mergeNewestCommunicationEntries(
      local.history,
      remote.history,
      item => item.id
    )
  );
}
