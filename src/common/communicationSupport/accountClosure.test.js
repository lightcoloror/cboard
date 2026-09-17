import { createAccountClosure } from './accountClosure';

const owner = 'a'.repeat(24);
const prepared = { receiptId: owner, secret: 'b'.repeat(64), expiresAt: 100 };
const preview = {
  owner,
  familyIds: ['family-a'],
  canConfirm: true,
  blockers: []
};
const accepted = {
  operationId: 'job-a',
  accountDeleted: false,
  cleanupStatus: 'prepared'
};
function setup() {
  const values = new Map();
  const storage = {
    get: jest.fn(async key => values.get(key)),
    set: jest.fn(async (key, value) => values.set(key, value))
  };
  let account = owner;
  const api = {
    preview: jest.fn(async () => preview),
    prepare: jest.fn(async () => prepared),
    confirm: jest.fn(async () => accepted),
    status: jest.fn(async () => ({ status: 'prepared', accountDeleted: false }))
  };
  const options = {
    api,
    storage,
    currentAccount: () => account,
    preserveLocal: jest.fn(async () => ({ saved: true })),
    scope: 'https://api.example.test'
  };
  return {
    api,
    storage,
    values,
    options,
    client: createAccountClosure(options),
    switchAccount: value => {
      account = value;
    }
  };
}

test('durably saves receipt and recovery pointer before sending explicit confirmation', async () => {
  const f = setup();
  f.api.confirm.mockImplementation(async body => {
    expect([...f.values.values()]).toContainEqual({
      owner,
      receiptId: owner,
      secret: prepared.secret,
      submitted: true
    });
    expect([...f.values.values()]).toContain(owner);
    expect(body).toEqual({
      familyIds: ['family-a'],
      secret: prepared.secret,
      confirmCloudDeletion: true
    });
    return accepted;
  });
  expect(await f.client.confirm(preview)).toMatchObject({
    status: 'confirmed',
    accountDeleted: false
  });
});

test('storage failure prevents irreversible submission', async () => {
  const f = setup();
  f.storage.set.mockRejectedValue(new Error('quota'));
  await expect(f.client.confirm(preview)).rejects.toThrow();
  expect(f.api.confirm).not.toHaveBeenCalled();
});

test('silent storage loss is detected before submission', async () => {
  const f = setup();
  f.storage.set.mockResolvedValue();
  await expect(f.client.confirm(preview)).rejects.toMatchObject({
    code: 'CLOSURE_STORAGE_UNAVAILABLE'
  });
  expect(f.api.confirm).not.toHaveBeenCalled();
});

test('lost confirmation response is recovered without a second delete request', async () => {
  const f = setup();
  f.api.confirm.mockRejectedValue(new Error('offline'));
  f.api.status.mockResolvedValue({ ...accepted, status: 'confirmed' });
  expect(await f.client.confirm(preview)).toMatchObject({
    status: 'confirmed',
    accountDeleted: false
  });
  expect(f.api.confirm).toHaveBeenCalledTimes(1);
  f.switchAccount(null);
  const restarted = createAccountClosure(f.options);
  expect(await restarted.status()).toMatchObject({ status: 'confirmed' });
  expect(f.api.prepare).toHaveBeenCalledTimes(1);
});

test('unknown status after disconnect retains the original receipt across restart', async () => {
  const f = setup();
  f.api.confirm.mockRejectedValue(new Error('offline'));
  f.api.status.mockRejectedValue(new Error('offline'));
  await expect(f.client.confirm(preview)).rejects.toThrow('offline');
  await expect(
    createAccountClosure(f.options).confirm(preview)
  ).rejects.toThrow('offline');
  expect(f.api.prepare).toHaveBeenCalledTimes(1);
  expect(f.api.confirm).toHaveBeenCalledTimes(1);
});

test('another logged-in account and another service never read the old receipt', async () => {
  const f = setup();
  await f.client.confirm(preview);
  f.switchAccount('other-account');
  expect(await f.client.status()).toBeNull();
  f.switchAccount(null);
  expect(
    await createAccountClosure({
      ...f.options,
      scope: 'https://other.example.test'
    }).status()
  ).toBeNull();
  expect(f.api.status).not.toHaveBeenCalled();
});

test('account change while preparing prevents confirmation', async () => {
  const f = setup();
  f.api.prepare.mockImplementation(async () => {
    f.switchAccount('other');
    return prepared;
  });
  await expect(f.client.confirm(preview)).rejects.toMatchObject({
    code: 'ACCOUNT_CHANGED'
  });
  expect(f.api.confirm).not.toHaveBeenCalled();
});

test('blockers prevent preparing or confirming', async () => {
  const f = setup();
  await expect(
    f.client.confirm({
      ...preview,
      blockers: [{ code: 'FAMILY_TRANSFER_REQUIRED' }]
    })
  ).rejects.toMatchObject({ code: 'CLOSURE_BLOCKED' });
  expect(f.api.prepare).not.toHaveBeenCalled();
});

