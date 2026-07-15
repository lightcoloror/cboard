import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import TextField from '@material-ui/core/TextField';
import Symbol from '../Symbol';
import ReceiverDisplay from './ReceiverDisplay.component';
import { CBOARD_COMMUNICATION_EXAMPLE_PHRASES } from '../../../common/communicationSupport/cboardConceptProfiles';
import { buildCommunicationTileCatalog } from '../../../common/communicationSupport/symbolMatching';
import {
  buildReceiverHistoryEntry,
  buildReceiverLoopState,
  buildReceiverMatchQuality,
  buildReceiverOutputPreview,
  deleteReceiverReviewItem,
  moveReceiverReviewItem,
  normalizeReceiverMatchType,
  replaceReceiverReviewItem
} from '../../../common/communicationSupport/receiverPipeline';

const DEFAULT_COPY = {
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
  matchSummaryLabel: '匹配结果',
  reviewRecommended: '请重点复核未匹配或部分匹配项',
  reviewReady: '已全部匹配，发送前请确认',
  voiceUnavailable: '当前环境不支持浏览器语音输入，请使用文字输入。',
  matchTypeExact: '精确匹配',
  matchTypeSynonym: '同义词匹配',
  matchTypeLexicon: '词典匹配',
  matchTypePartial: '部分匹配',
  matchTypeOnline: '在线补图',
  matchTypeAi: '智能重分词',
  matchTypeManual: '手工选择',
  matchTypeMissing: '未匹配',
  expressHistoryLabel: '表达',
  receiveHistoryLabel: '接收'
};

function getCatalogItemDisplayLabel(item) {
  return (item && (item.displayLabel || (item.tile && item.tile.label))) || '';
}

function getMatchTypeLabel(matchType, copy) {
  const normalizedMatchType = normalizeReceiverMatchType(matchType);
  const copyKey =
    'matchType' +
    normalizedMatchType.charAt(0).toUpperCase() +
    normalizedMatchType.slice(1);

  return copy[copyKey] || copy.matchTypeMissing;
}

function HistoryRow({ item, copy }) {
  const title =
    item.direction === 'express'
      ? item.sentence || item.labels.join('')
      : item.inputText || item.labels.join('');

  return (
    <div className="CommunicationSupportPanel__historyRow">
      <div className="CommunicationSupportPanel__historyTitle">{title}</div>
      <div className="CommunicationSupportPanel__meta">
        {item.direction === 'express'
          ? copy.expressHistoryLabel
          : copy.receiveHistoryLabel}{' '}
        · {item.labels.join(' / ')}
      </div>
    </div>
  );
}

HistoryRow.propTypes = {
  item: PropTypes.shape({
    direction: PropTypes.string.isRequired,
    sentence: PropTypes.string,
    inputText: PropTypes.string,
    labels: PropTypes.arrayOf(PropTypes.string).isRequired
  }).isRequired,
  copy: PropTypes.object.isRequired
};

function MatchRow({
  match,
  onJumpBoard,
  onMoveLeft,
  onMoveRight,
  onDelete,
  onSwap,
  copy
}) {
  const hasMatch = Boolean(match.tile);
  const matchedLabel = getCatalogItemDisplayLabel(match.tile);

  return (
    <div className="CommunicationSupportPanel__matchRow">
      <div className="CommunicationSupportPanel__matchMain">
        <div className="CommunicationSupportPanel__matchPreview">
          {hasMatch ? (
            <Symbol
              className="CommunicationSupportPanel__symbol CommunicationSupportPanel__symbol--preview"
              image={match.tile.tile.image}
              keyPath={match.tile.tile.keyPath}
              label={matchedLabel}
              labelpos="Below"
            />
          ) : (
            <div className="CommunicationSupportPanel__missingPreview">?</div>
          )}
        </div>
        <div className="CommunicationSupportPanel__matchText">
          <span className="CommunicationSupportPanel__token">
            {match.token}
          </span>
          <span
            className={
              hasMatch
                ? 'CommunicationSupportPanel__status CommunicationSupportPanel__status--ok'
                : 'CommunicationSupportPanel__status CommunicationSupportPanel__status--miss'
            }
          >
            {hasMatch ? matchedLabel : copy.unmatched}
          </span>
          {hasMatch && (
            <span className="CommunicationSupportPanel__meta">
              {getMatchTypeLabel(match.matchType, copy)} ·{' '}
              {match.tile.boardName}
            </span>
          )}
        </div>
      </div>
      <div className="CommunicationSupportPanel__matchActions">
        <Button color="primary" size="small" onClick={() => onSwap(match.id)}>
          {copy.replaceAction}
        </Button>
        {hasMatch && match.tile.boardId && (
          <Button
            color="primary"
            size="small"
            onClick={() => onJumpBoard(match.tile.boardId)}
          >
            {copy.sourceBoard}
          </Button>
        )}
        <Button size="small" onClick={() => onMoveLeft(match.id)}>
          {copy.moveLeft}
        </Button>
        <Button size="small" onClick={() => onMoveRight(match.id)}>
          {copy.moveRight}
        </Button>
        <Button size="small" onClick={() => onDelete(match.id)}>
          {copy.remove}
        </Button>
      </div>
    </div>
  );
}

