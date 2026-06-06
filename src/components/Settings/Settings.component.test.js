import React from 'react';
import { shallow } from 'enzyme';
import { Settings } from './Settings.component';
import messages from './Settings.messages';

jest.mock('./SettingsTour.component', () => 'SettingsTour');
jest.mock('./Settings.messages', () => ({
  __esModule: true,
  default: {
    settings: {
      id: 'cboard.components.Settings.settings',
      defaultMessage: 'Settings'
    },
    people: {
      id: 'cboard.components.Settings.people',
      defaultMessage: 'People'
    },
    guest: {
      id: 'cboard.components.Settings.guest',
      defaultMessage: 'Guest'
    },
    loginSignup: {
      id: 'cboard.components.Settings.loginSignup',
      defaultMessage: 'Login / Sign Up'
    },
    language: {
      id: 'cboard.components.Settings.language',
      defaultMessage: 'Language'
    },
    speech: {
      id: 'cboard.components.Settings.speech',
      defaultMessage: 'Speech'
    },
    system: {
      id: 'cboard.components.Settings.system',
      defaultMessage: 'System'
    },
    export: {
      id: 'cboard.components.Settings.export',
      defaultMessage: 'Export'
    },
    import: {
      id: 'cboard.components.Settings.import',
      defaultMessage: 'Import'
    },
    symbols: {
      id: 'cboard.components.Settings.symbols',
      defaultMessage: 'Symbols'
    },
    display: {
      id: 'cboard.components.Settings.display',
      defaultMessage: 'Display'
    },
    scanning: {
      id: 'cboard.components.Settings.scanning',
      defaultMessage: 'Scanning'
    },
    navigation: {
      id: 'cboard.components.Settings.navigation',
      defaultMessage: 'Navigation'
    },
    communicationSupport: {
      id: 'cboard.components.Settings.communicationSupport',
      defaultMessage: 'Communication Support'
    },
    help: {
      id: 'cboard.components.Settings.help',
      defaultMessage: 'Help'
    },
    userHelp: {
      id: 'cboard.components.Settings.userHelp',
      defaultMessage: 'User Help'
    },
    about: {
      id: 'cboard.components.Settings.about',
      defaultMessage: 'About Cboard'
    },
    donate: {
      id: 'cboard.components.Settings.donate',
      defaultMessage: 'Donate'
    },
    feedback: {
      id: 'cboard.components.Settings.feedback',
      defaultMessage: 'Feedback'
    },
    enableTour: {
      id: 'cboard.components.Settings.enableTour',
      defaultMessage: 'Enable tour'
    }
  }
}));

const COMPONENT_PROPS = {
  isLogged: false,
  logout: jest.fn(),
  user: {},
  intl: {
    formatMessage: jest.fn(message => message.defaultMessage || message.id)
  },
  isDownloadingLang: false,
  isSettingsTourEnabled: false,
  isInFreeCountry: true,
  disableTour: jest.fn(),
  history: {
    replace: jest.fn()
  },
  location: {
    pathname: '/settings/communication-support'
  }
};

describe('Settings component', () => {
  test('includes communication support section entry', () => {
    const wrapper = shallow(<Settings {...COMPONENT_PROPS} />);
    const communicationSection = wrapper
      .find('SettingsSection')
      .findWhere(
        section =>
          section.prop('subheader') &&
          section.prop('subheader').id === messages.communicationSupport.id
      )
      .first();

    expect(communicationSection.exists()).toBe(true);
    expect(communicationSection.prop('settings')).toEqual([
      expect.objectContaining({
        url: '/settings/communication-support',
        text: messages.communicationSupport
      })
    ]);
  });

  test('renders communication support section in settings list', () => {
    const wrapper = shallow(<Settings {...COMPONENT_PROPS} />);
    const sectionIds = wrapper
      .find('SettingsSection')
      .map(section => section.prop('subheader').id);

    expect(sectionIds).toContain(messages.communicationSupport.id);
  });
});
