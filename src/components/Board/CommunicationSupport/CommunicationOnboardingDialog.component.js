import React from 'react';
import PropTypes from 'prop-types';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import { COMMUNICATION_ONBOARDING_CONTENT } from '../../../common/communicationSupport/communicationOnboarding';

export default function CommunicationOnboardingDialog({ open, onComplete }) {
  const content = COMMUNICATION_ONBOARDING_CONTENT;

  return (
    <Dialog
      fullScreen
      open={open}
      aria-labelledby="communication-onboarding-title"
    >
      <DialogTitle id="communication-onboarding-title">
        {content.eyebrow}
      </DialogTitle>
      <DialogContent className="CommunicationSupportPanel__onboardingScreen">
        <div className="CommunicationSupportPanel__onboardingCard">
          <p className="CommunicationSupportPanel__onboardingKicker">
            第一次只需了解三件事
          </p>
          <h2>{content.title}</h2>
          <div className="CommunicationSupportPanel__onboardingSteps">
            {content.steps.map((step, index) => (
              <section
                className="CommunicationSupportPanel__onboardingStep"
                key={step.id}
              >
                <span aria-hidden="true">0{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </section>
            ))}
          </div>
          <p className="CommunicationSupportPanel__onboardingPrivacy">
            核心沟通不依赖网络。语音、AI
            和在线补图不可用时，仍可继续点图、分词、人工修正和展示。
          </p>
        </div>
      </DialogContent>
      <DialogActions className="CommunicationSupportPanel__onboardingActions">
        <Button color="primary" variant="contained" onClick={onComplete}>
          开始使用
        </Button>
      </DialogActions>
    </Dialog>
  );
}

CommunicationOnboardingDialog.propTypes = {
  open: PropTypes.bool,
  onComplete: PropTypes.func.isRequired
};

CommunicationOnboardingDialog.defaultProps = {
  open: false
};
