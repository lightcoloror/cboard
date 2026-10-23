import React from 'react';
import { act } from 'react-dom/test-utils';
import { mount } from 'enzyme';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import PersonalImageManager from './PersonalImageManager.component';
import InputImage from '../../UI/InputImage';
import { boardDTOToCboardBoard } from '../../../common/communicationSupport/cboardBoardAdapter';
import { invalidateImageOperations } from '../../../common/communicationSupport/imageOperationEpoch';
import configureStore from '../../../store';
import { mapDispatchToProps } from './CommunicationSupportPanel.container';
import { updateBoard } from '../Board.actions';

jest.mock('../../UI/InputImage', () => () => null);
jest.mock('../../../common/communicationSupport/browserImageVerification', () => ({
  verifyBrowserLocalImage: async () => ({ status: 'available', width: 1, height: 1 })
}));
const board = { id: 'device_private_board_family', name: '合成家庭', communicationCategory: 'device-private',
  isFixed: true, tiles: [], grid: { rows: 1, columns: 3, order: [] } };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const wrappers = [];
const stores = [];
function setup(props = {}) {
  const wrapper = mount(<PersonalImageManager boards={[board]} editableBoards={[board]} preferences={[]}
    onSave={jest.fn()} onRemove={jest.fn()} onBoardSave={jest.fn(async () => true)} {...props} />);
  wrappers.push(wrapper); return wrapper;
}
const field = (wrapper, label) => wrapper.find(TextField).filterWhere(node => node.prop('label') === label).first();
function change(wrapper, label, value) {
  act(() => field(wrapper, label).prop('onChange')({ target: { value } })); wrapper.update();
}
const button = (wrapper, text) => wrapper.find(Button).filterWhere(node => node.text() === text).first();
async function person(wrapper, label = '合成人物甲') {
  change(wrapper, '全名', label);
  await act(async () => wrapper.find(InputImage).first().prop('onChange')(new Blob(['synthetic-photo'], { type: 'image/png' })));
  wrapper.update();
}
afterEach(async () => {
  for (const item of stores.splice(0)) { item.unsubscribe(); await item.persistor.flush(); item.persistor.pause(); }
  for (const wrapper of wrappers.splice(0)) if (wrapper.exists()) wrapper.unmount();
});

async function integrated() {
  const values = new Map();
  const backend = { getItem: async key => values.get(key) ?? null,
    setItem: jest.fn(async (key, value) => { values.set(key, value); }), removeItem: async key => { values.delete(key); } };
  const { store, persistor } = configureStore({ board: { boards: [board], syncMeta: {}, navHistory: [] },
    communicator: { activeCommunicatorId: 'family', communicators: [{ id: 'family', boards: [board.id] }] }
  }, { demoMode: true, storage: backend });
  await new Promise(resolve => {
    if (persistor.getState().bootstrapped) return resolve();
    const unsubscribe = persistor.subscribe(() => { if (persistor.getState().bootstrapped) { unsubscribe(); resolve(); } });
  });
  await persistor.flush();
  const actions = mapDispatchToProps(store.dispatch);
  const onBoardSave = jest.fn((dto, options) => actions.onUpdateCommunicationBoard(boardDTOToCboardBoard(dto, options.expectedBoard), options));
  const wrapper = setup({ onBoardSave });
  const unsubscribe = store.subscribe(() => wrapper.setProps({ boards: store.getState().board.boards, editableBoards: store.getState().board.boards }));
  stores.push({ persistor, unsubscribe });
  return { wrapper, backend, store, onBoardSave, persistor };
}

