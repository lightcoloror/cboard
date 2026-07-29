import { mapStateToProps, BoardContainer } from '../Board.container';
import { SYNC_STATUS } from '../Board.constants';

jest.mock('ogv', () => ({ OGVLoader: { base: '' } }));
jest.mock('dom-to-image', () => ({}));
jest.mock('../Board.component', () => () => null);

const createState = (boards, syncMeta = {}) => ({
  board: {
    boards,
    syncMeta,
    activeBoardId: null,
    output: [],
    navHistory: [],
    isLiveMode: false,
    improvedPhrase: null
  },
  communicator: {
    activeCommunicatorId: 'comm-1',
    communicators: [{ id: 'comm-1', boards: boards.map(b => b.id) }]
  },
  speech: {
    voices: [],
    options: { voiceURI: null, isCloud: false }
  },
  scanner: {},
  app: {
    displaySettings: {},
    navigationSettings: {},
    userData: null,
    isConnected: true,
    liveHelp: {
      isRootBoardTourEnabled: false,
      isSymbolSearchTourEnabled: false,
      isUnlockedTourEnabled: false
    }
  },
  language: { lang: 'en-US' },
  subscription: {
    premiumRequiredModalState: null,
    isInFreeCountry: true,
    isSubscribed: false,
    isOnTrialPeriod: false
  }
});

