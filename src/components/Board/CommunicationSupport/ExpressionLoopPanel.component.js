import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import PropTypes from 'prop-types';
import Button from '@material-ui/core/Button';
import { createCandidateAutoplayController } from '../../../common/communicationSupport/candidateAutoplay';
import {
  CANDIDATE_FEEDBACK,
  findExpressionCandidateFeedbackDraft,
  normalizeExpressionCandidates,
  toggleExpressionCandidateFeedback
} from '../../../common/communicationSupport/candidateFeedback';
import {
  applyCommunicationAiSentenceResponse,
  buildCommunicationAiSentenceRequest
} from '../../../common/communicationSupport/communicationAi';
import {
  COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES,
  getCommunicationEnhancementLimitScope
} from '../../../common/communicationSupport/communicationEnhancementError';
import {
  buildExpressionHistoryEntry,
  buildExpressionLoopState,
  buildExpressionLoopStateFromSavedPhrase,
  buildExpressionOutputSignature,
  buildExpressionSavedPhraseEntry,
  moveExpressionOutputItem,
  persistExpressionHistoryEntry,
  removeExpressionOutputItem,
  selectExpressionCandidate
} from '../../../common/communicationSupport/expressionPipeline';
import {
  PICTOGRAM_SUGGESTION_MODES,
  buildExpressionPictogramSuggestions
} from '../../../common/communicationSupport/pictogramSuggestions';
import { PATIENT_ACTION_IDS } from '../../../common/communicationSupport/patientActionLanguage';
import CommunicationPlaybackDialog from './CommunicationPlaybackDialog.component';
import PatientActionButton from './PatientActionButton.component';

const DEFAULT_COPY = {
  expressSectionTitle: '候选句播报',
  currentBoard: '当前板',
  noBoard: '未选择',
  currentOutput: '当前输出',
  adjustOutput: '调整已选图片顺序',
  moveLeft: '左移',
  moveRight: '右移',
  removeSelected: '删除',
  selectSymbolsFirst: '请先选图',
  generateAndSpeak: '立即全部播报',
  stopSpeech: '停止播报',
  speechUnavailable: '当前语音引擎无法完成播报，候选句仍可继续使用。',
  replayAll: '全部重播',
  autoplayEnabled: '秒无操作后自动播报；触摸或滚动可取消。',
  autoplayDisabled: '自动播报已关闭，可手动选择一句或全部播报。',
  savePhrase: '收藏此句',
  phraseSaved: '已收藏',
  confirmExpression: '确认此句',
  expressionConfirmed: '已确认',
  expressionSaveFailed: '表达未能保存，图片和候选句已保留，请重试。',
  shareExpression: '分享此句',
  sharingExpression: '正在准备分享…',
  savedPhrasesTitle: '常用短句',
  savedPhrasesHint: '本地保存最近 20 条',
  quickPlay: '一键播报',
  reuse: '重用',
  playbackSpeaking: '正在播报',
  playbackReady: '可重播或完成',
  playbackReplay: '重播',
  playbackDone: '完成',
  noSavedPhrases: '还没有收藏的短句。',
  aiCandidates: 'AI 优化候选句',
  aiGenerating: 'AI 生成中...',
  aiLoginRequired: '登录后可使用 AI 增强，当前继续使用本地规则。',
  aiUnavailable: '服务端尚未配置 AI，当前继续使用本地规则。',
  aiFailed: 'AI 服务暂时不可用，当前继续使用本地规则。',
  aiRateLimited: 'AI 增强请求较多，请稍后重试；当前继续使用本地候选句。',
  aiMonthlyQuota: '本月 AI 增强额度已用完，当前继续使用本地候选句。',
  aiApplied: '已生成 AI 候选句，仍可切换或使用本地候选。',
  candidateFeedbackUp: '有帮助',
  candidateFeedbackDown: '不符合',
  candidateFeedbackHint: '评价不会打断朗读；反馈会和这次表达一起保存。',
  candidateFeedbackSaved: '反馈已保存，并会纳入下次云同步。',
  candidateFeedbackLocal: '反馈已保存在本机，登录后可同步。',
  candidateFeedbackCancelled: '已取消这条反馈。',
  candidateFeedbackFailed: '反馈未能保存，请稍后重试。',
  recentPictograms: '最近使用',
  nextPictograms: '接下来可能需要',
  pictogramSuggestionsHint: '点一下直接加入当前图片序列'
};

const SPEECH_COMPLETION_TIMEOUT_MS = 12000;