test.each(['false', 'reject'])('person %s preserves photo, full name and stable identity for retry', async failure => {
  const pending = deferred();
  const save = jest.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(true);
  const wrapper = setup({ onBoardSave: save });
  await person(wrapper);
  let task;
  act(() => { task = button(wrapper, '保存人物').prop('onClick')(); }); wrapper.update();
  expect(field(wrapper, '全名').prop('value')).toBe('合成人物甲');
  expect(wrapper.text()).not.toContain('人物已保存');
  expect(button(wrapper, '保存人物').prop('disabled')).toBe(true);
  await act(async () => { failure === 'reject' ? pending.reject(new Error('quota')) : pending.resolve(false); await task; }); wrapper.update();
  expect(field(wrapper, '全名').prop('value')).toBe('合成人物甲');
  expect(wrapper.find('img[alt="本人照片预览"]')).toHaveLength(1);
  expect(wrapper.text()).toContain('人物保存失败');
  await act(async () => button(wrapper, '保存人物').prop('onClick')()); wrapper.update();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
  expect(field(wrapper, '全名').prop('value')).toBe('');
});

test('synchronous repeat clicks submit only one pending save', async () => {
  const pending = deferred(), save = jest.fn(() => pending.promise);
  const wrapper = setup({ onBoardSave: save }); await person(wrapper);
  let first, second;
  act(() => { const click = button(wrapper, '保存人物').prop('onClick'); first = click(); second = click(); });
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve(true); await Promise.all([first, second]); });
});

test.each(['success', 'failure'])('late %s cannot clear or replace newer input', async outcome => {
  const pending = deferred(), save = jest.fn(() => pending.promise);
  const wrapper = setup({ onBoardSave: save }); await person(wrapper);
  let task;
  act(() => { task = button(wrapper, '保存人物').prop('onClick')(); });
  change(wrapper, '全名', '后续输入乙');
  expect(save.mock.calls[0][1].guard()).toBe(false);
  await act(async () => { outcome === 'success' ? pending.resolve(true) : pending.reject(new Error('late failure')); await task; }); wrapper.update();
  expect(field(wrapper, '全名').prop('value')).toBe('后续输入乙');
  expect(wrapper.text()).not.toContain('人物已保存');
  expect(wrapper.text()).not.toContain('人物保存失败');
});

test('unmount and privacy invalidation make pending guards false', async () => {
  const pending = deferred(), save = jest.fn(() => pending.promise);
  const wrapper = setup({ onBoardSave: save }); await person(wrapper);
  let task;
  act(() => { task = button(wrapper, '保存人物').prop('onClick')(); });
  invalidateImageOperations();
  expect(save.mock.calls[0][1].guard()).toBe(false);
  wrapper.unmount();
  await act(async () => { pending.reject(new Error('late unmounted result')); await task; });
});

test('real Redux write failure keeps one person and retries the same board snapshot', async () => {
  const f = await integrated(); await person(f.wrapper);
  const write = f.backend.setItem.getMockImplementation();
  f.backend.setItem.mockResolvedValue(undefined);
  await act(async () => button(f.wrapper, '保存人物').prop('onClick')()); f.wrapper.update();
  expect(f.wrapper.text()).toContain('人物保存失败');
  expect(f.store.getState().board.boards[0].tiles).toHaveLength(1);
  expect(field(f.wrapper, '全名').prop('value')).toBe('合成人物甲');
  f.backend.setItem.mockImplementation(write);
  await act(async () => button(f.wrapper, '重试保存').prop('onClick')()); f.wrapper.update();
  expect(f.store.getState().board.boards[0].tiles).toHaveLength(1);
  expect(f.onBoardSave.mock.calls[1][0]).toEqual(f.onBoardSave.mock.calls[0][0]);
  expect(f.wrapper.text()).toContain('人物已保存');
});

