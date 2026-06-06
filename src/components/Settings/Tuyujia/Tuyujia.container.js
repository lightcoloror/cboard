import React from 'react';
import { FormattedMessage } from 'react-intl';
import CommunicationSupportContainer from '../CommunicationSupport/CommunicationSupport.container';
import messages from './Tuyujia.messages';

export default function TuyujiaContainer(props) {
  return (
    <CommunicationSupportContainer
      {...props}
      titleOverride={<FormattedMessage {...messages.title} />}
      summaryOverride={<FormattedMessage {...messages.summary} />}
    />
  );
}
