import { buildReceiverMeaningAssessment, buildReceiverDisplayMeaningAssessment, isReceiverPunctuation } from './receiverContract';
import { buildReceiverLoopState, prepareReceiverAssistedItems, buildReceiverHistoryEntry, restoreReceiverLoopState, replaceReceiverReviewItem } from './receiverPipeline';
import { buildCommunicationTileCatalog } from './symbolMatching';
import { getLocalPictogramCandidates } from './pictogramSemantics';
import boards from '../../api/boards.json';
import messages from '../../translations/zh-CN.communication';

test('text retention never resolves a question; punctuation is not an image task', () => {
  const state = buildReceiverLoopState('你要不要喝水？', []);
  const assisted = prepareReceiverAssistedItems(state.reviewItems);
  const result = buildReceiverMeaningAssessment(state.inputText, assisted);
  expect(result.requiresAssistance).toBe(true);
  expect(result.unresolvedMeaningItems.find(item => item.token === '要不要').role).toBe('疑问或选择');
  expect(result.unresolvedMeaningItems.some(item => item.token === '？')).toBe(false);
  expect(result.pictureCount).toBe(0);
  expect(result.meaningfulCount).toBe(4);
  expect(isReceiverPunctuation('？')).toBe(true);
});

test('assisted output preserves each occurrence, original text and unconfirmed feedback after restore', () => {
  const state = buildReceiverLoopState('水，水，不要再热了。', []);
  const items = prepareReceiverAssistedItems(state.reviewItems);
  const entry = buildReceiverHistoryEntry(state.inputText, items);
  expect(entry.output.map(item => item.label).join('')).toBe(state.inputText);
  expect(entry.patientFeedback).toBeUndefined();
  const restored = restoreReceiverLoopState({ ...entry, recordStatus: 'draft' }, []);
  expect(restored.outputPreview).toEqual(entry.output);
  expect(buildReceiverMeaningAssessment(state.inputText, restored.reviewItems).requiresAssistance).toBe(true);
  expect(state.reviewItems.some(item => !item.tile)).toBe(true);
});

test('question punctuation cannot silently turn a fully pictured statement into a resolved question', () => {
  const items = [{ id: 'water', token: '水', tile: { tile: { image: '/water.svg' } } }, { id: 'q', token: '？', tile: { textOnly: true } }];
  expect(buildReceiverMeaningAssessment('水？', items).unresolvedMeaningItems[0].reason).toBe('question-context');
  expect(buildReceiverMeaningAssessment('水。', items).requiresAssistance).toBe(false);
});

test('choosing a partial picture never hides its missing meaning, including after restart', () => {
  const intl={messages,formatMessage:({id})=>messages[id]||id};
  const state=buildReceiverLoopState('今晚', boards.advanced, {intl});
  const candidate=getLocalPictogramCandidates('今晚',buildCommunicationTileCatalog(boards.advanced,intl))[0];
  const items=replaceReceiverReviewItem(state.reviewItems,state.reviewItems[0].id,candidate.item);
  const entry=buildReceiverHistoryEntry('今晚',items);
  for(const reviewed of [items,restoreReceiverLoopState({...entry,recordStatus:'draft'},[],{intl}).reviewItems]) {
    expect(buildReceiverMeaningAssessment('今晚',reviewed).unresolvedMeaningItems).toEqual(expect.arrayContaining([
      expect.objectContaining({token:'今晚',reason:'candidate-partial-meaning',explanation:expect.stringContaining('今天')})
    ]));
  }
});

function displayFixture() {
  const night = { id: 'synthetic-night', label: '夜晚', image: '/synthetic-night.svg', attribution: { provider: 'mulberry', originalId: 'night.svg', name: 'Mulberry Symbols', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', author: 'Mulberry Symbols', sourceUrl: 'https://mulberrysymbols.org/' } };
  return { text: '今晚，夜晚。', items: [night, { id: 'comma', label: '，', textOnly: true }, { ...night }, { id: 'period', label: '。', textOnly: true }],
    sequence: [
      { pictogramId: night.id, label: '夜晚', originalToken: '今晚', matchType: 'manual', sourceSpan: { start: 0, end: 2, offsetUnit: 'unicode-code-point' } },
      { pictogramId: null, textOnly: true, originalToken: '，', sourceSpan: { start: 2, end: 3, offsetUnit: 'unicode-code-point' } },
      { pictogramId: night.id, label: '夜晚', originalToken: '夜晚', matchType: 'manual', sourceSpan: { start: 3, end: 5, offsetUnit: 'unicode-code-point' } },
      { pictogramId: null, textOnly: true, originalToken: '。', sourceSpan: { start: 5, end: 6, offsetUnit: 'unicode-code-point' } }
    ] };
}

test('confirmed display keeps source tokens and partial meaning for repeated picture occurrences', () => {
  const f=displayFixture(), before=JSON.stringify(f);
  const result=buildReceiverDisplayMeaningAssessment(f.text,f.sequence,f.items);
  expect(result.alignmentReliable).toBe(true);
  expect(result.unresolvedMeaningItems).toEqual([expect.objectContaining({ token:'今晚', explanation:expect.stringContaining('今天') })]);
  expect(result.pictureCount).toBe(2);
  expect(JSON.stringify(f)).toBe(before);
});

test.each(['reorder','missing-position','missing-sequence','identity-mismatch'])('display preserves the original and requires review when %s', problem => {
  const f=displayFixture();
  if(problem==='reorder') f.items.reverse();
  if(problem==='missing-position') delete f.sequence[0].sourceSpan;
  if(problem==='missing-sequence') f.sequence=[];
  if(problem==='identity-mismatch') f.items[0]={...f.items[0],id:'different-synthetic-person'};
  const before=JSON.stringify(f), result=buildReceiverDisplayMeaningAssessment(f.text,f.sequence,f.items);
  expect(result.alignmentReliable).toBe(false);
  expect(result.requiresAssistance).toBe(true);
  expect(result.unresolvedMeaningItems).toEqual([expect.objectContaining({token:f.text,reason:'original-sequence-needs-review'})]);
  expect(JSON.stringify(f)).toBe(before);
});
