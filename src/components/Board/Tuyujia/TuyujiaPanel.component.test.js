import React from 'react';
import { shallow } from 'enzyme';
import TuyujiaPanel from './TuyujiaPanel.component';

const COMPONENT_PROPS = {
  boards: [],
  output: [],
  activeBoardId: null,
  intl: null,
  isLogged: false,
  onApplyOutput: () => {},
  onJumpBoard: () => {}
};

describe('TuyujiaPanel wrapper', () => {
  test('renders the neutral communication support panel', () => {
    const wrapper = shallow(<TuyujiaPanel {...COMPONENT_PROPS} />);

    expect(wrapper.find('CommunicationSupportPanel').exists()).toBe(true);
  });

  test('passes branded copy overrides through to the neutral panel', () => {
    const wrapper = shallow(<TuyujiaPanel {...COMPONENT_PROPS} />);
    const component = wrapper.find('CommunicationSupportPanel');

    expect(component.prop('copyOverrides')).toEqual(
      expect.objectContaining({
        title: '图语家双向沟通',
        expressSectionTitle: '患者端候选句',
        receiveSectionTitle: '照护者输入转图片'
      })
    );
    expect(component.prop('onApplyOutput')).toBe(COMPONENT_PROPS.onApplyOutput);
    expect(component.prop('onJumpBoard')).toBe(COMPONENT_PROPS.onJumpBoard);
  });
});
