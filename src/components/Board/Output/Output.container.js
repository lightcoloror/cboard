import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { injectIntl, intlShape } from 'react-intl';
import { connect } from 'react-redux';
import keycode from 'keycode';
import shortid from 'shortid';
import { equals } from 'ramda';
import {
  getCommunicationStorageScopeKey,
  loadPersonalImageRuntime
} from '../../../common/communicationSupport/localData';
import { applyPersonalImagePreferencesToItems } from '../../../common/communicationSupport/personalImagePreferences';
import { playExpressionOutput } from '../../../common/communicationSupport/expressionPlaybackCoordinator';
import { createBrowserExpressionAudio } from '../../../common/communicationSupport/browserExpressionAudio';
import { subscribeSpeechInterruption } from '../../../providers/SpeechProvider/speechInterruption';
import messages from '../Board.messages';
import { showNotification } from '../../Notifications/Notifications.actions';
import { isAndroid } from '../../../cordova-util';

import {
  cancelSpeech,
  speak
} from '../../../providers/SpeechProvider/SpeechProvider.actions';

import { changeOutput, clickOutput, changeLiveMode } from '../Board.actions';
import SymbolOutput from './SymbolOutput';

function translateOutput(output, intl) {
  const translatedOutput = output.map(value => {
    let translatedValue = { ...value };

    if (value.labelKey && intl.messages[value.labelKey]) {
      translatedValue.label = intl.formatMessage({ id: value.labelKey });
    }
    return translatedValue;
  });
  return translatedOutput;
}

export class OutputContainer extends Component {
  static propTypes = {
    /**
     * @ignore
     */
    intl: intlShape,
    clickOutput: PropTypes.func.isRequired,
    /**
     * Array of symbols
     */
    output: PropTypes.arrayOf(
      PropTypes.shape({
        /**
         * Image to display
         */
        image: PropTypes.string,
        /**
         * Label to display
         */
        label: PropTypes.oneOfType([PropTypes.string, PropTypes.node])
      })
    )
  };

  static getDerivedStateFromProps(props, state) {
    const scopeChanged = props.outputScope !== state.outputScope;
    if (
      scopeChanged ||
      !equals(props.output, state.observedOutput) ||
      props.intl.messages !== state.intlMessages
    ) {
      const translatedOutput = translateOutput(props.output, props.intl);
      // An unrelated new sequence must never be replaced by an old deletion.
      const retainUndo =
        !scopeChanged && equals(props.output, state.undoTarget);
      return {
        translatedOutput,
        observedOutput: props.output,
        intlMessages: props.intl.messages,
        outputScope: props.outputScope,
        undoHistory: retainUndo ? state.undoHistory : [],
        undoTarget: retainUndo ? state.undoTarget : null
      };
    }
    return null;
  }

  state = {
    translatedOutput: [],
    observedOutput: null,
    intlMessages: null,
    outputScope: undefined,
    undoHistory: [],
    undoTarget: null
  };

  componentDidMount() {
    this.unsubscribeSpeech = subscribeSpeechInterruption(owner => {
      if (this.playbackActive && owner !== this.playbackOwner) {
        // The action already owns provider cancellation/start. Do not cancel
        // again after a newer tile or candidate has started speaking.
        this.stopPlayback(false);
      }
    });
    document.addEventListener('keydown', this.handleRepeatLastSpokenSentence);
  }
  componentDidUpdate(previousProps) {
    if (
      this.playbackActive &&
      (previousProps.outputScope !== this.props.outputScope ||
        previousProps.isLiveMode !== this.props.isLiveMode ||
        previousProps.intl.messages !== this.props.intl.messages ||
        !equals(this.playbackExpectedOutput, this.props.output))
    ) {
      this.stopPlayback();
    }
  }
  componentWillUnmount() {
    if (this.unsubscribeSpeech) this.unsubscribeSpeech();
    if (this.playbackActive) this.stopPlayback();
    document.removeEventListener(
      'keydown',
      this.handleRepeatLastSpokenSentence
    );
  }

  clearOutput() {
    const { output, isLiveMode } = this.props;
    if (
      !output.length ||
      (isLiveMode &&
        output.length === 1 &&
        output[0].type === 'live' &&
        !output[0].label)
    )
      return;
    this.applyDeletion(isLiveMode ? [this.createEmptyLiveTile()] : []);
  }

  popOutput() {
    this.spliceOutput(this.props.output.length - 1);
  }

