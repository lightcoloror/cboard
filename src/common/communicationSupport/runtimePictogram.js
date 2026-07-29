import {
  DEVICE_PRIVATE_PICTOGRAM_PROVIDER,
  createAiGeneratedPictogramAttribution,
  normalizePictogramAttribution
} from './pictogramAttribution';

function normalizeString(value) {
  return String(value || '').trim();
}

export const DEVICE_PRIVATE_RUNTIME_PICTOGRAM_PROVIDER = DEVICE_PRIVATE_PICTOGRAM_PROVIDER;

export function buildDevicePrivateRuntimePictogram(value = {}) {
  const recordId = normalizeString(value.recordId);
  const label = normalizeString(value.label);
  const image = normalizeString(value.image);
  const pictogramIdPart = recordId.replace(/[^a-z0-9_-]+/gi, '_');

  if (!recordId || !label || !image || !pictogramIdPart) {
    return null;
  }

  return normalizeRuntimePictogram({
    id: `device_private_missing_${pictogramIdPart}`,
    label,
    vocalization: label,
    image,
    backgroundColor: '#ffffff',
    source: {
      provider: DEVICE_PRIVATE_RUNTIME_PICTOGRAM_PROVIDER,
      originalId: recordId,
      name: '当前设备私有图片',
      license: '用户提供，仅限本机使用',
      licenseUrl: null,
      author: null,
      authorUrl: null,
      sourceUrl: `device-private://missing-token/${encodeURIComponent(
        recordId
      )}`
    }
  });
}

export function buildAiGeneratedRuntimePictogram(value = {}) {
  const recordId = normalizeString(value.recordId);
  const generationId = normalizeString(value.generationId);
  const label = normalizeString(value.label);
  const image = normalizeString(value.image);
  const idPart = `${recordId}_${generationId}`.replace(/[^a-z0-9_-]+/gi, '_');
  const source = createAiGeneratedPictogramAttribution({
    recordId,
    generationId,
    provider: value.provider,
    model: value.model
  });

  if (!recordId || !generationId || !label || !image || !idPart || !source) {
    return null;
  }

  return normalizeRuntimePictogram({
    id: `device_private_ai_${idPart}`,
    label,
    vocalization: label,
    image,
    backgroundColor: '#ffffff',
    source
  });
}

function getFirstLabel(value, locale) {
  const labels = value && value.labels && value.labels[locale];
  return Array.isArray(labels) ? normalizeString(labels[0]) : '';
}

export function normalizeRuntimePictogram(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source =
    value.source && typeof value.source === 'object' ? value.source : {};
  const id = normalizeString(value.id);
  const label =
    normalizeString(value.label) ||
    getFirstLabel(value, 'zh') ||
    getFirstLabel(value, 'en');
  const image = normalizeString(value.image || value.imageUrl);
  const attribution = normalizePictogramAttribution({
    provider: source.provider || value.provider,
    originalId: source.originalId || value.originalId,
    name: source.name || value.sourceName,
    license: source.license || value.license,
    licenseUrl: source.licenseUrl || value.licenseUrl,
    author: source.author || value.author,
    authorUrl: source.authorUrl || value.authorUrl,
    sourceUrl: source.sourceUrl || value.sourceUrl,
    repoKey: source.repoKey || value.repoKey
  });

  if (!id || !label || !image || !attribution) {
    return null;
  }

  return {
    id,
    label,
    vocalization: normalizeString(value.vocalization) || label,
    image,
    backgroundColor: normalizeString(value.backgroundColor) || '#ffffff',
    source: attribution
  };
}

export function buildRuntimeCommunicationCatalogItem(value) {
  const pictogram = normalizeRuntimePictogram(value);
  if (!pictogram) {
    return null;
  }

  const isDevicePrivate =
    pictogram.source.provider.toLocaleLowerCase() ===
    DEVICE_PRIVATE_RUNTIME_PICTOGRAM_PROVIDER;
  const boardId = isDevicePrivate
    ? 'device-private-pictograms'
    : 'runtime-pictograms';

  return {
    id: pictogram.id,
    pictogramAttribution: pictogram.source,
    tile: {
      dtoType: 'TileDTO',
      version: 1,
      id: pictogram.id,
      boardId,
      label: pictogram.label,
      vocalization: pictogram.vocalization,
      image: pictogram.image,
      backgroundColor: pictogram.backgroundColor,
      keyPath: '',
      loadBoardId: '',
      pictogramAttribution: pictogram.source,
      communication: {
        synonyms: [],
        excludeTokens: [],
        category: isDevicePrivate ? 'device-private' : 'online'
      }
    },
    boardId,
    boardName: pictogram.source.name,
    displayLabel: pictogram.label,
    labels: [pictogram.label],
    synonyms: [],
    excludeTokens: [],
    semanticDomain: null
  };
}
