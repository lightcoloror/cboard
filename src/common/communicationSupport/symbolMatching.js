import { getCboardCommunicationConceptProfile } from './cboardConceptProfiles';
import {
  findChineseCommunicationEntry,
  isAutomaticCommunicationCandidateAllowed
} from './chineseLexicon';
import {
  resolveCommunicationBoardName,
  resolveCommunicationTileLabel
} from './resolvers';
import {
  segmentChineseCommunicationText,
  splitCommunicationGrammarPair,
  hasHelpPossessiveContinuation,
  findCommunicationPersonSpans
} from './segmentation';
import { getCommunicationTileMetadata } from './tileMetadata';
import { applyWorkspaceCorrectionMemory } from './correctionMemory';
import {
  getPictogramAttribution,
  DEVICE_PRIVATE_PICTOGRAM_PROVIDER
} from './pictogramAttribution';
import { getReviewedLookupToken } from './reviewedArasaac';
import {
  getPersonalPersonTerms,
  resolvePersonalReference,
  applyPersonalReferenceGuard,
  isPrivatePerson
} from './personalPeople';

const NEGATION_PREFIXES = ['不', '没', '别', '勿', '莫', '未'];
// Do not let picture availability change grammatical relationships on either
// side of a boundary. Repairing character fragments remains available elsewhere.
const COMPOSITION_BOUNDARY_TERMS = new Set([
  ...NEGATION_PREFIXES,
  '没有',
  '不是',
  '不要',
  '想',
  '要',
  '有',
  '是'
]);
const MATCH_STAGE_GAP = 100;
const DOMAIN_MATCH_BONUS = 40;
const TEXT_SEPARATOR_CHARS = new Set(
  Array.from('，。？！、；：,.!?;:"\'“”‘’（）()【】[]{}《》<>…—-')
);

function isSeparatorToken(token) {
  return (
    Boolean(token) &&
    Array.from(token).every(
      char => /\s/.test(char) || TEXT_SEPARATOR_CHARS.has(char)
    )
  );
}

export function createTextCommunicationCatalogItem(token, id) {
  return {
    id,
    displayLabel: token,
    textOnly: true,
    boardId: '',
    boardName: '',
    labels: [token],
    synonyms: [],
    excludeTokens: [],
    semanticDomain: null,
    tile: { id, label: token, vocalization: token, image: '' }
  };
}

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
  // Private people are resolved above with occurrence and ambiguity checks.
  // Lexicon, synonym, partial and merge fallbacks must never bypass them.
  if (isPrivatePerson(candidate.tile)) return Number.NEGATIVE_INFINITY;
  // Old/default/user-saved board synonym fields may still contain the unsafe
  // aliases. Apply the same guard at every automatic candidate stage.
  if (
    !isAutomaticCommunicationCandidateAllowed(
      token,
      candidate.tile.displayLabel,
      candidate.tile.tile.vocalization || candidate.tile.displayLabel,
      candidate.tile.tile
    )
  ) {
    return Number.NEGATIVE_INFINITY;
  }
  const base = MATCH_STAGE_SCORE[candidate.matchType];
  const excludedTokens = new Set(candidate.tile.excludeTokens || []);
  const exclusionTerms = buildExclusionTerms(token, candidate, lexiconEntry);

  for (let index = 0; index < exclusionTerms.length; index += 1) {
    if (excludedTokens.has(exclusionTerms[index])) {
      return Number.NEGATIVE_INFINITY;
    }
  }

  let score = base;
  // Scoped boards already apply patient/workspace preferences. Within the
  // same match stage prefer their explicit personal photo over a generic
  // person card, without letting an alias outrank an exact relationship.
  const attribution =
    candidate.tile.semanticDomain === 'people'
      ? getPictogramAttribution(candidate.tile)
      : null;
  if (
    attribution &&
    attribution.provider === DEVICE_PRIVATE_PICTOGRAM_PROVIDER
  ) {
    if (token !== candidate.tile.tile.label) return Number.NEGATIVE_INFINITY;
    score += 50; // domain bonus + photo bonus stays below the 100 stage gap
  }

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
    const entry = findChineseCommunicationEntry(token);

    if (
      token &&
      token.length > 1 &&
      !(entry && entry.exactOnly) &&
      NEGATION_PREFIXES.includes(tailChar) &&
      nextToken &&
      nextToken.length >= 2
    ) {
      const headToken = token.slice(0, -1);
      if (headToken) {
        normalized.push(headToken);
      }
      // Keep the grammatical negation separate from the following action.
      // Curated lexical units (不得不/不要/不舒服) are handled by segmentation.
      normalized.push(tailChar);
      continue;
    }

    normalized.push(token);
  }

  return normalized;
}

