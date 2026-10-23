import { getStore } from '../../../store';
import * as azure from 'microsoft-cognitiveservices-speech-sdk';
import { ElevenLabsEngine } from '../engine/elevenlabs';
import configureMockStore from 'redux-mock-store';
import thunk from 'redux-thunk';
import { START_SPEECH, END_SPEECH } from '../SpeechProvider.constants';

jest.mock('../../../constants', () => ({
  AZURE_SPEECH_SERVICE_REGION: 'synthetic-region',
  AZURE_SPEECH_SUBSCR_KEY: 'synthetic-fixture-only',
  IS_BROWSING_FROM_APPLE: false,
  IS_BROWSING_FROM_APPLE_TOUCH: false,
  IS_BROWSING_FROM_SAFARI: false
}));
jest.mock('../../../store', () => ({ getStore: jest.fn() }));
jest.mock('../../../api', () => ({ getAzureVoices: jest.fn(async () => []) }));
jest.mock('../../../cordova-util', () => ({ isAndroid: () => false }));
jest.mock('../engine/elevenlabs', () => ({
  validateApiKeyFormat: () => true,
  ElevenLabsEngine: jest.fn()
}));
jest.mock('microsoft-cognitiveservices-speech-sdk', () => ({
  SpeechConfig: { fromSubscription: jest.fn(() => ({})) },
  SpeechSynthesizer: jest.fn(),
  ResultReason: { SynthesizingAudioCompleted: 1, Canceled: 2 }
}));

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const local = { voiceURI: 'synthetic-local', lang: 'zh-CN', name: 'Synthetic' };
const cloud = { ...local, voiceURI: 'synthetic-cloud', voiceSource: 'cloud' };
const eleven = {
  ...local,
  voiceURI: 'synthetic-eleven',
  voice_id: 'synthetic-eleven',
  voiceSource: 'elevenlabs'
};

