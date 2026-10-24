import React, { useState } from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import ExpressionLoopPanel from './ExpressionLoopPanel.component';
import PatientActionButton from './PatientActionButton.component';
import { PATIENT_ACTION_IDS } from '../../../common/communicationSupport/patientActionLanguage';
import { createCommunicationRepository } from '../../../common/communicationSupport/repository';
import {
  createExpressionDraftService, EXPRESSION_DRAFT_STORAGE_KEY,
  getExpressionDraftRequestContext
} from '../../../common/communicationSupport/expressionDraft';
import { buildExpressionLoopStateFromSavedPhrase } from '../../../common/communicationSupport/expressionPipeline';

const person = id => ({
  id: 'repeated-card-id', label: '合成林安', personId: id,
  boardId: 'synthetic-private',
  image: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>')}`,
  attribution: { provider: 'device-private', useScope: 'device-private' }
});
const orderedPeople = [person('person-a'), person('person-b'), person('person-a')];
const defaultSentence = '合成林安和合成林安今晚不回家吃饭';
function fixture({ sentence = defaultSentence, output = orderedPeople, rejected = false } = {}) {
  const data = new Map();
  let fail = false;
  const storage = {
    getItem: key => data.get(key) || null,
    setItem: (key, value) => {
      if (fail && key === EXPRESSION_DRAFT_STORAGE_KEY) {
        if (fail === 'silent') return true;
        throw new Error('synthetic disk full');
      }
      data.set(key, value);
      return true;
    }
  };
  const repository = createCommunicationRepository({ storage });
  const service = () => createExpressionDraftService({ repository, getScopeKey: () => 'synthetic-scope' });
  const pipeline = buildExpressionLoopStateFromSavedPhrase({ sentence, output });
  pipeline.candidateSentences = [sentence, '请看这些图卡'];
  pipeline.selectedIndex = 0;
  service().save({ pipeline, rejected, candidateFeedbackEntries: [] });
  return { repository, service, data, pipeline, setFailure: value => { fail = value; } };
}

function action(wrapper, name) {
  return wrapper.find(PatientActionButton).filterWhere(node => node.prop('action') === name).first();
}
function resume(wrapper) {
  act(() => { wrapper.find('button#expression-draft-continue-button').simulate('click'); });
  wrapper.update();
}
function controlled(props) {
  function Host(runtimeProps) {
    const [output, setOutput] = useState(props.initialOutput || []);
    return <ExpressionLoopPanel
      boards={[]} savedPhrases={[]} pictogramOrdering={{}} onPictogramUsed={() => {}}
      onSavePhrase={jest.fn()} onAppendHistory={jest.fn()} conversationSessionId="synthetic-session"
      onSpeak={props.onSpeak || jest.fn()} onCancelSpeech={props.onCancelSpeech || jest.fn()}
      candidateAutoplayDelaySeconds={5} allowLegacyOutput={false}
      {...props} {...runtimeProps} output={output} onApplyOutput={setOutput}
    />;
  }
  let wrapper;
  act(() => { wrapper = mount(<Host />); });
  wrapper.update();
  return wrapper;
}

afterEach(() => jest.useRealTimers());

test('management reuse persists the full saved sentence instead of rebuilding it from labels', () => {
  const f = fixture();
  f.data.clear();
  const onUseSavedPhrase = jest.fn(), onGenerateAiSentences = jest.fn();
  const wrapper = controlled({
    expressionDraftService: f.service(), onUseSavedPhrase, onGenerateAiSentences,
    candidateAutoplayDelaySeconds: 0
  });
  const sentence = '合成林安告诉合成林安，我今晚七点半不回家吃饭。';
  const output = [person('person-a'), person('person-b'),
    { id: 'synthetic-time', label: '七点半' }, { id: 'synthetic-home', label: '回家' }];
  act(() => {
    wrapper.setProps({
      savedPhraseRequest: {
        requestId: 'management-reuse', mode: 'reuse',
        item: { id: 'saved-synthetic', sentence, output }
      }
    });
  });
  wrapper.update();
  expect(wrapper.find('button.CommunicationSupportPanel__candidate').first().text()).toBe(sentence);
  const draft = f.service().load();
  expect(draft.snapshot.pipeline.candidateSentences[0]).toBe(sentence);
  expect(draft.snapshot.pipeline.selectedIndex).toBe(0);
  expect(draft.snapshot.pipeline.outputSnapshot.map(item => item.personId || null))
    .toEqual(['person-a', 'person-b', null, null]);
  expect(onUseSavedPhrase).toHaveBeenCalledTimes(1);
  expect(onGenerateAiSentences).not.toHaveBeenCalled();
  wrapper.unmount();
  const reopened = controlled({ expressionDraftService: f.service(), candidateAutoplayDelaySeconds: 0 });
  resume(reopened);
  expect(reopened.find('button.CommunicationSupportPanel__candidate').first().text()).toBe(sentence);
  reopened.unmount();
});

