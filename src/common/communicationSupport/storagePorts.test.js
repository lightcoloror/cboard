import {
  createBrowserStoragePort,
  createUnavailableStoragePort,
  createWechatStoragePort
} from './storagePorts';

describe('communication support storage ports', () => {
  test('adapts browser localStorage to the shared string storage contract', () => {
    const values = new Map();
    const localStorage = {
      getItem: jest.fn(key => values.get(key) || null),
      setItem: jest.fn((key, value) => values.set(key, value)),
      removeItem: jest.fn(key => values.delete(key))
    };
    const port = createBrowserStoragePort({ localStorage });

    expect(port.setItem('history', '[{"sentence":"我要喝水"}]')).toBe(true);

    expect(port.getItem('history')).toBe('[{"sentence":"我要喝水"}]');
    port.removeItem('history');
    expect(port.getItem('history')).toBeNull();
  });

  test('adapts WeChat synchronous storage without exposing wx to the core', () => {
    const values = new Map();
    const wechatApi = {
      getStorageSync: jest.fn(key => (values.has(key) ? values.get(key) : '')),
      setStorageSync: jest.fn((key, value) => values.set(key, value)),
      removeStorageSync: jest.fn(key => values.delete(key))
    };
    const port = createWechatStoragePort(wechatApi);

    port.setItem('settings', '{"savedPhrases":[]}');

    expect(port.getItem('settings')).toBe('{"savedPhrases":[]}');
    port.removeItem('settings');
    expect(port.getItem('settings')).toBeNull();
  });

  test('serializes native WeChat values into the shared string contract', () => {
    const wechatApi = {
      getStorageSync: jest.fn(() => [{ sentence: '我要休息' }]),
      setStorageSync: jest.fn()
    };

    expect(createWechatStoragePort(wechatApi).getItem('history')).toBe(
      '[{"sentence":"我要休息"}]'
    );
  });

  test('uses a no-op port when browser storage is unavailable', () => {
    const port = createUnavailableStoragePort();

    expect(port.getItem('missing')).toBeNull();
    expect(port.setItem('key', 'value')).toBe(false);
    expect(() => port.removeItem('key')).not.toThrow();
  });
  test('degrades safely when browser storage methods throw', () => {
    const deniedStorage = {
      getItem: jest.fn(() => {
        throw new Error('denied');
      }),
      setItem: jest.fn(() => {
        throw new Error('denied');
      }),
      removeItem: jest.fn(() => {
        throw new Error('denied');
      })
    };
    const port = createBrowserStoragePort({ localStorage: deniedStorage });

    expect(port.getItem('history')).toBeNull();
    expect(port.setItem('history', '[]')).toBe(false);
    expect(() => port.removeItem('history')).not.toThrow();
  });
});
