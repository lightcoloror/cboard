import {
  buildCommunicationSupportSettings,
  mergeCommunicationSupportSettings,
  normalizeCommunicationHistory,
  normalizeCommunicationSavedPhrases,
  normalizeCommunicationSupportSettings
} from './storage';
import { LEGACY_COMMUNICATION_STORAGE_KEYS } from './legacy';

const COMMUNICATION_SAVED_PHRASES_KEY = 'cboard_communication_saved_phrases';
const COMMUNICATION_HISTORY_KEY = 'cboard_communication_history';
const LEGACY_SAVED_PHRASES_KEY = LEGACY_COMMUNICATION_STORAGE_KEYS.savedPhrases;
const LEGACY_HISTORY_KEY = LEGACY_COMMUNICATION_STORAGE_KEYS.history;
const MAX_ITEMS = 20;

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

function readList(primaryKey, legacyKey) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }

  const primaryValue = safeParse(window.localStorage.getItem(primaryKey), []);

  if (primaryValue.length || !legacyKey) {
    return primaryValue;
  }

  return safeParse(window.localStorage.getItem(legacyKey), []);
}

function writeList(primaryKey, legacyKey, list) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  const serialized = JSON.stringify(list.slice(0, MAX_ITEMS));
  window.localStorage.setItem(primaryKey, serialized);

  if (legacyKey) {
    window.localStorage.setItem(legacyKey, serialized);
  }
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
  return normalizeCommunicationSavedPhrases(
    readList(COMMUNICATION_SAVED_PHRASES_KEY, LEGACY_SAVED_PHRASES_KEY)
  ).slice(0, MAX_ITEMS);
}

export function overwriteCommunicationSavedPhrases(entries) {
  writeList(
    COMMUNICATION_SAVED_PHRASES_KEY,
    LEGACY_SAVED_PHRASES_KEY,
    normalizeCommunicationSavedPhrases(entries).slice(0, MAX_ITEMS)
  );
}

export function saveCommunicationPhrase(entry) {
  const current = loadCommunicationSavedPhrases().filter(
    item => item.sentence !== entry.sentence
  );

  overwriteCommunicationSavedPhrases([
    { ...entry, createdAt: Date.now() },
    ...current
  ]);
}

export function loadCommunicationHistory() {
  return normalizeCommunicationHistory(
    readList(COMMUNICATION_HISTORY_KEY, LEGACY_HISTORY_KEY)
  ).slice(0, MAX_ITEMS);
}

export function overwriteCommunicationHistory(entries) {
  writeList(
    COMMUNICATION_HISTORY_KEY,
    LEGACY_HISTORY_KEY,
    normalizeCommunicationHistory(entries).slice(0, MAX_ITEMS)
  );
}

export function appendCommunicationHistory(entry) {
  const current = loadCommunicationHistory();
  overwriteCommunicationHistory([
    { ...entry, createdAt: Date.now() },
    ...current
  ]);
}

export function overwriteCommunicationSettings(value) {
  const normalized = normalizeCommunicationSettings(value);
  overwriteCommunicationSavedPhrases(normalized.savedPhrases);
  overwriteCommunicationHistory(normalized.history);
  return normalized;
}
