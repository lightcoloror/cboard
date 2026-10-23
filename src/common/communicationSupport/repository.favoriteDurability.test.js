import { createCommunicationRepository, COMMUNICATION_STORAGE_KEYS as K } from './repository';
import { LEGACY_COMMUNICATION_STORAGE_KEYS as L } from './legacy';

const phrase = id => ({ id, sentence: `合成表达${id}`, output: [], createdAt: 1 });
function fixture(initial = {}) {
  const values = new Map(Object.entries(initial));
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const open = () => createCommunicationRepository({ storage, now: () => 1000 });
  return { values, storage, open };
}
test('empty primary favorites do not revive legacy entries during initialization', () => {
  const f = fixture({ [K.savedPhrases]: '[]', [L.savedPhrases]: JSON.stringify([phrase('old')]) });
  expect(f.open().loadCommunicationSavedPhrases()).toEqual([]);
});
test('corrupt primary favorites are retained rather than repaired with legacy content', () => {
  const f = fixture({ [K.savedPhrases]: '{broken', [L.savedPhrases]: JSON.stringify([phrase('old')]) });
  expect(() => f.open().loadCommunicationSavedPhrases()).toThrow();
  expect(f.values.get(K.savedPhrases)).toBe('{broken');
});
test('silent favorite write failure never reports a saved phrase', () => {
  const f = fixture(); const r = f.open(); r.loadCommunicationSavedPhrases();
  f.storage.setItem = () => undefined;
  expect(() => r.saveCommunicationPhrase(phrase('new'))).toThrow();
  expect(f.open().loadCommunicationSavedPhrases()).toEqual([]);
});
test('more than one hundred deletion marks survive reopen and block stale content', () => {
  const f = fixture(); const r = f.open();
  const all = Array.from({ length: 103 }, (_, i) => phrase(String(i)));
  r.overwriteCommunicationSavedPhrases(all); r.clearCommunicationSavedPhrases();
  const reopened = f.open();
  expect(reopened.loadCommunicationSavedPhraseTombstones()).toHaveLength(103);
  reopened.overwriteCommunicationSavedPhrases(all);
  expect(reopened.loadCommunicationSavedPhrases()).toEqual([]);
});
