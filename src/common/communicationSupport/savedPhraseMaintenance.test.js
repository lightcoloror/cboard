import { createDevicePrivatePictogramAttribution } from './pictogramAttribution';
import { createCommunicationRepository, COMMUNICATION_STORAGE_KEYS } from './repository';
import { createSavedPhrasePreparationService, PREPARATION_STORAGE_KEY } from './savedPhrasePreparation';
import { createSavedPhraseImportService, importCommunicationSavedPhrases, buildCommunicationSavedPhraseExport } from './savedPhraseManagement';
import { buildReceiverHistoryEntry, restoreReceiverLoopState } from './receiverPipeline';

const picture = (label = '水', image = 'data:image/png;base64,c3ludGhldGlj') => ({ id: 'repeated', label, image });
const favorite = (id = 'original') => ({ id, sentence: '我想喝水', lifeContext: '吃饭', output: [picture()], createdAt: 10, usageCount: 2 });
function fixture(capacity = 100) {
  const values = new Map(); let fail = '', scope = 'a';
  const repository = createCommunicationRepository({ maxItems: capacity, storage: {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => { if (key === fail) throw new Error('synthetic full'); values.set(key, value); }
  }});
  repository.saveCommunicationPhrase(favorite());
  const open = () => createSavedPhrasePreparationService({ repository, getScopeKey: () => scope, now: () => 90 });
  return { repository, open, service: open(), values, fail: key => { fail = key; }, switchScope: () => { scope = 'b'; } };
}
const reviewed = (draft, boards = []) => buildReceiverHistoryEntry(draft.inputText, restoreReceiverLoopState(draft, boards).reviewItems);

test('missing earlier image and manual reorder do not shift repeated-ID snapshots on restart', () => {
  const f = fixture();
  f.repository.saveCommunicationPhrase({ ...favorite(), output: [picture('缺图', ''), picture('水', 'data:image/png;base64,YQ=='), picture('水', 'data:image/png;base64,Yg==')] });
  const draft = f.service.startFromSavedPhrase('original', 'edit');
  const restored = restoreReceiverLoopState(draft, []);
  const items = [restored.reviewItems[0], restored.reviewItems[2], restored.reviewItems[1]];
  const entry = buildReceiverHistoryEntry(draft.inputText, items);
  f.service.update(draft.id, entry);
  const reopened = restoreReceiverLoopState(f.open().load(), []);
  expect(reopened.reviewItems[0].tile).toBeNull();
  expect(reopened.outputPreview.map(item => item.image)).toEqual(['data:image/png;base64,Yg==', 'data:image/png;base64,YQ==']);
  expect(() => f.service.commit(draft.id, entry)).toThrow(/复核/);
});

test('maintenance snapshots never enter version-one favorite exports', () => {
  const exported = buildCommunicationSavedPhraseExport([{ ...favorite(), sourceSnapshot: { image: 'private-secret' }, sourcePhraseId: 'old', preparationMode: 'edit' }]);
  expect(exported.version).toBe(1);
  expect(JSON.stringify(exported)).not.toContain('private-secret');
  expect(exported.phrases[0]).not.toHaveProperty('sourcePhraseId');
});
test('edit/copy preserve repeated picture occurrences and person identities instead of resolving by ID', () => {
  const f = fixture();
  const a = { ...picture('欧阳明澈', 'data:image/png;base64,YQ=='), personId: 'repeated', attribution: createDevicePrivatePictogramAttribution({ id: 'one', name: '合成人物' }) };
  const b = { ...a, image: 'data:image/png;base64,Yg==' };
  f.repository.saveCommunicationPhrase({ ...favorite(), output: [a,b] });
  const before = f.repository.loadCommunicationSavedPhrases();
  const d = f.service.startFromSavedPhrase('original', 'copy');
  expect(d.pictogramSequence.map(x=>x.preparedOutputIndex)).toEqual([0,1]);
  const restored = restoreReceiverLoopState(d, []);
  expect(restored.reviewItems.map(x=>x.tile.tile.image)).toEqual([a.image,b.image]);
  expect(restored.outputPreview.map(x=>x.image)).toEqual([a.image,b.image]);
  expect(restored.reviewItems.every(x=>!x.sourceSpan)).toBe(true);
  f.service.discard(d.id);
  expect(f.repository.loadCommunicationSavedPhrases()).toEqual(before);
  expect(restored.outputPreview.map(x=>x.personId)).toEqual(['repeated','repeated']);
});
test('edit preserves current usage, updates only target, retry is idempotent and history unchanged', () => {
  const f = fixture();
  const record=f.repository.createReceiverDraft({direction:'receive',inputText:'原对话',output:[],pictogramSequence:[]});
  const d=f.service.startFromSavedPhrase('original','edit');
  const entry=reviewed(d); entry.output[0].image='data:image/png;base64,bmV3';
  f.service.update(d.id,entry);
  const old=f.repository.loadCommunicationSavedPhrases()[0];
  f.repository.overwriteCommunicationSavedPhrases([{...old,usageCount:9,lastUsedAt:88}]);
  const result=f.service.commit(d.id,entry);
  expect(result.ok).toBe(true); expect(result.item).toMatchObject({id:'original',usageCount:9,lastUsedAt:88,createdAt:old.createdAt});
  expect(f.service.commit(d.id,entry).ok).toBe(true);
  expect(f.repository.loadCommunicationSavedPhrases()).toHaveLength(1);
  expect(f.repository.loadResumableReceiverRecord()).toEqual(record);
});
test('changed text cannot reuse old pictures, copy duplicate preserves original', () => {
  const f=fixture(), before=f.repository.loadCommunicationSavedPhrases();
  const d=f.service.startFromSavedPhrase('original','copy'), e=reviewed(d);
  f.service.update(d.id,e); expect(f.service.commit(d.id,e).duplicate.id).toBe('original');
  f.service.update(d.id,{...e,inputText:'我不想喝水'});
  expect(f.service.load().output).toEqual([]);
  expect(()=>f.service.commit(d.id,{...e,inputText:'我不想喝水'})).toThrow(/复核/);
  expect(f.repository.loadCommunicationSavedPhrases()).toEqual(before);
});
test.each(['changed','deleted'])('stale edit %s cannot overwrite; can explicitly convert to copy', reason => {
  const f=fixture(), d=f.service.startFromSavedPhrase('original','edit'), e=reviewed(d);
  e.output[0].image='data:image/png;base64,bmV3'; f.service.update(d.id,e);
  if(reason==='deleted') f.repository.deleteCommunicationSavedPhrase('original');
  else f.repository.overwriteCommunicationSavedPhrases([{...favorite(),sentence:'另一句'}]);
  const before=f.repository.loadCommunicationSavedPhrases();
  expect(f.service.commit(d.id,e).conflict).toBe(true);
  expect(f.repository.loadCommunicationSavedPhrases()).toEqual(before);
  f.service.convertToCopy(d.id); expect(f.service.commit(d.id,e).ok).toBe(true);
  expect(f.repository.loadCommunicationSavedPhrases().find(x=>x.id===`prepared_${d.id}`)).toBeTruthy();
});
test('save failure, cleanup failure and scope change retain safe edit state', () => {
  const f=fixture(), d=f.service.startFromSavedPhrase('original','edit'), e=reviewed(d);
  e.output[0].image='data:image/png;base64,bmV3'; f.service.update(d.id,e);
  f.fail(COMMUNICATION_STORAGE_KEYS.favoriteState); expect(()=>f.service.commit(d.id,e)).toThrow();
  expect(f.service.load().id).toBe(d.id);
  f.fail(PREPARATION_STORAGE_KEY); expect(f.service.commit(d.id,e).cleanupPending).toBe(true);
  expect(f.open().commit(d.id,e).ok).toBe(true);
  f.fail(''); f.switchScope(); expect(()=>f.service.commit(d.id,e)).toThrow(/档案/);
});
const file = entries => buildCommunicationSavedPhraseExport(entries);

