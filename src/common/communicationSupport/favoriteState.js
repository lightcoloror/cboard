import { normalizeCommunicationSavedPhrases } from './storage';
import { normalizeSavedPhraseTombstone, normalizeSavedPhraseTombstones } from './savedPhraseSync';
import { LEGACY_COMMUNICATION_STORAGE_KEYS } from './legacy';

export const FAVORITE_STATE_KEY = 'cboard_communication_favorite_state_v1';
const PHRASES = 'cboard_communication_saved_phrases';
const TOMBSTONES = 'cboard_communication_saved_phrase_tombstones';
const PENDING = 'care-pending-favorites';
const copy = value => JSON.parse(JSON.stringify(value));
const missing = raw => raw === null || raw === undefined || raw === '';
const failure = text => Object.assign(new Error(text), { code: 'FAVORITE_STORAGE_FAILED' });
function checkedPhrases(values) {
  if (!Array.isArray(values)) throw failure('常用语列表不可读取，原数据已保留。');
  const ids = new Set();
  return values.map(value => {
    if (!value || typeof value !== 'object' || typeof value.sentence !== 'string' || !value.sentence.trim() ||
        (value.output !== undefined && !Array.isArray(value.output))) {
      throw failure('常用语条目不可读取，原数据已保留。');
    }
    // Normalize each entry without re-sorting the saved list or dropping a bad
    // entry. Migration must retain the user's order, not silently repair data.
    const item = normalizeCommunicationSavedPhrases([value])[0];
    if (!item || ids.has(item.id)) throw failure('常用语身份重复或不可读取，原数据已保留。');
    ids.add(item.id);
    return item;
  });
}
function checkedTombstones(values) {
  if (!Array.isArray(values) || values.some(value => !normalizeSavedPhraseTombstone(value))) {
    throw failure('删除记录不可读取，原数据已保留。');
  }
  return normalizeSavedPhraseTombstones(values);
}
function checkPending(value) {
  if (value === null) return;
  if (Array.isArray(value)) { checkedPhrases(value); return; }
  if (!value || typeof value !== 'object') throw failure('收藏同步待办不可读取，原数据已保留。');
  checkedPhrases(value.items);
  if (value.base !== undefined) checkedPhrases(value.base);
}

// One canonical commit replaces three independently written values. Legacy data
// is read only on first migration; an explicitly empty list always wins.
export function createFavoriteStateStore(storage) {
  const scope = () => storage.getScopeKey ? storage.getScopeKey() : 'local';
  const capturedScope = scope();
  const assertScope = () => {
    if (scope() !== capturedScope) throw failure('账号或档案已切换，请重新打开常用语。');
  };
  const list = (key, fallback) => {
    let raw = storage.getItem(key);
    if (missing(raw) && fallback) raw = storage.getItem(fallback);
    if (missing(raw)) return [];
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) throw failure('常用语旧数据不可读取，原数据已保留。');
    return value;
  };
  const validate = value => {
    if (!value || value.version !== 1 || value.scope !== capturedScope ||
        typeof value.generation !== 'string' || !value.generation ||
        !Number.isSafeInteger(value.revision) || value.revision < 0 ||
        !Array.isArray(value.phrases) || !Array.isArray(value.tombstones) ||
        !(value.pending === null || (value.pending && typeof value.pending === 'object'))) {
      throw failure('常用语数据版本、范围或内容不可读取，原数据已保留。');
    }
    checkedPhrases(value.phrases);
    checkedTombstones(value.tombstones);
    checkPending(value.pending);
    return value;
  };
  const write = value => {
    assertScope();
    const raw = JSON.stringify(validate(value));
    if (storage.setItem(FAVORITE_STATE_KEY, raw) === false) throw failure('常用语未能保存到本机，请重试。');
    assertScope();
    if (storage.getItem(FAVORITE_STATE_KEY) !== raw) throw failure('常用语保存后核对失败，请保留当前内容并重试。');
    return copy(value);
  };
  function read() {
    assertScope();
    const raw = storage.getItem(FAVORITE_STATE_KEY);
    if (!missing(raw)) return copy(validate(JSON.parse(raw)));
    const tombstones = checkedTombstones(list(TOMBSTONES));
    const removed = new Set(tombstones.map(t => t.id));
    const pendingRaw = storage.getItem(PENDING);
    const pending = missing(pendingRaw) ? null : JSON.parse(pendingRaw);
    checkPending(pending);
    return write({ version: 1, scope: capturedScope, revision: 0, generation: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      phrases: checkedPhrases(list(PHRASES, LEGACY_COMMUNICATION_STORAGE_KEYS.savedPhrases)).filter(p => !removed.has(p.id)),
      tombstones, pending });
  }
  function commit(expected, changes) {
    assertScope();
    const current = read();
    const tombstones = checkedTombstones([...expected.tombstones, ...(changes.tombstones || [])]);
    const removed = new Set(tombstones.map(t => t.id));
    const next = { ...expected, ...changes, version: 1, scope: capturedScope,
      revision: expected.revision + 1, tombstones,
      phrases: checkedPhrases(changes.phrases === undefined ? expected.phrases : changes.phrases).filter(p => !removed.has(p.id)) };
    if (storage.prepareFavoriteCommit) next.pending = storage.prepareFavoriteCommit(expected, next);
    // Includes write-success/readback-failure retries, without replaying a stale
    // mutation over a later update or a newly selected profile.
    if (JSON.stringify(current) === JSON.stringify(next)) return current;
    if (JSON.stringify(current) !== JSON.stringify(expected)) throw failure('常用语已发生变化，请重新查看；当前编辑内容仍保留。');
    if (JSON.stringify({ ...next, revision: current.revision }) === JSON.stringify(current)) return current;
    return write(next);
  }
  return { read, commit };
}
