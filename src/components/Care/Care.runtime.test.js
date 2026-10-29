import { runtime } from './Care';
import { getStore } from '../../store';
import history from '../../history';
import {
  speak,
  cancelSpeech
} from '../../providers/SpeechProvider/SpeechProvider.actions';
jest.mock('../../providers/SpeechProvider/SpeechProvider.actions', () => ({
  speak: jest.fn((text, done, options) => ({
    type: 'SYNTHETIC_SPEAK',
    text,
    done,
    options
  })),
  cancelSpeech: jest.fn(() => ({ type: 'SYNTHETIC_CANCEL' })),
  changeRate: jest.fn(rate => ({ type: 'SYNTHETIC_RATE', rate }))
}));
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
test('Care speech waits for the original SpeechProvider completion and forwards only an explicit rate override', async () => {
  let completed = false;
  const task = runtime.speak('第一句').then(() => {
    completed = true;
  });
  await Promise.resolve();
  expect(completed).toBe(false);
  expect(speak).toHaveBeenLastCalledWith('第一句', expect.any(Function), {});
  speak.mock.calls[speak.mock.calls.length - 1][1]();
  await task;
  expect(completed).toBe(true);
  const second = runtime.speak('第二句', 0.8);
  expect(speak).toHaveBeenLastCalledWith('第二句', expect.any(Function), {
    rate: 0.8
  });
  speak.mock.calls[speak.mock.calls.length - 1][1]();
  await second;
});

test('Care speech cancellation and provider errors settle without starting a successor', async () => {
  const first = runtime.speak('待取消');
  const cancelled = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  runtime.cancelSpeech();
  await cancelled;
  expect(cancelSpeech).toHaveBeenCalled();
  const second = runtime.speak('失败');
  const failed = expect(second).rejects.toThrow('播报失败');
  speak.mock.calls[speak.mock.calls.length - 1][1]({ error: true });
  await failed;
});
test.each([['false', false], ['true', true]])(
  'restricted trial exposes existing funding selection only when text AI is explicitly %s',
  (flag, enabled) => {
    const previous = { ...process.env };
    try {
      process.env.REACT_APP_TUYUJIA_CLOUD_TRIAL = 'true';
      process.env.REACT_APP_CARE_AI_TRIAL = flag;
      jest.isolateModules(() => {
        expect(require('./Care').runtime.fundingEnabled).toBe(enabled);
      });
    } finally {
      process.env = previous;
    }
  }
);
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
test('anonymous Care navigation opens account entry without logging out or clearing local data', () => {
  const logout = jest.spyOn(runtime, 'logout');
  const before = localStorage.getItem('care-offline-selection-v1');
  runtime.openAccount();
  expect(history.replace).toHaveBeenCalledWith('/login-signup');
  expect(logout).not.toHaveBeenCalled();
  expect(localStorage.getItem('care-offline-selection-v1')).toBe(before);
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
test('a replaced session cannot publish its old profile relationship', async () => {
  const event = jest.spyOn(window, 'dispatchEvent');
  jest.spyOn(runtime, 'request').mockImplementation(async () => {
    sessionToken = 'replacement';
    return {};
  });
  await expect(
    runtime.selectProfile({
      id: 'patient',
      familyId: 'family',
      relationship: { role: 'patient' }
    })
  ).rejects.toMatchObject({ status: 401 });
  expect(localStorage.getItem('care-selection-v1:first')).toBeNull();
  expect(event).not.toHaveBeenCalled();
});

test('a late profile selection cannot overwrite a newer selection under the same session', async () => {
  const pending = {};
  let generation = 1;
  const event = jest.spyOn(window, 'dispatchEvent');
  jest.spyOn(runtime, 'request').mockImplementation(
    (...request) => request[1] === 'GET'
      ? Promise.resolve({ selectionVersion: 0 })
      :
      new Promise(resolve => {
        const body = request[2];
        pending[body.profileId] = resolve;
      })
  );
  const a = runtime.selectProfile(
    { id: 'patient-a', familyId: 'family-a' },
    () => generation === 1
  );
  await Promise.resolve();
  generation = 2;
  const b = runtime.selectProfile(
    { id: 'patient-b', familyId: 'family-b' },
    () => generation === 2
  );
  await Promise.resolve();
  pending['patient-b']({});
  await expect(b).resolves.toBe(true);
  expect(JSON.parse(localStorage.getItem('care-selection-v1:first'))).toEqual({
    id: 'patient-b',
    familyId: 'family-b'
  });
  expect(event).toHaveBeenCalledTimes(1);
  pending['patient-a']({});
  await expect(a).resolves.toBe(false);
  expect(JSON.parse(localStorage.getItem('care-selection-v1:first'))).toEqual({
    id: 'patient-b',
    familyId: 'family-b'
  });
  expect(event).toHaveBeenCalledTimes(1);
});

test('a stale offline fallback cannot publish its old profile selection', async () => {
  let fail;
  let generation = 1;
  const event = jest.spyOn(window, 'dispatchEvent');
  jest.spyOn(runtime, 'request').mockImplementation(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      })
  );
  const selection = runtime.selectProfile(
    { id: 'patient-a', familyId: 'family-a' },
    () => generation === 1
  );
  generation = 2;
  fail(new Error('offline'));
  await expect(selection).resolves.toBe(false);
  expect(localStorage.getItem('care-selection-v1:first')).toBeNull();
  expect(event).not.toHaveBeenCalled();
});

