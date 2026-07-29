import { defineMessages } from 'react-intl';

export default defineMessages({
  signUp: {
    id: 'cboard.components.SignUp.signUp',
    defaultMessage: 'Sign Up'
  },
  name: {
    id: 'cboard.components.SignUp.name',
    defaultMessage: 'Name'
  },
  email: {
    id: 'cboard.components.SignUp.email',
    defaultMessage: 'Email'
  },
  phoneOptional: {
    id: 'cboard.components.SignUp.phoneOptional',
    defaultMessage: 'Mainland China phone (optional)'
  },
  sendPhoneCode: {
    id: 'cboard.components.SignUp.sendPhoneCode',
    defaultMessage: 'Send code'
  },
  phoneVerificationCode: {
    id: 'cboard.components.SignUp.phoneVerificationCode',
    defaultMessage: '6-digit phone verification code'
  },
  confirmPhoneCode: {
    id: 'cboard.components.SignUp.confirmPhoneCode',
    defaultMessage: 'Verify phone'
  },
  phoneCodeSent: {
    id: 'cboard.components.SignUp.phoneCodeSent',
    defaultMessage: 'A verification code was sent to {phone}.'
  },
  phoneVerified: {
    id: 'cboard.components.SignUp.phoneVerified',
    defaultMessage: 'Phone number verified.'
  },
  phoneVerificationUnavailable: {
    id: 'cboard.components.SignUp.phoneVerificationUnavailable',
    defaultMessage:
      'Phone verification is required but not configured on the server.'
  },
  phoneVerificationInvalid: {
    id: 'cboard.components.SignUp.phoneVerificationInvalid',
    defaultMessage: 'Enter a valid phone number before requesting a code.'
  },
  createYourPassword: {
    id: 'cboard.components.SignUp.createYourPassword',
    defaultMessage: 'Create your password'
  },
  confirmYourPassword: {
    id: 'cboard.components.SignUp.confirmYourPassword',
    defaultMessage: 'Confirm your password'
  },
  cancel: {
    id: 'cboard.components.SignUp.cancel',
    defaultMessage: 'Cancel'
  },
  signMeUp: {
    id: 'cboard.components.SignUp.signMeUp',
    defaultMessage: 'Sign me up'
  },
  agreement: {
    id: 'cboard.components.SignUp.agreement',
    defaultMessage: 'I agree with the {terms} and the {privacy}'
  },
  termsAndConditions: {
    id: 'cboard.components.SignUp.termsAndConditions',
    defaultMessage: 'Terms'
  },
  privacy: {
    id: 'cboard.components.SignUp.privacy',
    defaultMessage: 'Privacy Policy'
  },
  noConnection: {
    id: 'cboard.components.SignUp.noConnection',
    defaultMessage: 'Unable to connect to the server. Please try again later.'
  }
});
