export const COMMUNICATION_SAVED_PHRASE_EXPORT_VERSION = 1;
export const COMMUNICATION_SAVED_PHRASE_EXPORT_FORMAT =
  'cboard-communication-saved-phrases';
export const DEFAULT_COMMUNICATION_QUICK_PHRASE_LIMIT = 6;

const SUPPORTED_LEGACY_APP_IDS = new Set([
  'tuyujia',
  'picinterpreter',
  'cboard'
]);

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeSentenceKey(value) {
  return normalizeText(value).toLocaleLowerCase();
}

function normalizeTimestamp(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeUsageCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function normalizeOutput(value) {
  return (Array.isArray(value) ? value : [])
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      ...item,
      id: normalizeText(item.id),
      label: normalizeText(item.label)
    }))
    .filter(item => item.id || item.label);
}

function createFallbackId(sentence, timestamp) {
  let hash = 2166136261;
  const input = `${normalizeSentenceKey(sentence)}::${timestamp}`;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `phrase_${(hash >>> 0).toString(36)}`;
}

export function normalizeCommunicationSavedPhrase(
  entry,
  { now = Date.now, createId } = {}
) {
  if (!entry || typeof entry !== 'object') return null;

  const sentence = normalizeText(entry.sentence);
  if (!sentence) return null;

  const timestamp = typeof now === 'function' ? now() : Date.now();
  const createdAt = normalizeTimestamp(entry.createdAt, timestamp);
  const lastUsedAt = normalizeTimestamp(entry.lastUsedAt, createdAt);
  const id =
    normalizeText(entry.id) ||
    (typeof createId === 'function'
      ? normalizeText(createId('phrase'))
      : createFallbackId(sentence, createdAt));

  return {
    ...entry,
    id,
    sentence,
    output: normalizeOutput(entry.output),
    usageCount: normalizeUsageCount(entry.usageCount),
    createdAt,
    lastUsedAt,
    updatedAt: normalizeTimestamp(entry.updatedAt, createdAt)
  };
}

export function normalizeCommunicationSavedPhraseList(entries, options) {
  const seenIds = new Set();
  const seenSentences = new Set();

  return (Array.isArray(entries) ? entries : [])
    .map(entry => normalizeCommunicationSavedPhrase(entry, options))
    .filter(entry => {
      if (!entry) return false;
      const sentenceKey = normalizeSentenceKey(entry.sentence);
      if (seenIds.has(entry.id) || seenSentences.has(sentenceKey)) return false;
      seenIds.add(entry.id);
      seenSentences.add(sentenceKey);
      return true;
    });
}

export function addCommunicationSavedPhrase(entries, draft, options = {}) {
  const current = normalizeCommunicationSavedPhraseList(entries, options);
  const item = normalizeCommunicationSavedPhrase(draft, options);

  if (!item) {
    return { changed: false, reason: 'invalid', item: null, items: current };
  }

  const duplicate = current.find(
    existing =>
      existing.id === item.id ||
      normalizeSentenceKey(existing.sentence) ===
        normalizeSentenceKey(item.sentence)
  );

  if (duplicate) {
    return {
      changed: false,
      reason: 'duplicate',
      item: duplicate,
      items: current
    };
  }

  return {
    changed: true,
    reason: 'added',
    item,
    items: [item, ...current]
  };
}

export function renameCommunicationSavedPhrase(
  entries,
  id,
  sentence,
  { now = Date.now, ...options } = {}
) {
  const current = normalizeCommunicationSavedPhraseList(entries, {
    now,
    ...options
  });
  const normalizedId = normalizeText(id);
  const nextSentence = normalizeText(sentence);

  if (!normalizedId || !nextSentence) {
    return { changed: false, reason: 'invalid', item: null, items: current };
  }

  const duplicate = current.find(
    item =>
      item.id !== normalizedId &&
      normalizeSentenceKey(item.sentence) === normalizeSentenceKey(nextSentence)
  );
  if (duplicate) {
    return {
      changed: false,
      reason: 'duplicate',
      item: duplicate,
      items: current
    };
  }

  let renamed = null;
  const timestamp = typeof now === 'function' ? now() : Date.now();
  const items = current.map(item => {
    if (item.id !== normalizedId) return item;
    renamed = { ...item, sentence: nextSentence, updatedAt: timestamp };
    return renamed;
  });

  return {
    changed: Boolean(renamed),
    reason: renamed ? 'renamed' : 'not-found',
    item: renamed,
    items
  };
}

export function deleteCommunicationSavedPhrase(entries, id, options) {
  const current = normalizeCommunicationSavedPhraseList(entries, options);
  const normalizedId = normalizeText(id);
  const items = current.filter(item => item.id !== normalizedId);

  return {
    changed: items.length !== current.length,
    items
  };
}

export function markCommunicationSavedPhraseUsed(
  entries,
  id,
  { now = Date.now, ...options } = {}
) {
  const current = normalizeCommunicationSavedPhraseList(entries, {
    now,
    ...options
  });
  const timestamp = typeof now === 'function' ? now() : Date.now();
  let used = null;
  const items = current.map(item => {
    if (item.id !== normalizeText(id)) return item;
    used = {
      ...item,
      usageCount: item.usageCount + 1,
      lastUsedAt: timestamp,
      updatedAt: timestamp
    };
    return used;
  });

  return { changed: Boolean(used), item: used, items };
}

