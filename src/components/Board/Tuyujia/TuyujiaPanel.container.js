import { connect } from 'react-redux';
import { injectIntl } from 'react-intl';
import { changeOutput, switchBoard } from '../Board.actions';
import {
  cancelSpeech,
  speak
} from '../../../providers/SpeechProvider/SpeechProvider.actions';
import TuyujiaPanel from './TuyujiaPanel.component';

const mapStateToProps = ({ board, app }, ownProps) => ({
  boards: board.boards || [],
  output: board.output || [],
  activeBoardId: board.activeBoardId,
  intl: ownProps.intl,
  isLogged: Boolean(app && app.userData && app.userData.authToken)
});

const mapDispatchToProps = dispatch => ({
  onApplyOutput: nextOutput => dispatch(changeOutput(nextOutput)),
  onJumpBoard: boardId => dispatch(switchBoard(boardId)),
  onSpeak: (text, onend) => dispatch(speak(text, onend)),
  onCancelSpeech: () => dispatch(cancelSpeech())
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(injectIntl(TuyujiaPanel));
