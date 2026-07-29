import {
  DEVICE_PRIVATE_RUNTIME_PICTOGRAM_PROVIDER,
  buildRuntimeCommunicationCatalogItem,
  normalizeRuntimePictogram
} from './runtimePictogram';

export const MISSING_TOKEN_STATUSES = {
  new: 'new',
  suggested: 'suggested',
  resolved: 'resolved',
  ignored: 'ignored'
};

export const MAX_MISSING_TOKEN_SAMPLES = 5;
export const MAX_MISSING_TOKEN_SUGGESTIONS = 4;

export function normalizeMissingTokenText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

export function normalizeMissingTokenSuggestions(value, legacyValue = null) {
  const seen = new Set();
  const values = [...(Array.isArray(value) ? value : []), legacyValue];

  return values
    .map(normalizeRuntimePictogram)
    .filter(pictogram => {
      if (!pictogram || seen.has(pictogram.id)) return false;
      seen.add(pictogram.id);
      return true;
    })
    .slice(0, MAX_MISSING_TOKEN_SUGGESTIONS);
}

export function getMissingTokenSuggestions(record) {
  return normalizeMissingTokenSuggestions(
    record && record.suggestedPictograms,
    record && record.suggestedPictogram
  );
}

export function countPendingMissingTokens(
  records,
  excludedRecordIds = new Set()
) {
  const excluded =
    excludedRecordIds instanceof Set
      ? excludedRecordIds
      : new Set(Array.isArray(excludedRecordIds) ? excludedRecordIds : []);

  return (Array.isArray(records) ? records : []).filter(
    record =>
      record &&
      [MISSING_TOKEN_STATUSES.new, MISSING_TOKEN_STATUSES.suggested].includes(
        record.status
      ) &&
      !excluded.has(record.id)
  ).length;
}

export function countCatalogAutoResolvedMissingTokens(records) {
  return (Array.isArray(records) ? records : []).filter(
    record =>
      record &&
      record.status === MISSING_TOKEN_STATUSES.resolved &&
      record.source === 'catalog-auto'
  ).length;
}

export function findSafeLocalMissingTokenResolutions(records, catalog) {
  const candidates = Array.isArray(catalog) ? catalog : [];

  return (Array.isArray(records) ? records : []).flatMap(record => {
    if (
      !record ||
      !record.id ||
      ![MISSING_TOKEN_STATUSES.new, MISSING_TOKEN_STATUSES.suggested].includes(
        record.status
      )
    ) {
      return [];
    }

    const normalizedToken = normalizeMissingTokenText(record.normalizedToken);
    if (!normalizedToken) return [];

    const matchingCandidates = candidates.filter(candidate => {
      const tile = candidate && candidate.tile;
      if (!tile || !tile.id || !tile.image) return false;

      const excludeTokens = (candidate.excludeTokens || []).map(
        normalizeMissingTokenText
      );
      if (excludeTokens.includes(normalizedToken)) return false;

      const labels = [
        ...(candidate.labels || []),
        candidate.displayLabel,
        tile.label,
        tile.vocalization
      ].map(normalizeMissingTokenText);
      const synonyms = (candidate.synonyms || []).map(
        normalizeMissingTokenText
      );

      return (
        labels.includes(normalizedToken) || synonyms.includes(normalizedToken)
      );
    });
    const uniqueCandidates = Array.from(
      new Map(
        matchingCandidates.map(candidate => [candidate.tile.id, candidate])
      ).values()
    );

    if (!uniqueCandidates.length) return [];

    if (uniqueCandidates.length > 1) {
      const semanticKeys = uniqueCandidates.map(candidate =>
        String(candidate.tile.labelKey || '').trim()
      );
      if (semanticKeys.some(key => !key) || new Set(semanticKeys).size !== 1) {
        return [];
      }
    }

    const candidate = uniqueCandidates[0];
    const labels = [
      ...(candidate.labels || []),
      candidate.displayLabel,
      candidate.tile.label,
      candidate.tile.vocalization
    ].map(normalizeMissingTokenText);

    return [
      {
        recordId: record.id,
        normalizedToken,
        resolvedPictogramId: candidate.tile.id,
        source: 'catalog-auto',
        reviewedByCaregiver: false,
        matchType: labels.includes(normalizedToken) ? 'exact' : 'synonym'
      }
    ];
  });
}

function appendUnique(list, value, limit) {
  const normalizedValue = String(value || '').trim();
  const current = Array.isArray(list) ? list : [];

  if (!normalizedValue) {
    return current.slice(0, limit);
  }

  return [
    normalizedValue,
    ...current.filter(item => item !== normalizedValue)
  ].slice(0, limit);
}

