import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserAudioLevelMonitor } from './browserAudioLevel';

export function isWeChatWebView(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
) {
  return /MicroMessenger/i.test(userAgent || '');
}

export function shouldUseBrowserSpeechRecognition(userAgent) {
  return !isWeChatWebView(userAgent);
}

export function normalizeBrowserRecognitionLanguage(value) {
  return value === 'yue-HK' ? 'yue-HK' : 'zh-CN';
}

export const ON_DEVICE_SPEECH_STATUS = Object.freeze({
  unsupported: 'unsupported',
  unknown: 'unknown',
  checking: 'checking',
  available: 'available',
  downloadable: 'downloadable',
  downloading: 'downloading',
  installing: 'installing',
  unavailable: 'unavailable',
  error: 'error'
});

export function supportsOnDeviceSpeechRecognition(SpeechRecognitionImpl) {
  return Boolean(
    SpeechRecognitionImpl &&
      typeof SpeechRecognitionImpl.available === 'function' &&
      typeof SpeechRecognitionImpl.install === 'function'
  );
}

export function normalizeOnDeviceSpeechStatus(value) {
  return [
    ON_DEVICE_SPEECH_STATUS.available,
    ON_DEVICE_SPEECH_STATUS.downloadable,
    ON_DEVICE_SPEECH_STATUS.downloading,
    ON_DEVICE_SPEECH_STATUS.unavailable
  ].includes(value)
    ? value
    : ON_DEVICE_SPEECH_STATUS.error;
}

export async function checkOnDeviceSpeechRecognition(
  SpeechRecognitionImpl,
  language = 'zh-CN'
) {
  if (!supportsOnDeviceSpeechRecognition(SpeechRecognitionImpl)) {
    return ON_DEVICE_SPEECH_STATUS.unsupported;
  }

  try {
    const result = await SpeechRecognitionImpl.available({
      langs: [normalizeBrowserRecognitionLanguage(language)],
      processLocally: true
    });
    return normalizeOnDeviceSpeechStatus(result);
  } catch (error) {
    return ON_DEVICE_SPEECH_STATUS.error;
  }
}

export async function installOnDeviceSpeechRecognition(
  SpeechRecognitionImpl,
  language = 'zh-CN'
) {
  if (!supportsOnDeviceSpeechRecognition(SpeechRecognitionImpl)) {
    return ON_DEVICE_SPEECH_STATUS.unsupported;
  }

  try {
    const installed = await SpeechRecognitionImpl.install({
      langs: [normalizeBrowserRecognitionLanguage(language)],
      processLocally: true
    });
    if (!installed) return ON_DEVICE_SPEECH_STATUS.error;
    return checkOnDeviceSpeechRecognition(SpeechRecognitionImpl, language);
  } catch (error) {
    return ON_DEVICE_SPEECH_STATUS.error;
  }
}

