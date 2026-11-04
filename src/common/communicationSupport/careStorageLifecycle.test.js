import { createCareSync } from './careSync';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(atomic = false) {
  const disk = new Map();
  const key = 'care-v1:synthetic-account:synthetic-family:synthetic-patient';
  let reply, nextId;
  const snapshot = {
    familyId: 'synthetic-family', cursor: 1, permissions: ['read', 'preferences.edit'],
    resources: [{ kind: 'favorite', id: 'synthetic-sentence', version: 1,
      value: { sentence: '我今晚不回家吃饭', output: [] } }]
  };
  const changed = jest.fn();
  const storage = { get: jest.fn(async name => disk.get(name)),
    set: jest.fn(async (name, value) => { disk.set(name, value); }) };
  if (atomic) storage.setIfUnchanged = jest.fn(async (name, expected, value) => {
    if ((disk.get(name) ?? null) !== expected) return false;
    await storage.set(name, value); return true;
  });
  const request = jest.fn(async () => reply ? reply.promise : snapshot);
  const engine = createCareSync({ accountId: 'synthetic-account', familyId: 'synthetic-family',
    profileId: 'synthetic-patient', storage, request, currentAccount: () => 'synthetic-account',
    newId: async () => nextId ? nextId.promise : 'synthetic-operation', changed });
  return { engine, disk, key, storage, request, changed, snapshot,
    deferRead() { reply = deferred(); return reply; },
    deferId() { nextId = deferred(); return nextId; },
    clear() { disk.delete(key); storage.set.mockClear(); changed.mockClear(); },
    async ready() { await engine.init(); await engine.sync(); } };
}

test('reinitializing an existing engine after local data removal cannot retain its old in-memory archive', async () => {
  const f = fixture(); await f.ready();
  await f.engine.edit('preference', 'speechRate', { value: 0.7 });
  f.clear(); await f.engine.init();
  expect(f.engine.view()).toMatchObject({ resources: {}, queue: [], permissions: [], cursor: -1 });
  expect(f.disk.has(f.key)).toBe(false); expect(f.storage.set).not.toHaveBeenCalled();
});

test('editing after local data removal cannot resurrect the previous queue or granted permissions', async () => {
  const f = fixture(); await f.ready();
  await f.engine.edit('preference', 'speechRate', { value: 0.7 });
  f.clear(); f.request.mockClear();
  await expect(f.engine.edit('preference', 'speechRate', { value: 1.3 })).rejects.toBeDefined();
  expect(f.disk.has(f.key)).toBe(false); expect(f.storage.set).not.toHaveBeenCalled();
  expect(f.engine.view().queue).toEqual([]); expect(f.request).not.toHaveBeenCalled();
});

test.each([false, true])('a late snapshot cannot recreate removed local data (conditional adapter %s)', async atomic => {
  const f = fixture(atomic); await f.ready();
  const pending = f.deferRead(); const started = f.engine.sync();
  await new Promise(done => setTimeout(done, 0));
  f.clear(); pending.resolve(f.snapshot);
  await expect(started).rejects.toMatchObject({ code: 'CARE_LOCAL_STATE_CHANGED' });
  expect(f.disk.has(f.key)).toBe(false); expect(f.storage.set).not.toHaveBeenCalled();
  expect(f.engine.view()).toMatchObject({ resources: {}, queue: [] });
  expect(f.changed).toHaveBeenCalledTimes(1);
  expect(f.changed).toHaveBeenCalledWith({ reason: 'local-state-changed' });
});

test.each([false, true])('a late snapshot does not overwrite a newer persisted intention (conditional adapter %s)', async atomic => {
  const f = fixture(atomic); await f.ready();
  const pending = f.deferRead(); const started = f.engine.sync();
  await new Promise(done => setTimeout(done, 0));
  const newer = { ...JSON.parse(f.disk.get(f.key)), cursor: 9,
    queue: [{ operationId: 'synthetic-newer-intention', kind: 'preference', resourceId: 'speechRate', action: 'put', baseVersion: 0, value: { value: 1.3 } }] };
  const exact = JSON.stringify(newer); f.disk.set(f.key, exact); f.storage.set.mockClear();
  pending.resolve(f.snapshot);
  await expect(started).rejects.toMatchObject({ code: 'CARE_LOCAL_STATE_CHANGED' });
  expect(f.disk.get(f.key)).toBe(exact); expect(f.storage.set).not.toHaveBeenCalled();
  expect(f.engine.view().queue.map(v => v.operationId)).toEqual(['synthetic-newer-intention']);
});

test('a permission recheck cannot lock or recreate storage cleared while its response was pending', async () => {
  const f = fixture(true); await f.ready();
  await f.engine.edit('preference', 'speechRate', { value: 0.7 });
  const pending = deferred(), entered = deferred(); let reads = 0;
  f.request.mockImplementation(async (path, method) => {
    if (method === 'POST') throw Object.assign(new Error('synthetic denied write'), {
      status: 403, data: { code: 'PROFILE_ACCESS_DENIED' }
    });
    if (++reads === 2) { entered.resolve(); return pending.promise; }
    return f.snapshot;
  });
  const started = f.engine.sync(); await entered.promise;
  f.clear(); pending.resolve({ ...f.snapshot, permissions: ['read'] });
  await expect(started).rejects.toMatchObject({ code: 'CARE_LOCAL_STATE_CHANGED' });
  expect(f.disk.has(f.key)).toBe(false); expect(f.storage.set).not.toHaveBeenCalled();
  expect(f.engine.view()).toMatchObject({ resources: {}, queue: [], permissions: [], locked: false });
});

test('an edit waiting for its identity cannot write old local contents after removal', async () => {
  const f = fixture(); await f.ready();
  const pending = f.deferId(); const started = f.engine.edit('preference', 'speechRate', { value: 1.3 });
  await new Promise(done => setTimeout(done, 0));
  f.clear(); pending.resolve('synthetic-late-operation');
  await expect(started).rejects.toMatchObject({ code: 'CARE_LOCAL_STATE_CHANGED' });
  expect(f.disk.has(f.key)).toBe(false); expect(f.storage.set).not.toHaveBeenCalled();
  expect(f.engine.view()).toMatchObject({ resources: {}, queue: [] });
});

test('ordinary serialized changes remain usable and retain the same existing preference identity', async () => {
  const f = fixture(); await f.ready();
  await f.engine.edit('preference', 'speechRate', { value: 0.7 });
  await f.engine.edit('preference', 'speechRate', { value: 0.7 });
  expect(f.engine.view().queue).toHaveLength(1);
  expect(JSON.parse(f.disk.get(f.key)).queue[0].operationId).toBe('synthetic-operation');
});
