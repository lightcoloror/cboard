import React, { useState } from 'react';
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
  onClose,
  onFeedback,
  onReplay,
  onShare
}) {
  const [isSharing, setIsSharing] = useState(false);
  const [shareNotice, setShareNotice] = useState('');
  const attributedItems = items
    .map((item, index) => ({
      key: `${item.id || item.label}-${index}`,
      label: item.label,
      details: formatPictogramAttribution(item.attribution)
    }))
    .filter(item => item.details);

  async function handleShare() {
    if (typeof onShare !== 'function' || isSharing) return;
    setIsSharing(true);
    setShareNotice('正在生成可分享图片…');
    try {
      const result = await onShare(items, { speechText });
      setShareNotice(
        (result && result.message) || '图片分享失败，当前沟通内容仍会保留。'
      );
    } catch (error) {
      setShareNotice('图片分享失败，当前沟通内容仍会保留。');
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <FullScreenDialog open={open} onClose={onClose} title={title} fullWidth>
      <FullScreenDialogContent className="CommunicationSupportPanel__displayScreen">
        <div
          className="CommunicationSupportPanel__displayOverlay"
          role="list"
          aria-label={sequenceLabel}
          tabIndex={0}
        >
          {items.map((item, index) => (
            <div
              className="CommunicationSupportPanel__displayItem"
              role="listitem"
              key={(item.id || item.label) + '-' + index}
            >
              <Symbol
                className="CommunicationSupportPanel__symbol CommunicationSupportPanel__symbol--display"
                image={item.image}
                mediaType={item.mediaType}
                video={item.video}
                videoAutoPlay={item.mediaType === 'video'}
                keyPath={item.keyPath}
                label={item.label}
                labelpos="Below"
              />
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
              label={isSharing ? '生成中' : '分享'}
              ariaLabel={isSharing ? '正在生成可分享图片' : shareLabel}
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
              onClick={() => onFeedback(RECEIVER_PATIENT_FEEDBACK.understood)}
              label={understoodLabel}
              ariaLabel={understoodLabel}
            />
            <PatientActionButton
              action={PATIENT_ACTION_IDS.notUnderstood}
              className="CommunicationSupportPanel__feedbackButton CommunicationSupportPanel__feedbackButton--notUnderstood"
              onClick={() =>
                onFeedback(RECEIVER_PATIENT_FEEDBACK.notUnderstood)
              }
              label={notUnderstoodLabel}
              ariaLabel={notUnderstoodLabel}
            />
            <PatientActionButton
              action={PATIENT_ACTION_IDS.repeat}
              className="CommunicationSupportPanel__feedbackButton CommunicationSupportPanel__feedbackButton--repeat"
              onClick={() => {
                onFeedback(RECEIVER_PATIENT_FEEDBACK.repeatRequested);
                onReplay();
              }}
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