function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function useBrowserSpeechRecognition(language = 'zh-CN', options = {}) {
  const enabled = options.enabled !== false;
  const createAudioLevelMonitor =
    options.createAudioLevelMonitor || createBrowserAudioLevelMonitor;
  const SpeechRecognitionImpl =
    (typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition)) ||
    null;
  const isAvailable =
    enabled &&
    Boolean(SpeechRecognitionImpl) &&
    shouldUseBrowserSpeechRecognition();
  const onDeviceSupported =
    isAvailable && supportsOnDeviceSpeechRecognition(SpeechRecognitionImpl);

  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioLevelAvailable, setAudioLevelAvailable] = useState(false);
  const [onDeviceStatus, setOnDeviceStatus] = useState(
    onDeviceSupported
      ? ON_DEVICE_SPEECH_STATUS.unknown
      : ON_DEVICE_SPEECH_STATUS.unsupported
  );
  const [onDeviceLanguage, setOnDeviceLanguage] = useState(
    normalizeBrowserRecognitionLanguage(language)
  );
  const recognitionRef = useRef(null);
  const onResultRef = useRef(null);
  const mountedRef = useRef(true);
  const audioLevelMonitorRef = useRef(null);
  const audioLevelMonitorGenerationRef = useRef(0);

  const stopAudioLevelMonitor = useCallback(() => {
    audioLevelMonitorGenerationRef.current += 1;
    const monitor = audioLevelMonitorRef.current;
    audioLevelMonitorRef.current = null;
    if (monitor && typeof monitor.stop === 'function') {
      monitor.stop();
    }
    if (mountedRef.current) {
      setAudioLevel(0);
      setAudioLevelAvailable(false);
    }
  }, []);

  const startAudioLevelMonitor = useCallback(
    () => {
      stopAudioLevelMonitor();
      const monitorGeneration = audioLevelMonitorGenerationRef.current;
      let monitor;

      try {
        monitor = createAudioLevelMonitor({
          onLevel: level => {
            if (
              mountedRef.current &&
              audioLevelMonitorGenerationRef.current === monitorGeneration
            ) {
              setAudioLevel(level);
            }
          },
          onAvailabilityChange: available => {
            if (
              mountedRef.current &&
              audioLevelMonitorGenerationRef.current === monitorGeneration
            ) {
              setAudioLevelAvailable(available);
            }
          }
        });
      } catch (error) {
        return;
      }

      if (!monitor || typeof monitor.start !== 'function') return;
      audioLevelMonitorRef.current = monitor;

      try {
        const startResult = monitor.start();
        if (startResult && typeof startResult.catch === 'function') {
          startResult.catch(() => {
            if (
              mountedRef.current &&
              audioLevelMonitorGenerationRef.current === monitorGeneration
            ) {
              setAudioLevel(0);
              setAudioLevelAvailable(false);
            }
          });
        }
      } catch (error) {
        stopAudioLevelMonitor();
      }
    },
    [createAudioLevelMonitor, stopAudioLevelMonitor]
  );

  useEffect(
    () => {
      mountedRef.current = true;

      return () => {
        mountedRef.current = false;
        stopAudioLevelMonitor();
        if (recognitionRef.current) {
          recognitionRef.current.abort();
        }
      };
    },
    [stopAudioLevelMonitor]
  );

  const checkOnDeviceAvailability = useCallback(
    async requestedLanguage => {
      const normalizedLanguage = normalizeBrowserRecognitionLanguage(
        requestedLanguage || language
      );
      if (!onDeviceSupported) {
        setOnDeviceStatus(ON_DEVICE_SPEECH_STATUS.unsupported);
        return ON_DEVICE_SPEECH_STATUS.unsupported;
      }

      setOnDeviceLanguage(normalizedLanguage);
      setOnDeviceStatus(ON_DEVICE_SPEECH_STATUS.checking);
      const status = await checkOnDeviceSpeechRecognition(
        SpeechRecognitionImpl,
        normalizedLanguage
      );
      if (mountedRef.current) setOnDeviceStatus(status);
      return status;
    },
    [SpeechRecognitionImpl, language, onDeviceSupported]
  );

  const installOnDeviceLanguage = useCallback(
    async requestedLanguage => {
      const normalizedLanguage = normalizeBrowserRecognitionLanguage(
        requestedLanguage || language
      );
      if (!onDeviceSupported) {
        setOnDeviceStatus(ON_DEVICE_SPEECH_STATUS.unsupported);
        return ON_DEVICE_SPEECH_STATUS.unsupported;
      }

      setOnDeviceLanguage(normalizedLanguage);
      setOnDeviceStatus(ON_DEVICE_SPEECH_STATUS.installing);
      const status = await installOnDeviceSpeechRecognition(
        SpeechRecognitionImpl,
        normalizedLanguage
      );
      if (mountedRef.current) setOnDeviceStatus(status);
      return status;
    },
    [SpeechRecognitionImpl, language, onDeviceSupported]
  );

  useEffect(
    () => {
      if (!onDeviceSupported) {
        setOnDeviceStatus(ON_DEVICE_SPEECH_STATUS.unsupported);
        return undefined;
      }

      void checkOnDeviceAvailability(language);
      return undefined;
    },
    [checkOnDeviceAvailability, language, onDeviceSupported]
  );

  const startListening = useCallback(
    (onResult, options = {}) => {
      if (!isAvailable) {
        return;
      }

      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      stopAudioLevelMonitor();

      setError(null);
      setInterimText('');
      onResultRef.current = onResult;

      const recognitionLanguage = normalizeBrowserRecognitionLanguage(
        options.language || language
      );
      const localLanguageReady =
        onDeviceStatus === ON_DEVICE_SPEECH_STATUS.available &&
        onDeviceLanguage === recognitionLanguage;
      const processLocally =
        options.processLocally === true ||
        (localLanguageReady && isBrowserOffline());

      if (options.processLocally === true && !localLanguageReady) {
        setError('设备内语音包尚未就绪，请先检查或下载');
        return;
      }

      const recognition = new SpeechRecognitionImpl();
      const isCurrentRecognition = () => recognitionRef.current === recognition;
      if (
        processLocally &&
        !Object.prototype.hasOwnProperty.call(recognition, 'processLocally') &&
        !('processLocally' in recognition)
      ) {
        setError('当前浏览器不能启动设备内语音识别');
        return;
      }
      recognition.lang = recognitionLanguage;
      if (processLocally) recognition.processLocally = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        if (mountedRef.current && isCurrentRecognition()) {
          setIsListening(true);
          startAudioLevelMonitor();
        }
      };

      recognition.onresult = event => {
        if (!mountedRef.current || !isCurrentRecognition()) {
          return;
        }

        let interim = '';
        let finalText = '';

        for (
          let resultIndex = event.resultIndex;
          resultIndex < event.results.length;
          resultIndex += 1
        ) {
          const result = event.results[resultIndex];
          if (result.isFinal) {
            finalText += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }

        setInterimText(interim);

        if (finalText) {
          setInterimText('');
          if (onResultRef.current) {
            onResultRef.current(finalText.trim());
          }
        }
      };

      recognition.onerror = event => {
        if (!mountedRef.current || !isCurrentRecognition()) {
          return;
        }

        setIsListening(false);
        setInterimText('');
        stopAudioLevelMonitor();

        if (event.error === 'not-allowed') {
          setError('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
        } else if (event.error === 'no-speech') {
          setError('未检测到语音，请重试');
        } else if (
          event.error === 'language-not-supported' ||
          event.error === 'language-unavailable'
        ) {
          setOnDeviceStatus(ON_DEVICE_SPEECH_STATUS.downloadable);
          setError('设备内语音包不可用，请重新检查或下载');
        } else if (event.error !== 'aborted') {
          setError('语音识别失败，请重试');
        }
      };

      recognition.onend = () => {
        if (!mountedRef.current || !isCurrentRecognition()) {
          return;
        }

        setIsListening(false);
        setInterimText('');
        stopAudioLevelMonitor();
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
      } catch (error) {
        recognitionRef.current = null;
        setIsListening(false);
        setInterimText('');
        stopAudioLevelMonitor();
        setError('无法启动语音识别，请重试');
      }
    },
    [
      SpeechRecognitionImpl,
      isAvailable,
      language,
      onDeviceLanguage,
      onDeviceStatus,
      startAudioLevelMonitor,
      stopAudioLevelMonitor
    ]
  );

  const stopListening = useCallback(
    () => {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;

      if (recognition) {
        recognition.stop();
      }
      stopAudioLevelMonitor();

      if (mountedRef.current) {
        setIsListening(false);
        setInterimText('');
      }
    },
    [stopAudioLevelMonitor]
  );

  return {
    isAvailable,
    isListening,
    interimText,
    error,
    audioLevel,
    audioLevelAvailable,
    onDeviceSupported,
    onDeviceStatus,
    onDeviceLanguage,
    checkOnDeviceAvailability,
    installOnDeviceLanguage,
    startListening,
    stopListening
  };
}
