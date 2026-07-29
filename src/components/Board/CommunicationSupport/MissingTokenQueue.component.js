import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import TextField from '@material-ui/core/TextField';
import InputImage from '../../UI/InputImage';
import Symbol from '../Symbol';
import {
  countCatalogAutoResolvedMissingTokens,
  countPendingMissingTokens,
  findSafeLocalMissingTokenResolutions,
  getMissingTokenSuggestions
} from '../../../common/communicationSupport/missingTokens';
import {
  buildAiGeneratedRuntimePictogram,
  buildDevicePrivateRuntimePictogram
} from '../../../common/communicationSupport/runtimePictogram';
import { readPersonalImageBlob } from './PersonalImageManager.component';

const DEFAULT_COPY = {
  title: '缺图维护',
  hint: '照护者可处理本机记录的未匹配词',
  pending: '待处理',
  empty: '暂时没有需要维护的缺图词。',
  occurrences: '出现次数',
  recentSample: '最近原句',
  associate: '关联图卡',
  ignore: '忽略',
  restore: '恢复待处理',
  close: '关闭',
  search: '搜索图卡标签或同义词',
  noCandidates: '没有找到可关联的图卡。',
  associated: '已关联',
  saved: '维护结果已保存，下次生成会使用新规则。',
  failed: '维护结果保存失败，请稍后重试。',
  searchOnline: '在线搜索缺图',
  searchingOnline: '正在搜索...',
  onlineUnavailable: '在线补图不可用，离线沟通不受影响。',
  onlineFound: '在线搜索完成，请确认建议后再使用。',
  onlineEmpty: '在线搜索完成，暂时没有找到合适图片。',
  onlineFailed: '在线搜索失败，离线沟通不受影响。',
  onlineSuggestion: '在线建议',
  confirmOnline: '确认使用',
  sourceAndLicense: '来源与许可',
  choosePrivateImage: '选择本机图片',
  privateImageTitle: '建立本机私有词图',
  privateImageHint:
    '选择或拍摄患者熟悉的图片。图片和词图关联只保存在当前设备，不进入账号同步或公开图板。',
  privateImageLoading: '正在压缩并保存图片...',
  privateImageSaved: '已为“{token}”保存本机私有图片，下次生成会直接使用。',
  privateImageFailed: '本机图片读取失败，请重新选择。',
  privateImageScope: '仅本机私图，不会同步',
  generateAi: 'AI 生成图符',
  generatingAi: '正在生成...',
  aiLoginRequired: '登录后才能由照护者生成图符。',
  aiUnavailable: 'AI 图符生成尚未配置，请继续使用本机图片或在线搜索。',
  aiRateLimited: 'AI 图符生成请求过多或本月额度已用完，请稍后重试。',
  aiFailed: 'AI 图符生成失败，请继续使用本机图片或在线搜索。',
  aiPreviewTitle: '确认 AI 生成图符',
  aiPreviewHint:
    '请由照护者核对图片含义。AI 图片不会自动采用，也不能作为公开许可素材。',
  aiProvider: '生成服务',
  aiModel: '模型',
  aiScope: '仅保存在当前设备；使用受模型服务条款约束',
  aiConfirm: '确认并保存',
  aiCancel: '放弃',
  aiSaved: '已为“{token}”保存 AI 生成图符，下次生成会直接使用。',
  localResolved: '本机 CBoard 已自动解决 {count} 个过期缺图词。'
};

const STATUS_LABELS = {
  new: '待处理',
  suggested: '有建议',
  resolved: '已解决',
  ignored: '已忽略'
};

function getCandidateLabel(candidate) {
  return (
    (candidate && candidate.displayLabel) ||
    (candidate &&
      candidate.tile &&
      (candidate.tile.label || candidate.tile.vocalization)) ||
    ''
  );
}

function getStatusRank(record) {
  if (record.status === 'new' || record.status === 'suggested') {
    return 0;
  }
  return record.status === 'resolved' ? 1 : 2;
}