test('only confirmed complete server status can report deletion', async () => {
  const f = setup();
  await f.client.confirm(preview);
  f.api.status.mockResolvedValue({
    status: 'confirmed',
    accountDeleted: true,
    cleanupStatus: 'media_cleanup'
  });
  await expect(f.client.status()).rejects.toMatchObject({
    code: 'INVALID_RESPONSE'
  });
  f.api.status.mockResolvedValue({
    status: 'confirmed',
    accountDeleted: true,
    cleanupStatus: 'complete'
  });
  expect(await f.client.status()).toMatchObject({ accountDeleted: true });
});

test('a confirmed receipt is reused even when original local prepare expiry passed', async () => {
  const f = setup();
  await f.client.confirm(preview);
  f.api.status.mockResolvedValue({ ...accepted, status: 'confirmed' });
  await createAccountClosure(f.options).confirm(preview);
  expect(f.api.prepare).toHaveBeenCalledTimes(1);
  expect(f.api.confirm).toHaveBeenCalledTimes(1);
});

test('an explicitly unavailable unsubmitted receipt can be prepared again after fresh preview', async () => {
  const f = setup();
  f.options.preserveLocal.mockRejectedValueOnce(new Error('quota'));
  await expect(f.client.confirm(preview)).rejects.toThrow();
  f.api.status.mockRejectedValue(
    Object.assign(new Error(), {
      code: 'CLOSURE_RECEIPT_UNAVAILABLE',
      status: 404
    })
  );
  await createAccountClosure(f.options).confirm(await f.client.preview());
  expect(f.api.prepare).toHaveBeenCalledTimes(2);
});

test('an attempted confirmation with prepared status cannot be submitted again after restart', async () => {
  const f = setup();
  f.api.confirm.mockRejectedValue(new Error('lost response'));
  await expect(f.client.confirm(preview)).rejects.toThrow();
  const restarted = createAccountClosure(f.options);
  expect(await restarted.status()).toMatchObject({ confirmationUnknown: true });
  await expect(restarted.confirm(preview)).rejects.toMatchObject({
    code: 'CLOSURE_CONFIRMATION_UNKNOWN'
  });
  expect(f.api.confirm).toHaveBeenCalledTimes(1);
  expect(f.api.prepare).toHaveBeenCalledTimes(1);
});

test('a definite permission refusal can be retried after a fresh preview', async () => {
  const f = setup();
  f.api.confirm.mockRejectedValueOnce(
    Object.assign(new Error('membership changed'), { status: 409 })
  );
  await expect(f.client.confirm(preview)).rejects.toThrow();
  await f.client.confirm(await f.client.preview());
  expect(f.api.confirm).toHaveBeenCalledTimes(2);
});

test('two views sharing storage do not rotate the receipt while confirmation is in flight', async () => {
  const f = setup();
  f.api.confirm.mockImplementation(async () => {
    f.api.status.mockResolvedValue({ ...accepted, status: 'confirmed' });
    return accepted;
  });
  await Promise.all([
    f.client.confirm(preview),
    createAccountClosure(f.options).confirm(preview)
  ]);
  expect(f.api.prepare).toHaveBeenCalledTimes(1);
  expect(f.api.confirm).toHaveBeenCalledTimes(1);
});

test('a late status response cannot appear under a different account', async () => {
  const f = setup();
  await f.client.confirm(preview);
  f.api.status.mockImplementation(async () => {
    f.switchAccount('other');
    return { ...accepted, status: 'confirmed' };
  });
  await expect(f.client.status()).rejects.toMatchObject({
    code: 'ACCOUNT_CHANGED'
  });
});

test('missing local recovery adapter blocks confirmation', async () => {
  const f = setup();
  await expect(
    createAccountClosure({ ...f.options, preserveLocal: undefined }).confirm(
      preview
    )
  ).rejects.toMatchObject({ code: 'CLOSURE_LOCAL_RECOVERY_UNAVAILABLE' });
  expect(f.api.confirm).not.toHaveBeenCalled();
});

test('local recovery must finish before deletion can be submitted', async () => {
  const f = setup();
  f.options.preserveLocal.mockRejectedValue(new Error('disk full'));
  await expect(f.client.confirm(preview)).rejects.toMatchObject({
    code: 'CLOSURE_LOCAL_RECOVERY_UNAVAILABLE'
  });
  expect(f.api.confirm).not.toHaveBeenCalled();
  f.options.preserveLocal.mockResolvedValue({ saved: true });
  f.api.confirm.mockImplementation(async () => {
    expect(f.options.preserveLocal).toHaveBeenLastCalledWith({
      owner,
      familyIds: preview.familyIds
    });
    return accepted;
  });
  await f.client.confirm(preview);
  expect(f.api.confirm).toHaveBeenCalledTimes(1);
});