test('cold restore asks first, retains repeated identities and selected text, and never autoplays', () => {
  jest.useFakeTimers();
  const f = fixture(), onSpeak = jest.fn(), onGenerateAiSentences = jest.fn();
  const wrapper = controlled({ expressionDraftService: f.service(), onSpeak, onGenerateAiSentences });
  expect(wrapper.text()).toContain('继续上次表达');
  expect(wrapper.find('ExpressionLoopPanel').prop('output')).toEqual([]);
  const before = f.data.get(EXPRESSION_DRAFT_STORAGE_KEY);
  act(() => { wrapper.find('button#expression-draft-defer-button').simulate('click'); });
  wrapper.update();
  expect(f.data.get(EXPRESSION_DRAFT_STORAGE_KEY)).toBe(before);
  act(() => { wrapper.find('button').filterWhere(node => node.text() === '查看待恢复表达').simulate('click'); });
  wrapper.update();
  resume(wrapper);
  expect(wrapper.find('ExpressionLoopPanel').prop('output').map(item => item.personId))
    .toEqual(['person-a', 'person-b', 'person-a']);
  expect(wrapper.find('button.CommunicationSupportPanel__candidate').first().text()).toBe(defaultSentence);
  act(() => jest.advanceTimersByTime(60000));
  expect(onSpeak).not.toHaveBeenCalled();
  expect(onGenerateAiSentences).not.toHaveBeenCalled();
  expect(f.repository.loadCommunicationHistory()).toEqual([]);
  wrapper.unmount();
});

test('explicit start-new requires confirmation and leaves old favorites/history unchanged', () => {
  const f = fixture(), previousHistory = f.repository.loadCommunicationHistory();
  const wrapper = controlled({ expressionDraftService: f.service() });
  act(() => { wrapper.find('button#expression-draft-new-button').simulate('click'); });
  wrapper.update();
  expect(f.service().load().status).toBe('draft');
  expect(wrapper.text()).toContain('丢弃不代表取消已提交的 AI 执行或退款');
  act(() => { wrapper.find('button#expression-draft-confirm-new-button').simulate('click'); });
  wrapper.update();
  expect(f.service().load().status).toBe('cleared');
  expect(f.repository.loadCommunicationHistory()).toEqual(previousHistory);
  expect(f.repository.loadCommunicationSavedPhrases()).toEqual([]);
  expect(wrapper.find('ExpressionLoopPanel').prop('output')).toEqual([]);
  wrapper.unmount();
});

test('confirmed marker prevents legacy Redux output from resurfacing after restart', () => {
  const f = fixture();
  const first = controlled({ expressionDraftService: f.service() });
  resume(first);
  act(() => {
    action(first, PATIENT_ACTION_IDS.confirm).prop('onClick')();
    action(first, PATIENT_ACTION_IDS.confirm).prop('onClick')();
  });
  first.update();
  expect(f.repository.loadCommunicationHistory()).toHaveLength(1);
  expect(first.find('[role="alert"]').map(n => n.text())).toEqual([]);
  expect(f.service().load().status).toBe('confirmed');
  first.unmount();
  const reopened = controlled({ expressionDraftService: f.service(), initialOutput: orderedPeople });
  expect(reopened.find('ExpressionLoopPanel').prop('output')).toEqual([]);
  expect(reopened.text()).not.toContain('继续上次表达');
  expect(f.service().load().status).toBe('confirmed');
  reopened.unmount();
});