MatchRow.propTypes = {
  match: PropTypes.shape({
    id: PropTypes.string.isRequired,
    token: PropTypes.string.isRequired,
    matchType: PropTypes.string.isRequired,
    tile: PropTypes.shape({
      boardId: PropTypes.string,
      boardName: PropTypes.string,
      displayLabel: PropTypes.string,
      tile: PropTypes.shape({
        label: PropTypes.string
      })
    })
  }).isRequired,
  onJumpBoard: PropTypes.func.isRequired,
  onMoveLeft: PropTypes.func.isRequired,
  onMoveRight: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onSwap: PropTypes.func.isRequired,
  copy: PropTypes.object.isRequired
};

export default function ReceiverLoopPanel({
  boards,
  intl,
  onApplyOutput,
  onJumpBoard,
  onAppendHistory,
  historyItems,
  speech,
  copyOverrides
}) {
  const copy = { ...DEFAULT_COPY, ...(copyOverrides || {}) };
  const [inputText, setInputText] = useState('');
  const [receivePhase, setReceivePhase] = useState('idle');
  const [reviewItems, setReviewItems] = useState([]);
  const [showSwapId, setShowSwapId] = useState(null);
  const [swapQuery, setSwapQuery] = useState('');
  const [showDisplay, setShowDisplay] = useState(false);
  const pendingMatchTimerRef = useRef(null);
  const matchGenerationRef = useRef(0);

  useEffect(() => {
    return () => {
      matchGenerationRef.current += 1;
      if (pendingMatchTimerRef.current !== null) {
        window.clearTimeout(pendingMatchTimerRef.current);
      }
    };
  }, []);

  const tileCatalog = useMemo(
    () => buildCommunicationTileCatalog(boards, intl),
    [boards, intl]
  );

  const swapResults = useMemo(
    () => {
      const query = swapQuery.trim();

      if (!query) {
        return tileCatalog.slice(0, 16);
      }

      return tileCatalog
        .filter(item => {
          return (
            item.labels.some(label => label.indexOf(query) >= 0) ||
            item.synonyms.some(synonym => synonym.indexOf(query) >= 0)
          );
        })
        .slice(0, 24);
    },
    [swapQuery, tileCatalog]
  );

  const missingTokens = useMemo(
    () => {
      return reviewItems.filter(item => !item.tile).map(item => item.token);
    },
    [reviewItems]
  );

  const matchQuality = useMemo(() => buildReceiverMatchQuality(reviewItems), [
    reviewItems
  ]);

  const receiveOutputPreview = useMemo(
    () => {
      return buildReceiverOutputPreview(reviewItems);
    },
    [reviewItems]
  );

  const speechState = speech || null;
  const isListening = Boolean(speechState && speechState.isListening);
  const speechError = speechState ? speechState.error : '';

  function invalidatePendingMatch() {
    matchGenerationRef.current += 1;

    if (pendingMatchTimerRef.current !== null) {
      window.clearTimeout(pendingMatchTimerRef.current);
      pendingMatchTimerRef.current = null;
    }

    return matchGenerationRef.current;
  }

  function openReviewForText(text) {
    const result = buildReceiverLoopState(text, boards, { intl });
    setReviewItems(result.reviewItems);
    setReceivePhase('review');
  }

  function scheduleReviewForText(text) {
    const normalizedText = String(text || '').trim();

    if (!normalizedText) {
      return;
    }

    const generation = invalidatePendingMatch();
    setReceivePhase('matching');

    pendingMatchTimerRef.current = window.setTimeout(() => {
      if (matchGenerationRef.current !== generation) {
        return;
      }

      pendingMatchTimerRef.current = null;
      openReviewForText(normalizedText);
    }, 30);
  }

  function handleInputTextChange(nextText) {
    invalidatePendingMatch();
    setInputText(nextText);
    setReviewItems([]);
    setReceivePhase('idle');
  }

  function handleMatch() {
    scheduleReviewForText(inputText);
  }

  function handleApplyReceiveOutput() {
    const outputItems = buildReceiverOutputPreview(reviewItems);

    if (!outputItems.length) {
      return;
    }

    onApplyOutput(outputItems);

    if (onAppendHistory) {
      onAppendHistory(buildReceiverHistoryEntry(inputText, reviewItems));
    }
  }

  function moveReviewItem(itemId, offset) {
    setReviewItems(prevItems =>
      moveReceiverReviewItem(prevItems, itemId, offset)
    );
  }

  function handleDeleteReviewItem(itemId) {
    setReviewItems(prevItems => deleteReceiverReviewItem(prevItems, itemId));
  }

  function handleSwapPick(candidate) {
    setReviewItems(prevItems =>
      replaceReceiverReviewItem(prevItems, showSwapId, candidate)
    );
    setShowSwapId(null);
    setSwapQuery('');
  }

  function handleResetReceive() {
    invalidatePendingMatch();
    if (isListening && speechState) {
      speechState.stopListening();
    }
    setReceivePhase('idle');
    setReviewItems([]);
    setInputText('');
    setShowDisplay(false);
  }

  return (
    <div className="CommunicationSupportPanel__content">
      <div className="CommunicationSupportPanel__section">
        <div className="CommunicationSupportPanel__sectionHeader">
          <h4>{copy.receiveSectionTitle}</h4>
          <span className="CommunicationSupportPanel__hint">
            {copy.receiveHint}
          </span>
        </div>
        <TextField
          fullWidth
          multiline
          minRows={2}
          maxRows={4}
          value={isListening ? speechState.interimText || inputText : inputText}
          variant="outlined"
          placeholder={isListening ? copy.listening : copy.receivePlaceholder}
          onChange={event => {
            if (!isListening) {
              handleInputTextChange(event.target.value);
            }
          }}
          InputProps={{ readOnly: isListening }}
        />
        <div className="CommunicationSupportPanel__actions">
          <Button
            color="primary"
            variant="contained"
            onClick={handleMatch}
            disabled={
              !inputText.trim() || isListening || receivePhase === 'matching'
            }
          >
            {receivePhase === 'matching'
              ? copy.matching
              : copy.generateSequence}
          </Button>
          {speechState && speechState.isAvailable && (
            <Button
              color="primary"
              variant="outlined"
              onClick={() => {
                if (isListening) {
                  speechState.stopListening();
                  return;
                }

                const speechGeneration = invalidatePendingMatch();
                setInputText('');
                setReviewItems([]);
                setReceivePhase('idle');
                speechState.startListening(finalText => {
                  if (matchGenerationRef.current !== speechGeneration) {
                    return;
                  }

                  setInputText(finalText);
                  scheduleReviewForText(finalText);
                });
              }}
            >
              {isListening ? copy.stopRecording : copy.voiceInput}
            </Button>
          )}
          <Button
            color="primary"
            variant="outlined"
            onClick={handleResetReceive}
          >
            {copy.resetInput}
          </Button>
        </div>
        {speechState && !speechState.isAvailable && (
          <div
            className="CommunicationSupportPanel__environmentNotice"
            role="status"
          >
            {copy.voiceUnavailable}
          </div>
        )}
        {speechError && (
          <div className="CommunicationSupportPanel__missing">
            {speechError}
          </div>
        )}
        <div className="CommunicationSupportPanel__examples">
          {CBOARD_COMMUNICATION_EXAMPLE_PHRASES.map(phrase => (
            <button
              key={phrase}
              className="CommunicationSupportPanel__example"
              onClick={() => handleInputTextChange(phrase)}
            >
              {phrase}
            </button>
          ))}
        </div>
        {receivePhase === 'review' && (
          <div className="CommunicationSupportPanel__results">
            <div
              className={
                matchQuality.needsReview
                  ? 'CommunicationSupportPanel__quality CommunicationSupportPanel__quality--review'
                  : 'CommunicationSupportPanel__quality CommunicationSupportPanel__quality--ready'
              }
              role="status"
              aria-live="polite"
            >
              <strong>{copy.matchSummaryLabel}：</strong>
              {matchQuality.matchedCount}/{matchQuality.totalCount}
              <span>
                {' · '}
                {matchQuality.needsReview
                  ? copy.reviewRecommended
                  : copy.reviewReady}
              </span>
            </div>
            <div className="CommunicationSupportPanel__resultMeta">
              {copy.previewLabel}：
              {receiveOutputPreview.map(item => item.label).join(' / ') ||
                copy.emptyPreview}
            </div>
            <div className="CommunicationSupportPanel__matches">
              {reviewItems.map(match => (
                <MatchRow
                  key={match.id}
                  match={match}
                  onJumpBoard={onJumpBoard}
                  onMoveLeft={id => moveReviewItem(id, -1)}
                  onMoveRight={id => moveReviewItem(id, 1)}
                  onDelete={handleDeleteReviewItem}
                  onSwap={setShowSwapId}
                  copy={copy}
                />
              ))}
            </div>
            {!!missingTokens.length && (
              <div className="CommunicationSupportPanel__missing">
                {copy.missingLabel}：{missingTokens.join('、')}
              </div>
            )}
            <div className="CommunicationSupportPanel__actions">
              <Button
                color="primary"
                variant="contained"
                onClick={handleApplyReceiveOutput}
                disabled={!receiveOutputPreview.length}
              >
                {copy.sendToOutput}
              </Button>
              <Button
                color="primary"
                variant="outlined"
                onClick={() => setShowDisplay(true)}
                disabled={!receiveOutputPreview.length}
              >
                {copy.fullscreen}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="CommunicationSupportPanel__section">
        <div className="CommunicationSupportPanel__sectionHeader">
          <h4>{copy.recentHistoryTitle}</h4>
          <span className="CommunicationSupportPanel__hint">
            {copy.historyHint}
          </span>
        </div>
        <div className="CommunicationSupportPanel__savedList">
          {historyItems.length ? (
            historyItems.map((item, index) => (
              <HistoryRow
                key={item.createdAt || index}
                item={item}
                copy={copy}
              />
            ))
          ) : (
            <div className="CommunicationSupportPanel__empty">
              {copy.noHistory}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(showSwapId)}
        onClose={() => setShowSwapId(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{copy.replaceSymbol}</DialogTitle>
        <DialogContent dividers>
          <TextField
            fullWidth
            variant="outlined"
            placeholder={copy.searchPlaceholder}
            value={swapQuery}
            onChange={event => setSwapQuery(event.target.value)}
          />
          <div className="CommunicationSupportPanel__swapGrid">
            {swapResults.map(candidate => (
              <button
                key={candidate.id}
                className="CommunicationSupportPanel__swapOption"
                onClick={() => handleSwapPick(candidate)}
              >
                <Symbol
                  className="CommunicationSupportPanel__symbol CommunicationSupportPanel__symbol--swap"
                  image={candidate.tile.image}
                  keyPath={candidate.tile.keyPath}
                  label={getCatalogItemDisplayLabel(candidate)}
                  labelpos="Below"
                />
                <span className="CommunicationSupportPanel__meta">
                  {candidate.boardName}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSwapId(null)} color="primary">
            {copy.close}
          </Button>
        </DialogActions>
      </Dialog>

      <ReceiverDisplay
        open={showDisplay}
        title={copy.fullscreenTitle}
        items={receiveOutputPreview}
        onClose={() => setShowDisplay(false)}
      />
    </div>
  );
}

ReceiverLoopPanel.propTypes = {
  boards: PropTypes.arrayOf(PropTypes.object).isRequired,
  intl: PropTypes.object,
  onApplyOutput: PropTypes.func.isRequired,
  onJumpBoard: PropTypes.func.isRequired,
  onAppendHistory: PropTypes.func,
  historyItems: PropTypes.arrayOf(PropTypes.object),
  speech: PropTypes.shape({
    isAvailable: PropTypes.bool,
    isListening: PropTypes.bool,
    interimText: PropTypes.string,
    error: PropTypes.string,
    stopListening: PropTypes.func,
    startListening: PropTypes.func
  }),
  copyOverrides: PropTypes.object
};

ReceiverLoopPanel.defaultProps = {
  intl: null,
  onAppendHistory: null,
  historyItems: [],
  speech: null,
  copyOverrides: null
};