function mergeUnmatchedWithNextToken(matches, catalog, personalTerms) {
  const merged = [];

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];

    const currentEntry = findChineseCommunicationEntry(current.token);
    const nextEntry = next && findChineseCommunicationEntry(next.token);
    if (
      !current.tile &&
      !current.personalReference &&
      next &&
      !hasHelpPossessiveContinuation(
        current.token + next.token,
        matches
          .slice(index + 2)
          .map(item => item.token)
          .join(''),
        personalTerms
      ) &&
      !splitCommunicationGrammarPair(current.token + next.token) &&
      !COMPOSITION_BOUNDARY_TERMS.has(current.token) &&
      !COMPOSITION_BOUNDARY_TERMS.has(next.token) &&
      !(currentEntry && currentEntry.exactOnly) &&
      !(nextEntry && nextEntry.exactOnly)
    ) {
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

function hasNonPersonTemperatureSubject(prefix, personalTerms) {
  // Clause-local, nearest explicit subject wins: 水太热，但我觉得热 and
  // 水太热我也热 must not let the first water subject suppress the person.
  const clause = prefix.split(/[，。！？；,.!?;\n]|但是|可是|不过|但/).pop();
  if (/(?:觉得|感觉)(?:很|太|有点|有些|特别|不)?$/.test(clause)) return false;
  const subjects = /我|你|他|她|自己|妈妈|爸爸|奶奶|爷爷|外婆|外公|水|茶|汤|粥|饭|咖啡|牛奶|饮料|食物|杯子|碗|天气|房间|屋里|室内|地板/g;
  let last = null,
    found;
  while ((found = subjects.exec(clause)))
    last = {
      index: found.index,
      object: !/^(我|你|他|她|自己|妈妈|爸爸|奶奶|爷爷|外婆|外公)$/.test(
        found[0]
      )
    };
  personalTerms.forEach(name => {
    const index = clause.lastIndexOf(name);
    if (index >= 0 && (!last || index >= last.index))
      last = { index, object: false };
  });
  return !!last && last.object;
}

export function applyCommunicationContextGuards(
  matches,
  catalog,
  { preserveExplicitChoices = false } = {}
) {
  matches = applyPersonalReferenceGuard(matches, catalog);
  const personalTerms = catalog
    .filter(item => item.semanticDomain === 'people' && item.tile.label)
    .map(item => item.tile.label)
    .concat(getPersonalPersonTerms(catalog));
  const source = matches.map(item => item.token).join('');
  const names = findCommunicationPersonSpans(source, personalTerms);
  // Occurrence spans also cover AI/manual token boundaries such as 热 / 一下
  // and 加 / 热. A learned 热 picture must not erase the heating action.
  const heatingActions = [],
    heatingPattern = /加热|热一下|热一热/g;
  let heatingMatch;
  while ((heatingMatch = heatingPattern.exec(source))) {
    heatingActions.push({
      start: heatingMatch.index,
      end: heatingMatch.index + heatingMatch[0].length
    });
  }
  let cursor = 0;
  return matches.map((match, index) => {
    const start = cursor;
    cursor += match.token.length;
    if (!match.tile || match.tile.textOnly) return match;
    const helpPossessive = hasHelpPossessiveContinuation(
      match.token,
      matches
        .slice(index + 1)
        .map(item => item.token)
        .join(''),
      personalTerms
    );
    const explicitChoice =
      preserveExplicitChoices && ['manual', 'corrected'].includes(match.source);
    const nameFragment = names.some(
      name =>
        start < name.end &&
        cursor > name.start &&
        (start !== name.start || cursor !== name.end)
    );
    const image = String(match.tile.tile.image || '').split(/[?#]/)[0];
    const personHeatPicture =
      match.tile.id === 'SyS0fA96XqtW' ||
      /(?:^|\/)(?:hot_person\.svg|38329bea3476fac5\.png)$/.test(image);
    const heatingAction = heatingActions.some(
      span => start < span.end && cursor > span.start
    );
    const objectHeatPicture =
      match.tile.id === 'tuyujia-builtin-object-heat' ||
      /(?:^|\/)hot\.svg$/.test(image);
    const wrongHeatingAction =
      heatingAction && (personHeatPicture || objectHeatPicture);
    const objectSubject = hasNonPersonTemperatureSubject(
      source.slice(0, start),
      personalTerms
    );
    const wrongObjectHeat =
      match.tile.id === 'tuyujia-builtin-object-heat' &&
      /^(?:热|很热|好热)$/.test(match.token) &&
      !objectSubject;
    const wrongTemperature =
      /热/.test(match.token) && personHeatPicture && objectSubject;
    if (
      !explicitChoice &&
      wrongTemperature &&
      !wrongHeatingAction &&
      !helpPossessive &&
      !nameFragment
    ) {
      const objectHeat = catalog.find(
        item =>
          item.id === 'tuyujia-builtin-object-heat' &&
          item.displayLabel === '物体热' &&
          item.tile.image
      );
      if (objectHeat)
        return { ...match, tile: objectHeat, matchType: 'synonym' };
    }
    return !explicitChoice &&
      (helpPossessive ||
        nameFragment ||
        wrongTemperature ||
        wrongObjectHeat ||
        wrongHeatingAction)
      ? { ...match, tile: null, matchType: 'none' }
      : match;
  });
}

// Keep the old export for existing adapters; all restoration/backfill paths use
// the same occurrence-aware guard rather than a second matching dictionary.
export const applyCommunicationPersonContextGuard = applyCommunicationContextGuards;

export function matchTextToCommunicationTiles(text, boards, options = {}) {
  const catalog = buildCommunicationTileCatalog(boards, options.intl);
  // Reuse the existing person/category metadata and labels. User phrases and
  // synonyms are not a second segmentation dictionary; names stay workspace scoped.
  const personalTerms = catalog
    .filter(item => item.semanticDomain === 'people' && item.tile.label)
    .map(item => item.tile.label)
    .concat(getPersonalPersonTerms(catalog));
  const rawSegmentation = options.preSegmented
    ? { segments: options.preSegmented, engine: 'intl-segmenter' }
    : segmentChineseCommunicationText(text, { personalTerms });
  const segmentation = {
    ...rawSegmentation,
    segments: options.preserveSegments
      ? rawSegmentation.segments.slice()
      : normalizeSegments(rawSegmentation.segments)
  };
  let mentionCursor = 0;
  let matches = segmentation.segments.map((token, index) => {
    const start = mentionCursor;
    mentionCursor += token.length;
    const person = resolvePersonalReference(token, catalog, {
      source: text,
      start
    });
    if (person && !person.ordinary)
      return {
        token,
        tile: person.resolved,
        matchType: person.resolved ? 'synonym' : 'none',
        personalReference: true,
        personCandidates: person.resolved ? [] : person.candidates
      };
    const lexiconEntry = findChineseCommunicationEntry(token);
    let matched = null;
    // Match this occurrence only. Looking across a preserved boundary used to
    // turn [不, 开心] into [不, 伤心], duplicating the negation in the output.

    const exactCandidate = pickBestCandidate(
      token,
      mapCandidates(
        catalog.filter(
          item => !isPrivatePerson(item) && item.labels.includes(token)
        ),
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
          catalog.filter(
            item => !isPrivatePerson(item) && item.synonyms.includes(token)
          ),
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
      const allowedLabels = lexiconEntry.automaticLabels || [lexiconEntry.zh];
      const lexiconCandidate = pickBestCandidate(
        token,
        mapCandidates(
          catalog.filter(item =>
            item.labels.some(label => allowedLabels.includes(label))
          ),
          'lexicon-synonym',
          lexiconEntry.zh
        ),
        lexiconEntry
      );

      if (lexiconCandidate) {
        matched = lexiconCandidate;
      }
    }

    // A curated lookup alias may select an image without replacing the source.
    const lookupToken = getReviewedLookupToken(token);
    if (!matched && lookupToken !== token) {
      matched = pickBestCandidate(
        token,
        mapCandidates(
          catalog.filter(item => item.labels.includes(lookupToken)),
          'lexicon-synonym',
          lookupToken
        ),
        findChineseCommunicationEntry(lookupToken)
      );
    }

    if (
      !matched &&
      // Containment is a retrieval hint, not evidence of the same meaning:
      // 葡萄柚/葡萄, 洗手液/洗手 and 手机壳/手机 must reach backfill.
      // Keep explicit opt-in for diagnostics; normal receiver/AI flows use
      // exact labels and maintained synonyms before requesting confirmation.
      options.allowPartial === true &&
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

    if (!matched && isSeparatorToken(token)) {
      return {
        token,
        tile: createTextCommunicationCatalogItem(
          token,
          `text-separator-${index}`
        ),
        matchType: 'manual',
        source: 'text'
      };
    }
    return {
      token,
      tile: matched ? matched.tile : null,
      matchType: matched ? matched.matchType : 'none',
      ...(matched && matched.matchedKey !== token
        ? { lookupToken: matched.matchedKey }
        : {})
    };
  });

  if (!options.preSegmented) {
    matches = mergeUnmatchedWithNextToken(matches, catalog, personalTerms);
    segmentation.segments = matches.map(match => match.token);
  }

  const beforeMemory = matches;
  matches = applyWorkspaceCorrectionMemory(
    matches,
    catalog,
    options.correctionMemory
  ).map((item, index) =>
    beforeMemory[index].personalReference ? beforeMemory[index] : item
  );
  // AI-provided boundaries and correction memory must obey the same person
  // context guard as local segmentation: 帮我 / 的 / 女儿 is not help-me.
  matches = applyCommunicationContextGuards(matches, catalog);
  if (matches.map(item => item.token).join('') === text) {
    let cursor = 0;
    matches = matches.map(item => {
      const start = cursor;
      cursor += Array.from(item.token).length;
      return {
        ...item,
        sourceSpan: { start, end: cursor, offsetUnit: 'unicode-code-point' }
      };
    });
  }
  const matchedCount = matches.filter(item => item.tile).length;

  return {
    inputText: text,
    segmentation,
    matches,
    matchRate: matches.length ? matchedCount / matches.length : 0
  };
}

export function createCommunicationOutputFromMatches(matches, options = {}) {
  return (matches || [])
    .filter(
      item =>
        item.tile && !(item.tile.textOnly && !String(item.token || '').trim())
    )
    .map(item => {
      if (item.tile.textOnly) {
        return {
          id: item.tile.id,
          label: item.token,
          vocalization: item.token,
          image: '',
          textOnly: true
        };
      }
      const displayLabel =
        item.tile.displayLabel ||
        item.tile.tile.label ||
        item.tile.tile.vocalization;
      const attribution = getPictogramAttribution(item.tile);
      // Receiving words and choosing a picture are separate operations. Only
      // an explicit manual replacement may change the received utterance.
      // Expression-board callers keep their existing tile utterances.
      const preserveSource =
        options.preserveAutomaticSource === true &&
        item.matchType !== 'manual' &&
        item.source !== 'manual' &&
        item.source !== 'corrected' &&
        typeof item.token === 'string' &&
        item.token.length > 0;

      return {
        id: item.tile.id,
        image: item.tile.tile.image,
        mediaType: item.tile.tile.mediaType,
        video: item.tile.tile.video,
        label: preserveSource ? item.token : displayLabel,
        vocalization: preserveSource
          ? item.token
          : item.tile.tile.vocalization || displayLabel,
        keyPath: item.tile.tile.keyPath,
        backgroundColor: item.tile.tile.backgroundColor,
        ...(isPrivatePerson(item.tile) ? { personId: item.tile.id } : {}),
        ...(attribution ? { attribution } : {})
      };
    });
}
