import React from 'react';
import { mount } from 'enzyme';
import CareExpressionBoard from './CareExpressionBoard';
import { recordPictogramUsage } from '../../common/communicationSupport/pictogramOrdering';

test('folder cards navigate without becoming words; ordinary cards record usage and respect popularity', () => {
  const use = jest.fn();
  const apply = jest.fn();
  const jump = jest.fn();
  const boards = [
    {
      id: 'root',
      tiles: [
        { id: 'folder', label: '饮食', loadBoardId: 'food' },
        { id: 'rare', label: '少用' },
        { id: 'often', label: '常用' }
      ],
      layout: { tileIds: ['folder', 'rare', 'often'] }
    },
    { id: 'food', name: '饮食', tiles: [] }
  ];
  const wrapper = mount(
    <CareExpressionBoard
      boards={boards}
      activeBoardId="root"
      output={[]}
      onApplyOutput={apply}
      onJumpBoard={jump}
      onPictogramUsed={use}
      preferences={{ pictogramSortMode: 'popularity' }}
      pictogramOrdering={recordPictogramUsage({}, 'root', 'often', 1000)}
    />
  );
  expect(wrapper.find('div[role="group"] button').map(n => n.text())).toEqual([
    '饮食',
    '常用',
    '少用'
  ]);
  wrapper.find('button[aria-label="选择图卡：饮食"]').simulate('click');
  expect(jump).toHaveBeenCalledWith('food');
  expect(apply).not.toHaveBeenCalled();
  expect(use).not.toHaveBeenCalled();
  wrapper.find('button[aria-label="选择图卡：常用"]').simulate('click');
  expect(use).toHaveBeenCalledWith('root', 'often');
  expect(apply).toHaveBeenCalledWith([boards[0].tiles[2]]);
  wrapper.unmount();
});

test('an unavailable folder is not inserted into an expression', () => {
  const apply = jest.fn(),
    jump = jest.fn();
  const wrapper = mount(
    <CareExpressionBoard
      boards={[
        {
          id: 'a',
          tiles: [{ id: 'link', label: '已删除目录', loadBoardId: 'missing' }]
        }
      ]}
      output={[]}
      onApplyOutput={apply}
      onJumpBoard={jump}
    />
  );
  wrapper.find('button[aria-label="选择图卡：已删除目录"]').simulate('click');
  expect(apply).not.toHaveBeenCalled();
  expect(jump).not.toHaveBeenCalled();
  expect(wrapper.text()).toContain('目标图板已不存在');
  wrapper.unmount();
});

test('selects cards in manual order, permits repeated words, and supports undo', () => {
  const water = {
    id: 'water',
    label: '水',
    image: 'data:image/png;base64,AA=='
  };
  const help = { id: 'help', label: '帮助' };
  const apply = jest.fn();
  const jump = jest.fn();
  const wrapper = mount(
    <CareExpressionBoard
      boards={[
        {
          id: 'a',
          name: '常用',
          tiles: [water, help],
          layout: { tileIds: ['help', 'water'] }
        },
        { id: 'b', name: '其他', tiles: [] }
      ]}
      activeBoardId="a"
      output={[water]}
      onApplyOutput={apply}
      onJumpBoard={jump}
    />
  );
  expect(wrapper.find('button[aria-label="选择图卡：帮助"]').exists()).toBe(
    true
  );
  expect(
    wrapper
      .find('div[role="group"] button')
      .at(0)
      .text()
  ).toBe('帮助');
  wrapper.find('button[aria-label="选择图卡：水"]').simulate('click');
  expect(apply).toHaveBeenLastCalledWith([water, water]);
  wrapper
    .find('button')
    .filterWhere(node => node.text() === '撤回最后一张')
    .simulate('click');
  expect(apply).toHaveBeenLastCalledWith([]);
  wrapper
    .find('button')
    .filterWhere(node => node.text() === '其他')
    .simulate('click');
  expect(jump).toHaveBeenCalledWith('b');
  wrapper.setProps({
    preferences: { fontSize: 'extra-large', gridColumns: 2 }
  });
  expect(
    wrapper.find('div[role="group"]').prop('style').gridTemplateColumns
  ).toBe('repeat(2, minmax(0, 1fr))');
  expect(
    wrapper.find('button[aria-label="选择图卡：水"]').prop('style').fontSize
  ).toBe(32);
  expect(wrapper.prop('output')).toEqual([water]);
  wrapper.unmount();
});
