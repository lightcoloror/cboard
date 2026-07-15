import { CHANGE_OUTPUT, SWITCH_BOARD } from '../Board.constants';
import {
  mapDispatchToProps,
  mapStateToProps
} from './CommunicationSupportPanel.container';

describe('CommunicationSupportPanel container', () => {
  test('maps cboard board and auth state into communication support props', () => {
    const state = {
      board: {
        boards: [{ id: 'home', tiles: [{ id: 'water', label: '水' }] }],
        output: [{ id: 'want', label: '想' }],
        activeBoardId: 'home'
      },
      app: {
        userData: {
          authToken: 'token'
        }
      }
    };

    const ownProps = {
      intl: { locale: 'zh-CN' },
      copyOverrides: { title: '图语家双向沟通' }
    };

    expect(mapStateToProps(state, ownProps)).toEqual({
      boards: state.board.boards,
      output: state.board.output,
      activeBoardId: 'home',
      intl: ownProps.intl,
      isLogged: true,
      copyOverrides: ownProps.copyOverrides
    });
  });

  test('creates output, board jump, and Cboard speech dispatchers', () => {
    const dispatch = jest.fn();
    const props = mapDispatchToProps(dispatch);
    const nextOutput = [{ id: 'water', label: '水' }];

    props.onApplyOutput(nextOutput);
    props.onJumpBoard('daily-needs');
    props.onSpeak('我想喝水。', jest.fn());
    props.onCancelSpeech();

    expect(dispatch).toHaveBeenCalledTimes(4);
    expect(typeof dispatch.mock.calls[0][0]).toBe('function');
    expect(dispatch.mock.calls[1][0]).toMatchObject({
      type: SWITCH_BOARD,
      boardId: 'daily-needs'
    });
    expect(typeof dispatch.mock.calls[2][0]).toBe('function');
    expect(typeof dispatch.mock.calls[3][0]).toBe('function');

    const thunkDispatch = jest.fn();
    dispatch.mock.calls[0][0](thunkDispatch, () => ({
      app: { navigationSettings: { improvePhraseActive: false } }
    }));

    expect(thunkDispatch).toHaveBeenCalledWith({
      type: CHANGE_OUTPUT,
      output: nextOutput
    });
  });
});
