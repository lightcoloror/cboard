import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { injectIntl, intlShape } from 'react-intl';
import MicIcon from '@material-ui/icons/Mic';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import ClearIcon from '@material-ui/icons/Clear';
import LinearProgress from '@material-ui/core/LinearProgress';

import IconButton from '../UI/IconButton';
import messages from './VoiceRecorder.messages';
import { createVoiceRecordingSession } from './voiceRecordingAdapter';
import './VoiceRecorder.css';

const MAX_RECORDING_DURATION_MS = 30000;

class VoiceRecorder extends Component {
  static propTypes = {
    /**
     * Audio source
     */
    src: PropTypes.string,
    /**
     * Callback, fired when audio recording changes
     */
    onChange: PropTypes.func.isRequired,
    /**
     * User info
     */
    user: PropTypes.object,
    intl: intlShape.isRequired
  };

  state = {
    isStarting: false,
    isRecording: false,
    isPlaying: false,
    recordingError: false
  };

  componentDidMount() {
    this.isMountedComponent = true;
  }

  componentWillUnmount() {
    this.isMountedComponent = false;
    this.clearRecordingTimeout();
    if (this.recordingSession) this.recordingSession.dispose();
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
  }

  clearRecordingTimeout = () => {
    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout);
      this.recordingTimeout = null;
    }
  };

  handleRecordingComplete = sound => {
    this.clearRecordingTimeout();
    this.recordingSession = null;
    const { onChange } = this.props;
    if (onChange) onChange(sound);
    if (this.isMountedComponent) {
      this.setState({
        isStarting: false,
        isRecording: false,
        recordingError: false
      });
    }
  };

  handleRecordingError = error => {
    this.clearRecordingTimeout();
    this.recordingSession = null;
    console.error('Voice recording failed', error);
    if (this.isMountedComponent) {
      this.setState({
        isStarting: false,
        isRecording: false,
        recordingError: true
      });
    }
  };

  startRecording = async () => {
    this.setState({ isStarting: true, recordingError: false });
    try {
      this.recordingSession = createVoiceRecordingSession({
        onRecorded: this.handleRecordingComplete,
        onError: this.handleRecordingError
      });
      await this.recordingSession.start();
      if (!this.isMountedComponent) return;
      this.setState({ isStarting: false, isRecording: true });
      this.recordingTimeout = setTimeout(
        this.stopRecording,
        MAX_RECORDING_DURATION_MS
      );
    } catch (error) {
      if (this.recordingSession) this.recordingSession.dispose();
      this.handleRecordingError(error);
    }
  };

  stopRecording = () => {
    this.clearRecordingTimeout();
    if (this.recordingSession) this.recordingSession.stop();
  };

  playAudio = src => {
    if (this.audio) this.audio.pause();
    this.audio = new Audio();
    this.audio.src = src;
    this.audio.addEventListener('ended', () => {
      if (this.isMountedComponent) this.setState({ isPlaying: false });
      this.audio = null;
    });
    this.audio.addEventListener('error', () => {
      if (this.isMountedComponent) this.setState({ isPlaying: false });
      this.audio = null;
    });
    const playPromise = this.audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        if (this.isMountedComponent) this.setState({ isPlaying: false });
      });
    }
  };

  handleRecordClick = () => {
    if (this.state.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  };

  handlePlayClick = () => {
    const { src } = this.props;
    this.setState({ isPlaying: true });
    this.playAudio(src);
  };

  handleClear = () => {
    const { onChange } = this.props;
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    this.setState({ isPlaying: false, recordingError: false });
    onChange('');
  };

  render() {
    const { src, intl } = this.props;
    const { isStarting, isRecording, isPlaying, recordingError } = this.state;
    const recordStyle = {
      color: isRecording ? 'red' : 'grey'
    };
    const playStyle = {
      color: isPlaying ? 'green' : 'grey'
    };

    return (
      <div className="VoiceRecorder">
        <IconButton
          onClick={this.handleRecordClick}
          label={intl.formatMessage(messages.record)}
          disabled={isStarting}
        >
          <MicIcon fontSize="large" style={recordStyle} />
        </IconButton>
        {isRecording && (
          <div className="VoiceRecorder__progress">
            <LinearProgress color="secondary" />
          </div>
        )}
        {src && !isRecording && (
          <>
            <IconButton
              onClick={this.handlePlayClick}
              label={intl.formatMessage(messages.play)}
            >
              <PlayArrowIcon fontSize="large" style={playStyle} />
            </IconButton>
            <IconButton
              onClick={this.handleClear}
              label={intl.formatMessage(messages.clear)}
            >
              <ClearIcon fontSize="large" style={{ color: 'grey' }} />
            </IconButton>
          </>
        )}
        {recordingError && (
          <div className="VoiceRecorder__error" role="alert">
            {intl.formatMessage(messages.recordingFailed)}
          </div>
        )}
      </div>
    );
  }
}

export default injectIntl(VoiceRecorder);
