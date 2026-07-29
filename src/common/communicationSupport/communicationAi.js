import {
  buildExpressionLoopState,
  DEFAULT_EXPRESSION_CANDIDATE_COUNT
} from './expressionPipeline';
import {
  buildReceiverLoopState,
  buildReceiverMatchQuality
} from './receiverPipeline';
import { buildCommunicationTileCatalog } from './symbolMatching';
import { normalizeExpressionCandidates } from './candidateFeedback';
import { normalizeConversationScene } from './conversationSession';

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

function getContextText(turn) {
  if (!turn || turn.recordStatus === 'draft') return '';
  return String(turn.text || turn.sentence || turn.inputText || '').trim();
}

function getCandidateFeedbackContext(context) {
  return (context && context.turns ? context.turns : [])
    .flatMap(turn =>
      normalizeExpressionCandidates(turn && turn.candidateFeedback, [])
    )
    .filter(candidate => candidate.feedback)
    .slice(-20);
}

export function buildCommunicationAiSentenceRequest({
  output,
  context,
  candidateCount
} = {}) {
  const scene = normalizeConversationScene(context && context.scene);

  return {
    contractVersion: COMMUNICATION_AI_CONTRACT_VERSION,
    pictogramLabels: normalizeStringList(
      (Array.isArray(output) ? output : []).map(item => item && item.label),
      MAX_COMMUNICATION_AI_LABELS,
      24
    ),
    candidateCount: normalizeCandidateCount(candidateCount),
    context: {
      recentSentences: normalizeStringList(
        (context && context.turns ? context.turns : []).map(getContextText),
        MAX_COMMUNICATION_AI_CONTEXT_TURNS,
        120
      ),
      candidateFeedback: getCandidateFeedbackContext(context),
      ...(scene ? { scene } : {})
    }
  };
}

export function applyCommunicationAiSentenceResponse(
  localState,
  response,
  candidateCount
) {
  const candidates = normalizeStringList(
    response && response.candidates,
    normalizeCandidateCount(candidateCount),
    120
  );

  if (!localState || !candidates.length) return localState;

  return {
    ...localState,
    candidateSentences: candidates,
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

  catalog.forEach(item => {
    vocabulary.push(item.displayLabel);
    vocabulary.push(...item.labels);
    vocabulary.push(...item.synonyms);
  });

  return {
    contractVersion: COMMUNICATION_AI_CONTRACT_VERSION,
    text: String(text || '')
      .trim()
      .slice(0, 120),
    unmatchedTokens: normalizeStringList(
      (Array.isArray(reviewItems) ? reviewItems : [])
        .filter(item => item && !item.tile)
        .map(item => item.token),
      MAX_COMMUNICATION_AI_LABELS,
      24
    ),
    pictogramVocabulary: normalizeStringList(
      vocabulary,
      MAX_COMMUNICATION_AI_VOCABULARY,
      24
    )
  };
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
  const candidateTokens = normalizeStringList(
    response && response.tokens,
    MAX_COMMUNICATION_AI_LABELS,
    24
  );

  if (!candidateTokens.length) {
    return {
      applied: false,
      reviewItems: currentItems,
      quality: currentQuality
    };
  }

  const next = buildReceiverLoopState(text, boards, {
    intl,
    preSegmented: candidateTokens,
    missingTokenRecords,
    correctionMemory,
    createId
  });
  const nextQuality = buildReceiverMatchQuality(next.reviewItems);

  if (nextQuality.matchRate < currentQuality.matchRate) {
    return {
      applied: false,
      reviewItems: currentItems,
      quality: currentQuality
    };
  }

  return {
    applied: true,
    reviewItems: next.reviewItems.map(item => ({
      ...item,
      matchType: item.tile ? 'ai' : item.matchType
    })),
    quality: nextQuality,
    segmentation: candidateTokens,
    provider: String((response && response.provider) || 'cboard-api-ai')
  };
}
