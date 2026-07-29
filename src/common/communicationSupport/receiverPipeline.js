import {
  buildCommunicationTileCatalog,
  createCommunicationOutputFromMatches,
  matchTextToCommunicationTiles
} from './symbolMatching';
import {
  applyMissingTokenResolutions,
  filterMissingTokenResolutionsByCorrectionMemory
} from './missingTokens';

import {
  RECEIVER_PIPELINE_CONTRACT_VERSION,
  getReceiverMatchConfidence,
  normalizeReceiverMatchType
} from './receiverContract';
import {
  DEVICE_PRIVATE_PICTOGRAM_PROVIDER,
  getPictogramAttribution
} from './pictogramAttribution';

export {
  RECEIVER_LOW_CONFIDENCE_THRESHOLD,
  RECEIVER_PIPELINE_CONTRACT_VERSION,
  buildReceiverMatchQuality,
  getReceiverMatchConfidence,
  normalizeReceiverMatchType
} from './receiverContract';

function getReceiverItemDisplayLabel(item) {
  if (!item || !item.tile) {
    return '';
  }

  return (
    item.tile.displayLabel ||
    (item.tile.tile && (item.tile.tile.label || item.tile.tile.vocalization)) ||
    ''
  );
}
export function createReceiverReviewId(prefix = 'review') {
  return (
    prefix +
    '_' +
    Math.random()
      .toString(36)
      .slice(2, 10)
  );
}

export function buildReceiverReviewItems(
  matches,
  createId = createReceiverReviewId
) {
  return (matches || []).map(match => ({
    id: createId('review'),
    token: match.token,
    tile: match.tile,
    matchType: match.matchType,
    ...(match.source ? { source: match.source } : {})
  }));
}

export function buildReceiverLoopState(text, boards, options = {}) {
  const result = matchTextToCommunicationTiles(text, boards, options);
  const initialReviewItems = buildReceiverReviewItems(
    result.matches,
    options.createId
  );
  const missingTokenRecords = Array.isArray(options.missingTokenRecords)
    ? options.missingTokenRecords
    : [];
  const applicableMissingTokenRecords = filterMissingTokenResolutionsByCorrectionMemory(
    missingTokenRecords,
    options.correctionMemory
  );
  const reviewItems = missingTokenRecords.length
    ? applyMissingTokenResolutions(
        initialReviewItems,
        applicableMissingTokenRecords,
        buildCommunicationTileCatalog(boards, options.intl)
      )
    : initialReviewItems;
  const matchedCount = reviewItems.filter(item => item.tile).length;

  return {
    inputText: result.inputText,
    segmentation: result.segmentation,
    matches: result.matches,
    reviewItems,
    missingTokens: reviewItems
      .filter(item => !item.tile)
      .map(item => item.token),
    outputPreview: createCommunicationOutputFromMatches(reviewItems),
    matchRate: reviewItems.length
      ? matchedCount / reviewItems.length
      : result.matchRate
  };
}

function createPersistedCatalogItem(sequenceItem, outputItem) {
  const pictogramId = String(sequenceItem.pictogramId || '').trim();
  if (!pictogramId || !outputItem || !outputItem.image) return null;
  const pictogramAttribution =
    getPictogramAttribution(sequenceItem) ||
    getPictogramAttribution(outputItem);

  const displayLabel = String(
    outputItem.label ||
      sequenceItem.label ||
      sequenceItem.originalToken ||
      pictogramId
  ).trim();
  const tile = {
    id: pictogramId,
    label: displayLabel,
    vocalization: String(outputItem.vocalization || displayLabel).trim(),
    image: outputItem.image,
    ...(outputItem.mediaType ? { mediaType: outputItem.mediaType } : {}),
    ...(outputItem.video ? { video: outputItem.video } : {}),
    ...(pictogramAttribution ? { pictogramAttribution } : {})
  };
  if (outputItem.keyPath) tile.keyPath = outputItem.keyPath;
  if (outputItem.backgroundColor) {
    tile.backgroundColor = outputItem.backgroundColor;
  }

  return {
    id: pictogramId,
    tile,
    ...(pictogramAttribution ? { pictogramAttribution } : {}),
    boardId: '',
    boardName: '已保存图片',
    displayLabel,
    labels: [displayLabel],
    synonyms: [],
    excludeTokens: [],
    semanticDomain: null
  };
}

