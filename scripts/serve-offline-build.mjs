import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const host = process.env.PLAYWRIGHT_OFFLINE_HOST || '127.0.0.1';
const port = Number(process.env.PLAYWRIGHT_OFFLINE_PORT || 4173);
const buildRoot = resolve(
  process.cwd(),
  process.env.PLAYWRIGHT_OFFLINE_BUILD_PATH ||
    process.env.BUILD_PATH ||
    'build'
);

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function resolveBuildPath(pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = normalize(decodedPath).replace(/^([/\\])+/, '');
  const candidate = resolve(join(buildRoot, relativePath));

  if (candidate !== buildRoot && !candidate.startsWith(`${buildRoot}${sep}`)) {
    return null;
  }

  return candidate;
}

async function findResponseFile(requestUrl) {
  const pathname = new URL(requestUrl, `http://${host}:${port}`).pathname;
  const candidate = resolveBuildPath(pathname);

  if (candidate) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) {
        return { path: candidate, size: info.size };
      }
      if (info.isDirectory()) {
        const indexPath = join(candidate, 'index.html');
        const indexInfo = await stat(indexPath);
        return { path: indexPath, size: indexInfo.size };
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  const fallbackPath = join(buildRoot, 'index.html');
  const fallbackInfo = await stat(fallbackPath);
  return { path: fallbackPath, size: fallbackInfo.size };
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  try {
    const file = await findResponseFile(request.url || '/');
    const extension = extname(file.path).toLowerCase();

    response.writeHead(200, {
      'Cache-Control':
        extension === '.html' || file.path.endsWith('service-worker.js')
          ? 'no-cache'
          : 'public, max-age=31536000, immutable',
      'Content-Length': file.size,
      'Content-Type': CONTENT_TYPES[extension] || 'application/octet-stream'
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    createReadStream(file.path).pipe(response);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`Unable to serve production build: ${error.message}`);
  }
});

server.listen(port, host, () => {
  console.log(`CBoard production build listening on http://${host}:${port}`);
});

function closeServer() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
