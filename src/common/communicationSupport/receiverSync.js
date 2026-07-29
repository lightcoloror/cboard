import {
  normalizeCommunicationHistory,
  normalizeCommunicationReceiverRecords
} from './storage';
import { normalizeReceiverPatientFeedbackEvents } from './receiverPatientFeedback';
import {
  DEVICE_PRIVATE_PICTOGRAM_PROVIDER,
  getPictogramAttribution,
  normalizePublicPictogramAttribution
} from './pictogramAttribution';

export const MAX_RECEIVER_SYNC_RECORDS = 100;
const SYNC_SOURCES = new Set([
  'local_dict',
  'arasaac',
  'opensymbols',
  'ai',
  'user'
]);

function normalizeSyncVersion(value, allowZero = false) {
  const version = Number(value);
  return Number.isInteger(version) && (allowZero ? version >= 0 : version > 0)
    ? version
    : null;
}

function normalizeDeletedRecordIds(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(value =>
          String(
            value && typeof value === 'object' ? value.id : value || ''
          ).trim()
        )
        .filter(Boolean)
    )
  );
}

function normalizeSyncSource(value) {
  if (SYNC_SOURCES.has(value)) return value;
  if (value === 'online') return 'arasaac';
  return 'local_dict';
}

function buildSequenceItem(item) {
  const pictogramId = String((item && item.pictogramId) || '').trim();
  const localAttribution = getPictogramAttribution(item);
  const attribution = normalizePublicPictogramAttribution(localAttribution);
  const attributionProvider = String(
    (attribution && attribution.provider) || ''
  );
  const source =
    item &&
    item.source === 'online' &&
    (attributionProvider === 'arasaac' || attributionProvider === 'opensymbols')
      ? attributionProvider
      : normalizeSyncSource(item && item.source);
  const isDevicePrivate =
    source === 'user' ||
    Boolean(
      localAttribution &&
        localAttribution.provider === DEVICE_PRIVATE_PICTOGRAM_PROVIDER
    );

  return {
    ...(pictogramId && !isDevicePrivate ? { pictogramId } : {}),
    label: String((item && item.label) || '').trim(),
    source,
    matchType: String((item && item.matchType) || 'missing'),
    confidence: Number(item && item.confidence) || 0,
    originalToken: String((item && item.originalToken) || '').trim(),
    ...(attribution ? { attribution } : {})
  };
}

function buildConfirmedRecord(record, { forUpload = false } = {}) {
  const patientFeedbackEvents = normalizeReceiverPatientFeedbackEvents(
    record.patientFeedbackEvents
  );
  const latestFeedback = patientFeedbackEvents.length
    ? patientFeedbackEvents[patientFeedbackEvents.length - 1]
    : null;
  const baseVersion = normalizeSyncVersion(record.baseVersion, true);
  const serverVersion = normalizeSyncVersion(record.serverVersion);

  return {
    id: record.id,
    sessionId: record.sessionId,
    patientId: record.patientId,
    workspaceId: record.workspaceId,
    direction: 'receive',
    recordStatus: 'confirmed',
    inputText: record.inputText,
    labels: record.labels,
    pictogramSequence: (record.pictogramSequence || []).map(buildSequenceItem),
    contractVersion: record.contractVersion || 1,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    confirmedAt: record.confirmedAt || record.updatedAt,
    ...(forUpload
      ? { baseVersion: serverVersion || baseVersion || 0 }
      : {
          ...(serverVersion ? { serverVersion } : {}),
          ...(record.conflicted === true ? { conflicted: true } : {})
        }),
    ...(latestFeedback
      ? {
          patientFeedback: latestFeedback.type,
          patientFeedbackAt: latestFeedback.createdAt,
          patientFeedbackEvents
        }
      : {})
  };
}

function mergeReceiverPatientFeedback(local, remote) {
  if (!local) return remote;

  const patientFeedbackEvents = normalizeReceiverPatientFeedbackEvents([
    ...(local.patientFeedbackEvents || []),
    ...(remote.patientFeedbackEvents || [])
  ]);
  if (!patientFeedbackEvents.length) return remote;

  const latest = patientFeedbackEvents[patientFeedbackEvents.length - 1];
  return {
    ...remote,
    patientFeedback: latest.type,
    patientFeedbackAt: latest.createdAt,
    patientFeedbackEvents,
    updatedAt: Math.max(
      Number(remote.updatedAt) || 0,
      Number(local.updatedAt) || 0,
      latest.createdAt
    )
  };
}

export function buildConfirmedReceiverSyncPayload(records) {
  return normalizeCommunicationReceiverRecords(records)
    .filter(
      record =>
        record.direction === 'receive' &&
        record.recordStatus === 'confirmed' &&
        record.id &&
        record.sessionId &&
        record.patientId &&
        record.workspaceId &&
        record.inputText
    )
    .slice(0, MAX_RECEIVER_SYNC_RECORDS)
    .map(record => buildConfirmedRecord(record, { forUpload: true }));
}

export function mergeConfirmedReceiverRecords(
  localRecords,
  remoteRecords,
  deletedRecordIds = []
) {
  const byId = new Map();
  const deletedIds = new Set(normalizeDeletedRecordIds(deletedRecordIds));

  normalizeCommunicationReceiverRecords(localRecords)
    .filter(record => !deletedIds.has(record.id))
    .forEach(record => {
      byId.set(record.id, record);
    });
  normalizeCommunicationReceiverRecords(remoteRecords)
    .filter(
      record =>
        record.direction === 'receive' &&
        record.recordStatus === 'confirmed' &&
        !deletedIds.has(record.id)
    )
    .map(buildConfirmedRecord)
    .forEach(record => {
      const local = byId.get(record.id);
      const localServerVersion = normalizeSyncVersion(
        local && local.serverVersion
      );
      const remoteServerVersion = normalizeSyncVersion(record.serverVersion);
      const remoteResolvesKnownConflict = Boolean(
        local &&
          local.conflicted === true &&
          remoteServerVersion &&
          remoteServerVersion >= (localServerVersion || 0)
      );
      const remoteWins = Boolean(
        !local ||
          record.conflicted === true ||
          remoteResolvesKnownConflict ||
          (remoteServerVersion &&
            remoteServerVersion > (localServerVersion || 0)) ||
          (!remoteServerVersion && record.updatedAt >= local.updatedAt)
      );

      if (remoteWins) {
        byId.set(record.id, mergeReceiverPatientFeedback(local, record));
      }
    });

  return normalizeCommunicationReceiverRecords([...byId.values()]).slice(
    0,
    MAX_RECEIVER_SYNC_RECORDS
  );
}

export function removeDeletedReceiverHistory(history, deletedRecordIds = []) {
  const deletedIds = new Set(normalizeDeletedRecordIds(deletedRecordIds));
  return normalizeCommunicationHistory(history).filter(
    entry => !(entry.direction === 'receive' && deletedIds.has(entry.id))
  );
}