test('failed draft writes preserve current UI and prior valid saved contents; retry persists', () => {
  const f = fixture();
  const wrapper = controlled({ expressionDraftService: f.service() });
  resume(wrapper);
  const original = f.service().load();
  f.setFailure(true);
  act(() => action(wrapper, PATIENT_ACTION_IDS.moveRight).prop('onClick')());
  wrapper.update();
  expect(wrapper.find('ExpressionLoopPanel').prop('output').map(item => item.personId))
    .toEqual(['person-b', 'person-a', 'person-a']);
  expect(wrapper.text()).toContain('本次修改尚未保存');
  expect(f.service().load()).toEqual(original);
  f.setFailure(false);
  act(() => { wrapper.find('button').filterWhere(node => node.text() === '重试保存表达').simulate('click'); });
  expect(f.service().load().snapshot.pipeline.outputSnapshot.map(item => item.personId))
    .toEqual(['person-b', 'person-a', 'person-a']);
  wrapper.unmount();
});

test('clear after resume persists an empty marker rather than resurrecting the old sequence', () => {
  const f = fixture();
  const wrapper = controlled({ expressionDraftService: f.service() });
  resume(wrapper);
  act(() => wrapper.find('ExpressionLoopPanel').prop('onApplyOutput')([]));
  expect(f.service().load().status).toBe('cleared');
  wrapper.unmount();
  const reopened = controlled({ expressionDraftService: f.service(), initialOutput: orderedPeople });
  expect(reopened.find('ExpressionLoopPanel').prop('output')).toEqual([]);
  expect(reopened.text()).not.toContain('继续上次表达');
  reopened.unmount();
});

test('pure text resumes and confirms the exact original sentence without inventing cards', () => {
  const f = fixture({ sentence: '我今晚不回家吃饭', output: [] });
  const wrapper = controlled({ expressionDraftService: f.service() });
  resume(wrapper);
  expect(wrapper.find('ExpressionLoopPanel').prop('output')).toEqual([]);
  expect(action(wrapper, PATIENT_ACTION_IDS.playAll).prop('disabled')).toBe(false);
  act(() => action(wrapper, PATIENT_ACTION_IDS.confirm).prop('onClick')());
  expect(f.repository.loadCommunicationHistory()[0]).toEqual(expect.objectContaining({
    sentence: '我今晚不回家吃饭'
  }));
  wrapper.unmount();
});

test('refused draft resumes stopped and undo does not generate or restart the countdown', () => {
  jest.useFakeTimers();
  const f = fixture({ rejected: true }), onSpeak = jest.fn(), onGenerateAiSentences = jest.fn();
  const wrapper = controlled({ expressionDraftService: f.service(), onSpeak, onGenerateAiSentences });
  resume(wrapper);
  expect(wrapper.text()).toContain('已停止这组候选');
  act(() => action(wrapper, PATIENT_ACTION_IDS.undo).prop('onClick')());
  act(() => jest.advanceTimersByTime(60000));
  expect(onSpeak).not.toHaveBeenCalled();
  expect(onGenerateAiSentences).not.toHaveBeenCalled();
  expect(f.service().load().snapshot.rejected).toBe(false);
  wrapper.unmount();
});

test('AI cannot dispatch when the input snapshot cannot be durably saved', async () => {
  const f = fixture(), onGenerateAiSentences = jest.fn();
  const wrapper = controlled({ expressionDraftService: f.service(), aiAvailable: true, onGenerateAiSentences });
  resume(wrapper);
  f.setFailure(true);
  act(() => wrapper.find('ExpressionLoopPanel').prop('onApplyOutput')([...orderedPeople, { id: 'water', label: '水' }]));
  await act(async () => { await action(wrapper, PATIENT_ACTION_IDS.improve).prop('onClick')(); });
  expect(onGenerateAiSentences).not.toHaveBeenCalled();
  expect(wrapper.text()).toContain('本次修改尚未保存');
  wrapper.unmount();
});