export function recordMissingTokenOccurrences(
  records,
  tokens,
  {
    rawText = '',
    scene = 'receiver',
    identity = {},
    now = Date.now,
    createId = prefix =>
      `${prefix}_${now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 10)}`
  } = {}
) {
  const occurrenceCounts = new Map();

  (Array.isArray(tokens) ? tokens : []).forEach(token => {
    const normalizedToken = normalizeMissingTokenText(token);
    if (normalizedToken) {
      occurrenceCounts.set(
        normalizedToken,
        (occurrenceCounts.get(normalizedToken) || 0) + 1
      );
    }
  });

  if (!occurrenceCounts.size) {
    return Array.isArray(records) ? records.slice() : [];
  }

  const current = Array.isArray(records) ? records : [];
  const timestamp = now();
  const updated = [];

  occurrenceCounts.forEach((occurrenceCount, normalizedToken) => {
    const existing = current.find(
      record => record.normalizedToken === normalizedToken
    );
    const suggestedPictograms = getMissingTokenSuggestions(existing);

    updated.push({
      ...(existing || {}),
      id: existing && existing.id ? existing.id : createId('missing_token'),
      normalizedToken,
      status:
        existing &&
        Object.values(MISSING_TOKEN_STATUSES).includes(existing.status)
          ? existing.status
          : MISSING_TOKEN_STATUSES.new,
      occurrenceCount:
        (existing && Number.isInteger(existing.occurrenceCount)
          ? existing.occurrenceCount
          : 0) + occurrenceCount,
      scenes: appendUnique(existing && existing.scenes, scene, 20),
      rawTextSamples: appendUnique(
        existing && existing.rawTextSamples,
        rawText,
        MAX_MISSING_TOKEN_SAMPLES
      ),
      suggestedPictogramId: suggestedPictograms[0]
        ? suggestedPictograms[0].id
        : existing && existing.suggestedPictogramId
        ? existing.suggestedPictogramId
        : null,
      suggestedPictogram: suggestedPictograms[0] || null,
      suggestedPictograms,
      source: existing && existing.source ? existing.source : null,
      resolvedPictogramId:
        existing && existing.resolvedPictogramId
          ? existing.resolvedPictogramId
          : null,
      resolvedPictogram: normalizeRuntimePictogram(
        existing && existing.resolvedPictogram
      ),
      reviewedByCaregiver: Boolean(existing && existing.reviewedByCaregiver),
      patientId: String(
        (existing && existing.patientId) || identity.patientId || ''
      ).trim(),
      workspaceId: String(
        (existing && existing.workspaceId) || identity.workspaceId || ''
      ).trim(),
      createdAt:
        existing && Number.isFinite(existing.createdAt)
          ? existing.createdAt
          : timestamp,
      updatedAt: timestamp
    });
  });

  const updatedTokens = new Set(updated.map(item => item.normalizedToken));
  return [
    ...updated,
    ...current.filter(item => !updatedTokens.has(item.normalizedToken))
  ];
}

export function reviewMissingTokenRecord(
  records,
  recordId,
  review,
  { now = Date.now } = {}
) {
  const current = Array.isArray(records) ? records : [];
  const target = current.find(record => record.id === recordId);
  const status = String((review && review.status) || '').trim();

  if (!target) {
    return current.slice();
  }

  if (!Object.values(MISSING_TOKEN_STATUSES).includes(status)) {
    throw new TypeError('Missing token review requires a valid status');
  }

  const suggestedPictograms = normalizeMissingTokenSuggestions(
    review && review.suggestedPictograms,
    review && review.suggestedPictogram
  );
  const suggestedPictogram = suggestedPictograms[0] || null;
  const suggestedPictogramId = String(
    (review && review.suggestedPictogramId) ||
      (suggestedPictogram && suggestedPictogram.id) ||
      ''
  ).trim();
  const requestedResolvedPictogramId = String(
    (review && review.resolvedPictogramId) || ''
  ).trim();
  const targetSuggestions = getMissingTokenSuggestions(target);
  const targetSuggestion = requestedResolvedPictogramId
    ? targetSuggestions.find(
        pictogram => pictogram.id === requestedResolvedPictogramId
      ) || null
    : targetSuggestions[0] || null;
  const resolvedPictogram =
    normalizeRuntimePictogram(review && review.resolvedPictogram) ||
    (targetSuggestion &&
    (!requestedResolvedPictogramId ||
      targetSuggestion.id === requestedResolvedPictogramId)
      ? targetSuggestion
      : null);
  const resolvedPictogramId =
    requestedResolvedPictogramId ||
    String((resolvedPictogram && resolvedPictogram.id) || '').trim();

  if (status === MISSING_TOKEN_STATUSES.resolved && !resolvedPictogramId) {
    throw new TypeError('Resolved missing token requires a pictogram id');
  }

  if (status === MISSING_TOKEN_STATUSES.suggested && !suggestedPictogramId) {
    throw new TypeError('Suggested missing token requires a pictogram id');
  }

  const updated = {
    ...target,
    status,
    updatedAt: now()
  };

  if (status === MISSING_TOKEN_STATUSES.resolved) {
    updated.resolvedPictogramId = resolvedPictogramId;
    updated.resolvedPictogram = resolvedPictogram;
    updated.suggestedPictogramId = null;
    updated.suggestedPictogram = null;
    updated.suggestedPictograms = [];
    updated.source = String((review && review.source) || 'caregiver').trim();
    updated.reviewedByCaregiver =
      review && typeof review.reviewedByCaregiver === 'boolean'
        ? review.reviewedByCaregiver
        : true;
  } else if (status === MISSING_TOKEN_STATUSES.suggested) {
    updated.suggestedPictogramId = suggestedPictogramId;
    updated.suggestedPictogram = suggestedPictogram;
    updated.suggestedPictograms = suggestedPictograms;
    updated.resolvedPictogramId = null;
    updated.resolvedPictogram = null;
    updated.source = String((review && review.source) || '').trim() || null;
    updated.reviewedByCaregiver = false;
  } else {
    updated.suggestedPictogramId = null;
    updated.suggestedPictogram = null;
    updated.suggestedPictograms = [];
    updated.resolvedPictogramId = null;
    updated.resolvedPictogram = null;
    updated.source = null;
    updated.reviewedByCaregiver = status === MISSING_TOKEN_STATUSES.ignored;
  }

  return [updated, ...current.filter(record => record.id !== recordId)];
}

