import { normalizeExpressionCandidates } from './candidateFeedback';

export const CONVERSATION_SESSION_CONTRACT_VERSION = 1;
export const DEFAULT_CONVERSATION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_CONVERSATION_CONTEXT_TURN_LIMIT = 10;
export const CONVERSATION_SCENES = Object.freeze([
  Object.freeze({ id: 'hospital', label: '医院', icon: '🏥' }),
  Object.freeze({ id: 'home', label: '家庭', icon: '🏠' }),
  Object.freeze({
    id: 'rehab_clinic',
    label: '康复门诊',
    icon: '🩺'
  })
]);

const CONVERSATION_SCENE_IDS = new Set(
  CONVERSATION_SCENES.map(scene => scene.id)
);

export function normalizeConversationScene(value) {
  const scene = String(value || '').trim();
  return CONVERSATION_SCENE_IDS.has(scene) ? scene : null;
}

function resolveTimestamp(now) {
  return typeof now === 'function' ? now() : Date.now();
}

function resolveSessionId(createId, timestamp) {
  if (typeof createId === 'function') {
    const id = String(createId('session') || '').trim();
    if (id) {
      return id;
    }
  }

  return `session_${timestamp.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function normalizeConversationSession(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const id = String(value.id || '').trim();
  const startedAt = Number(value.startedAt);
  const lastActivityAt = Number(value.lastActivityAt);

  if (
    !id ||
    !Number.isFinite(startedAt) ||
    !Number.isFinite(lastActivityAt) ||
    lastActivityAt < startedAt
  ) {
    return null;
  }

  const scene = normalizeConversationScene(value.scene);

  return {
    contractVersion: CONVERSATION_SESSION_CONTRACT_VERSION,
    id,
    startedAt,
    lastActivityAt,
    ...(scene ? { scene } : {})
  };
}

export function createConversationSession({ now = Date.now, createId } = {}) {
  const timestamp = resolveTimestamp(now);

  return {
    contractVersion: CONVERSATION_SESSION_CONTRACT_VERSION,
    id: resolveSessionId(createId, timestamp),
    startedAt: timestamp,
    lastActivityAt: timestamp
  };
}

export function resolveConversationSession(
  value,
  {
    now = Date.now,
    createId,
    idleTimeoutMs = DEFAULT_CONVERSATION_IDLE_TIMEOUT_MS
  } = {}
) {
  const current = normalizeConversationSession(value);
  const timestamp = resolveTimestamp(now);
  const timeout =
    Number.isFinite(idleTimeoutMs) && idleTimeoutMs > 0
      ? idleTimeoutMs
      : DEFAULT_CONVERSATION_IDLE_TIMEOUT_MS;

  if (!current) {
    return {
      session: createConversationSession({ now: () => timestamp, createId }),
      reason: 'created'
    };
  }

  if (timestamp - current.lastActivityAt >= timeout) {
    return {
      session: createConversationSession({ now: () => timestamp, createId }),
      reason: 'idle'
    };
  }

  return { session: current, reason: 'active' };
}

export function touchConversationSession(value, { now = Date.now } = {}) {
  const current = normalizeConversationSession(value);

  if (!current) {
    return null;
  }

  return {
    ...current,
    lastActivityAt: Math.max(current.lastActivityAt, resolveTimestamp(now))
  };
}

export function setConversationSessionScene(
  value,
  scene,
  { now = Date.now } = {}
) {
  const current = normalizeConversationSession(value);
  if (!current) return null;

  const next = {
    ...current,
    lastActivityAt: Math.max(current.lastActivityAt, resolveTimestamp(now))
  };
  const normalizedScene = normalizeConversationScene(scene);
  if (normalizedScene) {
    return { ...next, scene: normalizedScene };
  }

  delete next.scene;
  return next;
}

function normalizeContextLimit(value) {
  return Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_CONVERSATION_CONTEXT_TURN_LIMIT;
}

function getContextText(entry) {
  return String(
    entry.direction === 'receive' ? entry.inputText || '' : entry.sentence || ''
  ).trim();
}

function getContextPictogramIds(entry) {
  if (Array.isArray(entry.pictogramSequence)) {
    return entry.pictogramSequence
      .map(item => String((item && item.pictogramId) || '').trim())
      .filter(Boolean);
  }

  return (Array.isArray(entry.output) ? entry.output : [])
    .map(item => String((item && item.id) || '').trim())
    .filter(Boolean);
}

export function buildConversationContext(
  history,
  { sessionId, scene, maxTurns = DEFAULT_CONVERSATION_CONTEXT_TURN_LIMIT } = {}
) {
  const normalizedSessionId = String(sessionId || '').trim();
  const normalizedScene = normalizeConversationScene(scene);
  const turns = (Array.isArray(history) ? history : [])
    .filter(entry => {
      if (!entry || entry.sessionId !== normalizedSessionId) {
        return false;
      }

      return (
        (entry.direction === 'express' && entry.recordStatus !== 'draft') ||
        (entry.direction === 'receive' && entry.recordStatus === 'confirmed')
      );
    })
    .map(entry => ({
      id: String(entry.id || '').trim() || null,
      direction: entry.direction,
      text: getContextText(entry),
      labels: (Array.isArray(entry.labels) ? entry.labels : [])
        .map(label => String(label || '').trim())
        .filter(Boolean),
      pictogramIds: getContextPictogramIds(entry),
      candidateFeedback:
        entry.direction === 'express'
          ? normalizeExpressionCandidates(
              entry.candidates,
              entry.candidateSentences
            ).filter(candidate => candidate.feedback)
          : [],
      createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : 0
    }))
    .filter(turn => turn.text || turn.labels.length)
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-normalizeContextLimit(maxTurns));

  return {
    contractVersion: CONVERSATION_SESSION_CONTRACT_VERSION,
    sessionId: normalizedSessionId,
    ...(normalizedScene ? { scene: normalizedScene } : {}),
    turns
  };
}
