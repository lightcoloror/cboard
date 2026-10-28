import { getPictogramAttribution, DEVICE_PRIVATE_PICTOGRAM_PROVIDER } from './pictogramAttribution';
export const COMMUNICATION_SAVED_PHRASE_EXPORT_VERSION = 1;
export const COMMUNICATION_SAVED_PHRASE_EXPORT_FORMAT =
  'cboard-communication-saved-phrases';
export const DEFAULT_COMMUNICATION_QUICK_PHRASE_LIMIT = 6;
export const DEFAULT_SAVED_PHRASE_CAPACITY = 100;

// Share the existing limit across local commits and sync; never make room by
// dropping an older phrase. Imported historical over-limit lists remain readable.
export function assertSavedPhraseCapacity(entries, capacity = DEFAULT_SAVED_PHRASE_CAPACITY, message) {
  if (entries.length <= capacity) return;
  throw Object.assign(new Error(message || `常用语已达到容量上限（${capacity}条），请先整理已有收藏；当前内容已保留。`), {
    code: 'SAVED_PHRASE_CAPACITY', capacity, count: entries.length
  });
}

// Local organization of reviewed favorites, never a model prompt or location.
export const DEFAULT_LIFE_CONTEXTS = Object.freeze(['吃饭', '洗漱', '出门', '休息', '就医', '聊天']);
export function normalizeLifeContext(value) {
  return typeof value === 'string'
    ? Array.from(value.trim().replace(/\s+/g, ' ')).slice(0, 40).join('')
    : '';
}

// Compare authored content, not usage counters or object key order.
export function savedPhraseContentKey(item) {
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.keys(value).sort().reduce((out, key) => { if (value[key] !== undefined) out[key] = stable(value[key]); return out; }, {}) : value;
  return JSON.stringify(stable({ sentence: (item && item.sentence) || '', lifeContext: normalizeLifeContext(item && item.lifeContext),
    output: ((item && item.output) || []).map(tile => tile.textOnly ? { ...tile, id: '' } : tile) }));
}

export function getSavedPhraseLifeContexts(entries) {
  return [...new Set([...DEFAULT_LIFE_CONTEXTS, ...(entries || []).map(item => normalizeLifeContext(item.lifeContext)).filter(Boolean)])];
}

export function filterSavedPhrasesByLifeContext(entries, context = null) {
  return (entries || []).filter(item => context === null || normalizeLifeContext(item.lifeContext) === normalizeLifeContext(context));
}

export function assignSavedPhraseLifeContext(entries, id, context) {
  const value = normalizeLifeContext(context);
  let changed = false;
  const items = (entries || []).map(item => {
    if (item.id !== id || normalizeLifeContext(item.lifeContext) === value) return item;
    changed = true;
    // Organization is local metadata, not a new revision of someone's expression.
    return { ...item, lifeContext: value };
  });
  return { changed, items };
}