test('unknown AI result remains explicitly recoverable after remount, without implicit requests', async () => {
  const f = fixture();
  const onGenerateAiSentences = jest.fn(request => {
    getExpressionDraftRequestContext(request).beforeDispatch({
      requestId: 'synthetic-request', fingerprint: 'synthetic-fingerprint',
      scope: { origin: 'synthetic-api', accountId: 'a', familyId: 'f', profileId: 'p', fundingId: 'fund' },
      body: JSON.parse(JSON.stringify(request))
    });
    return Promise.reject(Object.assign(new Error('synthetic response lost'), { code: 'AI_REQUEST_RESULT_UNKNOWN' }));
  });
  const first = controlled({ expressionDraftService: f.service(), aiAvailable: true, onGenerateAiSentences });
  resume(first);
  await act(async () => { await action(first, PATIENT_ACTION_IDS.improve).prop('onClick')(); });
  first.update();
  expect(first.text()).toContain('核对上次结果');
  expect(f.service().load().snapshot.pendingAi.requestId).toBe('synthetic-request');
  first.unmount();
  const second = controlled({ expressionDraftService: f.service(), aiAvailable: true, onGenerateAiSentences });
  resume(second);
  expect(onGenerateAiSentences).toHaveBeenCalledTimes(1);
  expect(second.text()).toContain('核对上次结果');
  await act(async () => { await action(second, PATIENT_ACTION_IDS.improve).prop('onClick')(); });
  expect(onGenerateAiSentences).toHaveBeenCalledTimes(2);
  expect(f.service().load().snapshot.pendingAi.requestId).toBe('synthetic-request');
  second.unmount();
});

test('unavailable image preserves the person identity and reports missing instead of searching', () => {
  const f = fixture(), onGenerateAiSentences = jest.fn();
  const wrapper = controlled({ expressionDraftService: f.service(), onGenerateAiSentences });
  resume(wrapper);
  const image = wrapper.find('img.CommunicationSupportPanel__sequenceImage').first();
  const element = image.getDOMNode();
  act(() => { image.simulate('error', { currentTarget: element }); });
  expect(element.nextElementSibling.hidden).toBe(false);
  expect(element.nextElementSibling.textContent).toBe('图片不可用，保留文字');
  expect(f.service().load().snapshot.pipeline.outputSnapshot).toEqual(orderedPeople);
  expect(onGenerateAiSentences).not.toHaveBeenCalled();
  wrapper.unmount();
});

test('leaving the panel and expiring the conversation retain candidates without scheduling speech', () => {
  jest.useFakeTimers();
  const f = fixture(), onSpeak = jest.fn(), onGenerateAiSentences = jest.fn();
  const wrapper = controlled({ expressionDraftService: f.service(), onSpeak, onGenerateAiSentences });
  resume(wrapper);
  act(() => { wrapper.setProps({ active: false }); });
  act(() => { wrapper.setProps({ active: true, conversationSessionId: 'after-31-minute-idle' }); });
  act(() => jest.advanceTimersByTime(31 * 60 * 1000));
  expect(wrapper.find('button.CommunicationSupportPanel__candidate').first().text()).toBe(defaultSentence);
  expect(f.service().load().snapshot.pipeline.outputSnapshot).toEqual(orderedPeople);
  expect(onSpeak).not.toHaveBeenCalled();
  expect(onGenerateAiSentences).not.toHaveBeenCalled();
  wrapper.unmount();
});

test('confirmed history survives failed draft cleanup and retry never creates another history record', () => {
  const f = fixture();
  const wrapper = controlled({ expressionDraftService: f.service() });
  resume(wrapper);
  f.setFailure(true);
  act(() => action(wrapper, PATIENT_ACTION_IDS.confirm).prop('onClick')());
  wrapper.update();
  expect(wrapper.text()).toContain('表达未能保存');
  const history = f.repository.loadCommunicationHistory();
  expect(history).toHaveLength(1);
  expect(f.service().load().status).toBe('draft');
  f.setFailure(false);
  act(() => {
    action(wrapper, PATIENT_ACTION_IDS.confirm).prop('onClick')();
    action(wrapper, PATIENT_ACTION_IDS.confirm).prop('onClick')();
  });
  expect(f.service().load().status).toBe('confirmed');
  expect(f.repository.loadCommunicationHistory()).toEqual(history);
  wrapper.unmount();
});

