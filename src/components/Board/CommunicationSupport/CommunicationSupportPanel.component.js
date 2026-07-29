import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@material-ui/core/Button';
import shortid from 'shortid';
import API from '../../../api';
import {
  DISPLAY_SIZE_EXTRALARGE,
  DISPLAY_SIZE_LARGE,
  DISPLAY_SIZE_STANDARD
} from '../../Settings/Display/Display.constants';
import {
  createCommunicationSupportSettingsPatch,
  getCommunicationSupportSettings
} from '../../../common/communicationSupport/settingsAdapter';
import { CONVERSATION_SCENES } from '../../../common/communicationSupport/conversationSession';
import { browserCommunicationSharePort } from '../../../common/communicationSupport/browserCommunicationShare';
import {
  appendCommunicationHistory,
  appendReceiverCorrection,
  buildCommunicationCloudSettingsPayload,
  confirmReceiverDraft,
  clearPrivatePictograms,
  createReceiverDraft,
  discardResumableReceiverRecord,
  getActiveConversationSession,
  loadCommunicationHistory,
  loadPersonalImagePreferences,
  loadPersonalImageRuntime,
  loadCommunicationPreferences,
  loadCommunicationSavedPhrases,
  loadConversationContext,
  loadExpressionCandidateFeedbackDrafts,
  loadMissingTokens,
  loadReceiverCorrections,
  loadReceiverRecords,
  loadResumableReceiverRecord,
  mergeCommunicationSettings,
  overwriteCommunicationHistory,
  overwriteCommunicationSavedPhrases,
  overwriteCommunicationSettings,
  overwriteReceiverCorrections,
  overwriteReceiverRecords,
  recordMissingTokens,
  recordReceiverPatientFeedback,
  removeExpressionCandidateFeedbackDraft,
  removePersonalImagePreference,
  resetConversationSession,
  setConversationScene,
  reviewMissingToken,
  saveCommunicationPhrase,
  saveExpressionCandidateFeedbackDraft,
  savePersonalImagePreference,
  saveCommunicationPreferences,
  updateReceiverDraft
} from '../../../common/communicationSupport/localData';
import { browserLocalDeviceDataPort } from '../../../common/communicationSupport/browserLocalDeviceData';
import {
  buildWorkspaceCorrectionMemory,
  disableWorkspaceCorrectionMemoryToken
} from '../../../common/communicationSupport/correctionMemory';
import {
  applyPersonalImagePreferencesToBoards,
  applyPersonalImagePreferencesToItems
} from '../../../common/communicationSupport/personalImagePreferences';
import { projectVisibleCommunicationBoards } from '../../../common/communicationSupport/communicationPreferences';
import {
  mergeConfirmedReceiverRecords,
  removeDeletedReceiverHistory
} from '../../../common/communicationSupport/receiverSync';
import { useCommunicationSpeechRecognition } from '../../../common/communicationSupport/communicationSpeech';
import {
  normalizeMissingTokenSuggestions,
  normalizeMissingTokenText
} from '../../../common/communicationSupport/missingTokens';
import { normalizeRuntimePictogram } from '../../../common/communicationSupport/runtimePictogram';
import { createBoardDTO } from '../../../common/communicationSupport/dto';
import {
  PERSONAL_COMMUNICATION_BOARD_ID_PREFIX,
  createPersonalCommunicationBoard
} from '../../../common/communicationSupport/boardManagement';
import { boardDTOToCboardBoard } from '../../../common/communicationSupport/cboardBoardAdapter';
import {
  resolveCommunicationBoardName,
  resolveCommunicationTileLabel
} from '../../../common/communicationSupport/resolvers';
import { markCommunicationSavedPhraseUsed } from '../../../common/communicationSupport/savedPhraseManagement';
import { PATIENT_ACTION_IDS } from '../../../common/communicationSupport/patientActionLanguage';
import ExpressionLoopPanel from './ExpressionLoopPanel.component';
import CommunicationAccessibilityDialog from './CommunicationAccessibilityDialog.component';
import CommunicationManagementDialog from './CommunicationManagementDialog.component';
import CommunicationOnboardingDialog from './CommunicationOnboardingDialog.component';
import CommunicationReceiverDialog from './CommunicationReceiverDialog.component';
import EmergencyCommunicationDialog from './EmergencyCommunicationDialog.component';
import CommunicationNetworkStatusNotice from './CommunicationNetworkStatusNotice.component';
import PatientActionButton from './PatientActionButton.component';
import ReceiverLoopPanel from './ReceiverLoopPanel.component';
import './CommunicationSupportPanel.css';

