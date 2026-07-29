export const RECEIVER_PIPELINE_CONTRACT_VERSION = 2;
export const RECEIVER_LOW_CONFIDENCE_THRESHOLD = 0.6;

const RECEIVER_MATCH_CONFIDENCE = {
  exact: 1,
  synonym: 0.9,
  lexicon: 0.8,
  partial: 0.6,
  online: 0.75,
  ai: 0.65,
  manual: 1,
  missing: 0
};

export function normalizeReceiverMatchType(matchType) {
  if (matchType === 'lexicon-synonym') {
    return 'lexicon';
  }

  if (!matchType || matchType === 'none') {
    return 'missing';
  }

  return Object.prototype.hasOwnProperty.call(
    RECEIVER_MATCH_CONFIDENCE,
    matchType
  )
    ? matchType
    : 'missing';
}

export function getReceiverMatchConfidence(matchType) {
  return RECEIVER_MATCH_CONFIDENCE[normalizeReceiverMatchType(matchType)];
}

export function buildReceiverMatchQuality(
  reviewItems,
  threshold = RECEIVER_LOW_CONFIDENCE_THRESHOLD
) {
  const items = Array.isArray(reviewItems) ? reviewItems : [];
  const totalCount = items.length;
  const matchedCount = items.filter(item => item && item.tile).length;
  const missingCount = totalCount - matchedCount;
  const partialCount = items.filter(
    item => normalizeReceiverMatchType(item && item.matchType) === 'partial'
  ).length;
  const matchRate = totalCount ? matchedCount / totalCount : 0;
  const safeThreshold =
    typeof threshold === 'number' && Number.isFinite(threshold)
      ? threshold
      : RECEIVER_LOW_CONFIDENCE_THRESHOLD;

  return {
    totalCount,
    matchedCount,
    missingCount,
    partialCount,
    matchRate,
    needsReview:
      totalCount > 0 &&
      (missingCount > 0 || partialCount > 0 || matchRate < safeThreshold)
  };
}
