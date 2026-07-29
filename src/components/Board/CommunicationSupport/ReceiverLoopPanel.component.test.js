import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import ReceiverLoopPanel from './ReceiverLoopPanel.component';
import * as symbolMatching from '../../../common/communicationSupport/symbolMatching';

const mockedMatches = [
  {
    token: '想',
    matchType: 'exact',
    tile: {
      id: 'want',
      boardId: 'home',
      boardName: '首页',
      displayLabel: '想',
      tile: {
        id: 'want',
        label: '我想',
        image: '/want.png'
      }
    }
  },
  {
    token: '喝',
    matchType: 'exact',
    tile: {
      id: 'drink-verb',
      boardId: 'home',
      boardName: '首页',
      tile: {
        id: 'drink-verb',
        label: '喝',
        image: '/drink-verb.png'
      }
    }
  },
  {
    token: '水',
    matchType: 'exact',
    tile: {
      id: 'water',
      boardId: 'home',
      boardName: '首页',
      tile: {
        id: 'water',
        label: '水',
        image: '/water.png'
      }
    }
  }
];

jest.mock('../../../common/communicationSupport/symbolMatching', () => ({
  buildCommunicationTileCatalog: jest.fn(),
  createCommunicationOutputFromMatches: jest.fn(),
  matchTextToCommunicationTiles: jest.fn()
}));

jest.mock('../Symbol', () => {
  return function MockSymbol(props) {
    return (
      <div className={`MockSymbol ${props.className || ''}`}>{props.label}</div>
    );
  };
});

jest.mock('./ReceiverDisplay.component', () => {
  return function MockReceiverDisplay({ open, onFeedback, onReplay }) {
    return open ? (
      <div className="MockReceiverDisplay">
        全屏已打开
        <button
          className="MockReceiverFeedbackUnderstood"
          onClick={() => onFeedback('understood')}
        >
          明白了
        </button>
        <button
          className="MockReceiverFeedbackNotUnderstood"
          onClick={() => onFeedback('not_understood')}
        >
          没明白
        </button>
        <button
          className="MockReceiverFeedbackRepeat"
          onClick={() => {
            onFeedback('repeat_requested');
            onReplay();
          }}
        >
          再说一次
        </button>
      </div>
    ) : null;
  };
});

async function setInput(wrapper, value) {
  const textField = wrapper.find('ForwardRef(TextField)').at(0);
  await act(async () => {
    textField.prop('onChange')({
      target: { value }
    });
  });
  wrapper.update();
}

