import React, { useEffect, useRef, useState } from 'react';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import { SAVED_PHRASE_STARTERS } from '../../../common/communicationSupport/savedPhrasePreparation';
import { DEFAULT_LIFE_CONTEXTS } from '../../../common/communicationSupport/savedPhraseManagement';
import { createLocalSavedPhrasePreparation } from '../../../common/communicationSupport/localData';
import ReceiverLoopPanel from './ReceiverLoopPanel.component';
import CommunicationReceiverDialog from './CommunicationReceiverDialog.component';

export default function SavedPhrasePreparation({ onClose, onSaved, onInvalidate, initialRequest, ...receiverProps }) {
  const [service] = useState(createLocalSavedPhrasePreparation);
  const [initial] = useState(() => { try { return { draft: service.load(), error: '' }; } catch (error) { return { draft: null, error: `准备草稿读取失败，原数据已保留：${error.message}` }; } });
  const [draft, setDraft] = useState(initial.draft);
  const [loadError, setLoadError] = useState(initial.error);
  const [contextError, setContextError] = useState('');
  const [continuing, setContinuing] = useState(false);
  const [notice, setNotice] = useState('参考表达只是起点，请改成自己的说法并复核；不会自动加入收藏。');
  const [duplicate, setDuplicate] = useState(null);
  const [conflict, setConflict] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialRequest && !draft && !loadError) {
      try { setDraft(service.startFromSavedPhrase(initialRequest.id, initialRequest.mode)); setContinuing(true); }
      catch (error) { setNotice(error.message); }
    }
  }, [initialRequest, service, draft, loadError]);
  const editing = draft && draft.preparationMode === 'edit';
  const saveLabel = editing ? '确认更新这条常用语' : draft && draft.preparationMode === 'copy' ? '确认另存为新常用语' : '确认存为常用语';
  const saving = useRef(false);
  const completed = useRef(false);
  const change = (entry, context) => {
    setDraft(current => ({ ...current, ...entry,
      lifeContext: context === undefined ? current.lifeContext : context }));
    const next = service.update(draft.id, entry, context === undefined ? draft.lifeContext : context);
    setDraft(next);
    setContextError('');
    return next;
  };
  const discard = () => {
    try {
      if (draft) service.discard(draft.id);
      onInvalidate();
      setDraft(null); setContinuing(false); setDuplicate(null); setConflict(false);
      setNotice('已丢弃准备草稿；已有收藏、沟通记录和图库图片保持不变。');
    } catch (error) { setNotice(error.message); }
  };
  const commit = entry => {
    if (saving.current || completed.current) return false;
    saving.current = true;
    try {
      const result = service.commit(draft.id, entry);
      if (!result.ok) { setDuplicate(result.duplicate); setConflict(Boolean(result.conflict)); setNotice(result.message); return false; }
      completed.current = true;
      onInvalidate();
      onSaved(result.item, result.cleanupPending);
      return true;
    } catch (error) { setNotice(`保存失败：${error.message}`); return false; }
    finally { saving.current = false; }
  };
  const later = () => {
    // Every edit is persisted, but check the current scope before closing.
    try { if (draft) service.update(draft.id, draft, draft.lifeContext); onInvalidate(); onClose(); }
    catch (error) { setNotice(`草稿保存失败：${error.message}`); }
  };
  return <CommunicationReceiverDialog open onClose={later} title="准备常用表达"
    subtitle="选择一句参考表达，修改并复核后再收藏。" closeLabel="稍后继续">
    <p role="status">{notice}</p>
    {loadError && <div role="alert">{loadError}<Button onClick={() => { try { setDraft(service.load()); setLoadError(''); } catch (error) { setLoadError(error.message); } }}>重试读取草稿</Button></div>}
    {draft && draft.sourceSnapshot && <p>原收藏：{draft.sourceSnapshot.sentence}。{editing ? '复核后仅更新这条收藏，过去的沟通记录不变。' : '另存新句，原收藏不变。'} 原图没有可靠文字位置；修改文字后请重新匹配或人工复核。</p>}
    {conflict && <Button onClick={() => { try { setDraft(service.convertToCopy(draft.id)); setConflict(false); setNotice('已改为另存新句，原收藏不变。'); } catch (error) { setNotice(error.message); } }}>改为另存新句</Button>}
    {duplicate && <Button onClick={() => { onInvalidate(); onSaved(duplicate); }}>查看已有收藏</Button>}
    {loadError ? null : draft && !continuing ? <div>
      <p>已有准备草稿：{draft.inputText || '（尚未填写文字）'}</p>
      <Button variant="contained" color="primary" onClick={() => setContinuing(true)}>继续准备</Button>
      <Button onClick={discard}>丢弃后重新选择</Button>
    </div> : !draft ? <div aria-label="参考表达目录">
      {DEFAULT_LIFE_CONTEXTS.map(context => <section key={context}><h3>{context}</h3>
        {SAVED_PHRASE_STARTERS.filter(item => item.lifeContext === context).map(item =>
          <Button key={item.id} variant="outlined" onClick={() => {
            try { setDraft(service.start(item.id)); setContinuing(true); setDuplicate(null); }
            catch (error) { setNotice(error.message); }
          }}>{item.text}</Button>)}
      </section>)}
    </div> : <div>
      <TextField id="prepared-phrase-life-context" label="生活情境" value={draft.lifeContext} variant="outlined" onChange={event => {
        try { change(draft, event.target.value); } catch (error) { setContextError(`当前生活情境尚未保存：${error.message}`); }
      }} />
      {contextError && <p role="alert">{contextError}<Button onClick={() => { try { change(draft, draft.lifeContext); } catch (error) { setContextError(`当前生活情境尚未保存：${error.message}`); } }}>重试保存情境</Button></p>}
      <ReceiverLoopPanel {...receiverProps} key={draft.id} preparationMode externalSaveError={contextError}
        initialRecord={draft} receiverRecords={[]} historyItems={[]} aiAvailable={false}
        aiImageGenerationAvailable={false} dialectNormalizationAvailable={false}
        dialectAudioRecognitionAvailable={false} imageOcrAvailable={false}
        onApplyOutput={() => {}} onCreateDraft={change} onUpdateDraft={(_, entry) => change(entry)}
        onConfirmPreparedPhrase={commit} onRecordCorrection={undefined}
        copyOverrides={{ generateSequence: '匹配图片', fullscreen: saveLabel,
          receiveSectionTitle: '修改和复核', receiveHint: '先改成自己的说法，再匹配图片。',
          receiverDraftRestored: '准备草稿已恢复，请复核文字和图片。图片不可用时请重新选择或保留文字。' }} />
      <Button onClick={later}>稍后继续</Button>
      <Button onClick={discard}>取消准备</Button>
      <Button onClick={discard}>丢弃后重新选择</Button>
    </div>}
  </CommunicationReceiverDialog>;
}
