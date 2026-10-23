import { createBrowserCommunicationSharePort } from './browserCommunicationShare';

const sentence = '合成人甲今晚不回家吃饭。';
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const share = jest.fn().mockResolvedValue(undefined),
    downloadBlob = jest.fn();
  return {
    share,
    downloadBlob,
    port: createBrowserCommunicationSharePort({
      navigatorRef: { share },
      downloadBlob
    })
  };
}
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('an obsolete expression never opens native sharing or downloads', async () => {
  const f = fixture();
  await expect(
    f.port.shareExpressionText(sentence, { isCurrent: () => false })
  ).resolves.toMatchObject({ cancelled: true });
  expect(f.share).not.toHaveBeenCalled();
  expect(f.downloadBlob).not.toHaveBeenCalled();
});

test.each(['resolve', 'reject'])(
  'leaving during native sharing ignores a late %s and never downloads',
  async completion => {
    const f = fixture(),
      menu = deferred();
    let current = true;
    f.share.mockReturnValueOnce(menu.promise);
    const task = f.port.shareExpressionText(sentence, {
      isCurrent: () => current
    });
    current = false;
    menu[completion](new Error('synthetic share result'));
    await expect(task).resolves.toMatchObject({ ok: false, cancelled: true });
    expect(f.downloadBlob).not.toHaveBeenCalled();
  }
);

test('current native failure still uses the existing text fallback', async () => {
  const f = fixture();
  f.share.mockRejectedValueOnce(new Error('synthetic unsupported'));
  await expect(
    f.port.shareExpressionText(sentence, { isCurrent: () => true })
  ).resolves.toMatchObject({ mode: 'downloaded' });
  expect(f.downloadBlob).toHaveBeenCalledTimes(1);
});

test('explicit cancellation is not converted to a text download', async () => {
  const f = fixture();
  f.share.mockRejectedValueOnce(
    Object.assign(new Error('cancelled'), { name: 'AbortError' })
  );
  await expect(
    f.port.shareExpressionText(sentence, { isCurrent: () => true })
  ).resolves.toMatchObject({ cancelled: true });
  expect(f.downloadBlob).not.toHaveBeenCalled();
});

test('native menu waiting is not retried or timed out behind the user', async () => {
  jest.useFakeTimers();
  const f = fixture(),
    menu = deferred();
  f.share.mockReturnValueOnce(menu.promise);
  let result;
  const task = f.port.shareExpressionText(sentence).then(value => {
    result = value;
  });
  jest.advanceTimersByTime(120000);
  await Promise.resolve();
  expect(result).toBeUndefined();
  expect(f.share).toHaveBeenCalledTimes(1);
  expect(f.downloadBlob).not.toHaveBeenCalled();
  menu.resolve();
  await task;
  expect(result.ok).toBe(true);
});

test('native payload preserves negation and time and includes no picture payload', async () => {
  const f = fixture();
  await f.port.shareExpressionText(sentence, { isCurrent: () => true });
  expect(f.share.mock.calls).toEqual([
    [{ title: '图语家表达', text: sentence }]
  ]);
});
