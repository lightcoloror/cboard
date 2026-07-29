import * as actions from '../Communicator.actions';
import * as types from '../Communicator.constants';
import configureMockStore from 'redux-mock-store';
import thunk from 'redux-thunk';
import defaultBoards from '../../../api/boards.json';
import API from '../../../api';

const mockStore = configureMockStore([thunk]);

const mockBoard = {
  name: 'tewt',
  id: '123',
  tiles: [{ id: '1234', loadBoard: '456456456456456456456' }],
  isPublic: false,
  email: 'asd@qwe.com',
  markToUpdate: true
};
const [...boards] = defaultBoards.advanced;
const communicatorData = {
  author: 'Cboard Team',
  boards: ['root'],
  description: "Cboard's default communicator",
  email: 'support@cboard.io',
  id: 'cboard_default',
  name: "Cboard's Communicator",
  rootBoard: 'root'
};

const initialState = {
  board: {
    boards,
    output: [],
    activeBoardId: null,
    navHistory: [],
    isFetching: false
  },
  communicator: {
    communicators: [communicatorData]
  }
};

describe('actions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should create an action to import communicator', () => {
    const payload = {};

    const expectedAction = {
      type: types.IMPORT_COMMUNICATOR,
      payload
    };
    expect(actions.importCommunicator(payload)).toEqual(expectedAction);
  });

  it('should create an action to create communicator', () => {
    const payload = {};
    const expectedAction = {
      type: types.CREATE_COMMUNICATOR,
      payload
    };
    expect(actions.createCommunicator(payload)).toEqual(expectedAction);
  });

  it('should create an action to edit communicator', () => {
    const payload = {};
    const expectedAction = {
      type: types.EDIT_COMMUNICATOR,
      payload
    };
    expect(actions.editCommunicator(payload)).toEqual(expectedAction);
  });

  it('should create an action to delete communicator', () => {
    const id = {};
    const expectedAction = {
      type: types.DELETE_COMMUNICATOR,
      payload: id
    };
    expect(actions.deleteCommunicator(id)).toEqual(expectedAction);
  });

  it('should create an action to change communicator', () => {
    const id = {};
    const expectedAction = {
      type: types.CHANGE_COMMUNICATOR,
      payload: id
    };
    expect(actions.changeCommunicator(id)).toEqual(expectedAction);
  });

  it('should create an action to add board communicator', () => {
    const boardId = {};
    const expectedAction = {
      type: types.ADD_BOARD_COMMUNICATOR,
      boardId
    };
    expect(actions.addBoardCommunicator(boardId)).toEqual(expectedAction);
  });

  it('should create an action to delete board communicator', () => {
    const boardId = {};
    const expectedAction = {
      type: types.DELETE_BOARD_COMMUNICATOR,
      boardId
    };
    expect(actions.deleteBoardCommunicator(boardId)).toEqual(expectedAction);
  });

  it('should create an action to replace board communicator', () => {
    const prevBoardId = '10';
    const nextBoardId = '20';

    const expectedAction = {
      type: types.REPLACE_BOARD_COMMUNICATOR,
      prevBoardId,
      nextBoardId
    };
    expect(actions.replaceBoardCommunicator(prevBoardId, nextBoardId)).toEqual(
      expectedAction
    );
  });

  it('should create an action to get API success', () => {
    const communicators = {};
    const expectedAction = {
      type: types.GET_API_MY_COMMUNICATORS_SUCCESS,
      communicators
    };
    expect(actions.getApiMyCommunicatorsSuccess(communicators)).toEqual(
      expectedAction
    );
  });

  it('should create an action to get API started', () => {
    const expectedAction = {
      type: types.GET_API_MY_COMMUNICATORS_STARTED
    };
    expect(actions.getApiMyCommunicatorsStarted()).toEqual(expectedAction);
  });

  it('should create an action to get API failure', () => {
    const message = 'dummy message';
    const expectedAction = {
      type: types.GET_API_MY_COMMUNICATORS_FAILURE,
      message
    };
    expect(actions.getApiMyCommunicatorsFailure(message)).toEqual(
      expectedAction
    );
  });

  it('should create an action to create API success', () => {
    const communicator = {};
    const communicatorId = '10';

    const expectedAction = {
      type: types.CREATE_API_COMMUNICATOR_SUCCESS,
      communicator,
      communicatorId
    };

    expect(
      actions.createApiCommunicatorSuccess(communicator, communicatorId)
    ).toEqual(expectedAction);
  });

  it('should create an action to create API started', () => {
    const expectedAction = {
      type: types.CREATE_API_COMMUNICATOR_STARTED
    };
    expect(actions.createApiCommunicatorStarted()).toEqual(expectedAction);
  });

  it('should create an action to create API failure', () => {
    const message = 'dummy message';
    const expectedAction = {
      type: types.CREATE_API_COMMUNICATOR_FAILURE,
      message
    };

    expect(actions.createApiCommunicatorFailure(message)).toEqual(
      expectedAction
    );
  });

  it('should create an action to update API success', () => {
    const communicator = {};
    const expectedAction = {
      type: types.UPDATE_API_COMMUNICATOR_SUCCESS,
      communicator
    };
    expect(actions.updateApiCommunicatorSuccess(communicator)).toEqual(
      expectedAction
    );
  });

  it('should create an action to update API started', () => {
    const expectedAction = {
      type: types.UPDATE_API_COMMUNICATOR_STARTED
    };
    expect(actions.updateApiCommunicatorStarted()).toEqual(expectedAction);
  });

  it('should create an action to update API failure', () => {
    const message = 'dummy message';
    const expectedAction = {
      type: types.UPDATE_API_COMMUNICATOR_FAILURE,
      message
    };

    expect(actions.updateApiCommunicatorFailure(message)).toEqual(
      expectedAction
    );
  });
  it('should contain thunk functions', () => {
    expect(actions.updateApiCommunicator(communicatorData)).toBeDefined();
    expect(actions.createApiCommunicator(communicatorData, 'id')).toBeDefined();
    expect(actions.getApiMyCommunicators()).toBeDefined();
    expect(actions.pushCommunicator(communicatorData)).toBeDefined();
  });

  it('pushCommunicator should not call upsertApiCommunicator when user is not logged in', async () => {
    const storeNoUser = mockStore({
      ...initialState,
      app: { userData: {} },
      communicator: {
        communicators: [communicatorData],
        activeCommunicatorId: communicatorData.id
      }
    });

    await storeNoUser.dispatch(actions.pushCommunicator(communicatorData));

    const dispatchedTypes = storeNoUser
      .getActions()
      .map(a => a.type)
      .filter(Boolean);
    // Should NOT contain any API push action
    expect(dispatchedTypes).not.toContain('CREATE_API_COMMUNICATOR_STARTED');
    expect(dispatchedTypes).not.toContain('UPDATE_API_COMMUNICATOR_STARTED');
  });

  it('atomically adds a board without mutating the source communicator', () => {
    const source = { ...communicatorData, boards: ['root'] };
    const store = mockStore({
      ...initialState,
      app: { userData: {} },
      communicator: {
        communicators: [source],
        activeCommunicatorId: source.id
      }
    });

    const result = store.dispatch(
      actions.verifyAndAddBoardCommunicator(source, 'personal-board')
    );

    expect(source.boards).toEqual(['root']);
    expect(result.boards).toEqual(['root', 'personal-board']);
    expect(store.getActions()).toEqual([
      expect.objectContaining({
        type: types.EDIT_COMMUNICATOR,
        payload: expect.objectContaining({
          id: source.id,
          boards: ['root', 'personal-board']
        })
      }),
      { type: types.CHANGE_COMMUNICATOR, payload: source.id }
    ]);
  });

  it('does not duplicate a board while taking communicator ownership', () => {
    const source = {
      ...communicatorData,
      boards: ['root', 'personal-board']
    };
    const store = mockStore({
      ...initialState,
      app: {
        userData: { name: 'Caregiver', email: 'caregiver@example.com' }
      },
      communicator: {
        communicators: [source],
        activeCommunicatorId: source.id
      }
    });

    const result = store.dispatch(
      actions.verifyAndAddBoardCommunicator(source, 'personal-board')
    );

    expect(source.boards).toEqual(['root', 'personal-board']);
    expect(result.boards).toEqual(['root', 'personal-board']);
    expect(result.email).toBe('caregiver@example.com');
    expect(result.id).not.toBe(source.id);
    expect(store.getActions()[0]).toEqual(
      expect.objectContaining({
        type: types.CREATE_COMMUNICATOR,
        payload: expect.objectContaining({
          boards: ['root', 'personal-board'],
          email: 'caregiver@example.com'
        })
      })
    );
  });

  it('shares one API create request for concurrent saves of a local communicator', async () => {
    const localCommunicator = {
      ...communicatorData,
      id: 'local-comm',
      email: 'caregiver@example.com'
    };
    const remoteCommunicator = {
      ...localCommunicator,
      id: 'remote-communicator-123456'
    };
    let resolveCreate;
    const createSpy = jest
      .spyOn(API, 'createCommunicator')
      .mockImplementation(
        () => new Promise(resolve => (resolveCreate = resolve))
      );
    const store = mockStore({
      ...initialState,
      app: {
        userData: { name: 'Caregiver', email: 'caregiver@example.com' }
      },
      communicator: {
        communicators: [localCommunicator],
        activeCommunicatorId: localCommunicator.id
      }
    });

    const first = store.dispatch(
      actions.upsertApiCommunicator(localCommunicator)
    );
    const second = store.dispatch(
      actions.upsertApiCommunicator(localCommunicator)
    );

    expect(createSpy).toHaveBeenCalledTimes(1);
    resolveCreate(remoteCommunicator);
    await expect(Promise.all([first, second])).resolves.toEqual([
      remoteCommunicator,
      remoteCommunicator
    ]);
    expect(
      store
        .getActions()
        .filter(action => action.type === types.CREATE_API_COMMUNICATOR_STARTED)
    ).toHaveLength(1);
  });

  it('clears a failed create so the same local communicator can retry', async () => {
    const localCommunicator = {
      ...communicatorData,
      id: 'local-retry',
      email: 'caregiver@example.com'
    };
    const remoteCommunicator = {
      ...localCommunicator,
      id: 'remote-communicator-123456'
    };
    const createSpy = jest
      .spyOn(API, 'createCommunicator')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(remoteCommunicator);
    const store = mockStore({
      ...initialState,
      app: {
        userData: { name: 'Caregiver', email: 'caregiver@example.com' }
      },
      communicator: {
        communicators: [localCommunicator],
        activeCommunicatorId: localCommunicator.id
      }
    });

    const first = store
      .dispatch(actions.upsertApiCommunicator(localCommunicator))
      .catch(error => error);
    const second = store
      .dispatch(actions.upsertApiCommunicator(localCommunicator))
      .catch(error => error);
    const failures = await Promise.all([first, second]);

    expect(failures.every(error => error instanceof Error)).toBe(true);
    await expect(
      store.dispatch(actions.upsertApiCommunicator(localCommunicator))
    ).resolves.toEqual(remoteCommunicator);
    expect(createSpy).toHaveBeenCalledTimes(2);
  });

  it('does not merge concurrent updates of a remote communicator', async () => {
    const remoteCommunicator = {
      ...communicatorData,
      id: 'remote-communicator-123456',
      email: 'caregiver@example.com'
    };
    const updateSpy = jest
      .spyOn(API, 'updateCommunicator')
      .mockResolvedValue(remoteCommunicator);
    const store = mockStore({
      ...initialState,
      app: {
        userData: { name: 'Caregiver', email: 'caregiver@example.com' }
      },
      communicator: {
        communicators: [remoteCommunicator],
        activeCommunicatorId: remoteCommunicator.id
      }
    });

    await Promise.all([
      store.dispatch(actions.upsertApiCommunicator(remoteCommunicator)),
      store.dispatch(actions.upsertApiCommunicator(remoteCommunicator))
    ]);

    expect(updateSpy).toHaveBeenCalledTimes(2);
  });
});