export function restoreReceiverLoopState(entry, boards, options = {}) {
  if (
    !entry ||
    entry.direction !== 'receive' ||
    !Array.isArray(entry.pictogramSequence)
  ) {
    return null;
  }

  const inputText = String(entry.inputText || '').trim();
  const sequence = entry.pictogramSequence.filter(
    item => item && (item.originalToken || item.label)
  );
  if (!inputText || !sequence.length) return null;

  const catalogById = new Map(
    buildCommunicationTileCatalog(boards, options.intl).map(item => [
      item.id,
      item
    ])
  );
  const outputById = new Map(
    (Array.isArray(entry.output) ? entry.output : [])
      .filter(item => item && item.id)
      .map(item => [String(item.id), item])
  );
  const createId =
    typeof options.createId === 'function'
      ? options.createId
      : createReceiverReviewId;
  const reviewItems = sequence.map(item => {
    const pictogramId = String(item.pictogramId || '').trim();
    const tile = pictogramId
      ? catalogById.get(pictogramId) ||
        createPersistedCatalogItem(item, outputById.get(pictogramId))
      : null;

    return {
      id: createId('review'),
      token: String(item.originalToken || item.label || '').trim(),
      tile: tile || null,
      matchType: normalizeReceiverMatchType(item.matchType),
      ...(item.source ? { source: String(item.source) } : {})
    };
  });
  const outputPreview = buildReceiverOutputPreview(reviewItems);
  const matchedCount = reviewItems.filter(item => item.tile).length;

  return {
    inputText,
    segmentation: {
      segments: reviewItems.map(item => item.token).filter(Boolean),
      engine: 'persisted-receiver-record'
    },
    matches: reviewItems,
    reviewItems,
    missingTokens: reviewItems
      .filter(item => !item.tile)
      .map(item => item.token),
    outputPreview,
    matchRate: reviewItems.length ? matchedCount / reviewItems.length : 0
  };
}

export function moveReceiverReviewItem(reviewItems, itemId, offset) {
  const currentIndex = reviewItems.findIndex(item => item.id === itemId);
  const targetIndex = currentIndex + offset;

  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= reviewItems.length
  ) {
    return reviewItems;
  }

  const nextItems = reviewItems.slice();
  const currentItem = nextItems[currentIndex];
  nextItems.splice(currentIndex, 1);
  nextItems.splice(targetIndex, 0, currentItem);
  return nextItems;
}

export function deleteReceiverReviewItem(reviewItems, itemId) {
  return reviewItems.filter(item => item.id !== itemId);
}

export function insertReceiverReviewItem(
  reviewItems,
  afterItemId,
  candidate,
  { itemId = createReceiverReviewId('review') } = {}
) {
  if (!candidate || !candidate.tile) {
    return reviewItems;
  }

  const nextItems = reviewItems.slice();
  const targetIndex = nextItems.findIndex(item => item.id === afterItemId);
  const displayLabel =
    candidate.displayLabel ||
    candidate.tile.label ||
    candidate.tile.vocalization ||
    '';
  const insertedItem = {
    id: itemId,
    token: String(displayLabel).trim(),
    tile: candidate,
    matchType: 'manual',
    source: 'manual'
  };

  nextItems.splice(
    targetIndex >= 0 ? targetIndex + 1 : nextItems.length,
    0,
    insertedItem
  );
  return nextItems;
}

export function replaceReceiverReviewItem(reviewItems, itemId, candidate) {
  return reviewItems.map(item => {
    if (item.id !== itemId) {
      return item;
    }

    return {
      ...item,
      tile: candidate,
      matchType: 'manual',
      source: 'corrected'
    };
  });
}

export function buildReceiverOutputPreview(reviewItems) {
  return createCommunicationOutputFromMatches(reviewItems);
}

export function buildReceiverHistoryEntry(inputText, reviewItems) {
  const safeReviewItems = Array.isArray(reviewItems)
    ? reviewItems.filter(item => item && typeof item === 'object')
    : [];
  const outputItems = buildReceiverOutputPreview(safeReviewItems);
  const pictogramSequence = safeReviewItems.map(item => {
    const matchType = normalizeReceiverMatchType(item && item.matchType);
    const tile = item && item.tile;
    const explicitSource = String((item && item.source) || '').trim();
    const attribution = getPictogramAttribution(tile);
    const provider = String((attribution && attribution.provider) || '').trim();
    const source = !tile
      ? 'unresolved'
      : provider === DEVICE_PRIVATE_PICTOGRAM_PROVIDER
      ? 'user'
      : matchType === 'online' &&
        (provider === 'arasaac' || provider === 'opensymbols')
      ? provider
      : explicitSource || (matchType === 'online' ? 'online' : 'local_dict');

    return {
      pictogramId: tile ? tile.id : null,
      label: getReceiverItemDisplayLabel(item) || String(item.token || ''),
      source,
      boardId: (tile && tile.boardId) || '',
      matchType,
      confidence: getReceiverMatchConfidence(matchType),
      originalToken: String((item && item.token) || ''),
      ...(attribution ? { attribution } : {})
    };
  });

  return {
    contractVersion: RECEIVER_PIPELINE_CONTRACT_VERSION,
    direction: 'receive',
    inputText,
    labels: outputItems.map(item => item.label).filter(Boolean),
    output: outputItems,
    pictogramSequence
  };
}
