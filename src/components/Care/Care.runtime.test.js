import { runtime } from './Care';
import { getStore } from '../../store';
import history from '../../history';
jest.mock('../../history', () => ({ replace: jest.fn() }));
jest.mock('../../store', () => ({ getStore: jest.fn() }));
jest.mock('../../constants', () => ({ API_URL: 'http://synthetic.invalid' }));
jest.mock('../../common/communicationSupport/CarePanel', () => () => null);
jest.mock('../Account/Login/Login.actions', () => ({ logout: jest.fn() }));
jest.mock('../../common/communicationSupport/localData', () => ({
  configureCareLocalAccount: jest.fn()
}));
let account, sessionToken;
beforeEach(() => {
  account = 'first';
  sessionToken = 'synthetic';
  history.replace.mockClear();
  localStorage.clear();
  getStore.mockReturnValue({
    getState: () => ({
      app: { userData: { id: account, authToken: sessionToken } }
    }),
    dispatch: jest.fn()
  });
});
afterEach(() => jest.restoreAllMocks());
test('waits for asynchronous logout before opening the login route', async () => {
  const previous = global.fetch;
  let finishLogout;
  const completed = new Promise(resolve => {
    finishLogout = resolve;
  });
  const logout = jest.spyOn(runtime, 'logout').mockReturnValue(completed);
  global.fetch = jest.fn(async () => ({
    ok: false,
    status: 401,
    json: async () => ({ code: 'AUTH_REQUIRED' })
  }));
  try {
    const pending = runtime.request('/care/profiles');
    const rejected = expect(pending).rejects.toMatchObject({ status: 401 });
    await Promise.resolve();
    await Promise.resolve();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(history.replace).not.toHaveBeenCalled();
    finishLogout();
    await rejected;
    expect(history.replace).toHaveBeenCalledWith('/login-signup');
  } finally {
    global.fetch = previous;
  }
});
test.each([401, 403, 503])(
  'preserves HTTP %s when an error body is not JSON',
  async status => {
    const previous = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: false,
      status,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      }
    }));
    try {
      await expect(runtime.request('/care/profiles')).rejects.toMatchObject({
        status,
        code: 'INVALID_RESPONSE'
      });
      expect(history.replace).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
    } finally {
      global.fetch = previous;
    }
  }
);
test.each(['unchanged', 'new-account', 'new-session'])(
  'only invalidates the initiating session for JSON 401 (%s)',
  async change => {
    const previous = global.fetch;
    global.fetch = jest.fn(async () => {
      if (change === 'new-account') account = 'second';
      if (change === 'new-session') sessionToken = 'new-token';
      return {
        ok: false,
        status: 401,
        json: async () => ({ code: 'AUTH_REQUIRED' })
      };
    });
    try {
      await expect(runtime.request('/care/profiles')).rejects.toMatchObject({
        status: 401
      });
      expect(getStore().dispatch).toHaveBeenCalledTimes(
        change === 'unchanged' ? 1 : 0
      );
      expect(history.replace).toHaveBeenCalledTimes(
        change === 'unchanged' ? 1 : 0
      );
    } finally {
      global.fetch = previous;
    }
  }
);
test.each([false, true])(
  'settings do not publish an old selection after account changes (offline=%s)',
  async offline => {
    const event = jest.spyOn(window, 'dispatchEvent');
    jest.spyOn(runtime, 'request').mockImplementation(async () => {
      account = 'second';
      if (offline) throw new Error('offline');
      return {};
    });
    await expect(
      runtime.selectProfile({ id: 'patient', familyId: 'family' })
    ).rejects.toMatchObject({ status: 401 });
    expect(localStorage.getItem('care-selection-v1:first')).toBeNull();
    expect(localStorage.getItem('care-selection-v1:second')).toBeNull();
    expect(event).not.toHaveBeenCalled();
  }
);
test('unchanged accounts retain offline selection support', async () => {
  jest.spyOn(runtime, 'request').mockRejectedValue(new Error('offline'));
  const profile = { id: 'patient', familyId: 'family' };
  await runtime.selectProfile(profile);
  expect(JSON.parse(localStorage.getItem('care-selection-v1:first'))).toEqual(
    profile
  );
});