const DEFAULT_COPY = {
  title: '双向沟通支持',
  subtitle: '支持患者表达与照护者文字转图片沟通。',
  collapse: '收起',
  expand: '展开',
  expressTab: '患者表达',
  receiveTab: '接收理解',
  expressSectionTitle: '候选句播报',
  currentBoard: '当前板',
  noBoard: '未选择',
  currentOutput: '当前输出',
  selectSymbolsFirst: '请先选图',
  generateAndSpeak: '生成并播报',
  stopSpeech: '停止播报',
  speechUnavailable: '当前语音引擎无法完成播报，候选句仍可继续使用。',
  replayAll: '全部重播',
  savePhrase: '收藏此句',
  shareExpression: '分享此句',
  shareReceiverImage: '分享图片序列',
  savedPhrasesTitle: '常用短句',
  savedPhrasesHint: '本地保存最近 20 条',
  reuse: '重用',
  noSavedPhrases: '还没有收藏的短句。',
  receiveSectionTitle: '文字转图片',
  receiveHint: '使用当前已加载 boards 内的 tiles 做匹配',
  listening: '聆听中...',
  receivePlaceholder: '例如：想喝水、想要苹果、头疼',
  generateSequence: '生成图片序列',
  matching: '匹配中...',
  stopRecording: '停止录音',
  voiceInput: '语音输入',
  resetInput: '重新输入',
  newConversation: '新对话',
  newConversationQuestion: '开始新对话？当前 AI 上下文和场景将被清除。',
  confirmNewConversation: '确认开始',
  cancelNewConversation: '取消',
  newConversationStarted: '已开始新对话，原有历史仍会保留。',
  conversationScene: '当前场景',
  noConversationScene: '未选择',
  conversationSceneCleared: '已清除当前场景。',
  emergency: '紧急求助',
  management: '常用语与历史',
  accessibility: '显示与易用性',
  caregiverTools: '照护工具',
  collapseExpress: '收起患者表达',
  receiverDialogTitle: '接收理解',
  receiverDialogSubtitle: '照护者输入或说出文字，确认分词后转换为图片序列。',
  returnToBoard: '返回图板',
  previewLabel: '预览图片',
  emptyPreview: '无',
  missingLabel: '缺词提示',
  sendToOutput: '发送到输出栏',
  fullscreen: '全屏展示',
  recentHistoryTitle: '最近历史',
  historyHint: '表达与接收都会记录',
  noHistory: '还没有本地历史。',
  replaceSymbol: '替换图片',
  searchPlaceholder: '搜索标签或同义词',
  close: '关闭',
  fullscreenTitle: '接收端全屏展示',
  replaceAction: '换图',
  sourceBoard: '来源板',
  moveLeft: '左移',
  moveRight: '右移',
  remove: '删除',
  unmatched: '未匹配',
  expressHistoryLabel: '表达',
  receiveHistoryLabel: '接收'
};

const COMMUNICATION_FONT_TO_CBOARD = {
  normal: DISPLAY_SIZE_STANDARD,
  large: DISPLAY_SIZE_LARGE,
  'extra-large': DISPLAY_SIZE_EXTRALARGE
};
const CBOARD_FONT_TO_COMMUNICATION = {
  [DISPLAY_SIZE_STANDARD]: 'normal',
  [DISPLAY_SIZE_LARGE]: 'large',
  [DISPLAY_SIZE_EXTRALARGE]: 'extra-large'
};
const COMMUNICATION_GRID_TO_CBOARD = {
  2: DISPLAY_SIZE_EXTRALARGE,
  3: DISPLAY_SIZE_LARGE,
  4: DISPLAY_SIZE_STANDARD
};
const CBOARD_GRID_TO_COMMUNICATION = {
  [DISPLAY_SIZE_STANDARD]: 4,
  [DISPLAY_SIZE_LARGE]: 3,
  [DISPLAY_SIZE_EXTRALARGE]: 2
};

async function loadMergedReceiverCloudData() {
  const localRecords = loadReceiverRecords();
  const response = await API.syncConfirmedReceiverRecords(localRecords);
  const receiverRecords = mergeConfirmedReceiverRecords(
    localRecords,
    response.records,
    response.deletedRecordIds
  );
  const activeHistory = removeDeletedReceiverHistory(
    loadCommunicationHistory(),
    response.deletedRecordIds
  );
  const history = mergeCommunicationSettings(
    { savedPhrases: [], history: activeHistory },
    { savedPhrases: [], history: response.records }
  ).history;

  return { receiverRecords, history };
}

function mergeCboardPreferences(
  localPreferences,
  speechRate,
  displayFontSize,
  displayUiSize
) {
  return {
    ...localPreferences,
    speechRate: Number.isFinite(Number(speechRate))
      ? Number(speechRate)
      : localPreferences.speechRate,
    fontSize:
      CBOARD_FONT_TO_COMMUNICATION[displayFontSize] ||
      localPreferences.fontSize,
    gridColumns:
      CBOARD_GRID_TO_COMMUNICATION[displayUiSize] ||
      localPreferences.gridColumns
  };
}

