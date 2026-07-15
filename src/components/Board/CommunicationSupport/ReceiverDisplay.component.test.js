import React from 'react';
import { shallow } from 'enzyme';
import FullScreenDialog from '../../UI/FullScreenDialog';
import ReceiverDisplay from './ReceiverDisplay.component';

jest.mock('../Symbol', () => {
  return function MockSymbol(props) {
    return <div className="MockSymbol">{props.label}</div>;
  };
});

describe('ReceiverDisplay', () => {
  test('renders matched symbols inside the dedicated full-screen surface', () => {
    const wrapper = shallow(
      <ReceiverDisplay
        open
        title="接收端全屏展示"
        items={[
          { id: 'want', label: '想', image: '/want.svg' },
          { id: 'apple', label: '苹果', image: '/apple.svg' }
        ]}
        onClose={jest.fn()}
      />
    );

    expect(wrapper.find(FullScreenDialog).prop('fullWidth')).toBe(true);
    expect(wrapper.find(FullScreenDialog).prop('buttons')).toBeUndefined();
    expect(
      wrapper.find('.CommunicationSupportPanel__displayScreen')
    ).toHaveLength(1);
    expect(
      wrapper.find('.CommunicationSupportPanel__displayItem')
    ).toHaveLength(2);
    wrapper.find('MockSymbol').forEach(symbol => {
      expect(symbol.prop('className')).toContain(
        'CommunicationSupportPanel__symbol--display'
      );
    });
  });
  test('keeps repeated symbols as distinct full-screen items', () => {
    const wrapper = shallow(
      <ReceiverDisplay
        open
        title="接收端全屏展示"
        items={[
          { id: 'water', label: '水', image: '/water.svg' },
          { id: 'water', label: '水', image: '/water.svg' }
        ]}
        onClose={jest.fn()}
      />
    );

    const keys = wrapper
      .find('.CommunicationSupportPanel__displayItem')
      .map(item => item.key());

    expect(keys).toEqual(['water-0', 'water-1']);
  });
});