export function preserveLocalPhraseLifeContext(entry, local) {
  const result = { ...entry };
  delete result.lifeContext;
  if (local && local.id === entry.id && Object.prototype.hasOwnProperty.call(local, 'lifeContext')) {
    result.lifeContext = normalizeLifeContext(local.lifeContext);
  }
  return result;
}

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
    ...(Object.prototype.hasOwnProperty.call(entry, 'lifeContext') ? { lifeContext: normalizeLifeContext(entry.lifeContext) } : {}),
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
  const phrases = normalizeCommunicationSavedPhraseList(entries).map(item => {
    const exported = { ...item, pictogramIds: item.output.map(output => output.id).filter(Boolean) };
    ['sourceSnapshot', 'sourcePhraseId', 'preparationMode', 'alignmentUnavailable', 'preparationVersion', 'templateId'].forEach(key => delete exported[key]);
    return exported;
  });

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
    excludedIds = new Set(),
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
      wouldAddCount: 0,
      availableSlots: Math.max(0, (Number.isInteger(maxItems) && maxItems > 0 ? maxItems : 100) - current.length),
      skippedCount: 0,
      missingPictogramCount: 0
    };
  }

  const knownIds = availableTileIds instanceof Set ? availableTileIds : null;
  const missingIds = new Set();
  const existingIds = new Set([...current.map(item => item.id), ...excludedIds]);
  const existingSentences = new Set(
    current.map(item => normalizeSentenceKey(item.sentence))
  );
  const additions = [];
  let skippedCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  parsed.phrases.forEach(rawPhrase => {
    if (!rawPhrase || typeof rawPhrase !== 'object') {
      skippedCount += 1;
      invalidCount += 1;
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

    (rawOutput.length ? rawOutput : requestedIds.map(id => ({ id, label: '' }))).forEach(snapshot => {
      const id = snapshot.id;
      if (snapshot.textOnly) { output.push(snapshot); return; }
      const resolved =
        typeof resolveTile === 'function' ? resolveTile(id) : null;
      const isKnown = !knownIds || knownIds.has(id);
      const attribution = getPictogramAttribution(snapshot);
      const isPrivate = (attribution && attribution.provider === DEVICE_PRIVATE_PICTOGRAM_PROVIDER) || Boolean(snapshot.personId);
      // A foreign private reference must not bind to a different local person.
      if (isPrivate && (!resolved || resolved.image !== snapshot.image || resolved.label !== snapshot.label)) {
        missingIds.add(id || snapshot.label);
        output.push({ id: `missing-${output.length}`, label: snapshot.label, textOnly: true });
        return;
      }

      if (resolved) {
        output.push(isPrivate ? snapshot : { ...resolved, ...(snapshot.label ? { label: snapshot.label } : {}) });
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
      if (candidate) duplicateCount += 1;
      else invalidCount += 1;
      return;
    }

    existingIds.add(candidate.id);
    existingSentences.add(sentenceKey);
    additions.push(candidate);
  });

  const limit = Number.isInteger(maxItems) && maxItems > 0 ? maxItems : 100;
  const availableSlots = Math.max(0, limit - current.length);
  const capacityExceeded = additions.length > availableSlots;

  return {
    ok: !capacityExceeded,
    ...(capacityExceeded ? { error: '容量不足，本次整批暂停导入；原收藏保持不变。' } : {}),
    items: capacityExceeded ? current : [...additions, ...current],
    addedCount: capacityExceeded ? 0 : additions.length,
    wouldAddCount: additions.length, availableSlots, capacityExceeded, duplicateCount, invalidCount,
    skippedCount,
    missingPictogramCount: missingIds.size
  };
}

// Shared two-phase import. The file and baseline stay in this local operation;
// confirming a stale preview never overwrites another action's saved list.
export function createSavedPhraseImportService({ repository, getScopeKey = () => 'local', ...options }) {
  const currentScope = () => JSON.stringify([getScopeKey(), repository.loadCommunicationIdentity()]);
  const scope = currentScope();
  let pending = null;
  let completed = null;
  const deletedIds = () => typeof repository.loadCommunicationSavedPhraseTombstones === 'function'
    ? repository.loadCommunicationSavedPhraseTombstones().map(item => item.id).sort() : [];
  const baseline = items => JSON.stringify([items, deletedIds()]);
  const assertScope = () => { if (scope !== currentScope()) throw new Error('当前档案已切换，请重新选择导入文件。'); };
  const inspect = input => {
    assertScope();
    completed = null;
    const items = repository.loadCommunicationSavedPhrases();
    const result = importCommunicationSavedPhrases(input, items, { ...options, excludedIds: new Set(deletedIds()), maxItems: repository.savedPhraseCapacity });
    pending = { input, baseline: baseline(items), result };
    return result;
  };
  return {
    preview: inspect,
    cancel() { pending = null; completed = null; },
    commit() {
      assertScope();
      const items = repository.loadCommunicationSavedPhrases();
      // A second click or a UI callback failure must not turn a successful
      // write into another import. The receipt is valid only for this list.
      if (!pending && completed && baseline(items) === completed.baseline) return completed.result;
      if (!pending) throw new Error('请先选择文件并查看导入预览。');
      if (baseline(items) !== pending.baseline) return { ...inspect(pending.input), ok: false, refreshed: true, message: '收藏已变化，预览已刷新，请重新确认。' };
      if (!pending.result.ok) return pending.result;
      const result = pending.result;
      if (result.addedCount) repository.overwriteCommunicationSavedPhrases(result.items);
      const savedItems = repository.loadCommunicationSavedPhrases();
      completed = { baseline: baseline(savedItems), result: { ...result, items: savedItems, committed: true } };
      pending = null;
      return completed.result;
    }
  };
}
