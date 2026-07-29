import { getCboardCommunicationConceptProfile } from './cboardConceptProfiles';
import { findChineseCommunicationEntry } from './chineseLexicon';
import {
  resolveCommunicationBoardName,
  resolveCommunicationTileLabel
} from './resolvers';
import { segmentChineseCommunicationText } from './segmentation';
import { getCommunicationTileMetadata } from './tileMetadata';
import { applyWorkspaceCorrectionMemory } from './correctionMemory';
import { getPictogramAttribution } from './pictogramAttribution';

const NEGATION_PREFIXES = ['不', '没', '别', '勿', '莫', '未'];
const MATCH_STAGE_GAP = 100;
const DOMAIN_MATCH_BONUS = 40;

const MATCH_STAGE_SCORE = {
  exact: MATCH_STAGE_GAP * 4,
  synonym: MATCH_STAGE_GAP * 3,
  'lexicon-synonym': MATCH_STAGE_GAP * 2,
  partial: MATCH_STAGE_GAP
};

function parseHintList(value) {
  if (!value) return [];
  return String(value)
    .split(/[,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (values || []).map(value => String(value || '').trim()).filter(Boolean)
    )
  );
}

function inferSemanticDomain(board, boardName) {
  const normalizedText = [boardName, board && board.id, board && board.nameKey]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/emotion|feeling|happy|sad|angry/.test(normalizedText)) {
    return 'emotions';
  }

  if (/food|drink|snack|eat|bread|kitchen/.test(normalizedText)) {
    return 'food';
  }

  if (/body|hygiene|doctor|medical|pain|toilet/.test(normalizedText)) {
    return 'medical';
  }

  if (/people|family|teacher|friend/.test(normalizedText)) {
    return 'people';
  }

  if (/place|school|transport|weather|time|position/.test(normalizedText)) {
    return 'places';
  }

  if (
    /action|activity|sport|question|quick chat|quickchat/.test(normalizedText)
  ) {
    return 'actions';
  }

  if (/clothing|furniture|technology|toy|animal|plant/.test(normalizedText)) {
    return 'objects';
  }

  return null;
}

function normalizeTile(tile, board, intl) {
  const resolvedLabel = resolveCommunicationTileLabel(tile, intl);
  const resolvedBoardName = resolveCommunicationBoardName(board, intl);
  const tileMetadata = getCommunicationTileMetadata(tile);
  const boardMetadata = getCommunicationTileMetadata(board);
  const conceptProfile = tile.label
    ? null
    : getCboardCommunicationConceptProfile(tile.labelKey);
  const displayLabel = conceptProfile
    ? conceptProfile.label
    : resolvedLabel || tile.label || tile.vocalization;
  const labels = uniqueStrings(
    conceptProfile
      ? [conceptProfile.label, resolvedLabel, tile.label, tile.vocalization]
      : [resolvedLabel, tile.label, tile.vocalization]
  );
  const synonyms = uniqueStrings([
    ...parseHintList(tileMetadata.synonyms),
    ...((conceptProfile && conceptProfile.synonyms) || [])
  ]);
  const excludeTokens = uniqueStrings([
    ...parseHintList(tileMetadata.excludeTokens),
    ...((conceptProfile && conceptProfile.excludeTokens) || [])
  ]);

  return {
    id: tile.id,
    tile,
    boardId: board.id,
    boardName: resolvedBoardName,
    displayLabel,
    labels,
    synonyms,
    excludeTokens,
    semanticDomain:
      (conceptProfile && conceptProfile.category) ||
      tileMetadata.category ||
      boardMetadata.category ||
      inferSemanticDomain(board, resolvedBoardName)
  };
}

export function buildCommunicationTileCatalog(boards, intl) {
  const seen = new Set();
  const catalog = [];

  (boards || []).forEach(board => {
    (board.tiles || []).forEach(tile => {
      if (
        !tile ||
        !tile.id ||
        tile.loadBoard ||
        tile.loadBoardId ||
        seen.has(tile.id)
      ) {
        return;
      }

      const normalized = normalizeTile(tile, board, intl);
      if (!normalized.labels.length) {
        return;
      }

      seen.add(tile.id);
      catalog.push(normalized);
    });
  });

  return catalog;
}

