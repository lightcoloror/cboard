import configureStore from '../store';
import { saveVerifiedBoard } from '../common/communicationSupport/verifiedBoardPersistence';
const bootstrapped = persistor => new Promise(resolve => {
  if (persistor.getState().bootstrapped) return resolve();
  const unsubscribe = persistor.subscribe(() => {
    if (persistor.getState().bootstrapped) { unsubscribe(); resolve(); }
  });
});
describe('store', () => {
  it('should configure Store', async () => {
    const store = configureStore();
    expect(store).toBeDefined();
    await bootstrapped(store.persistor);
    await store.persistor.flush();
    store.persistor.pause();
  });
  it('binds verification to each store and to its own demo memory backend', async () => {
    const board = { id: 'private-board', name: '合成图板', tiles: [] };
    const initial = { board: { boards: [board], syncMeta: {} },
      communicator: { activeCommunicatorId: 'comm', communicators: [{ id: 'comm', boards: [board.id] }] } };
    const first = configureStore(initial, { demoMode: true });
    const second = configureStore(initial, { demoMode: true });
    await Promise.all([bootstrapped(first.persistor), bootstrapped(second.persistor)]);
    await expect(first.store.dispatch(saveVerifiedBoard({ ...board, name: '第一个保存' }, { expectedBoard: board }))).resolves.toBe(true);
    expect(second.store.getState().board.boards[0].name).toBe('合成图板');
    await expect(second.store.dispatch(saveVerifiedBoard({ ...board, name: '第二个保存' }, { expectedBoard: board }))).resolves.toBe(true);
    expect(first.store.getState().board.boards[0].name).toBe('第一个保存');
    await Promise.all([first.persistor.flush(), second.persistor.flush()]);
    first.persistor.pause(); second.persistor.pause();
  });
});