export default function MissingTokenQueue({
  records,
  catalog,
  onReview,
  onlineSearchAvailable,
  onSearchOnline,
  aiImageGenerationAvailable,
  onGeneratePictogram,
  readPrivateImage,
  copyOverrides
}) {
  const copy = { ...DEFAULT_COPY, ...(copyOverrides || {}) };
  const [activeRecordId, setActiveRecordId] = useState(null);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [privateImageRecordId, setPrivateImageRecordId] = useState(null);
  const [isLoadingPrivateImage, setIsLoadingPrivateImage] = useState(false);
  const [recentLocalResolvedCount, setRecentLocalResolvedCount] = useState(0);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [generatingRecordId, setGeneratingRecordId] = useState(null);
  const [generatedCandidate, setGeneratedCandidate] = useState(null);
  const visibleRecords = useMemo(
    () =>
      (records || [])
        .slice()
        .sort((left, right) => {
          const rankDifference = getStatusRank(left) - getStatusRank(right);
          return rankDifference || right.updatedAt - left.updatedAt;
        })
        .slice(0, 20),
    [records]
  );
  const localResolutions = useMemo(
    () => findSafeLocalMissingTokenResolutions(records, catalog),
    [catalog, records]
  );
  const localResolutionRecordIds = useMemo(
    () => new Set(localResolutions.map(item => item.recordId)),
    [localResolutions]
  );
  const persistedLocalResolvedCount = useMemo(
    () => countCatalogAutoResolvedMissingTokens(records),
    [records]
  );
  const localResolvedCount = Math.max(
    recentLocalResolvedCount,
    persistedLocalResolvedCount
  );
  const pendingCount = countPendingMissingTokens(
    records,
    localResolutionRecordIds
  );
  const activeRecord = visibleRecords.find(
    record => record.id === activeRecordId
  );
  const privateImageRecord = visibleRecords.find(
    record => record.id === privateImageRecordId
  );
  const filteredCatalog = useMemo(
    () => {
      const normalizedQuery = query.trim().toLocaleLowerCase();
      if (!normalizedQuery) {
        return (catalog || []).slice(0, 24);
      }

      return (catalog || [])
        .filter(candidate => {
          const terms = [
            getCandidateLabel(candidate),
            ...(candidate.labels || []),
            ...(candidate.synonyms || [])
          ];
          return terms.some(term =>
            String(term || '')
              .toLocaleLowerCase()
              .includes(normalizedQuery)
          );
        })
        .slice(0, 24);
    },
    [catalog, query]
  );

  useEffect(
    () => {
      if (!localResolutions.length) return;

      let resolvedCount = 0;
      localResolutions.forEach(resolution => {
        try {
          const result = onReview(resolution.recordId, {
            status: 'resolved',
            resolvedPictogramId: resolution.resolvedPictogramId,
            source: resolution.source,
            reviewedByCaregiver: false
          });
          if (result) resolvedCount += 1;
        } catch (error) {
          // A storage failure keeps the record pending for a later retry.
        }
      });

      if (resolvedCount) {
        setRecentLocalResolvedCount(current =>
          Math.max(current, resolvedCount)
        );
      }
    },
    [localResolutions, onReview]
  );

  function applyReview(recordId, review) {
    try {
      const result = onReview(recordId, review);
      if (!result) {
        throw new Error('Missing token review was not persisted');
      }
      setNotice(copy.saved);
      setActiveRecordId(null);
      setQuery('');
      return result;
    } catch (error) {
      setNotice(copy.failed);
      return null;
    }
  }

  async function resolveWithPrivateImage(blob) {
    if (!privateImageRecord) return;

    setIsLoadingPrivateImage(true);
    try {
      const image = await readPrivateImage(blob);
      const pictogram = buildDevicePrivateRuntimePictogram({
        recordId: privateImageRecord.id,
        label: privateImageRecord.normalizedToken,
        image
      });
      if (!pictogram) {
        throw new Error('Invalid device-private pictogram');
      }

      const saved = applyReview(privateImageRecord.id, {
        status: 'resolved',
        resolvedPictogramId: pictogram.id,
        resolvedPictogram: pictogram,
        source: 'device-private',
        reviewedByCaregiver: true
      });
      if (saved) {
        setNotice(
          copy.privateImageSaved.replace(
            '{token}',
            privateImageRecord.normalizedToken
          )
        );
        setPrivateImageRecordId(null);
      }
    } catch (error) {
      setNotice(copy.privateImageFailed);
    } finally {
      setIsLoadingPrivateImage(false);
    }
  }

  async function searchOnline() {
    if (!onlineSearchAvailable || typeof onSearchOnline !== 'function') {
      setNotice(copy.onlineUnavailable);
      return;
    }
    const recordIds = visibleRecords
      .filter(
        record =>
          (record.status === 'new' || record.status === 'suggested') &&
          !localResolutionRecordIds.has(record.id)
      )
      .map(record => record.id);
    if (!recordIds.length) return;

    setIsSearchingOnline(true);
    setNotice('');
    try {
      const result = await onSearchOnline(recordIds);
      setNotice(
        result && result.foundCount ? copy.onlineFound : copy.onlineEmpty
      );
    } catch (error) {
      setNotice(copy.onlineFailed);
    } finally {
      setIsSearchingOnline(false);
    }
  }

  async function generateAiPictogram(record) {
    if (
      !aiImageGenerationAvailable ||
      typeof onGeneratePictogram !== 'function'
    ) {
      setNotice(copy.aiLoginRequired);
      return;
    }

    setGeneratingRecordId(record.id);
    setGeneratedCandidate(null);
    setNotice('');
    try {
      const result = await onGeneratePictogram({
        label: record.normalizedToken
      });
      const image = await readPrivateImage(result.blob);
      const pictogram = buildAiGeneratedRuntimePictogram({
        recordId: record.id,
        generationId: result.generationId,
        label: record.normalizedToken,
        image,
        provider: result.provider,
        model: result.model
      });
      if (!pictogram) {
        throw new Error('Invalid AI-generated pictogram');
      }
      setGeneratedCandidate({
        recordId: record.id,
        token: record.normalizedToken,
        pictogram,
        provider: result.provider,
        model: result.model
      });
    } catch (error) {
      const status = error && error.response && error.response.status;
      if (status === 401) {
        setNotice(copy.aiLoginRequired);
      } else if (status === 503) {
        setNotice(copy.aiUnavailable);
      } else if (status === 429) {
        setNotice(copy.aiRateLimited);
      } else {
        setNotice(copy.aiFailed);
      }
    } finally {
      setGeneratingRecordId(null);
    }
  }

  function confirmGeneratedPictogram() {
    if (!generatedCandidate) return;
    const saved = applyReview(generatedCandidate.recordId, {
      status: 'resolved',
      resolvedPictogramId: generatedCandidate.pictogram.id,
      resolvedPictogram: generatedCandidate.pictogram,
      source: 'device-private',
      reviewedByCaregiver: true
    });
    if (saved) {
      setNotice(copy.aiSaved.replace('{token}', generatedCandidate.token));
      setGeneratedCandidate(null);
    }
  }

  return (
    <div className="CommunicationSupportPanel__section CommunicationSupportPanel__missingQueue">
      <div className="CommunicationSupportPanel__sectionHeader">
        <div>
          <h4>{copy.title}</h4>
          <span className="CommunicationSupportPanel__hint">{copy.hint}</span>
        </div>
        <div className="CommunicationSupportPanel__queueActions">
          <span className="CommunicationSupportPanel__queueCount">
            {copy.pending} {pendingCount}
          </span>
          <Button
            color="primary"
            size="small"
            variant="outlined"
            onClick={searchOnline}
            disabled={!pendingCount || isSearchingOnline}
          >
            {isSearchingOnline ? copy.searchingOnline : copy.searchOnline}
          </Button>
        </div>
      </div>

      {localResolvedCount > 0 && (
        <div
          className="CommunicationSupportPanel__environmentNotice"
          role="status"
        >
          {copy.localResolved.replace('{count}', localResolvedCount)}
        </div>
      )}

      {notice && (
        <div
          className="CommunicationSupportPanel__environmentNotice"
          role="status"
        >
          {notice}
        </div>
      )}

      <div className="CommunicationSupportPanel__missingQueueList">
        {visibleRecords.length ? (
          visibleRecords.map(record => {
            const resolvedCandidate = (catalog || []).find(
              candidate =>
                candidate &&
                candidate.tile &&
                candidate.tile.id === record.resolvedPictogramId
            );
            const resolvedPictogram = record.resolvedPictogram;
            const onlineSuggestions = getMissingTokenSuggestions(record);
            const isPending =
              record.status === 'new' || record.status === 'suggested';

            return (
              <article
                className="CommunicationSupportPanel__missingQueueItem"
                key={record.id}
              >
                <div className="CommunicationSupportPanel__missingQueueBody">
                  <div className="CommunicationSupportPanel__missingQueueTitle">
                    <strong>{record.normalizedToken}</strong>
                    <span
                      className={`CommunicationSupportPanel__queueStatus CommunicationSupportPanel__queueStatus--${
                        record.status
                      }`}
                    >
                      {STATUS_LABELS[record.status] || record.status}
                    </span>
                  </div>
                  <span className="CommunicationSupportPanel__meta">
                    {copy.occurrences}：{record.occurrenceCount}
                  </span>
                  {!!record.rawTextSamples.length && (
                    <span className="CommunicationSupportPanel__meta">
                      {copy.recentSample}：{record.rawTextSamples[0]}
                    </span>
                  )}
                  {record.status === 'resolved' &&
                    (resolvedCandidate || resolvedPictogram) && (
                      <span className="CommunicationSupportPanel__meta">
                        {copy.associated}：
                        {resolvedCandidate
                          ? getCandidateLabel(resolvedCandidate)
                          : resolvedPictogram.label}
                      </span>
                    )}
                  {record.status === 'resolved' &&
                    record.source === 'device-private' && (
                      <span className="CommunicationSupportPanel__meta">
                        {copy.privateImageScope}
                      </span>
                    )}
                  {record.status === 'suggested' &&
                    onlineSuggestions.length > 0 && (
                      <div className="CommunicationSupportPanel__onlineSuggestions">
                        {onlineSuggestions.map(pictogram => (
                          <div
                            className="CommunicationSupportPanel__onlineSuggestion"
                            key={pictogram.id}
                          >
                            <Symbol
                              className="CommunicationSupportPanel__symbol CommunicationSupportPanel__symbol--online"
                              image={pictogram.image}
                              label={pictogram.label}
                              labelpos="Below"
                            />
                            <div className="CommunicationSupportPanel__onlineSuggestionCopy">
                              <span className="CommunicationSupportPanel__meta">
                                {copy.onlineSuggestion}：{pictogram.label}
                              </span>
                              <span className="CommunicationSupportPanel__meta">
                                {copy.sourceAndLicense}：{pictogram.source.name}{' '}
                                · {pictogram.source.license}
                              </span>
                              <Button
                                size="small"
                                color="primary"
                                variant="contained"
                                onClick={() =>
                                  applyReview(record.id, {
                                    status: 'resolved',
                                    resolvedPictogramId: pictogram.id,
                                    source: 'online'
                                  })
                                }
                              >
                                {copy.confirmOnline}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
                <div className="CommunicationSupportPanel__matchActions">
                  {isPending ? (
                    <React.Fragment>
                      <Button
                        size="small"
                        color="primary"
                        variant="outlined"
                        onClick={() => setActiveRecordId(record.id)}
                      >
                        {copy.associate}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setPrivateImageRecordId(record.id)}
                      >
                        {copy.choosePrivateImage}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => generateAiPictogram(record)}
                        disabled={Boolean(generatingRecordId)}
                      >
                        {generatingRecordId === record.id
                          ? copy.generatingAi
                          : copy.generateAi}
                      </Button>
                      <Button
                        size="small"
                        onClick={() =>
                          applyReview(record.id, { status: 'ignored' })
                        }
                      >
                        {copy.ignore}
                      </Button>
                    </React.Fragment>
                  ) : (
                    <Button
                      size="small"
                      onClick={() => applyReview(record.id, { status: 'new' })}
                    >
                      {copy.restore}
                    </Button>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <div className="CommunicationSupportPanel__empty">{copy.empty}</div>
        )}
      </div>

      <Dialog
        open={Boolean(activeRecord)}
        onClose={() => setActiveRecordId(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {activeRecord
            ? `为“${activeRecord.normalizedToken}”关联图卡`
            : copy.associate}
        </DialogTitle>
        <DialogContent dividers>
          <TextField
            fullWidth
            variant="outlined"
            placeholder={copy.search}
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
          {filteredCatalog.length ? (
            <div className="CommunicationSupportPanel__swapGrid">
              {filteredCatalog.map(candidate => (
                <button
                  key={candidate.id}
                  className="CommunicationSupportPanel__swapOption"
                  onClick={() =>
                    applyReview(activeRecord.id, {
                      status: 'resolved',
                      resolvedPictogramId: candidate.tile.id,
                      source: 'caregiver'
                    })
                  }
                >
                  <Symbol
                    className="CommunicationSupportPanel__symbol CommunicationSupportPanel__symbol--swap"
                    image={candidate.tile.image}
                    keyPath={candidate.tile.keyPath}
                    label={getCandidateLabel(candidate)}
                    labelpos="Below"
                  />
                  <span className="CommunicationSupportPanel__meta">
                    {candidate.boardName}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="CommunicationSupportPanel__empty">
              {copy.noCandidates}
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActiveRecordId(null)} color="primary">
            {copy.close}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(privateImageRecord)}
        onClose={() => setPrivateImageRecordId(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {privateImageRecord
            ? `为“${privateImageRecord.normalizedToken}”选择本机图片`
            : copy.privateImageTitle}
        </DialogTitle>
        <DialogContent dividers>
          <p className="CommunicationSupportPanel__hint">
            {copy.privateImageHint}
          </p>
          <InputImage
            onChange={resolveWithPrivateImage}
            setIsLoadingImage={setIsLoadingPrivateImage}
          />
          {isLoadingPrivateImage && (
            <p className="CommunicationSupportPanel__hint">
              {copy.privateImageLoading}
            </p>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrivateImageRecordId(null)} color="primary">
            {copy.close}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(generatedCandidate)}
        onClose={() => setGeneratedCandidate(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{copy.aiPreviewTitle}</DialogTitle>
        <DialogContent dividers>
          <p className="CommunicationSupportPanel__hint">
            {copy.aiPreviewHint}
          </p>
          {generatedCandidate && (
            <div className="CommunicationSupportPanel__onlineSuggestion">
              <Symbol
                className="CommunicationSupportPanel__symbol CommunicationSupportPanel__symbol--online"
                image={generatedCandidate.pictogram.image}
                label={generatedCandidate.pictogram.label}
                labelpos="Below"
              />
              <div className="CommunicationSupportPanel__onlineSuggestionCopy">
                <span className="CommunicationSupportPanel__meta">
                  {copy.aiProvider}：{generatedCandidate.provider}
                </span>
                <span className="CommunicationSupportPanel__meta">
                  {copy.aiModel}：{generatedCandidate.model}
                </span>
                <span className="CommunicationSupportPanel__meta">
                  {copy.aiScope}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGeneratedCandidate(null)}>
            {copy.aiCancel}
          </Button>
          <Button
            color="primary"
            variant="contained"
            onClick={confirmGeneratedPictogram}
          >
            {copy.aiConfirm}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

MissingTokenQueue.propTypes = {
  records: PropTypes.arrayOf(PropTypes.object),
  catalog: PropTypes.arrayOf(PropTypes.object),
  onReview: PropTypes.func.isRequired,
  onlineSearchAvailable: PropTypes.bool,
  onSearchOnline: PropTypes.func,
  aiImageGenerationAvailable: PropTypes.bool,
  onGeneratePictogram: PropTypes.func,
  readPrivateImage: PropTypes.func,
  copyOverrides: PropTypes.object
};

MissingTokenQueue.defaultProps = {
  records: [],
  catalog: [],
  onlineSearchAvailable: false,
  onSearchOnline: null,
  aiImageGenerationAvailable: false,
  onGeneratePictogram: null,
  readPrivateImage: readPersonalImageBlob,
  copyOverrides: null
};
