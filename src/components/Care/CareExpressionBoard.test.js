import React from 'react';
import { mount } from 'enzyme';
import CareExpressionBoard from './CareExpressionBoard';

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
