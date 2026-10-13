import {
  buildArasaacSemanticFields, buildPictogramSemantics,
  getPictogramConcept, isPictogramSemanticMatchAllowed
} from './pictogramSemantics';
import { normalizeRuntimePictogram, buildRuntimeCommunicationCatalogItem } from './runtimePictogram';
import { isAutomaticCommunicationCandidateAllowed } from './chineseLexicon';
import { reviewMissingTokenRecord, applyMissingTokenResolutions } from './missingTokens';
import { matchTextToCommunicationTiles } from './symbolMatching';

const source = { provider: 'arasaac', originalId: '999', name: 'ARASAAC',
  license: 'CC BY-NC-SA 4.0', sourceUrl: 'https://arasaac.org/pictograms/999' };
const candidate = fields => ({ id: 'runtime_arasaac_999', image: '/cached/999.png', source, ...fields });

describe('cross-language pictogram meaning', () => {
  test.each([
    ['我想去公园', ['我','想','去','公园'], '公园', 'parking lot'],
    ['请在这里停车', ['请','在','这里','停车'], '停车', 'public park'],
    ['停车场在哪里', ['停车场','在','哪里'], '停车场', 'park a car'],
    ['我觉得冷', ['我','觉得','冷'], '冷', 'common cold'],
    ['我感冒了', ['我','感冒','了'], '感冒', 'feeling cold'],
    ['请叫哥哥来', ['请','叫','哥哥','来'], '哥哥', 'younger brother'],
    ['奶奶在家', ['奶奶','在','家'], '奶奶', 'maternal grandmother']
  ])('does not silently adopt a different sense in %s', (sentence, segments, token, wrongSense) => {
    const matched = matchTextToCommunicationTiles(sentence, [], {preSegmented: segments, allowPartial: false});
    expect(matched.matches.map(item=>item.token).join('')).toBe(sentence);
    const fields=buildArasaacSemanticFields(token, wrongSense, 'en', 999, {keywords:[{keyword:wrongSense}]});
    const records=[{normalizedToken:token,status:'resolved',resolvedPictogramId:'runtime_arasaac_999',
      resolvedPictogram:candidate(fields),reviewedByCaregiver:false}];
    const result=applyMissingTokenResolutions(matched.matches,records,[]);
    expect(result.find(item=>item.token===token).tile).toBeNull();
    expect(result.map(item=>item.token).join('')).toBe(sentence);
  });
  test.each([
    ['可以', '罐头'], ['公园', '停车'], ['公园', '停车场'], ['停车', '停车场'],
    ['冷', '感冒'], ['右边', '正确'], ['橙子', '橙色'], ['哥哥', '弟弟'],
    ['奶奶', '外婆'], ['呼吸困难', '呼吸'], ['回家', '家'], ['有', '是']
  ])('%s and %s keep distinct concepts', (left, right) => {
    expect(getPictogramConcept(left).id).not.toBe(getPictogramConcept(right).id);
  });

  test('reuses reviewed aliases without flattening English senses', () => {
    expect(getPictogramConcept('尿片')).toEqual(getPictogramConcept('尿布'));
    expect(getPictogramConcept('park')).toBeNull();
    expect(getPictogramConcept('can')).toBeNull();
    expect(getPictogramConcept('请帮忙').id).toBe(getPictogramConcept('帮忙').id);
  });

  test('preserves provider meaning instead of stamping the query on a wrong picture', () => {
    const fields = buildArasaacSemanticFields('公园', 'public park', 'en', 999, {
      keywords: [{keyword: 'parking lot', meaning: 'a place for cars'}], categories: ['transport']
    });
    expect(fields.label).toBe('parking lot');
    expect(fields.labels.zh).toEqual([]);
    expect(fields.semantics).toEqual(expect.objectContaining({
      queryText: '公园', sourceLabels: ['parking lot'],
      sourceDefinitions: ['a place for cars'], sourceCategories: ['transport'],
      relation: 'conflict', requiresReview: true
    }));
    const tile = buildRuntimeCommunicationCatalogItem(candidate(fields)).tile;
    expect(isAutomaticCommunicationCandidateAllowed('公园', '公园', '公园', tile)).toBe(false);
  });

  test('does not disguise missing metadata as a translated label', () => {
    const fields = buildArasaacSemanticFields('陌生词', 'unknown', 'en', 999);
    expect(fields.label).toBe('图片 #999');
    expect(fields.semantics.relation).toBe('unverified');
  });

  test('rejects an old can picture even if provider labels call it ability', () => {
    const fields = buildArasaacSemanticFields('可以', 'can', 'en', 6544, {
      keywords: [{keyword: '可以'}]
    });
    expect(fields.semantics.relation).toBe('conflict');
    expect(isPictogramSemanticMatchAllowed('可以', fields.semantics)).toBe(false);
  });

  test('reviewed concept remains usable, but not for another sense or stale rules', () => {
    const fields = buildArasaacSemanticFields('尿片', '尿片', 'zh', 2863);
    expect(isPictogramSemanticMatchAllowed('尿布', fields.semantics)).toBe(true);
    expect(isPictogramSemanticMatchAllowed('公园', fields.semantics)).toBe(false);
    expect(isPictogramSemanticMatchAllowed('尿布', {...fields.semantics, mappingVersion: 'old'})).toBe(false);
  });

  test('provider label alone is not sufficient to auto-accept an unreviewed image', () => {
    const semantics = buildPictogramSemantics({token: '停车', sourceLabels: ['停车'], originalId: '999'});
    expect(semantics.relation).toBe('unverified');
    expect(isPictogramSemanticMatchAllowed('停车', semantics)).toBe(false);
  });

  test('confirmation and JSON cache round trip retain origin and source phrase independently', () => {
    const fields = buildArasaacSemanticFields('停车场', 'parking lot', 'en', 999, {
      keywords: [{keyword: 'parking lot'}], categories: ['transport']
    });
    const records = [{ id: 'm1', normalizedToken: '停车场', status: 'suggested', suggestedPictograms: [candidate(fields)] }];
    const resolved = reviewMissingTokenRecord(records, 'm1', {
      status: 'resolved', resolvedPictogramId: 'runtime_arasaac_999', reviewedByCaregiver: true
    });
    const offline = JSON.parse(JSON.stringify(resolved));
    expect(normalizeRuntimePictogram(offline[0].resolvedPictogram).semantics.sourceLabels).toEqual(['parking lot']);
    const applied = applyMissingTokenResolutions([{token:'停车场',tile:null}], offline, []);
    expect(applied[0].tile.tile.vocalization).toBe('停车场');
    expect(applied[0].tile.tile.pictogramSemantics.sourceLabels).toEqual(['parking lot']);
    expect(applyMissingTokenResolutions([{token:'公园',tile:null}], offline, [])[0].tile).toBeNull();
    const automatic = offline.map(r=>({...r,reviewedByCaregiver:false}));
    expect(applyMissingTokenResolutions([{token:'停车场',tile:null}],automatic,[])[0].tile).toBeNull();
  });

  test('old automatic runtime cache needs review; old explicit caregiver selection survives', () => {
    const record = {normalizedToken:'公园',status:'resolved',resolvedPictogramId:'runtime_arasaac_999',
      resolvedPictogram:candidate({label:'公园'}),reviewedByCaregiver:false};
    expect(applyMissingTokenResolutions([{token:'公园',tile:null}],[record],[])[0].tile).toBeNull();
    expect(applyMissingTokenResolutions([{token:'公园',tile:null}],[{...record,reviewedByCaregiver:true}],[])[0].tile).not.toBeNull();
  });
});
