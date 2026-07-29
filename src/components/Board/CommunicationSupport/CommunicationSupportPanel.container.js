import { connect } from 'react-redux';
import { injectIntl } from 'react-intl';
import {
  changeOutput,
  createBoard,
  switchBoard,
  updateBoard
} from '../Board.actions';
import { addBoardCommunicator } from '../../Communicator/Communicator.actions';
import { updateDisplaySettings } from '../../App/App.actions';
import {
  cancelSpeech,
  changeRate,
  speak
} from '../../../providers/SpeechProvider/SpeechProvider.actions';
import CommunicationSupportPanel from './CommunicationSupportPanel.component';

export const mapStateToProps = ({ board, app, speech = {} }, ownProps) => ({
  boards: board.boards || [],
  output: board.output || [],
  activeBoardId: board.activeBoardId,
  intl: ownProps.intl,
  isLogged: Boolean(
    !ownProps.demoMode && app && app.userData && app.userData.authToken
  ),
  displaySettings: (app && app.displaySettings) || {},
  speechSettings: {
    voiceURI: speech.options && speech.options.voiceURI,
    pitch: speech.options && speech.options.pitch,
    rate:
      speech.options && Number.isFinite(Number(speech.options.rate))
        ? Number(speech.options.rate)
        : 1,
    elevenLabsApiKey: speech.elevenLabsApiKey || '',
    elevenLabsVoiceSettings: speech.elevenLabsVoiceSettings || {}
  },
  copyOverrides: ownProps.copyOverrides,
  demoMode: Boolean(ownProps.demoMode),
  pictogramOrdering: ownProps.pictogramOrdering || {},
  onPictogramUsed: ownProps.onPictogramUsed
});

export const mapDispatchToProps = dispatch => ({
  onCreateCommunicationBoard: board => {
    dispatch(createBoard(board));
    dispatch(addBoardCommunicator(board.id));
    return board.id;
  },
  onUpdateCommunicationBoard: board => {
    dispatch(updateBoard(board));
    return true;
  },
  onApplyOutput: nextOutput => dispatch(changeOutput(nextOutput)),
  onJumpBoard: boardId => dispatch(switchBoard(boardId)),
  onSpeak: (text, onend) => dispatch(speak(text, onend)),
  onCancelSpeech: () => dispatch(cancelSpeech()),
  onChangeSpeechRate: rate => dispatch(changeRate(rate)),
  onChangeDisplaySettings: displaySettings =>
    dispatch(updateDisplaySettings(displaySettings))
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(injectIntl(CommunicationSupportPanel));
