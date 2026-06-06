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

  test('creates output and board jump dispatchers', () => {
    const dispatch = jest.fn();
    const props = mapDispatchToProps(dispatch);
    const nextOutput = [{ id: 'water', label: '水' }];

    props.onApplyOutput(nextOutput);
    props.onJumpBoard('daily-needs');

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(typeof dispatch.mock.calls[0][0]).toBe('function');
    expect(dispatch.mock.calls[1][0]).toMatchObject({
      type: SWITCH_BOARD,
      boardId: 'daily-needs'
    });

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
