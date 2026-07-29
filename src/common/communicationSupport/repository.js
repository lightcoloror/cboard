import { LEGACY_COMMUNICATION_STORAGE_KEYS } from './legacy';
import {
  DEFAULT_PERSONAL_IMAGE_PREFERENCE_LIMIT,
  deletePersonalImagePreference,
  getPersonalImagePreferencesForIdentity,
  normalizePersonalImagePreferences,
  upsertPersonalImagePreference
} from './personalImagePreferences';
import {
  normalizeCommunicationHistory,
  normalizeCommunicationMissingTokens,
  normalizeCommunicationReceiverCorrections,
  normalizeCommunicationReceiverRecords,
  normalizeCommunicationSavedPhrases,
  normalizeCommunicationSupportSettings
} from './storage';
import {
  confirmReceiverDraftEntry,
  createReceiverDraftEntry,
  updateReceiverDraftEntry
} from './receiverLifecycle';
import {
  RECEIVER_PATIENT_FEEDBACK,
  appendReceiverPatientFeedback
} from './receiverPatientFeedback';
import {
  recordMissingTokenOccurrences,
  reviewMissingTokenRecord
} from './missingTokens';
import {
  buildConversationContext,
  createConversationSession,
  normalizeConversationSession,
  resolveConversationSession,
  setConversationSessionScene,
  touchConversationSession
} from './conversationSession';
import {
  buildExpressionCandidateFeedbackDraft,
  normalizeExpressionCandidateFeedbackDraft
} from './candidateFeedback';
import {
  deferAnonymousAccountMerge,
  getAnonymousAccountMergeStatus,
  normalizeCommunicationAccountIdentity,
  retireAnonymousAccountIdentity
} from './accountIdentity';
import {
  normalizeSavedPhraseTombstone,
  normalizeSavedPhraseTombstones
} from './savedPhraseSync';

export const COMMUNICATION_STORAGE_KEYS = {
  savedPhrases: 'cboard_communication_saved_phrases',
  savedPhraseTombstones: 'cboard_communication_saved_phrase_tombstones',
  history: 'cboard_communication_history',
  receiverRecords: 'cboard_communication_receiver_records',
  receiverResumeRecord: 'cboard_communication_receiver_resume_record',
  receiverCorrections: 'cboard_communication_receiver_corrections',
  missingTokens: 'cboard_communication_missing_tokens',
  personalImagePreferences: 'cboard_communication_personal_image_preferences',
  expressionCandidateFeedbackDrafts:
    'cboard_communication_expression_candidate_feedback_drafts',
  userId: 'cboard_communication_user_id',
  patientId: 'cboard_communication_patient_id',
  workspaceId: 'cboard_communication_workspace_id',
  accountIdentity: 'cboard_communication_account_identity',
  session: 'cboard_communication_active_session',
  schema: 'cboard_communication_repository_schema'
};

export const COMMUNICATION_REPOSITORY_SCHEMA_VERSION = 7;
export const DEFAULT_COMMUNICATION_ITEM_LIMIT = 100;
export const DEFAULT_MISSING_TOKEN_LIMIT = 200;

function getReceiverDraftScopeKey(record) {
  return [
    String(record.patientId || '').trim(),
    String(record.workspaceId || '').trim(),
    String(record.sessionId || '').trim()
  ].join('::');
}

function normalizeReceiverRecordsForRepository(value) {
  const activeDraftScopes = new Set();

  return normalizeCommunicationReceiverRecords(value).filter(record => {
    if (record.recordStatus !== 'draft') return true;

    const scopeKey = getReceiverDraftScopeKey(record);
    if (activeDraftScopes.has(scopeKey)) return false;
    activeDraftScopes.add(scopeKey);
    return true;
  });
}

function normalizeExpressionCandidateFeedbackDrafts(value) {
  const seen = new Set();

  return (Array.isArray(value) ? value : [])
    .map(normalizeExpressionCandidateFeedbackDraft)
    .filter(item => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

function assertKeyValueStore(storage) {
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function'
  ) {
    throw new TypeError(
      'Communication repository requires a synchronous key-value store'
    );
  }
}

function safeParse(rawValue, fallback) {
  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    return fallback;
  }
}

function readStoredJson(storage, key) {
  const raw = storage.getItem(key);

  if (raw === null || raw === undefined || raw === '') {
    return { present: false, valid: true, value: null, raw: null };
  }

  try {
    return { present: true, valid: true, value: JSON.parse(raw), raw };
  } catch (error) {
    return { present: true, valid: false, value: null, raw };
  }
}

function isPlainRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isSafeRepositoryIdentity(value) {
  const normalized = String(value || '').trim();

  return Boolean(
    normalized &&
      normalized.length <= 200 &&
      normalized !== 'null' &&
      normalized !== 'undefined' &&
      normalized !== '[object Object]' &&
      !normalized.startsWith('{') &&
      !normalized.startsWith('[')
  );
}

