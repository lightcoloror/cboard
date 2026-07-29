import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import shortid from 'shortid';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import InputImage from '../../UI/InputImage';
import { buildCommunicationTileCatalog } from '../../../common/communicationSupport/symbolMatching';
import {
  normalizeExpressionPictogramSearchQuery,
  searchExpressionPictograms
} from '../../../common/communicationSupport/expressionPictogramSearch';
import {
  DEFAULT_DEVICE_PRIVATE_PICTOGRAM_LICENSE,
  createDevicePrivatePictogramAttribution,
  normalizePublicPictogramAttribution
} from '../../../common/communicationSupport/pictogramAttribution';
import { isPersonalCommunicationBoard } from '../../../common/communicationSupport/boardManagement';
import {
  CURATED_PUBLIC_PICTOGRAM_ID_PREFIX,
  createCuratedPublicPictogram,
  listCuratedPublicPictograms,
  removeCuratedPublicPictogram
} from '../../../common/communicationSupport/publicPictogramCuration';
import {
  createBoardDTO,
  createTileDTO
} from '../../../common/communicationSupport/dto';
import './PersonalImageManager.css';

export function readPersonalImageBlob(blob) {
  return new Promise((resolve, reject) => {
    if (!blob || typeof FileReader === 'undefined') {
      reject(new TypeError('A browser image blob is required'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () =>
      reject(reader.error || new Error('Image read failed'));
    reader.readAsDataURL(blob);
  });
}

function candidateLabel(candidate) {
  return candidate.displayLabel || candidate.tile.label;
}

function preferenceKey(tileId, boardId) {
  return `${boardId}:${tileId}`;
}

function createDefaultCuratedId() {
  return `${CURATED_PUBLIC_PICTOGRAM_ID_PREFIX}${shortid.generate()}`;
}

export function buildPersonalImageSaveEntry(
  candidate,
  image,
  { author = '', license = '' } = {}
) {
  const tileId = candidate.tile.id;
  const boardId = candidate.boardId;
  const labelSnapshot = candidateLabel(candidate);

  return {
    tileId,
    boardId,
    labelSnapshot,
    image,
    pictogramAttribution: createDevicePrivatePictogramAttribution({
      boardId,
      tileId,
      label: labelSnapshot,
      author,
      license
    })
  };
}

export default function PersonalImageManager({
  boards,
  editableBoards,
  preferences,
  onSave,
  onRemove,
  onBoardSave,
  onCreatePersonalBoard,
  createCuratedId
}) {
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [targetBoardId, setTargetBoardId] = useState('');
  const [newBoardName, setNewBoardName] = useState('我的常用图卡');
  const [attributionAuthor, setAttributionAuthor] = useState('');
  const [attributionLicense, setAttributionLicense] = useState(
    DEFAULT_DEVICE_PRIVATE_PICTOGRAM_LICENSE
  );
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [notice, setNotice] = useState(
    '照片只保存在当前设备，不会进入账号同步或公开图板。'
  );
  const catalog = useMemo(() => buildCommunicationTileCatalog(boards), [
    boards
  ]);
  const sourceBoards = editableBoards.length ? editableBoards : boards;
  const editableBoardDtos = useMemo(
    () => sourceBoards.map(board => createBoardDTO(board)),
    [sourceBoards]
  );
  const editableCatalog = useMemo(
    () => buildCommunicationTileCatalog(sourceBoards),
    [sourceBoards]
  );
  const editableCandidateByKey = useMemo(
    () =>
      new Map(
        editableCatalog.map(candidate => [
          preferenceKey(candidate.tile.id, candidate.boardId),
          candidate
        ])
      ),
    [editableCatalog]
  );
  const candidateByKey = useMemo(
    () =>
      new Map(
        catalog.map(candidate => [
          preferenceKey(candidate.tile.id, candidate.boardId),
          candidate
        ])
      ),
    [catalog]
  );
  const preferenceByKey = useMemo(
    () =>
      new Map(
        preferences.map(preference => [
          preferenceKey(preference.tileId, preference.boardId),
          preference
        ])
      ),
    [preferences]
  );
  const configured = preferences
    .map(preference => ({
      preference,
      candidate: candidateByKey.get(
        preferenceKey(preference.tileId, preference.boardId)
      )
    }))
    .filter(item => Boolean(item.candidate));
  const normalizedQuery = normalizeExpressionPictogramSearchQuery(query);
  const candidates = useMemo(
    () => {
      if (!normalizedQuery) return catalog.slice(0, 40);

      const ranked = searchExpressionPictograms(boards, normalizedQuery, {
        limit: 40
      }).matches.flatMap(match => {
        const candidate = candidateByKey.get(
          preferenceKey(match.tile.id, match.boardId)
        );
        return candidate ? [candidate] : [];
      });
      const rankedKeys = new Set(
        ranked.map(candidate =>
          preferenceKey(candidate.tile.id, candidate.boardId)
        )
      );
      const boardMatches = catalog.filter(candidate => {
        const key = preferenceKey(candidate.tile.id, candidate.boardId);
        return (
          !rankedKeys.has(key) &&
          normalizeExpressionPictogramSearchQuery(candidate.boardName).includes(
            normalizedQuery
          )
        );
      });

      return [...ranked, ...boardMatches].slice(0, 40);
    },
    [boards, candidateByKey, catalog, normalizedQuery]
  );
  const selectedCandidate = candidateByKey.get(selectedKey) || null;
  const selectedPreference = preferenceByKey.get(selectedKey) || null;
  const personalBoards = editableBoardDtos.filter(isPersonalCommunicationBoard);
  const selectedTargetBoardId = personalBoards.some(
    board => board.id === targetBoardId
  )
    ? targetBoardId
    : personalBoards.length
    ? personalBoards[0].id
    : '';
  const selectedTargetBoard = personalBoards.find(
    board => board.id === selectedTargetBoardId
  );
  const curatedPictograms = listCuratedPublicPictograms(editableBoardDtos);
  const publicCandidates = candidates.flatMap(candidate => {
    const original = editableCandidateByKey.get(
      preferenceKey(candidate.tile.id, candidate.boardId)
    );
    if (!original) return [];
    const sourceTile = createTileDTO(original.tile, {
      boardId: original.boardId
    });
    if (
      sourceTile.loadBoardId ||
      !sourceTile.image ||
      !normalizePublicPictogramAttribution(sourceTile.pictogramAttribution)
    ) {
      return [];
    }
    return [{ candidate, sourceTile }];
  });

  function selectCandidate(key) {
    const preference = preferenceByKey.get(key);
    const attribution = preference && preference.pictogramAttribution;
    setSelectedKey(key);
    setAttributionAuthor(
      attribution && attribution.author ? attribution.author : ''
    );
    setAttributionLicense(
      attribution && attribution.license
        ? attribution.license
        : DEFAULT_DEVICE_PRIVATE_PICTOGRAM_LICENSE
    );
  }

  async function handleImageChange(blob) {
    if (!selectedCandidate) return;

    try {
      const image = await readPersonalImageBlob(blob);
      const saved = onSave(
        buildPersonalImageSaveEntry(selectedCandidate, image, {
          author: attributionAuthor,
          license: attributionLicense
        })
      );
      setNotice(
        saved
          ? `已为“${candidateLabel(selectedCandidate)}”启用当前设备的熟悉图片。`
          : '图片已读取，但本地偏好保存失败，请稍后重试。'
      );
    } catch (error) {
      setNotice('图片读取失败，请重新选择。');
    }
  }

  function saveAttribution() {
    if (!selectedCandidate || !selectedPreference) return;

    const saved = onSave(
      buildPersonalImageSaveEntry(selectedCandidate, selectedPreference.image, {
        author: attributionAuthor,
        license: attributionLicense
      })
    );
    setNotice(
      saved
        ? `已保存“${candidateLabel(selectedCandidate)}”的本机图片说明。`
        : '图片说明保存失败，请稍后重试。'
    );
  }

  function restoreDefault(preference, candidate) {
    const removed = onRemove(preference.tileId, preference.boardId);
    setNotice(
      removed
        ? `“${candidateLabel(candidate)}”已恢复 CBoard 默认图片。`
        : '恢复默认图片失败，请稍后重试。'
    );
  }

  function createPersonalBoard() {
    const boardId = onCreatePersonalBoard(newBoardName);
    if (!boardId) {
      setNotice('个人板创建失败，请检查名称后重试。');
      return;
    }
    setTargetBoardId(boardId);
    setNotice(`已创建个人板“${newBoardName.trim()}”，现在可以收纳公开图卡。`);
  }

  function curatePublicPictogram(sourceTile) {
    if (!selectedTargetBoardId) {
      setNotice('请先创建或选择一个个人板。');
      return;
    }
    try {
      const result = createCuratedPublicPictogram(editableBoardDtos, {
        id: createCuratedId(),
        targetBoardId: selectedTargetBoardId,
        sourceTile
      });
      const nextBoard = result.boards.find(
        board => board.id === selectedTargetBoardId
      );
      const saved = onBoardSave(nextBoard);
      setNotice(
        saved
          ? `已把“${sourceTile.label}”的公开原图加入个人板。`
          : '图卡已准备，但个人板保存失败，请稍后重试。'
      );
    } catch (error) {
      setNotice(
        error && /already exists/.test(error.message)
          ? '该公开图卡已经在所选个人板中。'
          : '该图卡缺少可核验的公开来源，不能收纳到个人板。'
      );
    }
  }

  function removeCuratedPictogram(boardId, tileId, label) {
    try {
      const result = removeCuratedPublicPictogram(
        editableBoardDtos,
        boardId,
        tileId
      );
      const nextBoard =
        result && result.boards.find(board => board.id === boardId);
      const saved = nextBoard && onBoardSave(nextBoard);
      setNotice(
        saved ? `已从个人板移除“${label}”。` : '公开图卡移除失败，请稍后重试。'
      );
    } catch (error) {
      setNotice('只能从个人板移除由公开图库收纳的图卡。');
    }
  }

  return (
    <div className="PersonalImageManager">
      <div className="PersonalImageManager__privacy" role="status">
        {notice}
      </div>

      {configured.length > 0 && (
        <section className="PersonalImageManager__section">
          <h3>已启用（{configured.length}）</h3>
          <div className="PersonalImageManager__list">
            {configured.map(({ preference, candidate }) => (
              <article
                className="PersonalImageManager__card PersonalImageManager__card--active"
                key={`configured-${preferenceKey(
                  preference.tileId,
                  preference.boardId
                )}`}
              >
                <img alt={candidateLabel(candidate)} src={preference.image} />
                <div>
                  <strong>{candidateLabel(candidate)}</strong>
                  <small>{candidate.boardName} · 仅本机私图</small>
                </div>
                <div className="PersonalImageManager__actions">
                  <Button
                    color="primary"
                    size="small"
                    onClick={() =>
                      selectCandidate(
                        preferenceKey(preference.tileId, preference.boardId)
                      )
                    }
                  >
                    更换照片
                  </Button>
                  <Button
                    size="small"
                    onClick={() => restoreDefault(preference, candidate)}
                  >
                    恢复默认
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {selectedCandidate && (
        <section className="PersonalImageManager__upload">
          <img
            alt={candidateLabel(selectedCandidate)}
            src={
              selectedPreference
                ? selectedPreference.image
                : selectedCandidate.tile.image
            }
          />
          <div>
            <h3>为“{candidateLabel(selectedCandidate)}”选择熟悉照片</h3>
            <p>
              上传后只覆盖显示图片，标签、朗读、板块和 CBoard 原图都不会改变。
            </p>
            <div className="PersonalImageManager__metadata">
              <TextField
                fullWidth
                label="拍摄者或图片提供者（可选）"
                value={attributionAuthor}
                onChange={event => setAttributionAuthor(event.target.value)}
                variant="outlined"
              />
              <TextField
                fullWidth
                helperText="这是本机来源备注，不代表平台核验了公开授权。"
                label="使用说明"
                value={attributionLicense}
                onChange={event => setAttributionLicense(event.target.value)}
                variant="outlined"
              />
            </div>
            <InputImage
              onChange={handleImageChange}
              setIsLoadingImage={setIsLoadingImage}
            />
            {isLoadingImage && <small>正在压缩并读取图片…</small>}
            {selectedPreference && (
              <Button color="primary" onClick={saveAttribution} size="small">
                保存图片说明
              </Button>
            )}
          </div>
        </section>
      )}

      <section className="PersonalImageManager__section">
        <h3>跨分类找图</h3>
        <TextField
          fullWidth
          label="输入标签、同义词或板块，例如：汤匙、厕所"
          value={query}
          onChange={event => setQuery(event.target.value)}
          variant="outlined"
        />
        <p className="PersonalImageManager__hint">
          供家属维护图片库使用。当前显示前 {candidates.length}{' '}
          个结果，找到图卡后可更换熟悉照片、编辑说明或恢复默认图片。
        </p>
        <div className="PersonalImageManager__catalog">
          {candidates.length ? (
            candidates.map(candidate => {
              const key = preferenceKey(candidate.tile.id, candidate.boardId);
              const preference = preferenceByKey.get(key);

              return (
                <Button
                  className="PersonalImageManager__candidate"
                  key={key}
                  onClick={() => selectCandidate(key)}
                >
                  <img
                    alt=""
                    src={preference ? preference.image : candidate.tile.image}
                  />
                  <span>{candidateLabel(candidate)}</span>
                  <small>{candidate.boardName}</small>
                </Button>
              );
            })
          ) : (
            <p>没有找到对应 CBoard 图卡。</p>
          )}
        </div>
      </section>

      <section className="PersonalImageManager__section">
        <h3>公开图卡收纳</h3>
        <p className="PersonalImageManager__hint">
          只显示带公开来源说明的图卡。收纳时保存公开原图和来源，不复制图卡录音，也不会公开家庭照片。
        </p>
        {personalBoards.length ? (
          <TextField
            fullWidth
            label="收纳到个人板"
            onChange={event => setTargetBoardId(event.target.value)}
            SelectProps={{ native: true }}
            select
            value={selectedTargetBoardId}
            variant="outlined"
          >
            {personalBoards.map(board => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </TextField>
        ) : (
          <div className="PersonalImageManager__createBoard">
            <TextField
              fullWidth
              label="新个人板名称"
              onChange={event => setNewBoardName(event.target.value)}
              value={newBoardName}
              variant="outlined"
            />
            <Button
              color="primary"
              disabled={!newBoardName.trim()}
              onClick={createPersonalBoard}
              variant="contained"
            >
              创建个人板
            </Button>
          </div>
        )}

        <div className="PersonalImageManager__list">
          {publicCandidates.length ? (
            publicCandidates.map(({ candidate, sourceTile }) => (
              <article
                className="PersonalImageManager__card"
                key={`public-${preferenceKey(
                  sourceTile.id,
                  sourceTile.boardId
                )}`}
              >
                <img alt={sourceTile.label} src={sourceTile.image} />
                <div>
                  <strong>{candidateLabel(candidate)}</strong>
                  <small>
                    {candidate.boardName} ·{' '}
                    {sourceTile.pictogramAttribution.license}
                  </small>
                </div>
                <div className="PersonalImageManager__actions">
                  <Button
                    color="primary"
                    disabled={!selectedTargetBoardId}
                    onClick={() => curatePublicPictogram(sourceTile)}
                    size="small"
                  >
                    加入
                    {selectedTargetBoard
                      ? `“${selectedTargetBoard.name}”`
                      : '个人板'}
                  </Button>
                </div>
              </article>
            ))
          ) : (
            <p>当前搜索结果没有带完整公开来源说明的图卡。</p>
          )}
        </div>

        {curatedPictograms.length > 0 && (
          <div className="PersonalImageManager__curated">
            <h4>已收纳（{curatedPictograms.length}）</h4>
            <div className="PersonalImageManager__list">
              {curatedPictograms.map(item => (
                <article
                  className="PersonalImageManager__card PersonalImageManager__card--active"
                  key={`${item.boardId}:${item.tile.id}`}
                >
                  <img alt={item.tile.label} src={item.tile.image} />
                  <div>
                    <strong>{item.tile.label}</strong>
                    <small>{item.boardName} · 公开来源副本</small>
                  </div>
                  <div className="PersonalImageManager__actions">
                    <Button
                      onClick={() =>
                        removeCuratedPictogram(
                          item.boardId,
                          item.tile.id,
                          item.tile.label
                        )
                      }
                      size="small"
                    >
                      从个人板移除
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

PersonalImageManager.propTypes = {
  boards: PropTypes.arrayOf(PropTypes.object),
  editableBoards: PropTypes.arrayOf(PropTypes.object),
  preferences: PropTypes.arrayOf(PropTypes.object),
  onSave: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onBoardSave: PropTypes.func,
  onCreatePersonalBoard: PropTypes.func,
  createCuratedId: PropTypes.func
};

PersonalImageManager.defaultProps = {
  boards: [],
  editableBoards: [],
  preferences: [],
  onBoardSave: () => false,
  onCreatePersonalBoard: () => false,
  createCuratedId: createDefaultCuratedId
};
