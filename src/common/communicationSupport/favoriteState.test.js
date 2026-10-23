import { createFavoriteStateStore, FAVORITE_STATE_KEY as KEY } from './favoriteState';
const phrase = id => ({ id, sentence: `合成${id}`, output: [], createdAt: 1 });
test('migration retains saved order even when creation times disagree', () => {
  const f = setup();
  f.values.set('a:cboard_communication_saved_phrases', JSON.stringify([{ ...phrase('first'), createdAt: 1 }, { ...phrase('second'), createdAt: 9 }]));
  expect(f.open().read().phrases.map(p => p.id)).toEqual(['first', 'second']);
});
test.each([
 ['cboard_communication_saved_phrases', [{ sentence: '' }]],
 ['cboard_communication_saved_phrase_tombstones', [{ id: 'lost-delete' }]],
 ['care-pending-favorites', {}]
])('invalid legacy entry retained without replacement: %s', (key, data) => {
 const f = setup(), raw = JSON.stringify(data); f.values.set(`a:${key}`, raw);
 expect(() => f.open().read()).toThrow();
 expect(f.values.get(`a:${key}`)).toBe(raw); expect(f.values.has(`a:${KEY}`)).toBe(false);
});
function setup() {
  const values = new Map(); let scope = 'a', fault = '';
  const storage = { getScopeKey: () => scope, getItem: k => values.get(`${scope}:${k}`) ?? null,
    setItem(k, v) {
      if (fault === 'before') throw Error('before');
      if (fault === 'silent') return;
      values.set(`${scope}:${k}`, v);
      if (fault === 'after') throw Error('after');
    } };
  return { values, storage, open: () => createFavoriteStateStore(storage), fault: v => { fault = v; }, scope: v => { scope = v; } };
}
test.each(['before', 'silent'])('failed %s preserves all fields; successful retry commits once', mode => {
  const f = setup(), s = f.open(), old = s.read(); const raw = f.values.get(`a:${KEY}`);
  f.fault(mode); expect(() => s.commit(old, { phrases: [phrase('新')] })).toThrow();
  expect(f.values.get(`a:${KEY}`)).toBe(raw);
  f.fault(''); const saved = s.commit(old, { phrases: [phrase('新')] });
  expect(saved.revision).toBe(1); expect(s.commit(old, { phrases: [phrase('新')] })).toEqual(saved);
});
test('after-write error retries same revision and refuses to overwrite a later edit', () => {
  const f = setup(), s = f.open(), before = s.read(), changes = { phrases: [phrase('新')] };
  f.fault('after'); expect(() => s.commit(before, changes)).toThrow('after'); f.fault('');
  const saved = f.open().commit(before, changes); expect(saved.revision).toBe(1);
  s.commit(saved, { phrases: [phrase('后来')] });
  expect(() => s.commit(before, changes)).toThrow(/变化/);
});
test('deletion and pending packet commit together and old marks cannot be omitted', () => {
  const f = setup(); f.storage.prepareFavoriteCommit = (before, after) => ({ items: after.phrases, base: before.pending?.base ?? before.phrases });
  const s = f.open(); const old = s.commit(s.read(), { phrases: [phrase('旧')] });
  const deleted = s.commit(old, { tombstones: [{ id: '旧', deletedAt: 2, pending: true }] });
  expect(deleted.phrases).toEqual([]); expect(deleted.pending.items).toEqual([]);
  const merged = s.commit(deleted, { phrases: [phrase('旧')], tombstones: [] });
  expect(merged.phrases).toEqual([]); expect(merged.tombstones).toHaveLength(1);
});
test('switching scope and privacy-clear/recreation invalidate old handles or snapshots', () => {
  const f = setup(), s = f.open(), old = s.read(); f.scope('b');
  expect(() => s.commit(old, { phrases: [phrase('错')] })).toThrow(/切换/);
  expect(f.open().read().phrases).toEqual([]); f.scope('a');
  f.values.delete(`a:${KEY}`); f.open().read();
  expect(() => s.commit(old, { phrases: [phrase('已清理')] })).toThrow(/变化/);
});
test.each(['{broken', JSON.stringify({ version: 99 }), JSON.stringify({ version: 1, scope: 'other' })])('authoritative corruption never falls back: %s', raw => {
  const f = setup(); f.values.set(`a:${KEY}`, raw);
  f.values.set('a:cboard_tuyujia_saved_phrases', JSON.stringify([phrase('旧')]));
  expect(() => f.open().read()).toThrow(); expect(f.values.get(`a:${KEY}`)).toBe(raw);
});