test('silent storage failure is reported by readback and blocks implicit success', () => {
  const f = fixture();
  const wrapper = controlled({ expressionDraftService: f.service() });
  resume(wrapper);
  const before = f.service().load();
  f.setFailure('silent');
  act(() => action(wrapper, PATIENT_ACTION_IDS.remove).prop('onClick')());
  wrapper.update();
  expect(wrapper.text()).toContain('本次修改尚未保存');
  expect(f.service().load()).toEqual(before);
  expect(wrapper.find('ExpressionLoopPanel').prop('output')).toHaveLength(2);
  wrapper.unmount();
});

test('late response after panel exit stays in the journal and cannot replace restored candidates', async () => {
  const f = fixture();
  let complete;
  const onGenerateAiSentences = jest.fn(request => new Promise(resolve => {
    const ticket = {
      requestId: 'synthetic-late-request', fingerprint: 'synthetic-late-fingerprint',
      scope: { origin: 'synthetic-api', accountId: 'a', familyId: 'f', profileId: 'p', fundingId: 'fund' },
      body: JSON.parse(JSON.stringify(request))
    };
    const context = getExpressionDraftRequestContext(request);
    context.beforeDispatch(ticket);
    complete = () => {
      context.afterResponse(ticket, true);
      resolve({ candidates: ['合成林安和合成林安回家'] });
    };
  }));
  const wrapper = controlled({ expressionDraftService: f.service(), aiAvailable: true, onGenerateAiSentences });
  resume(wrapper);
  let task;
  await act(async () => { task = action(wrapper, PATIENT_ACTION_IDS.improve).prop('onClick')(); });
  act(() => { wrapper.setProps({ active: false }); });
  await act(async () => { complete(); await task; });
  act(() => { wrapper.setProps({ active: true }); });
  wrapper.update();
  expect(wrapper.find('button.CommunicationSupportPanel__candidate').first().text()).toBe(defaultSentence);
  expect(wrapper.text()).toContain('核对上次结果');
  expect(onGenerateAiSentences).toHaveBeenCalledTimes(1);
  expect(f.service().load().snapshot.pendingAi.requestId).toBe('synthetic-late-request');
  wrapper.unmount();
});

function reuseSaved(wrapper, item, requestId, via = 'management') {
  if (via === 'quick') {
    wrapper.find('ForwardRef(Button)').filterWhere(node => node.text() === '重用')
      .first().simulate('click');
  } else {
    wrapper.setProps({ savedPhraseRequest: { requestId, mode: 'reuse', item } });
  }
}