export function getCommunicationQuickPhrases(
  entries,
  limit = DEFAULT_COMMUNICATION_QUICK_PHRASE_LIMIT
) {
  const normalizedLimit =
    Number.isInteger(limit) && limit > 0
      ? limit
      : DEFAULT_COMMUNICATION_QUICK_PHRASE_LIMIT;

  return normalizeCommunicationSavedPhraseList(entries)
    .sort(
      (left, right) =>
        right.usageCount - left.usageCount ||
        right.lastUsedAt - left.lastUsedAt ||
        right.createdAt - left.createdAt
    )
    .slice(0, normalizedLimit);
}

export function buildCommunicationSavedPhraseExport(
  entries,
  { now = Date.now, appId = 'cboard' } = {}
) {
  const timestamp = typeof now === 'function' ? now() : Date.now();
  const phrases = normalizeCommunicationSavedPhraseList(entries).map(item => ({
    ...item,
    pictogramIds: item.output.map(output => output.id).filter(Boolean)
  }));

  return {
    format: COMMUNICATION_SAVED_PHRASE_EXPORT_FORMAT,
    version: COMMUNICATION_SAVED_PHRASE_EXPORT_VERSION,
    appId: normalizeText(appId) || 'cboard',
    exportedAt: new Date(timestamp).toISOString(),
    phrases
  };
}

function parseCommunicationSavedPhraseExport(input) {
  let parsed = input;

  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch (error) {
      return { ok: false, error: '文件格式无效，不是合法的 JSON' };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: '文件内容无效' };
  }

  const validFormat =
    parsed.format === COMMUNICATION_SAVED_PHRASE_EXPORT_FORMAT ||
    SUPPORTED_LEGACY_APP_IDS.has(normalizeText(parsed.appId));
  if (!validFormat) {
    return { ok: false, error: '不是支持的图语家或 CBoard 常用语文件' };
  }

  if (parsed.version !== COMMUNICATION_SAVED_PHRASE_EXPORT_VERSION) {
    return { ok: false, error: `不支持的文件版本：${parsed.version}` };
  }

  if (!Array.isArray(parsed.phrases)) {
    return { ok: false, error: '文件中没有短语列表' };
  }

  return { ok: true, phrases: parsed.phrases };
}

export function importCommunicationSavedPhrases(
  input,
  existingEntries,
  {
    availableTileIds,
    resolveTile,
    maxItems = 100,
    now = Date.now,
    createId
  } = {}
) {
  const parsed = parseCommunicationSavedPhraseExport(input);
  const current = normalizeCommunicationSavedPhraseList(existingEntries, {
    now,
    createId
  });

  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      items: current,
      addedCount: 0,
      skippedCount: 0,
      missingPictogramCount: 0
    };
  }

  const knownIds = availableTileIds instanceof Set ? availableTileIds : null;
  const missingIds = new Set();
  const existingIds = new Set(current.map(item => item.id));
  const existingSentences = new Set(
    current.map(item => normalizeSentenceKey(item.sentence))
  );
  const additions = [];
  let skippedCount = 0;

  parsed.phrases.forEach(rawPhrase => {
    if (!rawPhrase || typeof rawPhrase !== 'object') {
      skippedCount += 1;
      return;
    }

    const legacyIds = Array.isArray(rawPhrase.pictogramIds)
      ? rawPhrase.pictogramIds.map(normalizeText).filter(Boolean)
      : [];
    const rawOutput = normalizeOutput(rawPhrase.output);
    const requestedIds = rawOutput.length
      ? rawOutput.map(item => item.id).filter(Boolean)
      : legacyIds;
    const output = [];

    requestedIds.forEach(id => {
      const resolved =
        typeof resolveTile === 'function' ? resolveTile(id) : null;
      const snapshot = rawOutput.find(item => item.id === id);
      const isKnown = !knownIds || knownIds.has(id);

      if (resolved) {
        output.push(resolved);
      } else if (!isKnown) {
        missingIds.add(id);
      } else {
        output.push(snapshot || { id, label: '' });
      }
    });

    const candidate = normalizeCommunicationSavedPhrase(
      { ...rawPhrase, output },
      { now, createId }
    );
    const sentenceKey = candidate
      ? normalizeSentenceKey(candidate.sentence)
      : '';

    if (
      !candidate ||
      existingIds.has(candidate.id) ||
      existingSentences.has(sentenceKey)
    ) {
      skippedCount += 1;
      return;
    }

    existingIds.add(candidate.id);
    existingSentences.add(sentenceKey);
    additions.push(candidate);
  });

  const limit = Number.isInteger(maxItems) && maxItems > 0 ? maxItems : 100;

  return {
    ok: true,
    items: [...additions, ...current].slice(0, limit),
    addedCount: additions.length,
    skippedCount,
    missingPictogramCount: missingIds.size
  };
}