  spliceOutput(index) {
    const { isLiveMode } = this.props;
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.props.output.length
    )
      return;
    // Clearing live mode leaves a blank input tile. Backspace on that placeholder
    // is not a new deletion and must not hide the real sequence behind an empty undo.
    if (
      isLiveMode &&
      this.props.output.length === 1 &&
      this.props.output[0].type === 'live' &&
      !this.props.output[0].label
    )
      return;
    const output = [...this.props.output];
    output.splice(index, 1);
    this.applyDeletion(
      isLiveMode && !output.length ? [this.createEmptyLiveTile()] : output
    );
  }

  applyDeletion(nextOutput) {
    const before = this.props.output;
    if (equals(before, nextOutput)) return;
    // Session-only snapshots: do not persist or sync personal pictures. Keep
    // complete tile fields (text, audio, video and chosen image), not a rematch.
    this.setState(
      state => ({
        undoHistory: [...state.undoHistory, before.slice()].slice(-20),
        undoTarget: nextOutput
      }),
      () => this.props.changeOutput(nextOutput)
    );
  }

  handleUndoDelete = () => {
    const { undoHistory, undoTarget, outputScope } = this.state;
    if (
      !undoHistory.length ||
      outputScope !== this.props.outputScope ||
      !equals(this.props.output, undoTarget)
    )
      return;
    const restored = undoHistory[undoHistory.length - 1];
    this.stopPlayback();
    this.setState(
      {
        undoHistory: undoHistory.slice(0, -1),
        undoTarget: restored
      },
      () => this.props.changeOutput(restored)
    );
  };
  playbackGeneration = 0;
  playbackOwner = {};
  playbackActive = false;
  playbackExpectedOutput = null;
  finishSpeech = null;
  audioPort = createBrowserExpressionAudio();

  stopPlayback = (cancelProvider = true) => {
    this.playbackGeneration += 1;
    this.playbackActive = false;
    this.audioPort.stop();
    if (this.finishSpeech) {
      this.finishSpeech({ ok: false, reason: 'stopped', message: '朗读已停止。' });
    }
    if (cancelProvider) this.props.cancelSpeech();
  };

  speakOutput(text) {
    return this.play(text);
  }

  speakFrame(text, generation) {
    if (generation !== this.playbackGeneration)
      return Promise.resolve({ ok: false, reason: 'stopped' });
    this.props.clickOutput(text.trim());
    return new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.finishSpeech === finish) this.finishSpeech = null;
        resolve(result);
      };
      const timer = setTimeout(() => {
        finish({ ok: false, reason: 'timeout' });
        this.props.cancelSpeech();
      }, 60000);
      this.finishSpeech = finish;
      try {
        const result = this.props.speak(text, event => finish(
          event?.error ? { ok: false, reason: 'provider' } : { ok: true }
        ), { playbackOwner: this.playbackOwner });
        if (result?.catch) result.catch(() => finish({ ok: false, reason: 'provider' }));
      } catch (_) {
        finish({ ok: false, reason: 'provider' });
      }
    });
  }

  async play(liveText = '') {
    this.stopPlayback();
    const generation = this.playbackGeneration;
    this.playbackExpectedOutput = this.props.output;
    this.playbackActive = true;
    try {
      return await playExpressionOutput({
        output: liveText ? [{ label: liveText }] : this.state.translatedOutput,
        speechPort: { speak: text => this.speakFrame(text, generation) },
        audioPort: this.audioPort,
        isCurrent: () => generation === this.playbackGeneration
      });
    } finally {
      if (generation === this.playbackGeneration) this.playbackActive = false;
    }
  }

  handleBackspaceClick = () => {
    this.stopPlayback();
    this.popOutput();
  };

  handleClearClick = () => {
    this.stopPlayback();
    this.clearOutput();
  };

  handlePhraseToShare = () => {
    if (this.props.output.length) {
      const labels = this.props.output.map(symbol => symbol.label);
      return labels.join(' ');
    }
    return '';
  };

  handleCopyClick = async () => {
    const { intl, showNotification } = this.props;
    const labels = this.props.output.map(symbol => symbol.label);
    try {
      if (isAndroid()) {
        await window.cordova.plugins.clipboard.copy(labels.join(' '));
      } else {
        await navigator.clipboard.writeText(labels.join(' '));
      }
      showNotification(intl.formatMessage(messages.copyMessage));
    } catch (err) {
      showNotification(intl.formatMessage(messages.failedToCopy));
      console.log(err.message);
    }
  };

  handleRemoveClick = index => event => {
    this.stopPlayback();
    this.spliceOutput(index);
  };

  handleRepeatLastSpokenSentence = event => {
    const Z_KEY_CODE = 90;
    const Y_KEY_CODE = 89;
    const { output } = this.props;
    if (
      ((event.ctrlKey && event.shiftKey && event.keyCode === Z_KEY_CODE) ||
        (event.ctrlKey && event.keyCode === Y_KEY_CODE)) &&
      !!output.length
    ) {
      const isLastSpokenSymbol = (element, index) => {
        if (output.length === 1) return true;
        if (element.label) {
          return element.type === 'live' ? index < output.length - 1 : true;
        }
        return false;
      };

      const lastSpokenSymbol = output.findLast((element, index) =>
        isLastSpokenSymbol(element, index)
      );
      const text = lastSpokenSymbol ? lastSpokenSymbol.label : '';
      this.speakOutput(text);
    }
  };

  handleOutputClick = event => {
    const targetEl = event.target;
    const targetElLow = targetEl.tagName.toLowerCase();
    if (targetElLow === 'div' || targetElLow === 'p') {
      this.play();
    }
  };

  handleOutputKeyDown = event => {
    if (event.keyCode === keycode('enter')) {
      const targetEl = event.target;
      if (targetEl.tagName.toLowerCase() === 'div') {
        this.play();
      } else if (targetEl.tagName.toLowerCase() === 'textarea') {
        this.play(event.target.value);
        this.addLiveOutputTile();
      }
    }
  };

  defaultLiveTile = {
    backgroundColor: 'rgb(255, 241, 118)',
    image: '',
    label: '',
    labelKey: '',
    type: 'live'
  };

  createEmptyLiveTile() {
    return { ...this.defaultLiveTile, id: shortid.generate() };
  }

  addLiveOutputTile() {
    const { changeOutput } = this.props;
    const next = [...this.state.translatedOutput, this.createEmptyLiveTile()];
    // Enter appends an empty input after speaking the submitted text. That
    // expected append must not cancel the utterance; other edits still do.
    if (this.playbackActive) this.playbackExpectedOutput = next;
    changeOutput(next);
  }

  addLiveOutputTileClearOutput() {
    const { changeOutput } = this.props;
    this.setState({ translatedOutput: [] });
    changeOutput([this.createEmptyLiveTile()]);
  }

  handleSwitchLiveMode = event => {
    const { changeLiveMode, isLiveMode } = this.props;

    if (!isLiveMode) {
      this.addLiveOutputTile();
    }
    changeLiveMode();
  };

  handleWriteSymbol = index => event => {
    const { changeOutput, intl } = this.props;
    const output = [...this.props.output];
    const newEl = {
      ...output[index],
      label: event.target.value
    };
    output.splice(index, 1, newEl);
    changeOutput(output);
    const translated = translateOutput(output, intl);
    this.setState({ translatedOutput: translated });
  };

  render() {
    const {
      output,
      navigationSettings,
      isLiveMode,
      increaseOutputButtons
    } = this.props;
    const tabIndex = output.length ? '0' : '-1';
    return (
      <SymbolOutput
        onBackspaceClick={this.handleBackspaceClick}
        onClearClick={this.handleClearClick}
        onUndoDelete={this.handleUndoDelete}
        canUndoDelete={
          this.state.undoHistory.length > 0 &&
          equals(output, this.state.undoTarget)
        }
        onCopyClick={this.handleCopyClick}
        onRemoveClick={this.handleRemoveClick}
        onClick={isLiveMode ? undefined : this.handleOutputClick}
        onKeyDown={this.handleOutputKeyDown}
        onSwitchLiveMode={this.handleSwitchLiveMode}
        symbols={this.state.translatedOutput}
        isLiveMode={isLiveMode}
        tabIndex={tabIndex}
        navigationSettings={navigationSettings}
        increaseOutputButtons={increaseOutputButtons}
        phrase={this.handlePhraseToShare()}
        onWriteSymbol={this.handleWriteSymbol}
      />
    );
  }
}

const mapStateToProps = ({ board, app, communicator }) => {
  const personalImageRuntime = loadPersonalImageRuntime();

  return {
    output: applyPersonalImagePreferencesToItems(
      board.output,
      personalImageRuntime.preferences,
      personalImageRuntime.identity
    ),
    outputScope: JSON.stringify([
      getCommunicationStorageScopeKey(),
      app.userData &&
        (app.userData.id || app.userData._id || app.userData.email),
      communicator && communicator.activeCommunicatorId
    ]),
    isLiveMode: board.isLiveMode,
    navigationSettings: app.navigationSettings,
    increaseOutputButtons: app.displaySettings.increaseOutputButtons
  };
};

const mapDispatchToProps = {
  cancelSpeech,
  changeOutput,
  clickOutput,
  speak,
  showNotification,
  changeLiveMode
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(injectIntl(OutputContainer));
