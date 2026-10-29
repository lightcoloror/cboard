import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import { persistStore } from 'redux-persist';
import createReducer, { createPersistenceContext } from '../../reducers';
import { UPDATE_USER_DATA } from '../../components/App/App.constants';
import { updateScannerSettings } from './ScannerProvider.actions';
import { createVerifiedScannerSettings, saveVerifiedScannerSettings } from './ScannerProvider.persistence';

const initial = { active: false, delay: 2000, strategy: 'automatic' };
const desired = { active: true, delay: 1000, strategy: 'manual' };
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const memory = () => {
  const values = new Map();
  return { values, getItem: jest.fn(async key => values.get(key) ?? null),
    setItem: jest.fn(async (key, value) => { values.set(key, value); }),
    removeItem: jest.fn(async key => { values.delete(key); }) };
};
const fixtures = [];
async function setup({ backend = memory(), legacy = memory() } = {}) {
  const persistence = createPersistenceContext({ storage: backend, legacyStorage: legacy });
  const services = {};
  const store = createStore(createReducer({ persistence }), { scanner: initial },
    applyMiddleware(thunk.withExtraArgument(services)));
  const ready = deferred();
  const persistor = persistStore(store, {}, ready.resolve);
  services.verifiedScannerSettings = createVerifiedScannerSettings({ store, persistor, persistence });
  fixtures.push(persistor);
  await ready.promise;
  await persistor.flush();
  return { backend, legacy, persistence, persistor, store, save: (settings = desired, options = {}) =>
    store.dispatch(saveVerifiedScannerSettings(settings, { expectedSettings: initial, ...options })) };
}
afterEach(async () => { for (const p of fixtures.splice(0)) { await p.flush(); p.pause(); } jest.restoreAllMocks(); });

test('the existing root readback confirms all scanner fields and a new store immediately rehydrates them', async () => {
  const f = await setup();
  await expect(f.save()).resolves.toBe(true);
  expect(JSON.parse(JSON.parse(f.backend.values.get('persist:root')).scanner)).toEqual(desired);
  f.persistor.pause();
  const reopened = await setup({ backend: f.backend });
  expect(reopened.store.getState().scanner).toEqual(desired);
});

test('rejected root writes preserve the previous stored value and can explicitly retry', async () => {
  const f = await setup();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const before = f.backend.values.get('persist:root');
  const write = f.backend.setItem.getMockImplementation();
  f.backend.setItem.mockRejectedValue(new Error('synthetic quota'));
  await expect(f.save()).rejects.toMatchObject({ code: 'SCANNER_PERSISTENCE_FAILED' });
  expect(f.backend.values.get('persist:root')).toBe(before);
  expect(f.store.getState().scanner).toEqual(desired);
  f.backend.setItem.mockImplementation(write);
  await expect(f.save()).resolves.toBe(true);
});

test('a silent no-op write cannot return success', async () => {
  const f = await setup();
  const before = f.backend.values.get('persist:root');
  f.backend.setItem.mockResolvedValue(undefined);
  await expect(f.save()).rejects.toMatchObject({ code: 'SCANNER_PERSISTENCE_FAILED' });
  expect(f.backend.values.get('persist:root')).toBe(before);
});

test('after a failed save the same editor can revise its draft and retry safely', async () => {
  const f = await setup();
  const write = f.backend.setItem.getMockImplementation();
  f.backend.setItem.mockResolvedValue(undefined);
  await expect(f.save()).rejects.toMatchObject({ code: 'SCANNER_PERSISTENCE_FAILED' });
  const revised = { active: true, delay: 3000, strategy: 'automatic' };
  f.backend.setItem.mockImplementation(write);
  await expect(f.save(revised)).resolves.toBe(true);
  expect(JSON.parse(JSON.parse(f.backend.values.get('persist:root')).scanner)).toEqual(revised);
});

test('strict readback failure does not consult a matching legacy root and retries without losing input', async () => {
  const f = await setup();
  const read = f.backend.getItem.getMockImplementation();
  f.legacy.getItem.mockClear();
  f.legacy.values.set('persist:root', f.backend.values.get('persist:root'));
  f.backend.getItem.mockRejectedValue(new Error('synthetic read failure'));
  await expect(f.save()).rejects.toMatchObject({ code: 'SCANNER_PERSISTENCE_FAILED' });
  expect(f.legacy.getItem).not.toHaveBeenCalled();
  f.backend.getItem.mockImplementation(read);
  await expect(f.save()).resolves.toBe(true);
});