describe('existing CBoard speech engine lifecycle', () => {
  let tts, audio, sdk, elevenEngine, platform, voices, speechActions;
  let originalAudio, originalSpeech, originalUtterance;

  beforeAll(() => {
    originalAudio = global.Audio;
    originalSpeech = window.speechSynthesis;
    originalUtterance = global.SpeechSynthesisUtterance;
    audio = { paused: true, play: jest.fn(), pause: jest.fn(), src: '' };
    global.Audio = jest.fn(() => audio);
    platform = { getVoices: jest.fn(), speak: jest.fn(), cancel: jest.fn() };
    window.speechSynthesis = platform;
    global.SpeechSynthesisUtterance = function(text) {
      this.text = text;
    };
    window.URL.createObjectURL = jest.fn(() => 'blob:synthetic-speech');
    window.URL.revokeObjectURL = jest.fn();
    sdk = {
      properties: { setProperty: jest.fn() },
      speakTextAsync: jest.fn(),
      close: jest.fn()
    };
    azure.SpeechSynthesizer.mockImplementation(() => sdk);
    elevenEngine = {
      synthesizeSpeechElevenLabs: jest.fn(),
      getElevenLabsPersonalVoices: jest.fn(async () => [])
    };
    ElevenLabsEngine.mockImplementation(() => elevenEngine);
    tts = require('../tts').default;
    speechActions = require('../SpeechProvider.actions');
  });
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    azure.SpeechSynthesizer.mockImplementation(() => sdk);
    ElevenLabsEngine.mockImplementation(() => elevenEngine);
    window.URL.createObjectURL.mockReturnValue('blob:synthetic-speech');
    voices = [local];
    platform.getVoices.mockImplementation(() => voices);
    audio.play.mockImplementation(() => {
      audio.paused = false;
      return Promise.resolve();
    });
    audio.pause.mockImplementation(() => {
      audio.paused = true;
    });
    getStore.mockReturnValue({
      getState: () => ({
        app: { isConnected: true },
        speech: {
          voices: [local, cloud, eleven],
          options: {},
          elevenLabsVoiceSettings: {}
        }
      })
    });
    tts.initElevenLabsInstance('synthetic-fixture-only');
    await tts.getPlatformVoicesAsync();
  });
  afterEach(async () => {
    tts.cancel();
    await flush();
    jest.clearAllTimers();
    jest.useRealTimers();
  });
  afterAll(() => {
    global.Audio = originalAudio;
    window.speechSynthesis = originalSpeech;
    global.SpeechSynthesisUtterance = originalUtterance;
  });
  const alert = () => setTimeout(() => {}, 5000);
  const completed = () => ({
    reason: azure.ResultReason.SynthesizingAudioCompleted,
    audioData: new Uint8Array([1])
  });

  test('cancel invalidates delayed Azure synthesis, settles once, and clears its alert', async () => {
    const done = jest.fn();
    await tts.speak(
      'synthetic old',
      { voiceURI: cloud.voiceURI, onend: done },
      alert
    );
    const success = sdk.speakTextAsync.mock.calls[0][1];
    tts.cancel();
    success(completed());
    await flush();
    expect(audio.play).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ error: true, reason: 'stopped' })
    );
    expect(jest.getTimerCount()).toBe(0);
  });
  test('cancel invalidates delayed ElevenLabs synthesis', async () => {
    const request = deferred();
    elevenEngine.synthesizeSpeechElevenLabs.mockReturnValueOnce(
      request.promise
    );
    const done = jest.fn();
    const pending = tts.speak(
      'synthetic old',
      { voiceURI: eleven.voiceURI, onend: done },
      alert
    );
    tts.cancel();
    request.resolve(new Blob(['synthetic']));
    await pending;
    await flush();
    expect(audio.play).not.toHaveBeenCalled();
    expect(platform.speak).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0]).toMatchObject({
      error: true,
      reason: 'stopped'
    });
  });
  test('cancel during cloud retry backoff prevents another request and local fallback', async () => {
    elevenEngine.synthesizeSpeechElevenLabs.mockRejectedValue(
      new Error('network unavailable')
    );
    const pending = tts.speak(
      'synthetic retry',
      { voiceURI: eleven.voiceURI, onend: jest.fn() },
      alert
    );
    await flush();
    tts.cancel();
    jest.advanceTimersByTime(600);
    await flush();
    jest.advanceTimersByTime(1200);
    await flush();
    await pending;
    expect(elevenEngine.synthesizeSpeechElevenLabs).toHaveBeenCalledTimes(1);
    expect(platform.speak).not.toHaveBeenCalled();
  });
  test('old cloud callbacks cannot finish or pause a newer playback', async () => {
    await tts.speak(
      'synthetic old',
      { voiceURI: cloud.voiceURI, onend: jest.fn() },
      alert
    );
    sdk.speakTextAsync.mock.calls[0][1](completed());
    await flush();
    const oldEnd = audio.onended;
    tts.cancel();
    const done = jest.fn();
    await tts.speak(
      'synthetic new',
      { voiceURI: cloud.voiceURI, onend: done },
      alert
    );
    sdk.speakTextAsync.mock.calls[1][1](completed());
    await flush();
    const pauses = audio.pause.mock.calls.length;
    oldEnd();
    await flush();
    expect(done).not.toHaveBeenCalled();
    expect(audio.pause).toHaveBeenCalledTimes(pauses);
    audio.onended();
    await flush();
    expect(done).toHaveBeenCalledTimes(1);
  });
  test('cloud audio rejection completes with an error and releases its object URL', async () => {
    audio.play.mockRejectedValueOnce(new Error('synthetic autoplay refusal'));
    const done = jest.fn();
    await tts.speak(
      'synthetic refusal',
      { voiceURI: cloud.voiceURI, onend: done },
      alert
    );
    sdk.speakTextAsync.mock.calls[0][1](completed());
    await flush();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0]).toMatchObject({ error: true });
    expect(window.URL.revokeObjectURL).toHaveBeenCalled();
  });
  test('missing configured voice ends as an error rather than hanging', async () => {
    const done = jest.fn();
    await tts.speak(
      'synthetic missing',
      { voiceURI: 'missing', onend: done },
      alert
    );
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ error: true }));
    expect(platform.speak).not.toHaveBeenCalled();
  });
  test('native speech error ends once even when the browser also emits ended', async () => {
    const done = jest.fn();
    await tts.speak(
      'synthetic native',
      { voiceURI: local.voiceURI, onend: done },
      alert
    );
    const utterance = platform.speak.mock.calls[0][0];
    expect(utterance.onerror).toEqual(expect.any(Function));
    utterance.onerror({ error: 'audio-busy' });
    utterance.onend();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0]).toMatchObject({ error: true });
  });
  test('a synthesis that never responds times out and cannot play later', async () => {
    const done = jest.fn();
    await tts.speak(
      'synthetic timeout',
      { voiceURI: cloud.voiceURI, onend: done },
      alert
    );
    jest.advanceTimersByTime(60000);
    sdk.speakTextAsync.mock.calls[0][1](completed());
    await flush();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0]).toMatchObject({
      error: true,
      reason: 'timeout'
    });
    expect(audio.play).not.toHaveBeenCalled();
  });
  test('native speech that never ends is cancelled on timeout', async () => {
    const done = jest.fn();
    await tts.speak(
      'synthetic native timeout',
      { voiceURI: local.voiceURI, onend: done },
      alert
    );
    jest.advanceTimersByTime(60000);
    expect(platform.cancel).toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ error: true, reason: 'timeout' })
    );
  });
  test('synchronous native end during cancel reports stopped, not successful speech', async () => {
    const done = jest.fn();
    await tts.speak(
      'synthetic native',
      { voiceURI: local.voiceURI, onend: done },
      alert
    );
    const utterance = platform.speak.mock.calls[0][0];
    platform.cancel.mockImplementationOnce(() => utterance.onend());
    tts.cancel();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ error: true, reason: 'stopped' })
    );
  });
  test('cancel during native voice discovery cannot start speech later', async () => {
    voices = [];
    await tts.getPlatformVoicesAsync();
    const discovery = deferred();
    const original = tts.getPlatformVoicesAsync;
    tts.getPlatformVoicesAsync = jest.fn(() => discovery.promise);
    const done = jest.fn();
    const pending = tts.speak(
      'synthetic waiting',
      { voiceURI: local.voiceURI, onend: done },
      alert
    );
    tts.cancel();
    voices = [local];
    await original.call(tts);
    discovery.resolve(voices);
    await pending;
    tts.getPlatformVoicesAsync = original;
    expect(platform.speak).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledTimes(1);
  });
  test('native and media stop failures still settle requests and clear timers', async () => {
    const done = jest.fn();
    await tts.speak(
      'synthetic native',
      { voiceURI: local.voiceURI, onend: done },
      alert
    );
    platform.cancel.mockImplementationOnce(() => {
      throw new Error('synthetic stop failure');
    });
    audio.pause.mockImplementationOnce(() => {
      throw new Error('synthetic media failure');
    });
    expect(() => tts.cancel()).not.toThrow();
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'stopped' })
    );
    expect(jest.getTimerCount()).toBe(0);
  });
  test('cloud media error settles once and the next queued clip can play', async () => {
    const first = jest.fn(),
      second = jest.fn();
    await tts.speak(
      'synthetic first',
      { voiceURI: cloud.voiceURI, onend: first },
      alert
    );
    sdk.speakTextAsync.mock.calls[0][1](completed());
    await tts.speak(
      'synthetic second',
      { voiceURI: cloud.voiceURI, onend: second },
      alert
    );
    sdk.speakTextAsync.mock.calls[1][1](completed());
    expect(audio.play).toHaveBeenCalledTimes(1);
    const oldEnd = audio.onended;
    audio.onerror();
    await flush();
    expect(first).toHaveBeenCalledWith(
      expect.objectContaining({ error: true })
    );
    expect(audio.play).toHaveBeenCalledTimes(2);
    oldEnd();
    expect(second).not.toHaveBeenCalled();
    audio.onended();
    await flush();
    expect(second).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
  test('stale Azure failure cannot reset the synthesizer used by a new request', async () => {
    await tts.speak(
      'synthetic old',
      { voiceURI: cloud.voiceURI, onend: jest.fn() },
      alert
    );
    const oldError = sdk.speakTextAsync.mock.calls[0][2];
    tts.cancel();
    const done = jest.fn();
    await tts.speak(
      'synthetic new',
      { voiceURI: cloud.voiceURI, onend: done },
      alert
    );
    oldError(new Error('synthetic late failure'));
    expect(sdk.close).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
    sdk.speakTextAsync.mock.calls[1][1](completed());
    audio.onended();
    await flush();
    expect(done).toHaveBeenCalledTimes(1);
  });
  test('offline cloud failure retains the original text when falling back to native speech', async () => {
    elevenEngine.synthesizeSpeechElevenLabs.mockRejectedValueOnce(
      new Error('synthetic unsupported voice')
    );
    const done = jest.fn();
    await tts.speak(
      'synthetic original, no paraphrase',
      { voiceURI: eleven.voiceURI, onend: done },
      alert
    );
    expect(platform.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'synthetic original, no paraphrase' })
    );
    platform.speak.mock.calls[0][0].onend();
    expect(done).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
  test('after cancellation a new local request works and does not revive old cloud audio', async () => {
    await tts.speak(
      'synthetic cloud',
      { voiceURI: cloud.voiceURI, onend: jest.fn() },
      alert
    );
    const oldSuccess = sdk.speakTextAsync.mock.calls[0][1];
    tts.cancel();
    const done = jest.fn();
    await tts.speak(
      'synthetic local',
      { voiceURI: local.voiceURI, onend: done },
      alert
    );
    oldSuccess(completed());
    expect(audio.play).not.toHaveBeenCalled();
    platform.speak.mock.calls[0][0].onend();
    expect(done).toHaveBeenCalledTimes(1);
  });
  test('real action and engine keep the next native frame speaking after the previous callback', async () => {
    const store = configureMockStore([thunk])({
      speech: { options: { voiceURI: local.voiceURI } }
    });
    await store.dispatch(
      speechActions.speak('synthetic first', () => {
        store.dispatch(speechActions.speak('synthetic second'));
      })
    );
    const oldEnd = platform.speak.mock.calls[0][0].onend;
    oldEnd();
    const actionTypes = store.getActions().map(action => action.type);
    expect(actionTypes.slice(-2)).toEqual([END_SPEECH, START_SPEECH]);
    oldEnd();
    expect(store.getActions()).toHaveLength(actionTypes.length);
    platform.speak.mock.calls[1][0].onend();
    expect(store.getActions().slice(-1)[0]).toMatchObject({
      type: END_SPEECH,
      isSpeaking: false
    });
  });
  test('real action and cloud timeout release waiting state; a new local request remains usable', async () => {
    const store = configureMockStore([thunk])({
      speech: { options: { voiceURI: cloud.voiceURI } }
    });
    const done = jest.fn();
    await store.dispatch(speechActions.speak('synthetic timeout', done));
    jest.advanceTimersByTime(60000);
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ error: true, reason: 'timeout' })
    );
    expect(store.getActions()).toContainEqual({
      type: END_SPEECH,
      isSpeaking: false
    });
    const localDone = jest.fn();
    await store.dispatch(
      speechActions.speak('synthetic local', localDone, {
        voiceURI: local.voiceURI
      })
    );
    sdk.speakTextAsync.mock.calls[0][1](completed());
    await flush();
    expect(audio.play).not.toHaveBeenCalled();
    expect(localDone).not.toHaveBeenCalled();
    platform.speak.mock.calls[0][0].onend();
    expect(localDone).toHaveBeenCalledTimes(1);
  });
});
