import { createGalleryTileUndoService } from './galleryTileUndo';
import { getCommunicationGalleryIdentity, canManageCommunicationLibrary } from './localData';
import { currentImageOperationEpoch } from './imageOperationEpoch';
import isEqual from 'lodash/isEqual';
import { CREATE_API_BOARD_SUCCESS } from '../../components/Board/Board.constants';
import { CREATE_COMMUNICATOR, CHANGE_COMMUNICATOR, CREATE_API_COMMUNICATOR_SUCCESS } from '../../components/Communicator/Communicator.constants';

export const getGalleryTileUndo = () => (dispatch, getState, services) => services && services.galleryTileUndo;

export function createWebGalleryTileUndo({ store, persistence }) {
  const scopeKey = (communicatorId = store.getState().communicator?.activeCommunicatorId) => {
    const state = store.getState();
    const user = state.app && state.app.userData || {};
    return JSON.stringify([getCommunicationGalleryIdentity(), currentImageOperationEpoch(),
      user.id || user._id || user.email, user.authToken, communicatorId]);
  };
  const service = createGalleryTileUndoService({
    getScopeKey: scopeKey,
    loadBoards: () => {
      const state = store.getState().board || {};
      return (state.boards || []).filter(board => !(state.syncMeta && state.syncMeta[board.id] && state.syncMeta[board.id].isDeleted));
    },
    canManage: board => canManageCommunicationLibrary() && !board.careSharedReadOnly,
    saveBoard: (board, options) => persistence.save(board, options)
  });
  service.createSyncMigration = (operationId, boardId) => {
    const migration = service.captureIdentityMigration(operationId, boardId);
    const createdCommunicators = new Map();
    const reject = () => { throw new Error('Unexpected gallery sync identity mapping'); };
    const ownershipContent = communicator => {
      const value = { ...communicator };
      ['id', 'email', 'author', 'lastEdited'].forEach(field => { delete value[field]; });
      return value;
    };
    return {
      isCurrent: migration.isCurrent,
      dispatch(action, dispatch) {
        const state = store.getState();
        const communicators = state.communicator?.communicators || [];
        const activeId = state.communicator?.activeCommunicatorId;
        const active = communicators.find(item => item.id === activeId);
        const email = state.app?.userData?.email;
        if (action.type === CREATE_COMMUNICATOR) {
          const target = action.payload;
          if (!active || !email || active.email === email || !target?.id || target.email !== email ||
              communicators.some(item => item.id === target.id) ||
              !isEqual(ownershipContent(active), ownershipContent(target))) return reject();
          const result = dispatch(action);
          createdCommunicators.set(target.id, activeId);
          return result;
        }
        if (action.type === CHANGE_COMMUNICATOR && action.payload !== activeId) {
          if (createdCommunicators.get(action.payload) !== activeId) return reject();
          return migration.apply({ nextScope: scopeKey(action.payload) }, () => dispatch(action));
        }
        if (action.type === CREATE_API_COMMUNICATOR_SUCCESS && action.communicatorId === activeId) {
          const target = action.communicator;
          if (!active || !email || active.email !== email || target?.email !== email || !target.id ||
              (target.id !== activeId && communicators.some(item => item.id === target.id))) return reject();
          return migration.apply({ nextScope: scopeKey(target.id) }, () => dispatch(action));
        }
        if (action.type === CREATE_API_BOARD_SUCCESS) {
          const boards = state.board?.boards || [];
          const from = boards.find(item => item.id === action.boardId);
          const toId = action.board?.id;
          if (!from || !toId || (toId !== from.id && boards.some(item => item.id === toId))) return reject();
          return migration.apply({ fromBoardId: from.id, toBoardId: toId }, () => dispatch(action));
        }
        return dispatch(action);
      }
    };
  };
  // Observe transitions, not just the next click: A -> B -> A cannot revive A's
  // old in-flight operation or undo stack.
  store.subscribe(() => service.state());
  return service;
}
