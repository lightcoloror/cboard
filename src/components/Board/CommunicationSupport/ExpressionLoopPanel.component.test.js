import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import ExpressionLoopPanel from './ExpressionLoopPanel.component';
import { createBoardDTO } from '../../../common/communicationSupport/dto';
import { buildExpressionOutputSignature } from '../../../common/communicationSupport/expressionPipeline';
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
    onUseSavedPhrase.mockClear();
    onGenerateAiSentences.mockReset();
    onShareExpression.mockReset();
    onShareExpression.mockResolvedValue({
      ok: true,
      message: '分享面板已打开。'
    });
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
              { sentence: '我想水。', feedback: null }
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
    await finishSpeechRun(wrapper, onSpeak, 4);

    expect(onSpeak).toHaveBeenCalledTimes(4);
    expect(wrapper.text()).toContain('想水。');

    onSpeak.mockClear();
    wrapper
      .find('button.CommunicationSupportPanel__candidate')
      .at(1)
      .simulate('click');
    await finishSpeechRun(wrapper, onSpeak, 1);

    expect(onSpeak).toHaveBeenCalledTimes(1);
    expect(onSpeak).toHaveBeenCalledWith('我想水。', expect.any(Function));

    findPatientAction(wrapper, PATIENT_ACTION_IDS.save).simulate('click');
    findPatientAction(wrapper, PATIENT_ACTION_IDS.confirm).simulate('click');

    expect(onSavePhrase).toHaveBeenCalledWith({
      contractVersion: 1,
      sentence: '我想水。',
      output
    });
    expect(onAppendHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        contractVersion: 1,
        direction: 'express',
        sentence: '我想水。',
        labels: ['想', '水'],
        output,
        candidateSentences: expect.arrayContaining(['想水。', '我想水。'])
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

    expect(onShareExpression).toHaveBeenCalledWith('我想水。');
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
      ).toHaveLength(4);
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

      wrapper
        .find('div.CommunicationSupportPanel__content')
        .first()
        .simulate('mouseDown');
      expect(onCancelSpeech).toHaveBeenCalled();
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
      expect(onSpeak.mock.calls[0][0]).toBe('我想水。');

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
      candidates: ['请给我一杯水。', '我现在想喝水。'],
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
          recentSentences: ['你想喝什么？'],
          scene: 'hospital'
        })
      })
    );
    expect(wrapper.text()).toContain('请给我一杯水。');
    expect(wrapper.text()).toContain('已生成 AI 候选句');
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
      expect.any(Function)
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
