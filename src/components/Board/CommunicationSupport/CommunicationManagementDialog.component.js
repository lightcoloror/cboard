import { createLocalSavedPhraseImport, createLocalSavedPhraseUndo, getCommunicationStorageScopeKey } from '../../../common/communicationSupport/localData';
import { filterSavedPhrasesByText } from '../../../common/communicationSupport/savedPhraseUse';
import { currentImageOperationEpoch } from '../../../common/communicationSupport/imageOperationEpoch';
import PatientActionButton from './PatientActionButton.component';
import { PATIENT_ACTION_IDS } from '../../../common/communicationSupport/patientActionLanguage';
import React, { useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import TextField from '@material-ui/core/TextField';
import Symbol from '../Symbol';
import {
  buildCommunicationHistoryAnonymizedOpenBoardLog,
  buildCommunicationHistoryExportText,
  buildCommunicationHistoryOpenBoardLog,
  clearCommunicationHistory,
  deleteCommunicationHistoryEntry,
  getCommunicationHistoryPatientFeedbackText,
  getCommunicationHistoryReplayText,
  importCommunicationHistoryOpenBoardLog,
  normalizeManagedCommunicationHistory,
  toggleCommunicationHistoryFavorite,
  updateCommunicationHistoryCandidateFeedback
} from '../../../common/communicationSupport/historyManagement';
import {
  CANDIDATE_FEEDBACK,
  normalizeExpressionCandidates
} from '../../../common/communicationSupport/candidateFeedback';
import {
  addCommunicationSavedPhrase,
  buildCommunicationSavedPhraseExport,
  assignSavedPhraseLifeContext,
  filterSavedPhrasesByLifeContext
} from '../../../common/communicationSupport/savedPhraseManagement';
import { buildCommunicationTileCatalog } from '../../../common/communicationSupport/symbolMatching';
import {
  COMMUNICATION_MATCHING_DIAGNOSTIC_EXAMPLES,
  COMMUNICATION_MATCHING_DIAGNOSTIC_MAX_LENGTH,
  analyzeCommunicationMatching
} from '../../../common/communicationSupport/matchingDiagnostics';
import { buildCorrectionMemoryManagementRows } from '../../../common/communicationSupport/correctionMemory';
import {
  createReceiverReviewId,
  deleteReceiverReviewItem,
  insertReceiverReviewItem,
  moveReceiverReviewItem,
  replaceReceiverReviewItem,
  restoreReceiverLoopState
} from '../../../common/communicationSupport/receiverPipeline';
import {
  RECEIVER_CORRECTION_ACTIONS,
  buildReceiverCorrectionFromHistoryEdit,
  getEffectiveReceiverHistoryEntry
} from '../../../common/communicationSupport/receiverLifecycle';
import PersonalImageManager from './PersonalImageManager.component';
import LifeContextFilter from './LifeContextFilter.component';

function downloadText(filename, text, type) {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    !window.URL ||
    typeof window.URL.createObjectURL !== 'function'
  ) {
    return false;
  }
  const url = window.URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
  return true;
}