export default function CommunicationSupportPanel({
  boards,
  output,
  activeBoardId,
  onApplyOutput,
  onJumpBoard,
  onSpeak,
  onCancelSpeech,
  intl,
  isLogged,
  demoMode,
  speechSettings,
  displaySettings,
  pictogramOrdering,
  onPictogramUsed,
  onCreateCommunicationBoard,
  onUpdateCommunicationBoard,
  onChangeSpeechRate,
  onChangeDisplaySettings,
  copyOverrides,
  initialMode,
  initiallyExpanded
}) {
  const copy = { ...DEFAULT_COPY, ...(copyOverrides || {}) };
  const cboardSpeechRate = speechSettings && speechSettings.rate;
  const cboardFontSize = displaySettings && displaySettings.fontSize;
  const cboardUiSize = displaySettings && displaySettings.uiSize;
  const [isExpanded, setIsExpanded] = useState(
    () => initiallyExpanded && initialMode === 'express'
  );
  const [showReceiver, setShowReceiver] = useState(
    () => initiallyExpanded && initialMode === 'receive'
  );
  const [showCaregiverTools, setShowCaregiverTools] = useState(false);
  const [savedPhrases, setSavedPhrases] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [missingTokenRecords, setMissingTokenRecords] = useState([]);
  const [receiverCorrections, setReceiverCorrections] = useState(
    loadReceiverCorrections
  );
  const [personalImageRuntime] = useState(loadPersonalImageRuntime);
  const [personalImagePreferences, setPersonalImagePreferences] = useState(
    personalImageRuntime.preferences
  );
  const [conversationSession, setConversationSession] = useState(null);
  const [sessionNotice, setSessionNotice] = useState('');
  const [confirmingNewConversation, setConfirmingNewConversation] = useState(
    false
  );
  const [showEmergency, setShowEmergency] = useState(false);
  const [showManagement, setShowManagement] = useState(false);
  const [showAccessibility, setShowAccessibility] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [preferences, setPreferences] = useState(() =>
    mergeCboardPreferences(
      loadCommunicationPreferences(),
      cboardSpeechRate,
      cboardFontSize,
      cboardUiSize
    )
  );
  const personalizedBoards = useMemo(
    () =>
      applyPersonalImagePreferencesToBoards(
        boards,
        personalImagePreferences,
        personalImageRuntime.identity
      ),
    [boards, personalImagePreferences, personalImageRuntime.identity]
  );
  const communicationBoards = useMemo(
    () => {
      const visibleBoards = projectVisibleCommunicationBoards(
        personalizedBoards,
        preferences.hiddenBoardIds
      );
      return visibleBoards.length ? visibleBoards : personalizedBoards;
    },
    [personalizedBoards, preferences.hiddenBoardIds]
  );
  const expressionBoardDtos = useMemo(
    () =>
      isExpanded
        ? communicationBoards.map(board =>
            createBoardDTO(board, {
              resolveName: source =>
                resolveCommunicationBoardName(source, intl),
              resolveTileLabel: source =>
                resolveCommunicationTileLabel(source, intl)
            })
          )
        : [],
    [communicationBoards, intl, isExpanded]
  );
  const communicationOutput = applyPersonalImagePreferencesToItems(
    output,
    personalImagePreferences,
    personalImageRuntime.identity
  );
  const correctionMemory = buildWorkspaceCorrectionMemory(receiverCorrections, {
    workspaceId: personalImageRuntime.identity.workspaceId
  });

  const speech = useCommunicationSpeechRecognition();
  const speechIsListening = speech.isListening;
  const stopSpeechListening = speech.stopListening;

  useEffect(
    () => {
      if (!showReceiver && speechIsListening) {
        stopSpeechListening();
      }
    },
    [showReceiver, speechIsListening, stopSpeechListening]
  );

  useEffect(
    () => {
      setPreferences(current =>
        mergeCboardPreferences(
          current,
          cboardSpeechRate,
          cboardFontSize,
          cboardUiSize
        )
      );
    },
    [cboardFontSize, cboardSpeechRate, cboardUiSize]
  );

  useEffect(
    () => {
      if (typeof document === 'undefined' || !document.body) return undefined;
      const contrastClass = 'CommunicationSupportHighContrast';
      const gridClass = `CommunicationSupportGrid--${preferences.gridColumns}`;
      document.body.classList.toggle(contrastClass, preferences.highContrast);
      document.body.classList.add(gridClass);

      return () => {
        document.body.classList.remove(contrastClass);
        document.body.classList.remove(gridClass);
      };
    },
    [preferences.gridColumns, preferences.highContrast]
  );

  useEffect(
    () => {
      if ((isExpanded || showReceiver) && !preferences.onboardingComplete) {
        setShowOnboarding(true);
      }
    },
    [isExpanded, preferences.onboardingComplete, showReceiver]
  );
  const latestSavedRef = useRef([]);
  const latestHistoryRef = useRef([]);

  useEffect(() => {
    setSavedPhrases(loadCommunicationSavedPhrases());
    setHistoryItems(loadCommunicationHistory());
    setMissingTokenRecords(loadMissingTokens());
    setConversationSession(getActiveConversationSession());
  }, []);

  useEffect(
    () => {
      latestSavedRef.current = savedPhrases;
    },
    [savedPhrases]
  );

  useEffect(
    () => {
      latestHistoryRef.current = historyItems;
    },
    [historyItems]
  );

  useEffect(
    () => {
      if (!initiallyExpanded) return;
      setIsExpanded(initialMode === 'express');
      setShowReceiver(initialMode === 'receive');
    },
    [initialMode, initiallyExpanded]
  );

  useEffect(
    () => {
      let cancelled = false;

      async function loadRemoteSettings() {
        if (!isLogged) {
          return;
        }

        try {
          const settings = await API.getSettings();
          if (cancelled) {
            return;
          }

          const mergedSettings = mergeCommunicationSettings(
            {
              savedPhrases: loadCommunicationSavedPhrases(),
              history: loadCommunicationHistory()
            },
            getCommunicationSupportSettings(settings)
          );

          overwriteCommunicationSettings(mergedSettings);
          setSavedPhrases(mergedSettings.savedPhrases);
          setHistoryItems(mergedSettings.history);
          const cloudSettings = buildCommunicationCloudSettingsPayload(
            mergedSettings.savedPhrases,
            mergedSettings.history
          );
          await API.updateSettings(
            createCommunicationSupportSettingsPatch(cloudSettings)
          );
        } catch (error) {
          // Local fallback is already loaded above.
        }

        try {
          const receiverData = await loadMergedReceiverCloudData();
          if (cancelled) {
            return;
          }
          overwriteReceiverRecords(receiverData.receiverRecords);
          overwriteCommunicationHistory(receiverData.history);
          setHistoryItems(receiverData.history);
        } catch (error) {
          // Confirmed records remain local until the event API is available.
        }
      }

      loadRemoteSettings();

      return () => {
        cancelled = true;
      };
    },
    [isLogged]
  );

  async function persistCommunicationSupportSettings(
    nextSavedPhrases,
    nextHistory
  ) {
    const payload = buildCommunicationCloudSettingsPayload(
      nextSavedPhrases,
      nextHistory
    );

    if (!isLogged) {
      return;
    }

    try {
      await API.updateSettings(
        createCommunicationSupportSettingsPatch(payload)
      );
    } catch (error) {
      // Keep local fallback even if remote sync fails.
    }
  }

  function refreshSavedPhrases() {
    const nextSavedPhrases = loadCommunicationSavedPhrases();
    setSavedPhrases(nextSavedPhrases);
    persistCommunicationSupportSettings(
      nextSavedPhrases,
      latestHistoryRef.current
    );
  }

  function refreshHistory() {
    const nextHistory = loadCommunicationHistory();
    setHistoryItems(nextHistory);
    persistCommunicationSupportSettings(latestSavedRef.current, nextHistory);
  }

  function handleSavePhrase(entry) {
    saveCommunicationPhrase(entry);
    refreshSavedPhrases();
  }

  function handleAppendExpressionHistory(entry) {
    const persisted = appendCommunicationHistory(entry);
    if (entry && entry.id) {
      removeExpressionCandidateFeedbackDraft(entry.id);
    }
    refreshHistory();
    return persisted;
  }

  function handleSaveExpressionCandidateFeedbackDraft(entry) {
    return saveExpressionCandidateFeedbackDraft(entry);
  }

  function handleDiscardExpressionCandidateFeedbackDraft(id) {
    return removeExpressionCandidateFeedbackDraft(id);
  }

  function handleAppendReceiveHistory(entry) {
    appendCommunicationHistory(entry);
    refreshHistory();
  }

  function handleCreateReceiverDraft(entry) {
    return createReceiverDraft(entry);
  }

  function handleUpdateReceiverDraft(draft, entry) {
    return updateReceiverDraft(draft, entry);
  }

  function syncReceiverCloudData() {
    if (!isLogged) return;
    loadMergedReceiverCloudData()
      .then(receiverData => {
        overwriteReceiverRecords(receiverData.receiverRecords);
        overwriteCommunicationHistory(receiverData.history);
        setHistoryItems(receiverData.history);
      })
      .catch(() => {
        // Local confirmed records remain available for the next sync attempt.
      });
  }

  function handleConfirmReceiverDraft(draft, entry) {
    const confirmed = confirmReceiverDraft(draft, entry);
    refreshHistory();
    syncReceiverCloudData();
    return confirmed;
  }

  function handleReceiverPatientFeedback(recordId, feedback) {
    const saved = recordReceiverPatientFeedback(recordId, feedback);
    if (!saved) return null;

    refreshHistory();
    syncReceiverCloudData();
    return saved;
  }

  function handleReceiverCorrection(entry) {
    const saved = appendReceiverCorrection(entry);
    if (saved) {
      setReceiverCorrections(loadReceiverCorrections());
    }
    return saved;
  }

  function handleForgetCorrectionMemory(token) {
    const result = disableWorkspaceCorrectionMemoryToken(receiverCorrections, {
      workspaceId: personalImageRuntime.identity.workspaceId,
      token
    });
    if (!result.changed) return false;

    overwriteReceiverCorrections(result.items);
    setReceiverCorrections(loadReceiverCorrections());
    return true;
  }

  function handleMissingTokens(entry) {
    const next = recordMissingTokens(entry);
    setMissingTokenRecords(next);
    return next;
  }

  function handleReviewMissingToken(recordId, review) {
    const updated = reviewMissingToken(recordId, review);
    if (!updated) {
      return null;
    }

    setMissingTokenRecords(loadMissingTokens());
    return updated;
  }

  async function handleSearchMissingTokensOnline(recordIds) {
    const selectedRecords = missingTokenRecords.filter(record =>
      recordIds.includes(record.id)
    );
    const results = await API.searchCommunicationPictograms(
      selectedRecords.map(record => record.normalizedToken)
    );
    const suggestionsByToken = new Map();
    let foundCount = 0;
    let candidateCount = 0;

    results.forEach(result => {
      const pictogram = normalizeRuntimePictogram(result.pictogram);
      const normalizedToken = normalizeMissingTokenText(result.token);
      if (!normalizedToken || !pictogram) return;

      suggestionsByToken.set(
        normalizedToken,
        normalizeMissingTokenSuggestions([
          ...(suggestionsByToken.get(normalizedToken) || []),
          pictogram
        ])
      );
    });

    selectedRecords.forEach(record => {
      const suggestions =
        suggestionsByToken.get(
          normalizeMissingTokenText(record.normalizedToken)
        ) || [];
      if (!suggestions.length) return;

      const updated = reviewMissingToken(record.id, {
        status: 'suggested',
        suggestedPictogramId: suggestions[0].id,
        suggestedPictogram: suggestions[0],
        suggestedPictograms: suggestions,
        source: 'online'
      });
      if (updated) {
        foundCount += 1;
        candidateCount += suggestions.length;
      }
    });
    setMissingTokenRecords(loadMissingTokens());
    return { foundCount, candidateCount };
  }

  function handleNewConversation() {
    const nextSession = resetConversationSession();
    if (speechIsListening) {
      stopSpeechListening();
    }
    onCancelSpeech();
    setConversationSession(nextSession);
    setConfirmingNewConversation(false);
    setSessionNotice(copy.newConversationStarted);
    onApplyOutput([]);
  }

  function handleConversationScene(sceneId) {
    const nextScene =
      conversationSession && conversationSession.scene === sceneId
        ? null
        : sceneId;
    const nextSession = setConversationScene(nextScene);
    if (!nextSession) return;

    setConversationSession(nextSession);
    const selected = CONVERSATION_SCENES.find(
      scene => scene.id === nextSession.scene
    );
    setSessionNotice(
      selected
        ? `${copy.conversationScene}：${selected.label}`
        : copy.conversationSceneCleared
    );
  }

  function handleEmergencyConfirm(entry) {
    appendCommunicationHistory(entry);
    refreshHistory();
  }

  function handleManagedSavedPhrasesChange(nextSavedPhrases) {
    overwriteCommunicationSavedPhrases(nextSavedPhrases);
    const normalizedSavedPhrases = loadCommunicationSavedPhrases();
    setSavedPhrases(normalizedSavedPhrases);
    persistCommunicationSupportSettings(
      normalizedSavedPhrases,
      latestHistoryRef.current
    );
  }

  function handleSavedPhraseUsed(item) {
    if (!item || !item.id) return;
    const result = markCommunicationSavedPhraseUsed(savedPhrases, item.id);
    if (result.changed) handleManagedSavedPhrasesChange(result.items);
  }

  function handleManagedHistoryChange(nextHistory) {
    const previousHistory = latestHistoryRef.current;
    overwriteCommunicationHistory(nextHistory);
    const normalizedHistory = loadCommunicationHistory();
    const remainingIds = new Set(
      normalizedHistory.map(entry => entry.id).filter(Boolean)
    );
    const receiverRecords = loadReceiverRecords();
    const deletedReceiverIds = receiverRecords
      .filter(
        entry =>
          entry.recordStatus === 'confirmed' && !remainingIds.has(entry.id)
      )
      .map(entry => entry.id);
    if (deletedReceiverIds.length) {
      overwriteReceiverRecords(
        receiverRecords.filter(entry => !deletedReceiverIds.includes(entry.id))
      );
    }
    setHistoryItems(normalizedHistory);
    const deleteAll =
      previousHistory.length > 0 && normalizedHistory.length === 0;
    if (isLogged && (deleteAll || deletedReceiverIds.length)) {
      API.deleteConfirmedReceiverRecords(deletedReceiverIds, {
        deleteAll
      }).catch(() => {
        // Local deletion remains applied; the account tombstone can retry.
      });
    }
    persistCommunicationSupportSettings(
      latestSavedRef.current,
      normalizedHistory
    );
  }

  function refreshPersonalImages() {
    const nextPreferences = loadPersonalImagePreferences();
    setPersonalImagePreferences(nextPreferences);
    onApplyOutput(output);
    return nextPreferences;
  }

  function handlePersonalImageSave(entry) {
    try {
      const saved = savePersonalImagePreference(entry);
      if (!saved) return false;
      refreshPersonalImages();
      return true;
    } catch (error) {
      return false;
    }
  }

  function handlePersonalImageRemove(tileId, boardId) {
    try {
      const removed = removePersonalImagePreference(tileId, { boardId });
      if (!removed) return false;
      refreshPersonalImages();
      return true;
    } catch (error) {
      return false;
    }
  }

  function handleCreatePersonalBoard(name) {
    try {
      const result = createPersonalCommunicationBoard(
        boards.map(board => createBoardDTO(board)),
        {
          id: `${PERSONAL_COMMUNICATION_BOARD_ID_PREFIX}${shortid.generate()}`,
          name
        }
      );
      const nativeBoard = boardDTOToCboardBoard(result.board);
      return onCreateCommunicationBoard(nativeBoard);
    } catch (error) {
      return false;
    }
  }

  function handleCuratedBoardSave(boardDto) {
    try {
      const sourceBoard = boards.find(board => board.id === boardDto.id);
      if (!sourceBoard) return false;
      onUpdateCommunicationBoard(boardDTOToCboardBoard(boardDto, sourceBoard));
      return true;
    } catch (error) {
      return false;
    }
  }

  async function handleExportDeviceData() {
    const {
      localDeviceDataExportAdapter
    } = await import('../../Settings/Export/PictureLibraryArchive.helpers');
    const stats = await localDeviceDataExportAdapter({ boards });
    return {
      ok: true,
      message:
        `完整本机备份已导出：${stats.pictogramCount} 张图片，` +
        `${stats.expressionCount} 条沟通记录。`
    };
  }

  function handleClearPrivatePictograms() {
    const plan = clearPrivatePictograms();
    refreshPersonalImages();
    setMissingTokenRecords(loadMissingTokens());
    return {
      ok: true,
      message:
        `已清除 ${plan.removedPreferenceCount} 项个人换图和 ` +
        `${plan.removedRuntimePictogramCount} 项本机补图；` +
        '公开图库、历史和云端数据均已保留。'
    };
  }

  function handleClearAllLocalData() {
    return browserLocalDeviceDataPort.clearAllLocalData();
  }

  async function handlePreferencesChange(nextPreferences) {
    const savedPreferences = saveCommunicationPreferences(nextPreferences);
    const nextDisplaySettings = {
      ...displaySettings,
      fontSize: COMMUNICATION_FONT_TO_CBOARD[savedPreferences.fontSize],
      uiSize: COMMUNICATION_GRID_TO_CBOARD[savedPreferences.gridColumns]
    };
    const speechChanged =
      Number(speechSettings.rate) !== savedPreferences.speechRate;
    const displayChanged =
      displaySettings.fontSize !== nextDisplaySettings.fontSize ||
      displaySettings.uiSize !== nextDisplaySettings.uiSize;

    setPreferences(savedPreferences);
    if (speechChanged) onChangeSpeechRate(savedPreferences.speechRate);
    if (displayChanged) onChangeDisplaySettings(nextDisplaySettings);

    if (isLogged && (speechChanged || displayChanged)) {
      try {
        await API.updateSettings({
          display: nextDisplaySettings,
          speech: {
            ...speechSettings,
            rate: savedPreferences.speechRate
          }
        });
      } catch (error) {
        // Redux and local preferences remain available offline.
      }
    }
  }

  function handleCompleteOnboarding() {
    setShowOnboarding(false);
    handlePreferencesChange({
      ...preferences,
      onboardingComplete: true
    });
  }

  function handleReplayOnboarding() {
    setShowAccessibility(false);
    setShowOnboarding(true);
  }

  function getConversationContext() {
    try {
      return loadConversationContext({ maxTurns: 6 });
    } catch (error) {
      return { turns: [] };
    }
  }

  function toggleExpressionPanel() {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    setShowReceiver(false);
    setIsExpanded(true);
  }

  function openReceiverDialog() {
    setIsExpanded(false);
    setShowReceiver(true);
  }

  return (
    <section
      className={`CommunicationSupportPanel CommunicationSupportPanel--grid-${
        preferences.gridColumns
      }`}
    >
      <div className="CommunicationSupportPanel__header">
        <div>
          <h3 className="CommunicationSupportPanel__title">{copy.title}</h3>
          <p className="CommunicationSupportPanel__subtitle">{copy.subtitle}</p>
        </div>
        <div className="CommunicationSupportPanel__primaryActions">
          <PatientActionButton
            action={PATIENT_ACTION_IDS.express}
            color="primary"
            variant={isExpanded ? 'contained' : 'outlined'}
            onClick={toggleExpressionPanel}
            aria-expanded={isExpanded}
            aria-controls="communication-expression-panel"
            label={isExpanded ? copy.collapse : copy.expressTab}
            ariaLabel={isExpanded ? copy.collapseExpress : copy.expressTab}
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.receive}
            color="primary"
            variant="outlined"
            onClick={openReceiverDialog}
            label={copy.receiveTab}
            ariaLabel={copy.receiverDialogTitle}
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.emergency}
            color="secondary"
            variant="contained"
            onClick={() => setShowEmergency(true)}
            label={copy.emergency}
            ariaLabel={copy.emergency}
          />
          <Button
            color="primary"
            size="small"
            variant="outlined"
            onClick={() => setShowCaregiverTools(!showCaregiverTools)}
            aria-expanded={showCaregiverTools}
            aria-controls="communication-caregiver-tools"
          >
            {copy.caregiverTools}
          </Button>
        </div>
      </div>

      <div
        id="communication-caregiver-tools"
        className="CommunicationSupportPanel__caregiverTools"
        hidden={!showCaregiverTools}
      >
        <CommunicationNetworkStatusNotice />
        <span className="CommunicationSupportPanel__caregiverToolsLabel">
          照护者设置
        </span>
        <Button
          color="primary"
          size="small"
          variant="outlined"
          onClick={() => setShowAccessibility(true)}
        >
          {copy.accessibility}
        </Button>
        {!demoMode && (
          <Button
            color="primary"
            size="small"
            variant="outlined"
            onClick={() => setShowManagement(true)}
          >
            {copy.management}
          </Button>
        )}
      </div>

      {isExpanded && (
        <div id="communication-expression-panel">
          <div className="CommunicationSupportPanel__toolbar">
            <strong>{copy.expressTab}</strong>
          </div>
          {sessionNotice && (
            <p className="CommunicationSupportPanel__sessionNotice">
              {sessionNotice}
            </p>
          )}

          <ExpressionLoopPanel
            key={`express-${
              conversationSession ? conversationSession.id : 'loading'
            }`}
            output={communicationOutput}
            boards={expressionBoardDtos}
            activeBoardId={activeBoardId}
            pictogramOrdering={pictogramOrdering}
            savedPhrases={savedPhrases}
            conversationContext={getConversationContext()}
            aiAvailable={isLogged}
            onGenerateAiSentences={request =>
              API.generateCommunicationSentences(request)
            }
            onApplyOutput={onApplyOutput}
            onPictogramUsed={onPictogramUsed}
            onSpeak={onSpeak}
            onCancelSpeech={onCancelSpeech}
            onSavePhrase={handleSavePhrase}
            onAppendHistory={handleAppendExpressionHistory}
            onSaveCandidateFeedbackDraft={
              handleSaveExpressionCandidateFeedbackDraft
            }
            onDiscardCandidateFeedbackDraft={
              handleDiscardExpressionCandidateFeedbackDraft
            }
            candidateFeedbackDrafts={loadExpressionCandidateFeedbackDrafts()}
            conversationSessionId={
              conversationSession ? conversationSession.id : ''
            }
            onUseSavedPhrase={handleSavedPhraseUsed}
            onShareExpression={sentence =>
              browserCommunicationSharePort.shareExpressionText(sentence)
            }
            candidateAutoplayDelaySeconds={
              preferences.candidateAutoplayDelaySeconds
            }
            candidateFeedbackSyncAvailable={isLogged}
            copyOverrides={copy}
          />
        </div>
      )}
      <CommunicationReceiverDialog
        open={showReceiver}
        onClose={() => setShowReceiver(false)}
        title={copy.receiverDialogTitle}
        subtitle={copy.receiverDialogSubtitle}
        closeLabel={copy.returnToBoard}
      >
        {showReceiver && (
          <div>
            <CommunicationNetworkStatusNotice />
            <div className="CommunicationSupportPanel__receiverToolbar">
              <div
                className="CommunicationSupportPanel__sceneControl"
                role="group"
                aria-label={copy.conversationScene}
              >
                <span className="CommunicationSupportPanel__sceneStatus">
                  {copy.conversationScene}：
                  {
                    (
                      CONVERSATION_SCENES.find(
                        scene =>
                          conversationSession &&
                          scene.id === conversationSession.scene
                      ) || { label: copy.noConversationScene }
                    ).label
                  }
                </span>
                {CONVERSATION_SCENES.map(scene => {
                  const selected =
                    conversationSession &&
                    conversationSession.scene === scene.id;
                  return (
                    <Button
                      key={scene.id}
                      color="primary"
                      size="small"
                      variant={selected ? 'contained' : 'outlined'}
                      aria-pressed={Boolean(selected)}
                      onClick={() => handleConversationScene(scene.id)}
                    >
                      {scene.icon} {scene.label}
                    </Button>
                  );
                })}
              </div>
              {!confirmingNewConversation ? (
                <Button
                  color="primary"
                  size="small"
                  variant="outlined"
                  onClick={() => setConfirmingNewConversation(true)}
                >
                  {copy.newConversation}
                </Button>
              ) : (
                <div
                  className="CommunicationSupportPanel__newConversationConfirm"
                  role="alert"
                >
                  <span>{copy.newConversationQuestion}</span>
                  <Button
                    color="primary"
                    size="small"
                    variant="contained"
                    onClick={handleNewConversation}
                  >
                    {copy.confirmNewConversation}
                  </Button>
                  <Button
                    color="primary"
                    size="small"
                    variant="outlined"
                    onClick={() => setConfirmingNewConversation(false)}
                  >
                    {copy.cancelNewConversation}
                  </Button>
                </div>
              )}
            </div>
            {sessionNotice && (
              <p className="CommunicationSupportPanel__sessionNotice">
                {sessionNotice}
              </p>
            )}
            <ReceiverLoopPanel
              key={`receive-${
                conversationSession ? conversationSession.id : 'loading'
              }`}
              boards={communicationBoards}
              intl={intl}
              onApplyOutput={onApplyOutput}
              onJumpBoard={onJumpBoard}
              initialRecord={loadResumableReceiverRecord()}
              onCreateDraft={handleCreateReceiverDraft}
              onUpdateDraft={handleUpdateReceiverDraft}
              onConfirmDraft={handleConfirmReceiverDraft}
              onDiscardResumableRecord={discardResumableReceiverRecord}
              onRecordPatientFeedback={handleReceiverPatientFeedback}
              onRecordCorrection={handleReceiverCorrection}
              onRecordMissingTokens={handleMissingTokens}
              onAppendHistory={handleAppendReceiveHistory}
              onReviewMissingToken={handleReviewMissingToken}
              onlineSearchAvailable
              onSearchMissingTokensOnline={handleSearchMissingTokensOnline}
              aiImageGenerationAvailable={isLogged}
              onGenerateMissingTokenPictogram={request =>
                API.generateCommunicationPictogram(request)
              }
              onShareReceiver={(items, options) =>
                browserCommunicationSharePort.shareReceiverImage(items, options)
              }
              missingTokenRecords={missingTokenRecords}
              correctionMemory={correctionMemory}
              historyItems={historyItems}
              speech={speech}
              onSpeak={onSpeak}
              onCancelSpeech={onCancelSpeech}
              aiAvailable={isLogged}
              onAiResegment={request => API.resegmentCommunicationText(request)}
              dialectNormalizationAvailable={isLogged}
              onNormalizeDialectText={request =>
                API.normalizeCommunicationDialectText(request)
              }
              dialectAudioRecognitionAvailable={isLogged}
              onRecognizeDialectAudio={file =>
                API.recognizeCommunicationDialectAudio(file)
              }
              imageOcrAvailable={isLogged}
              onRecognizeImageText={file =>
                API.recognizeCommunicationImageText(file)
              }
              copyOverrides={copy}
            />
          </div>
        )}
      </CommunicationReceiverDialog>
      <EmergencyCommunicationDialog
        open={showEmergency}
        onClose={() => setShowEmergency(false)}
        onSpeak={onSpeak}
        onConfirm={handleEmergencyConfirm}
        boards={communicationBoards}
      />
      {!demoMode && (
        <CommunicationManagementDialog
          open={showManagement}
          onClose={() => setShowManagement(false)}
          boards={communicationBoards}
          editableBoards={boards}
          intl={intl}
          savedPhrases={savedPhrases}
          historyItems={historyItems}
          personalImagePreferences={personalImagePreferences}
          correctionMemory={correctionMemory}
          receiverCorrections={receiverCorrections}
          candidateFeedbackSyncAvailable={isLogged}
          onSavedPhrasesChange={handleManagedSavedPhrasesChange}
          onHistoryChange={handleManagedHistoryChange}
          onPersonalImageSave={handlePersonalImageSave}
          onPersonalImageRemove={handlePersonalImageRemove}
          onCuratedBoardSave={handleCuratedBoardSave}
          onCreatePersonalBoard={handleCreatePersonalBoard}
          onForgetCorrectionMemory={handleForgetCorrectionMemory}
          onReceiverCorrection={handleReceiverCorrection}
          onExportDeviceData={handleExportDeviceData}
          onClearPrivatePictograms={handleClearPrivatePictograms}
          onClearAllLocalData={handleClearAllLocalData}
          onApplyOutput={onApplyOutput}
          onSpeak={onSpeak}
        />
      )}
      <CommunicationAccessibilityDialog
        open={showAccessibility}
        onClose={() => setShowAccessibility(false)}
        onReplayOnboarding={handleReplayOnboarding}
        boards={boards}
        intl={intl}
        value={preferences}
        onChange={handlePreferencesChange}
      />
      <CommunicationOnboardingDialog
        open={showOnboarding}
        onComplete={handleCompleteOnboarding}
      />
    </section>
  );
}

