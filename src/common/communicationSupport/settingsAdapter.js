import { normalizeCommunicationSupportSettings } from './storage';
import { LEGACY_COMMUNICATION_SUPPORT_SETTINGS_KEY } from './legacy';

export const COMMUNICATION_SUPPORT_SETTINGS_KEY = 'communicationSupport';
export { LEGACY_COMMUNICATION_SUPPORT_SETTINGS_KEY } from './legacy';
export const COMMUNICATION_SUPPORT_EXPORT_FILENAME =
  'cboard-communication-support.json';

export function getCommunicationSupportSettings(settings) {
  return normalizeCommunicationSupportSettings(
    (settings && settings[COMMUNICATION_SUPPORT_SETTINGS_KEY]) ||
      (settings && settings[LEGACY_COMMUNICATION_SUPPORT_SETTINGS_KEY])
  );
}

export function createCommunicationSupportSettingsPatch(value, options = {}) {
  const { includeLegacy = true } = options;
  const normalized = normalizeCommunicationSupportSettings(value);
  const patch = {
    [COMMUNICATION_SUPPORT_SETTINGS_KEY]: normalized
  };

  if (includeLegacy) {
    patch[LEGACY_COMMUNICATION_SUPPORT_SETTINGS_KEY] = normalized;
  }

  return patch;
}
