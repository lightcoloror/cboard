import {
  createCommunicationOutputFromMatches,
  matchTextToCommunicationTiles
} from './symbolMatching';

import {
  RECEIVER_PIPELINE_CONTRACT_VERSION,
  getReceiverMatchConfidence,
  normalizeReceiverMatchType
} from './receiverContract';

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
    matchType: match.matchType
  }));
}

export function buildReceiverLoopState(text, boards, options = {}) {
  const result = matchTextToCommunicationTiles(text, boards, options);
  const reviewItems = buildReceiverReviewItems(
    result.matches,
    options.createId
  );

  return {
    inputText: result.inputText,
    segmentation: result.segmentation,
    matches: result.matches,
    reviewItems,
    missingTokens: reviewItems
      .filter(item => !item.tile)
      .map(item => item.token),
    outputPreview: createCommunicationOutputFromMatches(reviewItems),
    matchRate: result.matchRate
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

export function replaceReceiverReviewItem(reviewItems, itemId, candidate) {
  return reviewItems.map(item => {
    if (item.id !== itemId) {
      return item;
    }

    return {
      ...item,
      tile: candidate,
      matchType: 'manual'
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

    return {
      pictogramId: tile ? tile.id : null,
      label: getReceiverItemDisplayLabel(item) || String(item.token || ''),
      source: tile ? 'local_dict' : 'unresolved',
      boardId: (tile && tile.boardId) || '',
      matchType,
      confidence: getReceiverMatchConfidence(matchType),
      originalToken: String((item && item.token) || '')
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
