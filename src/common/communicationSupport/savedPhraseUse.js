import { normalizeCommunicationSavedPhrase, savedPhraseContentKey } from './savedPhraseManagement';

// Device memory only. Management screens may unmount without ending this session.
let activeScope = null;
let operations = [];
let receipts = new Map();
let serial = 0;
export const MAX_SAVED_PHRASE_UNDO = 20;

export function filterSavedPhrasesByText(items, query = '') {
  const text = String(query || '').trim().toLocaleLowerCase();
  return (Array.isArray(items) ? items : []).filter(item =>
    !text || String(item.sentence || '').toLocaleLowerCase().includes(text)
  );
}

export function clearSavedPhraseUndoSession() {
  activeScope = null;
  operations = [];
  receipts = new Map();
}

export function createSavedPhraseUndoService({
  repository, getScopeKey = () => 'local', now = Date.now, canManage = () => true
}) {
  const scopeKey = () => {
    const identity = repository.loadCommunicationIdentity();
    return JSON.stringify([getScopeKey(), identity.workspaceId, identity.patientId]);
  };
  const initialScope = scopeKey();
  function checkScope() {
    const current = scopeKey();
    if (activeScope !== current) {
      operations = [];
      receipts = new Map();
      activeScope = current;
    }
    if (current !== initialScope) throw new Error('当前档案已切换，撤销记录已清空。');
  }
  function checkPermission(item) {
    if (!canManage() || (item && item.careSharedReadOnly)) {
      throw new Error('这条常用语为只读，不能删除或恢复。');
    }
  }
  const state = () => {
    checkScope();
    const last = operations[operations.length - 1];
    return { count: operations.length, operationId: last ? last.operationId : null };
  };
  checkScope();
  return {
    state,
    clear: clearSavedPhraseUndoSession,
    delete(id) {
      checkScope();
      const current = repository.loadCommunicationSavedPhrases();
      const item = current.find(entry => entry.id === id);
      checkPermission(item);
      if (!item) return { changed: false, items: current, ...state() };
      let operation = operations.find(entry => entry.originalId === id);
      if (!operation) {
        const operationId = `${now().toString(36)}_${++serial}`;
        operation = {
          operationId, originalId: id, index: current.indexOf(item),
          snapshot: JSON.parse(JSON.stringify(item)),
          restoredId: `phrase_restored_${operationId}`
        };
        // Retain the snapshot even if a multi-key storage write partially fails.
        operations = [...operations, operation].slice(-MAX_SAVED_PHRASE_UNDO);
      }
      try { repository.deleteCommunicationSavedPhrase(id); }
      catch (_) { throw new Error('删除未能完整保存，恢复快照仍保留，请重试或撤销。'); }
      const items = repository.loadCommunicationSavedPhrases();
      if (items.some(entry => entry.id === id)) throw new Error('删除未能保存，请重试。');
      return { changed: true, items, ...state() };
    },
    undo(operationId) {
      checkScope();
      checkPermission();
      const current = repository.loadCommunicationSavedPhrases();
      const receipt = receipts.get(operationId);
      if (receipt) {
        const item = current.find(entry => entry.id === receipt.id);
        if (!item || savedPhraseContentKey(item) !== savedPhraseContentKey(receipt)) {
          throw new Error('恢复后的常用语已变化，不会覆盖当前内容。');
        }
        return { changed: false, item, items: current, ...state() };
      }
      const operation = operations[operations.length - 1];
      if (!operation || operation.operationId !== operationId) {
        throw new Error('撤销状态已变化，请重新查看。');
      }
      const original = current.find(entry => entry.id === operation.originalId);
      if (original) {
        if (savedPhraseContentKey(original) !== savedPhraseContentKey(operation.snapshot)) {
          throw new Error('原条目已变化，不会覆盖当前内容。');
        }
        operations.pop();
        receipts.set(operationId, original);
        return { changed: false, item: original, items: current, ...state() };
      }
      // Whitelist user content; never restore old server revisions or permissions.
      const { sentence, output, lifeContext, createdAt, lastUsedAt, usageCount, contractVersion } = operation.snapshot;
      const restored = normalizeCommunicationSavedPhrase({
        id: operation.restoredId, sentence, output, lifeContext,
        createdAt, lastUsedAt, usageCount, contractVersion, updatedAt: now()
      }, { now });
      const existing = current.find(item => item.id === restored.id);
      if (existing && savedPhraseContentKey(existing) !== savedPhraseContentKey(restored)) {
        throw new Error('恢复后的常用语已变化，不会覆盖当前内容。');
      }
      if (!existing) {
        if (current.some(item => item.sentence.trim().toLocaleLowerCase() === sentence.trim().toLocaleLowerCase())) {
          throw new Error('已有相同文字的常用语，请先查看已有条目；撤销记录仍保留。');
        }
        if (current.length >= repository.savedPhraseCapacity) {
          throw new Error('常用语容量已满，未恢复或删除任何其他收藏；撤销记录仍保留。');
        }
        const next = [...current];
        next.splice(Math.min(operation.index, current.length), 0, restored);
        try { repository.overwriteCommunicationSavedPhrases(next); }
        catch (_) { throw new Error('恢复未能完整保存，撤销记录仍保留，请重试。'); }
      }
      const items = repository.loadCommunicationSavedPhrases();
      const item = items.find(entry => entry.id === restored.id);
      if (!item || savedPhraseContentKey(item) !== savedPhraseContentKey(restored)) {
        throw new Error('恢复未能保存，请重试。');
      }
      operations.pop();
      receipts.set(operationId, item);
      if (receipts.size > MAX_SAVED_PHRASE_UNDO) receipts.delete(receipts.keys().next().value);
      return { changed: !existing, item, items, ...state() };
    }
  };
}
