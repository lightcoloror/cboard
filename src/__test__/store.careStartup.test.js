// Import the real Care module before the first configureStore call, as App does.
// In particular, do not replace its resolver, getStore, or the gallery identity.
const backend = () => {
  const values = new Map();
  return {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); }
  };
};
const bootstrapped = persistor => new Promise(resolve => {
  if (persistor.getState().bootstrapped) return resolve();
  const unsubscribe = persistor.subscribe(() => {
    if (persistor.getState().bootstrapped) { unsubscribe(); resolve(); }
  });
});

test.each([false, true])('first store configuration works with the actual enabled Care resolver (signed in: %s)', async signedIn => {
  const previous = process.env.REACT_APP_CARE_COLLABORATION;
  process.env.REACT_APP_CARE_COLLABORATION = 'true';
  localStorage.clear();
  if (signedIn) localStorage.setItem('care-selection-v1:synthetic-user', JSON.stringify({
    id: 'synthetic-profile', familyId: 'synthetic-family', permissions: ['library.edit']
  }));
  let modules, configured;
  try {
    jest.isolateModules(() => {
      const { runtime } = require('../components/Care/Care');
      const { default: configureStore, getStore } = require('../store');
      const { getGalleryTileUndo } = require('../common/communicationSupport/webGalleryTileUndo');
      const { getCommunicationGalleryIdentity } = require('../common/communicationSupport/localData');
      modules = { runtime, configureStore, getStore, getGalleryTileUndo, getCommunicationGalleryIdentity };
    });
    expect(modules.runtime.enabled).toBe(true);
    expect(modules.getStore()).toBeUndefined();
    const storage = backend();
    configured = modules.configureStore(signedIn ? {
      app: { userData: { id: 'synthetic-user', name: 'Synthetic', email: 'synthetic@example.test', authToken: 'synthetic-token' } }
    } : {}, { storage, legacyStorage: storage });
    expect(modules.getStore()).toBe(configured.store);
    expect(modules.runtime.identity()).toEqual(signedIn
      ? { id: 'synthetic-user', token: 'synthetic-token' } : null);
    const gallery = configured.store.dispatch(modules.getGalleryTileUndo());
    expect(gallery.state().count).toBe(0);
    await bootstrapped(configured.persistor);
    configured.store.dispatch({ type: 'SYNTHETIC_STARTUP_OBSERVATION' });
    expect(gallery.state().count).toBe(0);
    const identity = modules.getCommunicationGalleryIdentity();
    if (signedIn) expect(identity.slice(0, 3)).toEqual([
      'communication-v2:synthetic-user:synthetic-family:synthetic-profile:', 'synthetic-family', 'synthetic-profile'
    ]);
    else expect(identity[0]).toBe('');
  } finally {
    if (configured) { await configured.persistor.flush(); configured.persistor.pause(); }
    if (previous === undefined) delete process.env.REACT_APP_CARE_COLLABORATION;
    else process.env.REACT_APP_CARE_COLLABORATION = previous;
    localStorage.clear();
  }
});

test('actual Care/Redux startup tolerates a future schema without an undo identity migration', async () => {
  const previous = process.env.REACT_APP_CARE_COLLABORATION;
  process.env.REACT_APP_CARE_COLLABORATION = 'true'; localStorage.clear();
  localStorage.setItem('cboard_communication_repository_schema', JSON.stringify({ schemaVersion: 999 }));
  localStorage.setItem('cboard_communication_history', JSON.stringify(Array.from({ length: 80 }, (_, i) => ({ id: `synthetic-${i}` }))));
  const before = { ...localStorage }; let modules, configured;
  try {
    jest.isolateModules(() => {
      require('../components/Care/Care');
      const { default: configureStore } = require('../store');
      const { getGalleryTileUndo } = require('../common/communicationSupport/webGalleryTileUndo');
      const { getCommunicationRepositoryReadError } = require('../common/communicationSupport/localData');
      modules = { configureStore, getGalleryTileUndo, getCommunicationRepositoryReadError };
    });
    const storage = backend();configured = modules.configureStore({}, { storage, legacyStorage: storage });
    await bootstrapped(configured.persistor);
    configured.store.dispatch({ type: 'SYNTHETIC_FUTURE_SCHEMA_STARTUP' });
    expect(configured.store.dispatch(modules.getGalleryTileUndo()).state().count).toBe(0);
    expect(modules.getCommunicationRepositoryReadError()).toContain('请使用更新版本打开');
    expect({ ...localStorage }).toEqual(before);
  } finally {
    if (configured) { await configured.persistor.flush(); configured.persistor.pause(); }
    if (previous === undefined) delete process.env.REACT_APP_CARE_COLLABORATION;
    else process.env.REACT_APP_CARE_COLLABORATION = previous;
    localStorage.clear();
  }
});
