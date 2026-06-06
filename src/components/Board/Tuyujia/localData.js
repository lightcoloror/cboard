import {
  appendCommunicationHistory,
  buildCommunicationSettingsPayload,
  loadCommunicationHistory,
  loadCommunicationSavedPhrases,
  mergeCommunicationSettings,
  normalizeCommunicationSettings,
  overwriteCommunicationHistory,
  overwriteCommunicationSavedPhrases,
  overwriteCommunicationSettings,
  saveCommunicationPhrase
} from '../../../common/communicationSupport/localData';

export function buildTuyujiaSettingsPayload(savedPhrases, history) {
  return buildCommunicationSettingsPayload(savedPhrases, history);
}

export function mergeTuyujiaSettings(localValue, remoteValue) {
  return mergeCommunicationSettings(localValue, remoteValue);
}

export function overwriteTuyujiaSettings(value) {
  return overwriteCommunicationSettings(value);
}

export function loadSavedPhrases() {
  return loadCommunicationSavedPhrases();
}

export function overwriteSavedPhrases(entries) {
  overwriteCommunicationSavedPhrases(entries);
}

export function savePhrase(entry) {
  saveCommunicationPhrase(entry);
}

export function loadHistory() {
  return loadCommunicationHistory();
}

export function overwriteHistory(entries) {
  overwriteCommunicationHistory(entries);
}

export function appendHistory(entry) {
  appendCommunicationHistory(entry);
}

export function normalizeTuyujiaSettings(value) {
  return normalizeCommunicationSettings(value);
}
