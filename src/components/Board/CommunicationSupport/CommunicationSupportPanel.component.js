import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@material-ui/core/Button';
import API from '../../../api';
import {
  createCommunicationSupportSettingsPatch,
  getCommunicationSupportSettings
} from '../../../common/communicationSupport/settingsAdapter';
import { generateCommunicationCandidateSentences } from '../../../common/communicationSupport/phraseSuggestions';
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
  speechUnavailable: '当前浏览器无法完成语音播报，候选句仍可继续使用。',
  generating: '正在生成候选句...',
  replayAll: '全部重播',
  savePhrase: '收藏此句',
  saveHistory: '记录本轮',
  savedPhrasesTitle: '常用短句',
  savedPhrasesHint: '本地保存最近 20 条',
  reuse: '重用',
  noSavedPhrases: '还没有收藏的短句。',
  receiveSectionTitle: '文字转图片',
  receiveHint: '使用当前已加载 boards 内的 tiles 做匹配',
  listening: '聆听中...',
  receivePlaceholder: '例如：我想喝水、我要去厕所、我不舒服',
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

function stopSpeaking() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function speakSentence(text) {
  return new Promise(resolve => {
    if (
      typeof window === 'undefined' ||
      !window.speechSynthesis ||
      typeof window.SpeechSynthesisUtterance === 'undefined'
    ) {
      resolve(false);
      return;
    }

    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.95;
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

function SavedPhraseRow({ item, onApply, reuseLabel }) {
  return (
    <div className="CommunicationSupportPanel__savedRow">
      <div className="CommunicationSupportPanel__savedContent">
        <div className="CommunicationSupportPanel__savedSentence">
          {item.sentence}
        </div>
        <div className="CommunicationSupportPanel__meta">
          {item.output.map(outputItem => outputItem.label).join(' / ')}
        </div>
      </div>
      <Button color="primary" size="small" onClick={() => onApply(item)}>
        {reuseLabel}
      </Button>
    </div>
  );
}

SavedPhraseRow.propTypes = {
  item: PropTypes.shape({
    sentence: PropTypes.string.isRequired,
    output: PropTypes.arrayOf(PropTypes.object).isRequired
  }).isRequired,
  onApply: PropTypes.func.isRequired,
  reuseLabel: PropTypes.string.isRequired
};

export default function CommunicationSupportPanel({
  boards,
  output,
  activeBoardId,
  onApplyOutput,
  onJumpBoard,
  intl,
  isLogged,
  copyOverrides,
  initialMode
}) {
  const copy = { ...DEFAULT_COPY, ...(copyOverrides || {}) };
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeMode, setActiveMode] = useState(initialMode);
  const [candidatePhase, setCandidatePhase] = useState('idle');
  const [candidateSentences, setCandidateSentences] = useState([]);
  const [playIndex, setPlayIndex] = useState(0);
  const [savedPhrases, setSavedPhrases] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [speechAvailable, setSpeechAvailable] = useState(true);

  const speech = useBrowserSpeechRecognition();
  const playRunRef = useRef(0);
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

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

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

  const draftCandidateSentences = useMemo(
    () => {
      return generateCommunicationCandidateSentences(
        (output || []).map(item => item.label).filter(Boolean)
      );
    },
    [output]
  );

  async function playCandidates(startIndex, sentences = candidateSentences) {
    if (!sentences.length) {
      return;
    }

    const runId = playRunRef.current + 1;
    playRunRef.current = runId;
    setCandidatePhase('playing');
    setSpeechAvailable(true);

    for (let index = startIndex; index < sentences.length; index += 1) {
      if (playRunRef.current !== runId) {
        return;
      }

      setPlayIndex(index);
      const success = await speakSentence(sentences[index]);

      if (playRunRef.current !== runId) {
        return;
      }

      if (!success) {
        setSpeechAvailable(false);
      }
    }

    if (playRunRef.current === runId) {
      setCandidatePhase('done');
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

  function handlePrepareCandidates() {
    if (!draftCandidateSentences.length) {
      return;
    }

    setCandidateSentences(draftCandidateSentences);
    setPlayIndex(0);
    setCandidatePhase('generating');

    window.setTimeout(() => {
      const nextSentences = generateCommunicationCandidateSentences(
        (output || []).map(item => item.label).filter(Boolean)
      );
      setCandidateSentences(nextSentences);
      playCandidates(0, nextSentences);
    }, 50);
  }

  function handleStopPlayback() {
    playRunRef.current += 1;
    stopSpeaking();
    setCandidatePhase('done');
  }

  function handleReplayAll() {
    playCandidates(0);
  }

  function handlePlayOne(index) {
    setPlayIndex(index);
    playCandidates(index);
  }

  function handleSavePhrase() {
    const sentence = candidateSentences[playIndex] || candidateSentences[0];

    if (!sentence) {
      return;
    }

    saveCommunicationPhrase({
      sentence,
      output
    });
    refreshSavedPhrases();
  }

  function handleDoneExpression() {
    const sentence = candidateSentences[playIndex] || candidateSentences[0];

    appendCommunicationHistory({
      direction: 'express',
      sentence,
      labels: output.map(item => item.label).filter(Boolean)
    });
    refreshHistory();
  }

  function handleApplySavedPhrase(item) {
    onApplyOutput(item.output);
    setActiveMode('express');
    setCandidateSentences(
      generateCommunicationCandidateSentences(
        item.output.map(entry => entry.label)
      )
    );
    setCandidatePhase('done');
    setPlayIndex(0);
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
            <div className="CommunicationSupportPanel__content">
              <div className="CommunicationSupportPanel__section">
                <div className="CommunicationSupportPanel__sectionHeader">
                  <h4>{copy.expressSectionTitle}</h4>
                  <span className="CommunicationSupportPanel__hint">
                    {copy.currentBoard}：{activeBoardId || copy.noBoard}
                  </span>
                </div>
                <div className="CommunicationSupportPanel__resultMeta">
                  {copy.currentOutput}：
                  {output.map(item => item.label).join(' / ') ||
                    copy.selectSymbolsFirst}
                </div>
                <div className="CommunicationSupportPanel__actions">
                  <Button
                    color="primary"
                    variant="contained"
                    onClick={handlePrepareCandidates}
                    disabled={!output.length}
                  >
                    {copy.generateAndSpeak}
                  </Button>
                  <Button
                    color="primary"
                    variant="outlined"
                    onClick={handleStopPlayback}
                    disabled={candidatePhase !== 'playing'}
                  >
                    {copy.stopSpeech}
                  </Button>
                </div>
                {!speechAvailable && (
                  <div className="CommunicationSupportPanel__missing">
                    {copy.speechUnavailable}
                  </div>
                )}
                {candidatePhase === 'generating' && (
                  <div className="CommunicationSupportPanel__empty">
                    {copy.generating}
                  </div>
                )}
                <div className="CommunicationSupportPanel__candidates">
                  {(candidateSentences.length
                    ? candidateSentences
                    : draftCandidateSentences
                  ).map((sentence, index) => (
                    <button
                      key={sentence}
                      className={
                        index === playIndex &&
                        (candidatePhase === 'playing' ||
                          candidatePhase === 'done')
                          ? 'CommunicationSupportPanel__candidate CommunicationSupportPanel__candidate--active'
                          : 'CommunicationSupportPanel__candidate'
                      }
                      onClick={() => handlePlayOne(index)}
                    >
                      {sentence}
                    </button>
                  ))}
                </div>
                <div className="CommunicationSupportPanel__actions">
                  <Button
                    color="primary"
                    variant="outlined"
                    onClick={handleReplayAll}
                    disabled={!candidateSentences.length}
                  >
                    {copy.replayAll}
                  </Button>
                  <Button
                    color="primary"
                    variant="outlined"
                    onClick={handleSavePhrase}
                    disabled={!candidateSentences.length}
                  >
                    {copy.savePhrase}
                  </Button>
                  <Button
                    color="primary"
                    variant="outlined"
                    onClick={handleDoneExpression}
                    disabled={!candidateSentences.length}
                  >
                    {copy.saveHistory}
                  </Button>
                </div>
              </div>

              <div className="CommunicationSupportPanel__section">
                <div className="CommunicationSupportPanel__sectionHeader">
                  <h4>{copy.savedPhrasesTitle}</h4>
                  <span className="CommunicationSupportPanel__hint">
                    {copy.savedPhrasesHint}
                  </span>
                </div>
                <div className="CommunicationSupportPanel__savedList">
                  {savedPhrases.length ? (
                    savedPhrases.map(item => (
                      <SavedPhraseRow
                        key={item.sentence}
                        item={item}
                        onApply={handleApplySavedPhrase}
                        reuseLabel={copy.reuse}
                      />
                    ))
                  ) : (
                    <div className="CommunicationSupportPanel__empty">
                      {copy.noSavedPhrases}
                    </div>
                  )}
                </div>
              </div>
            </div>
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