test('real Redux conflict never replays an old board over a subsequent edit', async () => {
  const f = await integrated(); await person(f.wrapper);
  const write = f.backend.setItem.getMockImplementation();
  f.backend.setItem.mockResolvedValue(undefined);
  await act(async () => button(f.wrapper, '保存人物').prop('onClick')());
  act(() => f.store.dispatch(updateBoard({ ...f.store.getState().board.boards[0], name: '后续板名' })));
  f.backend.setItem.mockImplementation(write); f.wrapper.update();
  await act(async () => button(f.wrapper, '重试保存').prop('onClick')()); f.wrapper.update();
  expect(f.store.getState().board.boards[0].name).toBe('后续板名');
  expect(f.store.getState().board.boards[0].tiles).toHaveLength(1);
  expect(field(f.wrapper, '全名').prop('value')).toBe('合成人物甲');
  expect(f.wrapper.text()).not.toContain('人物已保存');
});

test('editing the retained draft after failed persistence updates the same person identity', async () => {
  const f = await integrated(); await person(f.wrapper);
  const write = f.backend.setItem.getMockImplementation();
  f.backend.setItem.mockResolvedValue(undefined);
  await act(async () => button(f.wrapper, '保存人物').prop('onClick')()); f.wrapper.update();
  const id = f.store.getState().board.boards[0].tiles[0].id;
  change(f.wrapper, '全名', '合成人物更正名');
  f.backend.setItem.mockImplementation(write);
  await act(async () => button(f.wrapper, '保存人物').prop('onClick')()); f.wrapper.update();
  expect(f.store.getState().board.boards[0].tiles).toHaveLength(1);
  expect(f.store.getState().board.boards[0].tiles[0]).toMatchObject({ id, label: '合成人物更正名' });
  expect(f.wrapper.text()).toContain('人物已保存');
});

test('an existing person changed elsewhere after selection is not overwritten by the old form', async () => {
  const f = await integrated(); await person(f.wrapper);
  await act(async () => button(f.wrapper, '保存人物').prop('onClick')()); f.wrapper.update();
  const saved = f.store.getState().board.boards[0];
  const id = saved.tiles[0].id;
  change(f.wrapper, '新增或编辑人物', id);
  act(() => f.store.dispatch(updateBoard({ ...saved, tiles: [{ ...saved.tiles[0], label: '另一次修改' }] })));
  f.wrapper.update();
  const calls = f.onBoardSave.mock.calls.length;
  await act(async () => button(f.wrapper, '保存人物').prop('onClick')()); f.wrapper.update();
  expect(f.onBoardSave).toHaveBeenCalledTimes(calls);
  expect(f.store.getState().board.boards[0].tiles[0].label).toBe('另一次修改');
  expect(field(f.wrapper, '全名').prop('value')).toBe('合成人物甲');
  expect(f.wrapper.text()).toContain('人物保存失败');
});

test('two people with identical photos retain separate identities and selection survives a late result', async () => {
  const f = await integrated();
  await person(f.wrapper, '合成人物甲');
  await act(async () => button(f.wrapper, '保存人物').prop('onClick')()); f.wrapper.update();
  await person(f.wrapper, '合成人物乙');
  await act(async () => button(f.wrapper, '保存人物').prop('onClick')()); f.wrapper.update();
  const [first, second] = f.store.getState().board.boards[0].tiles;
  expect(first.image).toBe(second.image);
  expect(first.id).not.toBe(second.id);
  expect(first.pictogramAttribution.originalId).not.toBe(second.pictogramAttribution.originalId);
  change(f.wrapper, '新增或编辑人物', first.id);
  const pending = deferred();
  const lateSave = jest.fn(() => pending.promise);
  f.wrapper.setProps({ onBoardSave: lateSave });
  let task;
  act(() => { task = button(f.wrapper, '保存人物').prop('onClick')(); });
  change(f.wrapper, '新增或编辑人物', second.id);
  await act(async () => { pending.resolve(true); await task; }); f.wrapper.update();
  expect(field(f.wrapper, '新增或编辑人物').prop('value')).toBe(second.id);
  expect(field(f.wrapper, '全名').prop('value')).toBe('合成人物乙');
});

