/* global globalThis */
import { classifyImageReference } from './imageAvailability';
import { isPrivatePerson } from './personalPeople';

export function decodeBrowserImage(source, ImageClass = globalThis.Image) {
  return new Promise((resolve, reject) => {
    if (typeof ImageClass !== 'function') return reject(new Error('Image decoder unavailable'));
    const image = new ImageClass();
    const timer = setTimeout(() => finish(new Error('Image check timed out')), 5000);
    function finish(error) {
      clearTimeout(timer); image.onload = null; image.onerror = null;
      if (error) reject(error);
      else if (image.naturalWidth > 0 && image.naturalHeight > 0)
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      else reject(new Error('Invalid image dimensions'));
    }
    image.onload = () => finish();
    image.onerror = () => finish(new Error('Image decode failed'));
    image.src = source;
  });
}

export async function verifyBrowserLocalImage(source, { decode = decodeBrowserImage, cacheStorage = globalThis.caches } = {}) {
  const kind = classifyImageReference(source);
  if (kind === 'embedded') {
    try { return { status: 'available', ...(await decode(source)) }; }
    catch (error) { return { status: /decode|dimensions/i.test(String(error)) ? 'corrupt' : 'check-failed' }; }
  }
  // Cache API is a local read. Never use fetch to discover availability.
  if ((kind === 'packaged' || kind === 'remote-only') && cacheStorage) {
    let url;
    try {
      const response = await cacheStorage.match(source);
      // A cold browser may display the resource from HTTP cache while the
      // Service Worker cache is still preparing. Absence here proves neither
      // a deleted file nor offline availability; never fetch during a check.
      if (!response) return { status: kind === 'remote-only' ? 'remote-only' : 'not-cached' };
      const blob = await response.blob();
      if (!blob.size) return { status: 'corrupt' };
      url = URL.createObjectURL(blob);
      return { status: 'available', ...(await decode(url)) };
    } catch (error) { return { status: /decode|dimensions/i.test(String(error)) ? 'corrupt' : 'check-failed' }; }
    finally { if (url) URL.revokeObjectURL(url); }
  }
  return { status: kind === 'packaged' || kind === 'local-file' ? 'unverified' : kind };
}

// Called only for the images selected by an explicit match action. Restore and
// availability checks must remain local-only. Reuse the existing symbol cache.
export async function prepareSelectedPackagedImages(items, {
  cacheStorage = globalThis.caches, fetchImage = globalThis.fetch,
  decode = decodeBrowserImage, isCurrent = () => true
} = {}) {
  if (!cacheStorage || typeof fetchImage !== 'function') return [];
  const sources = [...new Set((items || []).map(item => item.tile && (item.tile.tile || item.tile))
    .filter(tile => tile && !isPrivatePerson(tile) &&
      (!tile.pictogramAttribution || tile.pictogramAttribution.provider !== 'device-private'))
    .map(tile => tile.image)
    .filter(source => typeof source === 'string' &&
      /^\/symbols\/(arasaac|mulberry|cboard)\/[A-Za-z0-9_.,()' /-]+\.(png|jpe?g|gif|webp|svg)$/i.test(source) &&
      !source.split('/').includes('..')))];
  const results = [];
  for (const source of sources) {
    if (!isCurrent()) break;
    let objectUrl, timer;
    try {
      const cached = await cacheStorage.match(source);
      if (!isCurrent()) break;
      // A corrupt existing item needs the explicit repair flow; never silently
      // replace an existing cached image during text matching.
      if (cached) { results.push({ source, status: 'existing-cache' }); continue; }
      const controller = typeof globalThis.AbortController === 'function' ? new globalThis.AbortController() : null;
      const response = await Promise.race([
        fetchImage(source, { credentials: 'omit', redirect: 'error', ...(controller ? { signal: controller.signal } : {}) }),
        new Promise((_, reject) => { timer = setTimeout(() => {
          if (controller) controller.abort();
          reject(new Error('Packaged image timed out'));
        }, 5000); })
      ]);
      clearTimeout(timer);
      if (!isCurrent()) break;
      if (!response.ok) throw new Error('Packaged image unavailable');
      const blob = await response.clone().blob();
      if (!blob.size) throw new Error('Empty image');
      objectUrl = URL.createObjectURL(blob);
      await decode(objectUrl);
      if (!isCurrent()) break;
      const cache = await cacheStorage.open(`symbols-${source.split('/')[2]}`);
      if (!isCurrent()) break;
      if (await cacheStorage.match(source)) { results.push({ source, status: 'existing-cache' }); continue; }
      if (!isCurrent()) break;
      await cache.put(source, response);
      if (!isCurrent()) break;
      results.push({ source, ...(await verifyBrowserLocalImage(source, { cacheStorage, decode })) });
    } catch (_) { results.push({ source, status: 'check-failed' }); }
    finally { clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); }
  }
  return results;
}
