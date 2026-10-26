import { createCommunicationRepository, COMMUNICATION_STORAGE_KEYS as K } from './repository';
import { buildReceiverHistoryEntry } from './receiverPipeline';
import { createSavedPhrasePreparationService } from './savedPhrasePreparation';

function fixture() {
  const values = new Map();
  let silent = '', fail = '', failReadAfterWrite = '', unreadable = '';
  const storage = {
    getItem: key => { if (key === unreadable) { unreadable = ''; throw new Error('synthetic receipt failure'); } return values.get(key) || null; },
    setItem: (key, value) => {
      if (key === fail) throw new Error('synthetic write failure');
      if (key !== silent) values.set(key, value);
      if (key === failReadAfterWrite) { unreadable = key; failReadAfterWrite = ''; }
    },
    removeItem: key => values.delete(key)
  };
  let id = 0;
  const open = () => createCommunicationRepository({ storage, createId: prefix => `${prefix}-${++id}` });
  const repository = open();
  return { repository, open, values, receiptFailure: key => { failReadAfterWrite = key; }, silent: key => { silent = key; }, fail: key => { fail = key; } };
}
const entry = text => buildReceiverHistoryEntry(text, []);

test('receiver retry recognizes a committed write when the UI rebuilt the entry timestamp', () => {
  const f = fixture(), draft = f.repository.createReceiverDraft(entry('我想喝水'));
  f.receiptFailure(K.receiverRecords);
  expect(() => f.repository.updateReceiverDraft(draft, { ...entry('我不想喝水'), createdAt: 100 })).toThrow();
  const recovered = f.open().updateReceiverDraft(draft, { ...entry('我不想喝水'), createdAt: 200 });
  expect(recovered.inputText).toBe('我不想喝水');
  expect(f.repository.updateReceiverDraft(recovered, entry('明早七点半回家')).inputText).toBe('明早七点半回家');
  expect(() => f.repository.updateReceiverDraft(draft, entry('迟到的旧内容'))).toThrow();
});

test('receiver silent write cannot be returned as a successfully saved input', () => {
  const f = fixture();
  const draft = f.repository.createReceiverDraft(entry('我今晚不回家吃饭'));
  f.silent(K.receiverRecords);
  expect(() => f.repository.updateReceiverDraft(draft, entry('明早七点半回家'))).toThrow();
  expect(f.open().loadReceiverRecords()[0].inputText).toBe('我今晚不回家吃饭');
});

test('preparation silent write retains previous draft and reports failure', () => {
  const f = fixture(), service = createSavedPhrasePreparationService({ repository: f.repository });
  const draft = service.start('meal-water');
  f.silent(K.savedPhrasePreparation);
  expect(() => service.update(draft.id, entry('我不想喝水'))).toThrow();
  expect(service.load().inputText).toBe('我想喝水');
});

test('confirmed receiver retries incomplete history with same identity', () => {
  const f = fixture(), draft = f.repository.createReceiverDraft(entry('我想喝水'));
  f.fail(K.history);
  expect(() => f.repository.confirmReceiverDraft(draft, entry('我想喝水'))).toThrow();
  f.fail('');
  f.repository.confirmReceiverDraft(draft, entry('我想喝水'));
  f.repository.confirmReceiverDraft(draft, entry('我想喝水'));
  expect(f.open().loadCommunicationHistory().filter(row => row.id === draft.id)).toHaveLength(1);
});

test('late receiver update cannot resurrect a discarded draft or overwrite a newer revision', () => {
  const f = fixture(), draft = f.repository.createReceiverDraft(entry('我想喝水'));
  const next = f.repository.updateReceiverDraft(draft, entry('我不想喝水'));
  expect(() => f.repository.updateReceiverDraft(draft, entry('旧回调'))).toThrow();
  expect(() => f.repository.discardResumableReceiverRecord(draft.id, { expected: draft })).toThrow();
  f.repository.discardResumableReceiverRecord(next.id);
  expect(() => f.repository.updateReceiverDraft(next, entry('迟到回调'))).toThrow();
  expect(f.open().loadReceiverRecords()).toHaveLength(0);
});

test.each([K.receiverRecords, K.savedPhrasePreparation])('damaged %s cannot be normalized to empty and overwritten', key => {
  const f = fixture();
  f.values.set(key, '{damaged');
  expect(() => key === K.receiverRecords
    ? f.repository.createReceiverDraft(entry('新输入'))
    : createSavedPhrasePreparationService({ repository: f.repository }).start('meal-water')).toThrow();
  expect(f.values.get(key)).toBe('{damaged');
});

test('a second preparation editor cannot overwrite newer work or cancel it', () => {
  const f = fixture();
  const first = createSavedPhrasePreparationService({ repository: f.repository });
  const draft = first.start('meal-water');
  const second = createSavedPhrasePreparationService({ repository: f.open() });
  second.load();
  first.update(draft.id, entry('我不想喝水'));
  expect(() => second.update(draft.id, entry('旧页面'))).toThrow();
  expect(() => second.discard(draft.id)).toThrow();
  expect(first.load().inputText).toBe('我不想喝水');
});

test('preparation retry recognizes its committed write despite a failed receipt', () => {
  const f = fixture(), service = createSavedPhrasePreparationService({ repository: f.repository });
  const draft = service.start('meal-water');
  f.receiptFailure(K.savedPhrasePreparation);
  expect(() => service.update(draft.id, entry('我不想喝水'))).toThrow();
  expect(service.update(draft.id, entry('我不想喝水')).inputText).toBe('我不想喝水');
  expect(service.load().id).toBe(draft.id);
});
