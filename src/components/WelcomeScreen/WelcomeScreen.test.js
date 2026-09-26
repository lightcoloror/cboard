import React from 'react';
import { shallow } from 'enzyme';

import { WelcomeScreen } from './WelcomeScreen.container';
import Link from '@material-ui/core/Link';
import Button from '@material-ui/core/Button';
import {
  AppleLoginButton,
  FacebookLoginButton,
  GoogleLoginButton
} from 'react-social-login-buttons';
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

it('limits the enabled cloud trial to test-account login or local use', () => {
  const original = process.env.REACT_APP_TUYUJIA_CLOUD_TRIAL;
  const finishFirstVisit = jest.fn();
  const props = {
    intl: intlMock,
    classes: { WelcomeScreen: 'WelcomeScreen' },
    finishFirstVisit
  };

  try {
    process.env.REACT_APP_TUYUJIA_CLOUD_TRIAL = 'true';
    const trial = shallow(<WelcomeScreen {...props} />);
    expect(trial.find('.WelcomeScreen__cloud-trial').text()).toContain(
      '图语家 · 云端受限试用'
    );
    expect(trial.find('.WelcomeScreen__cloud-trial').text()).toContain(
      '专用测试账号和合成资料'
    );
    expect(trial.find(Button)).toHaveLength(2);
    expect(
      trial
        .find(Button)
        .at(1)
        .text()
    ).toContain('本地使用（下次再说）');
    expect(
      trial
        .find(Button)
        .someWhere(button =>
          String(button.prop('className')).includes('--signup')
        )
    ).toBe(false);
    expect(trial.find(GoogleLoginButton)).toHaveLength(0);
    expect(trial.find(FacebookLoginButton)).toHaveLength(0);
    expect(trial.find(AppleLoginButton)).toHaveLength(0);
    expect(trial.find(Link)).toHaveLength(0);
    trial
      .find(Button)
      .at(1)
      .simulate('click');
    expect(finishFirstVisit).toHaveBeenCalledTimes(1);
    trial.unmount();

    delete process.env.REACT_APP_TUYUJIA_CLOUD_TRIAL;
    const standard = shallow(<WelcomeScreen {...props} />);
    expect(standard.find('.WelcomeScreen__cloud-trial')).toHaveLength(0);
    expect(
      standard
        .find(Button)
        .someWhere(button =>
          String(button.prop('className')).includes('--signup')
        )
    ).toBe(true);
    expect(standard.find(Link)).toHaveLength(2);
    standard.unmount();
  } finally {
    if (original === undefined)
      delete process.env.REACT_APP_TUYUJIA_CLOUD_TRIAL;
    else process.env.REACT_APP_TUYUJIA_CLOUD_TRIAL = original;
  }
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