describe('Board.container', () => {
  describe('mapStateToProps', () => {
    describe('active board handling', () => {
      it('returns undefined for active board that is soft-deleted', () => {
        const boards = [{ id: 'board-1' }, { id: 'board-2' }];
        const syncMeta = {
          'board-2': { status: SYNC_STATUS.PENDING, isDeleted: true }
        };
        const state = {
          ...createState(boards, syncMeta),
          board: {
            ...createState(boards, syncMeta).board,
            activeBoardId: 'board-2'
          }
        };

        const props = mapStateToProps(state);

        expect(props.board).toBeUndefined();
      });

      // Note: Basic getVisibleBoards() filtering logic is tested in Board.selectors.test.js
      // This test covers the container-specific behavior: board: getVisibleBoards(state).find(board => board.id === activeBoardId)
    });

    it('maps unauthEditModalDismissed from the app state', () => {
      const boards = [{ id: 'board-1' }];
      const base = createState(boards);
      const state = {
        ...base,
        app: { ...base.app, unauthEditModalDismissed: true }
      };

      const props = mapStateToProps(state);

      expect(props.unauthEditModalDismissed).toBe(true);
    });
  });

  describe('handleLockClick (unauthenticated edit modal gating)', () => {
    const buildInstance = props => {
      const instance = new BoardContainer({
        showPremiumRequired: jest.fn(),
        isSubscriptionRequired: false,
        setIsSaving: jest.fn(),
        navigationSettings: {},
        isLogged: false,
        unauthEditModalDismissed: false,
        ...props
      });
      instance.state = { ...instance.state, isLocked: true };
      instance.setState = jest.fn();
      return instance;
    };

    it('opens the modal when logged out and it has not been dismissed', () => {
      const instance = buildInstance({
        isLogged: false,
        unauthEditModalDismissed: false
      });

      instance.handleLockClick();

      expect(instance.setState).toHaveBeenCalledWith({
        showUnauthEditModal: true
      });
    });

    it('unlocks directly when logged out but already dismissed', () => {
      const instance = buildInstance({
        isLogged: false,
        unauthEditModalDismissed: true
      });

      instance.handleLockClick();

      // Should not open the modal...
      expect(instance.setState).not.toHaveBeenCalledWith({
        showUnauthEditModal: true
      });
      // ...but go straight to the unlock updater (a function argument).
      expect(typeof instance.setState.mock.calls[0][0]).toBe('function');
    });
  });

  describe('demo route isolation', () => {
    const buildInstance = demoMode => {
      const board = { id: 'root', isFixed: false, tiles: [] };
      const props = {
        demoMode,
        match: { params: {} },
        board,
        boards: [board],
        communicator: { rootBoard: 'root' },
        changeBoard: jest.fn(),
        history: {
          push: jest.fn(),
          replace: jest.fn()
        }
      };
      const instance = new BoardContainer(props);
      instance.setState = jest.fn();
      return { instance, props };
    };

    it('keeps the dedicated demo URL when loading the initial board', async () => {
      const { instance, props } = buildInstance(true);

      await instance.componentDidMount();

      expect(props.changeBoard).toHaveBeenCalledWith('root');
      expect(props.history.replace).not.toHaveBeenCalled();
    });

    it('keeps the dedicated demo URL during internal board navigation', () => {
      const { instance, props } = buildInstance(true);

      instance.pushBoardLocation('food');
      instance.replaceBoardLocation('/board/food');

      expect(props.history.push).not.toHaveBeenCalled();
      expect(props.history.replace).not.toHaveBeenCalled();
    });

    it('preserves normal CBoard routing outside demo mode', async () => {
      const { instance, props } = buildInstance(false);

      await instance.componentDidMount();
      instance.pushBoardLocation('food');

      expect(props.history.replace).toHaveBeenCalledWith('board/root');
      expect(props.history.push).toHaveBeenCalledWith('food');
    });
  });

  describe('new linked board ownership', () => {
    const tile = {
      id: 'tile-1',
      type: 'board',
      label: 'Personal board',
      loadBoard: 'personal-board',
      linkedBoard: false
    };

    const buildInstance = userData => {
      const props = {
        userData,
        board: {
          id: 'parent-board-123456',
          name: 'Parent',
          tiles: [],
          email: 'support@cboard.io',
          author: 'Cboard Team'
        },
        communicator: {
          id: 'cboard_default',
          email: 'support@cboard.io',
          boards: ['parent-board-123456']
        },
        createTile: jest.fn(),
        createBoard: jest.fn(),
        switchBoard: jest.fn(),
        verifyAndAddBoardCommunicator: jest.fn(),
        history: { replace: jest.fn() },
        setIsSaving: jest.fn()
      };
      const instance = new BoardContainer(props);
      instance.setState = jest.fn();
      return { instance, props };
    };

    it('associates a guest board locally before navigating to it', async () => {
      const { instance, props } = buildInstance({});

      await instance.handleAddTileEditorSubmit(tile);

      expect(props.createBoard).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'personal-board' })
      );
      expect(props.verifyAndAddBoardCommunicator).toHaveBeenCalledWith(
        props.communicator,
        'personal-board'
      );
      expect(props.switchBoard).toHaveBeenCalledWith('personal-board');
    });

    it('defers a logged-in board association to the API save flow', async () => {
      const { instance, props } = buildInstance({
        name: 'Caregiver',
        email: 'caregiver@example.com'
      });
      instance.handleApiUpdates = jest.fn().mockResolvedValue(undefined);

      await instance.handleAddTileEditorSubmit(tile);

      expect(props.verifyAndAddBoardCommunicator).not.toHaveBeenCalled();
      expect(instance.handleApiUpdates).toHaveBeenCalledWith(tile);
    });

    it('associates a logged-in board before starting API persistence', async () => {
      const { instance, props } = buildInstance({
        name: 'Caregiver',
        email: 'caregiver@example.com'
      });
      Object.assign(props, {
        intl: { formatMessage: jest.fn(() => 'My board') },
        lang: 'zh-CN',
        updateBoard: jest.fn(),
        verifyAndUpsertCommunicator: jest.fn(),
        updateApiObjectsNoChild: jest.fn().mockResolvedValue('server-board'),
        updateApiObjects: jest.fn(),
        replaceBoard: jest.fn()
      });

      await instance.handleApiUpdates(tile);

      expect(props.verifyAndAddBoardCommunicator).toHaveBeenCalledWith(
        props.communicator,
        'personal-board'
      );
      expect(props.verifyAndUpsertCommunicator).not.toHaveBeenCalled();
      expect(props.updateApiObjectsNoChild).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'personal-board' }),
        true
      );
    });
  });
});
