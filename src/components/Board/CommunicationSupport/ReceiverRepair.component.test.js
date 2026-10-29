import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import ReceiverLoopPanel from './ReceiverLoopPanel.component';
import ReceiverDisplay from './ReceiverDisplay.component';
import PatientActionButton from './PatientActionButton.component';
import { createCommunicationRepository } from '../../../common/communicationSupport/repository';
import { buildReceiverLoopState, buildReceiverHistoryEntry, retainReceiverReviewItemAsText } from '../../../common/communicationSupport/receiverPipeline';

jest.mock('../../UI/FullScreenDialog', () => ({
  __esModule: true,
  default: function Dialog({ open, children }) { return open ? <section>{children}</section> : null; },
  FullScreenDialogContent: function Content({ children }) { return <div>{children}</div>; }
}));
jest.mock('../Symbol', () => function Symbol({ label }) { return <span>{label}</span>; });
jest.mock('./MissingTokenQueue.component', () => () => null);
const raw = '我今晚不回家吃饭，明早七点半回家';
const revised = '我不回家吃饭';
function completeEntry(text) {
  let review = buildReceiverLoopState(text, []).reviewItems;
  review.filter(item => !item.tile).forEach(item => { review = retainReceiverReviewItemAsText(review, item.id); });
  return buildReceiverHistoryEntry(text, review);
}
function fixture() {
  const storage = new Map(); let id = 0, time = 1;
  const repo = createCommunicationRepository({ storage: {
    getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)
  }, now: () => time++, createId: prefix => `${prefix}-${++id}` });
  const entry = completeEntry(raw), draft = repo.createReceiverDraft(entry);
  const original = repo.confirmReceiverDraft(draft, entry);
  repo.recordReceiverPatientFeedback(original.id, 'not_understood');
  const props = {
    boards: [], onApplyOutput: jest.fn(), onJumpBoard: jest.fn(),
    onCreateDraft: repo.createReceiverDraft, onUpdateDraft: repo.updateReceiverDraft,
    onConfirmDraft: repo.confirmReceiverDraft, onDiscardResumableRecord: repo.discardResumableReceiverRecord,
    onRecordPatientFeedback: repo.recordReceiverPatientFeedback,
    onSpeak: jest.fn(), onCancelSpeech: jest.fn(), onAiResegment: jest.fn(),
    onSearchMissingTokensOnline: jest.fn()
  };
  const open = () => mount(<ReceiverLoopPanel {...props} initialRecord={repo.loadResumableReceiverRecord()} receiverRecords={repo.loadReceiverRecords()} />);
  return { repo, original, props, open };
}
async function click(wrapper, label) {
  await act(async () => {
    wrapper.find('button').filterWhere(node => node.text() === label).first().simulate('click');
  }); wrapper.update();
}
afterEach(() => jest.useRealTimers());

test('not-understood offers original replay and segmented redisplay without new history or implicit AI', async () => {
  const f = fixture(), w = f.open();
  expect(w.text()).toContain(`原句：${raw}`);
  await click(w, '再听原句');
  expect(f.props.onSpeak.mock.calls[0][0]).toBe(raw);
  await click(w, '一段一段看');
  const display = w.find(ReceiverDisplay);
  expect(display.prop('open')).toBe(true);
  expect(w.text()).toContain('第 1 / 2 段');
  await click(w, '下一段');
  expect(w.text()).toContain('第 2 / 2 段');
  expect(f.props.onSpeak).toHaveBeenCalledTimes(1);
  expect(f.repo.loadCommunicationHistory()).toHaveLength(1);
  expect(f.props.onAiResegment).not.toHaveBeenCalled();
  expect(f.props.onSearchMissingTokensOnline).not.toHaveBeenCalled();
  w.unmount();
});

test('manual rewrite persists across unmount, cancel restores original, reconfirm preserves both records', async () => {
  jest.useFakeTimers();
  const f = fixture(); let w = f.open();
  await click(w, '我换个说法');
  const firstDraft = f.repo.loadResumableReceiverRecord();
  await click(w, '我换个说法');
  expect(f.repo.loadResumableReceiverRecord().id).toBe(firstDraft.id);
  await act(async () => { w.find('ForwardRef(TextField)').filterWhere(node => node.prop('id') === 'receiver-input').prop('onChange')({ target: { value: revised } }); });
  w.update(); w.unmount();
  w = f.open();
  expect(w.text()).toContain(`原句：${raw}`);
  expect(w.find('ForwardRef(TextField)').filterWhere(node => node.prop('id') === 'receiver-input').prop('value')).toBe(revised);
  expect(f.props.onSpeak).not.toHaveBeenCalled();
  await click(w, '取消修改');
  expect(f.repo.loadResumableReceiverRecord().id).toBe(f.original.id);
  await click(w, '调整图片');
  await click(w, '全屏展示');
  expect(f.repo.loadCommunicationHistory()).toHaveLength(1);
  await click(w, '我会辅助解释，继续展示');
  expect(f.repo.loadCommunicationHistory()).toHaveLength(2);
  expect(f.repo.loadCommunicationHistory().find(record => record.id !== f.original.id).repairOfRecordId).toBe(f.original.id);
  const before = f.repo.loadReceiverRecords().find(record => record.id === f.original.id);
  await act(async () => { w.find(ReceiverDisplay).prop('onFeedback')('understood'); }); w.update();
  expect(w.find('section[aria-label="误解修复"]')).toHaveLength(0);
  expect(f.repo.loadReceiverRecords().find(record => record.id === f.original.id).inputText).toBe(before.inputText);
  expect(f.props.onAiResegment).not.toHaveBeenCalled();
  w.unmount();
});

test('segment change invalidates pending share but still shares the whole original', async () => {
  const entry = completeEntry(raw); let finish, guard;
  const share = jest.fn((_items, options) => { guard = options.isCurrent; return new Promise(resolve => { finish = resolve; }); });
  const w = mount(<ReceiverDisplay open title="合成" items={entry.output} sequence={entry.pictogramSequence}
    speechText={raw} onShare={share} onStop={jest.fn()} onClose={jest.fn()} onFeedback={jest.fn()} onReplay={jest.fn()}
    feedbackQuestion="明白吗" understoodLabel="明白" notUnderstoodLabel="不懂" repeatRequestedLabel="再说" />);
  let task;
  await act(async () => { task = w.find(PatientActionButton).filterWhere(node => node.prop('action') === 'share').prop('onClick')(); });
  await click(w, '一段一段看');
  expect(guard()).toBe(false);
  expect(share.mock.calls[0][1].speechText).toBe(raw);
  expect(share.mock.calls[0][0]).toEqual(entry.output);
  await act(async () => { finish({ message: '迟到完成' }); await task; }); w.update();
  expect(w.text()).not.toContain('迟到完成'); w.unmount();
});