test.each([
  ['management', orderedPeople], ['quick', orderedPeople],
  ['management', []], ['quick', []]
])('confirmed %s reuse creates one fresh draft and preserves exact history/identity (output %j)', async (via, output) => {
  const f = fixture();
  f.data.clear();
  const item = { id: 'synthetic-saved', sentence: defaultSentence, output };
  const service = f.service();
  const onUseSavedPhrase = jest.fn(), onGenerateAiSentences = jest.fn(), onSpeak = jest.fn();
  const wrapper = controlled({
    expressionDraftService: service, savedPhrases: [item],
    onUseSavedPhrase, onGenerateAiSentences, onSpeak, candidateAutoplayDelaySeconds: 0
  });
  await act(async () => { reuseSaved(wrapper, item, 'first', via); });
  wrapper.update();
  // Local synthetic journal fixture only: a new expression must not inherit
  // the ended expression's recovery identity, even when all cards match.
  service.prepareAi({ requestId: 'synthetic-old-request', fingerprint: 'synthetic-fingerprint',
    scope: { accountId: 'synthetic-account', profileId: 'synthetic-profile', fundingId: 'synthetic-fund' } });
  act(() => action(wrapper, PATIENT_ACTION_IDS.confirm).prop('onClick')());
  wrapper.update();
  const original = f.service().load(), history = f.repository.loadCommunicationHistory();
  expect(original.status).toBe('confirmed');
  expect(original.snapshot.pendingAi.requestId).toBe('synthetic-old-request');
  expect(history).toHaveLength(1);
  await act(async () => {
    reuseSaved(wrapper, item, 'second', via);
    reuseSaved(wrapper, item, 'second', via);
  });
  wrapper.update();
  const next = f.service().load();
  expect(next.status).toBe('draft');
  expect(next.id).not.toBe(original.id);
  expect(next.snapshot.pipeline.candidateSentences).toEqual(original.snapshot.pipeline.candidateSentences);
  expect(next.snapshot.pipeline.candidateSentences[0]).toBe(defaultSentence);
  expect(next.snapshot.pipeline.outputSnapshot).toEqual(output);
  expect(next.snapshot.rejected).toBe(false);
  expect(next.snapshot.pendingAi).toBeUndefined();
  expect(action(wrapper, PATIENT_ACTION_IDS.confirm).prop('disabled')).toBe(false);
  expect(f.repository.loadCommunicationHistory()).toEqual(history);
  expect(onUseSavedPhrase).toHaveBeenCalledTimes(2);
  await act(async () => { reuseSaved(wrapper, item, 'duplicate-after-render', via); });
  expect(f.service().load()).toEqual(next);
  expect(onUseSavedPhrase).toHaveBeenCalledTimes(2);
  act(() => {
    action(wrapper, PATIENT_ACTION_IDS.confirm).prop('onClick')();
    action(wrapper, PATIENT_ACTION_IDS.confirm).prop('onClick')();
  });
  const finalHistory = f.repository.loadCommunicationHistory();
  expect(finalHistory).toHaveLength(2);
  expect(finalHistory.find(entry => entry.id === history[0].id)).toEqual(history[0]);
  expect(finalHistory.every(entry => entry.sentence === defaultSentence)).toBe(true);
  expect(finalHistory.every(entry => JSON.stringify(entry.output) === JSON.stringify(history[0].output))).toBe(true);
  expect(onGenerateAiSentences).not.toHaveBeenCalled();
  expect(onSpeak).not.toHaveBeenCalled();
  wrapper.unmount();
});

test('failed start-new persistence keeps confirmed UI and retries the same saved phrase safely', async () => {
  const f = fixture();
  f.data.clear();
  const item = { id: 'synthetic-saved', sentence: defaultSentence, output: orderedPeople };
  const onUseSavedPhrase = jest.fn(), onGenerateAiSentences = jest.fn();
  const wrapper = controlled({ expressionDraftService: f.service(), savedPhrases: [item],
    onUseSavedPhrase, onGenerateAiSentences, candidateAutoplayDelaySeconds: 0 });
  await act(async () => { reuseSaved(wrapper, item, 'first'); });
  wrapper.update();
  act(() => action(wrapper, PATIENT_ACTION_IDS.confirm).prop('onClick')());
  const original = f.service().load(), history = f.repository.loadCommunicationHistory();
  f.setFailure(true);
  await act(async () => { reuseSaved(wrapper, item, 'failed-new'); });
  wrapper.update();
  expect(wrapper.text()).toContain('新表达暂时未能保存到本机');
  expect(f.service().load()).toEqual(original);
  expect(action(wrapper, PATIENT_ACTION_IDS.confirm).prop('disabled')).toBe(true);
  expect(onUseSavedPhrase).toHaveBeenCalledTimes(1);
  expect(f.repository.loadCommunicationHistory()).toEqual(history);
  f.setFailure(false);
  await act(async () => { reuseSaved(wrapper, item, 'retry-new'); });
  wrapper.update();
  expect(f.service().load().status).toBe('draft');
  expect(f.service().load().id).not.toBe(original.id);
  expect(action(wrapper, PATIENT_ACTION_IDS.confirm).prop('disabled')).toBe(false);
  expect(onUseSavedPhrase).toHaveBeenCalledTimes(2);
  expect(onGenerateAiSentences).not.toHaveBeenCalled();
  wrapper.unmount();
});

