import API from '../../../api';
import {
  CommunicatorDialogContainer,
  mapStateToProps
} from './CommunicatorDialog.container';
import { SYNC_STATUS } from '../../Board/Board.constants';

jest.mock('./CommunicatorDialog.messages', () => ({
  __esModule: true,
  default: {
    boardAddedToCommunicator: { id: 'board-added' },
    boardCopyError: { id: 'board-copy-error' }
  }
}));

const createState = (boards, syncMeta = {}) => ({
  board: {
    boards,
    syncMeta,
    activeBoardId: null
  },
  communicator: {
    activeCommunicatorId: 'comm-1',
    communicators: [{ id: 'comm-1', boards: boards.map(b => b.id) }]
  },
  language: { lang: 'en-US' },
  app: {
    userData: null,
    displaySettings: {},
    liveHelp: {
      communicatorTour: null,
      isSymbolSearchTourEnabled: false
    }
  }
});

describe('CommunicatorDialog.container', () => {
  describe('public board copy', () => {
    const createProps = availableBoards => ({
      availableBoards,
      communicatorBoards: [],
      currentCommunicator: { id: 'comm-1', boards: [] },
      userData: {},
      intl: { formatMessage: value => (value && value.id) || 'message' },
      showNotification: jest.fn()
    });

    beforeEach(() => {
      jest.restoreAllMocks();
    });

    it('copies the server-filtered public bundle without loading child ids directly', async () => {
      const root = {
        id: 'root',
        isPublic: true,
        tiles: [{ id: 'next', loadBoard: 'child' }]
      };
      const child = { id: 'child', isPublic: true, tiles: [] };
      jest.spyOn(API, 'getPublicBoardBundle').mockResolvedValue({
        rootBoardId: 'root',
        data: [root, child]
      });
      const directGet = jest.spyOn(API, 'getBoard');
      const container = new CommunicatorDialogContainer(createProps([]));
      container.createBoardsRecursively = jest.fn().mockResolvedValue();

      await container.copyBoard(root);

      expect(container.createBoardsRecursively).toHaveBeenCalledWith(
        root,
        undefined,
        expect.any(Map)
      );
      expect(
        container.createBoardsRecursively.mock.calls[0][2].get('child')
      ).toBe(child);
      expect(directGet).not.toHaveBeenCalled();
    });

    it('falls back to public local boards only when the bundle is unavailable', async () => {
      const root = { id: 'root', isPublic: true, tiles: [] };
      const publicChild = { id: 'public', isPublic: true, tiles: [] };
      const privateChild = { id: 'private', isPublic: false, tiles: [] };
      jest
        .spyOn(API, 'getPublicBoardBundle')
        .mockRejectedValue(new Error('old api'));
      const container = new CommunicatorDialogContainer(
        createProps([publicChild, privateChild])
      );
      container.createBoardsRecursively = jest.fn().mockResolvedValue();

      await container.copyBoard(root);

      const fallback = container.createBoardsRecursively.mock.calls[0][2];
      expect(fallback.has('root')).toBe(true);
      expect(fallback.has('public')).toBe(true);
      expect(fallback.has('private')).toBe(false);
    });
  });

  describe('mapStateToProps', () => {
    describe('communicatorBoards filtering', () => {
      it('excludes soft-deleted boards from communicator board list', () => {
        const boards = [{ id: 'board-1' }, { id: 'board-2' }];
        const syncMeta = {
          'board-2': { status: SYNC_STATUS.PENDING, isDeleted: true }
        };
        const state = createState(boards, syncMeta);

        const props = mapStateToProps(state, {});

        expect(props.communicatorBoards).toHaveLength(1);
        expect(props.communicatorBoards[0].id).toBe('board-1');
      });

      // Note: Basic getVisibleBoards() filtering logic is tested in Board.selectors.test.js
      // This test covers the container-specific two-step filtering:
      // 1. Filter visible boards (getVisibleBoards)
      // 2. Filter by communicator membership
    });
  });
});
