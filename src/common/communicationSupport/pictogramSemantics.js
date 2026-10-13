import reviewedArasaac from './picinterpreterReviewedArasaac.json';

// One portable contract for API retrieval, Web and the direct WeChat adapter.
// These senses qualify existing reviewed mappings; they do not merge all
// translations of a word into synonyms or claim visual verification.
export const PICTOGRAM_SEMANTICS_VERSION = '2026-10-13.1';
const SENSES = [
  ['ability', ['可以', '能', '能够'], ['be able to'], '能力或许可，不是容器'],
  ['tin-can', ['罐头', '罐头盒'], ['tin can', 'canned food'], '罐装食品或容器'],
  ['park-place', ['公园'], ['public park'], '供休闲游览的公园'],
  ['park-action', ['停车'], ['park a car', 'parking a car'], '把车辆停下的动作'],
  ['parking-place', ['停车场'], ['parking lot', 'car park'], '停放车辆的场所'],
  ['playground', ['游乐场'], ['playground'], '供游乐活动的场所'],
  ['cold-feeling', ['冷', '寒冷'], ['feeling cold'], '温度低或感觉冷'],
  ['cold-illness', ['感冒', '感冒了'], ['common cold'], '感冒疾病'],
  ['right-direction', ['右边', '右侧'], ['right side'], '空间中的右侧'],
  ['correct', ['正确', '对的'], ['correct'], '判断为正确'],
  ['orange-fruit', ['橙子'], ['orange fruit'], '水果橙子'],
  ['orange-colour', ['橙色'], ['orange colour', 'orange color'], '橙色这种颜色'],
  ['older-brother', ['哥哥'], ['older brother', 'elder brother'], '年长的兄弟'],
  ['younger-brother', ['弟弟'], ['younger brother'], '年幼的兄弟'],
  ['paternal-grandmother', ['奶奶'], ['paternal grandmother'], '父亲的母亲'],
  ['maternal-grandmother', ['外婆', '姥姥'], ['maternal grandmother'], '母亲的母亲'],
  ['breathing-difficulty', ['呼吸困难', '呼吸不顺'], ['difficulty breathing'], '呼吸费力或不顺的症状'],
  ['breathe', ['呼吸'], ['breathe', 'breathing'], '一般呼吸动作'],
  ['go-home', ['回家'], ['go home'], '返回家中的动作'],
  ['home', ['家'], ['home'], '家这个地点'],
  ['have', ['有'], ['have'], '拥有或存在，不是肯定回答'],
  ['yes', ['是'], ['yes'], '肯定回答'],
  ['telephone', ['打电话'], ['telephone call', 'phone call'], '使用电话通话'],
  ['help', ['请帮忙', '帮忙'], ['help'], '请求或提供帮助'],
  ['eat-meal', ['吃饭'], ['eat a meal'], '进餐这一整体动作']
];
const clean = value => typeof value === 'string' ? value.trim().slice(0, 240) : '';
const key = value => clean(value).toLocaleLowerCase();
const own = (object, field) => Object.prototype.hasOwnProperty.call(object, field);
const strings = values => Array.from(new Set(
  (Array.isArray(values) ? values : []).map(clean).filter(Boolean)
)).slice(0, 24);

export function getPictogramConcept(token) {
  const normalized = key(token);
  const sense = SENSES.find(row => row[1].some(label => key(label) === normalized));
  const aliases = reviewedArasaac.aliases || {};
  const canonical = own(aliases, normalized) ? aliases[normalized] : normalized;
  const ids = own(reviewedArasaac.concepts || {}, canonical)
    ? reviewedArasaac.concepts[canonical].map(String) : [];
  if (sense) return {
    id: `aac:${sense[0]}`, label: sense[1][0], definition: sense[3],
    englishQuery: sense[2][0], reviewedArasaacIds: ids
  };
  return ids.length ? {
    id: `reviewed:${canonical}`, label: canonical, definition: '',
    englishQuery: null, reviewedArasaacIds: ids
  } : null;
}

