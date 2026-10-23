import { createCommunicationRepository, COMMUNICATION_STORAGE_KEYS } from './repository';
import { createSavedPhraseUndoService, clearSavedPhraseUndoSession, filterSavedPhrasesByText } from './savedPhraseUse';

const phrase = (id, extra = {}) => ({
  id, sentence: `合成${id}今晚不回家吃饭`, lifeContext: '吃饭', usageCount: 3, createdAt: 10, lastUsedAt: 20,
  output: [{ id: 'same', label: '合成人物', personId: 'a', image: 'data:image/png;base64,YQ==' },
    { id: 'same', label: '合成人物', personId: 'b', image: 'data:image/png;base64,Yg==' }], ...extra
});
function fixture(capacity = 100) {
  let scope = 'a', fail = '', afterWrite = false;
  const values = new Map();
  const repository = createCommunicationRepository({ maxItems: capacity, storage: {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => {
      if (afterWrite) values.set(key, value);
      if (key === fail) throw new Error('synthetic failure');
      values.set(key, value);
    }
  }});
  const open = () => createSavedPhraseUndoService({ repository, getScopeKey: () => scope, now: () => 100 });
  return { repository, open, service: open(), values,
    fail: (key, after = false) => { fail = key; afterWrite = after; }, switchScope: () => { scope = 'b'; } };
}
beforeEach(clearSavedPhraseUndoSession);
test('search only original sentence, keeps order and does not mutate', () => {
  const items = [phrase('a'), phrase('b', { sentence: '我想喝水' })];
  expect(filterSavedPhrasesByText(items, ' 不回家 ')).toEqual([items[0]]);
  expect(filterSavedPhrasesByText(items, 'personId')).toEqual([]);
  expect(filterSavedPhrasesByText(items, '')).toEqual(items);
});
test('consecutive undo preserves exact snapshots, other changes, tombstones and stable new IDs', () => {
  const f = fixture();
  const initial = [phrase('a', { serverVersion: 4 }), phrase('b'), phrase('c')];
  f.repository.overwriteCommunicationSavedPhrases(initial);
  for (const item of initial) f.service.delete(item.id);
  f.repository.saveCommunicationPhrase(phrase('later'));
  for (const previous of [...initial].reverse()) {
    const op = f.service.state().operationId;
    const result = f.open().undo(op);
    expect(result.item.output).toEqual(previous.output);
    expect(result.item.id).not.toBe(previous.id);
    expect(result.item).not.toHaveProperty('serverVersion');
    expect(result.item).toMatchObject({ sentence: previous.sentence, lifeContext: '吃饭', usageCount: 3, createdAt: 10 });
    expect(f.service.undo(op).changed).toBe(false);
  }
  expect(f.repository.loadCommunicationSavedPhrases()).toHaveLength(4);
  expect(f.repository.loadCommunicationSavedPhraseTombstones()).toHaveLength(3);
});
test('capacity, duplicate text and read-only do not overwrite; retry succeeds', () => {
  const f = fixture(1); f.repository.saveCommunicationPhrase(phrase('a'));
  f.service.delete('a'); const op = f.service.state().operationId;
  f.repository.saveCommunicationPhrase(phrase('b'));
  expect(() => f.service.undo(op)).toThrow(/容量/);
  expect(f.service.state().count).toBe(1);
  f.repository.overwriteCommunicationSavedPhrases([phrase('b', { sentence: phrase('a').sentence })]);
  expect(() => f.service.undo(op)).toThrow(/相同/);
  const readOnly = createSavedPhraseUndoService({
    repository: f.repository, getScopeKey: () => 'a', canManage: () => false
  });
  expect(() => readOnly.delete('b')).toThrow(/只读/);
  f.repository.overwriteCommunicationSavedPhrases([]);
  expect(f.service.undo(op).item.sentence).toBe(phrase('a').sentence);
});
test.each([false, true])('storage failure before/after write keeps retry safe (%s)', after => {
  const f = fixture(); f.repository.saveCommunicationPhrase(phrase('a'));
  f.service.delete('a'); const op = f.service.state().operationId;
  f.fail(COMMUNICATION_STORAGE_KEYS.favoriteState, after);
  expect(() => f.service.undo(op)).toThrow();
  expect(f.service.state().count).toBe(1);
  f.fail('');
  f.service.undo(op); f.service.undo(op);
  expect(f.repository.loadCommunicationSavedPhrases()).toHaveLength(1);
});
test('partial deletion remains undoable without restoring old ID', () => {
  const f = fixture(); f.repository.saveCommunicationPhrase(phrase('a'));
  f.fail(COMMUNICATION_STORAGE_KEYS.favoriteState, true);
  expect(() => f.service.delete('a')).toThrow();
  f.fail('');
  const result = f.service.undo(f.service.state().operationId);
  expect(result.item.id).not.toBe('a');
  expect(result.item.output).toEqual(phrase('a').output);
});
test('twenty-operation bound, reopening manager, scope change and new run', () => {
  const f = fixture();
  f.repository.overwriteCommunicationSavedPhrases(Array.from({ length: 21 }, (_, n) => phrase(String(n))));
  for (let n = 0; n < 21; n++) f.service.delete(String(n));
  expect(f.open().state().count).toBe(20);
  f.switchScope(); expect(() => f.service.undo(f.service.state().operationId)).toThrow(/档案/);
  expect(f.open().state().count).toBe(0);
  clearSavedPhraseUndoSession(); expect(f.open().state().count).toBe(0);
});
