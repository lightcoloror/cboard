// Availability is device-local, transient evidence, never a semantic review.
export function classifyImageReference(value, userDataPath = '') {
  const source = String(value || '').trim();
  if (!source) return 'missing';
  if (/^blob:|^(?:wxfile:\/\/|https?:\/\/)(?:tmp|temp)(?:\/|_)/i.test(source)) return 'temporary';
  if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(source)) return 'embedded';
  if (/(?:^|\/)\.\.(?:\/|$)/.test(source)) return 'unverified';
  if (userDataPath && source.startsWith(userDataPath.replace(/\/$/, '') + '/')) return 'local-file';
  if (/^(?:wxfile:\/\/(?:usr|store)\/|wxfile:\/\/store_[A-Za-z0-9_.-]+$|https?:\/\/(?:usr|store)\/)/i.test(source)) return 'local-file';
  if (/^\/(?!\/)|^(?:assets|symbols|static)\//.test(source)) return 'packaged';
  if (/^https?:\/\//i.test(source) || source.startsWith('//')) return 'remote-only';
  return 'unverified';
}

export const IMAGE_AVAILABILITY_LABELS = {
  available: '图片已核验可离线使用',
  unverified: '图片尚未核验',
  'not-cached': '尚未核验到离线缓存；图片可能仍可在线显示',
  'remote-only': '仅有在线图片，尚未确认离线可用',
  temporary: '临时图片尚未可靠保存',
  missing: '本机图片缺失，请重新选择或保留文字',
  corrupt: '本机图片无法解码，请重新选择或保留文字',
  'check-failed': '图片检查失败，可重新检查；未删除原内容'
};

export function imageAvailabilityMessage(result) {
  return IMAGE_AVAILABILITY_LABELS[result && result.status] || IMAGE_AVAILABILITY_LABELS.unverified;
}

export function requireAvailableImage(result) {
  if (!result || result.status !== 'available') {
    throw new Error(imageAvailabilityMessage(result));
  }
  return result;
}
