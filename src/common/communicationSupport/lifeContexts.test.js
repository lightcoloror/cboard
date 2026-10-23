import { assignSavedPhraseLifeContext, filterSavedPhrasesByLifeContext, getSavedPhraseLifeContexts,
  getCommunicationQuickPhrases, buildCommunicationSavedPhraseExport, importCommunicationSavedPhrases,
  normalizeLifeContext } from './savedPhraseManagement';
import { normalizeCommunicationSavedPhrases, buildCommunicationSupportCloudSettings, mergeCommunicationSupportSettings } from './storage';
import { buildCommunicationSavedPhraseSyncPayload, mergeVersionedCommunicationSavedPhrases } from './savedPhraseSync';
import { sameCareFavoriteList } from './careFavoriteChanges';
import { encodeCareMedia } from './careMediaValues';
import { preserveCareLocalFavoriteMedia } from './careLocalMediaProjection';

const photo = { id: 'private-person-synthetic', label: '欧阳明澈', source: 'user', image: 'data:image/png;base64,SYNTHETIC', personId: 'synthetic-person' };
const phrase = (overrides = {}) => ({ id: 'p1', sentence: '欧阳明澈今晚不回家吃饭', output: [photo],
  usageCount: 2, createdAt: 100, updatedAt: 100, lastUsedAt: 100, ...overrides });

test('Care synchronization ignores classification and preserves it only within the same account/family/profile', async () => {
  const local = [phrase({ lifeContext: '散步', output: [] })];
  expect(sameCareFavoriteList([phrase({ output: [] })], local)).toBe(true);
  const readImage = jest.fn();
  const cloud = await encodeCareMedia(local[0], { view: () => ({ media: {} }) }, readImage);
  expect(cloud).not.toHaveProperty('lifeContext');
  expect(readImage).not.toHaveBeenCalled();
  const scope = { accountId: 'a', familyId: 'f', profileId: 'p' };
  const malicious = [{ ...cloud, lifeContext: '远端注入' }];
  expect(preserveCareLocalFavoriteMedia(malicious, local, scope, scope)[0].lifeContext).toBe('散步');
  for (const key of ['accountId', 'familyId', 'profileId']) {
    expect(preserveCareLocalFavoriteMedia(malicious, local, scope, { ...scope, [key]: 'other' })[0]).not.toHaveProperty('lifeContext');
  }
  expect(preserveCareLocalFavoriteMedia(malicious, [], scope, scope)[0]).not.toHaveProperty('lifeContext');
  expect(preserveCareLocalFavoriteMedia([], local, scope, scope)).toEqual([]);
});

test('classification is local metadata and never rewrites meaning, photos, order or usage', () => {
  const original = [phrase(), phrase({ id: 'p2', sentence: '水不要热' })];
  const before = JSON.stringify(original);
  const changed = assignSavedPhraseLifeContext(original, 'p1', '  吃饭  ');
  expect(changed.items[0]).toEqual({ ...original[0], lifeContext: '吃饭' });
  expect(changed.items[1]).toBe(original[1]);
  expect(JSON.stringify(original)).toBe(before);
  expect(assignSavedPhraseLifeContext(changed.items, 'p1', '吃饭').changed).toBe(false);
  expect(assignSavedPhraseLifeContext(original, 'missing', '吃饭').changed).toBe(false);
  expect(assignSavedPhraseLifeContext(changed.items, 'p1', '').items[0].lifeContext).toBe('');
});

test('custom contexts use exact matching and filter before quick-phrase ranking', () => {
  const items = Array.from({ length: 8 }, (_, i) => phrase({ id: `p${i}`, sentence: `合成表达${i}`, usageCount: i,
    lifeContext: i ? '吃饭' : '饭后散步' }));
  expect(getCommunicationQuickPhrases(filterSavedPhrasesByLifeContext(items, '饭后散步'))[0].id).toBe('p0');
  expect(filterSavedPhrasesByLifeContext(items, '饭')).toEqual([]);
  expect(filterSavedPhrasesByLifeContext([...items, phrase()], '')).toHaveLength(1);
  expect(filterSavedPhrasesByLifeContext(items, null)).toHaveLength(8);
  expect(getSavedPhraseLifeContexts(items)).toEqual(['吃饭', '洗漱', '出门', '休息', '就医', '聊天', '饭后散步']);
  expect(normalizeLifeContext('  和\n朋友   散步 ')).toBe('和 朋友 散步');
  expect(Array.from(normalizeLifeContext('🙂'.repeat(41)))).toHaveLength(40);
});

test('local persistence and explicit export/import keep classification with the existing private snapshot', () => {
  const local = normalizeCommunicationSavedPhrases([phrase({ lifeContext: '饭后散步' })]);
  const restored = normalizeCommunicationSavedPhrases(JSON.parse(JSON.stringify(local)));
  expect(restored[0].lifeContext).toBe('饭后散步');
  expect(restored[0].output[0].image).toBe(photo.image);
  const imported = importCommunicationSavedPhrases(buildCommunicationSavedPhraseExport(local), [], {
    availableTileIds: new Set([photo.id]), resolveTile: id => id === photo.id ? photo : null
  });
  expect(imported.items[0]).toEqual(expect.objectContaining({ sentence: local[0].sentence, lifeContext: '饭后散步' }));
  expect(imported.items[0].output[0].image).toBe(photo.image);
  expect(normalizeCommunicationSavedPhrases([phrase()])[0]).not.toHaveProperty('lifeContext');
});

test('cloud payloads exclude context and private photo; remote cannot inject local context', () => {
  const local = [phrase({ lifeContext: '私人生活情境' })];
  for (const payload of [buildCommunicationSavedPhraseSyncPayload(local), buildCommunicationSupportCloudSettings(local, [])]) {
    const json = JSON.stringify(payload);
    expect(json).not.toContain('私人生活情境');
    expect(json).not.toContain('lifeContext');
    expect(json).not.toContain('SYNTHETIC');
    expect(json).not.toContain(photo.id);
  }
  const remote = [phrase({ updatedAt: 200, lifeContext: '远端不可覆盖' }), phrase({ id: 'p2', sentence: '其他表达', lifeContext: '远端不可注入' })];
  const versioned = mergeVersionedCommunicationSavedPhrases(local, remote).items;
  expect(versioned.find(item => item.id === 'p1').lifeContext).toBe('私人生活情境');
  expect(versioned.find(item => item.id === 'p2')).not.toHaveProperty('lifeContext');
  const cleared = mergeVersionedCommunicationSavedPhrases([phrase({ lifeContext: '' })], remote).items;
  expect(cleared.find(item => item.id === 'p1').lifeContext).toBe('');
  const settings = mergeCommunicationSupportSettings({ savedPhrases: local }, { savedPhrases: remote });
  expect(settings.savedPhrases.find(item => item.id === 'p1').lifeContext).toBe('私人生活情境');
  expect(settings.savedPhrases.find(item => item.id === 'p2')).not.toHaveProperty('lifeContext');
});
