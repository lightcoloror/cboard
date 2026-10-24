import { connect } from 'react-redux';
import { injectIntl } from 'react-intl';
import {
  changeOutput,
  switchBoard
} from '../Board.actions';
import { saveVerifiedBoard } from '../../../common/communicationSupport/verifiedBoardPersistence';
import { getGalleryTileUndo } from '../../../common/communicationSupport/webGalleryTileUndo';
import { getVisibleBoards } from '../Board.selectors';
import { updateDisplaySettings } from '../../App/App.actions';
import {
  cancelSpeech,
  changeRate,
  speak
} from '../../../providers/SpeechProvider/SpeechProvider.actions';
import CommunicationSupportPanel from './CommunicationSupportPanel.component';

export const mapStateToProps = ({ board, app, speech = {} }, ownProps) => ({
  boards: getVisibleBoards({ board: { ...board, boards: board.boards || [] } }),
  output: board.output || [],
  activeBoardId: board.activeBoardId,
  intl: ownProps.intl,
  isLogged: Boolean(
    !ownProps.demoMode && app && app.userData && app.userData.authToken
  ),
  accountId:
    !ownProps.demoMode && app && app.userData
      ? String(app.userData.id || app.userData._id || '')
      : '',
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
  getGalleryTileUndo: () => dispatch(getGalleryTileUndo()),
  onCreateCommunicationBoard: (board, options = {}) =>
    dispatch(saveVerifiedBoard(board, { ...options, expectedBoard: null, create: true })),
  onUpdateCommunicationBoard: (board, options) =>
    dispatch(saveVerifiedBoard(board, options)),
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