test('an explicit profile choice reads the selection version before its conditional write', async () => {
  const request = jest.spyOn(runtime, 'request')
    .mockResolvedValueOnce({ selectedProfileId: 'old', selectionVersion: 7 })
    .mockResolvedValueOnce({ selectedProfileId: 'patient', selectionVersion: 8 });
  const event = jest.spyOn(window, 'dispatchEvent');
  const profile = { id: 'patient', familyId: 'family' };
  await expect(runtime.selectProfile(profile)).resolves.toBe(true);
  expect(request.mock.calls).toEqual([
    ['/care/context', 'GET'],
    ['/care/context', 'PUT', { profileId: 'patient', expectedSelectionVersion: 7 }]
  ]);
  expect(JSON.parse(localStorage.getItem('care-selection-v1:first'))).toEqual(profile);
  expect(event).toHaveBeenCalledTimes(1);
});

test('automatic GET and offline-cache restoration never submits a new selection intent', async () => {
  const request = jest.spyOn(runtime, 'request');
  const profile = { id: 'patient', familyId: 'family' };
  await expect(runtime.selectProfile(profile, () => true, { persist: false })).resolves.toBe(true);
  expect(request).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem('care-selection-v1:first'))).toEqual(profile);
  account = null;
  localStorage.setItem('care-offline-selection-v1', JSON.stringify(profile));
  await expect(runtime.selectProfile(profile, () => true, { persist: false })).resolves.toBe(true);
  expect(request).not.toHaveBeenCalled();
});

test.each([undefined, null, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1])(
  'a server with unverifiable selection version %s is refused without an unconditional PUT',
  async selectionVersion => {
    const request = jest.spyOn(runtime, 'request').mockResolvedValue({ selectionVersion });
    await expect(runtime.selectProfile({ id: 'patient', familyId: 'family' }))
      .rejects.toMatchObject({ status: 503, code: 'CARE_CONTEXT_VERSION_UNAVAILABLE' });
    expect(request.mock.calls).toEqual([['/care/context', 'GET']]);
    expect(localStorage.getItem('care-selection-v1:first')).toBeNull();
  }
);

const contextConflict = () => Object.assign(new Error('CARE_CONTEXT_CHANGED'), {
  status: 409, data: { code: 'CARE_CONTEXT_CHANGED' }
});

test('a still-current selection refreshes a conflicting version for at most three total attempts', async () => {
  let version = 4;
  const request = jest.spyOn(runtime, 'request').mockImplementation(async (_, method) => {
    if (method === 'GET') return { selectionVersion: version++ };
    if (version < 7) throw contextConflict();
    return { selectionVersion: version };
  });
  const event = jest.spyOn(window, 'dispatchEvent');
  await expect(runtime.selectProfile({ id: 'patient', familyId: 'family' })).resolves.toBe(true);
  expect(request.mock.calls.filter(call => call[1] === 'PUT').map(call => call[2])).toEqual(
    [4, 5, 6].map(expectedSelectionVersion => ({ profileId: 'patient', expectedSelectionVersion }))
  );
  expect(event).toHaveBeenCalledTimes(1);
});

