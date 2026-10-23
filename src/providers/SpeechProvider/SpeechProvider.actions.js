import {
  REQUEST_VOICES,
  RECEIVE_VOICES,
  RECEIVE_TTS_ENGINES,
  RECEIVE_TTS_DEFAULT_ENGINE,
  REQUEST_TTS_ENGINE,
  RECEIVE_TTS_ENGINE,
  CHANGE_VOICE,
  CHANGE_PITCH,
  CHANGE_RATE,
  CHANGE_ELEVENLABS_API_KEY,
  START_SPEECH,
  END_SPEECH,
  CANCEL_SPEECH,
  CACHE_ELEVENLABS_VOICES,
  CLEAR_ELEVENLABS_CACHE,
  CHANGE_ELEVENLABS_STABILITY,
  CHANGE_ELEVENLABS_SIMILARITY,
  CHANGE_ELEVENLABS_STYLE,
  RESET_ELEVENLABS_SETTINGS
} from './SpeechProvider.constants';

import {
  setLangs,
  changeLang
} from '../LanguageProvider/LanguageProvider.actions';
import {
  getSupportedLangs,
  getDefaultLang,
  getVoiceURI,
  filterLocalLangs
} from '../../i18n';
import tts from './tts';
import { interruptSpeechQueues } from './speechInterruption';
import { showNotification } from '../../components/Notifications/Notifications.actions';

export function requestVoices() {
  return {
    type: REQUEST_VOICES
  };
}

export function receiveVoices(voices) {
  return {
    type: RECEIVE_VOICES,
    voices
  };
}

export function requestTtsEngine() {
  return {
    type: REQUEST_TTS_ENGINE
  };
}

export function receiveTtsEngine(ttsEngineName) {
  return {
    type: RECEIVE_TTS_ENGINE,
    ttsEngineName
  };
}

export function getTtsEngines() {
  const ttsEngines = tts?.getTtsEngines();
  return {
    type: RECEIVE_TTS_ENGINES,
    ttsEngines
  };
}

export function setTtsEngine(selectedTtsEngineName) {
  return async dispatch => {
    dispatch(requestTtsEngine());
    try {
      const engineAvailable = tts
        .getTtsEngines()
        .map(tts => tts.name)
        .includes(selectedTtsEngineName);
      const engineName = engineAvailable
        ? selectedTtsEngineName
        : tts.getTtsDefaultEngine().name;
      const voices = await tts.setTtsEngine(engineName);
      dispatch(receiveTtsEngine(engineName));
      if (!voices.length) {
        throw new Error('TTS engine does not have a language.');
      }
    } catch (err) {
      console.error('Error setting TTS engine:', err.message);
      throw new Error('TTS engine selection error on setTtsEngine');
    }
  };
}

export function updateLangSpeechStatus(voices) {
  return async (dispatch, getState) => {
    try {
      const supportedLangs = getSupportedLangs(voices);

      if (!supportedLangs.length) {
        throw new Error('TTS engine does not have a supported language.');
      }
      const localLangs = filterLocalLangs(voices);

      dispatch(setLangs(supportedLangs, localLangs));

      // now we set the actual language based on the state
      const language = getState().language.lang;
      const lang = supportedLangs.includes(language)
        ? language
        : getDefaultLang(supportedLangs);
      dispatch(changeLang(lang));

      // last step is to change voice in case it is available
      if (
        getState().speech.options.lang.substring(0, 2) !== lang.substring(0, 2)
      ) {
        const uris = voices.map(v => {
          return v.voiceURI;
        });
        let voiceURI = '';
        if (uris.includes(voiceURI)) {
          voiceURI = getState().speech.options.voiceURI;
        } else {
          voiceURI = getVoiceURI(lang, voices);
        }
        dispatch(changeVoice(voiceURI, lang));
      }

      return voices;
    } catch (err) {
      throw new Error(
        'TTS engine does not have a supported language.' + err.message
      );
    }
  };
}

