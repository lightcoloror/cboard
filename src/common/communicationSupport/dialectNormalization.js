export const DIALECT_NORMALIZATION_CONTRACT_VERSION = 1;
export const MAX_DIALECT_NORMALIZATION_TEXT_LENGTH = 120;
export const MAX_DIALECT_NORMALIZATION_VOCABULARY = 200;
export const COMMUNICATION_DIALECTS = Object.freeze({
  cantonese: Object.freeze({
    id: 'cantonese',
    label: '粤语',
    browserLanguage: 'yue-HK'
  })
});

const CANTONESE_LOCAL_REPLACEMENTS = Object.freeze([
  ['唔舒服', '不舒服'],
  ['唔明白', '不明白'],
  ['唔使', '不用'],
  ['唔好', '不要'],
  ['冇办法', '没有办法'],
  ['冇辦法', '没有办法'],
  ['睇医生', '看医生'],
  ['睇醫生', '看医生'],
  ['食饭', '吃饭'],
  ['食飯', '吃饭'],
  ['食药', '吃药'],
  ['食藥', '吃药'],
  ['饮水', '喝水'],
  ['飲水', '喝水'],
  ['好攰', '很累'],
  ['肚痛', '肚子疼'],
  ['头痛', '头疼'],
  ['頭痛', '头疼'],
  ['唔', '不'],
  ['冇', '没有']
]);

export function normalizeCommunicationDialect(value) {
  const dialect = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(COMMUNICATION_DIALECTS, dialect)
    ? dialect
    : null;
}

export function normalizeDialectText(value) {
  return String(value || '')
    .split('\u0000')
    .join('')
    .split(/\r?\n/)
    .map(line => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(' ')
    .slice(0, MAX_DIALECT_NORMALIZATION_TEXT_LENGTH);
}

function normalizeVocabulary(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map(value =>
      String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 24)
    )
    .filter(value => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, MAX_DIALECT_NORMALIZATION_VOCABULARY);
}

export function buildLocalDialectNormalization(text, dialect = 'cantonese') {
  const sourceText = normalizeDialectText(text);
  const normalizedDialect = normalizeCommunicationDialect(dialect);
  if (!sourceText || !normalizedDialect) return null;

  let normalizedText = sourceText;
  if (normalizedDialect === 'cantonese') {
    CANTONESE_LOCAL_REPLACEMENTS.forEach(([source, target]) => {
      normalizedText = normalizedText.split(source).join(target);
    });
  }

  return {
    sourceText,
    normalizedText,
    dialect: normalizedDialect,
    provider: 'local-dialect-lexicon',
    sourceStored: false,
    changed: normalizedText !== sourceText
  };
}

export function buildDialectNormalizationRequest({
  text,
  dialect = 'cantonese',
  pictogramVocabulary
} = {}) {
  return {
    contractVersion: DIALECT_NORMALIZATION_CONTRACT_VERSION,
    text: normalizeDialectText(text),
    dialect: normalizeCommunicationDialect(dialect),
    pictogramVocabulary: normalizeVocabulary(pictogramVocabulary)
  };
}

export function normalizeDialectNormalizationResponse(value, expected = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const sourceText = normalizeDialectText(value.sourceText);
  const normalizedText = normalizeDialectText(value.normalizedText);
  const dialect = normalizeCommunicationDialect(value.dialect);
  const expectedSourceText = normalizeDialectText(expected.sourceText);
  const expectedDialect = normalizeCommunicationDialect(expected.dialect);

  if (
    !sourceText ||
    !normalizedText ||
    !dialect ||
    value.sourceStored !== false ||
    (expectedSourceText && sourceText !== expectedSourceText) ||
    (expectedDialect && dialect !== expectedDialect)
  ) {
    return null;
  }

  return {
    sourceText,
    normalizedText,
    dialect,
    provider: String(value.provider || 'cboard-api-ai'),
    sourceStored: false,
    changed: normalizedText !== sourceText
  };
}
