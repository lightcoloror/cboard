import React from 'react';
import { shallow, mount } from 'enzyme';
import { shallowMatchSnapshot } from '../../../common/test_utils';
import { Login } from './Login.component';

jest.mock('./Login.messages', () => {
  return {
    login: {
      id: 'cboard.components.Login.login',
      defaultMessage: 'Login'
    },
    email: {
      id: 'cboard.components.Login.email',
      defaultMessage: 'Email'
    },
    password: {
      id: 'cboard.components.Login.password',
      defaultMessage: 'Password'
    },
    cancel: {
      id: 'cboard.components.Login.cancel',
      defaultMessage: 'Cancel'
    },
    forgotPassword: {
      id: 'cboard.components.Login.forgotPassword',
      defaultMessage: 'Forgot password?'
    },
    phoneLogin: {
      id: 'cboard.components.Login.phoneLogin',
      defaultMessage: 'Use phone verification code'
    },
    passwordLogin: {
      id: 'cboard.components.Login.passwordLogin',
      defaultMessage: 'Use email and password'
    },
    phone: {
      id: 'cboard.components.Login.phone',
      defaultMessage: 'Mainland China phone'
    },
    sendPhoneCode: {
      id: 'cboard.components.Login.sendPhoneCode',
      defaultMessage: 'Send code'
    },
    phoneVerificationCode: {
      id: 'cboard.components.Login.phoneVerificationCode',
      defaultMessage: '6-digit code'
    },
    confirmPhoneCode: {
      id: 'cboard.components.Login.confirmPhoneCode',
      defaultMessage: 'Confirm code'
    },
    phoneCodeSent: {
      id: 'cboard.components.Login.phoneCodeSent',
      defaultMessage: 'Code sent'
    },
    checkingPhoneLogin: {
      id: 'cboard.components.Login.checkingPhoneLogin',
      defaultMessage: 'Checking'
    },
    phoneVerificationUnavailable: {
      id: 'cboard.components.Login.phoneVerificationUnavailable',
      defaultMessage: 'Unavailable'
    },
    phoneVerificationInvalid: {
      id: 'cboard.components.Login.phoneVerificationInvalid',
      defaultMessage: 'Invalid phone'
    },
    phoneLoginFailed: {
      id: 'cboard.components.Login.phoneLoginFailed',
      defaultMessage: 'Login failed'
    }
  };
});

const mockLoginfn = jest.fn();
const props = {
  isDialogOpen: false,
  onClose: jest.fn(),
  intl: {
    formatMessage: msg => msg
  },
  onResetPasswordClick: jest.fn(),
  login: mockLoginfn,
  loginWithPhone: jest.fn()
};

describe('Login tests', () => {
  test('default renderer', () => {
    const wrapper = shallow(<Login {...props} />);
    expect(wrapper).toMatchSnapshot();
  });

  test('exposes phone verification as a separate login mode', () => {
    const wrapper = shallow(<Login {...props} />);

    wrapper.find('[data-testid="phone-login-mode"]').simulate('click');

    expect(wrapper.find('[name="phone"]')).toHaveLength(1);
    expect(wrapper.find('[name="email"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="password-login-mode"]')).toHaveLength(1);
  });
});
