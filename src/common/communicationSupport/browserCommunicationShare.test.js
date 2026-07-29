import { createBrowserCommunicationSharePort } from './browserCommunicationShare';

function createCanvas() {
  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    fillText: jest.fn(),
    drawImage: jest.fn()
  };
  return {
    width: 0,
    height: 0,
    getContext: jest.fn(() => context),
    context
  };
}

describe('browser communication share port', () => {
  test('shares a selected expression as plain text', async () => {
    const share = jest.fn(() => Promise.resolve());
    const port = createBrowserCommunicationSharePort({
      navigatorRef: { share }
    });

    await expect(port.shareExpressionText('我想喝水。')).resolves.toEqual({
      ok: true,
      mode: 'shared',
      message: '分享面板已打开。'
    });
    expect(share).toHaveBeenCalledWith({
      title: '图语家表达',
      text: '我想喝水。'
    });
  });

  test('downloads text when the Web Share API is unavailable', async () => {
    const downloadBlob = jest.fn();
    const port = createBrowserCommunicationSharePort({
      navigatorRef: {},
      downloadBlob
    });

    const result = await port.shareExpressionText('我想喝水。');

    expect(result).toEqual(
      expect.objectContaining({ ok: true, mode: 'downloaded' })
    );
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      '图语家表达.txt'
    );
  });

  test('renders and shares one ordered PNG with attribution-capable layout', async () => {
    const canvas = createCanvas();
    const share = jest.fn(() => Promise.resolve());
    const downloadBlob = jest.fn();
    const file = { name: '图语家接收图片.png' };
    const port = createBrowserCommunicationSharePort({
      navigatorRef: {
        share,
        canShare: jest.fn(() => true)
      },
      createCanvas: () => canvas,
      loadImage: source => Promise.resolve({ source }),
      canvasToBlob: () => Promise.resolve(new Blob(['png'])),
      createFile: () => file,
      downloadBlob
    });

    const result = await port.shareReceiverImage(
      [
        { id: 'want', label: '想', image: '/want.png' },
        { id: 'water', label: '水', image: '/water.png' }
      ],
      { speechText: '我想喝水' }
    );

    expect(result).toEqual(
      expect.objectContaining({ ok: true, mode: 'shared' })
    );
    expect(canvas.width).toBe(1080);
    expect(canvas.context.drawImage).toHaveBeenCalledTimes(2);
    expect(share).toHaveBeenCalledWith({
      title: '图语家接收图片',
      files: [file]
    });
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  test('does not force a download after the user cancels sharing', async () => {
    const downloadBlob = jest.fn();
    const port = createBrowserCommunicationSharePort({
      navigatorRef: {
        share: jest.fn(() =>
          Promise.reject(
            Object.assign(new Error('cancelled'), {
              name: 'AbortError'
            })
          )
        )
      },
      downloadBlob
    });

    await expect(port.shareExpressionText('我想喝水。')).resolves.toEqual({
      ok: false,
      cancelled: true,
      message: '已取消分享。'
    });
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
