import API from './api';
import { getStore } from '../store';
import { logout } from '../components/Account/Login/Login.actions';
import history from '../history';
import { buildCommunicationAiSentenceRequest } from '../common/communicationSupport/communicationAi';
import { buildPersonalPictogramTileDTO } from '../common/communicationSupport/pictogramMetadataSuggestion';

jest.mock('../store');
jest.mock('../components/Account/Login/Login.actions', () => ({
  logout: jest.fn(() => ({ type: 'SYNTHETIC_LOGOUT' }))
}));
jest.mock('../history', () => ({ push: jest.fn() }));
jest.unmock('axios');

describe('AI request through the installed Axios interceptor', () => {
  const previousEnv = { ...process.env };
  const store = getStore();
  let previousUser;
  let previousAdapter;
  let previousCrypto;
  let adapter;
  beforeEach(() => {
    // Each case is a distinct synthetic scenario, while retries within a case
    // deliberately share persistent journal entries.
    Object.keys(localStorage)
      .filter(key => key.startsWith('care-ai-request-v1:'))
      .forEach(key => localStorage.removeItem(key));
    store.clearActions();
    logout.mockReset().mockReturnValue({ type: 'SYNTHETIC_LOGOUT' });
    history.push.mockClear();
    previousUser = store.getState().app.userData;
    previousAdapter = API.axiosInstance.defaults.adapter;
    previousCrypto = global.crypto;
    global.crypto = require('crypto').webcrypto;
    process.env.REACT_APP_CARE_COLLABORATION = 'true';
    adapter = jest.fn(async config => ({
      data: { tokens: ['不', '回家'] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config
    }));
    API.axiosInstance.defaults.adapter = adapter;
  });
  afterEach(() => {
    API.axiosInstance.defaults.adapter = previousAdapter;
    global.crypto = previousCrypto;
    store.getState().app.userData = previousUser;
    process.env = { ...previousEnv };
    ['synthetic-a', 'synthetic-b'].forEach(id => {
      localStorage.removeItem(`care-selection-v1:${id}`);
      localStorage.removeItem(`care-funding-v1:${id}:profile-${id}`);
    });
  });
  function select(id) {
    store.getState().app.userData = { id, authToken: `token-${id}` };
    localStorage.setItem(
      `care-selection-v1:${id}`,
      JSON.stringify({ id: `profile-${id}` })
    );
    localStorage.setItem(
      `care-funding-v1:${id}:profile-${id}`,
      `funding-${id}`
    );
  }
  test('anonymous same-name selections survive timeout recovery without sharing another person request', async () => {
    select('synthetic-a');
    const make = id =>
      buildCommunicationAiSentenceRequest({
        output: [
          buildPersonalPictogramTileDTO({
            id,
            boardId: 'private',
            category: 'people',
            label: '林知岚',
            image: `synthetic-private://${id}`
          })
        ]
      });
    adapter.mockRejectedValueOnce(
      Object.assign(new Error('timeout'), { code: 'ECONNABORTED' })
    );
    adapter.mockImplementation(async config => ({
      data: { candidates: ['⟦P1⟧来了。'] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config
    }));
    await expect(
      API.generateCommunicationSentences(make('a'))
    ).rejects.toHaveProperty('code', 'AI_REQUEST_RESULT_UNKNOWN');
    await expect(
      API.generateCommunicationSentences(make('a'))
    ).resolves.toMatchObject({ candidates: ['林知岚来了。'] });
    await API.generateCommunicationSentences(make('b'));
    const sent = adapter.mock.calls.map(([config]) => config);
    expect(sent[0].headers['Idempotency-Key']).toBe(
      sent[1].headers['Idempotency-Key']
    );
    expect(sent[1].headers['Idempotency-Key']).not.toBe(
      sent[2].headers['Idempotency-Key']
    );
    expect(sent[0].data).toBe(sent[2].data);
    expect(JSON.stringify(sent)).not.toMatch(
      /林知岚|synthetic-private|localIdentity|personId|entries/
    );
  });
  test('real resegment API sends current account, profile, funding and a stable request identity', async () => {
    select('synthetic-a');
    await API.resegmentCommunicationText({
      contractVersion: 2,
      text: '不回家'
    });
    const first = adapter.mock.calls[0][0];
    expect(first.headers.Authorization).toBe('Bearer token-synthetic-a');
    expect(first.headers['X-Care-Profile-Id']).toBe('profile-synthetic-a');
    expect(first.headers['X-Care-Funding-Id']).toBe('funding-synthetic-a');
    expect(first.headers['Idempotency-Key']).toMatch(/^cai_[a-f0-9]{64}$/);
    expect(JSON.parse(first.data).text).toBe('不回家');
    select('synthetic-b');
    await API.resegmentCommunicationText({ text: '不回家' });
    const second = adapter.mock.calls[1][0];
    expect(second.headers.Authorization).toBe('Bearer token-synthetic-b');
    expect(second.headers['X-Care-Profile-Id']).toBe('profile-synthetic-b');
    expect(second.headers['X-Care-Funding-Id']).toBe('funding-synthetic-b');
    expect(second.headers['Idempotency-Key']).not.toBe(
      first.headers['Idempotency-Key']
    );
  });
  test('the installed interceptor retains explicit identity and never exports care headers cross-origin', async () => {
    select('synthetic-a');
    await API.axiosInstance.post(
      '/gpt/communication/resegment',
      {},
      { headers: { 'Idempotency-Key': 'synthetic-request' } }
    );
    expect(adapter.mock.calls[0][0].headers['Idempotency-Key']).toBe(
      'synthetic-request'
    );
    await API.axiosInstance.post(
      'https://external.invalid/gpt/communication/resegment',
      {}
    );
    expect(
      adapter.mock.calls[1][0].headers['X-Care-Funding-Id']
    ).toBeUndefined();
    expect(
      adapter.mock.calls[1][0].headers['X-Care-Profile-Id']
    ).toBeUndefined();
    store.getState().app.userData = {
      id: 'unselected',
      authToken: 'synthetic-token'
    };
    await expect(
      API.resegmentCommunicationText({ text: '不回家' })
    ).rejects.toHaveProperty('code', 'EXPLICIT_FUNDING_REQUIRED');
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  test('timeout, retry, completed retry and concurrent callers keep one provider identity', async () => {
    select('synthetic-a');
    adapter.mockRejectedValueOnce(
      Object.assign(new Error('timeout'), { code: 'ECONNABORTED' })
    );
    const body = { contractVersion: 2, text: '不回家' };
    await expect(API.resegmentCommunicationText(body)).rejects.toHaveProperty(
      'code',
      'AI_REQUEST_RESULT_UNKNOWN'
    );
    await Promise.all([
      API.resegmentCommunicationText(body),
      API.resegmentCommunicationText(body)
    ]);
    await API.resegmentCommunicationText(body);
    expect(
      new Set(adapter.mock.calls.map(([c]) => c.headers['Idempotency-Key']))
        .size
    ).toBe(1);
    expect(adapter.mock.calls.every(([c]) => !c.careAiRequestScope)).toBe(true);
    await API.generateCommunicationSentences({ pictogramLabels: ['回家'] });
    expect(adapter.mock.calls[4][0].headers['Idempotency-Key']).not.toBe(
      adapter.mock.calls[0][0].headers['Idempotency-Key']
    );
  });

  test('storage failure blocks transport rather than using a random fallback', async () => {
    select('synthetic-a');
    const spy = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw Error('full');
      });
    try {
      await expect(
        API.resegmentCommunicationText({ text: 'storage-failure-synthetic' })
      ).rejects.toHaveProperty('code', 'AI_REQUEST_STORAGE_UNAVAILABLE');
      expect(adapter).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test('switching account in the send queue cannot retarget the frozen request', async () => {
    select('synthetic-a');
    const interceptor = API.axiosInstance.interceptors.request.use(config => {
      select('synthetic-b');
      return config;
    });
    try {
      await expect(
        API.resegmentCommunicationText({ text: '不回家' })
      ).rejects.toHaveProperty('code', 'AI_REQUEST_CONTEXT_CHANGED');
      expect(adapter).not.toHaveBeenCalled();
    } finally {
      API.axiosInstance.interceptors.request.eject(interceptor);
    }
  });

  test('responses arriving after account changes are not delivered to the new account', async () => {
    select('synthetic-a');
    adapter.mockImplementationOnce(async config => {
      select('synthetic-b');
      return {
        data: { tokens: ['不', '回家'] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config
      };
    });
    await expect(
      API.resegmentCommunicationText({ text: '不回家' })
    ).rejects.toHaveProperty('code', 'AI_REQUEST_CONTEXT_CHANGED');
  });

  test('same-origin API path changes cannot redirect a frozen paid request', async () => {
    select('synthetic-a');
    const interceptor = API.axiosInstance.interceptors.request.use(config => {
      config.baseURL = '/another-api/';
      return config;
    });
    try {
      await expect(
        API.resegmentCommunicationText({ text: '不回家' })
      ).rejects.toHaveProperty('code', 'AI_REQUEST_CONTEXT_CHANGED');
      expect(adapter).not.toHaveBeenCalled();
    } finally {
      API.axiosInstance.interceptors.request.eject(interceptor);
    }
  });

  test.each(['profile', 'funding', 'logout'])(
    'changing %s before dispatch blocks the old request',
    async change => {
      select('synthetic-a');
      const interceptor = API.axiosInstance.interceptors.request.use(config => {
        if (change === 'logout') store.getState().app.userData = null;
        else if (change === 'profile')
          localStorage.setItem(
            'care-selection-v1:synthetic-a',
            JSON.stringify({ id: 'other-profile' })
          );
        else
          localStorage.setItem(
            'care-funding-v1:synthetic-a:profile-synthetic-a',
            'other-funding'
          );
        return config;
      });
      try {
        await expect(
          API.resegmentCommunicationText({ text: '不回家' })
        ).rejects.toHaveProperty('code', 'AI_REQUEST_CONTEXT_CHANGED');
        expect(adapter).not.toHaveBeenCalled();
      } finally {
        API.axiosInstance.interceptors.request.eject(interceptor);
      }
    }
  );

  test('the wire body stays fixed if the caller mutates its object while queued', async () => {
    select('synthetic-a');
    const body = { text: '不回家' };
    const interceptor = API.axiosInstance.interceptors.request.use(config => {
      body.text = '回家';
      return config;
    });
    try {
      await API.resegmentCommunicationText(body);
      expect(JSON.parse(adapter.mock.calls[0][0].data).text).toBe('不回家');
    } finally {
      API.axiosInstance.interceptors.request.eject(interceptor);
    }
  });

  test.each(['same-login', 'different-account', 'renewed-token'])(
    'a delayed 401 logs out only the failed login: %s',
    async state => {
      select('synthetic-a');
      adapter.mockImplementationOnce(async config => {
        if (state === 'different-account') select('synthetic-b');
        if (state === 'renewed-token')
          store.getState().app.userData.authToken = 'synthetic-renewed-token';
        throw Object.assign(new Error('synthetic unauthorized'), {
          config,
          response: { status: 401, data: { code: 'LOGIN_REQUIRED' } }
        });
      });
      await expect(
        API.resegmentCommunicationText({ text: '不回家' })
      ).rejects.toHaveProperty('response.status', 401);
      if (state === 'same-login') {
        expect(logout).toHaveBeenCalledTimes(1);
        expect(store.getActions()).toContainEqual({ type: 'SYNTHETIC_LOGOUT' });
        expect(history.push).toHaveBeenCalledWith('/login-signup/');
      } else {
        expect(logout).not.toHaveBeenCalled();
        expect(store.getActions()).toEqual([]);
        expect(history.push).not.toHaveBeenCalled();
        expect(store.getState().app.userData.authToken).toBe(
          state === 'different-account'
            ? 'token-synthetic-b'
            : 'synthetic-renewed-token'
        );
      }
    }
  );
});
