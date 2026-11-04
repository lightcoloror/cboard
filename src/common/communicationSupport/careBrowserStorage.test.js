import Factory from 'fake-indexeddb/lib/FDBFactory';
import KeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import ObjectStore from 'fake-indexeddb/lib/FDBObjectStore';
import { createCareBrowserStorage } from './careBrowserStorage';

const marker = '__tuyujia_privacy_generation_v1__';
function fixture() {
  const indexedDb = new Factory();
  return { indexedDb, fresh: () => createCareBrowserStorage({ indexedDb: () => indexedDb, keyRange: () => KeyRange }) };
}
async function raw(f, action) {
  return new Promise((resolve, reject) => {
    const request = f.indexedDb.open('tuyujia-care-v1', 1);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('profiles', 'readwrite');
      action(tx.objectStore('profiles'));
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  });
}

test('legacy records work without a marker and cleanup preserves only non-personal generation', async () => {
  const f = fixture(), storage = f.fresh();
  await storage.set('care-v1:synthetic', 'original sentence and ordered pictures');
  expect(await storage.get('care-v1:synthetic')).toBe('original sentence and ordered pictures');
  expect(await storage.list('')).toHaveLength(1);
  await storage.clear();
  expect(await storage.get('care-v1:synthetic')).toBe(null);
  expect(await storage.list('')).toEqual([]);
  const reopened = f.fresh();
  expect(await reopened.list('')).toEqual([]);
  await reopened.set('care-v1:new-synthetic', 'new explicit work');
  expect(await reopened.get('care-v1:new-synthetic')).toBe('new explicit work');
});

test('another old window cannot recreate even an initially missing row after cleanup', async () => {
  const f = fixture(), a = f.fresh(), old = f.fresh();
  expect(await old.get('care-list-v1:synthetic')).toBe(null);
  await a.set('care-v1:synthetic', 'private snapshot');
  await a.clear();
  await expect(old.set('care-list-v1:synthetic', 'late account list')).rejects.toMatchObject({ code: 'CARE_LOCAL_STATE_CHANGED' });
  expect(await old.setIfUnchanged('care-v1:synthetic', null, 'late result')).toBe(false);
  expect(await f.fresh().list('')).toEqual([]);
});

test('old windows cannot read or overwrite new work created after cleanup', async () => {
  const f = fixture(), old = f.fresh(), clearing = f.fresh();
  await old.set('care-v1:synthetic', 'before');
  await clearing.clear();
  const next = f.fresh();await next.set('care-v1:synthetic', 'new owner');
  expect(await old.get('care-v1:synthetic')).toBe(null);
  expect(await old.list('care-')).toEqual([]);
  expect(await old.setIfUnchanged('care-v1:synthetic', 'new owner', 'old owner')).toBe(false);
  expect(await next.get('care-v1:synthetic')).toBe('new owner');
});

test('silent clear failure is detected and aborted without losing the prior valid records', async () => {
  const f = fixture(), storage = f.fresh();await storage.set('care-v1:synthetic', 'keep this');
  const fault = jest.spyOn(ObjectStore.prototype, 'clear').mockImplementation(() => undefined);
  try { await expect(storage.clear()).rejects.toThrow('尚未确认清除'); } finally { fault.mockRestore(); }
  expect(await f.fresh().get('care-v1:synthetic')).toBe('keep this');
  await storage.clear();expect(await f.fresh().list('')).toEqual([]);
});

test('readback failure is not cleanup success and retry remains possible', async () => {
  const f = fixture(), storage = f.fresh();await storage.set('care-v1:synthetic', 'keep this');
  const fault = jest.spyOn(ObjectStore.prototype, 'count').mockImplementation(() => { throw new Error('readback unavailable'); });
  try { await expect(storage.clear()).rejects.toThrow('尚未确认清除'); } finally { fault.mockRestore(); }
  expect(await f.fresh().get('care-v1:synthetic')).toBe('keep this');
  await storage.clear();expect(await f.fresh().list('')).toEqual([]);
});

test('corrupt generation is retained and never guessed or overwritten', async () => {
  const f = fixture(), storage = f.fresh();await storage.set('care-v1:synthetic', 'keep this');
  await raw(f, store => store.put('unknown-future-generation', marker));
  await expect(f.fresh().get('care-v1:synthetic')).rejects.toBeDefined();
  await expect(storage.clear()).rejects.toBeDefined();
});

test('conditional ordinary changes and repeated cleanup retain their existing contract', async () => {
  const f = fixture(), storage = f.fresh();
  expect(await storage.setIfUnchanged('care-v1:synthetic', null, 'first')).toBe(true);
  expect(await storage.setIfUnchanged('care-v1:synthetic', null, 'wrong')).toBe(false);
  expect(await storage.setIfUnchanged('care-v1:synthetic', 'first', 'second')).toBe(true);
  await storage.clear();await storage.clear();
  expect(await f.fresh().list('')).toEqual([]);
});

test('the same generation also fences callers that store their data outside Care', async () => {
  const f = fixture(), old = f.fresh(), current = f.fresh();
  await expect(old.assertCurrent()).resolves.toBeUndefined();
  await current.clear();
  await expect(old.assertCurrent()).rejects.toMatchObject({ code: 'CARE_LOCAL_STATE_CHANGED' });
  await expect(f.fresh().assertCurrent()).resolves.toBeUndefined();
});

test('required cleanup exclusion never silently falls back on an unsupported runtime', () => {
  const action = jest.fn();
  const storage = createCareBrowserStorage({ lockManager: () => null });
  expect(() => storage.exclusive('local-device-data', action, { required: true })).toThrow('无法协调');
  expect(action).not.toHaveBeenCalled();
  storage.exclusive('ordinary-care', action);expect(action).toHaveBeenCalledTimes(1);
});
