import { createCommunicationLocalDataStore } from './localDataStore';
import { createBrowserStoragePort } from './storagePorts';
import {
  buildCommunicationSupportSettings,
  mergeCommunicationSupportSettings,
  normalizeCommunicationSupportSettings
} from './storage';

function createDefaultStore() {
  return createCommunicationLocalDataStore({
    storage: createBrowserStoragePort()
  });
}

export function buildCommunicationSettingsPayload(savedPhrases, history) {
  return buildCommunicationSupportSettings(savedPhrases, history);
}

export function mergeCommunicationSettings(localValue, remoteValue) {
  return mergeCommunicationSupportSettings(localValue, remoteValue);
}

export function normalizeCommunicationSettings(value) {
  return normalizeCommunicationSupportSettings(value);
}

export function loadCommunicationSavedPhrases() {
  return createDefaultStore().loadCommunicationSavedPhrases();
}

export function overwriteCommunicationSavedPhrases(entries) {
  createDefaultStore().overwriteCommunicationSavedPhrases(entries);
}

export function saveCommunicationPhrase(entry) {
  createDefaultStore().saveCommunicationPhrase(entry);
}

export function loadCommunicationHistory() {
  return createDefaultStore().loadCommunicationHistory();
}

export function overwriteCommunicationHistory(entries) {
  createDefaultStore().overwriteCommunicationHistory(entries);
}

export function appendCommunicationHistory(entry) {
  createDefaultStore().appendCommunicationHistory(entry);
}

export function overwriteCommunicationSettings(value) {
  return createDefaultStore().overwriteCommunicationSettings(value);
}
