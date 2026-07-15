import { useCallback, useEffect, useRef, useState } from 'react';

export function isWeChatWebView(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
) {
  return /MicroMessenger/i.test(userAgent || '');
}

export function shouldUseBrowserSpeechRecognition(userAgent) {
  return !isWeChatWebView(userAgent);
}

export function useBrowserSpeechRecognition(language = 'zh-CN') {
  const SpeechRecognitionImpl =
    (typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition)) ||
    null;
  const isAvailable =
    Boolean(SpeechRecognitionImpl) && shouldUseBrowserSpeechRecognition();

  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const onResultRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const startListening = useCallback(
    onResult => {
      if (!isAvailable) {
        return;
      }

      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }

      setError(null);
      setInterimText('');
      onResultRef.current = onResult;

      const recognition = new SpeechRecognitionImpl();
      const isCurrentRecognition = () => recognitionRef.current === recognition;
      recognition.lang = language;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        if (mountedRef.current && isCurrentRecognition()) {
          setIsListening(true);
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

        if (event.error === 'not-allowed') {
          setError('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
        } else if (event.error === 'no-speech') {
          setError('未检测到语音，请重试');
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
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
      } catch (error) {
        recognitionRef.current = null;
        setIsListening(false);
        setInterimText('');
        setError('无法启动语音识别，请重试');
      }
    },
    [SpeechRecognitionImpl, isAvailable, language]
  );

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    if (recognition) {
      recognition.stop();
    }

    if (mountedRef.current) {
      setIsListening(false);
      setInterimText('');
    }
  }, []);

  return {
    isAvailable,
    isListening,
    interimText,
    error,
    startListening,
    stopListening
  };
}
