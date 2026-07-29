import axios from 'axios';
import JSZip from 'jszip';
import moment from 'moment';
import { saveAs } from 'file-saver';

import {
  PICTURE_LIBRARY_ARCHIVE_MANIFEST,
  PICTURE_LIBRARY_ARCHIVE_SCOPES,
  PICTURE_LIBRARY_PROGRESS_PHASES,
  createPictureLibraryArchivePlan,
  createPictureLibraryProgress,
  normalizePictureLibraryArchiveManifest,
  restorePictureLibraryArchive,
  updatePictureLibraryArchiveAssetMetadata
} from '../../../common/communicationSupport/pictureLibraryArchive';
import {
  LOCAL_DEVICE_DATA_CATEGORIES,
  LOCAL_DEVICE_DATA_EXPRESSIONS,
  LOCAL_DEVICE_DATA_MANIFEST,
  LOCAL_DEVICE_DATA_PICTOGRAMS,
  LOCAL_DEVICE_DATA_PURPOSES,
  buildLocalDeviceDataFiles,
  mergeLocalDeviceDataRestore,
  normalizeLocalDeviceDataArchiveFiles
} from '../../../common/communicationSupport/localDeviceData';
import {
  loadAllPersonalImagePreferences,
  loadCommunicationHistory,
  loadCommunicationSavedPhrases,
  loadCommunicationSavedPhraseTombstones,
  loadExpressionCandidateFeedbackDrafts,
  loadMissingTokens,
  loadPersonalImageRuntime,
  loadPictogramOrdering,
  loadReceiverCorrections,
  loadReceiverRecords,
  overwriteCommunicationHistory,
  overwriteCommunicationSavedPhrases,
  overwriteCommunicationSavedPhraseTombstones,
  overwriteExpressionCandidateFeedbackDrafts,
  overwriteMissingTokens,
  overwritePersonalImagePreferences,
  overwriteReceiverCorrections,
  overwriteReceiverRecords,
  savePictogramOrdering
} from '../../../common/communicationSupport/localData';
import { CBOARD_ZIP_OPTIONS } from './Export.constants';

export const PICTURE_LIBRARY_ARCHIVE_NOT_FOUND =
  'PICTURE_LIBRARY_ARCHIVE_NOT_FOUND';

const MAX_PICTURE_LIBRARY_IMAGE_SIZE = 2 * 1024 * 1024;
const MAX_PICTURE_LIBRARY_SOUND_SIZE = 5 * 1024 * 1024;
const MAX_PICTURE_LIBRARY_TOTAL_SOUND_SIZE = 20 * 1024 * 1024;
const MAX_PICTURE_LIBRARY_VIDEO_SIZE = 8 * 1024 * 1024;
const MAX_PICTURE_LIBRARY_TOTAL_VIDEO_SIZE = 40 * 1024 * 1024;

function reportProgress(onProgress, phase, completed, total, detail) {
  if (typeof onProgress === 'function') {
    onProgress(createPictureLibraryProgress(phase, completed, total, detail));
  }
}

function inferMediaType(source, mediaKind = 'image') {
  const normalized = String(source || '').toLocaleLowerCase();
  const dataMatch = normalized.match(/^data:([^;,]+)[;,]/);
  if (dataMatch) return dataMatch[1];
  if (mediaKind === 'video') {
    if (normalized.includes('.webm')) return 'video/webm';
    return 'video/mp4';
  }
  if (mediaKind === 'sound') {
    if (normalized.includes('.aac')) return 'audio/aac';
    if (normalized.includes('.m4a') || normalized.includes('.mp4')) {
      return 'audio/mp4';
    }
    if (normalized.includes('.ogg')) return 'audio/ogg';
    if (normalized.includes('.wav')) return 'audio/wav';
    if (normalized.includes('.webm')) return 'audio/webm';
    return 'audio/mpeg';
  }
  if (normalized.includes('.svg')) return 'image/svg+xml';
  if (normalized.includes('.jpg') || normalized.includes('.jpeg')) {
    return 'image/jpeg';
  }
  if (normalized.includes('.gif')) return 'image/gif';
  if (normalized.includes('.webp')) return 'image/webp';
  return 'image/png';
}

