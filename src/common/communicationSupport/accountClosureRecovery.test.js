import { createAccountClosureRecovery } from './accountClosureRecovery';

function setup() {
  let account = 'owner-a';
  const entries = new Map();
  const storage = {
    get: jest.fn(async key => entries.get(key)),
    set: jest.fn(async (key, value) => entries.set(key, value))
  };
  const options = {
    storage,
    scope: 'api-a',
    currentAccount: () => account,
    buildArchive: jest.fn(async () => new Uint8Array([1, 2, 3]))
  };
  return {
    options,
    entries,
    storage,
    recovery: createAccountClosureRecovery(options),
    switchAccount: value => {
      account = value;
    }
  };
}

test('a checked archive remains loadable after logout and service restart', async () => {
  const f = setup();
  expect(await f.recovery.preserve({ owner: 'owner-a' })).toEqual({
    saved: true
  });
  f.switchAccount(null);
  expect(await createAccountClosureRecovery(f.options).load('owner-a')).toEqual(
    new Uint8Array([1, 2, 3])
  );
  expect(Object.keys([...f.entries.values()][0]).sort()).toEqual([
    'bytes',
    'owner',
    'sha256',
    'version'
  ]);
});

test('quota failure and incomplete writes are not accepted as retained data', async () => {
  const f = setup();
  f.storage.set.mockRejectedValue(new Error('quota'));
  await expect(f.recovery.preserve({ owner: 'owner-a' })).rejects.toMatchObject(
    { code: 'CLOSURE_LOCAL_RECOVERY_UNAVAILABLE' }
  );
  f.storage.set.mockImplementation(async (key, value) =>
    f.entries.set(key, { ...value, bytes: new Uint8Array([1]) })
  );
  await expect(f.recovery.preserve({ owner: 'owner-a' })).rejects.toMatchObject(
    { code: 'CLOSURE_LOCAL_RECOVERY_UNAVAILABLE' }
  );
});

test('does not accept a previous valid archive when storage silently ignores a newer write', async () => {
  const f = setup();
  await f.recovery.preserve({ owner: 'owner-a' });
  f.options.buildArchive.mockResolvedValue(new Uint8Array([4, 5]));
  f.storage.set.mockResolvedValue();
  await expect(f.recovery.preserve({ owner: 'owner-a' })).rejects.toMatchObject(
    { code: 'CLOSURE_LOCAL_RECOVERY_UNAVAILABLE' }
  );
});

test('separates accounts and service addresses and detects tampering', async () => {
  const f = setup();
  await f.recovery.preserve({ owner: 'owner-a' });
  await expect(f.recovery.load('owner-b')).rejects.toThrow();
  await expect(
    createAccountClosureRecovery({ ...f.options, scope: 'api-b' }).load(
      'owner-a'
    )
  ).rejects.toThrow();
  [...f.entries.values()][0].bytes[0] = 8;
  await expect(f.recovery.load('owner-a')).rejects.toThrow();
});

test('account change during archive generation cannot preserve or confirm another account', async () => {
  const f = setup();
  f.options.buildArchive.mockImplementation(async () => {
    f.switchAccount('owner-b');
    return new Uint8Array([1]);
  });
  await expect(f.recovery.preserve({ owner: 'owner-a' })).rejects.toThrow();
  expect(f.storage.set).not.toHaveBeenCalled();
});
