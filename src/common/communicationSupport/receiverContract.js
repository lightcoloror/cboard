import { getLocalPictogramCandidates } from './pictogramSemantics';

export const RECEIVER_PIPELINE_CONTRACT_VERSION = 2;
export const RECEIVER_LOW_CONFIDENCE_THRESHOLD = 0.6;

// Presentation guidance, not a comprehension score. Unknown words stay visible.
export function isReceiverPunctuation(token) {
  return /^[\s，。！？、；：,.!?;:"'…“”‘’「」『』（）()【】\[\]{}《》<>—\-]+$/u.test(String(token || ''));
}

function meaningRole(item) {
  const word = String(item.token || '');
  if (item.personalReference || (item.tile && item.tile.tile && item.tile.tile.personId)) return '人物';
  if (/要不要|是不是|能不能|有没有|还是|吗|么|[?？]/u.test(word)) return '疑问或选择';
  if (/^(不|不要|不能|没|没有|别|不是)/u.test(word)) return '否定';
  if (/^(了|过|再|已经|还|又)$/u.test(word)) return '完成、持续或重复';
  if (/^(太|很|更|最|一点|有点)$/u.test(word)) return '程度';
  if (/今|明|昨|早|晚|点|分钟|时候/u.test(word)) return '时间';
  if (/[0-9一二三四五六七八九十两半].*(个|碗|杯|次|份)|^[0-9一二三四五六七八九十两半]+$/u.test(word)) return '数量';
  if (/^(吃饭|回家|喝|吃|炒|加热|热一下|热一热|出门|洗手|刷牙)$/.test(word)) return '动作';
  if (/^(水|饭|米饭|鸡蛋|西红柿|汤|粥)$/.test(word)) return '对象';
  return '原意';
}

export function buildReceiverMeaningAssessment(inputText, reviewItems = []) {
  const items = Array.isArray(reviewItems) ? reviewItems : [];
  const meaningful = items.filter(item => !isReceiverPunctuation(item.token));
  const gaps = meaningful.filter(item => !item.tile || item.tile.textOnly || item.matchType === 'partial')
    .map(item => ({ itemId: item.id, token: item.token, role: meaningRole(item),
      reason: !item.tile ? 'missing-picture' : item.tile.textOnly ? 'text-reference' : 'partial-meaning',
      sourceSpan: item.sourceSpan || null }));
  for (const item of meaningful) {
    if (!item.tile || item.tile.textOnly || item.matchType === 'partial') continue;
    const candidate = getLocalPictogramCandidates(item.token, [item.tile])[0];
    if (candidate && candidate.relation !== 'equivalent') {
      gaps.push({ itemId: item.id, token: item.token, role: meaningRole(item),
        reason: 'candidate-partial-meaning', explanation: candidate.hint,
        sourceSpan: item.sourceSpan || null });
    }
  }
  // Deleted/resegmented rows must not silently remove meaning from the original.
  const compact = text => Array.from(String(text || '')).filter(char => !isReceiverPunctuation(char)).join('');
  if (compact(items.map(item => item.token).join('')) !== compact(inputText)) {
    gaps.push({ itemId: null, token: String(inputText || ''), role: '完整原句',
      reason: 'original-sequence-needs-review', sourceSpan: null });
  }
  // A question mark is not an image, but the question must not become a statement.
  if (/[?？]/u.test(inputText || '') && !items.some(item =>
    /要不要|是不是|能不能|有没有|还是|吗|么/u.test(item.token))) {
    gaps.push({ itemId: null, token: '原句的询问语气', role: '疑问或选择', reason: 'question-context', sourceSpan: null });
  }
  return {
    pictureCount: meaningful.filter(item => item.tile && !item.tile.textOnly).length,
    meaningfulCount: meaningful.length,
    textReferenceCount: meaningful.filter(item => item.tile && item.tile.textOnly).length,
    unresolvedMeaningItems: gaps,
    requiresAssistance: gaps.length > 0
  };
}

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
  // Keep matchedCount as output readiness for existing callers. Explicit text
  // fallback makes an item usable, but must never inflate pictogram coverage.
  const textOnlyCount = items.filter(
    item => item && item.tile && item.tile.textOnly
  ).length;
  const imageCount = matchedCount - textOnlyCount;
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
    ...buildReceiverMeaningAssessment(items.map(item => item.token || '').join(''), items),
    matchedCount,
    imageCount,
    textOnlyCount,
    missingCount,
    partialCount,
    matchRate,
    needsReview:
      totalCount > 0 &&
      (missingCount > 0 || partialCount > 0 || matchRate < safeThreshold)
  };
}
