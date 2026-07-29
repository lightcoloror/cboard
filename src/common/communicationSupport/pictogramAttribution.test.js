import {
  AI_GENERATED_PICTOGRAM_LICENSE,
  DEFAULT_DEVICE_PRIVATE_PICTOGRAM_LICENSE,
  createAiGeneratedPictogramAttribution,
  DEVICE_PRIVATE_PICTOGRAM_PROVIDER,
  createDevicePrivatePictogramAttribution,
  formatPictogramAttribution,
  getPictogramAttribution,
  normalizePictogramAttribution,
  normalizePublicPictogramAttribution
} from './pictogramAttribution';

describe('pictogram attribution contract', () => {
  const opensymbols = {
    provider: 'opensymbols',
    originalId: 'mulberry:medicine',
    name: 'OpenSymbols / mulberry',
    license: 'CC BY-SA 2.0 UK',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/uk/',
    author: 'Mulberry Symbols',
    authorUrl: 'https://mulberrysymbols.org/',
    sourceUrl: 'https://www.opensymbols.org/symbols/mulberry/medicine',
    repoKey: 'mulberry'
  };

  test('preserves complete public attribution including repository identity', () => {
    expect(normalizePictogramAttribution(opensymbols)).toEqual(opensymbols);
    expect(formatPictogramAttribution(opensymbols)).toBe(
      'OpenSymbols / mulberry · 作者：Mulberry Symbols · CC BY-SA 2.0 UK'
    );
  });

  test('preserves Global Symbols v2 licensing metadata', () => {
    const globalSymbols = {
      ...opensymbols,
      provider: 'globalsymbols',
      originalId: '314',
      name: 'Global Symbols / Mulberry Symbols',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      author: 'Paxtoncrafts Charitable Trust',
      authorUrl: 'https://mulberrysymbols.org/',
      sourceUrl: 'https://globalsymbols.com/uploads/apple.svg',
      repoKey: 'mulberry'
    };

    expect(normalizePublicPictogramAttribution(globalSymbols)).toEqual(
      globalSymbols
    );
    expect(formatPictogramAttribution(globalSymbols)).toBe(
      'Global Symbols / Mulberry Symbols · 作者：Paxtoncrafts Charitable Trust · CC BY-SA 4.0'
    );
  });

  test('derives bundled CBoard library attribution without copying it into every tile', () => {
    expect(
      getPictogramAttribution({
        id: 'water',
        image: '/symbols/mulberry/water.svg'
      })
    ).toEqual(
      expect.objectContaining({
        provider: 'mulberry',
        originalId: 'water',
        license: 'CC BY-SA 4.0'
      })
    );
    expect(
      getPictogramAttribution({
        id: 'packaged-water',
        image: '/packages/caregiver/assets/cboard-default/water.png'
      })
    ).toEqual(
      expect.objectContaining({
        provider: 'cboard-default',
        originalId: 'packaged-water'
      })
    );
  });

  test('derives exact ARASAAC attribution from compact curated metadata', () => {
    expect(
      getPictogramAttribution({
        id: 'pic-care-help',
        image: '/symbols/arasaac/picinterpreter-care/32648.png',
        pictogramProvider: 'arasaac',
        pictogramOriginalId: '32648'
      })
    ).toEqual({
      provider: 'arasaac',
      originalId: '32648',
      name: 'ARASAAC',
      license: 'CC BY-NC-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      author: 'Sergio Palao',
      authorUrl: 'https://arasaac.org/',
      sourceUrl: 'https://arasaac.org/pictograms/zh/32648',
      repoKey: 'arasaac'
    });
  });

  test('keeps device-private attribution local and rejects unsafe public URLs', () => {
    const privateAttribution = {
      provider: DEVICE_PRIVATE_PICTOGRAM_PROVIDER,
      originalId: 'missing-1',
      name: '当前设备私有图片',
      license: '用户提供，仅限本机使用',
      licenseUrl: null,
      author: null,
      authorUrl: null,
      sourceUrl: 'device-private://missing-token/missing-1',
      repoKey: null
    };

    expect(normalizePictogramAttribution(privateAttribution)).toEqual(
      privateAttribution
    );
    expect(normalizePublicPictogramAttribution(privateAttribution)).toBeNull();
    expect(
      normalizePictogramAttribution({
        ...opensymbols,
        sourceUrl: ['javascript', 'alert(1)'].join(':')
      })
    ).toBeNull();
  });

  test('builds a safe default attribution for a device-private familiar image', () => {
    expect(
      createDevicePrivatePictogramAttribution({
        boardId: 'daily needs',
        tileId: 'water/cup',
        label: '家里的水杯',
        author: '家属'
      })
    ).toEqual({
      provider: DEVICE_PRIVATE_PICTOGRAM_PROVIDER,
      originalId: 'daily needs:water/cup',
      name: '家里的水杯',
      license: DEFAULT_DEVICE_PRIVATE_PICTOGRAM_LICENSE,
      licenseUrl: null,
      author: '家属',
      authorUrl: null,
      sourceUrl: 'device-private://personal-image/daily%20needs/water%2Fcup',
      repoKey: null
    });
  });

  test('rejects AI image sources until disclosure and licensing are defined', () => {
    ['ai', 'ai-generated'].forEach(provider => {
      expect(
        normalizePictogramAttribution({
          ...opensymbols,
          provider,
          name: 'AI 生成图片'
        })
      ).toBeNull();
    });
  });

  test('keeps reviewed AI output device-private with model disclosure', () => {
    expect(
      createAiGeneratedPictogramAttribution({
        generationId: 'generation-1',
        provider: 'openai-compatible',
        model: 'gpt-image-1'
      })
    ).toEqual({
      provider: 'device-private',
      originalId: 'generation-1',
      name: 'AI 生成图符 / openai-compatible',
      license: AI_GENERATED_PICTOGRAM_LICENSE,
      licenseUrl: null,
      author: '模型：gpt-image-1',
      authorUrl: null,
      sourceUrl: 'device-private://ai-generated/generation-1',
      repoKey: 'openai-compatible/gpt-image-1'
    });
  });
});
