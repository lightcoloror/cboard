import {
  buildExpressionLoopState,
  DEFAULT_EXPRESSION_CANDIDATE_COUNT
} from './expressionPipeline';
import {
  buildReceiverLoopState,
  buildReceiverMatchQuality
} from './receiverPipeline';
import { buildCommunicationTileCatalog } from './symbolMatching';
import {
  getPersonalPeople,
  getPersonalPersonTerms,
  isPrivatePerson
} from './personalPeople';
import {
  getPictogramAttribution,
  DEVICE_PRIVATE_PICTOGRAM_PROVIDER
} from './pictogramAttribution';
import { findCommunicationPersonSpans } from './segmentation';
import {
  attachPrivatePersonContext,
  createPrivatePersonMarkers
} from './privatePersonAi';
import { normalizeConversationScene } from './conversationSession';
import { filterFaithfulExpressionCandidates } from './phraseSuggestions';
import {
  RESEGMENT_CONTRACT_VERSION,
  normalizeResegmentResponse
} from './resegmentationContract';
export {
  normalizeResegmentResponse,
  validateResegmentSource
} from './resegmentationContract';

export const COMMUNICATION_AI_CONTRACT_VERSION = 1;
export const MAX_COMMUNICATION_AI_LABELS = 12;
export const MAX_COMMUNICATION_AI_CANDIDATES = 5;
export const MAX_COMMUNICATION_AI_CONTEXT_TURNS = 6;
export const MAX_COMMUNICATION_AI_VOCABULARY = 200;

function normalizeStringList(values, maxItems, maxLength) {
  const seen = new Set();

  return (Array.isArray(values) ? values : [])
    .map(value =>
      String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, maxLength)
    )
    .filter(value => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, maxItems);
}

function normalizeCandidateCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count > 0
    ? Math.min(count, MAX_COMMUNICATION_AI_CANDIDATES)
    : Math.min(
        DEFAULT_EXPRESSION_CANDIDATE_COUNT,
        MAX_COMMUNICATION_AI_CANDIDATES
      );
}

export function buildCommunicationAiSentenceRequest({
  output,
  context,
  candidateCount,
  boards,
  intl
} = {}) {
  const scene = normalizeConversationScene(context && context.scene);
  const catalog = buildCommunicationTileCatalog(boards || [], intl);
  const markers = createPrivatePersonMarkers();
  const labels = (Array.isArray(output) ? output : [])
    .filter(Boolean)
    .slice(0, MAX_COMMUNICATION_AI_LABELS)
    .map(item => {
      const known = catalog.find(tile => tile.id === item.id);
      const attribution = getPictogramAttribution(item);
      const privatePerson =
        item.personId ||
        (known && isPrivatePerson(known)) ||
        (attribution &&
          attribution.provider === DEVICE_PRIVATE_PICTOGRAM_PROVIDER &&
          (!known || item.communicationCategory === 'people'));
      return privatePerson
        ? markers.marker(
            String(
              item.personId ||
                item.id ||
                (attribution && attribution.tileId) ||
                ''
            ),
            String(item.label || '')
          )
        : String(item.label || '')
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 24);
    })
    .filter(Boolean)
    .slice(0, MAX_COMMUNICATION_AI_LABELS);
  return attachPrivatePersonContext(
    {
      contractVersion: COMMUNICATION_AI_CONTRACT_VERSION,
      pictogramLabels: labels,
      candidateCount: normalizeCandidateCount(candidateCount),
      context: {
        recentSentences: [],
        candidateFeedback: [],
        ...(scene ? { scene } : {})
      }
    },
    {
      entries: markers.entries,
      sequence: labels.filter(label => /^⟦P\d+⟧$/.test(label))
    }
  );
}

export function applyCommunicationAiSentenceResponse(
  localState,
  response,
  candidateCount
) {
  const labels = ((localState && localState.outputSnapshot) || []).map(
    item => item.label
  );
  const candidates = filterFaithfulExpressionCandidates(
    labels,
    response && response.candidates
  )
    .filter(candidate => candidate.length <= 120)
    .slice(0, normalizeCandidateCount(candidateCount));

  if (!localState || !candidates.length) return localState;

  return {
    ...localState,
    // Keep valid AI alternatives first. A short/duplicate response is topped
    // up locally, never by issuing another paid request.
    candidateSentences: filterFaithfulExpressionCandidates(labels, [
      ...candidates,
      ...localState.candidateSentences
    ]).slice(0, normalizeCandidateCount(candidateCount)),
    selectedIndex: 0,
    candidateProvider: String(
      (response && response.provider) || 'cboard-api-ai'
    ),
    isOfflineFallback: false
  };
}

export function buildCommunicationAiExpressionState(
  output,
  response,
  candidateCount
) {
  const localState = buildExpressionLoopState(output, candidateCount);
  return (
    applyCommunicationAiSentenceResponse(
      localState,
      response,
      candidateCount
    ) || localState
  );
}

