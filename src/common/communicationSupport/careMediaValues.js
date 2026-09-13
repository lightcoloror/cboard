export async function encodeCareMedia(value, engine, readImage, depth = 0) {
  if (depth > 24) throw new Error('内容层级过深');
  if (Array.isArray(value))
    return Promise.all(
      value.map(v => encodeCareMedia(v, engine, readImage, depth + 1))
    );
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'image' && typeof item === 'string' && item) {
      const asset = await readImage(item);
      const existing = Object.values(engine.view().media).find(
        m => m.sha256 === asset.sha256
      );
      const mediaId = existing
        ? existing.mediaId
        : engine.newMediaId
        ? await engine.newMediaId()
        : `image-${asset.sha256}`;
      if (!engine.view().media[mediaId])
        await engine.addMedia({ ...asset, mediaId, visibility: 'private' });
      result.mediaId = mediaId;
    } else if (!['__proto__', 'constructor', 'prototype'].includes(key))
      result[key] = await encodeCareMedia(item, engine, readImage, depth + 1);
  }
  return result;
}
export function decodeCareMedia(value, media, image, depth = 0) {
  if (depth > 24) throw new Error('内容层级过深');
  if (Array.isArray(value))
    return value.map(v => decodeCareMedia(v, media, image, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (!['__proto__', 'constructor', 'prototype'].includes(key))
      result[key] = decodeCareMedia(item, media, image, depth + 1);
  }
  if (value.mediaId && media[value.mediaId])
    result.image = image(media[value.mediaId]);
  return result;
}
export function careMediaIds(value) {
  const ids = new Set();
  const visit = (item, depth) => {
    if (!item || typeof item !== 'object' || depth > 24) return;
    if (typeof item.mediaId === 'string') ids.add(item.mediaId);
    Object.values(item).forEach(v => visit(v, depth + 1));
  };
  visit(value, 0);
  return [...ids];
}
