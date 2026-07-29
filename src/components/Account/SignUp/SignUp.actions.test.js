import axios from 'axios';
import {
  confirmPhoneVerification,
  getPhoneVerificationConfiguration,
  requestPhoneVerification,
  signUp
} from './SignUp.actions';

jest.mock('axios');

describe('SignUp actions', () => {
  beforeEach(() => {
    axios.get.mockReset();
    axios.post.mockReset();
  });

  test('uses the public phone verification endpoints', async () => {
    axios.get.mockResolvedValueOnce({ data: { available: true } });
    axios.post
      .mockResolvedValueOnce({ data: { challengeId: 'challenge' } })
      .mockResolvedValueOnce({ data: { verificationToken: 'token' } });

    await getPhoneVerificationConfiguration();
    await requestPhoneVerification('13800138000');
    await confirmPhoneVerification({
      challengeId: 'challenge',
      phone: '13800138000',
      code: '123456'
    });

    expect(axios.get.mock.calls[0][0]).toMatch(/user\/phone-verification$/);
    expect(axios.post.mock.calls[0]).toEqual([
      expect.stringMatching(/user\/phone-verification$/),
      { phone: '13800138000' }
    ]);
    expect(axios.post.mock.calls[1]).toEqual([
      expect.stringMatching(/user\/phone-verification\/confirm$/),
      {
        challengeId: 'challenge',
        phone: '13800138000',
        code: '123456'
      }
    ]);
  });

  test('forwards only the caller-provided registration payload', async () => {
    const payload = {
      name: 'Caregiver',
      email: 'care@example.test',
      phone: '13800138000',
      phoneVerificationToken: 'a'.repeat(64),
      password: 'secret'
    };
    axios.post.mockResolvedValueOnce({ data: { success: 1 } });

    await signUp(payload);

    expect(axios.post.mock.calls[0]).toEqual([
      expect.stringMatching(/user$/),
      payload
    ]);
  });

  test('binds login challenges and confirmations to the login purpose', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { challengeId: 'challenge' } })
      .mockResolvedValueOnce({ data: { verificationToken: 'token' } });

    await requestPhoneVerification('13800138000', 'login');
    await confirmPhoneVerification({
      challengeId: 'challenge',
      phone: '13800138000',
      code: '123456',
      purpose: 'login'
    });

    expect(axios.post.mock.calls[0][1]).toEqual({
      phone: '13800138000',
      purpose: 'login'
    });
    expect(axios.post.mock.calls[1][1]).toEqual({
      challengeId: 'challenge',
      phone: '13800138000',
      code: '123456',
      purpose: 'login'
    });
  });

  test('binds password reset challenges and confirmations to their own purpose', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { challengeId: 'challenge' } })
      .mockResolvedValueOnce({ data: { verificationToken: 'token' } });

    await requestPhoneVerification('13800138000', 'password-reset');
    await confirmPhoneVerification({
      challengeId: 'challenge',
      phone: '13800138000',
      code: '123456',
      purpose: 'password-reset'
    });

    expect(axios.post.mock.calls[0][1]).toEqual({
      phone: '13800138000',
      purpose: 'password-reset'
    });
    expect(axios.post.mock.calls[1][1]).toEqual({
      challengeId: 'challenge',
      phone: '13800138000',
      code: '123456',
      purpose: 'password-reset'
    });
  });
});
