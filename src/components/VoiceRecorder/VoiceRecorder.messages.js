import { defineMessages } from 'react-intl';

export default defineMessages({
  play: {
    id: 'cboard.components.VoiceRecorder.play',
    defaultMessage: 'Play recording'
  },
  clear: {
    id: 'cboard.components.VoiceRecorder.clear',
    defaultMessage: 'Clear recording'
  },
  record: {
    id: 'cboard.components.VoiceRecorder.record',
    defaultMessage: 'Record'
  },
  recordingFailed: {
    id: 'cboard.components.VoiceRecorder.recordingFailed',
    defaultMessage:
      'Unable to record. Check microphone permission and try again.'
  }
});
