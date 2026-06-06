import React from 'react';
import { FormattedMessage } from 'react-intl';
import CommunicationSupportSettings from '../CommunicationSupport/CommunicationSupport.component';
import messages from './Tuyujia.messages';

export default function TuyujiaSettings({ ...props }) {
  return (
    <CommunicationSupportSettings
      {...props}
      titleOverride={<FormattedMessage {...messages.title} />}
      summaryOverride={<FormattedMessage {...messages.summary} />}
    />
  );
}
