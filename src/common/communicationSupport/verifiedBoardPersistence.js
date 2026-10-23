import isEqual from 'lodash/isEqual';
import { getStoredState } from 'redux-persist';
import { createBoard, updateBoard } from '../../components/Board/Board.actions';
import { addBoardCommunicator } from '../../components/Communicator/Communicator.actions';

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const failure = (message, code = 'BOARD_PERSISTENCE_FAILED') => Object.assign(new Error(message), { code });
const content = board => { const result = { ...board }; delete result.lastEdited; return result; };
const boardIn = (state, id) => state && state.board && (state.board.boards || []).find(board => board.id === id);
const removed = (state, id) => Boolean(state && state.board && state.board.syncMeta && state.board.syncMeta[id] && state.board.syncMeta[id].isDeleted);
const contextIn = state => JSON.stringify([
  state.app && state.app.userData && (state.app.userData.id || state.app.userData._id || ''),
  state.app && state.app.userData && state.app.userData.authToken,
  state.communicator && state.communicator.activeCommunicatorId
]);
const hasMembership = (state, communicatorId, boardId) => Boolean(
  state && state.communicator && (state.communicator.communicators || []).some(
    item => item.id === communicatorId && Array.isArray(item.boards) && item.boards.includes(boardId)
  )
);

// The thunk's extra argument is configured once per Redux store. It never uses
// getStore(), which could refer to another store after a later configuration.
export const saveVerifiedBoard = (board, options) => (dispatch, getState, services) => {
  if (!services || !services.verifiedBoardPersistence)
    return Promise.reject(failure('当前保存服务未就绪，请保留输入后重试。'));
  return services.verifiedBoardPersistence.save(board, options);
};

export const saveVerifiedBoards = (changes, options) => (dispatch, getState, services) => {
  if (!services || !services.verifiedBoardPersistence)
    return Promise.reject(failure('当前保存服务未就绪，请保留输入后重试。'));
  return services.verifiedBoardPersistence.saveMany(changes, options);
};

export function createVerifiedBoardPersistence({ store, persistor, persistence,
  actions = { createBoard, updateBoard, addBoardCommunicator } }) {
  let tail = Promise.resolve();
  const attempts = new Map();

  function save(board, { expectedBoard, create = false, guard = () => true } = {}) {
    return saveMany([{ board, expectedBoard, create }], { guard })
      .then(() => create ? board.id : true);
  }

  // Related native changes (a new folder board plus its parent link) share one
  // preflight and one authoritative root readback. Failure never rolls back a
  // newer state; the exact attempted snapshots remain available for retry.
  function saveMany(changes, { guard = () => true } = {}) {
    let entries;
    try { entries = changes.map(({ board, expectedBoard, create = false }) => ({
      desired: clone(board), expected: clone(expectedBoard), create
    })); }
    catch (_) { return Promise.reject(failure('图板内容不能保存，请保留输入。')); }
    const context = contextIn(store.getState());
    const assertCurrent = () => {
      if (!guard() || contextIn(store.getState()) !== context)
        throw failure('当前操作已过期，请保留当前输入。', 'BOARD_SAVE_CANCELLED');
    };
    const execute = async () => {
      assertCurrent();
      if (!persistor.getState().bootstrapped)
        throw failure('本机资料尚未载入完成，请稍后重试。');
      if (!entries.length || entries.some(({ desired }) => !desired || !desired.id || !Array.isArray(desired.tiles)) ||
          new Set(entries.map(({ desired }) => desired.id)).size !== entries.length)
        throw failure('图板内容不完整，请保留输入。');
      const state = store.getState();
      const communicatorId = state.communicator && state.communicator.activeCommunicatorId;
      if (entries.some(entry => entry.create) && !(state.communicator && (state.communicator.communicators || []).some(item => item.id === communicatorId)))
        throw failure('当前图板集合不可用，请保留输入。');
      const planned = entries.map(entry => {
        const { desired, expected, create } = entry;
        const current = clone(boardIn(state, desired.id));
        const attempt = attempts.get(desired.id);
        const retry = attempt && attempt.context === context && attempt.create === create &&
          isEqual(content(attempt.desired), content(desired)) && isEqual(attempt.after, current) &&
          (isEqual(expected, attempt.before) || isEqual(expected, current));
        if (removed(state, desired.id) ||
            (create ? Boolean(current && !retry) : !current || expected === undefined || (!isEqual(current, expected) && !retry)))
          throw failure('图板已发生变化，当前输入仍保留，请重新查看。', 'BOARD_SAVE_CONFLICT');
        return { ...entry, current, retry, attempt };
      });
      // Re-dispatching the current attempted board on retry creates a fresh
      // persist update after a failed write; flush alone does not retry it.
      for (const entry of planned) {
        const { desired, expected, create, current, retry, attempt } = entry;
        assertCurrent();
        store.dispatch(create && !current ? actions.createBoard(desired) : actions.updateBoard(retry ? current : desired));
        if (create) { assertCurrent(); store.dispatch(actions.addBoardCommunicator(desired.id)); }
        const after = clone(boardIn(store.getState(), desired.id));
        if (!after || !isEqual(content(after), content(desired)) || (create && !hasMembership(store.getState(), communicatorId, desired.id)))
          throw failure('图板更新未完成，请保留输入。');
        entry.after = after;
        attempts.set(desired.id, { desired, before: retry ? attempt.before : expected, after, create, context });
      }
      const assertUnchanged = () => {
        assertCurrent();
        const latest = store.getState();
        if (planned.some(({ desired, after, create }) => !isEqual(clone(boardIn(latest, desired.id)), after) || removed(latest, desired.id) ||
            (create && !hasMembership(latest, communicatorId, desired.id))))
          throw failure('保存期间图板已变化，未覆盖后续内容。', 'BOARD_SAVE_CONFLICT');
      };
      try {
        await persistor.flush();
        assertUnchanged();
        // Never use the migration reader here: failure must not consult or
        // migrate an older localStorage copy over the authoritative backend.
        const stored = await getStoredState({ ...persistence.rootConfig, storage: persistence.strictStorage });
        assertUnchanged();
        if (planned.some(({ desired, after, create }) => !isEqual(boardIn(stored, desired.id), after) || removed(stored, desired.id) ||
            (create && !hasMembership(stored, communicatorId, desired.id))))
          throw failure('本机保存后核对失败，当前输入仍保留，请重试。');
        return true;
      } catch (error) {
        assertUnchanged();
        if (error && error.code) throw error;
        throw failure('本机保存未确认，当前输入仍保留，请重试。');
      }
    };
    const result = tail.then(execute);
    tail = result.catch(() => {});
    return result;
  }
  return { save, saveMany };
}
