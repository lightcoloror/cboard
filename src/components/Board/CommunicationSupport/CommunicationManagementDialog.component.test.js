import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import CommunicationManagementDialog from './CommunicationManagementDialog.component';

jest.mock(
  '../Symbol',
  () =>
    function MockSymbol({ label }) {
      return <span data-symbol-label={label}>{label}</span>;
    }
);

const phrase = {
  id: 'phrase-1',
  sentence: '我要喝水',
  output: [{ id: 'water', label: '水' }],
  usageCount: 0,
  createdAt: 1,
  lastUsedAt: 1,
  updatedAt: 1,
  candidateSentences: ['我要喝水', '请给我水'],
  candidates: [
    { sentence: '我要喝水', feedback: null },
    { sentence: '请给我水', feedback: null }
  ]
};

const history = {
  id: 'history-1',
  direction: 'express',
  sentence: '我要喝水',
  labels: ['水'],
  sessionId: 'session-1',
  createdAt: 1,
  updatedAt: 1,
  candidateSentences: ['我要喝水', '请给我水'],
  candidates: [
    { sentence: '我要喝水', feedback: null },
    { sentence: '请给我水', feedback: null }
  ]
};

describe('CommunicationManagementDialog', () => {
  test('renames and reuses saved phrases through pure management functions', () => {
    const onSavedPhrasesChange = jest.fn();
    const onApplyOutput = jest.fn();
    const wrapper = mount(
      <CommunicationManagementDialog
        open
        onClose={jest.fn()}
        savedPhrases={[phrase]}
        historyItems={[history]}
        onSavedPhrasesChange={onSavedPhrasesChange}
        onHistoryChange={jest.fn()}
        onApplyOutput={onApplyOutput}
        onSpeak={jest.fn()}
      />
    );

    expect(wrapper.find('ForwardRef(Dialog)').prop('aria-labelledby')).toBe(
      'communication-management-title'
    );
    expect(wrapper.find('ForwardRef(DialogTitle)').prop('id')).toBe(
      'communication-management-title'
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '编辑')
      .first()
      .simulate('click');
    wrapper.update();
    act(() => {
      wrapper
        .find('ForwardRef(TextField)')
        .first()
        .prop('onChange')({ target: { value: '请给我水' } });
    });
    wrapper.update();
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '保存修改')
      .first()
      .simulate('click');

    expect(onSavedPhrasesChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ sentence: '请给我水' })
      ])
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '重用')
      .first()
      .simulate('click');
    expect(onApplyOutput).toHaveBeenCalledWith(phrase.output);
  });

  test('favorites and replays a history item', () => {
    const onHistoryChange = jest.fn();
    const onSpeak = jest.fn();
    const wrapper = mount(
      <CommunicationManagementDialog
        open
        onClose={jest.fn()}
        savedPhrases={[]}
        historyItems={[history]}
        onSavedPhrasesChange={jest.fn()}
        onHistoryChange={onHistoryChange}
        onApplyOutput={jest.fn()}
        onSpeak={onSpeak}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text().startsWith('沟通历史'))
      .first()
      .simulate('click');
    wrapper.update();
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '收藏')
      .first()
      .simulate('click');
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '朗读')
      .first()
      .simulate('click');

    expect(onHistoryChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'history-1', isFavorite: true })
      ])
    );
    expect(onSpeak).toHaveBeenCalledWith('我要喝水');
  });

  test('exports readable text and a private Open Board Logging file separately', () => {
    const downloads = [];
    const createObjectURL = jest.fn(() => 'blob:history');
    const revokeObjectURL = jest.fn();
    const createDescriptor = Object.getOwnPropertyDescriptor(
      window.URL,
      'createObjectURL'
    );
    const revokeDescriptor = Object.getOwnPropertyDescriptor(
      window.URL,
      'revokeObjectURL'
    );
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL
    });
    const click = jest
      .spyOn(window.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function captureDownload() {
        downloads.push(this.download);
      });

    try {
      const wrapper = mount(
        <CommunicationManagementDialog
          open
          onClose={jest.fn()}
          savedPhrases={[]}
          historyItems={[history]}
          onSavedPhrasesChange={jest.fn()}
          onHistoryChange={jest.fn()}
          onApplyOutput={jest.fn()}
          onSpeak={jest.fn()}
        />
      );

      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text().startsWith('沟通历史'))
        .first()
        .simulate('click');
      wrapper.update();
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '导出文本')
        .first()
        .simulate('click');
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '导出标准日志')
        .first()
        .simulate('click');
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '导出匿名研究日志')
        .first()
        .simulate('click');

      expect(downloads).toEqual([
        'picinterpreter-history.txt',
        'picinterpreter-history.obl',
        'picinterpreter-history-anonymized.obla'
      ]);
      expect(createObjectURL).toHaveBeenCalledTimes(3);
      expect(revokeObjectURL).toHaveBeenCalledTimes(3);
      expect(wrapper.text()).toContain('不能恢复原始对话');
    } finally {
      click.mockRestore();
      if (createDescriptor) {
        Object.defineProperty(window.URL, 'createObjectURL', createDescriptor);
      } else {
        delete window.URL.createObjectURL;
      }
      if (revokeDescriptor) {
        Object.defineProperty(window.URL, 'revokeObjectURL', revokeDescriptor);
      } else {
        delete window.URL.revokeObjectURL;
      }
    }
  });

  test('imports Open Board Logging utterances as local-only history', async () => {
    const onHistoryChange = jest.fn();
    const wrapper = mount(
      <CommunicationManagementDialog
        open
        onClose={jest.fn()}
        savedPhrases={[]}
        historyItems={[history]}
        onSavedPhrasesChange={jest.fn()}
        onHistoryChange={onHistoryChange}
        onApplyOutput={jest.fn()}
        onSpeak={jest.fn()}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text().startsWith('沟通历史'))
      .first()
      .simulate('click');
    wrapper.update();

    const target = {
      files: [
        {
          text: jest.fn(() =>
            Promise.resolve(
              JSON.stringify({
                format: 'open-board-log-0.1',
                user_id: 'external-user',
                sessions: [
                  {
                    id: 'external-session',
                    type: 'log',
                    events: [
                      {
                        id: 'external-event',
                        timestamp: '2026-07-20T10:00:00.000Z',
                        type: 'utterance',
                        text: '外部沟通记录',
                        modeling: true
                      }
                    ]
                  }
                ]
              })
            )
          )
        }
      ],
      value: 'selected'
    };

    await act(async () => {
      await wrapper
        .find('input[accept=".obl,application/json"]')
        .prop('onChange')({ target });
    });
    wrapper.update();

    expect(onHistoryChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          direction: 'receive',
          inputText: '外部沟通记录',
          localOnly: true,
          importSource: 'open-board-log'
        }),
        expect.objectContaining({ id: 'history-1' })
      ])
    );
    expect(target.value).toBe('');
    expect(wrapper.text()).toContain('已导入 1 条');
    expect(wrapper.text()).toContain('只保存在本机');
    wrapper.setProps({
      historyItems: onHistoryChange.mock.calls[0][0]
    });
    wrapper.update();
    expect(wrapper.text()).toContain('标准日志导入 · 仅本机');
  });

  test('shows the latest patient feedback on a received history item', () => {
    const wrapper = mount(
      <CommunicationManagementDialog
        open
        onClose={jest.fn()}
        savedPhrases={[]}
        historyItems={[
          {
            ...history,
            direction: 'receive',
            sentence: '',
            inputText: '请喝水',
            patientFeedback: 'not_understood'
          }
        ]}
        onSavedPhrasesChange={jest.fn()}
        onHistoryChange={jest.fn()}
        onApplyOutput={jest.fn()}
        onSpeak={jest.fn()}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text().startsWith('沟通历史'))
      .first()
      .simulate('click');
    wrapper.update();

    expect(wrapper.text()).toContain('患者反馈：没明白');
  });

  test('lets a caregiver correct a confirmed receiver sequence without replacing history', () => {
    const onHistoryChange = jest.fn();
    const onReceiverCorrection = jest.fn(() => true);
    const receiverHistory = {
      id: 'receiver-1',
      sessionId: 'session-1',
      patientId: 'patient-1',
      workspaceId: 'workspace-1',
      direction: 'receive',
      inputText: '喝水',
      labels: ['水'],
      recordStatus: 'confirmed',
      createdAt: 1,
      updatedAt: 1,
      pictogramSequence: [
        {
          pictogramId: 'water',
          label: '水',
          source: 'local_dict',
          boardId: 'home',
          matchType: 'exact',
          confidence: 1,
          originalToken: '水'
        }
      ]
    };
    const wrapper = mount(
      <CommunicationManagementDialog
        open
        onClose={jest.fn()}
        boards={[
          {
            id: 'home',
            name: '首页',
            tiles: [
              { id: 'water', label: '水', image: '/water.png' },
              { id: 'drink', label: '喝', image: '/drink.png' }
            ]
          }
        ]}
        savedPhrases={[]}
        historyItems={[receiverHistory]}
        receiverCorrections={[]}
        onSavedPhrasesChange={jest.fn()}
        onHistoryChange={onHistoryChange}
        onReceiverCorrection={onReceiverCorrection}
        onApplyOutput={jest.fn()}
        onSpeak={jest.fn()}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text().startsWith('沟通历史'))
      .first()
      .simulate('click');
    wrapper.update();
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '修正图片')
      .first()
      .simulate('click');
    wrapper.update();
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '换图')
      .first()
      .simulate('click');
    wrapper.update();
    wrapper
      .findWhere(node => node.prop('aria-label') === '选择图片：喝')
      .first()
      .simulate('click');

    expect(onReceiverCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        expressionId: 'receiver-1',
        context: 'caregiver_history_review',
        pictogramIdBefore: 'water',
        pictogramIdAfter: 'drink',
        revisionAfter: expect.objectContaining({ labels: ['喝'] })
      })
    );
    expect(onHistoryChange).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('原记录和修正证据均已保留');
  });

  test('lets a caregiver rate a historical expression candidate', () => {
    const onHistoryChange = jest.fn();
    const wrapper = mount(
      <CommunicationManagementDialog
        open
        onClose={jest.fn()}
        savedPhrases={[]}
        historyItems={[history]}
        candidateFeedbackSyncAvailable
        onSavedPhrasesChange={jest.fn()}
        onHistoryChange={onHistoryChange}
        onApplyOutput={jest.fn()}
        onSpeak={jest.fn()}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text().startsWith('沟通历史'))
      .first()
      .simulate('click');
    wrapper.update();
    wrapper
      .findWhere(node => node.prop('aria-label') === '有帮助：我要喝水')
      .first()
      .simulate('click');

    expect(onHistoryChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'history-1',
          candidates: expect.arrayContaining([
            { sentence: '我要喝水', feedback: 'up' }
          ])
        })
      ])
    );
    expect(wrapper.text()).toContain('纳入下次云同步');
  });

  test('shows and forgets an active workspace correction memory rule', () => {
    const onForgetCorrectionMemory = jest.fn(() => true);
    const wrapper = mount(
      <CommunicationManagementDialog
        open
        onClose={jest.fn()}
        boards={[
          {
            id: 'home',
            name: '首页',
            tiles: [
              {
                id: 'water-preferred',
                labelKey: 'cboard.symbol.yes',
                image: '/water.png'
              },
              {
                id: 'water-blocked',
                label: '水杯',
                image: '/cup.png'
              }
            ]
          }
        ]}
        intl={{
          messages: {
            'cboard.symbol.yes': '是'
          },
          formatMessage: ({ id }) =>
            ({
              'cboard.symbol.yes': '是'
            }[id])
        }}
        savedPhrases={[]}
        historyItems={[]}
        correctionMemory={{
          rules: [
            {
              token: '水',
              preferredPictogramId: 'water-preferred',
              blockedPictogramIds: ['water-blocked'],
              frequencyCount: 3,
              lastCorrectedAt: 10
            }
          ]
        }}
        onSavedPhrasesChange={jest.fn()}
        onHistoryChange={jest.fn()}
        onForgetCorrectionMemory={onForgetCorrectionMemory}
        onApplyOutput={jest.fn()}
        onSpeak={jest.fn()}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '修正记忆（1）')
      .first()
      .simulate('click');
    wrapper.update();

    expect(wrapper.text()).toContain('偏好图：是');
    expect(wrapper.text()).toContain('已阻止：水杯');
    expect(wrapper.text()).toContain('换图确认 3 次');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '不再记住')
      .first()
      .simulate('click');

    expect(onForgetCorrectionMemory).toHaveBeenCalledWith('水');
    expect(wrapper.text()).toContain('纠错审计仍会保留');
  });

  test('runs the receiver matcher as a read-only caregiver diagnostic', () => {
    const onHistoryChange = jest.fn();
    const onSavedPhrasesChange = jest.fn();
    const wrapper = mount(
      <CommunicationManagementDialog
        open
        onClose={jest.fn()}
        boards={[
          {
            id: 'home',
            name: '首页',
            tiles: [
              { id: 'drink', label: '喝', image: '/drink.png' },
              { id: 'water', label: '水', image: '/water.png' }
            ]
          }
        ]}
        savedPhrases={[]}
        historyItems={[]}
        onSavedPhrasesChange={onSavedPhrasesChange}
        onHistoryChange={onHistoryChange}
        onApplyOutput={jest.fn()}
        onSpeak={jest.fn()}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '匹配诊断')
      .first()
      .simulate('click');
    wrapper.update();
    act(() => {
      wrapper
        .find('ForwardRef(TextField)')
        .filterWhere(
          node => node.prop('id') === 'communication-matching-diagnostic-input'
        )
        .prop('onChange')({ target: { value: '喝水水杯' } });
    });
    wrapper.update();
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '开始诊断')
      .first()
      .simulate('click');
    wrapper.update();

    expect(wrapper.text()).toContain('只读诊断完成');
    expect(wrapper.text()).toContain('分词引擎');
    expect(wrapper.find('[data-match-token="喝"]')).toHaveLength(1);
    expect(wrapper.find('[data-match-token="水"]')).toHaveLength(1);
    expect(onHistoryChange).not.toHaveBeenCalled();
    expect(onSavedPhrasesChange).not.toHaveBeenCalled();
  });

  test('exports and confirms both local device clear scopes', async () => {
    const onExportDeviceData = jest.fn(() =>
      Promise.resolve({ ok: true, message: '备份完成。' })
    );
    const onClearPrivatePictograms = jest.fn(() => ({
      ok: true,
      message: '私人图片已清除。'
    }));
    const onClearAllLocalData = jest.fn(() =>
      Promise.resolve({ ok: true, message: '全部数据已清除。' })
    );
    const wrapper = mount(
      <CommunicationManagementDialog
        open
        onClose={jest.fn()}
        onSavedPhrasesChange={jest.fn()}
        onHistoryChange={jest.fn()}
        onExportDeviceData={onExportDeviceData}
        onClearPrivatePictograms={onClearPrivatePictograms}
        onClearAllLocalData={onClearAllLocalData}
        onApplyOutput={jest.fn()}
        onSpeak={jest.fn()}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '本机数据')
      .first()
      .simulate('click');
    wrapper.update();

    await act(async () => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '导出 ZIP')
        .first()
        .simulate('click');
    });
    wrapper.update();
    expect(onExportDeviceData).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('备份完成');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '清除私人图片')
      .first()
      .simulate('click');
    wrapper.update();
    expect(wrapper.text()).toContain('确认清除私人图片');
    await act(async () => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '确认清除私人图片')
        .first()
        .simulate('click');
    });
    wrapper.update();
    expect(onClearPrivatePictograms).toHaveBeenCalledTimes(1);

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '清除全部本机数据')
      .first()
      .simulate('click');
    wrapper.update();
    expect(wrapper.text()).toContain('确认清除全部本机数据');
    await act(async () => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '确认清除全部本机数据')
        .first()
        .simulate('click');
    });
    expect(onClearAllLocalData).toHaveBeenCalledTimes(1);
  });
});
