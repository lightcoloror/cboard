import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import GalleryTileUndoControl from './GalleryTileUndoControl.component';
import { createGalleryTileUndoService } from '../../../common/communicationSupport/galleryTileUndo';

const setup = () => {
  let boards = [{ id: 'board', tiles: [{ id: 'one', label: '合成姓名', image: 'synthetic-private:image' }] }];
  const saveBoard = jest.fn(async board => { boards = [JSON.parse(JSON.stringify(board))]; return true; });
  const service = createGalleryTileUndoService({ loadBoards: () => boards, saveBoard });
  return { service, saveBoard };
};
test('single-card undo remains visible after management remount and requires an explicit action', async () => {
  const f = setup();
  await f.service.delete('board', 'one');
  let wrapper = mount(<GalleryTileUndoControl service={f.service} />);
  expect(wrapper.text()).toContain('合成姓名');
  expect(wrapper.text()).toContain('最近 20 次');
  wrapper.unmount();
  wrapper = mount(<GalleryTileUndoControl service={f.service} />);
  expect(f.saveBoard).toHaveBeenCalledTimes(1);
  await act(async () => { wrapper.find('button').simulate('click'); });
  wrapper.update();
  expect(f.service.state().count).toBe(0);
  expect(f.saveBoard).toHaveBeenCalledTimes(2);
  wrapper.unmount();
});
test('failure retains the undo button and error; double click shares one operation', async () => {
  const f = setup(); await f.service.delete('board', 'one');
  let finish;
  f.saveBoard.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const wrapper = mount(<GalleryTileUndoControl service={f.service} />);
  await act(async () => { wrapper.find('button').simulate('click'); wrapper.find('button').simulate('click'); });
  expect(f.saveBoard).toHaveBeenCalledTimes(2);
  await act(async () => { finish(false); }); wrapper.update();
  expect(wrapper.text()).toContain('保存未确认');
  expect(wrapper.find('button').length).toBe(1);
  expect(f.service.state().count).toBe(1);
  wrapper.unmount();
});
