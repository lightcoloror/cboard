import {
  MAX_RECEIVER_SHARE_ITEMS,
  buildExpressionSharePayload,
  buildReceiverShareDocument,
  buildReceiverShareLayout,
  renderReceiverShareLayout
} from './communicationShare';

const arasaacAttribution = {
  provider: 'arasaac',
  originalId: 'water',
  name: 'ARASAAC',
  license: 'CC BY-NC-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  author: 'Sergio Palao',
  authorUrl: 'https://arasaac.org/',
  sourceUrl: 'https://arasaac.org/',
  repoKey: 'arasaac'
};

describe('communication sharing core', () => {
  test('normalizes a selected expression into a bounded text payload', () => {
    expect(buildExpressionSharePayload('  我想喝水。  ')).toEqual({
      contractVersion: 1,
      title: '图语家表达',
      text: '我想喝水。'
    });
    expect(buildExpressionSharePayload('')).toBeNull();
  });

  test('builds a sequence-preserving mobile layout with attribution', () => {
    const document = buildReceiverShareDocument(
      [
        {
          id: 'want',
          label: '想',
          image: '/want.png'
        },
        {
          id: 'water',
          label: '水',
          image: '/water.png',
          attribution: arasaacAttribution
        }
      ],
      { speechText: '我想喝水' }
    );
    const layout = buildReceiverShareLayout(document);

    expect(document.items.map(item => item.id)).toEqual(['want', 'water']);
    expect(document.attributionLines).toContain(
      'ARASAAC · 作者：Sergio Palao · CC BY-NC-SA 4.0'
    );
    expect(layout.width).toBe(1080);
    expect(layout.height).toBeGreaterThan(900);
    expect(layout.imageBlocks.map(block => block.source)).toEqual([
      '/want.png',
      '/water.png'
    ]);
    expect(layout.textBlocks.map(block => block.text)).toEqual(
      expect.arrayContaining(['01', '02', '图片来源与许可'])
    );
  });

  test('uses two columns for longer sequences without changing order', () => {
    const items = Array.from({ length: 6 }, (_, index) => ({
      id: `tile-${index}`,
      label: `图片${index + 1}`,
      image: `/tile-${index}.png`
    }));
    const layout = buildReceiverShareLayout(buildReceiverShareDocument(items));

    expect(layout.imageBlocks.map(block => block.source)).toEqual(
      items.map(item => item.image)
    );
    expect(layout.imageBlocks[0].x).toBe(layout.imageBlocks[2].x);
    expect(layout.imageBlocks[0].x).not.toBe(layout.imageBlocks[1].x);
  });

  test('rejects oversized sequences instead of silently dropping pictures', () => {
    const items = Array.from(
      { length: MAX_RECEIVER_SHARE_ITEMS + 1 },
      (_, index) => ({
        id: `tile-${index}`,
        label: `图片${index}`,
        image: `/tile-${index}.png`
      })
    );

    expect(() => buildReceiverShareDocument(items)).toThrow(RangeError);
  });

  test('draws every available image and keeps a placeholder on load failure', async () => {
    const layout = buildReceiverShareLayout(
      buildReceiverShareDocument([
        { id: 'ok', label: '正常', image: '/ok.png' },
        { id: 'missing', label: '缺图', image: '/missing.png' }
      ])
    );
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
    const result = await renderReceiverShareLayout(context, layout, source =>
      source === '/ok.png'
        ? Promise.resolve({ source })
        : Promise.reject(new Error('missing'))
    );

    expect(result).toEqual({
      loadedImageCount: 1,
      failedImageCount: 1
    });
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(context.fillText).toHaveBeenCalledWith(
      '?',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number)
    );
  });

  test('keeps non-square pictures inside their image blocks without stretching', async () => {
    const layout = buildReceiverShareLayout(
      buildReceiverShareDocument([
        { id: 'photo', label: '个人照片', image: '/photo.png' }
      ])
    );
    const block = layout.imageBlocks[0];
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
    const image = { width: 400, height: 200 };

    await renderReceiverShareLayout(context, layout, () =>
      Promise.resolve(image)
    );

    expect(context.drawImage).toHaveBeenCalledWith(
      image,
      block.x,
      block.y + block.height / 4,
      block.width,
      block.height / 2
    );
  });
});
