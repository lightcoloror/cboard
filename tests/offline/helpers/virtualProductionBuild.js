import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

// Reuse production build bytes with Playwright routing. This is a transport
// adapter for isolated UI tests; it never starts a listener or calls an API.
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};

export async function fulfillVirtualProductionRequest(route, buildPath) {
  const request = route.request();
  const url = new URL(request.url());
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    return route.abort('internetdisconnected');
  }
  if (!['GET', 'HEAD'].includes(request.method())) {
    return route.fulfill({ status: 405, body: '' });
  }
  const root = resolve(buildPath);
  let file = resolve(root, '.' + decodeURIComponent(url.pathname));
  if (file !== root && !file.startsWith(root + sep)) {
    return route.fulfill({ status: 403, body: '' });
  }
  const info = await stat(file).catch(() => null);
  if (!info || !info.isFile()) file = resolve(root, 'index.html');
  return route.fulfill({
    status: 200,
    contentType: TYPES[extname(file)] || 'application/octet-stream',
    body: request.method() === 'HEAD' ? Buffer.alloc(0) : await readFile(file)
  });
}
