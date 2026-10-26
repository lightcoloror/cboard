import { buildReceiverHistoryEntry } from './receiverPipeline';
import { createReceiverDraftEntry, updateReceiverDraftEntry } from './receiverLifecycle';
import { addCommunicationSavedPhrase, normalizeLifeContext, normalizeCommunicationSavedPhrase, savedPhraseContentKey } from './savedPhraseManagement';

// Text-only starting points, never evidence of a person's wishes or history.
export const SAVED_PHRASE_STARTERS = [
  ['meal-water', '吃饭', '我想喝水'], ['meal-no-food', '吃饭', '我不想吃饭'],
  ['wash-teeth', '洗漱', '我要刷牙'], ['wash-hands', '洗漱', '请帮我洗手'],
  ['out-go', '出门', '我想出门'], ['out-home', '出门', '我想回家'],
  ['rest-want', '休息', '我想休息'], ['rest-quiet', '休息', '请安静一点'],
  ['care-unwell', '就医', '我不舒服'], ['care-repeat', '就医', '请再说一遍'],
  ['chat-want', '聊天', '我想聊一会儿'], ['chat-disagree', '聊天', '我不同意']
].map(([id, lifeContext, text]) => Object.freeze({ id, lifeContext, text }));

export const PREPARATION_STORAGE_KEY = 'cboard_communication_phrase_preparation';

// Favorites contain ordered snapshots, not a reliable alignment with the sentence.
// Keep occurrence indices (including repeated IDs); never guess character spans.
function favoriteEntry(item) {
  const output = JSON.parse(JSON.stringify(item.output || []));
  return { ...buildReceiverHistoryEntry(item.sentence, []), output,
    pictogramSequence: output.map((tile, index) => ({
      pictogramId: tile.textOnly ? null : tile.id, label: tile.label,
      originalToken: tile.label, source: 'manual', matchType: 'exact',
      ...(tile.textOnly ? { textOnly: true } : {}), preparedOutputIndex: index
    })) };
}

function samePreparedOutput(left, right) {
  const content = items => (items || []).map(item => item.textOnly ? { ...item, id: '' } : item);
  return JSON.stringify(content(left)) === JSON.stringify(content(right));
}

