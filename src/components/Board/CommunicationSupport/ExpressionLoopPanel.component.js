import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@material-ui/core/Button';
import {
  buildExpressionHistoryEntry,
  buildExpressionLoopState,
  buildExpressionLoopStateFromSavedPhrase,
  buildExpressionOutputSignature,
  buildExpressionSavedPhraseEntry,
  selectExpressionCandidate
} from '../../../common/communicationSupport/expressionPipeline';

const DEFAULT_COPY = {
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
  phraseSaved: '已收藏',
  confirmExpression: '确认此句',
  expressionConfirmed: '已确认',
  savedPhrasesTitle: '常用短句',
  savedPhrasesHint: '本地保存最近 20 条',
  reuse: '重用',
  noSavedPhrases: '还没有收藏的短句。'
};

const SPEECH_COMPLETION_TIMEOUT_MS = 12000;

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

export default function ExpressionLoopPanel({
  output,
  activeBoardId,
  savedPhrases,
  onApplyOutput,
  onSpeak,
  onCancelSpeech,
  onSavePhrase,
  onAppendHistory,
  copyOverrides
}) {
  const copy = { ...DEFAULT_COPY, ...(copyOverrides || {}) };
  const outputSignature = useMemo(
    () => buildExpressionOutputSignature(output),
    [output]
  );
  const [loopState, setLoopState] = useState(() =>
    buildExpressionLoopState(output)
  );
  const [candidatePhase, setCandidatePhase] = useState('idle');
  const [speechAvailable, setSpeechAvailable] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const playRunRef = useRef(0);
  const speechTimeoutsRef = useRef(new Set());
  const previousOutputSignatureRef = useRef(outputSignature);

  useEffect(
    () => {
      if (previousOutputSignatureRef.current === outputSignature) {
        return;
      }

      previousOutputSignatureRef.current = outputSignature;
      playRunRef.current += 1;
      onCancelSpeech();
      setLoopState(buildExpressionLoopState(output));
      setCandidatePhase('idle');
      setSpeechAvailable(true);
      setIsSaved(false);
      setIsConfirmed(false);
    },
    [onCancelSpeech, output, outputSignature]
  );

  useEffect(
    () => {
      const speechTimeouts = speechTimeoutsRef.current;

      return () => {
        playRunRef.current += 1;
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
      setCandidatePhase('done');
    }
  }

  function handlePrepareCandidates() {
    const nextState = buildExpressionLoopState(output);

    if (!nextState.candidateSentences.length) {
      return;
    }

    setLoopState(nextState);
    setIsSaved(false);
    setIsConfirmed(false);
    playCandidates(nextState);
  }

  function handleStopPlayback() {
    playRunRef.current += 1;
    onCancelSpeech();
    setCandidatePhase('done');
  }

  function handleReplayAll() {
    setIsSaved(false);
    setIsConfirmed(false);
    playCandidates({ ...loopState, selectedIndex: 0 });
  }

  async function handlePlayOne(index) {
    if (!loopState.candidateSentences[index]) {
      return;
    }

    const runId = playRunRef.current + 1;
    playRunRef.current = runId;
    onCancelSpeech();
    setLoopState(current => selectExpressionCandidate(current, index));
    setCandidatePhase('playing');
    setSpeechAvailable(true);
    setIsSaved(false);
    setIsConfirmed(false);

    const success = await speakSentence(loopState.candidateSentences[index]);

    if (playRunRef.current === runId) {
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
    const entry = buildExpressionHistoryEntry(loopState);

    if (!entry || isConfirmed) {
      return;
    }

    onAppendHistory(entry);
    setIsConfirmed(true);
  }

  function handleApplySavedPhrase(item) {
    const nextState = buildExpressionLoopStateFromSavedPhrase(item);

    onCancelSpeech();
    onApplyOutput(item.output);
    previousOutputSignatureRef.current = nextState.outputSignature;
    setLoopState(nextState);
    setCandidatePhase('done');
    setSpeechAvailable(true);
    setIsSaved(true);
    setIsConfirmed(false);
  }

  return (
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
        {candidatePhase !== 'idle' && (
          <div className="CommunicationSupportPanel__candidates">
            {loopState.candidateSentences.map((sentence, index) => (
              <button
                key={sentence}
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
            ))}
          </div>
        )}
        {candidatePhase !== 'idle' && (
          <div className="CommunicationSupportPanel__actions">
            <Button
              color="primary"
              variant="outlined"
              onClick={handleReplayAll}
              disabled={!loopState.candidateSentences.length}
            >
              {copy.replayAll}
            </Button>
            <Button
              color="primary"
              variant="outlined"
              onClick={handleSavePhrase}
              disabled={!loopState.candidateSentences.length || isSaved}
            >
              {isSaved ? copy.phraseSaved : copy.savePhrase}
            </Button>
            <Button
              color="primary"
              variant="contained"
              onClick={handleConfirmExpression}
              disabled={!loopState.candidateSentences.length || isConfirmed}
            >
              {isConfirmed ? copy.expressionConfirmed : copy.confirmExpression}
            </Button>
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
  );
}

ExpressionLoopPanel.propTypes = {
  output: PropTypes.arrayOf(PropTypes.object).isRequired,
  activeBoardId: PropTypes.string,
  savedPhrases: PropTypes.arrayOf(PropTypes.object),
  onApplyOutput: PropTypes.func.isRequired,
  onSpeak: PropTypes.func.isRequired,
  onCancelSpeech: PropTypes.func.isRequired,
  onSavePhrase: PropTypes.func.isRequired,
  onAppendHistory: PropTypes.func.isRequired,
  copyOverrides: PropTypes.object
};

ExpressionLoopPanel.defaultProps = {
  activeBoardId: null,
  savedPhrases: [],
  copyOverrides: null
};