describe('ReceiverLoopPanel', () => {
  const onApplyOutput = jest.fn();
  const onAppendHistory = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    onApplyOutput.mockClear();
    onAppendHistory.mockClear();
    symbolMatching.buildCommunicationTileCatalog.mockReturnValue([
      {
        id: 'drink',
        boardName: '饮品',
        labels: ['饮料'],
        synonyms: ['喝的'],
        tile: {
          id: 'drink',
          label: '饮料',
          image: '/drink.png'
        }
      }
    ]);
    symbolMatching.matchTextToCommunicationTiles.mockClear();
    symbolMatching.matchTextToCommunicationTiles.mockReturnValue({
      matches: mockedMatches,
      matchRate: 1
    });
    symbolMatching.createCommunicationOutputFromMatches.mockImplementation(
      matches =>
        matches
          .filter(item => item.tile && item.tile.tile)
          .map(item => ({
            id: item.tile.tile.id,
            label: item.tile.displayLabel || item.tile.tile.label,
            image: item.tile.tile.image
          }))
    );
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('supports a text-token-image receiver loop without wrapper dependencies', async () => {
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        onAppendHistory={onAppendHistory}
        historyItems={[]}
      />
    );

    await setInput(wrapper, '我想喝水');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '生成图片序列')
      .first()
      .simulate('click');

    await act(async () => {
      jest.runAllTimers();
    });
    wrapper.update();

    expect(wrapper.text()).toContain('匹配结果：3/3');
    expect(wrapper.text()).toContain('已全部匹配，发送前请确认');
    expect(wrapper.text()).toContain('精确匹配');
    expect(wrapper.text()).toContain('预览图片：想 / 喝 / 水');
    expect(
      wrapper.find('div.MockSymbol.CommunicationSupportPanel__symbol--preview')
    ).toHaveLength(3);
    expect(
      wrapper
        .find('div.MockSymbol.CommunicationSupportPanel__symbol--preview')
        .at(0)
        .text()
    ).toBe('想');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '右移')
      .at(0)
      .simulate('click');
    wrapper.update();

    expect(wrapper.text()).toContain('预览图片：喝 / 想 / 水');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '换图')
      .at(2)
      .simulate('click');
    wrapper.update();

    expect(
      wrapper.find('div.MockSymbol.CommunicationSupportPanel__symbol--swap')
        .length
    ).toBeGreaterThan(0);

    wrapper
      .find('button')
      .filterWhere(node => node.text().includes('饮料'))
      .first()
      .simulate('click');
    wrapper.update();

    expect(wrapper.text()).toContain('预览图片：喝 / 想 / 饮料');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '发送到输出栏')
      .first()
      .simulate('click');

    expect(onApplyOutput).toHaveBeenCalledWith([
      {
        id: 'drink-verb',
        label: '喝',
        image: '/drink-verb.png'
      },
      {
        id: 'want',
        label: '想',
        image: '/want.png'
      },
      {
        id: 'drink',
        label: '饮料',
        image: '/drink.png'
      }
    ]);
    expect(onAppendHistory).not.toHaveBeenCalled();

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '全屏展示')
      .first()
      .simulate('click');
    expect(onAppendHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        contractVersion: 2,
        direction: 'receive',
        inputText: '我想喝水',
        labels: ['喝', '想', '饮料'],
        output: expect.any(Array),
        pictogramSequence: expect.arrayContaining([
          expect.objectContaining({
            pictogramId: 'drink',
            matchType: 'manual',
            originalToken: '水'
          })
        ])
      })
    );
  });

  test('keeps browser speech text and segmentation editable before confirmation', async () => {
    let deliverFinalSpeech;
    const speech = {
      isAvailable: true,
      isListening: false,
      interimText: '',
      error: '',
      startListening: jest.fn(onResult => {
        deliverFinalSpeech = onResult;
      }),
      stopListening: jest.fn()
    };
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        historyItems={[]}
        speech={speech}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '语音输入')
      .first()
      .simulate('click');

    expect(speech.startListening).toHaveBeenCalledTimes(1);

    await act(async () => {
      deliverFinalSpeech('我想喝水');
      jest.runAllTimers();
    });
    wrapper.update();

    expect(
      wrapper
        .find('ForwardRef(TextField)')
        .at(0)
        .prop('value')
    ).toBe('我想喝水');
    expect(
      symbolMatching.matchTextToCommunicationTiles
    ).toHaveBeenLastCalledWith(
      '我想喝水',
      [],
      expect.objectContaining({
        missingTokenRecords: [],
        correctionMemory: null
      })
    );
    expect(wrapper.text()).toContain('匹配结果：3/3');

    await setInput(wrapper, '我想喝苹果');
    expect(
      wrapper
        .find('ForwardRef(TextField)')
        .at(0)
        .prop('value')
    ).toBe('我想喝苹果');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '生成图片序列')
      .first()
      .simulate('click');
    await act(async () => {
      jest.runAllTimers();
    });
    wrapper.update();

    await act(async () => {
      wrapper
        .find('ForwardRef(TextField)')
        .at(1)
        .prop('onChange')({
        target: { value: '我想 / 喝 / 苹果' }
      });
    });
    wrapper.update();
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '按此分词重新匹配')
      .first()
      .simulate('click');
    wrapper.update();

    expect(
      symbolMatching.matchTextToCommunicationTiles
    ).toHaveBeenLastCalledWith(
      '我想喝苹果',
      [],
      expect.objectContaining({
        preSegmented: ['我想', '喝', '苹果']
      })
    );
    expect(wrapper.text()).toContain('已按人工分词重新匹配，可以继续确认。');
    wrapper.unmount();
  });

  test('renders a seven-bar meter driven by the real browser audio level', () => {
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        historyItems={[]}
        speech={{
          isAvailable: true,
          isListening: true,
          interimText: '',
          error: '',
          audioLevel: 0.6,
          audioLevelAvailable: true,
          startListening: jest.fn(),
          stopListening: jest.fn()
        }}
      />
    );

    const meter = wrapper.find(
      '.CommunicationSupportPanel__audioBars[role="meter"]'
    );
    expect(wrapper.text()).toContain('实时麦克风音量');
    expect(wrapper.text()).toContain('音量只在本机计算，不保存');
    expect(meter).toHaveLength(1);
    expect(meter.prop('aria-valuenow')).toBe(60);
    expect(meter.find('.CommunicationSupportPanel__audioBar')).toHaveLength(7);
    expect(
      meter
        .find('.CommunicationSupportPanel__audioBar')
        .at(2)
        .prop('style').transform
    ).toBe('scaleY(0.648)');
    wrapper.unmount();
  });

  test('shows an honest listening fallback instead of a fake waveform', () => {
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        historyItems={[]}
        speech={{
          isAvailable: true,
          isListening: true,
          interimText: '',
          error: '',
          audioLevel: 0,
          audioLevelAvailable: false,
          startListening: jest.fn(),
          stopListening: jest.fn()
        }}
      />
    );

    expect(wrapper.text()).toContain(
      '正在监听；当前仅显示识别状态，识别结果仍可人工修改。'
    );
    expect(wrapper.find('.CommunicationSupportPanel__audioBars')).toHaveLength(
      0
    );
    wrapper.unmount();
  });

  test('lets the caregiver explicitly use an installed on-device speech pack', () => {
    const speech = {
      isAvailable: true,
      isListening: false,
      interimText: '',
      error: '',
      onDeviceSupported: true,
      onDeviceStatus: 'available',
      onDeviceLanguage: 'zh-CN',
      checkOnDeviceAvailability: jest.fn(),
      installOnDeviceLanguage: jest.fn(),
      startListening: jest.fn(),
      stopListening: jest.fn()
    };
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        historyItems={[]}
        speech={speech}
      />
    );

    act(() => {
      wrapper
        .find('ForwardRef(Checkbox)')
        .filterWhere(
          node =>
            node.prop('inputProps') &&
            node.prop('inputProps')['aria-label'] === '优先在本机识别'
        )
        .first()
        .prop('onChange')({ target: { checked: true } });
    });
    wrapper.update();

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '语音输入')
      .first()
      .simulate('click');

    expect(speech.startListening).toHaveBeenCalledWith(expect.any(Function), {
      language: 'zh-CN',
      processLocally: true
    });
  });

  test('keeps Cantonese source text recoverable and waits for manual matching', async () => {
    const onNormalizeDialectText = jest.fn().mockResolvedValue({
      sourceText: '我想饮水',
      normalizedText: '我想喝水',
      dialect: 'cantonese',
      provider: 'cboard-api-ai',
      sourceStored: false
    });
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        historyItems={[]}
        dialectNormalizationAvailable
        onNormalizeDialectText={onNormalizeDialectText}
      />
    );

    act(() => {
      wrapper
        .find('ForwardRef(Checkbox)')
        .first()
        .prop('onChange')({ target: { checked: true } });
    });
    wrapper.update();
    await setInput(wrapper, '我想饮水');
    const matchCallCount =
      symbolMatching.matchTextToCommunicationTiles.mock.calls.length;

    await act(async () => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '粤语转图卡词')
        .first()
        .simulate('click');
      await Promise.resolve();
    });
    wrapper.update();

    expect(onNormalizeDialectText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '我想饮水',
        dialect: 'cantonese',
        pictogramVocabulary: expect.arrayContaining(['饮料', '喝的'])
      })
    );
    expect(
      wrapper
        .find('ForwardRef(TextField)')
        .at(0)
        .prop('value')
    ).toBe('我想喝水');
    expect(symbolMatching.matchTextToCommunicationTiles).toHaveBeenCalledTimes(
      matchCallCount
    );
    expect(wrapper.text()).toContain('已生成可编辑的普通话图卡词草稿');

    act(() => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '恢复原识别文字')
        .first()
        .simulate('click');
    });
    wrapper.update();
    expect(
      wrapper
        .find('ForwardRef(TextField)')
        .at(0)
        .prop('value')
    ).toBe('我想饮水');
    wrapper.unmount();
  });

  test('uses local Cantonese normalization after a monthly enhancement quota', async () => {
    const onNormalizeDialectText = jest.fn().mockRejectedValue({
      response: {
        status: 429,
        data: {
          error: { code: 'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED' }
        }
      }
    });
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        historyItems={[]}
        dialectNormalizationAvailable
        onNormalizeDialectText={onNormalizeDialectText}
      />
    );

    act(() => {
      wrapper
        .find('ForwardRef(Checkbox)')
        .first()
        .prop('onChange')({ target: { checked: true } });
    });
    wrapper.update();
    await setInput(wrapper, '我想饮水');

    await act(async () => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '粤语转图卡词')
        .first()
        .simulate('click');
      await Promise.resolve();
    });
    wrapper.update();

    expect(
      wrapper
        .find('ForwardRef(TextField)')
        .at(0)
        .prop('value')
    ).toBe('我想喝水');
    expect(wrapper.text()).toContain('本月增强服务额度已用完');
    expect(wrapper.text()).toContain('本地高置信词典');
  });

  test('fills editable Cantonese text from approved audio without matching automatically', async () => {
    const onRecognizeDialectAudio = jest.fn().mockResolvedValue({
      text: '我想饮水',
      dialect: 'cantonese',
      engine: '16k_yue',
      provider: 'tencentcloud-asr',
      audioDurationMs: 1200,
      audioStored: false,
      providerProcessing: true
    });
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        historyItems={[]}
        dialectAudioRecognitionAvailable
        onRecognizeDialectAudio={onRecognizeDialectAudio}
      />
    );

    act(() => {
      wrapper
        .find('ForwardRef(Checkbox)')
        .first()
        .prop('onChange')({ target: { checked: true } });
    });
    wrapper.update();
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '粤语录音识别')
      .first()
      .simulate('click');
    wrapper.update();

    const audio = new File(['ID3audio'], 'caregiver.mp3', {
      type: 'audio/mpeg'
    });
    await act(async () => {
      wrapper
        .find('input[type="file"]')
        .first()
        .simulate('change', {
          target: { files: [audio] }
        });
    });
    wrapper.update();
    act(() => {
      wrapper
        .find('ForwardRef(FormControlLabel)')
        .filterWhere(
          node =>
            node.prop('label') ===
            '我同意本次录音发送到服务端和外部语音提供方进行识别'
        )
        .first()
        .find('ForwardRef(Checkbox)')
        .prop('onChange')({ target: { checked: true } });
    });
    wrapper.update();
    const matchCallCount =
      symbolMatching.matchTextToCommunicationTiles.mock.calls.length;

    await act(async () => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '发送并识别')
        .first()
        .simulate('click');
      await Promise.resolve();
    });
    wrapper.update();

    const uploadedAudio = onRecognizeDialectAudio.mock.calls[0][0];
    expect({
      name: uploadedAudio.name,
      type: uploadedAudio.type,
      size: uploadedAudio.size
    }).toEqual({
      name: 'caregiver.mp3',
      type: 'audio/mpeg',
      size: audio.size
    });
    expect(
      wrapper
        .find('ForwardRef(TextField)')
        .at(0)
        .prop('value')
    ).toBe('我想饮水');
    expect(symbolMatching.matchTextToCommunicationTiles).toHaveBeenCalledTimes(
      matchCallCount
    );
    expect(wrapper.text()).toContain('粤语识别原文已填入');
    wrapper.unmount();
  });

  test('keeps manual Cantonese input available when audio quota is exhausted', async () => {
    const onRecognizeDialectAudio = jest.fn().mockRejectedValue({
      response: {
        status: 429,
        data: {
          error: { code: 'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED' }
        }
      }
    });
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        historyItems={[]}
        dialectAudioRecognitionAvailable
        onRecognizeDialectAudio={onRecognizeDialectAudio}
      />
    );

    act(() => {
      wrapper
        .find('ForwardRef(Checkbox)')
        .first()
        .prop('onChange')({ target: { checked: true } });
    });
    wrapper.update();
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '粤语录音识别')
      .first()
      .simulate('click');
    wrapper.update();

    const audio = new File(['ID3audio'], 'caregiver.mp3', {
      type: 'audio/mpeg'
    });
    await act(async () => {
      wrapper
        .find('input[type="file"]')
        .first()
        .simulate('change', {
          target: { files: [audio] }
        });
    });
    wrapper.update();
    act(() => {
      wrapper
        .find('ForwardRef(FormControlLabel)')
        .filterWhere(
          node =>
            node.prop('label') ===
            '我同意本次录音发送到服务端和外部语音提供方进行识别'
        )
        .first()
        .find('ForwardRef(Checkbox)')
        .prop('onChange')({ target: { checked: true } });
    });
    wrapper.update();

    await act(async () => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '发送并识别')
        .first()
        .simulate('click');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    wrapper.update();

    expect(onRecognizeDialectAudio).toHaveBeenCalledWith(audio);
    expect(document.body.textContent).toContain('本月增强服务额度已用完');
    expect(document.body.textContent).toContain('当前仍可手工输入');
    expect(
      wrapper
        .find('ForwardRef(TextField)')
        .at(0)
        .prop('value')
    ).toBe('');
    wrapper.unmount();
  });

  test('records patient feedback and keeps repeat requests in full screen', async () => {
    const onCreateDraft = jest.fn(entry => ({
      ...entry,
      id: 'receiver-1',
      sessionId: 'session-1',
      patientId: 'patient-1',
      workspaceId: 'workspace-1',
      recordStatus: 'draft',
      createdAt: 10,
      updatedAt: 10
    }));
    const onConfirmDraft = jest.fn((draft, entry) => ({
      ...draft,
      ...entry,
      recordStatus: 'confirmed',
      confirmedAt: 20,
      updatedAt: 20
    }));
    const onRecordPatientFeedback = jest.fn((recordId, feedback) => ({
      id: recordId,
      patientFeedback: feedback
    }));
    const onSpeak = jest.fn();
    const onCancelSpeech = jest.fn();
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        onCreateDraft={onCreateDraft}
        onConfirmDraft={onConfirmDraft}
        onRecordPatientFeedback={onRecordPatientFeedback}
        onSpeak={onSpeak}
        onCancelSpeech={onCancelSpeech}
        historyItems={[]}
      />
    );

    await setInput(wrapper, '我想喝水');
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '生成图片序列')
      .first()
      .simulate('click');
    await act(async () => {
      jest.runAllTimers();
    });
    wrapper.update();
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '全屏展示')
      .first()
      .simulate('click');
    wrapper.update();

    expect(onConfirmDraft).toHaveBeenCalled();
    expect(onSpeak).toHaveBeenCalledWith('我想喝水', expect.any(Function));

    onSpeak.mockClear();
    wrapper.find('button.MockReceiverFeedbackRepeat').simulate('click');
    wrapper.update();

    expect(onRecordPatientFeedback).toHaveBeenCalledWith(
      'receiver-1',
      'repeat_requested'
    );
    expect(onSpeak).toHaveBeenCalledWith('我想喝水', expect.any(Function));
    expect(wrapper.find('.MockReceiverDisplay')).toHaveLength(1);

    onRecordPatientFeedback.mockReturnValueOnce(null);
    wrapper.find('button.MockReceiverFeedbackNotUnderstood').simulate('click');
    wrapper.update();

    expect(onRecordPatientFeedback).toHaveBeenCalledWith(
      'receiver-1',
      'not_understood'
    );
    expect(wrapper.find('.MockReceiverDisplay')).toHaveLength(0);
    expect(wrapper.text()).toContain('患者反馈未能保存，仍可继续沟通。');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '全屏展示')
      .first()
      .simulate('click');
    wrapper.update();

    expect(onConfirmDraft).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.MockReceiverDisplay')).toHaveLength(1);
  });

  test('restores and explicitly discards a persisted receiver draft', () => {
    const onDiscardResumableRecord = jest.fn(() => true);
    const initialRecord = {
      id: 'receiver-restored',
      sessionId: 'session-1',
      patientId: 'patient-1',
      workspaceId: 'workspace-1',
      direction: 'receive',
      inputText: '想喝水',
      labels: ['饮料'],
      output: [
        {
          id: 'drink',
          label: '饮料',
          image: '/drink.png',
          vocalization: '饮料'
        }
      ],
      pictogramSequence: [
        {
          pictogramId: 'drink',
          label: '饮料',
          source: 'corrected',
          matchType: 'manual',
          originalToken: '水'
        }
      ],
      recordStatus: 'draft',
      createdAt: 10,
      updatedAt: 10
    };
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        initialRecord={initialRecord}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        onDiscardResumableRecord={onDiscardResumableRecord}
        historyItems={[]}
      />
    );

    expect(
      wrapper
        .find('ForwardRef(TextField)')
        .at(0)
        .prop('value')
    ).toBe('想喝水');
    expect(wrapper.text()).toContain('已恢复上次未完成的图片复核。');
    expect(wrapper.text()).toContain('匹配结果：1/1');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '重新输入')
      .first()
      .simulate('click');
    wrapper.update();

    expect(onDiscardResumableRecord).toHaveBeenCalledWith('receiver-restored');
    expect(
      wrapper
        .find('ForwardRef(TextField)')
        .at(0)
        .prop('value')
    ).toBe('');
    wrapper.unmount();
  });

  test('inserts a selected pictogram and records replayable correction evidence', async () => {
    const onCreateDraft = jest.fn(entry => ({
      ...entry,
      id: 'receiver-1',
      sessionId: 'session-1',
      patientId: 'patient-1',
      workspaceId: 'workspace-1',
      recordStatus: 'draft',
      createdAt: 10,
      updatedAt: 10
    }));
    const onUpdateDraft = jest.fn((draft, entry) => ({
      ...draft,
      ...entry,
      recordStatus: 'draft'
    }));
    const onRecordCorrection = jest.fn();
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        onCreateDraft={onCreateDraft}
        onUpdateDraft={onUpdateDraft}
        onRecordCorrection={onRecordCorrection}
        historyItems={[]}
      />
    );

    await setInput(wrapper, '我想喝水');
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '生成图片序列')
      .first()
      .simulate('click');
    await act(async () => {
      jest.runAllTimers();
    });
    wrapper.update();

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '后加图片')
      .first()
      .simulate('click');
    wrapper.update();
    wrapper
      .find('button')
      .filterWhere(node => node.text().includes('饮料'))
      .first()
      .simulate('click');
    wrapper.update();

    expect(wrapper.text()).toContain('预览图片：想 / 饮料 / 喝 / 水');
    expect(onRecordCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        expressionId: 'receiver-1',
        action: 'insert_pictogram',
        originalToken: '',
        normalizedToken: '饮料',
        sequenceIndexBefore: null,
        sequenceIndexAfter: 1,
        pictogramIdBefore: null,
        pictogramIdAfter: 'drink',
        pictogramIdsBefore: ['want', 'drink-verb', 'water'],
        pictogramIdsAfter: ['want', 'drink', 'drink-verb', 'water'],
        isUsedForLearning: true
      })
    );
    expect(onUpdateDraft.mock.calls[0][1].pictogramSequence[1]).toEqual(
      expect.objectContaining({
        pictogramId: 'drink',
        source: 'manual'
      })
    );
  });

  test('lets the caregiver disable future learning without blocking correction', async () => {
    const onCreateDraft = jest.fn(entry => ({
      ...entry,
      id: 'receiver-1',
      sessionId: 'session-1',
      patientId: 'patient-1',
      workspaceId: 'workspace-1',
      recordStatus: 'draft',
      createdAt: 10,
      updatedAt: 10
    }));
    const onRecordCorrection = jest.fn();
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        onCreateDraft={onCreateDraft}
        onRecordCorrection={onRecordCorrection}
        historyItems={[]}
      />
    );

    await setInput(wrapper, '我想喝水');
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '生成图片序列')
      .first()
      .simulate('click');
    await act(async () => {
      jest.runAllTimers();
    });
    wrapper.update();

    await act(async () => {
      wrapper
        .find('ForwardRef(FormControlLabel)')
        .filterWhere(node => node.prop('label') === '记住本次人工换图和删除')
        .first()
        .prop('control')
        .props.onChange({ target: { checked: false } });
    });
    wrapper.update();
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '换图')
      .first()
      .simulate('click');
    wrapper.update();
    wrapper
      .find('button')
      .filterWhere(node => node.text().includes('饮料'))
      .first()
      .simulate('click');

    expect(onRecordCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'replace_pictogram',
        isUsedForLearning: false
      })
    );
  });

  test('lets the caregiver edit segmentation and rematch immediately', async () => {
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        historyItems={[]}
      />
    );

    await setInput(wrapper, '我想喝水');
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '生成图片序列')
      .first()
      .simulate('click');
    await act(async () => {
      jest.runAllTimers();
    });
    wrapper.update();

    const segmentationField = wrapper.find('ForwardRef(TextField)').at(1);
    await act(async () => {
      segmentationField.prop('onChange')({
        target: { value: '我想 / 喝 / 水' }
      });
    });
    wrapper.update();
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '按此分词重新匹配')
      .first()
      .simulate('click');
    wrapper.update();

    expect(
      symbolMatching.matchTextToCommunicationTiles
    ).toHaveBeenLastCalledWith(
      '我想喝水',
      [],
      expect.objectContaining({
        preSegmented: ['我想', '喝', '水']
      })
    );
    expect(wrapper.text()).toContain('已按人工分词重新匹配，可以继续确认。');
  });

  test('applies optional AI resegmentation only through the review flow', async () => {
    const onAiResegment = jest.fn().mockResolvedValue({
      tokens: ['想', '喝', '水'],
      provider: 'cboard-api-ai'
    });
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        historyItems={[]}
        aiAvailable
        onAiResegment={onAiResegment}
      />
    );

    await setInput(wrapper, '我想喝水');
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '生成图片序列')
      .first()
      .simulate('click');
    await act(async () => {
      jest.runAllTimers();
    });
    wrapper.update();

    await act(async () => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === 'AI 优化分词')
        .first()
        .simulate('click');
      await Promise.resolve();
    });
    wrapper.update();

    expect(onAiResegment).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '我想喝水',
        pictogramVocabulary: expect.any(Array)
      })
    );
    expect(wrapper.text()).toContain('AI 分词已应用，可以继续人工确认。');
  });

  test('keeps editable segmentation when the monthly AI quota is exhausted', async () => {
    const onAiResegment = jest.fn().mockRejectedValue({
      response: {
        status: 429,
        data: {
          error: { code: 'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED' }
        }
      }
    });
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        historyItems={[]}
        aiAvailable
        onAiResegment={onAiResegment}
      />
    );

    await setInput(wrapper, '我想喝水');
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '生成图片序列')
      .first()
      .simulate('click');
    await act(async () => {
      jest.runAllTimers();
    });
    wrapper.update();

    await act(async () => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === 'AI 优化分词')
        .first()
        .simulate('click');
      await Promise.resolve();
    });
    wrapper.update();

    expect(wrapper.text()).toContain('本月 AI 增强额度已用完');
    expect(wrapper.text()).toContain('分词结果（可修改）');
  });

  test('fills editable input from image OCR without matching automatically', async () => {
    const onRecognizeImageText = jest.fn().mockResolvedValue({
      text: ' 我想\n喝水 ',
      provider: 'cboard-api-ai',
      sourceStored: false
    });
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        historyItems={[]}
        imageOcrAvailable
        onRecognizeImageText={onRecognizeImageText}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '图片识字')
      .first()
      .simulate('click');
    wrapper.update();

    const file = new File(['image'], 'request.png', {
      type: 'image/png'
    });
    await act(async () => {
      wrapper
        .find('input[type="file"]')
        .first()
        .simulate('change', {
          target: { files: [file] }
        });
    });
    wrapper.update();

    await act(async () => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '发送并识别')
        .first()
        .simulate('click');
      await Promise.resolve();
    });
    wrapper.update();

    expect(onRecognizeImageText).toHaveBeenCalledWith(file);
    expect(
      wrapper
        .find('ForwardRef(TextField)')
        .first()
        .prop('value')
    ).toBe('我想 喝水');
    expect(wrapper.text()).toContain(
      '识别文字已填入，可继续人工修改后再生成图片序列。'
    );
    expect(symbolMatching.matchTextToCommunicationTiles).not.toHaveBeenCalled();
  });

  test('keeps manual text input available when image OCR is rate limited', async () => {
    const onRecognizeImageText = jest.fn().mockRejectedValue({
      response: { status: 429, data: {} }
    });
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        historyItems={[]}
        imageOcrAvailable
        onRecognizeImageText={onRecognizeImageText}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '图片识字')
      .first()
      .simulate('click');
    wrapper.update();
    const file = new File(['image'], 'request.png', {
      type: 'image/png'
    });
    await act(async () => {
      wrapper
        .find('input[type="file"]')
        .first()
        .simulate('change', {
          target: { files: [file] }
        });
    });
    wrapper.update();

    await act(async () => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '发送并识别')
        .first()
        .simulate('click');
      await Promise.resolve();
    });
    wrapper.update();

    expect(wrapper.text()).toContain('图片识字请求较多，请稍后重试');
    expect(wrapper.text()).toContain('当前仍可手工输入文字');
  });

  test('cancels a delayed match when the caregiver resets the input', async () => {
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        onAppendHistory={onAppendHistory}
        historyItems={[]}
      />
    );

    await setInput(wrapper, '我想喝水');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '生成图片序列')
      .first()
      .simulate('click');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '重新输入')
      .first()
      .simulate('click');

    await act(async () => {
      jest.runAllTimers();
    });
    wrapper.update();

    expect(symbolMatching.matchTextToCommunicationTiles).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('预览图片：');
    wrapper.unmount();
  });

  test('hides unsupported browser speech and keeps text input available', () => {
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        historyItems={[]}
        speech={{
          isAvailable: false,
          isListening: false,
          interimText: '',
          error: '',
          startListening: jest.fn(),
          stopListening: jest.fn()
        }}
      />
    );

    expect(wrapper.text()).toContain(
      '当前环境不支持浏览器语音输入，请使用文字输入。'
    );
    expect(
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '语音输入')
    ).toHaveLength(0);
    expect(wrapper.find('ForwardRef(TextField)')).toHaveLength(1);
    wrapper.unmount();
  });
});
