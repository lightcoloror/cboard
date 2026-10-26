import * as azureSdk from 'microsoft-cognitiveservices-speech-sdk';
import { isAndroid } from '../../cordova-util';
import API from '../../api';
import {
  AZURE_SPEECH_SERVICE_REGION,
  AZURE_SPEECH_SUBSCR_KEY,
  IS_BROWSING_FROM_APPLE,
  IS_BROWSING_FROM_APPLE_TOUCH,
  IS_BROWSING_FROM_SAFARI
} from '../../constants';
import { getStore } from '../../store';
import { ElevenLabsEngine, validateApiKeyFormat } from './engine/elevenlabs';
import { ELEVEN_LABS } from './SpeechProvider.constants';
import { createBrowserExpressionAudio } from '../../common/communicationSupport/browserExpressionAudio';

// this is the local synthesizer
let synth = window.speechSynthesis;

// this is the cloud synthesizer
var azureSynthesizer;

/**
 * @type {ElevenLabsEngine | null}
 */
let elevenLabsSynthesizer = null;

const audioElement = new Audio();

let appleFirstCloudPlay = IS_BROWSING_FROM_APPLE;
var speakQueue = [];
var platformVoices = [];
let speechGeneration = 0;
let activeCloudEntry = null;
const pendingSpeechRequests = new Set();
const cloudAudio = createBrowserExpressionAudio(() => audioElement);

// CBoard's callbacks remain the completion contract. Keep cancellation valid
// across voice discovery, provider retries and delayed synthesis responses.
const createSpeechRequest = onend => {
  const generation = speechGeneration;
  let active = true;
  let alertTimer;
  let timer;
  const request = {
    isCurrent: () => active && generation === speechGeneration,
    startAlert(start) {
      clearTimeout(alertTimer);
      alertTimer = start();
      return alertTimer;
    },
    finish(event) {
      if (!active || request.canceling) return;
      active = false;
      clearTimeout(timer);
      clearTimeout(alertTimer);
      pendingSpeechRequests.delete(request);
      try {
        if (onend) onend(event);
      } catch (_) {
        // A caller failure must not leave other canceled speech requests alive.
        console.error('Speech completion callback failed');
      }
    }
  };
  pendingSpeechRequests.add(request);
  // Native speech cancellation is global. If it hangs, stop the entire pending
  // queue, rather than claim completion while the device might still speak.
  timer = setTimeout(
    () => tts.cancel({ error: true, reason: 'timeout' }),
    60000
  );
  return request;
};

const getStateVoices = () => {
  const store = getStore();
  const {
    speech: { voices }
  } = store.getState();
  return voices;
};

const getConnectionStatus = () => {
  const store = getStore();
  const {
    app: { isConnected }
  } = store.getState();
  return isConnected;
};

const initAzureSynthesizer = () => {
  if (!AZURE_SPEECH_SUBSCR_KEY) {
    azureSynthesizer = undefined;
    return;
  }
  var azureSpeechConfig = azureSdk.SpeechConfig.fromSubscription(
    AZURE_SPEECH_SUBSCR_KEY,
    AZURE_SPEECH_SERVICE_REGION
  );
  var azureAudioConfig = null;
  azureSynthesizer = new azureSdk.SpeechSynthesizer(
    azureSpeechConfig,
    azureAudioConfig
  );
};

const initElevenLabsSynthesizer = apiKey => {
  const getStoreApiKey = () => {
    const store = getStore();
    if (!store) {
      return null;
    }
    const {
      speech: { elevenLabsApiKey }
    } = store.getState();
    return elevenLabsApiKey;
  };

  const elevenLabsApiKey = apiKey || getStoreApiKey();

  if (elevenLabsApiKey && validateApiKeyFormat(elevenLabsApiKey)) {
    return new ElevenLabsEngine(elevenLabsApiKey);
  }
  return null;
};

const initAppleUserAgent = () => {
  if (appleFirstCloudPlay) {
    audioElement
      .play()
      .then(() => {})
      .catch(() => {})
      .finally(() => {
        console.log('Apple user Agent is ready to reproduce cloud voices');
      });
    audioElement.pause();
    appleFirstCloudPlay = false;
  }
};

