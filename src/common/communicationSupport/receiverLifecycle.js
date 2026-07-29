import {
  getReceiverMatchConfidence,
  normalizeReceiverMatchType
} from './receiverContract';
import { getPictogramAttribution } from './pictogramAttribution';

export const RECEIVER_RECORD_STATUS = {
  draft: 'draft',
  confirmed: 'confirmed'
};

export const RECEIVER_CORRECTION_ACTIONS = {
  replace: 'replace_pictogram',
  insert: 'insert_pictogram',
  delete: 'delete_pictogram',
  reorder: 'reorder',
  resegment: 'resegment'
};

export const RECEIVER_CORRECTION_CONTEXTS = {
  liveReview: 'live_review',
  caregiverHistoryReview: 'caregiver_history_review'
};

const VALID_CORRECTION_ACTIONS = new Set(
  Object.values(RECEIVER_CORRECTION_ACTIONS)
);

function requireReceiverEntry(entry) {
  if (!entry || entry.direction !== 'receive') {
    throw new TypeError('Receiver lifecycle requires a receive history entry');
  }

  return entry;
}

function requireDraft(draft) {
  if (!draft || draft.recordStatus !== RECEIVER_RECORD_STATUS.draft) {
    throw new TypeError('Receiver lifecycle requires an active draft');
  }

  return draft;
}

function resolveNow(now) {
  return typeof now === 'function' ? now() : Date.now();
}

