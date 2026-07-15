import { LEGACY_COMMUNICATION_STORAGE_KEYS } from './legacy';
import {
  normalizeCommunicationHistory,
  normalizeCommunicationSavedPhrases,
  normalizeCommunicationSupportSettings
} from './storage';

export const COMMUNICATION_STORAGE_KEYS = {
  savedPhrases: 'cboard_communication_saved_phrases',
  history: 'cboard_communication_history'
};

export const DEFAULT_COMMUNICATION_ITEM_LIMIT = 20;

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

export function createCommunicationRepository({
  storage,
  now = Date.now,
  maxItems = DEFAULT_COMMUNICATION_ITEM_LIMIT
} = {}) {
  assertKeyValueStore(storage);

  if (typeof now !== 'function') {
    throw new TypeError('Communication repository requires a clock function');
  }

  const itemLimit =
    Number.isInteger(maxItems) && maxItems > 0
      ? maxItems
      : DEFAULT_COMMUNICATION_ITEM_LIMIT;

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
    storage.setItem(primaryKey, serialized);

    if (legacyKey) {
      storage.setItem(legacyKey, serialized);
    }
  }

  function loadCommunicationSavedPhrases() {
    return normalizeCommunicationSavedPhrases(
      readList(
        COMMUNICATION_STORAGE_KEYS.savedPhrases,
        LEGACY_COMMUNICATION_STORAGE_KEYS.savedPhrases
      )
    ).slice(0, itemLimit);
  }

  function overwriteCommunicationSavedPhrases(entries) {
    writeList(
      COMMUNICATION_STORAGE_KEYS.savedPhrases,
      LEGACY_COMMUNICATION_STORAGE_KEYS.savedPhrases,
      normalizeCommunicationSavedPhrases(entries).slice(0, itemLimit)
    );
  }

  function saveCommunicationPhrase(entry) {
    const current = loadCommunicationSavedPhrases().filter(
      item => item.sentence !== entry.sentence
    );

    overwriteCommunicationSavedPhrases([
      { ...entry, createdAt: now() },
      ...current
    ]);
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

    overwriteCommunicationHistory([{ ...entry, createdAt: now() }, ...current]);
  }

  function overwriteCommunicationSettings(value) {
    const normalized = normalizeCommunicationSupportSettings(value);
    overwriteCommunicationSavedPhrases(normalized.savedPhrases);
    overwriteCommunicationHistory(normalized.history);
    return normalized;
  }

  return {
    appendCommunicationHistory,
    loadCommunicationHistory,
    loadCommunicationSavedPhrases,
    overwriteCommunicationHistory,
    overwriteCommunicationSavedPhrases,
    overwriteCommunicationSettings,
    saveCommunicationPhrase
  };
}
