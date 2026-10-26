import { buildReceiverMeaningAssessment, isReceiverPunctuation } from './receiverContract';
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
