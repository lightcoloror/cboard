import { connect } from 'react-redux';
import { injectIntl } from 'react-intl';
import { changeOutput, switchBoard } from '../Board.actions';
import {
  cancelSpeech,
  speak
} from '../../../providers/SpeechProvider/SpeechProvider.actions';
import CommunicationSupportPanel from './CommunicationSupportPanel.component';

export const mapStateToProps = ({ board, app }, ownProps) => ({
  boards: board.boards || [],
  output: board.output || [],
  activeBoardId: board.activeBoardId,
  intl: ownProps.intl,
  isLogged: Boolean(app && app.userData && app.userData.authToken),
  copyOverrides: ownProps.copyOverrides
});

export const mapDispatchToProps = dispatch => ({
  onApplyOutput: nextOutput => dispatch(changeOutput(nextOutput)),
  onJumpBoard: boardId => dispatch(switchBoard(boardId)),
  onSpeak: (text, onend) => dispatch(speak(text, onend)),
  onCancelSpeech: () => dispatch(cancelSpeech())
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(injectIntl(CommunicationSupportPanel));
