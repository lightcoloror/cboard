import { createBrowserCommunicationSharePort } from './browserCommunicationShare';

const items = [
  {
    id: 'synthetic-person',
    label: '合成人甲',
    image: 'blob:synthetic-private-person'
  },
  { id: 'water', label: '水', image: '/synthetic-water.png' }
];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
function fixture(overrides = {}) {
  const context = {
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    fillText: jest.fn(),
    drawImage: jest.fn()
  };
  const dependencies = {
    navigatorRef: {
      canShare: jest.fn(() => true),
      share: jest.fn().mockResolvedValue(undefined)
    },
    createCanvas: jest.fn(() => ({ getContext: () => context })),
    loadImage: jest.fn(source =>
      Promise.resolve({ source, width: 100, height: 100 })
    ),
    canvasToBlob: jest.fn().mockResolvedValue(new Blob(['synthetic png'])),
    createFile: jest.fn(blob => ({ name: 'synthetic.png', blob })),
    downloadBlob: jest.fn(),
    ...overrides
  };
  return {
    dependencies,
    context,
    port: createBrowserCommunicationSharePort(dependencies)
  };
}
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('obsolete callbacks do not create a canvas or start image loading', async () => {
  const f = fixture();
  await expect(
    f.port.shareReceiverImage(items, { isCurrent: () => false })
  ).resolves.toMatchObject({ cancelled: true });
  expect(f.dependencies.createCanvas).not.toHaveBeenCalled();
  expect(f.dependencies.loadImage).not.toHaveBeenCalled();
});

test('leaving while an image loads prevents later images, export, native share and download', async () => {
  const f = fixture(),
    image = deferred();
  let current = true;
  f.dependencies.loadImage.mockReturnValueOnce(image.promise);
  const task = f.port.shareReceiverImage(items, { isCurrent: () => current });
  await flush();
  current = false;
  image.resolve({ width: 100, height: 100 });
  await expect(task).resolves.toMatchObject({ cancelled: true });
  expect(f.dependencies.loadImage).toHaveBeenCalledTimes(1);
  expect(f.dependencies.canvasToBlob).not.toHaveBeenCalled();
  expect(f.dependencies.navigatorRef.share).not.toHaveBeenCalled();
  expect(f.dependencies.downloadBlob).not.toHaveBeenCalled();
});

test('leaving during PNG export never creates or shares a file', async () => {
  const f = fixture(),
    png = deferred();
  let current = true;
  f.dependencies.canvasToBlob.mockReturnValueOnce(png.promise);
  const task = f.port.shareReceiverImage(items, { isCurrent: () => current });
  await flush();
  current = false;
  png.resolve(new Blob(['late synthetic png']));
  await expect(task).resolves.toMatchObject({ cancelled: true });
  expect(f.dependencies.createFile).not.toHaveBeenCalled();
  expect(f.dependencies.navigatorRef.share).not.toHaveBeenCalled();
  expect(f.dependencies.downloadBlob).not.toHaveBeenCalled();
});

