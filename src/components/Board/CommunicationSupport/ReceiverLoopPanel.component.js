import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import Checkbox from '@material-ui/core/Checkbox';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import TextField from '@material-ui/core/TextField';
import Symbol from '../Symbol';
import {
  applyCommunicationAiResegmentation,
  buildCommunicationAiResegmentRequest
} from '../../../common/communicationSupport/communicationAi';
import {
  COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES,
  getCommunicationEnhancementLimitScope
} from '../../../common/communicationSupport/communicationEnhancementError';
import ReceiverDisplay from './ReceiverDisplay.component';
import MissingTokenQueue from './MissingTokenQueue.component';
import { CBOARD_COMMUNICATION_EXAMPLE_PHRASES } from '../../../common/communicationSupport/cboardConceptProfiles';
import { buildCommunicationTileCatalog } from '../../../common/communicationSupport/symbolMatching';
import {
  buildReceiverHistoryEntry,
  buildReceiverLoopState,
  buildReceiverMatchQuality,
  buildReceiverOutputPreview,
  createReceiverReviewId,
  deleteReceiverReviewItem,
  insertReceiverReviewItem,
  moveReceiverReviewItem,
  normalizeReceiverMatchType,
  replaceReceiverReviewItem,
  restoreReceiverLoopState
} from '../../../common/communicationSupport/receiverPipeline';
import {
  RECEIVER_CORRECTION_ACTIONS,
  buildReceiverCorrectionFromEdit
} from '../../../common/communicationSupport/receiverLifecycle';
import { RECEIVER_PATIENT_FEEDBACK } from '../../../common/communicationSupport/receiverPatientFeedback';
import {
  formatCommunicationSegmentation,
  parseCommunicationSegmentationInput
} from '../../../common/communicationSupport/segmentation';
import {
  normalizeImageTextRecognitionResponse,
  validateImageTextRecognitionFile
} from '../../../common/communicationSupport/imageTextRecognition';
import {
  buildDialectNormalizationRequest,
  buildLocalDialectNormalization,
  normalizeDialectNormalizationResponse
} from '../../../common/communicationSupport/dialectNormalization';
import {
  normalizeDialectAudioRecognitionResponse,
  validateDialectAudioFile
} from '../../../common/communicationSupport/dialectAudioRecognition';

