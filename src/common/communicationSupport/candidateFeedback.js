export const CANDIDATE_FEEDBACK_CONTRACT_VERSION = 1;
export const CANDIDATE_FEEDBACK = {
  up: 'up',
  down: 'down'
};
export const MAX_EXPRESSION_CANDIDATES = 10;

function normalizeText(value) {
  return String(value || '').trim();
}

function resolveTimestamp(now) {
  const value = typeof now === 'function' ? now() : Date.now();
  return Number.isFinite(value) ? value : Date.now();
}

export function normalizeCandidateFeedback(value) {
  return value === CANDIDATE_FEEDBACK.up || value === CANDIDATE_FEEDBACK.down
    ? value
    : null;
}

export function normalizeExpressionCandidates(value, fallbackSentences = []) {
  const source =
    Array.isArray(value) && value.length
      ? value
      : Array.isArray(fallbackSentences)
      ? fallbackSentences
      : [];

  return source
    .slice(0, MAX_EXPRESSION_CANDIDATES)
    .map(item => {
      const sentence = normalizeText(
        item && typeof item === 'object' ? item.sentence : item
      );
      if (!sentence) return null;

      return {
        sentence,
        feedback: normalizeCandidateFeedback(
          item && typeof item === 'object' ? item.feedback : null
        )
      };
    })
    .filter(Boolean);
}

export function toggleExpressionCandidateFeedback(
  candidates,
  candidateIndex,
  feedback
) {
  const current = normalizeExpressionCandidates(candidates);
  const normalizedFeedback = normalizeCandidateFeedback(feedback);

  if (
    !normalizedFeedback ||
    !Number.isInteger(candidateIndex) ||
    candidateIndex < 0 ||
    candidateIndex >= current.length
  ) {
    return current;
  }

  return current.map((candidate, index) =>
    index === candidateIndex
      ? {
          ...candidate,
          feedback:
            candidate.feedback === normalizedFeedback
              ? null
              : normalizedFeedback
        }
      : candidate
  );
}

export function normalizeExpressionCandidateFeedbackDraft(value) {
  if (!value || typeof value !== 'object') return null;

  const id = normalizeText(value.id);
  const sessionId = normalizeText(value.sessionId);
  const outputSignature = normalizeText(value.outputSignature);
  const candidates = normalizeExpressionCandidates(
    value.candidates,
    value.candidateSentences
  );
  const createdAt = Number(value.createdAt);
  const updatedAt = Number(value.updatedAt);

  if (
    !id ||
    !sessionId ||
    !outputSignature ||
    !candidates.some(candidate => candidate.feedback) ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(updatedAt)
  ) {
    return null;
  }

  return {
    contractVersion: CANDIDATE_FEEDBACK_CONTRACT_VERSION,
    id,
    sessionId,
    outputSignature,
    candidates,
    createdAt,
    updatedAt
  };
}

export function findExpressionCandidateFeedbackDraft(
  value,
  { sessionId, outputSignature, candidateSentences = [] } = {}
) {
  const normalizedSessionId = normalizeText(sessionId);
  const normalizedOutputSignature = normalizeText(outputSignature);
  if (!normalizedSessionId || !normalizedOutputSignature) return null;

  const draft = (Array.isArray(value) ? value : [])
    .map(normalizeExpressionCandidateFeedbackDraft)
    .filter(
      item =>
        item &&
        item.sessionId === normalizedSessionId &&
        item.outputSignature === normalizedOutputSignature
    )
    .sort(
      (left, right) =>
        right.updatedAt - left.updatedAt ||
        right.createdAt - left.createdAt ||
        right.id.localeCompare(left.id)
    )[0];

  if (!draft) return null;

  const currentCandidates = normalizeExpressionCandidates(
    [],
    candidateSentences
  );
  if (!currentCandidates.length) return draft;

  const candidates = currentCandidates.map(candidate => {
    const saved = draft.candidates.find(
      item => item.sentence === candidate.sentence
    );
    return {
      ...candidate,
      feedback: saved ? saved.feedback : null
    };
  });

  return candidates.some(candidate => candidate.feedback)
    ? { ...draft, candidates }
    : null;
}

export function buildExpressionCandidateFeedbackDraft(
  value,
  { now = Date.now, createId } = {}
) {
  const timestamp = resolveTimestamp(now);
  const id =
    normalizeText(value && value.id) ||
    normalizeText(
      typeof createId === 'function' ? createId('expression-feedback') : ''
    ) ||
    `expression-feedback_${timestamp.toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  return normalizeExpressionCandidateFeedbackDraft({
    ...(value || {}),
    id,
    createdAt:
      value && Number.isFinite(Number(value.createdAt))
        ? Number(value.createdAt)
        : timestamp,
    updatedAt: timestamp
  });
}
