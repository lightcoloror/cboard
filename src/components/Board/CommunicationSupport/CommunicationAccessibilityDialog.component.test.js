import React from 'react';
import { mount } from 'enzyme';
import { DEFAULT_COMMUNICATION_PREFERENCES } from '../../../common/communicationSupport/communicationPreferences';
import CommunicationAccessibilityDialog from './CommunicationAccessibilityDialog.component';

const boards = [{ id: 'home', name: '首页' }, { id: 'food', name: '食物' }];

describe('CommunicationAccessibilityDialog', () => {
  test('updates high contrast through the shared preferences contract', () => {
    const onChange = jest.fn();
    const wrapper = mount(
      <CommunicationAccessibilityDialog
        open
        onClose={jest.fn()}
        boards={boards}
        value={DEFAULT_COMMUNICATION_PREFERENCES}
        onChange={onChange}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '未开启')
      .first()
      .simulate('click');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ highContrast: true })
    );
  });

  test('lets the caregiver disable candidate autoplay', () => {
    const onChange = jest.fn();
    const wrapper = mount(
      <CommunicationAccessibilityDialog
        open
        onClose={jest.fn()}
        boards={boards}
        value={DEFAULT_COMMUNICATION_PREFERENCES}
        onChange={onChange}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '关闭')
      .first()
      .simulate('click');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateAutoplayDelaySeconds: 0
      })
    );
  });

  test('lets the caregiver switch to actual-use popularity ordering', () => {
    const onChange = jest.fn();
    const wrapper = mount(
      <CommunicationAccessibilityDialog
        open
        onClose={jest.fn()}
        boards={boards}
        value={DEFAULT_COMMUNICATION_PREFERENCES}
        onChange={onChange}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '常用优先')
      .first()
      .simulate('click');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ pictogramSortMode: 'popularity' })
    );
  });

  test('never lets the caregiver hide the last visible matching board', () => {
    const wrapper = mount(
      <CommunicationAccessibilityDialog
        open
        onClose={jest.fn()}
        boards={boards}
        value={{
          ...DEFAULT_COMMUNICATION_PREFERENCES,
          hiddenBoardIds: ['food']
        }}
        onChange={jest.fn()}
      />
    );
    const rows = wrapper.find(
      'div.CommunicationSupportPanel__boardVisibilityRow'
    );

    expect(
      rows
        .filterWhere(node => node.text().includes('首页'))
        .first()
        .find('ForwardRef(Button)')
        .prop('disabled')
    ).toBe(true);
    expect(
      rows
        .filterWhere(node => node.text().includes('食物'))
        .first()
        .find('ForwardRef(Button)')
        .prop('disabled')
    ).toBe(false);
  });

  test('offers a stable entry to replay the first-use guide', () => {
    const onReplayOnboarding = jest.fn();
    const wrapper = mount(
      <CommunicationAccessibilityDialog
        open
        onClose={jest.fn()}
        onReplayOnboarding={onReplayOnboarding}
        boards={boards}
        value={DEFAULT_COMMUNICATION_PREFERENCES}
        onChange={jest.fn()}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '重新查看使用引导')
      .first()
      .simulate('click');

    expect(onReplayOnboarding).toHaveBeenCalledTimes(1);
  });
});
