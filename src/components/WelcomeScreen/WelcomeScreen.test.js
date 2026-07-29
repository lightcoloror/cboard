import React from 'react';
import { shallow } from 'enzyme';

import { WelcomeScreen } from './WelcomeScreen.container';
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
