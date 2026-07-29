import { defineMessages } from 'react-intl';

export default defineMessages({
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
    defaultMessage: '6-digit phone verification code'
  },
  confirmPhoneCode: {
    id: 'cboard.components.Login.confirmPhoneCode',
    defaultMessage: 'Enter and confirm the verification code first.'
  },
  phoneCodeSent: {
    id: 'cboard.components.Login.phoneCodeSent',
    defaultMessage: 'A verification code was sent to {phone}.'
  },
  checkingPhoneLogin: {
    id: 'cboard.components.Login.checkingPhoneLogin',
    defaultMessage: 'Checking phone login availability...'
  },
  phoneVerificationUnavailable: {
    id: 'cboard.components.Login.phoneVerificationUnavailable',
    defaultMessage: 'Phone verification login is not configured on the server.'
  },
  phoneVerificationInvalid: {
    id: 'cboard.components.Login.phoneVerificationInvalid',
    defaultMessage: 'Enter a valid phone number before requesting a code.'
  },
  phoneLoginFailed: {
    id: 'cboard.components.Login.phoneLoginFailed',
    defaultMessage: 'Unable to sign in with this phone number.'
  }
});
