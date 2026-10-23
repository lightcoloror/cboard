/* global globalThis */
import React, { useEffect, useState } from 'react';
import { classifyImageReference } from '../../../common/communicationSupport/imageAvailability';
import { currentImageOperationEpoch } from '../../../common/communicationSupport/imageOperationEpoch';

// Render persisted snapshots from local bytes only. A remote URL in an old
// snapshot is not permission to download it again on restore.
export default function LocalSnapshotImage({ src, alt = '', ...props }) {
  const [local, setLocal] = useState(null);
  useEffect(() => {
    let alive = true, objectUrl;
    const epoch = currentImageOperationEpoch();
    const kind = classifyImageReference(src);
    setLocal(null);
    if (kind === 'embedded') setLocal({ original: src, source: src });
    else if ((kind === 'packaged' || kind === 'remote-only') && globalThis.caches) {
      globalThis.caches.match(src).then(response => response && response.blob()).then(blob => {
        if (!alive || epoch !== currentImageOperationEpoch() || !blob || !blob.size) return;
        objectUrl = URL.createObjectURL(blob);
        setLocal({ original: src, source: objectUrl });
      }).catch(() => {});
    }
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src]);
  return local && local.original === src
    ? <img {...props} src={local.source} alt={alt} onError={() => setLocal(null)} />
    : <span role="status">{alt} · 本机图片暂不可用，请重新检查或选择图片</span>;
}
