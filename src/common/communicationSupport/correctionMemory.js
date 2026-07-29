export const RECEIVER_CORRECTION_MEMORY_CONTRACT_VERSION = 1;
export const RECEIVER_CORRECTION_RECENCY_HALF_LIFE_MS =
  30 * 24 * 60 * 60 * 1000;
export const RECEIVER_CORRECTION_TOMBSTONE_RETENTION_MS =
  90 * 24 * 60 * 60 * 1000;

const REPLACEMENT_ACTIONS = new Set(['replace_pictogram']);
const DELETION_ACTIONS = new Set(['delete_pictogram', 'remove_pictogram']);

export function normalizeReceiverCorrectionToken(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function resolveNow(now) {
  const value = typeof now === 'function' ? now() : now;
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : Date.now();
}

function normalizePictogramId(value) {
  return String(value || '').trim();
}

function getCorrectionToken(entry) {
  if (DELETION_ACTIONS.has(entry.action)) {
    return normalizeReceiverCorrectionToken(
      entry.originalToken || entry.normalizedToken
    );
  }

  return normalizeReceiverCorrectionToken(
    entry.normalizedToken || entry.originalToken
  );
}

function getRuleState(rulesByToken, token) {
  if (!rulesByToken.has(token)) {
    rulesByToken.set(token, {
      token,
      preferredPictogramId: null,
      preferredAt: null,
      tombstones: new Map(),
      lastCorrectedAt: 0
    });
  }

  return rulesByToken.get(token);
}

function getPairKey(token, pictogramId) {
  return `${token}\u0000${pictogramId}`;
}

export function buildWorkspaceCorrectionMemory(
  corrections,
  {
    workspaceId,
    now = Date.now,
    tombstoneRetentionMs = RECEIVER_CORRECTION_TOMBSTONE_RETENTION_MS
  } = {}
) {
  const normalizedWorkspaceId = String(workspaceId || '').trim();
  const currentTime = resolveNow(now);
  const safeRetention =
    typeof tombstoneRetentionMs === 'number' &&
    Number.isFinite(tombstoneRetentionMs) &&
    tombstoneRetentionMs >= 0
      ? tombstoneRetentionMs
      : RECEIVER_CORRECTION_TOMBSTONE_RETENTION_MS;
  const events = (Array.isArray(corrections) ? corrections : [])
    .map((entry, index) => ({
      entry,
      index,
      createdAt:
        entry &&
        typeof entry.createdAt === 'number' &&
        Number.isFinite(entry.createdAt)
          ? entry.createdAt
          : 0
    }))
    .filter(({ entry }) => {
      return Boolean(
        entry &&
          entry.isUsedForLearning === true &&
          normalizedWorkspaceId &&
          String(entry.workspaceId || '').trim() === normalizedWorkspaceId
      );
    })
    .sort((left, right) => {
      return left.createdAt - right.createdAt || right.index - left.index;
    });
  const pairFrequency = new Map();
  const rulesByToken = new Map();

  events.forEach(({ entry }) => {
    if (!REPLACEMENT_ACTIONS.has(entry.action)) return;
    const token = getCorrectionToken(entry);
    const pictogramId = normalizePictogramId(entry.pictogramIdAfter);
    if (!token || !pictogramId) return;
    const key = getPairKey(token, pictogramId);
    pairFrequency.set(key, (pairFrequency.get(key) || 0) + 1);
  });

  events.forEach(({ entry, createdAt }) => {
    const token = getCorrectionToken(entry);
    if (!token) return;

    if (REPLACEMENT_ACTIONS.has(entry.action)) {
      const pictogramId = normalizePictogramId(entry.pictogramIdAfter);
      if (!pictogramId) return;
      const state = getRuleState(rulesByToken, token);
      state.preferredPictogramId = pictogramId;
      state.preferredAt = createdAt;
      state.tombstones.delete(pictogramId);
      state.lastCorrectedAt = Math.max(state.lastCorrectedAt, createdAt);
      return;
    }

    if (DELETION_ACTIONS.has(entry.action)) {
      const pictogramId = normalizePictogramId(entry.pictogramIdBefore);
      const expiresAt = createdAt + safeRetention;
      if (!pictogramId || expiresAt <= currentTime) return;
      const state = getRuleState(rulesByToken, token);
      state.tombstones.set(pictogramId, {
        pictogramId,
        createdAt,
        expiresAt
      });
      if (
        state.preferredPictogramId === pictogramId &&
        createdAt >= (state.preferredAt || 0)
      ) {
        state.preferredPictogramId = null;
        state.preferredAt = null;
      }
      state.lastCorrectedAt = Math.max(state.lastCorrectedAt, createdAt);
    }
  });

  const rules = Array.from(rulesByToken.values())
    .map(state => {
      const preferredAt = state.preferredAt;
      const frequencyCount = state.preferredPictogramId
        ? pairFrequency.get(
            getPairKey(state.token, state.preferredPictogramId)
          ) || 0
        : 0;
      const age =
        preferredAt === null ? 0 : Math.max(0, currentTime - preferredAt);
      const recencyWeight =
        preferredAt === null
          ? 0
          : Math.pow(0.5, age / RECEIVER_CORRECTION_RECENCY_HALF_LIFE_MS);
      const tombstones = Array.from(state.tombstones.values()).sort(
        (left, right) =>
          right.createdAt - left.createdAt ||
          left.pictogramId.localeCompare(right.pictogramId)
      );

      return {
        token: state.token,
        preferredPictogramId: state.preferredPictogramId,
        blockedPictogramIds: tombstones.map(item => item.pictogramId),
        tombstones,
        frequencyCount,
        recencyWeight,
        score: frequencyCount * recencyWeight,
        lastCorrectedAt: state.lastCorrectedAt
      };
    })
    .filter(
      rule =>
        Boolean(rule.preferredPictogramId) ||
        rule.blockedPictogramIds.length > 0
    )
    .sort((left, right) => left.token.localeCompare(right.token));

  return {
    contractVersion: RECEIVER_CORRECTION_MEMORY_CONTRACT_VERSION,
    scope: 'workspace-local',
    workspaceId: normalizedWorkspaceId,
    generatedAt: currentTime,
    rules
  };
}

export function disableWorkspaceCorrectionMemoryToken(
  corrections,
  { workspaceId, token } = {}
) {
  const normalizedWorkspaceId = String(workspaceId || '').trim();
  const normalizedToken = normalizeReceiverCorrectionToken(token);
  let disabledCount = 0;
  const items = (Array.isArray(corrections) ? corrections : []).map(entry => {
    const isLearnedAction =
      entry &&
      (REPLACEMENT_ACTIONS.has(entry.action) ||
        DELETION_ACTIONS.has(entry.action));
    const shouldDisable =
      isLearnedAction &&
      entry.isUsedForLearning === true &&
      normalizedWorkspaceId &&
      String(entry.workspaceId || '').trim() === normalizedWorkspaceId &&
      getCorrectionToken(entry) === normalizedToken;

    if (!shouldDisable) return entry;
    disabledCount += 1;
    return {
      ...entry,
      isUsedForLearning: false
    };
  });

  return {
    changed: disabledCount > 0,
    disabledCount,
    items
  };
}

function getCatalogPictogramId(candidate) {
  return normalizePictogramId(
    candidate &&
      (candidate.id ||
        (candidate.tile &&
          (candidate.tile.id ||
            (candidate.tile.tile && candidate.tile.tile.id))))
  );
}

function getCatalogPictogramLabel(candidate, fallback) {
  return String(
    (candidate &&
      (candidate.displayLabel ||
        candidate.label ||
        (candidate.tile &&
          (candidate.tile.label ||
            (candidate.tile.tile && candidate.tile.tile.label))))) ||
      fallback ||
      ''
  ).trim();
}

export function buildCorrectionMemoryManagementRows(correctionMemory, catalog) {
  const rules =
    correctionMemory && Array.isArray(correctionMemory.rules)
      ? correctionMemory.rules
      : [];
  const catalogById = new Map(
    (Array.isArray(catalog) ? catalog : [])
      .map(candidate => [getCatalogPictogramId(candidate), candidate])
      .filter(([id]) => Boolean(id))
  );
  const labelFor = pictogramId =>
    getCatalogPictogramLabel(
      catalogById.get(normalizePictogramId(pictogramId)),
      pictogramId
    );

  return rules.map(rule => ({
    token: rule.token,
    preferredPictogramId: rule.preferredPictogramId,
    preferredLabel: rule.preferredPictogramId
      ? labelFor(rule.preferredPictogramId)
      : null,
    blockedPictogramIds: (rule.blockedPictogramIds || []).slice(),
    blockedLabels: (rule.blockedPictogramIds || []).map(labelFor),
    frequencyCount: rule.frequencyCount || 0,
    lastCorrectedAt: rule.lastCorrectedAt || 0
  }));
}

export function applyWorkspaceCorrectionMemory(
  matches,
  catalog,
  correctionMemory
) {
  const items = Array.isArray(matches) ? matches : [];
  const rules =
    correctionMemory && Array.isArray(correctionMemory.rules)
      ? correctionMemory.rules
      : [];

  if (!rules.length) return items;

  const rulesByToken = new Map(
    rules.map(rule => [
      normalizeReceiverCorrectionToken(rule && rule.token),
      rule
    ])
  );
  const catalogById = new Map(
    (Array.isArray(catalog) ? catalog : []).map(item => [
      normalizePictogramId(item && (item.id || (item.tile && item.tile.id))),
      item
    ])
  );

  return items.map(match => {
    const token = normalizeReceiverCorrectionToken(match && match.token);
    const rule = rulesByToken.get(token);
    if (!rule) return match;

    const preferred = catalogById.get(
      normalizePictogramId(rule.preferredPictogramId)
    );
    if (preferred) {
      return {
        ...match,
        tile: preferred,
        matchType: 'manual',
        source: 'corrected'
      };
    }

    const currentPictogramId = normalizePictogramId(
      match &&
        match.tile &&
        (match.tile.id || (match.tile.tile && match.tile.tile.id))
    );
    if (
      currentPictogramId &&
      (rule.blockedPictogramIds || []).includes(currentPictogramId)
    ) {
      return {
        ...match,
        tile: null,
        matchType: 'none',
        source: 'corrected'
      };
    }

    return match;
  });
}