function SavedPhraseRow({ item, onApply, onPlay, playLabel, reuseLabel }) {
  return (
    <div className="CommunicationSupportPanel__savedRow">
      <div className="CommunicationSupportPanel__savedContent">
        <div className="CommunicationSupportPanel__savedImages">
          {item.output
            .slice(0, 4)
            .map((outputItem, index) =>
              outputItem.image ? (
                <img
                  className="CommunicationSupportPanel__savedImage"
                  src={outputItem.image}
                  alt=""
                  key={`${outputItem.id || outputItem.label}-${index}`}
                />
              ) : null
            )}
        </div>
        <div className="CommunicationSupportPanel__savedSentence">
          {item.sentence}
        </div>
        <div className="CommunicationSupportPanel__meta">
          {item.output.map(outputItem => outputItem.label).join(' / ')}
        </div>
      </div>
      <div className="CommunicationSupportPanel__savedActions">
        <Button
          color="primary"
          size="small"
          variant="contained"
          onClick={() => onPlay(item)}
        >
          {playLabel}
        </Button>
        <Button color="primary" size="small" onClick={() => onApply(item)}>
          {reuseLabel}
        </Button>
      </div>
    </div>
  );
}

function getAiFailureMessage(error, copy) {
  const limitScope = getCommunicationEnhancementLimitScope(error);
  if (limitScope === COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.month) {
    return copy.aiMonthlyQuota;
  }
  if (limitScope === COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.minute) {
    return copy.aiRateLimited;
  }
  const status = error && error.response && Number(error.response.status);
  if (status === 401 || status === 403) return copy.aiLoginRequired;
  if (status === 503) return copy.aiUnavailable;
  return copy.aiFailed;
}

SavedPhraseRow.propTypes = {
  item: PropTypes.shape({
    sentence: PropTypes.string.isRequired,
    output: PropTypes.arrayOf(PropTypes.object).isRequired
  }).isRequired,
  onApply: PropTypes.func.isRequired,
  onPlay: PropTypes.func.isRequired,
  playLabel: PropTypes.string.isRequired,
  reuseLabel: PropTypes.string.isRequired
};