function decodeBase64(value) {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(offset, offset + chunkSize)
    );
  }
  return btoa(binary);
}

function mediaKindFromPath(path) {
  if (path.startsWith('sounds/')) return 'sound';
  if (path.startsWith('videos/')) return 'video';
  return 'image';
}

function validateMediaSize(mediaKind, size, totals) {
  const maxSize =
    mediaKind === 'sound'
      ? MAX_PICTURE_LIBRARY_SOUND_SIZE
      : mediaKind === 'video'
      ? MAX_PICTURE_LIBRARY_VIDEO_SIZE
      : MAX_PICTURE_LIBRARY_IMAGE_SIZE;
  if (!Number.isFinite(size) || size <= 0 || size > maxSize) {
    throw new TypeError(`Unsupported or oversized ${mediaKind} asset`);
  }
  if (mediaKind === 'sound') {
    totals.sound += size;
    if (totals.sound > MAX_PICTURE_LIBRARY_TOTAL_SOUND_SIZE) {
      throw new TypeError('Tile recordings exceed the picture library limit');
    }
  } else if (mediaKind === 'video') {
    totals.video += size;
    if (totals.video > MAX_PICTURE_LIBRARY_TOTAL_VIDEO_SIZE) {
      throw new TypeError('Tile videos exceed the picture library limit');
    }
  }
}

