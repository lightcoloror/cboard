import {
  buildExpressionLoopState,
  DEFAULT_EXPRESSION_CANDIDATE_COUNT
} from './expressionPipeline';
import {
  buildReceiverLoopState,
  buildReceiverMatchQuality
} from './receiverPipeline';
import { buildCommunicationTileCatalog } from './symbolMatching';
import { normalizeConversationScene } from './conversationSession';
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
      recentSentences: [],
      candidateFeedback: [],
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
    contractVersion: RESEGMENT_CONTRACT_VERSION,
    text: String(text || ''),
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
  const nextQuality = buildReceiverMatchQuality(next.reviewItems);

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

  return {
    applied: true,
    requiresConfirmation: true,
    sourceText: normalized.sourceText,
    segments: normalized.segments,
    reviewItems: next.reviewItems.map(item => ({
      ...item,
      matchType: item.tile ? 'ai' : item.matchType
    })),
    quality: nextQuality,
    segmentation: candidateTokens,
    provider: String((response && response.provider) || 'cboard-api-ai')
  };
}
