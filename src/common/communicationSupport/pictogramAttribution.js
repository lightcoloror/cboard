const PUBLIC_PICTOGRAM_PROVIDERS = new Set([
  'arasaac',
  'globalsymbols',
  'opensymbols',
  'mulberry',
  'cboard',
  'cboard-default'
]);

export const DEVICE_PRIVATE_PICTOGRAM_PROVIDER = 'device-private';
export const DEFAULT_DEVICE_PRIVATE_PICTOGRAM_LICENSE =
  '设备私有图片（未声明公开许可）';
export const AI_GENERATED_PICTOGRAM_LICENSE =
  'AI 生成内容，仅限当前设备使用；使用受模型服务条款约束';

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeOptionalString(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeHttpsUrl(value) {
  const normalized = normalizeOptionalString(value);
  return normalized && /^https:\/\//i.test(normalized) ? normalized : null;
}

function getOriginalId(value, fallback = '') {
  const direct = normalizeString(value);
  if (direct) return direct;

  const segments = normalizeString(fallback).split('/');
  return segments[segments.length - 1] || '';
}

export function normalizePictogramAttribution(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const provider = normalizeString(value.provider).toLocaleLowerCase();
  const originalId = normalizeString(value.originalId);
  const name = normalizeString(value.name);
  const license = normalizeString(value.license);
  const sourceUrl = normalizeString(value.sourceUrl);
  const isDevicePrivate = provider === DEVICE_PRIVATE_PICTOGRAM_PROVIDER;
  const hasSafeSourceUrl = isDevicePrivate
    ? sourceUrl.startsWith('device-private://')
    : Boolean(normalizeHttpsUrl(sourceUrl));

  if (
    !provider ||
    !originalId ||
    !name ||
    !license ||
    !hasSafeSourceUrl ||
    (!isDevicePrivate && !PUBLIC_PICTOGRAM_PROVIDERS.has(provider))
  ) {
    return null;
  }

  return {
    provider,
    originalId,
    name,
    license,
    licenseUrl: normalizeHttpsUrl(value.licenseUrl),
    author: normalizeOptionalString(value.author),
    authorUrl: normalizeHttpsUrl(value.authorUrl),
    sourceUrl,
    repoKey: normalizeOptionalString(value.repoKey)
  };
}

export function normalizePublicPictogramAttribution(value) {
  const attribution = normalizePictogramAttribution(value);
  return attribution &&
    attribution.provider !== DEVICE_PRIVATE_PICTOGRAM_PROVIDER
    ? attribution
    : null;
}

export function createDevicePrivatePictogramAttribution(value = {}) {
  const boardId = normalizeString(value.boardId);
  const tileId = normalizeString(value.tileId);
  const originalId =
    normalizeString(value.originalId) ||
    [boardId, tileId].filter(Boolean).join(':') ||
    'personal-image';
  const sourceSegments = [
    'personal-image',
    boardId || 'unscoped',
    tileId || originalId
  ].map(segment => encodeURIComponent(segment));

  return normalizePictogramAttribution({
    provider: DEVICE_PRIVATE_PICTOGRAM_PROVIDER,
    originalId,
    name:
      normalizeString(value.name) ||
      normalizeString(value.label) ||
      '个人熟悉图片',
    license:
      normalizeString(value.license) ||
      DEFAULT_DEVICE_PRIVATE_PICTOGRAM_LICENSE,
    licenseUrl: null,
    author: normalizeOptionalString(value.author),
    authorUrl: null,
    sourceUrl: `device-private://${sourceSegments.join('/')}`,
    repoKey: null
  });
}

export function createAiGeneratedPictogramAttribution(value = {}) {
  const generationId = normalizeString(value.generationId);
  const recordId = normalizeString(value.recordId);
  const originalId = generationId || recordId;
  const provider = normalizeString(value.provider);
  const model = normalizeString(value.model);

  if (!originalId) return null;

  return normalizePictogramAttribution({
    provider: DEVICE_PRIVATE_PICTOGRAM_PROVIDER,
    originalId,
    name: provider ? `AI 生成图符 / ${provider}` : 'AI 生成图符',
    license: AI_GENERATED_PICTOGRAM_LICENSE,
    licenseUrl: null,
    author: model ? `模型：${model}` : null,
    authorUrl: null,
    sourceUrl: `device-private://ai-generated/${encodeURIComponent(
      originalId
    )}`,
    repoKey: [provider, model].filter(Boolean).join('/') || null
  });
}

function buildBundledAttribution(value) {
  const image = normalizeString(value && value.image);
  const originalId = getOriginalId(value && value.id, image);
  const lowerImage = image.toLocaleLowerCase();

  if (!originalId || !image) return null;

  if (lowerImage.includes('/symbols/mulberry/')) {
    return normalizePictogramAttribution({
      provider: 'mulberry',
      originalId,
      name: 'Mulberry Symbols',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      author: 'Mulberry Symbols',
      authorUrl: 'https://mulberrysymbols.org/',
      sourceUrl: 'https://mulberrysymbols.org/',
      repoKey: 'mulberry'
    });
  }

  if (lowerImage.includes('/symbols/arasaac/')) {
    return normalizePictogramAttribution({
      provider: 'arasaac',
      originalId,
      name: 'ARASAAC',
      license: 'CC BY-NC-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      author: 'Sergio Palao',
      authorUrl: 'https://arasaac.org/',
      sourceUrl: 'https://arasaac.org/',
      repoKey: 'arasaac'
    });
  }

  if (lowerImage.includes('/symbols/cboard/')) {
    return normalizePictogramAttribution({
      provider: 'cboard',
      originalId,
      name: 'CBoard Symbols',
      license: 'CBoard 项目许可声明（未提供逐图独立许可）',
      licenseUrl: 'https://github.com/cboard-org/cboard#license',
      author: 'CBoard',
      authorUrl: 'https://github.com/cboard-org/cboard',
      sourceUrl:
        'https://github.com/cboard-org/cboard/tree/master/public/symbols/cboard',
      repoKey: 'cboard'
    });
  }

  if (lowerImage.includes('/assets/cboard-default/')) {
    return normalizePictogramAttribution({
      provider: 'cboard-default',
      originalId,
      name: 'CBoard 默认图符包',
      license: '按原图符许可：Mulberry CC BY-SA 4.0 / ARASAAC CC BY-NC-SA 4.0',
      licenseUrl: 'https://github.com/cboard-org/cboard#license',
      author: 'CBoard / Mulberry / ARASAAC',
      authorUrl: 'https://github.com/cboard-org/cboard',
      sourceUrl:
        'https://github.com/cboard-org/cboard/blob/master/src/api/boards.json',
      repoKey: 'cboard-default'
    });
  }

  return null;
}

function buildDeclaredPublicAttribution(value) {
  const provider = normalizeString(
    value && value.pictogramProvider
  ).toLocaleLowerCase();
  const originalId = normalizeString(value && value.pictogramOriginalId);

  if (provider !== 'arasaac' || !/^\d+$/.test(originalId)) {
    return null;
  }

  return normalizePictogramAttribution({
    provider: 'arasaac',
    originalId,
    name: 'ARASAAC',
    license: 'CC BY-NC-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    author: 'Sergio Palao',
    authorUrl: 'https://arasaac.org/',
    sourceUrl: `https://arasaac.org/pictograms/zh/${originalId}`,
    repoKey: 'arasaac'
  });
}

export function getPictogramAttribution(value) {
  if (!value || typeof value !== 'object') return null;

  const directCandidates = [
    value.pictogramAttribution,
    value.attribution,
    value.source
  ];
  for (let index = 0; index < directCandidates.length; index += 1) {
    const normalized = normalizePictogramAttribution(directCandidates[index]);
    if (normalized) return normalized;
  }

  const declared = buildDeclaredPublicAttribution(value);
  if (declared) return declared;

  const bundled = buildBundledAttribution(value);
  if (bundled) return bundled;

  return value.tile && typeof value.tile === 'object'
    ? getPictogramAttribution(value.tile)
    : null;
}

export function formatPictogramAttribution(value) {
  const attribution = normalizePictogramAttribution(value);
  if (!attribution) return '';

  return [
    attribution.name,
    attribution.author ? `作者：${attribution.author}` : '',
    attribution.license
  ]
    .filter(Boolean)
    .join(' · ');
}
