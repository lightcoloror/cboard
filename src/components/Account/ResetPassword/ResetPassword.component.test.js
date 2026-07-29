import React from 'react';
import { shallow } from 'enzyme';
import { Formik } from 'formik';

import { ResetPassword } from './ResetPassword.component';

jest.mock('./ResetPassword.actions', () => ({
  forgot: jest.fn(),
  resetPasswordWithPhone: jest.fn()
}));

jest.mock('./ResetPassword.messages', () => {
  const message = defaultMessage => ({ id: defaultMessage, defaultMessage });
  return {
    email: message('Email'),
    cancel: message('Cancel'),
    send: message('Send'),
    resetPassword: message('Reset Your Password'),
    resetPasswordText: message('Reset with email'),
    resetPasswordSuccess: message('Email reset requested'),
    resetPasswordError: message('Reset failed'),
    usePhoneReset: message('Use phone reset'),
    useEmailReset: message('Use email reset'),
    phoneResetText: message('Reset with phone'),
    phone: message('Phone'),
    sendPhoneCode: message('Send code'),
    phoneVerificationCode: message('Code'),
    verifyPhoneCode: message('Verify code'),
    confirmPhoneCode: message('Confirm code'),
    phoneCodeSent: message('Code sent'),
    phoneVerified: message('Phone verified'),
    checkingPhoneReset: message('Checking'),
    phoneResetUnavailable: message('Unavailable'),
    phoneVerificationInvalid: message('Invalid phone'),
    newPassword: message('New password'),
    newPasswordRepeat: message('Confirm password'),
    passwordMismatch: message('Passwords mismatch'),
    phoneResetSuccess: message('Password reset'),
    resetNow: message('Reset now'),
    close: message('Close')
  };
});

jest.mock('../PhoneVerification/PhoneVerification.actions', () => ({
  getPhoneVerificationConfiguration: jest.fn(() =>
    Promise.resolve({
      phonePasswordResetAvailable: true
    })
  ),
  requestPhoneVerification: jest.fn(),
  confirmPhoneVerification: jest.fn()
}));

const props = {
  isDialogOpen: false,
  onClose: jest.fn(),
  intl: {
    formatMessage: message => message.defaultMessage || message.id
  },
  forgot: jest.fn(),
  resetPasswordWithPhone: jest.fn()
};

describe('ResetPassword', () => {
  test('keeps the existing email reset as the default mode', () => {
    const wrapper = shallow(<ResetPassword {...props} />);

    expect(wrapper.find(Formik)).toHaveLength(1);
    expect(wrapper.find('[name="phone"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="phone-reset-mode"]')).toHaveLength(1);
  });

  test('exposes a separate phone verification reset mode', () => {
    const wrapper = shallow(<ResetPassword {...props} />);

    wrapper.find('[data-testid="phone-reset-mode"]').simulate('click');

    expect(wrapper.find(Formik)).toHaveLength(0);
    expect(wrapper.find('[name="phone"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="email-reset-mode"]')).toHaveLength(1);
  });
});