export function getTtsDefaultEngine() {
  const ttsDefaultEngine = tts.getTtsDefaultEngine();
  return {
    type: RECEIVE_TTS_DEFAULT_ENGINE,
    ttsDefaultEngine
  };
}

export function changeVoice(voiceURI, lang) {
  return (dispatch, getState) => {
    const isCloud =
      getState().speech.voices.find(v => v.voiceURI === voiceURI)
        ?.voiceSource === 'cloud';
    if (isCloud) dispatch(showNotification('', 'cloudVoiceIsSeted'));
    dispatch({
      type: CHANGE_VOICE,
      voiceURI,
      lang,
      isCloud
    });
  };
}

export function changePitch(pitch) {
  return {
    type: CHANGE_PITCH,
    pitch
  };
}

export function changeRate(rate) {
  return {
    type: CHANGE_RATE,
    rate
  };
}

export function changeElevenLabsApiKey(elevenLabsApiKey) {
  return {
    type: CHANGE_ELEVENLABS_API_KEY,
    elevenLabsApiKey
  };
}

export function getVoices() {
  return async (dispatch, getState) => {
    let voices = [];
    dispatch(requestVoices());

    const { elevenLabsCache } = getState().speech;

    const isCacheValid =
      elevenLabsCache.timestamp &&
      elevenLabsCache.voices.length > 0 &&
      Date.now() - elevenLabsCache.timestamp < elevenLabsCache.ttl;

    try {
      const localizeSerbianVoicesNames = (voiceName, voiceLang) => {
        if (voiceLang?.startsWith('sr')) {
          const getNativeNameOfDialect = lang => {
            if (lang === 'sr-ME') return 'Crnogorski jezik';
            if (lang === 'sr-SP') return 'Српски језик';
            if (lang === 'sr-RS') return 'Srpski jezik';
          };
          return `${voiceName} - ${getNativeNameOfDialect(voiceLang)}`;
        }
        return voiceName;
      };

      const pvoices = await tts.getVoices();

      const elevenLabsVoices = pvoices.filter(
        v => v.voiceSource === 'elevenlabs'
      );
      const otherVoices = pvoices.filter(v => v.voiceSource !== 'elevenlabs');

      let allVoices = [];

      if (elevenLabsVoices.length > 0) {
        dispatch(cacheElevenLabsVoices(elevenLabsVoices));
        allVoices = pvoices;
      } else if (isCacheValid) {
        allVoices = [...otherVoices, ...elevenLabsCache.voices];
      } else if (elevenLabsCache.voices.length > 0) {
        console.warn('Using expired ElevenLabs cache due to fetch failure');
        allVoices = [...otherVoices, ...elevenLabsCache.voices];
      } else {
        allVoices = pvoices;
      }

      // some TTS engines do return invalid voices, so we filter them
      const regex = new RegExp('^[a-zA-Z]{2,}-$', 'g');
      const fvoices = allVoices.filter(voice => !regex.test(voice.lang));
      voices = fvoices.map(
        ({
          voiceURI,
          lang,
          name,
          Locale,
          ShortName,
          DisplayName,
          Gender,
          voiceSource,
          voice_id
        }) => {
          let voice = {};
          if (lang) {
            voice.lang = lang;
          } else if (Locale) {
            voice.lang = Locale;
          }
          if (voiceSource) {
            voice.voiceSource = voiceSource;
            voice.voiceURI = voiceURI;
          } else if (voiceURI) {
            voice.voiceURI = voiceURI;
            voice.voiceSource = 'local';
          } else if (ShortName) {
            voice.voiceURI = ShortName;
            voice.voiceSource = 'cloud';
          }
          if (name) {
            voice.name = name;
          } else if (DisplayName) {
            voice.name = `${DisplayName} (${voice.lang}) - ${Gender}`;
          }
          voice.name = localizeSerbianVoicesNames(voice.name, voice.lang);

          // Include voice_id for ElevenLabs voices
          if (voice_id) {
            voice.voice_id = voice_id;
          }

          return voice;
        }
      );

      dispatch(receiveVoices(voices));
    } catch (err) {
      console.error(err.message);
      voices = [];
    } finally {
      return voices;
    }
  };
}

