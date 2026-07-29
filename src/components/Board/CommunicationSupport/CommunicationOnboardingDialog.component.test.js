import React from 'react';
import { mount } from 'enzyme';
import CommunicationOnboardingDialog from './CommunicationOnboardingDialog.component';

describe('CommunicationOnboardingDialog', () => {
  test('explains both directions and completes from one clear action', () => {
    const onComplete = jest.fn();
    const wrapper = mount(
      <CommunicationOnboardingDialog open onComplete={onComplete} />
    );

    expect(wrapper.text()).toContain('患者表达');
    expect(wrapper.text()).toContain('接收理解');
    expect(wrapper.text()).toContain('离线优先');
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '开始使用')
      .first()
      .simulate('click');

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