export function buildCommunicationAiResegmentRequest({
  text,
  reviewItems,
  boards,
  intl
} = {}) {
  const catalog = buildCommunicationTileCatalog(boards, intl);
  const vocabulary = [];
  const people = getPersonalPeople(catalog);
  const names = getPersonalPersonTerms(catalog);
  const markers = createPrivatePersonMarkers();
  const sourceText = String(text || '');
  const spans = findCommunicationPersonSpans(sourceText, names).filter(
    span => span.personal || span.privatePrefix
  );
  let cursor = 0;
  const pieces = [],
    sequence = [];
  spans.forEach(span => {
    const exact = people.filter(item => item.tile.label === span.text);
    const selected = (reviewItems || []).find(
      item =>
        item.token === span.text &&
        item.tile &&
        item.sourceSpan &&
        item.sourceSpan.start ===
          Array.from(sourceText.slice(0, span.start)).length
    );
    const id = selected
      ? selected.tile.id
      : exact.length === 1
      ? exact[0].id
      : `mention:${span.start}`;
    const marker = markers.marker(id, span.text);
    pieces.push(sourceText.slice(cursor, span.start), marker);
    sequence.push(marker);
    cursor = span.end;
  });
  pieces.push(sourceText.slice(cursor));
  const privateTerm = token =>
    names.some(name => token.includes(name)) ||
    spans.some(span => token.includes(span.text));
  catalog
    .filter(item => !isPrivatePerson(item))
    .forEach(item => {
      vocabulary.push(item.displayLabel);
      vocabulary.push(...item.labels);
      vocabulary.push(...item.synonyms);
    });

  return attachPrivatePersonContext(
    {
      contractVersion: RESEGMENT_CONTRACT_VERSION,
      text: pieces.join(''),
      unmatchedTokens: normalizeStringList(
        (Array.isArray(reviewItems) ? reviewItems : [])
          .filter(item => item && !item.tile)
          .filter(item => !item.personalReference)
          .map(item => item.token)
          .filter(token => !privateTerm(token)),
        MAX_COMMUNICATION_AI_LABELS,
        24
      ),
      pictogramVocabulary: normalizeStringList(
        vocabulary.filter(token => !privateTerm(token)),
        MAX_COMMUNICATION_AI_VOCABULARY,
        24
      )
    },
    { entries: markers.entries, sequence, sourceText }
  );
}

function preserveAlignedReviewChoices(text, currentItems, nextItems) {
  // Reuse the source contract instead of matching by token text: repeated
  // words may have different manual pictures, and emoji use code-point offsets.
  const aligned = normalizeResegmentResponse(text, {
    tokens: currentItems.map(item => item && item.token)
  });
  if (!aligned) return nextItems;
  const choices = new Map();
  aligned.segments.forEach((segment, index) => {
    const item = currentItems[index];
    if (
      item.tile &&
      (item.tile.textOnly ||
        ['manual', 'online'].includes(item.matchType) ||
        ['manual', 'corrected'].includes(item.source))
    ) {
      choices.set(segment.start, { item, segment });
    }
  });
  return nextItems.map(item => {
    const span = item.sourceSpan;
    const previous = span && choices.get(span.start);
    if (
      !previous ||
      previous.segment.end !== span.end ||
      previous.segment.surface !== item.token
    )
      return item;
    return {
      ...item,
      tile: previous.item.tile,
      matchType: previous.item.matchType,
      source: previous.item.source,
      lookupToken: previous.item.lookupToken
    };
  });
}

export function applyCommunicationAiResegmentation({
  currentReviewItems,
  response,
  text,
  boards,
  intl,
  missingTokenRecords,
  correctionMemory,
  createId
} = {}) {
  const currentItems = Array.isArray(currentReviewItems)
    ? currentReviewItems
    : [];
  const currentQuality = buildReceiverMatchQuality(currentItems);
  const normalized = normalizeResegmentResponse(text, response);

  if (!normalized) {
    return {
      applied: false,
      reason: 'source-mismatch',
      reviewItems: currentItems,
      quality: currentQuality
    };
  }
  const candidateTokens = normalized.tokens;

  const next = buildReceiverLoopState(text, boards, {
    intl,
    preSegmented: candidateTokens,
    preserveSegments: true,
    allowPartial: false,
    missingTokenRecords,
    correctionMemory,
    createId
  });

  // No image-count optimization may erase original text. Check the mapped
  // sequence too, including existing correction-memory/missing-token hooks.
  if (next.reviewItems.map(item => item.token).join('') !== text) {
    return {
      applied: false,
      reason: 'source-mismatch',
      reviewItems: currentItems,
      quality: currentQuality
    };
  }

  const reviewItems = preserveAlignedReviewChoices(
    text,
    currentItems,
    next.reviewItems
  );
  return {
    applied: true,
    requiresConfirmation: true,
    sourceText: normalized.sourceText,
    segments: normalized.segments,
    // AI proposes boundaries; the existing matcher/backfill/human still chooses
    // the pictures. Keep that provenance for review and restored-draft guards.
    reviewItems,
    quality: buildReceiverMatchQuality(reviewItems),
    segmentation: candidateTokens,
    provider: String((response && response.provider) || 'cboard-api-ai')
  };
}