const playQueue = async () => {
  if (activeCloudEntry || !speakQueue.length) return;
  const entry = speakQueue[0];
  if (!entry.request.isCurrent()) {
    speakQueue.shift();
    playQueue();
    return;
  }
  activeCloudEntry = entry;
  let objectUrl;
  let result;
  try {
    const blob =
      entry.audioData instanceof Blob
        ? entry.audioData
        : new Blob([entry.audioData], { type: 'audio/wav' });
    objectUrl = window.URL.createObjectURL(blob);
    // Reuse the recording adapter's play rejection, media error and timeout
    // handling. Its once-only completion cannot finish a replacement clip.
    result = await cloudAudio.play(objectUrl);
  } catch (_) {
    result = { ok: false, reason: 'playback' };
  } finally {
    if (objectUrl) window.URL.revokeObjectURL(objectUrl);
  }
  if (activeCloudEntry !== entry) return;
  activeCloudEntry = null;
  speakQueue.shift();
  entry.request.finish(
    result.ok ? undefined : { error: true, reason: result.reason }
  );
  playQueue();
};

const enqueueSpeech = (audioData, request) => {
  if (!request.isCurrent()) return;
  speakQueue.push({ audioData, request });
  playQueue();
};

initAzureSynthesizer();

const tts = {
  isSupported() {
    return 'speechSynthesis' in window;
  },

  initElevenLabsInstance(apiKey) {
    elevenLabsSynthesizer = null;
    elevenLabsSynthesizer = initElevenLabsSynthesizer(apiKey);
  },

  async testElevenLabsConnection() {
    if (!elevenLabsSynthesizer) {
      return { isValid: false, error: 'NOT_INITIALIZED' };
    }
    try {
      const result = await elevenLabsSynthesizer.testConnection();
      return result;
    } catch (error) {
      return { isValid: false, error: error.message };
    }
  },

  getVoiceByVoiceURI(VoiceURI) {
    const voices = getStateVoices();
    return voices.find(voice => voice.voiceURI === VoiceURI);
  },

  isConnected() {
    return getConnectionStatus();
  },

  getLocalVoiceByVoiceURI(VoiceURI) {
    return platformVoices.find(voice => voice.voiceURI === VoiceURI);
  },

  _getPlatformVoices() {
    try {
      const voices = synth.getVoices();
      // On Cordova, voice results are under `._list`
      const voiceList = voices._list || voices;
      return Array.isArray(voiceList) ? voiceList : [];
    } catch (err) {
      console.error('Error getting platform voices:', err.message);
      synth = window.speechSynthesis;
      return [];
    }
  },
  async fetchAzureVoices() {
    try {
      return await API.getAzureVoices();
    } catch (err) {
      console.error('Error fetching Azure voices:', err.message);
      return [];
    }
  },
  async fetchElevenLabsVoices() {
    if (!elevenLabsSynthesizer) {
      return [];
    }

    try {
      const voices = await elevenLabsSynthesizer.getElevenLabsPersonalVoices();
      return voices.map(voice => ({
        voiceURI: voice.voice_id,
        lang: voice.labels?.language || 'en-US',
        name: voice.name,
        voiceSource: ELEVEN_LABS,
        voice_id: voice.voice_id,
        category: voice.category,
        description: voice.description,
        labels: voice.labels,
        settings: {
          stability: 0.5,
          use_speaker_boost: true,
          similarity_boost: 0.75,
          style: 0,
          speed: 1
        }
      }));
    } catch (err) {
      console.error('Error fetching ElevenLabs voices:', err.message);
      return [];
    }
  },
  async getPlatformVoicesAsync() {
    return new Promise(resolve => {
      const VOICES_TIMEOUT = 7000;

      const resolveWithVoices = () => {
        const voices = this._getPlatformVoices();
        platformVoices = voices;
        resolve(voices);
      };

      const supportsVoicesChanged = 'onvoiceschanged' in synth;
      const initialVoices = this._getPlatformVoices();

      if (initialVoices.length > 0 || !supportsVoicesChanged) {
        platformVoices = initialVoices;
        resolve(initialVoices);
        return;
      }

      const timeoutId = setTimeout(() => {
        synth.removeEventListener('voiceschanged', handleVoicesChanged);
        resolveWithVoices();
      }, VOICES_TIMEOUT);

      const handleVoicesChanged = () => {
        clearTimeout(timeoutId);
        synth.removeEventListener('voiceschanged', handleVoicesChanged);
        resolveWithVoices();
      };

      synth.addEventListener('voiceschanged', handleVoicesChanged);
    });
  },

  async getVoices() {
    const [
      azureResult,
      elevenLabsResult,
      platformResult
    ] = await Promise.allSettled([
      this.fetchAzureVoices(),
      this.fetchElevenLabsVoices(),
      this.getPlatformVoicesAsync()
    ]);

    const azureVoices =
      azureResult.status === 'fulfilled' && Array.isArray(azureResult.value)
        ? azureResult.value
        : [];
    const elevenLabsVoices =
      elevenLabsResult.status === 'fulfilled' &&
      Array.isArray(elevenLabsResult.value)
        ? elevenLabsResult.value
        : [];
    const platformVoices =
      platformResult.status === 'fulfilled' &&
      Array.isArray(platformResult.value)
        ? platformResult.value
        : [];

    return platformVoices.concat(elevenLabsVoices).concat(azureVoices);
  },

  setTtsEngine(ttsEngineName) {
    if (!isAndroid()) {
      return Promise.resolve([]);
    }

    if (synth === undefined) {
      synth = window.speechSynthesis;
    }

    console.log('[TTS] Setting engine to:', ttsEngineName);
    return new Promise((resolve, reject) => {
      let callbackExecuted = false;

      const timeoutId = setTimeout(() => {
        if (!callbackExecuted) {
          callbackExecuted = true;
          console.warn('[TTS] setEngine timeout after 7 seconds, rejecting');
          reject(new Error('TTS engine setup timeout after 7 seconds'));
        }
      }, 7000);

      synth.setEngine(ttsEngineName, function(voicesData) {
        if (callbackExecuted) return;
        callbackExecuted = true;
        clearTimeout(timeoutId);

        console.log(
          '[TTS] setEngine callback received, voices:',
          voicesData ? voicesData.length : 0
        );

        if (voicesData && voicesData.length) {
          return resolve(voicesData);
        }

        return reject(new Error('TTS engine did not return valid voices'));
      });
    });
  },

  //Use getTTsEngine only in Android
  getTtsEngines() {
    if (!isAndroid()) {
      return [];
    } else {
      if (synth === undefined) {
        synth = window.speechSynthesis;
      }
      const ttsEngs = synth.getEngines() || {};
      return ttsEngs._list || [];
    }
  },
  //Use getTTsDefaultEngine only in Android
  getTtsDefaultEngine() {
    if (!isAndroid()) {
      return;
    } else {
      const ttsDefaultEng = synth.getDefaultEngine() || {};
      return ttsDefaultEng;
    }
  },

  cancel(event = { error: true, reason: 'stopped' }) {
    speechGeneration++;
    const canceled = [...pendingSpeechRequests];
    // Some speech engines emit onend synchronously from cancel(). Settle only
    // after the device has stopped, and report cancellation rather than success.
    canceled.forEach(request => {
      request.canceling = true;
    });
    speakQueue = [];
    activeCloudEntry = null;
    cloudAudio.stop();
    try {
      audioElement.pause();
    } catch (_) {
      /* Still stop native speech if the media device fails. */
    }
    try {
      synth?.cancel();
    } catch (_) {
      // A broken native device must still release callbacks and timers.
    } finally {
      canceled.forEach(request => {
        request.canceling = false;
        request.finish(event);
      });
    }
  },

  async speak(text, options, setCloudSpeakAlertTimeout = () => undefined) {
    const request = createSpeechRequest(options.onend);
    try {
      await this._speak(
        text,
        { ...options, onend: request.finish },
        () => request.startAlert(setCloudSpeakAlertTimeout),
        request
      );
    } catch (_) {
      request.finish({ error: true, reason: 'synthesis' });
    }
  },

  async _speak(
    text,
    { voiceURI, pitch = 1, rate = 1, volume = 1, onend },
    setCloudSpeakAlertTimeout,
    request
  ) {
    const voice = this.getVoiceByVoiceURI(voiceURI);

    if (voice && voice.voiceSource === ELEVEN_LABS) {
      initAppleUserAgent();
      const speakAlertTimeoutId = setCloudSpeakAlertTimeout();

      const MAX_RETRIES = 2;

      const isRetryableError = error => {
        const message = error.message.toLowerCase();
        const retryableErrors = [
          'rate limit',
          '429',
          'network',
          'fetch',
          'timeout',
          '500',
          '502',
          '503',
          '504'
        ];

        return retryableErrors.some(errorType => message.includes(errorType));
      };

      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

      const store = getStore();
      const {
        speech: { options, elevenLabsVoiceSettings }
      } = store.getState();

      const voiceId = voice.voice_id;
      const voiceSettings = elevenLabsVoiceSettings[voiceId] || {};

      const elevenLabsSettings = {
        stability:
          voiceSettings.stability ?? options.elevenLabsStability ?? 0.5,
        similarity_boost:
          voiceSettings.similarity_boost ??
          options.elevenLabsSimilarity ??
          0.75,
        style: voiceSettings.style ?? options.elevenLabsStyle ?? 0.0,
        speed: rate ?? 1.0
      };

      let success = false;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            const backoffMs = Math.pow(2, attempt) * 300;
            await delay(backoffMs);
          }
          if (!request.isCurrent()) return;

          const audioBlob = await elevenLabsSynthesizer.synthesizeSpeechElevenLabs(
            text,
            voiceURI,
            elevenLabsSettings
          );
          clearTimeout(speakAlertTimeoutId);
          if (!request.isCurrent()) return;
          enqueueSpeech(audioBlob, request);
          success = true;
          break;
        } catch (err) {
          if (!request.isCurrent()) return;
          if (attempt === MAX_RETRIES || !isRetryableError(err)) {
            break;
          }
        }
      }

      if (!success) {
        clearTimeout(speakAlertTimeoutId);

        if (!platformVoices.length) {
          try {
            await this.getPlatformVoicesAsync();
          } catch (voiceErr) {
            console.error(
              'Failed to get voices for fallback:',
              voiceErr.message
            );
          }
        }
        if (!request.isCurrent()) return;

        if (platformVoices.length && voice.lang) {
          const fallbackVoice = platformVoices.find(
            v => v.lang && v.lang.substring(0, 2) === voice.lang.substring(0, 2)
          );

          if (fallbackVoice) {
            const msg = new SpeechSynthesisUtterance(text);
            msg.text = text;
            msg.voice = fallbackVoice;
            msg.name = fallbackVoice.name;
            msg.lang = fallbackVoice.lang;
            msg.voiceURI = fallbackVoice.voiceURI;
            msg.pitch = pitch;
            msg.rate = rate;
            msg.volume = volume;
            msg.onend = onend;
            msg.onerror = () => onend({ error: true, reason: 'playback' });
            if (IS_BROWSING_FROM_SAFARI || IS_BROWSING_FROM_APPLE_TOUCH)
              synth.cancel();
            synth.speak(msg);
            return;
          }
        }

        onend({ error: true });
      }
    } else if (voice && voice.voiceSource === 'cloud') {
      if (!azureSynthesizer) {
        onend({ error: true });
        return;
      }
      initAppleUserAgent();
      const speakAlertTimeoutId = setCloudSpeakAlertTimeout();
      const synthesizer = azureSynthesizer;
      const resetSynthesizer = () => {
        if (azureSynthesizer === synthesizer) {
          synthesizer.close();
          azureSynthesizer = undefined;
          initAzureSynthesizer();
        }
      };
      // set voice to speak
      azureSynthesizer.properties.setProperty(
        'SpeechServiceConnection_SynthVoice',
        voiceURI
      );
      azureSynthesizer.speakTextAsync(
        text,
        function(result) {
          if (!request.isCurrent()) return;
          clearTimeout(speakAlertTimeoutId);
          if (
            result?.reason === azureSdk.ResultReason.SynthesizingAudioCompleted
          ) {
            enqueueSpeech(result.audioData, request);
          } else {
            resetSynthesizer();
            onend({ error: true });
          }
        },
        function() {
          if (!request.isCurrent()) return;
          resetSynthesizer();
          onend({ error: true });
        }
      );
    } else {
      if (!platformVoices.length) {
        try {
          await this.getPlatformVoicesAsync();
        } catch (err) {
          console.error(err.message);
        }
      }
      if (!request.isCurrent()) return;
      if (platformVoices.length) {
        const localVoice = this.getLocalVoiceByVoiceURI(voiceURI);
        if (localVoice) {
          const msg = new SpeechSynthesisUtterance(text);
          msg.text = text;
          msg.voice = localVoice;
          msg.name = localVoice.name;
          msg.lang = localVoice.lang;
          msg.voiceURI = localVoice.voiceURI;
          msg.pitch = pitch;
          msg.rate = rate;
          msg.volume = volume;
          msg.onend = onend;
          msg.onerror = () => onend({ error: true, reason: 'playback' });
          if (IS_BROWSING_FROM_SAFARI || IS_BROWSING_FROM_APPLE_TOUCH)
            synth.cancel();
          synth.speak(msg);
          return;
        }
      }
      onend({ error: true, reason: 'voice-unavailable' });
    }
  }
};

export default tts;