export function migrateCommunicationRepositoryStorage({
  storage,
  now = Date.now,
  createId,
  maxItems = DEFAULT_COMMUNICATION_ITEM_LIMIT,
  maxMissingTokens = DEFAULT_MISSING_TOKEN_LIMIT,
  maxPersonalImagePreferences = DEFAULT_PERSONAL_IMAGE_PREFERENCE_LIMIT
} = {}) {
  assertKeyValueStore(storage);

  if (typeof now !== 'function') {
    throw new TypeError('Communication repository migration requires a clock');
  }

  const metadataState = readStoredJson(
    storage,
    COMMUNICATION_STORAGE_KEYS.schema
  );
  const metadata =
    metadataState.valid && isPlainRecord(metadataState.value)
      ? metadataState.value
      : {};
  const previousVersion = Number.isInteger(metadata.schemaVersion)
    ? metadata.schemaVersion
    : 0;

  if (previousVersion > COMMUNICATION_REPOSITORY_SCHEMA_VERSION) {
    return {
      status: 'future',
      previousVersion,
      schemaVersion: COMMUNICATION_REPOSITORY_SCHEMA_VERSION,
      repairedKeys: []
    };
  }

  const itemLimit =
    Number.isInteger(maxItems) && maxItems > 0
      ? maxItems
      : DEFAULT_COMMUNICATION_ITEM_LIMIT;
  const missingTokenLimit =
    Number.isInteger(maxMissingTokens) && maxMissingTokens > 0
      ? maxMissingTokens
      : DEFAULT_MISSING_TOKEN_LIMIT;
  const personalImagePreferenceLimit =
    Number.isInteger(maxPersonalImagePreferences) &&
    maxPersonalImagePreferences > 0
      ? maxPersonalImagePreferences
      : DEFAULT_PERSONAL_IMAGE_PREFERENCE_LIMIT;
  const repairedKeys = new Set();
  let changed = previousVersion < COMMUNICATION_REPOSITORY_SCHEMA_VERSION;
  let timestamp;
  const getTimestamp = () => {
    if (timestamp === undefined) {
      timestamp = now();
    }
    return timestamp;
  };
  const createMigrationId =
    typeof createId === 'function'
      ? createId
      : prefix =>
          `${prefix}_${getTimestamp().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 10)}`;

  if (
    metadataState.present &&
    (!metadataState.valid ||
      !isPlainRecord(metadataState.value) ||
      !Number.isInteger(metadata.schemaVersion))
  ) {
    repairedKeys.add(COMMUNICATION_STORAGE_KEYS.schema);
  }

  function synchronizeList(primaryKey, legacyKey, normalize, limit) {
    const states = [
      { key: primaryKey, ...readStoredJson(storage, primaryKey) },
      ...(legacyKey
        ? [{ key: legacyKey, ...readStoredJson(storage, legacyKey) }]
        : [])
    ];
    const source = states.flatMap(state =>
      state.valid && Array.isArray(state.value) ? state.value : []
    );
    const normalized = normalize(source).slice(0, limit);
    const serialized = JSON.stringify(normalized);

    states.forEach(state => {
      let stateIsCanonical = false;
      if (state.valid && Array.isArray(state.value)) {
        stateIsCanonical =
          JSON.stringify(normalize(state.value).slice(0, limit)) ===
          JSON.stringify(state.value);
      }

      if (state.present && !stateIsCanonical) {
        repairedKeys.add(state.key);
      }

      if (
        previousVersion < COMMUNICATION_REPOSITORY_SCHEMA_VERSION ||
        state.raw !== serialized
      ) {
        storage.setItem(state.key, serialized);
        changed = true;
        if (previousVersion === COMMUNICATION_REPOSITORY_SCHEMA_VERSION) {
          repairedKeys.add(state.key);
        }
      }
    });
  }

  synchronizeList(
    COMMUNICATION_STORAGE_KEYS.savedPhrases,
    LEGACY_COMMUNICATION_STORAGE_KEYS.savedPhrases,
    normalizeCommunicationSavedPhrases,
    itemLimit
  );
  synchronizeList(
    COMMUNICATION_STORAGE_KEYS.history,
    LEGACY_COMMUNICATION_STORAGE_KEYS.history,
    normalizeCommunicationHistory,
    itemLimit
  );
  synchronizeList(
    COMMUNICATION_STORAGE_KEYS.receiverRecords,
    null,
    normalizeReceiverRecordsForRepository,
    itemLimit
  );
  synchronizeList(
    COMMUNICATION_STORAGE_KEYS.savedPhraseTombstones,
    null,
    normalizeSavedPhraseTombstones,
    itemLimit
  );
  synchronizeList(
    COMMUNICATION_STORAGE_KEYS.receiverCorrections,
    null,
    normalizeCommunicationReceiverCorrections,
    itemLimit
  );
  synchronizeList(
    COMMUNICATION_STORAGE_KEYS.missingTokens,
    null,
    normalizeCommunicationMissingTokens,
    missingTokenLimit
  );
  synchronizeList(
    COMMUNICATION_STORAGE_KEYS.personalImagePreferences,
    null,
    normalizePersonalImagePreferences,
    personalImagePreferenceLimit
  );
  synchronizeList(
    COMMUNICATION_STORAGE_KEYS.expressionCandidateFeedbackDrafts,
    null,
    normalizeExpressionCandidateFeedbackDrafts,
    itemLimit
  );

  function ensureIdentity(key, prefix) {
    const raw = storage.getItem(key);
    let identity = String(raw || '').trim();

    if (!isSafeRepositoryIdentity(identity)) {
      if (raw !== null && raw !== undefined && raw !== '') {
        repairedKeys.add(key);
      }
      identity = String(createMigrationId(prefix) || '').trim();
      if (!isSafeRepositoryIdentity(identity)) {
        identity = `${prefix}_${getTimestamp().toString(36)}`;
      }
    }

    if (
      previousVersion < COMMUNICATION_REPOSITORY_SCHEMA_VERSION ||
      raw !== identity
    ) {
      storage.setItem(key, identity);
      changed = true;
      if (previousVersion === COMMUNICATION_REPOSITORY_SCHEMA_VERSION) {
        repairedKeys.add(key);
      }
    }

    return identity;
  }

  const userId = ensureIdentity(COMMUNICATION_STORAGE_KEYS.userId, 'user');
  ensureIdentity(COMMUNICATION_STORAGE_KEYS.patientId, 'patient');
  ensureIdentity(COMMUNICATION_STORAGE_KEYS.workspaceId, 'workspace');

  const accountIdentityState = readStoredJson(
    storage,
    COMMUNICATION_STORAGE_KEYS.accountIdentity
  );
  const accountIdentity = normalizeCommunicationAccountIdentity(
    accountIdentityState.value,
    { anonymousUserId: userId }
  );
  const serializedAccountIdentity = JSON.stringify(accountIdentity);
  if (
    accountIdentityState.present &&
    (!accountIdentityState.valid || !isPlainRecord(accountIdentityState.value))
  ) {
    repairedKeys.add(COMMUNICATION_STORAGE_KEYS.accountIdentity);
  }
  if (
    previousVersion < COMMUNICATION_REPOSITORY_SCHEMA_VERSION ||
    accountIdentityState.raw !== serializedAccountIdentity
  ) {
    storage.setItem(
      COMMUNICATION_STORAGE_KEYS.accountIdentity,
      serializedAccountIdentity
    );
    changed = true;
    if (previousVersion === COMMUNICATION_REPOSITORY_SCHEMA_VERSION) {
      repairedKeys.add(COMMUNICATION_STORAGE_KEYS.accountIdentity);
    }
  }

  const sessionState = readStoredJson(
    storage,
    COMMUNICATION_STORAGE_KEYS.session
  );
  const normalizedSession = normalizeConversationSession(sessionState.value);
  const activeSession =
    normalizedSession ||
    createConversationSession({
      now: getTimestamp,
      createId: createMigrationId
    });
  const serializedSession = JSON.stringify(activeSession);

  if (sessionState.present && !normalizedSession) {
    repairedKeys.add(COMMUNICATION_STORAGE_KEYS.session);
  }

  if (
    previousVersion < COMMUNICATION_REPOSITORY_SCHEMA_VERSION ||
    sessionState.raw !== serializedSession
  ) {
    storage.setItem(COMMUNICATION_STORAGE_KEYS.session, serializedSession);
    changed = true;
    if (
      previousVersion === COMMUNICATION_REPOSITORY_SCHEMA_VERSION &&
      sessionState.present
    ) {
      repairedKeys.add(COMMUNICATION_STORAGE_KEYS.session);
    }
  }

  if (changed || repairedKeys.size) {
    const existingRepairedKeys = Array.isArray(metadata.repairedKeys)
      ? metadata.repairedKeys.map(String)
      : [];
    const allRepairedKeys = [
      ...new Set([...existingRepairedKeys, ...repairedKeys])
    ].sort();
    const migrationTimestamp = getTimestamp();
    const nextMetadata = {
      schemaVersion: COMMUNICATION_REPOSITORY_SCHEMA_VERSION,
      migratedAt: Number.isFinite(metadata.migratedAt)
        ? metadata.migratedAt
        : migrationTimestamp
    };

    if (allRepairedKeys.length) {
      nextMetadata.repairedKeys = allRepairedKeys;
      nextMetadata.lastRepairAt = repairedKeys.size
        ? migrationTimestamp
        : metadata.lastRepairAt;
    }

    storage.setItem(
      COMMUNICATION_STORAGE_KEYS.schema,
      JSON.stringify(nextMetadata)
    );
  }

  return {
    status:
      previousVersion < COMMUNICATION_REPOSITORY_SCHEMA_VERSION
        ? 'migrated'
        : changed || repairedKeys.size
        ? 'repaired'
        : 'current',
    previousVersion,
    schemaVersion: COMMUNICATION_REPOSITORY_SCHEMA_VERSION,
    repairedKeys: [...repairedKeys].sort()
  };
}

