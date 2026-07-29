import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { browserNetworkStatusPort } from '../../../common/communicationSupport/browserNetworkStatus';
import { getCommunicationNetworkStatusCopy } from '../../../common/communicationSupport/networkStatus';

export default function CommunicationNetworkStatusNotice({ port }) {
  const [status, setStatus] = useState(() => port.getCurrent());

  useEffect(() => port.subscribe(setStatus), [port]);

  const copy = getCommunicationNetworkStatusCopy(status);
  if (!copy) return null;

  return (
    <div className="CommunicationSupportPanel__networkStatus" role="status">
      <strong className="CommunicationSupportPanel__networkStatusTitle">
        {copy.title}
      </strong>
      <span className="CommunicationSupportPanel__networkStatusDetail">
        {copy.detail}
      </span>
    </div>
  );
}

CommunicationNetworkStatusNotice.propTypes = {
  port: PropTypes.shape({
    getCurrent: PropTypes.func.isRequired,
    subscribe: PropTypes.func.isRequired
  })
};

CommunicationNetworkStatusNotice.defaultProps = {
  port: browserNetworkStatusPort
};
