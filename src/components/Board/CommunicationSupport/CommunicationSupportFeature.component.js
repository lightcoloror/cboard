import React from 'react';
import PropTypes from 'prop-types';
import CommunicationSupportPanel from './CommunicationSupportPanel.container';
import {
  COMMUNICATION_SUPPORT_VARIANTS,
  TUYUJIA_COMMUNICATION_SUPPORT_COPY
} from '../../../common/communicationSupport/legacy';

export default function CommunicationSupportFeature({ variant }) {
  if (variant === COMMUNICATION_SUPPORT_VARIANTS.tuyujia) {
    return (
      <CommunicationSupportPanel
        copyOverrides={TUYUJIA_COMMUNICATION_SUPPORT_COPY}
        initialMode="receive"
      />
    );
  }

  return <CommunicationSupportPanel />;
}

CommunicationSupportFeature.propTypes = {
  variant: PropTypes.oneOf(Object.values(COMMUNICATION_SUPPORT_VARIANTS))
};

CommunicationSupportFeature.defaultProps = {
  variant: COMMUNICATION_SUPPORT_VARIANTS.default
};
