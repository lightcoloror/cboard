import { createCommunicationLocalDataStore } from './localDataStore';
import { createSavedPhrasePreparationService } from './savedPhrasePreparation';
import { createExpressionDraftService } from './expressionDraft';
import { createSavedPhraseImportService } from './savedPhraseManagement';
import { createSavedPhraseUndoService, clearSavedPhraseUndoSession } from './savedPhraseUse';
import { createBrowserStoragePort } from './storagePorts';
import { createCommunicationPreferencesStore } from './communicationPreferencesStore';
import { createPictogramOrderingStore } from './pictogramOrderingStore';
import {
  buildCommunicationSupportMergePreview,
  buildCommunicationSupportCloudSettings,
  buildCommunicationSupportSettings,
  mergeCommunicationSupportSettings,
  normalizeCommunicationSupportSettings
} from './storage';
import { buildPrivatePictogramClearPlan } from './localDeviceData';
import { createMemoryKeyValueStorage, isDemoMode } from '../../demoMode';
import { createScopedCommunicationStorage } from './scopedCommunicationStorage';
let resolveCareAccount = () => null;
export function configureCareLocalAccount(resolve) {
  resolveCareAccount = resolve;
}

const demoCommunicationStorage = createMemoryKeyValueStorage();

export function resetDemoCommunicationStorage() {
  clearSavedPhraseUndoSession();
  demoCommunicationStorage.clear();
}

function createDefaultStoragePort() {
  if (isDemoMode()) return demoCommunicationStorage;
  const storage = createBrowserStoragePort();
  if (process.env.REACT_APP_CARE_COLLABORATION !== 'true') return storage;
  return createScopedCommunicationStorage(storage, () => {
    const accountId =
      resolveCareAccount() ||
      (storage.getItem('care-offline-selection-v1') ? 'offline' : null);
    if (!accountId) return null;
    let selection = {};
    try {
      selection = JSON.parse(
        storage.getItem(
          accountId === 'offline'
            ? 'care-offline-selection-v1'
            : `care-selection-v1:${accountId}`
        ) || '{}'
      );
    } catch (_) {}
    return {
      accountId: String(accountId),
      familyId: selection.familyId,
      profileId: selection.id
    };
  });
}

function createDefaultStore() {
  return createCommunicationLocalDataStore({
    storage: createDefaultStoragePort()
  });
}

// Async searches/downloads must not write into a newly selected account/profile.
export function getCommunicationStorageScopeKey() {
  const storage = createDefaultStoragePort();
  return storage.getScopeKey ? storage.getScopeKey() : 'local';
}

export function createLocalExpressionDraft() {
  return createExpressionDraftService({ repository: createDefaultStore(), getScopeKey: getCommunicationStorageScopeKey });
}

export function createLocalSavedPhrasePreparation() {
  return createSavedPhrasePreparationService({
    repository: createDefaultStore(), getScopeKey: getCommunicationStorageScopeKey
  });
}

export function createLocalSavedPhraseImport(options = {}) {
  return createSavedPhraseImportService({ ...options, repository: createDefaultStore(), getScopeKey: getCommunicationStorageScopeKey });
}

export function createLocalSavedPhraseUndo() {
  return createSavedPhraseUndoService({
    repository: createDefaultStore(), getScopeKey: getCommunicationStorageScopeKey,
    canManage: canManageCommunicationLibrary
  });
}

export function canManageCommunicationLibrary() {
      if (process.env.REACT_APP_CARE_COLLABORATION !== 'true' || !resolveCareAccount()) return true;
      const storage = createBrowserStoragePort();
      try {
        const selection = JSON.parse(storage.getItem(`care-selection-v1:${resolveCareAccount()}`) || 'null');
        return Boolean(selection && !selection.locked && Array.isArray(selection.permissions) &&
          selection.permissions.includes('library.edit'));
      } catch (_) { return false; }
}

export function getCommunicationGalleryIdentity() {
  const identity = createDefaultStore().loadCommunicationIdentity();
  return [getCommunicationStorageScopeKey(), identity.workspaceId, identity.patientId, canManageCommunicationLibrary()];
}

function createDefaultPreferencesStore() {
  return createCommunicationPreferencesStore(createDefaultStoragePort());
}

