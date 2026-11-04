import { createBrowserLocalDeviceDataPort } from './browserLocalDeviceData';

describe('browser local device data port', () => {
  test('coordinates the complete operation and emits only a transient non-personal signal', async () => {
    const calls = [];let locked = false;
    const careStorage = { clear: jest.fn(async () => { expect(locked).toBe(true);calls.push('care'); }),
      exclusive: jest.fn(async (key, action, options) => { expect(key).toBe('local-device-data');expect(options).toEqual({ required: true });locked = true;try{return await action();}finally{locked = false;} }) };
    const port = createBrowserLocalDeviceDataPort({ careStorage,
      beforeClear: () => { expect(locked).toBe(true);calls.push('pause'); },
      indexedDbStorage: { clear: jest.fn(async () => calls.push('root')) },
      localStorage: { clear: () => calls.push('local'), setItem: (key, value) => calls.push(['signal', key, value]), removeItem: key => calls.push(['remove', key]) },
      sessionStorage: { clear: () => calls.push('session') },reload: () => calls.push('reload') });
    await expect(port.clearAllLocalData()).resolves.toMatchObject({ ok: true });
    expect(calls).toEqual(['pause','care','root','local','session',['signal','cboard-local-data-cleared-v1','1'],['remove','cboard-local-data-cleared-v1'],'reload']);
    expect(locked).toBe(false);
  });

  test('does not delete anything when safe cross-window coordination is unavailable', async () => {
    const clear = jest.fn(), beforeClear = jest.fn(), reload = jest.fn();
    const port = createBrowserLocalDeviceDataPort({ beforeClear, reload, indexedDbStorage: { clear },
      careStorage: { clear, exclusive: () => { throw Object.assign(new Error('无法协调其他页面'), { code: 'CARE_LOCAL_EXCLUSION_UNAVAILABLE' }); } } });
    await expect(port.clearAllLocalData()).resolves.toMatchObject({ ok: false, message: expect.stringContaining('尚未清除') });
    expect(clear).not.toHaveBeenCalled();expect(beforeClear).not.toHaveBeenCalled();expect(reload).not.toHaveBeenCalled();
  });
  test('clears IndexedDB and both browser storage areas before reload', async () => {
    const calls = [];
    const port = createBrowserLocalDeviceDataPort({
      careStorage: { clear: jest.fn(async () => calls.push('care')) },
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
    expect(calls).toEqual(['care', 'indexeddb', 'local', 'session', 'reload']);
  });

  test('does not claim success or reload when IndexedDB clear fails', async () => {
    const localStorage = { clear: jest.fn() };
    const reload = jest.fn();
    const port = createBrowserLocalDeviceDataPort({
      careStorage: { clear: jest.fn(async () => {}) },
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

  test('keeps the failure visible and never reloads when independent Care cleanup fails', async () => {
    const indexedDbStorage = { clear: jest.fn() }, reload = jest.fn();
    const port = createBrowserLocalDeviceDataPort({
      careStorage: { clear: jest.fn(async () => { throw new Error('Care clear not verified'); }) },
      indexedDbStorage, reload
    });
    await expect(port.clearAllLocalData()).resolves.toMatchObject({ ok: false });
    expect(indexedDbStorage.clear).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
