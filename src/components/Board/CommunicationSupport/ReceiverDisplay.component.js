import React, { useCallback, useEffect, useRef, useState } from 'react';
import { buildReceiverReading } from '../../../common/communicationSupport/receiverReading';
import { buildReceiverMeaningAssessment, isReceiverPunctuation } from '../../../common/communicationSupport/receiverContract';
import PropTypes from 'prop-types';
import FullScreenDialog, {
  FullScreenDialogContent
} from '../../UI/FullScreenDialog';
import Symbol from '../Symbol';
import { RECEIVER_PATIENT_FEEDBACK } from '../../../common/communicationSupport/receiverPatientFeedback';
import { formatPictogramAttribution } from '../../../common/communicationSupport/pictogramAttribution';
import { PATIENT_ACTION_IDS } from '../../../common/communicationSupport/patientActionLanguage';
import PatientActionButton from './PatientActionButton.component';

export default function ReceiverDisplay({
  open,
  title,
  items,
  feedbackQuestion,
  understoodLabel,
  notUnderstoodLabel,
  repeatRequestedLabel,
  sequenceLabel,
  attributionLabel,
  shareLabel,
  speechText,
  sequence = [],
  startSegmented = false,
  onStop,
  onClose,
  onFeedback,
  onReplay,
  onShare
}) {
  const reading = buildReceiverReading(speechText, sequence, items);
  const meaning = buildReceiverMeaningAssessment(speechText, items.map(item => ({ token: item.label, tile: item.textOnly ? { textOnly: true } : { tile: item } })));
  const [segmentIndex, setSegmentIndex] = useState(null);
  const segment = segmentIndex === null ? null : reading.segments[segmentIndex];
  const visibleItems = segment ? segment.itemIndices.map(index => items[index]) : items;
  const [isSharing, setIsSharing] = useState(false);
  const [shareNotice, setShareNotice] = useState('');
  const shareGenerationRef = useRef(0);
  const sharePendingRef = useRef(false);
  const closedRef = useRef(!open);
  const displayRef = useRef(null);
  displayRef.current = { open, items, speechText };
  const invalidateShare = useCallback(() => {
    shareGenerationRef.current += 1;
    sharePendingRef.current = false;
  }, []);

  useEffect(
    () => {
      closedRef.current = !open;
      invalidateShare();
      setSegmentIndex(startSegmented && reading.canSegment ? 0 : null);
      setIsSharing(false);
      setShareNotice('');
      return () => {
        closedRef.current = true;
        if (open && onStop) onStop();
        invalidateShare();
      };
    },
    // Reading mode is reset on each payload/open, not on parent callback rerenders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, items, speechText, startSegmented, invalidateShare]
  );
  const attributedItems = items
    .map((item, index) => ({
      key: `${item.id || item.label}-${index}`,
      label: item.label,
      details: formatPictogramAttribution(item.attribution)
    }))
    .filter(item => item.details);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) {
        if (onStop) onStop();
        invalidateShare();
        setIsSharing(false);
      }
    };
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => document.removeEventListener('visibilitychange', stopWhenHidden);
  }, [onStop, invalidateShare]);

  function changeReading(index) {
    if (onStop) onStop();
    invalidateShare();
    setIsSharing(false);
    setShareNotice('');
    setSegmentIndex(index);
  }

  async function handleShare() {
    if (
      typeof onShare !== 'function' ||
      !open ||
      closedRef.current ||
      sharePendingRef.current
    )
      return;
    const generation = ++shareGenerationRef.current;
    const isCurrent = () =>
      !closedRef.current &&
      generation === shareGenerationRef.current &&
      displayRef.current.open &&
      displayRef.current.items === items &&
      displayRef.current.speechText === speechText;
    sharePendingRef.current = true;
    setIsSharing(true);
    setShareNotice('正在生成可分享图片…');
    try {
      const result = await onShare(items, { speechText, isCurrent });
      if (!isCurrent()) return;
      setShareNotice(
        (result && result.message) || '图片分享失败，当前沟通内容仍会保留。'
      );
    } catch (error) {
      if (isCurrent()) setShareNotice('图片分享失败，当前沟通内容仍会保留。');
    } finally {
      if (isCurrent()) {
        sharePendingRef.current = false;
        setIsSharing(false);
      }
    }
  }

  function handleClose() {
    if (closedRef.current) return;
    closedRef.current = true;
    invalidateShare();
    if (onStop) onStop();
    onClose();
  }

  function handleFeedback(feedback) {
    if (closedRef.current) return;
    if (feedback !== RECEIVER_PATIENT_FEEDBACK.repeatRequested) {
      closedRef.current = true;
      invalidateShare();
      if (onStop) onStop();
    }
    onFeedback(feedback);
    if (feedback === RECEIVER_PATIENT_FEEDBACK.repeatRequested) {
      if (segment) onReplay(segment.text);
      else onReplay();
    }
  }

  return (
    <FullScreenDialog open={open} onClose={handleClose} title={title} fullWidth>
      <FullScreenDialogContent className="CommunicationSupportPanel__displayScreen">
        <section className="CommunicationSupportPanel__reading" aria-label="原句与分段阅读">
          <p className="CommunicationSupportPanel__originalText">{speechText}</p>
          {meaning.requiresAssistance && <p role="status">请伙伴辅助解释：{meaning.unresolvedMeaningItems.map(item => item.token).join('、')}。文字是原话参照，不表示已经理解。</p>}
          <PatientActionButton action={PATIENT_ACTION_IDS.fullscreen}
            label={segment ? '看整句' : '一段一段看'}
            ariaLabel={segment ? '返回完整原句和图片' : '按原文分段阅读'}
            disabled={!segment && !reading.canSegment}
            onClick={() => changeReading(segment ? null : 0)} />
          {!reading.canSegment && <p role="status">{reading.reason}</p>}
          {segment && <div className="CommunicationSupportPanel__actions">
            <p aria-live="polite">第 {segmentIndex + 1} / {reading.segments.length} 段：{segment.text}</p>
            <PatientActionButton action={PATIENT_ACTION_IDS.moveLeft} label="上一段" ariaLabel="上一段"
              disabled={segmentIndex === 0} onClick={() => changeReading(segmentIndex - 1)} />
            <PatientActionButton action={PATIENT_ACTION_IDS.moveRight} label="下一段" ariaLabel="下一段"
              disabled={segmentIndex === reading.segments.length - 1} onClick={() => changeReading(segmentIndex + 1)} />
          </div>}
        </section>
        <div
          className="CommunicationSupportPanel__displayOverlay"
          role="list"
          aria-label={sequenceLabel}
          tabIndex={0}
        >
          {visibleItems.map((item, index) => (
            <div
              className="CommunicationSupportPanel__displayItem"
              role="listitem"
              key={(item.id || item.label) + '-' + index}
            >
              {item.textOnly ? <div className="CommunicationSupportPanel__textReference"><strong>{item.label}</strong>{!isReceiverPunctuation(item.label) && <p>尚未图示，请伙伴解释</p>}</div> : <Symbol localOnly
                className="CommunicationSupportPanel__symbol CommunicationSupportPanel__symbol--display"
                image={item.image}
                mediaType={item.mediaType}
                video={item.video}
                videoAutoPlay={item.mediaType === 'video'}
                keyPath={item.keyPath}
                label={item.label}
                labelpos="Below"
              />}
            </div>
          ))}
        </div>
        {attributedItems.length > 0 && (
          <section
            className="CommunicationSupportPanel__displayAttribution"
            aria-label={attributionLabel}
          >
            <strong>{attributionLabel}</strong>
            <ul>
              {attributedItems.map(item => (
                <li key={item.key}>
                  {item.label}：{item.details}
                </li>
              ))}
            </ul>
          </section>
        )}
        {onShare && (
          <section className="CommunicationSupportPanel__displayShare">
            <PatientActionButton
              action={PATIENT_ACTION_IDS.share}
              color="primary"
              variant="contained"
              onClick={handleShare}
              disabled={isSharing || !items.length}
              label={isSharing ? '生成中' : '分享整句'}
              ariaLabel={isSharing ? '正在生成可分享图片' : '分享整句'}
            />
            {shareNotice && <p role="status">{shareNotice}</p>}
          </section>
        )}
        <section
          className="CommunicationSupportPanel__displayFeedback"
          aria-label={feedbackQuestion}
        >
          <p className="CommunicationSupportPanel__displayFeedbackQuestion">
            {feedbackQuestion}
          </p>
          <div className="CommunicationSupportPanel__displayFeedbackActions">
            <PatientActionButton
              action={PATIENT_ACTION_IDS.understood}
              className="CommunicationSupportPanel__feedbackButton CommunicationSupportPanel__feedbackButton--understood"
              onClick={() =>
                handleFeedback(RECEIVER_PATIENT_FEEDBACK.understood)
              }
              label={understoodLabel}
              ariaLabel={understoodLabel}
            />
            <PatientActionButton
              action={PATIENT_ACTION_IDS.notUnderstood}
              className="CommunicationSupportPanel__feedbackButton CommunicationSupportPanel__feedbackButton--notUnderstood"
              onClick={() =>
                handleFeedback(RECEIVER_PATIENT_FEEDBACK.notUnderstood)
              }
              label={notUnderstoodLabel}
              ariaLabel={notUnderstoodLabel}
            />
            <PatientActionButton
              action={PATIENT_ACTION_IDS.repeat}
              className="CommunicationSupportPanel__feedbackButton CommunicationSupportPanel__feedbackButton--repeat"
              onClick={() =>
                handleFeedback(RECEIVER_PATIENT_FEEDBACK.repeatRequested)
              }
              label={repeatRequestedLabel}
              ariaLabel={repeatRequestedLabel}
            />
          </div>
        </section>
      </FullScreenDialogContent>
    </FullScreenDialog>
  );
}

ReceiverDisplay.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.node.isRequired,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      image: PropTypes.string,
      keyPath: PropTypes.string,
      label: PropTypes.string.isRequired
    })
  ).isRequired,
  feedbackQuestion: PropTypes.string.isRequired,
  understoodLabel: PropTypes.string.isRequired,
  notUnderstoodLabel: PropTypes.string.isRequired,
  repeatRequestedLabel: PropTypes.string.isRequired,
  sequenceLabel: PropTypes.string,
  attributionLabel: PropTypes.string,
  shareLabel: PropTypes.string,
  speechText: PropTypes.string,
  sequence: PropTypes.array,
  startSegmented: PropTypes.bool,
  onStop: PropTypes.func,
  onClose: PropTypes.func.isRequired,
  onFeedback: PropTypes.func.isRequired,
  onReplay: PropTypes.func.isRequired,
  onShare: PropTypes.func
};

ReceiverDisplay.defaultProps = {
  sequenceLabel: '按顺序排列的图片序列',
  attributionLabel: '图片来源与许可',
  shareLabel: '分享图片序列',
  speechText: '',
  onShare: null
};
