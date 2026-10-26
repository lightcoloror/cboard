import { createCommunicationRepository, COMMUNICATION_STORAGE_KEYS } from './repository';
import { createSavedPhrasePreparationService, SAVED_PHRASE_STARTERS, PREPARATION_STORAGE_KEY } from './savedPhrasePreparation';
import { buildReceiverLoopState, buildReceiverHistoryEntry, retainReceiverReviewItemAsText, restoreReceiverLoopState } from './receiverPipeline';

function fixture(maxItems = 100) {
  const values = new Map(); let failure = '', scope = 'a';
  const open = () => createCommunicationRepository({ maxItems, storage: {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => { if (key === failure) throw new Error('storage full'); values.set(key, value); }
  }});
  const repo = open();
  const service = createSavedPhrasePreparationService({ repository: repo, getScopeKey: () => scope });
  return { values, repo, service, open, fail: key => { failure = key; }, switchScope: () => { scope = 'b'; } };
}
function review(text) {
  const result = buildReceiverLoopState(text, []);
  let items = result.reviewItems;
  items.forEach(item => { if (!item.tile) items = retainReceiverReviewItemAsText(items, item.id); });
  return buildReceiverHistoryEntry(text, items);
}
test.each(SAVED_PHRASE_STARTERS)('starter $id stays optional, edits and saves once without history', template => {
  const { repo, service, open } = fixture();
  expect(service.load()).toBeNull(); expect(repo.loadCommunicationSavedPhrases()).toEqual([]);
  const original = repo.createReceiverDraft(buildReceiverHistoryEntry('原对话不要覆盖', []));
  const draft = service.start(template.id);
  expect(draft.pictogramSequence).toEqual([]);
  expect(() => service.start(template.id)).toThrow(/已有/);
  const entry = review(template.text);
  service.update(draft.id, entry);
  const restored = open().loadSavedPhrasePreparation();
  expect(restoreReceiverLoopState(restored, []).inputText).toBe(template.text);
  const saved = service.commit(draft.id, entry);
  expect(saved.ok).toBe(true); expect(saved.item.lifeContext).toBe(template.lifeContext);
  expect(service.commit(draft.id, entry).item.id).toBe(saved.item.id);
  expect(repo.loadCommunicationSavedPhrases()).toHaveLength(1);
  expect(repo.loadResumableReceiverRecord().id).toBe(original.id);
  expect(repo.loadCommunicationHistory()).toEqual([]);
});
test('editing invalidates old review, duplicate text never overwrites and cancel only clears preparation', () => {
  const { repo, service } = fixture();
  repo.saveCommunicationPhrase({ id: 'old', sentence: '我想喝水', lifeContext: '我的情境', output: [{ id: 'private', label: '水', image: 'private:geometry' }] });
  const before = repo.loadCommunicationSavedPhrases();
  const draft = service.start('meal-water'), entry = review('我想喝水');
  service.update(draft.id, entry);
  expect(service.commit(draft.id, entry).duplicate.id).toBe('old');
  expect(repo.loadCommunicationSavedPhrases()).toEqual(before);
  service.update(draft.id, { ...entry, inputText: '我不想喝水' });
  expect(service.load().pictogramSequence).toEqual([]);
  expect(() => service.commit(draft.id, entry)).toThrow(/复核/);
  service.discard(draft.id); expect(service.load()).toBeNull();
  expect(repo.loadCommunicationSavedPhrases()).toEqual(before);
});
test('quota and failed writes retain draft; cleanup retry cannot duplicate or lose favorite', () => {
  const f = fixture(1), d = f.service.start('out-home'), entry = review(d.inputText);
  f.service.update(d.id, entry);
  f.repo.loadCommunicationSavedPhrases(); // Complete first migration before faulting a subsequent save.
  f.fail(COMMUNICATION_STORAGE_KEYS.favoriteState);
  expect(() => f.service.commit(d.id, entry)).toThrow();
  expect(f.service.load().id).toBe(d.id); expect(f.repo.loadCommunicationSavedPhrases()).toHaveLength(0);
  f.fail(PREPARATION_STORAGE_KEY);
  expect(f.service.commit(d.id, entry).cleanupPending).toBe(true);
  expect(f.service.commit(d.id, entry).cleanupPending).toBe(true);
  expect(f.repo.loadCommunicationSavedPhrases()).toHaveLength(1);
  f.fail(''); expect(f.service.commit(d.id, entry).cleanupPending).toBe(false);
  const next = f.service.start('chat-disagree'); const nextEntry = review(next.inputText);
  f.service.update(next.id, nextEntry);
  expect(() => f.service.commit(next.id, nextEntry)).toThrow(/容量/);
  expect(f.service.load().id).toBe(next.id);
  expect(f.repo.loadCommunicationSavedPhrases()[0].id).toBe(`prepared_${d.id}`);
});
test('closed draft and changed profile reject delayed results', () => {
  const f = fixture(), d = f.service.start('rest-want');
  f.service.discard(d.id);
  expect(() => f.service.update(d.id, review(d.inputText))).toThrow(/关闭/);
  f.service.start('rest-quiet'); f.switchScope();
  expect(() => f.service.update(d.id, review(d.inputText))).toThrow(/档案/);
});
