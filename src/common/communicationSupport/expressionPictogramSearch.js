import { buildCommunicationTileCatalog } from './symbolMatching';

export const EXPRESSION_PICTOGRAM_MATCH_TYPES = Object.freeze({
  exactLabel: 'exact-label',
  exactSynonym: 'exact-synonym',
  labelPrefix: 'label-prefix',
  synonymPrefix: 'synonym-prefix',
  labelContains: 'label-contains',
  synonymContains: 'synonym-contains'
});

const DEFAULT_SEARCH_LIMIT = 24;
const MAX_SEARCH_LIMIT = 48;

const MATCH_SCORE = Object.freeze({
  [EXPRESSION_PICTOGRAM_MATCH_TYPES.exactLabel]: 600,
  [EXPRESSION_PICTOGRAM_MATCH_TYPES.exactSynonym]: 550,
  [EXPRESSION_PICTOGRAM_MATCH_TYPES.labelPrefix]: 500,
  [EXPRESSION_PICTOGRAM_MATCH_TYPES.synonymPrefix]: 450,
  [EXPRESSION_PICTOGRAM_MATCH_TYPES.labelContains]: 400,
  [EXPRESSION_PICTOGRAM_MATCH_TYPES.synonymContains]: 350
});

export function normalizeExpressionPictogramSearchQuery(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SEARCH_LIMIT;
  return Math.max(0, Math.min(MAX_SEARCH_LIMIT, Math.floor(parsed)));
}

function uniqueNormalizedTerms(values) {
  const seen = new Set();

  return (Array.isArray(values) ? values : []).flatMap(value => {
    const normalized = normalizeExpressionPictogramSearchQuery(value);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ raw: String(value).trim(), normalized }];
  });
}

function classifyTermMatch(term, query, source) {
  if (term.normalized === query) {
    return source === 'label'
      ? EXPRESSION_PICTOGRAM_MATCH_TYPES.exactLabel
      : EXPRESSION_PICTOGRAM_MATCH_TYPES.exactSynonym;
  }

  if (term.normalized.startsWith(query)) {
    return source === 'label'
      ? EXPRESSION_PICTOGRAM_MATCH_TYPES.labelPrefix
      : EXPRESSION_PICTOGRAM_MATCH_TYPES.synonymPrefix;
  }

  if (term.normalized.includes(query)) {
    return source === 'label'
      ? EXPRESSION_PICTOGRAM_MATCH_TYPES.labelContains
      : EXPRESSION_PICTOGRAM_MATCH_TYPES.synonymContains;
  }

  return null;
}

function findBestCatalogMatch(item, query) {
  const excludedTokens = new Set(
    uniqueNormalizedTerms(item.excludeTokens).map(term => term.normalized)
  );
  if (excludedTokens.has(query)) return null;

  const terms = [
    ...uniqueNormalizedTerms([
      ...(item.labels || []),
      item.displayLabel,
      item.tile && item.tile.label,
      item.tile && item.tile.vocalization
    ]).map(term => ({ ...term, source: 'label' })),
    ...uniqueNormalizedTerms(item.synonyms).map(term => ({
      ...term,
      source: 'synonym'
    }))
  ];

  return terms.reduce((best, term) => {
    const matchType = classifyTermMatch(term, query, term.source);
    if (!matchType) return best;
    const candidate = {
      matchType,
      matchedText: term.raw,
      score: MATCH_SCORE[matchType]
    };

    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score &&
        candidate.matchedText.length < best.matchedText.length)
    ) {
      return candidate;
    }

    return best;
  }, null);
}

export function searchExpressionPictograms(boards, query, options = {}) {
  const normalizedQuery = normalizeExpressionPictogramSearchQuery(query);
  const limit = normalizeLimit(options.limit);

  if (!normalizedQuery || !limit) {
    return {
      query: normalizedQuery,
      matches: []
    };
  }

  const matches = buildCommunicationTileCatalog(boards, options.intl)
    .map((item, index) => {
      const match = findBestCatalogMatch(item, normalizedQuery);
      return match ? { item, index, ...match } : null;
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.matchedText.length - right.matchedText.length ||
        left.index - right.index
    )
    .slice(0, limit)
    .map(match => ({
      tile: match.item.tile,
      boardId: match.item.boardId,
      boardName: match.item.boardName,
      matchType: match.matchType,
      matchedText: match.matchedText
    }));

  return {
    query: normalizedQuery,
    matches
  };
}
