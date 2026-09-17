import { createBrowserAccountClosure } from './accountClosureBrowser';
jest.mock('../../../api', () => ({ __esModule: true, default: {} }));
jest.mock('../../../store', () => ({ getStore: jest.fn() }));
jest.mock('../Export/PictureLibraryArchive.helpers', () => ({
  buildLocalDeviceDataArchive: jest.fn()
}));
jest.mock('file-saver', () => ({ saveAs: jest.fn() }));

function setup() {
  const owner = 'a'.repeat(24);
  let user = { id: owner, authToken: 'synthetic' };
  const entries = new Map();
  const storage = {
    get: jest.fn(async key => entries.get(key)),
    set: jest.fn(async (key, value) => entries.set(key, value)),
    list: jest.fn(async () => [
      {
        key: `care-v1:${owner}:family-a:patient-a`,
        value: JSON.stringify({ resources: {} })
      },
      {
        key: `care-v1:${owner}:family-b:patient-b`,
        value: JSON.stringify({ resources: {} })
      }
    ])
  };
  const api = {
    previewAccountClosure: jest.fn(async () => ({
      familyIds: ['family-a'],
      blockers: [],
      canConfirm: true
    })),
    prepareAccountClosure: jest.fn(async () => ({
      receiptId: owner,
      secret: 'b'.repeat(64)
    })),
    confirmAccountClosure: jest.fn(async () => ({
      operationId: 'job-a',
      accountDeleted: false
    })),
    getAccountClosureStatus: jest.fn(async () => ({
      status: 'prepared',
      accountDeleted: false
    }))
  };
  const options = {
    api,
    storage,
    scope: 'isolated-api',
    state: () => ({
      app: { userData: user },
      board: { boards: [{ id: 'local-board' }] }
    }),
    buildLegacy: jest.fn(async () => ({ content: new Uint8Array([1, 2, 3]) })),
    buildCare: jest.fn(async () => new Uint8Array([4, 5, 6]))
  };
  return {
    owner,
    options,
    api,
    storage,
    client: createBrowserAccountClosure(options),
    setUser: value => {
      user = value;
    }
  };
}

test('keeps legacy backup plus owned family archives before submitting, and exposes recovery after logout', async () => {
  const f = setup();
  await f.client.confirm(await f.client.preview());
  expect(f.options.buildLegacy).toHaveBeenCalledWith({
    boards: [{ id: 'local-board' }],
    zipType: 'uint8array'
  });
  expect(f.options.buildCare).toHaveBeenCalledTimes(1);
  expect(f.options.buildCare).toHaveBeenCalledWith(
    { familyId: 'family-a', profileId: 'patient-a' },
    { resources: {} }
  );
  expect(f.api.confirmAccountClosure).toHaveBeenCalledTimes(1);
  f.setUser({});
  const restarted = createBrowserAccountClosure(f.options);
  expect(await restarted.recoveries()).toHaveLength(2);
  f.setUser({ id: 'another', authToken: 'another-token' });
  expect(await restarted.recoveries()).toEqual([]);
});

test('a media read failure leaves server confirmation untouched', async () => {
  const f = setup();
  f.options.buildLegacy.mockRejectedValue(new Error('missing media'));
  await expect(f.client.confirm(await f.client.preview())).rejects.toThrow();
  expect(f.api.confirmAccountClosure).not.toHaveBeenCalled();
});
