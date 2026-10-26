import React from 'react';
import { shallow, mount } from 'enzyme';

import SymbolOutput from './SymbolOutput';
import ClearButton from './ClearButton';
import BackspaceButton from './BackspaceButton';
import Scroll from './Scroll';
import Symbol from '../../Symbol';

// Exercise the translated control labels; the global auto-mock drops
// defineMessages entirely, so it cannot represent this render path.
jest.mock('react-intl', () => {
  const React = require('react');
  return {
    ...jest.requireActual('react-intl'),
    defineMessages: messages => messages,
    injectIntl: Component => props => React.createElement(Component, {
      ...props, intl: { formatMessage: message => message.defaultMessage }
    })
  };
});

const symbol = { image: 'http://test.com/image.jpg', label: 'dummy label' };
const props = {
  symbols: [symbol],
  navigationSettings: {
    caBackButtonActive: false,
    quickUnlockActive: false,
    removeOutputActive: false
  },
  onRemoveClick: jest.fn(),
  onWriteSymbol: jest.fn()
};

describe('SymbolOutput tests', () => {
  it('renders without crashing', () => {
    shallow(<SymbolOutput {...props} />);
  });

  it('renders with <Scroll />', () => {
    const wrapper = mount(<SymbolOutput {...props} />);
    expect(wrapper.find(Scroll)).toHaveLength(1);
  });

  it('renders with <ClearButton />', () => {
    const wrapper = mount(<SymbolOutput {...props} />);
    expect(wrapper.find(ClearButton)).toHaveLength(1);
  });

  it('renders with <BackspaceButton />', () => {
    const wrapper = mount(<SymbolOutput {...props} />);
    expect(wrapper.find(BackspaceButton)).toHaveLength(1);
  });

  it('renders with one <Symbol />', () => {
    const wrapper = mount(<SymbolOutput {...props} />);
    expect(wrapper.find(Symbol)).toHaveLength(1);
  });
});