function buildExclusionTerms(token, candidate, lexiconEntry) {
  return [token, candidate.matchedKey, lexiconEntry && lexiconEntry.zh].filter(
    Boolean
  );
}

function scoreCandidate(token, candidate, lexiconEntry) {
  const base = MATCH_STAGE_SCORE[candidate.matchType];
  const excludedTokens = new Set(candidate.tile.excludeTokens || []);
  const exclusionTerms = buildExclusionTerms(token, candidate, lexiconEntry);

  for (let index = 0; index < exclusionTerms.length; index += 1) {
    if (excludedTokens.has(exclusionTerms[index])) {
      return Number.NEGATIVE_INFINITY;
    }
  }

  let score = base;

  if (candidate.matchType === 'partial') {
    score += candidate.matchedLabelLength || 0;
  }

  if (
    lexiconEntry &&
    lexiconEntry.category &&
    candidate.tile.semanticDomain === lexiconEntry.category
  ) {
    score += DOMAIN_MATCH_BONUS;
  }

  return score;
}

function pickBestCandidate(token, candidates, lexiconEntry) {
  let bestCandidate = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  candidates.forEach(candidate => {
    const score = scoreCandidate(token, candidate, lexiconEntry);
    if (score > bestScore) {
      bestCandidate = candidate;
      bestScore = score;
    }
  });

  return bestScore === Number.NEGATIVE_INFINITY ? null : bestCandidate;
}

function mapCandidates(items, matchType, matchedKey, matchedLabelLength) {
  return items.map(item => ({
    tile: item,
    matchType,
    matchedKey,
    matchedLabelLength
  }));
}

function normalizeSegments(segments) {
  const normalized = [];

  for (let index = 0; index < segments.length; index += 1) {
    const token = segments[index];
    const nextToken = segments[index + 1];
    const tailChar = token ? token[token.length - 1] : '';

    if (
      token &&
      token.length > 1 &&
      NEGATION_PREFIXES.includes(tailChar) &&
      nextToken &&
      nextToken.length >= 2
    ) {
      const headToken = token.slice(0, -1);
      if (headToken) {
        normalized.push(headToken);
      }
      normalized.push(tailChar + nextToken);
      index += 1;
      continue;
    }

    if (
      NEGATION_PREFIXES.includes(token) &&
      nextToken &&
      nextToken.length >= 2
    ) {
      normalized.push(token + nextToken);
      index += 1;
      continue;
    }

    normalized.push(token);
  }

  return normalized;
}

function mergeUnmatchedWithNextToken(matches, catalog) {
  const merged = [];

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];

    if (!current.tile && next) {
      const combinedToken = current.token + next.token;
      const lexiconEntry = findChineseCommunicationEntry(combinedToken);
      const exactCandidates = catalog.filter(item =>
        item.labels.includes(combinedToken)
      );
      const synonymCandidates = exactCandidates.length
        ? []
        : catalog.filter(item => item.synonyms.includes(combinedToken));
      const matchType = exactCandidates.length ? 'exact' : 'synonym';
      const candidate = pickBestCandidate(
        combinedToken,
        mapCandidates(
          exactCandidates.length ? exactCandidates : synonymCandidates,
          matchType,
          combinedToken
        ),
        lexiconEntry
      );

      if (candidate) {
        merged.push({
          token: combinedToken,
          tile: candidate.tile,
          matchType: candidate.matchType
        });
        index += 1;
        continue;
      }
    }

    merged.push(current);
  }

  return merged;
}