test('selection conflict exhaustion does not persist a local success or keep retrying', async () => {
  const request = jest.spyOn(runtime, 'request').mockImplementation(async (_, method) => {
    if (method === 'GET') return { selectionVersion: 3 };
    throw contextConflict();
  });
  const event = jest.spyOn(window, 'dispatchEvent');
  await expect(runtime.selectProfile({ id: 'patient', familyId: 'family' }))
    .rejects.toMatchObject({ status: 409, data: { code: 'CARE_CONTEXT_CHANGED' } });
  expect(request).toHaveBeenCalledTimes(6);
  expect(localStorage.getItem('care-selection-v1:first')).toBeNull();
  expect(event).not.toHaveBeenCalled();
});

test('a stale A conflict cannot refresh or republish after B became the current intent', async () => {
  let rejectA;
  let generation = 1;
  const request = jest.spyOn(runtime, 'request').mockImplementation((_, method, body) => {
    if (method === 'GET') return Promise.resolve({ selectionVersion: 1 });
    if (body.profileId === 'patient-a') return new Promise((resolve, reject) => { rejectA = reject; });
    return Promise.resolve({ selectionVersion: 2 });
  });
  const event = jest.spyOn(window, 'dispatchEvent');
  const a = runtime.selectProfile({ id: 'patient-a', familyId: 'family' }, () => generation === 1);
  await Promise.resolve();
  generation = 2;
  await expect(runtime.selectProfile({ id: 'patient-b', familyId: 'family' }, () => generation === 2))
    .resolves.toBe(true);
  rejectA(contextConflict());
  await expect(a).resolves.toBe(false);
  expect(request).toHaveBeenCalledTimes(4);
  expect(JSON.parse(localStorage.getItem('care-selection-v1:first')).id).toBe('patient-b');
  expect(event).toHaveBeenCalledTimes(1);
});

test('a stale GET response cannot start a selection write', async () => {
  let resolve;
  let current = true;
  const request = jest.spyOn(runtime, 'request').mockImplementation(() => new Promise(done => { resolve = done; }));
  const pending = runtime.selectProfile({ id: 'patient', familyId: 'family' }, () => current);
  current = false;
  resolve({ selectionVersion: 1 });
  await expect(pending).resolves.toBe(false);
  expect(request).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('care-selection-v1:first')).toBeNull();
});

test.each(['account', 'token'])(
  'a changed %s after a conflict cannot start the next version read',
  async change => {
    const request = jest.spyOn(runtime, 'request').mockImplementation(async (_, method) => {
      if (method === 'GET') return { selectionVersion: 2 };
      if (change === 'account') account = 'second';
      else sessionToken = 'replacement';
      throw contextConflict();
    });
    await expect(runtime.selectProfile({ id: 'patient', familyId: 'family' }))
      .rejects.toMatchObject({ status: 401 });
    expect(request).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('care-selection-v1:first')).toBeNull();
  }
);

test('unrelated access conflicts are not retried as selection conflicts', async () => {
  const request = jest.spyOn(runtime, 'request')
    .mockResolvedValueOnce({ selectionVersion: 2 })
    .mockRejectedValueOnce(Object.assign(new Error('FAMILY_CLOSING'), {
      status: 409, data: { code: 'FAMILY_CLOSING' }
    }));
  await expect(runtime.selectProfile({ id: 'patient', familyId: 'family' }))
    .rejects.toMatchObject({ status: 409, data: { code: 'FAMILY_CLOSING' } });
  expect(request).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem('care-selection-v1:first')).toBeNull();
});

test('an explicit choice still retains the existing local fallback after a network-only PUT failure', async () => {
  const request = jest.spyOn(runtime, 'request')
    .mockResolvedValueOnce({ selectionVersion: 2 })
    .mockRejectedValueOnce(new Error('offline'));
  const profile = { id: 'patient', familyId: 'family' };
  await expect(runtime.selectProfile(profile)).resolves.toBe(true);
  expect(request).toHaveBeenCalledTimes(2);
  expect(JSON.parse(localStorage.getItem('care-selection-v1:first'))).toEqual(profile);
});