test('completed write with lost acknowledgement is accepted only after exact readback', async () => {
  const f = await setup();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  f.backend.setItem.mockImplementation(async (key, value) => {
    f.backend.values.set(key, value);
    throw new Error('synthetic lost acknowledgement');
  });
  await expect(f.save()).resolves.toBe(true);
  expect(JSON.parse(JSON.parse(f.backend.values.get('persist:root')).scanner)).toEqual(desired);
});

test('wrong scanner readback is rejected even when another root field was saved', async () => {
  const f = await setup();
  const read = f.backend.getItem.getMockImplementation();
  f.backend.getItem.mockImplementation(async key => {
    const value = await read(key);
    if (key !== 'persist:root') return value;
    const root = JSON.parse(value);
    root.scanner = JSON.stringify({ ...desired, strategy: 'automatic' });
    return JSON.stringify(root);
  });
  await expect(f.save()).rejects.toMatchObject({ code: 'SCANNER_PERSISTENCE_FAILED' });
});

test('a later scanner edit is not overwritten by an old retry', async () => {
  const f = await setup();
  f.backend.setItem.mockResolvedValue(undefined);
  await expect(f.save()).rejects.toBeDefined();
  const newer = { active: false, delay: 3000, strategy: 'manual' };
  f.store.dispatch(updateScannerSettings(newer));
  await expect(f.save()).rejects.toMatchObject({ code: 'SCANNER_SAVE_CONFLICT' });
  expect(f.store.getState().scanner).toEqual(newer);
});

test('invalidated scope rejects before any dispatch', async () => {
  const f = await setup();
  await expect(f.save(desired, { guard: () => false })).rejects.toMatchObject({ code: 'SCANNER_SAVE_CANCELLED' });
  expect(f.store.getState().scanner).toEqual(initial);
});

test('account change while a write is pending rejects its old receipt and keeps newer settings', async () => {
  const f = await setup();
  const gate = deferred(), started = deferred();
  const write = f.backend.setItem.getMockImplementation();
  f.backend.setItem.mockImplementationOnce(async (key, value) => { started.resolve(); await gate.promise; return write(key, value); });
  const saving = f.save();
  await started.promise;
  f.store.dispatch({ type: UPDATE_USER_DATA, userData: { id: 'synthetic-account-b', authToken: 'synthetic-token-b' } });
  const newer = { active: false, delay: 5000, strategy: 'manual' };
  f.store.dispatch(updateScannerSettings(newer));
  gate.resolve();
  await expect(saving).rejects.toMatchObject({ code: 'SCANNER_SAVE_CANCELLED' });
  await f.persistor.flush();
  expect(f.store.getState().scanner).toEqual(newer);
  expect(JSON.parse(JSON.parse(f.backend.values.get('persist:root')).scanner)).toEqual(newer);
});

test('later same-account edit during flush wins over an old save completion', async () => {
  const f = await setup();
  const gate = deferred(), started = deferred();
  const write = f.backend.setItem.getMockImplementation();
  f.backend.setItem.mockImplementationOnce(async (key, value) => { started.resolve(); await gate.promise; return write(key, value); });
  const saving = f.save();
  await started.promise;
  const newer = { active: true, delay: 3000, strategy: 'automatic' };
  f.store.dispatch(updateScannerSettings(newer));
  gate.resolve();
  await expect(saving).rejects.toMatchObject({ code: 'SCANNER_SAVE_CONFLICT' });
  await f.persistor.flush();
  expect(JSON.parse(JSON.parse(f.backend.values.get('persist:root')).scanner)).toEqual(newer);
});

test('a pending profile guard change cannot confirm the previous scope', async () => {
  const f = await setup();
  const gate = deferred(), started = deferred();
  const write = f.backend.setItem.getMockImplementation();
  let current = true;
  f.backend.setItem.mockImplementationOnce(async (key, value) => { started.resolve(); await gate.promise; return write(key, value); });
  const saving = f.save(desired, { guard: () => current });
  await started.promise;
  current = false;
  gate.resolve();
  await expect(saving).rejects.toMatchObject({ code: 'SCANNER_SAVE_CANCELLED' });
});

test('not-yet-rehydrated storage and malformed settings do not dispatch', async () => {
  const f = await setup();
  const service = createVerifiedScannerSettings({ store: f.store, persistence: f.persistence,
    persistor: { getState: () => ({ bootstrapped: false }) } });
  await expect(service.save(desired)).rejects.toMatchObject({ code: 'SCANNER_PERSISTENCE_FAILED' });
  await expect(f.save({ active: true, delay: 0, strategy: 'manual' })).rejects.toMatchObject({ code: 'SCANNER_PERSISTENCE_FAILED' });
  expect(f.store.getState().scanner).toEqual(initial);
});
