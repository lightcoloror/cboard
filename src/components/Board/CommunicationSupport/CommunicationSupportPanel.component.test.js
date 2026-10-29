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
import { createBoardDTO } from '../../../common/communicationSupport/dto';
import { browserCommunicationSharePort, createBrowserCommunicationSharePort } from '../../../common/communicationSupport/browserCommunicationShare';

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
  createLocalSavedPhraseImport: options => jest.requireActual('../../../common/communicationSupport/localData').createLocalSavedPhraseImport(options),
  createLocalSavedPhraseUndo: () => jest.requireActual('../../../common/communicationSupport/localData').createLocalSavedPhraseUndo(),
  appendCommunicationHistory: jest.fn(),
  appendReceiverCorrection: jest.fn(),
  buildCommunicationCloudSettingsPayload: jest.fn(),
  confirmReceiverDraft: jest.fn(),
  createReceiverDraft: jest.fn(),
  discardResumableReceiverRecord: jest.fn(),
  getActiveConversationSession: jest.fn(),
  getCommunicationStorageScopeKey: jest.fn(() => 'local'),
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

  test('committed import, consecutive deletes and undo refresh the canonical list without another CAS write', async () => {
    const actual = jest.requireActual('../../../common/communicationSupport/localData');
    const { buildCommunicationSavedPhraseExport } = jest.requireActual('../../../common/communicationSupport/savedPhraseManagement');
    window.localStorage.clear();
    actual.overwriteCommunicationSavedPhrases([{ id: 'before-import', sentence: '合成原句', output: [], createdAt: 1 }]);
    localData.loadCommunicationSavedPhrases.mockImplementation(actual.loadCommunicationSavedPhrases);
    localData.overwriteCommunicationSavedPhrases.mockImplementation(actual.overwriteCommunicationSavedPhrases);
    const wrapper = mount(<CommunicationSupportPanel {...props} />);
    const click = label => {
      act(() => wrapper.find('ForwardRef(Button)').filterWhere(node => node.text() === label).first().prop('onClick')());
      wrapper.update();
    };
    const shown = () => wrapper.find('CommunicationManagementDialog').prop('savedPhrases');
    try {
      click('常用语与历史');
      const payload = JSON.stringify(buildCommunicationSavedPhraseExport([{ id: 'imported', sentence: '合成导入句', output: [], createdAt: 2 }]));
      await act(async () => wrapper.find('input[type="file"]').first().prop('onChange')({ target: { files: [{ text: async () => payload }], value: '' } }));
      wrapper.update();
      const confirm = wrapper.find('ForwardRef(Button)').filterWhere(node => node.text() === '确认整批导入').prop('onClick');
      act(() => { confirm(); confirm(); }); wrapper.update();
      expect(actual.loadCommunicationSavedPhrases()).toHaveLength(2);
      expect(shown()).toEqual(actual.loadCommunicationSavedPhrases());
      expect(wrapper.text()).not.toContain('常用语已变化');
      click('删除'); click('删除');
      expect(shown()).toEqual([]);
      for (let i = 0; i < 2; i += 1) {
        await act(async () => wrapper.find(PatientActionButton).filterWhere(node => node.prop('ariaLabel') === '撤销上次删除的常用语').prop('onClick')());
        wrapper.update();
        expect(shown()).toEqual(actual.loadCommunicationSavedPhrases());
      }
      expect(shown()).toHaveLength(2);
      expect(shown().every(item => item.id.startsWith('phrase_restored_'))).toBe(true);
      expect(localData.overwriteCommunicationSavedPhrases).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount(); window.localStorage.clear();
      localData.loadCommunicationSavedPhrases.mockReturnValue([]);
      localData.overwriteCommunicationSavedPhrases.mockReset();
    }
  });

  test.each([100, 101])('direct duplicate favorite at %i keeps the original person, images and normalized sentence', count => {
    const { createCommunicationRepository, COMMUNICATION_STORAGE_KEYS: K } = jest.requireActual('../../../common/communicationSupport/repository');
    const entries = Array.from({ length: count }, (_, index) => ({
      id: `duplicate-old-${index}`, sentence: index ? `合成原句${index}` : '合成林安不回家', createdAt: index + 1,
      lifeContext: '聊天', output: [{ id: 'same', label: '合成林安', personId: 'synthetic-a', image: '/synthetic-a.png' }]
    }));
    const values = new Map([[K.savedPhrases, JSON.stringify(entries)]]);
    const repository = createCommunicationRepository({ storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
    localData.loadCommunicationSavedPhrases.mockImplementation(repository.loadCommunicationSavedPhrases);
    localData.saveCommunicationPhrase.mockImplementation(repository.saveCommunicationPhrase);
    localData.overwriteCommunicationSavedPhrases.mockImplementation(repository.overwriteCommunicationSavedPhrases);
    const before = repository.loadCommunicationSavedPhrases();
    const wrapper = mount(<CommunicationSupportPanel {...props} />);
    try {
      for (const sentence of ['合成林安不回家', '  合成林安不回家  ']) {
        expect(() => act(() => { wrapper.find('ExpressionLoopPanel').prop('onSavePhrase')({
          sentence, output: [{ id: 'same', label: '合成林安', personId: 'synthetic-b', image: '/synthetic-b.png' }]
        }); })).not.toThrow();
        wrapper.update();
        expect(repository.loadCommunicationSavedPhrases()).toEqual(before);
      }
      expect(localData.overwriteCommunicationSavedPhrases).not.toHaveBeenCalled();
      expect(props.onSpeak).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); localData.saveCommunicationPhrase.mockReset(); }
  });

  test.each([99, 100, 101])('history favorite preserves %i old items and retries against the authoritative store', count => {
    const { createCommunicationRepository, COMMUNICATION_STORAGE_KEYS: K } = jest.requireActual('../../../common/communicationSupport/repository');
    const values = new Map([[K.savedPhrases, JSON.stringify(Array.from({ length: count }, (_, index) => ({
      id: `synthetic-old-${index}`, sentence: `合成原句${index}`, createdAt: index + 1, lifeContext: '吃饭',
      output: [{ id: 'same', label: '合成林安', personId: `synthetic-${index}`, image: '/synthetic.png' }]
    })))]]);
    const repository = createCommunicationRepository({ storage: {
      getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)
    } });
    repository.overwriteCommunicationHistory([{
      id: 'synthetic-history', direction: 'express', sentence: '我今晚不回家吃饭', createdAt: 10,
      output: [{ id: 'same', label: '合成林安', personId: 'synthetic-a' }, { id: 'same', label: '合成林安', personId: 'synthetic-b' }]
    }]);
    const before = repository.loadCommunicationSavedPhrases(), historyBefore = repository.loadCommunicationHistory();
    localData.loadCommunicationSavedPhrases.mockImplementation(repository.loadCommunicationSavedPhrases);
    localData.loadCommunicationHistory.mockImplementation(repository.loadCommunicationHistory);
    localData.overwriteCommunicationHistory.mockImplementation(repository.overwriteCommunicationHistory);
    let loseReceipt = count === 99;
    localData.overwriteCommunicationSavedPhrases.mockImplementation((items, options) => {
      const result = repository.overwriteCommunicationSavedPhrases(items, options);
      if (loseReceipt) { loseReceipt = false; throw new Error('合成收藏已写入但回执丢失'); }
      return result;
    });
    const wrapper = mount(<CommunicationSupportPanel {...props} />);
    const click = label => {
      act(() => wrapper.find('ForwardRef(Button)').filterWhere(node => node.text() === label).first().prop('onClick')());
      wrapper.update();
    };
    try {
      click('常用语与历史');
      act(() => wrapper.find('ForwardRef(Button)').filterWhere(node => node.text().startsWith('沟通历史')).first().prop('onClick')()); wrapper.update();
      click('收藏');
      expect(repository.loadCommunicationHistory()).toEqual(historyBefore);
      expect(wrapper.find('CommunicationManagementDialog').find('div[role="status"]').map(node => node.text()).join(' ')).toContain(count >= 100 ? '容量上限' : '合成收藏已写入但回执丢失');
      if (count >= 100) {
        expect(repository.loadCommunicationSavedPhrases()).toEqual(before);
        while (repository.loadCommunicationSavedPhrases().length >= 100)
          repository.deleteCommunicationSavedPhrase(repository.loadCommunicationSavedPhrases().slice(-1)[0].id);
      }
      click('收藏');
      const after = repository.loadCommunicationSavedPhrases();
      expect(after).toHaveLength(100);
      expect(after.filter(item => item.sentence === historyBefore[0].sentence)).toHaveLength(1);
      expect(after.find(item => item.sentence === historyBefore[0].sentence).output).toEqual(historyBefore[0].output);
      expect(repository.loadCommunicationHistory()[0].isFavorite).toBe(true);
      expect(repository.loadCommunicationHistory()[0].output).toEqual(historyBefore[0].output);
      after.filter(item => item.id.startsWith('synthetic-old-')).forEach(item => {
        expect(item).toEqual(before.find(old => old.id === item.id));
      });
      // An acknowledged-loss retry reads the already committed favorite. It does
      // not issue a new write with the previous React list or a fresh identity.
      if (count === 99) expect(localData.overwriteCommunicationSavedPhrases).toHaveBeenCalledTimes(1);
      expect(props.onSpeak).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });

  test('committed refresh reads canonical data and preserves the current UI on read failure', () => {
    const initial = [{ id: 'before', sentence: '保存前', output: [] }];
    const canonical = [{ id: 'verified', sentence: '规范仓储', output: [] }];
    localData.loadCommunicationSavedPhrases.mockReturnValue(initial);
    const wrapper = mount(<CommunicationSupportPanel {...props} />);
    const refresh = wrapper.find('CommunicationManagementDialog').prop('onSavedPhrasesCommitted');
    try {
      localData.loadCommunicationSavedPhrases.mockImplementationOnce(() => { throw new Error('read denied'); });
      expect(() => refresh({ scopeKey: 'local', items: canonical })).toThrow('read denied');
      expect(wrapper.find('CommunicationManagementDialog').prop('savedPhrases')).toEqual(initial);
      localData.loadCommunicationSavedPhrases.mockReturnValue(canonical);
      act(() => expect(refresh({ scopeKey: 'local', items: [{ id: 'forged' }] })).toEqual(canonical)); wrapper.update();
      expect(wrapper.find('CommunicationManagementDialog').prop('savedPhrases')).toEqual(canonical);
      expect(localData.overwriteCommunicationSavedPhrases).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });

  test('committed refresh rejects stale scope, changed guards and callbacks after unmount', () => {
    const wrapper = mount(<CommunicationSupportPanel {...props} />);
    const refresh = wrapper.find('CommunicationManagementDialog').prop('onSavedPhrasesCommitted');
    localData.loadCommunicationSavedPhrases.mockClear();
    expect(() => refresh({ scopeKey: 'another-family' })).toThrow('已切换');
    expect(() => refresh({ scopeKey: 'local', guard: () => false })).toThrow('已切换');
    expect(localData.loadCommunicationSavedPhrases).not.toHaveBeenCalled();
    let valid = true;
    localData.loadCommunicationSavedPhrases.mockImplementationOnce(() => { valid = false; return [{ id: 'late' }]; });
    expect(() => refresh({ scopeKey: 'local', guard: () => valid })).toThrow('已切换');
    expect(wrapper.find('CommunicationManagementDialog').prop('savedPhrases')).toEqual([]);
    wrapper.unmount();
    expect(() => refresh({ scopeKey: 'local' })).toThrow('已切换');
  });

  test('reports a rejected personal-board update as failure and permits retry with the same board', async () => {
    const board = { id: 'device_private_board_test', name: '合成图板', tiles: [], grid: { rows: 1, columns: 3, order: [] } };
    const save = jest.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('synthetic write failure')).mockResolvedValueOnce(true);
    const wrapper = mount(<CommunicationSupportPanel {...props} boards={[board]} onUpdateCommunicationBoard={save} />);
    const dto = createBoardDTO(board);
    const submit = wrapper.find('CommunicationManagementDialog').prop('onCuratedBoardSave');
    await expect(submit(dto)).resolves.toBe(false);
    await expect(submit(dto)).resolves.toBe(false);
    await expect(submit(dto)).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(3);
    expect(save.mock.calls[0][0]).toEqual(save.mock.calls[1][0]);
    expect(save.mock.calls[0][1]).toEqual({ expectedBoard: board, guard: expect.any(Function) });
    wrapper.unmount();
  });

  test('gallery save keeps the original native baseline and cancels confirmation after a scope switch', async () => {
    const board = { id: 'device_private_board_scope', name: '合成图板', tiles: [], grid: { rows: 1, columns: 3, order: [] } };
    let resolve;
    const save = jest.fn(() => new Promise(done => { resolve = done; }));
    const wrapper = mount(<CommunicationSupportPanel {...props} boards={[{ ...board, name: '最新内存板名' }]} onUpdateCommunicationBoard={save} />);
    const guard = jest.fn(() => true);
    const submit = wrapper.find('CommunicationManagementDialog').prop('onCuratedBoardSave');
    const pending = submit(createBoardDTO(board), { expectedBoard: board, guard });
    expect(save.mock.calls[0][1].expectedBoard).toBe(board);
    expect(save.mock.calls[0][1].guard()).toBe(true);
    localData.getCommunicationStorageScopeKey.mockReturnValue('another-family');
    expect(save.mock.calls[0][1].guard()).toBe(false);
    resolve(true);
    await expect(pending).resolves.toBe(false);
    localData.getCommunicationStorageScopeKey.mockReturnValue('local');
    wrapper.unmount();
  });

  test('personal board creation reuses the supplied ID when its previous attempt is already in memory', async () => {
    const board = { id: 'device_private_board_retry', name: '合成重试板', tiles: [], grid: { rows: 1, columns: 3, order: [] } };
    const create = jest.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('write failed')).mockResolvedValueOnce(board.id);
    const wrapper = mount(<CommunicationSupportPanel {...props} boards={[board]} onCreateCommunicationBoard={create} />);
    const submit = wrapper.find('CommunicationManagementDialog').prop('onCreatePersonalBoard');
    await expect(submit(board.name, { id: board.id })).resolves.toBe(false);
    await expect(submit(board.name, { id: board.id })).resolves.toBe(false);
    await expect(submit(board.name, { id: board.id })).resolves.toBe(board.id);
    expect(create.mock.calls[1][0]).toEqual(create.mock.calls[0][0]);
    expect(create.mock.calls[2][0]).toEqual(create.mock.calls[0][0]);
    wrapper.unmount();
  });

  test('forwards expression cancellation through the real parent and share adapter when switching to receiver', async () => {
    let rejectShare;
    const nativeShare = jest.fn(() => new Promise((resolve, reject) => { rejectShare = reject; }));
    const downloadBlob = jest.fn();
    const port = createBrowserCommunicationSharePort({ navigatorRef: { share: nativeShare }, downloadBlob });
    const shareSpy = jest.spyOn(browserCommunicationSharePort, 'shareExpressionText').mockImplementation(port.shareExpressionText);
    const wrapper = mount(<CommunicationSupportPanel {...props} output={mockedOutput} />);
    try {
      let task;
      act(() => {
        task = wrapper.find(PatientActionButton).filterWhere(button => button.prop('action') === PATIENT_ACTION_IDS.share).first().prop('onClick')();
      });
      expect(shareSpy).toHaveBeenCalledWith(expect.any(String), { isCurrent: expect.any(Function) });
      expect(shareSpy.mock.calls[0][1].isCurrent()).toBe(true);
      act(() => {
        wrapper.find('ForwardRef(Button)').filterWhere(button => button.text() === '接收理解').first().simulate('click');
      });
      expect(shareSpy.mock.calls[0][1].isCurrent()).toBe(false);
      await act(async () => { rejectShare(new Error('synthetic native failure')); await task; });
      expect(downloadBlob).not.toHaveBeenCalled();
      expect(nativeShare).toHaveBeenCalledTimes(1);
    } finally {
      wrapper.unmount();
      shareSpy.mockRestore();
    }
  });

  it('keeps shared daily phrases outside personal persistence when reused', () => {
    const shared = {
      id: 'family-shared:one',
      sentence: '家庭共享测试',
      output: [],
      careSharedReadOnly: true
    };
    const changed = jest.fn();
    const wrapper = mount(
      <CommunicationSupportPanel
        {...props}
        careMode
        initialMode="express"
        careSharedPhrases={[shared]}
        onCareFavoritesChanged={changed}
      />
    );
    const expression = wrapper.find('ExpressionLoopPanel');
    expect(expression.prop('savedPhrases')).toContainEqual(shared);
    localData.overwriteCommunicationSavedPhrases.mockClear();
    act(() => expression.prop('onUseSavedPhrase')(shared));
    expect(localData.overwriteCommunicationSavedPhrases).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(
      wrapper.find('CommunicationManagementDialog').prop('savedPhrases')
    ).not.toContainEqual(shared);
    wrapper.unmount();
  });

  test.each(
    ['disabled', 'login', 'profile', 'funding', 'ready'].flatMap(state =>
      ['express', 'receive'].map(mode => [state, mode])
    )
  )(
    'shows the controlled text AI state for %s in %s without calling the service',
    (state, mode) => {
      const previous = { ...process.env };
      let wrapper;
      process.env.REACT_APP_TUYUJIA_CLOUD_TRIAL = 'true';
      process.env.REACT_APP_CARE_AI_TRIAL =
        state === 'disabled' ? 'false' : 'true';
      const accountId = 'synthetic-ai-ui';
      try {
        if (['funding', 'ready'].includes(state))
          localStorage.setItem(
            `care-selection-v1:${accountId}`,
            JSON.stringify({ id: 'profile-ui' })
          );
        if (state === 'ready')
          localStorage.setItem(
            `care-funding-v1:${accountId}:profile-ui`,
            'fund-ui'
          );
        wrapper = mount(
          <CommunicationSupportPanel
            {...props}
            careMode
            accountId={accountId}
            isLogged={state !== 'login'}
            initialMode={mode}
          />
        );
        const panel = wrapper.find(
          mode === 'express' ? 'ExpressionLoopPanel' : 'ReceiverLoopPanel'
        );
        expect(panel.prop('aiAvailable')).toBe(state === 'ready');
        const expected = {
          disabled: '尚未开放在线 AI',
          login: '请先登录',
          profile: '选择患者档案',
          funding: '选择 AI 额度来源'
        };
        if (state !== 'ready') expect(panel.text()).toContain(expected[state]);
        expect(API.resegmentCommunicationText).not.toHaveBeenCalled();
        expect(API.generateCommunicationSentences).not.toHaveBeenCalled();
      } finally {
        if (wrapper) wrapper.unmount();
        process.env = previous;
        localStorage.removeItem(`care-selection-v1:${accountId}`);
        localStorage.removeItem(`care-funding-v1:${accountId}:profile-ui`);
      }
    }
  );

  beforeEach(() => {
    jest.useFakeTimers();
    localData.getCommunicationStorageScopeKey.mockReturnValue('local');
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
    await openReceiveReview(wrapper, '想水');

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
        inputText: '想水',
        labels: ['想', '水']
      })
    );
    expect(props.onSpeak).toHaveBeenCalledWith(
      '想水',
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

  test('shows the first-use guide only after entering communication and persists completion', async () => {
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
    await act(async () => {
      onboarding.prop('onComplete')();
      await Promise.resolve();
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
    await openReceiveReview(wrapper, '想喝水');

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

    expect(sendButton.prop('disabled')).toBe(true);
    expect(onApplyOutput).not.toHaveBeenCalled();
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '全屏展示')
      .first()
      .simulate('click');

    wrapper.update();
    wrapper.find('ForwardRef(Button)').filterWhere(n => n.text() === '我会辅助解释，继续展示').first().simulate('click');
    wrapper.update();
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

    expect(localData.confirmReceiverDraft).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'receiver-draft', recordStatus: 'draft' }),
      expect.objectContaining({
        direction: 'receive',
        inputText: '想喝水',
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
    expect(receiver.text()).toContain('尚有意思未图示，需要伙伴解释');
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
    expect(wrapper.find('#communication-expression-panel').prop('hidden')).toBe(true);
  });

  test('keeps the board compact by default and opens receiver in a focused dialog', () => {
    const wrapper = mount(
      <CommunicationSupportPanel {...props} initiallyExpanded={false} />
    );

    expect(wrapper.find('#communication-expression-panel').prop('hidden')).toBe(true);
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

    expect(wrapper.find('#communication-expression-panel').prop('hidden')).toBe(false);

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '接收理解')
      .first()
      .simulate('click');
    wrapper.update();

    expect(wrapper.find('#communication-expression-panel').prop('hidden')).toBe(true);
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

  test('reveals three choices after board selection and respects deliberate collapse', () => {
    const wrapper = mount(
      <CommunicationSupportPanel
        {...props}
        initiallyExpanded={false}
        initialMode="receive"
        autoExpandOnOutput
        output={[]}
      />
    );
    expect(wrapper.find('#communication-expression-panel').prop('hidden')).toBe(true);
    wrapper.setProps({ output: mockedOutput });
    wrapper.update();
    expect(wrapper.find('#communication-expression-panel').prop('hidden')).toBe(false);
    expect(
      wrapper.find('button.CommunicationSupportPanel__candidate')
    ).toHaveLength(3);
    wrapper
      .find(PatientActionButton)
      .filterWhere(
        button => button.prop('action') === PATIENT_ACTION_IDS.express
      )
      .first()
      .simulate('click');
    wrapper.setProps({ output: mockedOutput.map(item => ({ ...item })) });
    expect(wrapper.find('#communication-expression-panel').prop('hidden')).toBe(true);
    wrapper.setProps({
      output: [...mockedOutput, { id: 'please', label: '请' }]
    });
    wrapper.update();
    expect(wrapper.find('#communication-expression-panel').prop('hidden')).toBe(false);
    wrapper.unmount();
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

  test('ranks a later qualified candidate before the four-picture UI limit', async () => {
    const missing = {
      id: 'rank-gap',
      normalizedToken: '回家',
      status: 'new',
      updatedAt: 1,
      rawTextSamples: [],
      occurrenceCount: 1
    };
    localData.loadMissingTokens.mockReturnValue([missing]);
    const { buildArasaacSemanticFields } = jest.requireActual(
      '../../../common/communicationSupport/pictogramSemantics'
    );
    API.searchCommunicationPictograms.mockResolvedValue(
      [1, 2, 3, 4, 29714].map(id => ({
        token: '回家',
        pictogram: {
          id: `rank-${id}`,
          image: `/pictures/${id}.png`,
          ...buildArasaacSemanticFields(
            '回家',
            id === 29714 ? 'come back' : 'go home',
            'en',
            id,
            {
              keywords: [{ keyword: id === 29714 ? 'come back' : 'go home' }]
            }
          ),
          source: {
            provider: 'arasaac',
            originalId: String(id),
            name: 'ARASAAC',
            license: 'CC BY-NC-SA 4.0',
            sourceUrl: `https://arasaac.org/pictograms/${id}`
          }
        }
      }))
    );
    const wrapper = mount(
      <CommunicationSupportPanel {...props} initialMode="receive" />
    );
    await act(async () => {
      await wrapper
        .find('MissingTokenQueue')
        .first()
        .prop('onSearchOnline')([missing.id]);
    });
    const review = localData.reviewMissingToken.mock.calls[0][1];
    expect(review.suggestedPictograms.map(p => p.source.originalId)).toEqual([
      '29714',
      '1',
      '2',
      '3'
    ]);
    expect(review.status).toBe('suggested');
    wrapper.unmount();
  });

  test('keeps receiver gaps local until the partner explicitly searches', async () => {
    const missing = {
      id: 'auto-gap',
      normalizedToken: '家里人',
      status: 'new',
      updatedAt: 1,
      rawTextSamples: []
    };
    localData.loadCommunicationPreferences.mockReturnValue({
      onlinePictogramSearchEnabled: true
    });
    localData.recordMissingTokens.mockReturnValue([missing]);
    localData.loadMissingTokens.mockReturnValue([missing]);
    API.searchCommunicationPictograms.mockReset();
    API.searchCommunicationPictograms.mockResolvedValue([]);
    const wrapper = mount(
      <CommunicationSupportPanel {...props} initialMode="receive" />
    );
    const record = wrapper
      .find('ReceiverLoopPanel')
      .first()
      .prop('onRecordMissingTokens');
    await act(async () => {
      record({ tokens: ['家里人'] });
      record({ tokens: ['家里人'] });
    });
    expect(API.searchCommunicationPictograms).not.toHaveBeenCalled();
    await act(async () => {
      await wrapper.find('ReceiverLoopPanel').first()
        .prop('onSearchMissingTokensOnline')([missing.id]);
    });
    expect(API.searchCommunicationPictograms).toHaveBeenCalledTimes(1);
    expect(API.searchCommunicationPictograms).toHaveBeenCalledWith(['家里人']);
    expect(localData.reviewMissingToken).not.toHaveBeenCalled();
    wrapper.unmount();
    localData.loadCommunicationPreferences.mockReturnValue({});
  });

  test.each(['scope', 'review', 'unmount'])(
    'discards late search results after %s changes',
    async change => {
      const missing = {
        id: 'late-gap',
        normalizedToken: '家里人',
        status: 'new',
        updatedAt: 1,
        rawTextSamples: []
      };
      localData.loadMissingTokens.mockReturnValue([missing]);
      localData.getCommunicationStorageScopeKey.mockReturnValue('family-a');
      let complete;
      API.searchCommunicationPictograms.mockImplementation(
        () =>
          new Promise(resolve => {
            complete = resolve;
          })
      );
      const wrapper = mount(
        <CommunicationSupportPanel {...props} initialMode="receive" />
      );
      const pending = wrapper
        .find('MissingTokenQueue')
        .first()
        .prop('onSearchOnline')([missing.id]);
      if (change === 'scope')
        localData.getCommunicationStorageScopeKey.mockReturnValue('family-b');
      if (change === 'review')
        localData.loadMissingTokens.mockReturnValue([
          { ...missing, status: 'ignored', updatedAt: 2 }
        ]);
      if (change === 'unmount') wrapper.unmount();
      await act(async () => {
        complete([
          {
            token: '家里人',
            pictogram: {
              id: 'p2392',
              label: '家里人',
              image: '/p.png',
              source: {
                provider: 'arasaac',
                name: 'ARASAAC',
                originalId: '2392',
                license: 'CC BY-NC-SA 4.0',
                sourceUrl: 'https://arasaac.org/pictograms/2392'
              }
            }
          }
        ]);
        await pending;
      });
      expect(localData.reviewMissingToken).not.toHaveBeenCalled();
      if (change !== 'unmount') wrapper.unmount();
      localData.getCommunicationStorageScopeKey.mockReturnValue('local');
    }
  );

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

  test('care history completion and deletion never submit projected favorites', () => {
    const onCareFavoritesChanged = jest.fn();
    localData.loadCommunicationSavedPhrases.mockReturnValue([
      { id: 'shared', sentence: '家庭共享收藏', output: [], createdAt: 1 }
    ]);
    const wrapper = mount(
      <CommunicationSupportPanel
        {...props}
        careMode
        onCareFavoritesChanged={onCareFavoritesChanged}
      />
    );
    act(() => {
      wrapper
        .find('ExpressionLoopPanel')
        .first()
        .prop('onAppendHistory')({
        id: 'completed',
        direction: 'express',
        sentence: '喝水'
      });
    });
    expect(localData.appendCommunicationHistory).toHaveBeenCalled();
    act(() => {
      wrapper
        .find('CommunicationManagementDialog')
        .first()
        .prop('onHistoryChange')([]);
    });
    expect(localData.overwriteCommunicationHistory).toHaveBeenCalledWith([]);
    expect(onCareFavoritesChanged).not.toHaveBeenCalled();
    expect(API.updateSettings).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  test('care explicit favorite edits still submit the reviewed favorites', async () => {
    const onCareFavoritesChanged = jest.fn();
    const changed = [
      { id: 'own', sentence: '请给我水', output: [], createdAt: 1 }
    ];
    const wrapper = mount(
      <CommunicationSupportPanel
        {...props}
        careMode
        onCareFavoritesChanged={onCareFavoritesChanged}
      />
    );
    localData.loadCommunicationSavedPhrases.mockReturnValue(changed);
    await act(async () => {
      wrapper
        .find('CommunicationManagementDialog')
        .first()
        .prop('onSavedPhrasesChange')(changed);
    });
    expect(onCareFavoritesChanged).toHaveBeenCalledWith(changed);
    wrapper.unmount();
  });

  test.each([false, true])(
    'persists quick phrase usage locally in care mode %s without replacing the output',
    careMode => {
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
      const onCareFavoritesChanged = jest.fn();
      const wrapper = mount(
        <CommunicationSupportPanel
          {...props}
          careMode={careMode}
          onCareFavoritesChanged={onCareFavoritesChanged}
        />
      );

      act(() => {
        wrapper
          .find('ExpressionLoopPanel')
          .first()
          .prop('onUseSavedPhrase')(phrase);
      });
      wrapper.update();

      expect(localData.overwriteCommunicationSavedPhrases).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: 'phrase-quick',
            usageCount: 1
          })
        ], expect.objectContaining({ expectedPhrases: expect.any(Array) })
      );
      if (careMode) {
        expect(onCareFavoritesChanged).not.toHaveBeenCalled();
        expect(
          localData.buildCommunicationCloudSettingsPayload
        ).not.toHaveBeenCalled();
      } else
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
      wrapper.unmount();
    }
  );

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
    ], { expectedPhrases: [managedPhrase] });
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

  test('reuses CBoard display and speech settings and filters receiver boards', async () => {
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
    await act(async () => {
      await accessibility.prop('onChange')({
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
