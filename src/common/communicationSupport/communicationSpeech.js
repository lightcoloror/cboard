import { useBrowserSpeechRecognition } from './browserSpeech';
import { useCordovaSpeechRecognition } from './cordovaSpeech';

export function useCommunicationSpeechRecognition(language = 'zh-CN') {
  const cordovaSpeech = useCordovaSpeechRecognition(language);
  const browserSpeech = useBrowserSpeechRecognition(language, {
    enabled: !cordovaSpeech.isPluginPresent
  });

  return cordovaSpeech.isPluginPresent ? cordovaSpeech : browserSpeech;
}
