import {
  COMMUNICATION_SUPPORT_SETTINGS_KEY,
  LEGACY_COMMUNICATION_SUPPORT_SETTINGS_KEY,
  createCommunicationSupportSettingsPatch,
  getCommunicationSupportSettings
} from './settingsAdapter';

describe('communication support settings adapter', () => {
  test('reads the neutral settings key first', () => {
    const settings = {
      [COMMUNICATION_SUPPORT_SETTINGS_KEY]: {
        savedPhrases: [{ sentence: '我想喝水', output: [{ label: '水' }] }],
        history: []
      },
      [LEGACY_COMMUNICATION_SUPPORT_SETTINGS_KEY]: {
        savedPhrases: [{ sentence: '旧值', output: [{ label: '旧' }] }],
        history: []
      }
    };

    const result = getCommunicationSupportSettings(settings);

    expect(result.savedPhrases[0].sentence).toBe('我想喝水');
  });

  test('falls back to the legacy settings key', () => {
    const settings = {
      [LEGACY_COMMUNICATION_SUPPORT_SETTINGS_KEY]: {
        savedPhrases: [{ sentence: '旧值', output: [{ label: '旧' }] }],
        history: []
      }
    };

    const result = getCommunicationSupportSettings(settings);

    expect(result.savedPhrases[0].sentence).toBe('旧值');
  });

  test('creates a neutral-only patch when legacy mirroring is disabled', () => {
    const patch = createCommunicationSupportSettingsPatch(
      {
        savedPhrases: [{ sentence: '我要休息', output: [{ label: '休息' }] }],
        history: []
      },
      { includeLegacy: false }
    );

    expect(patch[COMMUNICATION_SUPPORT_SETTINGS_KEY]).toBeTruthy();
    expect(patch[LEGACY_COMMUNICATION_SUPPORT_SETTINGS_KEY]).toBeUndefined();
  });
});
