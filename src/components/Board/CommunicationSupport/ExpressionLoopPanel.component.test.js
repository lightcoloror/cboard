import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import ExpressionLoopPanel from './ExpressionLoopPanel.component';

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

describe('ExpressionLoopPanel', () => {
  const onApplyOutput = jest.fn();
  const onSpeak = jest.fn();
  const onCancelSpeech = jest.fn();
  const onSavePhrase = jest.fn();
  const onAppendHistory = jest.fn();

  const props = {
    output,
    activeBoardId: 'home',
    savedPhrases: [],
    onApplyOutput,
    onSpeak,
    onCancelSpeech,
    onSavePhrase,
    onAppendHistory
  };

  beforeEach(() => {
    onApplyOutput.mockClear();
    onSpeak.mockClear();
    onCancelSpeech.mockClear();
    onSavePhrase.mockClear();
    onAppendHistory.mockClear();
  });

  test('generates candidates and uses Cboard speech for one selected sentence', async () => {
    const wrapper = mount(<ExpressionLoopPanel {...props} />);

    expect(wrapper.text()).not.toContain('想水。');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '生成并播报')
      .first()
      .simulate('click');
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

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '收藏此句')
      .first()
      .simulate('click');
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '确认此句')
      .first()
      .simulate('click');

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

  test('invalidates candidates when the Cboard output changes', async () => {
    const wrapper = mount(<ExpressionLoopPanel {...props} />);

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '生成并播报')
      .first()
      .simulate('click');
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
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '确认此句')
        .exists()
    ).toBe(false);
    expect(onCancelSpeech).toHaveBeenCalled();
  });

  test('recovers when the speech engine never reports completion', async () => {
    jest.useFakeTimers();
    const stalledSpeak = jest.fn();
    const wrapper = mount(
      <ExpressionLoopPanel {...props} onSpeak={stalledSpeak} />
    );

    try {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '生成并播报')
        .first()
        .simulate('click');

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

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '确认此句')
      .first()
      .simulate('click');

    expect(onAppendHistory).toHaveBeenCalledWith(
      expect.objectContaining({ sentence: '请帮我喝一点水。' })
    );
  });
});
