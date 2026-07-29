import localForage from 'localforage';

function resolveStorage(value) {
  try {
    return typeof value === 'function' ? value() : value;
  } catch (error) {
    return null;
  }
}

function clearStorage(storage) {
  if (!storage || typeof storage.clear !== 'function') return;
  storage.clear();
}

export function createBrowserLocalDeviceDataPort({
  indexedDbStorage = localForage,
  localStorage = () =>
    typeof window === 'undefined' ? null : window.localStorage,
  sessionStorage = () =>
    typeof window === 'undefined' ? null : window.sessionStorage,
  reload = () => {
    if (
      typeof window !== 'undefined' &&
      window.location &&
      typeof window.location.reload === 'function'
    ) {
      window.location.reload();
    }
  }
} = {}) {
  return {
    async clearAllLocalData({ reloadAfterClear = true } = {}) {
      try {
        if (!indexedDbStorage || typeof indexedDbStorage.clear !== 'function') {
          throw new TypeError('IndexedDB storage is unavailable');
        }
        await indexedDbStorage.clear();
        clearStorage(resolveStorage(localStorage));
        clearStorage(resolveStorage(sessionStorage));
        if (reloadAfterClear && typeof reload === 'function') reload();
        return {
          ok: true,
          message: '本机 CBoard 数据、图语家数据和登录信息已清除。'
        };
      } catch (error) {
        return {
          ok: false,
          message: '本机数据未能完整清除，请不要交接设备，并重试。'
        };
      }
    }
  };
}

export const browserLocalDeviceDataPort = createBrowserLocalDeviceDataPort();
