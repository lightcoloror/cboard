import LocalSnapshotImage from './LocalSnapshotImage.component';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import PropTypes from 'prop-types';
import ImageRepairControls from './ImageRepairControls.component';
import { careErrorMessage } from '../../../common/communicationSupport/careErrors';
import { attachExpressionDraftRequest } from '../../../common/communicationSupport/expressionDraft';
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
import LifeContextFilter from './LifeContextFilter.component';
import { filterSavedPhrasesByLifeContext } from '../../../common/communicationSupport/savedPhraseManagement';

const DEFAULT_COPY = {
  expressSectionTitle: '候选句播报',
  currentBoard: '当前板',
  noBoard: '未选择',
  currentOutput: '当前输出',
  rejectCandidates: '都不对',
  undoRejection: '撤销拒绝',
  candidatesRejected: '已停止这组候选。图片已保留，请调整图片，或撤销拒绝后手动选择。',
  rejectionSaveFailed: '本次已停止，但拒绝状态未能保存，重开页面可能丢失；请重试保存。',
  rejectionUndoFailed: '撤销未能保存，候选仍保持停止，请重试。',
  rejectionUndone: '已恢复候选，请手动选择；不会自动播报或再次调用 AI。',
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
  autoplayPaused: '当前不会自动播报，请手动选择一句或全部播报。',
  savePhrase: '收藏此句',
  phraseSaved: '已收藏',
  confirmExpression: '确认此句',
  expressionConfirmed: '已确认',
  expressionSaveFailed: '表达未能保存，图片和候选句已保留，请重试。',
  shareExpression: '分享此句',
  sharingExpression: '正在准备分享…',
  savedPhrasesTitle: '常用短句',
  savedPhrasesHint: '收藏独立保存，不随最近历史清除',
  quickPlay: '一键播报',
  reuse: '重用',
  playbackSpeaking: '正在播报',
  playbackReady: '可重播或完成',
  playbackReplay: '重播',
  playbackDone: '完成',
  noSavedPhrases: '还没有收藏的短句。',
  aiCandidates: '生成三个候选句',
  aiGenerating: 'AI 生成中...',
  aiLoginRequired: '登录后可使用 AI 增强，当前继续使用本地规则。',
  aiUnavailable: '服务端尚未配置 AI，当前继续使用本地规则。',
  aiFailed: 'AI 服务暂时不可用，当前继续使用本地规则。',
  aiRateLimited: 'AI 增强请求较多，请稍后重试；当前继续使用本地候选句。',
  aiMonthlyQuota: '本月 AI 增强额度已用完，当前继续使用本地候选句。',
  aiApplied: '已生成 AI 候选句；点击一句播报，再确认或收藏。',
  localApplied: '已生成本地候选句；点击一句播报，再确认或收藏。',
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

function SavedPhraseRow({ item, onApply, onPlay, onView, playLabel, reuseLabel }) {
  return (
    <div className="CommunicationSupportPanel__savedRow">
      <div className="CommunicationSupportPanel__savedContent">
        <div className="CommunicationSupportPanel__savedImages">
          {item.output
            .slice(0, 4)
            .map((outputItem, index) =>
              outputItem.image ? (
                <LocalSnapshotImage
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
        <Button size="small" onClick={() => onView(item)}>查看整句</Button>
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
  if (
    error?.response?.data?.code ||
    error?.response?.data?.error?.code ||
    error?.data?.code ||
    error?.code?.startsWith('AI_REQUEST_')
  )
    return careErrorMessage(error);
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
  savedPhraseRequest,
  onSavedPhraseRequestHandled,
  output,
  boards,
  activeBoardId,
  activeBoardName,
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
  aiUnavailableReason,
  aiContextKey,
  getAiContextKey,
  onGenerateAiSentences,
  candidateAutoplayDelaySeconds,
  candidateFeedbackSyncAvailable,
  expressionDraftService,
  allowLegacyOutput = true,
  active = true,
  onDraftConfirmed,
  copyOverrides
}) {
  const copy = { ...DEFAULT_COPY, ...(copyOverrides || {}) };
  const initialDraftRef = useRef(undefined);
  const draftLoadErrorRef = useRef('');
  if (initialDraftRef.current === undefined) {
    try { initialDraftRef.current = expressionDraftService ? expressionDraftService.load() : null; }
    catch (error) { initialDraftRef.current = null; draftLoadErrorRef.current = error.message; }
  }
  const initialDraft = initialDraftRef.current;
  const initialBlocked = Boolean(draftLoadErrorRef.current ||
    initialDraft?.status === 'draft' ||
    (expressionDraftService && !initialDraft && !allowLegacyOutput && output.length));
  const [restoreChoice, setRestoreChoice] = useState(initialBlocked ? 'pending' : 'active');
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [draftNotice, setDraftNotice] = useState(draftLoadErrorRef.current
    ? `上次表达暂时无法读取：${draftLoadErrorRef.current}。原存储未被改写。`
    : expressionDraftService && !initialDraft && !allowLegacyOutput && output.length
    ? '旧输出无法确认所属档案，请开始新表达后重新复核。' : '');
  const [draftSaveFailed, setDraftSaveFailed] = useState(Boolean(draftLoadErrorRef.current));
  const [pendingAiRecovery, setPendingAiRecovery] = useState(
    initialDraft?.status === 'draft' ? initialDraft.snapshot.pendingAi || null : null);
  const draftReadyRef = useRef(!initialBlocked);
  const awaitingInitialClearRef = useRef(Boolean(initialDraft));
  const draftCompletedRef = useRef(initialDraft?.status === 'confirmed');
  const lastDraftSnapshotRef = useRef(null);
  const confirmPendingRef = useRef(false);
  const initialLoopStateRef = useRef(null);
  if (!initialLoopStateRef.current) {
    initialLoopStateRef.current = initialDraft?.status === 'draft'
      ? initialDraft.snapshot.pipeline
      : buildExpressionLoopState(initialDraft || !allowLegacyOutput ? [] : output);
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
  // Legacy feedback signatures contain only ID and label. Lifecycle checks
  // additionally include the ordered snapshots so same-name people never merge.
  const outputSnapshotKey = JSON.stringify(output);
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
  const [pendingAutoplayDelayMs, setPendingAutoplayDelayMs] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [favoriteSaveError, setFavoriteSaveError] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [expressionConfirmError, setExpressionConfirmError] = useState('');
  const [isSharingExpression, setIsSharingExpression] = useState(false);
  const [expressionShareNotice, setExpressionShareNotice] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiNotice, setAiNotice] = useState('');
  const [candidateFeedbackEntries, setCandidateFeedbackEntries] = useState(() =>
    normalizeExpressionCandidates(
      initialDraft?.status === 'draft'
        ? initialDraft.snapshot.candidateFeedbackEntries
        : initialCandidateFeedbackDraftRef.current
        ? initialCandidateFeedbackDraftRef.current.candidates
        : [],
      initialLoopStateRef.current.candidateSentences
    )
  );
  const [candidateFeedbackNotice, setCandidateFeedbackNotice] = useState('');
  const [candidatesRejected, setCandidatesRejected] = useState(
    Boolean(initialDraft?.status === 'draft'
      ? initialDraft.snapshot.rejected : initialCandidateFeedbackDraftRef.current?.rejected)
  );
  const candidatesRejectedRef = useRef(candidatesRejected);
  const [playbackPhrase, setPlaybackPhrase] = useState(null);
  const [savedPlaybackNotice, setSavedPlaybackNotice] = useState('');
  const savedPlaybackPending = useRef(false);
  const savedPlaybackCounted = useRef(false);
  const savedRequestRef = useRef(null);
  const appliedSavedRef = useRef(null);
  const applySavedPending = useRef(false);
  const [lifeContext, setLifeContext] = useState(null);
  const contextPhrases = filterSavedPhrasesByLifeContext(savedPhrases, lifeContext);
  const playRunRef = useRef(0);
  const aiRunRef = useRef(0);
  const aiPendingRef = useRef(false);
  const previousAiContextRef = useRef(aiContextKey);
  const speechTimeoutsRef = useRef(new Set());
  const previousOutputSignatureRef = useRef(null);
  const previousOutputSnapshotRef = useRef(null);
  const previousConversationSessionRef = useRef(conversationSessionId);
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
  const shareRunRef = useRef(0);
  const sharePendingRef = useRef(false);
  const shareMountedRef = useRef(true);
  const shareContextRef = useRef(null);
  const restoredAutoplayPausedRef = useRef(Boolean(initialDraft) || initialBlocked);

  loopStateRef.current = loopState;
  shareContextRef.current = {
    outputSignature,
    outputSnapshotKey,
    conversationSessionId,
    candidateSentences: loopState.candidateSentences,
    selectedIndex: loopState.selectedIndex
  };

  const invalidateExpressionShare = useCallback(() => {
    shareRunRef.current += 1;
    sharePendingRef.current = false;
  }, []);
  const cancelExpressionShare = useCallback(() => {
    invalidateExpressionShare();
    setIsSharingExpression(false);
    setExpressionShareNotice('');
  }, [invalidateExpressionShare]);

  useEffect(() => {
    shareMountedRef.current = true;
    cancelExpressionShare();
    return () => {
      shareMountedRef.current = false;
      invalidateExpressionShare();
    };
  }, [
    outputSignature,
    outputSnapshotKey,
    conversationSessionId,
    loopState.candidateSentences,
    loopState.selectedIndex,
    cancelExpressionShare,
    invalidateExpressionShare
  ]);

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
      // Keep an explicit rejection attached to its old sequence for reopening.
      if (!candidatesRejectedRef.current) discardCandidateFeedbackDraft();
      candidateFeedbackDraftIdRef.current = null;
      candidatesRejectedRef.current = false;
      setCandidatesRejected(false);
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
      stopPlayback: () => autoplayStopRef.current(),
      onPendingChange: setPendingAutoplayDelayMs
    });
  }

  autoplayPlayRef.current = candidateSentences =>
    playCandidates({
      ...loopStateRef.current,
      candidateSentences,
      selectedIndex: 0
    });
  autoplayStopRef.current = stopPlaybackQueue;

  useEffect(() => {
    if (!expressionDraftService) return;
    // Redux's legacy output is not a second restore source. Clear its visible
    // copy until the person explicitly resumes this scope's ordered snapshot.
    if (initialDraft || initialBlocked) onApplyOutput([]);
    // This is a once-per-scope startup operation, not an output-change effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => {
      if (!draftReadyRef.current) return;
      if (awaitingInitialClearRef.current) {
        if (output.length) return;
        awaitingInitialClearRef.current = false;
      }
      const outputChanged =
        previousOutputSnapshotRef.current !== outputSnapshotKey;
      const sessionChanged = previousConversationSessionRef.current !== conversationSessionId;
      const delayChanged =
        previousAutoplayDelayRef.current !== candidateAutoplayDelaySeconds;
      if (!outputChanged && !delayChanged && !sessionChanged) return;

      const isInitial = previousOutputSignatureRef.current === null;
      previousOutputSignatureRef.current = outputSignature;
      previousOutputSnapshotRef.current = outputSnapshotKey;
      previousConversationSessionRef.current = conversationSessionId;
      previousAutoplayDelayRef.current = candidateAutoplayDelaySeconds;
      const nextState = outputChanged
        ? buildExpressionLoopState(output)
        : loopStateRef.current;

      if (outputChanged) {
        if (!isInitial) {
          draftCompletedRef.current = false;
          restoredAutoplayPausedRef.current = false;
        }
        if (!isInitial) {
          if (playbackActiveRef.current) autoplayStopRef.current();
          else onCancelSpeech();
        }
        aiRunRef.current += 1;
        aiPendingRef.current = false;
        setLoopState(nextState);
        setCandidatePhase(
          nextState.candidateSentences.length ? 'ready' : 'idle'
        );
        setSpeechAvailable(true);
        setIsSaved(false);
        setFavoriteSaveError('');
        setIsConfirmed(false);
        setExpressionConfirmError('');
        setIsSharingExpression(false);
        setExpressionShareNotice('');
        setIsGeneratingAi(false);
        setAiNotice('');
        setPendingAiRecovery(null);
        if (!isInitial) resetCandidateFeedback(nextState);
        const draft = findExpressionCandidateFeedbackDraft(candidateFeedbackDrafts, {
          sessionId: conversationSessionId,
          outputSignature,
          candidateSentences: nextState.candidateSentences
        });
        candidateFeedbackDraftIdRef.current = draft?.id || null;
        candidatesRejectedRef.current = Boolean(draft?.rejected);
        setCandidatesRejected(candidatesRejectedRef.current);
        setCandidateFeedbackEntries(normalizeExpressionCandidates(
          draft?.candidates || [], nextState.candidateSentences
        ));
      }

      if (sessionChanged) {
        aiRunRef.current += 1;
        aiPendingRef.current = false;
        onCancelSpeech();
      }
      if (candidatesRejectedRef.current || !active ||
          restoredAutoplayPausedRef.current || sessionChanged) {
        autoplayControllerRef.current.cancel();
        return;
      }
      autoplayControllerRef.current.schedule(
        nextState.candidateSentences,
        candidateAutoplayDelaySeconds
      );
    },
    [
      candidateAutoplayDelaySeconds,
      candidateFeedbackDrafts,
      conversationSessionId,
      onCancelSpeech,
      output,
      outputSignature,
      outputSnapshotKey,
      resetCandidateFeedback,
      active,
      restoreChoice
    ]
  );

  useEffect(() => {
    if (!draftReadyRef.current && savedPhraseRequest?.mode === 'reuse') return;
    if (!savedPhraseRequest || savedRequestRef.current === savedPhraseRequest.requestId) return;
    savedRequestRef.current = savedPhraseRequest.requestId;
    if (savedPhraseRequest.mode === 'reuse') handleApplySavedPhrase(savedPhraseRequest.item);
    else if (savedPhraseRequest.mode === 'play') handlePlaySavedPhrase(savedPhraseRequest.item);
    else handleViewSavedPhrase(savedPhraseRequest.item);
    if (onSavedPhraseRequestHandled) onSavedPhraseRequestHandled(savedPhraseRequest.requestId);
    // Reconcile this render's output first. An explicit full-sentence command
    // must not be overwritten by that same render's stale output props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPhraseRequest, restoreChoice]);

  function currentDraftSnapshot(extra = {}) {
    return {
      pipeline: loopStateRef.current,
      rejected: candidatesRejectedRef.current,
      candidateFeedbackEntries,
      ...extra
    };
  }

  function persistDraft(extra = {}, options = {}) {
    if (!expressionDraftService) return true;
    if (!draftReadyRef.current || draftCompletedRef.current) return false;
    try {
      expressionDraftService.save(currentDraftSnapshot(extra), options);
      lastDraftSnapshotRef.current = JSON.stringify(currentDraftSnapshot());
      setDraftSaveFailed(false);
      setDraftNotice('已保存到本机');
      return true;
    } catch (error) {
      setDraftSaveFailed(true);
      setDraftNotice(`本次修改尚未保存：${error.message}。当前内容已保留，请重试。`);
      return false;
    }
  }

  const draftSnapshotKey = JSON.stringify({ pipeline: loopState, rejected: candidatesRejected, candidateFeedbackEntries });
  useEffect(() => {
    if (!expressionDraftService || !draftReadyRef.current || draftCompletedRef.current ||
        previousOutputSnapshotRef.current !== outputSnapshotKey ||
        JSON.stringify(loopState.outputSnapshot) !== outputSnapshotKey) return;
    if (lastDraftSnapshotRef.current === draftSnapshotKey) return;
    persistDraft();
    // Snapshot is the complete local payload; no network or playback here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSnapshotKey, outputSnapshotKey, restoreChoice, expressionDraftService]);

  useEffect(() => {
    const record = expressionDraftService?.getCurrent();
    const pending = record?.status === 'draft' ? record.snapshot.pendingAi || null : null;
    if (active) {
      if (expressionDraftService) setPendingAiRecovery(pending);
      return;
    }
    autoplayControllerRef.current.cancel();
    playRunRef.current += 1;
    aiRunRef.current += 1;
    aiPendingRef.current = false;
    playbackActiveRef.current = false;
    invalidateExpressionShare();
    setIsSharingExpression(false);
    setExpressionShareNotice('');
    setIsGeneratingAi(false);
    setCandidatePhase(loopStateRef.current.candidateSentences.length ? 'done' : 'idle');
    savedPlaybackPending.current = false;
    setPlaybackPhrase(null);
    if (expressionDraftService) setPendingAiRecovery(pending);
    onCancelSpeech();
  }, [active, onCancelSpeech, invalidateExpressionShare, expressionDraftService]);

  useEffect(() => {
    if (previousAiContextRef.current === aiContextKey) return;
    previousAiContextRef.current = aiContextKey;
    aiRunRef.current += 1;
    aiPendingRef.current = false;
    setIsGeneratingAi(false);
    autoplayControllerRef.current.cancel();
    playRunRef.current += 1;
    playbackActiveRef.current = false;
    invalidateExpressionShare();
    setIsSharingExpression(false);
    setExpressionShareNotice('');
    setCandidatePhase(loopStateRef.current.candidateSentences.length ? 'done' : 'idle');
    savedPlaybackPending.current = false;
    setPlaybackPhrase(null);
    onCancelSpeech();
  }, [aiContextKey, invalidateExpressionShare, onCancelSpeech]);

  function continueDraft() {
    if (!initialDraft || initialDraft.status !== 'draft') return;
    const snapshot = initialDraft.snapshot;
    previousOutputSignatureRef.current = snapshot.pipeline.outputSignature;
    previousOutputSnapshotRef.current = JSON.stringify(snapshot.pipeline.outputSnapshot);
    previousConversationSessionRef.current = conversationSessionId;
    previousAutoplayDelayRef.current = candidateAutoplayDelaySeconds;
    setLoopState(snapshot.pipeline);
    loopStateRef.current = snapshot.pipeline;
    candidatesRejectedRef.current = Boolean(snapshot.rejected);
    setCandidatesRejected(Boolean(snapshot.rejected));
    setCandidateFeedbackEntries(snapshot.candidateFeedbackEntries || []);
    setCandidatePhase(snapshot.pipeline.candidateSentences.length ? 'ready' : 'idle');
    draftReadyRef.current = true;
    awaitingInitialClearRef.current = false;
    restoredAutoplayPausedRef.current = true;
    setRestoreChoice('active');
    onApplyOutput(snapshot.pipeline.outputSnapshot);
    setDraftNotice('已恢复上次表达；请主动选择、播报或确认，不会自动播放。');
  }

  function discardAndStart() {
    try {
      if (expressionDraftService) expressionDraftService.discard();
      const empty = buildExpressionLoopState([]);
      draftReadyRef.current = true;
      draftCompletedRef.current = false;
      previousOutputSignatureRef.current = empty.outputSignature;
      previousOutputSnapshotRef.current = '[]';
      restoredAutoplayPausedRef.current = true;
      loopStateRef.current = empty;
      setLoopState(empty);
      candidatesRejectedRef.current = false;
      setCandidatesRejected(false);
      setCandidateFeedbackEntries([]);
      setPendingAiRecovery(null);
      setCandidatePhase('idle');
      setIsConfirmed(false);
      setDraftSaveFailed(false);
      setConfirmingDiscard(false);
      setRestoreChoice('active');
      onApplyOutput([]);
      setDraftNotice('已开始新表达；原图库、收藏和历史保持不变。');
    } catch (error) {
      setDraftNotice(`无法开始新表达：${error.message}。原草稿已保留。`);
      setDraftSaveFailed(true);
    }
  }

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

  function speakSentence(sentence, playbackOutput = output) {
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
        const result = onSpeak(sentence, () => finish(true), playbackOutput);
        if (result && typeof result.catch === 'function') {
          result.catch(() => finish(false));
        }
      } catch (error) {
        finish(false);
      }
    });
  }

  async function playCandidates(state) {
    if (candidatesRejectedRef.current || !state.candidateSentences.length) {
      return;
    }

    cancelExpressionShare();
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
    savedPlaybackPending.current = false;
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
    cancelExpressionShare();
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

  function repairOutputImage(index, tile) {
    const nextOutput = output.map((item, i) => i === index ? tile : item);
    const nextState = { ...loopStateRef.current, outputSnapshot: nextOutput,
      outputSignature: buildExpressionOutputSignature(nextOutput) };
    try {
      if (expressionDraftService) expressionDraftService.save(currentDraftSnapshot({ pipeline: nextState, pendingAi: null }),
        { startNew: expressionDraftService.getCurrent()?.status === 'confirmed' });
    } catch (_) { setDraftSaveFailed(true); setDraftNotice('图片修改尚未保存，请重试确认。'); return false; }
    cancelExpressionShare(); cancelPendingAi(); autoplayControllerRef.current.cancel(); onCancelSpeech();
    restoredAutoplayPausedRef.current = true; draftCompletedRef.current = false;
    previousOutputSnapshotRef.current = JSON.stringify(nextOutput);
    previousOutputSignatureRef.current = nextState.outputSignature;
    loopStateRef.current = nextState; setLoopState(nextState);
    setIsConfirmed(false); setIsSaved(false); setFavoriteSaveError('');
    onApplyOutput(nextOutput);
    return true;
  }

  function handleRemoveOutput(index) {
    handleEditedOutput(removeExpressionOutputItem(output, index));
  }

  function cancelPendingAi() {
    if (!aiPendingRef.current) return;
    aiRunRef.current += 1;
    aiPendingRef.current = false;
    setIsGeneratingAi(false);
  }

  function handleStopPlayback() {
    cancelPendingAi();
    autoplayControllerRef.current.cancel({
      stopActivePlayback: false
    });
    stopPlaybackQueue();
  }

  function handleRejectCandidates() {
    if (!loopStateRef.current.candidateSentences.length) return;
    cancelExpressionShare();
    // Change the guard synchronously, before storage or a provider callback.
    candidatesRejectedRef.current = true;
    setCandidatesRejected(true);
    handleStopPlayback();
    onCancelSpeech();
    setIsConfirmed(false);
    draftCompletedRef.current = false;
    setIsSaved(false);
    setFavoriteSaveError('');
    setAiNotice('');
    setExpressionConfirmError('');
    setExpressionShareNotice('');
    // A confirmed history ID is not a pending-feedback ID. A failed rejection
    // save must not make undo try to delete the confirmed history record.
    if (isConfirmed) candidateFeedbackDraftIdRef.current = null;
    try {
      const draft = onSaveCandidateFeedbackDraft({
        ...(!isConfirmed && candidateFeedbackDraftIdRef.current
          ? { id: candidateFeedbackDraftIdRef.current } : {}),
        outputSignature: loopStateRef.current.outputSignature,
        candidates: candidateFeedbackEntries,
        rejected: true
      });
      if (!draft?.id) throw new Error('Rejection not saved');
      candidateFeedbackDraftIdRef.current = draft.id;
      setCandidateFeedbackNotice('');
    } catch (_) {
      setCandidateFeedbackNotice(copy.rejectionSaveFailed);
    }
  }

  function handleUndoRejection() {
    if (!candidatesRejectedRef.current) return;
    handleStopPlayback();
    try {
      const id = candidateFeedbackDraftIdRef.current;
      if (id && onDiscardCandidateFeedbackDraft(id) === false)
        throw new Error('Rejection not removed');
    } catch (_) {
      setCandidateFeedbackNotice(copy.rejectionUndoFailed);
      return;
    }
    candidateFeedbackDraftIdRef.current = null;
    candidatesRejectedRef.current = false;
    setCandidatesRejected(false);
    setCandidateFeedbackEntries(normalizeExpressionCandidates([], loopStateRef.current.candidateSentences));
    setCandidateFeedbackNotice('');
    setAiNotice(copy.rejectionUndone);
    // No new request or autoplay schedule: undo only restores the choices.
  }

  function handleReplayAll() {
    if (candidatesRejectedRef.current) return;
    cancelPendingAi();
    autoplayControllerRef.current.cancel();
    setIsSaved(false);
    setFavoriteSaveError('');
    setExpressionConfirmError('');
    // Playback consumes the current set, including AI and restored favorites.
    // It must never regenerate templates or issue another AI request.
    playCandidates({ ...loopStateRef.current, selectedIndex: 0 });
  }

  async function handlePlayOne(index) {
    if (candidatesRejectedRef.current || !loopState.candidateSentences[index]) {
      return;
    }

    cancelExpressionShare();
    cancelPendingAi();
    autoplayControllerRef.current.cancel();
    const runId = playRunRef.current + 1;
    playRunRef.current = runId;
    playbackActiveRef.current = true;
    onCancelSpeech();
    setLoopState(current => selectExpressionCandidate(current, index));
    setCandidatePhase('playing');
    setSpeechAvailable(true);
    setIsSaved(false);
    setFavoriteSaveError('');
    if (index !== loopState.selectedIndex) {
      setIsConfirmed(false);
      draftCompletedRef.current = false;
    }
    setExpressionConfirmError('');

    const success = await speakSentence(loopState.candidateSentences[index]);

    if (playRunRef.current === runId) {
      playbackActiveRef.current = false;
      setSpeechAvailable(success);
      setCandidatePhase('done');
    }
  }

  function handleSavePhrase() {
    if (candidatesRejectedRef.current) return;
    cancelPendingAi();
    handlePatientInteraction();
    const entry = buildExpressionSavedPhraseEntry(loopState);

    if (!entry || isSaved) {
      return;
    }

    try {
      if (onSavePhrase(entry) === false) throw new Error('本次收藏尚未保存。');
      setFavoriteSaveError('');
      setIsSaved(true);
    } catch (error) {
      setFavoriteSaveError(`${error.message || '常用语保存失败。'} 当前表达已保留，请整理后或稍后重试收藏。`);
    }
  }

  function handleConfirmExpression() {
    if (candidatesRejectedRef.current || confirmPendingRef.current || draftCompletedRef.current) return;
    cancelPendingAi();
    handlePatientInteraction();
    const entry = buildExpressionHistoryEntry(
      loopState,
      candidateFeedbackEntries
    );

    if (!entry || isConfirmed) {
      return;
    }

    confirmPendingRef.current = true;
    let persisted;
    try {
      if (expressionDraftService && !persistDraft()) return;
      const finalEntry = {
        ...entry,
        ...(!expressionDraftService && candidateFeedbackDraftIdRef.current
          ? { id: candidateFeedbackDraftIdRef.current }
          : {}),
        sessionId: conversationSessionId,
        recordStatus: 'confirmed'
      };
      persisted = expressionDraftService
        ? expressionDraftService.confirm(finalEntry)
        : persistExpressionHistoryEntry(finalEntry, onAppendHistory);
    } catch (error) {
      setExpressionConfirmError(`${copy.expressionSaveFailed} ${error.message}`);
      return;
    } finally { confirmPendingRef.current = false; }
    if (!persisted) {
      setExpressionConfirmError(copy.expressionSaveFailed);
      return;
    }
    if (persisted && persisted.id) {
      candidateFeedbackDraftIdRef.current = persisted.id;
    }
    setExpressionConfirmError('');
    draftCompletedRef.current = true;
    setIsConfirmed(true);
    if (onDraftConfirmed) onDraftConfirmed(persisted);
    if (expressionDraftService) setDraftNotice('已确认，上次未完成草稿已结束。');
  }

  async function handleShareExpression() {
    if (
      candidatesRejectedRef.current || sharePendingRef.current ||
      !shareMountedRef.current || loopState.outputSignature !== outputSignature
    ) return;
    const sentence =
      loopState.candidateSentences[loopState.selectedIndex] || '';
    if (!sentence || typeof onShareExpression !== 'function') return;

    const runId = ++shareRunRef.current;
    const isCurrent = () =>
      shareMountedRef.current && !candidatesRejectedRef.current &&
      shareRunRef.current === runId &&
      shareContextRef.current.outputSignature === outputSignature &&
      shareContextRef.current.outputSnapshotKey === outputSnapshotKey &&
      shareContextRef.current.conversationSessionId === conversationSessionId &&
      shareContextRef.current.candidateSentences === loopState.candidateSentences &&
      shareContextRef.current.selectedIndex === loopState.selectedIndex;
    if (!isCurrent()) return;
    sharePendingRef.current = true;
    // Sharing is an explicit choice: freeze the chosen candidate for keyboard
    // activation too, without regenerating text or starting speech.
    cancelPendingAi();
    handlePatientInteraction();
    setIsSharingExpression(true);
    setExpressionShareNotice(copy.sharingExpression);
    try {
      const result = await onShareExpression(sentence, { isCurrent });
      if (!isCurrent()) return;
      setExpressionShareNotice(
        (result && result.message) || '当前环境无法完成分享，表达内容仍会保留。'
      );
    } catch (error) {
      if (isCurrent()) setExpressionShareNotice('当前环境无法完成分享，表达内容仍会保留。');
    } finally {
      if (isCurrent()) {
        sharePendingRef.current = false;
        setIsSharingExpression(false);
      }
    }
  }

  function handleCandidateFeedback(candidateIndex, feedback) {
    if (candidatesRejectedRef.current) return;
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
    if (applySavedPending.current) return;
    applySavedPending.current = true;
    Promise.resolve().then(() => { applySavedPending.current = false; });
    const key = JSON.stringify([item.id, item.sentence, item.output]);
    const startsNewExpression = draftCompletedRef.current ||
      expressionDraftService?.getCurrent()?.status === 'confirmed';
    if (!startsNewExpression && appliedSavedRef.current === key && loopStateRef.current.candidateSentences[0] === item.sentence &&
        outputSignature === buildExpressionOutputSignature(item.output)) return;
    // Reusing the same rejected sequence first requires an explicit undo.
    if (candidatesRejectedRef.current &&
        buildExpressionOutputSignature(item.output) === outputSignature) return;
    const nextState = buildExpressionLoopStateFromSavedPhrase(item);
    if (startsNewExpression && expressionDraftService) {
      try {
        // An identical reviewed snapshot is a new expression only after the
        // prior confirmation finished. Persist it before changing the UI;
        // snapshot equality must not retain the completed draft or AI ticket.
        expressionDraftService.save({
          pipeline: nextState,
          rejected: false,
          candidateFeedbackEntries: normalizeExpressionCandidates([], nextState.candidateSentences),
          pendingAi: null
        }, { startNew: true });
      } catch (error) {
        setExpressionConfirmError('新表达暂时未能保存到本机，原内容已保留，请重试载入。');
        return;
      }
      setDraftSaveFailed(false);
      setDraftNotice('已保存到本机');
      setPendingAiRecovery(null);
    }
    cancelExpressionShare();
    cancelPendingAi();
    handlePatientInteraction();

    onCancelSpeech();
    onApplyOutput(item.output);
    previousOutputSignatureRef.current = nextState.outputSignature;
    previousOutputSnapshotRef.current = JSON.stringify(item.output);
    draftCompletedRef.current = false;
    restoredAutoplayPausedRef.current = false;
    loopStateRef.current = nextState;
    setLoopState(nextState);
    resetCandidateFeedback(nextState);
    setCandidatePhase('ready');
    setSpeechAvailable(true);
    setIsSaved(true);
    setIsConfirmed(false);
    setExpressionConfirmError('');
    appliedSavedRef.current = key;
    onUseSavedPhrase(item);
    autoplayControllerRef.current.schedule(
      nextState.candidateSentences,
      candidateAutoplayDelaySeconds
    );
  }

  async function playSavedPhrase(item, options = {}) {
    if (savedPlaybackPending.current) return;
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
    savedPlaybackPending.current = true;
    if (options.showDialog) { setPlaybackPhrase(item); savedPlaybackCounted.current = false; }
    setSavedPlaybackNotice('正在播报整句…');
    setCandidatePhase('playing');
    setSpeechAvailable(true);

    const success = await speakSentence(sentence, item.output || []);
    if (playRunRef.current === runId) {
      savedPlaybackPending.current = false;
      playbackActiveRef.current = false;
      setSpeechAvailable(success);
      setSavedPlaybackNotice(success ? '播报完成，可重听或返回。' : '播报未完成，原句和图片仍保留。');
      if (success && !savedPlaybackCounted.current) {
        savedPlaybackCounted.current = true;
        onUseSavedPhrase(item);
      }
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

  function handleViewSavedPhrase(item) {
    cancelExpressionShare();
    cancelPendingAi();
    handlePatientInteraction();
    autoplayControllerRef.current.cancel();
    stopPlaybackQueue();
    savedPlaybackPending.current = false;
    savedPlaybackCounted.current = false;
    setPlaybackPhrase(item);
    setSavedPlaybackNotice('仅查看，点击“播报整句”才会播放。');
  }

  function handleCloseSavedPhrasePlayback() {
    savedPlaybackPending.current = false;
    savedPlaybackCounted.current = false;
    autoplayControllerRef.current.cancel({
      stopActivePlayback: false
    });
    if (playbackActiveRef.current) stopPlaybackQueue();
    else onCancelSpeech();
    setPlaybackPhrase(null);
  }

  async function handleGenerateAiCandidates() {
    if (candidatesRejectedRef.current || !output.length || aiPendingRef.current) return;
    const startNewDraft = draftCompletedRef.current;
    cancelExpressionShare();
    autoplayControllerRef.current.cancel();
    stopPlaybackQueue();
    if (!aiAvailable || typeof onGenerateAiSentences !== 'function') {
      const nextState = buildExpressionLoopState(output);
      draftCompletedRef.current = false;
      setLoopState(nextState);
      resetCandidateFeedback(nextState);
      setCandidatePhase('ready');
      setIsSaved(false);
      setFavoriteSaveError('');
      setIsConfirmed(false);
      setExpressionConfirmError('');
      setAiNotice(copy.localApplied);
      autoplayControllerRef.current.schedule(
        nextState.candidateSentences,
        candidateAutoplayDelaySeconds
      );
      return;
    }

    let request = buildCommunicationAiSentenceRequest({
      output,
      boards,
      context: conversationContext
    });
    draftCompletedRef.current = false;
    if (expressionDraftService) {
      if (!persistDraft({}, { startNew: startNewDraft })) return;
      try { request = attachExpressionDraftRequest(request, expressionDraftService); }
      catch (error) {
        setAiNotice(error.message);
        return;
      }
    }
    const runId = aiRunRef.current + 1;
    const requestContextKey = getAiContextKey ? getAiContextKey() : aiContextKey;
    const currentAiRun = () => aiRunRef.current === runId &&
      (!getAiContextKey || getAiContextKey() === requestContextKey);
    aiRunRef.current = runId;
    aiPendingRef.current = true;
    setIsGeneratingAi(true);
    setAiNotice('');

    try {
      const response = await onGenerateAiSentences(request);
      if (!currentAiRun()) return;
      const nextState = applyCommunicationAiSentenceResponse(
        buildExpressionLoopState(output),
        response
      );
      if (!nextState || nextState.isOfflineFallback !== false) {
        setAiNotice(copy.aiFailed);
        setPendingAiRecovery(expressionDraftService?.getCurrent()?.snapshot?.pendingAi || null);
        return;
      }
      setLoopState(nextState);
      loopStateRef.current = nextState;
      resetCandidateFeedback(nextState);
      draftCompletedRef.current = false;
      setPendingAiRecovery(null);
      if (expressionDraftService) persistDraft({
        pendingAi: null,
        candidateFeedbackEntries: normalizeExpressionCandidates([], nextState.candidateSentences)
      });
      setCandidatePhase('ready');
      setIsSaved(false);
      setFavoriteSaveError('');
      setIsConfirmed(false);
      setExpressionConfirmError('');
      setAiNotice(copy.aiApplied);
      autoplayControllerRef.current.schedule(
        nextState.candidateSentences,
        candidateAutoplayDelaySeconds
      );
    } catch (error) {
      if (currentAiRun()) {
        setAiNotice(getAiFailureMessage(error, copy));
        setPendingAiRecovery(expressionDraftService?.getCurrent()?.snapshot?.pendingAi || null);
        // An unknown request is not a new candidate result. Never restart the
        // previous candidates' countdown while telling the user to recover it.
      }
    } finally {
      if (aiRunRef.current === runId) {
        aiPendingRef.current = false;
        setIsGeneratingAi(false);
      }
    }
  }

  function handlePictogramSuggestion(tile) {
    cancelExpressionShare();
    onPictogramUsed(tile.boardId, tile.id);
    onApplyOutput([...output, tile]);
  }

  if (restoreChoice !== 'active') {
    const snapshot = initialDraft?.snapshot;
    const sentence = snapshot?.pipeline?.candidateSentences?.[snapshot.pipeline.selectedIndex] ||
      snapshot?.pipeline?.outputSnapshot?.map(item => item.label).join(' / ');
    return <div className="CommunicationSupportPanel__section" aria-label="恢复未完成表达">
      <p id="expression-draft-save-status" role={draftSaveFailed ? 'alert' : 'status'}>{draftNotice || '有一份未完成的表达，请选择是否继续。'}</p>
      {restoreChoice !== 'later' && <>
        {sentence && <p>上次表达：{sentence}</p>}
        {initialDraft?.updatedAt && <p>本机保存时间：{new Date(initialDraft.updatedAt).toLocaleString()}</p>}
        <Button id="expression-draft-continue-button" variant="contained" color="primary"
          disabled={!snapshot} onClick={continueDraft}>继续上次表达</Button>
        <Button id="expression-draft-new-button" onClick={() => setConfirmingDiscard(true)}>开始新表达</Button>
        <Button id="expression-draft-defer-button" onClick={() => setRestoreChoice('later')}>稍后处理</Button>
      </>}
      {restoreChoice === 'later' && <Button onClick={() => setRestoreChoice('pending')}>查看待恢复表达</Button>}
      {confirmingDiscard && <div role="alert">
        <p>将丢弃这份未完成表达；图库、收藏和历史保持不变。丢弃不代表取消已提交的 AI 执行或退款。</p>
        <Button id="expression-draft-confirm-new-button" onClick={discardAndStart}>确认开始新表达</Button>
        <Button onClick={() => setConfirmingDiscard(false)}>取消</Button>
      </div>}
      <CommunicationPlaybackDialog
        open={Boolean(playbackPhrase)} item={playbackPhrase}
        isSpeaking={candidatePhase === 'playing'} statusLabel={savedPlaybackNotice}
        replayLabel="播报整句" doneLabel="返回"
        onReplay={handleReplaySavedPhrase} onClose={handleCloseSavedPhrasePlayback}
      />
    </div>;
  }

  return (
    <div
      className="CommunicationSupportPanel__content CommunicationSupportPanel__content--expression"
      onMouseDownCapture={handlePatientInteraction}
      onTouchStartCapture={handlePatientInteraction}
      onWheelCapture={handlePatientInteraction}
      onScrollCapture={handlePatientInteraction}
    >
      {expressionDraftService && <div className="CommunicationSupportPanel__draftStatus">
        <p id="expression-draft-save-status" role={draftSaveFailed ? 'alert' : 'status'}>{draftNotice}</p>
        {draftSaveFailed && <Button onClick={() => persistDraft()}>重试保存表达</Button>}
      </div>}
      <div className="CommunicationSupportPanel__section CommunicationSupportPanel__expressionSection">
        <div className="CommunicationSupportPanel__expressionEditor">
        <div className="CommunicationSupportPanel__sectionHeader">
          <h4>{copy.expressSectionTitle}</h4>
          <span className="CommunicationSupportPanel__hint">
            {copy.currentBoard}：{activeBoardName || copy.noBoard}
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
                    onLoad={event => {
                      event.currentTarget.style.display = '';
                      const notice = event.currentTarget.nextElementSibling;
                      if (notice) notice.hidden = true;
                    }}
                    onError={event => {
                      event.currentTarget.style.display = 'none';
                      const notice = event.currentTarget.nextElementSibling;
                      if (notice) notice.hidden = false;
                    }}
                  />
                )}
                {item.image && <span hidden className="CommunicationSupportPanel__sequenceMissing">图片不可用，保留文字</span>}
                <span className="CommunicationSupportPanel__sequenceLabel">
                  {item.label}
                </span>
                <div className="CommunicationSupportPanel__sequenceActions">
                  <ImageRepairControls tile={item}
                    operationKey={JSON.stringify([conversationSessionId, index, output])}
                    onAdopt={tile => repairOutputImage(index, tile)}
                    onKeepText={() => repairOutputImage(index, { ...item, image: '' })}
                  />
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
        </div>
        <div className="CommunicationSupportPanel__expressionCandidates">
        <div className="CommunicationSupportPanel__actions">
          <PatientActionButton
            action={PATIENT_ACTION_IDS.improve}
            color="primary"
            variant="outlined"
            onClick={handleGenerateAiCandidates}
            disabled={candidatesRejected || !output.length || isGeneratingAi}
            label={isGeneratingAi ? '生成中' : pendingAiRecovery ? '核对上次结果' : copy.aiCandidates}
            ariaLabel={isGeneratingAi ? copy.aiGenerating : pendingAiRecovery ? '核对上次结果' : copy.aiCandidates}
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.playAll}
            color="primary"
            variant="contained"
            onClick={handleReplayAll}
            disabled={candidatesRejected || !loopState.candidateSentences.length}
            label="全播"
            ariaLabel={copy.generateAndSpeak}
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.stop}
            color="primary"
            variant="outlined"
            onClick={handleStopPlayback}
            disabled={!output.length && !isGeneratingAi}
            label="停止"
            ariaLabel={copy.stopSpeech}
          />
        </div>
        {output.length > 0 && (
          <div className="CommunicationSupportPanel__actions">
            <PatientActionButton
              action={PATIENT_ACTION_IDS.notUnderstood}
              variant="outlined"
              onClick={handleRejectCandidates}
              label={copy.rejectCandidates}
              ariaLabel="这组候选都不对，停止并保留图片"
            />
            {candidatesRejected && (
              <PatientActionButton
                action={PATIENT_ACTION_IDS.undo}
                variant="outlined"
                onClick={handleUndoRejection}
                label={copy.undoRejection}
                ariaLabel={copy.undoRejection}
              />
            )}
          </div>
        )}
        {candidatesRejected && (
          <div className="CommunicationSupportPanel__environmentNotice" role="status">
            {copy.candidatesRejected}
            {candidateFeedbackNotice && <p role="alert">{candidateFeedbackNotice}</p>}
          </div>
        )}
        {!aiAvailable && aiUnavailableReason && (
          <p role="status">{aiUnavailableReason}</p>
        )}
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
        {!candidatesRejected && candidatePhase !== 'idle' && (
          <div className="CommunicationSupportPanel__resultMeta" role="status">
            {pendingAutoplayDelayMs
              ? `${pendingAutoplayDelayMs / 1000} ${copy.autoplayEnabled}`
              : candidatePhase === 'playing'
              ? copy.playbackSpeaking
              : candidateAutoplayDelaySeconds
              ? copy.autoplayPaused
              : copy.autoplayDisabled}
          </div>
        )}
        {!candidatesRejected && candidatePhase !== 'idle' && (
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
        {!candidatesRejected && candidatePhase !== 'idle' && (
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
        {favoriteSaveError && (
          <div className="CommunicationSupportPanel__candidateFeedbackStatus" role="alert">
            {favoriteSaveError}
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
      </div>

      <div className="CommunicationSupportPanel__section">
        <div className="CommunicationSupportPanel__sectionHeader">
          <h4>{copy.savedPhrasesTitle}</h4>
          <span className="CommunicationSupportPanel__hint">
            {copy.savedPhrasesHint}
          </span>
        </div>
        <LifeContextFilter items={savedPhrases} value={lifeContext} onChange={setLifeContext} />
        <div className="CommunicationSupportPanel__savedList">
          {contextPhrases.length ? (
            contextPhrases.map(item => (
              <SavedPhraseRow
                key={`${item.careSharedReadOnly ? 'shared' : 'own'}:${item.id ||
                  item.sentence}`}
                item={item}
                onApply={handleApplySavedPhrase}
                onPlay={handlePlaySavedPhrase}
                onView={handleViewSavedPhrase}
                playLabel={copy.quickPlay}
                reuseLabel={
                  item.careSharedReadOnly ? '重用家庭共享' : copy.reuse
                }
              />
            ))
          ) : (
            <div className="CommunicationSupportPanel__empty">
              {savedPhrases.length ? '这个情境还没有常用语，可在照护工具中整理。' : copy.noSavedPhrases}
            </div>
          )}
        </div>
      </div>
      <CommunicationPlaybackDialog
        open={Boolean(playbackPhrase)}
        item={playbackPhrase}
        isSpeaking={candidatePhase === 'playing'}
        statusLabel={savedPlaybackNotice}
        replayLabel="播报整句"
        doneLabel="返回"
        onReplay={handleReplaySavedPhrase}
        onClose={handleCloseSavedPhrasePlayback}
      />
    </div>
  );
}

ExpressionLoopPanel.propTypes = {
  savedPhraseRequest: PropTypes.object,
  onSavedPhraseRequestHandled: PropTypes.func,
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
  aiUnavailableReason: PropTypes.string,
  aiContextKey: PropTypes.string,
  getAiContextKey: PropTypes.func,
  onGenerateAiSentences: PropTypes.func,
  candidateAutoplayDelaySeconds: PropTypes.number,
  candidateFeedbackSyncAvailable: PropTypes.bool,
  expressionDraftService: PropTypes.object,
  allowLegacyOutput: PropTypes.bool,
  active: PropTypes.bool,
  onDraftConfirmed: PropTypes.func,
  copyOverrides: PropTypes.object
};

ExpressionLoopPanel.defaultProps = {
  activeBoardId: null,
  savedPhrases: [],
  conversationContext: null,
  aiAvailable: false,
  aiUnavailableReason: '',
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