export default function ExpressionLoopPanel({
  output,
  boards,
  activeBoardId,
  pictogramOrdering,
  savedPhrases,
  onApplyOutput,
  onPictogramUsed,
  onSpeak,
  onCancelSpeech,
  onSavePhrase,
  onAppendHistory,
  onSaveCandidateFeedbackDraft,
  onDiscardCandidateFeedbackDraft,
  candidateFeedbackDrafts,
  conversationSessionId,
  onUseSavedPhrase,
  onShareExpression,
  conversationContext,
  aiAvailable,
  onGenerateAiSentences,
  candidateAutoplayDelaySeconds,
  candidateFeedbackSyncAvailable,
  copyOverrides
}) {
  const copy = { ...DEFAULT_COPY, ...(copyOverrides || {}) };
  const initialLoopStateRef = useRef(null);
  if (!initialLoopStateRef.current) {
    initialLoopStateRef.current = buildExpressionLoopState(output);
  }
  const initialCandidateFeedbackDraftRef = useRef(undefined);
  if (initialCandidateFeedbackDraftRef.current === undefined) {
    initialCandidateFeedbackDraftRef.current = findExpressionCandidateFeedbackDraft(
      candidateFeedbackDrafts,
      {
        sessionId: conversationSessionId,
        outputSignature: initialLoopStateRef.current.outputSignature,
        candidateSentences: initialLoopStateRef.current.candidateSentences
      }
    );
  }
  const outputSignature = useMemo(
    () => buildExpressionOutputSignature(output),
    [output]
  );
  const pictogramSuggestions = useMemo(
    () =>
      buildExpressionPictogramSuggestions(boards, output, pictogramOrdering, {
        activeBoardId,
        limit: 6
      }),
    [activeBoardId, boards, output, pictogramOrdering]
  );
  const [loopState, setLoopState] = useState(() => initialLoopStateRef.current);
  const [candidatePhase, setCandidatePhase] = useState(() =>
    initialLoopStateRef.current.candidateSentences.length ? 'ready' : 'idle'
  );
  const [speechAvailable, setSpeechAvailable] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [expressionConfirmError, setExpressionConfirmError] = useState('');
  const [isSharingExpression, setIsSharingExpression] = useState(false);
  const [expressionShareNotice, setExpressionShareNotice] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiNotice, setAiNotice] = useState('');
  const [candidateFeedbackEntries, setCandidateFeedbackEntries] = useState(() =>
    normalizeExpressionCandidates(
      initialCandidateFeedbackDraftRef.current
        ? initialCandidateFeedbackDraftRef.current.candidates
        : [],
      initialLoopStateRef.current.candidateSentences
    )
  );
  const [candidateFeedbackNotice, setCandidateFeedbackNotice] = useState('');
  const [playbackPhrase, setPlaybackPhrase] = useState(null);
  const playRunRef = useRef(0);
  const aiRunRef = useRef(0);
  const speechTimeoutsRef = useRef(new Set());
  const previousOutputSignatureRef = useRef(null);
  const previousAutoplayDelayRef = useRef(null);
  const candidateFeedbackDraftIdRef = useRef(
    initialCandidateFeedbackDraftRef.current
      ? initialCandidateFeedbackDraftRef.current.id
      : null
  );
  const playbackActiveRef = useRef(false);
  const loopStateRef = useRef(loopState);
  const autoplayPlayRef = useRef(null);
  const autoplayStopRef = useRef(null);
  const autoplayControllerRef = useRef(null);

  loopStateRef.current = loopState;

  const discardCandidateFeedbackDraft = useCallback(
    () => {
      const draftId = candidateFeedbackDraftIdRef.current;
      if (draftId) onDiscardCandidateFeedbackDraft(draftId);
      candidateFeedbackDraftIdRef.current = null;
    },
    [onDiscardCandidateFeedbackDraft]
  );

  const resetCandidateFeedback = useCallback(
    nextState => {
      discardCandidateFeedbackDraft();
      setCandidateFeedbackEntries(
        normalizeExpressionCandidates([], nextState.candidateSentences)
      );
      setCandidateFeedbackNotice('');
    },
    [discardCandidateFeedbackDraft]
  );

  if (!autoplayControllerRef.current) {
    autoplayControllerRef.current = createCandidateAutoplayController({
      setTimer: (callback, delay) => window.setTimeout(callback, delay),
      clearTimer: timeoutId => window.clearTimeout(timeoutId),
      playCandidates: candidateSentences =>
        autoplayPlayRef.current(candidateSentences),
      stopPlayback: () => autoplayStopRef.current()
    });
  }

  autoplayPlayRef.current = candidateSentences =>
    playCandidates({
      ...loopStateRef.current,
      candidateSentences,
      selectedIndex: 0
    });
  autoplayStopRef.current = stopPlaybackQueue;

  useEffect(
    () => {
      const outputChanged =
        previousOutputSignatureRef.current !== outputSignature;
      const delayChanged =
        previousAutoplayDelayRef.current !== candidateAutoplayDelaySeconds;
      if (!outputChanged && !delayChanged) return;

      const isInitial = previousOutputSignatureRef.current === null;
      previousOutputSignatureRef.current = outputSignature;
      previousAutoplayDelayRef.current = candidateAutoplayDelaySeconds;
      const nextState = outputChanged
        ? buildExpressionLoopState(output)
        : loopStateRef.current;

      if (outputChanged) {
        if (!isInitial) {
          if (playbackActiveRef.current) autoplayStopRef.current();
          else onCancelSpeech();
        }
        aiRunRef.current += 1;
        setLoopState(nextState);
        setCandidatePhase(
          nextState.candidateSentences.length ? 'ready' : 'idle'
        );
        setSpeechAvailable(true);
        setIsSaved(false);
        setIsConfirmed(false);
        setExpressionConfirmError('');
        setIsSharingExpression(false);
        setExpressionShareNotice('');
        setIsGeneratingAi(false);
        setAiNotice('');
        if (!isInitial) resetCandidateFeedback(nextState);
      }

      autoplayControllerRef.current.schedule(
        nextState.candidateSentences,
        candidateAutoplayDelaySeconds
      );
    },
    [
      candidateAutoplayDelaySeconds,
      onCancelSpeech,
      output,
      outputSignature,
      resetCandidateFeedback
    ]
  );

  useEffect(
    () => {
      const speechTimeouts = speechTimeoutsRef.current;

      return () => {
        autoplayControllerRef.current.cancel({
          stopActivePlayback: false
        });
        playRunRef.current += 1;
        aiRunRef.current += 1;
        playbackActiveRef.current = false;
        speechTimeouts.forEach(timeoutId => window.clearTimeout(timeoutId));
        speechTimeouts.clear();
        onCancelSpeech();
      };
    },
    [onCancelSpeech]
  );

  function speakSentence(sentence) {
    return new Promise(resolve => {
      let completed = false;
      let timeoutId = null;
      const finish = success => {
        if (completed) {
          return;
        }

        completed = true;
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          speechTimeoutsRef.current.delete(timeoutId);
        }
        resolve(success);
      };

      timeoutId = window.setTimeout(
        () => finish(false),
        SPEECH_COMPLETION_TIMEOUT_MS
      );
      speechTimeoutsRef.current.add(timeoutId);

      try {
        const result = onSpeak(sentence, () => finish(true));
        if (result && typeof result.catch === 'function') {
          result.catch(() => finish(false));
        }
      } catch (error) {
        finish(false);
      }
    });
  }

  async function playCandidates(state) {
    if (!state.candidateSentences.length) {
      return;
    }

    const runId = playRunRef.current + 1;
    playRunRef.current = runId;
    playbackActiveRef.current = true;
    onCancelSpeech();
    setCandidatePhase('playing');
    setSpeechAvailable(true);

    for (let index = 0; index < state.candidateSentences.length; index += 1) {
      if (playRunRef.current !== runId) {
        return;
      }

      setLoopState(current => selectExpressionCandidate(current, index));
      const success = await speakSentence(state.candidateSentences[index]);

      if (playRunRef.current !== runId) {
        return;
      }

      if (!success) {
        setSpeechAvailable(false);
      }
    }

    if (playRunRef.current === runId) {
      playbackActiveRef.current = false;
      setCandidatePhase('done');
    }
  }

  function stopPlaybackQueue() {
    if (!playbackActiveRef.current) return;
    playbackActiveRef.current = false;
    playRunRef.current += 1;
    onCancelSpeech();
    setCandidatePhase(
      loopStateRef.current.candidateSentences.length ? 'done' : 'idle'
    );
  }

  function handlePatientInteraction() {
    const cancelled = autoplayControllerRef.current.cancel({
      stopActivePlayback: false
    });
    if (cancelled.hadActive || playbackActiveRef.current) {
      stopPlaybackQueue();
    }
  }

  function handleEditedOutput(nextOutput) {
    if (nextOutput === output) return;
    autoplayControllerRef.current.cancel({
      stopActivePlayback: false
    });
    if (playbackActiveRef.current) stopPlaybackQueue();
    else onCancelSpeech();
    onApplyOutput(nextOutput);
  }

  function handleMoveOutput(index, offset) {
    handleEditedOutput(moveExpressionOutputItem(output, index, offset));
  }

  function handleRemoveOutput(index) {
    handleEditedOutput(removeExpressionOutputItem(output, index));
  }

  function handlePrepareCandidates() {
    const nextState = buildExpressionLoopState(output);

    if (!nextState.candidateSentences.length) {
      return;
    }

    setLoopState(nextState);
    resetCandidateFeedback(nextState);
    setIsSaved(false);
    setIsConfirmed(false);
    setExpressionConfirmError('');
    autoplayControllerRef.current.cancel();
    playCandidates(nextState);
  }

  function handleStopPlayback() {
    autoplayControllerRef.current.cancel({
      stopActivePlayback: false
    });
    stopPlaybackQueue();
  }

  function handleReplayAll() {
    autoplayControllerRef.current.cancel();
    setIsSaved(false);
    setIsConfirmed(false);
    setExpressionConfirmError('');
    playCandidates({ ...loopState, selectedIndex: 0 });
  }

  async function handlePlayOne(index) {
    if (!loopState.candidateSentences[index]) {
      return;
    }

    autoplayControllerRef.current.cancel();
    const runId = playRunRef.current + 1;
    playRunRef.current = runId;
    playbackActiveRef.current = true;
    onCancelSpeech();
    setLoopState(current => selectExpressionCandidate(current, index));
    setCandidatePhase('playing');
    setSpeechAvailable(true);
    setIsSaved(false);
    setIsConfirmed(false);
    setExpressionConfirmError('');

    const success = await speakSentence(loopState.candidateSentences[index]);

    if (playRunRef.current === runId) {
      playbackActiveRef.current = false;
      setSpeechAvailable(success);
      setCandidatePhase('done');
    }
  }

  function handleSavePhrase() {
    const entry = buildExpressionSavedPhraseEntry(loopState);

    if (!entry || isSaved) {
      return;
    }

    onSavePhrase(entry);
    setIsSaved(true);
  }

  function handleConfirmExpression() {
    const entry = buildExpressionHistoryEntry(
      loopState,
      candidateFeedbackEntries
    );

    if (!entry || isConfirmed) {
      return;
    }

    const persisted = persistExpressionHistoryEntry(
      {
        ...entry,
        ...(candidateFeedbackDraftIdRef.current
          ? { id: candidateFeedbackDraftIdRef.current }
          : {}),
        recordStatus: 'confirmed'
      },
      onAppendHistory
    );
    if (!persisted) {
      setExpressionConfirmError(copy.expressionSaveFailed);
      return;
    }
    if (persisted && persisted.id) {
      candidateFeedbackDraftIdRef.current = persisted.id;
    }
    setExpressionConfirmError('');
    setIsConfirmed(true);
  }

  async function handleShareExpression() {
    const sentence =
      loopState.candidateSentences[loopState.selectedIndex] || '';
    if (!sentence || typeof onShareExpression !== 'function') return;

    setIsSharingExpression(true);
    setExpressionShareNotice(copy.sharingExpression);
    try {
      const result = await onShareExpression(sentence);
      setExpressionShareNotice(
        (result && result.message) || '当前环境无法完成分享，表达内容仍会保留。'
      );
    } catch (error) {
      setExpressionShareNotice('当前环境无法完成分享，表达内容仍会保留。');
    } finally {
      setIsSharingExpression(false);
    }
  }

  function handleCandidateFeedback(candidateIndex, feedback) {
    const next = toggleExpressionCandidateFeedback(
      candidateFeedbackEntries,
      candidateIndex,
      feedback
    );
    setCandidateFeedbackEntries(next);

    const entry = buildExpressionHistoryEntry(loopState, next);
    if (!entry) return;

    if (isConfirmed) {
      const persisted = persistExpressionHistoryEntry(
        {
          ...entry,
          ...(candidateFeedbackDraftIdRef.current
            ? { id: candidateFeedbackDraftIdRef.current }
            : {}),
          recordStatus: 'confirmed'
        },
        onAppendHistory
      );
      if (persisted && persisted.id) {
        candidateFeedbackDraftIdRef.current = persisted.id;
        setCandidateFeedbackNotice(
          candidateFeedbackSyncAvailable
            ? copy.candidateFeedbackSaved
            : copy.candidateFeedbackLocal
        );
      } else {
        setCandidateFeedbackNotice(copy.candidateFeedbackFailed);
      }
      return;
    }

    if (!next.some(candidate => candidate.feedback)) {
      discardCandidateFeedbackDraft();
      setCandidateFeedbackNotice(copy.candidateFeedbackCancelled);
      return;
    }

    const draft = onSaveCandidateFeedbackDraft({
      ...(candidateFeedbackDraftIdRef.current
        ? { id: candidateFeedbackDraftIdRef.current }
        : {}),
      outputSignature: loopState.outputSignature,
      candidates: next
    });
    if (draft && draft.id) {
      candidateFeedbackDraftIdRef.current = draft.id;
      setCandidateFeedbackNotice(
        candidateFeedbackSyncAvailable
          ? copy.candidateFeedbackSaved
          : copy.candidateFeedbackLocal
      );
    } else {
      setCandidateFeedbackNotice(copy.candidateFeedbackFailed);
    }
  }

  function handleApplySavedPhrase(item) {
    const nextState = buildExpressionLoopStateFromSavedPhrase(item);

    onCancelSpeech();
    onApplyOutput(item.output);
    previousOutputSignatureRef.current = nextState.outputSignature;
    setLoopState(nextState);
    resetCandidateFeedback(nextState);
    setCandidatePhase('ready');
    setSpeechAvailable(true);
    setIsSaved(true);
    setIsConfirmed(false);
    setExpressionConfirmError('');
    autoplayControllerRef.current.schedule(
      nextState.candidateSentences,
      candidateAutoplayDelaySeconds
    );
  }

  async function playSavedPhrase(item, options = {}) {
    const sentence = String((item && item.sentence) || '').trim();
    if (!sentence) return;

    autoplayControllerRef.current.cancel({
      stopActivePlayback: false
    });
    if (playbackActiveRef.current) stopPlaybackQueue();
    else onCancelSpeech();

    const runId = playRunRef.current + 1;
    playRunRef.current = runId;
    playbackActiveRef.current = true;
    if (options.showDialog) setPlaybackPhrase(item);
    if (options.recordUsage) onUseSavedPhrase(item);
    setCandidatePhase('playing');
    setSpeechAvailable(true);

    const success = await speakSentence(sentence);
    if (playRunRef.current === runId) {
      playbackActiveRef.current = false;
      setSpeechAvailable(success);
      setCandidatePhase(
        loopStateRef.current.candidateSentences.length ? 'done' : 'idle'
      );
    }
  }

  function handlePlaySavedPhrase(item) {
    return playSavedPhrase(item, {
      showDialog: true,
      recordUsage: true
    });
  }

  function handleReplaySavedPhrase() {
    return playSavedPhrase(playbackPhrase);
  }

  function handleCloseSavedPhrasePlayback() {
    autoplayControllerRef.current.cancel({
      stopActivePlayback: false
    });
    if (playbackActiveRef.current) stopPlaybackQueue();
    else onCancelSpeech();
    setPlaybackPhrase(null);
  }

  async function handleGenerateAiCandidates() {
    if (!aiAvailable || typeof onGenerateAiSentences !== 'function') {
      setAiNotice(copy.aiLoginRequired);
      return;
    }

    const request = buildCommunicationAiSentenceRequest({
      output,
      context: conversationContext
    });
    const runId = aiRunRef.current + 1;
    aiRunRef.current = runId;
    setIsGeneratingAi(true);
    setAiNotice('');

    try {
      const response = await onGenerateAiSentences(request);
      if (aiRunRef.current !== runId) return;
      const nextState = applyCommunicationAiSentenceResponse(
        buildExpressionLoopState(output),
        response
      );
      if (!nextState || nextState.isOfflineFallback !== false) {
        setAiNotice(copy.aiFailed);
        return;
      }
      setLoopState(nextState);
      resetCandidateFeedback(nextState);
      setCandidatePhase('ready');
      setIsSaved(false);
      setIsConfirmed(false);
      setExpressionConfirmError('');
      setAiNotice(copy.aiApplied);
      autoplayControllerRef.current.schedule(
        nextState.candidateSentences,
        candidateAutoplayDelaySeconds
      );
    } catch (error) {
      if (aiRunRef.current === runId) {
        setAiNotice(getAiFailureMessage(error, copy));
      }
    } finally {
      if (aiRunRef.current === runId) setIsGeneratingAi(false);
    }
  }

  function handlePictogramSuggestion(tile) {
    onPictogramUsed(tile.boardId, tile.id);
    onApplyOutput([...output, tile]);
  }

  return (
    <div
      className="CommunicationSupportPanel__content"
      onMouseDownCapture={handlePatientInteraction}
      onTouchStartCapture={handlePatientInteraction}
      onWheelCapture={handlePatientInteraction}
      onScrollCapture={handlePatientInteraction}
    >
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
        {pictogramSuggestions.tiles.length > 0 && (
          <div
            className="CommunicationSupportPanel__pictogramSuggestions"
            aria-label={
              pictogramSuggestions.mode === PICTOGRAM_SUGGESTION_MODES.recent
                ? copy.recentPictograms
                : copy.nextPictograms
            }
          >
            <div className="CommunicationSupportPanel__suggestionHeader">
              <strong>
                {pictogramSuggestions.mode === PICTOGRAM_SUGGESTION_MODES.recent
                  ? copy.recentPictograms
                  : copy.nextPictograms}
              </strong>
              <span>{copy.pictogramSuggestionsHint}</span>
            </div>
            <div className="CommunicationSupportPanel__suggestionList">
              {pictogramSuggestions.tiles.map(tile => (
                <button
                  className="CommunicationSupportPanel__pictogramSuggestion"
                  key={`${tile.boardId}:${tile.id}`}
                  onClick={() => handlePictogramSuggestion(tile)}
                  aria-label={`${copy.nextPictograms}：${tile.label}`}
                >
                  {tile.image && <img src={tile.image} alt="" />}
                  <span>{tile.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {output.length > 0 && (
          <div
            className="CommunicationSupportPanel__sequenceEditor"
            role="list"
            aria-label={copy.adjustOutput}
          >
            {output.map((item, index) => (
              <div
                className="CommunicationSupportPanel__sequenceItem"
                role="listitem"
                key={`${item.id || item.label}-${index}`}
              >
                {item.image && (
                  <img
                    className="CommunicationSupportPanel__sequenceImage"
                    src={item.image}
                    alt=""
                  />
                )}
                <span className="CommunicationSupportPanel__sequenceLabel">
                  {item.label}
                </span>
                <div className="CommunicationSupportPanel__sequenceActions">
                  <PatientActionButton
                    action={PATIENT_ACTION_IDS.moveLeft}
                    size="small"
                    variant="outlined"
                    disabled={index === 0}
                    onClick={() => handleMoveOutput(index, -1)}
                    label={copy.moveLeft}
                    aria-label={`${copy.moveLeft}：${item.label}`}
                  />
                  <PatientActionButton
                    action={PATIENT_ACTION_IDS.moveRight}
                    size="small"
                    variant="outlined"
                    disabled={index === output.length - 1}
                    onClick={() => handleMoveOutput(index, 1)}
                    label={copy.moveRight}
                    aria-label={`${copy.moveRight}：${item.label}`}
                  />
                  <PatientActionButton
                    action={PATIENT_ACTION_IDS.remove}
                    size="small"
                    variant="outlined"
                    onClick={() => handleRemoveOutput(index)}
                    label={copy.removeSelected}
                    aria-label={`${copy.removeSelected}：${item.label}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="CommunicationSupportPanel__actions">
          <PatientActionButton
            action={PATIENT_ACTION_IDS.improve}
            color="primary"
            variant="outlined"
            onClick={handleGenerateAiCandidates}
            disabled={!output.length || isGeneratingAi}
            label={isGeneratingAi ? '生成中' : '优化'}
            ariaLabel={isGeneratingAi ? copy.aiGenerating : copy.aiCandidates}
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.playAll}
            color="primary"
            variant="contained"
            onClick={handlePrepareCandidates}
            disabled={!output.length}
            label="全播"
            ariaLabel={copy.generateAndSpeak}
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.stop}
            color="primary"
            variant="outlined"
            onClick={handleStopPlayback}
            disabled={candidatePhase !== 'playing'}
            label="停止"
            ariaLabel={copy.stopSpeech}
          />
        </div>
        {aiNotice && (
          <div
            className="CommunicationSupportPanel__environmentNotice"
            role="status"
          >
            {aiNotice}
          </div>
        )}
        {!speechAvailable && (
          <div className="CommunicationSupportPanel__missing">
            {copy.speechUnavailable}
          </div>
        )}
        {candidatePhase !== 'idle' && (
          <div className="CommunicationSupportPanel__resultMeta" role="status">
            {candidateAutoplayDelaySeconds
              ? `${candidateAutoplayDelaySeconds} ${copy.autoplayEnabled}`
              : copy.autoplayDisabled}
          </div>
        )}
        {candidatePhase !== 'idle' && (
          <div className="CommunicationSupportPanel__candidates">
            {loopState.candidateSentences.map((sentence, index) => (
              <div
                className="CommunicationSupportPanel__candidateRow"
                key={sentence}
              >
                <button
                  className={
                    index === loopState.selectedIndex
                      ? 'CommunicationSupportPanel__candidate CommunicationSupportPanel__candidate--active'
                      : 'CommunicationSupportPanel__candidate'
                  }
                  onClick={() => handlePlayOne(index)}
                  aria-pressed={index === loopState.selectedIndex}
                >
                  {sentence}
                </button>
                <div
                  className="CommunicationSupportPanel__candidateFeedbackActions"
                  role="group"
                  aria-label={`评价候选句：${sentence}`}
                >
                  <button
                    type="button"
                    className="CommunicationSupportPanel__candidateFeedback"
                    aria-label={`${copy.candidateFeedbackUp}：${sentence}`}
                    aria-pressed={
                      candidateFeedbackEntries[index] &&
                      candidateFeedbackEntries[index].feedback ===
                        CANDIDATE_FEEDBACK.up
                    }
                    onClick={() =>
                      handleCandidateFeedback(index, CANDIDATE_FEEDBACK.up)
                    }
                  >
                    👍 {copy.candidateFeedbackUp}
                  </button>
                  <button
                    type="button"
                    className="CommunicationSupportPanel__candidateFeedback"
                    aria-label={`${copy.candidateFeedbackDown}：${sentence}`}
                    aria-pressed={
                      candidateFeedbackEntries[index] &&
                      candidateFeedbackEntries[index].feedback ===
                        CANDIDATE_FEEDBACK.down
                    }
                    onClick={() =>
                      handleCandidateFeedback(index, CANDIDATE_FEEDBACK.down)
                    }
                  >
                    👎 {copy.candidateFeedbackDown}
                  </button>
                </div>
              </div>
            ))}
            <div
              className="CommunicationSupportPanel__candidateFeedbackStatus"
              role="status"
            >
              {candidateFeedbackNotice || copy.candidateFeedbackHint}
            </div>
          </div>
        )}
        {candidatePhase !== 'idle' && (
          <div className="CommunicationSupportPanel__actions">
            <PatientActionButton
              action={PATIENT_ACTION_IDS.replay}
              color="primary"
              variant="outlined"
              onClick={handleReplayAll}
              disabled={!loopState.candidateSentences.length}
              label="重播"
              ariaLabel={copy.replayAll}
            />
            <PatientActionButton
              action={PATIENT_ACTION_IDS.save}
              color="primary"
              variant="outlined"
              onClick={handleSavePhrase}
              disabled={!loopState.candidateSentences.length || isSaved}
              label={isSaved ? '已收藏' : '收藏'}
              ariaLabel={isSaved ? copy.phraseSaved : copy.savePhrase}
            />
            <PatientActionButton
              action={PATIENT_ACTION_IDS.share}
              id="communication-expression-share"
              color="primary"
              variant="outlined"
              onClick={handleShareExpression}
              disabled={
                isSharingExpression ||
                !loopState.candidateSentences[loopState.selectedIndex]
              }
              label={isSharingExpression ? '准备中' : '分享'}
              ariaLabel={
                isSharingExpression
                  ? copy.sharingExpression
                  : copy.shareExpression
              }
            />
            <PatientActionButton
              action={PATIENT_ACTION_IDS.confirm}
              color="primary"
              variant="contained"
              onClick={handleConfirmExpression}
              disabled={!loopState.candidateSentences.length || isConfirmed}
              label={isConfirmed ? '已确认' : '确认'}
              ariaLabel={
                isConfirmed ? copy.expressionConfirmed : copy.confirmExpression
              }
            />
          </div>
        )}
        {expressionConfirmError && (
          <div
            className="CommunicationSupportPanel__candidateFeedbackStatus"
            role="alert"
          >
            {expressionConfirmError}
          </div>
        )}
        {expressionShareNotice && (
          <div
            className="CommunicationSupportPanel__candidateFeedbackStatus"
            role="status"
          >
            {expressionShareNotice}
          </div>
        )}
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
                onPlay={handlePlaySavedPhrase}
                playLabel={copy.quickPlay}
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
      <CommunicationPlaybackDialog
        open={Boolean(playbackPhrase)}
        item={playbackPhrase}
        isSpeaking={candidatePhase === 'playing'}
        statusLabel={
          candidatePhase === 'playing'
            ? copy.playbackSpeaking
            : speechAvailable
            ? copy.playbackReady
            : copy.speechUnavailable
        }
        replayLabel={copy.playbackReplay}
        doneLabel={copy.playbackDone}
        onReplay={handleReplaySavedPhrase}
        onClose={handleCloseSavedPhrasePlayback}
      />
    </div>
  );
}

ExpressionLoopPanel.propTypes = {
  output: PropTypes.arrayOf(PropTypes.object).isRequired,
  boards: PropTypes.arrayOf(PropTypes.object).isRequired,
  activeBoardId: PropTypes.string,
  pictogramOrdering: PropTypes.object.isRequired,
  savedPhrases: PropTypes.arrayOf(PropTypes.object),
  onApplyOutput: PropTypes.func.isRequired,
  onPictogramUsed: PropTypes.func.isRequired,
  onSpeak: PropTypes.func.isRequired,
  onCancelSpeech: PropTypes.func.isRequired,
  onSavePhrase: PropTypes.func.isRequired,
  onAppendHistory: PropTypes.func.isRequired,
  onSaveCandidateFeedbackDraft: PropTypes.func,
  onDiscardCandidateFeedbackDraft: PropTypes.func,
  candidateFeedbackDrafts: PropTypes.arrayOf(PropTypes.object),
  conversationSessionId: PropTypes.string,
  onUseSavedPhrase: PropTypes.func,
  onShareExpression: PropTypes.func,
  conversationContext: PropTypes.object,
  aiAvailable: PropTypes.bool,
  onGenerateAiSentences: PropTypes.func,
  candidateAutoplayDelaySeconds: PropTypes.number,
  candidateFeedbackSyncAvailable: PropTypes.bool,
  copyOverrides: PropTypes.object
};

ExpressionLoopPanel.defaultProps = {
  activeBoardId: null,
  savedPhrases: [],
  conversationContext: null,
  aiAvailable: false,
  onGenerateAiSentences: null,
  onUseSavedPhrase: () => {},
  onShareExpression: null,
  onSaveCandidateFeedbackDraft: () => null,
  onDiscardCandidateFeedbackDraft: () => false,
  candidateFeedbackDrafts: [],
  conversationSessionId: '',
  candidateAutoplayDelaySeconds: 15,
  candidateFeedbackSyncAvailable: false,
  copyOverrides: null
};
