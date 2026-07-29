import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import CommunicationSupportPanel from './CommunicationSupportPanel.component';
import PatientActionButton from './PatientActionButton.component';
import { PATIENT_ACTION_IDS } from '../../../common/communicationSupport/patientActionLanguage';
import * as symbolMatching from '../../../common/communicationSupport/symbolMatching';
import * as localData from '../../../common/communicationSupport/localData';
import * as communicationSpeech from '../../../common/communicationSupport/communicationSpeech';
import API from '../../../api';

const mockedOutput = [
  {
    id: 'want',
    label: '想',
    image: '/want.png'
  },
  {
    id: 'water',
    label: '水',
    image: '/water.png'
  }
];

const mockedMatches = [
  {
    token: '想',
    matchType: 'exact',
    tile: {
      id: 'want',
      boardId: 'home',
      boardName: '首页',
      tile: {
        id: 'want',
        label: '想',
        image: '/want.png'
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

const mockedEditableMatches = [
  {
    token: '想',
    matchType: 'exact',
    tile: {
      id: 'want',
      boardId: 'home',
      boardName: '首页',
      tile: {
        id: 'want',
        label: '想',
        image: '/want.png'
      }
    }
  },
  {
    token: '喝',
    matchType: 'exact',
    tile: {
      id: 'drink',
      boardId: 'home',
      boardName: '首页',
      tile: {
        id: 'drink',
        label: '喝',
        image: '/drink.png'
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

const mockAppendCommunicationHistory = jest.fn();
const mockStopListening = jest.fn();
const mockStartListening = jest.fn();

jest.mock('../../../api', () => ({
  deleteConfirmedReceiverRecords: jest.fn(),
  generateCommunicationSentences: jest.fn(),
  getSettings: jest.fn(),
  normalizeCommunicationDialectText: jest.fn(),
  recognizeCommunicationDialectAudio: jest.fn(),
  resegmentCommunicationText: jest.fn(),
  searchCommunicationPictograms: jest.fn(),
  syncConfirmedReceiverRecords: jest.fn(),
  updateSettings: jest.fn()
}));

jest.mock('../../../common/communicationSupport/symbolMatching', () => ({
  buildCommunicationTileCatalog: jest.fn(),
  createCommunicationOutputFromMatches: jest.fn(),
  matchTextToCommunicationTiles: jest.fn()
}));

jest.mock('../../../common/communicationSupport/localData', () => ({
  appendCommunicationHistory: jest.fn(),
  appendReceiverCorrection: jest.fn(),
  buildCommunicationCloudSettingsPayload: jest.fn(),
  confirmReceiverDraft: jest.fn(),
  createReceiverDraft: jest.fn(),
  discardResumableReceiverRecord: jest.fn(),
  getActiveConversationSession: jest.fn(),
  loadCommunicationHistory: jest.fn(),
  loadCommunicationPreferences: jest.fn(),
  loadCommunicationSavedPhrases: jest.fn(),
  loadConversationContext: jest.fn(),
  loadExpressionCandidateFeedbackDrafts: jest.fn(),
  loadMissingTokens: jest.fn(),
  loadPersonalImagePreferences: jest.fn(),
  loadPersonalImageRuntime: jest.fn(),
  loadReceiverCorrections: jest.fn(),
  loadReceiverRecords: jest.fn(),
  loadResumableReceiverRecord: jest.fn(),
  mergeCommunicationSettings: jest.fn(),
  overwriteCommunicationSettings: jest.fn(),
  overwriteCommunicationHistory: jest.fn(),
  overwriteCommunicationSavedPhrases: jest.fn(),
  overwriteReceiverCorrections: jest.fn(),
  overwriteReceiverRecords: jest.fn(),
  recordMissingTokens: jest.fn(),
  recordReceiverPatientFeedback: jest.fn(),
  removeExpressionCandidateFeedbackDraft: jest.fn(),
  removePersonalImagePreference: jest.fn(),
  resetConversationSession: jest.fn(),
  setConversationScene: jest.fn(),
  reviewMissingToken: jest.fn(),
  saveCommunicationPhrase: jest.fn(),
  saveExpressionCandidateFeedbackDraft: jest.fn(),
  savePersonalImagePreference: jest.fn(),
  saveCommunicationPreferences: jest.fn(),
  updateReceiverDraft: jest.fn()
}));

jest.mock('../../../common/communicationSupport/communicationSpeech', () => ({
  useCommunicationSpeechRecognition: jest.fn()
}));

jest.mock('../Symbol', () => {
  return function MockSymbol(props) {
    return <div className="MockSymbol">{props.label}</div>;
  };
});

jest.mock('./ReceiverDisplay.component', () => {
  return function MockReceiverDisplay({ open, onFeedback }) {
    return open ? (
      <div className="MockReceiverDisplay">
        全屏已打开
        <button
          className="MockReceiverFeedbackUnderstood"
          onClick={() => onFeedback('understood')}
        >
          明白了
        </button>
      </div>
    ) : null;
  };
});

async function setReceiveInput(wrapper, value) {
  const textFields = wrapper.find('ForwardRef(TextField)');
  await act(async () => {
    textFields.at(0).prop('onChange')({
      target: { value }
    });
  });
  wrapper.update();
}

async function openReceiveReview(wrapper, value) {
  const receiveTabButton = wrapper
    .find('button')
    .filterWhere(node => node.text() === '接收理解')
    .first();

  receiveTabButton.simulate('click');
  await setReceiveInput(wrapper, value);

  const generateButton = wrapper
    .find('ForwardRef(Button)')
    .filterWhere(node => node.text() === '生成图片序列')
    .first();

  generateButton.simulate('click');

  await act(async () => {
    jest.advanceTimersByTime(30);
  });
  wrapper.update();
}

describe('CommunicationSupportPanel receiver flow', () => {
  const onApplyOutput = jest.fn();

  const props = {
    boards: [],
    output: [],
    activeBoardId: 'home',
    onApplyOutput,
    onJumpBoard: jest.fn(),
    onSpeak: jest.fn((text, onend) => onend()),
    onCancelSpeech: jest.fn(),
    intl: null,
    isLogged: false,
    speechSettings: {
      voiceURI: null,
      pitch: 1,
      rate: 1,
      elevenLabsApiKey: '',
      elevenLabsVoiceSettings: {}
    },
    displaySettings: {
      fontSize: 'Standard',
      uiSize: 'Standard'
    },
    pictogramOrdering: {},
    onPictogramUsed: jest.fn(),
    onChangeSpeechRate: jest.fn(),
    onChangeDisplaySettings: jest.fn(),
    copyOverrides: null,
    initiallyExpanded: true
  };

  beforeEach(() => {
    jest.useFakeTimers();
    onApplyOutput.mockClear();
    props.onSpeak.mockClear();
    props.onCancelSpeech.mockClear();
    props.onChangeSpeechRate.mockClear();
    props.onChangeDisplaySettings.mockClear();
    props.onPictogramUsed.mockClear();
    mockAppendCommunicationHistory.mockClear();
    mockStopListening.mockClear();
    mockStartListening.mockClear();
    localData.recordMissingTokens.mockReset();
    localData.recordMissingTokens.mockReturnValue([]);
    localData.loadExpressionCandidateFeedbackDrafts.mockReset();
    localData.loadExpressionCandidateFeedbackDrafts.mockReturnValue([]);
    localData.saveExpressionCandidateFeedbackDraft.mockReset();
    localData.removeExpressionCandidateFeedbackDraft.mockReset();
    localData.recordReceiverPatientFeedback.mockReset();
    localData.recordReceiverPatientFeedback.mockImplementation(
      (recordId, feedback) => ({
        id: recordId,
        patientFeedback: feedback
      })
    );
    localData.appendReceiverCorrection.mockReset();
    localData.appendReceiverCorrection.mockImplementation(entry => entry);
    localData.reviewMissingToken.mockReset();
    localData.overwriteCommunicationHistory.mockReset();
    localData.overwriteCommunicationSavedPhrases.mockReset();
    localData.overwriteReceiverRecords.mockReset();
    localData.overwriteReceiverCorrections.mockReset();
    localData.overwriteReceiverCorrections.mockImplementation(
      entries => entries
    );
    localData.getActiveConversationSession.mockReturnValue({
      id: 'session-current'
    });
    localData.resetConversationSession.mockReset();
    localData.resetConversationSession.mockReturnValue({ id: 'session-next' });
    localData.setConversationScene.mockReset();
    localData.setConversationScene.mockImplementation(scene => ({
      id: 'session-current',
      ...(scene ? { scene } : {})
    }));
    communicationSpeech.useCommunicationSpeechRecognition.mockReturnValue({
      isAvailable: true,
      isListening: false,
      interimText: '',
      error: '',
      stopListening: mockStopListening,
      startListening: mockStartListening
    });
    API.getSettings.mockResolvedValue({});
    API.deleteConfirmedReceiverRecords.mockResolvedValue({
      deletedCount: 0,
      deletedRecordIds: []
    });
    API.generateCommunicationSentences.mockResolvedValue({
      candidates: ['我要喝水。']
    });
    API.normalizeCommunicationDialectText.mockResolvedValue({
      sourceText: '我想饮水',
      normalizedText: '我想喝水',
      dialect: 'cantonese',
      provider: 'cboard-api-ai',
      sourceStored: false
    });
    API.recognizeCommunicationDialectAudio.mockResolvedValue({
      text: '我想饮水',
      dialect: 'cantonese',
      engine: '16k_yue',
      provider: 'tencentcloud-asr',
      audioDurationMs: 1200,
      audioStored: false,
      providerProcessing: true
    });
    API.resegmentCommunicationText.mockResolvedValue({
      tokens: ['我', '要', '喝', '水']
    });
    API.searchCommunicationPictograms.mockResolvedValue([]);
    API.syncConfirmedReceiverRecords.mockResolvedValue({
      acceptedCount: 0,
      records: []
    });
    API.updateSettings.mockResolvedValue({});
    symbolMatching.buildCommunicationTileCatalog.mockReturnValue([
      {
        id: 'want',
        boardName: '首页',
        labels: ['想'],
        synonyms: [],
        tile: {
          id: 'want',
          label: '想',
          image: '/want.png'
        }
      },
      {
        id: 'water',
        boardName: '首页',
        labels: ['水'],
        synonyms: [],
        tile: {
          id: 'water',
          label: '水',
          image: '/water.png'
        }
      },
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
    symbolMatching.createCommunicationOutputFromMatches.mockImplementation(
      matches =>
        matches
          .filter(item => item.tile && item.tile.tile)
          .map(item => ({
            id: item.tile.tile.id,
            label: item.tile.tile.label,
            image: item.tile.tile.image
          }))
    );
    symbolMatching.matchTextToCommunicationTiles.mockReturnValue({
      matches: mockedMatches,
      matchRate: 1
    });
    localData.appendCommunicationHistory.mockImplementation((...args) =>
      mockAppendCommunicationHistory(...args)
    );
    localData.createReceiverDraft.mockImplementation(entry => ({
      ...entry,
      id: 'receiver-draft',
      sessionId: 'receiver-session',
      patientId: 'patient-local',
      workspaceId: 'workspace-local',
      recordStatus: 'draft',
      createdAt: 1,
      updatedAt: 1
    }));
    localData.updateReceiverDraft.mockImplementation((draft, entry) => ({
      ...draft,
      ...entry,
      recordStatus: 'draft'
    }));
    localData.confirmReceiverDraft.mockImplementation((draft, entry) => ({
      ...draft,
      ...entry,
      recordStatus: 'confirmed',
      confirmedAt: 2
    }));
    localData.buildCommunicationCloudSettingsPayload.mockImplementation(
      (savedPhrases, history) => ({ savedPhrases, history })
    );
    localData.loadCommunicationHistory.mockReturnValue([]);
    localData.loadCommunicationPreferences.mockReturnValue({
      highContrast: false,
      fontSize: 'normal',
      gridColumns: 3,
      speechRate: 1,
      hiddenBoardIds: [],
      onboardingComplete: false
    });
    localData.saveCommunicationPreferences.mockImplementation(value => value);
    localData.loadCommunicationSavedPhrases.mockReturnValue([]);
    localData.loadConversationContext.mockReturnValue({
      turns: []
    });
    localData.loadMissingTokens.mockReturnValue([]);
    localData.loadPersonalImagePreferences.mockReturnValue([]);
    localData.loadPersonalImageRuntime.mockReturnValue({
      identity: {
        patientId: 'patient-test',
        workspaceId: 'workspace-test'
      },
      preferences: []
    });
    localData.loadReceiverCorrections.mockReturnValue([]);
    localData.loadReceiverRecords.mockReturnValue([]);
    localData.mergeCommunicationSettings.mockImplementation(
      localValue => localValue
    );
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('supports a closed receiver loop from text input to output apply', async () => {
    const wrapper = mount(<CommunicationSupportPanel {...props} />);
    await openReceiveReview(wrapper, '我想喝水');

    expect(
      wrapper
        .find('ReceiverLoopPanel')
        .first()
        .text()
    ).toContain('预览图片：想 / 水');
    expect(
      wrapper
        .find('ReceiverLoopPanel')
        .first()
        .prop('correctionMemory')
    ).toEqual(
      expect.objectContaining({
        scope: 'workspace-local',
        workspaceId: 'workspace-test',
        rules: []
      })
    );

    const sendButton = wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '发送到输出栏')
      .first();

    sendButton.simulate('click');

    expect(onApplyOutput).toHaveBeenCalledWith(mockedOutput);
    expect(localData.confirmReceiverDraft).not.toHaveBeenCalled();

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '全屏展示')
      .first()
      .simulate('click');

    expect(localData.confirmReceiverDraft).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'receiver-draft', recordStatus: 'draft' }),
      expect.objectContaining({
        direction: 'receive',
        inputText: '我想喝水',
        labels: ['想', '水']
      })
    );
    expect(props.onSpeak).toHaveBeenCalledWith(
      '我想喝水',
      expect.any(Function)
    );

    wrapper.find('button.MockReceiverFeedbackUnderstood').simulate('click');
    wrapper.update();

    expect(localData.recordReceiverPatientFeedback).toHaveBeenCalledWith(
      'receiver-draft',
      'understood'
    );
    expect(wrapper.find('.MockReceiverDisplay')).toHaveLength(0);
  });

  test('shows the first-use guide only after entering communication and persists completion', () => {
    const wrapper = mount(
      <CommunicationSupportPanel {...props} initiallyExpanded={false} />
    );

    expect(wrapper.find('CommunicationOnboardingDialog').prop('open')).toBe(
      false
    );
    act(() => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '患者表达')
        .first()
        .simulate('click');
    });
    wrapper.update();

    const onboarding = wrapper.find('CommunicationOnboardingDialog').first();
    expect(onboarding.prop('open')).toBe(true);
    act(() => {
      onboarding.prop('onComplete')();
    });
    wrapper.update();

    expect(localData.saveCommunicationPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingComplete: true })
    );
    expect(wrapper.find('CommunicationOnboardingDialog').prop('open')).toBe(
      false
    );
  });

  test('lets the receiver reorder and replace matches before sending to output', async () => {
    symbolMatching.matchTextToCommunicationTiles.mockReturnValue({
      matches: mockedEditableMatches,
      matchRate: 1
    });

    const wrapper = mount(<CommunicationSupportPanel {...props} />);
    await openReceiveReview(wrapper, '我想喝水');

    expect(
      wrapper
        .find('ReceiverLoopPanel')
        .first()
        .text()
    ).toContain('预览图片：想 / 喝 / 水');

    const rightButtons = wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '右移');
    rightButtons.at(0).simulate('click');
    wrapper.update();

    expect(
      wrapper
        .find('ReceiverLoopPanel')
        .first()
        .text()
    ).toContain('预览图片：喝 / 想 / 水');

    const replaceButtons = wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '换图');
    replaceButtons.at(2).simulate('click');
    wrapper.update();

    const swapOption = wrapper
      .find('button')
      .filterWhere(node => node.text().includes('饮料'))
      .first();
    swapOption.simulate('click');
    wrapper.update();

    expect(
      wrapper
        .find('ReceiverLoopPanel')
        .first()
        .text()
    ).toContain('预览图片：喝 / 想 / 饮料');

    const sendButton = wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '发送到输出栏')
      .first();
    sendButton.simulate('click');

    expect(onApplyOutput).toHaveBeenCalledWith([
      {
        id: 'drink',
        label: '喝',
        image: '/drink.png'
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

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '全屏展示')
      .first()
      .simulate('click');

    expect(localData.confirmReceiverDraft).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'receiver-draft', recordStatus: 'draft' }),
      expect.objectContaining({
        direction: 'receive',
        inputText: '我想喝水',
        labels: ['喝', '想', '饮料']
      })
    );
  });

  test('records missing tokens without blocking the receiver review', async () => {
    symbolMatching.matchTextToCommunicationTiles.mockReturnValue({
      matches: [{ token: '头晕', matchType: 'none', tile: null }],
      matchRate: 0
    });
    localData.recordMissingTokens.mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    const wrapper = mount(<CommunicationSupportPanel {...props} />);
    await openReceiveReview(wrapper, '我头晕');

    expect(localData.recordMissingTokens).toHaveBeenCalledWith({
      tokens: ['头晕'],
      rawText: '我头晕',
      scene: 'receiver'
    });
    const receiver = wrapper.find('ReceiverLoopPanel').first();
    expect(receiver.text()).toContain('缺词提示：头晕');
    expect(receiver.text()).toContain('请重点复核未匹配或部分匹配项');
  });

  test('exposes the local missing-token queue only in caregiver receive mode', () => {
    const missingRecord = {
      id: 'missing-1',
      normalizedToken: '头晕',
      status: 'new',
      occurrenceCount: 2,
      rawTextSamples: ['我头晕'],
      updatedAt: 20
    };
    localData.loadMissingTokens.mockReturnValue([missingRecord]);
    localData.reviewMissingToken.mockReturnValue({
      ...missingRecord,
      status: 'ignored'
    });

    const wrapper = mount(
      <CommunicationSupportPanel {...props} initialMode="receive" />
    );

    const receiver = wrapper.find('ReceiverLoopPanel').first();
    expect(receiver.text()).toContain('缺图维护');
    expect(receiver.text()).toContain('出现次数：2');
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '忽略')
      .first()
      .simulate('click');

    expect(localData.reviewMissingToken).toHaveBeenCalledWith('missing-1', {
      status: 'ignored'
    });
  });

  test('can open directly in receive mode for integrated board entry', () => {
    const wrapper = mount(
      <CommunicationSupportPanel {...props} initialMode="receive" />
    );

    const receiver = wrapper.find('ReceiverLoopPanel').first();
    expect(receiver.exists()).toBe(true);
    expect(receiver.text()).toContain('文字转图片');
    expect(receiver.text()).toContain('生成图片序列');
    expect(wrapper.find('ExpressionLoopPanel').exists()).toBe(false);
  });

  test('keeps the board compact by default and opens receiver in a focused dialog', () => {
    const wrapper = mount(
      <CommunicationSupportPanel {...props} initiallyExpanded={false} />
    );

    expect(wrapper.find('ExpressionLoopPanel').exists()).toBe(false);
    expect(wrapper.find('ReceiverLoopPanel').exists()).toBe(false);
    expect(wrapper.find('CommunicationReceiverDialog').prop('open')).toBe(
      false
    );
    expect(wrapper.find('#communication-caregiver-tools').prop('hidden')).toBe(
      true
    );
    expect(
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '紧急求助')
        .exists()
    ).toBe(true);
    expect(
      wrapper
        .find(PatientActionButton)
        .map(button => button.prop('action'))
        .filter(action =>
          [
            PATIENT_ACTION_IDS.express,
            PATIENT_ACTION_IDS.receive,
            PATIENT_ACTION_IDS.emergency
          ].includes(action)
        )
    ).toEqual([
      PATIENT_ACTION_IDS.express,
      PATIENT_ACTION_IDS.receive,
      PATIENT_ACTION_IDS.emergency
    ]);

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '照护工具')
      .first()
      .simulate('click');
    wrapper.update();

    expect(wrapper.find('#communication-caregiver-tools').prop('hidden')).toBe(
      false
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '患者表达')
      .first()
      .simulate('click');
    wrapper.update();

    expect(wrapper.find('ExpressionLoopPanel').exists()).toBe(true);

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '接收理解')
      .first()
      .simulate('click');
    wrapper.update();

    expect(wrapper.find('ExpressionLoopPanel').exists()).toBe(false);
    expect(wrapper.find('ReceiverLoopPanel').exists()).toBe(true);
    expect(wrapper.find('CommunicationReceiverDialog').prop('open')).toBe(true);

    act(() => {
      wrapper.find('CommunicationReceiverDialog').prop('onClose')();
    });
    wrapper.update();

    expect(wrapper.find('ReceiverLoopPanel').exists()).toBe(false);
    expect(wrapper.find('CommunicationReceiverDialog').prop('open')).toBe(
      false
    );
  });

  test('wires optional AI through the existing authenticated API client', async () => {
    let wrapper;
    await act(async () => {
      wrapper = mount(<CommunicationSupportPanel {...props} isLogged />);
    });
    const expression = wrapper.find('ExpressionLoopPanel').first();

    await expression.prop('onGenerateAiSentences')({
      pictogramLabels: ['水']
    });
    expect(expression.prop('aiAvailable')).toBe(true);
    expect(API.generateCommunicationSentences).toHaveBeenCalledWith({
      pictogramLabels: ['水']
    });

    wrapper
      .find('button')
      .filterWhere(node => node.text() === '接收理解')
      .first()
      .simulate('click');
    wrapper.update();
    const receiver = wrapper.find('ReceiverLoopPanel').first();
    await receiver.prop('onAiResegment')({ text: '我要喝水' });

    expect(receiver.prop('aiAvailable')).toBe(true);
    expect(API.resegmentCommunicationText).toHaveBeenCalledWith({
      text: '我要喝水'
    });
    await receiver.prop('onNormalizeDialectText')({
      text: '我想饮水',
      dialect: 'cantonese'
    });
    expect(receiver.prop('dialectNormalizationAvailable')).toBe(true);
    expect(API.normalizeCommunicationDialectText).toHaveBeenCalledWith({
      text: '我想饮水',
      dialect: 'cantonese'
    });
    const audio = new File(['ID3audio'], 'caregiver.mp3', {
      type: 'audio/mpeg'
    });
    await receiver.prop('onRecognizeDialectAudio')(audio);
    expect(receiver.prop('dialectAudioRecognitionAvailable')).toBe(true);
    expect(API.recognizeCommunicationDialectAudio).toHaveBeenCalledWith(audio);
  });

  test('stores online pictograms as suggestions until caregiver confirmation', async () => {
    const missingRecord = {
      id: 'missing-online',
      normalizedToken: '头晕',
      status: 'new',
      occurrenceCount: 1,
      rawTextSamples: ['我头晕'],
      updatedAt: 20
    };
    localData.loadMissingTokens.mockReturnValue([missingRecord]);
    localData.reviewMissingToken.mockImplementation((id, review) => ({
      ...missingRecord,
      id,
      ...review
    }));
    API.searchCommunicationPictograms.mockResolvedValue([
      {
        token: '头晕',
        pictogram: {
          id: 'runtime-dizzy',
          label: '头晕',
          image: 'https://api.example.test/pictograms/arasaac/123/image',
          source: {
            provider: 'arasaac',
            originalId: '123',
            name: 'ARASAAC',
            license: 'CC BY-NC-SA 4.0',
            sourceUrl: 'https://arasaac.org/pictograms/123'
          }
        }
      },
      {
        token: '头晕',
        pictogram: {
          id: 'runtime-dizzy-alternative',
          label: '头晕',
          image: 'https://api.example.test/pictograms/arasaac/456/image',
          source: {
            provider: 'arasaac',
            originalId: '456',
            name: 'ARASAAC',
            license: 'CC BY-NC-SA 4.0',
            sourceUrl: 'https://arasaac.org/pictograms/456'
          }
        }
      }
    ]);
    const wrapper = mount(
      <CommunicationSupportPanel {...props} initialMode="receive" />
    );
    const queue = wrapper.find('MissingTokenQueue').first();

    await queue.prop('onSearchOnline')(['missing-online']);

    expect(API.searchCommunicationPictograms).toHaveBeenCalledWith(['头晕']);
    expect(localData.reviewMissingToken).toHaveBeenCalledWith(
      'missing-online',
      expect.objectContaining({
        status: 'suggested',
        suggestedPictogramId: 'runtime-dizzy',
        suggestedPictograms: [
          expect.objectContaining({ id: 'runtime-dizzy' }),
          expect.objectContaining({ id: 'runtime-dizzy-alternative' })
        ],
        source: 'online'
      })
    );
    expect(localData.reviewMissingToken).toHaveBeenCalledTimes(1);
  });

  test('starts a new local conversation without deleting history', () => {
    const wrapper = mount(
      <CommunicationSupportPanel
        {...props}
        initialMode="receive"
        initiallyExpanded
      />
    );
    props.onCancelSpeech.mockClear();

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '新对话')
      .first()
      .simulate('click');
    wrapper.update();

    expect(localData.resetConversationSession).not.toHaveBeenCalled();
    expect(
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '确认开始')
        .exists()
    ).toBe(true);

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '确认开始')
      .first()
      .simulate('click');
    wrapper.update();

    expect(localData.resetConversationSession).toHaveBeenCalledTimes(1);
    expect(onApplyOutput).toHaveBeenCalledWith([]);
    expect(props.onCancelSpeech).toHaveBeenCalled();
    expect(localData.overwriteCommunicationHistory).not.toHaveBeenCalled();
    expect(
      wrapper.find('p.CommunicationSupportPanel__sessionNotice').text()
    ).toContain('已开始新对话，原有历史仍会保留。');
  });

  test('selects and clears one fixed caregiver scene from the receiver controls', () => {
    const wrapper = mount(
      <CommunicationSupportPanel
        {...props}
        initialMode="receive"
        initiallyExpanded
      />
    );
    const findHospital = () =>
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '🏥 医院')
        .first();

    findHospital().simulate('click');
    wrapper.update();

    expect(localData.setConversationScene).toHaveBeenLastCalledWith('hospital');
    expect(
      wrapper.find('span.CommunicationSupportPanel__sceneStatus').text()
    ).toContain('当前场景：医院');
    expect(findHospital().prop('aria-pressed')).toBe(true);

    findHospital().simulate('click');
    wrapper.update();

    expect(localData.setConversationScene).toHaveBeenLastCalledWith(null);
    expect(
      wrapper.find('p.CommunicationSupportPanel__sessionNotice').text()
    ).toContain('已清除当前场景。');
    expect(findHospital().prop('aria-pressed')).toBe(false);
  });

  test('opens emergency communication independently and records the phrase', () => {
    const wrapper = mount(<CommunicationSupportPanel {...props} />);

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '紧急求助')
      .first()
      .simulate('click');
    wrapper.update();
    wrapper
      .find('[data-emergency-phrase="help"]')
      .first()
      .simulate('click');

    expect(props.onSpeak).toHaveBeenCalledWith('帮帮我');
    expect(localData.appendCommunicationHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'express',
        sentence: '帮帮我'
      })
    );
  });

  test('persists quick phrase usage without replacing the output', () => {
    const phrase = {
      id: 'phrase-quick',
      sentence: '请给我水',
      output: [{ id: 'water', label: '水' }],
      createdAt: 1,
      lastUsedAt: 1,
      updatedAt: 1,
      usageCount: 0
    };
    let storedPhrases = [phrase];
    localData.loadCommunicationSavedPhrases.mockImplementation(
      () => storedPhrases
    );
    localData.overwriteCommunicationSavedPhrases.mockImplementation(items => {
      storedPhrases = items;
    });
    const wrapper = mount(<CommunicationSupportPanel {...props} />);

    act(() => {
      wrapper
        .find('ExpressionLoopPanel')
        .first()
        .prop('onUseSavedPhrase')(phrase);
    });
    wrapper.update();

    expect(localData.overwriteCommunicationSavedPhrases).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'phrase-quick',
        usageCount: 1
      })
    ]);
    expect(
      localData.buildCommunicationCloudSettingsPayload
    ).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'phrase-quick',
          usageCount: 1
        })
      ],
      []
    );
    expect(onApplyOutput).not.toHaveBeenCalled();
  });

  test('opens saved phrase management and persists reviewed changes', () => {
    const managedPhrase = {
      id: 'phrase-managed',
      sentence: '我要喝水',
      output: [{ id: 'water', label: '水' }],
      createdAt: 1,
      lastUsedAt: 1,
      updatedAt: 1,
      usageCount: 0
    };
    const renamedPhrase = {
      ...managedPhrase,
      sentence: '请给我水',
      updatedAt: 2
    };
    localData.loadCommunicationSavedPhrases.mockReturnValue([managedPhrase]);
    const wrapper = mount(<CommunicationSupportPanel {...props} />);

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '常用语与历史')
      .first()
      .simulate('click');
    wrapper.update();

    const management = wrapper.find('CommunicationManagementDialog').first();
    expect(management.prop('open')).toBe(true);
    expect(management.prop('savedPhrases')).toEqual([managedPhrase]);

    localData.loadCommunicationSavedPhrases.mockReturnValue([renamedPhrase]);
    act(() => {
      management.prop('onSavedPhrasesChange')([renamedPhrase]);
    });

    expect(localData.overwriteCommunicationSavedPhrases).toHaveBeenCalledWith([
      renamedPhrase
    ]);
    expect(
      localData.buildCommunicationCloudSettingsPayload
    ).toHaveBeenCalledWith([renamedPhrase], []);
  });

  test('forgets one correction memory rule while preserving the audit row', () => {
    const learnedCorrection = {
      id: 'correction-water',
      expressionId: 'receiver-water',
      sessionId: 'session-water',
      patientId: 'patient-test',
      workspaceId: 'workspace-test',
      action: 'replace_pictogram',
      originalToken: '水',
      normalizedToken: '水',
      pictogramIdBefore: 'water',
      pictogramIdAfter: 'drink',
      isUsedForLearning: true,
      createdAt: 10
    };
    localData.loadReceiverCorrections.mockReturnValue([learnedCorrection]);
    const wrapper = mount(<CommunicationSupportPanel {...props} />);

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '常用语与历史')
      .first()
      .simulate('click');
    wrapper.update();

    act(() => {
      wrapper
        .find('CommunicationManagementDialog')
        .first()
        .prop('onForgetCorrectionMemory')('水');
    });

    expect(localData.overwriteReceiverCorrections).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'correction-water',
        isUsedForLearning: false
      })
    ]);
  });

  test('clears confirmed receiver history locally and creates an account tombstone', async () => {
    const confirmed = {
      id: 'receiver-managed',
      sessionId: 'session-managed',
      patientId: 'patient-managed',
      workspaceId: 'workspace-managed',
      direction: 'receive',
      recordStatus: 'confirmed',
      inputText: '请给我水',
      labels: ['水'],
      createdAt: 10,
      updatedAt: 10,
      confirmedAt: 10
    };
    localData.loadCommunicationHistory.mockReturnValue([confirmed]);
    localData.loadReceiverRecords.mockReturnValue([confirmed]);
    let wrapper;
    await act(async () => {
      wrapper = mount(<CommunicationSupportPanel {...props} isLogged />);
    });

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '常用语与历史')
      .first()
      .simulate('click');
    wrapper.update();
    API.deleteConfirmedReceiverRecords.mockClear();
    localData.loadCommunicationHistory.mockReturnValue([]);

    await act(async () => {
      wrapper
        .find('CommunicationManagementDialog')
        .first()
        .prop('onHistoryChange')([]);
    });

    expect(localData.overwriteReceiverRecords).toHaveBeenCalledWith([]);
    expect(API.deleteConfirmedReceiverRecords).toHaveBeenCalledWith(
      ['receiver-managed'],
      { deleteAll: true }
    );
  });

  test('reuses CBoard display and speech settings and filters receiver boards', () => {
    const boards = [
      {
        id: 'home',
        name: '首页',
        tiles: [
          { id: 'yes', label: '是' },
          { id: 'food-link', label: '食物', loadBoard: 'food' }
        ]
      },
      { id: 'food', name: '食物', tiles: [] }
    ];
    const expectedBoards = [{ ...boards[0], tiles: [boards[0].tiles[0]] }];
    const intl = {
      messages: {},
      formatMessage: jest.fn()
    };
    localData.loadCommunicationPreferences.mockReturnValue({
      highContrast: false,
      fontSize: 'normal',
      gridColumns: 4,
      speechRate: 1,
      candidateAutoplayDelaySeconds: 30,
      hiddenBoardIds: ['food'],
      onboardingComplete: false
    });
    const wrapper = mount(
      <CommunicationSupportPanel
        {...props}
        boards={boards}
        intl={intl}
        initialMode="receive"
      />
    );

    expect(wrapper.find('ReceiverLoopPanel').prop('boards')).toEqual(
      expectedBoards
    );
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '患者表达')
      .first()
      .simulate('click');
    wrapper.update();
    expect(
      wrapper.find('ExpressionLoopPanel').prop('candidateAutoplayDelaySeconds')
    ).toBe(30);
    expect(
      wrapper.find('CommunicationManagementDialog').prop('boards')
    ).toEqual(expectedBoards);
    expect(wrapper.find('CommunicationManagementDialog').prop('intl')).toBe(
      intl
    );
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '显示与易用性')
      .first()
      .simulate('click');
    wrapper.update();
    const accessibility = wrapper
      .find('CommunicationAccessibilityDialog')
      .first();

    expect(accessibility.prop('open')).toBe(true);
    act(() => {
      accessibility.prop('onChange')({
        ...accessibility.prop('value'),
        fontSize: 'extra-large',
        gridColumns: 2,
        speechRate: 0.7
      });
    });

    expect(localData.saveCommunicationPreferences).toHaveBeenCalled();
    expect(props.onChangeSpeechRate).toHaveBeenCalledWith(0.7);
    expect(props.onChangeDisplaySettings).toHaveBeenCalledWith(
      expect.objectContaining({
        fontSize: 'ExtraLarge',
        uiSize: 'ExtraLarge'
      })
    );
  });

  test('loads legacy tuyujia remote settings and syncs them back through communicationSupport', async () => {
    localData.loadCommunicationSavedPhrases.mockReturnValue([]);
    localData.loadCommunicationHistory.mockReturnValue([]);
    localData.mergeCommunicationSettings.mockImplementation(
      (localValue, remoteValue) => ({
        savedPhrases: [
          ...(localValue.savedPhrases || []),
          ...(remoteValue.savedPhrases || [])
        ],
        history: [...(localValue.history || []), ...(remoteValue.history || [])]
      })
    );
    API.getSettings.mockResolvedValue({
      tuyujia: {
        savedPhrases: [
          {
            sentence: '我要休息',
            output: [{ id: 'rest', label: '休息' }],
            createdAt: 300
          }
        ],
        history: []
      }
    });

    await act(async () => {
      mount(<CommunicationSupportPanel {...props} isLogged />);
    });

    expect(localData.overwriteCommunicationSettings).toHaveBeenCalledWith({
      savedPhrases: [
        expect.objectContaining({
          id: expect.stringMatching(/^phrase_/),
          sentence: '我要休息',
          output: [{ id: 'rest', label: '休息' }],
          createdAt: 300,
          lastUsedAt: 300,
          updatedAt: 300,
          usageCount: 0
        })
      ],
      history: []
    });
    expect(API.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        communicationSupport: expect.objectContaining({
          savedPhrases: expect.any(Array),
          history: expect.any(Array)
        }),
        tuyujia: expect.objectContaining({
          savedPhrases: expect.any(Array),
          history: expect.any(Array)
        })
      })
    );
  });

  test('syncs confirmed receiver records through the dedicated event endpoint', async () => {
    const remoteRecord = {
      id: 'receiver-remote',
      sessionId: 'session-remote',
      patientId: 'patient-remote',
      workspaceId: 'workspace-remote',
      direction: 'receive',
      recordStatus: 'confirmed',
      inputText: '请给我水',
      labels: ['水'],
      createdAt: 400,
      updatedAt: 400,
      confirmedAt: 400
    };
    localData.mergeCommunicationSettings.mockImplementation(
      (localValue, remoteValue) => ({
        savedPhrases: [
          ...(localValue.savedPhrases || []),
          ...(remoteValue.savedPhrases || [])
        ],
        history: [...(localValue.history || []), ...(remoteValue.history || [])]
      })
    );
    API.syncConfirmedReceiverRecords.mockResolvedValue({
      acceptedCount: 0,
      records: [remoteRecord]
    });

    await act(async () => {
      mount(<CommunicationSupportPanel {...props} isLogged />);
    });

    expect(API.syncConfirmedReceiverRecords).toHaveBeenCalledWith([]);
    expect(localData.overwriteReceiverRecords).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'receiver-remote',
        recordStatus: 'confirmed'
      })
    ]);
    expect(localData.overwriteCommunicationHistory).toHaveBeenCalledWith([
      remoteRecord
    ]);
  });
  test('stops active speech input when closing the receiver dialog', () => {
    communicationSpeech.useCommunicationSpeechRecognition.mockReturnValue({
      isAvailable: true,
      isListening: true,
      interimText: '正在识别',
      error: '',
      stopListening: mockStopListening,
      startListening: mockStartListening
    });
    const wrapper = mount(
      <CommunicationSupportPanel {...props} initialMode="receive" />
    );

    act(() => {
      wrapper.find('CommunicationReceiverDialog').prop('onClose')();
    });
    wrapper.update();

    expect(mockStopListening).toHaveBeenCalledTimes(1);
    expect(wrapper.find('CommunicationReceiverDialog').prop('open')).toBe(
      false
    );
    wrapper.unmount();
  });
});
