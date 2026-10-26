import React, { useEffect, useState } from 'react';
import { verifyBrowserLocalImage } from '../../../common/communicationSupport/browserImageVerification';
import { imageAvailabilityMessage } from '../../../common/communicationSupport/imageAvailability';
import { currentImageOperationEpoch } from '../../../common/communicationSupport/imageOperationEpoch';
export default function ImageAvailabilityLabel({ source }) {
  const [result, setResult] = useState({ status: 'unverified' });
  useEffect(() => {
    let alive = true; const epoch = currentImageOperationEpoch();
    setResult({ status: 'unverified' });
    verifyBrowserLocalImage(source).then(value => {
      if (alive && epoch === currentImageOperationEpoch()) setResult(value);
    });
    return () => { alive = false; };
  }, [source]);
  return <span role="status">{imageAvailabilityMessage(result)}</span>;
}