export function createCommunicationRepository({
  storage,
  now = Date.now,
  createId,
  maxItems = DEFAULT_COMMUNICATION_ITEM_LIMIT,
  maxMissingTokens = DEFAULT_MISSING_TOKEN_LIMIT,
  maxPersonalImagePreferences = DEFAULT_PERSONAL_IMAGE_PREFERENCE_LIMIT
} = {}) {
  assertKeyValueStore(storage);

  if (typeof now !== 'function') {
    throw new TypeError('Communication repository requires a clock function');
  }

  const itemLimit =
    Number.isInteger(maxItems) && maxItems > 0
      ? maxItems
      : DEFAULT_COMMUNICATION_ITEM_LIMIT;
  const missingTokenLimit =
    Number.isInteger(maxMissingTokens) && maxMissingTokens > 0
      ? maxMissingTokens
      : DEFAULT_MISSING_TOKEN_LIMIT;
  const personalImagePreferenceLimit =
    Number.isInteger(maxPersonalImagePreferences) &&
    maxPersonalImagePreferences > 0
      ? maxPersonalImagePreferences
      : DEFAULT_PERSONAL_IMAGE_PREFERENCE_LIMIT;
  const createRepositoryId =
    typeof createId === 'function'
      ? createId
      : prefix =>
          `${prefix}_${now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 10)}`;
  const repositorySchema = migrateCommunicationRepositoryStorage({
    storage,
    now,
    createId: createRepositoryId,
    maxItems: itemLimit,
    maxMissingTokens: missingTokenLimit,
    maxPersonalImagePreferences: personalImagePreferenceLimit
  });

  function writeStorageValue(key, value) {
    if (repositorySchema.status === 'future') {
      throw new Error(
        'Communication repository data uses a newer schema version'
      );
    }

    if (storage.setItem(key, value) === false) {
      throw new Error(`Communication repository failed to write ${key}`);
    }
  }

  function readList(primaryKey, legacyKey) {
    const primaryValue = safeParse(storage.getItem(primaryKey), []);

    if (Array.isArray(primaryValue) && primaryValue.length) {
      return primaryValue;
    }

    if (!legacyKey) {
      return primaryValue;
    }

    return safeParse(storage.getItem(legacyKey), []);
  }

  function writeList(primaryKey, legacyKey, list) {
    const serialized = JSON.stringify(list.slice(0, itemLimit));
    writeStorageValue(primaryKey, serialized);

    if (legacyKey) {
      writeStorageValue(legacyKey, serialized);
    }
  }

  function readConversationSession() {
    return normalizeConversationSession(
      safeParse(storage.getItem(COMMUNICATION_STORAGE_KEYS.session), null)
    );
  }

  function writeConversationSession(session) {
    writeStorageValue(
      COMMUNICATION_STORAGE_KEYS.session,
      JSON.stringify(session)
    );
    return session;
  }

  function getActiveConversationSession() {
    const resolved = resolveConversationSession(readConversationSession(), {
      now,
      createId: createRepositoryId
    });

    if (resolved.reason !== 'active') {
      writeConversationSession(resolved.session);
    }

    return resolved.session;
  }

  function resetConversationSession() {
    return writeConversationSession(
      createConversationSession({ now, createId: createRepositoryId })
    );
  }

  function touchConversationSessionId(sessionId) {
    const activeSession = getActiveConversationSession();

    if (activeSession.id !== sessionId) {
      return activeSession;
    }

    return writeConversationSession(
      touchConversationSession(activeSession, { now })
    );
  }

  function loadCommunicationSavedPhraseTombstones() {
    return normalizeSavedPhraseTombstones(
      readList(COMMUNICATION_STORAGE_KEYS.savedPhraseTombstones, null)
    ).slice(0, itemLimit);
  }

  function loadCommunicationSavedPhrases() {
    const deletedIds = new Set(
      loadCommunicationSavedPhraseTombstones().map(item => item.id)
    );

    return normalizeCommunicationSavedPhrases(
      readList(
        COMMUNICATION_STORAGE_KEYS.savedPhrases,
        LEGACY_COMMUNICATION_STORAGE_KEYS.savedPhrases
      )
    )
      .filter(item => !deletedIds.has(item.id))
      .slice(0, itemLimit);
  }

  function overwriteCommunicationSavedPhraseTombstones(entries) {
    const tombstones = normalizeSavedPhraseTombstones(entries).slice(
      0,
      itemLimit
    );
    const deletedIds = new Set(tombstones.map(item => item.id));
    const activePhrases = normalizeCommunicationSavedPhrases(
      readList(
        COMMUNICATION_STORAGE_KEYS.savedPhrases,
        LEGACY_COMMUNICATION_STORAGE_KEYS.savedPhrases
      )
    )
      .filter(item => !deletedIds.has(item.id))
      .slice(0, itemLimit);

    writeList(
      COMMUNICATION_STORAGE_KEYS.savedPhraseTombstones,
      null,
      tombstones
    );
    writeList(
      COMMUNICATION_STORAGE_KEYS.savedPhrases,
      LEGACY_COMMUNICATION_STORAGE_KEYS.savedPhrases,
      activePhrases
    );
    return tombstones;
  }

  function overwriteCommunicationSavedPhrases(entries) {
    const deletedIds = new Set(
      loadCommunicationSavedPhraseTombstones().map(item => item.id)
    );
    const phrases = normalizeCommunicationSavedPhrases(entries)
      .filter(item => !deletedIds.has(item.id))
      .slice(0, itemLimit);

    writeList(
      COMMUNICATION_STORAGE_KEYS.savedPhrases,
      LEGACY_COMMUNICATION_STORAGE_KEYS.savedPhrases,
      phrases
    );
    return phrases;
  }

  function saveCommunicationPhrase(entry) {
    const current = loadCommunicationSavedPhrases();
    const existing = current.find(
      item => item.id === entry.id || item.sentence === entry.sentence
    );
    const timestamp = now();
    const next = {
      ...(existing || {}),
      ...entry,
      id:
        String(entry.id || (existing && existing.id) || '').trim() ||
        createRepositoryId('phrase'),
      usageCount: Number.isFinite(Number(entry.usageCount))
        ? Math.max(0, Math.floor(Number(entry.usageCount)))
        : (existing && existing.usageCount) || 0,
      createdAt: Number.isFinite(Number(entry.createdAt))
        ? Number(entry.createdAt)
        : (existing && existing.createdAt) || timestamp,
      lastUsedAt: Number.isFinite(Number(entry.lastUsedAt))
        ? Number(entry.lastUsedAt)
        : (existing && existing.lastUsedAt) || timestamp,
      updatedAt: timestamp
    };

    const phrases = overwriteCommunicationSavedPhrases([
      next,
      ...current.filter(
        item => item.id !== next.id && item.sentence !== next.sentence
      )
    ]);
    return phrases.find(item => item.id === next.id) || null;
  }

  function deleteCommunicationSavedPhrase(
    phraseId,
    { deletedBy = 'local' } = {}
  ) {
    const id = String(phraseId || '').trim();
    if (!id) return null;

    const tombstones = loadCommunicationSavedPhraseTombstones();
    const existingTombstone = tombstones.find(item => item.id === id);
    const existingPhrase = loadCommunicationSavedPhrases().find(
      item => item.id === id
    );
    if (!existingPhrase) return existingTombstone || null;

    const savedVersion = Number(existingPhrase.serverVersion);
    const baseVersion = Number(existingPhrase.baseVersion);
    const tombstone = normalizeSavedPhraseTombstone({
      id,
      deletedAt: now(),
      deletedBy,
      serverVersion:
        Number.isInteger(savedVersion) && savedVersion > 0
          ? savedVersion
          : Number.isInteger(baseVersion) && baseVersion >= 0
          ? baseVersion
          : 0,
      pending: true
    });
    const nextTombstones = overwriteCommunicationSavedPhraseTombstones([
      tombstone,
      ...tombstones
    ]);

    return nextTombstones.find(item => item.id === id) || null;
  }

  function clearCommunicationSavedPhrases({ deletedBy = 'local' } = {}) {
    const phrases = loadCommunicationSavedPhrases();
    if (!phrases.length) return [];

    const deletedAt = now();
    const createdTombstones = phrases
      .map(item => {
        const savedVersion = Number(item.serverVersion);
        const baseVersion = Number(item.baseVersion);
        return normalizeSavedPhraseTombstone({
          id: item.id,
          deletedAt,
          deletedBy,
          serverVersion:
            Number.isInteger(savedVersion) && savedVersion > 0
              ? savedVersion
              : Number.isInteger(baseVersion) && baseVersion >= 0
              ? baseVersion
              : 0,
          pending: true
        });
      })
      .filter(Boolean);
    const tombstones = overwriteCommunicationSavedPhraseTombstones([
      ...createdTombstones,
      ...loadCommunicationSavedPhraseTombstones()
    ]);
    const createdIds = new Set(createdTombstones.map(item => item.id));

    return tombstones.filter(item => createdIds.has(item.id));
  }

  function loadCommunicationHistory() {
    return normalizeCommunicationHistory(
      readList(
        COMMUNICATION_STORAGE_KEYS.history,
        LEGACY_COMMUNICATION_STORAGE_KEYS.history
      )
    ).slice(0, itemLimit);
  }

  function overwriteCommunicationHistory(entries) {
    writeList(
      COMMUNICATION_STORAGE_KEYS.history,
      LEGACY_COMMUNICATION_STORAGE_KEYS.history,
      normalizeCommunicationHistory(entries).slice(0, itemLimit)
    );
  }

  function appendCommunicationHistory(entry) {
    const current = loadCommunicationHistory();
    const providedSessionId = String(entry.sessionId || '').trim();
    const sessionId = providedSessionId || getActiveConversationSession().id;
    const timestamp = now();
    const next = {
      ...entry,
      id: String(entry.id || '').trim() || createRepositoryId('history'),
      sessionId,
      isFavorite: Boolean(entry.isFavorite),
      createdAt: timestamp,
      updatedAt: timestamp
    };

    overwriteCommunicationHistory([next, ...current]);
    touchConversationSessionId(sessionId);
    return next;
  }

  function setConversationScene(scene) {
    const next = setConversationSessionScene(
      getActiveConversationSession(),
      scene,
      { now }
    );
    return next ? writeConversationSession(next) : null;
  }

  function loadExpressionCandidateFeedbackDrafts() {
    return normalizeExpressionCandidateFeedbackDrafts(
      safeParse(
        storage.getItem(
          COMMUNICATION_STORAGE_KEYS.expressionCandidateFeedbackDrafts
        ),
        []
      )
    ).slice(0, itemLimit);
  }

  function overwriteExpressionCandidateFeedbackDrafts(entries) {
    const normalized = normalizeExpressionCandidateFeedbackDrafts(
      entries
    ).slice(0, itemLimit);
    writeStorageValue(
      COMMUNICATION_STORAGE_KEYS.expressionCandidateFeedbackDrafts,
      JSON.stringify(normalized)
    );
    return normalized;
  }

  function saveExpressionCandidateFeedbackDraft(entry) {
    const current = loadExpressionCandidateFeedbackDrafts();
    const sessionId =
      String((entry && entry.sessionId) || '').trim() ||
      getActiveConversationSession().id;
    const outputSignature = String(
      (entry && entry.outputSignature) || ''
    ).trim();
    const existing = current.find(item =>
      entry && entry.id
        ? item.id === String(entry.id).trim()
        : item.sessionId === sessionId &&
          item.outputSignature === outputSignature
    );
    const next = buildExpressionCandidateFeedbackDraft(
      {
        ...(existing || {}),
        ...(entry || {}),
        sessionId,
        outputSignature
      },
      { now, createId: createRepositoryId }
    );

    if (!next) return null;

    overwriteExpressionCandidateFeedbackDrafts([
      next,
      ...current.filter(item => item.id !== next.id)
    ]);
    touchConversationSessionId(sessionId);
    return next;
  }

  function removeExpressionCandidateFeedbackDraft(id) {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return false;
    const current = loadExpressionCandidateFeedbackDrafts();
    const next = current.filter(item => item.id !== normalizedId);
    if (next.length === current.length) return false;
    overwriteExpressionCandidateFeedbackDrafts(next);
    return true;
  }

  function loadConversationContext({ sessionId, maxTurns } = {}) {
    const activeSession = getActiveConversationSession();
    const resolvedSessionId =
      String(sessionId || '').trim() || activeSession.id;

    return buildConversationContext(loadCommunicationHistory(), {
      sessionId: resolvedSessionId,
      scene:
        resolvedSessionId === activeSession.id ? activeSession.scene : null,
      maxTurns
    });
  }

  function loadCommunicationIdentity() {
    let patientId = String(
      storage.getItem(COMMUNICATION_STORAGE_KEYS.patientId) || ''
    ).trim();
    let workspaceId = String(
      storage.getItem(COMMUNICATION_STORAGE_KEYS.workspaceId) || ''
    ).trim();

    if (!patientId) {
      patientId = String(createRepositoryId('patient'));
      writeStorageValue(COMMUNICATION_STORAGE_KEYS.patientId, patientId);
    }

    if (!workspaceId) {
      workspaceId = String(createRepositoryId('workspace'));
      writeStorageValue(COMMUNICATION_STORAGE_KEYS.workspaceId, workspaceId);
    }

    return { patientId, workspaceId };
  }

  function loadAnonymousUserIdentity() {
    return String(
      storage.getItem(COMMUNICATION_STORAGE_KEYS.userId) || ''
    ).trim();
  }

  function loadCommunicationAccountIdentity() {
    return normalizeCommunicationAccountIdentity(
      safeParse(
        storage.getItem(COMMUNICATION_STORAGE_KEYS.accountIdentity),
        null
      ),
      { anonymousUserId: loadAnonymousUserIdentity() }
    );
  }

  function writeCommunicationAccountIdentity(value) {
    const normalized = normalizeCommunicationAccountIdentity(value, {
      anonymousUserId: loadAnonymousUserIdentity()
    });
    writeStorageValue(
      COMMUNICATION_STORAGE_KEYS.accountIdentity,
      JSON.stringify(normalized)
    );
    return normalized;
  }

  function getAnonymousAccountMergeState(accountUserId) {
    return getAnonymousAccountMergeStatus(
      loadCommunicationAccountIdentity(),
      accountUserId
    );
  }

  function deferAnonymousUserAccountMerge(accountUserId) {
    const next = deferAnonymousAccountMerge(
      loadCommunicationAccountIdentity(),
      accountUserId,
      { now: now() }
    );
    writeCommunicationAccountIdentity(next);
    return getAnonymousAccountMergeState(accountUserId);
  }

  function retireAnonymousUserIdentity(accountUserId) {
    const next = retireAnonymousAccountIdentity(
      loadCommunicationAccountIdentity(),
      accountUserId,
      { now: now() }
    );
    writeCommunicationAccountIdentity(next);
    return getAnonymousAccountMergeState(accountUserId);
  }

  function loadAllPersonalImagePreferences() {
    return normalizePersonalImagePreferences(
      safeParse(
        storage.getItem(COMMUNICATION_STORAGE_KEYS.personalImagePreferences),
        []
      )
    ).slice(0, personalImagePreferenceLimit);
  }

  function overwriteAllPersonalImagePreferences(entries) {
    return writePersonalImagePreferences(entries);
  }

  function writePersonalImagePreferences(entries) {
    const normalized = normalizePersonalImagePreferences(entries).slice(
      0,
      personalImagePreferenceLimit
    );
    writeStorageValue(
      COMMUNICATION_STORAGE_KEYS.personalImagePreferences,
      JSON.stringify(normalized)
    );
    return normalized;
  }

  function loadPersonalImagePreferences() {
    return getPersonalImagePreferencesForIdentity(
      loadAllPersonalImagePreferences(),
      loadCommunicationIdentity()
    );
  }

  function savePersonalImagePreference(entry) {
    const identity = loadCommunicationIdentity();
    const next = upsertPersonalImagePreference(
      loadAllPersonalImagePreferences(),
      entry,
      { identity, now }
    );
    writePersonalImagePreferences(next);

    return (
      getPersonalImagePreferencesForIdentity(next, identity).find(
        preference =>
          preference.tileId === String(entry.tileId || '').trim() &&
          preference.boardId === String(entry.boardId || '').trim()
      ) || null
    );
  }

  function overwritePersonalImagePreferences(entries) {
    const identity = loadCommunicationIdentity();
    const current = loadAllPersonalImagePreferences();
    const otherIdentities = current.filter(
      preference =>
        preference.patientId !== identity.patientId ||
        preference.workspaceId !== identity.workspaceId
    );
    const currentIdentity = normalizePersonalImagePreferences(entries).map(
      preference => ({
        ...preference,
        patientId: identity.patientId,
        workspaceId: identity.workspaceId
      })
    );
    const next = writePersonalImagePreferences([
      ...currentIdentity,
      ...otherIdentities
    ]);
    return getPersonalImagePreferencesForIdentity(next, identity);
  }

  function removePersonalImagePreference(tileId, options = {}) {
    const current = loadAllPersonalImagePreferences();
    const next = deletePersonalImagePreference(current, tileId, {
      boardId: options.boardId,
      identity: loadCommunicationIdentity()
    });
    const changed = next.length !== current.length;

    if (changed) {
      writePersonalImagePreferences(next);
    }

    return changed;
  }

  function loadReceiverRecords() {
    return normalizeReceiverRecordsForRepository(
      safeParse(storage.getItem(COMMUNICATION_STORAGE_KEYS.receiverRecords), [])
    ).slice(0, itemLimit);
  }

  function overwriteReceiverRecords(entries) {
    writeStorageValue(
      COMMUNICATION_STORAGE_KEYS.receiverRecords,
      JSON.stringify(
        normalizeReceiverRecordsForRepository(entries).slice(0, itemLimit)
      )
    );
  }

  function upsertReceiverRecord(entry) {
    const current = loadReceiverRecords().filter(item => item.id !== entry.id);
    overwriteReceiverRecords([entry, ...current]);
    return loadReceiverRecords().find(item => item.id === entry.id) || entry;
  }

  function createReceiverDraft(entry) {
    const identity = loadCommunicationIdentity();
    const sessionId =
      String(entry.sessionId || '').trim() || getActiveConversationSession().id;
    const draft = createReceiverDraftEntry(entry, {
      sessionId,
      identity,
      now,
      createId: createRepositoryId
    });
    const current = loadReceiverRecords().filter(
      record =>
        !(
          record.recordStatus === 'draft' &&
          record.patientId === draft.patientId &&
          record.workspaceId === draft.workspaceId &&
          record.sessionId === draft.sessionId
        )
    );
    overwriteReceiverRecords([draft, ...current]);
    writeStorageValue(COMMUNICATION_STORAGE_KEYS.receiverResumeRecord, '');
    touchConversationSessionId(draft.sessionId);
    return (
      loadReceiverRecords().find(record => record.id === draft.id) || draft
    );
  }

  function loadResumableReceiverRecord(options = {}) {
    const identity = loadCommunicationIdentity();
    const sessionId =
      String(options.sessionId || '').trim() ||
      getActiveConversationSession().id;
    const records = loadReceiverRecords().filter(
      record =>
        record.patientId === identity.patientId &&
        record.workspaceId === identity.workspaceId &&
        record.sessionId === sessionId
    );
    const activeDraft = records.find(record => record.recordStatus === 'draft');
    if (activeDraft) return activeDraft;

    const resumeRecordId = String(
      storage.getItem(COMMUNICATION_STORAGE_KEYS.receiverResumeRecord) || ''
    ).trim();
    if (!resumeRecordId) return null;

    return (
      records.find(
        record =>
          record.id === resumeRecordId &&
          record.recordStatus === 'confirmed' &&
          record.patientFeedback === RECEIVER_PATIENT_FEEDBACK.notUnderstood
      ) || null
    );
  }

  function discardResumableReceiverRecord(recordId, options = {}) {
    const normalizedRecordId = String(recordId || '').trim();
    if (!normalizedRecordId) return false;

    const identity = loadCommunicationIdentity();
    const sessionId =
      String(options.sessionId || '').trim() ||
      getActiveConversationSession().id;
    const records = loadReceiverRecords();
    const target = records.find(
      record =>
        record.id === normalizedRecordId &&
        record.patientId === identity.patientId &&
        record.workspaceId === identity.workspaceId &&
        record.sessionId === sessionId
    );
    if (!target) return false;

    let changed = false;
    if (target.recordStatus === 'draft') {
      overwriteReceiverRecords(
        records.filter(record => record.id !== normalizedRecordId)
      );
      changed = true;
    }

    const resumeRecordId = String(
      storage.getItem(COMMUNICATION_STORAGE_KEYS.receiverResumeRecord) || ''
    ).trim();
    if (resumeRecordId === normalizedRecordId) {
      writeStorageValue(COMMUNICATION_STORAGE_KEYS.receiverResumeRecord, '');
      changed = true;
    }

    return changed;
  }

  function updateReceiverDraft(draft, entry) {
    const updated = upsertReceiverRecord(
      updateReceiverDraftEntry(draft, entry, { now })
    );
    touchConversationSessionId(updated.sessionId);
    return updated;
  }

  function confirmReceiverDraft(draft, entry) {
    const confirmed = upsertReceiverRecord(
      confirmReceiverDraftEntry(draft, entry, { now })
    );
    appendCommunicationHistory(confirmed);
    touchConversationSessionId(confirmed.sessionId);
    return confirmed;
  }

  function recordReceiverPatientFeedback(recordId, feedback) {
    const normalizedRecordId = String(recordId || '').trim();
    const receiverRecords = loadReceiverRecords();
    const target = receiverRecords.find(
      record =>
        record.id === normalizedRecordId &&
        record.direction === 'receive' &&
        record.recordStatus === 'confirmed'
    );
    if (!target) return null;

    const updated = appendReceiverPatientFeedback(target, feedback, {
      now
    });
    overwriteReceiverRecords([
      updated,
      ...receiverRecords.filter(record => record.id !== updated.id)
    ]);

    const history = loadCommunicationHistory();
    const hasHistoryEntry = history.some(entry => entry.id === updated.id);
    overwriteCommunicationHistory(
      hasHistoryEntry
        ? history.map(entry => (entry.id === updated.id ? updated : entry))
        : [updated, ...history]
    );
    const resumeRecordId = String(
      storage.getItem(COMMUNICATION_STORAGE_KEYS.receiverResumeRecord) || ''
    ).trim();
    if (feedback === RECEIVER_PATIENT_FEEDBACK.notUnderstood) {
      writeStorageValue(
        COMMUNICATION_STORAGE_KEYS.receiverResumeRecord,
        updated.id
      );
    } else if (
      feedback === RECEIVER_PATIENT_FEEDBACK.understood &&
      resumeRecordId === updated.id
    ) {
      writeStorageValue(COMMUNICATION_STORAGE_KEYS.receiverResumeRecord, '');
    }
    touchConversationSessionId(updated.sessionId);

    return (
      loadReceiverRecords().find(record => record.id === updated.id) || updated
    );
  }

  function loadReceiverCorrections() {
    return normalizeCommunicationReceiverCorrections(
      safeParse(
        storage.getItem(COMMUNICATION_STORAGE_KEYS.receiverCorrections),
        []
      )
    ).slice(0, itemLimit);
  }

  function overwriteReceiverCorrections(entries) {
    const normalized = normalizeCommunicationReceiverCorrections(entries).slice(
      0,
      itemLimit
    );
    writeStorageValue(
      COMMUNICATION_STORAGE_KEYS.receiverCorrections,
      JSON.stringify(normalized)
    );
    return normalized;
  }

  function appendReceiverCorrection(entry) {
    const current = loadReceiverCorrections().filter(
      item => item.id !== entry.id
    );
    const next = overwriteReceiverCorrections([entry, ...current]);
    return next[0] || null;
  }

  function loadMissingTokens() {
    return normalizeCommunicationMissingTokens(
      safeParse(storage.getItem(COMMUNICATION_STORAGE_KEYS.missingTokens), [])
    ).slice(0, missingTokenLimit);
  }

  function overwriteMissingTokens(entries) {
    const normalized = normalizeCommunicationMissingTokens(entries).slice(
      0,
      missingTokenLimit
    );
    writeStorageValue(
      COMMUNICATION_STORAGE_KEYS.missingTokens,
      JSON.stringify(normalized)
    );
    return normalized;
  }

  function recordMissingTokens({ tokens, rawText, scene = 'receiver' } = {}) {
    const next = recordMissingTokenOccurrences(loadMissingTokens(), tokens, {
      rawText,
      scene,
      identity: loadCommunicationIdentity(),
      now,
      createId: createRepositoryId
    });

    return overwriteMissingTokens(next);
  }

  function reviewMissingToken(recordId, review) {
    const next = reviewMissingTokenRecord(
      loadMissingTokens(),
      recordId,
      review,
      { now }
    );
    const target = next.find(record => record.id === recordId) || null;

    overwriteMissingTokens(next);
    return target;
  }
  function overwriteCommunicationSettings(value) {
    const normalized = normalizeCommunicationSupportSettings(value);
    overwriteCommunicationSavedPhrases(normalized.savedPhrases);
    overwriteCommunicationHistory(normalized.history);
    return normalized;
  }

  return {
    appendCommunicationHistory,
    appendReceiverCorrection,
    clearCommunicationSavedPhrases,
    confirmReceiverDraft,
    createReceiverDraft,
    discardResumableReceiverRecord,
    deferAnonymousUserAccountMerge,
    deleteCommunicationSavedPhrase,
    getActiveConversationSession,
    getAnonymousAccountMergeState,
    loadExpressionCandidateFeedbackDrafts,
    loadAllPersonalImagePreferences,
    loadAnonymousUserIdentity,
    loadCommunicationAccountIdentity,
    loadCommunicationIdentity,
    loadCommunicationHistory,
    loadCommunicationSavedPhraseTombstones,
    loadCommunicationSavedPhrases,
    loadConversationContext,
    loadMissingTokens,
    loadPersonalImagePreferences,
    loadReceiverCorrections,
    loadReceiverRecords,
    loadResumableReceiverRecord,
    overwriteCommunicationHistory,
    overwriteCommunicationSavedPhraseTombstones,
    overwriteExpressionCandidateFeedbackDrafts,
    overwriteAllPersonalImagePreferences,
    overwriteMissingTokens,
    overwritePersonalImagePreferences,
    overwriteReceiverCorrections,
    overwriteReceiverRecords,
    overwriteCommunicationSavedPhrases,
    overwriteCommunicationSettings,
    recordMissingTokens,
    recordReceiverPatientFeedback,
    retireAnonymousUserIdentity,
    resetConversationSession,
    setConversationScene,
    removeExpressionCandidateFeedbackDraft,
    removePersonalImagePreference,
    saveCommunicationPhrase,
    saveExpressionCandidateFeedbackDraft,
    savePersonalImagePreference,
    reviewMissingToken,
    updateReceiverDraft
  };
}
