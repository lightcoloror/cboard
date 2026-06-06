import { useCallback, useEffect, useRef, useState } from 'react';

export function useBrowserSpeechRecognition(language = 'zh-CN') {
  const SpeechRecognitionImpl =
    (typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition)) ||
    null;

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
      if (!SpeechRecognitionImpl) {
        return;
      }

      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      setError(null);
      setInterimText('');
      onResultRef.current = onResult;

      const recognition = new SpeechRecognitionImpl();
      recognition.lang = language;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        if (mountedRef.current) {
          setIsListening(true);
        }
      };

      recognition.onresult = event => {
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

        if (!mountedRef.current) {
          return;
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
        if (!mountedRef.current) {
          return;
        }

        setIsListening(false);
        setInterimText('');

        if (event.error === 'not-allowed') {
          setError('麦克风权限被拒绝');
        } else if (event.error === 'no-speech') {
          setError('未检测到语音');
        } else if (event.error !== 'aborted') {
          setError('语音识别失败');
        }
      };

      recognition.onend = () => {
        if (!mountedRef.current) {
          return;
        }

        setIsListening(false);
        setInterimText('');
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    },
    [SpeechRecognitionImpl, language]
  );

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    recognitionRef.current = null;

    if (mountedRef.current) {
      setIsListening(false);
      setInterimText('');
    }
  }, []);

  return {
    isAvailable: Boolean(SpeechRecognitionImpl),
    isListening,
    interimText,
    error,
    startListening,
    stopListening
  };
}
