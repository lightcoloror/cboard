import {
  normalizeCommunicationPreferences,
  updateCommunicationPreferences
} from './communicationPreferences';

export const COMMUNICATION_PREFERENCES_STORAGE_KEY =
  'cboard_communication_preferences';

function assertPreferencesStorage(storage) {
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function'
  ) {
    throw new TypeError(
      'Communication preferences require a synchronous key-value store'
    );
  }
}

export function createCommunicationPreferencesStore(storage) {
  assertPreferencesStorage(storage);

  function load() {
    const raw = storage.getItem(COMMUNICATION_PREFERENCES_STORAGE_KEY);
    if (!raw) return normalizeCommunicationPreferences(null);

    try {
      return normalizeCommunicationPreferences(JSON.parse(raw));
    } catch (error) {
      return normalizeCommunicationPreferences(null);
    }
  }

  function save(value) {
    const normalized = normalizeCommunicationPreferences(value);
    const serialized = JSON.stringify(normalized);
    if (storage.setItem(COMMUNICATION_PREFERENCES_STORAGE_KEY, serialized) === false) {
      throw new Error('设置未保存到本机，请保留修改并重试。');
    }
    if (storage.getItem(COMMUNICATION_PREFERENCES_STORAGE_KEY) !== serialized) {
      throw new Error('无法核对本机设置，请保留修改并重试。');
    }
    return normalized;
  }

  function update(changes) {
    return save(updateCommunicationPreferences(load(), changes));
  }

  return { load, save, update };
}
