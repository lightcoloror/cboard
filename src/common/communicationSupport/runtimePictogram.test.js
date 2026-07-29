import {
  DEVICE_PRIVATE_RUNTIME_PICTOGRAM_PROVIDER,
  buildAiGeneratedRuntimePictogram,
  buildDevicePrivateRuntimePictogram,
  buildRuntimeCommunicationCatalogItem,
  normalizeRuntimePictogram
} from './runtimePictogram';

const sourcePictogram = {
  id: 'runtime_arasaac_123',
  imageUrl: '/pictograms/arasaac/123/image',
  labels: { zh: ['苹果'], en: ['apple'] },
  source: {
    provider: 'arasaac',
    originalId: '123',
    name: 'ARASAAC',
    license: 'CC BY-NC-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    author: 'Sergio Palao',
    authorUrl: 'https://arasaac.org/',
    sourceUrl: 'https://arasaac.org/pictograms/123',
    repoKey: 'arasaac'
  }
};

describe('runtime pictogram contract', () => {
  test('normalizes API results into a portable licensed pictogram', () => {
    expect(normalizeRuntimePictogram(sourcePictogram)).toEqual(
      expect.objectContaining({
        id: 'runtime_arasaac_123',
        label: '苹果',
        image: '/pictograms/arasaac/123/image',
        source: expect.objectContaining({
          provider: 'arasaac',
          license: 'CC BY-NC-SA 4.0',
          repoKey: 'arasaac'
        })
      })
    );
  });

  test('creates a TileDTO-compatible catalog item for the receiver pipeline', () => {
    expect(buildRuntimeCommunicationCatalogItem(sourcePictogram)).toEqual(
      expect.objectContaining({
        id: 'runtime_arasaac_123',
        displayLabel: '苹果',
        tile: expect.objectContaining({
          boardId: 'runtime-pictograms',
          image: '/pictograms/arasaac/123/image'
        }),
        pictogramAttribution: expect.objectContaining({
          provider: 'arasaac'
        })
      })
    );
  });

  test('rejects candidates without traceable license metadata', () => {
    expect(
      normalizeRuntimePictogram({
        id: 'unsafe',
        label: '苹果',
        image: '/a.png'
      })
    ).toBeNull();
  });

  test('creates a device-private runtime pictogram without claiming a public license', () => {
    const pictogram = buildDevicePrivateRuntimePictogram({
      recordId: 'missing-1',
      label: '家里的药盒',
      image: 'wxfile://saved/familiar-medicine.jpg'
    });

    expect(pictogram).toEqual({
      id: 'device_private_missing_missing-1',
      label: '家里的药盒',
      vocalization: '家里的药盒',
      image: 'wxfile://saved/familiar-medicine.jpg',
      backgroundColor: '#ffffff',
      source: {
        provider: DEVICE_PRIVATE_RUNTIME_PICTOGRAM_PROVIDER,
        originalId: 'missing-1',
        name: '当前设备私有图片',
        license: '用户提供，仅限本机使用',
        licenseUrl: null,
        author: null,
        authorUrl: null,
        sourceUrl: 'device-private://missing-token/missing-1',
        repoKey: null
      }
    });
    expect(buildRuntimeCommunicationCatalogItem(pictogram)).toEqual(
      expect.objectContaining({
        boardId: 'device-private-pictograms',
        tile: expect.objectContaining({
          boardId: 'device-private-pictograms',
          communication: expect.objectContaining({
            category: 'device-private'
          })
        })
      })
    );
  });

  test('rejects an incomplete device-private pictogram', () => {
    expect(
      buildDevicePrivateRuntimePictogram({
        recordId: 'missing-1',
        label: '家里的药盒'
      })
    ).toBeNull();
  });

  test('builds an AI-generated candidate as disclosed device-private data', () => {
    const pictogram = buildAiGeneratedRuntimePictogram({
      recordId: 'missing-1',
      generationId: 'generation-1',
      label: '紧急求助',
      image: 'data:image/png;base64,aW1hZ2U=',
      provider: 'openai-compatible',
      model: 'gpt-image-1'
    });

    expect(pictogram).toEqual(
      expect.objectContaining({
        id: 'device_private_ai_missing-1_generation-1',
        label: '紧急求助',
        image: 'data:image/png;base64,aW1hZ2U=',
        source: expect.objectContaining({
          provider: 'device-private',
          originalId: 'generation-1',
          author: '模型：gpt-image-1'
        })
      })
    );
  });
});