// The existing adapter supplies account/workspace/profile isolation. Capture its
// scope at opening as well: delayed callbacks may not follow a newly selected user.
export function createSavedPhrasePreparationService({ repository, getScopeKey = () => 'local', now = Date.now }) {
  const scopeKey = () => JSON.stringify([getScopeKey(), repository.loadCommunicationIdentity().workspaceId, repository.loadCommunicationIdentity().patientId]);
  const scope = scopeKey();
  const assertScope = () => {
    if (scope !== scopeKey()) throw new Error('当前档案已切换，请重新打开准备常用表达。');
  };
  let observed;
  let attempted;
  const writeContent = value => {
    if (!value) return JSON.stringify(value);
    const { updatedAt, ...content } = value;
    return JSON.stringify(content);
  };
  const read = () => { assertScope(); return repository.loadSavedPhrasePreparation(); };
  const load = () => { observed = read(); return observed; };
  const save = draft => {
    assertScope();
    const current = repository.loadSavedPhrasePreparation();
    if (observed !== undefined && JSON.stringify(current) !== JSON.stringify(observed)) {
      if (attempted && JSON.stringify(current) === attempted.desired &&
          writeContent(draft) === attempted.content) { observed = current; return current; }
      throw new Error('准备草稿已有新内容，请重新打开；旧操作未覆盖。');
    }
    attempted = { desired: JSON.stringify(draft), content: writeContent(draft) };
    const saved = repository.writeSavedPhrasePreparation(draft, current);
    observed = saved;
    return saved;
  };
  const editReceipts = new Map();
  const finish = (item, id) => {
    let cleanupPending = false;
    try { const current = read(); if (current && current.id === id) save(null); } catch (_) { cleanupPending = true; }
    return { ok: true, item, cleanupPending };
  };
  return {
    load,
    start(templateId) {
      if (read()) throw new Error('已有准备草稿，请先继续或取消准备。');
      const template = SAVED_PHRASE_STARTERS.find(item => item.id === templateId);
      if (!template) throw new Error('参考表达不存在。');
      const draft = createReceiverDraftEntry(buildReceiverHistoryEntry(template.text, []), {
        identity: repository.loadCommunicationIdentity(), sessionId: 'phrase-preparation'
      });
      return save({ ...draft, templateId, lifeContext: template.lifeContext, preparationVersion: 1 });
    },
    startFromSavedPhrase(id, mode) {
      if (read()) throw new Error('已有准备草稿，请先继续或取消准备。');
      if (!['edit', 'copy'].includes(mode)) throw new Error('请选择修改或另存。');
      const item = repository.loadCommunicationSavedPhrases().find(value => value.id === id);
      if (!item || item.careSharedReadOnly) throw new Error('原收藏不可修改，请重新选择。');
      const draft = createReceiverDraftEntry(favoriteEntry(item), {
        identity: repository.loadCommunicationIdentity(), sessionId: 'phrase-preparation', now
      });
      return save({ ...draft, templateId: '', lifeContext: normalizeLifeContext(item.lifeContext),
        preparationVersion: 1, preparationMode: mode, sourcePhraseId: item.id,
        sourceSnapshot: JSON.parse(JSON.stringify(item)), alignmentUnavailable: true });
    },
    convertToCopy(id) {
      const current = read();
      if (!current || current.id !== id) throw new Error('准备草稿已关闭，请重新打开。');
      return save({ ...current, preparationMode: 'copy' });
    },
    update(id, entry, lifeContext) {
      const current = read();
      if (!current || current.id !== id) throw new Error('准备草稿已关闭，请重新打开。');
      const next = updateReceiverDraftEntry(current, entry);
      // Changing words invalidates old picture review even for non-UI callers.
      const changedText = current.inputText !== entry.inputText;
      const reviewed = changedText ? buildReceiverHistoryEntry(entry.inputText, []) : entry;
      return save({ ...current, ...next, ...reviewed, templateId: current.templateId,
        preparationVersion: 1, lifeContext: normalizeLifeContext(lifeContext === undefined ? current.lifeContext : lifeContext) });
    },
    discard(id) {
      const current = read();
      if (!current) return true;
      if (current.id !== id) throw new Error('准备草稿已变化，请重新打开。');
      save(null);
      return true;
    },
    commit(id, entry) {
      const current = read();
      if (current && current.id !== id) throw new Error('准备草稿已变化，请重新打开。');
      if (!current && editReceipts.has(id)) {
        const previous = editReceipts.get(id);
        const latest = repository.loadCommunicationSavedPhrases().find(item => item.id === previous.id);
        if (latest && savedPhraseContentKey(latest) === savedPhraseContentKey(previous) &&
            entry.inputText === latest.sentence && samePreparedOutput(entry.output, latest.output)) return finish(latest, id);
        return { ok: false, conflict: true, message: '这次修改已结束，不能覆盖之后的操作。' };
      }
      const editing = current && current.preparationMode === 'edit';
      // Stable favorite identity also covers a cleanup failure after the write.
      const favoriteId = editing ? current.sourcePhraseId : `prepared_${id}`;
      const items = repository.loadCommunicationSavedPhrases();
      const saved = items.find(item => item.id === favoriteId);
      if (saved && !editing) {
        if (saved.sentence !== entry.inputText || !samePreparedOutput(saved.output, entry.output))
          return { ok: false, duplicate: saved, message: '这份草稿已经收藏，修改不能覆盖原收藏；请查看已有收藏或重新准备。' };
        return finish(saved, id);
      }
      if (!current || current.id !== id) throw new Error('准备草稿已关闭，请重新打开。');
      if (!entry.inputText.trim() || current.inputText !== entry.inputText ||
          !current.pictogramSequence.length || !samePreparedOutput(current.output, entry.output) ||
          !entry.pictogramSequence.length || entry.pictogramSequence.some(item => item.source === 'unresolved') ||
          entry.output.length !== entry.pictogramSequence.length) {
        throw new Error('请重新匹配并复核图片；没有图片的词可以选择保留文字。');
      }
      if (repository.loadCommunicationSavedPhraseTombstones().some(item => item.id === favoriteId))
        return { ok: false, conflict: true, message: '原收藏已删除；草稿保留，可另存为新常用语。' };
      if (editing) {
        if (!saved || saved.careSharedReadOnly)
          return { ok: false, conflict: true, message: '原收藏不可用；草稿保留，可另存为新常用语。' };
        const desired = normalizeCommunicationSavedPhrase({ ...saved, sentence: entry.inputText,
          output: entry.output, lifeContext: current.lifeContext, updatedAt: now() });
        if (savedPhraseContentKey(saved) === savedPhraseContentKey(desired)) { editReceipts.set(id, saved); return finish(saved, id); }
        if (savedPhraseContentKey(saved) !== savedPhraseContentKey(current.sourceSnapshot))
          return { ok: false, conflict: true, message: '原收藏已变化，不能覆盖；请重新打开原条目或另存新句。' };
        const duplicate = items.find(item => item.id !== saved.id && item.sentence.trim().toLocaleLowerCase() === desired.sentence.toLocaleLowerCase());
        if (duplicate) return { ok: false, duplicate, message: '相同文字已收藏，请查看已有收藏。' };
        repository.overwriteCommunicationSavedPhrases(items.map(item => item.id === saved.id ? desired : item));
        const updated = repository.loadCommunicationSavedPhrases().find(item => item.id === saved.id);
        editReceipts.set(id, updated);
        return finish(updated, id);
      }
      const result = addCommunicationSavedPhrase(items, {
        id: favoriteId, sentence: entry.inputText, output: entry.output, lifeContext: current.lifeContext
      });
      if (!result.changed) return { ok: false, duplicate: result.item, message: '相同文字已收藏，请查看已有收藏；原图片和分类保持不变。' };
      if (items.length >= repository.savedPhraseCapacity) throw new Error('常用语已达到容量上限，请先整理已有收藏；准备草稿已保留。');
      repository.overwriteCommunicationSavedPhrases(result.items);
      return finish(result.item, id);
    }
  };
}
