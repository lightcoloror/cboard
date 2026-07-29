import { createCommunicationLocalDataStore } from './localDataStore';
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

const demoCommunicationStorage = createMemoryKeyValueStorage();

export function resetDemoCommunicationStorage() {
  demoCommunicationStorage.clear();
}

function createDefaultStoragePort() {
  return isDemoMode() ? demoCommunicationStorage : createBrowserStoragePort();
}

function createDefaultStore() {
  return createCommunicationLocalDataStore({
    storage: createDefaultStoragePort()
  });
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

  return {
    identity: store.loadCommunicationIdentity(),
    preferences: store.loadPersonalImagePreferences()
  };
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

export function getAnonymousAccountMergeState(accountUserId) {
  return createDefaultStore().getAnonymousAccountMergeState(accountUserId);
}

export function retireAnonymousUserIdentity(accountUserId) {
  return createDefaultStore().retireAnonymousUserIdentity(accountUserId);
}

export function overwriteCommunicationSavedPhrases(entries) {
  return createDefaultStore().overwriteCommunicationSavedPhrases(entries);
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
  const store = createDefaultStore();
  const plan = buildPrivatePictogramClearPlan({
    personalImagePreferences: store.loadAllPersonalImagePreferences(),
    missingTokens: store.loadMissingTokens(),
    now
  });
  store.overwriteAllPersonalImagePreferences(plan.personalImagePreferences);
  store.overwriteMissingTokens(plan.missingTokens);
  return plan;
}