const DEFAULT_COPY = {
  receiveSectionTitle: '文字转图片',
  receiveHint: '使用当前已加载 boards 内的 tiles 做匹配',
  listening: '聆听中...',
  liveAudioLevel: '实时麦克风音量',
  liveAudioPrivacy: '音量只在本机计算，不保存',
  liveAudioFallback: '正在监听；当前仅显示识别状态，识别结果仍可人工修改。',
  onDeviceSpeechTitle: '设备内语音识别',
  onDeviceSpeechHint:
    '浏览器支持时可下载中文语音包；安装后断网会自动使用本机识别，音频不发送给远端。',
  onDeviceSpeechUse: '优先在本机识别',
  onDeviceSpeechCheck: '检查本地语音包',
  onDeviceSpeechInstall: '下载本地语音包',
  onDeviceSpeechChecking: '正在检查...',
  onDeviceSpeechInstalling: '正在下载...',
  onDeviceSpeechAvailable: '中文本地语音包已就绪。',
  onDeviceSpeechDownloadable: '可下载中文本地语音包。',
  onDeviceSpeechDownloading: '浏览器正在下载中文本地语音包。',
  onDeviceSpeechUnavailable: '当前浏览器或设备暂无中文本地语音包。',
  onDeviceSpeechError: '本地语音包检查失败，仍可使用在线识别或文字输入。',
  receivePlaceholder: '例如：想喝水、想要苹果、头疼',
  generateSequence: '生成图片序列',
  matching: '匹配中...',
  stopRecording: '停止录音',
  voiceInput: '语音输入',
  cantoneseMode: '粤语输入与转图卡词',
  cantoneseHint:
    '浏览器会尝试粤语识别；识别原文和转换文字都必须由照护者确认，转换后不会自动生成图片。',
  cantoneseRecognized:
    '粤语识别原文已填入，请先修改或转换成图卡词，再手动生成图片序列。',
  dialectNormalize: '粤语转图卡词',
  dialectNormalizing: '转换中...',
  dialectAiApplied: '已生成可编辑的普通话图卡词草稿，请确认后再生成图片序列。',
  dialectLocalApplied: '网络增强不可用，已用本地高置信词典生成可编辑草稿。',
  dialectRateLimitedLocalApplied:
    '增强服务请求较多，已用本地高置信词典生成可编辑草稿。',
  dialectMonthlyQuotaLocalApplied:
    '本月增强服务额度已用完，已用本地高置信词典生成可编辑草稿。',
  dialectNoChange: '没有发现可安全自动转换的词，请直接人工修改原文。',
  dialectRestoreSource: '恢复原识别文字',
  dialectAudioUpload: '粤语录音识别',
  dialectAudioTitle: '上传粤语录音',
  dialectAudioPrivacy:
    '录音会发送到当前配置的粤语识别服务，仅用于本次转文字；CBoard 不保存录音，外部提供方会按其服务规则处理。',
  dialectAudioChoose:
    '选择 MP3、M4A、AAC、WAV、PCM、AMR 或 OGG Opus（不超过 3 MiB、60 秒）',
  dialectAudioConsent: '我同意本次录音发送到服务端和外部语音提供方进行识别',
  dialectAudioSubmit: '发送并识别',
  dialectAudioReading: '识别中...',
  dialectAudioApplied:
    '粤语识别原文已填入，请人工修改或转图卡词，再手动生成图片序列。',
  dialectAudioNoText: '没有识别到语音，请换一段更清晰的录音。',
  dialectAudioLoginRequired:
    '登录后可使用服务端粤语识别，当前仍可手工输入或尝试浏览器语音。',
  dialectAudioUnavailable:
    '服务端尚未配置粤语识别，当前仍可手工输入或尝试浏览器语音。',
  dialectAudioFailed: '粤语录音识别暂时不可用，录音没有写入沟通记录。',
  dialectAudioRateLimited:
    '粤语识别请求较多，请稍后重试；当前仍可手工输入或尝试浏览器语音。',
  dialectAudioMonthlyQuota:
    '本月增强服务额度已用完；当前仍可手工输入或尝试浏览器语音。',
  imageOcr: '图片识字',
  imageOcrTitle: '从图片提取文字',
  imageOcrPrivacy:
    '所选图片会发送到当前配置的识字服务，仅用于本次文字识别；服务端不会保存原图。',
  imageOcrChoose: '选择 JPEG、PNG 或 WebP 图片（不超过 2 MiB）',
  imageOcrSubmit: '发送并识别',
  imageOcrReading: '识别中...',
  imageOcrApplied: '识别文字已填入，可继续人工修改后再生成图片序列。',
  imageOcrNoText: '没有识别到文字，请换一张更清晰的图片。',
  imageOcrLoginRequired: '登录后可使用图片识字，当前仍可手工输入文字。',
  imageOcrUnavailable: '服务端尚未配置图片识字，当前仍可手工输入文字。',
  imageOcrFailed: '图片识字暂时不可用，当前仍可手工输入文字。',
  imageOcrRateLimited: '图片识字请求较多，请稍后重试；当前仍可手工输入文字。',
  imageOcrMonthlyQuota: '本月增强服务额度已用完；当前仍可手工输入文字。',
  resetInput: '重新输入',
  previewLabel: '预览图片',
  emptyPreview: '无',
  missingLabel: '缺词提示',
  sendToOutput: '发送到输出栏',
  fullscreen: '全屏展示',
  shareReceiverImage: '分享图片序列',
  recentHistoryTitle: '最近历史',
  historyHint: '表达与接收都会记录',
  noHistory: '还没有本地历史。',
  replaceSymbol: '替换图片',
  searchPlaceholder: '搜索标签或同义词',
  close: '关闭',
  fullscreenTitle: '接收端全屏展示',
  attributionLabel: '图片来源与许可',
  replaceAction: '换图',
  insertAction: '后加图片',
  insertSymbol: '在此项后添加图片',
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
  segmentationLabel: '分词结果（可修改）',
  segmentationHint: '使用空格、斜线或逗号分隔词语，修改后请重新应用。',
  applySegmentation: '按此分词重新匹配',
  segmentationRequired: '请至少保留一个词语。',
  segmentationApplied: '已按人工分词重新匹配，可以继续确认。',
  segmentationNeedsReview: '已按人工分词重新匹配，请继续处理未匹配词。',
  aiResegment: 'AI 优化分词',
  aiResegmenting: 'AI 分词中...',
  aiLoginRequired: '登录后可使用 AI 增强，当前结果仍可人工修改。',
  aiUnavailable: '服务端尚未配置 AI，当前结果仍可人工修改。',
  aiFailed: 'AI 服务暂时不可用，当前结果仍可人工修改。',
  aiRateLimited: 'AI 增强请求较多，请稍后重试；当前结果仍可人工修改。',
  aiMonthlyQuota: '本月 AI 增强额度已用完，当前结果仍可人工修改。',
  aiNoImprovement: 'AI 分词没有改善匹配率，已保留当前结果。',
  aiApplied: 'AI 分词已应用，可以继续人工确认。',
  aiNeedsReview: 'AI 分词已应用，请继续处理未匹配词。',
  feedbackQuestion: '你明白了吗？',
  feedbackUnderstood: '明白了',
  feedbackNotUnderstood: '没明白',
  feedbackRepeatRequested: '再说一次',
  feedbackSavedUnderstood: '患者反馈：已理解。',
  feedbackSavedNotUnderstood: '患者反馈：未理解，请继续修改图片序列。',
  feedbackSavedRepeat: '患者请求再说一次。',
  feedbackSaveFailed: '患者反馈未能保存，仍可继续沟通。',
  receiverDraftRestored: '已恢复上次未完成的图片复核。',
  learnFromCorrections: '记住本次人工换图和删除',
  learnFromCorrectionsHint:
    '仅在当前工作区本机生效，可随时关闭；不会修改 CBoard 默认词典。',
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

function getOcrFailureMessage(error, copy) {
  const limitScope = getCommunicationEnhancementLimitScope(error);
  if (limitScope === COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.month) {
    return copy.imageOcrMonthlyQuota;
  }
  if (limitScope === COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.minute) {
    return copy.imageOcrRateLimited;
  }
  const status = error && error.response && Number(error.response.status);
  if (status === 401 || status === 403) return copy.imageOcrLoginRequired;
  if (status === 503) return copy.imageOcrUnavailable;
  return copy.imageOcrFailed;
}

function getDialectAudioFailureMessage(error, copy) {
  const limitScope = getCommunicationEnhancementLimitScope(error);
  if (limitScope === COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.month) {
    return copy.dialectAudioMonthlyQuota;
  }
  if (limitScope === COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.minute) {
    return copy.dialectAudioRateLimited;
  }
  const status = error && error.response && Number(error.response.status);
  if (status === 401 || status === 403) {
    return copy.dialectAudioLoginRequired;
  }
  if (status === 503) return copy.dialectAudioUnavailable;
  if (status === 422) return copy.dialectAudioNoText;
  return copy.dialectAudioFailed;
}

function getOnDeviceSpeechStatusText(status, copy) {
  if (status === 'available') return copy.onDeviceSpeechAvailable;
  if (status === 'downloadable') return copy.onDeviceSpeechDownloadable;
  if (status === 'downloading') return copy.onDeviceSpeechDownloading;
  if (status === 'unavailable') return copy.onDeviceSpeechUnavailable;
  if (status === 'checking') return copy.onDeviceSpeechChecking;
  if (status === 'installing') return copy.onDeviceSpeechInstalling;
  return copy.onDeviceSpeechError;
}

function getOnDeviceSpeechActionLabel(status, copy) {
  if (status === 'downloadable') return copy.onDeviceSpeechInstall;
  if (status === 'checking') return copy.onDeviceSpeechChecking;
  if (status === 'installing' || status === 'downloading') {
    return copy.onDeviceSpeechInstalling;
  }
  return copy.onDeviceSpeechCheck;
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
  onInsert,
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
        <Button color="primary" size="small" onClick={() => onInsert(match.id)}>
          {copy.insertAction}
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
  onInsert: PropTypes.func.isRequired,
  onSwap: PropTypes.func.isRequired,
  copy: PropTypes.object.isRequired
};

export default function ReceiverLoopPanel({
  boards,
  intl,
  onApplyOutput,
  onJumpBoard,
  initialRecord,
  onAppendHistory,
  onCreateDraft,
  onUpdateDraft,
  onConfirmDraft,
  onDiscardResumableRecord,
  onRecordPatientFeedback,
  onRecordCorrection,
  onRecordMissingTokens,
  onReviewMissingToken,
  missingTokenRecords,
  historyItems,
  speech,
  onSpeak,
  onCancelSpeech,
  aiAvailable,
  onAiResegment,
  dialectNormalizationAvailable,
  onNormalizeDialectText,
  dialectAudioRecognitionAvailable,
  onRecognizeDialectAudio,
  imageOcrAvailable,
  onRecognizeImageText,
  onlineSearchAvailable,
  onSearchMissingTokensOnline,
  aiImageGenerationAvailable,
  onGenerateMissingTokenPictogram,
  onShareReceiver,
  correctionMemory,
  copyOverrides
}) {
  const copy = { ...DEFAULT_COPY, ...(copyOverrides || {}) };
  const [restoredReceiverState] = useState(() =>
    restoreReceiverLoopState(initialRecord, boards, { intl })
  );
  const [inputText, setInputText] = useState(() =>
    restoredReceiverState ? restoredReceiverState.inputText : ''
  );
  const [receivePhase, setReceivePhase] = useState(() =>
    restoredReceiverState ? 'review' : 'idle'
  );
  const [reviewItems, setReviewItems] = useState(() =>
    restoredReceiverState ? restoredReceiverState.reviewItems : []
  );
  const [showSwapId, setShowSwapId] = useState(null);
  const [showInsertAfterId, setShowInsertAfterId] = useState(null);
  const [swapQuery, setSwapQuery] = useState('');
  const [showDisplay, setShowDisplay] = useState(false);
  const [displayRecordId, setDisplayRecordId] = useState(null);
  const [activeDraft, setActiveDraft] = useState(() =>
    restoredReceiverState ? initialRecord : null
  );
  const [segmentationDraft, setSegmentationDraft] = useState(() =>
    restoredReceiverState
      ? formatCommunicationSegmentation(
          restoredReceiverState.segmentation.segments
        )
      : ''
  );
  const [reviewNotice, setReviewNotice] = useState(() => {
    if (!restoredReceiverState) return '';
    return initialRecord && initialRecord.recordStatus === 'confirmed'
      ? copy.feedbackSavedNotUnderstood
      : copy.receiverDraftRestored;
  });
  const [learnFromCorrections, setLearnFromCorrections] = useState(true);
  const [isAiResegmenting, setIsAiResegmenting] = useState(false);
  const [isCantoneseMode, setIsCantoneseMode] = useState(false);
  const [preferOnDeviceSpeech, setPreferOnDeviceSpeech] = useState(false);
  const [dialectSourceText, setDialectSourceText] = useState('');
  const [isDialectNormalizing, setIsDialectNormalizing] = useState(false);
  const [showDialectAudioDialog, setShowDialectAudioDialog] = useState(false);
  const [dialectAudioFile, setDialectAudioFile] = useState(null);
  const [dialectAudioConsent, setDialectAudioConsent] = useState(false);
  const [dialectAudioNotice, setDialectAudioNotice] = useState('');
  const [isDialectAudioRecognizing, setIsDialectAudioRecognizing] = useState(
    false
  );
  const [showOcrDialog, setShowOcrDialog] = useState(false);
  const [ocrImage, setOcrImage] = useState(null);
  const [isOcrReading, setIsOcrReading] = useState(false);
  const [inputNotice, setInputNotice] = useState('');
  const pendingMatchTimerRef = useRef(null);
  const matchGenerationRef = useRef(0);
  const aiGenerationRef = useRef(0);
  const dialectGenerationRef = useRef(0);
  const dialectAudioGenerationRef = useRef(0);
  const ocrGenerationRef = useRef(0);

  useEffect(() => {
    return () => {
      matchGenerationRef.current += 1;
      aiGenerationRef.current += 1;
      dialectGenerationRef.current += 1;
      dialectAudioGenerationRef.current += 1;
      ocrGenerationRef.current += 1;
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
  const speechAudioLevel =
    speechState && Number.isFinite(speechState.audioLevel)
      ? Math.min(1, Math.max(0, speechState.audioLevel))
      : 0;
  const speechAudioLevelPercent = Math.round(speechAudioLevel * 100);
  const onDeviceSpeechStatus = speechState
    ? speechState.onDeviceStatus
    : 'unsupported';
  const onDeviceSpeechReady =
    onDeviceSpeechStatus === 'available' &&
    (!speechState.onDeviceLanguage || speechState.onDeviceLanguage === 'zh-CN');

  useEffect(
    () => {
      if (!onDeviceSpeechReady) setPreferOnDeviceSpeech(false);
    },
    [onDeviceSpeechReady]
  );

  function invalidatePendingMatch() {
    matchGenerationRef.current += 1;
    aiGenerationRef.current += 1;
    setIsAiResegmenting(false);

    if (pendingMatchTimerRef.current !== null) {
      window.clearTimeout(pendingMatchTimerRef.current);
      pendingMatchTimerRef.current = null;
    }

    return matchGenerationRef.current;
  }

  function closeSymbolPicker() {
    setShowSwapId(null);
    setShowInsertAfterId(null);
    setSwapQuery('');
  }

  function openReviewForText(text) {
    const result = buildReceiverLoopState(text, boards, {
      intl,
      missingTokenRecords,
      correctionMemory
    });
    setReviewItems(result.reviewItems);
    setSegmentationDraft(
      formatCommunicationSegmentation(
        result.segmentation && result.segmentation.length
          ? result.segmentation
          : result.reviewItems.map(item => item.token)
      )
    );
    setReviewNotice('');
    setReceivePhase('review');
    closeSymbolPicker();

    if (result.missingTokens.length && onRecordMissingTokens) {
      try {
        onRecordMissingTokens({
          tokens: result.missingTokens,
          rawText: result.inputText || String(text || '').trim(),
          scene: 'receiver'
        });
      } catch (error) {
        // Vocabulary-gap evidence must not block the receiver flow.
      }
    }

    if (onCreateDraft) {
      try {
        setActiveDraft(
          onCreateDraft(buildReceiverHistoryEntry(text, result.reviewItems))
        );
      } catch (error) {
        setActiveDraft(null);
      }
    }
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
    dialectGenerationRef.current += 1;
    dialectAudioGenerationRef.current += 1;
    invalidatePendingMatch();
    setInputText(nextText);
    setInputNotice('');
    setReviewItems([]);
    setSegmentationDraft('');
    setReviewNotice('');
    setReceivePhase('idle');
    setDisplayRecordId(null);
    closeSymbolPicker();
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
  }

  function handleOpenDisplay() {
    const outputItems = buildReceiverOutputPreview(reviewItems);

    if (!outputItems.length) {
      return;
    }

    const historyEntry = buildReceiverHistoryEntry(inputText, reviewItems);
    onApplyOutput(outputItems);
    let confirmedRecord = null;

    if (activeDraft && activeDraft.recordStatus === 'draft' && onConfirmDraft) {
      try {
        confirmedRecord = onConfirmDraft(activeDraft, historyEntry);
        setActiveDraft(confirmedRecord);
      } catch (error) {
        // Display remains available even when local persistence is unavailable.
      }
    } else if (activeDraft && activeDraft.recordStatus === 'confirmed') {
      confirmedRecord = activeDraft;
    } else if (onAppendHistory) {
      onAppendHistory(historyEntry);
    }

    setDisplayRecordId(
      confirmedRecord && confirmedRecord.id ? confirmedRecord.id : null
    );
    setShowDisplay(true);
    handleReplayDisplay();
  }

  function handleCloseDisplay() {
    if (onCancelSpeech) {
      onCancelSpeech();
    }
    setShowDisplay(false);
    setDisplayRecordId(null);
  }

  function handleReplayDisplay() {
    const text = inputText.trim();
    if (!text || !onSpeak) return false;
    if (onCancelSpeech) {
      onCancelSpeech();
    }
    onSpeak(text, () => {});
    return true;
  }

  function handleFeedbackPersistenceFailure(feedback) {
    setReviewNotice(copy.feedbackSaveFailed);
    if (feedback !== RECEIVER_PATIENT_FEEDBACK.repeatRequested) {
      handleCloseDisplay();
    }
    return false;
  }

  function handlePatientFeedback(feedback) {
    if (!displayRecordId || !onRecordPatientFeedback) {
      return handleFeedbackPersistenceFailure(feedback);
    }

    try {
      const saved = onRecordPatientFeedback(displayRecordId, feedback);
      if (!saved) {
        return handleFeedbackPersistenceFailure(feedback);
      }

      if (feedback === RECEIVER_PATIENT_FEEDBACK.repeatRequested) {
        setReviewNotice(copy.feedbackSavedRepeat);
        return true;
      }
      setReviewNotice(
        feedback === RECEIVER_PATIENT_FEEDBACK.understood
          ? copy.feedbackSavedUnderstood
          : copy.feedbackSavedNotUnderstood
      );
      handleCloseDisplay();
      return true;
    } catch (error) {
      return handleFeedbackPersistenceFailure(feedback);
    }
  }

  function persistReceiverEdit(action, itemId, nextItems) {
    aiGenerationRef.current += 1;
    setIsAiResegmenting(false);
    setReviewItems(nextItems);
    setSegmentationDraft(
      formatCommunicationSegmentation(nextItems.map(item => item.token))
    );

    let draft = activeDraft;
    if ((!draft || draft.recordStatus !== 'draft') && onCreateDraft) {
      try {
        draft = onCreateDraft(
          buildReceiverHistoryEntry(inputText, reviewItems)
        );
        setActiveDraft(draft);
      } catch (error) {
        draft = null;
      }
    }

    if (!draft) {
      return;
    }

    if (onRecordCorrection) {
      try {
        onRecordCorrection(
          buildReceiverCorrectionFromEdit(
            draft,
            action,
            reviewItems,
            nextItems,
            itemId,
            { isUsedForLearning: learnFromCorrections }
          )
        );
      } catch (error) {
        // Corrections are maintenance data and must not block communication.
      }
    }

    if (onUpdateDraft) {
      try {
        setActiveDraft(
          onUpdateDraft(draft, buildReceiverHistoryEntry(inputText, nextItems))
        );
      } catch (error) {
        // Keep the in-memory correction usable when storage is unavailable.
      }
    }
  }

  function moveReviewItem(itemId, offset) {
    const nextItems = moveReceiverReviewItem(reviewItems, itemId, offset);
    if (nextItems !== reviewItems) {
      persistReceiverEdit(
        RECEIVER_CORRECTION_ACTIONS.reorder,
        itemId,
        nextItems
      );
    }
  }

  function handleDeleteReviewItem(itemId) {
    persistReceiverEdit(
      RECEIVER_CORRECTION_ACTIONS.delete,
      itemId,
      deleteReceiverReviewItem(reviewItems, itemId)
    );
    if (showSwapId === itemId || showInsertAfterId === itemId) {
      closeSymbolPicker();
    }
  }

  function handleSwapPick(candidate) {
    if (!showSwapId) {
      return;
    }

    persistReceiverEdit(
      RECEIVER_CORRECTION_ACTIONS.replace,
      showSwapId,
      replaceReceiverReviewItem(reviewItems, showSwapId, candidate)
    );
    closeSymbolPicker();
  }

  function applyDialectDraft(result, notice) {
    invalidatePendingMatch();
    setInputText(result.normalizedText);
    setDialectSourceText(result.sourceText);
    setReviewItems([]);
    setSegmentationDraft('');
    setReviewNotice('');
    setReceivePhase('idle');
    setDisplayRecordId(null);
    setInputNotice(notice);
    closeSymbolPicker();
  }

  async function handleNormalizeDialectText() {
    const localResult = buildLocalDialectNormalization(inputText, 'cantonese');
    if (!localResult) {
      setInputNotice(copy.dialectNoChange);
      return;
    }

    const request = buildDialectNormalizationRequest({
      text: localResult.sourceText,
      dialect: 'cantonese',
      pictogramVocabulary: tileCatalog.flatMap(item => [
        item.displayLabel,
        ...item.labels,
        ...item.synonyms
      ])
    });
    const generation = dialectGenerationRef.current + 1;
    dialectGenerationRef.current = generation;
    setIsDialectNormalizing(true);
    setInputNotice('');

    let result = null;
    let usedServer = false;
    let serverFailureNotice = '';
    if (
      dialectNormalizationAvailable &&
      typeof onNormalizeDialectText === 'function'
    ) {
      try {
        result = normalizeDialectNormalizationResponse(
          await onNormalizeDialectText(request),
          {
            sourceText: request.text,
            dialect: request.dialect
          }
        );
        usedServer = Boolean(result);
      } catch (error) {
        const limitScope = getCommunicationEnhancementLimitScope(error);
        if (limitScope === COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.month) {
          serverFailureNotice = copy.dialectMonthlyQuotaLocalApplied;
        } else if (
          limitScope === COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.minute
        ) {
          serverFailureNotice = copy.dialectRateLimitedLocalApplied;
        }
        result = null;
      }
    }

    if (dialectGenerationRef.current !== generation) return;
    setIsDialectNormalizing(false);
    result = result || localResult;

    if (!result.changed) {
      setDialectSourceText(result.sourceText);
      setInputNotice(copy.dialectNoChange);
      return;
    }

    applyDialectDraft(
      result,
      usedServer
        ? copy.dialectAiApplied
        : serverFailureNotice || copy.dialectLocalApplied
    );
  }

  function closeDialectAudioDialog() {
    dialectAudioGenerationRef.current += 1;
    setShowDialectAudioDialog(false);
    setDialectAudioFile(null);
    setDialectAudioConsent(false);
    setDialectAudioNotice('');
    setIsDialectAudioRecognizing(false);
  }

  async function handleRecognizeDialectAudio() {
    const validation = validateDialectAudioFile(dialectAudioFile);
    if (!validation.valid) {
      setDialectAudioNotice(validation.message);
      return;
    }
    if (!dialectAudioConsent) {
      setDialectAudioNotice('请先确认本次录音上传授权；未授权时录音不会发送。');
      return;
    }
    if (
      !dialectAudioRecognitionAvailable ||
      typeof onRecognizeDialectAudio !== 'function'
    ) {
      setDialectAudioNotice(copy.dialectAudioLoginRequired);
      return;
    }

    const generation = dialectAudioGenerationRef.current + 1;
    dialectAudioGenerationRef.current = generation;
    setIsDialectAudioRecognizing(true);
    setDialectAudioNotice('');

    try {
      const result = normalizeDialectAudioRecognitionResponse(
        await onRecognizeDialectAudio(dialectAudioFile)
      );
      if (dialectAudioGenerationRef.current !== generation) return;
      if (!result) {
        setDialectAudioNotice(copy.dialectAudioNoText);
        return;
      }

      invalidatePendingMatch();
      dialectGenerationRef.current += 1;
      setInputText(result.text);
      setDialectSourceText(result.text);
      setReviewItems([]);
      setSegmentationDraft('');
      setReviewNotice('');
      setReceivePhase('idle');
      setDisplayRecordId(null);
      setInputNotice(copy.dialectAudioApplied);
      closeDialectAudioDialog();
    } catch (error) {
      if (dialectAudioGenerationRef.current === generation) {
        setDialectAudioNotice(getDialectAudioFailureMessage(error, copy));
      }
    } finally {
      if (dialectAudioGenerationRef.current === generation) {
        setIsDialectAudioRecognizing(false);
      }
    }
  }

  function closeOcrDialog() {
    ocrGenerationRef.current += 1;
    setShowOcrDialog(false);
    setOcrImage(null);
    setIsOcrReading(false);
  }

  async function handleRecognizeImageText() {
    const validation = validateImageTextRecognitionFile(ocrImage);
    if (!validation.valid) {
      setInputNotice(validation.message);
      return;
    }
    if (!imageOcrAvailable || typeof onRecognizeImageText !== 'function') {
      setInputNotice(copy.imageOcrLoginRequired);
      closeOcrDialog();
      return;
    }

    const generation = ocrGenerationRef.current + 1;
    ocrGenerationRef.current = generation;
    setIsOcrReading(true);
    setInputNotice('');

    try {
      const result = normalizeImageTextRecognitionResponse(
        await onRecognizeImageText(ocrImage)
      );
      if (ocrGenerationRef.current !== generation) {
        return;
      }
      if (!result.text) {
        setInputNotice(copy.imageOcrNoText);
        return;
      }

      invalidatePendingMatch();
      setInputText(result.text);
      setReviewItems([]);
      setSegmentationDraft('');
      setReviewNotice('');
      setReceivePhase('idle');
      setDisplayRecordId(null);
      setInputNotice(copy.imageOcrApplied);
      closeOcrDialog();
    } catch (error) {
      if (ocrGenerationRef.current === generation) {
        setInputNotice(getOcrFailureMessage(error, copy));
      }
    } finally {
      if (ocrGenerationRef.current === generation) {
        setIsOcrReading(false);
      }
    }
  }

  function handleInsertPick(candidate) {
    if (!showInsertAfterId) {
      return;
    }

    const insertedItemId = createReceiverReviewId('review');
    persistReceiverEdit(
      RECEIVER_CORRECTION_ACTIONS.insert,
      insertedItemId,
      insertReceiverReviewItem(reviewItems, showInsertAfterId, candidate, {
        itemId: insertedItemId
      })
    );
    closeSymbolPicker();
  }

  function handleResetReceive() {
    dialectGenerationRef.current += 1;
    closeDialectAudioDialog();
    invalidatePendingMatch();
    if (isListening && speechState) {
      speechState.stopListening();
    }
    if (activeDraft && onDiscardResumableRecord) {
      try {
        onDiscardResumableRecord(activeDraft.id);
      } catch (error) {
        // Clearing the visible workspace must remain available offline.
      }
    }
    setReceivePhase('idle');
    setReviewItems([]);
    setSegmentationDraft('');
    setReviewNotice('');
    setInputText('');
    setDialectSourceText('');
    setIsDialectNormalizing(false);
    setInputNotice('');
    setShowDisplay(false);
    setActiveDraft(null);
    closeSymbolPicker();
  }

  async function handleAiResegmentation() {
    if (!aiAvailable || typeof onAiResegment !== 'function') {
      setReviewNotice(copy.aiLoginRequired);
      return;
    }

    const request = buildCommunicationAiResegmentRequest({
      text: inputText,
      reviewItems,
      boards,
      intl
    });
    const generation = aiGenerationRef.current + 1;
    aiGenerationRef.current = generation;
    setIsAiResegmenting(true);
    setReviewNotice('');

    try {
      const response = await onAiResegment(request);
      if (aiGenerationRef.current !== generation) return;
      const applied = applyCommunicationAiResegmentation({
        currentReviewItems: reviewItems,
        response,
        text: inputText,
        boards,
        intl,
        missingTokenRecords,
        correctionMemory
      });
      if (!applied.applied) {
        setReviewNotice(copy.aiNoImprovement);
        return;
      }

      const nextItems = applied.reviewItems;
      const nextMissingTokens = nextItems
        .filter(item => !item.tile)
        .map(item => item.token);
      if (nextMissingTokens.length && onRecordMissingTokens) {
        try {
          onRecordMissingTokens({
            tokens: nextMissingTokens,
            rawText: inputText.trim(),
            scene: 'receiver'
          });
        } catch (error) {
          // Optional AI must not block the local receiver loop.
        }
      }
      persistReceiverEdit(
        RECEIVER_CORRECTION_ACTIONS.resegment,
        'segmentation-ai',
        nextItems
      );
      setSegmentationDraft(
        formatCommunicationSegmentation(
          applied.segmentation || nextItems.map(item => item.token)
        )
      );
      setReviewNotice(
        applied.quality.needsReview ? copy.aiNeedsReview : copy.aiApplied
      );
    } catch (error) {
      if (aiGenerationRef.current === generation) {
        setReviewNotice(getAiFailureMessage(error, copy));
      }
    } finally {
      if (aiGenerationRef.current === generation) {
        setIsAiResegmenting(false);
      }
    }
  }

  function handleApplySegmentation() {
    const tokens = parseCommunicationSegmentationInput(segmentationDraft);

    if (!tokens.length) {
      setReviewNotice(copy.segmentationRequired);
      return;
    }

    const result = buildReceiverLoopState(inputText, boards, {
      intl,
      preSegmented: tokens,
      missingTokenRecords,
      correctionMemory
    });

    if (result.missingTokens.length && onRecordMissingTokens) {
      try {
        onRecordMissingTokens({
          tokens: result.missingTokens,
          rawText: result.inputText || inputText.trim(),
          scene: 'receiver'
        });
      } catch (error) {
        // Manual correction must remain usable when maintenance storage fails.
      }
    }

    persistReceiverEdit(
      RECEIVER_CORRECTION_ACTIONS.resegment,
      'segmentation',
      result.reviewItems
    );
    setReviewNotice(
      buildReceiverMatchQuality(result.reviewItems).needsReview
        ? copy.segmentationNeedsReview
        : copy.segmentationApplied
    );
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
        <FormControlLabel
          control={
            <Checkbox
              color="primary"
              checked={isCantoneseMode}
              disabled={
                isListening || isDialectNormalizing || isDialectAudioRecognizing
              }
              onChange={event => {
                if (isListening && speechState) {
                  speechState.stopListening();
                }
                dialectGenerationRef.current += 1;
                closeDialectAudioDialog();
                setIsCantoneseMode(event.target.checked);
                setPreferOnDeviceSpeech(false);
                setDialectSourceText('');
                setInputNotice('');
              }}
            />
          }
          label={copy.cantoneseMode}
        />
        {isCantoneseMode && (
          <div className="CommunicationSupportPanel__environmentNotice">
            {copy.cantoneseHint}
          </div>
        )}
        {speechState && speechState.onDeviceSupported && !isCantoneseMode && (
          <div className="CommunicationSupportPanel__environmentNotice CommunicationSupportPanel__onDeviceSpeech">
            <strong>{copy.onDeviceSpeechTitle}</strong>
            <span>{copy.onDeviceSpeechHint}</span>
            <span>
              {getOnDeviceSpeechStatusText(onDeviceSpeechStatus, copy)}
            </span>
            <FormControlLabel
              control={
                <Checkbox
                  color="primary"
                  checked={preferOnDeviceSpeech}
                  disabled={!onDeviceSpeechReady}
                  inputProps={{
                    'aria-label': copy.onDeviceSpeechUse
                  }}
                  onChange={event =>
                    setPreferOnDeviceSpeech(event.target.checked)
                  }
                />
              }
              label={copy.onDeviceSpeechUse}
            />
            <Button
              color="primary"
              variant="outlined"
              disabled={
                onDeviceSpeechStatus === 'checking' ||
                onDeviceSpeechStatus === 'installing' ||
                onDeviceSpeechStatus === 'downloading'
              }
              onClick={() => {
                if (
                  onDeviceSpeechStatus === 'downloadable' &&
                  speechState.installOnDeviceLanguage
                ) {
                  void speechState.installOnDeviceLanguage('zh-CN');
                  return;
                }
                if (speechState.checkOnDeviceAvailability) {
                  void speechState.checkOnDeviceAvailability('zh-CN');
                }
              }}
            >
              {getOnDeviceSpeechActionLabel(onDeviceSpeechStatus, copy)}
            </Button>
          </div>
        )}
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
        {isListening && (
          <div
            className="CommunicationSupportPanel__audioLevel"
            aria-live="polite"
          >
            {speechState.audioLevelAvailable ? (
              <>
                <div className="CommunicationSupportPanel__audioLevelCopy">
                  <strong>{copy.liveAudioLevel}</strong>
                  <span>{copy.liveAudioPrivacy}</span>
                </div>
                <div
                  className="CommunicationSupportPanel__audioBars"
                  role="meter"
                  aria-label={copy.liveAudioLevel}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow={speechAudioLevelPercent}
                  aria-valuetext={`${speechAudioLevelPercent}%`}
                >
                  {[0.48, 0.72, 1, 0.84, 0.62, 0.76, 0.5].map(
                    (weight, index) => (
                      <span
                        key={index}
                        aria-hidden="true"
                        className="CommunicationSupportPanel__audioBar"
                        style={{
                          transform: `scaleY(${(
                            0.12 +
                            speechAudioLevel * 0.88 * weight
                          ).toFixed(3)})`
                        }}
                      />
                    )
                  )}
                </div>
              </>
            ) : (
              <span
                className="CommunicationSupportPanel__audioLevelFallback"
                role="status"
              >
                {copy.liveAudioFallback}
              </span>
            )}
          </div>
        )}
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
                dialectGenerationRef.current += 1;
                setInputText('');
                setDialectSourceText('');
                setReviewItems([]);
                setReceivePhase('idle');
                speechState.startListening(
                  finalText => {
                    if (matchGenerationRef.current !== speechGeneration) {
                      return;
                    }

                    setInputText(finalText);
                    if (isCantoneseMode) {
                      setDialectSourceText(finalText);
                      setReviewItems([]);
                      setSegmentationDraft('');
                      setReceivePhase('idle');
                      setInputNotice(copy.cantoneseRecognized);
                      return;
                    }
                    scheduleReviewForText(finalText);
                  },
                  {
                    language: isCantoneseMode ? 'yue-HK' : 'zh-CN',
                    processLocally: !isCantoneseMode && preferOnDeviceSpeech
                  }
                );
              }}
            >
              {isListening ? copy.stopRecording : copy.voiceInput}
            </Button>
          )}
          {isCantoneseMode && (
            <Button
              color="primary"
              variant="outlined"
              disabled={
                isListening || isDialectNormalizing || isDialectAudioRecognizing
              }
              onClick={() => {
                if (
                  !dialectAudioRecognitionAvailable ||
                  typeof onRecognizeDialectAudio !== 'function'
                ) {
                  setInputNotice(copy.dialectAudioLoginRequired);
                  return;
                }
                setInputNotice('');
                setDialectAudioFile(null);
                setDialectAudioConsent(false);
                setDialectAudioNotice('');
                setShowDialectAudioDialog(true);
              }}
            >
              {copy.dialectAudioUpload}
            </Button>
          )}
          {isCantoneseMode && (
            <Button
              color="primary"
              variant="outlined"
              disabled={
                !inputText.trim() || isListening || isDialectNormalizing
              }
              onClick={handleNormalizeDialectText}
            >
              {isDialectNormalizing
                ? copy.dialectNormalizing
                : copy.dialectNormalize}
            </Button>
          )}
          {dialectSourceText && dialectSourceText !== inputText && (
            <Button
              color="primary"
              variant="outlined"
              disabled={isListening || isDialectNormalizing}
              onClick={() => {
                const sourceText = dialectSourceText;
                handleInputTextChange(sourceText);
                setDialectSourceText(sourceText);
                setInputNotice(copy.cantoneseRecognized);
              }}
            >
              {copy.dialectRestoreSource}
            </Button>
          )}
          <Button
            color="primary"
            variant="outlined"
            onClick={() => {
              if (
                !imageOcrAvailable ||
                typeof onRecognizeImageText !== 'function'
              ) {
                setInputNotice(copy.imageOcrLoginRequired);
                return;
              }
              setInputNotice('');
              setOcrImage(null);
              setShowOcrDialog(true);
            }}
          >
            {copy.imageOcr}
          </Button>
          <Button
            color="primary"
            variant="outlined"
            onClick={handleResetReceive}
          >
            {copy.resetInput}
          </Button>
        </div>
        {inputNotice && (
          <div
            className="CommunicationSupportPanel__environmentNotice"
            role="status"
          >
            {inputNotice}
          </div>
        )}
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
            <div className="CommunicationSupportPanel__segmentationEditor">
              <TextField
                fullWidth
                label={copy.segmentationLabel}
                helperText={copy.segmentationHint}
                value={segmentationDraft}
                variant="outlined"
                onChange={event => setSegmentationDraft(event.target.value)}
              />
              <div className="CommunicationSupportPanel__actions">
                <Button
                  color="primary"
                  variant="outlined"
                  onClick={handleApplySegmentation}
                  disabled={
                    !parseCommunicationSegmentationInput(segmentationDraft)
                      .length
                  }
                >
                  {copy.applySegmentation}
                </Button>
                <Button
                  color="primary"
                  variant="outlined"
                  onClick={handleAiResegmentation}
                  disabled={!reviewItems.length || isAiResegmenting}
                >
                  {isAiResegmenting ? copy.aiResegmenting : copy.aiResegment}
                </Button>
              </div>
              <div className="CommunicationSupportPanel__learningControl">
                <FormControlLabel
                  control={
                    <Checkbox
                      color="primary"
                      checked={learnFromCorrections}
                      onChange={event =>
                        setLearnFromCorrections(event.target.checked)
                      }
                    />
                  }
                  label={copy.learnFromCorrections}
                />
                <span>{copy.learnFromCorrectionsHint}</span>
              </div>
              {reviewNotice && (
                <div
                  className="CommunicationSupportPanel__environmentNotice"
                  role="status"
                >
                  {reviewNotice}
                </div>
              )}
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
                  onInsert={id => {
                    setShowSwapId(null);
                    setShowInsertAfterId(id);
                    setSwapQuery('');
                  }}
                  onSwap={id => {
                    setShowInsertAfterId(null);
                    setShowSwapId(id);
                    setSwapQuery('');
                  }}
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
                onClick={handleOpenDisplay}
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

      {onReviewMissingToken && (
        <MissingTokenQueue
          records={missingTokenRecords}
          catalog={tileCatalog}
          onReview={onReviewMissingToken}
          onlineSearchAvailable={onlineSearchAvailable}
          onSearchOnline={onSearchMissingTokensOnline}
          aiImageGenerationAvailable={aiImageGenerationAvailable}
          onGeneratePictogram={onGenerateMissingTokenPictogram}
        />
      )}

      <Dialog
        open={showDialectAudioDialog}
        onClose={closeDialectAudioDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{copy.dialectAudioTitle}</DialogTitle>
        <DialogContent dividers>
          <p className="CommunicationSupportPanel__ocrPrivacy">
            {copy.dialectAudioPrivacy}
          </p>
          <TextField
            className="CommunicationSupportPanel__ocrFile"
            fullWidth
            type="file"
            variant="outlined"
            helperText={copy.dialectAudioChoose}
            inputProps={{
              accept:
                'audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,audio/pcm,audio/x-pcm,audio/amr,audio/ogg'
            }}
            onChange={event => {
              setDialectAudioFile(
                event.target.files && event.target.files.length
                  ? event.target.files[0]
                  : null
              );
              setDialectAudioNotice('');
            }}
          />
          <FormControlLabel
            control={
              <Checkbox
                color="primary"
                checked={dialectAudioConsent}
                onChange={event => {
                  setDialectAudioConsent(event.target.checked);
                  setDialectAudioNotice('');
                }}
              />
            }
            label={copy.dialectAudioConsent}
          />
          {dialectAudioNotice && (
            <div
              className="CommunicationSupportPanel__environmentNotice"
              role="alert"
            >
              {dialectAudioNotice}
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialectAudioDialog} color="primary">
            {copy.close}
          </Button>
          <Button
            onClick={handleRecognizeDialectAudio}
            color="primary"
            variant="contained"
            disabled={
              !dialectAudioFile ||
              !dialectAudioConsent ||
              isDialectAudioRecognizing
            }
          >
            {isDialectAudioRecognizing
              ? copy.dialectAudioReading
              : copy.dialectAudioSubmit}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={showOcrDialog}
        onClose={closeOcrDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{copy.imageOcrTitle}</DialogTitle>
        <DialogContent dividers>
          <p className="CommunicationSupportPanel__ocrPrivacy">
            {copy.imageOcrPrivacy}
          </p>
          <TextField
            className="CommunicationSupportPanel__ocrFile"
            fullWidth
            type="file"
            variant="outlined"
            helperText={copy.imageOcrChoose}
            inputProps={{ accept: 'image/jpeg,image/png,image/webp' }}
            onChange={event => {
              setOcrImage(
                event.target.files && event.target.files.length
                  ? event.target.files[0]
                  : null
              );
              setInputNotice('');
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeOcrDialog} color="primary">
            {copy.close}
          </Button>
          <Button
            onClick={handleRecognizeImageText}
            color="primary"
            variant="contained"
            disabled={!ocrImage || isOcrReading}
          >
            {isOcrReading ? copy.imageOcrReading : copy.imageOcrSubmit}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(showSwapId || showInsertAfterId)}
        onClose={closeSymbolPicker}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {showInsertAfterId ? copy.insertSymbol : copy.replaceSymbol}
        </DialogTitle>
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
                onClick={() =>
                  showInsertAfterId
                    ? handleInsertPick(candidate)
                    : handleSwapPick(candidate)
                }
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
          <Button onClick={closeSymbolPicker} color="primary">
            {copy.close}
          </Button>
        </DialogActions>
      </Dialog>

      <ReceiverDisplay
        open={showDisplay}
        title={copy.fullscreenTitle}
        items={receiveOutputPreview}
        feedbackQuestion={copy.feedbackQuestion}
        understoodLabel={copy.feedbackUnderstood}
        notUnderstoodLabel={copy.feedbackNotUnderstood}
        repeatRequestedLabel={copy.feedbackRepeatRequested}
        attributionLabel={copy.attributionLabel}
        shareLabel={copy.shareReceiverImage}
        speechText={inputText}
        onClose={handleCloseDisplay}
        onFeedback={handlePatientFeedback}
        onReplay={handleReplayDisplay}
        onShare={onShareReceiver}
      />
    </div>
  );
}

ReceiverLoopPanel.propTypes = {
  boards: PropTypes.arrayOf(PropTypes.object).isRequired,
  intl: PropTypes.object,
  initialRecord: PropTypes.object,
  onApplyOutput: PropTypes.func.isRequired,
  onJumpBoard: PropTypes.func.isRequired,
  onAppendHistory: PropTypes.func,
  onCreateDraft: PropTypes.func,
  onUpdateDraft: PropTypes.func,
  onConfirmDraft: PropTypes.func,
  onDiscardResumableRecord: PropTypes.func,
  onRecordPatientFeedback: PropTypes.func,
  onRecordCorrection: PropTypes.func,
  onRecordMissingTokens: PropTypes.func,
  onReviewMissingToken: PropTypes.func,
  missingTokenRecords: PropTypes.arrayOf(PropTypes.object),
  historyItems: PropTypes.arrayOf(PropTypes.object),
  onSpeak: PropTypes.func,
  onCancelSpeech: PropTypes.func,
  speech: PropTypes.shape({
    isAvailable: PropTypes.bool,
    isListening: PropTypes.bool,
    interimText: PropTypes.string,
    error: PropTypes.string,
    audioLevel: PropTypes.number,
    audioLevelAvailable: PropTypes.bool,
    onDeviceSupported: PropTypes.bool,
    onDeviceStatus: PropTypes.string,
    onDeviceLanguage: PropTypes.string,
    checkOnDeviceAvailability: PropTypes.func,
    installOnDeviceLanguage: PropTypes.func,
    stopListening: PropTypes.func,
    startListening: PropTypes.func
  }),
  aiAvailable: PropTypes.bool,
  onAiResegment: PropTypes.func,
  dialectNormalizationAvailable: PropTypes.bool,
  onNormalizeDialectText: PropTypes.func,
  dialectAudioRecognitionAvailable: PropTypes.bool,
  onRecognizeDialectAudio: PropTypes.func,
  imageOcrAvailable: PropTypes.bool,
  onRecognizeImageText: PropTypes.func,
  onlineSearchAvailable: PropTypes.bool,
  onSearchMissingTokensOnline: PropTypes.func,
  aiImageGenerationAvailable: PropTypes.bool,
  onGenerateMissingTokenPictogram: PropTypes.func,
  onShareReceiver: PropTypes.func,
  correctionMemory: PropTypes.shape({
    contractVersion: PropTypes.number,
    scope: PropTypes.string,
    workspaceId: PropTypes.string,
    rules: PropTypes.arrayOf(PropTypes.object)
  }),
  copyOverrides: PropTypes.object
};

ReceiverLoopPanel.defaultProps = {
  intl: null,
  initialRecord: null,
  onAppendHistory: null,
  onCreateDraft: null,
  onUpdateDraft: null,
  onConfirmDraft: null,
  onDiscardResumableRecord: null,
  onRecordPatientFeedback: null,
  onRecordCorrection: null,
  onRecordMissingTokens: null,
  historyItems: [],
  onSpeak: null,
  onCancelSpeech: null,
  speech: null,
  aiAvailable: false,
  onAiResegment: null,
  dialectNormalizationAvailable: false,
  onNormalizeDialectText: null,
  dialectAudioRecognitionAvailable: false,
  onRecognizeDialectAudio: null,
  imageOcrAvailable: false,
  onRecognizeImageText: null,
  onlineSearchAvailable: false,
  onSearchMissingTokensOnline: null,
  aiImageGenerationAvailable: false,
  onGenerateMissingTokenPictogram: null,
  onShareReceiver: null,
  correctionMemory: null,
  onReviewMissingToken: null,
  missingTokenRecords: [],
  copyOverrides: null
};