function createDefaultPictogramOrderingStore() {
  return createPictogramOrderingStore(createDefaultStoragePort());
}

export const COMMUNICATION_PREFERENCES_CHANGED_EVENT =
  'cboard-communication-preferences-changed';

export function buildCommunicationSettingsPayload(savedPhrases, history) {
  return buildCommunicationSupportSettings(savedPhrases, history);
}

export function buildCommunicationCloudSettingsPayload(savedPhrases, history) {
  return buildCommunicationSupportCloudSettings(savedPhrases, history);
}

export function mergeCommunicationSettings(localValue, remoteValue) {
  return mergeCommunicationSupportSettings(localValue, remoteValue);
}

export function buildCommunicationMergePreview(localValue, remoteValue) {
  return buildCommunicationSupportMergePreview(localValue, remoteValue);
}

export function normalizeCommunicationSettings(value) {
  return normalizeCommunicationSupportSettings(value);
}

export function loadCommunicationPreferences() {
  return createDefaultPreferencesStore().load();
}

export function saveCommunicationPreferences(value) {
  const saved = createDefaultPreferencesStore().save(value);
  if (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function' &&
    typeof window.CustomEvent === 'function'
  ) {
    window.dispatchEvent(
      new window.CustomEvent(COMMUNICATION_PREFERENCES_CHANGED_EVENT, {
        detail: saved
      })
    );
  }
  return saved;
}

export function loadPictogramOrdering() {
  return createDefaultPictogramOrderingStore().load();
}

export function savePictogramOrdering(value) {
  return createDefaultPictogramOrderingStore().save(value);
}

export function recordPictogramUsage(boardId, tileId, now) {
  return createDefaultPictogramOrderingStore().recordUsage(
    boardId,
    tileId,
    now
  );
}

export function loadPersonalImageRuntime() {
  const store = createDefaultStore();
  const identity = store.loadCommunicationIdentity();
  try {
    return { identity, preferences: store.loadPersonalImagePreferences() };
  } catch (error) {
    // Rendering may use the original board images; mutations still use the
    // strict repository read and cannot treat unavailable data as an empty list.
    return { identity, preferences: [], error: '熟悉图片暂时无法读取，原数据已保留；修复存储后可重试保存。' };
  }
}

export function loadPersonalImagePreferences() {
  return createDefaultStore().loadPersonalImagePreferences();
}

export function loadAllPersonalImagePreferences() {
  return createDefaultStore().loadAllPersonalImagePreferences();
}

export function savePersonalImagePreference(entry) {
  return createDefaultStore().savePersonalImagePreference(entry);
}

export function overwritePersonalImagePreferences(entries) {
  return createDefaultStore().overwritePersonalImagePreferences(entries);
}

export function overwriteAllPersonalImagePreferences(entries) {
  return createDefaultStore().overwriteAllPersonalImagePreferences(entries);
}

export function removePersonalImagePreference(tileId, options) {
  return createDefaultStore().removePersonalImagePreference(tileId, options);
}

export function loadCommunicationSavedPhrases() {
  return createDefaultStore().loadCommunicationSavedPhrases();
}

export function loadCommunicationSavedPhraseTombstones() {
  return createDefaultStore().loadCommunicationSavedPhraseTombstones();
}

// Sync uses the same verified aggregate transaction as local favorites, so a
// failed write cannot acknowledge deletion while leaving an older phrase list.
export function readCommunicationFavoriteState() {
  return createDefaultStore().readFavoriteState();
}

export function commitCommunicationFavoriteState(expected, changes) {
  return createDefaultStore().commitFavoriteState(expected, changes);
}

export function getAnonymousAccountMergeState(accountUserId) {
  return createDefaultStore().getAnonymousAccountMergeState(accountUserId);
}

export function retireAnonymousUserIdentity(accountUserId) {
  return createDefaultStore().retireAnonymousUserIdentity(accountUserId);
}

export function overwriteCommunicationSavedPhrases(entries, options) {
  return createDefaultStore().overwriteCommunicationSavedPhrases(entries, options);
}

export function saveCommunicationPhrase(entry) {
  return createDefaultStore().saveCommunicationPhrase(entry);
}