CommunicationSupportPanel.propTypes = {
  boards: PropTypes.arrayOf(PropTypes.object).isRequired,
  output: PropTypes.arrayOf(PropTypes.object).isRequired,
  activeBoardId: PropTypes.string,
  intl: PropTypes.object,
  isLogged: PropTypes.bool,
  demoMode: PropTypes.bool,
  speechSettings: PropTypes.object,
  displaySettings: PropTypes.object,
  pictogramOrdering: PropTypes.object.isRequired,
  onPictogramUsed: PropTypes.func.isRequired,
  onCreateCommunicationBoard: PropTypes.func,
  onUpdateCommunicationBoard: PropTypes.func,
  onChangeSpeechRate: PropTypes.func.isRequired,
  onChangeDisplaySettings: PropTypes.func.isRequired,
  onApplyOutput: PropTypes.func.isRequired,
  onJumpBoard: PropTypes.func.isRequired,
  onSpeak: PropTypes.func.isRequired,
  onCancelSpeech: PropTypes.func.isRequired,
  copyOverrides: PropTypes.object,
  initialMode: PropTypes.oneOf(['express', 'receive']),
  initiallyExpanded: PropTypes.bool
};

CommunicationSupportPanel.defaultProps = {
  activeBoardId: null,
  intl: null,
  isLogged: false,
  demoMode: false,
  speechSettings: { rate: 1 },
  displaySettings: {
    fontSize: DISPLAY_SIZE_STANDARD,
    uiSize: DISPLAY_SIZE_STANDARD
  },
  copyOverrides: null,
  onCreateCommunicationBoard: () => false,
  onUpdateCommunicationBoard: () => false,
  initialMode: 'express',
  initiallyExpanded: false
};