function decodeDataUri(source) {
  const match = String(source || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  const mediaType = match[1] || 'application/octet-stream';
  const bytes = match[2]
    ? decodeBase64(match[3])
    : Uint8Array.from(decodeURIComponent(match[3]), character =>
        character.charCodeAt(0)
      );
  return {
    data: bytes,
    mediaType,
    size: bytes.byteLength
  };
}

export async function readBrowserPictureLibraryImage(
  source,
  mediaKind = 'image'
) {
  const dataUri = decodeDataUri(source);
  if (dataUri) return dataUri;

  const response = await axios({
    method: 'get',
    url: source,
    responseType: 'arraybuffer'
  });
  const data = response.data;
  const size = data && Number.isFinite(data.byteLength) ? data.byteLength : 0;
  if (!data || !size) {
    throw new TypeError('Picture library image is empty');
  }
  return {
    data,
    mediaType:
      (response.headers && response.headers['content-type']) ||
      inferMediaType(source, mediaKind),
    size
  };
}

function readFileAsArrayBuffer(file) {
  if (file && typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

async function readRequiredZipText(zip, fileName) {
  const file = zip.file(fileName);
  if (!file) {
    throw new TypeError(`Local device data archive is missing: ${fileName}`);
  }
  return file.async('text');
}

export async function buildPictureLibraryArchive({
  boards = [],
  scope = PICTURE_LIBRARY_ARCHIVE_SCOPES.custom,
  personalImagePreferences,
  missingTokens,
  orderingState,
  sourcePlatform = 'cboard-web',
  createdAt = Date.now(),
  readImage = readBrowserPictureLibraryImage,
  deviceData = null,
  onProgress,
  zipType = 'blob'
} = {}) {
  const personalRuntime =
    personalImagePreferences === undefined ? loadPersonalImageRuntime() : null;
  const plan = createPictureLibraryArchivePlan({
    scope,
    boards,
    personalImagePreferences:
      personalImagePreferences === undefined
        ? personalRuntime.preferences
        : personalImagePreferences,
    missingTokens:
      missingTokens === undefined ? loadMissingTokens() : missingTokens,
    orderingState:
      orderingState === undefined ? loadPictogramOrdering() : orderingState,
    sourcePlatform,
    createdAt
  });
  const zip = new JSZip();
  const assetMetadata = [];
  const total = plan.assets.length;
  const mediaTotals = { sound: 0, video: 0 };

  for (let index = 0; index < plan.assets.length; index += 1) {
    const asset = plan.assets[index];
    reportProgress(
      onProgress,
      PICTURE_LIBRARY_PROGRESS_PHASES.collecting,
      index,
      total,
      `正在读取媒体 ${index + 1}/${total}`
    );
    const media = await readImage(asset.source, asset.mediaKind);
    if (
      !media ||
      !media.data ||
      !Number.isFinite(media.size) ||
      media.size <= 0
    ) {
      throw new TypeError(
        `Picture library media could not be read: ${asset.path}`
      );
    }
    const actualSize = Number.isFinite(media.data.byteLength)
      ? media.data.byteLength
      : media.data.size;
    if (actualSize !== media.size) {
      throw new TypeError(
        `Picture library media size does not match: ${asset.path}`
      );
    }
    validateMediaSize(asset.mediaKind, actualSize, mediaTotals);
    zip.file(asset.path, media.data);
    assetMetadata.push({
      path: asset.path,
      mediaType:
        media.mediaType || inferMediaType(asset.source, asset.mediaKind),
      size: media.size
    });
    reportProgress(
      onProgress,
      PICTURE_LIBRARY_PROGRESS_PHASES.collecting,
      index + 1,
      total,
      `已读取媒体 ${index + 1}/${total}`
    );
  }

  const manifest = updatePictureLibraryArchiveAssetMetadata(
    plan.manifest,
    assetMetadata
  );
  zip.file(PICTURE_LIBRARY_ARCHIVE_MANIFEST, JSON.stringify(manifest, null, 2));
  let deviceDataManifest = null;
  if (deviceData) {
    const localDeviceData = buildLocalDeviceDataFiles({
      libraryManifest: manifest,
      ...deviceData,
      sourcePlatform: deviceData.sourcePlatform || sourcePlatform,
      createdAt:
        deviceData.createdAt === undefined ? createdAt : deviceData.createdAt
    });
    Object.keys(localDeviceData.files).forEach(fileName => {
      zip.file(
        fileName,
        JSON.stringify(localDeviceData.files[fileName], null, 2)
      );
    });
    deviceDataManifest = localDeviceData.manifest;
  }
  reportProgress(
    onProgress,
    PICTURE_LIBRARY_PROGRESS_PHASES.compressing,
    0,
    100,
    '正在压缩图库'
  );
  const content = await zip.generateAsync(
    {
      ...CBOARD_ZIP_OPTIONS,
      type: zipType
    },
    metadata => {
      reportProgress(
        onProgress,
        PICTURE_LIBRARY_PROGRESS_PHASES.compressing,
        Math.round(metadata.percent),
        100,
        `正在压缩 ${Math.round(metadata.percent)}%`
      );
    }
  );
  reportProgress(
    onProgress,
    PICTURE_LIBRARY_PROGRESS_PHASES.complete,
    1,
    1,
    '图库备份已生成'
  );

  return { content, manifest, deviceDataManifest };
}

function currentLocalDeviceData(createdAt) {
  return {
    savedPhrases: loadCommunicationSavedPhrases(),
    savedPhraseTombstones: loadCommunicationSavedPhraseTombstones(),
    history: loadCommunicationHistory(),
    receiverRecords: loadReceiverRecords(),
    receiverCorrections: loadReceiverCorrections(),
    expressionCandidateFeedbackDrafts: loadExpressionCandidateFeedbackDrafts(),
    sourcePlatform: 'cboard-web',
    createdAt
  };
}

export async function buildPrivateDeviceDataArchive({
  onProgress,
  createdAt = Date.now(),
  zipType = 'blob'
} = {}) {
  return buildPictureLibraryArchive({
    boards: [],
    scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.custom,
    personalImagePreferences: loadAllPersonalImagePreferences(),
    missingTokens: loadMissingTokens(),
    orderingState: loadPictogramOrdering(),
    sourcePlatform: 'cboard-web',
    createdAt,
    deviceData: {
      ...currentLocalDeviceData(createdAt),
      purpose: LOCAL_DEVICE_DATA_PURPOSES.accountPrivateSnapshot
    },
    onProgress,
    zipType
  });
}

export async function pictureLibraryExportAdapter({
  boards,
  scope,
  onProgress
}) {
  const { content, manifest } = await buildPictureLibraryArchive({
    boards,
    scope,
    onProgress
  });
  const scopeName =
    manifest.scope === PICTURE_LIBRARY_ARCHIVE_SCOPES.full ? 'full' : 'custom';
  const fileName =
    `${moment().format('YYYY-MM-DD_HH-mm-ss')}-` +
    `picinterpreter-picture-library-${scopeName}.zip`;
  saveAs(content, fileName);
  return manifest.stats;
}

export async function localDeviceDataExportAdapter({ boards, onProgress }) {
  const createdAt = Date.now();
  const { content, deviceDataManifest } = await buildPictureLibraryArchive({
    boards,
    scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
    personalImagePreferences: loadAllPersonalImagePreferences(),
    missingTokens: loadMissingTokens(),
    orderingState: loadPictogramOrdering(),
    sourcePlatform: 'cboard-web',
    createdAt,
    deviceData: currentLocalDeviceData(createdAt),
    onProgress
  });
  const fileName =
    `${moment().format('YYYY-MM-DD_HH-mm-ss')}-` +
    'picinterpreter-local-device-data.zip';
  saveAs(content, fileName);
  return deviceDataManifest && deviceDataManifest.stats;
}

export async function readPictureLibraryArchive({
  file,
  existingBoards = [],
  existingPersonalImagePreferences,
  existingMissingTokens,
  existingOrderingState,
  existingLocalDeviceData,
  identity,
  conflictStrategy,
  onProgress
} = {}) {
  const binary = await readFileAsArrayBuffer(file);
  const zip = await JSZip.loadAsync(binary);
  const manifestFile = zip.file(PICTURE_LIBRARY_ARCHIVE_MANIFEST);
  if (!manifestFile) {
    const error = new TypeError(
      'ZIP does not contain a picture library manifest'
    );
    error.code = PICTURE_LIBRARY_ARCHIVE_NOT_FOUND;
    throw error;
  }
  const manifest = normalizePictureLibraryArchiveManifest(
    JSON.parse(await manifestFile.async('text'))
  );
  const deviceDataManifestFile = zip.file(LOCAL_DEVICE_DATA_MANIFEST);
  const localDeviceDataArchive = deviceDataManifestFile
    ? normalizeLocalDeviceDataArchiveFiles({
        manifest: JSON.parse(await deviceDataManifestFile.async('text')),
        pictograms: JSON.parse(
          await readRequiredZipText(zip, LOCAL_DEVICE_DATA_PICTOGRAMS)
        ),
        categories: JSON.parse(
          await readRequiredZipText(zip, LOCAL_DEVICE_DATA_CATEGORIES)
        ),
        expressions: JSON.parse(
          await readRequiredZipText(zip, LOCAL_DEVICE_DATA_EXPRESSIONS)
        ),
        libraryManifest: manifest
      })
    : null;
  const assetLocations = {};
  const total = manifest.assets.length;
  const mediaTotals = { sound: 0, video: 0 };

  for (let index = 0; index < manifest.assets.length; index += 1) {
    const asset = manifest.assets[index];
    const archiveFile = zip.file(asset.path);
    if (!archiveFile) {
      throw new TypeError(`Picture library archive is missing: ${asset.path}`);
    }
    reportProgress(
      onProgress,
      PICTURE_LIBRARY_PROGRESS_PHASES.reading,
      index,
      total,
      `正在校验媒体 ${index + 1}/${total}`
    );
    const bytes = await archiveFile.async('uint8array');
    if (!bytes.byteLength) {
      throw new TypeError(
        `Picture library archive media is empty: ${asset.path}`
      );
    }
    if (asset.size && asset.size !== bytes.byteLength) {
      throw new TypeError(
        `Picture library archive media size does not match: ${asset.path}`
      );
    }
    const mediaKind = mediaKindFromPath(asset.path);
    validateMediaSize(mediaKind, bytes.byteLength, mediaTotals);
    assetLocations[asset.path] =
      `data:${asset.mediaType ||
        inferMediaType(asset.path, mediaKind)};base64,` + encodeBase64(bytes);
    reportProgress(
      onProgress,
      PICTURE_LIBRARY_PROGRESS_PHASES.reading,
      index + 1,
      total,
      `已校验媒体 ${index + 1}/${total}`
    );
  }

  const personalRuntime =
    existingPersonalImagePreferences === undefined || !identity
      ? loadPersonalImageRuntime()
      : null;
  reportProgress(
    onProgress,
    PICTURE_LIBRARY_PROGRESS_PHASES.restoring,
    0,
    1,
    '正在合并图库'
  );
  const restored = restorePictureLibraryArchive({
    manifest,
    assetLocations,
    existingBoards,
    existingPersonalImagePreferences:
      existingPersonalImagePreferences === undefined
        ? personalRuntime.preferences
        : existingPersonalImagePreferences,
    existingMissingTokens:
      existingMissingTokens === undefined
        ? loadMissingTokens()
        : existingMissingTokens,
    existingOrderingState:
      existingOrderingState === undefined
        ? loadPictogramOrdering()
        : existingOrderingState,
    identity: identity || personalRuntime.identity,
    conflictStrategy
  });
  const restoredLocalDeviceData = localDeviceDataArchive
    ? mergeLocalDeviceDataRestore({
        current:
          existingLocalDeviceData === undefined
            ? {
                savedPhrases: loadCommunicationSavedPhrases(),
                savedPhraseTombstones: loadCommunicationSavedPhraseTombstones(),
                history: loadCommunicationHistory(),
                receiverRecords: loadReceiverRecords(),
                receiverCorrections: loadReceiverCorrections(),
                expressionCandidateFeedbackDrafts: loadExpressionCandidateFeedbackDrafts()
              }
            : existingLocalDeviceData,
        imported: localDeviceDataArchive,
        identity: identity || personalRuntime.identity,
        conflictStrategy
      })
    : null;
  reportProgress(
    onProgress,
    PICTURE_LIBRARY_PROGRESS_PHASES.complete,
    1,
    1,
    '图库校验和合并完成'
  );
  return restoredLocalDeviceData
    ? {
        ...restored,
        localDeviceData: restoredLocalDeviceData,
        summary: {
          ...restored.summary,
          deviceDataStats: localDeviceDataArchive.manifest.stats
        }
      }
    : restored;
}

export function persistPictureLibraryRestore(restored) {
  overwritePersonalImagePreferences(restored.personalImagePreferences);
  overwriteMissingTokens(restored.missingTokens);
  savePictogramOrdering(restored.orderingState);
  if (restored.localDeviceData) {
    overwriteCommunicationSavedPhraseTombstones(
      restored.localDeviceData.savedPhraseTombstones
    );
    overwriteCommunicationSavedPhrases(restored.localDeviceData.savedPhrases);
    overwriteCommunicationHistory(restored.localDeviceData.history);
    overwriteReceiverRecords(restored.localDeviceData.receiverRecords);
    overwriteReceiverCorrections(restored.localDeviceData.receiverCorrections);
    overwriteExpressionCandidateFeedbackDrafts(
      restored.localDeviceData.expressionCandidateFeedbackDrafts
    );
  }
  return restored.summary;
}