export function overwriteCommunicationSavedPhraseTombstones(entries) {
  return createDefaultStore().overwriteCommunicationSavedPhraseTombstones(
    entries
  );
}

export function deleteCommunicationSavedPhrase(id, options) {
  return createDefaultStore().deleteCommunicationSavedPhrase(id, options);
}

export function clearCommunicationSavedPhrases(options) {
  return createDefaultStore().clearCommunicationSavedPhrases(options);
}

export function loadCommunicationHistory() {
  return createDefaultStore().loadCommunicationHistory();
}

export function overwriteCommunicationHistory(entries) {
  createDefaultStore().overwriteCommunicationHistory(entries);
}

export function appendCommunicationHistory(entry) {
  return createDefaultStore().appendCommunicationHistory(entry);
}

export function saveExpressionCandidateFeedbackDraft(entry) {
  return createDefaultStore().saveExpressionCandidateFeedbackDraft(entry);
}

export function removeExpressionCandidateFeedbackDraft(id) {
  return createDefaultStore().removeExpressionCandidateFeedbackDraft(id);
}

export function loadExpressionCandidateFeedbackDrafts() {
  return createDefaultStore().loadExpressionCandidateFeedbackDrafts();
}

export function overwriteExpressionCandidateFeedbackDrafts(entries) {
  return createDefaultStore().overwriteExpressionCandidateFeedbackDrafts(
    entries
  );
}

export function getActiveConversationSession() {
  return createDefaultStore().getActiveConversationSession();
}

export function resetConversationSession() {
  return createDefaultStore().resetConversationSession();
}

export function setConversationScene(scene) {
  return createDefaultStore().setConversationScene(scene);
}

export function loadConversationContext(options) {
  return createDefaultStore().loadConversationContext(options);
}

export function createReceiverDraft(entry) {
  return createDefaultStore().createReceiverDraft(entry);
}

export function loadResumableReceiverRecord(options) {
  return createDefaultStore().loadResumableReceiverRecord(options);
}

export function discardResumableReceiverRecord(recordId, options) {
  return createDefaultStore().discardResumableReceiverRecord(recordId, options);
}

export function updateReceiverDraft(draft, entry) {
  return createDefaultStore().updateReceiverDraft(draft, entry);
}

export function confirmReceiverDraft(draft, entry) {
  return createDefaultStore().confirmReceiverDraft(draft, entry);
}

export function recordReceiverPatientFeedback(recordId, feedback) {
  return createDefaultStore().recordReceiverPatientFeedback(recordId, feedback);
}

export function appendReceiverCorrection(entry) {
  return createDefaultStore().appendReceiverCorrection(entry);
}

export function loadReceiverRecords() {
  return createDefaultStore().loadReceiverRecords();
}

export function overwriteReceiverRecords(entries) {
  return createDefaultStore().overwriteReceiverRecords(entries);
}

export function loadReceiverCorrections() {
  return createDefaultStore().loadReceiverCorrections();
}

export function overwriteReceiverCorrections(entries) {
  return createDefaultStore().overwriteReceiverCorrections(entries);
}

export function loadMissingTokens() {
  return createDefaultStore().loadMissingTokens();
}

export function overwriteMissingTokens(entries) {
  return createDefaultStore().overwriteMissingTokens(entries);
}

export function recordMissingTokens(entry) {
  return createDefaultStore().recordMissingTokens(entry);
}

export function reviewMissingToken(recordId, review) {
  return createDefaultStore().reviewMissingToken(recordId, review);
}

export function overwriteCommunicationSettings(value) {
  return createDefaultStore().overwriteCommunicationSettings(value);
}

export function clearPrivatePictograms(now = Date.now()) {
  clearSavedPhraseUndoSession();
  const store = createDefaultStore();
  store.clearExpressionDrafts();
  const plan = buildPrivatePictogramClearPlan({
    personalImagePreferences: store.loadAllPersonalImagePreferences(),
    missingTokens: store.loadMissingTokens(),
    now
  });
  store.overwriteAllPersonalImagePreferences(plan.personalImagePreferences);
  store.overwriteMissingTokens(plan.missingTokens);
  return plan;
}
