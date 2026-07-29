const HEALTH_STATUSES = Object.freeze(['ok', 'degraded']);
const DATABASE_STATUSES = Object.freeze(['connected', 'disconnected']);
const INDEX_STATUSES = Object.freeze([
  'unknown',
  'building',
  'ready',
  'failed'
]);
const PRIVATE_LIBRARY_STATUSES = Object.freeze(['configured', 'unconfigured']);

function normalizeStatus(value, allowed, fallback = 'unknown') {
  const normalized = String(value || '')
    .trim()
    .toLocaleLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

export function normalizeCommunicationServiceReadiness(value) {
  const input = value && typeof value === 'object' ? value : {};
  const status = normalizeStatus(input.status, HEALTH_STATUSES);
  const database = normalizeStatus(input.database, DATABASE_STATUSES);
  const communicationIndexes = normalizeStatus(
    input.communicationIndexes,
    INDEX_STATUSES
  );
  const privatePictureLibrary = normalizeStatus(
    input.privatePictureLibrary,
    PRIVATE_LIBRARY_STATUSES
  );
  const recognized =
    status !== 'unknown' ||
    database !== 'unknown' ||
    communicationIndexes !== 'unknown' ||
    privatePictureLibrary !== 'unknown';
  const ready =
    status === 'ok' &&
    database === 'connected' &&
    communicationIndexes === 'ready';

  return {
    recognized,
    ready,
    status,
    database,
    communicationIndexes,
    privatePictureLibrary
  };
}