const publicBoard = { id: 'public', name: '公开图板', tiles: [{ id: 'apple', label: '苹果', image: 'https://static.example.org/apple.png',
  pictogramAttribution: { provider: 'arasaac', originalId: '123', name: '苹果', license: 'CC BY-NC-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/', author: 'ARASAAC', sourceUrl: 'https://arasaac.org/pictograms/123' } }] };

test('failed board creation keeps its ID and offers retry after the board already appears', async () => {
  let wrapper;
  const create = jest.fn(async (name, options) => {
    wrapper.setProps({ boards: [publicBoard, { ...board, id: options.id, name }], editableBoards: [publicBoard, { ...board, id: options.id, name }] });
    return create.mock.calls.length === 1 ? false : options.id;
  });
  wrapper = setup({ boards: [publicBoard], editableBoards: [publicBoard], onCreatePersonalBoard: create });
  await act(async () => button(wrapper, '创建个人板').prop('onClick')()); wrapper.update();
  expect(button(wrapper, '创建个人板').exists()).toBe(false);
  expect(wrapper.text()).toContain('个人板创建失败');
  await act(async () => button(wrapper, '重试保存').prop('onClick')()); wrapper.update();
  expect(create.mock.calls[1][1].id).toBe(create.mock.calls[0][1].id);
  expect(wrapper.text()).toContain('已创建个人板');
});

test('public curation and removal preserve their exact pending operations for retry', async () => {
  let wrapper;
  const save = jest.fn(async (dto, options) => {
    const native = boardDTOToCboardBoard(dto, options.expectedBoard);
    wrapper.setProps({ boards: [publicBoard, native], editableBoards: [publicBoard, native] });
    return save.mock.calls.length % 2 === 0;
  });
  wrapper = setup({ boards: [publicBoard, board], editableBoards: [publicBoard, board], onBoardSave: save });
  await act(async () => button(wrapper, '加入“合成家庭”').prop('onClick')()); wrapper.update();
  expect(wrapper.text()).toContain('个人板保存失败');
  await act(async () => button(wrapper, '加入“合成家庭”').prop('onClick')()); wrapper.update();
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
  expect(wrapper.prop('editableBoards')[1].tiles).toHaveLength(1);
  await act(async () => button(wrapper, '从个人板移除').prop('onClick')()); wrapper.update();
  expect(button(wrapper, '从个人板移除').exists()).toBe(false);
  expect(wrapper.text()).toContain('公开图卡移除失败');
  await act(async () => button(wrapper, '重试保存').prop('onClick')()); wrapper.update();
  expect(save.mock.calls[3][0]).toEqual(save.mock.calls[2][0]);
  expect(wrapper.prop('editableBoards')[1].tiles).toHaveLength(0);
  expect(wrapper.text()).toContain('已从个人板移除');
});

test.each(['create', 'curate', 'remove'])('%s waits for a deferred failure without a success notice', async action => {
  const pending = deferred();
  const save = jest.fn(() => pending.promise);
  const curated = { ...board, tiles: [{ ...publicBoard.tiles[0], id: 'curated_public_apple' }], grid: { rows: 1, columns: 3, order: [['curated_public_apple']] } };
  const boards = action === 'create' ? [publicBoard] : [publicBoard, action === 'remove' ? curated : board];
  const wrapper = setup({ boards, editableBoards: boards, onBoardSave: save, onCreatePersonalBoard: save });
  const label = action === 'create' ? '创建个人板' : action === 'curate' ? '加入“合成家庭”' : '从个人板移除';
  let task;
  act(() => { task = button(wrapper, label).prop('onClick')(); }); wrapper.update();
  expect(wrapper.text()).toContain('正在确认本机保存');
  expect(wrapper.text()).not.toContain('已创建个人板');
  expect(wrapper.text()).not.toContain('已把“苹果”');
  expect(wrapper.text()).not.toContain('已从个人板移除');
  await act(async () => { pending.reject(new Error('synthetic storage failure')); await task; }); wrapper.update();
  expect(button(wrapper, '重试保存').exists()).toBe(true);
});
