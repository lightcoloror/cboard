import React, { useEffect, useRef, useState } from 'react';
import Button from '@material-ui/core/Button';
import InputImage from '../../UI/InputImage';
import API from '../../../api';
import { verifyBrowserLocalImage } from '../../../common/communicationSupport/browserImageVerification';
import { imageAvailabilityMessage } from '../../../common/communicationSupport/imageAvailability';
import { createImageRepairOperation, originalPublicImagePath } from '../../../common/communicationSupport/imageRepair';
import { currentImageOperationEpoch } from '../../../common/communicationSupport/imageOperationEpoch';
import { createDevicePrivatePictogramAttribution } from '../../../common/communicationSupport/pictogramAttribution';
import { readPersonalImageBlob } from './PersonalImageManager.component';

export default function ImageRepairControls({ tile, operationKey, onAdopt, onChoose, onKeepText }) {
  const key = JSON.stringify([operationKey, tile]);
  const active = useRef(key); active.current = key;
  const operation = useRef(null);
  if (!operation.current) operation.current = createImageRepairOperation();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState({ status: 'unverified' });
  const [candidate, setCandidate] = useState(null);
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const choiceVersion = useRef(0);
  const choice = choiceVersion.current;
  useEffect(() => {
    let alive = true; const epoch = currentImageOperationEpoch();
    choiceVersion.current += 1;
    setCandidate(null); setChoosing(false); setResult({ status: 'unverified' }); setNotice('');
    operation.current.cancel(); busyRef.current = false; setBusy(false);
    verifyBrowserLocalImage(tile.image).then(value => {
      if (alive && active.current === key && epoch === currentImageOperationEpoch()) setResult(value);
    });
    return () => { alive = false; choiceVersion.current += 1; operation.current.cancel(); };
  }, [key, retry]); // A new editing snapshot invalidates every late result.

  async function prepare(work, action) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setNotice('');
    try {
      const value = await operation.current.prepare(key + action, work);
      if (value && active.current === key) setCandidate({ tile: value, epoch: currentImageOperationEpoch() });
    } catch (_) { if (active.current === key) setNotice('图片读取、下载或核验失败，未修改原内容，请重试。'); }
    finally { if (active.current === key) { busyRef.current = false; setBusy(false); } }
  }
  async function adopt() {
    if (busyRef.current || !candidate) return;
    if (candidate.epoch !== currentImageOperationEpoch()) { setCandidate(null); return; }
    busyRef.current = true; setBusy(true);
    try {
      if (await onAdopt(candidate.tile) === false) throw new Error('not saved');
      if (active.current === key) { setCandidate(null); setNotice('当前图片修改已提交；其他记录保持不变。'); }
    } catch (_) { if (active.current === key) setNotice('图片已准备，但记录保存失败。请重试确认，无需重新下载。'); }
    finally { if (active.current === key) { busyRef.current = false; setBusy(false); } }
  }
  const path = originalPublicImagePath(tile);
  return <div className="CommunicationSupportPanel__imageRepair">
    <span role="status">{imageAvailabilityMessage(result)}</span>
    {result.status !== 'available' && <div>
      <Button size="small" disabled={busy} onClick={() => setRetry(value => value + 1)}>重新检查</Button>
      {path && <Button size="small" disabled={busy} onClick={() => prepare(async () => {
        const image = await readPersonalImageBlob(await API.downloadCommunicationPictogram({ image: path }));
        return { ...tile, image };
      }, 'public')}>重新下载原图</Button>}
      {!path && <span>{result.status === 'not-cached'
        ? '请在离线页面准备完成后重新检查；此状态不表示原图已删除。'
        : '原素材无法可靠定位，请手动选择图片或保留文字。'}</span>}
      {onChoose && <Button size="small" disabled={busy} onClick={onChoose}>从已有图卡重新选择</Button>}
      <Button size="small" disabled={busy} onClick={() => setChoosing(true)}>重新选择本机图片</Button>
      {choosing && !busy && <InputImage setIsLoadingImage={() => {}} onChange={blob => choice === choiceVersion.current && prepare(async () => ({
        ...tile, image: await readPersonalImageBlob(blob),
        pictogramAttribution: createDevicePrivatePictogramAttribution({ boardId: tile.boardId, tileId: tile.id, label: tile.label })
      }), 'private')} />}
      {choosing && <Button onClick={() => { choiceVersion.current += 1; operation.current.cancel(); setChoosing(false); setCandidate(null); }}>取消选择</Button>}
      {onKeepText && <Button size="small" disabled={busy} onClick={onKeepText}>保留文字</Button>}
    </div>}
    {candidate && <div role="group" aria-label="复核当前图片修复">
      <img width="96" height="96" src={candidate.tile.image} alt="待确认的修复图片" />
      <span>只修改当前内容，请核对图片后确认。</span>
      <Button disabled={busy} onClick={adopt}>确认采用修复图片</Button>
      <Button onClick={() => { operation.current.cancel(); setCandidate(null); setNotice('已取消，原图片不变。'); }}>取消修复</Button>
    </div>}
    {notice && <span role="status">{notice}</span>}
  </div>;
}
