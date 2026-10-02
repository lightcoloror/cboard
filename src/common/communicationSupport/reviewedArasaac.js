import reviewedArasaac from './picinterpreterReviewedArasaac.json';

const MAX_REVIEWED_ARASAAC_IDS = 4;

// Source boundaries replace the historical picture-sequence rewrites. These
// slices must reconstruct the phrase exactly; lookups never replace the source.
const SOURCE_PHRASE_SEGMENTS = Object.freeze({
  杯子里的水: ['杯子', '里', '的', '水'],
  第一步: ['第一', '步'],
  冰箱里的鸡汤还有一点: ['冰箱', '里', '的', '鸡汤', '还有', '一点'],
  太阳出来: ['太阳', '出来'],
  拿给: ['拿', '给'],
  呼吸困难: ['呼吸', '困难'],
  用毛巾擦干: ['用', '毛巾', '擦干'],
  换干净的尿布: ['换', '干净', '的', '尿布'],
  用勺子: ['用', '勺子'],
  用手机打电话: ['用', '手机', '打电话'],
  吃药时间到了: ['吃药', '时间', '到', '了'],
  用纸巾遮住嘴: ['用', '纸巾', '遮住', '嘴'],
  或者抬肘咳嗽: ['或者', '抬肘咳嗽'],
  我叫护士: ['我', '叫', '护士'],
  抬手: ['抬', '手'],
  走一点路: ['走', '一点', '路'],
  坐轮椅下楼散步: ['坐', '轮椅', '下楼', '散步'],
  地面有水: ['地面', '有', '水'],
  出门前: ['出门', '前'],
  有事告诉我: ['有事', '告诉', '我'],
  医生下午三点来看你: ['医生', '下午', '三点', '来', '看', '你'],
  听安静的音乐: ['听', '安静', '的', '音乐']
});

const SOURCE_LOOKUP_ALIASES = Object.freeze({
  家里人: '家人',
  三点: '三点整',
  困难: '困难的',
  干净: '干净的',
  一点: '少许',
  出门: '出去',
  安静: '安静的'
});

export function getReviewedSourceSegments(token) {
  if (!Object.prototype.hasOwnProperty.call(SOURCE_PHRASE_SEGMENTS, token))
    return null;
  const slices = SOURCE_PHRASE_SEGMENTS[token];
  return slices && slices.join('') === token ? slices.slice() : null;
}

export function getReviewedLookupToken(token) {
  const aliases = (reviewedArasaac && reviewedArasaac.aliases) || {};
  return (
    (Object.prototype.hasOwnProperty.call(SOURCE_LOOKUP_ALIASES, token) &&
      SOURCE_LOOKUP_ALIASES[token]) ||
    (Object.prototype.hasOwnProperty.call(aliases, token)
      ? aliases[token]
      : token)
  );
}

export function getReviewedArasaacIds(token) {
  const normalizedToken = String(token || '').trim();
  const aliases = reviewedArasaac && reviewedArasaac.aliases;
  const concept =
    (aliases &&
      Object.prototype.hasOwnProperty.call(aliases, normalizedToken) &&
      aliases[normalizedToken]) ||
    normalizedToken;
  const concepts = reviewedArasaac && reviewedArasaac.concepts;

  if (
    !concept ||
    !concepts ||
    !Object.prototype.hasOwnProperty.call(concepts, concept)
  ) {
    return [];
  }

  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(concepts[concept])
    ? concepts[concept]
    : []) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= MAX_REVIEWED_ARASAAC_IDS) break;
  }
  return result;
}

export function getReviewedArasaacIndexSummary() {
  return {
    schemaVersion: reviewedArasaac.schemaVersion,
    sourceSha256: reviewedArasaac.sourceSha256,
    caseCount: reviewedArasaac.caseCount,
    conceptCount: Object.keys(reviewedArasaac.concepts || {}).length,
    aliasCount: Object.keys(reviewedArasaac.aliases || {}).length
  };
}

export function getReviewedArasaacSegmentationTerms() {
  return Array.from(
    new Set(
      Object.keys(reviewedArasaac.concepts || {})
        .concat(Object.keys(reviewedArasaac.aliases || {}))
        .concat(Object.keys(SOURCE_PHRASE_SEGMENTS))
    )
  )
    .filter(term => term.length > 1)
    .sort((left, right) => {
      if (left.length !== right.length) {
        return right.length - left.length;
      }
      return left.localeCompare(right, 'zh-CN');
    });
}

export function getReviewedArasaacSegmentationRewrite(token) {
  // Keep the old export callable, with the same source-preserving contract.
  return getReviewedSourceSegments(String(token || ''));
}