function startSpeech(message) {
  return {
    type: START_SPEECH,
    isSpeaking: true,
    text: message.trim()
  };
}

function endSpeech() {
  return {
    type: END_SPEECH,
    isSpeaking: false
  };
}

// Track existing speech callbacks rather than infer completion from a provider's
// synthesis promise (which may resolve before audio starts playing).
const pendingSpeech = new Set();

export function cancelSpeech() {
  return dispatch => {
    interruptSpeechQueues();
    const canceled = [...pendingSpeech];
    canceled.forEach(request => {
      request.canceled = true;
    });
    dispatch({
      type: CANCEL_SPEECH,
      isSpeaking: false
    });
    try {
      tts.cancel();
    } catch (error) {
      console.error(error);
    } finally {
      canceled.forEach(request =>
        request.finish({ error: true, reason: 'stopped' })
      );
    }
  };
}

export function speak(text, onend = () => {}, overrides = {}) {
  return (dispatch, getState) => {
    const { playbackOwner, ...speechOverrides } = overrides;
    interruptSpeechQueues(playbackOwner);
    const options = getState().speech.options;
    let finished = false;
    let alertTimer;
    const request = {
      canceled: false,
      finish: event => {
        if (finished) return;
        finished = true;
        clearTimeout(alertTimer);
        pendingSpeech.delete(request);
        // End before the callback: it may synchronously start the next frame.
        if (!request.canceled && !pendingSpeech.size) dispatch(endSpeech());
        if (!request.canceled && event?.error && event.reason !== 'stopped') {
          dispatch(showNotification('', 'cloudSpeakError'));
        }
        try {
          onend(event);
        } catch (_) {
          console.error('Speech completion callback failed');
        }
      }
    };
    pendingSpeech.add(request);
    const setCloudSpeakAlertTimeout = () => {
      const REASONABLE_TIME_TO_AWAIT = 5000;
      clearTimeout(alertTimer);
      alertTimer = setTimeout(() => {
        if (!finished && !request.canceled)
          dispatch(showNotification('', 'cloudSpeakError'));
      }, REASONABLE_TIME_TO_AWAIT);
      return alertTimer;
    };
    dispatch(startSpeech(text));

    try {
      return Promise.resolve(
        tts.speak(
          text,
          { ...options, ...speechOverrides, onend: request.finish },
          setCloudSpeakAlertTimeout
        )
      ).catch(() => request.finish({ error: true, reason: 'synthesis' }));
    } catch (_) {
      request.finish({ error: true, reason: 'synthesis' });
    }
  };
}

export function cacheElevenLabsVoices(voices) {
  return {
    type: CACHE_ELEVENLABS_VOICES,
    voices
  };
}

export function clearElevenLabsCache() {
  return {
    type: CLEAR_ELEVENLABS_CACHE
  };
}

export function setCurrentVoiceSource() {
  return (dispatch, getState) => {
    const { isCloud = null, voiceURI, lang } = getState().speech.options;
    if (isCloud === null && !!voiceURI && !!lang) {
      dispatch(changeVoice(voiceURI, lang));
      return;
    }
  };
}

export function changeElevenLabsStability(stability) {
  return {
    type: CHANGE_ELEVENLABS_STABILITY,
    stability
  };
}

export function changeElevenLabsSimilarity(similarity) {
  return {
    type: CHANGE_ELEVENLABS_SIMILARITY,
    similarity
  };
}

export function changeElevenLabsStyle(style) {
  return {
    type: CHANGE_ELEVENLABS_STYLE,
    style
  };
}

export function resetElevenLabsSettings() {
  return {
    type: RESET_ELEVENLABS_SETTINGS
  };
}