export function matchTextToCommunicationTiles(text, boards, options = {}) {
  const rawSegmentation = options.preSegmented
    ? { segments: options.preSegmented, engine: 'intl-segmenter' }
    : segmentChineseCommunicationText(text);
  const segmentation = {
    ...rawSegmentation,
    segments: normalizeSegments(rawSegmentation.segments)
  };
  const catalog = buildCommunicationTileCatalog(boards, options.intl);
  let matches = segmentation.segments.map((token, index) => {
    const previousToken = index > 0 ? segmentation.segments[index - 1] : '';
    const negatedToken = NEGATION_PREFIXES.includes(previousToken)
      ? previousToken + token
      : '';
    const lexiconEntry = findChineseCommunicationEntry(token);
    const negatedLexiconEntry = negatedToken
      ? findChineseCommunicationEntry(negatedToken)
      : null;
    let matched = null;

    if (negatedLexiconEntry) {
      const negatedCandidate = pickBestCandidate(
        negatedToken,
        mapCandidates(
          catalog.filter(item => item.labels.includes(negatedLexiconEntry.zh)),
          'lexicon-synonym',
          negatedLexiconEntry.zh
        ),
        negatedLexiconEntry
      );

      if (negatedCandidate) {
        matched = negatedCandidate;
      }
    }

    if (!matched && negatedToken) {
      return {
        token,
        tile: null,
        matchType: 'none'
      };
    }

    const exactCandidate = pickBestCandidate(
      token,
      mapCandidates(
        catalog.filter(item => item.labels.includes(token)),
        'exact',
        token
      ),
      lexiconEntry
    );

    if (exactCandidate) {
      matched = exactCandidate;
    }

    if (!matched) {
      const synonymCandidate = pickBestCandidate(
        token,
        mapCandidates(
          catalog.filter(item => item.synonyms.includes(token)),
          'synonym',
          token
        ),
        lexiconEntry
      );

      if (synonymCandidate) {
        matched = synonymCandidate;
      }
    }

    if (!matched && lexiconEntry) {
      const lexiconCandidate = pickBestCandidate(
        token,
        mapCandidates(
          catalog.filter(item => item.labels.includes(lexiconEntry.zh)),
          'lexicon-synonym',
          lexiconEntry.zh
        ),
        lexiconEntry
      );

      if (lexiconCandidate) {
        matched = lexiconCandidate;
      }
    }

    if (
      !matched &&
      token.length >= 3 &&
      !NEGATION_PREFIXES.some(prefix => token.startsWith(prefix))
    ) {
      const partialCandidates = [];

      catalog.forEach(item => {
        let bestLabel = null;
        item.labels.forEach(label => {
          if (label.length >= 2 && token.includes(label)) {
            if (!bestLabel || label.length > bestLabel.length) {
              bestLabel = label;
            }
          }
        });

        if (bestLabel) {
          partialCandidates.push({
            tile: item,
            matchType: 'partial',
            matchedKey: bestLabel,
            matchedLabelLength: bestLabel.length
          });
        }
      });

      const partialCandidate = pickBestCandidate(
        token,
        partialCandidates,
        lexiconEntry
      );

      if (partialCandidate) {
        matched = partialCandidate;
      }
    }

    return {
      token,
      tile: matched ? matched.tile : null,
      matchType: matched ? matched.matchType : 'none'
    };
  });

  if (!options.preSegmented) {
    matches = mergeUnmatchedWithNextToken(matches, catalog);
    segmentation.segments = matches.map(match => match.token);
  }

  matches = applyWorkspaceCorrectionMemory(
    matches,
    catalog,
    options.correctionMemory
  );
  const matchedCount = matches.filter(item => item.tile).length;

  return {
    inputText: text,
    segmentation,
    matches,
    matchRate: matches.length ? matchedCount / matches.length : 0
  };
}

export function createCommunicationOutputFromMatches(matches) {
  return (matches || [])
    .filter(item => item.tile)
    .map(item => {
      const displayLabel =
        item.tile.displayLabel ||
        item.tile.tile.label ||
        item.tile.tile.vocalization;
      const attribution = getPictogramAttribution(item.tile);

      return {
        id: item.tile.id,
        image: item.tile.tile.image,
        mediaType: item.tile.tile.mediaType,
        video: item.tile.tile.video,
        label: displayLabel,
        vocalization: item.tile.tile.vocalization || displayLabel,
        keyPath: item.tile.tile.keyPath,
        backgroundColor: item.tile.tile.backgroundColor,
        ...(attribution ? { attribution } : {})
      };
    });
}
