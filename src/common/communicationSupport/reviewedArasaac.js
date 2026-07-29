import reviewedArasaac from './picinterpreterReviewedArasaac.json';

const MAX_REVIEWED_ARASAAC_IDS = 4;

const REVIEWED_ARASAAC_SEGMENTATION_REWRITES = Object.freeze({
  杯子里的水: ['杯子', '水'],
  第一步: ['第一'],
  冰箱里的鸡汤还有一点: ['冰箱', '鸡汤', '少许'],
  太阳出来: ['太阳'],
  拿给: ['拿', '给'],
  呼吸困难: ['呼吸', '困难的'],
  用毛巾擦干: ['毛巾', '擦干'],
  换干净的尿布: ['换尿布', '干净的', '尿布'],
  用勺子: ['勺子'],
  用手机打电话: ['手机', '打电话'],
  吃药时间到了: ['时间', '药'],
  用纸巾遮住嘴: ['纸巾', '嘴'],
  或者抬肘咳嗽: ['抬肘咳嗽'],
  我叫护士: ['我', '说', '护士'],
  抬手: ['抬起', '手'],
  走一点路: ['走路', '少许'],
  坐轮椅下楼散步: ['轮椅', '电梯', '下', '散步'],
  地面有水: ['地面', '水'],
  出门前: ['出去', '之前'],
  有事告诉我: ['说', '我'],
  医生下午三点来看你: ['医生', '下午', '三点整', '来', '你'],
  听安静的音乐: ['听音乐', '安静的']
});

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
        .concat(Object.keys(REVIEWED_ARASAAC_SEGMENTATION_REWRITES))
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
  const rewrite =
    REVIEWED_ARASAAC_SEGMENTATION_REWRITES[String(token || '').trim()];

  return rewrite ? rewrite.slice() : null;
}
