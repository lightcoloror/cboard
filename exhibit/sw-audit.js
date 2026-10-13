/* Extension to the project's installed sw-precache worker (generated globals).
 * Verify bytes of every exhibition dependency, not navigator.onLine/cache size.
 * Never query or modify another application's cache or account storage.
 */
async function boothVerify(url, response) {
  const base = new URL('./', self.location);
  const relative = decodeURIComponent(new URL(url).pathname.slice(base.pathname.length));
  const expected = boothExpectedHashes[relative];
  if (!expected) throw Error('UNLISTED_BOOTH_RESOURCE');
  const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
  const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
  if (hex !== expected) throw Error('BOOTH_RESOURCE_INTEGRITY_FAILURE: ' + relative);
  return response;
}
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'BOOTH_ACTIVATE_UPDATE') {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (!event.data || event.data.type !== 'BOOTH_AUDIT' || !event.ports[0]) return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName);
      const url = name => new URL(name, self.location).href;
      const read = name => cache.match(urlsToCacheKeys.get(url(name)));
      const response = await read('resources.json');
      if (!response) throw Error('资源清单缺失');
      const manifest = await response.json();
      if (manifest.version !== event.data.version) throw Error('页面与离线版本不同，请联网刷新');
      for (const file of manifest.files) {
        const entry = await read(file.url);
        if (!entry || !entry.ok) throw Error('资源缺失：' + file.url);
        const bytes = await entry.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
        if (hex !== file.sha256) throw Error('资源校验失败：' + file.url);
      }
      event.ports[0].postMessage({ok:true,version:manifest.version,count:manifest.files.length});
    } catch (error) {
      event.ports[0].postMessage({ok:false,error:error.message});
    }
  })());
});