test('reuse during failed confirmation cleanup does not bypass its stable history identity', async () => {
  const f = fixture();
  f.data.clear();
  const item = { id: 'synthetic-saved', sentence: defaultSentence, output: orderedPeople };
  const onUseSavedPhrase = jest.fn();
  const wrapper = controlled({ expressionDraftService: f.service(), savedPhrases: [item],
    onUseSavedPhrase, candidateAutoplayDelaySeconds: 0 });
  await act(async () => { reuseSaved(wrapper, item, 'first'); });
  wrapper.update();
  const original = f.service().load();
  f.setFailure(true);
  act(() => action(wrapper, PATIENT_ACTION_IDS.confirm).prop('onClick')());
  const history = f.repository.loadCommunicationHistory();
  expect(history).toHaveLength(1);
  await act(async () => { reuseSaved(wrapper, item, 'before-cleanup-retry'); });
  expect(f.service().load().id).toBe(original.id);
  expect(f.repository.loadCommunicationHistory()).toEqual(history);
  expect(onUseSavedPhrase).toHaveBeenCalledTimes(1);
  f.setFailure(false);
  act(() => action(wrapper, PATIENT_ACTION_IDS.confirm).prop('onClick')());
  expect(f.service().load().status).toBe('confirmed');
  await act(async () => { reuseSaved(wrapper, item, 'after-cleanup-retry'); });
  expect(f.service().load().status).toBe('draft');
  expect(f.service().load().id).not.toBe(original.id);
  expect(f.repository.loadCommunicationHistory()).toEqual(history);
  wrapper.unmount();
});

test('the fresh identical draft survives reopening and resumes without playback or AI', async () => {
  const f = fixture();
  f.data.clear();
  const item = { id: 'synthetic-saved', sentence: defaultSentence, output: orderedPeople };
  const wrapper = controlled({ expressionDraftService: f.service(), savedPhrases: [item],
    candidateAutoplayDelaySeconds: 0 });
  await act(async () => { reuseSaved(wrapper, item, 'first'); });
  wrapper.update();
  act(() => action(wrapper, PATIENT_ACTION_IDS.confirm).prop('onClick')());
  await act(async () => { reuseSaved(wrapper, item, 'second'); });
  const draft = f.service().load(), history = f.repository.loadCommunicationHistory();
  expect(draft.status).toBe('draft');
  wrapper.unmount();
  jest.useFakeTimers();
  const onSpeak = jest.fn(), onGenerateAiSentences = jest.fn();
  const reopened = controlled({ expressionDraftService: f.service(), onSpeak, onGenerateAiSentences });
  expect(reopened.text()).toContain('继续上次表达');
  resume(reopened);
  act(() => jest.advanceTimersByTime(60000));
  expect(reopened.find('ExpressionLoopPanel').prop('output')).toEqual(orderedPeople);
  expect(reopened.find('button.CommunicationSupportPanel__candidate').first().text()).toBe(defaultSentence);
  expect(f.service().load()).toEqual(draft);
  expect(f.repository.loadCommunicationHistory()).toEqual(history);
  expect(onSpeak).not.toHaveBeenCalled();
  expect(onGenerateAiSentences).not.toHaveBeenCalled();
  reopened.unmount();
});

test('saved reuse cannot bypass an explicit rejection of the same ordered expression', async () => {
  const f = fixture({ rejected: true }), onUseSavedPhrase = jest.fn(), onSpeak = jest.fn();
  const item = { id: 'synthetic-saved', sentence: defaultSentence, output: orderedPeople };
  const wrapper = controlled({ expressionDraftService: f.service(), savedPhrases: [item],
    onUseSavedPhrase, onSpeak, candidateAutoplayDelaySeconds: 0 });
  resume(wrapper);
  const original = f.service().load();
  await act(async () => { reuseSaved(wrapper, item, 'same-rejected'); });
  wrapper.update();
  expect(f.service().load()).toEqual(original);
  expect(wrapper.text()).toContain('已停止这组候选');
  expect(onUseSavedPhrase).not.toHaveBeenCalled();
  expect(onSpeak).not.toHaveBeenCalled();
  expect(f.repository.loadCommunicationHistory()).toEqual([]);
  wrapper.unmount();
});
