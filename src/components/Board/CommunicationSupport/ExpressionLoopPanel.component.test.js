import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import ExpressionLoopPanel from './ExpressionLoopPanel.component';
import { createBoardDTO } from '../../../common/communicationSupport/dto';
import { buildExpressionOutputSignature } from '../../../common/communicationSupport/expressionPipeline';
import { createCommunicationRepository } from '../../../common/communicationSupport/repository';
import { PATIENT_ACTION_IDS } from '../../../common/communicationSupport/patientActionLanguage';
import PatientActionButton from './PatientActionButton.component';

const output = [
  { id: 'want', label: '想', image: '/want.png' },
  { id: 'water', label: '水', image: '/water.png' }
];

async function finishSpeechRun(wrapper, speakMock, expectedCount) {
  for (let index = 0; index < expectedCount; index += 1) {
    expect(speakMock).toHaveBeenCalledTimes(index + 1);
    await act(async () => {
      speakMock.mock.calls[index][1]();
      await Promise.resolve();
    });
    wrapper.update();
  }
}

function findPatientAction(wrapper, action) {
  return wrapper
    .find(PatientActionButton)
    .filterWhere(node => node.prop('action') === action)
    .first();
}

describe('ExpressionLoopPanel', () => {
  const onApplyOutput = jest.fn();
  const onPictogramUsed = jest.fn();
  const onSpeak = jest.fn();
  const onCancelSpeech = jest.fn();
  const onSavePhrase = jest.fn();
  const onAppendHistory = jest.fn(entry => ({
    ...entry,
    id: entry.id || 'history-1'
  }));
  const onSaveCandidateFeedbackDraft = jest.fn(entry => ({
    ...entry,
    id: entry.id || 'feedback-draft-1'
  }));
  const onDiscardCandidateFeedbackDraft = jest.fn();
  const onUseSavedPhrase = jest.fn();
  const onGenerateAiSentences = jest.fn();
  const onShareExpression = jest.fn();

  const props = {
    output,
    boards: [],
    activeBoardId: 'home',
    pictogramOrdering: {},
    savedPhrases: [],
    onApplyOutput,
    onPictogramUsed,
    onSpeak,
    onCancelSpeech,
    onSavePhrase,
    onAppendHistory,
    onSaveCandidateFeedbackDraft,
    onDiscardCandidateFeedbackDraft,
    candidateFeedbackDrafts: [],
    conversationSessionId: 'session-1',
    onUseSavedPhrase,
    onShareExpression,
    candidateAutoplayDelaySeconds: 0
  };

  test('hidden or unmounted inactive expression does not cancel another panel playback', () => {
    const cancel=jest.fn();
    const descriptor=Object.getOwnPropertyDescriptor(document,'hidden');
    const wrapper=mount(<ExpressionLoopPanel {...props} active={false} onCancelSpeech={cancel} />);
    const before=cancel.mock.calls.length;
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    act(()=>document.dispatchEvent(new Event('visibilitychange')));
    wrapper.unmount();
    expect(cancel).toHaveBeenCalledTimes(before);
    if(descriptor) Object.defineProperty(document,'hidden',descriptor); else delete document.hidden;
  });

  test('hidden edits and Cordova pause do not schedule old candidates; visibility alone does not replay', () => {
    jest.useFakeTimers();
    const descriptor=Object.getOwnPropertyDescriptor(document,'hidden');let hidden=false;
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
    const speak=jest.fn(),wrapper=mount(<ExpressionLoopPanel {...props} onSpeak={speak} candidateAutoplayDelaySeconds={15} />);
    try {
      act(()=>{document.dispatchEvent(new Event('pause'));jest.advanceTimersByTime(16000);});
      expect(speak).not.toHaveBeenCalled();
      hidden=true;
      act(()=>{document.dispatchEvent(new Event('visibilitychange'));wrapper.setProps({output:[...output,{id:'no',label:'不'}]});});
      act(()=>jest.advanceTimersByTime(16000));
      expect(speak).not.toHaveBeenCalled();
      act(()=>{hidden=false;document.dispatchEvent(new Event('visibilitychange'));jest.advanceTimersByTime(16000);});
      expect(speak).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();if(descriptor)Object.defineProperty(document,'hidden',descriptor);else delete document.hidden;
      jest.useRealTimers();
    }
  });

  test('favorite capacity and persistence errors stay visible without losing the expression, then retry succeeds', () => {
    const save = jest.fn().mockImplementationOnce(() => {
      const error = new Error('常用语已达到容量上限（100条），请先整理已有收藏。');
      error.code = 'SAVED_PHRASE_CAPACITY';
      throw error;
    }).mockImplementationOnce(() => { throw new Error('合成读回失败'); }).mockReturnValue(true);
    const wrapper = mount(<ExpressionLoopPanel {...props} onSavePhrase={save} />);
    const click = () => act(() => findPatientAction(wrapper, PATIENT_ACTION_IDS.save).prop('onClick')());
    expect(click).not.toThrow(); wrapper.update();
    expect(wrapper.find('[role="alert"]').text()).toContain('容量上限');
    expect(findPatientAction(wrapper, PATIENT_ACTION_IDS.save).prop('disabled')).toBe(false);
    expect(wrapper.text()).toContain('想水。');
    click(); wrapper.update();
    expect(wrapper.find('[role="alert"]').text()).toContain('合成读回失败');
    click(); wrapper.update();
    expect(findPatientAction(wrapper, PATIENT_ACTION_IDS.save).prop('label')).toBe('已收藏');
    expect(wrapper.text()).not.toContain('合成读回失败');
    expect(save).toHaveBeenCalledTimes(3);
    expect(save.mock.calls[0][0]).toEqual(save.mock.calls[2][0]);
    expect(onAppendHistory).not.toHaveBeenCalled();
    expect(onSpeak).not.toHaveBeenCalled();
    expect(onApplyOutput).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  test.each([99, 100, 101])('direct favorite with %i existing items keeps old snapshots and permits a safe retry', count => {
    const values = new Map([['cboard_communication_saved_phrases', JSON.stringify(Array.from({ length: count }, (_, index) => ({
      id: `old-${index}`, sentence: `合成原句${index}`, createdAt: index + 1,
      output: [{ id: 'same', label: '合成林安', personId: `person-${index}`, image: '/synthetic.png' }]
    })))]]);
    const repository = createCommunicationRepository({ storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
    const before = repository.loadCommunicationSavedPhrases();
    const save = jest.fn(repository.saveCommunicationPhrase);
    const wrapper = mount(<ExpressionLoopPanel {...props} onSavePhrase={save} />);
    const click = () => { act(() => findPatientAction(wrapper, PATIENT_ACTION_IDS.save).prop('onClick')()); wrapper.update(); };
    click();
    if (count >= 100) {
      expect(wrapper.find('[role="alert"]').text()).toContain('容量上限');
      expect(repository.loadCommunicationSavedPhrases()).toEqual(before);
      expect(wrapper.text()).toContain('想水。');
      while (repository.loadCommunicationSavedPhrases().length >= 100)
        repository.deleteCommunicationSavedPhrase(repository.loadCommunicationSavedPhrases().slice(-1)[0].id);
      click();
    }
    expect(repository.loadCommunicationSavedPhrases()).toHaveLength(100);
    expect(repository.loadCommunicationSavedPhrases().filter(item => item.sentence === '想水。')).toHaveLength(1);
    expect(repository.loadCommunicationSavedPhrases().find(item => item.sentence === '想水。').output).toEqual(output);
    repository.loadCommunicationSavedPhrases().filter(item => item.id.startsWith('old-')).forEach(item => expect(item).toEqual(before.find(old => old.id === item.id)));
    expect(findPatientAction(wrapper, PATIENT_ACTION_IDS.save).prop('disabled')).toBe(true);
    expect(onAppendHistory).not.toHaveBeenCalled();
    expect(onSpeak).not.toHaveBeenCalled();
    expect(onApplyOutput).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  test('silent view preserves identities; replay counts once; late completion after close does not count', async () => {
    const item = { id:'synthetic-view', sentence:'我今晚不回家吃饭', output:[
      {id:'same',label:'合成林安',personId:'a',image:'/synthetic-a.png'},
      {id:'same',label:'合成林安',personId:'b',image:'/synthetic-b.png'}] };
    const wrapper=mount(<ExpressionLoopPanel {...props} savedPhrases={[item]} />);
    const view=()=>act(()=>{wrapper.find('ForwardRef(Button)').filterWhere(n=>n.text()==='查看整句').first().simulate('click');});
    view(); wrapper.update();
    let dialog=wrapper.find('CommunicationPlaybackDialog').first();
    expect(dialog.prop('item').output).toEqual(item.output);
    expect(onSpeak).not.toHaveBeenCalled(); expect(onUseSavedPhrase).not.toHaveBeenCalled();
    expect(onApplyOutput).not.toHaveBeenCalled();
    wrapper.find('img.CommunicationSupportPanel__playbackImage').first().simulate('error');
    expect(wrapper.find('.CommunicationSupportPanel__playbackMissing').text()).toContain('图片不可用，保留文字');
    let task;
    await act(async()=>{task=dialog.prop('onReplay')(); dialog.prop('onReplay')(); await Promise.resolve();});
    expect(onSpeak).toHaveBeenCalledTimes(1); expect(onUseSavedPhrase).not.toHaveBeenCalled();
    await act(async()=>{onSpeak.mock.calls[0][1](); await task;}); wrapper.update();
    expect(onUseSavedPhrase).toHaveBeenCalledTimes(1);
    await act(async()=>{task=wrapper.find('CommunicationPlaybackDialog').first().prop('onReplay')(); await Promise.resolve();});
    await act(async()=>{onSpeak.mock.calls[1][1](); await task;});
    expect(onUseSavedPhrase).toHaveBeenCalledTimes(1);
    act(()=>wrapper.find('CommunicationPlaybackDialog').first().prop('onClose')()); wrapper.update();
    view(); wrapper.update();
    await act(async()=>{task=wrapper.find('CommunicationPlaybackDialog').first().prop('onReplay')(); await Promise.resolve();});
    act(()=>wrapper.find('CommunicationPlaybackDialog').first().prop('onClose')());
    await act(async()=>{onSpeak.mock.calls[2][1](); await task;});
    expect(onUseSavedPhrase).toHaveBeenCalledTimes(1);
    expect(onAppendHistory).not.toHaveBeenCalled(); expect(onGenerateAiSentences).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  beforeEach(() => {
    onApplyOutput.mockClear();
    onPictogramUsed.mockClear();
    onSpeak.mockClear();
    onCancelSpeech.mockClear();
    onSavePhrase.mockClear();
    onAppendHistory.mockClear();
    onAppendHistory.mockImplementation(entry => ({
      ...entry,
      id: entry.id || 'history-1'
    }));
    onSaveCandidateFeedbackDraft.mockClear();
    onSaveCandidateFeedbackDraft.mockImplementation(entry => ({
      ...entry,
      id: entry.id || 'feedback-draft-1'
    }));
    onDiscardCandidateFeedbackDraft.mockClear();
    onDiscardCandidateFeedbackDraft.mockImplementation(() => true);
    onUseSavedPhrase.mockClear();
    onGenerateAiSentences.mockReset();
    onShareExpression.mockReset();
    onShareExpression.mockResolvedValue({
      ok: true,
      message: '分享面板已打开。'
    });
  });

  test('filters existing life contexts without model, playback or changing the output', () => {
    const wrapper = mount(<ExpressionLoopPanel {...props} onGenerateAiSentences={onGenerateAiSentences} aiAvailable savedPhrases={[
      { id: 'meal', sentence: '我今晚不回家吃饭', output, lifeContext: '吃饭' },
      { id: 'walk', sentence: '欧阳明澈陪我散步', output, lifeContext: '散步' }
    ]} />);
    const filter = wrapper.find('div[aria-label="生活情境筛选"]');
    filter.find('ForwardRef(Button)').filterWhere(node => node.text() === '散步').simulate('click');
    wrapper.update();
    expect(wrapper.find('.CommunicationSupportPanel__savedList').text()).toContain('欧阳明澈陪我散步');
    expect(wrapper.find('.CommunicationSupportPanel__savedList').text()).not.toContain('我今晚不回家吃饭');
    expect(onApplyOutput).not.toHaveBeenCalled();
    expect(onSpeak).not.toHaveBeenCalled();
    expect(onGenerateAiSentences).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  test('reject all cancels countdown and late AI without deleting images; undo needs manual playback', async () => {
    jest.useFakeTimers();
    let resolveAi;
    onGenerateAiSentences.mockImplementation(() => new Promise(resolve => { resolveAi = resolve; }));
    const wrapper = mount(<ExpressionLoopPanel {...props} aiAvailable onGenerateAiSentences={onGenerateAiSentences} candidateAutoplayDelaySeconds={5} />);
    expect(wrapper.text()).toContain('5 秒无操作后自动播报');
    await act(async () => { findPatientAction(wrapper, PATIENT_ACTION_IDS.improve).prop('onClick')(); });
    wrapper.update();
    expect(wrapper.text()).not.toContain('秒无操作后自动播报');
    act(() => { findPatientAction(wrapper, PATIENT_ACTION_IDS.notUnderstood).prop('onClick')(); });
    wrapper.update();
    expect(wrapper.find('button.CommunicationSupportPanel__candidate')).toHaveLength(0);
    expect(onApplyOutput).not.toHaveBeenCalled();
    expect(onSaveCandidateFeedbackDraft).toHaveBeenLastCalledWith(expect.objectContaining({ rejected: true, outputSignature: buildExpressionOutputSignature(output) }));
    await act(async () => { resolveAi({ candidates: ['我的意思是：想水。'] }); await Promise.resolve(); jest.advanceTimersByTime(10000); });
    wrapper.update();
    expect(onSpeak).not.toHaveBeenCalled();
    expect(onAppendHistory).not.toHaveBeenCalled();
    expect(onSavePhrase).not.toHaveBeenCalled();
    act(() => { findPatientAction(wrapper, PATIENT_ACTION_IDS.undo).prop('onClick')(); jest.advanceTimersByTime(10000); });
    wrapper.update();
    expect(wrapper.find('button.CommunicationSupportPanel__candidate')).toHaveLength(3);
    expect(wrapper.text()).not.toContain('秒无操作后自动播报');
    expect(wrapper.text()).toContain('当前不会自动播报，请手动选择一句或全部播报。');
    expect(onSpeak).not.toHaveBeenCalled();
    expect(onGenerateAiSentences).toHaveBeenCalledTimes(1);
    await act(async () => { wrapper.find('button.CommunicationSupportPanel__candidate').first().simulate('click'); });
    expect(onSpeak).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    jest.useRealTimers();
  });

  test('reject during all-play stops the remaining queue even after the speech callback arrives', async () => {
    const wrapper = mount(<ExpressionLoopPanel {...props} />);
    act(() => { findPatientAction(wrapper, PATIENT_ACTION_IDS.playAll).prop('onClick')(); });
    expect(onSpeak).toHaveBeenCalledTimes(1);
    act(() => { findPatientAction(wrapper, PATIENT_ACTION_IDS.notUnderstood).prop('onClick')(); });
    await act(async () => { onSpeak.mock.calls[0][1](); await Promise.resolve(); });
    expect(onSpeak).toHaveBeenCalledTimes(1);
    expect(onApplyOutput).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  test('restored rejection blocks autoplay, confirmation and sharing; a failed undo remains blocked', async () => {
    jest.useFakeTimers();
    const draft = { contractVersion: 1, id: 'reject-1', sessionId: 'session-1', outputSignature: buildExpressionOutputSignature(output), rejected: true, candidates: [{ sentence: '想水。', feedback: null }], createdAt: 1, updatedAt: 2 };
    const wrapper = mount(<ExpressionLoopPanel {...props} candidateFeedbackDrafts={[draft]} candidateAutoplayDelaySeconds={5} />);
    act(() => { jest.advanceTimersByTime(10000); });
    expect(onSpeak).not.toHaveBeenCalled();
    expect(wrapper.find('button.CommunicationSupportPanel__candidate')).toHaveLength(0);
    expect(wrapper.find(PatientActionButton).filterWhere(node => node.prop('action') === PATIENT_ACTION_IDS.confirm)).toHaveLength(0);
    onDiscardCandidateFeedbackDraft.mockReturnValueOnce(false);
    act(() => { findPatientAction(wrapper, PATIENT_ACTION_IDS.undo).prop('onClick')(); });
    wrapper.update();
    expect(wrapper.text()).toContain('撤销未能保存');
    expect(wrapper.find('button.CommunicationSupportPanel__candidate')).toHaveLength(0);
    wrapper.setProps({ output: [{ id: 'person-b', label: '林知岚' }], candidateFeedbackDrafts: [draft] });
    wrapper.update();
    expect(wrapper.find('button.CommunicationSupportPanel__candidate')).toHaveLength(3);
    expect(onAppendHistory).not.toHaveBeenCalled();
    expect(onShareExpression).not.toHaveBeenCalled();
    wrapper.unmount();
    jest.useRealTimers();
  });

  test('storage failure still stops candidates and reports the persistence limit', () => {
    onSaveCandidateFeedbackDraft.mockReturnValueOnce(null);
    const wrapper = mount(<ExpressionLoopPanel {...props} />);
    act(() => { findPatientAction(wrapper, PATIENT_ACTION_IDS.notUnderstood).prop('onClick')(); });
    wrapper.update();
    expect(wrapper.text()).toContain('拒绝状态未能保存');
    expect(wrapper.find('button.CommunicationSupportPanel__candidate')).toHaveLength(0);
    expect(onApplyOutput).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  test('reopens real stored rejection with the selected same-name identity, then undo leaves history unchanged', () => {
    jest.useFakeTimers();
    const values = new Map();
    const storage = {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key)
    };
    const repository = createCommunicationRepository({ storage });
    const chosenOutput = [{ id: 'synthetic-person-b', label: '林知岚', image: 'synthetic-private://person-b' }, { id: 'pain', label: '痛' }];
    const savedProps = {
      ...props, output: chosenOutput,
      conversationSessionId: repository.getActiveConversationSession().id,
      candidateAutoplayDelaySeconds: 5,
      onSaveCandidateFeedbackDraft: entry => repository.saveExpressionCandidateFeedbackDraft(entry),
      onDiscardCandidateFeedbackDraft: id => repository.removeExpressionCandidateFeedbackDraft(id)
    };
    let wrapper = mount(<ExpressionLoopPanel {...savedProps} />);
    act(() => { findPatientAction(wrapper, PATIENT_ACTION_IDS.notUnderstood).prop('onClick')(); });
    wrapper.unmount();
    const reopened = createCommunicationRepository({ storage });
    wrapper = mount(<ExpressionLoopPanel {...savedProps} candidateFeedbackDrafts={reopened.loadExpressionCandidateFeedbackDrafts()} />);
    act(() => { jest.advanceTimersByTime(10000); });
    expect(wrapper.text()).not.toContain('秒无操作后自动播报');
    expect(wrapper.find('button.CommunicationSupportPanel__candidate')).toHaveLength(0);
    expect(wrapper.find('img.CommunicationSupportPanel__sequenceImage').first().prop('src')).toBe('synthetic-private://person-b');
    expect(onSpeak).not.toHaveBeenCalled();
    expect(reopened.loadConversationContext().turns).toEqual([]);
    act(() => { findPatientAction(wrapper, PATIENT_ACTION_IDS.undo).prop('onClick')(); jest.advanceTimersByTime(10000); });
    wrapper.update();
    expect(wrapper.find('button.CommunicationSupportPanel__candidate')).toHaveLength(3);
    expect(reopened.loadExpressionCandidateFeedbackDrafts()).toEqual([]);
    expect(reopened.loadCommunicationHistory()).toEqual([]);
    expect(wrapper.text()).not.toContain('秒无操作后自动播报');
    expect(wrapper.text()).toContain('当前不会自动播报，请手动选择一句或全部播报。');
    expect(onApplyOutput).not.toHaveBeenCalled();
    expect(onSpeak).not.toHaveBeenCalled();
    wrapper.unmount();
    jest.useRealTimers();
  });

  test('rejecting an already confirmed expression never removes its history, even if draft save fails', () => {
    const wrapper = mount(<ExpressionLoopPanel {...props} />);
    act(() => { findPatientAction(wrapper, PATIENT_ACTION_IDS.confirm).prop('onClick')(); });
    wrapper.update();
    onSaveCandidateFeedbackDraft.mockReturnValueOnce(null);
    act(() => { findPatientAction(wrapper, PATIENT_ACTION_IDS.notUnderstood).prop('onClick')(); });
    wrapper.update();
    act(() => { findPatientAction(wrapper, PATIENT_ACTION_IDS.undo).prop('onClick')(); });
    wrapper.update();
    expect(wrapper.find('button.CommunicationSupportPanel__candidate')).toHaveLength(3);
    expect(onDiscardCandidateFeedbackDraft).not.toHaveBeenCalledWith('history-1');
    expect(onAppendHistory).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  test('persists candidate feedback without interrupting speech and supports replacement or cancellation', () => {
    const wrapper = mount(<ExpressionLoopPanel {...props} />);
    const findFeedback = label =>
      wrapper
        .find('button.CommunicationSupportPanel__candidateFeedback')
        .filterWhere(node => node.prop('aria-label') === label)
        .first();

    findFeedback('有帮助：想水。').simulate('click');
    wrapper.update();

    expect(onSpeak).not.toHaveBeenCalled();
    expect(onSaveCandidateFeedbackDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        outputSignature: expect.any(String),
        candidates: expect.arrayContaining([
          { sentence: '想水。', feedback: 'up' }
        ])
      })
    );
    expect(findFeedback('有帮助：想水。').prop('aria-pressed')).toBe(true);

    findFeedback('不符合：想水。').simulate('click');
    wrapper.update();
    expect(onSaveCandidateFeedbackDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'feedback-draft-1',
        candidates: expect.arrayContaining([
          { sentence: '想水。', feedback: 'down' }
        ])
      })
    );

    findFeedback('不符合：想水。').simulate('click');
    wrapper.update();
    expect(onDiscardCandidateFeedbackDraft).toHaveBeenCalledWith(
      'feedback-draft-1'
    );
    expect(wrapper.text()).toContain('已取消这条反馈');
  });

  test('restores a matching feedback draft and reuses its id', () => {
    const wrapper = mount(
      <ExpressionLoopPanel
        {...props}
        candidateFeedbackDrafts={[
          {
            contractVersion: 1,
            id: 'restored-feedback-draft',
            sessionId: 'session-1',
            outputSignature: buildExpressionOutputSignature(output),
            candidates: [
              { sentence: '想水。', feedback: 'up' },
              { sentence: '我的意思是：想水。', feedback: null }
            ],
            createdAt: 10,
            updatedAt: 20
          }
        ]}
      />
    );
    const helpful = wrapper
      .find('button.CommunicationSupportPanel__candidateFeedback')
      .filterWhere(node => node.prop('aria-label') === '有帮助：想水。')
      .first();

    expect(helpful.prop('aria-pressed')).toBe(true);
    helpful.simulate('click');
    wrapper.update();
    expect(onDiscardCandidateFeedbackDraft).toHaveBeenCalledWith(
      'restored-feedback-draft'
    );
  });

  test('generates candidates and uses Cboard speech for one selected sentence', async () => {
    const wrapper = mount(<ExpressionLoopPanel {...props} />);

    expect(wrapper.text()).toContain('想水。');

    findPatientAction(wrapper, PATIENT_ACTION_IDS.playAll).simulate('click');
    await finishSpeechRun(wrapper, onSpeak, 3);

    expect(onSpeak).toHaveBeenCalledTimes(3);
    expect(wrapper.text()).toContain('想水。');

    onSpeak.mockClear();
    wrapper
      .find('button.CommunicationSupportPanel__candidate')
      .at(1)
      .simulate('click');
    await finishSpeechRun(wrapper, onSpeak, 1);

    expect(onSpeak).toHaveBeenCalledTimes(1);
    expect(onSpeak).toHaveBeenCalledWith(
      '我的意思是：想水。',
      expect.any(Function),
      output
    );

    findPatientAction(wrapper, PATIENT_ACTION_IDS.save).simulate('click');
    findPatientAction(wrapper, PATIENT_ACTION_IDS.confirm).simulate('click');

    expect(onSavePhrase).toHaveBeenCalledWith({
      contractVersion: 1,
      sentence: '我的意思是：想水。',
      output
    });
    expect(onAppendHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        contractVersion: 1,
        direction: 'express',
        sentence: '我的意思是：想水。',
        labels: ['想', '水'],
        output,
        candidateSentences: expect.arrayContaining([
          '想水。',
          '我的意思是：想水。'
        ])
      })
    );
  });

  test('shares only the selected sentence without speaking or clearing', async () => {
    const wrapper = mount(<ExpressionLoopPanel {...props} />);
    wrapper
      .find('button.CommunicationSupportPanel__candidate')
      .at(1)
      .simulate('click');
    await finishSpeechRun(wrapper, onSpeak, 1);
    onSpeak.mockClear();

    await act(async () => {
      findPatientAction(wrapper, PATIENT_ACTION_IDS.share).prop('onClick')();
      await Promise.resolve();
    });
    wrapper.update();

    expect(onShareExpression).toHaveBeenCalledWith('我的意思是：想水。', {
      isCurrent: expect.any(Function)
    });
    expect(onSpeak).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('分享面板已打开');
    expect(
      wrapper.find('div.CommunicationSupportPanel__sequenceItem')
    ).toHaveLength(2);
  });

  test.each([
    { failure: 'returns no record', persist: () => null },
    {
      failure: 'throws a storage error',
      persist: () => {
        throw new Error('quota exceeded');
      }
    }
  ])(
    'keeps the expression visible and retryable when history persistence $failure',
    ({ persist }) => {
      onAppendHistory.mockImplementationOnce(persist);
      const wrapper = mount(<ExpressionLoopPanel {...props} />);
      const findConfirm = () =>
        findPatientAction(wrapper, PATIENT_ACTION_IDS.confirm);

      findConfirm().simulate('click');
      wrapper.update();

      expect(wrapper.text()).toContain(
        '表达未能保存，图片和候选句已保留，请重试。'
      );
      expect(
        wrapper.find('div.CommunicationSupportPanel__sequenceItem')
      ).toHaveLength(2);
      expect(
        wrapper.find('button.CommunicationSupportPanel__candidate')
      ).toHaveLength(3);
      expect(findConfirm().prop('disabled')).toBe(false);

      findConfirm().simulate('click');
      wrapper.update();

      expect(onAppendHistory).toHaveBeenCalledTimes(2);
      expect(wrapper.text()).not.toContain('表达未能保存');
      expect(findConfirm().prop('label')).toBe('已确认');
    }
  );

  test('moves and removes any selected image before generating candidates', () => {
    const wrapper = mount(<ExpressionLoopPanel {...props} />);
    const rows = wrapper.find('div.CommunicationSupportPanel__sequenceItem');

    rows
      .at(0)
      .find(PatientActionButton)
      .filterWhere(node => node.prop('action') === PATIENT_ACTION_IDS.moveRight)
      .first()
      .simulate('click');
    expect(onApplyOutput).toHaveBeenLastCalledWith([output[1], output[0]]);

    rows
      .at(0)
      .find(PatientActionButton)
      .filterWhere(node => node.prop('action') === PATIENT_ACTION_IDS.remove)
      .first()
      .simulate('click');
    expect(onApplyOutput).toHaveBeenLastCalledWith([output[1]]);
    expect(onCancelSpeech).toHaveBeenCalled();
  });

  test('adds a same-category next pictogram through the shared usage contract', () => {
    const board = createBoardDTO({
      id: 'home',
      name: '首页',
      tiles: [
        { id: 'water', label: '水', tuyujiaCategory: 'drink' },
        { id: 'tea', label: '茶', tuyujiaCategory: 'drink' },
        { id: 'rice', label: '米饭', tuyujiaCategory: 'food' }
      ]
    });
    const selectedWater = board.tiles[0];
    const wrapper = mount(
      <ExpressionLoopPanel
        {...props}
        output={[selectedWater]}
        boards={[board]}
        pictogramOrdering={{
          usageByTileKey: {
            'home:tea': { count: 3, lastUsedAt: 100 }
          }
        }}
      />
    );

    expect(wrapper.text()).toContain('接下来可能需要');
    wrapper
      .find('button.CommunicationSupportPanel__pictogramSuggestion')
      .filterWhere(node => node.text() === '茶')
      .first()
      .simulate('click');

    expect(onPictogramUsed).toHaveBeenCalledWith('home', 'tea');
    expect(onApplyOutput).toHaveBeenCalledWith([selectedWater, board.tiles[1]]);
    expect(wrapper.text()).not.toContain('米饭');
  });

  test('keeps caregiver picture-library search out of patient expression', () => {
    const wrapper = mount(<ExpressionLoopPanel {...props} />);

    expect(wrapper.text()).not.toContain('跨分类找图');
    expect(
      wrapper.find('input#communication-expression-pictogram-search')
    ).toHaveLength(0);
  });

  test('autoplays all candidates after inactivity and cancels on interaction', async () => {
    jest.useFakeTimers();
    const wrapper = mount(
      <ExpressionLoopPanel {...props} candidateAutoplayDelaySeconds={5} />
    );

    try {
      expect(wrapper.text()).toContain('5 秒无操作后自动播报');
      await act(async () => {
        jest.advanceTimersByTime(4999);
        await Promise.resolve();
      });
      expect(onSpeak).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1);
        await Promise.resolve();
      });
      wrapper.update();
      expect(onSpeak).toHaveBeenCalledTimes(1);
      expect(onSpeak.mock.calls[0][0]).toBe('想水。');
      expect(wrapper.text()).not.toContain('秒无操作后自动播报');
      expect(wrapper.text()).toContain('正在播报');

      wrapper
        .find('div.CommunicationSupportPanel__content')
        .first()
        .simulate('mouseDown');
      expect(onCancelSpeech).toHaveBeenCalled();
      wrapper.update();
      expect(wrapper.text()).toContain('当前不会自动播报，请手动选择一句或全部播报。');
    } finally {
      wrapper.unmount();
      jest.useRealTimers();
    }
  });

  test('candidate activation cancels pending autoplay without pointer capture', async () => {
    jest.useFakeTimers();
    const wrapper = mount(
      <ExpressionLoopPanel {...props} candidateAutoplayDelaySeconds={5} />
    );

    try {
      wrapper
        .find('button.CommunicationSupportPanel__candidate')
        .at(1)
        .simulate('click');
      expect(onSpeak).toHaveBeenCalledTimes(1);
      expect(onSpeak.mock.calls[0][0]).toBe('我的意思是：想水。');

      await act(async () => {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
      });
      expect(onSpeak).toHaveBeenCalledTimes(1);
    } finally {
      wrapper.unmount();
      jest.useRealTimers();
    }
  });

  test('resets the inactivity timer when the selected images change', async () => {
    jest.useFakeTimers();
    const wrapper = mount(
      <ExpressionLoopPanel {...props} candidateAutoplayDelaySeconds={5} />
    );

    try {
      await act(async () => {
        jest.advanceTimersByTime(3000);
        wrapper.setProps({
          output: [{ id: 'rest', label: '休息', image: '/rest.png' }]
        });
        await Promise.resolve();
      });
      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });
      expect(onSpeak).not.toHaveBeenCalled();
      wrapper.update();
      expect(wrapper.text()).toContain('5 秒无操作后自动播报');

      await act(async () => {
        jest.advanceTimersByTime(3000);
        await Promise.resolve();
      });
      expect(onSpeak.mock.calls[0][0]).toBe('休息。');
    } finally {
      wrapper.unmount();
      jest.useRealTimers();
    }
  });

  test('replaces stale candidates when the Cboard output changes', async () => {
    const wrapper = mount(<ExpressionLoopPanel {...props} />);

    findPatientAction(wrapper, PATIENT_ACTION_IDS.playAll).simulate('click');
    wrapper.update();

    const staleOnEnd = onSpeak.mock.calls[0][1];
    await act(async () => {
      wrapper.setProps({
        output: [{ id: 'rest', label: '休息', image: '/rest.png' }]
      });
      staleOnEnd();
      await Promise.resolve();
    });
    wrapper.update();

    expect(wrapper.text()).not.toContain('想水。');
    expect(wrapper.text()).toContain('当前输出：休息');
    expect(
      findPatientAction(wrapper, PATIENT_ACTION_IDS.confirm).exists()
    ).toBe(true);
    expect(onCancelSpeech).toHaveBeenCalled();
  });

  test('applies optional AI candidates without replacing the local fallback', async () => {
    onGenerateAiSentences.mockResolvedValue({
      candidates: ['我想表达的是：想水。', '想水。'],
      provider: 'cboard-api-ai'
    });
    const wrapper = mount(
      <ExpressionLoopPanel
        {...props}
        aiAvailable
        conversationContext={{
          scene: 'hospital',
          turns: [{ direction: 'receive', inputText: '你想喝什么？' }]
        }}
        onGenerateAiSentences={onGenerateAiSentences}
      />
    );

    await act(async () => {
      findPatientAction(wrapper, PATIENT_ACTION_IDS.improve).simulate('click');
      await Promise.resolve();
    });
    wrapper.update();

    expect(onGenerateAiSentences).toHaveBeenCalledWith(
      expect.objectContaining({
        pictogramLabels: ['想', '水'],
        context: expect.objectContaining({
          recentSentences: [],
          scene: 'hospital'
        })
      })
    );
    expect(wrapper.text()).toContain('我想表达的是：想水。');
    expect(wrapper.text()).toContain('已生成 AI 候选句');
  });

  test('does not speak or save added pain degree/time from an older API response', async () => {
    onGenerateAiSentences.mockResolvedValue({
      candidates: ['我好痛。', '我现在很痛。']
    });
    const painOutput = [{ id: 'me', label: '我' }, { id: 'pain', label: '痛' }];
    const wrapper = mount(
      <ExpressionLoopPanel
        {...props}
        output={painOutput}
        aiAvailable
        onGenerateAiSentences={onGenerateAiSentences}
      />
    );
    await act(async () => {
      findPatientAction(wrapper, PATIENT_ACTION_IDS.improve).simulate('click');
    });
    wrapper.update();
    const candidates = wrapper
      .find('button.CommunicationSupportPanel__candidate')
      .map(node => node.text());
    expect(candidates).toEqual([
      '我痛。',
      '我的意思是：我痛。',
      '我想表达的是：我痛。'
    ]);
    findPatientAction(wrapper, PATIENT_ACTION_IDS.playAll).simulate('click');
    await finishSpeechRun(wrapper, onSpeak, 3);
    expect(onSpeak.mock.calls.map(call => call[0])).toEqual(candidates);
    onSpeak.mockClear();
    wrapper
      .find('button.CommunicationSupportPanel__candidate')
      .at(0)
      .simulate('click');
    await finishSpeechRun(wrapper, onSpeak, 1);
    findPatientAction(wrapper, PATIENT_ACTION_IDS.confirm).simulate('click');
    findPatientAction(wrapper, PATIENT_ACTION_IDS.save).simulate('click');
    expect(onSavePhrase).toHaveBeenLastCalledWith(
      expect.objectContaining({ sentence: '我痛。' })
    );
    expect(onGenerateAiSentences).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  test('keeps local candidates and explains a monthly AI quota', async () => {
    onGenerateAiSentences.mockRejectedValue({
      response: {
        status: 429,
        data: {
          error: { code: 'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED' }
        }
      }
    });
    const wrapper = mount(
      <ExpressionLoopPanel
        {...props}
        aiAvailable
        onGenerateAiSentences={onGenerateAiSentences}
      />
    );

    await act(async () => {
      findPatientAction(wrapper, PATIENT_ACTION_IDS.improve).simulate('click');
      await Promise.resolve();
    });
    wrapper.update();

    expect(wrapper.text()).toContain('本月 AI 增强额度已用完');
    expect(wrapper.text()).toContain('想水。');
    expect(wrapper.text()).not.toContain(
      'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED'
    );
  });

  test('plays all AI choices without replacing them or calling AI again, then saves the selected one', async () => {
    const candidates = ['我想表达的是：想水。', '想水。', '我的意思是：想水。'];
    onGenerateAiSentences.mockResolvedValue({
      candidates,
      provider: 'synthetic-ai'
    });
    const wrapper = mount(
      <ExpressionLoopPanel
        {...props}
        aiAvailable
        onGenerateAiSentences={onGenerateAiSentences}
      />
    );
    await act(async () => {
      findPatientAction(wrapper, PATIENT_ACTION_IDS.improve).simulate('click');
    });
    wrapper.update();
    const readCandidates = () =>
      wrapper
        .find('button.CommunicationSupportPanel__candidate')
        .map(node => node.text());
    expect(readCandidates()).toEqual(candidates);
    expect(onGenerateAiSentences.mock.calls[0][0].candidateCount).toBe(3);
    findPatientAction(wrapper, PATIENT_ACTION_IDS.playAll).simulate('click');
    await finishSpeechRun(wrapper, onSpeak, 3);
    expect(onSpeak.mock.calls.map(call => call[0])).toEqual(candidates);
    expect(readCandidates()).toEqual(candidates);
    onSpeak.mockClear();
    wrapper
      .find('button.CommunicationSupportPanel__candidate')
      .at(1)
      .simulate('click');
    await finishSpeechRun(wrapper, onSpeak, 1);
    findPatientAction(wrapper, PATIENT_ACTION_IDS.confirm).simulate('click');
    findPatientAction(wrapper, PATIENT_ACTION_IDS.save).simulate('click');
    expect(onAppendHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sentence: candidates[1],
        candidateSentences: candidates,
        output
      })
    );
    expect(onSavePhrase).toHaveBeenLastCalledWith(
      expect.objectContaining({ sentence: candidates[1], output })
    );
    expect(onGenerateAiSentences).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  test('suspends local autoplay while AI is pending, rejects duplicate clicks and autoplays the resulting three choices', async () => {
    jest.useFakeTimers();
    let resolveAi;
    const candidates = ['我想表达的是：想水。', '想水。', '我的意思是：想水。'];
    onGenerateAiSentences.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveAi = resolve;
        })
    );
    const wrapper = mount(
      <ExpressionLoopPanel
        {...props}
        aiAvailable
        candidateAutoplayDelaySeconds={5}
        onGenerateAiSentences={onGenerateAiSentences}
      />
    );
    try {
      const generate = findPatientAction(
        wrapper,
        PATIENT_ACTION_IDS.improve
      ).prop('onClick');
      act(() => {
        generate();
        generate();
      });
      expect(onGenerateAiSentences).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(6000);
      });
      wrapper.update();
      expect(wrapper.text()).not.toContain('秒无操作后自动播报');
      expect(onSpeak).not.toHaveBeenCalled();
      await act(async () => {
        resolveAi({ candidates });
      });
      wrapper.update();
      expect(wrapper.text()).toContain('5 秒无操作后自动播报');
      await act(async () => {
        jest.advanceTimersByTime(4999);
      });
      expect(onSpeak).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      await finishSpeechRun(wrapper, onSpeak, 3);
      expect(onSpeak.mock.calls.map(call => call[0])).toEqual(candidates);
    } finally {
      wrapper.unmount();
      jest.useRealTimers();
    }
  });

  test('does not let a late AI result replace a manual choice, confirmation or favorite', async () => {
    let resolveAi;
    onGenerateAiSentences.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveAi = resolve;
        })
    );
    const wrapper = mount(
      <ExpressionLoopPanel
        {...props}
        aiAvailable
        onGenerateAiSentences={onGenerateAiSentences}
      />
    );
    act(() => {
      findPatientAction(wrapper, PATIENT_ACTION_IDS.improve).simulate('click');
    });
    wrapper
      .find('button.CommunicationSupportPanel__candidate')
      .at(1)
      .simulate('click');
    await finishSpeechRun(wrapper, onSpeak, 1);
    findPatientAction(wrapper, PATIENT_ACTION_IDS.confirm).simulate('click');
    findPatientAction(wrapper, PATIENT_ACTION_IDS.save).simulate('click');
    await act(async () => {
      resolveAi({ candidates: ['迟到的结果。'] });
    });
    wrapper.update();
    expect(wrapper.text()).not.toContain('迟到的结果。');
    expect(
      wrapper.find('button.CommunicationSupportPanel__candidate--active').text()
    ).toBe('我的意思是：想水。');
    expect(onSavePhrase).toHaveBeenLastCalledWith(
      expect.objectContaining({ sentence: '我的意思是：想水。' })
    );
    expect(onAppendHistory).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  test('generates three local choices without online availability and cancels autoplay on keyboard confirmation', async () => {
    jest.useFakeTimers();
    const wrapper = mount(
      <ExpressionLoopPanel
        {...props}
        output={[{ id: 'i', label: '我想喝水' }]}
        candidateAutoplayDelaySeconds={5}
        onGenerateAiSentences={onGenerateAiSentences}
      />
    );
    try {
      expect(
        findPatientAction(wrapper, PATIENT_ACTION_IDS.improve).prop('label')
      ).toBe('生成三个候选句');
      findPatientAction(wrapper, PATIENT_ACTION_IDS.improve).simulate('click');
      expect(
        wrapper.find('button.CommunicationSupportPanel__candidate')
      ).toHaveLength(3);
      expect(onGenerateAiSentences).not.toHaveBeenCalled();
      findPatientAction(wrapper, PATIENT_ACTION_IDS.confirm).simulate('click');
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      expect(onSpeak).not.toHaveBeenCalled();
      expect(onAppendHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({ sentence: '我想喝水。' })
      );
    } finally {
      wrapper.unmount();
      jest.useRealTimers();
    }
  });

  test('recovers when the speech engine never reports completion', async () => {
    jest.useFakeTimers();
    const stalledSpeak = jest.fn();
    const wrapper = mount(
      <ExpressionLoopPanel {...props} onSpeak={stalledSpeak} />
    );

    try {
      findPatientAction(wrapper, PATIENT_ACTION_IDS.playAll).simulate('click');

      expect(stalledSpeak).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(12000);
        await Promise.resolve();
        await Promise.resolve();
      });
      wrapper.update();

      expect(wrapper.text()).toContain(
        '当前语音引擎无法完成播报，候选句仍可继续使用。'
      );
      expect(stalledSpeak).toHaveBeenCalledTimes(2);
    } finally {
      wrapper.unmount();
      jest.useRealTimers();
    }
  });

  test('reuses a saved sentence even when it is not a local template candidate', () => {
    const savedPhrase = {
      sentence: '请帮我喝一点水。',
      output
    };
    const wrapper = mount(
      <ExpressionLoopPanel {...props} savedPhrases={[savedPhrase]} />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '重用')
      .first()
      .simulate('click');
    wrapper.update();

    expect(onApplyOutput).toHaveBeenCalledWith(output);
    expect(wrapper.text()).toContain('请帮我喝一点水。');

    findPatientAction(wrapper, PATIENT_ACTION_IDS.confirm).simulate('click');

    expect(onAppendHistory).toHaveBeenCalledWith(
      expect.objectContaining({ sentence: '请帮我喝一点水。' })
    );
  });

  test('plays a saved phrase in one tap without replacing the current output', async () => {
    const savedPhrase = {
      id: 'phrase-water',
      sentence: '请给我一点水。',
      output
    };
    const wrapper = mount(
      <ExpressionLoopPanel {...props} savedPhrases={[savedPhrase]} />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '一键播报')
      .first()
      .simulate('click');

    let playbackDialog = wrapper.find('CommunicationPlaybackDialog').first();
    expect(playbackDialog.prop('open')).toBe(true);
    expect(playbackDialog.prop('item')).toBe(savedPhrase);
    expect(
      wrapper.find('img.CommunicationSupportPanel__playbackImage')
    ).toHaveLength(2);
    await finishSpeechRun(wrapper, onSpeak, 1);

    expect(onUseSavedPhrase).toHaveBeenCalledWith(savedPhrase);
    expect(onApplyOutput).not.toHaveBeenCalled();
    expect(onSpeak).toHaveBeenCalledWith(
      '请给我一点水。',
      expect.any(Function),
      savedPhrase.output
    );

    let replayPromise;
    playbackDialog = wrapper.find('CommunicationPlaybackDialog').first();
    await act(async () => {
      replayPromise = playbackDialog.prop('onReplay')();
      await Promise.resolve();
    });
    expect(onSpeak).toHaveBeenCalledTimes(2);
    await act(async () => {
      onSpeak.mock.calls[1][1]();
      await replayPromise;
    });
    wrapper.update();

    act(() => {
      wrapper
        .find('CommunicationPlaybackDialog')
        .first()
        .prop('onClose')();
    });
    wrapper.update();

    expect(
      wrapper
        .find('CommunicationPlaybackDialog')
        .first()
        .prop('open')
    ).toBe(false);
    expect(onUseSavedPhrase).toHaveBeenCalledTimes(1);
    expect(onApplyOutput).not.toHaveBeenCalled();
  });
});
