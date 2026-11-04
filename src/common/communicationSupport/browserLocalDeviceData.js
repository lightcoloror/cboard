import localForage from 'localforage';
import { invalidateImageOperations } from './imageOperationEpoch';
import { clearSavedPhraseUndoSession } from './savedPhraseUse';
import { careBrowserStorage, LOCAL_DEVICE_DATA_LOCK, LOCAL_DATA_CLEAR_START,
  LOCAL_DATA_CLEAR_SIGNAL } from './careBrowserStorage';

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
  careStorage = careBrowserStorage,
  localStorage = () =>
    typeof window === 'undefined' ? null : window.localStorage,
  sessionStorage = () =>
    typeof window === 'undefined' ? null : window.sessionStorage,
  beforeClear = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCAL_DATA_CLEAR_START));
  },
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
      invalidateImageOperations();
      clearSavedPhraseUndoSession();
      try {
        if (!indexedDbStorage || typeof indexedDbStorage.clear !== 'function') {
          throw new TypeError('IndexedDB storage is unavailable');
        }
        if (!careStorage || typeof careStorage.clear !== 'function') {
          throw new TypeError('Care storage is unavailable');
        }
        const clear = async () => {
          beforeClear();
          await careStorage.clear();
          await indexedDbStorage.clear();
          const local = resolveStorage(localStorage);
          clearStorage(local);
          clearStorage(resolveStorage(sessionStorage));
          // A transient, non-personal signal also reaches other windows when
          // localStorage was already empty. No new retained data key is added.
          if (local && typeof local.setItem === 'function' && typeof local.removeItem === 'function') {
            local.setItem(LOCAL_DATA_CLEAR_SIGNAL, '1');
            local.removeItem(LOCAL_DATA_CLEAR_SIGNAL);
          }
          if (reloadAfterClear && typeof reload === 'function') reload();
          return {
            ok: true,
            message: '本机 CBoard 数据、图语家数据和登录信息已清除。'
          };
        };
        return typeof careStorage.exclusive === 'function'
          ? await careStorage.exclusive(LOCAL_DEVICE_DATA_LOCK, clear, { required: true })
          : await clear();
      } catch (error) {
        return {
          ok: false,
          message: error && error.code === 'CARE_LOCAL_EXCLUSION_UNAVAILABLE'
            ? `本机数据尚未清除。${error.message}`
            : '本机数据未能完整清除，请不要交接设备，并重试。'
        };
      }
    }
  };
}

export const browserLocalDeviceDataPort = createBrowserLocalDeviceDataPort();
