import { createCommunicationRepository, COMMUNICATION_STORAGE_KEYS as K } from './repository';
import { addCommunicationSavedPhrase } from './savedPhraseManagement';

const phrase = i => ({ id: `synthetic-${i}`, sentence: `合成常用表达${i}`, createdAt: i + 1,
  lifeContext: '聊天', usageCount: i, output: [
    { id: 'person-a', label: '合成林安', personId: 'synthetic-person-a', image: 'private-test://a' },
    { id: 'person-b', label: '合成林安', personId: 'synthetic-person-b', image: 'private-test://b' },
    { id: 'person-a', label: '合成林安', personId: 'synthetic-person-a', image: 'private-test://a' }
  ] });
function fixture(count) {
  const values = new Map([[K.savedPhrases, JSON.stringify(Array.from({ length: count }, (_, i) => phrase(i)))]]);
  let fault = '';
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => {
    if (key === K.favoriteState && fault === 'before') throw Error('synthetic write failure');
    if (key === K.favoriteState && fault === 'silent') return;
    values.set(key, value);
    if (key === K.favoriteState && fault === 'after') throw Error('synthetic receipt failure');
  } };
  const open = () => createCommunicationRepository({ storage, now: () => 12345 });
  const repository = open(); repository.loadCommunicationSavedPhrases();
  return { repository, open, values, fault: mode => { fault = mode; } };
}
test.each([99, 100, 101])('direct favorite capacity %i keeps every prior snapshot', count => {
  const f = fixture(count), before = f.repository.loadCommunicationSavedPhrases();
  const raw = f.values.get(K.favoriteState);
  if (count === 99) {
    f.repository.saveCommunicationPhrase(phrase('new'));
    expect(f.open().loadCommunicationSavedPhrases()).toEqual([expect.objectContaining({ id: 'synthetic-new' }), ...before]);
  } else {
    expect(() => f.repository.saveCommunicationPhrase(phrase('new'))).toThrow(/容量/);
    expect(f.values.get(K.favoriteState)).toBe(raw);
    expect(f.open().loadCommunicationSavedPhrases()).toEqual(before);
  }
});
test.each([99, 100, 101])('history-to-favorite replacement capacity %i is atomic', count => {
  const f = fixture(count), before = f.repository.loadCommunicationSavedPhrases();
  const next = addCommunicationSavedPhrase(before, phrase('history')).items;
  const raw = f.values.get(K.favoriteState);
  if (count === 99) {
    f.repository.overwriteCommunicationSavedPhrases(next);
    expect(f.open().loadCommunicationSavedPhrases()).toEqual(next);
  } else {
    expect(() => f.repository.overwriteCommunicationSavedPhrases(next)).toThrow(/容量/);
    expect(f.values.get(K.favoriteState)).toBe(raw);
  }
});
test('historical 101 remains readable, editable and deletable without truncation', () => {
  const f = fixture(101), before = f.repository.loadCommunicationSavedPhrases();
  f.repository.overwriteCommunicationSavedPhrases(before.map((p, i) => i ? p : { ...p, lifeContext: '出门' }));
  expect(f.open().loadCommunicationSavedPhrases()).toEqual(before.map((p, i) => i ? p : { ...p, lifeContext: '出门' }));
  f.repository.deleteCommunicationSavedPhrase(before[0].id);
  expect(f.open().loadCommunicationSavedPhrases()).toEqual(before.slice(1));
  expect(() => f.repository.saveCommunicationPhrase(phrase('new'))).toThrow(/容量/);
  f.repository.deleteCommunicationSavedPhrase(before[1].id);
  f.repository.saveCommunicationPhrase(phrase('new'));
  expect(f.open().loadCommunicationSavedPhrases()).toHaveLength(100);
});
test.each(['before', 'silent', 'after'])('99th-to-100th write %s failure safely retries once', mode => {
  const f = fixture(99), before = f.repository.loadCommunicationSavedPhrases();
  f.fault(mode);
  expect(() => f.repository.saveCommunicationPhrase(phrase('retry'))).toThrow();
  f.fault(''); f.repository.saveCommunicationPhrase(phrase('retry'));
  f.repository.saveCommunicationPhrase(phrase('retry'));
  expect(f.open().loadCommunicationSavedPhrases()).toEqual([expect.objectContaining({ id: 'synthetic-retry' }), ...before]);
});
test('full retry cannot hide a concurrent insertion or replace its snapshot', () => {
  const f = fixture(99), before = f.repository.loadCommunicationSavedPhrases();
  const stale = f.repository.readFavoriteState();
  f.open().saveCommunicationPhrase(phrase('other'));
  expect(() => f.repository.commitFavoriteState(stale, { phrases: [phrase('stale'), ...before] })).toThrow(/变化/);
  expect(f.open().loadCommunicationSavedPhrases()[0].id).toBe('synthetic-other');
});
