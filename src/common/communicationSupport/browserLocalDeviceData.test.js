import { createBrowserLocalDeviceDataPort } from './browserLocalDeviceData';

describe('browser local device data port', () => {
  test('clears IndexedDB and both browser storage areas before reload', async () => {
    const calls = [];
    const port = createBrowserLocalDeviceDataPort({
      indexedDbStorage: {
        clear: jest.fn(async () => calls.push('indexeddb'))
      },
      localStorage: {
        clear: jest.fn(() => calls.push('local'))
      },
      sessionStorage: {
        clear: jest.fn(() => calls.push('session'))
      },
      reload: jest.fn(() => calls.push('reload'))
    });

    await expect(port.clearAllLocalData()).resolves.toEqual({
      ok: true,
      message: '本机 CBoard 数据、图语家数据和登录信息已清除。'
    });
    expect(calls).toEqual(['indexeddb', 'local', 'session', 'reload']);
  });

  test('does not claim success or reload when IndexedDB clear fails', async () => {
    const localStorage = { clear: jest.fn() };
    const reload = jest.fn();
    const port = createBrowserLocalDeviceDataPort({
      indexedDbStorage: {
        clear: jest.fn(async () => {
          throw new Error('blocked');
        })
      },
      localStorage,
      sessionStorage: { clear: jest.fn() },
      reload
    });

    await expect(port.clearAllLocalData()).resolves.toEqual({
      ok: false,
      message: '本机数据未能完整清除，请不要交接设备，并重试。'
    });
    expect(localStorage.clear).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
