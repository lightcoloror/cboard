import React from 'react';
import PropTypes from 'prop-types';
import CommunicationSupportPanel from './CommunicationSupportPanel.container';
import {
  COMMUNICATION_SUPPORT_VARIANTS,
  TUYUJIA_COMMUNICATION_SUPPORT_COPY
} from '../../../common/communicationSupport/legacy';

export default function CommunicationSupportFeature({
  variant,
  demoMode,
  pictogramOrdering,
  onPictogramUsed
}) {
  if (variant === COMMUNICATION_SUPPORT_VARIANTS.tuyujia) {
    return (
      <CommunicationSupportPanel
        demoMode={demoMode}
        copyOverrides={TUYUJIA_COMMUNICATION_SUPPORT_COPY}
        initialMode="receive"
        pictogramOrdering={pictogramOrdering}
        onPictogramUsed={onPictogramUsed}
      />
    );
  }

  return (
    <CommunicationSupportPanel
      demoMode={demoMode}
      pictogramOrdering={pictogramOrdering}
      onPictogramUsed={onPictogramUsed}
    />
  );
}

CommunicationSupportFeature.propTypes = {
  variant: PropTypes.oneOf(Object.values(COMMUNICATION_SUPPORT_VARIANTS)),
  demoMode: PropTypes.bool,
  pictogramOrdering: PropTypes.object,
  onPictogramUsed: PropTypes.func
};

CommunicationSupportFeature.defaultProps = {
  variant: COMMUNICATION_SUPPORT_VARIANTS.default,
  demoMode: false,
  pictogramOrdering: {},
  onPictogramUsed: () => {}
};