function resolveId(createId, prefix) {
  if (typeof createId === 'function') {
    return String(createId(prefix));
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function getReviewItemPictogramId(item) {
  return item && item.tile ? item.tile.id || null : null;
}

function requireConfirmedRecord(record) {
  if (
    !record ||
    record.direction !== 'receive' ||
    record.recordStatus !== RECEIVER_RECORD_STATUS.confirmed
  ) {
    throw new TypeError(
      'Receiver history correction requires a confirmed receive record'
    );
  }

  return record;
}

function getReviewPictogramIds(items) {
  return (Array.isArray(items) ? items : []).map(getReviewItemPictogramId);
}

function getReviewItemLabel(item) {
  const candidate = item && item.tile;
  const tile = candidate && candidate.tile;

  return String(
    (candidate && candidate.displayLabel) ||
      (tile && (tile.label || tile.vocalization)) ||
      (item && item.token) ||
      ''
  ).trim();
}

function buildReceiverRevisionSnapshot(items) {
  const list = Array.isArray(items) ? items : [];
  const pictogramSequence = list.map(item => {
    const candidate = item && item.tile;
    const tile = candidate && candidate.tile;
    const matchType = normalizeReceiverMatchType(item && item.matchType);
    const attribution =
      getPictogramAttribution(candidate) || getPictogramAttribution(tile);

    return {
      pictogramId: candidate ? String(candidate.id || '').trim() || null : null,
      label: getReviewItemLabel(item),
      source: String((item && item.source) || '').trim(),
      boardId: String((candidate && candidate.boardId) || '').trim(),
      matchType,
      confidence: getReceiverMatchConfidence(matchType),
      originalToken: String((item && item.token) || '').trim(),
      ...(attribution ? { attribution } : {})
    };
  });
  const output = list
    .map(item => {
      const candidate = item && item.tile;
      const tile = candidate && candidate.tile;
      if (!candidate || !tile) return null;

      const image = String(tile.image || '').trim();
      const attribution =
        getPictogramAttribution(candidate) || getPictogramAttribution(tile);
      return {
        id: String(candidate.id || '').trim(),
        label: getReviewItemLabel(item),
        ...(image && !image.startsWith('data:') ? { image } : {}),
        ...(tile.vocalization
          ? { vocalization: String(tile.vocalization) }
          : {}),
        ...(tile.keyPath ? { keyPath: tile.keyPath } : {}),
        ...(tile.backgroundColor
          ? { backgroundColor: tile.backgroundColor }
          : {}),
        ...(attribution ? { attribution } : {})
      };
    })
    .filter(Boolean);

  return {
    labels: pictogramSequence
      .filter(item => item.pictogramId)
      .map(item => item.label)
      .filter(Boolean),
    output,
    pictogramSequence
  };
}

function findReviewItem(items, itemId) {
  const list = Array.isArray(items) ? items : [];
  const index = list.findIndex(item => item && item.id === itemId);

  return {
    index,
    item: index >= 0 ? list[index] : null
  };
}

export function createReceiverDraftEntry(
  entry,
  { identity = {}, sessionId, now = Date.now, createId } = {}
) {
  const historyEntry = requireReceiverEntry(entry);
  const timestamp = resolveNow(now);
  const id = resolveId(createId, 'receiver');

  return {
    ...historyEntry,
    id,
    sessionId:
      historyEntry.sessionId || sessionId || resolveId(createId, 'session'),
    patientId: String(identity.patientId || ''),
    workspaceId: String(identity.workspaceId || ''),
    recordStatus: RECEIVER_RECORD_STATUS.draft,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function updateReceiverDraftEntry(
  draft,
  entry,
  { now = Date.now } = {}
) {
  const currentDraft = requireDraft(draft);
  const historyEntry = requireReceiverEntry(entry);

  return {
    ...historyEntry,
    id: currentDraft.id,
    sessionId: currentDraft.sessionId,
    patientId: currentDraft.patientId,
    workspaceId: currentDraft.workspaceId,
    recordStatus: RECEIVER_RECORD_STATUS.draft,
    createdAt: currentDraft.createdAt,
    updatedAt: resolveNow(now)
  };
}

export function confirmReceiverDraftEntry(
  draft,
  entry,
  { now = Date.now } = {}
) {
  const updated = updateReceiverDraftEntry(draft, entry, { now });

  return {
    ...updated,
    recordStatus: RECEIVER_RECORD_STATUS.confirmed,
    confirmedAt: updated.updatedAt
  };
}

function buildReceiverCorrection(
  record,
  action,
  beforeItems,
  afterItems,
  itemId,
  {
    now = Date.now,
    createId,
    isUsedForLearning = true,
    context = RECEIVER_CORRECTION_CONTEXTS.liveReview
  } = {}
) {
  if (!VALID_CORRECTION_ACTIONS.has(action)) {
    throw new TypeError(`Unsupported receiver correction action: ${action}`);
  }

  const before = findReviewItem(beforeItems, itemId);
  const after = findReviewItem(afterItems, itemId);
  const isResegment = action === RECEIVER_CORRECTION_ACTIONS.resegment;
  const beforeTokens = (Array.isArray(beforeItems) ? beforeItems : [])
    .map(item => String((item && item.token) || '').trim())
    .filter(Boolean);
  const afterTokens = (Array.isArray(afterItems) ? afterItems : [])
    .map(item => String((item && item.token) || '').trim())
    .filter(Boolean);

  return {
    id: resolveId(createId, 'correction'),
    expressionId: record.id,
    sessionId: record.sessionId,
    patientId: record.patientId,
    workspaceId: record.workspaceId,
    userId: null,
    context,
    action,
    originalToken: isResegment
      ? beforeTokens.join(' / ')
      : before.item
      ? String(before.item.token || '')
      : '',
    normalizedToken: isResegment
      ? afterTokens.join(' / ')
      : after.item
      ? String(after.item.token || '').trim()
      : '',
    sequenceIndexBefore: before.index >= 0 ? before.index : null,
    sequenceIndexAfter: after.index >= 0 ? after.index : null,
    pictogramIdBefore: getReviewItemPictogramId(before.item),
    pictogramIdAfter: getReviewItemPictogramId(after.item),
    pictogramIdsBefore: getReviewPictogramIds(beforeItems),
    pictogramIdsAfter: getReviewPictogramIds(afterItems),
    revisionBefore: buildReceiverRevisionSnapshot(beforeItems),
    revisionAfter: buildReceiverRevisionSnapshot(afterItems),
    isUsedForLearning: Boolean(isUsedForLearning),
    createdAt: resolveNow(now)
  };
}

export function buildReceiverCorrectionFromEdit(
  draft,
  action,
  beforeItems,
  afterItems,
  itemId,
  options = {}
) {
  return buildReceiverCorrection(
    requireDraft(draft),
    action,
    beforeItems,
    afterItems,
    itemId,
    {
      ...options,
      context: RECEIVER_CORRECTION_CONTEXTS.liveReview
    }
  );
}

export function buildReceiverCorrectionFromHistoryEdit(
  record,
  action,
  beforeItems,
  afterItems,
  itemId,
  options = {}
) {
  return buildReceiverCorrection(
    requireConfirmedRecord(record),
    action,
    beforeItems,
    afterItems,
    itemId,
    {
      ...options,
      context: RECEIVER_CORRECTION_CONTEXTS.caregiverHistoryReview
    }
  );
}

export function getEffectiveReceiverHistoryEntry(record, corrections) {
  if (!record || record.direction !== 'receive' || !record.id) {
    return record;
  }

  const latest = (Array.isArray(corrections) ? corrections : [])
    .filter(
      correction =>
        correction &&
        correction.expressionId === record.id &&
        correction.context ===
          RECEIVER_CORRECTION_CONTEXTS.caregiverHistoryReview &&
        correction.revisionAfter
    )
    .sort((left, right) => right.createdAt - left.createdAt)[0];

  if (!latest) return record;

  return {
    ...record,
    labels: latest.revisionAfter.labels,
    output: latest.revisionAfter.output,
    pictogramSequence: latest.revisionAfter.pictogramSequence,
    receiverHistoryRevision: {
      correctionId: latest.id,
      createdAt: latest.createdAt
    }
  };
}