test('deleted favorite IDs are counted as skipped and a new deletion refreshes import preview', () => {
  const f=fixture();
  f.repository.deleteCommunicationSavedPhrase('original');
  const importer=createSavedPhraseImportService({repository:f.repository});
  expect(importer.preview(file([favorite()]))).toMatchObject({duplicateCount:1,wouldAddCount:0});
  expect(importer.commit()).toMatchObject({addedCount:0,committed:true});
  importer.preview(file([{...favorite('new'),sentence:'新句'}]));
  f.repository.saveCommunicationPhrase({...favorite('new'),sentence:'新句'});
  f.repository.deleteCommunicationSavedPhrase('new');
  expect(importer.commit()).toMatchObject({refreshed:true,duplicateCount:1,wouldAddCount:0});
  expect(f.repository.loadCommunicationSavedPhrases()).toEqual([]);
});
test.each([1,2,3])('import cap %i never evicts old favorites', limit => {
  const old=[favorite('one'),{...favorite('two'),sentence:'旧句二'}];
  const result=importCommunicationSavedPhrases(file([{...favorite('new'),sentence:'新句'}]),old,{maxItems:limit});
  expect(old.every(x=>result.items.some(y=>x.id===y.id))).toBe(true);
  expect(result.capacityExceeded).toBe(limit<3); expect(result.addedCount).toBe(limit<3?0:1);
});
test('import preview counts duplicates, invalid records, missing private references without rebinding', () => {
  const old=[favorite()];
  const candidate={...favorite('new'),sentence:'合成人物',output:[{...picture('欧阳明澈'),personId:'repeated'}]};
  const result=importCommunicationSavedPhrases(file([candidate]),old,{resolveTile:()=>picture('另一个人'),availableTileIds:new Set(['repeated'])});
  expect(result.missingPictogramCount).toBe(1); expect(result.items[0].output[0].textOnly).toBe(true);
  const duplicate=importCommunicationSavedPhrases({format:'cboard-communication-saved-phrases',version:1,phrases:[favorite(),null,{},candidate]},old);
  expect(duplicate).toMatchObject({duplicateCount:1,invalidCount:2,wouldAddCount:1});
});
test('import rechecks preview, retains pending on storage failure, retries without duplicates, cancel/scope reject', () => {
  const f=fixture(5), importer=createSavedPhraseImportService({repository:f.repository,getScopeKey:()=>f.values.get('scope')||'a'});
  const input=file([{...favorite('new'),sentence:'新句'}]);
  expect(importer.preview(input).wouldAddCount).toBe(1);
  f.repository.saveCommunicationPhrase({...favorite('other'),sentence:'别的句子'});
  expect(importer.commit().refreshed).toBe(true);
  f.fail(COMMUNICATION_STORAGE_KEYS.favoriteState); expect(()=>importer.commit()).toThrow();
  f.fail(''); expect(importer.commit().committed).toBe(true);
  expect(importer.commit().committed).toBe(true);
  expect(f.repository.loadCommunicationSavedPhrases()).toHaveLength(3);
  expect(importer.preview(input).duplicateCount).toBe(1); expect(importer.commit().addedCount).toBe(0);
  importer.preview(input); importer.cancel(); expect(()=>importer.commit()).toThrow(/预览/);
  importer.preview(input); f.values.set('scope','b'); expect(()=>importer.commit()).toThrow(/档案/);
});