export default function CommunicationManagementDialog({
  onSavedPhraseAction,
  onPrepareSavedPhrase,
  preparedSelection,
  open,
  onClose,
  boards,
  editableBoards,
  intl,
  savedPhrases,
  historyItems,
  personalImagePreferences,
  personalImageError,
  correctionMemory,
  receiverCorrections,
  candidateFeedbackSyncAvailable,
  onSavedPhrasesChange,
  onSaveHistoryPhrase,
  onSavedPhrasesCommitted,
  onSavedPhraseContextChange,
  onHistoryChange,
  onPersonalImageSave,
  onPersonalImageRemove,
  onCuratedBoardSave,
  galleryUndo,
  onCreatePersonalBoard,
  onForgetCorrectionMemory,
  onReceiverCorrection,
  onExportDeviceData,
  onClearPrivatePictograms,
  onClearAllLocalData,
  onApplyOutput,
  onSpeak
}) {
  const [activeTab, setActiveTab] = useState('phrases');
  const [importPreview, setImportPreview] = useState(null);
  const importService = useRef(null);
  const importEpoch = useRef(0);
  const dialogMounted = useRef(true);
  const [committedRefresh, setCommittedRefresh] = useState(null);
  React.useEffect(() => () => { dialogMounted.current = false; importEpoch.current += 1; if (importService.current) importService.current.cancel(); }, []);
  React.useEffect(() => {
    if (open) return;
    importEpoch.current += 1;
    if (importService.current) importService.current.cancel();
    setImportPreview(null);
    setCommittedRefresh(null);
  }, [open]);
  const [lifeContext, setLifeContext] = useState(null);
  const [phraseQuery, setPhraseQuery] = useState('');
  const undoScope = getCommunicationStorageScopeKey();
  const undoService = useMemo(() => createLocalSavedPhraseUndo(), [open, undoScope]);
  const [undoState, setUndoState] = useState({ count: 0, operationId: null });
  React.useEffect(() => { setUndoState(undoService.state()); setPhraseQuery(''); }, [undoService]);
  React.useEffect(() => {
    if (!preparedSelection) return;
    setActiveTab('phrases'); setLifeContext(preparedSelection.lifeContext || '');
    setNotice(preparedSelection.cleanupPending ? '常用语已保存；准备草稿清理失败，重试保存不会重复收藏。' : '已定位这条常用语；播报或载入由你主动选择。');
  }, [preparedSelection]);
  React.useEffect(() => {
    if (!open || !preparedSelection) return undefined;
    const timer = setTimeout(() => {
      const node = document.getElementById(`saved-phrase-${preparedSelection.id}`);
      if (node) { node.focus(); if (node.scrollIntoView) node.scrollIntoView({ block: 'nearest' }); }
    }, 0);
    return () => clearTimeout(timer);
  }, [open, preparedSelection, lifeContext]);
  const [contextEditingId, setContextEditingId] = useState(null);
  const [contextDraft, setContextDraft] = useState('');
  const contextPhrases = filterSavedPhrasesByText(filterSavedPhrasesByLifeContext(savedPhrases, lifeContext), phraseQuery);
  const [historyReview, setHistoryReview] = useState(null);
  const [historyPicker, setHistoryPicker] = useState(null);
  const [historyPickerQuery, setHistoryPickerQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [deviceAction, setDeviceAction] = useState(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [diagnosticInput, setDiagnosticInput] = useState('');
  const [diagnosticResult, setDiagnosticResult] = useState(null);
  const catalog = useMemo(() => buildCommunicationTileCatalog(boards, intl), [
    boards,
    intl
  ]);
  const tileById = useMemo(
    () =>
      new Map(catalog.map(candidate => [candidate.tile.id, candidate.tile])),
    [catalog]
  );
  const managedHistory = useMemo(
    () => normalizeManagedCommunicationHistory(historyItems),
    [historyItems]
  );
  const correctionRows = useMemo(
    () => buildCorrectionMemoryManagementRows(correctionMemory, catalog),
    [catalog, correctionMemory]
  );
  const historyPickerCandidates = useMemo(
    () => {
      const query = historyPickerQuery.trim().toLowerCase();
      return catalog
        .filter(candidate => {
          if (!query) return true;
          return [
            candidate.displayLabel,
            ...(candidate.labels || []),
            ...(candidate.synonyms || [])
          ].some(value =>
            String(value || '')
              .toLowerCase()
              .includes(query)
          );
        })
        .slice(0, 24);
    },
    [catalog, historyPickerQuery]
  );

  function runMatchingDiagnostic(value = diagnosticInput) {
    const result = analyzeCommunicationMatching(value, boards, {
      intl,
      correctionMemory
    });
    setDiagnosticInput(result.inputText);
    setDiagnosticResult(result);
    setNotice(
      result.totalCount
        ? '只读诊断完成，不会保存历史、上传数据或生成缺词任务。'
        : '请先输入需要检查的文字。'
    );
  }

  const phraseActionPending = useRef(false);
  const undoPending = useRef(false);
  function dispatchPhrase(item, mode) {
    if (phraseActionPending.current) return;
    phraseActionPending.current = true;
    try { if (onSavedPhraseAction) onSavedPhraseAction(item, mode); }
    finally { Promise.resolve().then(() => { phraseActionPending.current = false; }); }
  }
  function reusePhrase(item) {
    dispatchPhrase(item, 'reuse');
  }

  function refreshCommittedPhrases(receipt) {
    const current = () => dialogMounted.current && receipt.epoch === importEpoch.current &&
      receipt.scopeKey === getCommunicationStorageScopeKey() && receipt.privacyEpoch === currentImageOperationEpoch();
    if (!current()) return false;
    try {
      const items = onSavedPhrasesCommitted({ scopeKey: receipt.scopeKey, guard: current });
      if (!Array.isArray(items)) throw new Error('没有读到已保存的常用语列表。');
      if (!current()) return false;
      setCommittedRefresh(null);
      if (receipt.imported) setImportPreview(null);
      setNotice(receipt.message);
      return true;
    } catch (error) {
      if (current()) {
        setCommittedRefresh(receipt);
        setNotice('操作已保存到本机，但列表读取失败；请重新读取常用语。');
      }
      return false;
    }
  }

  function refreshUndoState() {
    if (!dialogMounted.current || undoScope !== getCommunicationStorageScopeKey()) return;
    try { setUndoState(undoService.state()); }
    catch (_) { setUndoState({ count: 0, operationId: null }); }
  }

  function removePhrase(id) {
    const epoch = importEpoch.current;
    const privacyEpoch = currentImageOperationEpoch();
    try {
      const result = undoService.delete(id);
      refreshCommittedPhrases({ scopeKey: undoScope, epoch, privacyEpoch,
        message: result.changed ? '已删除，可以撤销。' : '这条常用语已经删除。' });
    } catch (error) { setNotice(error.message || '删除失败，恢复快照仍保留。'); }
    finally { refreshUndoState(); }
  }

  function undoDelete() {
    if (undoPending.current) return;
    undoPending.current = true;
    const epoch = importEpoch.current;
    const privacyEpoch = currentImageOperationEpoch();
    try {
      undoService.undo(undoState.operationId);
      refreshCommittedPhrases({ scopeKey: undoScope, epoch, privacyEpoch,
        message: '已恢复常用语，原句和图片保持不变。' });
    } catch (error) { setNotice(error.message || '撤销失败，请重试。'); }
    finally {
      refreshUndoState();
      Promise.resolve().then(() => { undoPending.current = false; });
    }
  }

  function exportPhrases() {
    const text = JSON.stringify(
      buildCommunicationSavedPhraseExport(savedPhrases, {
        appId: 'picinterpreter'
      }),
      null,
      2
    );
    setNotice(
      downloadText(
        'picinterpreter-saved-phrases.json',
        text,
        'application/json'
      )
        ? '常用语已导出。'
        : '当前环境不支持文件导出。'
    );
  }

  async function importPhrases(event) {
    const file = event.target && event.target.files && event.target.files[0];
    if (!file) return;
    const ticket = ++importEpoch.current, scope = getCommunicationStorageScopeKey();
    const privacyEpoch = currentImageOperationEpoch();
    setImportPreview(null);
    setCommittedRefresh(null);
    if (importService.current) importService.current.cancel();
    try {
        // Capture account and local identity before asynchronous file reading.
        const operation = createLocalSavedPhraseImport({ availableTileIds: new Set(tileById.keys()), resolveTile: id => tileById.get(id) || null });
        importService.current = operation;
      const input = await file.text();
      if (ticket !== importEpoch.current || scope !== getCommunicationStorageScopeKey() || privacyEpoch !== currentImageOperationEpoch()) return;
        const preview = operation.preview(input);
      setImportPreview(preview); setNotice(preview.error || '请查看导入预览，确认后才会保存。');
    } catch (error) {
      if (dialogMounted.current && ticket === importEpoch.current && scope === getCommunicationStorageScopeKey() && privacyEpoch === currentImageOperationEpoch()) setNotice(`导入失败：${error.message}`);
    }
    finally { if (event.target) event.target.value = ''; }
  }
  function confirmImport() {
    const epoch = importEpoch.current;
    const privacyEpoch = currentImageOperationEpoch();
    try {
      const result = importService.current.commit();
      if (!result.committed) { setImportPreview(result); setNotice(result.message || result.error); return; }
      refreshCommittedPhrases({ scopeKey: undoScope, epoch, privacyEpoch, imported: true,
        message: `已导入 ${result.addedCount} 条，重复 ${result.duplicateCount} 条，无效 ${result.invalidCount} 条，缺少图片 ${result.missingPictogramCount} 个。` });
    } catch (error) { setNotice(`保存失败：${error.message}；请重试，原预览保留。`); }
  }

  function updateHistory(id, action) {
    const result =
      action === 'favorite'
        ? toggleCommunicationHistoryFavorite(historyItems, id)
        : deleteCommunicationHistoryEntry(historyItems, id);
    if (!result.changed) return;
    try {
      if (action === 'favorite') {
        const entry = result.items.find(item => item.id === id);
        if (entry && entry.isFavorite) {
          const effective = getEffectiveReceiverHistoryEntry(
            entry,
            receiverCorrections
          );
          const draft = {
            sentence: getCommunicationHistoryReplayText(effective),
            output: JSON.parse(JSON.stringify(effective.output || [])),
            sourceHistoryId: id
          };
          if (onSaveHistoryPhrase) {
            onSaveHistoryPhrase(draft);
          } else {
            const favorite = addCommunicationSavedPhrase(savedPhrases, draft);
            if (!favorite.item) throw new Error('这条记录没有可收藏的内容');
            if (favorite.changed) onSavedPhrasesChange(favorite.items);
          }
          setNotice('已独立保存到常用语，删除或淘汰这条历史不会删除收藏。');
        } else {
          setNotice('已取消历史标记；独立收藏仍保留，可在常用语管理中删除。');
        }
      }
      onHistoryChange(result.items);
    } catch (error) {
      setNotice(error.message || '收藏保存失败，请重试。');
    }
  }

  function updateCandidateFeedback(id, candidateIndex, feedback) {
    const result = updateCommunicationHistoryCandidateFeedback(
      historyItems,
      id,
      candidateIndex,
      feedback
    );
    if (!result.changed) return;
    onHistoryChange(result.items);
    setNotice('候选句反馈已保存在本机，不随普通沟通历史上传。');
  }

  function startReceiverHistoryReview(item) {
    const effectiveItem = getEffectiveReceiverHistoryEntry(
      item,
      receiverCorrections
    );
    const restored = restoreReceiverLoopState(effectiveItem, boards, {
      intl
    });
    if (!restored) {
      setNotice('这条旧记录没有可恢复的图片序列，暂时不能修正。');
      return;
    }

    setHistoryReview({
      record: item,
      reviewItems: restored.reviewItems
    });
    setHistoryPicker(null);
    setHistoryPickerQuery('');
    setNotice('历史修正只追加审计证据，不覆盖患者当时看到的原记录。');
  }

  function closeReceiverHistoryReview() {
    setHistoryReview(null);
    setHistoryPicker(null);
    setHistoryPickerQuery('');
  }

  function persistReceiverHistoryEdit(action, itemId, nextItems) {
    if (!historyReview || nextItems === historyReview.reviewItems) return false;

    try {
      const correction = buildReceiverCorrectionFromHistoryEdit(
        historyReview.record,
        action,
        historyReview.reviewItems,
        nextItems,
        itemId
      );
      if (!onReceiverCorrection(correction)) {
        setNotice('历史图片修正未能保存，请重试。');
        return false;
      }
      setHistoryReview(current =>
        current && current.record.id === historyReview.record.id
          ? { ...current, reviewItems: nextItems }
          : current
      );
      setNotice('历史图片修正已保存，原记录和修正证据均已保留。');
      return true;
    } catch (error) {
      setNotice('这次历史图片修正无效，原记录未被改动。');
      return false;
    }
  }

  function openHistoryPicker(mode, itemId) {
    setHistoryPicker({ mode, itemId });
    setHistoryPickerQuery('');
  }

  function chooseHistoryPictogram(candidate) {
    if (!historyReview || !historyPicker) return;

    if (historyPicker.mode === 'replace') {
      persistReceiverHistoryEdit(
        RECEIVER_CORRECTION_ACTIONS.replace,
        historyPicker.itemId,
        replaceReceiverReviewItem(
          historyReview.reviewItems,
          historyPicker.itemId,
          candidate
        )
      );
    } else {
      const insertedId = createReceiverReviewId('history-review');
      persistReceiverHistoryEdit(
        RECEIVER_CORRECTION_ACTIONS.insert,
        insertedId,
        insertReceiverReviewItem(
          historyReview.reviewItems,
          historyPicker.itemId,
          candidate,
          { itemId: insertedId }
        )
      );
    }
    setHistoryPicker(null);
    setHistoryPickerQuery('');
  }

  function renderReceiverHistoryReview() {
    if (!historyReview) return null;

    return (
      <section className="CommunicationSupportPanel__historyReviewEditor">
        <div className="CommunicationSupportPanel__historyReviewHeader">
          <strong>照护者修正图片序列</strong>
          <span className="CommunicationSupportPanel__meta">
            每次操作立即保存审计，原记录不会被覆盖。
          </span>
        </div>
        <div className="CommunicationSupportPanel__historyReviewSequence">
          {historyReview.reviewItems.map((reviewItem, reviewIndex) => (
            <div
              className="CommunicationSupportPanel__historyReviewItem"
              key={reviewItem.id}
            >
              <div className="CommunicationSupportPanel__historyReviewSymbol">
                {reviewItem.tile ? (
                  <Symbol
                    className="CommunicationSupportPanel__symbol CommunicationSupportPanel__symbol--preview"
                    image={reviewItem.tile.tile.image}
                    keyPath={reviewItem.tile.tile.keyPath}
                    label={reviewItem.tile.displayLabel}
                    labelpos="Below"
                  />
                ) : (
                  <span>?</span>
                )}
              </div>
              <div className="CommunicationSupportPanel__meta">
                {reviewItem.token}
              </div>
              <div className="CommunicationSupportPanel__matchActions">
                <Button
                  size="small"
                  disabled={reviewIndex === 0}
                  onClick={() =>
                    persistReceiverHistoryEdit(
                      RECEIVER_CORRECTION_ACTIONS.reorder,
                      reviewItem.id,
                      moveReceiverReviewItem(
                        historyReview.reviewItems,
                        reviewItem.id,
                        -1
                      )
                    )
                  }
                >
                  左移
                </Button>
                <Button
                  size="small"
                  disabled={
                    reviewIndex === historyReview.reviewItems.length - 1
                  }
                  onClick={() =>
                    persistReceiverHistoryEdit(
                      RECEIVER_CORRECTION_ACTIONS.reorder,
                      reviewItem.id,
                      moveReceiverReviewItem(
                        historyReview.reviewItems,
                        reviewItem.id,
                        1
                      )
                    )
                  }
                >
                  右移
                </Button>
                <Button
                  color="primary"
                  size="small"
                  onClick={() => openHistoryPicker('replace', reviewItem.id)}
                >
                  换图
                </Button>
                <Button
                  color="primary"
                  size="small"
                  onClick={() => openHistoryPicker('insert', reviewItem.id)}
                >
                  后面加图
                </Button>
                <Button
                  color="secondary"
                  size="small"
                  onClick={() =>
                    persistReceiverHistoryEdit(
                      RECEIVER_CORRECTION_ACTIONS.delete,
                      reviewItem.id,
                      deleteReceiverReviewItem(
                        historyReview.reviewItems,
                        reviewItem.id
                      )
                    )
                  }
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
          {!historyReview.reviewItems.length && (
            <p>当前修订序列为空，可以从图片目录添加。</p>
          )}
        </div>
        <Button
          color="primary"
          variant="outlined"
          onClick={() =>
            openHistoryPicker(
              'insert',
              historyReview.reviewItems.length
                ? historyReview.reviewItems[
                    historyReview.reviewItems.length - 1
                  ].id
                : ''
            )
          }
        >
          在末尾添加图片
        </Button>
        {historyPicker && (
          <div
            className="CommunicationSupportPanel__historyPicker"
            role="dialog"
            aria-label={
              historyPicker.mode === 'replace' ? '选择替换图片' : '选择新增图片'
            }
          >
            <TextField
              fullWidth
              variant="outlined"
              placeholder="搜索图片或词语"
              value={historyPickerQuery}
              onChange={event => setHistoryPickerQuery(event.target.value)}
            />
            <div className="CommunicationSupportPanel__swapGrid">
              {historyPickerCandidates.map(candidate => (
                <button
                  type="button"
                  key={candidate.id}
                  className="CommunicationSupportPanel__swapOption"
                  aria-label={`选择图片：${candidate.displayLabel}`}
                  onClick={() => chooseHistoryPictogram(candidate)}
                >
                  <Symbol
                    className="CommunicationSupportPanel__symbol CommunicationSupportPanel__symbol--swap"
                    image={candidate.tile.image}
                    keyPath={candidate.tile.keyPath}
                    label={candidate.displayLabel}
                    labelpos="Below"
                  />
                  <span className="CommunicationSupportPanel__meta">
                    {candidate.boardName}
                  </span>
                </button>
              ))}
            </div>
            {!historyPickerCandidates.length && <p>没有找到对应图片。</p>}
            <Button color="primary" onClick={() => setHistoryPicker(null)}>
              关闭图片目录
            </Button>
          </div>
        )}
      </section>
    );
  }

  function exportHistory() {
    setNotice(
      downloadText(
        'picinterpreter-history.txt',
        buildCommunicationHistoryExportText(historyItems),
        'text/plain;charset=utf-8'
      )
        ? '沟通历史已导出。'
        : '当前环境不支持文件导出。'
    );
  }

  function exportOpenBoardLog() {
    setNotice(
      downloadText(
        'picinterpreter-history.obl',
        buildCommunicationHistoryOpenBoardLog(historyItems),
        'application/json;charset=utf-8'
      )
        ? '标准沟通日志已导出，请作为私密文件保管。'
        : '当前环境不支持文件导出。'
    );
  }

  function exportAnonymizedOpenBoardLog() {
    setNotice(
      downloadText(
        'picinterpreter-history-anonymized.obla',
        buildCommunicationHistoryAnonymizedOpenBoardLog(historyItems),
        'application/json;charset=utf-8'
      )
        ? '匿名研究日志已导出；原文已不可逆遮蔽，不能用于恢复对话。'
        : '当前环境不支持文件导出。'
    );
  }

  async function importOpenBoardLog(event) {
    const file = event.target && event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const result = importCommunicationHistoryOpenBoardLog(
        await file.text(),
        historyItems
      );
      if (!result.ok) {
        setNotice(result.error);
      } else {
        if (result.addedCount) onHistoryChange(result.items);
        const unsupportedNotice = result.unsupportedEventCount
          ? `，忽略 ${result.unsupportedEventCount} 个非文字事件`
          : '';
        setNotice(
          `已导入 ${result.addedCount} 条，跳过 ${
            result.skippedCount
          } 条${unsupportedNotice}。导入记录只保存在本机。`
        );
      }
    } catch (error) {
      setNotice('标准沟通日志文件读取失败。');
    } finally {
      if (event.target) event.target.value = '';
    }
  }

  function forgetCorrectionMemory(token) {
    if (onForgetCorrectionMemory(token)) {
      setNotice(`已停止记住“${token}”，纠错审计仍会保留。`);
      return;
    }
    setNotice('这条修正记忆已经失效。');
  }

  async function runDeviceAction(callback, successMessage) {
    setDeviceBusy(true);
    try {
      const result = await callback();
      setNotice(result && result.message ? result.message : successMessage);
      return result;
    } catch (error) {
      setNotice('操作未能完成，本机数据没有被标记为已处理。');
      return null;
    } finally {
      setDeviceBusy(false);
    }
  }

  function exportDeviceData() {
    return runDeviceAction(onExportDeviceData, '完整本机数据备份已导出。');
  }

  function confirmClearPrivatePictograms() {
    setDeviceAction(null);
    return runDeviceAction(onClearPrivatePictograms, '本机私人图片已清除。');
  }

  function confirmClearAllLocalData() {
    setDeviceAction(null);
    return runDeviceAction(onClearAllLocalData, '本机数据已清除。');
  }

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      aria-labelledby="communication-management-title"
    >
      <DialogTitle id="communication-management-title">
        常用语、历史、个人图片、修正记忆、匹配诊断与本机数据
      </DialogTitle>
      <DialogContent className="CommunicationSupportPanel__managementScreen">
        <div className="CommunicationSupportPanel__managementTabs">
          <Button
            color="primary"
            variant={activeTab === 'phrases' ? 'contained' : 'outlined'}
            onClick={() => setActiveTab('phrases')}
          >
            常用语（{savedPhrases.length}）
          </Button>
          <Button
            color="primary"
            variant={activeTab === 'history' ? 'contained' : 'outlined'}
            onClick={() => setActiveTab('history')}
          >
            沟通历史（{managedHistory.length}）
          </Button>
          <Button
            color="primary"
            variant={activeTab === 'personal-images' ? 'contained' : 'outlined'}
            onClick={() => setActiveTab('personal-images')}
          >
            个人图片（{personalImagePreferences.length}）
          </Button>
          <Button
            color="primary"
            variant={
              activeTab === 'correction-memory' ? 'contained' : 'outlined'
            }
            onClick={() => setActiveTab('correction-memory')}
          >
            修正记忆（{correctionRows.length}）
          </Button>
          <Button
            color="primary"
            variant={activeTab === 'device-data' ? 'contained' : 'outlined'}
            onClick={() => setActiveTab('device-data')}
          >
            本机数据
          </Button>
          <Button
            color="primary"
            variant={
              activeTab === 'matching-diagnostics' ? 'contained' : 'outlined'
            }
            onClick={() => setActiveTab('matching-diagnostics')}
          >
            匹配诊断
          </Button>
        </div>

        {notice && (
          <div
            className="CommunicationSupportPanel__environmentNotice"
            role="status"
          >
            {notice}
          </div>
        )}
        {committedRefresh && <Button onClick={() => refreshCommittedPhrases(committedRefresh)}>重新读取常用语</Button>}

        {activeTab === 'phrases' ? (
          <div>
            {onPrepareSavedPhrase && <Button variant="contained" color="primary" onClick={() => onPrepareSavedPhrase()}>准备常用表达</Button>}
            <LifeContextFilter items={savedPhrases} value={lifeContext} onChange={setLifeContext} />
            <TextField id="saved-phrase-search" label="搜索常用语原句" value={phraseQuery} onChange={event => setPhraseQuery(event.target.value)} />
            <PatientActionButton action={PATIENT_ACTION_IDS.undo} label={`撤销删除（${undoState.count}）`}
              ariaLabel="撤销上次删除的常用语" disabled={!undoState.count} onClick={undoDelete} />
            <p>本次使用可连续撤销最近 20 次删除；刷新、退出或切换档案后结束。图库图片不会随删除移除。</p>
            <p>先把确认过的表达收藏，再按自己的生活情境整理；也可保留不分类。</p>
            <div className="CommunicationSupportPanel__managementActions">
              <Button
                color="primary"
                variant="outlined"
                onClick={exportPhrases}
              >
                导出常用语
              </Button>
              <Button component="label" color="primary" variant="outlined">
                导入常用语
                <input
                  hidden
                  accept="application/json"
                  type="file"
                  onChange={importPhrases}
                />
              </Button>
            </div>
            {importPreview && <div role="group" aria-label="常用语导入预览">
              <p>预计新增 {importPreview.wouldAddCount || 0} 条；重复 {importPreview.duplicateCount || 0} 条；无效 {importPreview.invalidCount || 0} 条；缺少图片 {importPreview.missingPictogramCount || 0} 个；剩余容量 {importPreview.availableSlots || 0} 条。</p>
              {importPreview.error && <p>{importPreview.error}</p>}
              <Button disabled={Boolean(importPreview.capacityExceeded || importPreview.error)} onClick={confirmImport}>确认整批导入</Button>
              <Button onClick={() => { importEpoch.current += 1; if (importService.current) importService.current.cancel(); setImportPreview(null); }}>取消导入</Button>
            </div>}
            <div className="CommunicationSupportPanel__managementList">
              {contextPhrases.length ? (
                contextPhrases.map(item => (
                  <article
                    id={`saved-phrase-${item.id}`}
                    tabIndex={-1}
                    aria-label={preparedSelection && preparedSelection.id === item.id ? `已定位常用语：${item.sentence}` : undefined}
                    className="CommunicationSupportPanel__managementRow"
                    key={item.id || item.sentence}
                  >
                    <div><strong>{item.sentence}</strong><div className="CommunicationSupportPanel__meta">{(item.output || []).map(output => output.label).join(' / ')}</div></div>
                    <div className="CommunicationSupportPanel__matchActions">
                      <Button size="small" onClick={() => { setContextEditingId(item.id); setContextDraft(item.lifeContext || ''); }}>
                        情境：{item.lifeContext || '未分类'}
                      </Button>
                      <Button size="small" onClick={() => reusePhrase(item)}>重用</Button>
                      <Button size="small" onClick={() => dispatchPhrase(item, 'view')}>查看整句</Button>
                      <Button size="small" onClick={() => dispatchPhrase(item, 'play')}>一键播报</Button>
                      <Button size="small" disabled={item.careSharedReadOnly || !onPrepareSavedPhrase} onClick={() => onPrepareSavedPhrase({ id: item.id, mode: 'edit' })}>修改这条</Button>
                      <Button size="small" disabled={item.careSharedReadOnly || !onPrepareSavedPhrase} onClick={() => onPrepareSavedPhrase({ id: item.id, mode: 'copy' })}>以此准备新句</Button>
                      <Button size="small" disabled={item.careSharedReadOnly} onClick={() => removePhrase(item.id)}>删除</Button>
                    </div>
                    {contextEditingId === item.id && <div role="group" aria-label="编辑生活情境">
                      <TextField id={`life-context-${item.id}`} label="生活情境" value={contextDraft} inputProps={{ maxLength: 40 }}
                        helperText="如吃饭、散步或自定义名称；留空为未分类，仅保存在本机。"
                        onChange={event => setContextDraft(event.target.value)} />
                      <Button onClick={() => {
                        try {
                          const result = assignSavedPhraseLifeContext(savedPhrases, item.id, contextDraft);
                          if (result.changed) (onSavedPhraseContextChange || onSavedPhrasesChange)(result.items);
                          setContextEditingId(null); setNotice('生活情境已保存在本机，原句和图片未改变。');
                        } catch (error) { setNotice(`保存失败：${error.message}；情境修改仍保留，请重试。`); }
                      }}>保存情境</Button>
                      <Button onClick={() => setContextEditingId(null)}>取消</Button>
                    </div>}
                  </article>
                ))
              ) : (
                <p>{savedPhrases.length ? '这个情境还没有常用语，可切回全部进行整理。' : '还没有收藏常用语。'}</p>
              )}
            </div>
          </div>
        ) : activeTab === 'history' ? (
          <div>
            <div className="CommunicationSupportPanel__managementActions">
              <Button
                color="primary"
                variant="outlined"
                onClick={exportHistory}
                disabled={!managedHistory.length}
              >
                导出文本
              </Button>
              <Button
                color="primary"
                variant="outlined"
                onClick={exportOpenBoardLog}
                disabled={!managedHistory.length}
              >
                导出标准日志
              </Button>
              <Button
                color="primary"
                variant="outlined"
                onClick={exportAnonymizedOpenBoardLog}
                disabled={!managedHistory.length}
              >
                导出匿名研究日志
              </Button>
              <Button color="primary" component="label" variant="outlined">
                导入标准日志
                <input
                  hidden
                  accept=".obl,application/json"
                  type="file"
                  onChange={importOpenBoardLog}
                />
              </Button>
              <Button
                color="secondary"
                variant="outlined"
                onClick={() => onHistoryChange(clearCommunicationHistory())}
                disabled={!managedHistory.length}
              >
                清空历史
              </Button>
            </div>
            <p className="CommunicationSupportPanel__meta">
              标准日志采用 OpenAAC .obl
              0.1，包含沟通原文；导入只合并文字事件并留在本机，不读取姓名、设备或位置字段。匿名
              .obla
              会遮蔽全部原文、平移并扰动时间，只用于研究分析，不能恢复原始对话。
            </p>
            <div className="CommunicationSupportPanel__managementList">
              {managedHistory.length ? (
                managedHistory.map(item => {
                  const effectiveItem = getEffectiveReceiverHistoryEntry(
                    item,
                    receiverCorrections
                  );
                  const isReviewing =
                    historyReview && historyReview.record.id === item.id;
                  return (
                    <article
                      className="CommunicationSupportPanel__managementRow"
                      key={item.id}
                    >
                      <div>
                        <strong>
                          {getCommunicationHistoryReplayText(effectiveItem)}
                        </strong>
                        <div className="CommunicationSupportPanel__meta">
                          {item.direction === 'receive' ? '接收' : '表达'}
                          {item.isFavorite ? ' · 已收藏' : ''}
                          {item.importSource === 'open-board-log'
                            ? ' · 标准日志导入 · 仅本机'
                            : ''}
                          {getCommunicationHistoryPatientFeedbackText(item)
                            ? ` · ${getCommunicationHistoryPatientFeedbackText(
                                item
                              )}`
                            : ''}
                          {effectiveItem.receiverHistoryRevision
                            ? ' · 已有照护者图片修正'
                            : ''}
                        </div>
                        {item.direction === 'receive' && (
                          <div className="CommunicationSupportPanel__meta">
                            当前图片：
                            {effectiveItem.labels.join(' / ') || '无'}
                          </div>
                        )}
                        {item.direction === 'express' && (
                          <div className="CommunicationSupportPanel__historyCandidateList">
                            {normalizeExpressionCandidates(
                              item.candidates,
                              item.candidateSentences
                            ).map((candidate, candidateIndex) => (
                              <div
                                className="CommunicationSupportPanel__historyCandidate"
                                key={`${item.id}-${candidateIndex}`}
                              >
                                <span>{candidate.sentence}</span>
                                <div
                                  className="CommunicationSupportPanel__candidateFeedbackActions"
                                  role="group"
                                  aria-label={`复盘候选句：${
                                    candidate.sentence
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="CommunicationSupportPanel__candidateFeedback"
                                    aria-label={`有帮助：${candidate.sentence}`}
                                    aria-pressed={
                                      candidate.feedback ===
                                      CANDIDATE_FEEDBACK.up
                                    }
                                    onClick={() =>
                                      updateCandidateFeedback(
                                        item.id,
                                        candidateIndex,
                                        CANDIDATE_FEEDBACK.up
                                      )
                                    }
                                  >
                                    👍 有帮助
                                  </button>
                                  <button
                                    type="button"
                                    className="CommunicationSupportPanel__candidateFeedback"
                                    aria-label={`不符合：${candidate.sentence}`}
                                    aria-pressed={
                                      candidate.feedback ===
                                      CANDIDATE_FEEDBACK.down
                                    }
                                    onClick={() =>
                                      updateCandidateFeedback(
                                        item.id,
                                        candidateIndex,
                                        CANDIDATE_FEEDBACK.down
                                      )
                                    }
                                  >
                                    👎 不符合
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="CommunicationSupportPanel__matchActions">
                        <Button
                          color="primary"
                          size="small"
                          onClick={() =>
                            onSpeak(
                              getCommunicationHistoryReplayText(effectiveItem)
                            )
                          }
                        >
                          朗读
                        </Button>
                        {item.direction === 'receive' &&
                          item.recordStatus === 'confirmed' &&
                          Array.isArray(item.pictogramSequence) && (
                            <Button
                              color="primary"
                              size="small"
                              onClick={() =>
                                isReviewing
                                  ? closeReceiverHistoryReview()
                                  : startReceiverHistoryReview(item)
                              }
                            >
                              {isReviewing ? '完成修正' : '修正图片'}
                            </Button>
                          )}
                        <Button
                          size="small"
                          onClick={() => updateHistory(item.id, 'favorite')}
                        >
                          {item.isFavorite ? '取消标记' : '收藏'}
                        </Button>
                        <Button
                          size="small"
                          onClick={() => updateHistory(item.id, 'delete')}
                        >
                          删除
                        </Button>
                      </div>
                      {isReviewing && renderReceiverHistoryReview()}
                    </article>
                  );
                })
              ) : (
                <p>还没有沟通历史。</p>
              )}
            </div>
          </div>
        ) : activeTab === 'personal-images' ? (
          <PersonalImageManager
            boards={boards}
            editableBoards={editableBoards}
            preferences={personalImagePreferences}
            preferencesError={personalImageError}
            onSave={onPersonalImageSave}
            onRemove={onPersonalImageRemove}
            onBoardSave={onCuratedBoardSave}
            galleryUndo={galleryUndo}
            onCreatePersonalBoard={onCreatePersonalBoard}
          />
        ) : activeTab === 'correction-memory' ? (
          <div>
            <p className="CommunicationSupportPanel__managementHint">
              这里只显示当前工作区本机正在生效的换图和删除规则。停止记住不会删除纠错审计，也不会修改
              CBoard 默认词典。
            </p>
            <div className="CommunicationSupportPanel__managementList">
              {correctionRows.length ? (
                correctionRows.map(row => (
                  <article
                    className="CommunicationSupportPanel__managementRow"
                    data-correction-token={row.token}
                    key={row.token}
                  >
                    <div>
                      <strong>{row.token}</strong>
                      <div className="CommunicationSupportPanel__meta">
                        {row.preferredLabel
                          ? `偏好图：${row.preferredLabel}`
                          : '没有偏好图'}
                        {' · '}
                        {row.blockedLabels.length
                          ? `已阻止：${row.blockedLabels.join(' / ')}`
                          : '没有阻止图片'}
                        {' · '}
                        换图确认 {row.frequencyCount} 次
                      </div>
                    </div>
                    <div className="CommunicationSupportPanel__matchActions">
                      <Button
                        color="secondary"
                        size="small"
                        onClick={() => forgetCorrectionMemory(row.token)}
                      >
                        不再记住
                      </Button>
                    </div>
                  </article>
                ))
              ) : (
                <p>当前工作区还没有正在生效的修正记忆。</p>
              )}
            </div>
          </div>
        ) : activeTab === 'matching-diagnostics' ? (
          <div className="CommunicationSupportPanel__diagnostics">
            <p className="CommunicationSupportPanel__managementHint">
              输入一句话查看真实分词、匹配类型和缺词。这里复用接收端当前规则，只读运行，不会写入沟通历史、缺词队列或云端。
            </p>
            <TextField
              id="communication-matching-diagnostic-input"
              fullWidth
              multiline
              minRows={2}
              label="待诊断文字"
              value={diagnosticInput}
              inputProps={{
                maxLength: COMMUNICATION_MATCHING_DIAGNOSTIC_MAX_LENGTH
              }}
              onChange={event => setDiagnosticInput(event.target.value)}
            />
            <div className="CommunicationSupportPanel__managementActions">
              <Button
                color="primary"
                variant="contained"
                onClick={() => runMatchingDiagnostic()}
              >
                开始诊断
              </Button>
              {COMMUNICATION_MATCHING_DIAGNOSTIC_EXAMPLES.map(example => (
                <Button
                  key={example}
                  size="small"
                  variant="outlined"
                  onClick={() => runMatchingDiagnostic(example)}
                >
                  {example}
                </Button>
              ))}
            </div>
            {diagnosticResult && diagnosticResult.totalCount > 0 && (
              <div className="CommunicationSupportPanel__diagnosticResult">
                <div className="CommunicationSupportPanel__diagnosticSummary">
                  <strong>
                    命中 {diagnosticResult.matchedCount} /{' '}
                    {diagnosticResult.totalCount}
                  </strong>
                  <span>
                    匹配率 {Math.round(diagnosticResult.matchRate * 100)}%
                    {' · '}分词引擎 {diagnosticResult.segmentation.engine}
                    {' · '}耗时 {diagnosticResult.elapsedMs} ms
                  </span>
                </div>
                <div className="CommunicationSupportPanel__diagnosticGrid">
                  {diagnosticResult.items.map((item, index) => (
                    <article
                      className="CommunicationSupportPanel__diagnosticItem"
                      data-match-token={item.token}
                      key={`${item.token}-${index}`}
                    >
                      <div className="CommunicationSupportPanel__diagnosticSymbol">
                        {item.matched ? (
                          <Symbol
                            className="CommunicationSupportPanel__symbol CommunicationSupportPanel__symbol--preview"
                            image={item.image}
                            keyPath={item.keyPath}
                            label={item.label}
                            labelpos="Below"
                          />
                        ) : (
                          <span aria-label={`${item.token} 未匹配`}>?</span>
                        )}
                      </div>
                      <strong>{item.token}</strong>
                      <span>
                        {item.matched ? item.label : '未匹配'}
                        {' · '}
                        {item.matchType}
                      </span>
                    </article>
                  ))}
                </div>
                {diagnosticResult.unmatchedTokens.length > 0 && (
                  <p className="CommunicationSupportPanel__diagnosticMissing">
                    缺词：{diagnosticResult.unmatchedTokens.join('、')}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="CommunicationSupportPanel__managementHint">
              这里管理当前浏览器中的完整本机数据。导出不会上传数据；清除操作只影响本机，不会删除云端账号数据。
            </p>
            <div className="CommunicationSupportPanel__managementList">
              <article className="CommunicationSupportPanel__managementRow">
                <div>
                  <strong>导出完整本机备份</strong>
                  <div className="CommunicationSupportPanel__meta">
                    包含图板、图片、许可与来源、常用语、沟通历史、接收记录、修正记录和待同步反馈。
                  </div>
                </div>
                <Button
                  color="primary"
                  variant="outlined"
                  disabled={deviceBusy}
                  onClick={exportDeviceData}
                >
                  导出 ZIP
                </Button>
              </article>
              <article className="CommunicationSupportPanel__managementRow">
                <div>
                  <strong>只清除私人图片</strong>
                  <div className="CommunicationSupportPanel__meta">
                    删除个人换图和本机补图，保留公开图库、沟通历史及云端数据。
                  </div>
                </div>
                {deviceAction === 'private' ? (
                  <div className="CommunicationSupportPanel__matchActions">
                    <Button
                      color="secondary"
                      variant="contained"
                      disabled={deviceBusy}
                      onClick={confirmClearPrivatePictograms}
                    >
                      确认清除私人图片
                    </Button>
                    <Button
                      disabled={deviceBusy}
                      onClick={() => setDeviceAction(null)}
                    >
                      取消
                    </Button>
                  </div>
                ) : (
                  <Button
                    color="secondary"
                    variant="outlined"
                    disabled={deviceBusy}
                    onClick={() => setDeviceAction('private')}
                  >
                    清除私人图片
                  </Button>
                )}
              </article>
              <article className="CommunicationSupportPanel__managementRow">
                <div>
                  <strong>清除全部本机数据</strong>
                  <div className="CommunicationSupportPanel__meta">
                    清除本浏览器中的 CBoard
                    图板、设置、登录信息和全部图语家记录。成功后页面会自动刷新，云端数据不会被删除。
                  </div>
                </div>
                {deviceAction === 'all' ? (
                  <div className="CommunicationSupportPanel__matchActions">
                    <Button
                      color="secondary"
                      variant="contained"
                      disabled={deviceBusy}
                      onClick={confirmClearAllLocalData}
                    >
                      确认清除全部本机数据
                    </Button>
                    <Button
                      disabled={deviceBusy}
                      onClick={() => setDeviceAction(null)}
                    >
                      取消
                    </Button>
                  </div>
                ) : (
                  <Button
                    color="secondary"
                    variant="outlined"
                    disabled={deviceBusy}
                    onClick={() => setDeviceAction('all')}
                  >
                    清除全部本机数据
                  </Button>
                )}
              </article>
            </div>
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="primary" variant="contained" onClick={onClose}>
          返回沟通
        </Button>
      </DialogActions>
    </Dialog>
  );
}

CommunicationManagementDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  boards: PropTypes.arrayOf(PropTypes.object),
  editableBoards: PropTypes.arrayOf(PropTypes.object),
  intl: PropTypes.object,
  savedPhrases: PropTypes.arrayOf(PropTypes.object),
  historyItems: PropTypes.arrayOf(PropTypes.object),
  personalImagePreferences: PropTypes.arrayOf(PropTypes.object),
  personalImageError: PropTypes.string,
  correctionMemory: PropTypes.shape({
    rules: PropTypes.arrayOf(PropTypes.object)
  }),
  receiverCorrections: PropTypes.arrayOf(PropTypes.object),
  candidateFeedbackSyncAvailable: PropTypes.bool,
  onSavedPhraseAction: PropTypes.func,
  onSavedPhrasesChange: PropTypes.func.isRequired,
  onSaveHistoryPhrase: PropTypes.func,
  onSavedPhrasesCommitted: PropTypes.func,
  onSavedPhraseContextChange: PropTypes.func,
  onHistoryChange: PropTypes.func.isRequired,
  onPersonalImageSave: PropTypes.func.isRequired,
  onPersonalImageRemove: PropTypes.func.isRequired,
  onCuratedBoardSave: PropTypes.func,
  onCreatePersonalBoard: PropTypes.func,
  onForgetCorrectionMemory: PropTypes.func.isRequired,
  onReceiverCorrection: PropTypes.func.isRequired,
  onExportDeviceData: PropTypes.func,
  onClearPrivatePictograms: PropTypes.func,
  onClearAllLocalData: PropTypes.func,
  onApplyOutput: PropTypes.func.isRequired,
  onSpeak: PropTypes.func.isRequired
};

CommunicationManagementDialog.defaultProps = {
  open: false,
  boards: [],
  editableBoards: [],
  intl: null,
  savedPhrases: [],
  historyItems: [],
  personalImagePreferences: [],
  personalImageError: '',
  correctionMemory: { rules: [] },
  receiverCorrections: [],
  candidateFeedbackSyncAvailable: false,
  onSavedPhrasesCommitted: () => false,
  onPersonalImageSave: () => false,
  onPersonalImageRemove: () => false,
  onCuratedBoardSave: () => false,
  onCreatePersonalBoard: () => false,
  onForgetCorrectionMemory: () => false,
  onReceiverCorrection: () => false,
  onExportDeviceData: () => null,
  onClearPrivatePictograms: () => null,
  onClearAllLocalData: () => null
};
