import {
  CHANGE_OUTPUT,
  SWITCH_BOARD,
} from '../Board.constants';
import { UPDATE_DISPLAY_SETTINGS } from '../../App/App.constants';
import { CHANGE_RATE } from '../../../providers/SpeechProvider/SpeechProvider.constants';
import {
  mapDispatchToProps,
  mapStateToProps
} from './CommunicationSupportPanel.container';

describe('CommunicationSupportPanel container', () => {
  test('excludes tombstoned personal boards from new matching without touching existing snapshots', () => {
    const person = { id: 'private-person', personId: 'synthetic-person-a', label: '合成林安', image: 'data:image/png;base64,c3ludGhldGlj' };
    const boards = [{ id: 'home', tiles: [] }, { id: 'device_private_board_deleted', tiles: [person] }];
    const output = [{ ...person }];
    const state = { board: { boards, output, syncMeta: { device_private_board_deleted: { isDeleted: true } } }, app: {}, speech: {} };
    const before = JSON.stringify(state);
    const props = mapStateToProps(state, {});
    expect(props.boards).toEqual([boards[0]]);
    expect(props.output).toEqual(output);
    expect(JSON.stringify(state)).toBe(before);
  });

  test('maps cboard board and auth state into communication support props', () => {
    const state = {
      board: {
        boards: [{ id: 'home', tiles: [{ id: 'water', label: '水' }] }],
        output: [{ id: 'want', label: '想' }],
        activeBoardId: 'home'
      },
      app: {
        displaySettings: {
          fontSize: 'Large',
          uiSize: 'ExtraLarge'
        },
        userData: {
          authToken: 'token'
        }
      },
      speech: {
        options: { voiceURI: 'voice', pitch: 1, rate: 0.8 },
        elevenLabsApiKey: '',
        elevenLabsVoiceSettings: {}
      }
    };

    const ownProps = {
      intl: { locale: 'zh-CN' },
      copyOverrides: { title: '图语家双向沟通' },
      pictogramOrdering: { usageByTileKey: {} },
      onPictogramUsed: jest.fn()
    };

    expect(mapStateToProps(state, ownProps)).toEqual({
      boards: state.board.boards,
      output: state.board.output,
      activeBoardId: 'home',
      intl: ownProps.intl,
      isLogged: true,
      accountId: '',
      displaySettings: state.app.displaySettings,
      speechSettings: {
        voiceURI: 'voice',
        pitch: 1,
        rate: 0.8,
        elevenLabsApiKey: '',
        elevenLabsVoiceSettings: {}
      },
      copyOverrides: ownProps.copyOverrides,
      demoMode: false,
      pictogramOrdering: ownProps.pictogramOrdering,
      onPictogramUsed: ownProps.onPictogramUsed
    });
  });

  test('forces guest behavior even if the browser has an authenticated CBoard session', () => {
    const props = mapStateToProps(
      {
        board: { boards: [], output: [] },
        app: {
          displaySettings: {},
          userData: { authToken: 'private-token' }
        },
        speech: {}
      },
      { demoMode: true }
    );

    expect(props.isLogged).toBe(false);
    expect(props.demoMode).toBe(true);
  });

  test('creates output, board jump, and Cboard speech dispatchers', () => {
    const dispatch = jest.fn();
    const props = mapDispatchToProps(dispatch);
    const nextOutput = [{ id: 'water', label: '水' }];

    props.onApplyOutput(nextOutput);
    props.onJumpBoard('daily-needs');
    props.onSpeak('我想喝水。', jest.fn());
    props.onCancelSpeech();
    props.onChangeSpeechRate(0.7);
    props.onChangeDisplaySettings({ fontSize: 'ExtraLarge' });

    expect(dispatch).toHaveBeenCalledTimes(6);
    expect(typeof dispatch.mock.calls[0][0]).toBe('function');
    expect(dispatch.mock.calls[1][0]).toMatchObject({
      type: SWITCH_BOARD,
      boardId: 'daily-needs'
    });
    expect(typeof dispatch.mock.calls[2][0]).toBe('function');
    expect(typeof dispatch.mock.calls[3][0]).toBe('function');
    expect(dispatch.mock.calls[4][0]).toEqual({
      type: CHANGE_RATE,
      rate: 0.7
    });
    expect(dispatch.mock.calls[5][0]).toEqual({
      type: UPDATE_DISPLAY_SETTINGS,
      payload: { fontSize: 'ExtraLarge' }
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

  test('awaits the bound persistence service for caregiver board creation and updates', async () => {
    const save = jest.fn(async (board, options) => options.create ? board.id : true);
    const dispatch = jest.fn(action => typeof action === 'function'
      ? action(dispatch, jest.fn(), { verifiedBoardPersistence: { save } }) : action);
    const props = mapDispatchToProps(dispatch);
    const board = {
      id: 'device_private_board_family',
      name: '家庭常用',
      tiles: []
    };

    const guard = jest.fn(() => true);
    await expect(props.onCreateCommunicationBoard(board, { guard })).resolves.toBe(board.id);
    await expect(props.onUpdateCommunicationBoard(board, { expectedBoard: board, guard })).resolves.toBe(true);
    expect(save.mock.calls).toEqual([
      [board, { create: true, expectedBoard: null, guard }],
      [board, { expectedBoard: board, guard }]
    ]);
    save.mockRejectedValueOnce(new Error('synthetic write failure'));
    await expect(props.onUpdateCommunicationBoard(board, { expectedBoard: board })).rejects.toThrow('synthetic write failure');
  });
});
