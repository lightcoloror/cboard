import React from 'react';
import { shallow } from 'enzyme';

import { WelcomeScreen } from './WelcomeScreen.container';
import Link from '@material-ui/core/Link';
jest.mock('./WelcomeScreen.messages', () => {
  return {
    login: {
      id: 'cboard.components.WelcomeScreen.login',
      defaultMessage: 'Login'
    },
    signUp: {
      id: 'cboard.components.WelcomeScreen.signUp',
      defaultMessage: 'Sign Up'
    },
    facebook: {
      id: 'cboard.components.WelcomeScreen.facebook',
      defaultMessage: 'Sign in with Facebook'
    },
    google: {
      id: 'cboard.components.WelcomeScreen.google',
      defaultMessage: 'Sign in with Google'
    },
    loginErrorAndroid: {
      id: 'cboard.components.WelcomeScreen.loginErrorAndroid',
      defaultMessage: 'Google login is unavailable'
    },
    skipForNow: {
      id: 'cboard.components.WelcomeScreen.skipForNow',
      defaultMessage: 'Skip for now'
    }
  };
});
const intlMock = {
  formatMessage: ({ id }) => id
};
it('renders without crashing', () => {
  const props = {
    intl: intlMock,
    classes: {
      WelcomeScreen: 'WelcomeScreen'
    },
    finishFirstVisit: jest.fn()
  };
  shallow(<WelcomeScreen {...props} />);
});
it('uses configured care policies and never falls back to upstream policies', () => {
  const keys = [
    'REACT_APP_CARE_COLLABORATION',
    'REACT_APP_PRIVACY_URL',
    'REACT_APP_TERMS_URL'
  ];
  const original = keys.map(key => process.env[key]);
  const props = {
    intl: intlMock,
    classes: { WelcomeScreen: 'WelcomeScreen' },
    finishFirstVisit: jest.fn()
  };
  try {
    process.env.REACT_APP_CARE_COLLABORATION = 'true';
    delete process.env.REACT_APP_PRIVACY_URL;
    delete process.env.REACT_APP_TERMS_URL;
    let wrapper = shallow(<WelcomeScreen {...props} />);
    expect(wrapper.find(Link).map(link => link.prop('href'))).toEqual([
      undefined,
      undefined
    ]);
    wrapper.unmount();
    process.env.REACT_APP_PRIVACY_URL = 'https://example.test/privacy';
    process.env.REACT_APP_TERMS_URL = 'https://example.test/terms';
    wrapper = shallow(<WelcomeScreen {...props} />);
    expect(wrapper.find(Link).map(link => link.prop('href'))).toEqual([
      'https://example.test/privacy',
      'https://example.test/terms'
    ]);
    wrapper.unmount();
  } finally {
    keys.forEach((key, index) => {
      if (original[index] === undefined) delete process.env[key];
      else process.env[key] = original[index];
    });
  }
});

it('fails safely when a local Android core package omits Firebase', () => {
  const originalCordova = window.cordova;
  const originalFirebasePlugin = window.FirebasePlugin;
  const originalAlert = window.alert;
  window.cordova = { platformId: 'android' };
  window.FirebasePlugin = undefined;
  window.alert = jest.fn();
  const props = {
    intl: intlMock,
    classes: { WelcomeScreen: 'WelcomeScreen' },
    finishFirstVisit: jest.fn()
  };
  const instance = new WelcomeScreen(props);

  try {
    instance.handleGoogleLoginClick();

    expect(window.alert).toHaveBeenCalledWith(
      'cboard.components.WelcomeScreen.loginErrorAndroid'
    );
  } finally {
    window.cordova = originalCordova;
    window.FirebasePlugin = originalFirebasePlugin;
    window.alert = originalAlert;
  }
});
