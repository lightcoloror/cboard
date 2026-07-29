import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ON_DEVICE_SPEECH_STATUS,
  normalizeBrowserRecognitionLanguage
} from './browserSpeech';

const CORDOVA_SPEECH_PLATFORMS = new Set(['android', 'ios']);

export function getCordovaSpeechRecognitionPlugin(
  scope = typeof window === 'undefined' ? null : window
) {
  if (
    !scope ||
    !scope.cordova ||
    !CORDOVA_SPEECH_PLATFORMS.has(scope.cordova.platformId)
  ) {
    return null;
  }

  const plugin = scope.plugins && scope.plugins.speechRecognition;
  const requiredMethods = [
    'isRecognitionAvailable',
    'startListening',
    'stopListening',
    'hasPermission',
    'requestPermission'
  ];

  return plugin &&
    requiredMethods.every(method => typeof plugin[method] === 'function')
    ? plugin
    : null;
}

export function callCordovaSpeechRecognition(plugin, method, args = []) {
  return new Promise((resolve, reject) => {
    if (!plugin || typeof plugin[method] !== 'function') {
      reject(new Error('Cordova speech recognition is unavailable'));
      return;
    }

    plugin[method](resolve, reject, ...args);
  });
}

export function normalizeCordovaRecognitionResult(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

export function getCordovaSpeechErrorMessage(error) {
  const message =
    typeof error === 'string'
      ? error
      : error && typeof error.message === 'string'
      ? error.message
      : '';

  if (/permission|denied|not authorized/i.test(message)) {
    return '麦克风权限被拒绝，请在系统设置中允许访问麦克风';
  }
  if (/on-device|local recognition/i.test(message)) {
    return '当前设备或语言不支持设备内语音识别';
  }
  if (/no speech|no match/i.test(message)) {
    return '未检测到语音，请重试';
  }
  return '语音识别失败，请重试';
}

export function useCordovaSpeechRecognition(language = 'zh-CN') {
  const plugin = getCordovaSpeechRecognitionPlugin();
  const isPluginPresent = Boolean(plugin);
  const onDeviceSupported = Boolean(
    plugin && typeof plugin.isOnDeviceRecognitionAvailable === 'function'
  );
  const [isAvailable, setIsAvailable] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const [onDeviceStatus, setOnDeviceStatus] = useState(
    onDeviceSupported
      ? ON_DEVICE_SPEECH_STATUS.unknown
      : ON_DEVICE_SPEECH_STATUS.unsupported
  );
  const [onDeviceLanguage, setOnDeviceLanguage] = useState(
    normalizeBrowserRecognitionLanguage(language)
  );
  const mountedRef = useRef(true);
  const generationRef = useRef(0);

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
      try {
        const available = await callCordovaSpeechRecognition(
          plugin,
          'isOnDeviceRecognitionAvailable',
          [normalizedLanguage]
        );
        const status = available
          ? ON_DEVICE_SPEECH_STATUS.available
          : ON_DEVICE_SPEECH_STATUS.unavailable;
        if (mountedRef.current) {
          setOnDeviceStatus(status);
          if (available) setIsAvailable(true);
        }
        return status;
      } catch (checkError) {
        if (mountedRef.current) {
          setOnDeviceStatus(ON_DEVICE_SPEECH_STATUS.error);
        }
        return ON_DEVICE_SPEECH_STATUS.error;
      }
    },
    [language, onDeviceSupported, plugin]
  );

  useEffect(
    () => {
      mountedRef.current = true;
      if (!plugin) {
        setIsAvailable(false);
        return undefined;
      }

      setIsAvailable(false);

      void callCordovaSpeechRecognition(plugin, 'isRecognitionAvailable')
        .then(available => {
          if (mountedRef.current && available) setIsAvailable(true);
        })
        .catch(() => {
          if (mountedRef.current) setIsAvailable(false);
        });

      if (onDeviceSupported) {
        void checkOnDeviceAvailability(language);
      }

      return () => {
        mountedRef.current = false;
        generationRef.current += 1;
        plugin.stopListening(() => {}, () => {});
      };
    },
    [checkOnDeviceAvailability, language, onDeviceSupported, plugin]
  );

  const startListening = useCallback(
    (onResult, options = {}) => {
      if (!plugin || !isAvailable) return;

      const recognitionLanguage = normalizeBrowserRecognitionLanguage(
        options.language || language
      );
      const processLocally = options.processLocally === true;
      const localLanguageReady =
        onDeviceStatus === ON_DEVICE_SPEECH_STATUS.available &&
        onDeviceLanguage === recognitionLanguage;

      if (processLocally && !localLanguageReady) {
        setError('设备内语音包尚未就绪，请先检查系统语言包');
        return;
      }

      const generation = generationRef.current + 1;
      generationRef.current = generation;
      setError(null);

      const fail = recognitionError => {
        if (!mountedRef.current || generationRef.current !== generation) {
          return;
        }
        setIsListening(false);
        setError(getCordovaSpeechErrorMessage(recognitionError));
      };

      void (async () => {
        try {
          const hasPermission = await callCordovaSpeechRecognition(
            plugin,
            'hasPermission'
          );
          if (!hasPermission) {
            await callCordovaSpeechRecognition(plugin, 'requestPermission');
          }
          if (!mountedRef.current || generationRef.current !== generation) {
            return;
          }

          setIsListening(true);
          plugin.startListening(
            matches => {
              if (!mountedRef.current || generationRef.current !== generation) {
                return;
              }
              setIsListening(false);
              const finalText = normalizeCordovaRecognitionResult(matches);
              if (finalText && typeof onResult === 'function') {
                onResult(finalText);
              }
            },
            fail,
            {
              language: recognitionLanguage,
              matches: 1,
              showPartial: false,
              showPopup: false,
              onDevice: processLocally
            }
          );
        } catch (permissionError) {
          fail(permissionError);
        }
      })();
    },
    [isAvailable, language, onDeviceLanguage, onDeviceStatus, plugin]
  );

  const stopListening = useCallback(
    () => {
      generationRef.current += 1;
      if (plugin) plugin.stopListening(() => {}, () => {});
      if (mountedRef.current) setIsListening(false);
    },
    [plugin]
  );

  return {
    isPluginPresent,
    isAvailable,
    isListening,
    interimText: '',
    error,
    onDeviceSupported,
    onDeviceStatus,
    onDeviceLanguage,
    checkOnDeviceAvailability,
    installOnDeviceLanguage: checkOnDeviceAvailability,
    startListening,
    stopListening
  };
}