export function getConceptEnglishQuery(token) {
  const concept = getPictogramConcept(token);
  return concept && concept.englishQuery;
}

function sourceConcepts(labels) {
  return SENSES.filter(row => labels.some(label =>
    row[1].concat(row[2]).some(term => key(term) === key(label))
  )).map(row => `aac:${row[0]}`);
}

export function buildPictogramSemantics({
  token, query = token, locale = '', provider = '', originalId = '',
  sourceLabels = [], sourceDefinitions = [], sourceCategories = []
} = {}) {
  const queryConcept = getPictogramConcept(token);
  const labels = strings(sourceLabels);
  const senses = sourceConcepts(labels);
  // This already reviewed source ID must not regain the ability sense merely
  // because a provider, import or stale cache calls the can "可以".
  if (provider === 'arasaac' && String(originalId) === '6544') {
    senses.splice(0, senses.length, 'aac:tin-can');
  }
  const conflicts = Boolean(queryConcept && senses.length &&
    !senses.includes(queryConcept.id));
  const reviewed = Boolean(!conflicts && queryConcept && provider === 'arasaac' &&
    queryConcept.reviewedArasaacIds.includes(String(originalId)));
  return {
    schemaVersion: 1,
    mappingVersion: PICTOGRAM_SEMANTICS_VERSION,
    queryText: clean(token), lookupText: clean(query), sourceLanguage: clean(locale),
    sourceLabels: labels,
    sourceDefinitions: strings(sourceDefinitions),
    sourceCategories: strings(sourceCategories),
    queryConceptId: queryConcept ? queryConcept.id : null,
    conceptId: reviewed ? queryConcept.id : senses.length === 1 ? senses[0] : null,
    relation: conflicts ? 'conflict' : reviewed ? 'reviewed' : 'unverified',
    requiresReview: !reviewed
  };
}

export function normalizePictogramSemantics(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1) return null;
  const relation = ['conflict', 'reviewed', 'unverified'].includes(value.relation)
    ? value.relation : 'unverified';
  return {
    schemaVersion: 1, mappingVersion: clean(value.mappingVersion),
    queryText: clean(value.queryText), lookupText: clean(value.lookupText),
    sourceLanguage: clean(value.sourceLanguage), sourceLabels: strings(value.sourceLabels),
    sourceDefinitions: strings(value.sourceDefinitions), sourceCategories: strings(value.sourceCategories),
    queryConceptId: clean(value.queryConceptId) || null,
    conceptId: clean(value.conceptId) || null, relation,
    requiresReview: relation !== 'reviewed' || value.requiresReview !== false
  };
}

export function buildArasaacSemanticFields(token, query, locale, id, item = {}) {
  const keywords = Array.isArray(item.keywords) ? item.keywords : [];
  const semantics = buildPictogramSemantics({
    token, query, locale, provider: 'arasaac', originalId: id,
    sourceLabels: keywords.map(entry => entry && entry.keyword),
    sourceDefinitions: keywords.map(entry => entry && entry.meaning),
    sourceCategories: item.categories
  });
  const concept = getPictogramConcept(token);
  const label = semantics.sourceLabels[0] ||
    (semantics.relation === 'reviewed' && concept ? concept.label : `图片 #${id}`);
  return { label, semantics, labels: {
    zh: locale === 'zh' ? semantics.sourceLabels : [],
    en: locale === 'en' ? semantics.sourceLabels : []
  } };
}

export function isPictogramSemanticMatchAllowed(token, value) {
  const semantics = normalizePictogramSemantics(value);
  if (!semantics || semantics.mappingVersion !== PICTOGRAM_SEMANTICS_VERSION ||
      semantics.requiresReview || semantics.relation !== 'reviewed') return false;
  const concept = getPictogramConcept(token);
  return Boolean(concept && concept.id === semantics.conceptId &&
    concept.id === semantics.queryConceptId);
}