export function filterMissingTokenResolutionsByCorrectionMemory(
  records,
  correctionMemory
) {
  const list = Array.isArray(records) ? records : [];
  const rules =
    correctionMemory && Array.isArray(correctionMemory.rules)
      ? correctionMemory.rules
      : [];

  if (!rules.length) return list.slice();

  const rulesByToken = new Map(
    rules.map(rule => [normalizeMissingTokenText(rule && rule.token), rule])
  );

  return list.filter(record => {
    if (!record || record.status !== MISSING_TOKEN_STATUSES.resolved) {
      return true;
    }

    const rule = rulesByToken.get(
      normalizeMissingTokenText(record.normalizedToken)
    );
    const pictogramId = String(
      record.resolvedPictogramId ||
        (record.resolvedPictogram && record.resolvedPictogram.id) ||
        ''
    ).trim();

    if (!rule || !pictogramId) return true;

    const tombstone = (rule.tombstones || []).find(
      item => item && item.pictogramId === pictogramId
    );
    const isBlocked =
      Boolean(tombstone) ||
      (rule.blockedPictogramIds || []).includes(pictogramId);

    if (!isBlocked) return true;
    if (record.reviewedByCaregiver !== true) return false;

    const resolutionAt = Number(record.updatedAt);
    const tombstoneAt = Number(tombstone && tombstone.createdAt);
    return (
      Number.isFinite(resolutionAt) &&
      Number.isFinite(tombstoneAt) &&
      resolutionAt > tombstoneAt
    );
  });
}

export function applyMissingTokenResolutions(reviewItems, records, catalog) {
  const resolvedByToken = new Map(
    (Array.isArray(records) ? records : [])
      .filter(
        record =>
          record &&
          record.status === MISSING_TOKEN_STATUSES.resolved &&
          (record.resolvedPictogramId || record.resolvedPictogram)
      )
      .map(record => [record.normalizedToken, record])
  );
  const catalogByPictogramId = new Map();

  (Array.isArray(catalog) ? catalog : []).forEach(candidate => {
    if (candidate && candidate.id) {
      catalogByPictogramId.set(candidate.id, candidate);
    }
    if (candidate && candidate.tile && candidate.tile.id) {
      catalogByPictogramId.set(candidate.tile.id, candidate);
    }
  });

  return (Array.isArray(reviewItems) ? reviewItems : []).map(item => {
    if (!item || item.tile) {
      return item;
    }

    const record = resolvedByToken.get(normalizeMissingTokenText(item.token));
    if (!record) {
      return item;
    }

    const candidate =
      catalogByPictogramId.get(record.resolvedPictogramId) ||
      buildRuntimeCommunicationCatalogItem(record.resolvedPictogram);
    const runtimeProvider = String(
      record.resolvedPictogram &&
        record.resolvedPictogram.source &&
        record.resolvedPictogram.source.provider
    )
      .trim()
      .toLocaleLowerCase();
    const isDevicePrivate =
      record.source === DEVICE_PRIVATE_RUNTIME_PICTOGRAM_PROVIDER ||
      runtimeProvider === DEVICE_PRIVATE_RUNTIME_PICTOGRAM_PROVIDER;

    return candidate
      ? {
          ...item,
          tile: candidate,
          matchType:
            record.resolvedPictogram && !isDevicePrivate ? 'online' : 'manual'
        }
      : item;
  });
}
