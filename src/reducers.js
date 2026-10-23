import {
  persistCombineReducers,
  persistReducer,
  createMigrate,
  createTransform
} from 'redux-persist';

import localForage from 'localforage';
import localStorage from 'redux-persist/lib/storage';
import { appInsights } from './appInsights';
import { createAsyncMemoryStorage } from './demoMode';

import appReducer from './components/App/App.reducer';
import languageProviderReducer from './providers/LanguageProvider/LanguageProvider.reducer';
import scannerProviderReducer from './providers/ScannerProvider/ScannerProvider.reducer';
import speechProviderReducer from './providers/SpeechProvider/SpeechProvider.reducer';
import boardReducer from './components/Board/Board.reducer';
import communicatorReducer from './components/Communicator/Communicator.reducer';
import notificationsReducer from './components/Notifications/Notifications.reducer';
import subscriptionProviderReducer from './providers/SubscriptionProvider/SubscriptionProvider.reducer';
import { DEFAULT_BOARDS } from '../src/helpers';

localForage.config({
  name: 'cboard',
  storeName: 'cboard_store'
});

/**
 * Creates a storage wrapper that migrates data from old storage to new storage.
 *
 * @param {Object} oldStorage - The legacy storage engine (localStorage)
 * @param {Object} newStorage - The new storage engine (localForage/IndexedDB)
 * @returns {Object} A storage engine compatible with redux-persist
 */
export const createMigratingStorage = (oldStorage, newStorage) => ({
  /**
   * Retrieves a value from storage, migrating from old to new if necessary.
   * Called by redux-persist on app initialization.
   */
  async getItem(key) {
    try {
      const newValue = await newStorage.getItem(key);
      if (newValue !== null && newValue !== undefined) {
        return newValue;
      }
    } catch (err) {
      console.warn('Cboard: IndexedDB read failed', err);
      appInsights.trackException({
        exception: err,
        properties: { key, step: 'indexeddb_read' }
      });
    }

    try {
      const oldValue = await oldStorage.getItem(key);
      if (oldValue !== null && oldValue !== undefined) {
        console.log(
          `Cboard: Migrating ${key} from localStorage to IndexedDB...`
        );
        appInsights.trackEvent({
          name: 'StorageMigration_Started',
          properties: { key }
        });
        try {
          await newStorage.setItem(key, oldValue);
          console.log(`Cboard: Successfully migrated ${key}`);
          appInsights.trackEvent({
            name: 'StorageMigration_Success',
            properties: { key }
          });
          await oldStorage.removeItem(key);
          console.log(`Cboard: Cleaned up ${key} from localStorage`);
          appInsights.trackEvent({
            name: 'StorageMigration_Cleanup',
            properties: { key }
          });
        } catch (writeErr) {
          console.warn('Cboard: Migration write failed', writeErr);
          appInsights.trackException({
            exception: writeErr,
            properties: { key, step: 'migration_write' }
          });
        }
        return oldValue;
      }
    } catch (err) {
      console.warn('Cboard: localStorage read failed', err);
      appInsights.trackException({
        exception: err,
        properties: { key, step: 'localstorage_read' }
      });
    }

    return null;
  },

  /**
   * Saves a value to storage.
   * Called by redux-persist whenever Redux state changes.
   */
  async setItem(key, value) {
    return await newStorage.setItem(key, value);
  },

  /**
   * Removes a value from storage.
   * Called by redux-persist when purging state.
   */
  async removeItem(key) {
    return await newStorage.removeItem(key);
  }
});

// Serialize the existing backend, including removals, so an older root write
// cannot finish after a newer one. Each caller still observes its own failure.
const orderedBackends = new WeakMap();
export function createOrderedStorage(backend) {
  if (orderedBackends.has(backend)) return orderedBackends.get(backend);
  let tail = Promise.resolve();
  const enqueue = operation => {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  };
  const storage = {
    getItem: key => enqueue(() => backend.getItem(key)),
    setItem: (key, value) => enqueue(async () => {
      const result = await backend.setItem(key, value);
      if (result === false) throw new Error('Persistence backend rejected the write');
      return result;
    }),
    removeItem: key => enqueue(() => backend.removeItem(key))
  };
  orderedBackends.set(backend, storage);
  return storage;
}

export const boardMigrations = {
  0: state => {
    return {
      ...state,
      board: {
        ...state.board,
        boards: [...state.board.boards, ...DEFAULT_BOARDS.picSeePal]
      }
    };
  },
  1: state => ({
    ...state,
    board: {
      ...state.board,
      syncMeta: state.board?.syncMeta ?? {}
    }
  })
};

// isSyncing describes a sync in flight in the current JS process, so a
// rehydrated value is stale by definition and must never come back as true.
export const boardSyncTransform = createTransform(
  null,
  outboundState => ({ ...outboundState, isSyncing: false }),
  { whitelist: ['board'] }
);

export function createPersistenceContext({ demoMode = false, storage, legacyStorage = localStorage } = {}) {
  const strictStorage = createOrderedStorage(storage || (demoMode ? createAsyncMemoryStorage() : localForage));
  const persistenceStorage = demoMode
    ? strictStorage
    : createMigratingStorage(legacyStorage, strictStorage);
  const rootConfig = {
    key: 'root',
    storage: persistenceStorage,
    blacklist: ['language'],
    version: 1,
    migrate: createMigrate(boardMigrations, { debug: false }),
    transforms: [boardSyncTransform]
  };
  return { rootConfig, strictStorage };
}

export default function createReducer(options = {}) {
  const { rootConfig } = options.persistence || createPersistenceContext(options);
  const languagePersistConfig = {
    key: 'language',
    storage: rootConfig.storage,
    blacklist: ['langsFetched']
  };

  return persistCombineReducers(rootConfig, {
    app: appReducer,
    language: persistReducer(languagePersistConfig, languageProviderReducer),
    speech: speechProviderReducer,
    board: boardReducer,
    communicator: communicatorReducer,
    scanner: scannerProviderReducer,
    notification: notificationsReducer,
    subscription: subscriptionProviderReducer
  });
}
