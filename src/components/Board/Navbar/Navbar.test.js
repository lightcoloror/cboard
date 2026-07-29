import React from 'react';
import { shallow } from 'enzyme';

import Navbar, { Navbar as NavbarComponent } from './Navbar';
import BoardShare from '../BoardShare';
import FullScreenButton from '../../UI/FullScreenButton';
import PrintBoardButton from '../../UI/PrintBoardButton';
import UserIcon from '../../UI/UserIcon';
import HelpButton from '../../UI/HelpButton';
import SettingsButton from '../../UI/SettingsButton';

const mockBoard = {
  name: 'tewt',
  id: '12345678901234567',
  tiles: [{ id: '1234', loadBoard: '456456456456456456456' }],
  isPublic: false,
  email: 'asd@qwe.com',
  markToUpdate: true
};

describe('NavBar tests', () => {
  const COMPONENT_PROPS = {
    intl: {},
    board: mockBoard,
    userData: { email: 'qa@qa.com' },
    onLockNotify: jest.fn(),
    className: 'string',
    title: 'string',
    disabled: false,
    isLocked: false,
    onBackClick: jest.fn(),
    onLockClick: jest.fn(),
    isScannerActive: false,
    onDeactivateScannerClick: jest.fn()
  };

  it('renders without crashing', () => {
    const wrapper = shallow(<Navbar {...COMPONENT_PROPS} />);
    expect(wrapper).toMatchSnapshot();
  });
  it('renders without crashing locked', () => {
    const props = {
      ...COMPONENT_PROPS,
      isLocked: true
    };
    const wrapper = shallow(<Navbar {...props} />);
    expect(wrapper).toMatchSnapshot();
  });

  it('hides account, settings, help, and cloud sharing in demo mode', () => {
    const wrapper = shallow(
      <NavbarComponent
        {...COMPONENT_PROPS}
        demoMode
        intl={{ formatMessage: () => 'share' }}
        history={{ push: jest.fn() }}
      />
    );

    expect(wrapper.find(SettingsButton).exists()).toBe(false);
    expect(wrapper.find(HelpButton).exists()).toBe(false);
    expect(wrapper.find(BoardShare).exists()).toBe(false);
    expect(wrapper.find(UserIcon).exists()).toBe(false);
    expect(wrapper.find(PrintBoardButton).exists()).toBe(true);
    expect(wrapper.find(FullScreenButton).exists()).toBe(true);
  });
});
