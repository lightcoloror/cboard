import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@material-ui/core/Button';
import API from '../../../api';
import {
  createCommunicationSupportSettingsPatch,
  getCommunicationSupportSettings
} from '../../../common/communicationSupport/settingsAdapter';
import {
  appendCommunicationHistory,
  buildCommunicationSettingsPayload,
  loadCommunicationHistory,
  loadCommunicationSavedPhrases,
  mergeCommunicationSettings,
  overwriteCommunicationSettings,
  saveCommunicationPhrase
} from '../../../common/communicationSupport/localData';
import { useBrowserSpeechRecognition } from '../../../common/communicationSupport/browserSpeech';
import ExpressionLoopPanel from './ExpressionLoopPanel.component';
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
  copyOverrides,
  initialMode
}) {
  const copy = { ...DEFAULT_COPY, ...(copyOverrides || {}) };
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeMode, setActiveMode] = useState(initialMode);
  const [savedPhrases, setSavedPhrases] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);

  const speech = useBrowserSpeechRecognition();
  const speechIsListening = speech.isListening;
  const stopSpeechListening = speech.stopListening;

  useEffect(
    () => {
      if ((!isExpanded || activeMode !== 'receive') && speechIsListening) {
        stopSpeechListening();
      }
    },
    [activeMode, isExpanded, speechIsListening, stopSpeechListening]
  );
  const latestSavedRef = useRef([]);
  const latestHistoryRef = useRef([]);

  useEffect(() => {
    setSavedPhrases(loadCommunicationSavedPhrases());
    setHistoryItems(loadCommunicationHistory());
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
      setActiveMode(initialMode);
    },
    [initialMode]
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
          await API.updateSettings(
            createCommunicationSupportSettingsPatch(mergedSettings)
          );
        } catch (error) {
          // Local fallback is already loaded above.
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
    const payload = buildCommunicationSettingsPayload(
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
    appendCommunicationHistory(entry);
    refreshHistory();
  }

  function handleAppendReceiveHistory(entry) {
    appendCommunicationHistory(entry);
    refreshHistory();
  }

  return (
    <section className="CommunicationSupportPanel">
      <div className="CommunicationSupportPanel__header">
        <div>
          <h3 className="CommunicationSupportPanel__title">{copy.title}</h3>
          <p className="CommunicationSupportPanel__subtitle">{copy.subtitle}</p>
        </div>
        <Button
          color="primary"
          size="small"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? copy.collapse : copy.expand}
        </Button>
      </div>

      {isExpanded && (
        <div>
          <div className="CommunicationSupportPanel__toolbar">
            <div className="CommunicationSupportPanel__modeTabs">
              <button
                className={
                  activeMode === 'express'
                    ? 'CommunicationSupportPanel__tab CommunicationSupportPanel__tab--active'
                    : 'CommunicationSupportPanel__tab'
                }
                onClick={() => setActiveMode('express')}
              >
                {copy.expressTab}
              </button>
              <button
                className={
                  activeMode === 'receive'
                    ? 'CommunicationSupportPanel__tab CommunicationSupportPanel__tab--active'
                    : 'CommunicationSupportPanel__tab'
                }
                onClick={() => setActiveMode('receive')}
              >
                {copy.receiveTab}
              </button>
            </div>
          </div>

          {activeMode === 'express' && (
            <ExpressionLoopPanel
              output={output}
              activeBoardId={activeBoardId}
              savedPhrases={savedPhrases}
              onApplyOutput={onApplyOutput}
              onSpeak={onSpeak}
              onCancelSpeech={onCancelSpeech}
              onSavePhrase={handleSavePhrase}
              onAppendHistory={handleAppendExpressionHistory}
              copyOverrides={copy}
            />
          )}

          {activeMode === 'receive' && (
            <ReceiverLoopPanel
              boards={boards}
              intl={intl}
              onApplyOutput={onApplyOutput}
              onJumpBoard={onJumpBoard}
              onAppendHistory={handleAppendReceiveHistory}
              historyItems={historyItems}
              speech={speech}
              copyOverrides={copy}
            />
          )}
        </div>
      )}
    </section>
  );
}

CommunicationSupportPanel.propTypes = {
  boards: PropTypes.arrayOf(PropTypes.object).isRequired,
  output: PropTypes.arrayOf(PropTypes.object).isRequired,
  activeBoardId: PropTypes.string,
  intl: PropTypes.object,
  isLogged: PropTypes.bool,
  onApplyOutput: PropTypes.func.isRequired,
  onJumpBoard: PropTypes.func.isRequired,
  onSpeak: PropTypes.func.isRequired,
  onCancelSpeech: PropTypes.func.isRequired,
  copyOverrides: PropTypes.object,
  initialMode: PropTypes.oneOf(['express', 'receive'])
};

CommunicationSupportPanel.defaultProps = {
  activeBoardId: null,
  intl: null,
  isLogged: false,
  copyOverrides: null,
  initialMode: 'express'
};