test('timeout permits explicit retry and the old PNG completion cannot export again', async () => {
  jest.useFakeTimers();
  const f = fixture(),
    png = deferred();
  f.dependencies.canvasToBlob.mockReturnValueOnce(png.promise);
  let result;
  const first = f.port.shareReceiverImage(items).then(value => {
    result = value;
  });
  await flush();
  jest.advanceTimersByTime(30000);
  await flush();
  expect(result).toMatchObject({
    ok: false,
    message: expect.stringContaining('超时')
  });
  await expect(f.port.shareReceiverImage(items)).resolves.toMatchObject({
    ok: true
  });
  png.resolve(new Blob(['late synthetic png']));
  await first;
  await flush();
  expect(f.dependencies.navigatorRef.share).toHaveBeenCalledTimes(1);
  expect(f.dependencies.downloadBlob).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('a native-share failure after leaving cannot fall through to download', async () => {
  const f = fixture(),
    menu = deferred();
  let current = true;
  f.dependencies.navigatorRef.share.mockReturnValueOnce(menu.promise);
  const task = f.port.shareReceiverImage(items, { isCurrent: () => current });
  await flush();
  current = false;
  menu.reject(new Error('synthetic native failure'));
  await expect(task).resolves.toMatchObject({ cancelled: true });
  expect(f.dependencies.downloadBlob).not.toHaveBeenCalled();
});

test('native cancellation never downloads, while an active unsupported share retains its fallback', async () => {
  const f = fixture();
  f.dependencies.navigatorRef.share.mockRejectedValueOnce(
    Object.assign(new Error('cancelled'), { name: 'AbortError' })
  );
  await expect(f.port.shareReceiverImage(items)).resolves.toMatchObject({
    cancelled: true
  });
  expect(f.dependencies.downloadBlob).not.toHaveBeenCalled();
  f.dependencies.navigatorRef.share.mockRejectedValueOnce(
    new Error('synthetic unavailable')
  );
  await expect(f.port.shareReceiverImage(items)).resolves.toMatchObject({
    ok: true,
    mode: 'downloaded'
  });
  expect(f.dependencies.downloadBlob).toHaveBeenCalledTimes(1);
});

test('render timer is cleared while a native share menu waits for the user', async () => {
  jest.useFakeTimers();
  const f = fixture(),
    menu = deferred();
  let result;
  f.dependencies.navigatorRef.share.mockReturnValueOnce(menu.promise);
  const task = f.port.shareReceiverImage(items).then(value => {
    result = value;
  });
  await flush();
  jest.advanceTimersByTime(60000);
  await flush();
  expect(result).toBeUndefined();
  expect(jest.getTimerCount()).toBe(0);
  menu.resolve();
  await task;
  expect(result).toMatchObject({ ok: true });
});

test('synthetic private sources, order and negative wording remain unchanged without source revocation', async () => {
  const f = fixture(),
    before = JSON.stringify(items);
  await expect(
    f.port.shareReceiverImage(items, { speechText: '合成人甲不喝水' })
  ).resolves.toMatchObject({ ok: true });
  expect(f.dependencies.loadImage.mock.calls.map(call => call[0])).toEqual(
    items.map(item => item.image)
  );
  expect(
    f.context.fillText.mock.calls.some(call =>
      String(call[0]).includes('合成人甲不喝水')
    )
  ).toBe(true);
  expect(JSON.stringify(items)).toBe(before);
});

test('default image loading times out with a visible placeholder and detaches late handlers', async () => {
  jest.useFakeTimers();
  const image = { width: 100, height: 100 };
  jest.spyOn(global, 'Image').mockImplementation(() => image);
  const f = fixture({ loadImage: undefined });
  const task = f.port.shareReceiverImage([items[0]]);
  const lateLoad = image.onload;
  expect(image.src).toBe(items[0].image);
  jest.advanceTimersByTime(10000);
  await expect(task).resolves.toMatchObject({
    ok: true,
    message: expect.stringContaining('1 张图片加载失败')
  });
  expect(image.onload).toBeNull();
  expect(image.onerror).toBeNull();
  expect(f.context.drawImage).not.toHaveBeenCalled();
  lateLoad();
  await flush();
  expect(f.dependencies.navigatorRef.share).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('default image loading handles success without leaving its watchdog or source handlers', async () => {
  jest.useFakeTimers();
  const image = { width: 100, height: 100 };
  jest.spyOn(global, 'Image').mockImplementation(() => image);
  const f = fixture({ loadImage: undefined });
  const task = f.port.shareReceiverImage([
    { ...items[0], image: 'https://synthetic.invalid/picture.png' }
  ]);
  expect(image.crossOrigin).toBe('anonymous');
  image.onload();
  await expect(task).resolves.toMatchObject({ ok: true });
  expect(f.context.drawImage).toHaveBeenCalledTimes(1);
  expect(image.onload).toBeNull();
  expect(image.onerror).toBeNull();
  expect(jest.getTimerCount()).toBe(0);
});

test.each([
  ['receiver', false],
  ['receiver', true],
  ['expression', false],
  ['expression', true]
])(
  '%s default download releases only its generated URL (click fails: %s)',
  async (kind, failClick) => {
    const body = {
      appendChild: jest.fn(anchor => {
        anchor.parentNode = body;
      }),
      removeChild: jest.fn(anchor => {
        anchor.parentNode = null;
      })
    };
    const anchor = {
      style: {},
      click: jest.fn(() => {
        if (failClick) throw new Error('synthetic blocked click');
      })
    };
    const documentRef = { body, createElement: jest.fn(() => anchor) };
    const urlRef = {
      createObjectURL: jest.fn(() => 'blob:synthetic-generated-download'),
      revokeObjectURL: jest.fn()
    };
    const f = fixture({
      navigatorRef: {},
      documentRef,
      urlRef,
      downloadBlob: undefined
    });
    const before = JSON.stringify(items);
    const result =
      kind === 'receiver'
        ? await f.port.shareReceiverImage(items)
        : await f.port.shareExpressionText('合成人甲不喝水');
    expect(result.ok).toBe(!failClick);
    expect(body.removeChild).toHaveBeenCalledWith(anchor);
    expect(urlRef.revokeObjectURL.mock.calls).toEqual([
      ['blob:synthetic-generated-download']
    ]);
    expect(JSON.stringify(items)).toBe(before);
  }
);
