import API from '../../../api';
import { getStore } from '../../../store';
import * as azureSdk from 'microsoft-cognitiveservices-speech-sdk';

jest.mock('../../../constants', () => ({
  API_URL: '/api/',
  ARASAAC_BASE_PATH_API: 'https://api.arasaac.org/api/',
  GLOBALSYMBOLS_BASE_PATH_API: 'https://globalsymbols.com/api/v1/',
  AZURE_VOICES_BASE_PATH_API:
    'https://eastus.tts.speech.microsoft.com/cognitiveservices/voices/',
  AZURE_SPEECH_SERVICE_REGION: 'eastus',
  AZURE_SPEECH_SUBSCR_KEY: '',
  IS_BROWSING_FROM_APPLE: false,
  IS_BROWSING_FROM_APPLE_TOUCH: false,
  IS_BROWSING_FROM_SAFARI: false
}));

jest.mock('../../../store', () => ({
  getStore: jest.fn()
}));

jest.mock('../../../cordova-util', () => ({
  ...jest.requireActual('../../../cordova-util'),
  isAndroid: jest.fn(() => false)
}));

jest.mock('microsoft-cognitiveservices-speech-sdk', () => ({
  SpeechConfig: { fromSubscription: jest.fn() },
  SpeechSynthesizer: jest.fn(),
  ResultReason: {}
}));

describe('Azure speech without credentials', () => {
  // Use the voice list installed by src/setupTests.js so the fixture matches
  // the browser API contract exercised by tts._getPlatformVoices().
  const localVoice = window.speechSynthesis.getVoices()[1];
  const legacyCloudVoice = {
    voiceURI: 'legacy-cloud-voice',
    lang: 'en-US',
    name: 'Legacy cloud voice',
    voiceSource: 'cloud'
  };
  const platformSpeech = window.speechSynthesis;

  let tts;
  let azureInitializationCalls;
  let apiGet;

  beforeEach(() => {
    jest.clearAllMocks();
    getStore.mockReturnValue({
      getState: () => ({
        app: { isConnected: true },
        speech: {
          voices: [legacyCloudVoice, localVoice],
          options: {},
          elevenLabsVoiceSettings: {}
        }
      })
    });
  });

  beforeAll(() => {
    Object.defineProperty(platformSpeech, 'speak', {
      value: jest.fn(),
      writable: true,
      configurable: true
    });
    global.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
      this.text = text;
    };
    apiGet = jest.spyOn(API.axiosInstance, 'get');
    tts = require('../tts').default;
    azureInitializationCalls =
      azureSdk.SpeechConfig.fromSubscription.mock.calls.length;
  });

  it('skips Azure SDK initialization and does not fetch Azure voices', async () => {
    await expect(tts.fetchAzureVoices()).resolves.toEqual([]);

    expect(apiGet).not.toHaveBeenCalled();
    expect(azureInitializationCalls).toBe(0);
  });

  it('fails a persisted Azure voice gracefully while local speech remains available', async () => {
    const onend = jest.fn();

    await expect(
      tts.speak(
        'legacy phrase',
        { voiceURI: legacyCloudVoice.voiceURI, onend },
        jest.fn()
      )
    ).resolves.toBeUndefined();
    expect(onend).toHaveBeenCalledWith({ error: true });

    await tts.speak(
      'local phrase',
      { voiceURI: localVoice.voiceURI },
      jest.fn()
    );
    expect(platformSpeech.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'local phrase' })
    );
  });
});
