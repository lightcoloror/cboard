import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import PatientActionButton from './PatientActionButton.component';
import { PATIENT_ACTION_IDS } from '../../../common/communicationSupport/patientActionLanguage';

export default function GalleryTileUndoControl({ service }) {
  const [state, setState] = useState({ count: 0 });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const version = useRef(0);
  useEffect(() => {
    version.current += 1;
    setNotice(''); setBusy(false); pending.current = false;
    if (!service) { setState({ count: 0 }); return undefined; }
    setState(service.state());
    const unsubscribe = service.subscribe(next => {
      setState(next);
      // Scope/privacy clear invalidates pending UI receipts as well.
      if (!next.count) { setNotice(''); version.current += 1; setBusy(false); pending.current = false; }
    });
    return () => { unsubscribe(); version.current += 1; };
  }, [service]);
  async function undo() {
    if (!service || pending.current || !state.operationId) return;
    const operationId = state.operationId;
    const attempt = version.current;
    pending.current = true; setBusy(true); setNotice('');
    try {
      await service.undo(operationId, { guard: () => attempt === version.current });
      // Service success may remove the last entry and invalidate this receipt.
      if (attempt === version.current) setNotice('图卡已恢复并核对本机保存。');
    } catch (error) {
      if (attempt === version.current) setNotice(error.message || '恢复未确认，请重试。');
    } finally {
      if (attempt === version.current) { pending.current = false; setBusy(false); }
    }
  }
  if (!state.count && !notice) return null;
  return <section className="PersonalImageManager__privacy" aria-label="图库删除撤销">
    {state.count > 0 && <>
      <p>最近删除：{state.label}。本次使用可撤销 {state.count} 次。</p>
      <PatientActionButton action={PATIENT_ACTION_IDS.undo} label="撤销删除图卡"
        ariaLabel="撤销删除图卡"
        disabled={busy} onClick={undo} />
      <p>仅保留最近 20 次单张图卡删除；刷新、退出或切换档案后清空。图片文件和其他记录保持不变。</p>
    </>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
GalleryTileUndoControl.propTypes = { service: PropTypes.object };
