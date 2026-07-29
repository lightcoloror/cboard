import {
  blocksPhoneRegistration,
  buildRegistrationPayload,
  hasMatchingPhoneVerification
} from './phoneVerification';

describe('SignUp phone verification helpers', () => {
  const token = 'a'.repeat(64);

  test('includes a one-time token only for the phone it verified', () => {
    const values = {
      name: 'Caregiver',
      email: 'care@example.test',
      phone: '138 0013 8000',
      password: 'secret',
      passwordConfirm: 'secret'
    };

    expect(
      buildRegistrationPayload(values, {
        verifiedPhone: '13800138000',
        verificationToken: token
      })
    ).toEqual({
      name: 'Caregiver',
      email: 'care@example.test',
      phone: '13800138000',
      password: 'secret',
      phoneVerificationToken: token
    });
    expect(
      buildRegistrationPayload(values, {
        verifiedPhone: '13900139000',
        verificationToken: token
      })
    ).not.toHaveProperty('phoneVerificationToken');
  });

  test('keeps the upstream registration payload phone-free when omitted', () => {
    expect(
      buildRegistrationPayload(
        {
          name: 'Caregiver',
          email: 'care@example.test',
          phone: '',
          password: 'secret',
          passwordConfirm: 'secret'
        },
        { verifiedPhone: '', verificationToken: '' }
      )
    ).toEqual({
      name: 'Caregiver',
      email: 'care@example.test',
      password: 'secret'
    });
  });

  test('blocks only a required, unverified phone registration', () => {
    expect(
      blocksPhoneRegistration({
        phone: '13800138000',
        configuration: { requiredForPhoneRegistration: true },
        loading: false,
        verifiedPhone: '',
        verificationToken: ''
      })
    ).toBe(true);
    expect(
      blocksPhoneRegistration({
        phone: '13800138000',
        configuration: { requiredForPhoneRegistration: true },
        loading: false,
        verifiedPhone: '13800138000',
        verificationToken: token
      })
    ).toBe(false);
    expect(
      hasMatchingPhoneVerification({
        phone: '13800138000',
        verifiedPhone: '13800138000',
        verificationToken: 'short'
      })
    ).toBe(false);
  });
});
